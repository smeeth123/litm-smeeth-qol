import { finalizeFumblingMaster, fumblingPenalty, installFumblingMaster, renderFumblingMaster } from "./fumbling-master.mjs";
import { installDiligentRolls } from "./diligent-drudge.mjs";
import { importSystemModule } from "./system-imports.mjs";
import { installSingleUseRolls } from "./single-use-tags.mjs";
import { installQuintessenceAutomation } from "./quintessence-automation.mjs";
import { effectiveMight, renderLargerThanLife } from "./larger-than-life.mjs";
const MODULE_ID = "litm-smeeth-qol";
const SYSTEM_ID = "mist-engine-fvtt";
const PATCHED = Symbol.for(`${MODULE_ID}.tradePowerIntegration`);
let RollAppClass = null;
const NAMES = { throw: "Throw Caution to the Wind", hedge: "Hedge Your Risks" };
const delta = type => type === "throw" ? -1 : type === "hedge" ? 1 : 0;

export function tradeAllowed(type, power) {
  return type === "throw" ? power <= 2 : type === "hedge" ? power >= 2 : false;
}

export function spendingPower(type, originalPower) {
  return type === "throw" ? Math.max(1, originalPower) + 1 : Math.max(1, originalPower - 1);
}

export function rawPower(app, DiceRollApp, values = app) {
  const tags = DiceRollApp.applyRulesToSelectedTags(app.selectedTags, app.selectedGmTags,
    app.selectedStoryTags, app.challengeTags);
  const count = DiceRollApp.calculatePowerTags(tags);
  const might = game.settings.get(SYSTEM_ID, "mightUsageEnabled") === true ? effectiveMight(app.actor, values.mightScale) : 0;
  return count.positive - count.negative + (app.helpingTags?.length ?? 0)
    + (Number(values.numModPositive) || 0) - (Number(values.numModNegative) || 0) + might
    - fumblingPenalty(app, DiceRollApp, values);
}

export function finalizeTrade(app, values, DiceRollApp) {
  values = { ...values, mightScale: effectiveMight(app.actor, values.mightScale) };
  values = finalizeFumblingMaster(app, values, DiceRollApp);
  if (!values) return null;
  // Native GM confirmation retains formValues until approval. Keeping the
  // finalized trade here also preserves it if the dialog is rerendered/closed.
  if (values._litmQolTradeFinalized) return values;
  const type = app.rollType === "detailed" ? app._litmQolPowerTrade?.type : null;
  if (!type) return { ...values, _litmQolTradeFinalized: true, _litmQolTrade: null };
  const originalPower = rawPower(app, DiceRollApp, values);
  if (!tradeAllowed(type, originalPower)) {
    app._litmQolPowerTrade = null;
    ui.notifications.warn("Power changed. Select an eligible Trade Power option, then roll again.");
    app.render();
    return null;
  }
  const trade = {
    type, originalPower, rollPower: originalPower + delta(type),
    spendablePower: spendingPower(type, originalPower), actorId: app.actor.id
  };
  return {
    ...values,
    numModPositive: (Number(values.numModPositive) || 0) + (type === "hedge" ? 1 : 0),
    numModNegative: (Number(values.numModNegative) || 0) + (type === "throw" ? 1 : 0),
    _litmQolTradeFinalized: true, _litmQolTrade: trade,
    _litmQolHelpingTags: foundry.utils.deepClone(app.helpingTags ?? [])
  };
}

export function tradeDescription(trade) {
  return `${NAMES[trade.type]}: original Power ${trade.originalPower}; rolled with ${trade.rollPower} Power. `
    + `On success, ${trade.spendablePower} Power to spend. See Core Book Vol. I, page 158.`;
}

export function applyTradeToMessage(message, data, trade, spendOptions) {
  const native = data.flags?.[SYSTEM_ID]?.detailedSpend ?? message.getFlag(SYSTEM_ID, "detailedSpend");
  const actorId = data.flags?.[MODULE_ID]?.rollContext?.actorId ?? data.speaker?.actor ?? message.speaker?.actor;
  if (!native || actorId !== trade.actorId) return false;
  const state = foundry.utils.deepClone(native);
  if (state.consequenceResult >= 0) {
    state.total = trade.spendablePower;
    state.numPowerTags = trade.spendablePower;
  }
  const root = document.createElement("div");
  root.innerHTML = data.content ?? message.content;
  const counter = root.querySelector(".power-counter");
  if (counter) counter.textContent = `Power: ${state.numPowerTags}`;
  const remaining = root.querySelector(".detailed-spend-remaining");
  if (remaining) remaining.textContent = `${state.total} / ${state.total}`;
  for (const button of root.querySelectorAll("[data-spend-option]")) {
    const option = spendOptions.find(option => option.id === button.dataset.spendOption);
    if (option) button.disabled = option.cost > state.total;
  }
  // Initial HTML and persisted budget agree. Native Spend/Undo subsequently
  // renders its own card from these corrected flags; no renderer replacement.
  const flags = foundry.utils.deepClone(data.flags ?? message.flags ?? {});
  flags[SYSTEM_ID] = { ...flags[SYSTEM_ID], detailedSpend: state };
  flags[MODULE_ID] = { ...flags[MODULE_ID], powerTrade: trade };
  const update = { content: root.innerHTML, flags };
  message.updateSource(update);
  Object.assign(data, update);
  return true;
}

export function decorateTradeCard(message, root) {
  const trade = message.getFlag(MODULE_ID, "powerTrade");
  if (!trade) return;
  const counter = root.querySelector(".power-counter") ?? root.querySelector(".detailed-spend-header");
  if (!counter) return;
  counter.dataset.tooltip = tradeDescription(trade);
  counter.classList.add("litm-qol-traded-power-counter");
  if (!root.querySelector(".litm-qol-trade-summary")) {
    const note = document.createElement("p");
    note.className = "litm-qol-trade-summary";
    note.textContent = `${NAMES[trade.type]} — rolled with ${trade.rollPower} Power.`;
    counter.after(note);
  }
}

export function insertRollSection(form, section) {
  const anchor = form.querySelector(".mt-10") ?? form.querySelector("footer");
  // v14.5 adds a wrapper for the GM-approval disabled state. The reference
  // element belongs to that wrapper, rather than directly to the form.
  if (anchor) anchor.parentElement.insertBefore(section, anchor);
  else form.append(section);
}

export function renderTradePower(app, root, DiceRollApp) {
  if (app.rollType !== "detailed") return;
  const form = root.matches?.("form.roll-dialog-container") ? root : root.querySelector("form.roll-dialog-container");
  if (!form || form.querySelector(".litm-qol-trade-power")) return;
  const section = document.createElement("fieldset");
  section.className = "litm-qol-trade-power";
  section.innerHTML = `<legend>Trade Power</legend><div class="flexrow litm-qol-trade-options">
    ${Object.entries(NAMES).map(([type, name]) => `<label class="litm-qol-trade-option">
      <input type="checkbox" name="litmQolPowerTrade" value="${type}">
      <span>${name}</span><small>${type === "throw" ? "−1 to roll; +1 spendable Power" : "+1 to roll; −1 spendable Power"}</small>
    </label>`).join("")}</div>`;
  insertRollSection(form, section);
  const boxes = [...section.querySelectorAll("input")];
  const refresh = () => {
    const power = rawPower(app, DiceRollApp);
    const locked = Boolean(app.pendingRequest || app._litmQolExecutingRoll);
    if (!locked && app._litmQolPowerTrade && !tradeAllowed(app._litmQolPowerTrade.type, power)) {
      app._litmQolPowerTrade = null;
    }
    for (const box of boxes) {
      const allowed = tradeAllowed(box.value, power);
      box.checked = app._litmQolPowerTrade?.type === box.value;
      box.disabled = locked || !allowed;
      box.closest("label").classList.toggle("disabled", box.disabled);
    }
    const label = form.querySelector(".power-label");
    if (label) label.textContent = `Power: ${power + delta(app._litmQolPowerTrade?.type)}`;
  };
  for (const box of boxes) box.addEventListener("change", () => {
    app._litmQolPowerTrade = box.checked ? { type: box.value } : null;
    refresh();
  });
  // Native number/radio handlers update app state before this bubbling event.
  form.addEventListener("input", event => {
    if (event.target.name !== "litmQolPowerTrade") refresh();
  });
  form.addEventListener("change", refresh);
  refresh();
}

export function installTradePower(DiceRollApp, spendOptions, renderDetailedCard, createDetailedMessage) {
  RollAppClass = DiceRollApp;
  const proto = DiceRollApp.prototype;
  if (proto[PATCHED]) return;
  installDiligentRolls(DiceRollApp);
  installQuintessenceAutomation(DiceRollApp, createDetailedMessage);
  const originalCompute = proto.computePowerAmount;
  const originalRequest = proto.requestGmConfirmation;
  const originalExecute = proto.executeRoll;
  const originalSetOptions = proto.setOptions;
  proto.computePowerAmount = function(...args) {
    this.mightScale = effectiveMight(this.actor, this.mightScale);
    if (this.rollType !== "detailed" || !this._litmQolPowerTrade) return Math.max(1, originalCompute.apply(this, args) - fumblingPenalty(this, DiceRollApp));
    return rawPower(this, DiceRollApp) + delta(this._litmQolPowerTrade.type);
  };
  proto.setOptions = function(options) {
    if ((options.actor && options.actor.id !== this.actor?.id) || (options.type && options.type !== this.rollType)) {
      this._litmQolPowerTrade = null;
    }
    return originalSetOptions.call(this, options);
  };
  proto.requestGmConfirmation = function(values) {
    const finalized = finalizeTrade(this, values, DiceRollApp);
    if (finalized) return originalRequest.call(this, finalized);
  };
  proto.executeRoll = async function(values) {
    if (this._litmQolExecutingRoll) return;
    const finalized = finalizeTrade(this, values, DiceRollApp);
    if (!finalized) return;
    const trade = finalized._litmQolTrade;
    if (trade && (this.actor?.id !== trade.actorId || this.rollType !== "detailed")) {
      ui.notifications.warn("The character or roll type changed. Start the roll again.");
      return;
    }
    this._litmQolExecutingRoll = true;
    let hookId;
    try {
      if (trade) {
        this.helpingTags = foundry.utils.deepClone(finalized._litmQolHelpingTags);
        // Bound to this actual execution, after approval; no actor-keyed cache
        // or expiry. Removed on success, failure, or a thrown execution error.
        hookId = Hooks.on("preCreateChatMessage", (message, data) => {
          if (applyTradeToMessage(message, data, trade, spendOptions)) {
            Hooks.off("preCreateChatMessage", hookId);
          }
        });
      }
      return await originalExecute.call(this, finalized);
    } finally {
      if (hookId !== undefined) Hooks.off("preCreateChatMessage", hookId);
      this._litmQolExecutingRoll = false;
      this._litmQolPowerTrade = null;
    }
  };
  Object.defineProperty(proto, PATCHED, { value: true });
  installSingleUseRolls(DiceRollApp, spendOptions, renderDetailedCard);
  installFumblingMaster(DiceRollApp);
}

export function nativeSacrifice(root) {
  const title = root.querySelector(".card-title")?.textContent.trim();
  const prefix = `${game.i18n.localize("MIST_ENGINE.SACRIFICE.Title")} — `;
  if (!title?.startsWith(prefix)) return null;
  const levelLabel = title.slice(prefix.length).trim();
  const level = ["painful", "scarring", "grave"].find(level =>
    levelLabel === game.i18n.localize(`MIST_ENGINE.SACRIFICE.Levels.${level}`));
  const result = root.querySelector(".consequence-result-positive, .consequence-result-neutral, .consequence-result-negative");
  if (!level || !result) return null;
  return { level, lessened: result.classList.contains("consequence-result-positive"), result };
}

export function isNativeSacrificeMessage(message, data) {
  if (data?.flags?.[MODULE_ID]?.nativeSacrifice || message?.getFlag?.(MODULE_ID, "nativeSacrifice")) return true;
  const content = String(data?.content ?? message?.content ?? "");
  if (!content.includes("roll-card")) return false;
  const root = document.createElement("div");
  root.innerHTML = content;
  return Boolean(nativeSacrifice(root));
}

Hooks.on("preCreateChatMessage", (message, data) => {
  const content = String(data.content ?? message.content ?? "");
  if (!content.includes("roll-card")) return;
  const root = document.createElement("div");
  root.innerHTML = content;
  const sacrifice = nativeSacrifice(root);
  if (!sacrifice) return;
  // Classify on the author's client, so other clients do not have to parse a
  // title that was rendered using a different language.
  const flags = foundry.utils.deepClone(data.flags ?? message.flags ?? {});
  flags[MODULE_ID] = { ...flags[MODULE_ID], nativeSacrifice: {
    level: sacrifice.level, lessened: sacrifice.lessened
  } };
  message.updateSource({ flags });
  data.flags = flags;
});

Hooks.once("ready", async () => {
  if (game.system.id !== SYSTEM_ID) return;
  try {
    const [{ DiceRollApp }, { SPEND_OPTIONS, renderDetailedCard, createDetailedMessage }] = await Promise.all([
      importSystemModule("apps/dice-roll-app.mjs"),
      importSystemModule("lib/detailed-spend.mjs")
    ]);
    installTradePower(DiceRollApp, SPEND_OPTIONS, renderDetailedCard, createDetailedMessage);
  } catch (error) {
    console.error(`${MODULE_ID} | Trade Power integration failed.`, error);
    ui.notifications.error("Smeeth's QoL could not initialize Trade Power. See the console for details.");
  }
});

export function renderIntegratedTradePower(app, root) {
  if (RollAppClass && app instanceof RollAppClass) {
    renderLargerThanLife(app, root);
    renderFumblingMaster(app, root, RollAppClass);
    renderTradePower(app, root, RollAppClass);
  }
}
