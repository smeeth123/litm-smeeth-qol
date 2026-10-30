import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
const MODULE_ID = "litm-smeeth-qol";
const SYSTEM_ID = "mist-engine-fvtt";
const KEY = "trust-in-legacy";
const TAG_ID = "litmQolLegacyId";
const CHOSEN = "litmQolLegacyTag";
const normalize = value => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const tagSpecial = name => ["trust in legacy", "rehearsed technique", "rehearsed techniques"].includes(normalize(name));
const legacy = theme => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.find(entry => entry.active && normalize(entry.name) === "trust in legacy");
const cards = new Map();

export function extendPeopleSchema() {
  if (game.system.id !== SYSTEM_ID) return;
  for (const Model of Object.values(CONFIG.Item.dataModels)) {
    for (const [field, key] of [["powertags", TAG_ID], ["specialImprovements", CHOSEN]]) {
      const entry = Model.schema.fields[field]?.element;
      if (entry && !entry.fields[key]) entry.extendFields({ [key]: new foundry.data.fields.StringField({ required: false, blank: true, initial: "" }) });
    }
  }
}
Hooks.once("init", extendPeopleSchema);
Hooks.once("setup", extendPeopleSchema);

export async function configureLegacyDetails(theme, details, name) {
  if (!tagSpecial(name)) return details;
  const tags = (theme.system.powertags ?? []).map((tag, index) => ({ tag, index }))
    .filter(({ tag }) => tag.name?.trim() && !tag.planned && !tag.expired);
  if (!tags.length) { ui.notifications.warn(`Add a power tag before choosing ${name}.`); return null; }
  const index = await foundry.applications.api.DialogV2.wait({
    window: { title: `${name} — Choose a Tag` }, classes: ["litm-qol-system-dialog"],
    content: `<p>${normalize(name) === "trust in legacy" ? "Choose a power tag describing your People’s abilities or ways." : "Choose a power tag from this theme for Rehearsed Technique."}</p><select name="legacyTag">${tags.map(({ tag, index }) => `<option value="${index}">${foundry.utils.escapeHTML(tag.name)}</option>`).join("")}</select>`,
    buttons: [{ action: "cancel", label: "Cancel", callback: () => null },
      { action: "choose", label: "Choose Tag", default: true, callback: (_event, button) => Number(button.form.elements.legacyTag.value) }], rejectClose: false
  });
  const chosen = tags.find(entry => entry.index === index);
  if (!chosen) return null;
  return { ...details, legacyTag: { index, name: chosen.tag.name, id: chosen.tag[TAG_ID] || foundry.utils.randomID() } };
}
export function applyLegacyDetails(powertags, improvements, details, rewrite) {
  if (!details.legacyTag) return;
  const chosen = details.legacyTag, tag = powertags[chosen.index];
  // The optional rewrite may rename this same tag; its identity stays intact.
  if (!tag || tag.planned || tag.expired || !tag.name?.trim()) throw new Error("The chosen power tag is no longer available.");
  const renamed = rewrite?.choice?.type === "power" && rewrite.choice.index === chosen.index && tag.name === rewrite.name;
  if ((!renamed && tag.name !== chosen.name) || (tag[TAG_ID] && tag[TAG_ID] !== chosen.id)
      || !tagSpecial(improvements[details.index]?.name)) throw new Error("The chosen tag or Special Improvement changed. Choose it again.");
  tag[TAG_ID] = chosen.id;
  improvements[details.index][CHOSEN] = chosen.id;
}

export function renderLegacyConfiguration(actor, root) {
  if (!actor || !root) return;
  for (const name of root.querySelectorAll(".item-special-improvement-line .special-improvement-label")) {
    if (!tagSpecial(name.textContent)) continue;
    const row = name.closest(".item-special-improvement-line"), theme = actor.items.get(row.closest(".themebook-container[data-id]")?.dataset.id);
    const improvement = theme?.system.specialImprovements?.find(entry => entry.active && normalize(entry.name) === normalize(name.textContent));
    if (!improvement || !(game.user.isGM || actor.isOwner)) continue;
    row.querySelector(".litm-qol-legacy-tag")?.remove();
    const chosen = theme.system.powertags.find(tag => tag[TAG_ID] && tag[TAG_ID] === improvement[CHOSEN]);
    const button = document.createElement("button"); button.type = "button"; button.className = "litm-qol-legacy-tag";
    button.style.cssText = "flex:0 0 auto;width:auto;min-height:0;padding:0 4px;border:0;background:transparent;box-shadow:none";
    button.innerHTML = '<i class="fa-solid fa-tag" aria-hidden="true"></i>';
    button.setAttribute("aria-label", `Choose ${improvement.name} tag`);
    button.dataset.tooltip = chosen ? `${improvement.name}: ${chosen.name}. Click to change the chosen tag.` : `Choose a tag for ${improvement.name}.`;
    button.addEventListener("click", async event => {
      event.stopPropagation(); if (button.disabled) return; button.disabled = true;
      try {
        const details = await configureLegacyDetails(theme, { index: theme.system.specialImprovements.indexOf(improvement) }, improvement.name);
        if (!details) return;
        const tags = foundry.utils.deepClone(theme.system.powertags), improvements = foundry.utils.deepClone(theme.system.specialImprovements);
        if (tags[details.legacyTag.index]?.name !== details.legacyTag.name) throw new Error("The chosen tag changed. Choose it again.");
        applyLegacyDetails(tags, improvements, details);
        await theme.update({ "system.powertags": tags, "system.specialImprovements": improvements });
      } catch (error) { ui.notifications.error(error.message); }
      finally { button.disabled = false; }
    });
    row.append(button);
  }
}

export function invokedLegacyTags(app, applied) {
  const tags = new Map();
  for (const tag of applied) {
    if (!tag.positive || tag.weakness) continue;
    const helper = tag.source === "litm-qol-help";
    if (helper ? tag.helperTagSource !== "themebook" : !tag.powerTag) continue;
    const actor = helper ? game.actors.get(tag.helperActorId) : app.actor;
    const theme = actor?.items.get(helper ? tag.helperTagItemId : tag.themebookId);
    const power = theme?.system.powertags?.[helper ? tag.helperTagIndex : tag.index];
    if (!power?.[TAG_ID] || power.planned || power.burned || power.expired || power.name?.trim() !== (helper ? tag.originalName : tag.name)?.trim()) continue;
    const entry = { actorUuid: actor.uuid, themeId: theme.id, tagId: power[TAG_ID] };
    tags.set(`${actor.uuid}:${theme.id}:${entry.tagId}`, entry);
  }
  return [...tags.values()];
}

export function legacyCandidates(message) {
  const context = message.getFlag(MODULE_ID, "rollContext");
  if (!["quick", "detailed", "reaction"].includes(context?.rollType) || message.getFlag(MODULE_ID, "trustInLegacy")) return [];
  const state = message.getFlag(SYSTEM_ID, "detailedSpend");
  if (state ? state.consequenceResult !== -1 : !String(message.content).includes('consequence-result-negative')) return [];
  const choices = [];
  const actors = context.group ? [...game.actors.values()] : [game.actors.get(context.actorId)];
  for (const actor of actors) for (const theme of actor?.items ?? []) {
    const improvement = legacy(theme);
    if (!improvement?.[CHOSEN] || (specialUsed(theme, KEY) && theme.getFlag(MODULE_ID, "specialImprovementMessages")?.[KEY] !== message.uuid)) continue;
    if (!theme.system.powertags.some(tag => tag[TAG_ID] === improvement[CHOSEN] && tag.name?.trim() && !tag.planned && !tag.expired)) continue;
    if (context.legacyTags?.some(tag => tag.actorUuid === actor.uuid && tag.themeId === theme.id && tag.tagId === improvement[CHOSEN])) choices.push({ actor, theme });
  }
  return choices;
}
export async function applyTrustInLegacy(payload, user, renderer) {
  const message = await fromUuid(payload.messageUuid);
  if (!message || !(user?.isGM || (message.author?.id ?? message.user?.id) === user?.id)) throw new Error("Only the roller or Narrator can use Trust in Legacy.");
  if (message.getFlag(MODULE_ID, "trustInLegacy")) return true;
  const choice = legacyCandidates(message).find(entry => entry.theme.uuid === payload.themeUuid);
  if (!choice || !(user.isGM || choice.actor.testUserPermission(user, "OWNER"))) throw new Error("Trust in Legacy is not available for this roll.");
  return succeedWithConsequences(message, choice.theme, KEY, "Trust in Legacy", "trustInLegacy", renderer);
}
export async function succeedWithConsequences(message, theme, key, label, flag, renderer) {
  const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "detailedSpend"));
  let content;
  if (state) { state.consequenceResult = 0; content = await renderer(state); }
  else {
    const root = document.createElement("div"); root.innerHTML = message.content;
    const result = root.querySelector(".consequence-result-negative");
    if (!result) throw new Error("This roll no longer has only Consequences.");
    result.className = "consequence-result-neutral";
    const heading = result.querySelector(".heading"); if (heading) heading.innerHTML = '<i class="consequence-result-icon neutral"></i>Success with Consequences';
    const text = result.querySelector("p"); if (text) text.textContent = "Your action succeeds, with Consequences.";
    content = root.innerHTML;
  }
  const root = document.createElement("div"); root.innerHTML = content;
  const note = document.createElement("p"); note.textContent = `${label}: the action also succeeds. The Consequences still apply.`;
  (root.querySelector(".roll-card") ?? root).append(note);
  await theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.${key}`]: true,
    [`flags.${MODULE_ID}.specialImprovementMessages.${key}`]: message.uuid });
  const update = { content: root.innerHTML, [`flags.${MODULE_ID}.${flag}`]: { themeUuid: theme.uuid } };
  if (state) update[`flags.${SYSTEM_ID}.detailedSpend`] = state;
  await message.update(update);
  return true;
}
export function renderTrustInLegacy(message, root, use) {
  root.querySelectorAll(".litm-qol-trust-legacy-button").forEach(button => button.remove());
  if (!(game.user.isGM || message.isAuthor)) return;
  const refresh = () => renderTrustInLegacy(message, root, use);
  const choices = legacyCandidates(message).filter(({ actor }) => game.user.isGM || actor.isOwner);
  if (!choices.length) { cards.delete(message.uuid); return; }
  for (const { theme } of choices) {
    const button = document.createElement("button"); button.type = "button"; button.className = "litm-qol-trust-legacy-button";
    button.textContent = "Trust in Legacy — Succeed with Consequences";
    button.dataset.tooltip = "Once per session, when you roll with your chosen tag and get only Consequences.";
    button.addEventListener("click", async () => {
      if (button.disabled) return; button.disabled = true;
      try { await use({ messageUuid: message.uuid, themeUuid: theme.uuid }); }
      catch (error) { ui.notifications.error(error.message); }
      finally { refresh(); }
    });
    (root.querySelector(".roll-card") ?? root).append(button);
  }
  cards.set(message.uuid, { root, refresh });
}
Hooks.on("updateItem", item => {
  if (item.type !== "themebook") return;
  for (const [id, card] of cards) {
    if (!card.root.isConnected) cards.delete(id); else card.refresh();
  }
});
