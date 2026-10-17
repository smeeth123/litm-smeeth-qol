import { chooseThemeDocument } from "./theme-browser.mjs";

const MODULE_ID = "litm-smeeth-qol";
const PATCH_FLAG = Symbol.for(`${MODULE_ID}.themekitSelectorPatched`);

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

export async function openQolThemekitSelector(actor, actorThemebook = null, { themebookName = actorThemebook?.name ?? null } = {}) {
  if (!actor) {
    ui.notifications.warn("No character is available for Themekit selection.");
    return null;
  }
  const selected = await chooseThemeDocument({ type: "themekit", themebookName, assign: Boolean(actorThemebook) });
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
