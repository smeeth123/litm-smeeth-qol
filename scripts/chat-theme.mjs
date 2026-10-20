const MODULE_ID = "litm-smeeth-qol";
const SETTING = "darkChatCards";

export function applyChatTheme(enabled) {
  // One local CSS switch covers current, future, and popped-out cards.
  // Message HTML, visibility, listeners, and persisted content stay native.
  document.body.classList.toggle("litm-qol-dark-chat", game.system.id === "mist-engine-fvtt" && enabled === true);
}

Hooks.once("init", () => game.settings.register(MODULE_ID, SETTING, {
  name: "Dark Chat Cards",
  hint: "Use dark paper, cream text, and the module’s Labrada font for roll cards. Applies only to your client and updates immediately.",
  scope: "client", config: true, type: Boolean, default: true,
  onChange: applyChatTheme
}));
Hooks.once("ready", () => applyChatTheme(game.settings.get(MODULE_ID, SETTING)));
