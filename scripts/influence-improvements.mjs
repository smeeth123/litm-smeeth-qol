import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { invokedThemeSources } from "./personality-improvements.mjs";
const MODULE_ID = "litm-smeeth-qol", SYSTEM_ID = "mist-engine-fvtt", FOLLOW = "follow-me";
const clone = value => foundry.utils.deepClone(value);
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const has = (theme, name) => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === normalize(name));
const cards = new Map();
const features = { followMe: "Follow Me!", overextend: "Overextend", readBetweenTheLines: "Read Between the Lines" };
const mayUse = (message, user) => user?.isGM || (message.author?.id ?? message.user?.id) === user?.id;

export function captureInfluenceThemes(app, applied) {
  if (!["quick", "detailed", "reaction"].includes(app.rollType)) return [];
  const sources = invokedThemeSources(app, applied), actors = new Map();
  const add = actor => { if (actor) actors.set(actor.uuid, actor); };
  if (app._litmQolGroupRoll) for (const id of app._litmQolGroupRoll.actorIds ?? []) add(game.actors.get(id));
  else add(app.actor);
  for (const source of sources) add(source.actorUuid === app.actor?.uuid ? app.actor : game.actors.get(source.actorId));
  const entries = [];
  for (const actor of actors.values()) for (const theme of actor.items ?? []) {
    const invoked = sources.some(source => source.actorUuid === actor.uuid && source.itemId === theme.id);
    const eligible = Object.entries(features).filter(([key, name]) => has(theme, name)
      && (key === "followMe" ? app.rollType === "detailed" && !specialUsed(theme, FOLLOW) : invoked
        && app.rollType === (key === "overextend" ? "detailed" : "reaction"))).map(([key]) => key);
    if (eligible.length) entries.push({ actorUuid: actor.uuid, actorId: actor.id, itemId: theme.id, features: eligible });
  }
  return entries;
}
export const followMeEnabled = message => Boolean(message.getFlag(MODULE_ID, "followMe"));
export const canSpendInfluencePower = state => Boolean(state && (state.consequenceResult >= 0 || state.litmQolOverextend));
function qualifies(message, feature) {
  const context = message.getFlag(MODULE_ID, "rollContext"), state = message.getFlag(SYSTEM_ID, "detailedSpend");
  if (context?.rollType !== "detailed" || !state || message.getFlag(MODULE_ID, feature)) return false;
  return feature === "followMe" ? state.consequenceResult >= 0 : feature === "overextend"
    && (state.consequenceResult < 1 || Boolean(state.pushYourLuck));
}
function sourceFor(message, entry, actor, feature) {
  const theme = actor?.items.get(entry.itemId);
  if (!entry.features?.includes(feature) || !has(theme, features[feature])) return null;
  if (feature === "followMe" && specialUsed(theme, FOLLOW)
      && theme.getFlag(MODULE_ID, "specialImprovementMessages")?.[FOLLOW] !== message.uuid) return null;
  return { actor, theme };
}
export function influenceCandidates(message, feature) {
  if (!qualifies(message, feature)) return [];
  return (message.getFlag(MODULE_ID, "rollContext")?.influenceThemes ?? []).map(entry => {
    const actor = globalThis.fromUuidSync?.(entry.actorUuid) ?? game.actors.get(entry.actorId);
    return actor?.uuid === entry.actorUuid ? sourceFor(message, entry, actor, feature) : null;
  }).filter(Boolean);
}

// Consequences-only rolls normally have no spending budget. Overextend grants
// exactly two Power on those rolls without changing the rolled outcome. If a
// later result-changing feature succeeds, restore that roll's normal budget.
export async function renderInfluencePowerCard(state, renderer, options) {
  const grant = state.litmQolOverextend;
  if (!grant) return renderer(state);
  const basePower = state.consequenceResult >= 0 ? grant.originalTotal : 0;
  state.total += basePower - grant.basePower;
  grant.basePower = basePower;
  state.numPowerTags = state.total;
  if (state.consequenceResult >= 0) return renderer(state);
  const spent = (state.entries ?? []).reduce((sum, entry) => sum + entry.cost, 0), remaining = Math.max(0, state.total - spent);
  return foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/detailed-result.hbs`, {
    ...state, canSpend: state.total > 0, remaining, spentTotal: spent,
    options: options.map(option => ({ ...option, label: game.i18n.localize(option.labelKey), disabled: option.cost > remaining }))
  });
}
export async function applyInfluenceAction(payload, user, renderer) {
  const feature = payload.feature, message = await fromUuid(payload.messageUuid);
  if (!["followMe", "overextend"].includes(feature) || !message || !mayUse(message, user)) throw new Error("Only the roller or Narrator can use this improvement.");
  if (message.getFlag(MODULE_ID, feature)) return true;
  if (!qualifies(message, feature)) throw new Error(`${features[feature]} is not available for this result.`);
  let choice;
  for (const entry of message.getFlag(MODULE_ID, "rollContext")?.influenceThemes ?? []) {
    const actor = await fromUuid(entry.actorUuid), source = sourceFor(message, entry, actor, feature);
    if (source?.theme.uuid === payload.themeUuid) { choice = source; break; }
  }
  if (!choice || !(user.isGM || choice.actor.testUserPermission(user, "OWNER")) || !(game.user.isGM || choice.actor.isOwner)) {
    throw new Error(`${features[feature]} is no longer available to this Hero.`);
  }
  const update = { [`flags.${MODULE_ID}.${feature}`]: { themeUuid: choice.theme.uuid } };
  if (feature === "followMe") {
    await choice.theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.${FOLLOW}`]: true,
      [`flags.${MODULE_ID}.specialImprovementMessages.${FOLLOW}`]: message.uuid });
  } else {
    const state = clone(message.getFlag(SYSTEM_ID, "detailedSpend"));
    state.litmQolOverextend = { themeUuid: choice.theme.uuid, originalTotal: state.total,
      basePower: state.consequenceResult >= 0 ? state.total : 0 };
    state.total = state.litmQolOverextend.basePower + 2;
    state.numPowerTags = state.total;
    update.content = await renderer(state);
    update[`flags.${SYSTEM_ID}.detailedSpend`] = state;
  }
  await message.update(update);
  return true;
}
export function renderInfluenceActions(message, root, use) {
  root.querySelectorAll('.litm-qol-influence-action,.litm-qol-influence-note').forEach(element => element.remove());
  const appendNote = text => { const p = document.createElement('p'); p.className = 'litm-qol-influence-note'; p.textContent = text; (root.querySelector('.roll-card') ?? root).append(p); };
  if (followMeEnabled(message)) appendNote('Follow Me!: single-use tags cost 1 Power each on this roll.');
  if (message.getFlag(MODULE_ID, 'overextend')) appendNote('Overextend: gained +2 Power. Increase the Consequence status by one tier.');
  const context = message.getFlag(MODULE_ID, 'rollContext');
  if (context?.rollType === 'reaction' && context.influenceThemes?.some(entry => entry.features?.includes('readBetweenTheLines'))) {
    appendNote('Read Between the Lines: if this Reaction lessens social or influence-related Consequences, ask the Narrator for a valuable detail about their source.');
  }
  if (!mayUse(message, game.user)) return;
  let shown = false;
  for (const feature of ['followMe', 'overextend']) for (const { actor, theme } of influenceCandidates(message, feature)) {
    if (!(game.user.isGM || actor.isOwner)) continue;
    shown = true;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'litm-qol-influence-action'; button.dataset.feature = feature;
    button.textContent = feature === 'followMe' ? 'Follow Me! — Enable Single-Use Tags' : 'Overextend — Gain +2 Power';
    button.dataset.tooltip = feature === 'followMe' ? 'Once per session. Use when successfully recruiting, mustering, or rallying people under your Influence.'
      : 'Use when suffering a status as a Consequence of this roll. Raise its tier by 1 and gain 2 Power; adjust the status manually.';
    button.addEventListener('click', async () => {
      if (button.disabled) return; button.disabled = true;
      try { await use({ feature, themeUuid: theme.uuid, messageUuid: message.uuid }); }
      catch (error) { ui.notifications.error(error.message); }
      finally { renderInfluenceActions(message, root, use); }
    });
    (root.querySelector('.roll-card') ?? root).append(button);
  }
  if (shown) cards.set(message.uuid, { root, refresh: () => renderInfluenceActions(message, root, use) }); else cards.delete(message.uuid);
}
Hooks.on('updateItem', item => {
  if (item.type !== 'themebook') return;
  for (const [id, card] of cards) { if (card.root.isConnected) card.refresh(); else cards.delete(id); }
});
