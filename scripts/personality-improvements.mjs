import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { succeedWithConsequences } from "./people-improvements.mjs";
const MODULE_ID = "litm-smeeth-qol", SYSTEM_ID = "mist-engine-fvtt";
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const has = (theme, name) => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === normalize(name));
const cards = new Map(), rollActors = new Map();
const features = {
  adaptablePersona: { key: "adaptable-persona", name: "Adaptable Persona", period: "session" },
  unshakeable: { key: "unshakeable", name: "Unshakeable", period: "scene" }
};

function tagSource(app, tag) {
  if (tag.source === "litm-qol-help") {
    const actor = game.actors.get(tag.helperActorId), weakness = tag.weakness === true;
    if (weakness ? !tag.helperThemebookId : tag.helperTagSource !== "themebook") return null;
    return { actor, itemId: weakness ? tag.helperThemebookId : tag.helperTagItemId,
      index: weakness ? tag.helperWeaknessIndex : tag.helperTagIndex, weakness, name: tag.originalName };
  }
  if ((!tag.powerTag && !tag.weakness) || tag.source === "fellowship-themecard") return null;
  return { actor: app.actor, itemId: tag.themebookId, index: tag.index, weakness: tag.weakness === true, name: tag.name };
}
export function invokedThemeSources(app, applied) {
  const sources = new Map();
  for (const tag of applied) {
    const source = tagSource(app, tag), theme = source?.actor?.items.get(source.itemId);
    const original = theme?.system[source.weakness ? "weaknesstags" : "powertags"]?.[source.index];
    if (!theme || !original?.name?.trim() || original.planned || original.burned || original.expired || original.name.trim() !== source.name?.trim()) continue;
    sources.set(`${source.actor.uuid}:${theme.id}`, { actorUuid: source.actor.uuid, actorId: source.actor.id, itemId: theme.id });
  }
  return [...sources.values()];
}

export function contributionBurnPower(tag) {
  const theme = tag?.source === "themebook" && game.actors.get(tag.actorId)?.items.get(tag.itemId);
  return has(theme, "Big Personality") ? 4 : 3;
}
function burnTheme(tag) {
  if (tag.source === "litm-qol-help") return tag.helperTagSource === "themebook"
    ? game.actors.get(tag.helperActorId)?.items.get(tag.helperTagItemId) : null;
  if (!tag.powerTag || tag.weakness || tag.source === "fellowship-themecard") return null;
  const bound = rollActors.get(tag.litmQolBurnActorUuid)?.deref();
  if (bound) return bound.items?.get(tag.themebookId) ?? null;
  for (const actor of game.actors.values()) {
    const theme = actor.items?.get(tag.themebookId);
    if (theme) return theme;
  }
  for (const [uuid, ref] of rollActors) {
    const actor = ref.deref();
    if (!actor) { rollActors.delete(uuid); continue; }
    const theme = actor.items?.get(tag.themebookId);
    if (theme) return theme;
  }
  return null;
}
export function installPersonalityBurns(DiceRollApp) {
  const key = Symbol.for(`${MODULE_ID}.personalityBurns`), proto = DiceRollApp.prototype;
  if (proto[key]) return;
  const calculate = DiceRollApp.calculatePowerTags;
  DiceRollApp.calculatePowerTags = function(tags) {
    const count = calculate.call(this, tags);
    // Match the native first eligible burn; later marked tags still count as one.
    const burned = tags.find(tag => tag.positive && (tag.value === undefined || tag.value == 0)
      && tag.toBurn && tag.source !== "fellowship-themecard");
    if (burned && has(burnTheme(burned), "Big Personality")) return { ...count, positive: count.positive + 1 };
    return count;
  };
  for (const method of ["computePowerAmount", "updateTagsAndStatuses", "executeRoll", "_prepareContext"]) {
    const original = proto[method];
    if (!original) continue;
    proto[method] = function(...args) {
      const annotate = () => {
        if (!this.actor?.uuid) return;
        rollActors.set(this.actor.uuid, new WeakRef(this.actor));
        for (const tag of this.selectedTags ?? []) if (tag.powerTag && tag.source !== "litm-qol-help" && tag.source !== "fellowship-themecard") tag.litmQolBurnActorUuid = this.actor.uuid;
      };
      annotate();
      const result = original.apply(this, args);
      annotate();
      return result;
    };
  }
  Object.defineProperty(proto, key, { value: true });
}

function outcome(message) {
  const state = message.getFlag(SYSTEM_ID, "detailedSpend");
  if (state) return state.consequenceResult;
  const root = document.createElement("div"); root.innerHTML = message.content;
  return root.querySelector('.consequence-result-negative') ? -1 : root.querySelector('.consequence-result-neutral') ? 0
    : root.querySelector('.consequence-result-positive') ? 1 : null;
}
export function personalityCandidates(message, feature) {
  const config = features[feature], context = message.getFlag(MODULE_ID, "rollContext");
  if (!config || message.getFlag(MODULE_ID, feature)) return [];
  if (feature === "adaptablePersona") {
    if (!["quick", "detailed", "reaction"].includes(context?.rollType) || outcome(message) !== -1) return [];
  } else {
    if (context?.rollType !== "reaction" || context.group || ![0, 1].includes(outcome(message))) return [];
    const root = document.createElement("div"); root.innerHTML = message.content;
    const total = Number(root.querySelector('.dice-total')?.textContent.trim() ?? context.roll?.total);
    const power = Number(root.querySelector('.power-counter')?.textContent.match(/-?\d+/)?.[0]);
    if (!Number.isFinite(total) || total < 7 || !Number.isFinite(power) || power <= 0) return [];
  }
  const actors = context.group ? [...game.actors.values()] : [game.actors.get(context.actorId)];
  const choices = [];
  for (const actor of actors) for (const theme of actor?.items ?? []) {
    if (!has(theme, config.name) || (specialUsed(theme, config.key)
        && theme.getFlag(MODULE_ID, "specialImprovementMessages")?.[config.key] !== message.uuid)) continue;
    if (feature === "adaptablePersona" && !context.themeSources?.some(source => source.actorUuid === actor.uuid && source.itemId === theme.id)) continue;
    choices.push({ actor, theme });
  }
  return choices;
}
export async function applyPersonalityAction(payload, user, renderer) {
  const feature = payload.action, config = features[feature], message = await fromUuid(payload.messageUuid);
  if (!config || !message || !(user?.isGM || (message.author?.id ?? message.user?.id) === user?.id)) throw new Error("Only the roller or Narrator can use this improvement.");
  if (message.getFlag(MODULE_ID, feature)) return true;
  const choice = personalityCandidates(message, feature).find(entry => entry.theme.uuid === payload.themeUuid);
  if (!choice || !(user.isGM || choice.actor.testUserPermission(user, "OWNER"))) throw new Error(`${config.name} is not available for this roll.`);
  if (feature === "adaptablePersona") return succeedWithConsequences(message, choice.theme, config.key, config.name, feature, renderer);
  const root = document.createElement("div"); root.innerHTML = message.content;
  const counter = root.querySelector('.power-counter'), power = Number(counter?.textContent.match(/-?\d+/)?.[0]);
  if (!counter || !Number.isFinite(power) || power <= 0) throw new Error("There is no Power left to spend on Unshakeable.");
  counter.textContent = "Power: 0";
  counter.dataset.tooltip = `All ${power} Power spent using Unshakeable.`;
  const note = document.createElement("p"); note.className = "litm-qol-unshakeable-result";
  note.textContent = `Unshakeable: spent all ${power} Power to completely avoid the social or emotional Consequence Effects.`;
  (root.querySelector('.roll-card') ?? root).append(note);
  await choice.theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.${config.key}`]: true,
    [`flags.${MODULE_ID}.specialImprovementMessages.${config.key}`]: message.uuid });
  await message.update({ content: root.innerHTML, [`flags.${MODULE_ID}.${feature}`]: { themeUuid: choice.theme.uuid, power } });
  return true;
}
export function renderPersonalityActions(message, root, use) {
  root.querySelectorAll('.litm-qol-personality-action').forEach(button => button.remove());
  if (!(game.user.isGM || message.isAuthor)) return;
  let shown = false;
  const refresh = () => renderPersonalityActions(message, root, use);
  for (const [feature, config] of Object.entries(features)) {
    const choices = personalityCandidates(message, feature).filter(({ actor }) => game.user.isGM || actor.isOwner);
    for (const { theme } of choices) {
      shown = true;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'litm-qol-personality-action';
      button.textContent = feature === "adaptablePersona" ? "Adaptable Persona — Succeed with Consequences" : "Unshakeable — Spend All Power";
      button.dataset.tooltip = feature === "adaptablePersona" ? "Once per session, when using tags from this theme and getting only Consequences."
        : "Once per scene, when reacting to lessen social or emotional Consequences with a result of 7+. Spend all Power to avoid every Consequence Effect.";
      button.addEventListener('click', async () => {
        if (button.disabled) return; button.disabled = true;
        try { await use({ feature, themeUuid: theme.uuid, messageUuid: message.uuid }); }
        catch (error) { ui.notifications.error(error.message); }
        finally { refresh(); }
      });
      (root.querySelector('.roll-card') ?? root).append(button);
    }
  }
  if (shown) cards.set(message.uuid, { root, refresh }); else cards.delete(message.uuid);
}
Hooks.on('updateItem', item => {
  if (item.type !== 'themebook') return;
  for (const [id, card] of cards) {
    if (!card.root.isConnected) cards.delete(id); else card.refresh();
  }
});
