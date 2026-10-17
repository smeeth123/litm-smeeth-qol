const PATCHED = Symbol.for("litm-smeeth-qol.characterScroll");
const pending = new WeakMap();
const TABS = ["character", "other", "biography", "notes"];

export function installCharacterScroll(CharacterSheet) {
  const proto = CharacterSheet.prototype;
  if (proto[PATCHED]) return;
  const configure = proto._configureRenderParts;
  proto._configureRenderParts = function(options) {
    const parts = configure.call(this, options);
    for (const id of TABS) {
      if (parts[id]) parts[id].scrollable = [...new Set(["", ...(parts[id].scrollable ?? [])])];
    }
    return parts;
  };
  // The system's older action-based cache persists between renders and can
  // reapply an unrelated action's position in a later animation frame. Core
  // now snapshots the actual scroll root afresh for every replaced part.
  proto._saveScrollPositions = function() {};
  proto._restoreScrollPositions = function() {};

  const sync = proto._syncPartState;
  proto._syncPartState = function(partId, element, prior, state) {
    const result = sync.call(this, partId, element, prior, state);
    if (state.scrollPositions?.length) {
      const records = pending.get(this) ?? new Map();
      records.set(partId, { element, positions: state.scrollPositions.map(position => [...position]) });
      pending.set(this, records);
    }
    return result;
  };
  Object.defineProperty(proto, PATCHED, { value: true });
}

export function finishCharacterScroll(app) {
  const records = pending.get(app);
  if (!records) return;
  pending.delete(app);
  // Module controls are inserted by render hooks after core restores scroll.
  // Reapply before the next paint so temporarily shorter content cannot clamp
  // a near-bottom position. No delayed frame may override subsequent scrolling.
  queueMicrotask(() => {
    if (!app.rendered) return;
    for (const { element, positions } of records.values()) {
      if (!element.isConnected || !app.element?.contains(element)) continue;
      for (const [selector, top, left] of positions) {
        const target = selector === "" ? element : element.querySelector(selector);
        if (!target) continue;
        const behavior = target.style.getPropertyValue("scroll-behavior");
        const priority = target.style.getPropertyPriority("scroll-behavior");
        target.style.setProperty("scroll-behavior", "auto", "important");
        target.scrollTop = top; target.scrollLeft = left;
        if (behavior) target.style.setProperty("scroll-behavior", behavior, priority);
        else target.style.removeProperty("scroll-behavior");
      }
    }
  });
}
Hooks.on("renderApplicationV2", finishCharacterScroll);
Hooks.once("ready", async () => {
  if (game.system.id !== "mist-engine-fvtt") return;
  try {
    const { MistEngineLegendInTheMistCharacterSheet } = await import("/systems/mist-engine-fvtt/module/sheets/litm-character-sheet.mjs");
    installCharacterScroll(MistEngineLegendInTheMistCharacterSheet);
  } catch (error) {
    console.error("litm-smeeth-qol | Character sheet scroll preservation failed.", error);
    ui.notifications.error("Smeeth’s QoL could not initialize character-sheet scroll preservation. See the console for details.");
  }
});
