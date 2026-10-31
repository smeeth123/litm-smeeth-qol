import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { invokedThemeSources } from "./personality-improvements.mjs";
import { succeedWithConsequences } from "./people-improvements.mjs";
import { sceneTagRecipients, rollScene } from "./single-use-tags.mjs";
import { importSystemModule } from "./system-imports.mjs";
const MODULE_ID = "litm-smeeth-qol", SYSTEM_ID = "mist-engine-fvtt";
const clone = value => foundry.utils.deepClone(value);
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const features = {
  createAnOpening: { name: "Create an Opening", key: "create-an-opening" },
  practicedManeuver: { name: "Practiced Maneuver", key: "practiced-maneuver" }
};
const has = (theme, name) => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === normalize(name));
const mayUse = (message, user) => user?.isGM || (message.author?.id ?? message.user?.id) === user?.id;
const cards = new Map();

export function captureProdigiousThemes(app, applied) {
  if (!["quick", "detailed", "reaction"].includes(app.rollType)) return [];
  return invokedThemeSources(app, applied).map(source => {
    const actor = source.actorUuid === app.actor?.uuid ? app.actor : game.actors.get(source.actorId), theme = actor?.items.get(source.itemId);
    const eligible = Object.entries(features).filter(([_feature, config]) => has(theme, config.name) && !specialUsed(theme, config.key)).map(([feature]) => feature);
    return eligible.length ? { ...source, features: eligible } : null;
  }).filter(Boolean);
}
function outcome(message) {
  const state = message.getFlag(SYSTEM_ID, "detailedSpend");
  if (state) return state.consequenceResult;
  const root = document.createElement("div"); root.innerHTML = message.content;
  return root.querySelector('.consequence-result-negative') ? -1 : root.querySelector('.consequence-result-neutral') ? 0
    : root.querySelector('.consequence-result-positive') ? 1 : null;
}
function qualifies(message, feature) {
  const context = message.getFlag(MODULE_ID, "rollContext");
  if (!features[feature] || !["quick", "detailed", "reaction"].includes(context?.rollType)
      || message.getFlag(MODULE_ID, "nativeSacrifice") || message.getFlag(MODULE_ID, feature)) return false;
  return feature === "createAnOpening" ? [0, 1].includes(outcome(message)) : outcome(message) === -1;
}
function sourceFor(message, entry, actor, feature) {
  const config = features[feature], theme = actor?.items.get(entry.itemId);
  return entry.features?.includes(feature) && has(theme, config.name) && (!specialUsed(theme, config.key)
    || theme.getFlag(MODULE_ID, "specialImprovementMessages")?.[config.key] === message.uuid) ? { actor, theme } : null;
}
export function prodigiousCandidates(message, feature) {
  if (!qualifies(message, feature)) return [];
  return (message.getFlag(MODULE_ID, "rollContext")?.prodigiousThemes ?? []).map(entry => {
    const actor = globalThis.fromUuidSync?.(entry.actorUuid) ?? game.actors.get(entry.actorId);
    return actor?.uuid === entry.actorUuid ? sourceFor(message, entry, actor, feature) : null;
  }).filter(Boolean);
}
export async function applyProdigiousAction(payload, user, renderer) {
  const feature = payload.feature, config = features[feature], message = await fromUuid(payload.messageUuid);
  if (!config || !message || !mayUse(message, user)) throw new Error("Only the roller or Narrator can use this improvement.");
  if (message.getFlag(MODULE_ID, feature)) return true;
  if (!qualifies(message, feature)) throw new Error(`${config.name} is not available for this result.`);
  let choice;
  for (const entry of message.getFlag(MODULE_ID, "rollContext")?.prodigiousThemes ?? []) {
    const actor = await fromUuid(entry.actorUuid), source = sourceFor(message, entry, actor, feature);
    if (source?.theme.uuid === payload.themeUuid) { choice = source; break; }
  }
  if (!choice || !(user.isGM || choice.actor.testUserPermission(user, "OWNER")) || !(game.user.isGM || choice.actor.isOwner)) {
    throw new Error(`${config.name} is no longer available to this Hero.`);
  }
  if (feature === "practicedManeuver") return succeedWithConsequences(message, choice.theme, config.key, config.name, feature, renderer);
  return giveImprovementStatus(message, choice.theme, payload, user, { keyName: config.key,
    pendingFlag: "createOpeningDestinations", receiptFlag: "createOpeningResults", resultFlag: "createAnOpening" });
}
export async function giveImprovementStatus(message, theme, payload, user, { keyName, pendingFlag, receiptFlag, resultFlag, tier = 2, recipientTypes }) {
  const name = String(payload.name ?? "").trim();
  if (!name || name.length > 200) throw new Error("Enter a status name of 1–200 characters.");
  const key = `${message.id}:${theme.id}`;
  const pending = clone(theme.getFlag(MODULE_ID, pendingFlag) ?? {}), intent = pending[message.id];
  let target = intent && await fromUuid(intent.destinationUuid), receipt = target?.getFlag(MODULE_ID, receiptFlag)?.[key];
  if (!receipt) {
    const scene = rollScene(message);
    if (!scene) throw new Error("The roll’s scene is no longer available.");
    const sceneId = intent ? target?.type === "scene-data" ? target.system.sceneKey : null : payload.sceneId;
    if (sceneId) {
      if (sceneId !== scene.id) throw new Error("Choose the roll’s scene as the destination.");
      target = game.items.find(item => item.type === "scene-data" && item.system.sceneKey === scene.id);
      if (!target) {
        if (!game.user.isGM) throw new Error("An active Narrator is required to add a scene status.");
        target = await Item.create({ name: `Scene Data: ${scene.name}`, type: "scene-data",
          system: { sceneKey: scene.id }, flags: { mistmod: { hidden: true } } });
      }
    } else {
      target = sceneTagRecipients(scene, user).find(candidate => candidate.uuid === (intent?.destinationUuid ?? payload.recipientActorUuid));
      if (!target) throw new Error("Choose a Hero or Challenge with a token in the roll’s scene.");
    }
    if (recipientTypes && target?.type !== "scene-data" && !recipientTypes.includes(target?.type)) throw new Error("Choose a Challenge or the scene as the destination.");
    if (!Array.isArray(target?.system.floatingTagsAndStatuses) || (intent && target.uuid !== intent.destinationUuid)) throw new Error("The chosen destination is no longer available.");
    if (!(user.isGM || target.testUserPermission(user, "OWNER") || (game.user.isGM && mayUse(message, user)))) {
      throw new Error("An active Narrator or ownership of the destination is required to add this status.");
    }
    const statusName = intent?.name ?? name, positive = intent?.positive ?? payload.positive !== false;
    const { FloatingTagAndStatusAdapter } = await importSystemModule("lib/floating-tag-and-status-adapter.mjs");
    const status = { name: statusName, description: "", isStatus: true, positive, value: tier,
      markings: Array.from({ length: 6 }, (_, index) => index === tier - 1), selected: false, burned: false, toBurn: false };
    pending[message.id] = { destinationUuid: target.uuid, name: statusName, positive };
    await theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.${keyName}`]: true,
      [`flags.${MODULE_ID}.specialImprovementMessages.${keyName}`]: message.uuid,
      [`flags.${MODULE_ID}.${pendingFlag}`]: pending });
    const tags = FloatingTagAndStatusAdapter.withStatusStacked(clone(target.system.floatingTagsAndStatuses ?? []), status);
    receipt = { themeUuid: theme.uuid, name: statusName, positive, tier, destinationUuid: target.uuid,
      destinationName: target.type === "scene-data" ? scene.name : target.name };
    const receipts = clone(target.getFlag(MODULE_ID, receiptFlag) ?? {}); receipts[key] = receipt;
    await target.update({ "system.floatingTagsAndStatuses": tags, [`flags.${MODULE_ID}.${receiptFlag}`]: receipts });
  }
  await message.update({ [`flags.${MODULE_ID}.${resultFlag}`]: receipt });
  return true;
}
const promptOpening = (message, theme, use) => promptImprovementStatus(message, theme, use, {
  title: "Create an Opening", feature: "createAnOpening", pendingFlag: "createOpeningDestinations" });
export async function promptImprovementStatus(message, theme, use, { title, feature, pendingFlag, statusName, tier = 2, recipientTypes, description }) {
  const scene = rollScene(message), recipients = sceneTagRecipients(scene).filter(actor => (!recipientTypes || recipientTypes.includes(actor.type)) && (game.user.isGM || actor.isOwner || game.users.activeGM));
  if (!scene && !recipients.length) throw new Error("No character or scene is available to receive the status.");
  const esc = foundry.utils.escapeHTML, pending = theme.getFlag(MODULE_ID, pendingFlag)?.[message.id];
  const sceneSelected = game.items.find(item => item.uuid === pending?.destinationUuid && item.type === "scene-data" && item.system.sceneKey === scene?.id);
  const destination = `<label>Add status to<select name="destination">${recipients.map(actor => `<option value="actor:${esc(actor.uuid)}"${actor.uuid === pending?.destinationUuid ? " selected" : ""}>${esc(actor.name)}${actor.isToken ? ` (${esc(actor.token?.name ?? "token")})` : ""}</option>`).join("")}${scene ? `<option value="scene:${esc(scene.id)}"${sceneSelected ? " selected" : ""}>Scene: ${esc(scene.name)}</option>` : ""}</select></label>`;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title }, classes: ["litm-qol-system-dialog"],
    content: `${statusName ? `<p>After applying the normal outcome, give <strong>${esc(statusName)}-${tier}</strong>.</p>` : `<p>${description ? esc(description) : `Create a free tier-${tier} status representing an opportunity for an ally.`}</p><label>Status name<input name="statusName" type="text" maxlength="200" value="${esc(pending?.name ?? "")}" autofocus></label>`}${destination}<label>Status<select name="polarity"><option value="positive">Helpful</option><option value="negative"${pending?.positive === false ? " selected" : ""}>Hindering</option></select></label>`,
    buttons: [{ action: "cancel", label: "Cancel", callback: () => null },
      { action: "create", label: "Create Status", callback: (_event, button) => ({ name: statusName ?? button.form.elements.statusName.value.trim(),
        positive: button.form.elements.polarity.value !== "negative",
        ...(button.form.elements.destination.value.startsWith("scene:") ? { sceneId: button.form.elements.destination.value.slice(6) }
          : { recipientActorUuid: button.form.elements.destination.value.slice(6) }) }) }], rejectClose: false
  });
  if (result?.name) await use({ feature, messageUuid: message.uuid, themeUuid: theme.uuid, ...result });
}
export function renderProdigiousActions(message, root, use) {
  root.querySelectorAll('.litm-qol-prodigious-action,.litm-qol-prodigious-note').forEach(element => element.remove());
  const opening = message.getFlag(MODULE_ID, 'createAnOpening');
  if (opening) {
    const note = document.createElement('p'); note.className = 'litm-qol-prodigious-note'; note.textContent = `Create an Opening: gave ${opening.name}-2 to ${opening.destinationName}.`;
    (root.querySelector('.roll-card') ?? root).append(note);
  }
  if (message.getFlag(MODULE_ID, 'practicedManeuver') && ![...root.querySelectorAll('p')].some(p => p.textContent.startsWith('Practiced Maneuver:'))) {
    const note = document.createElement('p'); note.className = 'litm-qol-prodigious-note'; note.textContent = 'Practiced Maneuver: the action also succeeds. The Consequences still apply.';
    (root.querySelector('.roll-card') ?? root).append(note);
  }
  if (!mayUse(message, game.user)) return;
  let shown = false;
  for (const feature of Object.keys(features)) for (const { actor, theme } of prodigiousCandidates(message, feature)) {
    if (!(game.user.isGM || actor.isOwner)) continue;
    shown = true;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'litm-qol-prodigious-action'; button.dataset.feature = feature;
    button.textContent = feature === 'createAnOpening' ? 'Create an Opening — Create Status' : 'Practiced Maneuver — Succeed with Consequences';
    button.dataset.tooltip = feature === 'createAnOpening' ? 'Once per session. Create a free tier-2 status representing an opportunity for an ally.'
      : 'Once per session. Use when performing your practiced maneuver with tags from this theme. The Consequences still apply.';
    button.addEventListener('click', async () => {
      if (button.disabled) return; button.disabled = true;
      try {
        if (feature === 'createAnOpening') await promptOpening(message, theme, use);
        else await use({ feature, themeUuid: theme.uuid, messageUuid: message.uuid });
      } catch (error) { ui.notifications.error(error.message); }
      finally { renderProdigiousActions(message, root, use); }
    });
    (root.querySelector('.roll-card') ?? root).append(button);
  }
  if (shown) cards.set(message.uuid, { root, refresh: () => renderProdigiousActions(message, root, use) }); else cards.delete(message.uuid);
}
Hooks.on('updateItem', item => {
  if (item.type !== 'themebook') return;
  for (const [id, card] of cards) { if (card.root.isConnected) card.refresh(); else cards.delete(id); }
});
