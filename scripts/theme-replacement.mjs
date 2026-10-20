import { usesDiligentTrack } from "./diligent-drudge.mjs";
import { chooseThemeDocument } from "./theme-browser.mjs";
import { openQolThemekitSelector } from "./themekit-selector.mjs";
import { awardPromise, promiseProjection } from "./promise-manager.mjs";

const MODULE_ID = "litm-smeeth-qol";
const NASCENT_FLAG = "nascentTheme";
const DRAFT_FLAG = "replacementDraft";
const NAV_BACK = "back";
const NAV_CANCEL = "cancel";
const nascentPrompts = new Set();

function rootElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function appActor(app) {
  const actor = app?.actor ?? (app?.document?.documentName === "Actor" ? app.document : null);
  return actor?.documentName === "Actor" ? actor : null;
}

function isCharacter(actor) {
  return actor && ["character", "litm-character"].includes(actor.type);
}

function filled(tag) {
  return Boolean(String(tag?.name ?? "").trim());
}

function visible(tag) {
  return filled(tag) && !tag.planned;
}

function themeDisplayName(theme) {
  const themeName = String(theme?.name ?? "Theme").trim() || "Theme";
  const titleTag = (theme?.system?.powertags ?? []).find(tag => visible(tag));
  const title = String(titleTag?.name ?? "").trim();
  return title ? `${themeName} – ${title}` : themeName;
}

function normalizedThemeType(value) {
  return ["litm-origin", "litm-adventure", "litm-greatness", "litm-variable"].includes(value)
    ? value
    : "litm-origin";
}

function cleanTag(tag, overrides = {}) {
  return {
    name: String(tag?.name ?? "").trim(),
    question: String(tag?.question ?? ""),
    burned: false,
    toBurn: false,
    planned: false,
    selected: false,
    ...overrides
  };
}

function isNascent(theme) {
  return theme?.getFlag?.(MODULE_ID, NASCENT_FLAG) === true;
}

function dialogClasses() {
  return ["litm-qol-system-dialog", "litm-qol-replace-theme-window"];
}

function cancelButton() {
  return {
    action: "cancel",
    label: "Cancel",
    icon: "fa-solid fa-xmark",
    class: "litm-qol-replace-cancel",
    callback: () => ({ navigation: NAV_CANCEL })
  };
}

function backButton() {
  return {
    action: "back",
    label: "Back",
    icon: "fa-solid fa-arrow-left",
    class: "litm-qol-replace-back",
    callback: () => ({ navigation: NAV_BACK })
  };
}

function primaryButton(action, label, callback, icon = "fa-solid fa-arrow-right") {
  return { action, label, icon, class: "litm-qol-replace-primary", default: true, callback };
}

function isBack(result) {
  return result?.navigation === NAV_BACK;
}

function isCancel(result) {
  return result?.navigation === NAV_CANCEL || result === null;
}

function selected(form, name) {
  return form?.querySelector(`input[type="checkbox"][name="${name}"]:checked`) ?? null;
}

function setButtonDisabled(root, action, disabled) {
  const button = root.querySelector(`button[data-action="${action}"]`);
  if (button) button.disabled = Boolean(disabled);
}

function bindExclusive(root, name, onChange) {
  const boxes = [...root.querySelectorAll(`input[type="checkbox"][name="${name}"]`)];
  const update = () => onChange?.(boxes.find(box => box.checked) ?? null, root);
  for (const box of boxes) {
    box.addEventListener("change", () => {
      if (box.checked) for (const other of boxes) if (other !== box) other.checked = false;
      update();
    });
  }
  update();
}

function promiseCalculation(actor, theme) {
  const powers = (theme.system.powertags ?? []).filter(visible).length;
  const weaknesses = (theme.system.weaknesstags ?? []).filter(visible).length;
  const improvements = (theme.system.specialImprovements ?? []).filter(improvement => improvement.active).length;
  const extraPowers = Math.max(0, powers - 3);
  const extraWeaknesses = Math.max(0, weaknesses - 1);
  const total = 1 + extraPowers + extraWeaknesses + improvements;
  const projection = promiseProjection(actor, total);
  return { powers, weaknesses, improvements, extraPowers, extraWeaknesses, total, ...projection, applied: projection.visibleGain };
}

async function showReplacementSummary(actor, theme, promise) {
  const displayName = themeDisplayName(theme);
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Replace Theme — ${displayName}` },
    classes: dialogClasses(),
    content: `
      <div class="litm-qol-replace-dialog">
        <h3>Replacing this theme</h3>
        <p>The old theme will be removed only after its replacement is ready and you confirm.</p>
        <ul class="litm-qol-promise-summary">
          <li>Replacing the theme: <strong>+1 Promise</strong></li>
          <li>Active power tags beyond the third (${promise.extraPowers}): <strong>+${promise.extraPowers}</strong></li>
          <li>Active weakness tags beyond the first (${promise.extraWeaknesses}): <strong>+${promise.extraWeaknesses}</strong></li>
          <li>Active Special Improvements (${promise.improvements}): <strong>+${promise.improvements}</strong></li>
        </ul>
        <p><strong>${promise.total} Promise earned.</strong> Promise will change from ${promise.before} to ${promise.after}${promise.overflowGain ? `, with ${promise.overflowAfter} stored for after fulfillment` : ""}.</p>
        <p>The replacement begins as a <strong>Nascent Theme</strong> with one active title tag.</p>
        <p>See Replacing a Theme, Core Book Vol. I, page 192.</p>
      </div>`,
    buttons: [cancelButton(), primaryButton("next", "Choose Replacement", () => ({ proceed: true }))],
    rejectClose: false
  });
}

async function chooseReplacementMethod() {
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Replace Theme — Choose a Source" },
    classes: dialogClasses(),
    content: `
      <div class="litm-qol-replace-dialog litm-qol-replace-methods">
        <p>Choose how to create the nascent replacement theme.</p>
        <label><input type="checkbox" name="replacementMethod" value="themekit"> <strong>Themekit</strong></label>
        <label><input type="checkbox" name="replacementMethod" value="themebook"> <strong>Themebook</strong></label>
      </div>`,
    render: (_event, dialog) => bindExclusive(dialog.element, "replacementMethod", choice => {
      setButtonDisabled(dialog.element, "next", !choice);
    }),
    buttons: [
      cancelButton(),
      backButton(),
      primaryButton("next", "Next", (_event, button) => selected(button.form, "replacementMethod")?.value ?? null)
    ],
    rejectClose: false
  });
}

export async function chooseThemebookSource({ title = "Replace Theme — Select Themebook" } = {}) {
  return chooseThemeDocument({ type: "themebook", title, back: true });
}

function cloneThemebookSource(source, oldTheme) {
  const data = foundry.utils.deepClone(source.toObject());
  delete data._id;
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  delete data._stats;
  data.type = "themebook";
  data.system ??= {};
  data.system.type = normalizedThemeType(data.system.type);
  data.system.color = normalizedThemeType(data.system.color || data.system.type);
  data.system.tabCategory = oldTheme.system.tabCategory ?? "main";
  data.flags ??= {};
  data.flags[MODULE_ID] = { [NASCENT_FLAG]: true };
  return data;
}

function questionOptions(tags) {
  return tags.map((tag, index) => ({ tag, index }))
    .filter(({ tag }) => String(tag?.question || tag?.name || "").trim())
    .map(({ tag, index }) => {
      const question = String(tag.question || tag.name).trim();
      return `<option value="${index}" data-answer="${foundry.utils.escapeHTML(String(tag.name ?? ""))}">${foundry.utils.escapeHTML(question)}</option>`;
    }).join("");
}

async function configureNascentTheme(data) {
  const powers = foundry.utils.deepClone(data.system.powertags ?? []);
  const weaknesses = foundry.utils.deepClone(data.system.weaknesstags ?? []);
  const titleQuestion = String(powers[0]?.question || powers[0]?.name || "").trim();
  const weaknessOptions = questionOptions(weaknesses);
  if (!titleQuestion || !weaknessOptions) {
    ui.notifications.warn("That Themebook needs at least one power-tag question and one weakness-tag question.");
    return null;
  }
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Replace Theme — Define the Nascent Theme" },
    classes: dialogClasses(),
    content: `
      <div class="litm-qol-replace-dialog litm-qol-nascent-config">
        <label><strong>Theme name</strong><input type="text" name="themeName" value="${foundry.utils.escapeHTML(data.name ?? "Nascent Theme")}"></label>
        <fieldset><legend>Title tag</legend>
          <p class="litm-qol-fixed-question"><strong>${foundry.utils.escapeHTML(titleQuestion)}</strong></p>
          <label><strong>Your answer</strong><input type="text" name="titleName" value="${foundry.utils.escapeHTML(String(powers[0]?.name ?? ""))}" placeholder="Title tag answer"></label>
        </fieldset>
        <label><strong>Quest</strong><textarea name="quest" rows="3" placeholder="What does this theme demand?">${foundry.utils.escapeHTML(data.system.quest ?? "")}</textarea></label>
        <fieldset><legend>Weakness tag</legend>
          <label><strong>Choose a weakness-tag question</strong><select name="weaknessIndex">${weaknessOptions}</select></label>
          <label><strong>Your answer</strong><input type="text" name="weaknessName" placeholder="Weakness tag answer"></label>
        </fieldset>
      </div>`,
    render: (_event, dialog) => {
      const root = dialog.element;
      const update = () => {
        const valid = root.querySelector('[name="titleName"]').value.trim() &&
          root.querySelector('[name="weaknessName"]').value.trim() &&
          root.querySelector('[name="themeName"]').value.trim() && root.querySelector('[name="quest"]').value.trim();
        setButtonDisabled(root, "next", !valid);
      };
      const syncAnswer = (selectName, inputName) => {
        const select = root.querySelector(`[name="${selectName}"]`);
        const input = root.querySelector(`[name="${inputName}"]`);
        input.value = select.selectedOptions[0]?.dataset.answer ?? "";
        update();
      };
      root.querySelector('[name="weaknessIndex"]').addEventListener("change", () => syncAnswer("weaknessIndex", "weaknessName"));
      for (const input of root.querySelectorAll("input, textarea, select")) input.addEventListener("input", update);
      syncAnswer("weaknessIndex", "weaknessName");
      update();
    },
    buttons: [
      cancelButton(),
      backButton(),
      primaryButton("next", "Next", (_event, button) => {
        const form = button.form;
        return {
          themeName: form.elements.themeName.value.trim(),
          quest: form.elements.quest.value.trim(),
          titleName: form.elements.titleName?.value.trim(),
          weaknessIndex: Number(form.elements.weaknessIndex?.value),
          weaknessName: form.elements.weaknessName?.value.trim()
        };
      })
    ],
    rejectClose: false
  });
  if (isBack(result) || isCancel(result)) return result;

  const title = cleanTag(powers[0], { name: result.titleName });
  const weakness = cleanTag(weaknesses[result.weaknessIndex], { name: result.weaknessName });
  if (!title || !weakness) return null;

  const remainingPowers = powers.slice(1)
    .filter(tag => String(tag?.question || tag?.name || "").trim()).map(tag => cleanTag(tag, { planned: true }));
  const remainingWeaknesses = weaknesses.filter((_tag, index) => index !== result.weaknessIndex)
    .filter(tag => String(tag?.question || tag?.name || "").trim()).map(tag => cleanTag(tag, { planned: true }));
  data.name = result.themeName;
  data.system.quest = result.quest;
  data.system.powertags = [cleanTag(title), ...remainingPowers];
  data.system.weaknesstags = [cleanTag(weakness), ...remainingWeaknesses];
  data.system.specialImprovements = (data.system.specialImprovements ?? []).map(improvement => ({ ...improvement, active: false }));
  data.system.abandon = 0;
  data.system.improve = 0;
  data.system.milestone = 0;
  return data;
}

async function createThemekitDraft(actor, oldTheme) {
  const [draft] = await actor.createEmbeddedDocuments("Item", [{
    name: "Nascent Theme (Draft)",
    type: "themebook",
    system: { type: oldTheme.system.type ?? "litm-origin", tabCategory: oldTheme.system.tabCategory ?? "main", powertags: [], weaknesstags: [] },
    flags: { [MODULE_ID]: { [DRAFT_FLAG]: true } }
  }]);
  return draft;
}

async function openImprovedThemekitSelector(actor, draft) {
  const themekit = await openQolThemekitSelector(actor, draft, { themebookName: null });
  return themekit ? draft : null;
}

async function configureThemekitWeakness(draft) {
  const weaknesses = foundry.utils.deepClone(draft.system.weaknesstags ?? []).filter(filled);
  const options = questionOptions(weaknesses);
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Replace Theme — Starting Weakness" },
    classes: dialogClasses(),
    content: `
      <div class="litm-qol-replace-dialog">
        <p>The Themekit supplies the title tag and quest. Choose the nascent theme's starting weakness.</p>
        <label class="${options ? "" : "disabled"}"><input type="checkbox" name="weaknessMode" value="existing" ${options ? "checked" : "disabled"}> Choose a Themekit weakness</label>
        <select name="weaknessIndex" ${options ? "" : "disabled"}>${options || "<option>No Themekit weaknesses</option>"}</select>
        <label><input type="checkbox" name="weaknessMode" value="create" ${options ? "" : "checked"}> Create a weakness</label>
        <input type="text" name="weaknessName" placeholder="Weakness tag" ${options ? "disabled" : ""}>
      </div>`,
    render: (_event, dialog) => {
      const root = dialog.element;
      const update = choice => {
        root.querySelector('[name="weaknessIndex"]').disabled = choice?.value !== "existing" || !options;
        root.querySelector('[name="weaknessName"]').disabled = choice?.value !== "create";
        const valid = choice?.value === "existing" || (choice?.value === "create" && root.querySelector('[name="weaknessName"]').value.trim());
        setButtonDisabled(root, "next", !valid);
      };
      bindExclusive(root, "weaknessMode", update);
      root.querySelector('[name="weaknessName"]').addEventListener("input", () => update(selected(root, "weaknessMode")));
    },
    buttons: [
      cancelButton(),
      backButton(),
      primaryButton("next", "Next", (_event, button) => ({
        mode: selected(button.form, "weaknessMode")?.value,
        index: Number(button.form.elements.weaknessIndex?.value),
        name: button.form.elements.weaknessName?.value.trim()
      }))
    ],
    rejectClose: false
  });
  if (isBack(result) || isCancel(result)) return result;

  const powers = foundry.utils.deepClone(draft.system.powertags ?? []).filter(filled);
  if (!powers.length || !String(draft.system.quest ?? "").trim()) {
    ui.notifications.warn("That Themekit needs at least one power tag and a quest to create a nascent theme.");
    return null;
  }
  const selectedWeakness = result.mode === "existing" ? weaknesses[result.index] : cleanTag({ name: result.name });
  if (!selectedWeakness) return null;
  const otherWeaknesses = weaknesses.filter((_tag, index) => result.mode !== "existing" || index !== result.index).map(tag => cleanTag(tag, { planned: true }));
  const themekit = draft.system.themeKitUUID ? await fromUuid(draft.system.themeKitUUID) : null;
  const themeType = normalizedThemeType(themekit?.system?.themebook_type || draft.system.type);
  return {
    name: themekit?.system?.themekit_type || themekit?.name || "Nascent Theme",
    system: {
      powertags: [cleanTag(powers[0]), ...powers.slice(1).map(tag => cleanTag(tag, { planned: true }))],
      weaknesstags: [cleanTag(selectedWeakness), ...otherWeaknesses],
      specialImprovements: (draft.system.specialImprovements ?? []).map(improvement => ({ ...improvement, active: false })),
      quest: draft.system.quest,
      story: draft.system.story,
      type: themeType,
      color: themeType,
      themeKitUUID: draft.system.themeKitUUID,
      tabCategory: draft.system.tabCategory,
      abandon: 0,
      improve: 0,
      milestone: 0
    }
  };
}

async function confirmReplacement(theme, prepared, promise) {
  const title = prepared.system.powertags?.[0]?.name ?? "Untitled";
  const weakness = prepared.system.weaknesstags?.[0]?.name ?? "None";
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Replace Theme — Final Confirmation" },
    classes: dialogClasses(),
    content: `
      <div class="litm-qol-replace-dialog">
        <p><strong>${foundry.utils.escapeHTML(themeDisplayName(theme))}</strong> will be permanently removed and replaced with:</p>
        <ul>
          <li>Theme: <strong>${foundry.utils.escapeHTML(prepared.name)}</strong></li>
          <li>Title tag: <strong>${foundry.utils.escapeHTML(title)}</strong></li>
          <li>Quest: ${foundry.utils.escapeHTML(prepared.system.quest)}</li>
          <li>Weakness: <strong>${foundry.utils.escapeHTML(weakness)}</strong></li>
          <li>Promise earned: <strong>${promise.total}</strong>${promise.overflowGain ? ` (${promise.overflowAfter} will be stored for after fulfillment)` : ""}</li>
        </ul>
      </div>`,
    buttons: [
      cancelButton(),
      backButton(),
      primaryButton("confirm", "Replace Theme", () => ({ confirmed: true }), "fa-solid fa-arrows-rotate")
    ],
    rejectClose: false
  });
}

async function cleanupDraft(actor, draft) {
  if (draft && actor.items.get(draft.id)) await actor.deleteEmbeddedDocuments("Item", [draft.id]);
}

async function replaceCardLayout(actor, oldTheme, newTheme) {
  const layout = foundry.utils.deepClone(actor.system.cardLayout ?? []);
  const oldKey = `themebook:${oldTheme.id}`;
  const newKey = `themebook:${newTheme.id}`;
  let replaced = false;
  const updated = [];
  for (const entry of layout) {
    if (entry.key === newKey) continue;
    if (entry.key === oldKey) {
      updated.push({ ...entry, key: newKey });
      replaced = true;
    } else updated.push(entry);
  }
  if (replaced) await actor.update({ "system.cardLayout": updated });
}

async function sendReplacementSummary(actor, oldThemeName, newTheme, promise) {
  const gmIds = game.users.filter(user => user.isGM).map(user => user.id);
  if (!gmIds.length) return;
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: gmIds,
    content: `
      <div class="litm-qol-improve-chat-summary">
        <h3><i class="fa-solid fa-arrows-rotate"></i> Theme Replaced</h3>
        <p><strong>${foundry.utils.escapeHTML(actor.name)}</strong> replaced <strong>${foundry.utils.escapeHTML(oldThemeName)}</strong> with the nascent theme <strong>${foundry.utils.escapeHTML(themeDisplayName(newTheme))}</strong>.</p>
        <p>Promise earned: <strong>${promise.earned}</strong>. Promise is now ${promise.after}${promise.overflowAfter ? `, with ${promise.overflowAfter} stored` : ""}.</p>
      </div>`
  });
}

async function commitReplacement(actor, oldTheme, prepared, promise, draft) {
  const oldThemeName = themeDisplayName(oldTheme);
  let newTheme = draft;
  if (draft) {
    await draft.update({
      name: prepared.name,
      system: prepared.system,
      [`flags.${MODULE_ID}.${NASCENT_FLAG}`]: true,
      [`flags.${MODULE_ID}.${DRAFT_FLAG}`]: false
    });
  } else {
    const [created] = await actor.createEmbeddedDocuments("Item", [prepared]);
    newTheme = created;
  }
  await replaceCardLayout(actor, oldTheme, newTheme);
  await actor.deleteEmbeddedDocuments("Item", [oldTheme.id]);
  const awarded = await awardPromise(actor, promise.total);
  await sendReplacementSummary(actor, oldThemeName, newTheme, { ...promise, ...awarded });
  return newTheme;
}

export async function runReplaceTheme(actor, oldTheme, { allowWithoutAbandon = false } = {}) {
  if (!isCharacter(actor) || !oldTheme || (!allowWithoutAbandon && Number(oldTheme.system.abandon ?? 0) < 3)) return null;
  const promise = promiseCalculation(actor, oldTheme);
  const intro = await showReplacementSummary(actor, oldTheme, promise);
  if (isCancel(intro)) return;

  while (true) {
    const method = await chooseReplacementMethod();
    if (isCancel(method)) return;
    if (isBack(method)) {
      const again = await showReplacementSummary(actor, oldTheme, promise);
      if (isCancel(again)) return;
      continue;
    }

    let draft = null;
    let prepared = null;
    try {
      if (method === "themekit") {
        draft = await createThemekitDraft(actor, oldTheme);
        const selectedDraft = await openImprovedThemekitSelector(actor, draft);
        if (!selectedDraft) return await cleanupDraft(actor, draft);
        const config = await configureThemekitWeakness(draft);
        if (isCancel(config)) return await cleanupDraft(actor, draft);
        if (isBack(config)) {
          await cleanupDraft(actor, draft);
          continue;
        }
        if (!config) return await cleanupDraft(actor, draft);
        prepared = config;
      } else if (method === "themebook") {
        const source = await chooseThemebookSource();
        if (isCancel(source)) return;
        if (isBack(source)) continue;
        if (!source) return;
        prepared = await configureNascentTheme(cloneThemebookSource(source, oldTheme));
        if (isCancel(prepared)) return;
        if (isBack(prepared)) continue;
      }

      if (!prepared) return;
      const confirmation = await confirmReplacement(oldTheme, prepared, promise);
      if (isCancel(confirmation)) {
        await cleanupDraft(actor, draft);
        return;
      }
      if (isBack(confirmation)) {
        await cleanupDraft(actor, draft);
        continue;
      }

      const newTheme = await commitReplacement(actor, oldTheme, prepared, promise, draft);
      ui.notifications.info(`${themeDisplayName(oldTheme)} was replaced.`);
      return newTheme;
    } catch (error) {
      await cleanupDraft(actor, draft);
      throw error;
    }
  }
}

async function promptNascentPowerTag(theme) {
  const tags = foundry.utils.deepClone(theme.system.powertags ?? []);
  const planned = tags.map((tag, index) => ({ tag, index }))
    .filter(({ tag }) => tag?.planned && String(tag.name || tag.question || "").trim());
  const options = planned.map(({ tag, index }) => `<option value="${index}">${foundry.utils.escapeHTML(String(tag.name || tag.question))}</option>`).join("");
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `Develop Nascent Theme — ${themeDisplayName(theme)}` },
    classes: dialogClasses(),
    content: `
      <div class="litm-qol-replace-dialog">
        <p>Spend this Improve to add one power tag.</p>
        <label class="${options ? "" : "disabled"}"><input type="checkbox" name="tagMode" value="planned" ${options ? "checked" : "disabled"}> Choose a planned tag</label>
        <select name="plannedIndex" ${options ? "" : "disabled"}>${options || "<option>No planned tags</option>"}</select>
        <label><input type="checkbox" name="tagMode" value="create" ${options ? "" : "checked"}> Create a new tag</label>
        <input type="text" name="tagName" placeholder="New power tag" ${options ? "disabled" : ""}>
      </div>`,
    render: (_event, dialog) => {
      const root = dialog.element;
      const update = choice => {
        root.querySelector('[name="plannedIndex"]').disabled = choice?.value !== "planned" || !options;
        root.querySelector('[name="tagName"]').disabled = choice?.value !== "create";
        const valid = (choice?.value === "planned" && options) ||
          (choice?.value === "create" && root.querySelector('[name="tagName"]').value.trim());
        setButtonDisabled(root, "confirm", !valid);
      };
      bindExclusive(root, "tagMode", update);
      root.querySelector('[name="tagName"]').addEventListener("input", () => update(selected(root, "tagMode")));
    },
    buttons: [
      cancelButton(),
      primaryButton("confirm", "Add Tag", (_event, button) => ({
        mode: selected(button.form, "tagMode")?.value,
        index: Number(button.form.elements.plannedIndex?.value),
        name: button.form.elements.tagName?.value.trim()
      }), "fa-solid fa-plus")
    ],
    rejectClose: false
  });
  if (isCancel(result)) return null;
  return result;
}

async function sendNascentSummary(actor, theme, tagName, matured) {
  const gmIds = game.users.filter(user => user.isGM).map(user => user.id);
  if (!gmIds.length) return;
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: gmIds,
    content: `<div class="litm-qol-improve-chat-summary"><h3>Nascent Theme Developed</h3><p><strong>${foundry.utils.escapeHTML(actor.name)}</strong> added <strong>${foundry.utils.escapeHTML(tagName)}</strong> to <strong>${foundry.utils.escapeHTML(themeDisplayName(theme))}</strong>.</p>${matured ? "<p>The theme now has three active power tags and is no longer nascent.</p>" : ""}</div>`
  });
}

async function developNascentTheme(actor, theme) {
  if (usesDiligentTrack(theme) || !isNascent(theme) || Number(theme.system.improve ?? 0) < 1 || nascentPrompts.has(theme.id)) return;
  nascentPrompts.add(theme.id);
  try {
    const choice = await promptNascentPowerTag(theme);
    if (!choice) return;
    const tags = foundry.utils.deepClone(theme.system.powertags ?? []);
    let tagName;
    if (choice.mode === "planned" && tags[choice.index]?.planned) {
      tags[choice.index] = cleanTag(tags[choice.index], { name: String(tags[choice.index].name || tags[choice.index].question || "").trim(), planned: false });
      tagName = tags[choice.index].name;
    } else if (choice.mode === "create" && choice.name) {
      tags.push(cleanTag({ name: choice.name }));
      tagName = choice.name;
    } else return;
    const activeCount = tags.filter(visible).length;
    const matured = activeCount >= 3;
    await theme.update({
      "system.powertags": tags,
      "system.improve": 0,
      [`flags.${MODULE_ID}.${NASCENT_FLAG}`]: !matured
    });
    await sendNascentSummary(actor, theme, tagName, matured);
    ui.notifications.info(matured ? `${themeDisplayName(theme)} is no longer nascent.` : `${tagName} added to ${themeDisplayName(theme)}.`);
  } catch (error) {
    console.error(`${MODULE_ID} | Could not develop nascent theme.`, error);
    ui.notifications.error("The nascent theme could not be developed.");
  } finally {
    nascentPrompts.delete(theme.id);
  }
}

function actionRow(container) {
  const existing = container.querySelector(".litm-qol-theme-action-row");
  if (existing) return existing;
  const row = document.createElement("div");
  row.className = "litm-qol-theme-action-row";
  const header = container.querySelector(".themebook-item") ?? container.querySelector(".theme-name");
  header?.insertAdjacentElement("afterend", row);
  return row;
}

function buttonStack(row) {
  let stack = row.querySelector(".litm-qol-theme-button-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "litm-qol-theme-button-stack";
    row.append(stack);
  }
  return stack;
}

function renderThemeReplacement(app, html) {
  const actor = appActor(app);
  const root = rootElement(html);
  if (!isCharacter(actor) || !root || (!actor.isOwner && !game.user.isGM)) return;
  for (const container of root.querySelectorAll(".themebook-container[data-id]")) {
    const theme = actor.items.get(container.dataset.id);
    if (!theme || theme.type !== "themebook" || theme.system.options?.isStoryTheme) continue;
    const row = actionRow(container);
    if (!row) continue;

    if (isNascent(theme) && !usesDiligentTrack(theme)) {
      container.classList.add("litm-qol-nascent-theme");
      let nascentGroup = row.querySelector(".litm-qol-nascent-actions");
      if (!nascentGroup) {
        nascentGroup = document.createElement("div");
        nascentGroup.className = "litm-qol-nascent-actions";
        row.prepend(nascentGroup);
      }
      if (!nascentGroup.querySelector(".litm-qol-nascent-badge")) {
        const badge = document.createElement("span");
        badge.className = "litm-qol-nascent-badge";
        badge.textContent = "Nascent";
        badge.dataset.tooltip = "This theme is still developing. Each Improve adds a power tag until it has three active power tags.";
        nascentGroup.append(badge);
      }
      if (Number(theme.system.improve ?? 0) >= 1 && !nascentGroup.querySelector(".litm-qol-develop-theme-button")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "litm-qol-develop-theme-button";
        button.innerHTML = '<i class="fa-solid fa-seedling"></i> Develop Theme';
        button.addEventListener("click", event => { event.preventDefault(); developNascentTheme(actor, theme); });
        nascentGroup.append(button);
      }
    }

    if (Number(theme.system.abandon ?? 0) >= 3 && !row.querySelector(".litm-qol-replace-theme-button")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "litm-qol-replace-theme-button";
      button.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Replace Theme';
      button.addEventListener("click", event => { event.preventDefault(); runReplaceTheme(actor, theme); });
      buttonStack(row).append(button);
    }
  }
}

Hooks.on("renderActorSheet", renderThemeReplacement);
Hooks.on("renderApplicationV2", (app, html) => {
  if (appActor(app)) renderThemeReplacement(app, html);
});
Hooks.on("updateItem", (item, changes, _options, userId) => {
  const changedImprove = foundry.utils.hasProperty(changes, "system.improve") ||
    (foundry.utils.hasProperty(changes, "system") && Object.hasOwn(changes.system ?? {}, "improve"));
  if (changedImprove && item.parent?.sheet?.rendered) {
    setTimeout(() => item.parent.sheet.render(false), 0);
  }
  if (userId !== game.user.id || usesDiligentTrack(item) || !isNascent(item) || Number(item.system.improve ?? 0) < 1) return;
  if (!changedImprove) return;
  const actor = item.parent;
  if (!isCharacter(actor) || (!actor.isOwner && !game.user.isGM)) return;
  setTimeout(() => developNascentTheme(actor, item), 0);
});
