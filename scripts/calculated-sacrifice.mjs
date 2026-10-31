import { runReplaceTheme } from "./theme-replacement.mjs";
import { themeTitle } from "./theme-title.mjs";
import { importSystemModule } from "./system-imports.mjs";
const MODULE_ID = "litm-smeeth-qol";
const calculated = theme => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && entry.name?.trim().toLowerCase() === "calculated sacrifice");
const themes = actor => [...actor.items].filter(theme => theme.type === "themebook" && !theme.system.options?.isStoryTheme);
let replacement = runReplaceTheme;
export function configureCalculatedReplacement(callback) { replacement = callback; }
export const calculatedSacrificeTotal = total => total >= 7 && total <= 9 ? 10 : total;
export async function payCalculatedSacrifice(actor, mastery) {
  if (!calculated(mastery) || mastery.parent?.uuid !== actor.uuid) throw new Error("Calculated Sacrifice is no longer available.");
  const paid = mastery.getFlag(MODULE_ID, "calculatedSacrificePaid");
  if (paid) return paid;
  const choices = themes(actor).filter(theme => theme.id !== mastery.id);
  if (!choices.length) throw new Error("Choose a different theme to replace for Calculated Sacrifice.");
  const id = await foundry.applications.api.DialogV2.wait({
    window: { title: "Calculated Sacrifice — Replace a Theme" }, classes: ["litm-qol-system-dialog"],
    content: `<p>Choose the other theme dearest to you. Complete its replacement before making the Grave Sacrifice.</p><select name="themeId">${choices.map(theme => `<option value="${theme.id}">${foundry.utils.escapeHTML(themeTitle(theme))}</option>`).join("")}</select>`,
    buttons: [{ action: "cancel", label: "Cancel", callback: () => null },
      { action: "replace", label: "Replace Theme", callback: (_event, button) => button.form.elements.themeId.value }], rejectClose: false
  });
  const selected = choices.find(theme => theme.id === id);
  if (!selected) return null;
  const newTheme = await replacement(actor, selected, { allowWithoutAbandon: true });
  if (!newTheme) return null;
  const receipt = { id: foundry.utils.randomID(), oldThemeUuid: selected.uuid, replacementUuid: newTheme.uuid };
  await mastery.update({ [`flags.${MODULE_ID}.calculatedSacrificePaid`]: receipt });
  return receipt;
}
export async function rollMasterySacrifice(actor) {
  const choices = themes(actor).filter(calculated);
  if (!choices.length) return;
  let payment, mastery, working = false;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("MIST_ENGINE.SACRIFICE.Title"), icon: "fa-solid fa-heart-crack" },
    classes: ["mist-engine", "dialog", "sacrifice-roll-dialog"],
    content: `<p class="hint">${game.i18n.localize("MIST_ENGINE.SACRIFICE.Hint")}</p><div class="form-group"><label>${game.i18n.localize("MIST_ENGINE.SACRIFICE.Level")}</label><select name="level">${["painful","scarring","grave"].map(level => `<option value="${level}">${game.i18n.localize(`MIST_ENGINE.SACRIFICE.Levels.${level}`)}</option>`).join("")}</select></div><div class="form-group"><label>${game.i18n.localize("MIST_ENGINE.SACRIFICE.Modifier")}</label><input type="number" name="modifier" value="0"></div><fieldset class="litm-qol-calculated-sacrifice" hidden><legend>Calculated Sacrifice</legend>${choices.length>1?`<select name="masteryId">${choices.map(theme=>`<option value="${theme.id}">${foundry.utils.escapeHTML(themeTitle(theme))}</option>`).join("")}</select>`:""}<label class="litm-qol-fumbling-choice"><input type="checkbox" name="calculated"><span>Replace another theme before rolling</span></label></fieldset>`,
    render: (_event, dialog) => {
      const root = dialog.element, level = root.querySelector('[name="level"]'), box = root.querySelector('[name="calculated"]'), select = root.querySelector('[name="masteryId"]');
      const paint = () => {
        mastery = choices.find(theme => theme.id === select?.value) ?? choices[0];
        payment = mastery.getFlag(MODULE_ID, "calculatedSacrificePaid") ?? null;
        root.querySelector('.litm-qol-calculated-sacrifice').hidden = level.value !== 'grave';
        box.checked = Boolean(payment); box.disabled = working || Boolean(payment);
      };
      level.addEventListener('change', paint); select?.addEventListener('change', paint); paint();
      box.addEventListener('change', async () => {
        if (!box.checked || working) return;
        working = true; box.disabled = true; if (select) select.disabled = true;
        try { await payCalculatedSacrifice(actor, mastery); }
        catch (error) { ui.notifications.error(error.message); }
        finally { working = false; if (select) select.disabled = false; paint(); }
      });
    },
    ok: { label: game.i18n.localize("MIST_ENGINE.SACRIFICE.Roll"), icon: "fa-solid fa-dice", callback: (_event, button) => {
      if (working) return null;
      const level = button.form.elements.level.value;
      return { level, modifier: parseInt(button.form.elements.modifier.value) || 0,
        paid: level === 'grave' && button.form.elements.calculated.checked ? payment : null, masteryUuid: mastery?.uuid };
    } }, rejectClose: false
  });
  if (!result) return;
  if (result.paid && (!calculated(mastery) || mastery.getFlag(MODULE_ID, "calculatedSacrificePaid")?.id !== result.paid.id)) throw new Error("The Calculated Sacrifice payment changed. Review the sacrifice again.");
  const roll = new Roll(`2d6${result.modifier ? ` ${result.modifier > 0 ? "+" : "-"} ${Math.abs(result.modifier)}` : ""}`, actor.getRollData());
  await roll.evaluate(); if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true, null, false);
  const originalTotal = roll.total, total = result.paid ? calculatedSacrificeTotal(originalTotal) : originalTotal;
  const lessened = { grave: "scarring", scarring: "painful", painful: "none" }[result.level];
  const html = await foundry.applications.handlebars.renderTemplate("systems/mist-engine-fvtt/templates/chat/sacrifice-result.hbs", {
    diceRollHTML: await roll.render(), levelLabel: game.i18n.localize(`MIST_ENGINE.SACRIFICE.Levels.${result.level}`),
    lessenedLabel: game.i18n.localize(`MIST_ENGINE.SACRIFICE.Levels.${lessened}`), isMiracle: total >= 10, isFate: total >= 7 && total < 10, isInVain: total < 7 });
  const root = document.createElement('div'); root.innerHTML = html;
  if (total !== originalTotal) { const counter = root.querySelector('.dice-total'); if (counter) { counter.textContent = String(total); counter.dataset.tooltip = `Calculated Sacrifice: original total ${originalTotal}, treated as ${total}.`; } }
  if (result.paid && total >= 7) {
    const outcome = root.querySelector('.consequence-result-positive');
    if (outcome) { const heading = outcome.querySelector('.heading'); outcome.replaceChildren(...[heading].filter(Boolean));const p=document.createElement('p');p.textContent='The action succeeds. The theme already replaced pays the sacrifice; no additional theme replacement is required.';outcome.append(p); }
  }
  const message = await ChatMessage.create({ content: root.innerHTML, speaker: ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: {
    nativeSacrifice: { level: result.level, lessened: total >= 10 },
    ...(result.paid ? { calculatedSacrifice: { ...result.paid, masteryUuid: result.masteryUuid, originalTotal, total, paidInAdvance: true, success: total >= 7 } } : {}) } } });
  if (result.paid && message) await mastery.update({ [`flags.${MODULE_ID}.-=calculatedSacrificePaid`]: null });
  return message;
}
export function installCalculatedSacrifice(SheetClass) {
  const actions = SheetClass.DEFAULT_OPTIONS.actions, key = Symbol.for(`${MODULE_ID}.calculatedSacrifice`);
  if (SheetClass[key]) return;
  const native = actions.clickSacrificeRoll;
  actions.clickSacrificeRoll = function(event, target) {
    if (!themes(this.actor).some(calculated)) return native.call(this, event, target);
    event.preventDefault(); return rollMasterySacrifice(this.actor);
  };
  Object.defineProperty(SheetClass, key, { value: true });
}
Hooks.once("ready", async () => {
  try { const { MistEngineLegendInTheMistCharacterSheet } = await importSystemModule("sheets/litm-character-sheet.mjs"); installCalculatedSacrifice(MistEngineLegendInTheMistCharacterSheet); }
  catch (error) { console.error(`${MODULE_ID} | Calculated Sacrifice could not initialize`, error); }
});
