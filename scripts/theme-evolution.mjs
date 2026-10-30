import { themeTitle } from "./theme-title.mjs";
import { runReplaceTheme } from "./theme-replacement.mjs";
import { awardPromise, promiseProjection } from "./promise-manager.mjs";

const MODULE_ID = "litm-smeeth-qol";
const NAV_BACK = "back";
const NAV_CANCEL = "cancel";

const PROMISE_TOOLTIP = `Evolving or expanding a theme marks 1 Promise. See Core Book Vol. I, pages 190 and 193.`;
const TITLE_TOOLTIP = `Choose a new title tag that expresses how the theme has changed. See Core Book Vol. I, page 190.`;
const AXIS_TOOLTIP = `Change either the theme type or its Might; the chosen value must differ from the old one. See Core Book Vol. I, page 190.`;
const TAGS_TOOLTIP = `Keep, revise, or replace active power and weakness tags to fit the evolved theme. See Core Book Vol. I, page 190.`;
const QUEST_TOOLTIP = `Rewrite the Quest to reflect the theme’s new direction. See Core Book Vol. I, page 190.`;
const TRADES_TOOLTIP = `Eligible surplus power tags, weaknesses, and Special Improvements may each be exchanged for one Improvement. See Core Book Vol. I, pages 187 and 190.`;

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

function escapeAttribute(value) {
  return foundry.utils.escapeHTML(String(value ?? "")).replaceAll('"', "&quot;");
}

function themeDisplayName(theme) {
  return themeTitle(theme);
}

function rulesLabel(label, tooltip) {
  return `<span class="litm-qol-rules-tooltip" data-tooltip="${escapeAttribute(tooltip)}" data-tooltip-direction="UP" tabindex="0">${foundry.utils.escapeHTML(label)}</span>`;
}

function classes() {
  return ["litm-qol-system-dialog", "litm-qol-evolve-theme-window"];
}

function cancelButton() {
  return {
    action: "cancel",
    label: "Cancel",
    icon: "fa-solid fa-xmark",
    class: "litm-qol-evolve-cancel",
    callback: () => ({ navigation: NAV_CANCEL })
  };
}

function backButton() {
  return {
    action: "back",
    label: "Back",
    icon: "fa-solid fa-arrow-left",
    class: "litm-qol-evolve-back",
    callback: () => ({ navigation: NAV_BACK })
  };
}

function primaryButton(action, label, callback, icon = "fa-solid fa-arrow-right") {
  return { action, label, icon, class: "litm-qol-evolve-primary", default: true, callback };
}

function isBack(result) {
  return result?.navigation === NAV_BACK;
}

function isCancel(result) {
  return result?.navigation === NAV_CANCEL || result == null;
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

function titleTagIndex(theme) {
  return (theme.system.powertags ?? []).findIndex(visible);
}

function mightName(type) {
  return ({
    "litm-origin": "Origin",
    "litm-adventure": "Adventure",
    "litm-greatness": "Greatness",
    "litm-variable": "Variable"
  })[type] ?? String(type || "Unknown");
}

async function chooseEvolutionMode(theme) {
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Evolve Theme — ${themeDisplayName(theme)}` },
    classes: classes(),
    content: `
      <div class="litm-qol-evolve-dialog">
        <p>Choose how this theme changes after completing its Milestones. See Core Book Vol. I, page 190.</p>
        <label class="litm-qol-evolve-choice">
          <input type="checkbox" name="evolutionMode" value="evolve">
          <span><strong>Evolve Theme</strong><small>Transform this theme into a new expression of itself.</small></span>
        </label>
        <label class="litm-qol-evolve-choice">
          <input type="checkbox" name="evolutionMode" value="expand">
          <span><strong>Expand Theme</strong><small>Keep this theme and replace another theme with a new one that expands upon it.</small></span>
        </label>
      </div>`,
    render: (_event, dialog) => bindExclusive(dialog.element, "evolutionMode", choice => {
      setButtonDisabled(dialog.element, "next", !choice);
    }),
    buttons: [
      cancelButton(),
      primaryButton("next", "Next", (_event, button) => button.form.querySelector('[name="evolutionMode"]:checked')?.value ?? null)
    ],
    rejectClose: false
  });
}

async function promptExpandedQuest(theme, saved) {
  const original = String(theme.system.quest ?? "").trim();
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Expand Theme — ${themeDisplayName(theme)} — New Quest` },
    classes: classes(),
    content: `
      <div class="litm-qol-evolve-dialog">
        <p>Rewrite this theme's Quest to reflect its new direction. See Core Book Vol. I, page 190.</p>
        <label><strong>New Quest</strong>
          <textarea name="quest" rows="5">${foundry.utils.escapeHTML(saved ?? original)}</textarea>
        </label>
      </div>`,
    render: (_event, dialog) => {
      const input = dialog.element.querySelector('[name="quest"]');
      const update = () => setButtonDisabled(dialog.element, "next", !input.value.trim() || input.value.trim() === original);
      input.addEventListener("input", update);
      update();
    },
    buttons: [
      cancelButton(),
      backButton(),
      primaryButton("next", "Next", (_event, button) => String(button.form.elements.quest.value ?? "").trim())
    ],
    rejectClose: false
  });
}

async function chooseExpansionTarget(actor, expandedTheme, selectedId) {
  const themes = actor.items
    .filter(item => item.type === "themebook" && item.id !== expandedTheme.id && !item.system.options?.isStoryTheme)
    .sort((a, b) => themeDisplayName(a).localeCompare(themeDisplayName(b)));
  const rows = themes.map(theme => `
    <label class="litm-qol-evolve-choice">
      <input type="checkbox" name="expansionTarget" value="${theme.id}" ${theme.id === selectedId ? "checked" : ""}>
      <span><strong>${foundry.utils.escapeHTML(themeDisplayName(theme))}</strong><small>${foundry.utils.escapeHTML(mightName(theme.system.type))}</small></span>
    </label>`).join("");
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Expand Theme — ${themeDisplayName(expandedTheme)} — Theme to Replace` },
    classes: classes(),
    content: `
      <div class="litm-qol-evolve-dialog">
        <p>Choose another theme to replace with a new nascent theme that expands on <strong>${foundry.utils.escapeHTML(themeDisplayName(expandedTheme))}</strong>. See Core Book Vol. I, page 190.</p>
        <div class="litm-qol-improve-choice-list">${rows || '<p class="notes">There are no other themes available to replace.</p>'}</div>
      </div>`,
    render: (_event, dialog) => bindExclusive(dialog.element, "expansionTarget", choice => {
      setButtonDisabled(dialog.element, "next", !choice);
    }),
    buttons: [
      cancelButton(),
      backButton(),
      primaryButton("next", "Next", (_event, button) => button.form.querySelector('[name="expansionTarget"]:checked')?.value ?? null)
    ],
    rejectClose: false
  });
}

async function sendExpansionSummary(actor, expandedThemeName, oldQuest, newQuest, replacedThemeName, newTheme) {
  const gmIds = game.users.filter(user => user.isGM).map(user => user.id);
  if (!gmIds.length) return;
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: gmIds,
    content: `
      <div class="litm-qol-improve-chat-summary">
        <h3><i class="fa-solid fa-plus"></i> Theme Expanded</h3>
        <p><strong>${foundry.utils.escapeHTML(actor.name)}</strong> expanded <strong>${foundry.utils.escapeHTML(expandedThemeName)}</strong>.</p>
        <ul>
          <li>Quest: ${foundry.utils.escapeHTML(oldQuest)} → <strong>${foundry.utils.escapeHTML(newQuest)}</strong></li>
          <li>Replaced <strong>${foundry.utils.escapeHTML(replacedThemeName)}</strong> with <strong>${foundry.utils.escapeHTML(themeDisplayName(newTheme))}</strong>.</li>
          <li>Milestones reset to 0.</li>
        </ul>
      </div>`,
    flags: { [MODULE_ID]: { expandThemeSummary: true, actorId: actor.id, expandedTheme: expandedThemeName } }
  });
}

async function promptTitle(theme, currentValue) {
  const original = String((theme.system.powertags ?? [])[titleTagIndex(theme)]?.name ?? "").trim();
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Evolve Theme — ${themeDisplayName(theme)} — New Title` },
    classes: classes(),
    content: `
      <div class="litm-qol-evolve-dialog">
        <div class="litm-qol-evolve-promise">${rulesLabel("+1 Promise will be marked", PROMISE_TOOLTIP)}</div>
        <label>${rulesLabel("New title tag", TITLE_TOOLTIP)}
          <input type="text" name="titleTag" value="${escapeAttribute(currentValue ?? original)}" autocomplete="off">
        </label>
      </div>`,
    render: (_event, dialog) => {
      const input = dialog.element.querySelector('[name="titleTag"]');
      const update = () => setButtonDisabled(dialog.element, "next", !input.value.trim() || input.value.trim() === original);
      input.addEventListener("input", update);
      update();
    },
    buttons: [
      cancelButton(),
      backButton(),
      primaryButton("next", "Next", (_event, button) => String(button.form.elements.titleTag.value ?? "").trim())
    ],
    rejectClose: false
  });
}

function themeNameKey(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isAllCapsName(value) {
  const letters = String(value ?? "").replace(/[^\p{L}]/gu, "");
  return Boolean(letters) && letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase();
}

async function knownThemeNames(currentName) {
  const names = new Map();
  const addName = value => {
    const name = String(value ?? "").trim().replace(/\s+/g, " ");
    const key = themeNameKey(name);
    if (!key) return;
    const existing = names.get(key);
    if (!existing || (isAllCapsName(existing) && !isAllCapsName(name))) names.set(key, name);
  };
  addName(currentName);
  for (const item of game.items) {
    if (item.type === "themebook" && !item.system.options?.isStoryTheme) addName(item.name);
    if (item.type === "themekit") addName(item.system.themekit_type);
  }
  for (const pack of game.packs) {
    if (pack.documentName !== "Item") continue;
    const documents = await pack.getDocuments();
    for (const item of documents) {
      if (item.type === "themebook" && !item.system.options?.isStoryTheme) addName(item.name);
      if (item.type === "themekit") addName(item.system.themekit_type);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

async function promptAxis(theme, state) {
  const currentName = String(theme.name ?? "").trim();
  const themeNames = await knownThemeNames(currentName);
  const selectedName = state?.name ?? currentName;
  const nameOptions = themeNames.map(name => `<option value="${escapeAttribute(name)}" ${themeNameKey(name) === themeNameKey(selectedName) ? "selected" : ""}>${foundry.utils.escapeHTML(name)}</option>`).join("");
  const currentMight = String(theme.system.type ?? "litm-origin");
  const mode = state?.mode ?? null;
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Evolve Theme — ${themeDisplayName(theme)} — Theme Type or Might` },
    classes: classes(),
    content: `
      <div class="litm-qol-evolve-dialog">
        <p>${rulesLabel("Choose one kind of change", AXIS_TOOLTIP)}</p>
        <label class="litm-qol-evolve-choice">
          <input type="checkbox" name="axisMode" value="name" ${mode === "name" ? "checked" : ""}>
          <span><strong>Choose a new theme type</strong><small>Current: ${foundry.utils.escapeHTML(currentName)}</small></span>
        </label>
        <select name="themeName" ${mode === "name" ? "" : "disabled"}>${nameOptions}</select>
        <label class="litm-qol-evolve-choice">
          <input type="checkbox" name="axisMode" value="might" ${mode === "might" ? "checked" : ""}>
          <span><strong>Change the theme's Might</strong><small>Current: ${mightName(currentMight)}</small></span>
        </label>
        <select name="themeMight" ${mode === "might" ? "" : "disabled"}>
          ${["litm-origin", "litm-adventure", "litm-greatness"].map(value => `<option value="${value}" ${(state?.might ?? currentMight) === value ? "selected" : ""}>${mightName(value)}</option>`).join("")}
        </select>
      </div>`,
    render: (_event, dialog) => {
      const root = dialog.element;
      const nameInput = root.querySelector('[name="themeName"]');
      const mightSelect = root.querySelector('[name="themeMight"]');
      const refresh = selected => {
        nameInput.disabled = selected?.value !== "name";
        mightSelect.disabled = selected?.value !== "might";
        const valid = selected?.value === "name"
          ? nameInput.value && themeNameKey(nameInput.value) !== themeNameKey(currentName)
          : selected?.value === "might" && mightSelect.value !== currentMight;
        setButtonDisabled(root, "next", !valid);
      };
      bindExclusive(root, "axisMode", refresh);
      nameInput.addEventListener("change", () => refresh(root.querySelector('[name="axisMode"]:checked')));
      mightSelect.addEventListener("change", () => refresh(root.querySelector('[name="axisMode"]:checked')));
    },
    buttons: [
      cancelButton(),
      backButton(),
      primaryButton("next", "Next", (_event, button) => {
        const modeValue = button.form.querySelector('[name="axisMode"]:checked')?.value;
        return modeValue === "name"
          ? { mode: "name", name: String(button.form.elements.themeName.value ?? "").trim() }
          : modeValue === "might"
            ? { mode: "might", might: button.form.elements.themeMight.value }
            : null;
      })
    ],
    rejectClose: false
  });
}

async function promptRevisions(theme, saved = {}) {
  const titleIndex = titleTagIndex(theme);
  const rows = [];
  for (const [type, tags] of [["power", theme.system.powertags ?? []], ["weakness", theme.system.weaknesstags ?? []]]) {
    tags.forEach((tag, index) => {
      if (!visible(tag) || (type === "power" && index === titleIndex)) return;
      const key = `${type}:${index}`;
      const value = saved[key] ?? tag.name;
      rows.push(`
        <div class="litm-qol-evolve-revision-row">
          <input type="checkbox" name="revision" value="${key}" ${Object.hasOwn(saved, key) ? "checked" : ""}>
          <span class="litm-qol-evolve-kind">${type === "power" ? "Power" : "Weakness"}</span>
          <input type="text" name="revision-${key}" value="${escapeAttribute(value)}" ${Object.hasOwn(saved, key) ? "" : "disabled"}>
        </div>`);
    });
  }
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Evolve Theme — ${themeDisplayName(theme)} — Revise Tags` },
    classes: classes(),
    content: `
      <div class="litm-qol-evolve-dialog">
        <p>${rulesLabel("Revise power tags and weakness tags", TAGS_TOOLTIP)}</p>
        <p class="notes">Select any tags you want to rewrite. You may continue without selecting any.</p>
        <div class="litm-qol-evolve-revision-list">${rows.join("") || '<p class="notes">There are no additional active tags to revise.</p>'}</div>
      </div>`,
    render: (_event, dialog) => {
      const root = dialog.element;
      const refresh = () => {
        const invalid = [...root.querySelectorAll('[name="revision"]:checked')].some(checkbox => {
          const input = checkbox.closest(".litm-qol-evolve-revision-row")?.querySelector('input[type="text"]');
          return !input?.value.trim();
        });
        setButtonDisabled(root, "next", invalid);
      };
      for (const checkbox of root.querySelectorAll('[name="revision"]')) {
        const input = checkbox.closest(".litm-qol-evolve-revision-row").querySelector('input[type="text"]');
        checkbox.addEventListener("change", () => {
          input.disabled = !checkbox.checked;
          refresh();
        });
        input.addEventListener("input", refresh);
      }
      refresh();
    },
    buttons: [
      cancelButton(),
      backButton(),
      primaryButton("next", "Next", (_event, button) => {
        const result = {};
        for (const checkbox of button.form.querySelectorAll('[name="revision"]:checked')) {
          const input = checkbox.closest(".litm-qol-evolve-revision-row")?.querySelector('input[type="text"]');
          const value = String(input?.value ?? "").trim();
          if (!value) return null;
          result[checkbox.value] = value;
        }
        return result;
      })
    ],
    rejectClose: false
  });
}

async function promptQuest(theme, saved) {
  const original = String(theme.system.quest ?? "").trim();
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Evolve Theme — ${themeDisplayName(theme)} — Revise Quest` },
    classes: classes(),
    content: `
      <div class="litm-qol-evolve-dialog">
        <label>${rulesLabel("Revised Quest", QUEST_TOOLTIP)}
          <textarea name="quest" rows="5">${foundry.utils.escapeHTML(saved ?? original)}</textarea>
        </label>
      </div>`,
    render: (_event, dialog) => {
      const input = dialog.element.querySelector('[name="quest"]');
      const update = () => setButtonDisabled(dialog.element, "next", !input.value.trim() || input.value.trim() === original);
      input.addEventListener("input", update);
      update();
    },
    buttons: [
      cancelButton(),
      backButton(),
      primaryButton("next", "Next", (_event, button) => String(button.form.elements.quest.value ?? "").trim())
    ],
    rejectClose: false
  });
}

function tradeCandidates(theme, revisions) {
  const candidates = [];
  const activePowers = (theme.system.powertags ?? []).map((tag, index) => ({ tag, index })).filter(({ tag }) => visible(tag));
  const activeWeaknesses = (theme.system.weaknesstags ?? []).map((tag, index) => ({ tag, index })).filter(({ tag }) => visible(tag));
  for (const { tag, index } of activePowers.slice(3)) {
    if (!Object.hasOwn(revisions, `power:${index}`)) candidates.push({ kind: "power", index, name: tag.name, label: "Power tag" });
  }
  for (const { tag, index } of activeWeaknesses.slice(1)) {
    if (!Object.hasOwn(revisions, `weakness:${index}`)) candidates.push({ kind: "weakness", index, name: tag.name, label: "Weakness tag" });
  }
  (theme.system.specialImprovements ?? []).forEach((improvement, index) => {
    if (improvement?.active && String(improvement.name ?? "").trim()) {
      candidates.push({ kind: "special", index, name: improvement.name, label: "Special Improvement" });
    }
  });
  return candidates;
}

async function promptTrades(theme, revisions, selectedKeys = []) {
  const candidates = tradeCandidates(theme, revisions);
  const selectedSet = new Set(selectedKeys);
  const rows = candidates.map((candidate, index) => `
    <label class="litm-qol-evolve-trade-row">
      <input type="checkbox" name="trade" value="${index}" ${selectedSet.has(`${candidate.kind}:${candidate.index}`) ? "checked" : ""}>
      <span><strong>${foundry.utils.escapeHTML(candidate.name)}</strong><small>${candidate.label} — trade for one Improvement</small></span>
    </label>`).join("");
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Evolve Theme — ${themeDisplayName(theme)} — Trades` },
    classes: classes(),
    content: `
      <div class="litm-qol-evolve-dialog">
        <p>${rulesLabel("Trade old theme elements for Improvements", TRADES_TOOLTIP)}</p>
        <p class="notes">Each selected element starts one Improvement workflow. Trading is optional.</p>
        <div class="litm-qol-evolve-trade-list">${rows || '<p class="notes">This theme has no eligible elements to trade.</p>'}</div>
      </div>`,
    buttons: [
      cancelButton(),
      backButton(),
      primaryButton("next", "Next", (_event, button) => [...button.form.querySelectorAll('[name="trade"]:checked')].map(box => candidates[Number(box.value)]))
    ],
    rejectClose: false
  });
}

function buildDraft(theme, state, trades) {
  const system = foundry.utils.deepClone(theme.toObject().system ?? {});
  const draft = { documentName: "Item", type: theme.type, name: state.axis.mode === "name" ? state.axis.name : theme.name, system };
  const titleIndex = titleTagIndex(theme);
  if (system.powertags?.[titleIndex]) system.powertags[titleIndex].name = state.title;
  if (state.axis.mode === "might") system.type = state.axis.might;
  system.quest = state.quest;
  for (const [key, name] of Object.entries(state.revisions)) {
    const [kind, rawIndex] = key.split(":");
    const collection = kind === "power" ? system.powertags : system.weaknesstags;
    if (collection?.[Number(rawIndex)]) collection[Number(rawIndex)].name = name;
  }

  for (const kind of ["power", "weakness"]) {
    const collection = kind === "power" ? system.powertags : system.weaknesstags;
    trades.filter(trade => trade.kind === kind).map(trade => trade.index).sort((a, b) => b - a).forEach(index => collection.splice(index, 1));
  }
  for (const trade of trades.filter(trade => trade.kind === "special")) {
    system.specialImprovements[trade.index] = { name: "", description: "", active: false };
  }
  return draft;
}

function rewriteDescription(rewrite) {
  return rewrite?.choice
    ? `; updated ${rewrite.choice.type} tag “${rewrite.choice.name}” to “${rewrite.name}”`
    : "";
}

async function promptConfirmation(actor, theme, state, trades, improvements, draftState, draft) {
  const earned = Number(draftState.promiseGain ?? 1);
  const promise = promiseProjection(actor, earned);
  const revisions = Object.entries(state.revisions).map(([key, value]) => {
    const [kind, rawIndex] = key.split(":");
    const source = kind === "power" ? theme.system.powertags : theme.system.weaknesstags;
    return `<li>Revised ${kind}: ${foundry.utils.escapeHTML(source?.[Number(rawIndex)]?.name ?? "Tag")} → <strong>${foundry.utils.escapeHTML(value)}</strong></li>`;
  }).join("");
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Evolve Theme — ${themeDisplayName(theme)} — Confirm` },
    classes: classes(),
    content: `
      <div class="litm-qol-evolve-dialog litm-qol-evolve-confirmation">
        <h3>Confirm Theme Evolution</h3>
        <ul>
          <li>Promise: ${promise.before} → <strong>${promise.after}</strong>${promise.overflowGain ? ` (${promise.overflowAfter} stored for after fulfillment)` : ""}</li>
          <li>Title tag: <strong>${foundry.utils.escapeHTML(state.title)}</strong></li>
          <li>${state.axis.mode === "name" ? "Theme type" : "Might"}: <strong>${foundry.utils.escapeHTML(state.axis.mode === "name" ? state.axis.name : mightName(state.axis.might))}</strong></li>
          ${revisions}
          <li>Quest: <strong>${foundry.utils.escapeHTML(state.quest)}</strong></li>
          ${trades.map(trade => `<li>Traded ${foundry.utils.escapeHTML(trade.label.toLowerCase())}: <strong>${foundry.utils.escapeHTML(trade.name)}</strong></li>`).join("")}
          ${improvements.map(result => `<li>Improvement: ${foundry.utils.escapeHTML(result.description + rewriteDescription(result.rewrite))}</li>`).join("")}
          <li>Milestones will reset to 0.</li>
        </ul>
      </div>`,
    buttons: [
      cancelButton(),
      backButton(),
      primaryButton("confirm", "Confirm Evolution", () => ({ confirmed: true }), "fa-solid fa-check")
    ],
    rejectClose: false
  });
}

async function sendSummary(actor, oldName, state, trades, improvements, promises) {
  const gmIds = game.users.filter(user => user.isGM).map(user => user.id);
  if (!gmIds.length) return;
  const tradeRows = trades.map((trade, index) => {
    const improvement = improvements[index];
    const gained = improvement
      ? improvement.description + rewriteDescription(improvement.rewrite)
      : "No Improvement recorded";
    return `<li>Traded ${foundry.utils.escapeHTML(trade.label.toLowerCase())} <strong>${foundry.utils.escapeHTML(trade.name)}</strong> → <strong>${foundry.utils.escapeHTML(gained)}</strong></li>`;
  }).join("");
  const revisionRows = Object.entries(state.revisions).map(([key, name]) => {
    const kind = key.startsWith("power:") ? "power tag" : "weakness tag";
    return `<li>Revised ${kind}: <strong>${foundry.utils.escapeHTML(name)}</strong></li>`;
  }).join("");
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: gmIds,
    content: `
      <div class="litm-qol-improve-chat-summary">
        <h3><i class="fa-solid fa-arrow-up"></i> Theme Evolved</h3>
        <p><strong>${foundry.utils.escapeHTML(actor.name)}</strong> evolved <strong>${foundry.utils.escapeHTML(oldName)}</strong>.</p>
        <ul>
          <li>New title: <strong>${foundry.utils.escapeHTML(state.title)}</strong></li>
          <li>${state.axis.mode === "name" ? "New theme type" : "New Might"}: <strong>${foundry.utils.escapeHTML(state.axis.mode === "name" ? state.axis.name : mightName(state.axis.might))}</strong></li>
          ${revisionRows}
          <li>Revised Quest: <strong>${foundry.utils.escapeHTML(state.quest)}</strong></li>
          <li>Promise: ${promises.before} → ${promises.after}</li>
          ${tradeRows || "<li>No theme elements were traded.</li>"}
          <li>Milestones reset to 0.</li>
        </ul>
      </div>`,
    flags: { [MODULE_ID]: { evolveThemeSummary: true, actorId: actor.id } }
  });
}

async function runEvolveTheme(actor, theme) {
  if (!actor || !theme || theme.type !== "themebook" || Number(theme.system.milestone ?? 0) < 3) return;
  if ((!actor.isOwner && !game.user.isGM) || theme.system.options?.isStoryTheme) return;
  const state = { title: null, axis: null, revisions: {}, quest: null, tradeKeys: [], expandQuest: null, expansionTargetId: null };
  let page = "mode";

  try {
    while (true) {
      if (page === "mode") {
        const result = await chooseEvolutionMode(theme);
        if (isCancel(result)) return;
        page = result === "expand" ? "expandQuest" : result === "evolve" ? "title" : "mode";
        continue;
      }
      if (page === "expandQuest") {
        const result = await promptExpandedQuest(theme, state.expandQuest);
        if (isCancel(result)) return;
        if (isBack(result)) { page = "mode"; continue; }
        if (!result) continue;
        state.expandQuest = result;
        page = "expandTarget";
        continue;
      }
      if (page === "expandTarget") {
        const result = await chooseExpansionTarget(actor, theme, state.expansionTargetId);
        if (isCancel(result)) return;
        if (isBack(result)) { page = "expandQuest"; continue; }
        if (!result) continue;
        state.expansionTargetId = result;
        const target = actor.items.get(result);
        if (!target) {
          ui.notifications.warn("The selected theme is no longer available.");
          continue;
        }
        const expandedThemeName = themeDisplayName(theme);
        const replacedThemeName = themeDisplayName(target);
        const oldQuest = String(theme.system.quest ?? "").trim();
        const newTheme = await runReplaceTheme(actor, target, { allowWithoutAbandon: true });
        if (!newTheme) return;
        await theme.update({ "system.quest": state.expandQuest, "system.milestone": 0 });
        try {
          await sendExpansionSummary(actor, expandedThemeName, oldQuest, state.expandQuest, replacedThemeName, newTheme);
        } catch (summaryError) {
          console.error(`${MODULE_ID} | Theme expanded, but its GM summary failed.`, summaryError);
          ui.notifications.warn("The theme expanded, but its GM chat summary could not be sent.");
        }
        ui.notifications.info(`${expandedThemeName} expanded successfully.`);
        return;
      }
      if (page !== "title" && page !== "axis" && page !== "revisions" && page !== "quest" && page !== "trades") {
        page = "mode";
        continue;
      }
      if (page === "title") {
        const result = await promptTitle(theme, state.title);
        if (isCancel(result)) return;
        if (isBack(result)) { page = "mode"; continue; }
        if (!result) continue;
        state.title = result;
        page = "axis";
        continue;
      }
      if (page === "axis") {
        const result = await promptAxis(theme, state.axis);
        if (isCancel(result)) return;
        if (isBack(result)) { page = "title"; continue; }
        if (!result) continue;
        state.axis = result;
        page = "revisions";
        continue;
      }
      if (page === "revisions") {
        const result = await promptRevisions(theme, state.revisions);
        if (isCancel(result)) return;
        if (isBack(result)) { page = "axis"; continue; }
        if (!result) continue;
        state.revisions = result;
        page = "quest";
        continue;
      }
      if (page === "quest") {
        const result = await promptQuest(theme, state.quest);
        if (isCancel(result)) return;
        if (isBack(result)) { page = "revisions"; continue; }
        if (!result) continue;
        state.quest = result;
        page = "trades";
        continue;
      }

      const trades = await promptTrades(theme, state.revisions, state.tradeKeys);
      if (isCancel(trades)) return;
      if (isBack(trades)) { page = "quest"; continue; }
      state.tradeKeys = trades.map(trade => `${trade.kind}:${trade.index}`);
      const draft = buildDraft(theme, state, trades);
      const draftState = { promiseGain: 1 };
      const improvements = [];
      let aborted = false;
      let returnedToTrades = false;
      for (const trade of trades) {
        const api = game.modules.get(MODULE_ID)?.api;
        if (typeof api?.stageTradeImprovement !== "function") throw new Error("The staged Improvement API is unavailable.");
        const result = await api.stageTradeImprovement(actor, draft, draftState);
        if (result?.navigation === "back") { returnedToTrades = true; break; }
        if (!result) { aborted = true; break; }
        improvements.push(result);
      }
      if (aborted) return;
      if (returnedToTrades) continue;

      const confirmation = await promptConfirmation(actor, theme, state, trades, improvements, draftState, draft);
      if (isCancel(confirmation)) return;
      if (isBack(confirmation)) continue;
      if (!confirmation?.confirmed) continue;

      const promiseAward = promiseProjection(actor, Number(draftState.promiseGain ?? 1));
      const oldDisplayName = themeDisplayName(theme);
      const update = {
        name: draft.name,
        "system.type": draft.system.type,
        "system.powertags": draft.system.powertags,
        "system.weaknesstags": draft.system.weaknesstags,
        "system.specialImprovements": draft.system.specialImprovements,
        "system.quest": draft.system.quest,
        "system.abandon": Number(draft.system.abandon ?? theme.system.abandon ?? 0),
        "system.milestone": 0,
        [`flags.${MODULE_ID}.nascentTheme`]: false
      };
      await theme.update(update);
      const awardedPromise = await awardPromise(actor, Number(draftState.promiseGain ?? 1));
      try {
        await sendSummary(actor, oldDisplayName, state, trades, improvements, awardedPromise ?? promiseAward);
      } catch (summaryError) {
        console.error(`${MODULE_ID} | Theme evolved, but its GM summary failed.`, summaryError);
        ui.notifications.warn("The theme evolved, but its GM chat summary could not be sent.");
      }
      ui.notifications.info(`${state.title} evolved successfully.`);
      return;
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Evolve Theme workflow failed.`, error);
    ui.notifications.error("The theme could not be evolved. Check the console for details.");
  } finally {
    state.title = null;
    state.axis = null;
    state.revisions = {};
    state.quest = null;
    state.tradeKeys = [];
    state.expandQuest = null;
    state.expansionTargetId = null;
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

function renderThemeEvolution(app, html) {
  const actor = appActor(app);
  const root = rootElement(html);
  if (!isCharacter(actor) || !root || (!actor.isOwner && !game.user.isGM)) return;
  for (const container of root.querySelectorAll(".themebook-container[data-id]")) {
    const theme = actor.items.get(container.dataset.id);
    if (!theme || theme.type !== "themebook" || theme.system.options?.isStoryTheme) continue;
    if (Number(theme.system.milestone ?? 0) < 3) continue;
    const row = actionRow(container);
    if (!row || row.querySelector(".litm-qol-evolve-theme-button")) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "litm-qol-evolve-theme-button";
    button.innerHTML = '<i class="fa-solid fa-arrow-up"></i> Evolve Theme';
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      runEvolveTheme(actor, theme);
    });
    buttonStack(row).append(button);
  }
}

Hooks.on("renderActorSheet", renderThemeEvolution);
Hooks.on("renderApplicationV2", (app, html) => {
  if (appActor(app)) renderThemeEvolution(app, html);
});
