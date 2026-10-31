import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { themeTitle } from "./theme-title.mjs";
const MODULE_ID = "litm-smeeth-qol", KEY = "second-wind";
const has = theme => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && entry.name?.trim().toLowerCase() === "second wind");
const eligible = (theme, scratched) => (theme.system.powertags ?? []).map((tag, index) => ({ field: "powertags", index, name: tag.name, tag }))
  .filter(({ tag }) => tag.name?.trim() && Boolean(tag.burned) === scratched && !tag.planned && !tag.expired);
let operation;
export function configureSecondWind(callback) { operation = callback; }
export async function handleSecondWindTracker(theme, key, used) {
  if (key !== KEY) return false;
  if (!used) { await operation({ themeUuid: theme.uuid, used: false }); return true; }
  if (specialUsed(theme, KEY)) return true;
  let result;
  if (!theme.getFlag(MODULE_ID, "secondWindPending")) {
    const restores = eligible(theme, true), costs = [...theme.parent.items].filter(other => other.id !== theme.id && other.type === "themebook" && !other.system.options?.isStoryTheme)
      .flatMap(other => eligible(other, false).map(tag => ({ ...tag, themeUuid: other.uuid, themeName: themeTitle(other) })));
    if (!restores.length || !costs.length) throw new Error("Second Wind needs a scratched tag on this theme and an unscratched tag on another theme.");
    const esc = foundry.utils.escapeHTML;
    result = await foundry.applications.api.DialogV2.wait({
      window: { title: "Second Wind" }, classes: ["litm-qol-system-dialog"],
      content: `<p>Recover one or two scratched power tags, then scratch a power tag on another theme.</p>${restores.map((tag, index) => `<label class="litm-qol-fumbling-choice"><input type="checkbox" name="restore" value="${index}"><span>${esc(tag.name)}</span></label>`).join("")}<label>Tag to scratch<select name="cost">${costs.map((tag, index) => `<option value="${index}">${esc(tag.themeName)} — ${esc(tag.name)}</option>`).join("")}</select></label>`,
      render: (_event, dialog) => {
        for (const box of dialog.element.querySelectorAll('[name="restore"]')) box.addEventListener('change', () => {
          if (dialog.element.querySelectorAll('[name="restore"]:checked').length > 2) box.checked = false;
        });
      },
      buttons: [{ action: "cancel", label: "Cancel", callback: () => null },
        { action: "use", label: "Use Second Wind", callback: (_event, button) => ({
          restores: [...button.form.querySelectorAll('[name="restore"]:checked')].map(box => { const { field, index, name } = restores[Number(box.value)]; return { field, index, name }; }),
          cost: (({ field, index, name, themeUuid }) => ({ field, index, name, themeUuid }))(costs[Number(button.form.elements.cost.value)])
        }) }], rejectClose: false
    });
    if (!result) return true;
  }
  await operation({ themeUuid: theme.uuid, used: true, ...result });
  return true;
}
export async function applySecondWind(payload, user) {
  const theme = await fromUuid(payload.themeUuid), actor = theme?.parent;
  if (!user || !has(theme) || !(user.isGM || actor?.testUserPermission(user, "OWNER")) || !(game.user.isGM || actor?.isOwner)) throw new Error("Only the Hero’s owner or Narrator can use Second Wind.");
  const path = `flags.${MODULE_ID}.${SPECIAL_USES}.${KEY}`;
  if (payload.used === false) { await theme.update({ [path]: false }); return true; }
  if (specialUsed(theme, KEY)) return true;
  const pending = theme.getFlag(MODULE_ID, "secondWindPending") ?? { id: foundry.utils.randomID(), restores: payload.restores, cost: payload.cost };
  if (!Array.isArray(pending.restores) || pending.restores.length < 1 || pending.restores.length > 2 || new Set(pending.restores.map(tag => `${tag.field}:${tag.index}`)).size !== pending.restores.length) throw new Error("Choose one or two scratched tags to recover.");
  if (pending.cost?.field !== "powertags") throw new Error("Choose an unscratched power tag on another theme as the cost.");
  const costTheme = pending.cost && await fromUuid(pending.cost.themeUuid);
  if (!costTheme || costTheme.parent?.uuid !== actor.uuid || costTheme.id === theme.id || costTheme.type !== "themebook" || costTheme.system.options?.isStoryTheme) throw new Error("Choose a tag on another theme as the cost.");
  const restoreFields = {};
  for (const entry of pending.restores) {
    if (entry.field !== "powertags" || !Number.isInteger(entry.index)) throw new Error("The selected tags changed. Choose them again.");
    const tags = restoreFields[entry.field] ??= foundry.utils.deepClone(theme.system[entry.field] ?? []), tag = tags[entry.index];
    if (!tag || tag.name !== entry.name || !tag.burned || tag.planned || tag.expired) throw new Error("The selected scratched tags changed. Choose them again.");
    Object.assign(tag, { burned: false, toBurn: false, selected: false });
  }
  const receipt = `${theme.uuid}:${pending.id}`, costs = foundry.utils.deepClone(costTheme.getFlag(MODULE_ID, "secondWindCosts") ?? []);
  if (!costs.includes(receipt)) {
    const entry = pending.cost;
    if (entry.field !== "powertags" || !Number.isInteger(entry.index)) throw new Error("Choose an unscratched tag to pay the cost.");
    const tags = foundry.utils.deepClone(costTheme.system[entry.field] ?? []), tag = tags[entry.index];
    if (!tag || tag.name !== entry.name || tag.burned || tag.planned || tag.expired) throw new Error("The tag chosen as the cost changed. Choose it again.");
    if (!theme.getFlag(MODULE_ID, "secondWindPending")) await theme.update({ [`flags.${MODULE_ID}.secondWindPending`]: pending });
    Object.assign(tag, { burned: true, toBurn: false, selected: false }); costs.push(receipt);
    await costTheme.update({ [`system.${entry.field}`]: tags, [`flags.${MODULE_ID}.secondWindCosts`]: costs }, { litmQolRequiredScratch: true });
  }
  await theme.update({ ...Object.fromEntries(Object.entries(restoreFields).map(([field, tags]) => [`system.${field}`, tags])),
    [path]: true, [`flags.${MODULE_ID}.-=secondWindPending`]: null });
  return true;
}
