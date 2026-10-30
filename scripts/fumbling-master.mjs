import { themeTitle } from "./theme-title.mjs";
import { hasQuintessence } from "./quintessence-automation.mjs";

const MODULE_ID = "litm-smeeth-qol";
const PATCHED = Symbol.for(`${MODULE_ID}.fumblingMaster`);
export const FUMBLING_OVERFLOW = "fumblingImproveOverflow";
const keyOf = entry => JSON.stringify([entry.actorId, entry.itemId, entry.index, entry.name]);
const groupOf = entry => `${entry.actorId}:${entry.itemId}`;

export function fumblingCandidates(app, DiceRollApp) {
  const applied = DiceRollApp.applyRulesToSelectedTags(app.selectedTags ?? [], app.selectedGmTags ?? [],
    app.selectedStoryTags ?? [], app.challengeTags ?? []);
  const entries = new Map();
  for (const tag of applied) {
    if (!tag.weakness || tag.source === "fellowship-themecard") continue;
    const contributed = tag.source === "litm-qol-help";
    const actor = contributed ? game.actors.get(tag.helperActorId) : app.actor;
    if (!hasQuintessence(actor, "Fumbling Master")) continue;
    const itemId = contributed ? tag.helperThemebookId : tag.themebookId;
    const index = contributed ? tag.helperWeaknessIndex : tag.index;
    const theme = actor.items.get(itemId);
    const weakness = theme?.system.weaknesstags?.[index];
    const name = String(contributed ? tag.originalName : tag.name ?? "").trim();
    if (theme?.type !== "themebook" || theme.system.options?.isStoryTheme
        || !Number.isInteger(index) || !name || weakness?.name?.trim() !== name || weakness.planned) continue;
    const entry = { actorId: actor.id, itemId, index, name, source: "weakness",
      actorName: actor.name, themeName: themeTitle(theme),
      // Replace the weakness's effective contribution with -2. An inverted
      // weakness that currently gives +1 therefore needs a -3 adjustment.
      extraPenalty: tag.positive ? 3 : 1 };
    entry.key = keyOf(entry);
    entries.set(entry.key, entry);
  }
  return [...entries.values()];
}

export function fumblingSelections(app, DiceRollApp) {
  const selected = app._litmQolFumblingMaster ?? new Set();
  const groups = new Set();
  return fumblingCandidates(app, DiceRollApp).filter(entry => {
    if (!selected.has(entry.key) || groups.has(groupOf(entry))) return false;
    groups.add(groupOf(entry));
    return true;
  });
}

export function fumblingPenalty(app, DiceRollApp, values = {}) {
  if (values._litmQolFumblingFinalized) return 0;
  return fumblingSelections(app, DiceRollApp).reduce((sum, entry) => sum + entry.extraPenalty, 0);
}

export function finalizeFumblingMaster(app, values, DiceRollApp) {
  if (values._litmQolFumblingFinalized) {
    const available = new Map(fumblingCandidates(app, DiceRollApp).map(entry => [entry.key, entry]));
    if (values._litmQolFumblingActorId !== app.actor.id
        || values._litmQolFumblingRollType !== app.rollType
        || (values._litmQolFumblingSelections ?? []).some(entry => available.get(entry.key)?.extraPenalty !== entry.extraPenalty)) {
      ui.notifications.warn("The Fumbling Master choice changed. Review the roll and submit it again.");
      return null;
    }
    return values;
  }
  const selections = fumblingSelections(app, DiceRollApp);
  return { ...values,
    numModNegative: (Number(values.numModNegative) || 0) + selections.reduce((sum, entry) => sum + entry.extraPenalty, 0),
    _litmQolFumblingFinalized: true,
    _litmQolFumblingActorId: app.actor.id,
    _litmQolFumblingRollType: app.rollType,
    _litmQolFumblingSelections: selections
  };
}

/** Keep overflow from a double mark at the end of an ordinary three-box track.
 * The normal improvement is still chosen through the existing workflow. */
export function improveResetUpdate(theme, { maximum = 3 } = {}) {
  const saved = Math.max(0, Math.floor(Number(theme.getFlag?.(MODULE_ID, FUMBLING_OVERFLOW)) || 0));
  return { "system.improve": Math.min(maximum, saved),
    ...(theme.getFlag?.(MODULE_ID, "diligentTrackSpent") ? { [`flags.${MODULE_ID}.diligentTrackSpent`]: 0 } : {}),
    ...(saved ? { [`flags.${MODULE_ID}.${FUMBLING_OVERFLOW}`]: Math.max(0, saved - maximum) } : {}) };
}

export function renderFumblingMaster(app, root, DiceRollApp) {
  const form = root.matches?.("form.roll-dialog-container") ? root : root.querySelector("form.roll-dialog-container");
  if (!form) return;
  form.querySelector(".litm-qol-fumbling-master")?.remove();
  const candidates = fumblingCandidates(app, DiceRollApp);
  if (!candidates.length) { app._litmQolFumblingMaster = new Set(); return; }
  const validKeys = new Set(candidates.map(entry => entry.key));
  app._litmQolFumblingMaster = new Set([...(app._litmQolFumblingMaster ?? [])].filter(key => validKeys.has(key)));
  const chosen = new Set(fumblingSelections(app, DiceRollApp).map(entry => entry.key));
  const locked = Boolean(app.pendingRequest || app._litmQolExecutingRoll || app._litmQolFumblingExecuting);
  const section = document.createElement("fieldset");
  section.className = "litm-qol-fumbling-master";
  const legend = document.createElement("legend"); legend.textContent = "Fumbling Master"; section.append(legend);
  const note = document.createElement("p");
  note.textContent = "Optional: make an invoked weakness count as −2 Power and mark 2 Improve instead of 1. Choose at most one weakness per theme.";
  section.append(note);
  for (const entry of candidates) {
    const label = document.createElement("label"); label.className = "litm-qol-fumbling-choice";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox";
    checkbox.name = "litmQolFumblingMaster"; checkbox.value = entry.key;
    checkbox.checked = chosen.has(entry.key); checkbox.disabled = locked;
    const text = document.createElement("span");
    text.textContent = entry.name;
    checkbox.addEventListener("change", () => {
      for (const other of candidates) if (groupOf(other) === groupOf(entry)) app._litmQolFumblingMaster.delete(other.key);
      if (checkbox.checked) app._litmQolFumblingMaster.add(entry.key);
      for (const box of section.querySelectorAll('input[name="litmQolFumblingMaster"]')) {
        box.checked = app._litmQolFumblingMaster.has(box.value);
      }
      const power = form.querySelector(".power-label");
      if (power) power.textContent = `Power: ${app.computePowerAmount()}`;
      // The bubbling change event refreshes Trade Power's availability too.
      // Keep these controls in place so focus and scroll position stay put.
    });
    label.append(checkbox, text); section.append(label);
  }
  const anchor = form.querySelector(".mt-10") ?? form.querySelector("footer");
  if (anchor) anchor.parentElement.insertBefore(section, anchor); else form.append(section);
}

/** Install outside the bookkeeping/Trade Power execution wrappers, but outside
 * Diligent Drudge's reset wrapper too: all selected-theme marks go through the
 * saved roll receipt, never through both native cleanup and the receipt. */
export function installFumblingMaster(DiceRollApp) {
  const proto = DiceRollApp.prototype;
  if (proto[PATCHED]) return;
  const execute = proto.executeRoll;
  proto.executeRoll = async function(values) {
    if (this._litmQolFumblingExecuting) return;
    const finalized = finalizeFumblingMaster(this, values, DiceRollApp);
    if (!finalized) return;
    this._litmQolFumblingExecuting = finalized;
    try { return await execute.call(this, finalized); }
    finally { this._litmQolFumblingExecuting = null; this._litmQolFumblingMaster = new Set(); }
  };
  const reset = proto.resetTags;
  proto.resetTags = async function(...args) {
    const themes = new Set((this._litmQolFumblingExecuting?._litmQolFumblingSelections ?? [])
      .filter(entry => entry.actorId === this.actor.id).map(entry => entry.itemId));
    if (!themes.size) return reset.apply(this, args);
    const tags = this.selectedTags.map(tag => themes.has(tag.themebookId) ? { ...tag, positive: true } : { ...tag });
    // Item updates can rebuild the live dialog's selectedTags while native
    // cleanup awaits them. Give cleanup a stable view instead of temporarily
    // changing that shared array: these themes receive only the receipt's two
    // marks, even when a sheet refresh restores the original hindering tags.
    const cleanup = new Proxy(this, {
      get(target, property) {
        return property === "selectedTags" ? tags : Reflect.get(target, property, target);
      }
    });
    return reset.apply(cleanup, args);
  };
  const show = proto.addShowDicePromise;
  proto.addShowDicePromise = function(promises, roll) {
    const selections = this._litmQolFumblingExecuting?._litmQolFumblingSelections ?? [];
    if (selections.length) {
      const render = roll.render;
      roll.render = async function(...args) {
        const html = await render.apply(this, args);
        const note = document.createElement("p"); note.className = "litm-qol-fumbling-note";
        note.textContent = `Fumbling Master: ${selections.map(entry => `${entry.name} (${entry.actorName}): −2 Power, 2 Improve`).join("; ")}.`;
        return html + note.outerHTML;
      };
    }
    return show.call(this, promises, roll);
  };
  const setOptions = proto.setOptions;
  proto.setOptions = function(options) {
    if ((options.actor && options.actor.id !== this.actor?.id) || (options.type && options.type !== this.rollType)) {
      this._litmQolFumblingMaster = new Set();
    }
    return setOptions.call(this, options);
  };
  const close = proto._onClose;
  proto._onClose = function(...args) {
    this._litmQolFumblingMaster = new Set();
    return close.apply(this, args);
  };
  Object.defineProperty(proto, PATCHED, { value: true });
}
