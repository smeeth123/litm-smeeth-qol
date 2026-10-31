import { configureLegacyDetails, applyLegacyDetails } from "./people-improvements.mjs";
import { specialImprovementKey } from "./circumstance-improvements.mjs";
const MODULE_ID = "litm-smeeth-qol";
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const isLifelong = name => ["lifelong insight", "lifelong insigh"].includes(normalize(name));
export const hasLifelongInsight = theme => theme?.system.specialImprovements?.some(entry => entry.active && isLifelong(entry.name));
export async function chooseLifelongImprovement(theme) {
  if (!hasLifelongInsight(theme)) return { keep: false };
  const choices = (theme.system.specialImprovements ?? []).map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.active && entry.name?.trim() && !isLifelong(entry.name));
  if (!choices.length) return { keep: false };
  const descriptions = await Promise.all(choices.map(({ entry }) => foundry.applications.ux.TextEditor.implementation.enrichHTML(entry.description ?? "", { relativeTo: theme, secrets: Boolean(theme.isOwner ?? theme.parent?.isOwner) })));
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: "Lifelong Insight — Keep an Improvement", resizable: true }, position: { width: 600, height: 550 },
    classes: ["litm-qol-system-dialog", "litm-qol-special-improvement-window"],
    content: `<p>You may keep one active Special Improvement on the replacement theme.</p><select name="keepIndex">${choices.map(({ entry, index }) => `<option value="${index}">${foundry.utils.escapeHTML(entry.name)}</option>`).join("")}</select><section class="litm-qol-special-preview"><div class="litm-qol-special-description"></div></section>`,
    render: (_event, dialog) => {
      const select = dialog.element.querySelector('[name="keepIndex"]'), preview = dialog.element.querySelector('.litm-qol-special-description');
      const paint = () => { preview.innerHTML = descriptions[choices.findIndex(choice => choice.index === Number(select.value))] ?? ""; };
      select.addEventListener('change', paint); paint();
    },
    buttons: [{ action: "cancel", label: "Cancel Replacement", callback: () => null },
      { action: "skip", label: "Skip", callback: () => ({ keep: false }) },
      { action: "keep", label: "Keep Improvement", callback: (_event, button) => Number(button.form.elements.keepIndex.value) }], rejectClose: false
  });
  if (choice === null || choice === undefined || choice?.keep === false) return choice ?? null;
  const selected = choices.find(entry => entry.index === choice);
  return selected ? { keep: true, sourceIndex: selected.index, source: foundry.utils.deepClone(selected.entry) } : null;
}
export async function retainLifelongImprovement(oldTheme, prepared, choice) {
  if (!choice?.keep) return;
  const current = oldTheme.system.specialImprovements?.[choice.sourceIndex];
  if (!hasLifelongInsight(oldTheme) || !current?.active || isLifelong(current.name) || JSON.stringify(current) !== JSON.stringify(choice.source)) {
    throw new Error("The improvement chosen for Lifelong Insight changed. Choose it again.");
  }
  const improvements = prepared.system.specialImprovements ??= [];
  let index = improvements.findIndex(entry => normalize(entry.name) === normalize(current.name));
  if (index < 0) index = improvements.findIndex(entry => !entry.name?.trim());
  if (index < 0) index = improvements.length;
  improvements[index] = { ...foundry.utils.deepClone(current), active: true };
  const theme = { name: prepared.name, system: prepared.system, parent: oldTheme.parent, isOwner: oldTheme.isOwner };
  const details = await configureLegacyDetails(theme, { index }, current.name);
  if (!details) return false;
  applyLegacyDetails(prepared.system.powertags, improvements, details);
  prepared.flags ??= {}; prepared.flags[MODULE_ID] ??= {};
  const key = specialImprovementKey(current.name);
  if (key && oldTheme.getFlag(MODULE_ID, "specialImprovementUses")?.[key]) {
    prepared.flags[MODULE_ID].specialImprovementUses = { [key]: true };
  }
  if (normalize(current.name) === "calculated sacrifice" && oldTheme.getFlag(MODULE_ID, "calculatedSacrificePaid")) {
    prepared.flags[MODULE_ID].calculatedSacrificePaid = foundry.utils.deepClone(oldTheme.getFlag(MODULE_ID, "calculatedSacrificePaid"));
  }
  prepared.flags[MODULE_ID].lifelongInsight = { name: current.name, sourceThemeUuid: oldTheme.uuid };
  return true;
}
