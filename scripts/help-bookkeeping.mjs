import { hasQuintessence } from "./quintessence-automation.mjs";
import { FUMBLING_OVERFLOW } from "./fumbling-master.mjs";
import { usesDiligentTrack } from "./diligent-drudge.mjs";
const MODULE_ID = "litm-smeeth-qol";
const LEDGER = "helpBookkeepingRolls";
const PATCHED = Symbol.for(`${MODULE_ID}.helpRollState`);
const clone = value => foundry.utils.deepClone(value);

// Keep approved contributions on their originating dialog when the system
// rebuilds its selections from sheets or scene tags.
export function installHelpRollState(DiceRollApp) {
  const proto = DiceRollApp.prototype;
  if (proto[PATCHED]) return;
  const update = proto.updateTagsAndStatuses;
  proto.updateTagsAndStatuses = function(renderFlag = false) {
    const help = (this.selectedTags ?? []).filter(tag => ["litm-qol-help", "litm-qol-fellowship"].includes(tag.source));
    const result = update.call(this, false);
    if (this._litmQolGroupRoll) this.selectedTags = [];
    this.selectedTags.push(...help);
    if (renderFlag && this.rendered) this.render(true, { focus: true });
    return result;
  };
  const setOptions = proto.setOptions;
  proto.setOptions = function(options) {
    const changesActor = options.actor && ["character", "litm-character"].includes(options.actor.type) && options.actor.id !== this.actor?.id;
    if (changesActor || (options.type && options.type !== this.rollType)) {
      this.selectedTags = (this.selectedTags ?? []).filter(tag => !["litm-qol-help", "litm-qol-fellowship"].includes(tag.source));
      this._litmQolHelpRequestId = null;
      this._litmQolGroupRoll = null;
    }
    return setOptions.call(this, options);
  };
  Object.defineProperty(proto, PATCHED, { value: true });
}

function sourceTag(actor, entry) {
  if (entry.source === "fellowship-theme") return actor.system.powertags?.[entry.index];
  if (entry.source === "relationship") return actor.system.fellowships?.[entry.index];
  if (entry.source === "floating") return actor.system.floatingTagsAndStatuses?.[entry.index];
  const item = actor.items.get(entry.itemId);
  if (entry.source === "themebook" && item?.type === "themebook") return item.system.powertags?.[entry.index];
  if (entry.source === "backpack" && item?.type === "backpack") return item.system.items?.[entry.index];
  if (entry.source === "weakness" && item?.type === "themebook") return item.system.weaknesstags?.[entry.index];
  return null;
}

function requireSource(actor, entry, { burning = false } = {}) {
  const tag = actor && sourceTag(actor, entry);
  const name = entry.source === "relationship" ? tag?.relationshipTag : tag?.name;
  if (!tag || name?.trim() !== entry.name?.trim() || (entry.source === "relationship" && (tag.companion ?? "") !== (entry.companion ?? "")) || tag.planned || tag.expired || tag.isStatus ||
      (burning && (tag.burned || tag.litmQolId))) {
    throw new Error(`The contributed tag “${entry.name}” changed or is unavailable. Ask for it again before rolling.`);
  }
  return tag;
}

export function captureHelpBookkeeping(app, applied, values = {}) {
  const burns = [];
  const relationships = [];
  const fellowshipTags = new Map();
  const weaknesses = new Map();
  // Native resetTags awards Improve to the roller's own hindering theme tags.
  // Leave those themes to native bookkeeping rather than award a second mark.
  const nativeThemes = new Set((app.selectedTags ?? []).filter(tag =>
    tag.source !== "litm-qol-help" && tag.themebookId && (tag.weakness || tag.powerTag) && !tag.positive
  ).map(tag => tag.themebookId));
  for (const tag of applied) {
    // Native ordinary rolls carry the shared source separately from Hero tags.
    // Snapshot only invoked power tags, including powers inverted to hinder.
    if (tag.source === "fellowship-themecard" && tag.powerTag) {
      const card = game.actors.get(app.actor.system?.actorSharedSingleThemecardId) ?? app.actor.sheet?.getActorFellowshipThemecard?.();
      const entry = { actorId: card?.id, source: "fellowship-theme", index: tag.index, name: tag.name };
      const source = requireSource(card, entry);
      if (source.burned) throw new Error("A selected Fellowship power is scratched. Refresh the selection before rolling.");
      fellowshipTags.set(`${entry.actorId}:${entry.index}`, entry);
      continue;
    }
    if (tag.source === "litm-qol-fellowship") {
      const entry = { actorId: tag.helperActorId, source: "fellowship-theme", index: tag.helperTagIndex, name: tag.originalName };
      const source = requireSource(game.actors.get(entry.actorId), entry);
      if (source.burned || tag.toBurn) throw new Error("A Fellowship theme tag is no longer available. Review the group contributions again.");
      fellowshipTags.set(`${entry.actorId}:${entry.index}`, entry);
      continue;
    }
    if (tag.source !== "litm-qol-help") continue;
    if (tag.helperTagSource === "relationship") {
      const entry = { actorId: tag.helperActorId, source: "relationship", index: tag.helperTagIndex,
        name: tag.originalName, companion: tag.helperCompanion ?? "" };
      const relationship = requireSource(game.actors.get(entry.actorId), entry);
      if (relationship.scratched || tag.toBurn) throw new Error(`The relationship “${entry.name}” is scratched or cannot be burned. Request another contribution.`);
      relationships.push(entry);
    }
    if (tag.helperContributionBurn && tag.toBurn && !tag.helperTagSingleUse) {
      const entry = { actorId: tag.helperActorId, source: tag.helperTagSource,
        itemId: tag.helperTagItemId, index: tag.helperTagIndex, name: tag.originalName };
      requireSource(game.actors.get(entry.actorId), entry, { burning: true });
      burns.push(entry);
    }
    if (tag.weakness && !tag.positive) {
      const entry = { actorId: tag.helperActorId, itemId: tag.helperThemebookId,
        source: "weakness", index: tag.helperWeaknessIndex, name: tag.originalName };
      requireSource(game.actors.get(entry.actorId), entry);
      if (entry.actorId !== app.actor.id || !nativeThemes.has(entry.itemId)) {
        weaknesses.set(`${entry.actorId}:${entry.itemId}`, entry);
      }
    }
  }
  for (const selection of values._litmQolFumblingSelections ?? []) {
    const actor = game.actors.get(selection.actorId) ?? (selection.actorId === app.actor.id ? app.actor : null);
    requireSource(actor, selection);
    if (!hasQuintessence(actor, "Fumbling Master")) throw new Error("Fumbling Master is no longer on the weakness owner's sheet.");
    weaknesses.set(`${selection.actorId}:${selection.itemId}`, { ...selection, fumblingMaster: true });
  }
  if (burns.length && applied.filter(tag => tag.toBurn).length > 1) {
    throw new Error("Only one tag may be burned in a Group Action. Clear the extra burn before rolling.");
  }
  return { burns, weaknesses: [...weaknesses.values()], relationships, fellowshipTags: [...fellowshipTags.values()] };
}

// Run through the same serialized GM operation as single-use cleanup. Store
// each receipt in the SAME document update as its effect, so a failed message
// update or retry after reload cannot award Improve twice.
export async function applyHelpBookkeeping(message, context) {
  for (const [kind, entries] of [["burn", context.help?.burns ?? []], ["improve", context.help?.weaknesses ?? []], ["scratch", context.help?.relationships ?? []], ["scratchFellowship", context.help?.fellowshipTags ?? []]]) {
    for (const entry of entries) {
      const actor = game.actors.get(entry.actorId);
      if (!actor || !(game.user.isGM || actor.testUserPermission(game.user, "OWNER"))) {
        throw new Error("An active Narrator is required to update the contributing Hero.");
      }
      const doc = ["floating", "relationship", "fellowship-theme"].includes(entry.source) ? actor : actor.items.get(entry.itemId);
      if (!doc) throw new Error(`The source of “${entry.name}” no longer exists. Ask the Narrator to check it.`);
      const receipt = `${context.id}:${kind}:${entry.source}:${entry.index}`;
      const ledger = clone(doc.getFlag(MODULE_ID, LEDGER) ?? []);
      if (ledger.includes(receipt)) continue;
      const change = {};
      // An already burned tag is safe to mark again; it may have been burned
      // by native cleanup if two players share the same character.
      requireSource(actor, entry);
      if (kind === "scratch") {
        const fellowships = clone(actor.system.fellowships);
        Object.assign(fellowships[entry.index], { scratched: true, selected: false });
        change["system.fellowships"] = fellowships;
      } else if (kind === "scratchFellowship") {
        const tags = clone(actor.system.powertags);
        Object.assign(tags[entry.index], { burned: true, selected: false, toBurn: false });
        change["system.powertags"] = tags;
      } else if (kind === "burn") {
        const field = entry.source === "floating" ? "floatingTagsAndStatuses" : entry.source === "backpack" ? "items" : "powertags";
        const tags = clone(doc.system[field]);
        Object.assign(tags[entry.index], { burned: true, selected: false, toBurn: false });
        change[`system.${field}`] = tags;
      } else {
        if (entry.fumblingMaster && !hasQuintessence(actor, "Fumbling Master")) {
          throw new Error("Fumbling Master is no longer on the weakness owner's sheet.");
        }
        const total = Number(doc.system.improve ?? 0) + (entry.fumblingMaster ? 2 : 1);
        change["system.improve"] = usesDiligentTrack(doc) ? total : Math.min(3, total);
        if (entry.fumblingMaster && !usesDiligentTrack(doc) && total > 3) {
          change[`flags.${MODULE_ID}.${FUMBLING_OVERFLOW}`] = Math.max(0, Number(doc.getFlag(MODULE_ID, FUMBLING_OVERFLOW)) || 0) + total - 3;
        }
      }
      ledger.push(receipt);
      change[`flags.${MODULE_ID}.${LEDGER}`] = ledger;
      await doc.update(change);
    }
  }
}
