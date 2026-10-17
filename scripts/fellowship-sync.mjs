const CARD_TYPE = "litm-fellowship-themecard";
const isHero = actor => ["character", "litm-character"].includes(actor?.type);
const pending = new Map();
const isOpen = app => app.rendered || (app.state != null &&
  app.state === foundry.applications.api.ApplicationV2.RENDER_STATES?.RENDERING);
const isCharacterSheet = app => isHero(app?.actor) && typeof app.loadFellowshipThemecard === "function";

function releaseNativeListener(sheet) {
  // Native registers this per-sheet listener only in the constructor, then
  // removes it on close. One client-level listener covers reopen as well.
  if (sheet._fellowshipUpdateHookId != null) {
    Hooks.off("updateActor", sheet._fellowshipUpdateHookId);
    sheet._fellowshipUpdateHookId = null;
  }
}

export function trackFellowshipSheet(sheet) {
  if (isCharacterSheet(sheet)) releaseNativeListener(sheet);
}

function queueRefresh(sheet) {
  const queued = pending.get(sheet);
  if (queued) { queued.dirty = true; return queued.done; }
  const state = { dirty: true };
  pending.set(sheet, state);
  state.done = Promise.resolve().then(async () => {
    // Coalesce a burst; if another change arrives during rendering, render
    // again afterward rather than dropping the newest shared state.
    try {
      while (state.dirty && isOpen(sheet)) {
        state.dirty = false;
        const id = sheet.actor.system.actorSharedSingleThemecardId;
        sheet.actorFellowshipThemecard = id ? game.actors.get(id) ?? null : null;
        await sheet.render({ force: false });
      }
    } finally { pending.delete(sheet); }
  }).catch(error => console.error("litm-smeeth-qol | Fellowship sheet refresh failed.", error));
  return state.done;
}

export function refreshFellowshipSheets(actor, changes = {}) {
  const isCard = actor?.type === CARD_TYPE;
  const isRelink = isHero(actor) && (Object.hasOwn(changes, "system.actorSharedSingleThemecardId") ||
    Object.hasOwn(changes.system ?? {}, "actorSharedSingleThemecardId"));
  if (!isCard && !isRelink) return Promise.resolve();
  const jobs = [];
  for (const app of foundry.applications.instances.values()) {
    if (!isOpen(app) || !isCharacterSheet(app)) continue;
    const linkedId = app.actor.system.actorSharedSingleThemecardId;
    if (isCard ? linkedId !== actor.id && app.actorFellowshipThemecard?.id !== actor.id : app.actor.id !== actor.id) continue;
    releaseNativeListener(app);
    jobs.push(queueRefresh(app));
  }
  return Promise.all(jobs);
}

Hooks.on("renderApplicationV2", trackFellowshipSheet);
Hooks.on("renderActorSheet", trackFellowshipSheet);
// Document changes are already broadcast by Foundry. Run on every client;
// no socket round-trip, ownership requirement, or additional document write.
Hooks.on("updateActor", refreshFellowshipSheets);
Hooks.on("createActor", actor => refreshFellowshipSheets(actor));
Hooks.on("deleteActor", actor => refreshFellowshipSheets(actor));
