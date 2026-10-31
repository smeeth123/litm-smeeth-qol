import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { invokedLegacyTags } from "./people-improvements.mjs";
import { giveImprovementStatus, promptImprovementStatus } from "./prodigious-improvements.mjs";
const MODULE_ID = "litm-smeeth-qol", SYSTEM_ID = "mist-engine-fvtt", KEY = "signature-move";
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const signature = theme => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.find(entry => entry.active && normalize(entry.name) === "signature move");
const statusFor = improvement => String(improvement?.litmQolSignatureStatus ?? "").trim();
const mayUse = (message, user) => user?.isGM || (message.author?.id ?? message.user?.id) === user?.id;
const cards = new Map();

export function captureRelicSignatures(app, applied) {
  if (!["quick", "detailed", "reaction"].includes(app.rollType)) return [];
  return invokedLegacyTags(app, applied).map(tag => {
    const actor = tag.actorUuid === app.actor?.uuid ? app.actor : [...game.actors.values()].find(actor => actor.uuid === tag.actorUuid);
    const theme = actor?.items.get(tag.themeId), improvement = signature(theme), status = statusFor(improvement);
    return improvement?.litmQolLegacyTag === tag.tagId && status && !specialUsed(theme, KEY)
      ? { actorUuid: actor.uuid, actorId: actor.id, itemId: theme.id, tagId: tag.tagId, status } : null;
  }).filter(Boolean);
}
function qualifies(message) {
  const context = message.getFlag(MODULE_ID, "rollContext");
  if (!["quick", "detailed", "reaction"].includes(context?.rollType) || message.getFlag(MODULE_ID, "nativeSacrifice") || message.getFlag(MODULE_ID, "signatureMove")) return false;
  const state = message.getFlag(SYSTEM_ID, "detailedSpend");
  if (state) return [0, 1].includes(state.consequenceResult);
  const root = document.createElement("div"); root.innerHTML = message.content;
  return Boolean(root.querySelector('.consequence-result-neutral,.consequence-result-positive'));
}
function sourceFor(message, entry, actor) {
  const theme = actor?.items.get(entry.itemId), improvement = signature(theme);
  if (!improvement || improvement.litmQolLegacyTag !== entry.tagId || statusFor(improvement) !== entry.status
      || !theme.system.powertags?.some(tag => tag.litmQolLegacyId === entry.tagId && tag.name?.trim() && !tag.planned && !tag.expired)
      || (specialUsed(theme, KEY) && theme.getFlag(MODULE_ID, "specialImprovementMessages")?.[KEY] !== message.uuid)) return null;
  return { actor, theme, status: entry.status };
}
export function signatureMoveCandidates(message) {
  if (!qualifies(message)) return [];
  return (message.getFlag(MODULE_ID, "rollContext")?.relicSignatures ?? []).map(entry => {
    const actor = globalThis.fromUuidSync?.(entry.actorUuid) ?? game.actors.get(entry.actorId);
    return actor?.uuid === entry.actorUuid ? sourceFor(message, entry, actor) : null;
  }).filter(Boolean);
}
export async function applySignatureMove(payload, user) {
  const message = await fromUuid(payload.messageUuid);
  if (!message || !mayUse(message, user)) throw new Error("Only the roller or Narrator can use Signature Move.");
  if (message.getFlag(MODULE_ID, "signatureMove")) return true;
  if (!qualifies(message)) throw new Error("Signature Move requires a successful roll using its chosen tag.");
  let choice;
  for (const entry of message.getFlag(MODULE_ID, "rollContext")?.relicSignatures ?? []) {
    const actor = await fromUuid(entry.actorUuid), source = sourceFor(message, entry, actor);
    if (source?.theme.uuid === payload.themeUuid) { choice = source; break; }
  }
  if (!choice || !(user.isGM || choice.actor.testUserPermission(user, "OWNER")) || !(game.user.isGM || choice.actor.isOwner)) {
    throw new Error("Signature Move’s chosen tag or status changed, or the use is no longer available.");
  }
  return giveImprovementStatus(message, choice.theme, { ...payload, name: choice.status }, user, {
    keyName: KEY, pendingFlag: "signatureMoveDestinations", receiptFlag: "signatureMoveResults", resultFlag: "signatureMove" });
}
export function renderRelicActions(message, root, use) {
  root.querySelectorAll('.litm-qol-relic-action,.litm-qol-relic-note').forEach(element => element.remove());
  const result = message.getFlag(MODULE_ID, 'signatureMove');
  if (result) {
    const note = document.createElement('p'); note.className = 'litm-qol-relic-note'; note.textContent = `Signature Move: gave ${result.name}-2 to ${result.destinationName}.`;
    (root.querySelector('.roll-card') ?? root).append(note);
  }
  if (!mayUse(message, game.user)) return;
  let shown = false;
  for (const { actor, theme, status } of signatureMoveCandidates(message)) {
    if (!(game.user.isGM || actor.isOwner)) continue;
    shown = true;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'litm-qol-relic-action'; button.textContent = `Signature Move — Give ${status}-2`;
    button.dataset.tooltip = 'Once per session. Apply the normal outcome first, then give the chosen tier-2 status.';
    button.addEventListener('click', async () => {
      if (button.disabled) return; button.disabled = true;
      try { await promptImprovementStatus(message, theme, use, { title: 'Signature Move', feature: 'signatureMove',
        pendingFlag: 'signatureMoveDestinations', statusName: status }); }
      catch (error) { ui.notifications.error(error.message); }
      finally { renderRelicActions(message, root, use); }
    });
    (root.querySelector('.roll-card') ?? root).append(button);
  }
  if (shown) cards.set(message.uuid, { root, refresh: () => renderRelicActions(message, root, use) }); else cards.delete(message.uuid);
}
Hooks.on('updateItem', item => {
  if (item.type !== 'themebook') return;
  for (const [id, card] of cards) { if (card.root.isConnected) card.refresh(); else cards.delete(id); }
});
