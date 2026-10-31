import { sceneTagRecipients, rollScene } from "./single-use-tags.mjs";
import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { invokedThemeSources } from "./personality-improvements.mjs";
import { themeTitle } from "./theme-title.mjs";
const MODULE_ID = "litm-smeeth-qol", SYSTEM_ID = "mist-engine-fvtt", KEY = "applied-expertise";
const clone = value => foundry.utils.deepClone(value);
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const has = theme => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === "applied expertise");
const mayUse = (message, user) => user?.isGM || (message.author?.id ?? message.user?.id) === user?.id;
const cards = new Map();
const prompting = new Set();

export function captureKnowledgeThemes(app, applied) {
  if (!["quick", "detailed", "reaction"].includes(app.rollType)) return [];
  return invokedThemeSources(app, applied).filter(source => {
    const actor = source.actorUuid === app.actor?.uuid ? app.actor : game.actors.get(source.actorId);
    const theme = actor?.items.get(source.itemId);
    return has(theme) && !specialUsed(theme, KEY);
  });
}
function available(message, entry, actor) {
  const theme = actor?.items.get(entry.itemId);
  return has(theme) && (!specialUsed(theme, KEY) || theme.getFlag(MODULE_ID, "specialImprovementMessages")?.[KEY] === message.uuid)
    ? { actor, theme } : null;
}
function discoveries(message) {
  return (message.getFlag(SYSTEM_ID, "detailedSpend")?.entries ?? []).filter(entry => entry.type === "discover");
}
export function appliedExpertiseCandidates(message, { discoveryId } = {}) {
  if (message.getFlag(MODULE_ID, "appliedExpertise") || (!discoveryId && !discoveries(message).length)) return [];
  return (message.getFlag(MODULE_ID, "rollContext")?.knowledgeThemes ?? []).map(entry => {
    const actor = globalThis.fromUuidSync?.(entry.actorUuid) ?? game.actors.get(entry.actorId);
    return actor?.uuid === entry.actorUuid ? available(message, entry, actor) : null;
  }).filter(Boolean);
}
export async function applyAppliedExpertise(payload, user) {
  const message = await fromUuid(payload.messageUuid);
  if (!message || !mayUse(message, user)) throw new Error("Only the roller or Narrator can use Applied Expertise.");
  if (message.getFlag(MODULE_ID, "appliedExpertise")) return true;
  if (!discoveries(message).some(entry => entry.id === payload.discoveryId)) throw new Error("This Discover expenditure was removed. Spend Power to discover a detail first.");
  let choice;
  for (const entry of message.getFlag(MODULE_ID, "rollContext")?.knowledgeThemes ?? []) {
    const actor = await fromUuid(entry.actorUuid), source = available(message, entry, actor);
    if (source?.theme.uuid === payload.themeUuid) { choice = source; break; }
  }
  if (!choice || !(user.isGM || choice.actor.testUserPermission(user, "OWNER")) || !(game.user.isGM || choice.actor.isOwner)) {
    throw new Error("Applied Expertise is no longer available to this Hero.");
  }
  const { actor, theme } = choice, name = String(payload.name ?? "").trim();
  if (!name || name.length > 200) throw new Error("Enter a story tag name of 1–200 characters.");
  const key = `${message.id}:${theme.id}`;
  // Finish an earlier-version attempt which already created its tag on the Hero.
  const legacy = actor.getFlag(MODULE_ID, "appliedExpertiseResults")?.[key];
  if (legacy) {
    await message.update({ [`flags.${MODULE_ID}.appliedExpertise`]: legacy });
    return true;
  }
  const pending = clone(theme.getFlag(MODULE_ID, "appliedExpertiseDestinations") ?? {});
  const intent = pending[message.id];
  let target = intent && await fromUuid(intent.destinationUuid);
  let receipt = target?.getFlag(MODULE_ID, "appliedExpertiseResults")?.[key];
  if (!receipt) {
    const scene = rollScene(message);
    if (!scene) throw new Error("The roll’s scene is no longer available.");
    const sceneId = intent ? target?.type === "scene-data" ? target.system.sceneKey : null : payload.sceneId;
    if (sceneId) {
      if (sceneId !== scene.id) throw new Error("Choose the roll’s scene as the destination.");
      target = game.items.find(item => item.type === "scene-data" && item.system.sceneKey === scene.id);
      if (!target) {
        if (!game.user.isGM) throw new Error("An active Narrator is required to add a scene tag.");
        target = await Item.create({ name: `Scene Data: ${scene.name}`, type: "scene-data",
          system: { sceneKey: scene.id }, flags: { mistmod: { hidden: true } } });
      }
    } else {
      const uuid = intent?.destinationUuid ?? payload.recipientActorUuid ?? actor.uuid;
      target = sceneTagRecipients(scene, user).find(candidate => candidate.uuid === uuid);
      if (!target) throw new Error("Choose a Hero or Challenge with a token in the roll’s scene.");
    }
    if (!Array.isArray(target?.system.floatingTagsAndStatuses) || (intent && target.uuid !== intent.destinationUuid)) {
      throw new Error("The chosen destination is no longer available.");
    }
    if (!(user.isGM || target.testUserPermission(user, "OWNER") || (game.user.isGM && mayUse(message, user)))) {
      throw new Error("An active Narrator or ownership of the destination is required to add this tag.");
    }
    const tagName = intent?.name ?? name;
    pending[message.id] = { destinationUuid: target.uuid, name: tagName, discoveryId: intent?.discoveryId ?? payload.discoveryId };
    await theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.${KEY}`]: true,
      [`flags.${MODULE_ID}.specialImprovementMessages.${KEY}`]: message.uuid,
      [`flags.${MODULE_ID}.appliedExpertiseDestinations`]: pending });
    const tags = clone(target.system.floatingTagsAndStatuses ?? []);
    tags.push({ name: tagName, description: "", isStatus: false, positive: true, value: 0,
      markings: Array(6).fill(false), selected: false, burned: false, toBurn: false });
    receipt = { themeUuid: theme.uuid, discoveryId: pending[message.id].discoveryId, name: tagName,
      destinationUuid: target.uuid, destinationName: target.type === "scene-data" ? scene.name : target.name };
    const receipts = clone(target.getFlag(MODULE_ID, "appliedExpertiseResults") ?? {});
    receipts[key] = receipt;
    await target.update({ "system.floatingTagsAndStatuses": tags, [`flags.${MODULE_ID}.appliedExpertiseResults`]: receipts });
  }
  await message.update({ [`flags.${MODULE_ID}.appliedExpertise`]: receipt });
  return true;
}
export async function promptAppliedExpertise(message, use, { discoveryId } = {}) {
  if (!message || !mayUse(message, game.user) || prompting.has(message.uuid)) return;
  const choices = appliedExpertiseCandidates(message, { discoveryId }).filter(({ actor }) => game.user.isGM || actor.isOwner);
  const discovery = discoveryId ?? discoveries(message).at(-1)?.id;
  if (!choices.length || !discovery) return;
  prompting.add(message.uuid);
  try {
    const esc = foundry.utils.escapeHTML;
    const source = choices.length > 1 ? `<label>Theme<select name="themeUuid">${choices.map(({ theme }) => `<option value="${esc(theme.uuid)}">${esc(themeTitle(theme))}</option>`).join("")}</select></label>` : "";
    const scene = rollScene(message), recipients = sceneTagRecipients(scene).filter(actor => game.user.isGM || actor.isOwner || game.users.activeGM);
    if (!scene && !recipients.length) throw new Error("No character or scene is available to receive the tag.");
    const preferred = choices[0].theme.getFlag(MODULE_ID, "appliedExpertiseDestinations")?.[message.id]?.destinationUuid ?? choices[0].actor.uuid;
    const preferredScene = game.items.find(item => item.uuid === preferred && item.type === "scene-data" && item.system.sceneKey === scene?.id);
    const destination = `<label>Add tag to<select name="destination">${recipients.map(actor => `<option value="actor:${esc(actor.uuid)}"${actor.uuid === preferred ? " selected" : ""}>${esc(actor.name)}${actor.isToken ? ` (${esc(actor.token?.name ?? "token")})` : ""}</option>`).join("")}${scene ? `<option value="scene:${esc(scene.id)}"${preferredScene ? " selected" : ""}>Scene: ${esc(scene.name)}</option>` : ""}</select></label>`;
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: "Applied Expertise" }, classes: ["litm-qol-system-dialog"],
      content: `<p>Use Applied Expertise to gain a free story tag for a practical application of your discovery?</p>${source}<label>Story tag<input name="tagName" type="text" maxlength="200" autofocus></label>${destination}`,
      buttons: [{ action: "cancel", label: "Skip", callback: () => null },
        { action: "create", label: "Create Story Tag", callback: (_event, button) => ({ name: button.form.elements.tagName.value.trim(),
          themeUuid: button.form.elements.themeUuid?.value ?? choices[0].theme.uuid,
          ...(button.form.elements.destination.value.startsWith("scene:") ? { sceneId: button.form.elements.destination.value.slice(6) }
            : { recipientActorUuid: button.form.elements.destination.value.slice(6) }) }) }], rejectClose: false
    });
    if (result?.name) await use({ messageUuid: message.uuid, discoveryId: discovery, ...result });
  } finally { prompting.delete(message.uuid); }
}
export function renderKnowledgeActions(message, root, use) {
  root.querySelectorAll('.litm-qol-knowledge-action,.litm-qol-knowledge-note').forEach(element => element.remove());
  const result = message.getFlag(MODULE_ID, 'appliedExpertise');
  if (result) {
    const note = document.createElement('p'); note.className = 'litm-qol-knowledge-note'; note.textContent = result.destinationName ? `Applied Expertise: created ${result.name} on ${result.destinationName}.` : `Applied Expertise: gained ${result.name}.`;
    (root.querySelector('.roll-card') ?? root).append(note);
  }
  if (!mayUse(message, game.user) || !appliedExpertiseCandidates(message).some(({ actor }) => game.user.isGM || actor.isOwner)) { cards.delete(message.uuid); return; }
  const button = document.createElement('button'); button.type = 'button'; button.className = 'litm-qol-knowledge-action'; button.textContent = 'Applied Expertise — Create Story Tag';
  button.addEventListener('click', async () => {
    if (button.disabled) return; button.disabled = true;
    try { await promptAppliedExpertise(message, use); }
    catch (error) { ui.notifications.error(error.message); }
    finally { renderKnowledgeActions(message, root, use); }
  });
  (root.querySelector('.roll-card') ?? root).append(button);
  cards.set(message.uuid, { root, refresh: () => renderKnowledgeActions(message, root, use) });
}
Hooks.on('updateItem', item => {
  if (item.type !== 'themebook') return;
  for (const [id, card] of cards) { if (card.root.isConnected) card.refresh(); else cards.delete(id); }
});
