import { hasQuintessence } from "./quintessence-automation.mjs";

const MODULE_ID = "litm-smeeth-qol";
export const DILIGENT_FLAG = "diligentImprovements";
const PATCHED = Symbol.for(`${MODULE_ID}.diligentDrudge`);
const markQueues = new Map();

export function hasDiligentDrudge(actor) {
  return hasQuintessence(actor, "Diligent Drudge");
}

export function usesDiligentTrack(theme) {
  return theme?.type === "themebook" && !theme.system?.options?.isStoryTheme
    && hasDiligentDrudge(theme.parent);
}

export function pendingDiligentImprovements(theme) {
  return Math.max(0, Math.floor(Number(theme?.getFlag?.(MODULE_ID, DILIGENT_FLAG)) || 0));
}

export function canImproveTheme(theme) {
  return pendingDiligentImprovements(theme) > 0
    || (!usesDiligentTrack(theme) && Number(theme.system?.improve ?? 0) >= 3);
}

/** Award and reset in the same document update as the fifth mark. */
export function applyDiligentAward(theme, changes) {
  if (!usesDiligentTrack(theme)) return;
  const next = changes["system.improve"] ?? changes.system?.improve;
  if (!Number.isInteger(next) || next < 5 || next <= Number(theme.system.improve ?? 0)) return;
  const cycles = Math.floor(next / 5);
  if (Object.hasOwn(changes, "system.improve")) changes["system.improve"] = next % 5;
  else changes.system.improve = next % 5;
  foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${DILIGENT_FLAG}`,
    pendingDiligentImprovements(theme) + 2 * cycles);
}

/** Native resetTags caps weakness-earned Improve at three. Extend only the
 * personal themes which it would skip, preserving its tag/reset behavior. */
export function installDiligentRolls(DiceRollApp) {
  const proto = DiceRollApp.prototype;
  if (proto[PATCHED]) return;
  const original = proto.resetTags;
  proto.resetTags = async function(...args) {
    const skipped = [...this.actor.items].filter(theme => usesDiligentTrack(theme)
      && Number(theme.system.improve ?? 0) >= 3
      && this.selectedTags.some(tag => tag.themebookId === theme.id
        && (tag.weakness || tag.powerTag) && !tag.positive))
      .map(theme => ({ theme, marks: Number(theme.system.improve) }));
    const result = await original.apply(this, args);
    for (const { theme, marks } of skipped) {
      if (usesDiligentTrack(theme) && Number(theme.system.improve) === marks) {
        await theme.update({ "system.improve": marks + 1 });
      }
    }
    return result;
  };
  Object.defineProperty(proto, PATCHED, { value: true });
}

export function renderDiligentTracks(actor, root) {
  if (!actor || !root) return;
  for (const track of root.querySelectorAll('.development-partial-container[data-value-key="system.improve"]')) {
    if (track.dataset.source === "fellowship-themecard") continue;
    const theme = actor.items?.get(track.dataset.itemId);
    if (!usesDiligentTrack(theme)) continue;
    const count = Number(theme.system.improve ?? 0);
    for (const old of track.querySelectorAll(".marker")) old.remove();
    track.querySelector(".litm-qol-diligent-markers")?.remove();
    track.classList.add("litm-qol-diligent-track");
    const markers = document.createElement("span");
    markers.className = "litm-qol-diligent-markers";
    for (let i = 0; i < 5; i++) {
      const marker = document.createElement("i");
      marker.className = `marker fa-solid fa-circle${i < count ? " checked" : ""}`;
      markers.append(marker);
    }
    track.prepend(markers);
    track.dataset.tooltip = "Diligent Drudge: five Improve marks earn two improvements for this theme and reset this track.";
    if (track.dataset.litmQolDiligentBound) continue;
    track.dataset.litmQolDiligentBound = "true";
    track.addEventListener("click", event => {
      if (!usesDiligentTrack(theme)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!actor.isOwner && !game.user.isGM) return;
      const key = theme.uuid ?? `${actor.id}:${theme.id}`;
      const previous = markQueues.get(key) ?? Promise.resolve();
      const next = previous.then(() => {
        if (!usesDiligentTrack(theme)) return;
        return theme.update({ "system.improve": Number(theme.system.improve ?? 0) + 1 });
      }).catch(error => {
        console.error(`${MODULE_ID} | Could not mark Diligent Drudge Improve`, error);
        ui.notifications.error("Could not mark Improve. See the console for details.");
      }).finally(() => { if (markQueues.get(key) === next) markQueues.delete(key); });
      markQueues.set(key, next);
    }, { capture: true });
  }
}

// An Improve update can arrive while the sheet is already rendering its tag
// cleanup. Foundry may coalesce that render request with the older one. Paint
// from the current document both now and after the pending render completes.
export async function refreshDiligentSheet(actor) {
  const sheet = actor?.sheet;
  if (!sheet?.rendered) return;
  renderDiligentTracks(actor, sheet.element);
  await sheet.render(false);
  renderDiligentTracks(actor, sheet.element);
}

Hooks.on("preUpdateItem", applyDiligentAward);
for (const event of ["createItem", "deleteItem"]) {
  Hooks.on(event, item => {
    if (item.type === "quintessence" && item.parent?.sheet?.rendered) item.parent.sheet.render(false);
  });
}
Hooks.on("updateItem", (item, changes) => {
  if (changes["system.improve"] !== undefined || changes.system?.improve !== undefined
      || changes.flags?.[MODULE_ID]?.[DILIGENT_FLAG] !== undefined
      || changes[`flags.${MODULE_ID}.${DILIGENT_FLAG}`] !== undefined
      || item.type === "quintessence") {
    void refreshDiligentSheet(item.parent).catch(error => {
      console.error(`${MODULE_ID} | Could not refresh Improve marks`, error);
    });
  }
});
