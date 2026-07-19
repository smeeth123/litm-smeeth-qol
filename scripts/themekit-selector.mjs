const MODULE_ID = "litm-smeeth-qol";
const PATCH_FLAG = Symbol.for(`${MODULE_ID}.themekitSelectorPatched`);

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "&#10;");
}

async function getThemekits() {
  const themekits = [...game.items.filter(item => item.type === "themekit")];
  for (const pack of game.packs) {
    if (pack.documentName !== "Item") continue;
    const documents = await pack.getDocuments();
    themekits.push(...documents.filter(item => item.type === "themekit"));
  }
  const unique = new Map(themekits.map(item => [item.uuid, item]));
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function typeDetails(type) {
  return {
    "litm-origin": { label: "Origin", order: 0 },
    "litm-adventure": { label: "Adventure", order: 1 },
    "litm-greatness": { label: "Greatness", order: 2 },
    "litm-variable": { label: "Variable", order: 3 }
  }[type] ?? { label: "Other", order: 4 };
}

function searchableText(item) {
  return [item.name, item.system.themekit_type, item.system.description, item.system.quest, item.system.story,
    ...(item.system.powertags ?? []).map(tag => `${tag.question ?? ""} ${tag.name ?? ""}`),
    ...(item.system.weaknesstags ?? []).map(tag => `${tag.question ?? ""} ${tag.name ?? ""}`),
    ...(item.system.specialImprovements ?? []).map(improvement => `${improvement.name ?? ""} ${improvement.description ?? ""}`)]
    .join(" ").toLowerCase();
}

function selectorContent(themekits) {
  const grouped = new Map();
  for (const item of themekits) {
    const details = typeDetails(item.system.themebook_type);
    if (!grouped.has(details.label)) grouped.set(details.label, { ...details, subcategories: new Map() });
    const subcategory = String(item.system.themekit_type ?? "").trim() || "Uncategorized";
    const subcategories = grouped.get(details.label).subcategories;
    if (!subcategories.has(subcategory)) subcategories.set(subcategory, []);
    subcategories.get(subcategory).push(item);
  }

  const groups = [...grouped.values()].sort((a, b) => a.order - b.order).map(group => {
    const subgroups = [...group.subcategories.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([subcategory, items]) => {
      const rows = items.map(item => `
        <li class="litm-qol-themebook-source" data-search="${escapeAttribute(searchableText(item))}">
          <i class="fa-solid ${item.pack ? "fa-book" : "fa-globe"} source-icon" title="${item.pack ? "Compendium" : "World"}"></i>
          <label>
            <input type="checkbox" name="themekitUuid" value="${escapeAttribute(item.uuid)}">
            <span>${foundry.utils.escapeHTML(item.name)}</span>
          </label>
        </li>`).join("");
      return `<div class="litm-qol-themekit-subgroup"><div class="subgroup-header">${foundry.utils.escapeHTML(subcategory)}</div><ul>${rows}</ul></div>`;
    }).join("");
    return `<div class="litm-qol-themebook-group litm-qol-themekit-type-group"><div class="group-header">${group.label}</div>${subgroups}</div>`;
  }).join("");

  const previews = themekits.map(item => {
    const powers = (item.system.powertags ?? []).filter(tag => String(tag.name || tag.question || "").trim())
      .map(tag => `<mark class="tag positive">${foundry.utils.escapeHTML(tag.name || tag.question)}</mark>`).join(" ");
    const weaknesses = (item.system.weaknesstags ?? []).filter(tag => String(tag.name || tag.question || "").trim())
      .map(tag => `<mark class="tag weakness">${foundry.utils.escapeHTML(tag.name || tag.question)}</mark>`).join(" ");
    const improvements = (item.system.specialImprovements ?? []).filter(improvement => String(improvement.name ?? "").trim())
      .map(improvement => `<li><strong>${foundry.utils.escapeHTML(improvement.name)}</strong>${improvement.description ? `: ${foundry.utils.escapeHTML(improvement.description)}` : ""}</li>`).join("");
    return `
      <div class="litm-qol-themebook-preview" data-themekit-preview="${escapeAttribute(item.uuid)}" hidden>
        <h2>${foundry.utils.escapeHTML(item.name)}</h2>
        ${item.system.description ? `<p>${foundry.utils.escapeHTML(item.system.description)}</p>` : ""}
        <h3 class="with-line">Power Tags</h3>
        <div class="tag-container">${powers || "<p>No power tags.</p>"}</div>
        <h3 class="with-line">Weakness Tags</h3>
        <div class="tag-container">${weaknesses || "<p>No weakness tags.</p>"}</div>
        <h3 class="with-line">Quest</h3>
        <p>${foundry.utils.escapeHTML(item.system.quest || "No quest provided.")}</p>
        ${item.system.story ? `<h3 class="with-line">Story</h3><p>${foundry.utils.escapeHTML(item.system.story)}</p>` : ""}
        ${improvements ? `<h3 class="with-line">Special Improvements</h3><ul>${improvements}</ul>` : ""}
      </div>`;
  }).join("");

  return `
    <div class="litm-qol-themebook-selector litm-qol-themekit-selector">
      <div class="left-panel">
        <input type="search" class="themekit-search" name="themekitSearch" placeholder="Search themekits...">
        <div class="litm-qol-themebook-source-list">${groups}</div>
      </div>
      <div class="right-panel">
        <div class="litm-qol-themebook-preview-placeholder">Select a Themekit to preview it.</div>
        ${previews}
      </div>
    </div>`;
}

async function chooseThemekit(themekits, assigning) {
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Themekit Selection" },
    classes: ["litm-qol-system-dialog", "litm-qol-replace-theme-window", "litm-qol-themebook-selector-window"],
    position: { width: 900, height: 650 },
    content: selectorContent(themekits),
    render: (_event, dialog) => {
      const root = dialog.element;
      const boxes = [...root.querySelectorAll('input[type="checkbox"][name="themekitUuid"]')];
      const refresh = choice => {
        const confirm = root.querySelector('button[data-action="select"]');
        if (confirm) confirm.disabled = !choice;
        root.querySelector(".litm-qol-themebook-preview-placeholder").hidden = Boolean(choice);
        for (const preview of root.querySelectorAll("[data-themekit-preview]")) {
          preview.hidden = preview.dataset.themekitPreview !== choice?.value;
        }
      };
      for (const box of boxes) {
        box.addEventListener("change", () => {
          if (box.checked) for (const other of boxes) if (other !== box) other.checked = false;
          refresh(box.checked ? box : null);
        });
      }
      refresh(null);
      root.querySelector('[name="themekitSearch"]').addEventListener("input", event => {
        const query = event.currentTarget.value.trim().toLowerCase();
        for (const row of root.querySelectorAll(".litm-qol-themebook-source")) {
          row.hidden = Boolean(query) && !row.dataset.search.includes(query);
        }
        for (const subgroup of root.querySelectorAll(".litm-qol-themekit-subgroup")) {
          subgroup.hidden = ![...subgroup.querySelectorAll(".litm-qol-themebook-source")].some(row => !row.hidden);
        }
        for (const group of root.querySelectorAll(".litm-qol-themebook-group")) {
          group.hidden = ![...group.querySelectorAll(".litm-qol-themebook-source")].some(row => !row.hidden);
        }
      });
    },
    buttons: [
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", callback: () => null },
      {
        action: "select",
        label: assigning ? "Assign Themekit" : "Add Themekit",
        icon: "fa-solid fa-check",
        class: "litm-qol-replace-primary",
        default: true,
        disabled: true,
        callback: (_event, button) => button.form?.querySelector('input[name="themekitUuid"]:checked')?.value ?? null
      }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return fromUuid(result);
}

async function applyThemekit(actor, actorThemebook, themekit) {
  const { ThemeKitAdapter } = await import("/systems/mist-engine-fvtt/module/lib/themekit-adapter.mjs");
  const adapter = new ThemeKitAdapter();
  if (!actorThemebook) {
    await adapter.importThemekitToCharacter(actor, themekit);
    return;
  }

  await actorThemebook.update({ "system.themeKitUUID": themekit.uuid });
  ui.notifications.notify(game.i18n.format("MIST_ENGINE.NOTIFICATIONS.AssignedThemekit", {
    themekitName: themekit.name,
    characterName: actor.name
  }));
  const empty = !(actorThemebook.system.powertags?.length) && !(actorThemebook.system.weaknesstags?.length);
  if (empty) await adapter.populateThemekitForThemebook(actor, actorThemebook, themekit);
  else await adapter.mergeThemekitForThemebook(actor, actorThemebook, themekit);
}

export async function openQolThemekitSelector(actor, actorThemebook = null) {
  if (!actor) {
    ui.notifications.warn("No character is available for Themekit selection.");
    return null;
  }
  const themekits = await getThemekits();
  if (!themekits.length) {
    ui.notifications.warn("No Themekits are available in the world or compendiums.");
    return null;
  }
  const selected = await chooseThemekit(themekits, Boolean(actorThemebook));
  if (!selected) return null;
  await applyThemekit(actor, actorThemebook, selected);
  return selected;
}

async function patchNativeSelector() {
  const { ThemekitSelectionApp } = await import("/systems/mist-engine-fvtt/module/apps/themekit-selection-app.mjs");
  if (ThemekitSelectionApp.prototype[PATCH_FLAG]) return;
  Object.defineProperty(ThemekitSelectionApp.prototype, PATCH_FLAG, { value: true });
  ThemekitSelectionApp.prototype.render = function renderQolThemekitSelector() {
    if (this._litmQolSelectorOpening) return this;
    this._litmQolSelectorOpening = true;
    openQolThemekitSelector(this.actor, this.actorThemebook).catch(error => {
      console.error(`${MODULE_ID} | Themekit selector failed.`, error);
      ui.notifications.error("The Themekit selector could not be opened.");
    }).finally(() => { this._litmQolSelectorOpening = false; });
    return this;
  };
}

Hooks.once("ready", () => patchNativeSelector().catch(error => {
  console.error(`${MODULE_ID} | Could not replace the native Themekit selector.`, error);
}));
