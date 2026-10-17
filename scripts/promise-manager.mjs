import { importSystemModule } from "./system-imports.mjs";
export const MODULE_ID = "litm-smeeth-qol";
export const PROMISE_OVERFLOW_FLAG = "promiseOverflow";

function nonnegativeInteger(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

export function storedPromise(actor) {
  return nonnegativeInteger(actor?.getFlag?.(MODULE_ID, PROMISE_OVERFLOW_FLAG));
}

export function promiseProjection(actor, amount) {
  const rawVisible = nonnegativeInteger(actor?.system?.promises);
  const before = Math.min(5, rawVisible);
  const overflowBefore = storedPromise(actor) + Math.max(0, rawVisible - 5);
  const earned = nonnegativeInteger(amount);
  const visibleGain = Math.min(Math.max(0, 5 - before), earned);
  const overflowGain = earned - visibleGain;
  return {
    before,
    after: before + visibleGain,
    earned,
    visibleGain,
    overflowBefore,
    overflowGain,
    overflowAfter: overflowBefore + overflowGain
  };
}

async function applyAward(actor, amount) {
  if (!actor || !["character", "litm-character"].includes(actor.type)) return null;
  const result = promiseProjection(actor, amount);
  await actor.update({
    "system.promises": result.after,
    [`flags.${MODULE_ID}.${PROMISE_OVERFLOW_FLAG}`]: result.overflowAfter
  });
  return result;
}

async function applyFulfillment(actor) {
  if (!actor || Number(actor.system?.promises ?? 0) < 5) return null;
  const queued = storedPromise(actor);
  const after = Math.min(5, queued);
  const overflowAfter = Math.max(0, queued - after);
  await actor.update({
    "system.promises": after,
    [`flags.${MODULE_ID}.${PROMISE_OVERFLOW_FLAG}`]: overflowAfter
  });
  return { spent: 5, after, overflowBefore: queued, overflowAfter };
}

Hooks.on("preUpdateActor", (actor, changes) => {
  if (!["character", "litm-character"].includes(actor?.type)) return;
  if (!foundry.utils.hasProperty(changes, "system.promises")) return;
  const requested = nonnegativeInteger(foundry.utils.getProperty(changes, "system.promises"));
  if (requested <= 5) return;
  if (Object.hasOwn(changes, "system.promises")) changes["system.promises"] = 5;
  else foundry.utils.setProperty(changes, "system.promises", 5);
  const requestedOverflow = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.${PROMISE_OVERFLOW_FLAG}`);
  const overflow = requestedOverflow == null ? storedPromise(actor) : nonnegativeInteger(requestedOverflow);
  const overflowKey = `flags.${MODULE_ID}.${PROMISE_OVERFLOW_FLAG}`;
  if (Object.hasOwn(changes, overflowKey)) changes[overflowKey] = overflow + requested - 5;
  else foundry.utils.setProperty(changes, overflowKey, overflow + requested - 5);
});

const queues = new Map();
let promiseSocket;
const isHero = actor => ["character", "litm-character"].includes(actor?.type);

async function applyManualRemoval(actor) {
  const before = nonnegativeInteger(actor.system.promises);
  const overflowBefore = storedPromise(actor);
  const total = Math.max(0, before + overflowBefore - 1);
  const after = Math.min(5, total);
  const overflowAfter = Math.max(0, total - after);
  await actor.update({ "system.promises": after, [`flags.${MODULE_ID}.${PROMISE_OVERFLOW_FLAG}`]: overflowAfter });
  return { before, after, overflowBefore, overflowAfter };
}

export function runPromiseOperation(payload, senderId = game.user.id) {
  const key = payload.actorUuid;
  const operation = (queues.get(key) ?? Promise.resolve()).then(async () => {
    const user = game.users.get(senderId);
    const actor = typeof key === "string" ? await fromUuid(key) : null;
    if (!isHero(actor) || !(user?.isGM || actor.testUserPermission(user, "OWNER"))) {
      throw new Error("You do not have permission to change this Hero’s Promise.");
    }
    if (payload.action === "award") {
      if (!Number.isSafeInteger(payload.amount) || payload.amount < 0) throw new Error("Promise awards must be nonnegative whole numbers.");
      return applyAward(actor, payload.amount);
    }
    if (payload.action === "remove") return applyManualRemoval(actor);
    if (payload.action === "fulfill") return applyFulfillment(actor);
    throw new Error("Unknown Promise operation.");
  });
  const tail = operation.catch(() => {});
  queues.set(key, tail);
  void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return operation;
}

async function dispatchPromise(actor, action, extra = {}) {
  if (!isHero(actor)) return null;
  const payload = { actorUuid: actor.uuid, action, ...extra };
  const gm = game.users.activeGM;
  if (gm && gm.id !== game.user.id) {
    if (!promiseSocket) throw new Error("Socketlib is not ready. Reload the client and try again.");
    return promiseSocket.executeAsUser("promiseOperation", gm.id, payload);
  }
  return runPromiseOperation(payload);
}

export function awardPromise(actor, amount) {
  return dispatchPromise(actor, "award", { amount: nonnegativeInteger(amount) });
}

export function completeMomentOfFulfillment(actor) {
  return dispatchPromise(actor, "fulfill");
}

export function adjustManualPromise(actor, delta) {
  if (delta === 1) return dispatchPromise(actor, "award", { amount: 1 });
  if (delta === -1) return dispatchPromise(actor, "remove");
  return Promise.reject(new Error("Manual Promise changes must be +1 or −1."));
}

export function registerPromiseSocket(api = socketlib) {
  promiseSocket = api.registerModule(MODULE_ID);
  promiseSocket.register("promiseOperation", function(payload) {
    return runPromiseOperation(payload, this.socketdata.userId);
  });
}
Hooks.once("socketlib.ready", () => registerPromiseSocket());

const MANUAL_PATCH = Symbol.for(`${MODULE_ID}.manualPromise`);
export function installManualPromiseClicks(CharacterSheet) {
  const proto = CharacterSheet.prototype;
  if (proto[MANUAL_PATCH]) return;
  for (const [method, delta] of [["handleFellowshipPromiseClick", 1], ["handleFellowshipPromiseRightClick", -1]]) {
    proto[method] = async function(event) {
      event.preventDefault();
      try { return await adjustManualPromise(this.actor, delta); }
      catch (error) {
        console.error(`${MODULE_ID} | Manual Promise change failed.`, error);
        ui.notifications.error(error.message || "The Promise change could not be saved.");
      }
    };
  }
  Object.defineProperty(proto, MANUAL_PATCH, { value: true });
}

export function decoratePromiseTracker(app, root) {
  if (!isHero(app?.actor) || !root?.querySelectorAll) return;
  const overflow = storedPromise(app.actor);
  for (const tracker of root.querySelectorAll(".fellowship-promises-container")) {
    tracker.querySelector(".litm-qol-promise-overflow")?.remove();
    tracker.dataset.tooltip = `Left-click: add 1 Promise. Right-click: remove 1, from stored Promise first. ${overflow} stored for after a Moment of Fulfillment.`;
    if (!overflow) continue;
    const badge = document.createElement("span");
    badge.className = "litm-qol-promise-overflow";
    badge.textContent = ` (+${overflow} stored)`;
    (tracker.querySelector(".fellowship-promises-label") ?? tracker).append(badge);
  }
}
Hooks.on("renderApplicationV2", decoratePromiseTracker);
Hooks.on("renderActorSheet", decoratePromiseTracker);
Hooks.once("ready", async () => {
  if (game.system.id !== "mist-engine-fvtt") return;
  try {
    const { MistEngineLegendInTheMistCharacterSheet } = await importSystemModule("sheets/litm-character-sheet.mjs");
    installManualPromiseClicks(MistEngineLegendInTheMistCharacterSheet);
  } catch (error) {
    console.error(`${MODULE_ID} | Manual Promise integration failed.`, error);
    ui.notifications.error("Smeeth’s QoL could not initialize manual Promise controls. See the console for details.");
  }
});
