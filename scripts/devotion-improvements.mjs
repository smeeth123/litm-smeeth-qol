import { themeTitle } from "./theme-title.mjs";
import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
const MODULE_ID = "litm-smeeth-qol";
const SYSTEM_ID = "mist-engine-fvtt";
const CATCH = "catch-me-when-i-fall";
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const has = (theme, name) => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === normalize(name));
const cards = new Map();
let socket;

export function catchMeRoll(message) {
  const context = message.getFlag(MODULE_ID, "rollContext");
  if (!["quick", "detailed"].includes(context?.rollType) || context.group || message.getFlag(MODULE_ID, "catchMeWhenIFall")) return null;
  const state = message.getFlag(SYSTEM_ID, "detailedSpend");
  if (state ? state.consequenceResult !== -1 : !String(message.content).includes('consequence-result-negative')) return null;
  return game.actors.get(context.actorId) ?? null;
}
const catchThemes = (actor, message) => [...(actor?.items ?? [])].filter(theme => has(theme, "Catch Me When I Fall")
  && (!specialUsed(theme, CATCH) || theme.getFlag(MODULE_ID, "catchMeWhenIFallMessage") === message.uuid));

export async function applyCatchMeWhenIFall(payload, user, renderer) {
  const message = await fromUuid(payload.messageUuid);
  if (!message || !(user?.isGM || (message.author?.id ?? message.user?.id) === user?.id)) throw new Error("Only the roller or GM can use Catch Me When I Fall.");
  if (message.getFlag(MODULE_ID, "catchMeWhenIFall")) return true;
  const actor = catchMeRoll(message);
  const theme = actor && catchThemes(actor, message).find(theme => theme.uuid === payload.themeUuid);
  if (!theme || !(user.isGM || actor.testUserPermission(user, "OWNER"))) throw new Error("Catch Me When I Fall is not available for this roll.");
  const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "detailedSpend"));
  let content;
  if (state) { state.consequenceResult = 0; content = await renderer(state); }
  else {
    const root = document.createElement("div"); root.innerHTML = message.content;
    const result = root.querySelector(".consequence-result-negative");
    if (!result) throw new Error("This roll no longer has only Consequences.");
    result.className = "consequence-result-neutral";
    const heading = result.querySelector(".heading"); if (heading) heading.textContent = "Success with Consequences";
    const text = result.querySelector("p"); if (text) text.textContent = "Your action succeeds, with Consequences.";
    content = root.innerHTML;
  }
  const root = document.createElement("div"); root.innerHTML = content;
  const note = document.createElement("p"); note.textContent = "Catch Me When I Fall: your action also succeeds. The Consequences still apply.";
  (root.querySelector(".roll-card") ?? root).append(note);
  // A reservation lets a failed chat update be completed on retry without a second use.
  await theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.${CATCH}`]: true,
    [`flags.${MODULE_ID}.catchMeWhenIFallMessage`]: message.uuid });
  const update = { content: root.innerHTML,
    [`flags.${MODULE_ID}.catchMeWhenIFall`]: { themeUuid: theme.uuid, originalOutcome: -1, outcome: 0 } };
  if (state) update[`flags.${SYSTEM_ID}.detailedSpend`] = state;
  await message.update(update);
  return true;
}

export function renderCatchMeWhenIFall(message, root, use) {
  root.querySelector(".litm-qol-catch-me-button")?.remove();
  const actor = catchMeRoll(message);
  if (!actor || ![...actor.items].some(theme => has(theme, "Catch Me When I Fall"))
      || !(game.user.isGM || (message.isAuthor && actor.isOwner))) return;
  const button = document.createElement("button"); button.type = "button"; button.className = "litm-qol-catch-me-button";
  let busy = false;
  const refresh = () => {
    if (!catchMeRoll(message)) { button.remove(); cards.delete(message.uuid); return; }
    button.disabled = busy || !catchThemes(actor, message).length;
    button.textContent = "Catch Me When I Fall — Succeed with Consequences";
    button.dataset.tooltip = "Once per session, when the object of your Devotion or a representative is at your side.";
  };
  button.addEventListener("click", async () => {
    if (button.disabled || busy) return;
    busy = true; refresh();
    try {
      const theme = catchThemes(actor, message)[0];
      if (theme) await use({ messageUuid: message.uuid, themeUuid: theme.uuid });
    } catch (error) { ui.notifications.error(error.message); }
    finally { busy = false; refresh(); }
  });
  refresh(); (root.querySelector(".roll-card") ?? root).append(button);
  cards.set(message.uuid, { root, actorId: actor.id, refresh });
}
Hooks.on("updateItem", item => {
  if (item.type !== "themebook") return;
  for (const [id, card] of cards) {
    if (!card.root.isConnected) cards.delete(id);
    else if (card.actorId === item.parent?.id) card.refresh();
  }
});

async function promptUnwavering(payload) {
  const theme = await fromUuid(payload.themeUuid);
  if (!theme || !(game.user.isGM || theme.parent?.isOwner) || !has(theme, "Unwavering") || specialUsed(theme, "unwavering")) return false;
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Unwavering" }, classes: ["litm-qol-system-dialog"],
    content: `<p>A tag in <strong>${foundry.utils.escapeHTML(themeTitle(theme))}</strong> would be scratched. Use Unwavering to keep one tag unscratched?</p><select name="tag">${payload.tags.map(tag => `<option value="${tag.key}">${foundry.utils.escapeHTML(tag.name)}</option>`).join("")}</select>`,
    buttons: [{ action: "allow", label: "Allow Scratching", callback: () => false },
      { action: "use", label: "Use Unwavering", callback: (_event, button) => button.form.elements.tag.value }], rejectClose: false
  });
}
export function registerDevotionSocket(api) {
  socket = api;
  socket.register("promptUnwavering", async function(payload) {
    const theme = await fromUuid(payload.themeUuid), user = game.users.get(this.socketdata.userId);
    if (!theme || !(user?.isGM || theme.parent?.testUserPermission(user, "OWNER"))) return false;
    return promptUnwavering(payload);
  });
}
export async function protectUnwavering(theme, changes) {
  if (!["character", "litm-character"].includes(theme?.parent?.type) || !has(theme, "Unwavering") || specialUsed(theme, "unwavering")) return;
  const tags = [];
  for (const field of ["powertags", "weaknesstags"]) {
    const updates = changes[`system.${field}`] ?? changes.system?.[field];
    if (!Array.isArray(updates)) continue;
    updates.forEach((tag, index) => {
      const old = theme.system[field]?.[index];
      if (old?.name?.trim() && !old.burned && tag.burned && old.name === tag.name) tags.push({ key: `${field}:${index}`, field, index, name: tag.name });
    });
  }
  if (!tags.length) return;
  const payload = { themeUuid: theme.uuid, tags };
  const player = [...game.users].find(user => user.active && !user.isGM && user.character?.id === theme.parent?.id);
  let choice;
  if (socket && player && player.id !== game.user.id) choice = await socket.executeAsUser("promptUnwavering", player.id, payload);
  else choice = await promptUnwavering(payload);
  const chosen = tags.find(tag => tag.key === choice);
  if (!chosen || specialUsed(theme, "unwavering") || !has(theme, "Unwavering")) return;
  if (theme.system[chosen.field]?.[chosen.index]?.name !== chosen.name) throw new Error("The tag changed while Unwavering was open. Review the scratch again.");
  const updates = changes[`system.${chosen.field}`] ?? changes.system?.[chosen.field];
  updates[chosen.index] = { ...updates[chosen.index], burned: false, toBurn: false };
  changes[`flags.${MODULE_ID}.${SPECIAL_USES}.unwavering`] = true;
}
export function installUnwavering(ItemClass) {
  const proto = ItemClass.prototype, key = Symbol.for(`${MODULE_ID}.unwavering`);
  if (proto[key]) return;
  const original = proto._preUpdate;
  proto._preUpdate = async function(changes, options, user) {
    const result = await original?.call(this, changes, options, user);
    if (result === false) return false;
    await protectUnwavering(this, changes);
    return result;
  };
  Object.defineProperty(proto, key, { value: true });
}
Hooks.once("ready", () => installUnwavering(CONFIG.Item.documentClass));
