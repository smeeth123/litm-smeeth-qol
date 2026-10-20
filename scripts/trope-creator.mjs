import { TROPE_TYPE } from "./tropes.mjs";
import { browserSources, loadBrowserItems, watchBrowserSources } from "./theme-browser.mjs";

const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
const attr = value => esc(value).replaceAll('"', "&quot;");
const categoryOf = item => String(item.system.category ?? "").trim().replace(/\s+/g, " ") || "Uncategorized";
const searchKey = value => String(value).normalize("NFKC").toLowerCase().trim();

function categoryGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const name = categoryOf(entry.item), key = searchKey(name);
    if (!groups.has(key)) groups.set(key, { key, name, entries: [] });
    groups.get(key).entries.push(entry);
  }
  for (const group of groups.values()) group.entries.sort((a, b) => a.item.name.localeCompare(b.item.name, undefined, { sensitivity: "base" })
    || a.source.label.localeCompare(b.source.label) || a.item.uuid.localeCompare(b.item.uuid));
  return [...groups.values()].sort((a, b) => Number(a.key === "uncategorized") - Number(b.key === "uncategorized")
    || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export async function resolveTropeKit(uuid) {
  if (!uuid) return null;
  try {
    const kit = await fromUuid(uuid);
    if (kit?.documentName !== "Item" || kit.type !== "themekit" || !kit.visible) return null;
    if (!browserSources("themekit").some(source => source.id === (kit.pack || "world"))) return null;
    return kit;
  } catch { return null; }
}

export async function resolveTropePlan({ tropeUuid, extraIndex, tagIndex }, { includeBackpack = true } = {}) {
  const trope = await fromUuid(tropeUuid);
  if (trope?.type !== TROPE_TYPE || !trope.visible) return null;
  if (!browserSources(TROPE_TYPE).some(source => source.id === (trope.pack || "world"))) return null;
  if (!Number.isInteger(extraIndex) || extraIndex < 0 || extraIndex > 2) return null;
  const core = trope.system.themeKits;
  if (core?.length !== 3) return null;
  const kits = await Promise.all([...core, trope.system.themeKitChoices?.[extraIndex]].map(resolveTropeKit));
  if (kits.some(kit => !kit)) return null;
  const backpackTag = includeBackpack && Number.isInteger(tagIndex) && tagIndex >= 0 && tagIndex < 3
    ? String(trope.system.backpackTags?.[tagIndex] ?? "").trim() : "";
  if (includeBackpack && !backpackTag) return null;
  return { tropeUuid, tropeName: trope.name, kits, backpackTag };
}

export async function chooseTropePlan({ includeBackpack = true } = {}) {
  while (true) {
    const { entries, failed } = await loadBrowserItems(TROPE_TYPE);
    const groups = categoryGroups(entries);
    let selected = null; let generation = 0; let active = true; let sourcesChanged = false; let stopWatching;
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: "Hero Creator — Choose a Trope" },
      classes: ["litm-qol-system-dialog", "litm-qol-themebook-selector-window", "litm-qol-trope-picker-window"],
      position: { width: 880, height: 740 },
      content: `<div class="litm-qol-trope-picker"><div class="litm-qol-trope-list"><h2>Tropes</h2>
        <label>Category<select name="tropeCategory"><option value="">All categories</option>${groups.map(group => `<option value="${attr(group.key)}">${esc(group.name)}</option>`).join("")}</select></label>
        <label>Search<input type="search" name="tropeSearch" placeholder="Search names or categories"></label>
        ${failed.length ? `<p>Could not load: ${esc(failed.join(", "))}.</p>` : ""}
        ${entries.length ? groups.map(group => `<section class="litm-qol-trope-category-group" data-trope-category-group="${attr(group.key)}"><h3>${esc(group.name)}</h3>${group.entries.map(({ item, source }) => `<label class="litm-qol-trope-option" data-trope-name="${attr(searchKey(item.name))}" data-trope-category="${attr(group.key)}" data-trope-search="${attr(searchKey(`${item.name} ${group.name}`))}"><input type="radio" name="tropeChoice" value="${attr(item.uuid)}"><span><strong>${esc(item.name)}</strong><small>${esc(source.label)}</small></span></label>`).join("")}</section>`).join("") : "<p>No Tropes are available from the enabled sources. Ask the GM to check Theme Browser Sources in module settings, create a Trope Item, or use the custom build path.</p>"}
        <p class="litm-qol-trope-no-matches" hidden>No Tropes match your search or category.</p>
        </div><div class="litm-qol-trope-preview"><p>Select a Trope to preview its description and choices.</p></div></div>`,
      render: (_event, dialog) => {
        const root = dialog.element;
        stopWatching?.();
        stopWatching = watchBrowserSources(() => {
          if (!active || sourcesChanged) return;
          sourcesChanged = true;
          void dialog.close();
        });
        const preview = root.querySelector(".litm-qol-trope-preview");
        const next = root.querySelector('[data-action="useTrope"]');
        next.disabled = true;
        const valid = () => {
          next.disabled = !selected || !preview.querySelector('[name="tropeExtra"]:checked')
            || (includeBackpack && !preview.querySelector('[name="tropeBackpack"]:checked'));
        };
        const filter = () => {
          const query = searchKey(root.querySelector('[name="tropeSearch"]').value);
          const category = root.querySelector('[name="tropeCategory"]').value;
          for (const row of root.querySelectorAll("[data-trope-name]")) {
            row.hidden = !row.dataset.tropeSearch.includes(query) || Boolean(category && row.dataset.tropeCategory !== category);
          }
          for (const group of root.querySelectorAll("[data-trope-category-group]")) {
            group.hidden = !group.querySelector("[data-trope-name]:not([hidden])");
          }
          root.querySelector(".litm-qol-trope-no-matches").hidden = !entries.length || Boolean(root.querySelector("[data-trope-name]:not([hidden])"));
          if (root.querySelector('[name="tropeChoice"]:checked')?.closest("[data-trope-name]").hidden) {
            root.querySelector('[name="tropeChoice"]:checked').checked = false;
            selected = null; generation++; next.disabled = true; preview.textContent = "Select a Trope to preview its description and choices.";
          }
        };
        root.querySelector('[name="tropeSearch"]').addEventListener("input", filter);
        root.querySelector('[name="tropeCategory"]').addEventListener("change", filter);
        root.addEventListener("change", async event => {
          if (["tropeExtra", "tropeBackpack"].includes(event.target.name)) { valid(); return; }
          if (event.target.name !== "tropeChoice") return;
          selected = null; next.disabled = true; const current = ++generation;
          preview.textContent = "Loading Trope…";
          try {
            const trope = entries.find(({ item }) => item.uuid === event.target.value)?.item;
            if (!trope) return;
            const [core, alternatives, description] = await Promise.all([
              Promise.all([0, 1, 2].map(index => resolveTropeKit(trope.system.themeKits?.[index]))),
              Promise.all([0, 1, 2].map(index => resolveTropeKit(trope.system.themeKitChoices?.[index]))),
              foundry.applications.ux.TextEditor.implementation.enrichHTML(trope.system.description ?? "", { async: true, secrets: trope.isOwner, relativeTo: trope })
            ]);
            if (!active || current !== generation) return;
            preview.innerHTML = `<h2>${esc(trope.name)}</h2><p class="litm-qol-trope-preview-category">${esc(categoryOf(trope))}</p><div>${description}</div>
              <h3>Three core Themekits</h3><ol>${core.map(kit => `<li>${esc(kit?.name ?? "Missing or unavailable Themekit")}</li>`).join("")}</ol>
              <fieldset><legend>Choose the fourth Themekit</legend>${alternatives.map((kit, index) => `<label><input type="radio" name="tropeExtra" value="${index}" ${kit ? "" : "disabled"}><span>${esc(kit?.name ?? "Missing or unavailable Themekit")}</span></label>`).join("")}</fieldset>
              ${includeBackpack ? `<fieldset><legend>Choose a Backpack tag</legend>${[0, 1, 2].map(index => { const tag = String(trope.system.backpackTags?.[index] ?? "").trim(); return `<label><input type="radio" name="tropeBackpack" value="${index}" ${tag ? "" : "disabled"}><span>${esc(tag || "Empty tag")}</span></label>`; }).join("")}</fieldset>` : "<p>Reforging retains the Hero’s existing Backpack.</p>"}
              ${core.some(kit => !kit) ? "<p>This Trope needs all three core Themekits before it can be used. Linked kits must be visible and enabled in system source settings.</p>" : "<p>You will customize each theme’s power tags, weakness, and Quest next.</p>"}`;
            if (core.every(Boolean)) selected = trope.uuid;
            valid();
          } catch (error) {
            if (active && current === generation) { preview.textContent = "This Trope could not be loaded. Select it again to retry."; }
            console.error("litm-smeeth-qol | Trope preview failed.", error);
          }
        });
      },
      buttons: [
        { action: "cancel", label: "Cancel", callback: () => ({ navigation: "cancel" }) },
        { action: "back", label: "Back", callback: () => ({ navigation: "back" }) },
        { action: "useTrope", label: "Use Trope", default: true, disabled: true, callback: (_event, button) => ({
          tropeUuid: selected,
          extraIndex: Number(button.form.querySelector('[name="tropeExtra"]:checked')?.value ?? -1),
          tagIndex: Number(button.form.querySelector('[name="tropeBackpack"]:checked')?.value ?? -1)
        }) }
      ], rejectClose: false
    }).finally(() => { active = false; generation++; stopWatching?.(); });
    if (sourcesChanged) continue;
    if (!result || result.navigation || !result.tropeUuid) return result?.navigation === "back" ? { navigation: "back" } : null;
    const plan = await resolveTropePlan(result, { includeBackpack });
    if (plan) return plan;
    ui.notifications.warn("That Trope or one of its choices changed or is unavailable. Please choose again.");
  }
}
