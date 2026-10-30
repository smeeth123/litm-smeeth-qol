import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { usesDiligentTrack } from "./diligent-drudge.mjs";
import { invokedThemeSources } from "./personality-improvements.mjs";
const MODULE_ID = "litm-smeeth-qol", KEY = "learn-from-my-mistakes";
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const has = (theme, name) => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === name);
const rehearsedSpecial = theme => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.find(entry => entry.active && ["rehearsed technique", "rehearsed techniques"].includes(normalize(entry.name)));

export function captureSkillMistakes(app, applied) {
  return invokedThemeSources(app, applied).filter(source => {
    const actor = source.actorUuid === app.actor?.uuid ? app.actor : game.actors.get(source.actorId);
    const theme = actor?.items.get(source.itemId);
    return has(theme, "learn from my mistakes") && !specialUsed(theme, KEY);
  });
}
function currentOutcome(message, context) {
  const state = message.getFlag("mist-engine-fvtt", "detailedSpend");
  if (state) return state.consequenceResult;
  const root = document.createElement("div"); root.innerHTML = message.content;
  return root.querySelector(".consequence-result-negative") ? -1
    : root.querySelector(".consequence-result-neutral,.consequence-result-positive") ? 0 : context.initialOutcome;
}
export async function applySkillBookkeeping(message, context) {
  if (!["quick", "detailed", "reaction"].includes(context?.rollType)) return;
  const failed = currentOutcome(message, context) === -1;
  for (const source of context.skillMistakes ?? []) {
    const actor = await fromUuid(source.actorUuid), theme = actor?.items.get(source.itemId);
    if (!theme || !(game.user.isGM || actor.isOwner)) throw new Error("The Hero's owner or Narrator is required to update Learn from My Mistakes.");
    const receipts = foundry.utils.deepClone(theme.getFlag(MODULE_ID, "skillMistakeRolls") ?? []);
    const awards = foundry.utils.deepClone(theme.getFlag(MODULE_ID, "skillMistakeAwards") ?? {});
    const receipt = awards[message.id];
    const owner = theme.getFlag(MODULE_ID, "specialImprovementMessages")?.[KEY];
    const marks = Math.max(0, Number(theme.system.improve ?? 0));
    if (!failed) {
      // Older rolls recorded only the completed award. Preserve compatibility
      // with those receipts; new records retain the exact (possibly zero) delta.
      const legacy = !receipt && receipts.includes(message.uuid);
      if (receipt?.state !== "applied" && !legacy) continue;
      const amount = Math.min(marks, legacy ? 1 : receipt.amount);
      const ownsUse = owner === message.uuid || (legacy && !owner && receipts.at(-1) === message.uuid);
      awards[message.id] = { ...(receipt ?? {}), state: "reversed", amount: legacy ? amount : receipt.amount };
      const update = { "system.improve": marks - amount, [`flags.${MODULE_ID}.skillMistakeAwards`]: awards };
      if (ownsUse) {
        update[`flags.${MODULE_ID}.${SPECIAL_USES}.${KEY}`] = false;
        update[`flags.${MODULE_ID}.specialImprovementMessages.-=${KEY}`] = null;
      }
      await theme.update(update);
      continue;
    }
    if (receipt?.state === "applied" || (!receipt && receipts.includes(message.uuid))
        || specialUsed(theme, KEY) || !has(theme, "learn from my mistakes")) continue;
    const maximum = usesDiligentTrack(theme) ? 5 : 3;
    const next = Math.max(marks, Math.min(maximum, marks + 1));
    awards[message.id] = { state: "applied", amount: next - marks };
    if (!receipts.includes(message.uuid)) receipts.push(message.uuid);
    await theme.update({ "system.improve": next,
      [`flags.${MODULE_ID}.${SPECIAL_USES}.${KEY}`]: true,
      [`flags.${MODULE_ID}.specialImprovementMessages.${KEY}`]: message.uuid,
      [`flags.${MODULE_ID}.skillMistakeAwards`]: awards, [`flags.${MODULE_ID}.skillMistakeRolls`]: receipts });
  }
}

export function rehearsedCandidate(app, DiceRollApp) {
  if (!["quick", "detailed", "reaction"].includes(app.rollType)) return null;
  const applied = DiceRollApp.applyRulesToSelectedTags(app.selectedTags ?? [], app.selectedGmTags ?? [], app.selectedStoryTags ?? [], app.challengeTags ?? []);
  const tag = applied.find(tag => tag.positive && (tag.value === undefined || tag.value == 0) && tag.toBurn && tag.source !== "fellowship-themecard");
  if (!tag) return null;
  const helper = tag.source === "litm-qol-help";
  if (helper ? tag.helperTagSource !== "themebook" : !tag.powerTag || tag.weakness) return null;
  const actor = helper ? game.actors.get(tag.helperActorId) : app.actor;
  const theme = actor?.items.get(helper ? tag.helperTagItemId : tag.themebookId), improvement = rehearsedSpecial(theme);
  const index = helper ? tag.helperTagIndex : tag.index, power = theme?.system.powertags?.[index];
  if (!improvement?.litmQolLegacyTag || !power || power.planned || power.burned || power.expired
      || !power.litmQolLegacyId || power.litmQolLegacyId !== improvement.litmQolLegacyTag
      || power.name?.trim() !== (helper ? tag.originalName : tag.name)?.trim()) return null;
  return { key: `${actor.uuid}:${theme.id}:${power.litmQolLegacyId}`, actorUuid: actor.uuid, itemId: theme.id,
    tagId: power.litmQolLegacyId, name: power.name };
}
function finalizeRehearsed(app, values, DiceRollApp) {
  const requested = values._litmQolRehearsedChoice === undefined ? app._litmQolRehearsed : values._litmQolRehearsedChoice;
  if (!requested) return { ...values, _litmQolRehearsedChoice: null };
  const candidate = rehearsedCandidate(app, DiceRollApp);
  if (!candidate || candidate.key !== requested.key || candidate.name !== requested.name) {
    ui.notifications.warn("The Rehearsed Technique tag changed or is no longer being burned. Review the roll again.");
    return null;
  }
  return { ...values, _litmQolRehearsedChoice: candidate };
}
export function installRehearsedTechnique(DiceRollApp) {
  const proto = DiceRollApp.prototype, key = Symbol.for(`${MODULE_ID}.rehearsedTechnique`);
  if (proto[key]) return;
  const request = proto.requestGmConfirmation;
  proto.requestGmConfirmation = function(values) {
    const finalized = finalizeRehearsed(this, values, DiceRollApp);
    if (finalized) return request.call(this, finalized);
  };
  const execute = proto.executeRoll;
  proto.executeRoll = async function(values) {
    if (this._litmQolRehearsedExecuting) return;
    const finalized = finalizeRehearsed(this, values, DiceRollApp); if (!finalized) return;
    this._litmQolRehearsedExecuting = finalized._litmQolRehearsedChoice;
    try { return await execute.call(this, finalized); }
    finally { this._litmQolRehearsedExecuting = null; this._litmQolRehearsed = null; }
  };
  const options = proto.setOptions;
  proto.setOptions = function(next) {
    if ((next.actor && next.actor.uuid !== this.actor?.uuid) || (next.type && next.type !== this.rollType)) this._litmQolRehearsed = null;
    return options.call(this, next);
  };
  const close = proto._onClose;
  proto._onClose = function(...args) { this._litmQolRehearsed = null; return close?.apply(this, args); };
  Object.defineProperty(proto, key, { value: true });
}
export function renderRehearsedTechnique(app, root, DiceRollApp) {
  root.querySelector('.litm-qol-rehearsed-technique')?.remove();
  const candidate = rehearsedCandidate(app, DiceRollApp);
  if (!candidate) { if (!app.pendingRequest) app._litmQolRehearsed = null; return; }
  if (app._litmQolRehearsed?.key !== candidate.key) app._litmQolRehearsed = null;
  const form = root.matches?.('form.roll-dialog-container') ? root : root.querySelector('form.roll-dialog-container');
  if (!form) return;
  const section = document.createElement('fieldset'); section.className = 'litm-qol-rehearsed-technique';
  const legend = document.createElement('legend'); legend.textContent = 'Rehearsed Technique';
  const label = document.createElement('label'); label.className = 'litm-qol-fumbling-choice';
  const box = document.createElement('input'); box.type = 'checkbox'; box.name = 'litmQolRehearsedTechnique';
  box.checked = app._litmQolRehearsed?.key === candidate.key;
  box.disabled = Boolean(app.pendingRequest || app._litmQolExecutingRoll);
  const text = document.createElement('span'); text.textContent = `${candidate.name} — treat dice as 7 before adding Power`;
  label.dataset.tooltip = 'Burn the chosen tag normally. Skip rolling dice and use 7 as the dice total, then apply Power and other modifiers.';
  box.addEventListener('change', () => { app._litmQolRehearsed = box.checked ? candidate : null; });
  label.append(box, text); section.append(legend, label);
  const anchor = form.querySelector('.mt-10') ?? form.querySelector('footer');
  if (anchor) anchor.parentElement.insertBefore(section, anchor); else form.append(section);
}
