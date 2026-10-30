import { applySkillBookkeeping } from "./skill-improvements.mjs";
import { themeTitle } from "./theme-title.mjs";
import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { importSystemModule } from "./system-imports.mjs";
import { hasQuintessence } from "./quintessence-automation.mjs";
const MODULE_ID = "litm-smeeth-qol", SYSTEM_ID = "mist-engine-fvtt";
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const clone = value => foundry.utils.deepClone(value);
const has = (theme, name) => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === normalize(name));
const rootFor = html => { const root = document.createElement("div"); root.innerHTML = html; return root; };
const mayUse = (message, user) => user?.isGM || (message.author?.id ?? message.user?.id) === user?.id;
const reservations = theme => theme.getFlag(MODULE_ID, "specialImprovementMessages") ?? {};
const available = (theme, key, message) => !specialUsed(theme, key) || reservations(theme)[key] === message.uuid;
const promptHistory = new Set();
const cards = new Map();
let DiceRollApp, pastSocket;

async function reconcileSkillReroll(message) {
  try { await applySkillBookkeeping(message, message.getFlag(MODULE_ID, "rollContext")); }
  catch (error) {
    await message.update({ [`flags.${MODULE_ID}.singleUseCleanupError`]: true }).catch(() => {});
    throw error;
  }
}
const rerollFeatures = {
  lessonsLearned: { name: "Lessons Learned", key: "lessons-learned", saved: "lessonsLearnedReroll" },
  deftRemedy: { name: "Deft Remedy", key: "deft-remedy", saved: "deftRemedyReroll" }
};
export function lessonsRoll(message, feature = "lessonsLearned") {
  if (message.getFlag(MODULE_ID, feature) || message.getFlag(MODULE_ID, "sacrificeConsequenceApplied")) return null;
  const context = message.getFlag(MODULE_ID, "rollContext"), sacrifice = message.getFlag(MODULE_ID, "nativeSacrifice");
  if (context?.group || (!sacrifice && !["quick", "detailed", "reaction"].includes(context?.rollType))) return null;
  if (feature === "deftRemedy" && sacrifice) return null;
  const root = rootFor(message.content), totalText = root.querySelector(".dice-total")?.textContent.trim();
  const total = totalText ? Number(totalText) : context?.roll?.total;
  const dice = context?.roll?.dice ?? [...root.querySelectorAll(".die.d6")].map(node => Number(node.textContent.trim()));
  if (!Number.isFinite(total) || total > 6 || dice?.length !== 2 || dice.some(die => !Number.isInteger(die) || die < 1 || die > 6)) return null;
  const actor = game.actors.get(context?.actorId ?? message.speaker?.actor);
  if (!actor) return null;
  return { actor, type: sacrifice ? "sacrifice" : context.rollType, total, dice, context, sacrifice };
}
export function lessonsThemes(message, actor, feature = "lessonsLearned") {
  const config = rerollFeatures[feature];
  return [...actor.items].filter(theme => has(theme, config.name) && available(theme, config.key, message)
    && (feature !== "deftRemedy" || message.getFlag(MODULE_ID, "rollContext")?.themeSources?.some(source => source.actorUuid === actor.uuid && source.itemId === theme.id)));
}
export async function applyLessonsLearned(payload, user, renderer) {
  const feature = payload.feature === "deftRemedy" ? "deftRemedy" : "lessonsLearned", config = rerollFeatures[feature];
  const message = await fromUuid(payload.messageUuid);
  if (!message || !mayUse(message, user)) throw new Error("Only the roller or GM can reroll this card.");
  if (message.getFlag(MODULE_ID, feature)) { await reconcileSkillReroll(message); return true; }
  const info = lessonsRoll(message, feature), actor = info?.actor;
  const theme = actor && lessonsThemes(message, actor, feature).find(theme => theme.uuid === payload.themeUuid);
  if (!theme || !(user.isGM || actor.testUserPermission(user, "OWNER"))) throw new Error(`${config.name} is not available for this roll.`);
  const state = clone(message.getFlag(SYSTEM_ID, "detailedSpend"));
  if (state?.entries?.length || state?.pushYourLuck) throw new Error("Undo this card’s Power spending and Push Your Luck before rerolling.");
  const saved = theme.getFlag(MODULE_ID, config.saved);
  let reroll;
  if (saved?.messageUuid === message.uuid) reroll = saved;
  else {
    const originalTotal = info.context?.roll?.total ?? info.total;
    const modifier = originalTotal - info.dice.reduce((sum, die) => sum + die, 0);
    const roll = new Roll(`2d6${modifier ? ` ${modifier < 0 ? "-" : "+"} ${Math.abs(modifier)}` : ""}`, actor.getRollData());
    await roll.evaluate();
    const dice = roll.terms[0].results.map(entry => entry.result);
    reroll = { messageUuid: message.uuid, total: roll.total, dice, html: await roll.render(), originalTotal, originalDice: info.dice };
    await theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.${config.key}`]: true,
      [`flags.${MODULE_ID}.specialImprovementMessages.${config.key}`]: message.uuid,
      [`flags.${MODULE_ID}.${config.saved}`]: reroll });
    if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true, null, false);
  }
  const isCritical = reroll.dice.every(die => die === 6);
  const isFumble = reroll.dice.every(die => die === 1) && !(info.type !== "reaction" && hasQuintessence(actor, "Beyond Luck"));
  let outcome = reroll.total >= 10 ? 1 : reroll.total >= 7 ? 0 : -1;
  if (info.type !== "sacrifice") { if (isCritical) outcome = 1; if (isFumble) outcome = -1; }
  let content;
  if (state) {
    Object.assign(state, { diceRollHTML: reroll.html, consequenceResult: outcome, isCritical, isFumble });
    content = await renderer(state);
  } else if (info.type === "sacrifice") {
    const level = info.sacrifice.level, lessened = { grave: "scarring", scarring: "painful", painful: "none" }[level];
    content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/sacrifice-result.hbs`, {
      diceRollHTML: reroll.html, levelLabel: game.i18n.localize(`MIST_ENGINE.SACRIFICE.Levels.${level}`),
      lessenedLabel: game.i18n.localize(`MIST_ENGINE.SACRIFICE.Levels.${lessened}`), isMiracle: outcome === 1, isFate: outcome === 0, isInVain: outcome < 0 });
  } else {
    const old = rootFor(message.content), counter = old.querySelector(".power-counter");
    let power = Number(counter?.textContent.match(/-?\d+/)?.[0] ?? 1);
    if (counter?.dataset.litmQolReactionBonusApplied === "true") power--;
    content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/${info.type}-result.hbs`, {
      label: old.querySelector(".card-title")?.textContent.trim() ?? "", diceRollHTML: reroll.html,
      positiveTags: [], negativeTags: [], consequenceResult: outcome, isCritical, isFumble, numPowerTags: power });
    const fresh = rootFor(content), title = fresh.querySelector(".card-title");
    for (const tags of old.querySelectorAll(".selected-tags")) title?.after(tags);
    if (info.type === "reaction" && outcome === 1) {
      const total = fresh.querySelector(".power-counter");
      if (total) { total.textContent = `Power: ${power + 1}`; total.dataset.litmQolReactionBonusApplied = "true"; total.dataset.tooltip = "Includes +1 bonus Power for a 10+ Reaction."; total.classList.add("litm-qol-traded-power-counter"); }
    }
    content = fresh.innerHTML;
  }
  const root = rootFor(content), note = document.createElement("p");
  note.textContent = `${config.name}: rerolled ${reroll.originalTotal} → ${reroll.total}. The new result stands.`;
  (root.querySelector(".roll-card") ?? root).append(note);
  const update = { content: root.innerHTML, [`flags.${MODULE_ID}.${feature}`]: { ...reroll, themeUuid: theme.uuid },
    [`flags.${MODULE_ID}.-=luckyBastard`]: null, [`flags.${MODULE_ID}.-=virtuoso`]: null, [`flags.${MODULE_ID}.-=catchMeWhenIFall`]: null, [`flags.${MODULE_ID}.-=adaptablePersona`]: null, [`flags.${MODULE_ID}.-=trustInLegacy`]: null };
  if (state) update[`flags.${SYSTEM_ID}.detailedSpend`] = state;
  if (info.context) update[`flags.${MODULE_ID}.rollContext`] = { ...clone(info.context), roll: { total: reroll.total, dice: reroll.dice } };
  if (info.sacrifice) update[`flags.${MODULE_ID}.nativeSacrifice`] = { ...info.sacrifice, lessened: outcome === 1 };
  await message.update(update);
  await reconcileSkillReroll(message);
  return true;
}

function vividEntries(message) {
  return message.getFlag(MODULE_ID, "rollContext")?.help?.vividMemory ?? [];
}
function vividSource(message, entry) {
  const actor = game.actors.get(entry.actorId), theme = actor?.items.get(entry.itemId);
  const done = message.getFlag(MODULE_ID, "vividMemoryDone")?.[`${entry.actorId}:${entry.itemId}`];
  return !done && has(theme, "Vivid Memory") && available(theme, "vivid-memory", message) ? { actor, theme } : null;
}
export async function applyVividMemory(payload, user) {
  const message = await fromUuid(payload.messageUuid);
  if (!message || !mayUse(message, user)) throw new Error("Only the roller or GM can use Vivid Memory.");
  const entry = vividEntries(message).find(entry => entry.itemId === payload.itemId && entry.actorId === payload.actorId);
  if (!entry) throw new Error("No invoked Vivid Memory choice was recorded for this theme.");
  if (message.getFlag(MODULE_ID, "vividMemoryDone")?.[`${entry.actorId}:${entry.itemId}`]) return true;
  const priorActor = game.actors.get(entry.actorId);
  const priorKey = `${message.id ?? message.uuid.replaceAll(".", "_")}:${entry.itemId}`;
  const priorReward = priorActor?.getFlag(MODULE_ID, "vividMemoryResults")?.[priorKey];
  if (priorReward && (game.user.isGM || priorActor.testUserPermission(user, "OWNER"))) {
    await message.update({ [`flags.${MODULE_ID}.vividMemoryDone.${entry.actorId}:${entry.itemId}`]: priorReward });
    return true;
  }
  const source = vividSource(message, entry);
  if (!source || !(game.user.isGM || source.actor.testUserPermission(user, "OWNER"))) throw new Error("Vivid Memory is no longer available.");
  const name = String(payload.name ?? "").trim();
  if (!name || name.length > 200 || !["tag", "status"].includes(payload.kind)) throw new Error("Enter a name and choose a story tag or emotional status.");
  const { actor, theme } = source, key = `${message.id ?? message.uuid.replaceAll(".", "_")}:${theme.id}`;
  await theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.vivid-memory`]: true,
    [`flags.${MODULE_ID}.specialImprovementMessages.vivid-memory`]: message.uuid });
  const results = clone(actor.getFlag(MODULE_ID, "vividMemoryResults") ?? {});
  if (!results[key]) {
    let tags = clone(actor.system.floatingTagsAndStatuses ?? []);
    const tag = { name, isStatus: payload.kind === "status", positive: true, value: payload.kind === "status" ? 2 : 0,
      markings: [false, payload.kind === "status", false, false, false, false], selected: false, burned: false, toBurn: false,
      description: String(payload.detail ?? "").trim() };
    if (tag.isStatus) {
      const { FloatingTagAndStatusAdapter } = await importSystemModule("lib/floating-tag-and-status-adapter.mjs");
      tags = FloatingTagAndStatusAdapter.withStatusStacked(tags, tag);
    } else tags.push(tag);
    results[key] = { kind: payload.kind, name, detail: tag.description };
    await actor.update({ "system.floatingTagsAndStatuses": tags, [`flags.${MODULE_ID}.vividMemoryResults`]: results });
  }
  await message.update({ [`flags.${MODULE_ID}.vividMemoryDone.${actor.id}:${theme.id}`]: results[key] });
  return true;
}
export async function promptVividMemoryForMessage(message, use, { automatic = false } = {}) {
  for (const entry of vividEntries(message)) {
    const source = vividSource(message, entry), key = `${message.uuid}:${entry.itemId}`;
    if (!source || (automatic && promptHistory.has(key))) continue;
    if (automatic) promptHistory.add(key);
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: "Vivid Memory" }, classes: ["litm-qol-system-dialog"],
      content: `<p>Discover or reveal a detail from your Past with the Narrator, then choose what your character gains.</p><label>Gain<select name="kind"><option value="tag">Story tag</option><option value="status">Emotional status — tier 2</option></select></label><label>Name<input name="name" type="text" maxlength="200"></label>`,
      buttons: [{ action: "cancel", label: "Cancel", callback: () => false }, { action: "create", label: "Create", callback: (_event, button) => ({
        kind: button.form.elements.kind.value, name: button.form.elements.name.value.trim() }) }], rejectClose: false
    });
    if (result?.name) await use({ messageUuid: message.uuid, actorId: entry.actorId, itemId: entry.itemId, ...result });
  }
}
export function renderPastActions(message, root, useLessons, useVivid) {
  root.querySelectorAll(".litm-qol-lessons-button,.litm-qol-vivid-button").forEach(button => button.remove());
  if (!mayUse(message, game.user)) return;
  const refresh = () => {
    for (const button of root.querySelectorAll(".litm-qol-lessons-button")) {
      const feature = button.dataset.rerollFeature, info = lessonsRoll(message, feature), themes = info && lessonsThemes(message, info.actor, feature);
      button.disabled = !themes?.length || Boolean(message.getFlag(SYSTEM_ID, "detailedSpend")?.entries?.length);
    }
    const vivid = root.querySelector(".litm-qol-vivid-button"); if (vivid) vivid.disabled = !vividEntries(message).some(entry => vividSource(message, entry));
  };
  for (const [feature, config] of Object.entries(rerollFeatures)) {
    const info = lessonsRoll(message, feature);
    if (!info || !lessonsThemes(message, info.actor, feature).length) continue;
    const button = document.createElement("button"); button.type = "button"; button.className = "litm-qol-lessons-button";
    button.dataset.rerollFeature = feature; button.textContent = `${config.name} — Reroll`;
    button.dataset.tooltip = feature === "lessonsLearned" ? "Once per session: explain how this situation is familiar from your Past, reroll the dice, and take the new result."
      : "Once per session, when using tags from this theme and rolling a total of 6 or less. Reroll the dice and take the new result.";
    button.addEventListener("click", async () => { if (button.disabled) return; button.disabled = true;
      try { const theme = lessonsThemes(message, info.actor, feature)[0]; if (theme) await useLessons({ feature, messageUuid: message.uuid, themeUuid: theme.uuid }); }
      catch (error) { ui.notifications.error(error.message); } finally { refresh(); } });
    (root.querySelector(".roll-card") ?? root).append(button);
  }
  if (vividEntries(message).length) {
    const button = document.createElement("button"); button.type = "button"; button.className = "litm-qol-vivid-button"; button.textContent = "Vivid Memory — Create Tag or Status";
    button.addEventListener("click", async () => { if (button.disabled) return; button.disabled = true;
      try { await promptVividMemoryForMessage(message, useVivid); } catch (error) { ui.notifications.error(error.message); } finally { refresh(); } });
    (root.querySelector(".roll-card") ?? root).append(button);
  }
  refresh(); cards.set(message.uuid, { root, refresh });
}
Hooks.on("updateItem", () => { for (const [id, card] of cards) { if (card.root.isConnected) card.refresh(); else cards.delete(id); } });

async function promptNotLettingGo(payload) {
  const theme = await fromUuid(payload.themeUuid), actor = theme?.parent;
  if (!has(theme, "Not Letting Go") || !(game.user.isGM || actor?.isOwner)) return false;
  const others = [...actor.items].filter(item => item.id !== theme.id && item.type === "themebook" && !item.system.options?.isStoryTheme && Number(item.system.abandon ?? 0) < 3);
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Not Letting Go" }, classes: ["litm-qol-system-dialog"],
    content: `<p>Keep <strong>${foundry.utils.escapeHTML(payload.tagName)}</strong> unscratched by marking Abandon on another theme?</p><select name="themeId">${others.map(item => `<option value="${item.id}">${foundry.utils.escapeHTML(themeTitle(item))}</option>`).join("")}</select>`,
    buttons: [{ action: "scratch", label: "Scratch the Tag", callback: () => false }, { action: "abandon", label: "Mark Abandon Instead", callback: (_event, button) => button.form.elements.themeId.value }], rejectClose: false
  });
}
export function registerPastSocket(api) {
  pastSocket = api;
  api.register("promptNotLettingGo", async function(payload) {
    const theme = await fromUuid(payload.themeUuid), user = game.users.get(this.socketdata.userId);
    if (!theme || !(user?.isGM || theme.parent?.testUserPermission(user, "OWNER"))) return false;
    return promptNotLettingGo(payload);
  });
}

export async function protectNotLettingGo(theme, changes, options = {}) {
  if (!["character", "litm-character"].includes(theme?.parent?.type) || !has(theme, "Not Letting Go")) return;
  const updates = changes["system.powertags"] ?? changes.system?.powertags;
  if (!Array.isArray(updates)) return;
  const actor = theme.parent, context = DiceRollApp?.instance?._litmQolRollContext?.data;
  const rollId = options.litmQolBurnForPower?.rollId ?? (context?.actorId === actor.id ? context.id : null);
  for (let index = 0; index < updates.length; index++) {
    const tag = updates[index], old = theme.system.powertags?.[index];
    const contributionBurn = options.litmQolBurnForPower?.source === "themebook" && options.litmQolBurnForPower.index === index;
    if (!old || old.burned || !tag.burned || old.name !== tag.name || (!old.toBurn && !contributionBurn)) continue;
    const key = rollId ? `${rollId}:${theme.id}:${index}` : null;
    const already = key && [...actor.items].find(item => item.getFlag(MODULE_ID, "notLettingGoBurns")?.includes(key));
    if (already) { updates[index] = { ...tag, burned: false, toBurn: false }; continue; }
    const others = [...actor.items].filter(item => item.id !== theme.id && item.type === "themebook" && !item.system.options?.isStoryTheme && Number(item.system.abandon ?? 0) < 3);
    if (!others.length) continue;
    const payload = { themeUuid: theme.uuid, tagName: tag.name };
    const player = [...game.users].find(user => user.active && !user.isGM && user.character?.id === actor.id);
    const choice = pastSocket && player && player.id !== game.user.id
      ? await pastSocket.executeAsUser("promptNotLettingGo", player.id, payload)
      : await promptNotLettingGo(payload);
    const target = others.find(item => item.id === choice);
    if (!target || Number(target.system.abandon ?? 0) >= 3) continue;
    const change = { "system.abandon": Number(target.system.abandon ?? 0) + 1 };
    if (key) change[`flags.${MODULE_ID}.notLettingGoBurns`] = [...(target.getFlag(MODULE_ID, "notLettingGoBurns") ?? []), key];
    await target.update(change);
    updates[index] = { ...tag, burned: false, toBurn: false };
  }
}
export function installNotLettingGo(ItemClass, RollClass) {
  DiceRollApp = RollClass;
  const proto = ItemClass.prototype, key = Symbol.for(`${MODULE_ID}.notLettingGo`);
  if (proto[key]) return;
  const original = proto._preUpdate;
  proto._preUpdate = async function(changes, options, user) { await protectNotLettingGo(this, changes, options); return original?.call(this, changes, options, user); };
  Object.defineProperty(proto, key, { value: true });
}
Hooks.once("ready", async () => {
  try { const { DiceRollApp } = await importSystemModule("apps/dice-roll-app.mjs"); installNotLettingGo(CONFIG.Item.documentClass, DiceRollApp); }
  catch (error) { console.error(`${MODULE_ID} | Could not initialize Not Letting Go.`, error); }
});
