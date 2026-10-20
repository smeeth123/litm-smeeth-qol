import { hasQuintessence } from "./quintessence-automation.mjs";

const MODULE_ID = "litm-smeeth-qol";
const SYSTEM_ID = "mist-engine-fvtt";
const cards = new Map();
const normalize = name => String(name ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const makeRoot = html => { const root = document.createElement("div"); root.innerHTML = html; return root; };

const LUCKY = { key: "luckyBastard", name: "Lucky Bastard", slug: "lucky-bastard", min: -Infinity, max: 6, target: 7, from: -1, outcome: 0, suffix: "neutral", heading: "7–9", excludeOnes: true };
const VIRTUOSO = { key: "virtuoso", name: "Virtuoso", slug: "virtuoso", min: 7, max: 9, target: 10, from: 0, outcome: 1, suffix: "positive", heading: "10+" };

export const luckyBastardRoll = message => featureRoll(message, LUCKY);
export const virtuosoRoll = message => featureRoll(message, VIRTUOSO);

function featureRoll(message, feature) {
  const context = message.getFlag(MODULE_ID, "rollContext");
  if (!["quick", "detailed", "reaction"].includes(context?.rollType)) return null;
  const root = makeRoot(message.content);
  // Existing cards predate the structured dice snapshot. Read their native
  // dice tooltip only when it contains exactly the two original d6 results.
  const dice = context.roll?.dice ?? [...root.querySelectorAll(".dice-tooltip .die.d6")].map(node => Number(node.textContent.trim()));
  const text = root.querySelector(".dice-total")?.textContent.trim();
  const total = message.getFlag(MODULE_ID, "virtuoso")?.total ?? message.getFlag(MODULE_ID, "luckyBastard")?.total ?? context.roll?.total ?? (text ? Number(text) : NaN);
  if (!Number.isFinite(total) || total < feature.min || total > feature.max || dice.length !== 2
      || dice.some(die => !Number.isInteger(die) || die < 1 || die > 6)
      || (feature.excludeOnes && dice.every(die => die === 1))) return null;
  const state = message.getFlag(SYSTEM_ID, "detailedSpend");
  if (state ? state.consequenceResult !== feature.from : !root.querySelector(`.consequence-result-${feature.from < 0 ? "negative" : "neutral"}`)) return null;
  return { actorId: context.actorId, type: context.rollType, total, dice };
}

function featureItem(actor, feature) {
  if (!hasQuintessence(actor, feature.name)) return null;
  return actor.items.find(item => item.type === "quintessence" && normalize(item.name) === normalize(feature.name));
}

function replaceTotal(html, originalTotal, feature) {
  const root = makeRoot(html);
  const total = root.querySelector(".dice-total");
  if (!total) throw new Error("The original roll total could not be found on this card.");
  total.textContent = String(feature.target);
  total.dataset.tooltip = `${feature.name}: original total ${originalTotal}, treated as ${feature.target}.`;
  root.querySelectorAll(`.litm-qol-${feature.slug}-note`).forEach(note => note.remove());
  const note = document.createElement("p"); note.className = `litm-qol-${feature.slug}-note`;
  note.textContent = `${feature.name}: ${originalTotal} treated as ${feature.target}. Used this session.`;
  total.closest(".dice-roll")?.after(note);
  return root.innerHTML;
}

/** Runs inside the existing serialized GM operation queue. Reserve the use
 * before updating chat; a failed chat write can retry the same reservation. */
export const applyLuckyBastard = (payload, user, renderer) => applyFeature(payload, user, renderer, LUCKY);
export const applyVirtuoso = (payload, user, renderer) => applyFeature(payload, user, renderer, VIRTUOSO);

async function applyFeature(payload, user, renderDetailedCard, feature) {
  const message = await fromUuid(payload.messageUuid);
  if (!message || !(user?.isGM || (message.author?.id ?? message.user?.id) === user?.id)) {
    throw new Error(`Only the roller or GM can use ${feature.name} on this card.`);
  }
  if (message.getFlag(MODULE_ID, feature.key)) return true;
  const roll = featureRoll(message, feature);
  const actor = roll && game.actors.get(roll.actorId);
  const item = actor && featureItem(actor, feature);
  if (!item || !(user.isGM || actor.testUserPermission(user, "OWNER"))) {
    throw new Error(`This roll has no eligible ${feature.name} owner.`);
  }
  const reservation = item.getFlag(MODULE_ID, `${feature.key}Message`);
  if (item.getFlag(MODULE_ID, "usedThisSession") && reservation !== message.uuid) {
    throw new Error(`${feature.name} has already been used this session.`);
  }
  const update = {};
  const savedState = message.getFlag(SYSTEM_ID, "detailedSpend");
  const state = savedState ? foundry.utils.deepClone(savedState) : null;
  if (state) {
    state.consequenceResult = feature.outcome;
    state.diceRollHTML = replaceTotal(state.diceRollHTML, roll.total, feature);
    update.content = await renderDetailedCard(state);
    update[`flags.${SYSTEM_ID}.detailedSpend`] = state;
  } else {
    const root = makeRoot(replaceTotal(message.content, roll.total, feature));
    const result = root.querySelector(`.consequence-result-${feature.from < 0 ? "negative" : "neutral"}`);
    result.className = `consequence-result-${feature.suffix}`;
    const heading = result.querySelector(".heading");
    if (heading) heading.innerHTML = `<i class="consequence-result-icon ${feature.suffix}"></i>${feature.heading}`;
    const description = result.querySelector("p");
    if (description) description.textContent = game.i18n.localize(`MIST_ENGINE.MOVES.LEGEND.${roll.type}.${feature.suffix}`);
    update.content = root.innerHTML;
  }
  update[`flags.${MODULE_ID}.${feature.key}`] = { originalTotal: roll.total, total: feature.target, itemId: item.id, userId: user.id };
  await item.update({ [`flags.${MODULE_ID}.usedThisSession`]: true,
    [`flags.${MODULE_ID}.${feature.key}Message`]: message.uuid });
  await message.update(update);
  return true;
}

export const renderLuckyBastard = (message, root, use) => renderFeature(message, root, use, LUCKY);
export const renderVirtuoso = (message, root, use) => renderFeature(message, root, use, VIRTUOSO);

function renderFeature(message, root, use, feature) {
  root.querySelector(`.litm-qol-${feature.slug}-button`)?.remove();
  if (message.getFlag(MODULE_ID, feature.key)) return;
  const roll = featureRoll(message, feature);
  const actor = roll && game.actors.get(roll.actorId);
  if (!actor || !featureItem(actor, feature) || !(game.user.isGM || (message.isAuthor && actor.isOwner))) return;
  const button = document.createElement("button"); button.type = "button";
  button.className = `litm-qol-${feature.slug}-button`;
  let busy = false;
  const refresh = () => {
    if (message.getFlag(MODULE_ID, feature.key)) {
      button.remove(); cards.delete(`${message.uuid}:${feature.key}`); return;
    }
    const item = featureItem(actor, feature);
    const used = item?.getFlag(MODULE_ID, "usedThisSession") === true;
    const retry = used && item.getFlag(MODULE_ID, `${feature.key}Message`) === message.uuid;
    button.disabled = busy || !item || (used && !retry);
    button.textContent = used && !retry ? `${feature.name} — used this session` : retry ? `Retry ${feature.name} → ${feature.target}` : `Use ${feature.name} → ${feature.target}`;
    button.title = `Once per session: treat this result as ${feature.target}.${feature.excludeOnes ? " Double ones cannot use Lucky Bastard." : ""}`;
  };
  button.addEventListener("click", async () => {
    if (busy || button.disabled) return;
    busy = true; refresh();
    try { await use({ action: feature.key, messageUuid: message.uuid }); }
    catch (error) { ui.notifications.error(error.message || `Could not use ${feature.name}. Try again.`); }
    finally { busy = false; refresh(); }
  });
  refresh();
  (root.querySelector(".roll-card") ?? root).append(button);
  cards.set(`${message.uuid}:${feature.key}`, { root, actorId: actor.id, refresh });
}

Hooks.on("updateItem", item => {
  if (item.type !== "quintessence") return;
  for (const [id, card] of cards) {
    if (!card.root.isConnected) cards.delete(id);
    else if (card.actorId === item.parent?.id) card.refresh();
  }
});
