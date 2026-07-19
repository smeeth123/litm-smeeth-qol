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

export async function awardPromise(actor, amount) {
  if (!actor || !["character", "litm-character"].includes(actor.type)) return null;
  const result = promiseProjection(actor, amount);
  await actor.update({
    "system.promises": result.after,
    [`flags.${MODULE_ID}.${PROMISE_OVERFLOW_FLAG}`]: result.overflowAfter
  });
  return result;
}

export async function completeMomentOfFulfillment(actor) {
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
  foundry.utils.setProperty(changes, "system.promises", 5);
  const requestedOverflow = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.${PROMISE_OVERFLOW_FLAG}`);
  const overflow = requestedOverflow == null ? storedPromise(actor) : nonnegativeInteger(requestedOverflow);
  foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${PROMISE_OVERFLOW_FLAG}`, overflow + requested - 5);
});
