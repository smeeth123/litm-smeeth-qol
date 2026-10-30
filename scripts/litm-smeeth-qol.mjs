import { renderPersonalityActions } from "./personality-improvements.mjs";
import { renderTrustInLegacy, renderLegacyConfiguration, configureLegacyDetails, applyLegacyDetails } from "./people-improvements.mjs";
import { themeTitle } from "./theme-title.mjs";
import { renderPastActions } from "./past-improvements.mjs";
import { renderCatchMeWhenIFall } from "./devotion-improvements.mjs";
import { renderSpecialImprovementUsage } from "./circumstance-improvements.mjs";
import { improveResetUpdate, FUMBLING_OVERFLOW } from "./fumbling-master.mjs";
import { renderQuintessenceUsage } from "./quintessence-usage.mjs";
import { renderLuckyBastard, renderVirtuoso } from "./lucky-bastard.mjs";
import { diligentImprovementUpdate, DILIGENT_FLAG, usesDiligentTrack, canImproveTheme, pendingDiligentImprovements, renderDiligentTracks } from "./diligent-drudge.mjs";
const diligentWorkflows = new Set();
import "./tropes.mjs";
import { importSystemModule } from "./system-imports.mjs";
import "./chat-theme.mjs";
import "./sheet-scroll.mjs";
import "./fellowship-sync.mjs";
import { clearCooperativeRoll } from "./cooperative-rolls.mjs";
import { cleanResultCard } from "./chat-cards.mjs";
import { decorateSingleUseTags, useLuckyBastard, useVirtuoso, useCatchMeWhenIFall, useTrustInLegacy, usePersonalityAction, useLessonsLearned, useVividMemory } from "./single-use-tags.mjs";
import { decorateTradeCard, isNativeSacrificeMessage, nativeSacrifice, renderIntegratedTradePower } from "./roll-integration.mjs";
import { awardPromise } from "./promise-manager.mjs";
import "./moment-of-fulfillment.mjs";
import { runReplaceTheme } from "./theme-replacement.mjs";
import "./theme-evolution.mjs";
import "./fellowship-development.mjs";
import "./hero-creator.mjs";

const MODULE_ID = "litm-smeeth-qol";
const REFORGED_IMPROVEMENTS_FLAG = "reforgedFreeImprovements";
const RETIREMENT_FLAG = "journeysEndRetirement";

const DETAILED_NEUTRAL = "Your action succeeds, with a Consequence.";
const DETAILED_SUCCESS = "Your action succeeds without Consequences.";
const QUICK_SUCCESS = "Your action succeeds without Consequences.";
const REACTION_NEUTRAL = '<span class="litm-qol-reaction-neutral">Spend Power to lessen the Consequences.</span>';
const REACTION_SUCCESS = '<span class="litm-qol-reaction-success">Spend Power to lessen Consequences or gain an appropriate Effect.</span>';

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

async function onChatCardRendered(message, html) {
  const root = getRootElement(html);
  if (!root) return;

  cleanResultCard(message, root);
  renderLuckyBastard(message, root, useLuckyBastard);
  renderVirtuoso(message, root, useVirtuoso);
  renderCatchMeWhenIFall(message, root, useCatchMeWhenIFall);
  renderTrustInLegacy(message, root, useTrustInLegacy);
  renderPersonalityActions(message, root, usePersonalityAction);
  renderPastActions(message, root, useLessonsLearned, useVividMemory);
  decorateTradeCard(message, root);
  renderNativeSacrificeActions(message, root);

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

function renderActorEnhancements(app, html) {
  renderQuintessenceUsage(getActorFromApp(app), getRootElement(html));
  renderSpecialImprovementUsage(getActorFromApp(app), getRootElement(html));
  renderLegacyConfiguration(getActorFromApp(app), getRootElement(html));
  decorateSingleUseTags(getActorFromApp(app), getRootElement(html));
  renderDiligentTracks(getActorFromApp(app), getRootElement(html));
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
  return themeTitle(theme);
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
  const descriptions = await Promise.all(improvements.slice(0, 5).map(async improvement => {
    const description = String(improvement?.description ?? "").trim();
    return description ? foundry.applications.ux.TextEditor.implementation.enrichHTML(description, {
      secrets: Boolean(theme.isOwner ?? theme.parent?.isOwner), relativeTo: theme.uuid ? theme : theme.parent
    }) : "<p>No description provided.</p>";
  }));
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
    window: { ...improveDialogWindow(improveDialogTitle(theme, "Special Improvement")), resizable: true },
    position: { width: 600, height: 650 },
    classes: [...improveDialogClasses(), "litm-qol-special-improvement-window"],
    content: `
      <div class="litm-qol-improve-theme-dialog">
        <label class="litm-qol-improve-detail-choice${availableOptions ? "" : " disabled"}">
          <input type="checkbox" name="specialMode" value="activate" ${defaultMode === "activate" ? "checked" : ""} ${availableOptions ? "" : "disabled"}>
          <span>Gain an available Special Improvement</span>
        </label>
        <select name="specialIndex" ${availableOptions ? "" : "disabled"}>${availableOptions || "<option>No inactive Special Improvements are available</option>"}</select>
        <section class="litm-qol-special-preview" aria-label="Special Improvement description"${defaultMode === "activate" ? "" : " hidden"}>
          <div class="litm-qol-special-description"></div>
        </section>
        <label class="litm-qol-improve-detail-choice${canCreate ? "" : " disabled"}">
          <input type="checkbox" name="specialMode" value="create" ${defaultMode === "create" ? "checked" : ""} ${canCreate ? "" : "disabled"}>
          <span>Create a new Special Improvement</span>
        </label>
        <input type="text" name="specialName" autocomplete="off" placeholder="Special Improvement title" ${defaultMode === "create" ? "" : "disabled"}>
        <textarea name="specialDescription" rows="5" placeholder="Description" ${defaultMode === "create" ? "" : "disabled"}></textarea>
      </div>`,
    render: (_event, dialog) => {
      const root = dialog.element;
      const selector = root.querySelector('[name="specialIndex"]');
      const preview = root.querySelector(".litm-qol-special-preview");
      const updatePreview = () => {
        preview.hidden = selectedCheckbox(root, "specialMode")?.value !== "activate" || !availableOptions;
        preview.querySelector(".litm-qol-special-description").innerHTML = descriptions[Number(selector.value)] ?? "";
      };
      selector.addEventListener("change", updatePreview);
      bindExclusiveCheckboxes(dialog, "specialMode", (selected, root) => {
        selector.disabled = selected?.value !== "activate" || !availableOptions;
        root.querySelector('[name="specialName"]').disabled = selected?.value !== "create";
        root.querySelector('[name="specialDescription"]').disabled = selected?.value !== "create";
        updatePreview();
        setImproveButtonDisabled(root, "continue", !selected);
      });
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
  if (result.mode === "activate" && result.index < 5 && improvements[result.index] && !improvements[result.index].active) return configureLegacyDetails(theme, result, improvements[result.index].name);
  if (result.mode === "create" && result.index >= 0 && result.index < 5 && result.name && result.description) return configureLegacyDetails(theme, result, result.name);
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

async function sendThemeImprovementSummary(actor, theme, improvementDescription, rewrite, { freeReforged = false, spendDiligent = false } = {}) {
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
        <li>${spendDiligent ? `One Diligent Drudge improvement spent; ${pendingDiligentImprovements(theme)} remaining. Improve is now ${Number(theme.system.improve ?? 0)}.` : freeReforged ? "One inherited Be Reforged improvement spent; this theme’s Improve marks were unchanged." : `Improve is now ${Number(theme.system.improve ?? 0)}.`}</li>
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

async function commitThemeImprovement(actor, theme, action, details, rewrite, { resetImprove = true, spendDiligent = false } = {}) {
  const powertags = foundry.utils.deepClone(theme.system.powertags ?? []);
  const weaknesstags = foundry.utils.deepClone(theme.system.weaknesstags ?? []);
  const specialImprovements = specialImprovementSlots(theme);
  const update = resetImprove ? improveResetUpdate(theme) : {};
  if (spendDiligent) {
    const remaining = pendingDiligentImprovements(theme);
    if (remaining < 1) throw new Error("No earned Diligent Drudge improvements remain.");
    Object.assign(update, diligentImprovementUpdate(theme));
  }

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
    applyLegacyDetails(powertags, specialImprovements, details, rewrite);
    if (details.legacyTag) update["system.powertags"] = powertags;
    update["system.specialImprovements"] = specialImprovements;
  } else if (action === "reset") {
    if (details.abandon) update["system.abandon"] = 0;
    if (details.milestone) update["system.milestone"] = 0;
  }

  if (rewrite?.choice?.type === "power" && action !== "power") update["system.powertags"] = powertags;
  if (rewrite?.choice?.type === "weakness" && action !== "weakness") update["system.weaknesstags"] = weaknesstags;

  if (usesDiligentTrack(theme) && theme.getFlag?.(MODULE_ID, "nascentTheme") === true) {
    const powers = update["system.powertags"] ?? theme.system.powertags ?? [];
    if (powers.filter(tag => String(tag.name ?? "").trim() && !tag.planned).length >= 3) {
      update[`flags.${MODULE_ID}.nascentTheme`] = false;
    }
  }
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
    applyLegacyDetails(powertags, specialImprovements, details, rewrite);
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
  const spendDiligent = !freeReforged && pendingDiligentImprovements(theme) > 0;
  if ((!canModify && !game.user.isGM) || (freeReforged ? freeRemaining < 1 : !canImproveTheme(theme))) return;
  const lockKey = theme.uuid ?? `${actor.id}:${theme.id}`;
  if (diligentWorkflows.has(lockKey)) return;
  diligentWorkflows.add(lockKey);
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
      await commitThemeImprovement(actor, theme, action, details, rewrite, { resetImprove: !freeReforged && !spendDiligent, spendDiligent });
      if (freeReforged) {
        const remaining = Math.max(0, Number(actor.getFlag?.(MODULE_ID, REFORGED_IMPROVEMENTS_FLAG) ?? freeRemaining) - 1);
        if (remaining) await actor.setFlag(MODULE_ID, REFORGED_IMPROVEMENTS_FLAG, remaining);
        else await actor.unsetFlag(MODULE_ID, REFORGED_IMPROVEMENTS_FLAG);
      }
      try {
        await sendThemeImprovementSummary(actor, theme, improvementDescription, rewrite, { freeReforged, spendDiligent });
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
  } finally {
    diligentWorkflows.delete(lockKey);
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
  const pending = pendingDiligentImprovements(theme);
  const saved = Math.max(0, Number(theme.getFlag?.(MODULE_ID, FUMBLING_OVERFLOW)) || 0);
  if (saved) button.dataset.tooltip = `${saved} additional Improve ${saved === 1 ? "mark is" : "marks are"} saved from Fumbling Master and will carry over after this improvement.`;
  button.innerHTML = `<i class="fa-solid fa-star" aria-hidden="true"></i><span class="litm-qol-improve-label">Improve Theme</span>${pending ? ` <span class="litm-qol-improve-count">(${pending} available)</span>` : ""}`;
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
    if (theme.getFlag?.(MODULE_ID, "nascentTheme") === true && !usesDiligentTrack(theme) && !pendingDiligentImprovements(theme)) continue;
    if (freeReforged > 0) insertReforgedImproveButton(container, actor, theme, freeReforged);
    if (container.querySelector(".litm-qol-improve-theme-button")) continue;
    if (!canImproveTheme(theme)) continue;
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
  return themeTitle(theme);
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
    positive: false,
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

function renderNativeSacrificeActions(message, root) {
  const saved = message.getFlag?.(MODULE_ID, "nativeSacrifice");
  const sacrifice = saved ? { ...saved, result: root.querySelector(".consequence-result-positive, .consequence-result-neutral, .consequence-result-negative") } : nativeSacrifice(root);
  if (!sacrifice || root.querySelector(".litm-qol-sacrifice-card-action")) return;
  const { level, lessened, result } = sacrifice;
  if (!result) return;
  const section = document.createElement("div");
  section.className = "litm-qol-native-sacrifice-actions";
  section.innerHTML = `<p><strong>Consequence:</strong> ${sacrificeConsequence(level, lessened)}</p>${sacrificeActionButton(sacrificeConsequenceAction(level, lessened))}`;
  result.append(section);
}

function renderTradePowerSection(app, html) {
  const root = getRootElement(app.element) ?? getRootElement(html);
  if (!root || !root.classList.contains("dice-roll-app")) return;
  const form = root.matches("form.roll-dialog-container") ? root : root.querySelector("form.roll-dialog-container");
  if (!form) return;
  renderIntegratedTradePower(app, root);
}

function resetRollDialogStateOnClose(app) {
  if (!app?.element?.classList?.contains("dice-roll-app") && app?.constructor?.name !== "DiceRollApp") return;
  app.numModPositive = 0;
  app.numModNegative = 0;
  app.mightScale = 0;
  app._litmQolPowerTrade = null;
  clearCooperativeRoll(app);
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

  const { DiceRollApp } = await importSystemModule("apps/dice-roll-app.mjs");
  const proto = DiceRollApp?.prototype;
  if (!proto || proto._litmQolOpeningResetPatched) return;

  const originalRender = proto.render;
  proto.render = function(...args) {
    // DiceRollApp is a singleton. When it is opened again after a roll or cancel,
    // reset the persisted native controls before Handlebars prepares the form.
    // Native rerenders while the window is already open preserve user changes.
    if (!this.rendered && !this._litmQolGroupRoll) {
      this.numModPositive = 0;
      this.numModNegative = 0;
      this.mightScale = 0;
      this._litmQolPowerTrade = null;
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
Hooks.on("preCreateChatMessage", applyReactionTenPlusBonus);
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
