import { chooseThemeDocument } from "./theme-browser.mjs";

const MODULE_ID = "litm-smeeth-qol";
export const TROPE_TYPE = `${MODULE_ID}.trope`;
const KIT_GROUPS = ["themeKits", "themeKitChoices"];
const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
const attr = value => esc(value).replaceAll('"', "&quot;");

export class TropeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { ArrayField, HTMLField, StringField } = foundry.data.fields;
    const slots = () => new ArrayField(new StringField({ required: true, nullable: false, blank: true }), {
      required: true, nullable: false, min: 3, max: 3, initial: () => ["", "", ""]
    });
    return {
      category: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
      description: new HTMLField({ required: true, nullable: false, blank: true, initial: "" }),
      themeKits: slots(),
      themeKitChoices: slots(),
      backpackTags: slots()
    };
  }

  // Mist Engine uses this method when copying Item system data.
  toPlainObject() { return this.toObject(); }
}

function slotFrom(target) {
  const slot = target.closest("[data-trope-group]");
  const group = slot?.dataset.tropeGroup;
  const index = Number(slot?.dataset.tropeIndex);
  return KIT_GROUPS.includes(group) && Number.isInteger(index) && index >= 0 && index < 3 ? { group, index } : null;
}

async function resolveKit(uuid) {
  if (!uuid) return null;
  try {
    const item = await fromUuid(uuid);
    return item?.documentName === "Item" && item.type === "themekit" && item.visible ? item : null;
  } catch { return null; }
}

export class TropeSheet extends foundry.applications.sheets.ItemSheetV2 {
  static DEFAULT_OPTIONS = {
    classes: ["litm-qol-trope-sheet"],
    position: { width: 740, height: 800 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      chooseKit: this.#chooseKit,
      openKit: this.#openKit,
      clearKit: this.#clearKit
    }
  };

  async _renderHTML() {
    const { system } = this.document;
    const editable = this.isEditable;
    const disabled = editable ? "" : "disabled";
    const groups = await Promise.all(KIT_GROUPS.map(async group => {
      const rows = await Promise.all([0, 1, 2].map(async index => {
        const uuid = system[group][index];
        const kit = await resolveKit(uuid);
        const label = kit?.name ?? (uuid ? "Unavailable Themekit" : "No Themekit selected");
        return `<div class="litm-qol-trope-slot" data-trope-group="${group}" data-trope-index="${index}">
          <span class="litm-qol-trope-number">${index + 1}</span>
          <div class="litm-qol-trope-kit"><span>${esc(label)}</span>${uuid && !kit ? '<small>The linked kit is missing or unavailable to you.</small>' : ""}</div>
          <button type="button" data-action="openKit" data-kit-available="${Boolean(kit)}" aria-label="Open Themekit ${index + 1}" title="Open Themekit" ${kit ? "" : "disabled"}><i class="fa-solid fa-book-open" aria-hidden="true"></i></button>
          ${editable ? `<button type="button" data-action="chooseKit" title="Choose Themekit">Choose</button><button type="button" data-action="clearKit" title="Clear Themekit" aria-label="Clear Themekit ${index + 1}" ${uuid ? "" : "disabled"}><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ""}
        </div>`;
      }));
      return `<section><h2>${group === "themeKits" ? "Three Core Themekits" : "Choose One Additional Themekit"}</h2>
        <p>${group === "themeKits" ? "All three kits form the Hero’s first three themes." : "The Hero chooses one of these three kits for their fourth theme."}${editable ? " Choose a kit or drag one into a slot." : ""}</p>${rows.join("")}</section>`;
    }));
    const content = document.createElement("div");
    content.className = "litm-qol-trope-content";
    content.innerHTML = `<header><label>Name<input type="text" name="name" value="${attr(this.document.name)}" ${disabled}></label>
      <label>Category<input type="text" name="system.category" value="${attr(system.category ?? "")}" placeholder="e.g. Village Folk" ${disabled}></label></header>
      <section class="litm-qol-trope-description"><h2>Description</h2><div data-description></div></section>
      ${groups.join("")}
      <section><h2>Choose One Backpack Tag</h2><p>The Hero chooses one of these three tags.</p>
      <div class="litm-qol-trope-backpack">${[0, 1, 2].map(index => `<label>Tag ${index + 1}<input type="text" name="system.backpackTags.${index}" value="${attr(system.backpackTags[index])}" placeholder="Backpack tag" ${disabled}></label>`).join("")}</div></section>
      ${editable ? '<p class="litm-qol-trope-save-note">Changes save automatically. Incomplete Tropes can be saved and finished later.</p>' : ""}`;
    const enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(system.description, {
      async: true, secrets: this.document.isOwner, relativeTo: this.document
    });
    const description = content.querySelector("[data-description]");
    if (editable) {
      description.append(foundry.applications.elements.HTMLProseMirrorElement.create({
        name: "system.description", value: system.description, enriched, toggled: true,
        documentUUID: this.document.uuid, height: 180
      }));
    } else description.innerHTML = enriched;
    return content;
  }

  _replaceHTML(result, content) { content.replaceChildren(result); }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Read-only sheets can still inspect linked kits.
    for (const button of this.element.querySelectorAll('[data-action="openKit"][data-kit-available="true"]')) {
      button.disabled = false;
    }
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    if (data.system && Object.hasOwn(data.system, "category")) {
      data.system.category = String(data.system.category ?? "").trim();
    }
    if (data.system?.backpackTags) {
      data.system.backpackTags = [0, 1, 2].map(index => String(data.system.backpackTags[index] ?? "").trim());
    }
    return data;
  }

  async setKit(target, kit) {
    const slot = slotFrom(target);
    if (!this.isEditable || !slot) return;
    if (kit && (kit.documentName !== "Item" || kit.type !== "themekit" || !kit.visible)) {
      ui.notifications.warn("Choose a visible Themekit for this slot.");
      return;
    }
    const kits = [...this.document.system[slot.group]];
    kits[slot.index] = kit?.uuid ?? "";
    // Submit the current form with the kit change so an open description editor
    // or a field that has not yet blurred is not lost when the sheet refreshes.
    await this.submit({ updateData: { system: { [slot.group]: kits } } });
  }

  static async #chooseKit(_event, target) {
    if (!this.isEditable) return;
    const slot = slotFrom(target);
    if (!slot) return;
    const kit = await chooseThemeDocument({ type: "themekit", title: "Trope — Choose a Themekit" });
    if (kit) await this.setKit(target, kit);
  }

  static async #clearKit(_event, target) { await this.setKit(target, null); }

  static async #openKit(_event, target) {
    const slot = slotFrom(target);
    if (!slot) return;
    const kit = await resolveKit(this.document.system[slot.group][slot.index]);
    if (kit) kit.sheet.render(true);
    else ui.notifications.warn("This Themekit is no longer available.");
  }

  async _onDropDocument(event, document) {
    // ItemSheetV2 resolves Foundry's world/compendium drag data for us.
    if (slotFrom(event.target)) await this.setKit(event.target, document);
    return null;
  }
}

Hooks.once("init", () => {
  CONFIG.Item.dataModels[TROPE_TYPE] = TropeData;
  CONFIG.Item.typeLabels ??= {};
  CONFIG.Item.typeLabels[TROPE_TYPE] = "TYPES.Item.litm-smeeth-qol.trope";
  CONFIG.Item.typeIcons ??= {};
  CONFIG.Item.typeIcons[TROPE_TYPE] = "fa-solid fa-masks-theater";
  foundry.documents.collections.Items.registerSheet(MODULE_ID, TropeSheet, {
    types: [TROPE_TYPE], makeDefault: true, label: "Trope"
  });
});
