import { importSystemModule } from "./system-imports.mjs";
const MODULE_ID = "litm-smeeth-qol";
const SETTING = "themeBrowserWorldSources";
const SOURCE_LABELS = { themebook: "Themebooks", quintessence: "Quintessences", [`${MODULE_ID}.trope`]: "Tropes" };
const openBrowsers = new Set();
const TYPES = ["litm-origin", "litm-adventure", "litm-greatness", "litm-variable"];
const TYPE_LABELS = ["Origin", "Adventure", "Greatness", "Variable", "Other"];
const FIELDS = { description: "Description", powertags: "Power Tags", weaknesstags: "Weakness Tags",
  specialImprovements: "Special Improvements", quest: "Quest", story: "Story" };
const esc = value => foundry.utils.escapeHTML(String(value ?? ""));

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING, {
    name: "Theme browser sources", scope: "world", config: false, type: Object, default: {},
    onChange: () => { for (const reload of openBrowsers) void reload(); }
  });
  game.settings.registerMenu(MODULE_ID, "themeBrowserSourcesMenu", {
    name: "Theme Browser Sources", label: "Choose Sources", icon: "fa-solid fa-book-atlas",
    hint: "Choose World Items and compendiums for Themebooks, Quintessences, and Tropes for everyone in this world. Themekits use the system’s source picker.",
    type: ThemeBrowserSourceSettings, restricted: true
  });
});

// Native source changes arrive as Setting documents on every client.
function refreshNativeSources(setting) {
  if (["mist-engine-fvtt.themekitSourcePacks", "mist-engine-fvtt.themekitIncludeWorldItems"].includes(setting.key)) {
    for (const reload of openBrowsers) void reload();
  }
}
Hooks.on("createSetting", refreshNativeSources);
Hooks.on("updateSetting", refreshNativeSources);

function availableSources(type) {
  const kit = type === "themekit";
  const allowed = kit ? game.settings.get("mist-engine-fvtt", "themekitSourcePacks") : [];
  const sources = [];
  if (!kit || game.settings.get("mist-engine-fvtt", "themekitIncludeWorldItems") !== false) {
    sources.push({ id: "world", label: "World Items" });
  }
  const packs = [...game.packs].filter(pack => pack.documentName === "Item" && pack.visible)
    .sort((a, b) => a.metadata.label.localeCompare(b.metadata.label));
  for (const pack of packs) {
    if (Array.isArray(allowed) && allowed.length && !allowed.includes(pack.collection)) continue;
    sources.push({ id: pack.collection, label: `${pack.metadata.label} (${pack.collection})`, pack });
  }
  return sources;
}

export function watchBrowserSources(reload) {
  openBrowsers.add(reload);
  return () => openBrowsers.delete(reload);
}

export function browserSources(type) {
  // Ignore former module Themekit preferences; the native picker is authoritative.
  const saved = type === "themekit" ? undefined : game.settings.get(MODULE_ID, SETTING)?.[type];
  return availableSources(type).filter(source => !Array.isArray(saved) || saved.includes(source.id));
}

export class ThemeBrowserSourceSettings extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "litm-qol-theme-browser-sources", tag: "form", classes: ["litm-qol-source-settings"],
    window: { title: "Theme Browser Sources", resizable: true }, position: { width: 940, height: 620 },
    form: { handler: this.#save, closeOnSubmit: true },
    actions: { sourceSelection: this.#selectSources }
  };

  async _renderHTML() {
    if (!game.user.isGM) throw new Error("Only a GM can configure theme browser sources.");
    const saved = game.settings.get(MODULE_ID, SETTING) ?? {};
    const content = document.createElement("div");
    content.className = "litm-qol-source-settings-content";
    content.innerHTML = `<p>Choose Themebook, Quintessence, and Trope sources for everyone in this world. Each column is independent; selecting none disables its sources. Configure Themekit sources using the system’s source picker in system settings.</p>
      <div class="litm-qol-source-settings-columns">${Object.keys(SOURCE_LABELS).map(type => {
        const sources = availableSources(type);
        return `<fieldset data-source-type="${type}"><legend>${SOURCE_LABELS[type]}</legend>
          <div class="litm-qol-source-actions"><button type="button" data-action="sourceSelection" data-selection="all">All</button><button type="button" data-action="sourceSelection" data-selection="none">None</button></div>
          <div class="litm-qol-source-options">${sources.map(source => `<label><input type="checkbox" name="${type}" value="${esc(source.id)}" ${!Array.isArray(saved[type]) || saved[type].includes(source.id) ? "checked" : ""}><span>${esc(source.label)}</span></label>`).join("") || "<p>No available sources.</p>"}</div></fieldset>`;
      }).join("")}</div>
      <footer class="form-footer"><button type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save Sources</button></footer>`;
    return content;
  }

  _replaceHTML(result, content) { content.replaceChildren(result); }

  static #selectSources(_event, target) {
    for (const box of target.closest("[data-source-type]").querySelectorAll('input[type="checkbox"]')) {
      box.checked = target.dataset.selection === "all";
    }
  }

  static async #save(_event, form) {
    if (!game.user.isGM) throw new Error("Only a GM can configure theme browser sources.");
    const saved = {};
    for (const type of Object.keys(SOURCE_LABELS)) {
      const available = new Set(availableSources(type).map(source => source.id));
      saved[type] = [...form.querySelectorAll(`input[name="${type}"]:checked`)].map(box => box.value).filter(id => available.has(id));
    }
    // Explicit [] means no sources for that type. Themekits are configured natively.
    await game.settings.set(MODULE_ID, SETTING, saved);
  }
}

export async function loadBrowserItems(type) {
  // Re-evaluate world settings and visibility for every load.
  // Query only the needed Item type.
  const sources = browserSources(type);
  const settled = await Promise.allSettled(sources.map(async source => ({ source,
    items: source.id === "world" ? game.items.filter(item => item.type === type) : await source.pack.getDocuments({ type })
  })));
  const items = new Map(); const failed = [];
  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      failed.push(sources[index].label);
      console.error(`${MODULE_ID} | Could not load theme source ${sources[index].id}`, result.reason);
      return;
    }
    for (const item of result.value.items) {
      if (!item.visible || item.type !== type || (type === "themebook" && item.system.options?.isStoryTheme)) continue;
      items.set(item.uuid, { item, source: result.value.source });
    }
  });
  return { entries: [...items.values()].sort((a, b) => a.item.name.localeCompare(b.item.name)), failed, sourceCount: sources.length };
}

export function matchesThemebook(item, themebookName, showAll = false) {
  const book = String(themebookName ?? "").trim().toLowerCase();
  const kitBook = String(item.system.themekit_type ?? "").trim().toLowerCase();
  return !book || showAll || !kitBook || book === kitBook;
}

function plain(value) {
  const element = document.createElement("div"); element.innerHTML = String(value ?? "");
  return element.textContent ?? "";
}

export function matchesBrowserSearch(item, query, fields) {
  query = query.trim().toLowerCase();
  if (!query) return true;
  const system = item.system;
  const values = [item.name];
  for (const field of fields) {
    const value = system[field];
    values.push(Array.isArray(value) ? value.map(row => `${row.name ?? ""} ${row.question ?? ""} ${row.description ?? ""}`).join(" ") : value);
  }
  return values.some(value => plain(value).toLowerCase().includes(query));
}

let richText;
async function enrich(value, item) {
  if (!value) return "";
  richText ??= importSystemModule("lib/tag-status-text-helper.mjs");
  const { enrichTextWithTags } = await richText;
  return enrichTextWithTags(String(value), item);
}

export async function browserPreview(item, source, type) {
  const system = item.system;
  const questions = type === "themebook";
  const tags = (rows, weakness) => (rows ?? []).filter(tag => String(tag.name || tag.question || "").trim()).map(tag =>
    questions ? `<li>${esc(tag.question || tag.name)}</li>` : `<mark class="tag ${weakness ? "weakness" : "positive"}">${esc(tag.name || tag.question)}</mark>`).join(questions ? "" : " ");
  const powers = tags(system.powertags, false); const weaknesses = tags(system.weaknesstags, true);
  const wrap = value => questions ? `<ul class="litm-qol-themebook-question-list">${value}</ul>` : `<div class="tag-container">${value}</div>`;
  const improvements = await Promise.all((system.specialImprovements ?? []).filter(row => String(row.name ?? "").trim()).map(async row =>
    `<li><strong>${esc(row.name)}</strong>${row.description ? `: ${await enrich(row.description, item)}` : ""}</li>`));
  return `<h2>${esc(item.name)}</h2><p class="litm-qol-browser-source">${esc(source.label)}</p>
    ${system.description ? `<section class="litm-qol-themebook-description">${await enrich(system.description, item)}</section>` : ""}
    <h3 class="with-line">${questions ? "Power Tag Questions" : "Power Tags"}</h3>${powers ? wrap(powers) : "<p>No power tags or questions.</p>"}
    <h3 class="with-line">${questions ? "Weakness Tag Questions" : "Weakness Tags"}</h3>${weaknesses ? wrap(weaknesses) : "<p>No weakness tags or questions.</p>"}
    <h3 class="with-line">Quest</h3>${system.quest ? await enrich(system.quest, item) : "<p>No quest provided.</p>"}
    ${system.story ? `<h3 class="with-line">Story</h3>${await enrich(system.story, item)}` : ""}
    ${improvements.length ? `<h3 class="with-line">Special Improvements</h3><ul>${improvements.join("")}</ul>` : ""}`;
}

function groupedRows(entries, type) {
  const groups = new Map();
  for (const entry of entries) {
    const system = entry.item.system;
    const index = TYPES.indexOf(type === "themekit" ? system.themebook_type : system.type);
    const order = index < 0 ? 4 : index;
    if (!groups.has(order)) groups.set(order, new Map());
    const subgroup = type === "themekit" ? String(system.themekit_type ?? "").trim() || "Uncategorized" : "";
    if (!groups.get(order).has(subgroup)) groups.get(order).set(subgroup, []);
    groups.get(order).get(subgroup).push(entry);
  }
  return [...groups].sort(([a], [b]) => a - b).map(([order, subgroups]) =>
    `<div class="litm-qol-themebook-group"><div class="group-header">${TYPE_LABELS[order]}</div>${[...subgroups].sort(([a], [b]) => a.localeCompare(b)).map(([name, entries]) =>
      `<div class="litm-qol-themekit-subgroup">${name ? `<div class="subgroup-header">${esc(name)}</div>` : ""}<ul>${entries.map(({ item, source }) =>
        `<li class="litm-qol-themebook-source" title="${esc(source.label)}"><i class="fa-solid ${source.id === "world" ? "fa-globe" : "fa-book"} source-icon" aria-hidden="true"></i><label>
        <input type="radio" name="themeDocument" value="${esc(item.uuid)}"><span>${esc(item.name)}</span></label></li>`).join("")}</ul></div>`).join("")}</div>`).join("");
}

export async function chooseThemeDocument({ type, title, themebookName = null, back = false, assign = false } = {}) {
  const kit = type === "themekit"; const noun = kit ? "Themekit" : "Themebook";
  let sourceCount = 0; let reload;
  let entries = []; let choice = null; let loading = true; let generation = 0; let previewGeneration = 0; let active = true;
  const fields = new Set(Object.keys(FIELDS));
  const content = `<div class="litm-qol-themebook-selector litm-qol-browser">
    <div class="left-panel">
      ${kit && themebookName ? `<label class="litm-qol-browser-show-all"><input type="checkbox" name="showAllKits">Show all Themekits</label><p class="litm-qol-browser-hint" data-themebook-filter>For ${esc(themebookName)} (including legacy kits).</p>` : ""}
      <input type="search" class="themekit-search" name="browserSearch" aria-label="Search ${noun}s" placeholder="Search ${noun.toLowerCase()}s…">
      <fieldset class="litm-qol-browser-fields"><legend>Search in (name always included)</legend>${Object.entries(FIELDS).map(([key, label]) => `<label><input type="checkbox" name="searchField" value="${key}" checked>${label}</label>`).join("")}</fieldset>
      <div class="litm-qol-browser-status" role="status"></div>
      <button type="button" class="litm-qol-browser-retry" hidden>Retry sources</button>
      <div class="litm-qol-themebook-source-list"></div>
    </div><div class="right-panel"><div class="litm-qol-themebook-preview">Select a ${noun} to preview it.</div></div>
  </div>`;
  const bound = new WeakSet();
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: title ?? `${noun} Selection`, resizable: true },
    classes: ["litm-qol-system-dialog", "litm-qol-replace-theme-window", "litm-qol-themebook-selector-window"],
    position: { width: 1000, height: 760 }, content,
    render: (_event, dialog) => {
      const root = dialog.element; if (bound.has(root)) return; bound.add(root);
      const list = root.querySelector(".litm-qol-themebook-source-list");
      const preview = root.querySelector(".litm-qol-themebook-preview");
      const status = root.querySelector(".litm-qol-browser-status");
      const retry = root.querySelector(".litm-qol-browser-retry");
      const confirm = root.querySelector('button[data-action="select"]');
      let failed = [];
      const clearChoice = () => {
        choice = null; previewGeneration++; confirm.disabled = true;
        preview.textContent = `Select a ${noun} to preview it.`;
      };
      const filter = () => {
        const query = root.querySelector('[name="browserSearch"]').value;
        const showAll = root.querySelector('[name="showAllKits"]')?.checked;
        const banner = root.querySelector('[data-themebook-filter]');
        if (banner) banner.textContent = showAll ? "Showing all Themekits." : `For ${themebookName} (including legacy kits).`;
        const visible = entries.filter(({ item }) => (!kit || matchesThemebook(item, themebookName, showAll)) && matchesBrowserSearch(item, query, fields));
        if (choice && !visible.some(({ item }) => item.uuid === choice.uuid)) clearChoice();
        list.innerHTML = groupedRows(visible, type);
        for (const box of list.querySelectorAll('[name="themeDocument"]')) box.checked = box.value === choice?.uuid;
        status.textContent = loading ? "Loading sources…" : !sourceCount ? (game.user.isGM
          ? kit ? "No sources enabled. Configure Themekit sources in system settings." : "No sources enabled. Configure Themebook Sources in module settings."
          : kit ? "No sources enabled. Ask the GM to configure Themekit sources in system settings." : "No sources enabled. Ask the GM to configure Themebook Sources in module settings.") :
          `${visible.length} ${noun.toLowerCase()}${visible.length === 1 ? "" : "s"}${visible.length ? "." : ". Try other filters or ask the GM to check sources."}${failed.length ? ` Could not load: ${failed.join(", ")}.` : ""}`;
      };
      const load = async () => {
        const current = ++generation; loading = true; entries = []; failed = []; retry.hidden = true; clearChoice(); filter();
        const loaded = await loadBrowserItems(type);
        if (!active || current !== generation) return;
        entries = loaded.entries; failed = loaded.failed; sourceCount = loaded.sourceCount; loading = false; retry.hidden = !failed.length; filter();
      };
      reload = load; openBrowsers.add(reload);
      retry.addEventListener("click", () => { void load(); });
      root.querySelector('[name="browserSearch"]').addEventListener("input", filter);
      root.querySelector('[name="showAllKits"]')?.addEventListener("change", filter);
      root.querySelectorAll('[name="searchField"]').forEach(box => box.addEventListener("change", () => {
        if (box.checked) fields.add(box.value); else fields.delete(box.value); filter();
      }));
      list.addEventListener("change", async event => {
        if (event.target.name !== "themeDocument" || loading) return;
        const entry = entries.find(({ item }) => item.uuid === event.target.value);
        if (!entry) return;
        choice = entry.item; confirm.disabled = false; const current = ++previewGeneration;
        preview.textContent = "Loading preview…";
        try {
          const html = await browserPreview(entry.item, entry.source, type);
          if (active && current === previewGeneration) { preview.innerHTML = html; preview.parentElement.scrollTop = 0; }
        } catch (error) {
          console.error(`${MODULE_ID} | Theme preview failed`, error);
          if (active && current === previewGeneration) { preview.textContent = "Could not load this preview. Select it again to retry."; confirm.disabled = true; choice = null; event.target.checked = false; }
        }
      });
      void load();
    },
    buttons: [
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", callback: () => back ? { navigation: "cancel" } : null },
      ...(back ? [{ action: "back", label: "Back", icon: "fa-solid fa-arrow-left", callback: () => ({ navigation: "back" }) }] : []),
      { action: "select", label: kit ? assign ? "Assign Themekit" : "Add Themekit" : "Use Themebook", icon: "fa-solid fa-check",
        class: "litm-qol-replace-primary", default: true, disabled: true, callback: () => loading ? null : choice }
    ], rejectClose: false
  }).finally(() => { active = false; generation++; previewGeneration++; openBrowsers.delete(reload); });
  // DialogV2 substitutes the button action when a callback returns null.
  return result === "cancel" || result === "select" ? null : result;
}
