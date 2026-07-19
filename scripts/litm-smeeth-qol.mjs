import { awardPromise } from "./promise-manager.mjs";
import "./moment-of-fulfillment.mjs";
import { runReplaceTheme } from "./theme-replacement.mjs";
import "./theme-evolution.mjs";
import "./fellowship-development.mjs";
import "./hero-creator.mjs";

const MODULE_ID = "litm-smeeth-qol";
const SINGLE_USE_FLAG = "singleUseFloatingTags";
const REFORGED_IMPROVEMENTS_FLAG = "reforgedFreeImprovements";
const RETIREMENT_FLAG = "journeysEndRetirement";

const VALUABLE_DETAIL_TOOLTIP = `Learn a useful fact suited to how your Hero investigated. Further questions may require more Power. See Core Book Vol. I, page 155.`;

const EXTRA_FEAT_TOOLTIP = `Gain an additional narrative benefit achievable within the described action. This does not create or alter tags or statuses. See Core Book Vol. I, page 157.`;

const DETAILED_PUSH_YOUR_LUCK_TOOLTIP = `After a 10+ Detailed roll, you may accept Consequences to gain +1 Power. See Core Book Vol. I, page 158.`;

const QUICK_PUSH_YOUR_LUCK_TOOLTIP = `After a 10+ Quick roll, you may accept Consequences to turn the result into a Great Success, as determined by the Narrator. See Core Book Vol. I, page 158.`;


const REACTION_ANY_EFFECT_TOOLTIP = `On a 10+ Reaction, Power may also buy Effects reasonably achievable through the described response, subject to the Narrator’s judgment. See Core Book Vol. I, page 162.`;

const REACTION_LESSEN_OPTIONS = `
<ul class="litm-qol-reaction-options">
  <li>Prevent a story tag from being added – 2 Power</li>
  <li>Prevent the loss of a power or story tag – 2 Power</li>
  <li>Avoid incoming status – 1 Power per tier</li>
  <li>Avoid losing existing status – 1 Power per tier</li>
</ul>`;

const REACTION_NEUTRAL = `
<span class="litm-qol-reaction-neutral">You succeed and may spend Power to lessen the Consequences.</span>
${REACTION_LESSEN_OPTIONS}
<p>See Core Book Vol. I, page 162.</p>`;

const REACTION_SUCCESS = `
<span class="litm-qol-reaction-success">Spend Power to lessen Consequences and/or on ${rulesTooltip("any Effect", REACTION_ANY_EFFECT_TOOLTIP)}.</span>
${REACTION_LESSEN_OPTIONS}
<p>See Core Book Vol. I, page 162.</p>`;

const SINGLE_USE_RULES = `When only 1 Power remains to spend, you may create a single-use story tag. It contributes normally, is scratched after use, and cannot be burned for Power. See Core Book Vol. I, pages 158 and 165.`;

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "&#10;");
}

function rulesTooltip(label, tooltip) {
  return `<span class="litm-qol-rules-tooltip" data-tooltip="${escapeAttribute(tooltip)}" data-tooltip-direction="UP" tabindex="0">${label}</span>`;
}

function pushYourLuckNotice(tooltip) {
  return `<span class="litm-qol-push-your-luck-notice">You may accept consequences to ${rulesTooltip("Push Your Luck", tooltip)}</span>`;
}

function singleUseButton() {
  return `<button type="button" class="litm-qol-create-single-use" data-action="litmQolCreateSingleUse">Create Single-Use Story Tag</button> – 1 Power Remaining`;
}

const SPEND_POWER_LIST = `
<p>Spend your power:</p>
<ul>
  <li>Add or give or recover a tag – 2 Power</li>
  <li>Scratch a tag – 2 Power</li>
  <li>Give a status – 1 Power per tier</li>
  <li>Reduce a status – 1 Power per tier</li>
  <li>Discover a ${rulesTooltip("valuable detail", VALUABLE_DETAIL_TOOLTIP)} – 1 Power</li>
  <li>Perform an ${rulesTooltip("extra feat", EXTRA_FEAT_TOOLTIP)} – 1 Power</li>
  <li>${singleUseButton()}</li>
</ul>`;

const DETAILED_NEUTRAL = `
<p>The action succeeds, but the Narrator also introduces a relevant Consequence.</p>
${SPEND_POWER_LIST}`;

const DETAILED_SUCCESS = `
${pushYourLuckNotice(DETAILED_PUSH_YOUR_LUCK_TOOLTIP)}
${SPEND_POWER_LIST}
<p>No Consequences.</p>`;

const QUICK_SUCCESS = `
${pushYourLuckNotice(QUICK_PUSH_YOUR_LUCK_TOOLTIP)}
<span class="litm-qol-result-body">The action succeeds and achieves its intended purpose.</span>`;

function applyRollText() {
  if (game.system.id !== "mist-engine-fvtt") return;

  const replacements = {
    "MIST_ENGINE.MOVES.LEGEND.quick.success": QUICK_SUCCESS,
    "MIST_ENGINE.MOVES.LEGEND.detailed.neutral": DETAILED_NEUTRAL,
    "MIST_ENGINE.MOVES.LEGEND.detailed.success": DETAILED_SUCCESS,
    "MIST_ENGINE.MOVES.LEGEND.reaction.neutral": REACTION_NEUTRAL,
    "MIST_ENGINE.MOVES.LEGEND.reaction.success": REACTION_SUCCESS
  };

  for (const [key, value] of Object.entries(replacements)) {
    foundry.utils.setProperty(game.i18n.translations, key, value);
    if (game.i18n._fallback) foundry.utils.setProperty(game.i18n._fallback, key, value);
  }
}

function getRootElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function actorFromMessage(message) {
  const actorId = message?.speaker?.actor;
  return actorId ? game.actors.get(actorId) : null;
}

function getActorFromApp(app) {
  const actor = app?.actor ?? (app?.document?.documentName === "Actor" ? app.document : null);
  return actor?.documentName === "Actor" ? actor : null;
}

function isCharacterActor(actor) {
  return actor && ["character", "litm-character"].includes(actor.type);
}

function getSingleUseRecords(actor) {
  const records = actor.getFlag(MODULE_ID, SINGLE_USE_FLAG);
  return Array.isArray(records) ? records : [];
}

async function createSingleUseTag(actor) {
  if (!actor) {
    ui.notifications.warn("No character is associated with this roll.");
    return;
  }
  if (!actor.isOwner && !game.user.isGM) {
    ui.notifications.warn("You do not have permission to add a tag to this character.");
    return;
  }

  let tagName;
  try {
    tagName = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Create Single-Use Story Tag" },
      classes: ["litm-qol-system-dialog"],
      content: `
        <div class="litm-qol-single-use-dialog">
          <p>${SINGLE_USE_RULES}</p>
          <hr>
          <label>
            <span>Tag name</span>
            <input type="text" name="tagName" autofocus autocomplete="off" placeholder="Enter a story tag">
          </label>
        </div>`,
      ok: {
        label: "Create Tag",
        callback: (_event, button) => button.form.elements.tagName.value
      }
    });
  } catch (_error) {
    return;
  }

  tagName = String(tagName ?? "").trim();
  if (!tagName) return;

  const tags = foundry.utils.deepClone(actor.system.floatingTagsAndStatuses ?? []);
  tags.push({
    name: tagName,
    value: 0,
    isStatus: false,
    burned: false,
    toBurn: false,
    selected: false,
    positive: true,
    markings: Array(6).fill(false),
    might: 0,
    mightIcon: "adventure"
  });

  const records = getSingleUseRecords(actor);
  records.push({ id: foundry.utils.randomID(), name: tagName });

  await actor.update({ "system.floatingTagsAndStatuses": tags });
  await actor.setFlag(MODULE_ID, SINGLE_USE_FLAG, records);
  ui.notifications.info(`Created single-use story tag: ${tagName}`);
}

async function onChatCardRendered(message, html) {
  const root = getRootElement(html);
  if (!root) return;

  for (const button of root.querySelectorAll(".litm-qol-create-single-use")) {
    if (button.dataset.litmQolBound === "true") continue;
    button.dataset.litmQolBound = "true";

    const actor = actorFromMessage(message);
    const canCreate = isCharacterActor(actor) && (actor.isOwner || game.user.isGM);
    button.disabled = !canCreate;
    if (!canCreate) button.dataset.tooltip = "You do not own the character associated with this roll.";

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      createSingleUseTag(actor);
    });
  }

  for (const button of root.querySelectorAll(".litm-qol-sacrifice-card-action")) {
    if (button.dataset.litmQolBound === "true") continue;
    button.dataset.litmQolBound = "true";

    const actor = actorFromMessage(message);
    const canApply = isCharacterActor(actor) && (actor.isOwner || game.user.isGM);
    const alreadyApplied = Boolean(message.getFlag(MODULE_ID, "sacrificeConsequenceApplied"));
    button.disabled = !canApply || alreadyApplied;
    if (!canApply) button.dataset.tooltip = "You do not own the character associated with this roll.";
    if (alreadyApplied) {
      button.textContent = "Consequence Applied";
      button.dataset.tooltip = "This Sacrifice consequence has already been applied.";
    }

    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;

      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = "Applying…";
      try {
        const applied = await applySacrificeCardAction(actor, button.dataset.sacrificeAction);
        if (!applied) {
          button.disabled = false;
          button.textContent = originalText;
          return;
        }
        await message.setFlag(MODULE_ID, "sacrificeConsequenceApplied", true);
        button.textContent = "Consequence Applied";
        ui.notifications.info("Sacrifice consequence applied.");
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to apply Sacrifice consequence.`, error);
        ui.notifications.error("The Sacrifice consequence could not be applied. Check the console for details.");
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  }
}

function decorateSingleUseFloatingTags(app, html) {
  const actor = getActorFromApp(app);
  const root = getRootElement(html);
  if (!root || !isCharacterActor(actor)) return;

  const records = getSingleUseRecords(actor);
  if (!records.length) return;

  const remainingByName = new Map();
  for (const record of records) remainingByName.set(record.name, (remainingByName.get(record.name) ?? 0) + 1);

  for (const entry of root.querySelectorAll(".floating-tags-and-status-entry")) {
    const index = Number(entry.dataset.index);
    const tag = actor.system.floatingTagsAndStatuses?.[index];
    if (!tag || tag.isStatus) continue;

    const remaining = remainingByName.get(tag.name) ?? 0;
    if (remaining < 1) continue;
    remainingByName.set(tag.name, remaining - 1);

    entry.classList.add("litm-qol-single-use-floating-tag");
    const selectable = entry.querySelector(".fts-selectable");
    if (selectable) {
      selectable.dataset.tooltip = "Single-use story tag: it is scratched automatically after it is invoked and cannot be burned for Power.";
      selectable.dataset.tooltipDirection = "UP";
    }
  }
}

function renderActorEnhancements(app, html) {
  decorateSingleUseFloatingTags(app, html);
  addImproveThemeButtons(app, html);
}

/* Improve Theme                                                            */

function filledTag(tag) {
  return Boolean(String(tag?.name ?? "").trim());
}

function tagIsVisible(tag) {
  return filledTag(tag) && !tag.planned;
}

function themeDisplayName(theme) {
  const themeName = String(theme?.name ?? "Theme").trim() || "Theme";
  const titleTag = (theme?.system?.powertags ?? []).find(tag => tagIsVisible(tag));
  const title = String(titleTag?.name ?? "").trim();
  return title ? `${themeName} – ${title}` : themeName;
}

function blankThemeTag(name) {
  return {
    name,
    question: "",
    burned: false,
    toBurn: false,
    planned: false,
    selected: false
  };
}

function improveDialogWindow(title) {
  return { title };
}

function improveDialogClasses() {
  return ["litm-qol-system-dialog", "litm-qol-improve-theme-window"];
}

function improveDialogTitle(theme, page) {
  return `Improve Theme — ${themeDisplayName(theme)} — ${page}`;
}

const IMPROVE_POWER_TOOLTIP = `Add a new power tag or activate a planned one. See Core Book Vol. I: Hero Creation, page 77; Fellowship Creation, page 139; and Improving a Theme, page 187.`;

const IMPROVE_WEAKNESS_TOOLTIP = `Add, activate, or remove a weakness tag. Removing one also removes a future opportunity to mark Improve. See Core Book Vol. I, page 187.`;

const IMPROVE_SPECIAL_TOOLTIP = `Choose one unused Special Improvement for this theme. Each may be selected only once. See Core Book Vol. I, page 187.`;

const IMPROVE_RESET_TOOLTIP = `Clear Abandon, Milestones, or both instead of changing another theme element. See Core Book Vol. I, page 187.`;

const IMPROVE_PROMISE_TOOLTIP = `Mark 1 Promise instead of making a visible change to the theme. See Core Book Vol. I, pages 187 and 193.`;

function selectedCheckbox(form, name) {
  return form?.querySelector(`input[type="checkbox"][name="${name}"]:checked`) ?? null;
}

const IMPROVE_BACK = "litm-qol-improve-back";
const IMPROVE_CANCEL = "litm-qol-improve-cancel";

function isImproveBack(result) {
  return result?.navigation === IMPROVE_BACK;
}

function isImproveCancel(result) {
  return result?.navigation === IMPROVE_CANCEL;
}

function isImproveNavigation(result) {
  return isImproveBack(result) || isImproveCancel(result);
}

function setImproveButtonDisabled(root, action, disabled) {
  const button = root.querySelector(`button[data-action="${action}"]`);
  if (button) button.disabled = Boolean(disabled);
}

function improveCancelButton() {
  return {
    action: "cancel",
    label: "Cancel",
    icon: "fa-solid fa-xmark",
    class: "litm-qol-improve-cancel",
    callback: () => ({ navigation: IMPROVE_CANCEL })
  };
}

function improveBackButton() {
  return {
    action: "back",
    label: "Back",
    icon: "fa-solid fa-arrow-left",
    class: "litm-qol-improve-back",
    callback: () => ({ navigation: IMPROVE_BACK })
  };
}

function bindExclusiveCheckboxes(dialog, name, onSelectionChange) {
  const root = dialog.element;
  const checkboxes = [...root.querySelectorAll(`input[type="checkbox"][name="${name}"]`)];
  const update = selected => {
    onSelectionChange?.(selected ?? checkboxes.find(checkbox => checkbox.checked) ?? null, root);
  };
  for (const checkbox of checkboxes) {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        for (const other of checkboxes) {
          if (other !== checkbox) other.checked = false;
        }
      }
      update(checkbox.checked ? checkbox : null);
    });
  }
  update();
}

function specialImprovementSlots(theme) {
  const improvements = foundry.utils.deepClone(theme.system.specialImprovements ?? []);
  while (improvements.length < 5) improvements.push({ name: "", description: "", active: false });
  return improvements;
}

function hasAvailableSpecialImprovement(theme) {
  return specialImprovementSlots(theme)
    .slice(0, 5)
    .some(improvement => !String(improvement?.name ?? "").trim() || !improvement.active);
}

function isFellowshipTheme(theme) {
  return theme?.documentName === "Actor" && theme.type === "litm-fellowship-themecard";
}

function improveChoiceRow(value, label, tooltip, disabled = false) {
  return `
    <label class="litm-qol-improve-choice${disabled ? " disabled" : ""}">
      <input type="checkbox" name="improveAction" value="${value}" ${disabled ? "disabled" : ""}>
      ${rulesTooltip(label, tooltip)}
    </label>`;
}

async function chooseThemeImprovement(actor, theme, { allowBack = false, allowMilestoneReset = true } = {}) {
  const fellowshipTheme = isFellowshipTheme(theme);
  const trackersEmpty = Number(theme.system?.abandon ?? 0) < 1 && (!allowMilestoneReset || Number(theme.system?.milestone ?? 0) < 1);
  const specialUnavailable = !hasAvailableSpecialImprovement(theme);
  return foundry.applications.api.DialogV2.wait({
    window: improveDialogWindow(improveDialogTitle(theme, "Choose an Improvement")),
    classes: improveDialogClasses(),
    content: `
      <div class="litm-qol-improve-theme-dialog">
        <p>Choose one improvement for this theme.</p>
        <div class="litm-qol-improve-choice-list">
          ${improveChoiceRow("power", "Create a new power tag", IMPROVE_POWER_TOOLTIP)}
          ${improveChoiceRow("weakness", "Remove or add a weakness tag", IMPROVE_WEAKNESS_TOOLTIP)}
          ${improveChoiceRow("special", "Gain a Special Improvement", IMPROVE_SPECIAL_TOOLTIP, specialUnavailable)}
          ${improveChoiceRow("reset", allowMilestoneReset ? "Reset Abandon, Milestones, or both" : "Reset Abandon", IMPROVE_RESET_TOOLTIP, trackersEmpty)}
          ${fellowshipTheme ? "" : improveChoiceRow("promise", "Mark Promise", IMPROVE_PROMISE_TOOLTIP)}
        </div>
      </div>`,
    render: (_event, dialog) => bindExclusiveCheckboxes(dialog, "improveAction", selected => {
      setImproveButtonDisabled(dialog.element, "next", !selected);
    }),
    buttons: [
      improveCancelButton(),
      ...(allowBack ? [improveBackButton()] : []),
      {
        action: "next",
        label: "Next",
        icon: "fa-solid fa-arrow-right",
        class: "litm-qol-improve-primary",
        default: true,
        callback: (_event, button) => selectedCheckbox(button.form, "improveAction")?.value ?? null
      }
    ],
    rejectClose: false
  });
}

function optionTags(tags, predicate = () => true) {
  return tags
    .map((tag, index) => ({ tag, index }))
    .filter(({ tag, index }) => predicate(tag, index))
    .map(({ tag, index }) => `<option value="${index}">${foundry.utils.escapeHTML(tag.name || tag.question || "Unnamed tag")}</option>`)
    .join("");
}

async function promptPowerTagImprovement(theme) {
  const tags = foundry.utils.deepClone(theme.system.powertags ?? []);
  const plannedOptions = optionTags(tags, tag => tag?.planned && String(tag.name || tag.question || "").trim());
  const result = await foundry.applications.api.DialogV2.wait({
    window: improveDialogWindow(improveDialogTitle(theme, "New Power Tag")),
    classes: improveDialogClasses(),
    content: `
      <div class="litm-qol-improve-theme-dialog">
        <label class="litm-qol-improve-detail-choice${plannedOptions ? "" : " disabled"}">
          <input type="checkbox" name="powerMode" value="reveal" ${plannedOptions ? "checked" : "disabled"}>
          <span>Choose an existing planned power tag</span>
        </label>
        <select name="plannedPowerIndex" ${plannedOptions ? "" : "disabled"}>${plannedOptions || "<option>No planned power tags are available</option>"}</select>
        <label class="litm-qol-improve-detail-choice">
          <input type="checkbox" name="powerMode" value="create" ${plannedOptions ? "" : "checked"}>
          <span>Create a new power tag</span>
        </label>
        <input type="text" name="newPowerName" autocomplete="off" placeholder="New power tag" ${plannedOptions ? "disabled" : ""}>
      </div>`,
    render: (_event, dialog) => {
      const root = dialog.element;
      const refresh = selected => {
        root.querySelector('[name="plannedPowerIndex"]').disabled = selected?.value !== "reveal" || !plannedOptions;
        root.querySelector('[name="newPowerName"]').disabled = selected?.value !== "create";
        const valid = (selected?.value === "reveal" && plannedOptions) ||
          (selected?.value === "create" && root.querySelector('[name="newPowerName"]').value.trim());
        setImproveButtonDisabled(root, "continue", !valid);
      };
      bindExclusiveCheckboxes(dialog, "powerMode", refresh);
      root.querySelector('[name="newPowerName"]').addEventListener("input", () => refresh(selectedCheckbox(root, "powerMode")));
    },
    buttons: [
      improveCancelButton(),
      improveBackButton(),
      {
        action: "continue",
        label: "Continue",
        icon: "fa-solid fa-arrow-right",
        class: "litm-qol-improve-primary",
        default: true,
        callback: (_event, button) => {
          const form = button.form;
          return {
            mode: selectedCheckbox(form, "powerMode")?.value,
            index: Number(form?.elements?.plannedPowerIndex?.value),
            name: selectedCheckbox(form, "powerMode")?.value === "reveal"
              ? String(tags[Number(form?.elements?.plannedPowerIndex?.value)]?.name || tags[Number(form?.elements?.plannedPowerIndex?.value)]?.question || "").trim()
              : String(form?.elements?.newPowerName?.value ?? "").trim()
          };
        }
      }
    ],
    rejectClose: false
  });
  if (isImproveNavigation(result)) return result;
  if (!result) return null;
  if (result.mode === "reveal" && result.name && Number.isInteger(result.index) && tags[result.index]?.planned) return result;
  if (result.mode === "create" && result.name) return result;
  ui.notifications.warn("Choose a planned power tag or enter a name for the new power tag.");
  return null;
}

async function promptWeaknessImprovement(theme) {
  const weaknesses = foundry.utils.deepClone(theme.system.weaknesstags ?? []);
  const visibleOptions = optionTags(weaknesses, tag => tagIsVisible(tag));
  const plannedOptions = optionTags(weaknesses, tag => tag?.planned && String(tag.name || tag.question || "").trim());
  const defaultMode = visibleOptions ? "remove" : plannedOptions ? "reveal" : "create";
  const result = await foundry.applications.api.DialogV2.wait({
    window: improveDialogWindow(improveDialogTitle(theme, "Weakness Tag")),
    classes: improveDialogClasses(),
    content: `
      <div class="litm-qol-improve-theme-dialog">
        <label class="litm-qol-improve-detail-choice${visibleOptions ? "" : " disabled"}">
          <input type="checkbox" name="weaknessMode" value="remove" ${defaultMode === "remove" ? "checked" : ""} ${visibleOptions ? "" : "disabled"}>
          <span>Remove an existing weakness</span>
        </label>
        <select name="removeWeaknessIndex" ${visibleOptions ? "" : "disabled"}>${visibleOptions || "<option>No visible weaknesses are available</option>"}</select>
        <label class="litm-qol-improve-detail-choice${plannedOptions ? "" : " disabled"}">
          <input type="checkbox" name="weaknessMode" value="reveal" ${defaultMode === "reveal" ? "checked" : ""} ${plannedOptions ? "" : "disabled"}>
          <span>Add an existing planned weakness</span>
        </label>
        <select name="plannedWeaknessIndex" ${plannedOptions ? "" : "disabled"}>${plannedOptions || "<option>No planned weaknesses are available</option>"}</select>
        <label class="litm-qol-improve-detail-choice">
          <input type="checkbox" name="weaknessMode" value="create" ${defaultMode === "create" ? "checked" : ""}>
          <span>Create a new weakness</span>
        </label>
        <input type="text" name="newWeaknessName" autocomplete="off" placeholder="New weakness tag" ${defaultMode === "create" ? "" : "disabled"}>
      </div>`,
    render: (_event, dialog) => {
      const root = dialog.element;
      const refresh = selected => {
        root.querySelector('[name="removeWeaknessIndex"]').disabled = selected?.value !== "remove" || !visibleOptions;
        root.querySelector('[name="plannedWeaknessIndex"]').disabled = selected?.value !== "reveal" || !plannedOptions;
        root.querySelector('[name="newWeaknessName"]').disabled = selected?.value !== "create";
        const valid = selected?.value === "remove" ||
          (selected?.value === "reveal" && plannedOptions) ||
          (selected?.value === "create" && root.querySelector('[name="newWeaknessName"]').value.trim());
        setImproveButtonDisabled(root, "continue", !valid);
      };
      bindExclusiveCheckboxes(dialog, "weaknessMode", refresh);
      root.querySelector('[name="newWeaknessName"]').addEventListener("input", () => refresh(selectedCheckbox(root, "weaknessMode")));
    },
    buttons: [
      improveCancelButton(),
      improveBackButton(),
      {
        action: "continue",
        label: "Continue",
        icon: "fa-solid fa-arrow-right",
        class: "litm-qol-improve-primary",
        default: true,
        callback: (_event, button) => {
          const form = button.form;
          return {
            mode: selectedCheckbox(form, "weaknessMode")?.value,
            removeIndex: Number(form?.elements?.removeWeaknessIndex?.value),
            revealIndex: Number(form?.elements?.plannedWeaknessIndex?.value),
            name: selectedCheckbox(form, "weaknessMode")?.value === "reveal"
              ? String(weaknesses[Number(form?.elements?.plannedWeaknessIndex?.value)]?.name || weaknesses[Number(form?.elements?.plannedWeaknessIndex?.value)]?.question || "").trim()
              : String(form?.elements?.newWeaknessName?.value ?? "").trim()
          };
        }
      }
    ],
    rejectClose: false
  });
  if (isImproveNavigation(result)) return result;
  if (!result) return null;
  if (result.mode === "remove" && weaknesses[result.removeIndex] && tagIsVisible(weaknesses[result.removeIndex])) return result;
  if (result.mode === "reveal" && result.name && weaknesses[result.revealIndex]?.planned) return result;
  if (result.mode === "create" && result.name) return result;
  ui.notifications.warn("Choose a valid weakness option or enter a name for the new weakness.");
  return null;
}

async function promptSpecialImprovement(theme) {
  const improvements = specialImprovementSlots(theme);
  const availableOptions = improvements
    .slice(0, 5)
    .map((improvement, index) => ({ improvement, index }))
    .filter(({ improvement }) => String(improvement?.name ?? "").trim() && !improvement.active)
    .map(({ improvement, index }) => `<option value="${index}">${foundry.utils.escapeHTML(improvement.name)}</option>`)
    .join("");
  const blankIndex = improvements.slice(0, 5).findIndex(improvement => !String(improvement?.name ?? "").trim());
  const canCreate = blankIndex >= 0;
  const defaultMode = availableOptions ? "activate" : canCreate ? "create" : "";
  const result = await foundry.applications.api.DialogV2.wait({
    window: improveDialogWindow(improveDialogTitle(theme, "Special Improvement")),
    classes: improveDialogClasses(),
    content: `
      <div class="litm-qol-improve-theme-dialog">
        <label class="litm-qol-improve-detail-choice${availableOptions ? "" : " disabled"}">
          <input type="checkbox" name="specialMode" value="activate" ${defaultMode === "activate" ? "checked" : ""} ${availableOptions ? "" : "disabled"}>
          <span>Gain an available Special Improvement</span>
        </label>
        <select name="specialIndex" ${availableOptions ? "" : "disabled"}>${availableOptions || "<option>No inactive Special Improvements are available</option>"}</select>
        <label class="litm-qol-improve-detail-choice${canCreate ? "" : " disabled"}">
          <input type="checkbox" name="specialMode" value="create" ${defaultMode === "create" ? "checked" : ""} ${canCreate ? "" : "disabled"}>
          <span>Create a new Special Improvement</span>
        </label>
        <input type="text" name="specialName" autocomplete="off" placeholder="Special Improvement title" ${defaultMode === "create" ? "" : "disabled"}>
        <textarea name="specialDescription" rows="5" placeholder="Description" ${defaultMode === "create" ? "" : "disabled"}></textarea>
      </div>`,
    render: (_event, dialog) => bindExclusiveCheckboxes(dialog, "specialMode", (selected, root) => {
      root.querySelector('[name="specialIndex"]').disabled = selected?.value !== "activate" || !availableOptions;
      root.querySelector('[name="specialName"]').disabled = selected?.value !== "create";
      root.querySelector('[name="specialDescription"]').disabled = selected?.value !== "create";
      setImproveButtonDisabled(root, "continue", !selected);
    }),
    buttons: [
      improveCancelButton(),
      improveBackButton(),
      {
        action: "continue",
        label: "Continue",
        icon: "fa-solid fa-arrow-right",
        class: "litm-qol-improve-primary",
        default: true,
        callback: (_event, button) => {
          const form = button.form;
          return {
            mode: selectedCheckbox(form, "specialMode")?.value,
            index: selectedCheckbox(form, "specialMode")?.value === "create"
              ? blankIndex
              : Number(form?.elements?.specialIndex?.value),
            name: String(form?.elements?.specialName?.value ?? "").trim(),
            description: String(form?.elements?.specialDescription?.value ?? "").trim()
          };
        }
      }
    ],
    rejectClose: false
  });
  if (isImproveNavigation(result)) return result;
  if (!result) return null;
  if (result.mode === "activate" && result.index < 5 && improvements[result.index] && !improvements[result.index].active) return result;
  if (result.mode === "create" && result.index >= 0 && result.index < 5 && result.name && result.description) return result;
  ui.notifications.warn("Choose an available Special Improvement or enter both a title and description.");
  return null;
}

async function promptTrackerReset(theme, { allowMilestoneReset = true } = {}) {
  const abandon = Number(theme.system.abandon ?? 0);
  const milestone = Number(theme.system.milestone ?? 0);
  const result = await foundry.applications.api.DialogV2.wait({
    window: improveDialogWindow(improveDialogTitle(theme, "Reset Trackers")),
    classes: improveDialogClasses(),
    content: `
      <div class="litm-qol-improve-theme-dialog">
        <p>Choose the tracker or trackers to reset.</p>
        <label class="litm-qol-improve-detail-choice">
          <input type="checkbox" name="resetAbandon" ${abandon > 0 ? "" : "disabled"}>
          <span>Reset Abandon (${abandon}/3)</span>
        </label>
        ${allowMilestoneReset ? `<label class="litm-qol-improve-detail-choice">
          <input type="checkbox" name="resetMilestone" ${milestone > 0 ? "" : "disabled"}>
          <span>Reset Milestones (${milestone}/3)</span>
        </label>` : ""}
      </div>`,
    render: (_event, dialog) => {
      const root = dialog.element;
      const checkboxes = [...root.querySelectorAll('input[name="resetAbandon"], input[name="resetMilestone"]')];
      const update = () => setImproveButtonDisabled(root, "continue", !checkboxes.some(checkbox => checkbox.checked));
      for (const checkbox of checkboxes) checkbox.addEventListener("change", update);
      update();
    },
    buttons: [
      improveCancelButton(),
      improveBackButton(),
      {
        action: "continue",
        label: "Continue",
        icon: "fa-solid fa-arrow-right",
        class: "litm-qol-improve-primary",
        default: true,
        callback: (_event, button) => ({
          abandon: Boolean(button.form?.elements?.resetAbandon?.checked),
          milestone: allowMilestoneReset && Boolean(button.form?.elements?.resetMilestone?.checked)
        })
      }
    ],
    rejectClose: false
  });
  if (isImproveNavigation(result)) return result;
  if (!result) return null;
  if (result.abandon || result.milestone) return result;
  ui.notifications.warn("Select at least one tracker to reset.");
  return null;
}

async function promptImprovementDetails(action, actor, theme, { allowMilestoneReset = true } = {}) {
  if (action === "power") return promptPowerTagImprovement(theme);
  if (action === "weakness") return promptWeaknessImprovement(theme);
  if (action === "special") return promptSpecialImprovement(theme);
  if (action === "reset") return promptTrackerReset(theme, { allowMilestoneReset });
  if (action === "promise") return { mark: true };
  return null;
}

function rewriteCandidates(theme, action, details) {
  const powers = theme.system.powertags ?? [];
  const weaknesses = theme.system.weaknesstags ?? [];
  const candidates = [];
  for (let index = 1; index < powers.length; index++) {
    if (tagIsVisible(powers[index])) candidates.push({ type: "power", index, name: powers[index].name });
  }
  for (let index = 0; index < weaknesses.length; index++) {
    if (!tagIsVisible(weaknesses[index])) continue;
    if (action === "weakness" && details?.mode === "remove" && details.removeIndex === index) continue;
    candidates.push({ type: "weakness", index, name: weaknesses[index].name });
  }
  return candidates;
}

async function promptThemeRewrite(theme, action, details) {
  const candidates = rewriteCandidates(theme, action, details);
  const rows = candidates.map((candidate, rowIndex) => `
    <div class="litm-qol-improve-rewrite-row">
      <input id="litm-qol-rewrite-${rowIndex}" type="checkbox" name="rewriteChoice" value="${rowIndex}">
      <label for="litm-qol-rewrite-${rowIndex}" class="litm-qol-improve-rewrite-kind">${candidate.type === "power" ? "Power" : "Weakness"}</label>
      <input type="text" name="rewriteName${rowIndex}" value="${escapeAttribute(candidate.name)}" aria-label="Rewrite ${escapeAttribute(candidate.name)}" disabled>
    </div>`).join("");
  const result = await foundry.applications.api.DialogV2.wait({
    window: improveDialogWindow(improveDialogTitle(theme, "Update a Tag")),
    classes: improveDialogClasses(),
    content: `
      <div class="litm-qol-improve-theme-dialog">
        <p>You may update or rewrite one existing tag on this theme.</p>
        <div class="litm-qol-improve-rewrite-list">
          ${rows || "<p class=\"notes\">There are no eligible tags to rewrite.</p>"}
        </div>
      </div>`,
    render: (_event, dialog) => bindExclusiveCheckboxes(dialog, "rewriteChoice", (selected, root) => {
      for (const input of root.querySelectorAll('[name^="rewriteName"]')) input.disabled = true;
      if (selected) root.querySelector(`[name="rewriteName${selected.value}"]`).disabled = false;
    }),
    buttons: [
      improveCancelButton(),
      improveBackButton(),
      {
        action: "confirm",
        label: "Confirm Improvement",
        icon: "fa-solid fa-check",
        class: "litm-qol-improve-primary",
        default: true,
        callback: (_event, button) => {
          const choice = selectedCheckbox(button.form, "rewriteChoice")?.value;
          if (choice === undefined) return { choice: null };
          const candidate = candidates[Number(choice)];
          const name = String(button.form?.elements?.[`rewriteName${choice}`]?.value ?? "").trim();
          return candidate && name ? { choice: candidate, name } : null;
        }
      }
    ],
    rejectClose: false
  });
  if (result === null) return null;
  return result;
}

function describeThemeImprovement(theme, action, details) {
  if (action === "power") {
    const name = details.mode === "reveal"
      ? details.name
      : details.name;
    return `${details.mode === "reveal" ? "Gained planned power tag" : "Created power tag"}: ${name}`;
  }
  if (action === "weakness") {
    if (details.mode === "remove") {
      return `Removed weakness tag: ${theme.system.weaknesstags?.[details.removeIndex]?.name}`;
    }
    const name = details.mode === "reveal"
      ? details.name
      : details.name;
    return `${details.mode === "reveal" ? "Gained planned weakness tag" : "Created weakness tag"}: ${name}`;
  }
  if (action === "special") {
    const name = details.mode === "activate"
      ? theme.system.specialImprovements?.[details.index]?.name
      : details.name;
    const description = details.mode === "activate"
      ? theme.system.specialImprovements?.[details.index]?.description
      : details.description;
    return `${details.mode === "activate" ? "Gained Special Improvement" : "Created Special Improvement"}: ${name}${description ? ` — ${description}` : ""}`;
  }
  if (action === "reset") {
    const trackers = [details.abandon ? "Abandon" : null, details.milestone ? "Milestones" : null].filter(Boolean);
    return `Reset ${trackers.join(" and ")}`;
  }
  if (action === "promise") return "Marked Promise";
  return "Improved the theme";
}

async function sendThemeImprovementSummary(actor, theme, improvementDescription, rewrite, { freeReforged = false } = {}) {
  const gmIds = game.users.filter(user => user.isGM).map(user => user.id);
  if (!gmIds.length) return;

  const improvement = foundry.utils.escapeHTML(improvementDescription);
  const rewriteLine = rewrite?.choice
    ? `<li>Updated ${rewrite.choice.type} tag: <strong>${foundry.utils.escapeHTML(rewrite.choice.name)}</strong> → <strong>${foundry.utils.escapeHTML(rewrite.name)}</strong></li>`
    : "";
  const subjectLine = isFellowshipTheme(theme)
    ? `<strong>${foundry.utils.escapeHTML(themeDisplayName(theme))}</strong> was improved${actor !== theme ? ` by <strong>${foundry.utils.escapeHTML(actor.name)}</strong>` : ""}.`
    : `<strong>${foundry.utils.escapeHTML(actor.name)}</strong> improved <strong>${foundry.utils.escapeHTML(themeDisplayName(theme))}</strong>.`;
  const content = `
    <div class="litm-qol-improve-chat-summary">
      <h3><i class="fa-solid fa-star"></i> Theme Improved</h3>
      <p>${subjectLine}</p>
      <ul>
        <li>${improvement}</li>
        ${rewriteLine}
        <li>${freeReforged ? "One inherited Be Reforged improvement spent; this theme’s Improve marks were unchanged." : "Improve reset to 0."}</li>
      </ul>
    </div>`;

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: gmIds,
    content,
    flags: { [MODULE_ID]: { improveThemeSummary: true, actorId: actor.id, themeId: theme.id } }
  });
}

async function commitThemeImprovement(actor, theme, action, details, rewrite, { resetImprove = true } = {}) {
  const powertags = foundry.utils.deepClone(theme.system.powertags ?? []);
  const weaknesstags = foundry.utils.deepClone(theme.system.weaknesstags ?? []);
  const specialImprovements = specialImprovementSlots(theme);
  const update = resetImprove ? { "system.improve": 0 } : {};

  if (rewrite?.choice) {
    const collection = rewrite.choice.type === "power" ? powertags : weaknesstags;
    if (collection[rewrite.choice.index]) collection[rewrite.choice.index].name = rewrite.name;
  }

  if (action === "power") {
    if (details.mode === "reveal") {
      powertags[details.index] = { ...powertags[details.index], name: details.name, planned: false, selected: false, toBurn: false };
    } else {
      powertags.push(blankThemeTag(details.name));
    }
    update["system.powertags"] = powertags;
  } else if (action === "weakness") {
    if (details.mode === "remove") weaknesstags.splice(details.removeIndex, 1);
    if (details.mode === "reveal") {
      weaknesstags[details.revealIndex] = { ...weaknesstags[details.revealIndex], name: details.name, planned: false, selected: false, toBurn: false };
    }
    if (details.mode === "create") weaknesstags.push(blankThemeTag(details.name));
    update["system.weaknesstags"] = weaknesstags;
  } else if (action === "special") {
    if (details.mode === "activate") {
      specialImprovements[details.index] = { ...specialImprovements[details.index], active: true };
    } else {
      specialImprovements[details.index] = { name: details.name, description: details.description, active: true };
    }
    update["system.specialImprovements"] = specialImprovements;
  } else if (action === "reset") {
    if (details.abandon) update["system.abandon"] = 0;
    if (details.milestone) update["system.milestone"] = 0;
  }

  if (rewrite?.choice?.type === "power" && action !== "power") update["system.powertags"] = powertags;
  if (rewrite?.choice?.type === "weakness" && action !== "weakness") update["system.weaknesstags"] = weaknesstags;

  await theme.update(update);
  if (action === "promise") {
    await awardPromise(actor, 1);
  }
}

function applyStagedThemeImprovement(theme, draftState, action, details, rewrite) {
  const powertags = foundry.utils.deepClone(theme.system.powertags ?? []);
  const weaknesstags = foundry.utils.deepClone(theme.system.weaknesstags ?? []);
  const specialImprovements = specialImprovementSlots(theme);

  if (rewrite?.choice) {
    const collection = rewrite.choice.type === "power" ? powertags : weaknesstags;
    if (collection[rewrite.choice.index]) collection[rewrite.choice.index].name = rewrite.name;
  }

  if (action === "power") {
    if (details.mode === "reveal") {
      powertags[details.index] = { ...powertags[details.index], name: details.name, planned: false, selected: false, toBurn: false };
    } else {
      powertags.push(blankThemeTag(details.name));
    }
  } else if (action === "weakness") {
    if (details.mode === "remove") weaknesstags.splice(details.removeIndex, 1);
    if (details.mode === "reveal") {
      weaknesstags[details.revealIndex] = { ...weaknesstags[details.revealIndex], name: details.name, planned: false, selected: false, toBurn: false };
    }
    if (details.mode === "create") weaknesstags.push(blankThemeTag(details.name));
  } else if (action === "special") {
    if (details.mode === "activate") {
      specialImprovements[details.index] = { ...specialImprovements[details.index], active: true };
    } else {
      specialImprovements[details.index] = { name: details.name, description: details.description, active: true };
    }
  } else if (action === "reset") {
    if (details.abandon) theme.system.abandon = 0;
    if (details.milestone) theme.system.milestone = 0;
  } else if (action === "promise") {
    draftState.promiseGain = Number(draftState.promiseGain ?? 0) + 1;
  }

  theme.system.powertags = powertags;
  theme.system.weaknesstags = weaknesstags;
  theme.system.specialImprovements = specialImprovements;
}

async function stageTradeImprovement(actor, theme, draftState = {}) {
  const stagedActor = {
    system: {
      promises: Math.min(5, Number(actor.system?.promises ?? 0) + Number(draftState.promiseGain ?? 0))
    }
  };
  let page = "action";
  let action = null;
  let details = null;

  while (true) {
    if (page === "action") {
      action = await chooseThemeImprovement(stagedActor, theme, { allowBack: true, allowMilestoneReset: false });
      if (isImproveBack(action)) return { navigation: "back" };
      if (isImproveCancel(action) || !action) return null;
      page = "details";
      continue;
    }
    if (page === "details") {
      details = await promptImprovementDetails(action, stagedActor, theme, { allowMilestoneReset: false });
      if (isImproveCancel(details) || !details) return null;
      if (isImproveBack(details)) {
        page = "action";
        continue;
      }
      page = "rewrite";
      continue;
    }

    const rewrite = await promptThemeRewrite(theme, action, details);
    if (isImproveCancel(rewrite) || !rewrite) return null;
    if (isImproveBack(rewrite)) {
      page = action === "promise" ? "action" : "details";
      continue;
    }
    const description = describeThemeImprovement(theme, action, details);
    applyStagedThemeImprovement(theme, draftState, action, details, rewrite);
    return { description, rewrite };
  }
}

async function runImproveThemeWorkflow(actor, theme, { freeReforged = false } = {}) {
  if (!actor || !theme || (theme.type !== "themebook" && !isFellowshipTheme(theme))) return;
  const canModify = isFellowshipTheme(theme) ? theme.isOwner : actor.isOwner;
  const freeRemaining = Number(actor.getFlag?.(MODULE_ID, REFORGED_IMPROVEMENTS_FLAG) ?? 0);
  if ((!canModify && !game.user.isGM) || (freeReforged ? freeRemaining < 1 : Number(theme.system.improve ?? 0) < 3)) return;
  try {
    let page = "action";
    let action = null;
    let details = null;

    while (true) {
      if (page === "action") {
        action = await chooseThemeImprovement(actor, theme);
        if (isImproveCancel(action)) return;
        if (!action) return;
        page = "details";
        continue;
      }

      if (page === "details") {
        details = await promptImprovementDetails(action, actor, theme);
        if (isImproveCancel(details)) return;
        if (isImproveBack(details)) {
          page = "action";
          continue;
        }
        if (!details) return;
        page = "rewrite";
        continue;
      }

      const rewrite = await promptThemeRewrite(theme, action, details);
      if (isImproveCancel(rewrite)) return;
      if (isImproveBack(rewrite)) {
        page = action === "promise" ? "action" : "details";
        continue;
      }
      if (!rewrite) return;

      const improvementDescription = describeThemeImprovement(theme, action, details);
      await commitThemeImprovement(actor, theme, action, details, rewrite, { resetImprove: !freeReforged });
      if (freeReforged) {
        const remaining = Math.max(0, Number(actor.getFlag?.(MODULE_ID, REFORGED_IMPROVEMENTS_FLAG) ?? freeRemaining) - 1);
        if (remaining) await actor.setFlag(MODULE_ID, REFORGED_IMPROVEMENTS_FLAG, remaining);
        else await actor.unsetFlag(MODULE_ID, REFORGED_IMPROVEMENTS_FLAG);
      }
      try {
        await sendThemeImprovementSummary(actor, theme, improvementDescription, rewrite, { freeReforged });
      } catch (summaryError) {
        console.error(`${MODULE_ID} | Theme improvement was applied, but the GM chat summary failed.`, summaryError);
        ui.notifications.warn("The theme was improved, but its GM chat summary could not be sent.");
      }
      ui.notifications.info(`${themeDisplayName(theme)} improved.`);
      return;
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Improve Theme workflow failed.`, error);
    ui.notifications.error("The theme could not be improved. Check the console for details.");
  }
}

function insertReforgedImproveButton(container, actor, theme, remaining) {
  if (!container || container.querySelector(".litm-qol-reforged-improve-button") || remaining < 1) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "litm-qol-reforged-improve-button";
  button.innerHTML = `<i class="fa-solid fa-star"></i> Improve Theme <span class="litm-qol-reforged-count">${remaining} free</span>`;
  button.dataset.tooltip = `${remaining} inherited ${remaining === 1 ? "improvement" : "improvements"} remaining from Be Reforged. This does not use the theme’s Improve marks.`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    void runImproveThemeWorkflow(actor, theme, { freeReforged: true });
  });

  let row = container.querySelector(".litm-qol-theme-action-row");
  if (!row) {
    row = document.createElement("div");
    row.className = "litm-qol-theme-action-row";
    const header = container.querySelector(".themebook-item") ?? container.querySelector(".theme-name");
    if (header) header.insertAdjacentElement("afterend", row);
    else container.querySelector(".themebook-style")?.prepend(row);
  }
  let stack = row.querySelector(".litm-qol-theme-button-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "litm-qol-theme-button-stack";
    row.append(stack);
  }
  stack.append(button);
}

function insertImproveThemeButton(container, actor, theme) {
  if (!container || container.querySelector(".litm-qol-improve-theme-button")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "litm-qol-improve-theme-button";
  button.innerHTML = '<i class="fa-solid fa-star"></i> Improve Theme';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    runImproveThemeWorkflow(actor, theme);
  });

  let row = container.querySelector(".litm-qol-theme-action-row");
  if (!row) {
    row = document.createElement("div");
    row.className = "litm-qol-theme-action-row";
    const header = container.querySelector(".themebook-item") ?? container.querySelector(".theme-name");
    if (header) header.insertAdjacentElement("afterend", row);
    else container.querySelector(".themebook-style")?.prepend(row);
  }
  let buttonStack = row.querySelector(".litm-qol-theme-button-stack");
  if (!buttonStack) {
    buttonStack = document.createElement("div");
    buttonStack.className = "litm-qol-theme-button-stack";
    row.append(buttonStack);
  }
  buttonStack.append(button);
}

function addImproveThemeButtons(app, html) {
  const actor = getActorFromApp(app);
  const root = getRootElement(html);
  if (!actor || !root || (!actor.isOwner && !game.user.isGM)) return;
  if (actor.getFlag?.(MODULE_ID, RETIREMENT_FLAG)) return;

  const freeReforged = Math.max(0, Number(actor.getFlag?.(MODULE_ID, REFORGED_IMPROVEMENTS_FLAG) ?? 0));
  for (const container of root.querySelectorAll(".themebook-container[data-id]")) {
    const theme = actor.items?.get(container.dataset.id);
    if (!theme || theme.type !== "themebook" || theme.system.options?.isStoryTheme) continue;
    if (theme.getFlag?.(MODULE_ID, "nascentTheme") === true) continue;
    if (freeReforged > 0) insertReforgedImproveButton(container, actor, theme, freeReforged);
    if (container.querySelector(".litm-qol-improve-theme-button")) continue;
    if (Number(theme.system.improve ?? 0) < 3) continue;
    insertImproveThemeButton(container, actor, theme);
  }

  const fellowshipTheme = isFellowshipTheme(actor) ? actor : getFellowshipThemecardActor(actor);
  if (!fellowshipTheme || Number(fellowshipTheme.system.improve ?? 0) < 3) return;
  if (fellowshipTheme.getFlag?.(MODULE_ID, "nascentTheme") === true) return;
  if (!fellowshipTheme.isOwner && !game.user.isGM) return;

  const fellowshipContainers = isFellowshipTheme(actor)
    ? [...root.querySelectorAll(".themebook-container")]
    : [...root.querySelectorAll(".themebook-container")]
      .filter(container => container.querySelector(".themebook-style.litm-fellowship-themecard"));
  for (const container of fellowshipContainers) {
    insertImproveThemeButton(container, actor, fellowshipTheme);
  }
}



function getFellowshipThemecardActor(actor) {
  if (!actor) return null;

  const assignedId = actor.system?.actorSharedSingleThemecardId;
  if (assignedId) {
    const assigned = game.actors.get(assignedId);
    if (assigned?.type === "litm-fellowship-themecard") return assigned;
  }

  const fromSheet = actor.sheet?.getActorFellowshipThemecard?.();
  if (fromSheet?.type === "litm-fellowship-themecard") return fromSheet;

  return null;
}

function captureAndScratchFellowshipThemecardTags(message, data) {
  const actorId = data?.speaker?.actor ?? message?.speaker?.actor;
  const actor = actorId ? game.actors.get(actorId) : null;
  if (!isCharacterActor(actor)) return;

  const fellowshipActor = getFellowshipThemecardActor(actor);
  if (!fellowshipActor) return;

  const selectedIndices = (fellowshipActor.system.powertags ?? [])
    .map((tag, index) => ({ tag, index }))
    .filter(({ tag }) => tag.selected && !tag.burned)
    .map(({ index }) => index);

  if (!selectedIndices.length) return;

  // The system clears Fellowship selections after creating the roll message.
  // Capture the invoked indices first, then apply the same persistent burned
  // state represented by the sheet's `burned` CSS class.
  setTimeout(async () => {
    const current = foundry.utils.deepClone(fellowshipActor.system.powertags ?? []);
    let changed = false;

    for (const index of selectedIndices) {
      const tag = current[index];
      if (!tag) continue;
      if (!tag.burned || tag.selected || tag.toBurn) {
        tag.burned = true;
        tag.selected = false;
        tag.toBurn = false;
        changed = true;
      }
    }

    if (changed) await fellowshipActor.update({ "system.powertags": current });
  }, 350);
}

function captureAndScratchFellowshipTags(message, data) {
  const actorId = data?.speaker?.actor ?? message?.speaker?.actor;
  const actor = actorId ? game.actors.get(actorId) : null;
  if (!isCharacterActor(actor)) return;

  const fellowships = actor.system.fellowships ?? [];
  const selectedIndices = fellowships
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.selected && entry.relationshipTag && !entry.scratched)
    .map(({ index }) => index);

  if (!selectedIndices.length) return;

  // Capture before the system clears selection, then enforce scratching after
  // its own roll cleanup has completed.
  setTimeout(async () => {
    const current = foundry.utils.deepClone(actor.system.fellowships ?? []);
    let changed = false;

    for (const index of selectedIndices) {
      const entry = current[index];
      if (!entry) continue;
      if (!entry.scratched || entry.selected) {
        entry.scratched = true;
        entry.selected = false;
        changed = true;
      }
    }

    if (changed) await actor.update({ "system.fellowships": current });
  }, 350);
}

function captureAndScratchSingleUseTags(message, data) {
  const actorId = data?.speaker?.actor ?? message?.speaker?.actor;
  const actor = actorId ? game.actors.get(actorId) : null;
  if (!isCharacterActor(actor)) return;

  const records = getSingleUseRecords(actor);
  if (!records.length) return;

  const selectedTags = (actor.system.floatingTagsAndStatuses ?? [])
    .map((tag, index) => ({ tag, index }))
    .filter(({ tag }) => tag.selected && !tag.isStatus);
  if (!selectedTags.length) return;

  const recordsToRemove = [];
  const indicesToRemove = [];
  const availableRecords = [...records];

  for (const { tag, index } of selectedTags) {
    const recordIndex = availableRecords.findIndex(record => record.name === tag.name);
    if (recordIndex === -1) continue;
    recordsToRemove.push(availableRecords[recordIndex].id);
    availableRecords.splice(recordIndex, 1);
    indicesToRemove.push(index);
  }
  if (!indicesToRemove.length) return;

  // The system clears selected tags just after creating the roll message. Wait for
  // that update, then remove the invoked single-use entries from the native array.
  setTimeout(async () => {
    const currentTags = foundry.utils.deepClone(actor.system.floatingTagsAndStatuses ?? []);
    const filteredTags = currentTags.filter((_tag, index) => !indicesToRemove.includes(index));
    const currentRecords = getSingleUseRecords(actor);
    const filteredRecords = currentRecords.filter(record => !recordsToRemove.includes(record.id));

    await actor.update({ "system.floatingTagsAndStatuses": filteredTags });
    if (filteredRecords.length) await actor.setFlag(MODULE_ID, SINGLE_USE_FLAG, filteredRecords);
    else await actor.unsetFlag(MODULE_ID, SINGLE_USE_FLAG);
  }, 300);
}



const TRADE_POWER_TOOLTIP = `Exchange roll strength for greater Effect, or greater roll strength for reduced Effect. See Core Book Vol. I, page 158.`;
const THROW_CAUTION_TOOLTIP = `At final Power 2 or less, roll with −1 Power. On success, add 1 to the normal Detailed-roll Power available to spend. See Core Book Vol. I, page 158.`;
const HEDGE_RISKS_TOOLTIP = `At final Power 2 or more, roll with +1 Power. On success, spend 1 less than the original Power. See Core Book Vol. I, page 158.`;
const pendingPowerTrades = new Map();

const MAKE_SACRIFICE_TOOLTIP = `Choose a Painful, Scarring, or Grave Sacrifice to attempt an extraordinary Quick outcome without adding Power from tags or statuses. The Narrator establishes what success can achieve and may assign a modifier. A 10+ succeeds with a lessened Sacrifice; 7–9 succeeds at full cost; 6 or less pays the cost without achieving the goal. See Core Book Vol. I, page 159.`;

const SACRIFICE_LEVELS = {
  painful: {
    label: "Painful",
    tooltip: `Attempt something unlikely or unusually demanding. Scratch every power tag in a relevant theme, or one power tag if the Sacrifice is lessened. See Core Book Vol. I, page 159.`
  },
  scarring: {
    label: "Scarring",
    tooltip: `Attempt something extraordinary. Replace a relevant theme, or scratch all its power tags if the Sacrifice is lessened. See Core Book Vol. I, page 159.`
  },
  grave: {
    label: "Grave",
    tooltip: `Attempt something otherwise impossible. Take an unmitigated tier-6 status, or replace a relevant theme if the Sacrifice is lessened. See Core Book Vol. I, page 159.`
  }
};

const pendingSacrifices = new Map();


function getTradeDelta(type) {
  if (type === "throw") return -1;
  if (type === "hedge") return 1;
  return 0;
}

function removeTradeModifier(app) {
  const type = app?._litmQolPowerTrade?.type;
  if (type === "throw") app.numModNegative = Math.max(0, (app.numModNegative || 0) - 1);
  if (type === "hedge") app.numModPositive = Math.max(0, (app.numModPositive || 0) - 1);
  app._litmQolPowerTrade = null;
}

function applyTradeModifier(app, type, originalPower) {
  removeTradeModifier(app);
  if (type === "throw") app.numModNegative = (app.numModNegative || 0) + 1;
  if (type === "hedge") app.numModPositive = (app.numModPositive || 0) + 1;
  app._litmQolPowerTrade = { type, originalPower };
}



function clearRollContributorsForSacrifice(app, form = null, { resetMods = false } = {}) {
  app.selectedTags = [];
  app.selectedGmTags = [];
  app.selectedStoryTags = [];
  app.challengeTags = [];
  if (resetMods) {
    app.numModPositive = 0;
    app.numModNegative = 0;
  }
  app.mightScale = 0;

  if (!form) return;
  const positiveInput = form.querySelector("#positiveInput");
  const negativeInput = form.querySelector("#negativeInput");
  if (resetMods) {
    if (positiveInput) positiveInput.value = 0;
    if (negativeInput) negativeInput.value = 0;
  }
  for (const radio of form.querySelectorAll('input[name="might_scale"]')) {
    radio.checked = radio.value === "0";
  }
  const powerLabel = form.querySelector(".power-label");
  if (powerLabel) powerLabel.textContent = `Power: ${app.computePowerAmount?.() ?? 0}`;
}

function setSacrificeNativeControlsDisabled(form, disabled) {
  // Sacrifice removes tag/status Power and Might, but the Narrator may still
  // instruct the player to apply a positive or negative modifier.
  for (const selector of [
    'input[name="might_scale"]'
  ]) {
    for (const element of form.querySelectorAll(selector)) {
      if (element.matches("input")) element.disabled = disabled;
      element.classList.toggle("litm-qol-sacrifice-disabled-control", disabled);
      element.setAttribute("aria-disabled", String(disabled));
    }
  }
}

function renderMakeSacrificeSection(app, form) {
  if (app.rollType !== "quick" || form.querySelector(".litm-qol-make-sacrifice")) return;

  const selected = app._litmQolSacrifice?.level ?? null;
  if (selected) clearRollContributorsForSacrifice(app, form);

  const section = document.createElement("div");
  section.className = "scene-app-might-modifier litm-qol-make-sacrifice";
  section.innerHTML = `
    <div class="npc-subtitle-container-c">
      <div class="npc-subtitle-text">${rulesTooltip("Make a Sacrifice", MAKE_SACRIFICE_TOOLTIP)}</div>
    </div>
    <div class="flexrow litm-qol-sacrifice-options">
      ${Object.entries(SACRIFICE_LEVELS).map(([key, value]) => `
        <div class="might-scale-entry litm-qol-sacrifice-option">
          <input type="checkbox" name="litmQolSacrifice" class="litm-qol-sacrifice-checkbox" value="${key}" ${selected === key ? "checked" : ""}>
          <span>${rulesTooltip(value.label, value.tooltip)}</span>
        </div>`).join("")}
    </div>`;

  const powerBlock = form.querySelector(".mt-10");
  form.insertBefore(section, powerBlock ?? form.querySelector("footer"));
  setSacrificeNativeControlsDisabled(form, Boolean(selected));

  for (const checkbox of section.querySelectorAll('input[name="litmQolSacrifice"]')) {
    checkbox.addEventListener("click", event => {
      event.stopPropagation();
      const level = checkbox.value;

      if (app._litmQolSacrifice?.level === level) {
        app._litmQolSacrifice = null;
        checkbox.checked = false;
        setSacrificeNativeControlsDisabled(form, false);
        return;
      }

      app._litmQolSacrifice = { level };
      clearRollContributorsForSacrifice(app, form, { resetMods: true });
      for (const other of section.querySelectorAll('input[name="litmQolSacrifice"]')) {
        other.checked = other === checkbox;
      }
      setSacrificeNativeControlsDisabled(form, true);

      // Remove every selected tag/status row from the visible dialog immediately.
      for (const container of form.querySelectorAll(".selected-tags-container")) {
        for (const child of [...container.children]) {
          if (!child.matches("label.resource-label")) child.remove();
        }
      }
    });
  }

  const rollButton = form.querySelector('[data-action="clickedRoll"]');
  rollButton?.addEventListener("click", () => {
    const level = app._litmQolSacrifice?.level;
    const actorId = app.actor?.id;
    if (!level || !actorId) return;

    clearRollContributorsForSacrifice(app, form);
    pendingSacrifices.set(actorId, { level, createdAt: Date.now() });
  }, { capture: true });

  if (!app._litmQolQuickHeightAdjusted) {
    app._litmQolQuickHeightAdjusted = true;
    const currentHeight = Number(app.position?.height ?? app.options?.position?.height ?? 600);
    if (currentHeight <= 600) {
      app.options.position.height = 680;
      queueMicrotask(() => app.setPosition?.({ height: 680 }));
    }
  }
}

function sacrificeConsequence(level, lessened = false) {
  if (level === "painful") {
    return lessened
      ? "Scratch one tag in a relevant theme."
      : "Scratch all tags in a relevant theme.";
  }
  if (level === "scarring") {
    return lessened
      ? "Scratch all tags in a relevant theme."
      : "Replace a relevant theme.";
  }
  if (level === "grave") {
    return lessened
      ? "Replace a relevant theme."
      : "Take a tier-6 status without lessening.";
  }
  return "";
}

function sacrificeConsequenceAction(level, lessened = false) {
  if (level === "painful") {
    return lessened
      ? { id: "scratch-one", label: "Scratch One Tag" }
      : { id: "scratch-all", label: "Scratch All Tags" };
  }
  if (level === "scarring") {
    return lessened
      ? { id: "scratch-all", label: "Scratch All Tags" }
      : { id: "replace-theme", label: "Replace Theme" };
  }
  if (level === "grave") {
    return lessened
      ? { id: "replace-theme", label: "Replace Theme" }
      : { id: "tier-six-status", label: "Apply Tier-6 Status" };
  }
  return null;
}

function sacrificeActionButton(action) {
  if (!action) return "";
  return `<button type="button" class="litm-qol-sacrifice-card-action" data-sacrifice-action="${action.id}">${action.label}</button>`;
}

function sacrificeThemeTitle(theme) {
  const titleTag = (theme.system?.powertags ?? []).find(tag => String(tag?.name ?? "").trim() && !tag?.planned);
  const title = String(titleTag?.name ?? "").trim();
  const type = String(theme.system?.name ?? theme.name ?? "Theme").trim();
  return title ? `${type} – ${title}` : type;
}

function sacrificeThemes(actor) {
  return actor.items
    .filter(item => item.type === "themebook" && !item.system?.options?.isStoryTheme)
    .sort((a, b) => sacrificeThemeTitle(a).localeCompare(sacrificeThemeTitle(b)));
}

function activeSacrificeTags(theme) {
  return (theme.system?.powertags ?? [])
    .map((tag, index) => ({ tag, index, kind: "power" }))
    .filter(({ tag }) => String(tag?.name ?? "").trim() && !tag?.planned && !tag?.burned);
}

function bindSacrificeChoiceDialog(dialog, name, action = "choose") {
  const root = dialog.element;
  const choices = [...root.querySelectorAll(`input[name="${name}"]`)];
  const button = root.querySelector(`[data-action="${action}"]`);
  const refresh = selected => {
    for (const choice of choices) choice.checked = choice === selected;
    if (button) button.disabled = !selected;
  };
  for (const choice of choices) {
    choice.addEventListener("change", () => refresh(choice.checked ? choice : null));
  }
  refresh(choices.find(choice => choice.checked) ?? null);
}

async function chooseSacrificeTheme(actor, title, { requireActiveTags = false } = {}) {
  const themes = sacrificeThemes(actor).filter(theme => !requireActiveTags || activeSacrificeTags(theme).length);
  if (!themes.length) {
    ui.notifications.warn(requireActiveTags
      ? "This Hero has no themes with active tags available to scratch."
      : "This Hero has no themes available.");
    return null;
  }

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    classes: ["litm-qol-system-dialog"],
    content: `
      <div class="litm-qol-sacrifice-card-dialog">
        <p>Choose the relevant theme.</p>
        <div class="litm-qol-sacrifice-card-choices">
          ${themes.map(theme => `
            <label>
              <input type="checkbox" name="sacrificeTheme" value="${theme.id}">
              <span>${foundry.utils.escapeHTML(sacrificeThemeTitle(theme))}</span>
            </label>`).join("")}
        </div>
      </div>`,
    render: (_event, dialog) => bindSacrificeChoiceDialog(dialog, "sacrificeTheme"),
    buttons: [
      { action: "cancel", label: "Cancel", callback: () => null },
      {
        action: "choose",
        label: "Next",
        default: true,
        callback: (_event, button) => button.form.querySelector('[name="sacrificeTheme"]:checked')?.value ?? null
      }
    ],
    rejectClose: false
  });
  return result ? actor.items.get(result) ?? null : null;
}

async function chooseSacrificeTag(theme) {
  const tags = activeSacrificeTags(theme);
  if (!tags.length) return null;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `Scratch a Tag — ${sacrificeThemeTitle(theme)}` },
    classes: ["litm-qol-system-dialog"],
    content: `
      <div class="litm-qol-sacrifice-card-dialog">
        <p>Choose the tag to scratch.</p>
        <div class="litm-qol-sacrifice-card-choices">
          ${tags.map(({ tag, index, kind }) => `
            <label>
              <input type="checkbox" name="sacrificeTag" value="${kind}:${index}">
              <span class="tag ${kind === "power" ? "positive" : "negative"}">${foundry.utils.escapeHTML(tag.name)}</span>
            </label>`).join("")}
        </div>
      </div>`,
    render: (_event, dialog) => bindSacrificeChoiceDialog(dialog, "sacrificeTag", "scratch"),
    buttons: [
      { action: "cancel", label: "Cancel", callback: () => null },
      {
        action: "scratch",
        label: "Scratch Tag",
        default: true,
        callback: (_event, button) => button.form.querySelector('[name="sacrificeTag"]:checked')?.value ?? null
      }
    ],
    rejectClose: false
  });
  if (!result) return null;
  const [kind, rawIndex] = result.split(":");
  const index = Number(rawIndex);
  return tags.find(tag => tag.kind === kind && tag.index === index) ?? null;
}

async function scratchOneSacrificeTag(actor) {
  const theme = await chooseSacrificeTheme(actor, "Scratch One Tag", { requireActiveTags: true });
  if (!theme) return false;
  const selection = await chooseSacrificeTag(theme);
  if (!selection) return false;
  const path = selection.kind === "power" ? "powertags" : "weaknesstags";
  const tags = foundry.utils.deepClone(theme.system?.[path] ?? []);
  if (!tags[selection.index] || tags[selection.index].burned) return false;
  tags[selection.index].burned = true;
  await theme.update({ [`system.${path}`]: tags });
  return true;
}

async function scratchAllSacrificeTags(actor) {
  const theme = await chooseSacrificeTheme(actor, "Scratch All Tags", { requireActiveTags: true });
  if (!theme) return false;
  const power = foundry.utils.deepClone(theme.system?.powertags ?? []);
  let changed = false;
  for (const tag of power) {
    if (!String(tag?.name ?? "").trim() || tag.planned || tag.burned) continue;
    tag.burned = true;
    changed = true;
  }
  if (!changed) return false;
  await theme.update({ "system.powertags": power });
  return true;
}

async function replaceSacrificeTheme(actor) {
  const theme = await chooseSacrificeTheme(actor, "Replace a Theme");
  if (!theme) return false;
  const replacement = await runReplaceTheme(actor, theme, { allowWithoutAbandon: true });
  return Boolean(replacement);
}

async function applySacrificeTierSixStatus(actor) {
  let name;
  try {
    name = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Apply Tier-6 Status" },
      classes: ["litm-qol-system-dialog"],
      content: `
        <div class="litm-qol-sacrifice-card-dialog">
          <p>Enter the tier-6 status imposed by the Grave Sacrifice.</p>
          <label>
            <span>Status name</span>
            <input type="text" name="statusName" autofocus autocomplete="off" placeholder="Tier-6 status">
          </label>
        </div>`,
      ok: {
        label: "Apply Status",
        callback: (_event, button) => button.form.elements.statusName.value
      }
    });
  } catch (_error) {
    return false;
  }
  name = String(name ?? "").trim();
  if (!name) return false;

  const statuses = foundry.utils.deepClone(actor.system?.floatingTagsAndStatuses ?? []);
  statuses.push({
    name,
    isStatus: true,
    value: 6,
    description: "",
    markings: [false, false, false, false, false, true]
  });
  await actor.update({ "system.floatingTagsAndStatuses": statuses });
  return true;
}

async function applySacrificeCardAction(actor, action) {
  if (action === "scratch-one") return scratchOneSacrificeTag(actor);
  if (action === "scratch-all") return scratchAllSacrificeTags(actor);
  if (action === "replace-theme") return replaceSacrificeTheme(actor);
  if (action === "tier-six-status") return applySacrificeTierSixStatus(actor);
  return false;
}

function applySacrificeToChat(message, data) {
  const actorId = data?.speaker?.actor ?? message?.speaker?.actor;
  if (!actorId) return;
  const sacrifice = pendingSacrifices.get(actorId);
  if (!sacrifice || Date.now() - sacrifice.createdAt > 15000) return;

  const content = String(data?.content ?? message?.content ?? "");
  if (!content.includes('class="roll-card"') || !content.includes("consequence-result-")) return;
  pendingSacrifices.delete(actorId);

  const wrapper = document.createElement("div");
  wrapper.innerHTML = content;
  const result = wrapper.querySelector(".consequence-result-negative, .consequence-result-neutral, .consequence-result-positive");
  if (!result) return;

  const levelData = SACRIFICE_LEVELS[sacrifice.level];
  const isMiracle = result.classList.contains("consequence-result-positive");
  const isFate = result.classList.contains("consequence-result-neutral");
  const outcome = isMiracle ? "Miracle" : isFate ? "Fate" : "In Vain";
  const range = isMiracle ? "10+" : isFate ? "7–9" : "6−";
  const iconClass = isMiracle ? "positive" : isFate ? "neutral" : "negative";
  const consequence = sacrificeConsequence(sacrifice.level, isMiracle);
  const consequenceAction = sacrificeConsequenceAction(sacrifice.level, isMiracle);
  const consequenceControl = sacrificeActionButton(consequenceAction);

  let explanation;
  if (isMiracle) {
    const lessenedText = sacrifice.level === "painful"
      ? "Your Painful Sacrifice is lessened."
      : `Your ${levelData.label} Sacrifice is lessened by one level.`;
    explanation = `<p><strong>You Succeed.</strong> ${lessenedText}</p><p><strong>Consequence:</strong> ${consequence}</p>${consequenceControl}`;
  } else if (isFate) {
    explanation = `<p><strong>You Succeed</strong> and suffer the full ${levelData.label} Sacrifice.</p><p><strong>Consequence:</strong> ${consequence}</p>${consequenceControl}`;
  } else {
    explanation = `<p>The action fails and you suffer the full ${levelData.label} Sacrifice.</p><p><strong>Consequence:</strong> ${consequence}</p>${consequenceControl}<p>The Narrator may introduce additional Consequences.</p>`;
  }

  result.innerHTML = `
    <span class="heading"><i class="consequence-result-icon ${iconClass}"></i>${range} — ${outcome}</span>
    <p class="litm-qol-sacrifice-level"><strong>Sacrifice:</strong> ${rulesTooltip(levelData.label, levelData.tooltip)}</p>
    ${explanation}`;

  const title = wrapper.querySelector(".card-title");
  if (title) title.textContent = "Make a Sacrifice";
  wrapper.querySelector(".power-counter")?.remove();

  const updated = wrapper.innerHTML;
  if (message?.updateSource) message.updateSource({ content: updated });
  if (data) data.content = updated;
}


function renderTradePowerSection(app, html) {
  const root = getRootElement(html);
  if (!root || !root.classList.contains("dice-roll-app")) return;
  const form = root.querySelector("form.roll-dialog-container");
  if (!form) return;

  const positiveInput = form.querySelector("#positiveInput");
  const negativeInput = form.querySelector("#negativeInput");
  if (positiveInput) positiveInput.value = app.numModPositive ?? 0;
  if (negativeInput) negativeInput.value = app.numModNegative ?? 0;

  const powerLabel = form.querySelector(".power-label");
  if (powerLabel) powerLabel.textContent = `Power: ${app.computePowerAmount?.() ?? 0}`;

  renderAskForHelpSection(app, form);

  if (app.rollType === "quick") {
    renderMakeSacrificeSection(app, form);
    return;
  }
  if (app.rollType !== "detailed" || form.querySelector(".litm-qol-trade-power")) return;

  const currentTrade = app._litmQolPowerTrade;
  const displayedPower = Number(app.computePowerAmount?.() ?? 0);
  // computePowerAmount includes the trade modifier while one is selected.
  const originalPower = currentTrade
    ? displayedPower - getTradeDelta(currentTrade.type)
    : displayedPower;
  const throwAllowed = originalPower <= 2;
  const hedgeAllowed = originalPower >= 2;

  const section = document.createElement("div");
  section.className = "scene-app-might-modifier litm-qol-trade-power";
  section.innerHTML = `
    <div class="npc-subtitle-container-c">
      <div class="npc-subtitle-text">${rulesTooltip("Trade Power", TRADE_POWER_TOOLTIP)}</div>
    </div>
    <div class="flexrow litm-qol-trade-options">
      <div class="might-scale-entry litm-qol-trade-option ${throwAllowed ? "" : "disabled"}" data-allowed="${throwAllowed}">
        <input type="checkbox" name="litmQolPowerTrade" class="litm-qol-trade-checkbox" value="throw" aria-disabled="${!throwAllowed}" ${currentTrade?.type === "throw" ? "checked" : ""}>
        <span>${rulesTooltip("Throw caution to the wind", THROW_CAUTION_TOOLTIP)}</span>
        <small>−1 Power to the roll</small>
      </div>
      <div class="might-scale-entry litm-qol-trade-option ${hedgeAllowed ? "" : "disabled"}" data-allowed="${hedgeAllowed}">
        <input type="checkbox" name="litmQolPowerTrade" class="litm-qol-trade-checkbox" value="hedge" aria-disabled="${!hedgeAllowed}" ${currentTrade?.type === "hedge" ? "checked" : ""}>
        <span>${rulesTooltip("Hedge your risks", HEDGE_RISKS_TOOLTIP)}</span>
        <small>+1 Power to the roll</small>
      </div>
    </div>`;

  const powerBlock = form.querySelector(".mt-10");
  form.insertBefore(section, powerBlock ?? form.querySelector("footer"));

  const refreshVisiblePower = () => {
    if (positiveInput) positiveInput.value = app.numModPositive ?? 0;
    if (negativeInput) negativeInput.value = app.numModNegative ?? 0;
    const label = form.querySelector(".power-label");
    if (label) label.textContent = `Power: ${app.computePowerAmount?.() ?? 0}`;
  };

  for (const checkbox of section.querySelectorAll('input[name="litmQolPowerTrade"]')) {
    checkbox.addEventListener("click", event => {
      event.stopPropagation();
      const option = checkbox.closest(".litm-qol-trade-option");
      const allowed = option?.dataset.allowed === "true";

      if (!allowed) {
        event.preventDefault();
        checkbox.checked = false;
        return;
      }

      if (app._litmQolPowerTrade?.type === checkbox.value) {
        removeTradeModifier(app);
        checkbox.checked = false;
        refreshVisiblePower();
        return;
      }

      applyTradeModifier(app, checkbox.value, originalPower);
      for (const other of section.querySelectorAll('input[name="litmQolPowerTrade"]')) {
        other.checked = other === checkbox;
      }
      refreshVisiblePower();
    });
  }

  const rollButton = form.querySelector('[data-action="clickedRoll"]');
  rollButton?.addEventListener("click", () => {
    const trade = app._litmQolPowerTrade;
    const actorId = app.actor?.id;
    if (!trade || !actorId) return;
    pendingPowerTrades.set(actorId, { ...trade, createdAt: Date.now() });
  }, { capture: true });

  if (!app._litmQolHeightAdjusted) {
    app._litmQolHeightAdjusted = true;
    const currentHeight = Number(app.position?.height ?? app.options?.position?.height ?? 600);
    if (currentHeight <= 600) {
      app.options.position.height = 660;
      queueMicrotask(() => app.setPosition?.({ height: 660 }));
    }
  }
}

function resetRollDialogStateOnClose(app) {
  const root = app?.element;
  if (!root?.classList?.contains("dice-roll-app")) return;

  // Ensure a canceled dialog cannot seed the next opening with stale values.
  removeTradeModifier(app);
  app.numModPositive = 0;
  app.numModNegative = 0;
  app.mightScale = 0;
  app._litmQolPowerTrade = null;
  app._litmQolSacrifice = null;
}

function applyTradePowerToChat(message, data) {
  const actorId = data?.speaker?.actor ?? message?.speaker?.actor;
  if (!actorId) return;
  const trade = pendingPowerTrades.get(actorId);
  if (!trade || Date.now() - trade.createdAt > 15000) return;

  const content = String(data?.content ?? message?.content ?? "");
  if (!content.includes('class="roll-card"') || !content.includes("consequence-result-")) return;
  pendingPowerTrades.delete(actorId);

  const wrapper = document.createElement("div");
  wrapper.innerHTML = content;
  const successful = wrapper.querySelector(".consequence-result-neutral, .consequence-result-positive");
  const counter = wrapper.querySelector(".power-counter");
  if (!counter) return;

  const name = trade.type === "throw" ? "Throw caution to the wind" : "Hedge your risks";
  const rollDelta = trade.type === "throw" ? "−1" : "+1";

  const rollPower = trade.originalPower + getTradeDelta(trade.type);

  if (successful) {
    const baseSpendable = Math.max(1, trade.originalPower);
    const spendable = trade.type === "throw"
      ? baseSpendable + 1
      : Math.max(1, trade.originalPower - 1);
    let math;
    if (trade.type === "throw") {
      math = trade.originalPower < 1
        ? `${name}: rolled with ${rollPower} Power. A successful detailed roll provides at least 1 Power to spend; +1 from the trade = ${spendable} Power.`
        : `${name}: rolled with ${rollPower} Power. Original ${trade.originalPower} Power + 1 from the trade = ${spendable} Power to spend.`;
    } else {
      math = `${name}: rolled with ${rollPower} Power. Original ${trade.originalPower} Power − 1 from the trade = ${spendable} Power to spend.`;
    }
    math += " See Core Book Vol. I, page 158.";

    counter.textContent = `Power: ${spendable}`;
    counter.classList.add("litm-qol-traded-power-counter");
    counter.dataset.tooltip = math;
    counter.dataset.tooltipDirection = "UP";
  } else {
    counter.classList.add("litm-qol-traded-power-counter");
    counter.dataset.tooltip = `${name}: ${rollDelta} Power was applied to the roll, so you rolled with ${rollPower} Power. The spending adjustment applies only on a success; a successful Detailed roll always gives at least 1 Power to spend. See Core Book Vol. I, page 158.`;
    counter.dataset.tooltipDirection = "UP";
  }

  const updated = wrapper.innerHTML;
  if (message?.updateSource) message.updateSource({ content: updated });
  if (data) data.content = updated;
}

function applyReactionTenPlusBonus(message, data) {
  const content = String(data?.content ?? message?.content ?? "");
  if (!content.includes("litm-qol-reaction-success")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = content;
  const success = wrapper.querySelector(".consequence-result-positive .litm-qol-reaction-success");
  const counter = wrapper.querySelector(".consequence-result-positive .power-counter");
  if (!success || !counter || counter.dataset.litmQolReactionBonusApplied === "true") return;

  const match = counter.textContent.match(/-?\d+/);
  if (!match) return;
  const originalPower = Number(match[0]);
  const finalPower = originalPower + 1;

  counter.textContent = `Power: ${finalPower}`;
  counter.dataset.litmQolReactionBonusApplied = "true";
  counter.dataset.tooltip = `Includes +1 bonus Power for rolling 10+ on a Reaction (${originalPower} + 1 = ${finalPower}). See Core Book Vol. I, page 162.`;
  counter.dataset.tooltipDirection = "UP";
  counter.classList.add("litm-qol-traded-power-counter", "litm-qol-reaction-bonus-power");

  const updated = wrapper.innerHTML;
  if (message?.updateSource) message.updateSource({ content: updated });
  if (data) data.content = updated;
}

async function patchDiceRollOpeningReset() {
  if (game.system.id !== "mist-engine-fvtt") return;

  const { DiceRollApp } = await import("/systems/mist-engine-fvtt/module/apps/dice-roll-app.mjs");
  const proto = DiceRollApp?.prototype;
  if (!proto || proto._litmQolOpeningResetPatched) return;

  const originalRender = proto.render;
  proto.render = function(...args) {
    // DiceRollApp is a singleton. When it is opened again after a roll or cancel,
    // reset the persisted native controls before Handlebars prepares the form.
    // Native rerenders while the window is already open preserve user changes.
    if (!this.rendered) {
      this.numModPositive = 0;
      this.numModNegative = 0;
      this.mightScale = 0;
      this._litmQolPowerTrade = null;
      this._litmQolSacrifice = null;
    }
    return originalRender.apply(this, args);
  };

  Object.defineProperty(proto, "_litmQolOpeningResetPatched", {
    value: true,
    configurable: true
  });
}


/* ------------------------------------------------------------------------- */
/* Ask for Help                                                             */
/* ------------------------------------------------------------------------- */

let helpSocket = null;
const helpRequests = new Map();
const helpStatusDialogs = new Map();
let activeHelpRollApp = null;

function getPlayerCharacter(user) {
  const actor = user?.character;
  return isCharacterActor(actor) ? actor : null;
}

function getAvailablePowerTags(actor) {
  if (!actor) return [];
  const tags = [];

  for (const item of actor.items ?? []) {
    if (item.type === "themebook") {
      for (const [index, tag] of (item.system.powertags ?? []).entries()) {
        if (!tag?.name?.trim() || tag.burned) continue;
        tags.push({
          id: `themebook:${item.id}:${index}`,
          name: tag.name.trim(),
          actorId: actor.id,
          actorName: actor.name,
          source: "themebook",
          itemId: item.id,
          index
        });
      }
    }

    if (item.type === "backpack") {
      for (const [index, tag] of (item.system.items ?? []).entries()) {
        if (!tag?.name?.trim() || tag.burned) continue;
        tags.push({
          id: `backpack:${item.id}:${index}`,
          name: tag.name.trim(),
          actorId: actor.id,
          actorName: actor.name,
          source: "backpack",
          itemId: item.id,
          index
        });
      }
    }
  }

  const availableSingleUseRecords = [...getSingleUseRecords(actor)];
  for (const [index, tag] of (actor.system.floatingTagsAndStatuses ?? []).entries()) {
    if (!tag?.name?.trim() || tag.isStatus || tag.positive === false || tag.burned) continue;

    const name = tag.name.trim();
    const singleUseRecordIndex = availableSingleUseRecords.findIndex(record => record.name === name);
    const singleUseRecord = singleUseRecordIndex >= 0
      ? availableSingleUseRecords.splice(singleUseRecordIndex, 1)[0]
      : null;

    tags.push({
      id: `floating:${index}`,
      name,
      actorId: actor.id,
      actorName: actor.name,
      source: "floating",
      index,
      singleUse: Boolean(singleUseRecord),
      singleUseRecordId: singleUseRecord?.id ?? null
    });
  }

  return tags.sort((a, b) => a.name.localeCompare(b.name));
}

function getAvailableWeaknesses(actor) {
  if (!actor) return [];
  const tags = [];
  for (const item of actor.items ?? []) {
    if (item.type !== "themebook") continue;
    for (const [index, tag] of (item.system.weaknesstags ?? []).entries()) {
      if (!tag?.name?.trim() || tag.planned) continue;
      tags.push({
        id: `${actor.id}:${item.id}:${index}`,
        name: tag.name.trim(),
        actorId: actor.id,
        actorName: actor.name,
        itemId: item.id,
        index
      });
    }
  }
  return tags.sort((a, b) => a.actorName.localeCompare(b.actorName) || a.name.localeCompare(b.name));
}

function helpStatusLabel(response) {
  if (!response || response.status === "pending") return `<span class="litm-qol-help-pending">Pending</span>`;
  if (response.status === "declined") return `<span class="litm-qol-help-declined">Declined</span>`;
  if (response.status === "accepted") {
    const burn = response.burn ? ` <strong>(Burn for 3 Power)</strong>` : "";
    return `<span class="litm-qol-help-accepted">Accepted — <span class="tag positive">${foundry.utils.escapeHTML(response.tag?.name ?? "Tag")}</span>${burn}</span>`;
  }
  return foundry.utils.escapeHTML(response.status ?? "Pending");
}

function helpStatusRows(request) {
  return request.targetUserIds.map(userId => {
    const user = game.users.get(userId);
    const response = request.responses[userId] ?? { status: "pending" };
    return `<div class="litm-qol-help-status-row"><strong>${foundry.utils.escapeHTML(user?.name ?? "Player")}</strong><span>${helpStatusLabel(response)}</span></div>`;
  }).join("");
}

function updateHelpStatusDialog(requestId) {
  const request = helpRequests.get(requestId);
  const dialog = helpStatusDialogs.get(requestId);
  const root = dialog?.element;
  if (!request || !root) return;
  const list = root.querySelector(".litm-qol-help-status-list");
  if (list) list.innerHTML = helpStatusRows(request);
  const note = root.querySelector(".litm-qol-help-status-note");
  if (note) {
    note.textContent = request.sentToGm
      ? "All responses received. Waiting for the Narrator’s approval."
      : "Waiting for responses…";
  }
}

function openHelpStatusDialog(request) {
  const dialog = new foundry.applications.api.DialogV2({
    window: { title: request.mode === "group" ? "Group Action" : "Ask for Help" },
    classes: ["mist-engine", "litm-qol-system-dialog"],
    content: `
      <div class="litm-qol-help-status-dialog">
        <p class="litm-qol-help-status-note">Waiting for responses…</p>
        <div class="litm-qol-help-status-list">${helpStatusRows(request)}</div>
      </div>`,
    buttons: [{ action: "close", label: "Close", default: true }]
  });
  helpStatusDialogs.set(request.id, dialog);
  dialog.render(true);
}

function tagFromSheetElement(element, tags) {
  if (!element) return null;

  if (element.matches(".pt-selectable")) {
    const itemId = element.dataset.itemId ?? "";
    const index = Number(element.dataset.powertagIndex);
    return tags.find(tag => tag.itemId === itemId && tag.index === index) ?? null;
  }

  if (element.matches(".fts-selectable")) {
    const index = Number(element.dataset.index);
    return tags.find(tag => tag.source === "floating" && tag.index === index) ?? null;
  }

  return null;
}

async function chooseHelpTagFromCharacterSheet(actor, request) {
  const tags = getAvailablePowerTags(actor);
  if (!tags.length) {
    ui.notifications.warn("Your character has no available tags to contribute.");
    return null;
  }

  const sheet = actor.sheet;
  if (!sheet) {
    ui.notifications.error("Could not open your character sheet.");
    return null;
  }

  sheet.render(true);

  return new Promise(resolve => {
    let settled = false;
    let instructionDialog = null;
    let banner = null;
    let confirming = false;

    const cleanup = (result = null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("click", onSheetClick, true);
      banner?.remove();
      sheet.element?.classList?.remove("litm-qol-help-pick-mode");
      instructionDialog?.close?.({ animate: false });
      resolve(result);
    };

    const confirmTag = async (tag, burn = false) => {
      confirming = true;
      let result = null;
      const power = burn ? 3 : 1;
      try {
        result = await foundry.applications.api.DialogV2.wait({
          window: { title: request.mode === "group" ? "Confirm Group Action Tag" : "Confirm Help Tag" },
          classes: ["mist-engine", "litm-qol-system-dialog"],
          content: `
            <div class="litm-qol-help-confirm">
              <p>Contribute <span class="tag positive">${foundry.utils.escapeHTML(tag.name)}</span> from <strong>${foundry.utils.escapeHTML(actor.name)}</strong>?</p>
              <p>This gives ${foundry.utils.escapeHTML(request.requesterActorName)} +${power} Power if the Narrator approves it.${burn ? " The tag will be burned when the Group Action roll is made." : ""}</p>
            </div>`,
          buttons: [
            {
              action: "confirm",
              label: burn ? "Confirm Burn" : "Confirm Tag",
              default: true,
              callback: () => ({ confirmed: true })
            },
            { action: "another", label: "Choose Another", callback: () => ({ confirmed: false }) }
          ],
          close: () => ({ confirmed: false })
        });
      } catch (_error) {
        result = null;
      }
      confirming = false;
      if (result?.confirmed) cleanup({ tag, burn });
    };

    const install = () => {
      const root = sheet.element;
      if (!root) {
        setTimeout(install, 50);
        return;
      }

      root.classList.add("litm-qol-help-pick-mode");
      const content = root.querySelector(".window-content") ?? root;
      banner = document.createElement("div");
      banner.className = "litm-qol-sheet-pick-banner";
      const burnInstruction = request.mode === "group"
        ? (request.existingBurnPresent
          ? "A tag is already being burned for this roll, so additional burn contributions are unavailable."
          : "Click a tag for +1 Power, or click its burn icon for +3 Power. Only one tag may be burned.")
        : "Click an available tag on this sheet.";
      banner.innerHTML = `<strong>Choose one tag to ${request.mode === "group" ? "contribute to the Group Action for" : "help"} ${foundry.utils.escapeHTML(request.requesterActorName)}.</strong><span>${burnInstruction} Burned tags cannot be contributed.</span>`;
      content.prepend(banner);
      document.addEventListener("click", onSheetClick, true);
    };

    const onSheetClick = event => {
      if (confirming) return;
      const root = sheet.element;
      if (!root || !root.contains(event.target)) return;

      const burnControl = event.target.closest?.('.burn-indicator[data-action="toggleToBurn"]');
      if (burnControl && root.contains(burnControl)) {
        if (request.mode !== "group") return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (request.existingBurnPresent) {
          ui.notifications.warn("A tag is already being burned for this Group Action.");
          return;
        }

        const itemId = burnControl.dataset.itemId ?? "";
        const index = Number(burnControl.dataset.powertagIndex);
        const tag = tags.find(entry => entry.itemId === itemId && entry.index === index) ?? null;
        if (!tag || tag.singleUse) {
          ui.notifications.warn("That tag cannot be burned as a Group Action contribution.");
          return;
        }

        void confirmTag(tag, true);
        return;
      }

      const element = event.target.closest?.(".pt-selectable, .fts-selectable");
      if (!element || !root.contains(element)) return;

      const tag = tagFromSheetElement(element, tags);
      if (!tag) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void confirmTag(tag, false);
    };

    instructionDialog = new foundry.applications.api.DialogV2({
      window: { title: "Choose a Tag to Contribute" },
      classes: ["mist-engine", "litm-qol-system-dialog"],
      content: `
        <div class="litm-qol-help-sheet-instructions">
          <p>Choose one tag directly from <strong>${foundry.utils.escapeHTML(actor.name)}</strong>'s character sheet.</p>
          <p class="litm-qol-help-sheet-note">You will confirm the contribution before it is submitted.</p>
        </div>`,
      buttons: [{ action: "cancel", label: "Cancel", callback: () => cleanup(null) }],
      close: () => cleanup(null)
    });

    instructionDialog.render(true);
    install();
  });
}

async function socketPromptHelperForTag(request) {
  const actor = getPlayerCharacter(game.user);
  if (!actor) return { status: "declined" };

  let willHelp = false;
  try {
    willHelp = await foundry.applications.api.DialogV2.confirm({
      window: { title: request.mode === "group" ? `${request.requesterActorName} Is Starting a Group Action` : `${request.requesterActorName} Is Asking for Help` },
      classes: ["mist-engine", "litm-qol-system-dialog"],
      content: `
        <div class="litm-qol-help-confirm">
          <p><strong>${foundry.utils.escapeHTML(request.requesterActorName)}</strong> is ${request.mode === "group" ? "organizing a Group Action" : "asking for help"} with a ${foundry.utils.escapeHTML(request.rollType)} roll.</p>
          <p>Contribute one tag from <strong>${foundry.utils.escapeHTML(actor.name)}</strong> to give the roll <strong>+1 Power</strong> if the Narrator approves?</p>
          ${request.mode === "group" ? `<p>${request.existingBurnPresent ? "A tag is already being burned for this roll, so your contribution must be worth 1 Power." : "You may click the tag’s burn icon on your sheet to offer it for 3 Power instead."}</p>` : ""}
        </div>`,
      yes: { label: "Choose a Tag" },
      no: { label: "Decline" }
    });
  } catch (_error) {
    willHelp = false;
  }

  if (!willHelp) return { status: "declined" };

  const selection = await chooseHelpTagFromCharacterSheet(actor, request);
  return selection ? { status: "accepted", tag: selection.tag, burn: Boolean(selection.burn) } : { status: "declined" };
}

async function socketPromptGmForHelpApproval(request) {
  const accepted = request.targetUserIds
    .map(id => ({ userId: id, userName: game.users.get(id)?.name ?? "Player", response: request.responses[id] }))
    .filter(entry => entry.response?.status === "accepted");

  const involvedActorIds = new Set([
    request.requesterActorId,
    ...accepted.map(entry => entry.response.tag?.actorId).filter(Boolean)
  ]);
  const weaknesses = [...involvedActorIds]
    .map(id => game.actors.get(id))
    .flatMap(actor => getAvailableWeaknesses(actor));

  const burnCandidates = request.existingBurnPresent
    ? []
    : accepted.filter(entry => entry.response.burn);
  const contributionRows = accepted.length
    ? accepted.map(entry => `<li><strong>${foundry.utils.escapeHTML(entry.userName)}</strong><span class="tag positive">${foundry.utils.escapeHTML(entry.response.tag.name)} (from ${foundry.utils.escapeHTML(entry.response.tag.actorName)})</span>${entry.response.burn ? " <strong>— offered to burn</strong>" : ""}</li>`).join("")
    : "<li>No players accepted.</li>";

  const weaknessRows = weaknesses.length
    ? weaknesses.map(weakness => `
        <label class="litm-qol-help-weakness-choice">
          <input type="checkbox" name="weakness" value="${weakness.id}">
          <span class="tag negative">${foundry.utils.escapeHTML(weakness.name)} (from ${foundry.utils.escapeHTML(weakness.actorName)})</span>
        </label>`).join("")
    : `<p class="litm-qol-help-sheet-note">No available weakness tags were found on the involved characters.</p>`;

  let result;
  try {
    result = await foundry.applications.api.DialogV2.wait({
      window: { title: request.mode === "group" ? `Approve Group Action for ${request.requesterActorName}` : `Approve Help for ${request.requesterActorName}` },
      classes: ["mist-engine", "litm-qol-system-dialog"],
      content: `
        <div class="litm-qol-help-gm-review">
          <p>Review the proposed ${request.mode === "group" ? "Group Action" : "help"} contributions before adding them to the open roll.</p>
          <ul>${contributionRows}</ul>
          ${request.mode === "group" && request.existingBurnPresent ? `<p class="litm-qol-help-sheet-note">The initiating character already has a tag queued to burn, so all helper contributions are limited to 1 Power.</p>` : ""}
          ${request.mode === "group" && burnCandidates.length ? `
            <fieldset class="litm-qol-group-burn-review">
              <legend>Burned contribution (maximum one)</legend>
              <label><input type="radio" name="burnUserId" value=""> None</label>
              ${burnCandidates.map((entry, index) => `<label><input type="radio" name="burnUserId" value="${entry.userId}" ${burnCandidates.length === 1 && index === 0 ? "checked" : ""}> ${foundry.utils.escapeHTML(entry.response.tag.name)} (from ${foundry.utils.escapeHTML(entry.response.tag.actorName)}) — 3 Power</label>`).join("")}
            </fieldset>` : ""}
          <fieldset class="litm-qol-help-weaknesses">
            <legend>Optional weaknesses to add</legend>
            ${weaknessRows}
          </fieldset>
        </div>`,
      buttons: [
        {
          action: "approve",
          label: "Approve",
          default: true,
          callback: (_event, button) => ({
            approved: true,
            weaknessIds: [...button.form.querySelectorAll('input[name="weakness"]:checked')].map(input => input.value),
            burnUserId: button.form.querySelector('input[name="burnUserId"]:checked')?.value ?? ""
          })
        },
        {
          action: "reject",
          label: "Reject All",
          callback: () => ({ approved: false, weaknessIds: [], burnUserId: "" })
        }
      ],
      close: () => ({ approved: false, weaknessIds: [], burnUserId: "" })
    });
  } catch (_error) {
    result = { approved: false, weaknessIds: [], burnUserId: "" };
  }

  const selectedWeaknessIds = new Set(result?.weaknessIds ?? []);
  return {
    approved: Boolean(result?.approved),
    contributions: result?.approved
      ? accepted.map(entry => ({
          userId: entry.userId,
          userName: entry.userName,
          tag: entry.response.tag,
          burn: request.mode === "group" && result?.burnUserId === entry.userId
        }))
      : [],
    weaknesses: result?.approved
      ? weaknesses.filter(entry => selectedWeaknessIds.has(entry.id))
      : []
  };
}

function allHelpResponsesComplete(request) {
  return request.targetUserIds.every(id => ["accepted", "declined"].includes(request.responses[id]?.status));
}

async function requestHelpFromPlayers(request) {
  const jobs = request.targetUserIds.map(async userId => {
    let response = { status: "declined" };
    try {
      response = await helpSocket.executeAsUser("promptHelperForTag", userId, request) ?? response;
    } catch (error) {
      console.error(`${MODULE_ID} | Help request to user ${userId} failed.`, error);
      response = { status: "declined" };
    }

    request.responses[userId] = {
      status: response.status === "accepted" ? "accepted" : "declined",
      tag: response.tag ?? null,
      burn: Boolean(response.burn)
    };
    updateHelpStatusDialog(request.id);
  });

  await Promise.all(jobs);
  if (!allHelpResponsesComplete(request)) return;

  request.sentToGm = true;
  updateHelpStatusDialog(request.id);

  let result;
  try {
    result = await helpSocket.executeAsGM("promptGmForHelpApproval", request);
  } catch (error) {
    console.error(`${MODULE_ID} | GM help approval failed.`, error);
    ui.notifications.error(`The ${request.mode === "group" ? "Group Action" : "help request"} could not be sent to an active Narrator.`);
    return;
  }

  applyApprovedHelpToRoll({
    requestId: request.id,
    requesterUserId: request.requesterUserId,
    approved: Boolean(result?.approved),
    contributions: result?.contributions ?? [],
    weaknesses: result?.weaknesses ?? []
  });
}

async function choosePlayersForHelp(app, mode = "help") {
  if (!helpSocket) {
    ui.notifications.error("Socketlib is not ready. Confirm that Socketlib is enabled, then reload the world.");
    return;
  }

  const candidates = game.users
    .filter(user => user.active && !user.isGM && user.id !== game.user.id && getPlayerCharacter(user))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!candidates.length) {
    ui.notifications.warn("No other active players with assigned characters are available.");
    return;
  }

  let selectedIds;
  try {
    selectedIds = await foundry.applications.api.DialogV2.prompt({
      window: { title: mode === "group" ? "Group Action" : "Ask for Help" },
      classes: ["mist-engine", "litm-qol-system-dialog"],
      content: `
        <div class="litm-qol-help-player-picker">
          <p>${mode === "group" ? "Select the players invited to contribute to the Group Action." : "Select the players you want to ask for help."}</p>
          ${candidates.map(user => `<label><input type="checkbox" name="helper" value="${user.id}"> <span>${foundry.utils.escapeHTML(user.name)}</span></label>`).join("")}
        </div>`,
      ok: {
        label: "Send Requests",
        callback: (_event, button) => [...button.form.querySelectorAll('input[name="helper"]:checked')].map(input => input.value)
      }
    });
  } catch (_error) {
    return;
  }

  if (!selectedIds?.length) return;

  const request = {
    id: foundry.utils.randomID(),
    mode,
    requesterUserId: game.user.id,
    requesterActorId: app.actor?.id,
    requesterActorName: app.actor?.name ?? game.user.name,
    rollType: app.rollType,
    targetUserIds: selectedIds,
    responses: Object.fromEntries(selectedIds.map(id => [id, { status: "pending" }])),
    sentToGm: false,
    existingBurnPresent: mode === "group" && (app.selectedTags ?? []).some(tag => Boolean(tag?.toBurn)),
    createdAt: Date.now()
  };

  helpRequests.set(request.id, request);
  app._litmQolHelpRequestId = request.id;
  openHelpStatusDialog(request);
  void requestHelpFromPlayers(request);
}

function applyApprovedHelpToRoll(payload) {
  if (payload.requesterUserId !== game.user.id) return;
  const request = helpRequests.get(payload.requestId);
  const activeApp = activeHelpRollApp?.rendered ? activeHelpRollApp : null;

  if (!payload.approved) {
    ui.notifications.warn(`The Narrator did not approve the ${request?.mode === "group" ? "Group Action" : "help request"}.`);
  } else if (!activeApp || activeApp.actor?.id !== request?.requesterActorId) {
    ui.notifications.warn("Help was approved, but the original roll dialog is no longer open.");
  } else {
    activeApp.selectedTags = activeApp.selectedTags.filter(tag => tag.source !== "litm-qol-help");
    let burnAlreadyUsed = activeApp.selectedTags.some(tag => Boolean(tag?.toBurn));
    for (const contribution of payload.contributions ?? []) {
      const contributionBurn = Boolean(contribution.burn) && !burnAlreadyUsed;
      if (contributionBurn) burnAlreadyUsed = true;
      activeApp.selectedTags.push({
        name: `${contribution.tag.name} (from ${contribution.tag.actorName})`,
        originalName: contribution.tag.name,
        positive: true,
        source: "litm-qol-help",
        helperUserId: contribution.userId,
        helperActorId: contribution.tag.actorId,
        helperTagSource: contribution.tag.source,
        helperTagItemId: contribution.tag.itemId ?? null,
        helperTagIndex: contribution.tag.index,
        helperTagSingleUse: Boolean(contribution.tag.singleUse),
        helperSingleUseRecordId: contribution.tag.singleUseRecordId ?? null,
        helperContributionBurn: contributionBurn,
        toBurn: contributionBurn,
        isClickable: false
      });
    }
    for (const weakness of payload.weaknesses ?? []) {
      activeApp.selectedTags.push({
        name: `${weakness.name} (from ${weakness.actorName})`,
        originalName: weakness.name,
        positive: false,
        weakness: true,
        source: "litm-qol-help",
        helperActorId: weakness.actorId,
        helperThemebookId: weakness.itemId,
        helperWeaknessIndex: weakness.index,
        isClickable: false
      });
    }
    activeApp.render(true, { focus: true });
    ui.notifications.info(`The approved ${request?.mode === "group" ? "Group Action" : "help"} contributions have been added to the roll.`);
  }

  const dialog = helpStatusDialogs.get(payload.requestId);
  const root = dialog?.element;
  if (root) {
    const note = root.querySelector(".litm-qol-help-status-note");
    if (note) note.textContent = payload.approved
      ? `Approved by the Narrator and added to the roll.`
      : `The Narrator rejected the ${request?.mode === "group" ? "Group Action" : "help request"}.`;
  }
}

async function deleteContributedSingleUseTag(payload = {}) {
  const actor = game.actors.get(payload.actorId);
  if (!isCharacterActor(actor) || (!actor.isOwner && !game.user.isGM)) return false;
  if (payload.source !== "floating") return false;

  const records = getSingleUseRecords(actor);
  const recordIndex = records.findIndex(record =>
    (payload.recordId && record.id === payload.recordId) ||
    (!payload.recordId && record.name === payload.name)
  );
  if (recordIndex < 0) return false;

  const tags = foundry.utils.deepClone(actor.system.floatingTagsAndStatuses ?? []);
  let tagIndex = Number(payload.index);
  const indexedTag = tags[tagIndex];
  if (!indexedTag || indexedTag.isStatus || indexedTag.name !== payload.name) {
    tagIndex = tags.findIndex(tag => !tag?.isStatus && tag?.name === payload.name);
  }
  if (tagIndex < 0) return false;

  tags.splice(tagIndex, 1);
  records.splice(recordIndex, 1);
  await actor.update({ "system.floatingTagsAndStatuses": tags });
  if (records.length) await actor.setFlag(MODULE_ID, SINGLE_USE_FLAG, records);
  else await actor.unsetFlag(MODULE_ID, SINGLE_USE_FLAG);
  return true;
}

async function burnContributedTag(payload = {}) {
  const actor = game.actors.get(payload.actorId);
  if (!isCharacterActor(actor) || (!actor.isOwner && !game.user.isGM)) return false;

  if (payload.source === "themebook") {
    const item = actor.items.get(payload.itemId);
    if (!item || item.type !== "themebook") return false;
    const tags = foundry.utils.deepClone(item.system.powertags ?? []);
    if (!tags[payload.index] || tags[payload.index].name !== payload.name) return false;
    tags[payload.index].burned = true;
    tags[payload.index].selected = false;
    tags[payload.index].toBurn = false;
    await item.update({ "system.powertags": tags });
    return true;
  }

  if (payload.source === "backpack") {
    const item = actor.items.get(payload.itemId);
    if (!item || item.type !== "backpack") return false;
    const tags = foundry.utils.deepClone(item.system.items ?? []);
    if (!tags[payload.index] || tags[payload.index].name !== payload.name) return false;
    tags[payload.index].burned = true;
    tags[payload.index].selected = false;
    tags[payload.index].toBurn = false;
    await item.update({ "system.items": tags });
    return true;
  }

  if (payload.source === "floating") {
    const tags = foundry.utils.deepClone(actor.system.floatingTagsAndStatuses ?? []);
    if (!tags[payload.index] || tags[payload.index].name !== payload.name) return false;
    tags[payload.index].burned = true;
    tags[payload.index].selected = false;
    await actor.update({ "system.floatingTagsAndStatuses": tags });
    return true;
  }

  return false;
}

async function burnUsedGroupContribution() {
  const app = activeHelpRollApp;
  if (!app?.selectedTags?.length || !helpSocket) return;
  const tag = app.selectedTags.find(entry =>
    entry.source === "litm-qol-help" &&
    entry.helperContributionBurn &&
    entry.helperUserId &&
    entry.helperActorId
  );
  if (!tag) return;

  try {
    await helpSocket.executeAsUser("burnContributedTag", tag.helperUserId, {
      actorId: tag.helperActorId,
      source: tag.helperTagSource,
      itemId: tag.helperTagItemId,
      index: tag.helperTagIndex,
      name: tag.originalName
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Could not burn the Group Action contribution.`, error);
  }
}

async function deleteUsedHelpSingleUseTags() {
  const app = activeHelpRollApp;
  if (!app?.selectedTags?.length || !helpSocket) return;

  const contributions = app.selectedTags.filter(tag =>
    tag.source === "litm-qol-help" &&
    tag.positive !== false &&
    tag.helperTagSingleUse &&
    tag.helperUserId &&
    tag.helperActorId
  );

  const unique = new Map();
  for (const tag of contributions) {
    const key = `${tag.helperActorId}:${tag.helperSingleUseRecordId ?? `${tag.helperTagSource}:${tag.helperTagIndex}:${tag.originalName}`}`;
    unique.set(key, tag);
  }

  for (const tag of unique.values()) {
    const payload = {
      actorId: tag.helperActorId,
      source: tag.helperTagSource,
      itemId: tag.helperTagItemId,
      index: tag.helperTagIndex,
      recordId: tag.helperSingleUseRecordId,
      name: tag.originalName
    };

    try {
      await helpSocket.executeAsUser("deleteContributedSingleUseTag", tag.helperUserId, payload);
    } catch (error) {
      console.error(`${MODULE_ID} | Could not delete contributed single-use tag.`, error);
    }
  }
}

async function improveThemesForUsedHelpWeaknesses() {
  const app = activeHelpRollApp;
  if (!app?.selectedTags?.length) return;

  const themebooks = new Map();
  for (const tag of app.selectedTags) {
    if (tag.source !== "litm-qol-help" || !tag.weakness || !tag.helperActorId || !tag.helperThemebookId) continue;
    themebooks.set(`${tag.helperActorId}:${tag.helperThemebookId}`, {
      actorId: tag.helperActorId,
      itemId: tag.helperThemebookId
    });
  }

  for (const { actorId, itemId } of themebooks.values()) {
    const actor = game.actors.get(actorId);
    const themebook = actor?.items?.get(itemId);
    if (!themebook || themebook.type !== "themebook") continue;
    const current = Number(themebook.system.improve ?? 0);
    if (current < 3) await themebook.update({ "system.improve": current + 1 });
  }
}

Hooks.once("socketlib.ready", () => {
  try {
    helpSocket = socketlib.registerModule(MODULE_ID);
    helpSocket.register("promptHelperForTag", socketPromptHelperForTag);
    helpSocket.register("promptGmForHelpApproval", socketPromptGmForHelpApproval);
    helpSocket.register("deleteContributedSingleUseTag", deleteContributedSingleUseTag);
    helpSocket.register("burnContributedTag", burnContributedTag);
    game.modules.get(MODULE_ID).socket = helpSocket;
    console.log(`${MODULE_ID} | Socketlib help workflow registered.`);
  } catch (error) {
    console.error(`${MODULE_ID} | Could not register Socketlib help workflow.`, error);
  }
});

function renderAskForHelpSection(app, form) {
  if (!["quick", "detailed", "reaction"].includes(app.rollType) || form.querySelector(".litm-qol-ask-help")) return;
  activeHelpRollApp = app;

  const section = document.createElement("div");
  section.className = "litm-qol-ask-help";
  section.innerHTML = app.rollType === "reaction"
    ? `<button type="button" class="litm-qol-ask-help-button" data-mode="help"><i class="fa-solid fa-handshake-angle"></i> Ask for Help</button>`
    : `
      <button type="button" class="litm-qol-ask-help-button" data-mode="help"><i class="fa-solid fa-handshake-angle"></i> Ask for Help</button>
      <button type="button" class="litm-qol-ask-help-button" data-mode="group"><i class="fa-solid fa-people-group"></i> Group Action</button>`;

  const powerBlock = form.querySelector(".mt-10");
  form.insertBefore(section, powerBlock ?? form.querySelector("footer"));

  const sacrificeActive = app.rollType === "quick" && Boolean(app._litmQolSacrifice?.level);
  for (const button of section.querySelectorAll("button")) {
    button.disabled = sacrificeActive;
    if (sacrificeActive) button.dataset.tooltip = "Make a Sacrifice cannot use contributed tags.";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      choosePlayersForHelp(app, button.dataset.mode ?? "help");
    });
  }
}



async function reduceFloatingStatus(actor, statusIndex) {
  if (!actor || !Number.isInteger(statusIndex)) return;
  if (!actor.isOwner && !game.user.isGM) {
    ui.notifications.warn("You do not have permission to modify this status.");
    return;
  }

  const statuses = actor.system?.floatingTagsAndStatuses ?? [];
  const status = statuses[statusIndex];
  if (!status?.isStatus) return;

  const tiers = await foundry.applications.api.DialogV2.wait({
    window: { title: `Reduce ${status.name ?? "Status"}` },
    classes: ["litm-qol-system-dialog"],
    content: `
      <div class="litm-qol-reduce-status-dialog">
        <p>Enter the number of tiers to reduce. Every marked tier will slide left by this amount.</p>
        <div class="form-group">
          <label for="litm-qol-reduce-status-tiers">Tiers reduced</label>
          <input id="litm-qol-reduce-status-tiers" name="tiers" type="number" min="1" max="6" step="1" value="1" autofocus>
        </div>
      </div>`,
    buttons: [
      {
        action: "reduce",
        label: "Reduce Status",
        icon: "fa-solid fa-arrow-left",
        default: true,
        callback: (_event, button) => Number(button.form?.elements?.tiers?.value ?? 0)
      },
      {
        action: "cancel",
        label: "Cancel",
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false
  });

  let amount = Math.trunc(Number(tiers));
  if (!Number.isFinite(amount) || amount < 1) return;
  amount = Math.min(amount, 6);

  const updated = foundry.utils.deepClone(statuses);
  const oldMarkings = Array.isArray(status.markings)
    ? [...status.markings].slice(0, 6)
    : Array(6).fill(false);
  while (oldMarkings.length < 6) oldMarkings.push(false);

  const newMarkings = Array(6).fill(false);
  for (let index = 0; index < oldMarkings.length; index++) {
    if (!oldMarkings[index]) continue;
    const shiftedIndex = index - amount;
    if (shiftedIndex >= 0) newMarkings[shiftedIndex] = true;
  }

  updated[statusIndex] = {
    ...updated[statusIndex],
    markings: newMarkings,
    selected: false
  };

  await actor.update({ "system.floatingTagsAndStatuses": updated });
}

function closeReduceStatusMenu() {
  document.querySelectorAll(".litm-qol-status-context-menu").forEach(menu => menu.remove());
}

function openReduceStatusMenu(event, actor, statusIndex) {
  closeReduceStatusMenu();

  const menu = document.createElement("div");
  menu.className = "litm-qol-status-context-menu";
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 50)}px`;
  menu.innerHTML = `
    <button type="button" class="litm-qol-reduce-status-menu-item">
      <i class="fa-solid fa-arrow-left"></i>
      <span>Reduce Status</span>
    </button>`;

  menu.addEventListener("pointerdown", menuEvent => {
    menuEvent.stopPropagation();
  });

  menu.querySelector("button")?.addEventListener("click", async clickEvent => {
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
    closeReduceStatusMenu();
    await reduceFloatingStatus(actor, statusIndex);
  });

  document.body.append(menu);

  const closeOnOutsidePointer = outsideEvent => {
    if (menu.contains(outsideEvent.target)) return;
    closeReduceStatusMenu();
    document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  };

  setTimeout(() => {
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
  }, 0);
}

function addReduceStatusContextMenu(app, html) {
  const actor = getActorFromApp(app);
  const root = getRootElement(html);
  if (!actor || !root || (!actor.isOwner && !game.user.isGM)) return;

  for (const entry of root.querySelectorAll('.floating-tag-and-status-entry[data-is-status="true"]')) {
    if (entry.dataset.litmQolReduceStatusBound === "true") continue;
    entry.dataset.litmQolReduceStatusBound = "true";

    entry.addEventListener("contextmenu", event => {
      const statusIndex = Number(entry.dataset.index);
      if (!Number.isInteger(statusIndex)) return;
      event.preventDefault();
      event.stopPropagation();
      openReduceStatusMenu(event, actor, statusIndex);
    });
  }
}

Hooks.once("init", patchDiceRollOpeningReset);
Hooks.once("init", applyRollText);
Hooks.once("ready", () => {
  applyRollText();
  const module = game.modules.get(MODULE_ID);
  if (module) {
    const api = module.api ?? {};
    api.stageTradeImprovement = stageTradeImprovement;
    module.api = api;
  }
  console.log(`${MODULE_ID} | Roll-result options, rule tooltips, single-use story tags, and automatic Fellowship-tag scratching applied.`);
});

Hooks.on("renderChatMessageHTML", onChatCardRendered);
Hooks.on("renderChatMessage", onChatCardRendered);
Hooks.on("preCreateChatMessage", captureAndScratchFellowshipTags);
Hooks.on("preCreateChatMessage", captureAndScratchFellowshipThemecardTags);
Hooks.on("preCreateChatMessage", applySacrificeToChat);
Hooks.on("preCreateChatMessage", applyTradePowerToChat);
Hooks.on("preCreateChatMessage", applyReactionTenPlusBonus);
Hooks.on("preCreateChatMessage", captureAndScratchSingleUseTags);
Hooks.on("preCreateChatMessage", improveThemesForUsedHelpWeaknesses);
Hooks.on("preCreateChatMessage", burnUsedGroupContribution);
Hooks.on("preCreateChatMessage", deleteUsedHelpSingleUseTags);
Hooks.on("renderActorSheet", (app, html) => {
  renderActorEnhancements(app, html);
  addReduceStatusContextMenu(app, html);
});
Hooks.on("renderApplicationV2", (app, html) => {
  if (getActorFromApp(app)) {
    renderActorEnhancements(app, html);
    addReduceStatusContextMenu(app, html);
  }
  renderTradePowerSection(app, html);
});
Hooks.on("closeApplicationV2", resetRollDialogStateOnClose);
