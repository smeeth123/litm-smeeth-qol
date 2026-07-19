import { awardPromise, completeMomentOfFulfillment, storedPromise } from "./promise-manager.mjs";
import { runHeroCreator } from "./hero-creator.mjs";

const MODULE_ID = "litm-smeeth-qol";
const REFORGED_IMPROVEMENTS_FLAG = "reforgedFreeImprovements";
const RETIREMENT_FLAG = "journeysEndRetirement";
const OPTIONS = [
  ["retirement", "Arrive at Journey’s End", "Retirement"],
  ["reforged", "Be Reforged", "Rebuild Hero"],
  ["quintessence", "Gain a Quintessence", ""],
  ["magic", "Shake The Foundations Of Magic", "New Magic"],
  ["enchantment", "Speak Words Eternal", "Enchantment"],
  ["discovery", "Unearth Lost Truths", "Discovery"]
];

const SIMPLE_PATHS = {
  magic: {
    title: "Shake The Foundations Of Magic",
    paragraphs: [
      "Establish a groundbreaking discovery that changes what your Hero’s magic can do. Work with the Narrator to define its scope and how it affects the story.",
      "See Core Book Vol. I, page 195."
    ]
  },
  enchantment: {
    title: "Speak Words Eternal",
    paragraphs: [
      "Create an enduring enchantment upon an NPC, group, force, or place. Define its permanent story tag and agree on its reach with the Narrator.",
      "See Core Book Vol. I, page 195."
    ]
  },
  discovery: {
    title: "Unearth Lost Truths",
    paragraphs: [
      "Reveal a profound secret concerning an important subject, mystery, or obstacle. The Narrator provides the hidden truth or works with you to establish it.",
      "See Core Book Vol. I, page 195."
    ]
  }
};

function actorFromApp(app) {
  const actor = app?.actor ?? (app?.document?.documentName === "Actor" ? app.document : null);
  return actor?.documentName === "Actor" ? actor : null;
}

function rootElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function escapeAttribute(value) {
  return foundry.utils.escapeHTML(String(value ?? "")).replaceAll('"', "&quot;");
}

function plainText(value) {
  const element = document.createElement("div");
  element.innerHTML = String(value ?? "");
  return String(element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function bindExclusive(root) {
  const boxes = [...root.querySelectorAll('[name="fulfillmentPath"]')];
  const next = root.closest(".application")?.querySelector('[data-action="next"]') ?? root.querySelector('[data-action="next"]');
  const update = () => { if (next) next.disabled = !boxes.some(box => box.checked); };
  for (const box of boxes) box.addEventListener("change", () => {
    if (box.checked) for (const other of boxes) if (other !== box) other.checked = false;
    update();
  });
  update();
}

async function chooseFulfillmentPath(actor) {
  const queued = storedPromise(actor);
  const rows = OPTIONS.map(([value, label, note]) => `
    <label class="litm-qol-moment-choice">
      <input type="checkbox" name="fulfillmentPath" value="${value}">
      <span><strong>${label}</strong>${note ? `<small>${note}</small>` : ""}</span>
    </label>`).join("");
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Moment of Fulfillment" },
    classes: ["litm-qol-system-dialog", "litm-qol-moment-window"],
    content: `<div class="litm-qol-moment-dialog"><p>Choose how this Promise will be fulfilled. See Core Book Vol. I, pages 193–195.</p>${queued ? `<p><strong>${queued} additional Promise</strong> ${queued === 1 ? "is" : "are"} waiting and will be applied only after a completed Moment of Fulfillment.</p>` : ""}<div class="litm-qol-moment-choice-list">${rows}</div></div>`,
    render: (_event, dialog) => bindExclusive(dialog.element),
    buttons: [
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", class: "litm-qol-moment-footer-button", callback: () => null },
      { action: "next", label: "Next", icon: "fa-solid fa-arrow-right", class: "litm-qol-improve-primary", default: true, callback: (_event, button) => button.form.querySelector('[name="fulfillmentPath"]:checked')?.value ?? null }
    ],
    rejectClose: false
  });
}

async function confirmSimplePath(path) {
  const details = SIMPLE_PATHS[path];
  if (!details) return null;
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Moment of Fulfillment — ${details.title}` },
    classes: ["litm-qol-system-dialog", "litm-qol-moment-window"],
    content: `<div class="litm-qol-moment-dialog litm-qol-moment-explanation"><h3>${details.title}</h3>${details.paragraphs.map(paragraph => `<p>${paragraph}</p>`).join("")}<p><strong>Confirming completes this Moment of Fulfillment and spends 5 Promise.</strong></p></div>`,
    buttons: [
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", class: "litm-qol-moment-footer-button", callback: () => null },
      { action: "back", label: "Back", icon: "fa-solid fa-arrow-left", class: "litm-qol-moment-footer-button", callback: () => "back" },
      { action: "confirm", label: "Confirm", icon: "fa-solid fa-check", class: "litm-qol-improve-primary", default: true, callback: () => "confirm" }
    ],
    rejectClose: false
  });
}

function activeTag(tag) {
  return Boolean(String(tag?.name ?? "").trim()) && !tag.planned;
}

function themeLabel(theme) {
  const title = (theme.system.powertags ?? []).find(activeTag)?.name;
  return title ? `${theme.name} – ${title}` : theme.name;
}

function reforgeBenefits(actor) {
  const themes = actor.items.filter(item => item.type === "themebook" && !item.system.options?.isStoryTheme);
  const breakdown = themes.map(theme => {
    const powers = (theme.system.powertags ?? []).filter(activeTag).length;
    const weaknesses = (theme.system.weaknesstags ?? []).filter(activeTag).length;
    const specials = (theme.system.specialImprovements ?? []).filter(improvement => improvement.active).length;
    const extraPowers = Math.max(0, powers - 3);
    const extraWeaknesses = Math.max(0, weaknesses - 1);
    return { theme, extraPowers, extraWeaknesses, specials, total: extraPowers + extraWeaknesses + specials };
  });
  const earned = breakdown.reduce((total, entry) => total + entry.total, 0);
  const existing = Math.max(0, Number(actor.getFlag(MODULE_ID, REFORGED_IMPROVEMENTS_FLAG) ?? 0));
  return { themes, breakdown, earned, existing, total: earned + existing };
}

async function confirmReforged(actor, benefits) {
  const queued = storedPromise(actor);
  const promiseAfter = Math.min(5, queued);
  const overflowAfter = Math.max(0, queued - promiseAfter);
  const quintessences = actor.items.filter(item => item.type === "quintessence");
  const rows = benefits.breakdown.map(entry => `<li><strong>${foundry.utils.escapeHTML(themeLabel(entry.theme))}</strong>: ${entry.total} free ${entry.total === 1 ? "improvement" : "improvements"} (${entry.extraPowers} from power tags, ${entry.extraWeaknesses} from weaknesses, ${entry.specials} from Special Improvements)</li>`).join("");
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Moment of Fulfillment — Be Reforged" },
    classes: ["litm-qol-system-dialog", "litm-qol-moment-window"],
    position: { width: 650, height: 720 },
    content: `<div class="litm-qol-moment-dialog litm-qol-reforged-summary">
      <h3>Be Reforged</h3>
      <p>Your Hero becomes something completely new. All four themes will be replaced together using the Hero Creator.</p>
      <p>The reforged Hero retains all Promise remaining <em>after</em> this Moment of Fulfillment and all Quintessences.</p>
      <p>See Be Reforged, Core Book Vol. I, page 194.</p>
      <fieldset><legend>Inherited free improvements</legend><ul>${rows || "<li>No eligible old themes were found.</li>"}</ul><p><strong>${benefits.total} total ${benefits.total === 1 ? "improvement" : "improvements"} will be available after reforging.</strong></p></fieldset>
      <ul>
        <li>Promise after this Moment of Fulfillment: <strong>${promiseAfter}</strong>${overflowAfter ? `, with ${overflowAfter} stored` : ""}</li>
        <li>Quintessences retained: <strong>${quintessences.length}</strong></li>
      </ul>
      <p><strong>No changes occur until all four new themes are ready and you confirm the Hero Creator.</strong></p>
    </div>`,
    buttons: [
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", class: "litm-qol-moment-footer-button", callback: () => null },
      { action: "back", label: "Back", icon: "fa-solid fa-arrow-left", class: "litm-qol-moment-footer-button", callback: () => "back" },
      { action: "continue", label: "Create New Hero", icon: "fa-solid fa-wand-magic-sparkles", class: "litm-qol-improve-primary", default: true, callback: () => "confirm" }
    ],
    rejectClose: false
  });
}

async function chooseRetirementDetails(actor) {
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Moment of Fulfillment — Arrive at Journey’s End" },
    classes: ["litm-qol-system-dialog", "litm-qol-moment-window"],
    position: { width: 650, height: 760 },
    content: `<div class="litm-qol-moment-dialog litm-qol-retirement-dialog">
      <h3>Arrive at Journey’s End</h3>
      <p><strong>${foundry.utils.escapeHTML(actor.name)}</strong> retires from adventuring and establishes a safe haven for the Fellowship. See Core Book Vol. I, page 193.</p>
      <fieldset><legend>The new home</legend>
        <label><strong>Place</strong><input type="text" name="retirementPlace" autocomplete="off" placeholder="Where does the Hero retire?"></label>
        <label><strong>New life</strong><textarea name="retirementLife" rows="5" placeholder="Describe their life, influence, followers, riches, secrets, or community."></textarea></label>
      </fieldset>
      <fieldset><legend>Safe-haven benefit</legend>
        <label class="litm-qol-moment-choice"><input type="checkbox" name="retirementBenefit" value="tag"><span><strong>Permanent story tag</strong><small>Define the haven’s greatest advantage as a lasting tag for relevant camping and sojourn actions.</small></span></label>
        <input type="text" name="retirementTag" autocomplete="off" placeholder="Permanent story tag">
        <label class="litm-qol-moment-choice"><input type="checkbox" name="retirementBenefit" value="period"><span><strong>A third period without Consequences</strong><small>Choose the haven’s alternative camping or sojourn benefit.</small></span></label>
      </fieldset>
      <p><strong>Confirming retires this Hero and spends 5 Promise.</strong></p>
    </div>`,
    render: (_event, dialog) => {
      const root = dialog.element;
      const boxes = [...root.querySelectorAll('[name="retirementBenefit"]')];
      const place = root.querySelector('[name="retirementPlace"]');
      const life = root.querySelector('[name="retirementLife"]');
      const tag = root.querySelector('[name="retirementTag"]');
      const update = () => {
        const selected = boxes.find(box => box.checked);
        tag.disabled = selected?.value !== "tag";
        const valid = place.value.trim() && life.value.trim() && selected && (selected.value !== "tag" || tag.value.trim());
        const confirm = root.querySelector('[data-action="confirm"]');
        if (confirm) confirm.disabled = !valid;
      };
      for (const box of boxes) box.addEventListener("change", () => {
        if (box.checked) for (const other of boxes) if (other !== box) other.checked = false;
        update();
      });
      for (const input of [place, life, tag]) input.addEventListener("input", update);
      update();
    },
    buttons: [
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", class: "litm-qol-moment-footer-button", callback: () => null },
      { action: "back", label: "Back", icon: "fa-solid fa-arrow-left", class: "litm-qol-moment-footer-button", callback: () => ({ navigation: "back" }) },
      { action: "confirm", label: "Retire Hero", icon: "fa-solid fa-house", class: "litm-qol-improve-primary", default: true, callback: (_event, button) => ({
        place: button.form.elements.retirementPlace.value.trim(),
        life: button.form.elements.retirementLife.value.trim(),
        benefit: button.form.querySelector('[name="retirementBenefit"]:checked')?.value,
        tag: button.form.elements.retirementTag.value.trim()
      }) }
    ],
    rejectClose: false
  });
}

async function chooseRetirementReplacement(actor, benefits) {
  const parityPromise = Number(actor.system.promises ?? 0) + storedPromise(actor);
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Journey’s End — Replacement Hero" },
    classes: ["litm-qol-system-dialog", "litm-qol-moment-window"],
    content: `<div class="litm-qol-moment-dialog"><h3>Create a Replacement Hero?</h3><p>The retirement is complete. You may create a replacement Hero now or finish without one.</p><div class="litm-qol-retirement-replacement-options">
      <p><strong>From Scratch:</strong> create an ordinary new Hero with four themes.</p>
      <p><strong>Keep Parity:</strong> with Narrator approval, create a new Hero with <strong>${benefits.total} free ${benefits.total === 1 ? "improvement" : "improvements"}</strong> and the retired Hero’s current <strong>${parityPromise} Promise</strong>.</p>
    </div></div>`,
    buttons: [
      { action: "none", label: "No Replacement", icon: "fa-solid fa-check", class: "litm-qol-moment-footer-button", callback: () => "none" },
      { action: "scratch", label: "New Hero from Scratch", icon: "fa-solid fa-user-plus", class: "litm-qol-moment-footer-button", callback: () => "scratch" },
      { action: "parity", label: "New Hero with Parity", icon: "fa-solid fa-scale-balanced", class: "litm-qol-improve-primary", default: true, callback: () => "parity" }
    ],
    rejectClose: false
  });
}

function retirementNotes(existingNotes, details) {
  const text = value => foundry.utils.escapeHTML(String(value ?? "")).replaceAll("\n", "<br>");
  const benefit = details.benefit === "tag"
    ? `<p><strong>Permanent safe-haven story tag:</strong> ${text(details.tag)}. Apply its special permanence and burn rules during relevant camping and sojourn actions (Core Book Vol. I, page 193).</p>`
    : "<p><strong>Safe-haven benefit:</strong> The Fellowship receives the special third-period option when camping or sojourning here (Core Book Vol. I, page 193).</p>";
  const entry = `<hr><h2>Arrive at Journey’s End</h2><p><strong>Retirement haven:</strong> ${text(details.place)}</p><p><strong>New life:</strong><br>${text(details.life)}</p>${benefit}`;
  const existing = String(existingNotes ?? "");
  return existing.trim() ? `${existing}\n${entry}` : entry;
}

async function completeRetirement(actor, details) {
  const previous = actor.getFlag(MODULE_ID, RETIREMENT_FLAG);
  const previousEditMode = actor.system.editMode;
  const previousNotes = String(actor.system.notes ?? "");
  await actor.update({
    "system.notes": retirementNotes(previousNotes, details),
    "system.editMode": false,
    [`flags.${MODULE_ID}.${RETIREMENT_FLAG}`]: { ...details, retiredAt: new Date().toISOString() }
  });
  try {
    const promise = await completeMomentOfFulfillment(actor);
    if (!promise) throw new Error("Promise could not be spent for Arrive at Journey’s End.");
    return promise;
  } catch (error) {
    await restoreFlag(actor, RETIREMENT_FLAG, previous);
    await actor.update({ "system.editMode": previousEditMode, "system.notes": previousNotes });
    throw error;
  }
}

async function finalizeParityHero(retiredActor, draft, benefits) {
  const overflow = storedPromise(retiredActor);
  try {
    await draft.update({
      "system.promises": Number(retiredActor.system.promises ?? 0),
      "system.editMode": false,
      [`flags.${MODULE_ID}.promiseOverflow`]: overflow,
      [`flags.${MODULE_ID}.${REFORGED_IMPROVEMENTS_FLAG}`]: benefits.total
    });
    if (!overflow) await draft.unsetFlag(MODULE_ID, "promiseOverflow");
    if (!benefits.total) await draft.unsetFlag(MODULE_ID, REFORGED_IMPROVEMENTS_FLAG);
    await draft.unsetFlag(MODULE_ID, "heroCreatorDraft");
    draft.sheet?.render(true);
    return draft;
  } catch (error) {
    if (game.actors.get(draft.id)) await draft.delete();
    throw error;
  }
}

function embeddedItemData(item) {
  const data = foundry.utils.deepClone(item.toObject());
  delete data._id;
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  delete data._stats;
  return data;
}

async function restoreFlag(actor, key, value) {
  if (value == null) await actor.unsetFlag(MODULE_ID, key);
  else await actor.setFlag(MODULE_ID, key, value);
}

async function commitReforged(actor, draft, benefits) {
  const oldThemes = actor.items.filter(item => item.type === "themebook");
  const oldThemeData = oldThemes.map(item => {
    const data = foundry.utils.deepClone(item.toObject());
    delete data._stats;
    delete data.folder;
    delete data.ownership;
    return data;
  });
  const newThemeData = draft.items.filter(item => item.type === "themebook").map(embeddedItemData);
  if (newThemeData.length !== 4) throw new Error(`Be Reforged expected 4 new themes, but found ${newThemeData.length}.`);

  const snapshot = {
    name: actor.name,
    editMode: actor.system.editMode,
    cardLayout: foundry.utils.deepClone(actor.system.cardLayout ?? []),
    promises: Number(actor.system.promises ?? 0),
    promiseOverflow: actor.getFlag(MODULE_ID, "promiseOverflow"),
    freeImprovements: actor.getFlag(MODULE_ID, REFORGED_IMPROVEMENTS_FLAG)
  };
  let created = [];
  try {
    if (oldThemes.length) await actor.deleteEmbeddedDocuments("Item", oldThemes.map(theme => theme.id));
    created = await actor.createEmbeddedDocuments("Item", newThemeData);
    const singletonLayout = snapshot.cardLayout.filter(entry => !String(entry.key ?? "").startsWith("themebook:"));
    await actor.update({
      name: draft.name,
      "system.editMode": false,
      "system.cardLayout": [...created.map(theme => ({ key: `themebook:${theme.id}`, tab: "main" })), ...singletonLayout],
      [`flags.${MODULE_ID}.${REFORGED_IMPROVEMENTS_FLAG}`]: benefits.total
    });
    const promise = await completeMomentOfFulfillment(actor);
    if (!promise) throw new Error("Promise could not be spent for Be Reforged.");
    if (!benefits.total) await actor.unsetFlag(MODULE_ID, REFORGED_IMPROVEMENTS_FLAG);
    return { promise, created };
  } catch (error) {
    if (created.length) await actor.deleteEmbeddedDocuments("Item", created.map(theme => theme.id));
    if (oldThemeData.length) await actor.createEmbeddedDocuments("Item", oldThemeData, { keepId: true });
    await actor.update({
      name: snapshot.name,
      "system.editMode": snapshot.editMode,
      "system.cardLayout": snapshot.cardLayout,
      "system.promises": snapshot.promises
    });
    await restoreFlag(actor, "promiseOverflow", snapshot.promiseOverflow);
    await restoreFlag(actor, REFORGED_IMPROVEMENTS_FLAG, snapshot.freeImprovements);
    throw error;
  }
}

async function chooseQuintessence(saved = {}) {
  const worldItems = game.items.filter(item => item.type === "quintessence").sort((a, b) => a.name.localeCompare(b.name));
  const rows = worldItems.map(item => `
    <label class="litm-qol-moment-choice">
      <input type="checkbox" name="quintessenceChoice" value="world:${item.id}" ${saved.mode === "world" && saved.id === item.id ? "checked" : ""}>
      <span><strong>${foundry.utils.escapeHTML(item.name)}</strong>${item.system.description ? `<small>${foundry.utils.escapeHTML(plainText(item.system.description))}</small>` : ""}</span>
    </label>`).join("");
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Moment of Fulfillment — Gain a Quintessence" },
    classes: ["litm-qol-system-dialog", "litm-qol-moment-window"],
    content: `<div class="litm-qol-moment-dialog litm-qol-quintessence-dialog"><p>Choose a Quintessence from the world, or create a new one. See Core Book Vol. I, page 194.</p><div class="litm-qol-moment-choice-list litm-qol-quintessence-list">${rows || '<p class="notes">No world Quintessences are available.</p>'}<label class="litm-qol-moment-choice"><input type="checkbox" name="quintessenceChoice" value="create" ${saved.mode === "create" ? "checked" : ""}><span><strong>Create a new Quintessence</strong></span></label></div><div class="litm-qol-quintessence-create"><label><strong>Name</strong><input type="text" name="quintessenceName" value="${escapeAttribute(saved.name)}" autocomplete="off"></label><label><strong>Description</strong><textarea name="quintessenceDescription" rows="4">${foundry.utils.escapeHTML(saved.description ?? "")}</textarea></label></div></div>`,
    render: (_event, dialog) => {
      const root = dialog.element;
      const boxes = [...root.querySelectorAll('[name="quintessenceChoice"]')];
      const name = root.querySelector('[name="quintessenceName"]');
      const description = root.querySelector('[name="quintessenceDescription"]');
      const update = () => {
        const selected = boxes.find(box => box.checked);
        const creating = selected?.value === "create";
        name.disabled = !creating;
        description.disabled = !creating;
        const next = root.closest(".application")?.querySelector('[data-action="next"]') ?? root.querySelector('[data-action="next"]');
        if (next) next.disabled = !selected || (creating && !name.value.trim());
      };
      for (const box of boxes) box.addEventListener("change", () => {
        if (box.checked) for (const other of boxes) if (other !== box) other.checked = false;
        update();
      });
      name.addEventListener("input", update);
      update();
    },
    buttons: [
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", class: "litm-qol-moment-footer-button", callback: () => null },
      { action: "back", label: "Back", icon: "fa-solid fa-arrow-left", class: "litm-qol-moment-footer-button", callback: () => ({ navigation: "back" }) },
      { action: "next", label: "Next", icon: "fa-solid fa-arrow-right", class: "litm-qol-improve-primary", default: true, callback: (_event, button) => {
        const selected = button.form.querySelector('[name="quintessenceChoice"]:checked')?.value;
        if (!selected) return null;
        if (selected === "create") return { mode: "create", name: button.form.elements.quintessenceName.value.trim(), description: button.form.elements.quintessenceDescription.value.trim() };
        return { mode: "world", id: selected.slice(6) };
      } }
    ],
    rejectClose: false
  });
}

function quintessenceData(choice) {
  if (choice?.mode === "create") return { name: choice.name, type: "quintessence", system: { description: choice.description ?? "" } };
  const source = choice?.mode === "world" ? game.items.get(choice.id) : null;
  if (!source || source.type !== "quintessence") return null;
  const data = source.toObject();
  delete data._id;
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  return data;
}

async function confirmQuintessence(choice) {
  const data = quintessenceData(choice);
  if (!data) return null;
  const description = data.system?.description
    ? await TextEditor.enrichHTML(String(data.system.description), { async: true })
    : "";
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Moment of Fulfillment — Confirm Quintessence" },
    classes: ["litm-qol-system-dialog", "litm-qol-moment-window"],
    content: `<div class="litm-qol-moment-dialog litm-qol-moment-explanation"><h3>Gain a Quintessence</h3><p>You will gain <strong>${foundry.utils.escapeHTML(data.name)}</strong>.</p>${description ? `<div class="litm-qol-quintessence-description">${description}</div>` : ""}<p><strong>Confirming completes this Moment of Fulfillment and spends 5 Promise.</strong></p></div>`,
    buttons: [
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", class: "litm-qol-moment-footer-button", callback: () => null },
      { action: "back", label: "Back", icon: "fa-solid fa-arrow-left", class: "litm-qol-moment-footer-button", callback: () => "back" },
      { action: "confirm", label: "Confirm", icon: "fa-solid fa-check", class: "litm-qol-improve-primary", default: true, callback: () => ({ confirmed: true, data }) }
    ],
    rejectClose: false
  });
}

async function sendFulfillmentSummary(actor, details, promise, extra = "") {
  const gmIds = game.users.filter(user => user.isGM).map(user => user.id);
  if (!gmIds.length) return;
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: gmIds,
    content: `<div class="litm-qol-improve-chat-summary"><h3><i class="fa-solid fa-sun"></i> Moment of Fulfillment</h3><p><strong>${foundry.utils.escapeHTML(actor.name)}</strong> fulfilled their Promise through <strong>${foundry.utils.escapeHTML(details.title)}</strong>.</p>${extra}<p>5 Promise spent. Promise is now <strong>${promise.after}</strong>${promise.overflowAfter ? `, with ${promise.overflowAfter} additional Promise still stored` : ""}.</p></div>`
  });
}

async function beginMomentOfFulfillment(actor) {
  if (Number(actor.system?.promises ?? 0) < 5) return;
  let quintessenceChoice = null;
  while (true) {
    const path = await chooseFulfillmentPath(actor);
    if (!path) return;
    const details = SIMPLE_PATHS[path];
    if (path === "retirement") {
      const benefits = reforgeBenefits(actor);
      const retirement = await chooseRetirementDetails(actor);
      if (retirement?.navigation === "back") continue;
      if (!retirement) return;
      if (Number(actor.system?.promises ?? 0) < 5) {
        ui.notifications.warn("This Hero no longer has enough Promise for a Moment of Fulfillment.");
        return;
      }
      const promise = await completeRetirement(actor, retirement);
      const benefitText = retirement.benefit === "tag"
        ? `Permanent safe-haven story tag: <strong>${foundry.utils.escapeHTML(retirement.tag)}</strong>.`
        : "The Fellowship may always take a third period without Consequences when camping or sojourning here.";
      try {
        await sendFulfillmentSummary(actor, { title: "Arrive at Journey’s End" }, promise,
          `<p><strong>${foundry.utils.escapeHTML(actor.name)}</strong> retired to <strong>${foundry.utils.escapeHTML(retirement.place)}</strong>.</p><p>${foundry.utils.escapeHTML(retirement.life)}</p><p>${benefitText}</p>`);
      } catch (summaryError) {
        console.error(`${MODULE_ID} | Journey’s End completed, but its GM summary failed.`, summaryError);
        ui.notifications.warn("The Hero retired, but the GM chat summary could not be sent.");
      }
      ui.notifications.info(`${actor.name} arrived at Journey’s End. Promise is now ${promise.after}.`);

      const replacement = await chooseRetirementReplacement(actor, benefits);
      if (replacement === "scratch") {
        await runHeroCreator();
      } else if (replacement === "parity") {
        const draft = await runHeroCreator({ parityActor: actor });
        if (draft) {
          const replacementActor = await finalizeParityHero(actor, draft, benefits);
          const replacementPromise = Number(replacementActor.system.promises ?? 0) + storedPromise(replacementActor);
          ui.notifications.info(`${replacementActor.name} was created with ${benefits.total} free ${benefits.total === 1 ? "improvement" : "improvements"} and ${replacementPromise} Promise.`);
        }
      }
      return;
    }
    if (path === "reforged") {
      const benefits = reforgeBenefits(actor);
      const confirmation = await confirmReforged(actor, benefits);
      if (confirmation === "back") continue;
      if (confirmation !== "confirm") return;
      const draft = await runHeroCreator({ reforgeActor: actor });
      if (!draft) return;
      try {
        if (Number(actor.system?.promises ?? 0) < 5) {
          ui.notifications.warn("This Hero no longer has enough Promise for a Moment of Fulfillment.");
          return;
        }
        const oldName = actor.name;
        const result = await commitReforged(actor, draft, benefits);
        try {
          const quintessences = actor.items.filter(item => item.type === "quintessence").length;
          await sendFulfillmentSummary(actor, { title: "Be Reforged" }, result.promise,
            `<p><strong>${foundry.utils.escapeHTML(oldName)}</strong> became <strong>${foundry.utils.escapeHTML(actor.name)}</strong>.</p><p>All themes were replaced. <strong>${benefits.total}</strong> inherited free ${benefits.total === 1 ? "improvement is" : "improvements are"} available across the new themes. ${quintessences} ${quintessences === 1 ? "Quintessence was" : "Quintessences were"} retained.</p>`);
        } catch (summaryError) {
          console.error(`${MODULE_ID} | Be Reforged completed, but its GM summary failed.`, summaryError);
          ui.notifications.warn("The Hero was reforged, but the GM chat summary could not be sent.");
        }
        actor.sheet?.render(true);
        ui.notifications.info(`${actor.name} was reforged with ${benefits.total} free ${benefits.total === 1 ? "improvement" : "improvements"}.`);
        return;
      } finally {
        if (game.actors.get(draft.id)) await draft.delete();
      }
    }
    if (path === "quintessence") {
      while (true) {
        const choice = await chooseQuintessence(quintessenceChoice ?? {});
        if (!choice) return;
        if (choice.navigation === "back") break;
        quintessenceChoice = choice;
        const confirmation = await confirmQuintessence(choice);
        if (confirmation === "back") continue;
        if (!confirmation?.confirmed) return;
        if (Number(actor.system?.promises ?? 0) < 5) {
          ui.notifications.warn("This Hero no longer has enough Promise for a Moment of Fulfillment.");
          return;
        }
        const [created] = await actor.createEmbeddedDocuments("Item", [confirmation.data]);
        let promise;
        try {
          promise = await completeMomentOfFulfillment(actor);
        } catch (error) {
          if (created) await actor.deleteEmbeddedDocuments("Item", [created.id]);
          throw error;
        }
        if (!promise) {
          if (created) await actor.deleteEmbeddedDocuments("Item", [created.id]);
          return;
        }
        try {
          await sendFulfillmentSummary(actor, { title: "Gain a Quintessence" }, promise, `<p>Gained Quintessence: <strong>${foundry.utils.escapeHTML(created.name)}</strong>.</p>`);
        } catch (error) {
          console.error(`${MODULE_ID} | Quintessence fulfillment completed, but its GM summary failed.`, error);
          ui.notifications.warn("The Quintessence was gained, but its GM chat summary could not be sent.");
        }
        ui.notifications.info(`${created.name} added. Promise is now ${promise.after}.`);
        return;
      }
      continue;
    }
    if (!details) {
      const label = OPTIONS.find(option => option[0] === path)?.[1] ?? "That path";
      ui.notifications.info(`${label} is selected. Its workflow steps will be added next; no Promise was spent.`);
      return;
    }
    const confirmation = await confirmSimplePath(path);
    if (confirmation === "back") continue;
    if (confirmation !== "confirm") return;
    const promise = await completeMomentOfFulfillment(actor);
    if (!promise) return;
    try {
      await sendFulfillmentSummary(actor, details, promise);
    } catch (error) {
      console.error(`${MODULE_ID} | Moment of Fulfillment completed, but its GM summary failed.`, error);
      ui.notifications.warn("The Moment of Fulfillment completed, but its GM chat summary could not be sent.");
    }
    ui.notifications.info(`${details.title} completed. Promise is now ${promise.after}.`);
    return;
  }
}

function renderMomentButton(app, html) {
  const actor = actorFromApp(app);
  const root = rootElement(html);
  if (!actor || !root || !["character", "litm-character"].includes(actor.type) || (!actor.isOwner && !game.user.isGM)) return;
  if (actor.getFlag(MODULE_ID, RETIREMENT_FLAG)) return;
  for (const tracker of root.querySelectorAll(".fellowship-promises-container")) {
    if (!tracker.dataset.litmQolOverflowBound) {
      tracker.dataset.litmQolOverflowBound = "true";
      tracker.addEventListener("click", event => {
        if (Number(actor.system?.promises ?? 0) < 5) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void awardPromise(actor, 1).then(() => ui.notifications.info("1 Promise stored for after the Moment of Fulfillment."));
      }, true);
    }
    if (Number(actor.system?.promises ?? 0) < 5 || tracker.parentElement?.querySelector(".litm-qol-moment-button")) continue;
    const queued = storedPromise(actor);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "litm-qol-moment-button";
    button.innerHTML = '<i class="fa-solid fa-sun"></i> Moment of Fulfillment';
    button.dataset.tooltip = queued ? `${queued} additional Promise will be applied after the Moment of Fulfillment.` : "Spend 5 Promise on a Moment of Fulfillment.";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      void beginMomentOfFulfillment(actor).catch(error => {
        console.error(`${MODULE_ID} | Moment of Fulfillment failed.`, error);
        ui.notifications.error("The Moment of Fulfillment could not be completed. Check the console for details.");
      });
    });
    tracker.insertAdjacentElement("afterend", button);
  }
}

Hooks.on("renderActorSheet", renderMomentButton);
Hooks.on("renderApplicationV2", (app, html) => { if (actorFromApp(app)) renderMomentButton(app, html); });

export { beginMomentOfFulfillment };
