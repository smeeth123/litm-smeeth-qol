import { chooseTropePlan, resolveTropeKit } from "./trope-creator.mjs";
import { applyThemekit, openQolThemekitSelector } from "./themekit-selector.mjs";
import { chooseThemebookSource } from "./theme-replacement.mjs";

const MODULE_ID = "litm-smeeth-qol";
const DRAFT_FLAG = "heroCreatorDraft";
const NAV_CANCEL = Symbol("cancel");
const NAV_BACK = Symbol("back");
let creatingHero = false;

const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
const classes = (...extra) => ["litm-qol-system-dialog", "litm-qol-replace-theme-window", "litm-qol-hero-creator-window", ...extra];
const cancelButton = () => ({ action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", class: "litm-qol-replace-cancel", callback: () => NAV_CANCEL });
const backButton = () => ({ action: "back", label: "Back", icon: "fa-solid fa-arrow-left", class: "litm-qol-replace-back", callback: () => NAV_BACK });
const nextButton = (label, callback, action = "next") => ({ action, label, icon: "fa-solid fa-arrow-right", class: "litm-qol-replace-primary", default: true, callback });

function rootElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function setDisabled(root, action, disabled) {
  const button = root.querySelector(`button[data-action="${action}"]`);
  if (button) button.disabled = Boolean(disabled);
}

function exclusiveCheckboxes(root, name, changed) {
  const boxes = [...root.querySelectorAll(`input[type="checkbox"][name="${name}"]`)];
  const update = () => changed(boxes.find(box => box.checked) ?? null);
  for (const box of boxes) box.addEventListener("change", () => {
    if (box.checked) for (const other of boxes) if (other !== box) other.checked = false;
    update();
  });
  update();
}

function cleanTag(tag = {}, overrides = {}) {
  return {
    name: String(tag.name ?? "").trim(),
    question: String(tag.question ?? ""),
    burned: false,
    toBurn: false,
    planned: false,
    selected: false,
    ...overrides
  };
}

function filledTags(tags) {
  return (tags ?? []).map((tag, index) => ({ tag, index }))
    .filter(({ tag }) => String(tag?.name || tag?.question || "").trim());
}

function normalizedType(value) {
  return ["litm-origin", "litm-adventure", "litm-greatness", "litm-variable"].includes(value) ? value : "litm-origin";
}

function fiveSpecials(specials) {
  const result = (specials ?? []).filter(special => String(special?.name ?? "").trim())
    .map(special => ({
      name: String(special.name ?? "").trim(),
      description: String(special.description ?? ""),
      active: false
    }));
  while (result.length < 5) result.push({ name: "", description: "", active: false });
  return result.slice(0, 5);
}

function checkboxRow({ name, value, label, kind = "positive", question = "", answerName = "", answer = "", placeholder = "Your answer" }) {
  return `<label class="litm-qol-hero-choice-row">
    <input type="checkbox" name="${name}" value="${value}">
    <span class="litm-qol-hero-choice-copy">${question ? `<small>${esc(question)}</small>` : ""}<mark class="tag ${kind}">${esc(label)}</mark></span>
    ${answerName ? `<input type="text" name="${answerName}" value="${esc(answer)}" placeholder="${esc(placeholder)}" disabled>` : ""}
  </label>`;
}

function questionRow({ name, value, question, answerName }) {
  return `<label class="litm-qol-hero-choice-row litm-qol-hero-question-row">
    <input type="checkbox" name="${name}" value="${value}">
    <span class="litm-qol-hero-question-text">${esc(question)}</span>
    <input type="text" name="${answerName}" placeholder="Your answer" disabled>
  </label>`;
}

async function chooseHeroStartingPoint({ includeBackpack = true } = {}) {
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Hero Creator — Starting Point" }, classes: classes(),
    content: `<div class="litm-qol-hero-step"><h2>How would you like to create this Hero?</h2>
      <label class="litm-qol-hero-method"><input type="checkbox" name="heroStartingPoint" value="trope"><strong>Start with a Trope</strong><span>Use three core Themekits and choose a fourth kit.${includeBackpack ? " Choose a Backpack tag too." : " Your existing Backpack is retained."}</span></label>
      <label class="litm-qol-hero-method"><input type="checkbox" name="heroStartingPoint" value="custom"><strong>Build freely</strong><span>Choose a Themekit or Themebook for each of your four themes.</span></label></div>`,
    render: (_event, dialog) => exclusiveCheckboxes(dialog.element, "heroStartingPoint", choice => setDisabled(dialog.element, "next", !choice)),
    buttons: [cancelButton(), nextButton("Next", (_event, button) => button.form.querySelector('[name="heroStartingPoint"]:checked')?.value ?? NAV_CANCEL)],
    rejectClose: false
  });
}

async function buildTropeThemes(actor, plan) {
  const completed = [];
  for (let index = 0; index < 4;) {
    const kit = await resolveTropeKit(plan.kits[index].uuid);
    if (!kit) { ui.notifications.warn("A Trope Themekit is no longer available. Please choose again."); return NAV_BACK; }
    const draft = await createThemekitDraft(actor, index + 1);
    await applyThemekit(actor, draft, kit);
    const configured = await configureThemekit(draft, kit, index + 1);
    if (configured === NAV_CANCEL) return NAV_CANCEL;
    if (configured === NAV_BACK) {
      await actor.deleteEmbeddedDocuments("Item", [draft.id]);
      if (index === 0) return NAV_BACK;
      index--;
      await actor.deleteEmbeddedDocuments("Item", [completed.pop()]);
      continue;
    }
    await draft.update(configured);
    completed.push(draft.id);
    index++;
  }
  return true;
}

async function applyTropeBackpack(actor, tag) {
  if (!tag) return;
  const backpack = actor.items.find(item => item.type === "backpack");
  if (backpack) {
    await backpack.update({ "system.items": [...(backpack.system.items ?? []).map(item => foundry.utils.deepClone(item)), cleanTag({ name: tag })] });
  } else {
    await actor.createEmbeddedDocuments("Item", [{ name: "Backpack", type: "backpack", system: { items: [cleanTag({ name: tag })] } }]);
  }
}

async function askHeroName({ defaultName = "", fallbackName = "New Hero", mode = "create" } = {}) {
  const title = mode === "reforge" ? "Be Reforged — Name Your Hero" : mode === "parity" ? "Journey’s End — Name Your Hero" : "Hero Creator — Name Your Hero";
  return foundry.applications.api.DialogV2.wait({
    window: { title }, classes: classes(),
    content: `<div class="litm-qol-hero-step"><h2>Name your Hero</h2><p>Your themes are complete. Choose a name now, or skip and name your Hero later. Skipping keeps the name <strong>${esc(fallbackName)}</strong>.</p><label><strong>Hero name</strong><input type="text" name="heroName" value="${esc(defaultName)}" autofocus autocomplete="off"></label></div>`,
    render: (_event, dialog) => {
      const input = dialog.element.querySelector('[name="heroName"]');
      const update = () => setDisabled(dialog.element, "finish", !input.value.trim());
      input.addEventListener("input", update); update();
    },
    buttons: [cancelButton(),
      { action: "skip", label: "Skip", icon: "fa-solid fa-forward", callback: () => ({ skip: true }) },
      nextButton(mode === "reforge" ? "Reforge Hero" : mode === "parity" ? "Create Replacement Hero" : "Finish", (_event, button) => ({ name: button.form.elements.heroName.value.trim() }), "finish")],
    rejectClose: false
  });
}

async function chooseThemeMethod(number) {
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Hero Creator — Theme ${number} of 4` }, classes: classes(),
    content: `<div class="litm-qol-hero-step"><div class="litm-qol-hero-progress">Theme ${number} of 4</div><h2>Choose a theme source</h2>
      <label class="litm-qol-hero-method"><input type="checkbox" name="themeMethod" value="themekit"><strong>Themekit</strong><span>Build from a ready-made theme.</span></label>
      <label class="litm-qol-hero-method"><input type="checkbox" name="themeMethod" value="themebook"><strong>Themebook</strong><span>Answer theme questions to make it your own.</span></label></div>`,
    render: (_event, dialog) => exclusiveCheckboxes(dialog.element, "themeMethod", choice => setDisabled(dialog.element, "next", !choice)),
    buttons: [cancelButton(), nextButton("Next", (_event, button) => button.form.querySelector('[name="themeMethod"]:checked')?.value ?? null)],
    rejectClose: false
  });
}

async function createThemekitDraft(actor, number) {
  const [draft] = await actor.createEmbeddedDocuments("Item", [{
    name: `Theme ${number} (Draft)`, type: "themebook",
    system: { type: "litm-origin", color: "litm-origin", tabCategory: "main", powertags: [], weaknesstags: [] }
  }]);
  return draft;
}

async function configureThemekit(draft, themekit, number) {
  const powers = filledTags(draft.system.powertags).map(({ tag }) => foundry.utils.deepClone(tag));
  const weaknesses = filledTags(draft.system.weaknesstags).map(({ tag }) => foundry.utils.deepClone(tag));
  const specials = (draft.system.specialImprovements ?? []).filter(s => String(s?.name ?? "").trim()).map(s => foundry.utils.deepClone(s));
  if (!powers.length) { ui.notifications.warn("That Themekit does not contain a title tag."); return NAV_BACK; }

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `Hero Creator — Theme ${number} of 4` }, classes: classes(), position: { width: 720, height: 760 },
    content: `<div class="litm-qol-hero-step litm-qol-hero-config"><div class="litm-qol-hero-progress">Theme ${number} of 4 — Themekit</div>
      <h2>${esc(themekit.system.themekit_type || themekit.name)}</h2>
      <fieldset><legend>Title tag</legend><mark class="tag positive">${esc(powers[0].name)}</mark></fieldset>
      <fieldset><legend>Choose two additional power tags</legend>
        ${powers.slice(1).map((tag, index) => checkboxRow({ name: "powerChoice", value: `existing:${index + 1}`, label: tag.name })).join("")}
        ${[0, 1].map(index => checkboxRow({ name: "powerChoice", value: `custom:${index}`, label: "Create my own", answerName: `customPower${index}`, placeholder: "Tag name" })).join("")}
      </fieldset>
      <fieldset><legend>Choose one weakness tag</legend>
        ${weaknesses.map((tag, index) => checkboxRow({ name: "weaknessChoice", value: `existing:${index}`, label: tag.name, kind: "weakness" })).join("")}
        ${checkboxRow({ name: "weaknessChoice", value: "custom:0", label: "Create my own", kind: "weakness", answerName: "customWeakness", placeholder: "Tag name" })}
      </fieldset>
      <fieldset class="litm-qol-hero-quest"><legend>Quest</legend><textarea name="quest" rows="5">${esc(draft.system.quest)}</textarea></fieldset>
      </div>`,
    render: (_event, dialog) => bindConfiguration(dialog.element, { powerCount: 2 }),
    buttons: [cancelButton(), backButton(), nextButton("Save Theme", (_event, button) => readConfiguration(button.form), "save")],
    rejectClose: false
  });
  if (result === NAV_CANCEL || result === NAV_BACK || !result) return result ?? NAV_CANCEL;

  const chosenPowers = new Set(result.powers.filter(v => v.startsWith("existing:")).map(v => Number(v.split(":")[1])));
  const activePowers = [cleanTag(powers[0])];
  for (const index of chosenPowers) activePowers.push(cleanTag(powers[index]));
  for (const value of result.powers.filter(v => v.startsWith("custom:"))) activePowers.push(cleanTag({ name: result.customPowers[Number(value.split(":")[1])] }));
  const plannedPowers = powers.slice(1).filter((_tag, index) => !chosenPowers.has(index + 1)).map(tag => cleanTag(tag, { planned: true }));
  const weaknessExisting = result.weakness.startsWith("existing:") ? Number(result.weakness.split(":")[1]) : -1;
  const activeWeakness = weaknessExisting >= 0 ? cleanTag(weaknesses[weaknessExisting]) : cleanTag({ name: result.customWeakness });
  const plannedWeaknesses = weaknesses.filter((_tag, index) => index !== weaknessExisting).map(tag => cleanTag(tag, { planned: true }));
  const type = normalizedType(themekit.system.themebook_type || draft.system.type);
  return {
    name: themekit.system.themekit_type || themekit.name,
    "system.powertags": [...activePowers, ...plannedPowers],
    "system.weaknesstags": [activeWeakness, ...plannedWeaknesses],
    "system.specialImprovements": fiveSpecials(specials),
    "system.quest": result.quest, "system.type": type, "system.color": type,
    "system.abandon": 0, "system.improve": 0, "system.milestone": 0
  };
}

function bindConfiguration(root, { powerCount }) {
  const update = () => {
    for (const box of root.querySelectorAll('input[type="checkbox"]')) {
      const rowInput = box.closest("label")?.querySelector('input[type="text"]');
      if (rowInput) rowInput.disabled = !box.checked;
    }
    const powers = [...root.querySelectorAll('[name="powerChoice"]:checked')];
    const weakness = root.querySelector('[name="weaknessChoice"]:checked');
    const powerAnswersValid = powers.every(box => {
      const input = box.closest("label")?.querySelector('input[type="text"]');
      return !input || Boolean(input.value.trim());
    });
    const weaknessInput = weakness?.closest("label")?.querySelector('input[type="text"]');
    const weaknessValid = weakness && (!weaknessInput || Boolean(weaknessInput.value.trim()));
    const title = root.querySelector('[name="titleAnswer"]');
    const quest = root.querySelector('[name="quest"]')?.value.trim();
    setDisabled(root, "save", powers.length !== powerCount || !powerAnswersValid || !weaknessValid || !quest || (title && !title.value.trim()));
  };
  for (const box of root.querySelectorAll('[name="weaknessChoice"]')) box.addEventListener("change", () => {
    if (box.checked) for (const other of root.querySelectorAll(`[name="${box.name}"]`)) if (other !== box) other.checked = false;
    update();
  });
  for (const box of root.querySelectorAll('[name="powerChoice"]')) box.addEventListener("change", () => {
    const checked = [...root.querySelectorAll('[name="powerChoice"]:checked')];
    if (checked.length > powerCount) box.checked = false;
    update();
  });
  for (const input of root.querySelectorAll("input, textarea")) input.addEventListener("input", update);
  update();
}

function readConfiguration(form) {
  return {
    powers: [...form.querySelectorAll('[name="powerChoice"]:checked')].map(box => box.value),
    weakness: form.querySelector('[name="weaknessChoice"]:checked')?.value ?? "",
    customPowers: [form.elements.customPower0?.value.trim(), form.elements.customPower1?.value.trim()],
    customWeakness: form.elements.customWeakness?.value.trim(),
    titleAnswer: form.elements.titleAnswer?.value.trim(),
    quest: form.elements.quest.value.trim()
  };
}

async function configureThemebook(source, number) {
  const powers = filledTags(source.system.powertags).map(({ tag }) => foundry.utils.deepClone(tag));
  const weaknesses = filledTags(source.system.weaknesstags).map(({ tag }) => foundry.utils.deepClone(tag));
  const specials = (source.system.specialImprovements ?? []).filter(s => String(s?.name ?? "").trim()).map(s => foundry.utils.deepClone(s));
  if (powers.length < 3 || !weaknesses.length) { ui.notifications.warn("That Themebook needs a title question, two additional power-tag questions, and a weakness-tag question."); return NAV_BACK; }
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `Hero Creator — Theme ${number} of 4` }, classes: classes(), position: { width: 760, height: 790 },
    content: `<div class="litm-qol-hero-step litm-qol-hero-config"><div class="litm-qol-hero-progress">Theme ${number} of 4 — Themebook</div><h2>${esc(source.name)}</h2>
      <fieldset><legend>Title tag</legend><p class="litm-qol-fixed-question">${esc(powers[0].question || powers[0].name)}</p><input type="text" name="titleAnswer" placeholder="Your answer"></fieldset>
      <fieldset><legend>Choose and answer two power-tag questions</legend>${powers.slice(1).map((tag, index) => questionRow({ name: "powerChoice", value: `existing:${index + 1}`, question: tag.question || tag.name, answerName: `powerAnswer${index + 1}` })).join("")}</fieldset>
      <fieldset><legend>Choose and answer one weakness-tag question</legend>${weaknesses.map((tag, index) => questionRow({ name: "weaknessChoice", value: `existing:${index}`, question: tag.question || tag.name, answerName: `weaknessAnswer${index}` })).join("")}</fieldset>
      <fieldset class="litm-qol-hero-quest"><legend>Quest</legend><textarea name="quest" rows="5" placeholder="Write this theme's quest"></textarea></fieldset>
      </div>`,
    render: (_event, dialog) => bindThemebookConfiguration(dialog.element),
    buttons: [cancelButton(), backButton(), nextButton("Save Theme", (_event, button) => readThemebookConfiguration(button.form), "save")], rejectClose: false
  });
  if (result === NAV_CANCEL || result === NAV_BACK || !result) return result ?? NAV_CANCEL;
  const chosenPowerIndices = result.powers.map(value => Number(value.split(":")[1]));
  const activePowers = [cleanTag(powers[0], { name: result.titleAnswer })];
  for (const index of chosenPowerIndices) activePowers.push(cleanTag(powers[index], { name: result.powerAnswers[index] }));
  const plannedPowers = powers.slice(1).filter((_tag, index) => !chosenPowerIndices.includes(index + 1)).map(tag => cleanTag(tag, { planned: true }));
  const weaknessIndex = Number(result.weakness.split(":")[1]);
  const activeWeakness = cleanTag(weaknesses[weaknessIndex], { name: result.weaknessAnswers[weaknessIndex] });
  const plannedWeaknesses = weaknesses.filter((_tag, index) => index !== weaknessIndex).map(tag => cleanTag(tag, { planned: true }));
  const data = source.toObject();
  return {
    name: source.name, type: "themebook",
    system: {
      ...foundry.utils.deepClone(data.system),
      powertags: [...activePowers, ...plannedPowers], weaknesstags: [activeWeakness, ...plannedWeaknesses],
      specialImprovements: fiveSpecials(specials),
      quest: result.quest, type: normalizedType(source.system.type), color: normalizedType(source.system.color || source.system.type),
      tabCategory: "main", abandon: 0, improve: 0, milestone: 0
    }
  };
}

function bindThemebookConfiguration(root) {
  bindConfiguration(root, { powerCount: 2 });
}

function readThemebookConfiguration(form) {
  const base = readConfiguration(form);
  base.powerAnswers = {};
  for (const box of form.querySelectorAll('[name="powerChoice"]:checked')) {
    const index = Number(box.value.split(":")[1]);
    base.powerAnswers[index] = form.elements[`powerAnswer${index}`].value.trim();
  }
  base.weaknessAnswers = {};
  const weaknessIndex = Number(base.weakness.split(":")[1]);
  base.weaknessAnswers[weaknessIndex] = form.elements[`weaknessAnswer${weaknessIndex}`].value.trim();
  return base;
}

async function confirmation(actor, { mode = "create", tropePlan = null } = {}) {
  const themes = actor.items.filter(item => item.type === "themebook");
  const reforging = mode === "reforge";
  const parity = mode === "parity";
  return foundry.applications.api.DialogV2.wait({
    window: { title: reforging ? "Be Reforged — Final Confirmation" : parity ? "Journey’s End — Confirm Replacement Hero" : "Hero Creator — Finish" }, classes: classes(),
    content: `<div class="litm-qol-hero-step"><h2>Your Hero is ready</h2>${tropePlan ? `<p>Trope: <strong>${esc(tropePlan.tropeName)}</strong></p>${tropePlan.backpackTag ? `<p>Backpack tag: <mark class="tag positive">${esc(tropePlan.backpackTag)}</mark></p>` : ""}` : ""}<p>You created four themes:</p><ol>${themes.map(theme => `<li><strong>${esc(theme.name)}</strong> — ${esc(theme.system.powertags?.[0]?.name)}</li>`).join("")}</ol>${reforging ? '<div class="litm-qol-hero-reminder"><strong>Finishing will permanently replace all four old themes.</strong> Promise and Quintessences will remain on the Hero.</div>' : parity ? '<div class="litm-qol-hero-reminder"><strong>Finishing creates this as a separate replacement Hero.</strong> The retired Hero remains unchanged.</div>' : `<div class="litm-qol-hero-reminder"><strong>Before play begins:</strong><ul>${tropePlan?.backpackTag ? "" : "<li>Choose a Backpack tag.</li>"}<li>Create a relationship tag for each member of your fellowship.</li></ul></div>`}</div>`,
    buttons: [cancelButton(), nextButton("Continue to Naming", () => true, "finish")], rejectClose: false
  });
}

async function deleteDraftActor(actor) {
  if (actor && game.actors.get(actor.id) && actor.getFlag(MODULE_ID, DRAFT_FLAG)) await actor.delete();
}

export async function runHeroCreator({ reforgeActor = null, parityActor = null } = {}) {
  if (creatingHero) return ui.notifications.warn("The Hero Creator is already open.");
  if (!game.user.can("ACTOR_CREATE")) return ui.notifications.warn("You do not have permission to create Actors.");
  creatingHero = true;
  let actor = null;
  try {
    const mode = reforgeActor ? "reforge" : parityActor ? "parity" : "create";
    let tropePlan = null;
    while (true) {
      const start = await chooseHeroStartingPoint({ includeBackpack: mode !== "reforge" });
      if (!start || start === NAV_CANCEL) return;
      tropePlan = null;
      if (start === "trope") {
        tropePlan = await chooseTropePlan({ includeBackpack: mode !== "reforge" });
        if (tropePlan?.navigation === "back") continue;
        if (!tropePlan) return;
      }
      const flags = { [DRAFT_FLAG]: true };
      if (tropePlan) flags.heroCreatorTrope = { uuid: tropePlan.tropeUuid, name: tropePlan.tropeName, kitUuids: tropePlan.kits.map(kit => kit.uuid), backpackTag: tropePlan.backpackTag };
      actor = await Actor.create({ name: reforgeActor?.name || "New Hero", type: "litm-character", prototypeToken: { actorLink: true }, ownership: { default: 0, [game.user.id]: 3 }, flags: { [MODULE_ID]: flags } });
      if (!tropePlan) break;
      const built = await buildTropeThemes(actor, tropePlan);
      if (built === NAV_CANCEL) { await deleteDraftActor(actor); return; }
      if (built === NAV_BACK) { await deleteDraftActor(actor); actor = null; continue; }
      if (mode !== "reforge") await applyTropeBackpack(actor, tropePlan.backpackTag);
      break;
    }
    if (!tropePlan) {
      for (let number = 1; number <= 4;) {
        const method = await chooseThemeMethod(number);
        if (!method || method === NAV_CANCEL) { await deleteDraftActor(actor); return; }
        if (method === "themekit") {
          const draft = await createThemekitDraft(actor, number);
          const themekit = await openQolThemekitSelector(actor, draft, { themebookName: null });
          if (!themekit) { await actor.deleteEmbeddedDocuments("Item", [draft.id]); continue; }
          const configured = await configureThemekit(draft, themekit, number);
          if (configured === NAV_CANCEL) { await deleteDraftActor(actor); return; }
          if (configured === NAV_BACK) { await actor.deleteEmbeddedDocuments("Item", [draft.id]); continue; }
          await draft.update(configured);
        } else {
          const source = await chooseThemebookSource({ title: `Hero Creator — Select Themebook for Theme ${number}` });
          if (source?.navigation === "cancel") { await deleteDraftActor(actor); return; }
          if (!source || source === NAV_CANCEL || source?.navigation) continue;
          const configured = await configureThemebook(source, number);
          if (configured === NAV_CANCEL) { await deleteDraftActor(actor); return; }
          if (configured === NAV_BACK) continue;
          await actor.createEmbeddedDocuments("Item", [configured]);
        }
        number += 1;
      }
    }
    const done = await confirmation(actor, { mode, tropePlan });
    if (!done || done === NAV_CANCEL) { await deleteDraftActor(actor); return; }
    const naming = await askHeroName({ defaultName: reforgeActor?.name ?? "", fallbackName: actor.name, mode });
    if (!naming || naming === NAV_CANCEL || (!naming.skip && !naming.name)) { await deleteDraftActor(actor); return; }
    if (!naming.skip) await actor.update({ name: naming.name });
    if (reforgeActor || parityActor) return actor;
    await actor.update({ "system.editMode": false });
    await actor.unsetFlag(MODULE_ID, DRAFT_FLAG);
    actor.sheet?.render(true);
    ui.notifications.info(`${actor.name} was created.`);
  } catch (error) {
    console.error(`${MODULE_ID} | Hero Creator failed.`, error);
    ui.notifications.error("The Hero Creator could not finish. The draft Hero was removed.");
    await deleteDraftActor(actor);
  } finally { creatingHero = false; }
}

function addHeroCreatorButton(html) {
  const root = rootElement(html);
  if (!root || root.querySelector(".litm-qol-hero-creator-button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "litm-qol-hero-creator-button";
  button.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i><span>Hero Creator</span>';
  button.addEventListener("click", event => { event.preventDefault(); runHeroCreator(); });
  const footer = root.querySelector(".directory-footer, footer.directory-footer");
  if (footer) footer.append(button);
  else {
    const list = root.querySelector(".directory-list");
    if (list) list.insertAdjacentElement("afterend", button);
    else root.append(button);
  }
}

Hooks.on("renderActorDirectory", (_app, html) => addHeroCreatorButton(html));
Hooks.on("renderSidebarTab", (app, html) => {
  const id = app?.options?.id ?? app?.id ?? app?.tabName;
  if (String(id).toLowerCase().includes("actor")) addHeroCreatorButton(html);
});
