import { themeTitle } from "./theme-title.mjs";
const MODULE_ID = "litm-smeeth-qol";
export const SPECIAL_USES = "specialImprovementUses";
const ADVERSITY = "strength-from-adversity";
const SOURCE = "litm-qol-adversity";
const PATCHED = Symbol.for(`${MODULE_ID}.circumstance`);
const pending = new Set();
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const tracked = new Map([
  ["expected role", { key: "expected-role", period: "session" }],
  ["familiar matters", { key: "familiar-matters", period: "scene" }],
  ["strength from adversity", { key: ADVERSITY, period: "session" }],
  ["trudging along", { key: "trudging-along", period: "scene" }],
  ["catch me when i fall", { key: "catch-me-when-i-fall", period: "session" }],
  ["deeply committed", { key: "deeply-committed", period: "scene" }],
  ["goes both ways", { key: "goes-both-ways", period: "session" }],
  ["unwavering", { key: "unwavering", period: "session" }],
  ["face from the past", { key: "face-from-the-past", period: "session" }],
  ["lessons learned", { key: "lessons-learned", period: "session" }],
  ["vivid memory", { key: "vivid-memory", period: "session" }],
  ["shared language", { key: "shared-language", period: "scene" }],
  ["stand out", { key: "stand-out", period: "scene" }],
  ["true to my tribe", { key: "true-to-my-tribe", period: "scene" }],
  ["trust in legacy", { key: "trust-in-legacy", period: "session" }],
  ["wisdom handed down", { key: "wisdom-handed-down", period: "scene" }],
  ["adaptable persona", { key: "adaptable-persona", period: "session" }],
  ["lasting impression", { key: "lasting-impression", period: "scene" }],
  ["unshakeable", { key: "unshakeable", period: "scene" }],
  ["deft remedy", { key: "deft-remedy", period: "session" }],
  ["learn from my mistakes", { key: "learn-from-my-mistakes", period: "scene" }],
  ["innate sense", { key: "innate-sense", period: "session" }],
  ["made for this", { key: "made-for-this", period: "scene" }],
  ["moment to shine", { key: "moment-to-shine", period: "session" }],
  ["pull through", { key: "pull-through", period: "session" }]
]);
export const specialImprovementPeriod = key => [...tracked.values()].find(feature => feature.key === key)?.period;
export const specialUsed = (theme, key) => theme?.getFlag(MODULE_ID, SPECIAL_USES)?.[key] === true;
const owns = actor => game.user.isGM || actor?.isOwner;
const hasAdversity = theme => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === "strength from adversity");

export function renderSpecialImprovementUsage(actor, root) {
  if (!actor || !root) return;
  for (const name of root.querySelectorAll(".item-special-improvement-line .special-improvement-label")) {
    const feature = tracked.get(normalize(name.textContent));
    const row = name.closest(".item-special-improvement-line");
    const id = row.closest(".themebook-container[data-id]")?.dataset.id;
    const theme = actor.items?.get(id);
    if (!feature || !theme || theme.type !== "themebook"
        || !theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === normalize(name.textContent))) continue;
    row.querySelector(".litm-qol-special-use")?.remove();
    const label = document.createElement("label"); label.className = "litm-qol-session-use litm-qol-special-use";
    const box = document.createElement("input"); box.type = "checkbox";
    box.setAttribute("aria-label", `${name.textContent.trim()} used this ${feature.period}`);
    const dot = document.createElement("span"); dot.className = "litm-qol-session-use-dot"; dot.setAttribute("aria-hidden", "true");
    const key = `${theme.uuid}:${feature.key}`;
    const paint = () => { box.checked = specialUsed(theme, feature.key); box.disabled = !owns(actor) || pending.has(key); label.dataset.tooltip = `${name.textContent.trim()}: ${box.checked ? "Used" : "Unused"} this ${feature.period}. Click to toggle. Uncheck at the start of the next ${feature.period}.`; };
    paint(); label.addEventListener("click", event => event.stopPropagation());
    box.addEventListener("change", async event => {
      event.stopPropagation(); if (!owns(actor) || pending.has(key)) { paint(); return; }
      pending.add(key); const used = box.checked; paint();
      try {
        const update = { [`flags.${MODULE_ID}.${SPECIAL_USES}.${feature.key}`]: used };
        if (feature.key === "learn-from-my-mistakes") update[`flags.${MODULE_ID}.specialImprovementMessages.-=${feature.key}`] = null;
        await theme.update(update);
      }
      catch (error) { console.error(error); ui.notifications.error("Could not save Special Improvement usage."); }
      finally { pending.delete(key); if (root.isConnected) renderSpecialImprovementUsage(actor, root); }
    });
    label.append(box, dot); row.append(label);
  }
}

export function adversityCandidates(app, DiceRollApp) {
  if (!["quick", "detailed", "reaction"].includes(app.rollType)) return [];
  const applied = DiceRollApp.applyRulesToSelectedTags((app.selectedTags ?? []).filter(tag => tag.source !== SOURCE),
    app.selectedGmTags ?? [], app.selectedStoryTags ?? [], app.challengeTags ?? []);
  const candidates = new Map();
  for (const tag of applied) {
    if (!tag.weakness || tag.source === "fellowship-themecard") continue;
    const helper = tag.source === "litm-qol-help";
    const actor = helper ? game.actors.get(tag.helperActorId) : app.actor;
    const itemId = helper ? tag.helperThemebookId : tag.themebookId;
    const index = helper ? tag.helperWeaknessIndex : tag.index;
    const theme = actor?.items.get(itemId), weakness = theme?.system.weaknesstags?.[index];
    const name = helper ? tag.originalName : tag.name;
    if (theme?.type !== "themebook" || theme.system.options?.isStoryTheme || !weakness || weakness.planned
        || weakness.name?.trim() !== name?.trim()) continue;
    if (hasAdversity(theme) && !specialUsed(theme, ADVERSITY)) {
      const key = `${actor.id}:${itemId}`;
      candidates.set(key, { key, actorId: actor.id, itemId, index, name, source: "weakness", feature: ADVERSITY, statusName: "driven", actorName: actor.name, themeName: themeTitle(theme) });
    }
    if (!specialUsed(theme, "vivid-memory") && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === "vivid memory")) {
      const key = `${actor.id}:${itemId}:vivid-memory`;
      candidates.set(key, { key, actorId: actor.id, itemId, index, name, source: "weakness", feature: "vivid-memory" });
    }
  }
  if (["quick", "detailed"].includes(app.rollType)) {
    const questActors = app._litmQolGroupRoll ? (app._litmQolGroupRoll.actorIds ?? []).map(id => game.actors.get(id)).filter(Boolean) : [app.actor].filter(Boolean);
    for (const actor of questActors) for (const theme of actor.items) {
      if (theme.type !== "themebook" || theme.system.options?.isStoryTheme || specialUsed(theme, "deeply-committed")) continue;
      const index = theme.system.specialImprovements?.findIndex(entry => entry.active && normalize(entry.name) === "deeply committed");
      if (index == null || index < 0) continue;
      const key = `${actor.id}:${theme.id}:deeply-committed`;
      candidates.set(key, { key, actorId: actor.id, itemId: theme.id, index,
        name: theme.system.specialImprovements[index].name, source: "special", feature: "deeply-committed", statusName: "committed" });
    }
  }
  return [...candidates.values()];
}
export function adversitySelections(app, DiceRollApp) {
  return adversityCandidates(app, DiceRollApp).filter(entry => app._litmQolAdversity?.has(entry.key));
}
function syncAdversity(app, selections) {
  app.selectedTags = (app.selectedTags ?? []).filter(tag => tag.source !== SOURCE);
  const owners = new Map();
  for (const entry of selections) {
    if (entry.feature === "vivid-memory") continue;
    const actor = entry.actorId === app.actor?.id ? app.actor : game.actors.get(entry.actorId);
    const statusName = entry.statusName ?? "driven";
    const ownerKey = `${entry.actorId}:${statusName}`;
    const marks = owners.get(ownerKey)?.marks ?? (actor?.system.floatingTagsAndStatuses ?? [])
      .filter(tag => tag.isStatus && tag.positive && normalize(tag.name) === statusName)
      .reduce((all, tag) => all.map((marked, index) => marked || Boolean(tag.markings?.[index]) || Number(tag.value) === index + 1), Array(6).fill(false));
    let index = 1; while (marks[index] && index < 5) index++; marks[index] = true; owners.set(ownerKey, { actorId: entry.actorId, statusName, marks });
  }
  for (const { actorId, statusName, marks } of owners.values()) app.selectedTags.push({ name: statusName, positive: true, isStatus: true,
    value: marks.findLastIndex(Boolean) + 1, source: SOURCE, actorId, toBurn: false, isClickable: false });
}
export function validateAdversitySelections(app, values, DiceRollApp) {
  const selections = values._litmQolAdversitySelections ?? adversitySelections(app, DiceRollApp);
  const valid = new Set(adversityCandidates(app, DiceRollApp).map(entry => JSON.stringify([entry.key, entry.index, entry.name])));
  if (values._litmQolAdversityActorId && values._litmQolAdversityActorId !== app.actor?.id
      || selections.some(entry => !valid.has(JSON.stringify([entry.key, entry.index, entry.name])))) {
    ui.notifications.warn("The selected Special Improvement is no longer available. Review the roll again."); return null;
  }
  syncAdversity(app, selections);
  return { ...values, _litmQolAdversityActorId: app.actor?.id, _litmQolAdversitySelections: selections };
}
export function renderAdversity(app, root, DiceRollApp) {
  const form = root.matches?.("form.roll-dialog-container") ? root : root.querySelector("form.roll-dialog-container");
  if (!form) return;
  form.querySelectorAll(".litm-qol-adversity").forEach(section => section.remove());
  const candidates = adversityCandidates(app, DiceRollApp), keys = new Set(candidates.map(entry => entry.key));
  app._litmQolAdversity = new Set([...(app._litmQolAdversity ?? [])].filter(key => keys.has(key)));
  if (!candidates.length) return;
  for (const feature of [ADVERSITY, "deeply-committed", "vivid-memory"]) {
    const entries = candidates.filter(entry => entry.feature === feature);
    if (!entries.length) continue;
    const section = document.createElement("fieldset"); section.className = "litm-qol-adversity"; section.dataset.feature = feature;
    const legend = document.createElement("legend"); legend.textContent = feature === ADVERSITY ? "Strength From Adversity" : feature === "vivid-memory" ? "Vivid Memory" : "Deeply Committed"; section.append(legend);
    const note = document.createElement("p"); note.textContent = feature === ADVERSITY
      ? "Gain driven-2 for this roll. The normal status rules apply. Marks this improvement Used after the roll."
      : feature === "vivid-memory" ? "After the roll, discover or reveal a detail from your Past and create a story tag or tier-2 emotional status."
        : "Use when this action pursues the theme’s Quest. Gain committed-2 for this action; normal status rules apply."; section.append(note);
    for (const entry of entries) {
      const label = document.createElement("label"); label.className = "litm-qol-fumbling-choice";
      const box = document.createElement("input"); box.type = "checkbox"; box.name = "litmQolAdversity"; box.value = entry.key;
      box.checked = app._litmQolAdversity.has(entry.key); box.disabled = Boolean(app.pendingRequest || app._litmQolExecutingRoll || app._litmQolAdversityExecuting);
      const text = document.createElement("span"); text.textContent = feature === ADVERSITY ? `${entry.name} — gain driven-2` : feature === "vivid-memory" ? `${entry.name} — use Vivid Memory` : "Gain committed-2";
      box.addEventListener("change", () => {
        if (box.checked) app._litmQolAdversity.add(entry.key); else app._litmQolAdversity.delete(entry.key);
        syncAdversity(app, adversitySelections(app, DiceRollApp));
        const power = form.querySelector(".power-label"); if (power) power.textContent = `Power: ${app.computePowerAmount()}`;
      }); label.append(box, text); section.append(label);
    }
    const anchor = form.querySelector(".mt-10") ?? form.querySelector("footer");
    if (anchor) anchor.parentElement.insertBefore(section, anchor); else form.append(section);
  }
}
export function installAdversity(DiceRollApp) {
  const proto = DiceRollApp.prototype; if (proto[PATCHED]) return;
  for (const method of ["_prepareContext", "computePowerAmount", "updateTagsAndStatuses"]) {
    const original = proto[method]; if (!original) continue;
    proto[method] = function(...args) {
      if (method !== "updateTagsAndStatuses") syncAdversity(this, this._litmQolAdversityExecuting ?? adversitySelections(this, DiceRollApp));
      const result = original.apply(this, args);
      if (method === "updateTagsAndStatuses") syncAdversity(this, this._litmQolAdversityExecuting ?? adversitySelections(this, DiceRollApp));
      return result;
    };
  }
  const request = proto.requestGmConfirmation;
  proto.requestGmConfirmation = function(values) { const finalized = validateAdversitySelections(this, values, DiceRollApp); if (finalized) return request.call(this, finalized); };
  const execute = proto.executeRoll;
  proto.executeRoll = async function(values) {
    if (this._litmQolAdversityExecuting) return;
    const finalized = validateAdversitySelections(this, values, DiceRollApp); if (!finalized) return;
    this._litmQolAdversityExecuting = finalized._litmQolAdversitySelections;
    try { return await execute.call(this, finalized); }
    finally { this._litmQolAdversityExecuting = null; this._litmQolAdversity = new Set(); syncAdversity(this, []); }
  };
  const setOptions = proto.setOptions;
  proto.setOptions = function(options) {
    if ((options.actor && options.actor.id !== this.actor?.id) || (options.type && options.type !== this.rollType)) this._litmQolAdversity = new Set();
    return setOptions.call(this, options);
  };
  const close = proto._onClose;
  proto._onClose = function(...args) { this._litmQolAdversity = new Set(); return close?.apply(this, args); };
  Object.defineProperty(proto, PATCHED, { value: true });
}
