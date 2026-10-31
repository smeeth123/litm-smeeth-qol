import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { usesDiligentTrack } from "./diligent-drudge.mjs";
import { invokedThemeSources } from "./personality-improvements.mjs";
const MODULE_ID = "litm-smeeth-qol", REPEL = "repel-witchery";
const clone = value => foundry.utils.deepClone(value);
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase().replace(/^self-discovery$/, "self discovery");
const names = { "self-discovery": "Self Discovery", "shifting-form": "Shifting Form", "strive-to-belong": "Strive to Belong" };
const has = (theme, name) => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === normalize(name));
const mayUse = (message, user) => user?.isGM || (message.author?.id ?? message.user?.id) === user?.id;
const cards = new Map();
let manualOperation;
export const configureUncannyUsage = operation => { manualOperation = operation; };

export async function handleUncannyTracker(theme, key, used) {
  if (!names[key]) return false;
  if (!manualOperation) throw new Error("Uncanny Being automation is not ready. Reload the client.");
  if (!used) { await manualOperation({ themeUuid: theme.uuid, key, used: false }); return true; }
  if (specialUsed(theme, key)) return true;
  let data = {};
  if (key === "shifting-form") {
    const tags = (theme.system.powertags ?? []).map((tag, index) => ({ tag, index }))
      .filter(({ tag, index }) => index > 0 && tag.name?.trim() && !tag.planned && !tag.expired);
    if (!tags.length) throw new Error("There are no non-title power tags to replace.");
    const esc = foundry.utils.escapeHTML;
    data = await foundry.applications.api.DialogV2.wait({
      window: { title: "Shifting Form" }, classes: ["litm-qol-system-dialog"],
      content: `<p>Replace a non-title power tag from this theme to reflect your changed form.</p><label>Power tag<select name="tagIndex">${tags.map(({ tag, index }) => `<option value="${index}">${esc(tag.name)}</option>`).join("")}</select></label><label>New tag<input name="tagName" type="text" maxlength="200" autofocus></label>`,
      buttons: [{ action: "cancel", label: "Cancel", callback: () => null },
        { action: "replace", label: "Replace Tag", callback: (_event, button) => {
          const index = Number(button.form.elements.tagIndex.value);
          return { index, originalName: tags.find(entry => entry.index === index)?.tag.name, name: button.form.elements.tagName.value.trim() };
        } }], rejectClose: false
    });
    if (!data) return true;
  } else if (key === "strive-to-belong") {
    const pending = theme.getFlag(MODULE_ID, "uncannyPending")?.[key];
    if (!pending) {
      data = await foundry.applications.api.DialogV2.wait({
        window: { title: "Strive to Belong" }, classes: ["litm-qol-system-dialog"],
        content: `<p>Name a story tag describing what you imitate or understand after watching another Hero.</p><label>Story tag<input name="tagName" type="text" maxlength="200" autofocus></label>`,
        buttons: [{ action: "cancel", label: "Cancel", callback: () => null },
          { action: "create", label: "Create Story Tag", callback: (_event, button) => ({ name: button.form.elements.tagName.value.trim() }) }], rejectClose: false
      });
      if (!data) return true;
    }
  }
  await manualOperation({ themeUuid: theme.uuid, key, used: true, ...data });
  return true;
}
export async function applyUncannyManual(payload, user) {
  const theme = await fromUuid(payload.themeUuid), actor = theme?.parent, key = payload.key;
  if (!names[key] || !has(theme, names[key]) || !["character", "litm-character"].includes(actor?.type)
      || !(user?.isGM || actor.testUserPermission(user, "OWNER")) || !(game.user.isGM || actor.isOwner)) {
    throw new Error("Only the Hero’s owner or Narrator can use this improvement.");
  }
  const usePath = `flags.${MODULE_ID}.${SPECIAL_USES}.${key}`;
  if (payload.used === false) { await theme.update({ [usePath]: false }); return true; }
  if (specialUsed(theme, key)) return true;
  if (key === "self-discovery") {
    const marks = Math.max(0, Number(theme.system.improve) || 0), maximum = usesDiligentTrack(theme) ? 5 : 3;
    if (marks >= maximum) throw new Error("This theme’s Improve tracker is full.");
    await theme.update({ "system.improve": marks + 1, [usePath]: true });
  } else if (key === "shifting-form") {
    const name = String(payload.name ?? "").trim(), index = payload.index;
    const tags = clone(theme.system.powertags ?? []), tag = tags[index];
    if (!Number.isInteger(index) || index < 1 || !tag?.name?.trim() || tag.planned || tag.expired || tag.name !== payload.originalName) {
      throw new Error("The selected non-title power tag changed. Choose it again.");
    }
    if (!name || name.length > 200 || name === tag.name) throw new Error("Enter a different tag name of 1–200 characters.");
    tag.name = name;
    await theme.update({ "system.powertags": tags, [usePath]: true });
  } else {
    const pending = clone(theme.getFlag(MODULE_ID, "uncannyPending") ?? {});
    if (!pending[key]) {
      const name = String(payload.name ?? "").trim();
      if (!name || name.length > 200) throw new Error("Enter a story tag name of 1–200 characters.");
      pending[key] = { id: foundry.utils.randomID(), name };
      await theme.update({ [`flags.${MODULE_ID}.uncannyPending`]: pending });
    }
    const intent = pending[key], receipts = clone(actor.getFlag(MODULE_ID, "uncannyStoryTags") ?? []), receipt = `${theme.uuid}:${intent.id}`;
    if (!receipts.includes(receipt)) {
      const tags = clone(actor.system.floatingTagsAndStatuses ?? []);
      tags.push({ name: intent.name, description: "", isStatus: false, positive: true, value: 0,
        markings: Array(6).fill(false), selected: false, burned: false, toBurn: false });
      receipts.push(receipt);
      await actor.update({ "system.floatingTagsAndStatuses": tags, [`flags.${MODULE_ID}.uncannyStoryTags`]: receipts });
    }
    await theme.update({ [usePath]: true, [`flags.${MODULE_ID}.uncannyPending.-=${key}`]: null });
  }
  return true;
}

export function captureUncannyThemes(app, applied) {
  if (app.rollType !== "reaction") return [];
  return invokedThemeSources(app, applied).filter(source => {
    const actor = source.actorUuid === app.actor?.uuid ? app.actor : game.actors.get(source.actorId), theme = actor?.items.get(source.itemId);
    return has(theme, "Repel Witchery") && !specialUsed(theme, REPEL);
  });
}
function repelRoll(message) {
  const context = message.getFlag(MODULE_ID, "rollContext");
  if (context?.rollType !== "reaction" || context.group || message.getFlag(MODULE_ID, "nativeSacrifice")) return null;
  const root = document.createElement("div"); root.innerHTML = message.content;
  const text = root.querySelector('.dice-total')?.textContent.trim(), total = text ? Number(text) : context.roll?.total;
  const power = Number(root.querySelector('.power-counter')?.textContent.match(/-?\d+/)?.[0]);
  return Number.isFinite(total) && total <= 6 && power > 0 && root.querySelector('.consequence-result-negative') ? { root, total, power } : null;
}
function sourceFor(message, entry, actor) {
  const theme = actor?.items.get(entry.itemId);
  return has(theme, "Repel Witchery") && (!specialUsed(theme, REPEL)
    || theme.getFlag(MODULE_ID, "specialImprovementMessages")?.[REPEL] === message.uuid) ? { actor, theme } : null;
}
export function repelWitcheryCandidates(message) {
  if (message.getFlag(MODULE_ID, "repelWitchery") || !repelRoll(message)) return [];
  return (message.getFlag(MODULE_ID, "rollContext")?.uncannyThemes ?? []).map(entry => {
    const actor = globalThis.fromUuidSync?.(entry.actorUuid) ?? game.actors.get(entry.actorId);
    return actor?.uuid === entry.actorUuid ? sourceFor(message, entry, actor) : null;
  }).filter(Boolean);
}
export async function applyRepelWitchery(payload, user) {
  const message = await fromUuid(payload.messageUuid);
  if (!message || !mayUse(message, user)) throw new Error("Only the roller or Narrator can use Repel Witchery.");
  if (message.getFlag(MODULE_ID, "repelWitchery")) return true;
  const roll = repelRoll(message);
  if (!roll) throw new Error("Repel Witchery requires a Reaction of 6 or less with Power to spend.");
  let choice;
  for (const entry of message.getFlag(MODULE_ID, "rollContext")?.uncannyThemes ?? []) {
    const actor = await fromUuid(entry.actorUuid), source = sourceFor(message, entry, actor);
    if (source?.theme.uuid === payload.themeUuid) { choice = source; break; }
  }
  if (!choice || !(user.isGM || choice.actor.testUserPermission(user, "OWNER")) || !(game.user.isGM || choice.actor.isOwner)) throw new Error("Repel Witchery is no longer available to this Hero.");
  await choice.theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.${REPEL}`]: true,
    [`flags.${MODULE_ID}.specialImprovementMessages.${REPEL}`]: message.uuid });
  const description = roll.root.querySelector('.consequence-result-negative p'); if (description) description.textContent = 'Spend Power to lessen magical Consequences.';
  await message.update({ content: roll.root.innerHTML,
    [`flags.${MODULE_ID}.repelWitchery`]: { themeUuid: choice.theme.uuid, power: roll.power } });
  return true;
}
export function renderUncannyActions(message, root, use) {
  root.querySelectorAll('.litm-qol-uncanny-action,.litm-qol-uncanny-note').forEach(element => element.remove());
  const result = message.getFlag(MODULE_ID, 'repelWitchery');
  if (result && repelRoll(message)) {
    const note = document.createElement('p'); note.className = 'litm-qol-uncanny-note'; note.textContent = `Repel Witchery: you may spend ${result.power} Power to lessen magical Consequences.`;
    (root.querySelector('.roll-card') ?? root).append(note);
  }
  if (!mayUse(message, game.user)) return;
  let shown = false;
  for (const { actor, theme } of repelWitcheryCandidates(message)) {
    if (!(game.user.isGM || actor.isOwner)) continue;
    shown = true;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'litm-qol-uncanny-action'; button.textContent = 'Repel Witchery — Use Power';
    button.dataset.tooltip = 'Once per scene. Use when reacting to lessen magical Consequences with tags from this theme.';
    button.addEventListener('click', async () => {
      if (button.disabled) return; button.disabled = true;
      try { await use({ messageUuid: message.uuid, themeUuid: theme.uuid }); }
      catch (error) { ui.notifications.error(error.message); }
      finally { renderUncannyActions(message, root, use); }
    });
    (root.querySelector('.roll-card') ?? root).append(button);
  }
  if (shown) cards.set(message.uuid, { root, refresh: () => renderUncannyActions(message, root, use) }); else cards.delete(message.uuid);
}
Hooks.on('updateItem', item => {
  if (item.type !== 'themebook') return;
  for (const [id, card] of cards) { if (card.root.isConnected) card.refresh(); else cards.delete(id); }
});
