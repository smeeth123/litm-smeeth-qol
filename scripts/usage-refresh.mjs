import { SPECIAL_USES, specialImprovementPeriod } from "./circumstance-improvements.mjs";
import { isTrackedUsageQuintessence } from "./quintessence-usage.mjs";
const MODULE_ID = "litm-smeeth-qol";
const isHero = actor => ["character", "litm-character"].includes(actor?.type);
const isCard = actor => actor?.type === "litm-fellowship-themecard";
let refreshOperation;
let opening = false;
export const configureUsageRefresh = operation => { refreshOperation = operation; };

export function usageRefreshActors() {
  const users = [...game.users].filter(user => !user.isGM);
  const playerOwned = actor => users.some(user => actor.testUserPermission(user, "OWNER"));
  const targets = new Map();
  const add = actor => { if (actor) targets.set(actor.uuid ?? actor.id, actor); };
  const addHero = actor => {
    if (!isHero(actor) || !playerOwned(actor)) return;
    add(actor);
    const card = game.actors.get(actor.system.actorSharedSingleThemecardId);
    if (isCard(card)) add(card);
  };
  for (const actor of game.actors) {
    addHero(actor);
    if (isCard(actor) && playerOwned(actor)) add(actor);
  }
  // Include owned Heroes represented by unlinked tokens as well as world actors.
  for (const scene of game.scenes ?? []) for (const token of scene.tokens?.contents ?? []) if (token.actor?.isToken) addHero(token.actor);
  return [...targets.values()];
}

export function usageRefreshChanges(doc, period) {
  const changes = {};
  const applies = key => specialImprovementPeriod(key) === "scene"
    || (period === "session" && specialImprovementPeriod(key) === "session");
  for (const [key, used] of Object.entries(doc.getFlag(MODULE_ID, SPECIAL_USES) ?? {})) {
    if (used === true && applies(key)) changes[`flags.${MODULE_ID}.${SPECIAL_USES}.${key}`] = false;
  }
  for (const key of Object.keys(doc.getFlag(MODULE_ID, "specialImprovementMessages") ?? {})) {
    if (applies(key)) changes[`flags.${MODULE_ID}.specialImprovementMessages.-=${key}`] = null;
  }
  if (period === "session") {
    if (isTrackedUsageQuintessence(doc)) {
      if (doc.getFlag(MODULE_ID, "usedThisSession") === true) changes[`flags.${MODULE_ID}.usedThisSession`] = false;
      for (const flag of ["luckyBastardMessage", "virtuosoMessage"]) {
        if (doc.getFlag(MODULE_ID, flag) != null) changes[`flags.${MODULE_ID}.-=${flag}`] = null;
      }
    }
    for (const flag of ["catchMeWhenIFallMessage", "lessonsLearnedReroll", "deftRemedyReroll"]) {
      if (doc.getFlag(MODULE_ID, flag) != null) changes[`flags.${MODULE_ID}.-=${flag}`] = null;
    }
  }
  return changes;
}

export async function applyUsageRefresh(payload, user) {
  if (!game.user.isGM || !user?.isGM) throw new Error("Only the Narrator can refresh uses.");
  const period = payload.period;
  if (!["scene", "session"].includes(period)) throw new Error("Choose Scene Refresh or Session Refresh.");
  const actors = usageRefreshActors(), seen = new Set(), failures = [];
  let updated = 0;
  for (const actor of actors) for (const doc of [actor, ...(actor.items ?? [])]) {
    const id = doc.uuid ?? `${actor.id}:${doc.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const changes = usageRefreshChanges(doc, period);
    if (!Object.keys(changes).length) continue;
    try { await doc.update(changes); updated++; }
    catch (error) { failures.push(doc.name); console.error(`${MODULE_ID} | Could not refresh uses for ${doc.uuid}`, error); }
  }
  if (failures.length) throw new Error(`Some uses could not be refreshed: ${failures.join(", ")}. Try again.`);
  return { period, actors: actors.length, updated };
}

export async function openUsageRefresh() {
  if (!game.user.isGM || opening) return;
  opening = true;
  try {
    const period = await foundry.applications.api.DialogV2.wait({
      window: { title: "Refresh Uses" }, classes: ["litm-qol-system-dialog"],
      content: `<p>Refresh uses for player-owned Heroes and their Fellowship Themecards.</p><p><strong>Scene Refresh:</strong> reset once-per-scene uses.</p><p><strong>Session Refresh:</strong> reset once-per-scene and once-per-session uses.</p>`,
      buttons: [{ action: "cancel", label: "Cancel", callback: () => false },
        { action: "scene", label: "Scene Refresh", icon: "fa-solid fa-clapperboard", callback: () => "scene" },
        { action: "session", label: "Session Refresh", icon: "fa-solid fa-arrows-rotate", callback: () => "session" }], rejectClose: false
    });
    if (!["scene", "session"].includes(period)) return;
    const result = await refreshOperation(period);
    ui.notifications.info(`${period === "scene" ? "Scene" : "Session"} uses refreshed for ${result.actors} Heroes and Fellowship Themecards.`);
  } catch (error) { console.error(error); ui.notifications.error(error.message || "Could not refresh uses."); }
  finally { opening = false; }
}
Hooks.on("getSceneControlButtons", controls => {
  const tools = controls["mist-engine"]?.tools;
  if (!tools) return;
  tools.litm_qol_refresh_uses = { name: "litm_qol_refresh_uses", title: "Refresh Uses",
    icon: "fa-solid fa-arrows-rotate", order: 5, visible: game.user.isGM, button: true, onChange: () => openUsageRefresh() };
});
