import { specialUsed } from "./circumstance-improvements.mjs";
import { invokedThemeSources } from "./personality-improvements.mjs";
import { effectiveMight } from "./larger-than-life.mjs";
const MODULE_ID = "litm-smeeth-qol", IGNORED = "litmQolTraitIgnored";
const arrays = ["selectedTags", "selectedGmTags", "selectedStoryTags", "challengeTags"];
const names = { "made-for-this": "Made for This", "moment-to-shine": "Moment to Shine", "pull-through": "Pull Through" };
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const statusKey = tag => JSON.stringify([tag.source ?? null, tag.name, Number(tag.value), tag.index ?? null, tag.actorId ?? null, tag.sceneDataItemId ?? null]);
function baseTags(app, Class) {
  return Class.applyRulesToSelectedTags(...arrays.map(field => (app[field] ?? []).map(tag => {
    const clean = { ...tag }; delete clean[IGNORED]; return clean;
  })));
}
export function traitCandidates(app, Class, might = app.mightScale) {
  if (!["quick", "detailed", "reaction"].includes(app.rollType)) return [];
  const applied = baseTags(app, Class), status = applied.find(tag => !tag.positive && Number(tag.value) > 0);
  const invoked = invokedThemeSources(app, applied);
  const actors = app._litmQolGroupRoll ? (app._litmQolGroupRoll.actorIds ?? []).map(id => game.actors.get(id)).filter(Boolean) : [app.actor].filter(Boolean);
  const candidates = [];
  for (const actor of actors) for (const theme of actor.items ?? []) {
    if (theme.type !== "themebook" || theme.system.options?.isStoryTheme) continue;
    for (const [feature, name] of Object.entries(names)) {
      if (specialUsed(theme, feature)) continue;
      const index = theme.system.specialImprovements?.findIndex(entry => entry.active && normalize(entry.name) === normalize(name));
      if (index == null || index < 0) continue;
      if (feature === "moment-to-shine") { if (!(Number(might) < 0)) continue; }
      else {
        if (!status) continue;
        if (feature === "pull-through" && (Number(status.value) > 3 || !invoked.some(source => source.actorUuid === actor.uuid && source.itemId === theme.id))) continue;
      }
      candidates.push({ key: `${actor.uuid}:${theme.id}:${feature}`, actorId: actor.id, actorUuid: actor.uuid,
        itemId: theme.id, index, name: theme.system.specialImprovements[index].name, source: "special", feature,
        statusKey: feature === "moment-to-shine" ? null : statusKey(status),
        statusName: feature === "moment-to-shine" ? null : status.name,
        statusTier: feature === "moment-to-shine" ? null : Number(status.value) });
    }
  }
  return candidates;
}
function signature(entry) { return JSON.stringify([entry.key, entry.index, entry.name, entry.statusKey]); }
function selections(app, Class) {
  if (app._litmQolTraitExecuting) return app._litmQolTraitExecuting;
  const valid = new Set(traitCandidates(app, Class).map(signature));
  return [...(app._litmQolTraitChoices?.values() ?? [])].filter(entry => valid.has(signature(entry)));
}
function sync(app, choices) {
  const ignored = new Set(choices.map(entry => entry.statusKey).filter(Boolean));
  for (const field of arrays) for (const tag of app[field] ?? []) {
    delete tag[IGNORED];
    if (!tag.positive && Number(tag.value) > 0 && ignored.has(statusKey(tag))) tag[IGNORED] = true;
  }
}
export function traitMight(app, value, values = app) {
  const might = effectiveMight(app.actor, value);
  if (values._litmQolTraitFinalized || values._litmQolTraitMightApplied || app._litmQolTraitMightPreview) return might;
  const choices = app._litmQolTraitExecuting ?? (app._litmQolTraitClass ? selections(app, app._litmQolTraitClass) : [...(app._litmQolTraitChoices?.values() ?? [])]);
  if (!choices.some(entry => entry.feature === "moment-to-shine") || might >= 0) return might;
  return might <= -6 ? effectiveMight(app.actor, -3) : 0;
}
function finalize(app, values, Class) {
  const originalMight = values._litmQolTraitFinalized ? values._litmQolTraitOriginalMight : values.mightScale;
  const choices = values._litmQolTraitSelections ?? selections(app, Class);
  const valid = new Set(traitCandidates(app, Class, originalMight).map(signature)), seenStatuses = new Set();
  let moment = false;
  for (const entry of choices) {
    if (!valid.has(signature(entry)) || (entry.statusKey && seenStatuses.has(entry.statusKey)) || (entry.feature === "moment-to-shine" && moment)) {
      ui.notifications.warn("The selected Trait improvement is no longer available. Review the roll again."); return null;
    }
    if (entry.statusKey) seenStatuses.add(entry.statusKey);
    if (entry.feature === "moment-to-shine") moment = true;
  }
  const might = effectiveMight(app.actor, originalMight);
  return { ...values, _litmQolTraitSelections: choices, _litmQolTraitFinalized: true,
    _litmQolTraitOriginalMight: originalMight, mightScale: moment && might < 0 ? (might <= -6 ? effectiveMight(app.actor, -3) : 0) : might };
}
export function installTraitImprovements(Class) {
  const proto = Class.prototype, key = Symbol.for(`${MODULE_ID}.traitImprovements`);
  if (proto[key]) return;
  const rules = Class.applyRulesToSelectedTags;
  Class.applyRulesToSelectedTags = function(...groups) { return rules.call(this, ...groups.map(group => (group ?? []).filter(tag => !tag[IGNORED]))); };
  for (const method of ["computePowerAmount", "_prepareContext", "updateTagsAndStatuses"]) {
    const original = proto[method]; if (!original) continue;
    proto[method] = function(...args) {
      this._litmQolTraitClass = Class;
      const chosen = selections(this, Class); sync(this, chosen);
      if (method !== "computePowerAmount") {
        const result = original.apply(this, args); sync(this, chosen); return result;
      }
      const old = this.mightScale;
      this.mightScale = traitMight(this, old); this._litmQolTraitMightPreview = true;
      try { return original.apply(this, args); }
      finally { this.mightScale = old; this._litmQolTraitMightPreview = false; }
    };
  }
  const request = proto.requestGmConfirmation;
  proto.requestGmConfirmation = function(values) {
    const finalized = finalize(this, values, Class); if (!finalized) return;
    sync(this, finalized._litmQolTraitSelections);
    return request.call(this, finalized);
  };
  const execute = proto.executeRoll;
  proto.executeRoll = async function(values) {
    if (this._litmQolTraitExecuting) return;
    const finalized = finalize(this, values, Class); if (!finalized) return;
    this._litmQolTraitExecuting = finalized._litmQolTraitSelections;
    sync(this, this._litmQolTraitExecuting);
    try { return await execute.call(this, finalized); }
    finally { this._litmQolTraitExecuting = null; this._litmQolTraitChoices = new Map(); sync(this, []); }
  };
  const options = proto.setOptions;
  proto.setOptions = function(next) {
    if ((next.actor && next.actor.uuid !== this.actor?.uuid) || (next.type && next.type !== this.rollType)) { this._litmQolTraitChoices = new Map(); sync(this, []); }
    return options.call(this, next);
  };
  const close = proto._onClose;
  proto._onClose = function(...args) { this._litmQolTraitChoices = new Map(); sync(this, []); return close?.apply(this, args); };
  Object.defineProperty(proto, key, { value: true });
}
export function renderTraitImprovements(app, root, Class) {
  app._litmQolTraitClass = Class;
  root.querySelectorAll('.litm-qol-trait').forEach(section => section.remove());
  const candidates = traitCandidates(app, Class), chosen = selections(app, Class);
  app._litmQolTraitChoices = new Map(chosen.map(entry => [entry.key, entry])); sync(app, chosen);
  const form = root.matches?.('form.roll-dialog-container') ? root : root.querySelector('form.roll-dialog-container');
  if (!form) return;
  const listener = Symbol.for(`${MODULE_ID}.traitMightListener`);
  if (!form[listener]) {
    form.addEventListener('change', event => { if (event.target.matches('.might-scale-radio')) renderTraitImprovements(app, root, Class); });
    form[listener] = true;
  }
  if (!candidates.length) return;
  for (const [feature, name] of Object.entries(names)) {
    const entries = candidates.filter(entry => entry.feature === feature); if (!entries.length) continue;
    const section = document.createElement('fieldset'); section.className = 'litm-qol-trait';
    section.dataset.feature = feature;
    const legend = document.createElement('legend'); legend.textContent = name; section.append(legend);
    for (const entry of entries) {
      const label = document.createElement('label'); label.className = 'litm-qol-fumbling-choice';
      const box = document.createElement('input'); box.type = 'checkbox'; box.name = 'litmQolTrait'; box.value = entry.key;
      box.checked = app._litmQolTraitChoices.has(entry.key);
      box.disabled = Boolean(app.pendingRequest || app._litmQolExecutingRoll || chosen.some(other => other.key !== entry.key && (entry.statusKey ? entry.statusKey === other.statusKey : other.feature === feature)));
      const text = document.createElement('span'); text.textContent = feature === 'moment-to-shine'
        ? (Number(app.mightScale) <= -6 ? 'Treat Extremely Imperiled as Imperiled' : 'Ignore Imperiled') : `Ignore ${entry.statusName}-${entry.statusTier}`;
      label.dataset.tooltip = feature === 'made-for-this' ? 'Once per scene: ignore the hindering status your Trait helps you overcome, as chosen for Made for This.'
        : feature === 'pull-through' ? 'Once per session: ignore this negative physical or emotional status while using tags from this theme.'
        : 'Once per session, when using tags from this theme: ignore Imperiled or treat Extremely Imperiled as Imperiled.';
      box.addEventListener('change', () => {
        if (box.checked) app._litmQolTraitChoices.set(entry.key, entry); else app._litmQolTraitChoices.delete(entry.key);
        sync(app, selections(app, Class)); renderTraitImprovements(app, root, Class);
        const power = form.querySelector('.power-label'); if (power) power.textContent = `Power: ${app.computePowerAmount()}`;
      });
      label.append(box, text); section.append(label);
    }
    const anchor = form.querySelector('.mt-10') ?? form.querySelector('footer');
    if (anchor) anchor.parentElement.insertBefore(section, anchor); else form.append(section);
  }
}
