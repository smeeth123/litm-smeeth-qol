/** Reduce every marked tier by the same amount, retaining the tracking card. */
export function reducedStatus(status, tiers) {
  const amount = Math.min(6, Math.max(0, Math.trunc(Number(tiers)) || 0));
  const old = Array.isArray(status.markings) ? status.markings.slice(0, 6) : Array(6).fill(false);
  const markings = Array(6).fill(false);
  for (let index = 0; index < old.length; index++) if (old[index] && index >= amount) markings[index - amount] = true;
  return { ...status, markings, value: markings.lastIndexOf(true) + 1, selected: false };
}
