import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { invokedThemeSources } from "./personality-improvements.mjs";
import { usesDiligentTrack } from "./diligent-drudge.mjs";
import { importSystemModule } from "./system-imports.mjs";
const MODULE_ID = "litm-smeeth-qol", SYSTEM_ID = "mist-engine-fvtt";
const clone = value => foundry.utils.deepClone(value);
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const features = {
  grimDetermination: { name: "Grim Determination", key: "grim-determination", label: "Gain determined-2" },
  painfulLessons: { name: "Painful Lessons", key: "painful-lessons", label: "Mark Improve" },
  unstoppable: { name: "Unstoppable", key: "unstoppable", label: "Avoid Consequences" }
};
const has = (theme, name) => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === normalize(name));
const reservations = theme => theme.getFlag(MODULE_ID, "specialImprovementMessages") ?? {};
const available = (theme, key, message) => !specialUsed(theme, key) || reservations(theme)[key] === message.uuid;
const mayUse = (message, user) => user?.isGM || (message.author?.id ?? message.user?.id) === user?.id;
const cards = new Map();

// Record eligibility before native cleanup scratches tags or changes selections.
export function captureDutyThemes(app, applied) {
  if (!["quick", "detailed", "reaction"].includes(app.rollType)) return [];
  const sources = invokedThemeSources(app, applied), actors = new Map();
  const add = actor => { if (actor) actors.set(actor.uuid, actor); };
  if (app._litmQolGroupRoll) for (const id of app._litmQolGroupRoll.actorIds ?? []) add(game.actors.get(id));
  else add(app.actor);
  for (const source of sources) add(source.actorUuid === app.actor?.uuid ? app.actor : game.actors.get(source.actorId));
  const result = [];
  for (const actor of actors.values()) for (const theme of actor.items ?? []) {
    const invoked = sources.some(source => source.actorUuid === actor.uuid && source.itemId === theme.id);
    const eligible = Object.entries(features).filter(([feature, config]) => has(theme, config.name)
      && !specialUsed(theme, config.key) && (feature === "grimDetermination" || invoked)).map(([feature]) => feature);
    if (eligible.length) result.push({ actorUuid: actor.uuid, actorId: actor.id, itemId: theme.id, features: eligible });
  }
  return result;
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
  if (!["quick", "detailed", "reaction"].includes(context?.rollType) || message.getFlag(MODULE_ID, "nativeSacrifice")) return false;
  return feature === "unstoppable" ? context.rollType !== "reaction" && outcome(message) === 0 : [-1, 0].includes(outcome(message));
}
function eligibleSource(message, feature, entry, actor) {
  const config = features[feature], theme = actor?.items.get(entry.itemId);
  return entry.features?.includes(feature) && has(theme, config.name) && available(theme, config.key, message) ? { actor, theme } : null;
}
export function dutyCandidates(message, feature) {
  if (!features[feature] || message.getFlag(MODULE_ID, feature) || !qualifies(message, feature)) return [];
  return (message.getFlag(MODULE_ID, "rollContext")?.dutyThemes ?? []).map(entry => {
    const actor = globalThis.fromUuidSync?.(entry.actorUuid) ?? game.actors.get(entry.actorId);
    return actor?.uuid === entry.actorUuid ? eligibleSource(message, feature, entry, actor) : null;
  }).filter(Boolean);
}
export async function applyDutyAction(payload, user, renderer) {
  const feature = payload.feature, config = features[feature], message = await fromUuid(payload.messageUuid);
  if (!config || !message || !mayUse(message, user)) throw new Error("Only the roller or Narrator can use this improvement.");
  if (message.getFlag(MODULE_ID, feature)) return true;
  if (!qualifies(message, feature)) throw new Error(`${config.name} is not available for this result.`);
  const entries = message.getFlag(MODULE_ID, "rollContext")?.dutyThemes ?? [];
  let choice;
  for (const entry of entries) {
    const actor = await fromUuid(entry.actorUuid), candidate = eligibleSource(message, feature, entry, actor);
    if (candidate?.theme.uuid === payload.themeUuid) { choice = candidate; break; }
  }
  if (!choice || !(user.isGM || choice.actor.testUserPermission(user, "OWNER")) || !(game.user.isGM || choice.actor.isOwner)) {
    throw new Error(`${config.name} is no longer available to this Hero.`);
  }
  const { actor, theme } = choice;
  const reserve = { [`flags.${MODULE_ID}.${SPECIAL_USES}.${config.key}`]: true,
    [`flags.${MODULE_ID}.specialImprovementMessages.${config.key}`]: message.uuid };
  const result = { themeUuid: theme.uuid };
  const update = {};
  if (feature === "painfulLessons") {
    const awards = clone(theme.getFlag(MODULE_ID, "dutyImprovementAwards") ?? {}), prior = awards[message.id];
    if (prior?.state !== "applied") {
      const marks = Math.max(0, Number(theme.system.improve) || 0), maximum = usesDiligentTrack(theme) ? 5 : 3;
      const next = Math.max(marks, Math.min(maximum, marks + 1));
      if (next === marks) throw new Error("This theme’s Improve tracker is full.");
      awards[message.id] = { state: "applied", amount: next - marks };
      await theme.update({ ...reserve, "system.improve": next, [`flags.${MODULE_ID}.dutyImprovementAwards`]: awards });
    }
    result.amount = awards[message.id].amount;
  } else if (feature === "grimDetermination") {
    await theme.update(reserve);
    const receipts = clone(actor.getFlag(MODULE_ID, "dutyStatusRolls") ?? []), receipt = `${message.uuid}:${theme.id}`;
    if (!receipts.includes(receipt)) {
      const { FloatingTagAndStatusAdapter } = await importSystemModule("lib/floating-tag-and-status-adapter.mjs");
      const tag = { name: "determined", description: "", positive: true, isStatus: true, value: 2,
        markings: [false, true, false, false, false, false], selected: false, burned: false, toBurn: false };
      const tags = FloatingTagAndStatusAdapter.withStatusStacked(clone(actor.system.floatingTagsAndStatuses ?? []), tag);
      receipts.push(receipt);
      await actor.update({ "system.floatingTagsAndStatuses": tags, [`flags.${MODULE_ID}.dutyStatusRolls`]: receipts });
    }
  } else {
    const state = clone(message.getFlag(SYSTEM_ID, "detailedSpend"));
    if (state) {
      state.consequenceResult = 1;
      update.content = await renderer(state);
      update[`flags.${SYSTEM_ID}.detailedSpend`] = state;
    } else {
      const root = document.createElement("div"); root.innerHTML = message.content;
      const box = root.querySelector('.consequence-result-neutral');
      if (!box) throw new Error("This result no longer has both Success and Consequences.");
      box.className = 'consequence-result-positive';
      const heading = box.querySelector('.heading'); if (heading) heading.textContent = 'Success';
      const text = box.querySelector('p'); if (text) text.textContent = 'Your action succeeds without Consequences.';
      update.content = root.innerHTML;
    }
    await theme.update(reserve);
  }
  update[`flags.${MODULE_ID}.${feature}`] = result;
  await message.update(update);
  return true;
}

// A reroll which no longer suffers Consequences returns only the optional
// Improve mark awarded by this roll, retaining native weakness Improve marks.
export async function reconcileDutyReroll(message) {
  const result = message.getFlag(MODULE_ID, "painfulLessons");
  if (!result || [-1, 0].includes(outcome(message))) return;
  const theme = await fromUuid(result.themeUuid);
  if (!theme) throw new Error("The Painful Lessons theme could not be found.");
  const awards = clone(theme.getFlag(MODULE_ID, "dutyImprovementAwards") ?? {}), prior = awards[message.id];
  if (prior?.state === "applied") {
    const config = features.painfulLessons, update = { "system.improve": Math.max(0, (Number(theme.system.improve) || 0) - prior.amount) };
    awards[message.id] = { ...prior, state: "reversed" };
    update[`flags.${MODULE_ID}.dutyImprovementAwards`] = awards;
    if (reservations(theme)[config.key] === message.uuid) {
      update[`flags.${MODULE_ID}.${SPECIAL_USES}.${config.key}`] = false;
      update[`flags.${MODULE_ID}.specialImprovementMessages.-=${config.key}`] = null;
    }
    await theme.update(update);
  }
  await message.update({ [`flags.${MODULE_ID}.-=painfulLessons`]: null });
}
function decorateDutyResults(message, root) {
  root.querySelectorAll('.litm-qol-duty-note').forEach(note => note.remove());
  for (const [feature, text] of Object.entries({ grimDetermination: 'Grim Determination: gained determined-2.',
    painfulLessons: 'Painful Lessons: marked Improve.', unstoppable: 'Unstoppable: avoided the Consequences.' })) {
    if (!message.getFlag(MODULE_ID, feature)) continue;
    const note = document.createElement('p'); note.className = 'litm-qol-duty-note'; note.textContent = text;
    (root.querySelector('.roll-card') ?? root).append(note);
  }
}
export function renderDutyActions(message, root, use) {
  root.querySelectorAll('.litm-qol-duty-action').forEach(button => button.remove());
  decorateDutyResults(message, root);
  if (!mayUse(message, game.user)) return;
  let shown = false;
  for (const [feature, config] of Object.entries(features)) for (const { actor, theme } of dutyCandidates(message, feature)) {
    if (!(game.user.isGM || actor.isOwner)) continue;
    shown = true;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'litm-qol-duty-action';
    button.dataset.feature = feature; button.textContent = `${config.name} — ${config.label}`;
    button.dataset.tooltip = feature === 'grimDetermination' ? 'Use when this action advances this theme’s Quest. Gain the status before any Reaction.'
      : feature === 'unstoppable' ? 'Use when this action pursues this theme’s Quest. Keep the Success and avoid its Consequences.'
        : 'Mark Improve on the theme whose tags you used for this roll.';
    button.disabled = feature === 'painfulLessons' && Number(theme.system.improve) >= (usesDiligentTrack(theme) ? 5 : 3)
      && theme.getFlag(MODULE_ID, 'dutyImprovementAwards')?.[message.id]?.state !== 'applied';
    button.addEventListener('click', async () => {
      if (button.disabled) return; button.disabled = true;
      try { await use({ feature, themeUuid: theme.uuid, messageUuid: message.uuid }); }
      catch (error) { ui.notifications.error(error.message); }
      finally { renderDutyActions(message, root, use); }
    });
    (root.querySelector('.roll-card') ?? root).append(button);
  }
  if (shown) cards.set(message.uuid, { root, refresh: () => renderDutyActions(message, root, use) }); else cards.delete(message.uuid);
}
Hooks.on('updateItem', item => {
  if (item.type !== 'themebook') return;
  for (const [id, card] of cards) { if (card.root.isConnected) card.refresh(); else cards.delete(id); }
});
