const MODULE_ID = "litm-smeeth-qol";
const NASCENT_FLAG = "nascentTheme";
const NAV_BACK = "back";
const NAV_CANCEL = "cancel";

function rootElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function appActor(app) {
  const actor = app?.actor ?? (app?.document?.documentName === "Actor" ? app.document : null);
  return actor?.documentName === "Actor" ? actor : null;
}

function isFellowship(theme) {
  return theme?.documentName === "Actor" && theme.type === "litm-fellowship-themecard";
}

function fellowshipForActor(actor) {
  if (isFellowship(actor)) return actor;
  const id = actor?.system?.actorSharedSingleThemecardId;
  const assigned = id ? game.actors.get(id) : null;
  if (isFellowship(assigned)) return assigned;
  const fromSheet = actor?.sheet?.getActorFellowshipThemecard?.();
  return isFellowship(fromSheet) ? fromSheet : null;
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

function displayName(theme) {
  const title = String((theme.system.powertags ?? []).find(visible)?.name ?? "").trim();
  return title ? `${theme.name} – ${title}` : theme.name;
}

function cleanTag(name) {
  return { name: String(name ?? "").trim(), question: "", burned: false, toBurn: false, planned: false, selected: false };
}

function blankSpecials() {
  return Array.from({ length: 5 }, () => ({ name: "", description: "", active: false }));
}

function classes(kind = "evolve") {
  return ["litm-qol-system-dialog", kind === "replace" ? "litm-qol-replace-theme-window" : "litm-qol-evolve-theme-window"];
}

function cancelButton() {
  return { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", callback: () => ({ navigation: NAV_CANCEL }) };
}

function backButton() {
  return { action: "back", label: "Back", icon: "fa-solid fa-arrow-left", callback: () => ({ navigation: NAV_BACK }) };
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

function setDisabled(root, action, disabled) {
  const button = root.querySelector(`button[data-action="${action}"]`);
  if (button) button.disabled = Boolean(disabled);
}

function bindExclusive(root, name, callback) {
  const boxes = [...root.querySelectorAll(`input[type="checkbox"][name="${name}"]`)];
  const update = () => callback?.(boxes.find(box => box.checked) ?? null, root);
  for (const box of boxes) {
    box.addEventListener("change", () => {
      if (box.checked) for (const other of boxes) if (other !== box) other.checked = false;
      update();
    });
  }
  update();
}

async function promptManualReplacement(theme, saved = {}) {
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Replace Fellowship Theme — ${displayName(theme)}` },
    classes: classes("replace"),
    content: `
      <div class="litm-qol-replace-dialog">
        <p>Create the new nascent Fellowship theme manually.</p>
        <label><strong>Fellowship theme name</strong><input type="text" name="themeName" value="${escapeAttribute(saved.name ?? "")}" autocomplete="off"></label>
        <label><strong>Title tag</strong><input type="text" name="title" value="${escapeAttribute(saved.title ?? "")}" autocomplete="off"></label>
        <label><strong>Quest</strong><textarea name="quest" rows="4">${foundry.utils.escapeHTML(saved.quest ?? "")}</textarea></label>
        <label><strong>Weakness tag</strong><input type="text" name="weakness" value="${escapeAttribute(saved.weakness ?? "")}" autocomplete="off"></label>
      </div>`,
    render: (_event, dialog) => {
      const root = dialog.element;
      const update = () => setDisabled(root, "next", [...root.querySelectorAll("input, textarea")].some(input => !input.value.trim()));
      for (const input of root.querySelectorAll("input, textarea")) input.addEventListener("input", update);
      update();
    },
    buttons: [
      cancelButton(),
      primaryButton("next", "Next", (_event, button) => ({
        name: button.form.elements.themeName.value.trim(),
        title: button.form.elements.title.value.trim(),
        quest: button.form.elements.quest.value.trim(),
        weakness: button.form.elements.weakness.value.trim()
      }))
    ],
    rejectClose: false
  });
}

async function confirmManualReplacement(theme, data) {
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Replace Fellowship Theme — Confirm" },
    classes: classes("replace"),
    content: `
      <div class="litm-qol-replace-dialog">
        <p><strong>${foundry.utils.escapeHTML(displayName(theme))}</strong> will be replaced in place with a nascent Fellowship theme.</p>
        <ul>
          <li>Name: <strong>${foundry.utils.escapeHTML(data.name)}</strong></li>
          <li>Title tag: <strong>${foundry.utils.escapeHTML(data.title)}</strong></li>
          <li>Quest: ${foundry.utils.escapeHTML(data.quest)}</li>
          <li>Weakness: <strong>${foundry.utils.escapeHTML(data.weakness)}</strong></li>
        </ul>
      </div>`,
    buttons: [cancelButton(), backButton(), primaryButton("confirm", "Replace Theme", () => ({ confirmed: true }), "fa-solid fa-arrows-rotate")],
    rejectClose: false
  });
}

async function sendReplacementSummary(theme, oldName) {
  const gmIds = game.users.filter(user => user.isGM).map(user => user.id);
  if (!gmIds.length) return;
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: theme }),
    whisper: gmIds,
    content: `<div class="litm-qol-improve-chat-summary"><h3><i class="fa-solid fa-arrows-rotate"></i> Fellowship Theme Replaced</h3><p><strong>${foundry.utils.escapeHTML(oldName)}</strong> was replaced with the nascent Fellowship theme <strong>${foundry.utils.escapeHTML(displayName(theme))}</strong>.</p></div>`,
    flags: { [MODULE_ID]: { fellowshipThemeReplaced: true, actorId: theme.id } }
  });
}

async function replaceFellowshipTheme(theme) {
  if (!isFellowship(theme) || Number(theme.system.abandon ?? 0) < 3) return;
  let data = null;
  while (true) {
    data = await promptManualReplacement(theme, data ?? {});
    if (isCancel(data)) return;
    const confirmation = await confirmManualReplacement(theme, data);
    if (isCancel(confirmation)) return;
    if (isBack(confirmation)) continue;
    if (!confirmation?.confirmed) continue;
    const oldName = displayName(theme);
    await theme.update({
      name: data.name,
      "system.powertags": [cleanTag(data.title)],
      "system.weaknesstags": [cleanTag(data.weakness)],
      "system.specialImprovements": blankSpecials(),
      "system.quest": data.quest,
      "system.abandon": 0,
      "system.improve": 0,
      "system.milestone": 0,
      [`flags.${MODULE_ID}.${NASCENT_FLAG}`]: true
    });
    await sendReplacementSummary(theme, oldName);
    ui.notifications.info(`${theme.name} is now a nascent Fellowship theme.`);
    return;
  }
}

async function developFellowshipTheme(theme) {
  if (!isFellowship(theme) || theme.getFlag?.(MODULE_ID, NASCENT_FLAG) !== true || Number(theme.system.improve ?? 0) < 1) return;
  const name = await foundry.applications.api.DialogV2.wait({
    window: { title: `Develop Fellowship Theme — ${displayName(theme)}` },
    classes: classes("replace"),
    content: `<div class="litm-qol-replace-dialog"><p>Add a power tag to this nascent Fellowship theme.</p><label><strong>New power tag</strong><input type="text" name="tag" autocomplete="off"></label></div>`,
    render: (_event, dialog) => {
      const input = dialog.element.querySelector('[name="tag"]');
      const update = () => setDisabled(dialog.element, "confirm", !input.value.trim());
      input.addEventListener("input", update);
      update();
    },
    buttons: [cancelButton(), primaryButton("confirm", "Add Power Tag", (_event, button) => button.form.elements.tag.value.trim(), "fa-solid fa-check")],
    rejectClose: false
  });
  if (isCancel(name) || !name) return;
  const tags = foundry.utils.deepClone(theme.toObject().system.powertags ?? []);
  tags.push(cleanTag(name));
  const matured = tags.filter(visible).length >= 3;
  await theme.update({
    "system.powertags": tags,
    "system.improve": 0,
    [`flags.${MODULE_ID}.${NASCENT_FLAG}`]: !matured
  });
  ui.notifications.info(matured ? `${theme.name} is no longer nascent.` : `${name} added to ${theme.name}.`);
}

async function promptNewTitle(theme, saved) {
  const index = (theme.system.powertags ?? []).findIndex(visible);
  const original = String(theme.system.powertags?.[index]?.name ?? "").trim();
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Evolve Fellowship Theme — ${displayName(theme)} — New Title` },
    classes: classes(),
    content: `<div class="litm-qol-evolve-dialog"><p>Pick a new title tag for the evolved Fellowship theme.</p><label><strong>New title tag</strong><input type="text" name="title" value="${escapeAttribute(saved ?? original)}" autocomplete="off"></label></div>`,
    render: (_event, dialog) => {
      const input = dialog.element.querySelector('[name="title"]');
      const update = () => setDisabled(dialog.element, "next", !input.value.trim() || input.value.trim() === original);
      input.addEventListener("input", update);
      update();
    },
    buttons: [cancelButton(), backButton(), primaryButton("next", "Next", (_event, button) => button.form.elements.title.value.trim())],
    rejectClose: false
  });
}

async function promptRevisions(theme, saved = {}) {
  const titleIndex = (theme.system.powertags ?? []).findIndex(visible);
  const rows = [];
  for (const [kind, tags] of [["power", theme.system.powertags ?? []], ["weakness", theme.system.weaknesstags ?? []]]) {
    tags.forEach((tag, index) => {
      if (!visible(tag) || (kind === "power" && index === titleIndex)) return;
      const key = `${kind}:${index}`;
      rows.push(`<div class="litm-qol-evolve-revision-row"><input type="checkbox" name="revision" value="${key}" ${Object.hasOwn(saved, key) ? "checked" : ""}><span class="litm-qol-evolve-kind">${kind}</span><input type="text" value="${escapeAttribute(saved[key] ?? tag.name)}" ${Object.hasOwn(saved, key) ? "" : "disabled"}></div>`);
    });
  }
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Evolve Fellowship Theme — ${displayName(theme)} — Revise Tags` },
    classes: classes(),
    content: `<div class="litm-qol-evolve-dialog"><p>Optionally revise active power tags and weakness tags.</p><div class="litm-qol-evolve-revision-list">${rows.join("") || '<p class="notes">No eligible tags.</p>'}</div></div>`,
    render: (_event, dialog) => {
      const refresh = () => setDisabled(dialog.element, "next", [...dialog.element.querySelectorAll('[name="revision"]:checked')].some(box => !box.closest(".litm-qol-evolve-revision-row").querySelector('input[type="text"]').value.trim()));
      for (const box of dialog.element.querySelectorAll('[name="revision"]')) {
        const input = box.closest(".litm-qol-evolve-revision-row").querySelector('input[type="text"]');
        box.addEventListener("change", () => { input.disabled = !box.checked; refresh(); });
        input.addEventListener("input", refresh);
      }
      refresh();
    },
    buttons: [cancelButton(), backButton(), primaryButton("next", "Next", (_event, button) => {
      const result = {};
      for (const box of button.form.querySelectorAll('[name="revision"]:checked')) result[box.value] = box.closest(".litm-qol-evolve-revision-row").querySelector('input[type="text"]').value.trim();
      return result;
    })],
    rejectClose: false
  });
}

async function promptQuest(theme, saved) {
  const original = String(theme.system.quest ?? "").trim();
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Evolve Fellowship Theme — ${displayName(theme)} — New Quest` },
    classes: classes(),
    content: `<div class="litm-qol-evolve-dialog"><p>Revise the Fellowship's Quest to fit its evolution.</p><textarea name="quest" rows="5">${foundry.utils.escapeHTML(saved ?? original)}</textarea></div>`,
    render: (_event, dialog) => {
      const input = dialog.element.querySelector('[name="quest"]');
      const update = () => setDisabled(dialog.element, "next", !input.value.trim() || input.value.trim() === original);
      input.addEventListener("input", update);
      update();
    },
    buttons: [cancelButton(), backButton(), primaryButton("next", "Next", (_event, button) => button.form.elements.quest.value.trim())],
    rejectClose: false
  });
}

function tradeCandidates(theme, revisions) {
  const candidates = [];
  const powers = (theme.system.powertags ?? []).map((tag, index) => ({ tag, index })).filter(({ tag }) => visible(tag));
  const weaknesses = (theme.system.weaknesstags ?? []).map((tag, index) => ({ tag, index })).filter(({ tag }) => visible(tag));
  for (const { tag, index } of powers.slice(3)) if (!Object.hasOwn(revisions, `power:${index}`)) candidates.push({ kind: "power", index, name: tag.name, label: "Power tag" });
  for (const { tag, index } of weaknesses.slice(1)) if (!Object.hasOwn(revisions, `weakness:${index}`)) candidates.push({ kind: "weakness", index, name: tag.name, label: "Weakness tag" });
  (theme.system.specialImprovements ?? []).forEach((improvement, index) => {
    if (improvement?.active && String(improvement.name ?? "").trim()) candidates.push({ kind: "special", index, name: improvement.name, label: "Special Improvement" });
  });
  return candidates;
}

async function promptTrades(theme, revisions, selectedKeys = []) {
  const candidates = tradeCandidates(theme, revisions);
  const selected = new Set(selectedKeys);
  const rows = candidates.map((trade, index) => `<label class="litm-qol-evolve-trade-row"><input type="checkbox" name="trade" value="${index}" ${selected.has(`${trade.kind}:${trade.index}`) ? "checked" : ""}><span><strong>${foundry.utils.escapeHTML(trade.name)}</strong><small>${trade.label} — trade for one Improvement</small></span></label>`).join("");
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Evolve Fellowship Theme — ${displayName(theme)} — Trades` },
    classes: classes(),
    content: `<div class="litm-qol-evolve-dialog"><p>Optionally trade surplus tags, weaknesses, or Special Improvements for new Improvements.</p><div class="litm-qol-evolve-trade-list">${rows || '<p class="notes">No eligible elements to trade.</p>'}</div></div>`,
    buttons: [cancelButton(), backButton(), primaryButton("next", "Next", (_event, button) => [...button.form.querySelectorAll('[name="trade"]:checked')].map(box => candidates[Number(box.value)]))],
    rejectClose: false
  });
}

function buildDraft(theme, state, trades) {
  const system = foundry.utils.deepClone(theme.toObject().system ?? {});
  const titleIndex = (theme.system.powertags ?? []).findIndex(visible);
  if (system.powertags?.[titleIndex]) system.powertags[titleIndex].name = state.title;
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
  for (const trade of trades.filter(trade => trade.kind === "special")) system.specialImprovements[trade.index] = { name: "", description: "", active: false };
  return { documentName: "Actor", type: "litm-fellowship-themecard", name: theme.name, system };
}

async function confirmEvolution(theme, state, trades, improvements) {
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Evolve Fellowship Theme — ${displayName(theme)} — Confirm` },
    classes: classes(),
    content: `<div class="litm-qol-evolve-dialog"><h3>Confirm Fellowship Evolution</h3><ul><li>New title: <strong>${foundry.utils.escapeHTML(state.title)}</strong></li><li>New Quest: <strong>${foundry.utils.escapeHTML(state.quest)}</strong></li>${Object.values(state.revisions).map(name => `<li>Revised tag: <strong>${foundry.utils.escapeHTML(name)}</strong></li>`).join("")}${trades.map((trade, index) => `<li>Traded ${foundry.utils.escapeHTML(trade.name)} → <strong>${foundry.utils.escapeHTML(improvements[index]?.description ?? "Improvement")}</strong></li>`).join("")}<li>Milestones reset to 0.</li></ul></div>`,
    buttons: [cancelButton(), backButton(), primaryButton("confirm", "Confirm Evolution", () => ({ confirmed: true }), "fa-solid fa-check")],
    rejectClose: false
  });
}

async function sendEvolutionSummary(theme, oldName, state, trades, improvements) {
  const gmIds = game.users.filter(user => user.isGM).map(user => user.id);
  if (!gmIds.length) return;
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: theme }),
    whisper: gmIds,
    content: `<div class="litm-qol-improve-chat-summary"><h3><i class="fa-solid fa-arrow-up"></i> Fellowship Theme Evolved</h3><p><strong>${foundry.utils.escapeHTML(oldName)}</strong> evolved.</p><ul><li>New title: <strong>${foundry.utils.escapeHTML(state.title)}</strong></li><li>New Quest: <strong>${foundry.utils.escapeHTML(state.quest)}</strong></li>${trades.map((trade, index) => `<li>Traded ${foundry.utils.escapeHTML(trade.name)} → <strong>${foundry.utils.escapeHTML(improvements[index]?.description ?? "Improvement")}</strong></li>`).join("")}<li>Milestones reset to 0.</li></ul></div>`,
    flags: { [MODULE_ID]: { fellowshipThemeEvolved: true, actorId: theme.id } }
  });
}

async function evolveFellowshipTheme(theme) {
  if (!isFellowship(theme) || Number(theme.system.milestone ?? 0) < 3) return;
  const state = { title: null, revisions: {}, quest: null, tradeKeys: [] };
  let page = "title";
  try {
    while (true) {
      if (page === "title") {
        const result = await promptNewTitle(theme, state.title);
        if (isCancel(result)) return;
        if (isBack(result)) return;
        if (!result) continue;
        state.title = result;
        page = "revisions";
        continue;
      }
      if (page === "revisions") {
        const result = await promptRevisions(theme, state.revisions);
        if (isCancel(result)) return;
        if (isBack(result)) { page = "title"; continue; }
        state.revisions = result ?? {};
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
      const improvements = [];
      const draftState = { promiseGain: 0 };
      let back = false;
      for (const trade of trades) {
        const api = game.modules.get(MODULE_ID)?.api;
        if (typeof api?.stageTradeImprovement !== "function") throw new Error("The staged Improvement API is unavailable.");
        const result = await api.stageTradeImprovement(theme, draft, draftState);
        if (result?.navigation === "back") { back = true; break; }
        if (!result) return;
        improvements.push(result);
      }
      if (back) continue;
      const confirmation = await confirmEvolution(theme, state, trades, improvements);
      if (isCancel(confirmation)) return;
      if (isBack(confirmation)) continue;
      if (!confirmation?.confirmed) continue;
      const oldName = displayName(theme);
      await theme.update({
        "system.powertags": draft.system.powertags,
        "system.weaknesstags": draft.system.weaknesstags,
        "system.specialImprovements": draft.system.specialImprovements,
        "system.quest": draft.system.quest,
        "system.abandon": Number(draft.system.abandon ?? theme.system.abandon ?? 0),
        "system.milestone": 0,
        [`flags.${MODULE_ID}.${NASCENT_FLAG}`]: false
      });
      await sendEvolutionSummary(theme, oldName, state, trades, improvements);
      ui.notifications.info(`${theme.name} evolved successfully.`);
      return;
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Fellowship evolution failed.`, error);
    ui.notifications.error("The Fellowship theme could not be evolved. Check the console for details.");
  } finally {
    state.title = null;
    state.revisions = {};
    state.quest = null;
    state.tradeKeys = [];
  }
}

function actionRow(container) {
  let row = container.querySelector(".litm-qol-theme-action-row");
  if (row) return row;
  row = document.createElement("div");
  row.className = "litm-qol-theme-action-row";
  const header = container.querySelector(".theme-name");
  if (header) header.insertAdjacentElement("afterend", row);
  else container.querySelector(".themebook-style")?.prepend(row);
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

function fellowshipContainers(actor, root) {
  return isFellowship(actor)
    ? [...root.querySelectorAll(".themebook-container")]
    : [...root.querySelectorAll(".themebook-container")].filter(container => container.querySelector(".themebook-style.litm-fellowship-themecard"));
}

function addButton(row, className, icon, label, callback) {
  if (row.querySelector(`.${className}`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    void (async () => {
      button.disabled = true;
      try {
        await callback();
      } catch (error) {
        console.error(`${MODULE_ID} | Fellowship development workflow failed.`, error);
        ui.notifications.error("The Fellowship theme could not be updated. Check the console for details.");
      } finally {
        button.disabled = false;
      }
    })();
  });
  row.append(button);
}

function renderFellowshipDevelopment(app, html) {
  const actor = appActor(app);
  const root = rootElement(html);
  const fellowship = fellowshipForActor(actor);
  if (!actor || !root || !fellowship || (!fellowship.isOwner && !game.user.isGM)) return;
  for (const container of fellowshipContainers(actor, root)) {
    const row = actionRow(container);
    if (!row) continue;
    const nascent = fellowship.getFlag?.(MODULE_ID, NASCENT_FLAG) === true;
    if (nascent) {
      container.classList.add("litm-qol-nascent-theme");
      let nascentActions = row.querySelector(".litm-qol-nascent-actions");
      if (!nascentActions) {
        nascentActions = document.createElement("div");
        nascentActions.className = "litm-qol-nascent-actions";
        row.prepend(nascentActions);
      }
      if (!nascentActions.querySelector(".litm-qol-nascent-badge")) {
        const badge = document.createElement("span");
        badge.className = "litm-qol-nascent-badge";
        badge.textContent = "Nascent";
        nascentActions.prepend(badge);
      }
      if (Number(fellowship.system.improve ?? 0) >= 1) addButton(nascentActions, "litm-qol-develop-fellowship-button", "fa-seedling", "Develop Theme", () => developFellowshipTheme(fellowship));
    }
    const actions = buttonStack(row);
    if (Number(fellowship.system.milestone ?? 0) >= 3) {
      addButton(actions, "litm-qol-evolve-fellowship-button", "fa-arrow-up", "Evolve Theme", () => evolveFellowshipTheme(fellowship));
    }
    if (Number(fellowship.system.abandon ?? 0) >= 3) addButton(actions, "litm-qol-replace-fellowship-button", "fa-arrows-rotate", "Replace Theme", () => replaceFellowshipTheme(fellowship));
  }
}

Hooks.on("renderActorSheet", renderFellowshipDevelopment);
Hooks.on("renderApplicationV2", (app, html) => {
  if (appActor(app)) renderFellowshipDevelopment(app, html);
});
Hooks.on("updateActor", (actor, changes) => {
  if (!isFellowship(actor)) return;
  const changedImprove = foundry.utils.hasProperty(changes, "system.improve") ||
    (foundry.utils.hasProperty(changes, "system") && Object.hasOwn(changes.system ?? {}, "improve"));
  if (!changedImprove) return;
  setTimeout(() => {
    if (actor.sheet?.rendered) actor.sheet.render(false);
    for (const character of game.actors.filter(candidate => ["character", "litm-character"].includes(candidate.type) && candidate.system?.actorSharedSingleThemecardId === actor.id)) {
      if (character.sheet?.rendered) character.sheet.render(false);
    }
  }, 0);
});
