import { installHelpRollState, captureHelpBookkeeping, applyHelpBookkeeping } from "./help-bookkeeping.mjs";
const MODULE_ID = "litm-smeeth-qol";
const SYSTEM_ID = "mist-engine-fvtt";
const RECORDS = "singleUseTagRecords";
const LEGACY_RECORDS = "singleUseFloatingTags";
export const TAG_ID = "litmQolId";
const PATCHED = Symbol.for(`${MODULE_ID}.singleUseRolls`);
let socket;
let renderNativeCard;
let spendOptions = [];
let operationQueue = Promise.resolve();
const executions = new Map();
const busyMessages = new Set();
const clone = value => foundry.utils.deepClone(value);
const allRecords = actor => clone(actor.getFlag(MODULE_ID, RECORDS) ?? actor.getFlag(MODULE_ID, LEGACY_RECORDS) ?? []);
const recordUpdates = records => ({ [`flags.${MODULE_ID}.${RECORDS}`]: records,
  [`flags.${MODULE_ID}.${LEGACY_RECORDS}`]: records.filter(record => !record.state || record.state === "available") });
export const getSingleUseRecords = actor => allRecords(actor).filter(record => !record.state || record.state === "available");
const owner = (actor, user) => Boolean(user?.isGM || actor?.testUserPermission(user, "OWNER"));
const spent = state => (state.entries ?? []).reduce((total, entry) => total + entry.cost, 0);
export const remainingPower = state => Math.max(0, state.total - spent(state));
const authorId = message => message.author?.id ?? message.user?.id;
const wasInvoked = (actorUuid, id) => [...game.messages].some(message =>
  message.getFlag(MODULE_ID, "rollContext")?.singleUse?.some(use => use.actorUuid === actorUuid && use.id === id));

export function extendSingleUseSchema() {
  if (game.system.id !== SYSTEM_ID) return;
  for (const Model of new Set([CONFIG.Actor.dataModels.character, CONFIG.Actor.dataModels["litm-character"]].filter(Boolean))) {
    const entry = Model.schema.fields.floatingTagsAndStatuses?.element;
    if (entry && !entry.fields[TAG_ID]) {
      entry.extendFields({ [TAG_ID]: new foundry.data.fields.StringField({ required: false, blank: true, initial: "" }) });
    }
  }
}
Hooks.once("init", extendSingleUseSchema);
Hooks.once("setup", extendSingleUseSchema);

export async function migrateLegacyTags(actor, { resolve = false } = {}) {
  const records = allRecords(actor);
  const tags = clone(actor.system.floatingTagsAndStatuses ?? []);
  const before = JSON.stringify(tags);
  let changed = false;
  for (const record of records.filter(record => !record.schemaVersion)) {
    const matches = tags.map((tag, index) => ({ tag, index }))
      .filter(({ tag }) => !tag.isStatus && !tag[TAG_ID] && tag.name === record.name);
    if (!matches.length) {
      Object.assign(record, { schemaVersion: 2, state: "missing" });
      changed = true;
      continue;
    }
    let index = matches.length === 1 ? matches[0].index : null;
    if (index === null && matches.length && resolve) {
      const result = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Identify single-use tag — ${actor.name}` },
        content: `<p>Which existing entry is the single-use tag <strong>${foundry.utils.escapeHTML(record.name)}</strong>?</p>
          <select name="index">${matches.map(({ tag, index }) => `<option value="${index}">Entry ${index + 1}${tag.selected ? " (selected)" : ""}</option>`).join("")}</select>`,
        ok: { label: "Identify Tag", callback: (_event, button) => button.form.elements.index.value }, rejectClose: false
      });
      if (result !== null && result !== undefined) index = Number(result);
    }
    if (index === null) continue; // Never guess which duplicate is disposable.
    tags[index][TAG_ID] = record.id;
    tags[index].toBurn = false;
    Object.assign(record, { schemaVersion: 2, state: "available" });
    changed = true;
  }
  if (changed) {
    if (JSON.stringify(actor.system.floatingTagsAndStatuses ?? []) !== before) throw new Error("The tag list changed. Identify the legacy tag again.");
    await actor.update({ "system.floatingTagsAndStatuses": tags, ...recordUpdates(records) });
  }
  return records;
}

export function recordForTag(actor, index) {
  const tag = actor.system.floatingTagsAndStatuses?.[index];
  return tag?.[TAG_ID] ? getSingleUseRecords(actor).find(record => record.id === tag[TAG_ID]) ?? null : null;
}

export function decorateSingleUseTags(actor, root) {
  if (!actor || !root) return;
  for (const entry of root.querySelectorAll(".floating-tag-and-status-entry[data-index]")) {
    const record = recordForTag(actor, Number(entry.dataset.index));
    if (!record) continue;
    entry.classList.add("litm-qol-single-use-floating-tag");
    const selectable = entry.querySelector(".fts-selectable");
    if (selectable) selectable.dataset.tooltip = "Single-use: removed after a completed roll invokes it. Cannot be burned.";
  }
  const unresolved = getSingleUseRecords(actor).some(record => !record.schemaVersion);
  const container = root.querySelector(".floating-tags-and-status-entries");
  if (unresolved && container && owner(actor, game.user) && !root.querySelector(".litm-qol-resolve-single-use")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "litm-qol-resolve-single-use";
    button.textContent = "Identify legacy single-use tags";
    button.addEventListener("click", () => migrateLegacyTags(actor, { resolve: true }).catch(reportError));
    container.before(button);
  }
}

async function updateActorRecord(actor, id, state, { messageUuid } = {}) {
  const records = allRecords(actor);
  const record = records.find(record => record.id === id);
  if (!record) throw new Error("The single-use tag record could not be found.");
  if (record.state === "consumed") return false;
  record.state = state;
  if (messageUuid) record.consumedBy = messageUuid;
  const tags = clone(actor.system.floatingTagsAndStatuses ?? []).filter(tag => tag[TAG_ID] !== id);
  await actor.update({ "system.floatingTagsAndStatuses": tags, ...recordUpdates(records) });
  return true;
}

async function applySpend(payload, user) {
  const message = await fromUuid(payload.messageUuid);
  if (!message || !(user?.isGM || authorId(message) === user?.id)) throw new Error("You cannot change this roll's spending.");
  const state = clone(message.getFlag(SYSTEM_ID, "detailedSpend"));
  if (!state || state.consequenceResult < 0) throw new Error("Only successful Detailed rolls can spend Power.");
  state.entries ??= [];
  const group = message.getFlag(MODULE_ID, "rollContext")?.group;
  let actor = group ? game.actors.get(payload.recipientActorId) : ChatMessage.getSpeakerActor(message.speaker);
  const canAllocateTag = target => target && (owner(target, user) || (game.user.isGM && authorId(message) === user?.id && group?.actorIds?.includes(target.id)));
  let createdId;
  let removed;
  if (payload.action === "pushLuck") {
    if (state.consequenceResult !== 1) throw new Error("Push Your Luck requires a 10+ Detailed result.");
    if (state.pushYourLuck) return false;
    state.total += 1;
    state.numPowerTags = state.total;
    state.pushYourLuck = { id: foundry.utils.randomID(), userId: user.id, at: Date.now() };
  } else if (payload.action === "undoPushLuck") {
    if (!state.pushYourLuck) return false;
    if (payload.grantId && payload.grantId !== String(state.pushYourLuck.id ?? state.pushYourLuck.at)) return false;
    if (remainingPower(state) < 1) throw new Error("Undo at least 1 Power of spending before removing Push Your Luck.");
    state.total -= 1;
    state.numPowerTags = state.total;
    state.pushYourLuck = null;
  } else if (payload.action === "undo") {
    const index = state.entries.findIndex((entry, index) => entry.id ? entry.id === payload.entryId : index === payload.index && JSON.stringify(entry) === payload.fingerprint);
    const entry = state.entries[index];
    if (!entry) throw new Error("This spending entry changed. Refresh the card and try again.");
    if (entry.qolSingleUseId) {
      actor = entry.actorUuid ? await fromUuid(entry.actorUuid) : actor;
      if (!canAllocateTag(actor)) throw new Error("You cannot remove this Hero's tag.");
      const record = allRecords(actor).find(record => record.id === entry.qolSingleUseId);
      if (record?.state === "consumed" || wasInvoked(actor.uuid, entry.qolSingleUseId)) throw new Error("This tag has already been used; its Power cannot be refunded.");
      removed = { tag: clone(actor.system.floatingTagsAndStatuses.find(tag => tag[TAG_ID] === entry.qolSingleUseId)), record: clone(record) };
      await updateActorRecord(actor, entry.qolSingleUseId, "undone");
    }
    if (entry.type === "status" && entry.tier > 1) {
      entry.tier -= 1; entry.cost -= 1;
      entry.label = game.i18n.format("MIST_ENGINE.DETAILED_SPEND.StatusEntry", { tier: entry.tier });
    } else state.entries.splice(index, 1);
  } else {
    const option = spendOptions.find(option => option.id === payload.optionId);
    if (!option || option.cost > remainingPower(state)) throw new Error("There is not enough Power remaining.");
    if (option.id === "singleUse") {
      if (remainingPower(state) !== 1) throw new Error("Create a single-use tag only when exactly 1 Power remains.");
      if (group && !group.actorIds.includes(actor?.id)) throw new Error("Choose a participating Hero to receive the group’s tag.");
      if (!canAllocateTag(actor)) throw new Error("You cannot add a tag to this Hero.");
      const name = String(payload.name ?? "").trim();
      if (!name || name.length > 200) throw new Error("Enter a tag name of 1–200 characters.");
      createdId = foundry.utils.randomID();
      const records = allRecords(actor);
      records.push({ id: createdId, name, schemaVersion: 2, state: "available", sourceMessage: message.uuid });
      const tags = clone(actor.system.floatingTagsAndStatuses ?? []);
      tags.push({ [TAG_ID]: createdId, name, value: 0, isStatus: false, burned: false, toBurn: false,
        selected: false, positive: true, markings: Array(6).fill(false), might: 0, mightIcon: "adventure" });
      await actor.update({ "system.floatingTagsAndStatuses": tags, ...recordUpdates(records) });
      state.entries.push({ id: foundry.utils.randomID(), type: "singleUse", cost: 1,
        label: `Single-use tag: ${name}${group ? ` (${actor.name})` : ""}`, qolSingleUseId: createdId, actorUuid: actor.uuid });
    } else if (option.kind === "status") {
      const last = state.entries.at(-1);
      if (last?.type === "status") { last.tier += 1; last.cost += 1; last.label = game.i18n.format("MIST_ENGINE.DETAILED_SPEND.StatusEntry", { tier: last.tier }); }
      else state.entries.push({ id: foundry.utils.randomID(), type: "status", tier: 1, cost: 1, label: game.i18n.format("MIST_ENGINE.DETAILED_SPEND.StatusEntry", { tier: 1 }) });
    } else state.entries.push({ id: foundry.utils.randomID(), type: option.id, cost: option.cost, label: game.i18n.localize(option.labelKey) });
  }
  try {
    const content = await renderNativeCard(state);
    await message.update({ content, [`flags.${SYSTEM_ID}.detailedSpend`]: state });
  } catch (error) {
    // Actor + chat message cannot be one database transaction. Compensate only
    // this operation's tag if the message write fails, preserving other tags.
    if (createdId) await updateActorRecord(actor, createdId, "aborted");
    if (removed?.record) {
      const records = allRecords(actor).map(record => record.id === removed.record.id ? removed.record : record);
      const tags = clone(actor.system.floatingTagsAndStatuses ?? []);
      if (removed.tag && !tags.some(tag => tag[TAG_ID] === removed.record.id)) tags.push(removed.tag);
      await actor.update({ "system.floatingTagsAndStatuses": tags, ...recordUpdates(records) });
    }
    throw error;
  }
  return true;
}

async function applyConsumption(payload, user) {
  const message = await fromUuid(payload.messageUuid);
  if (!message || !(user?.isGM || authorId(message) === user?.id)) throw new Error("You cannot consume tags for this roll.");
  const context = message.getFlag(MODULE_ID, "rollContext");
  if (!context) throw new Error("No completed roll context was found.");
  for (const use of context.singleUse ?? []) {
    const actor = await fromUuid(use.actorUuid);
    if (!actor || !(game.user.isGM || owner(actor, game.user))) throw new Error("A tag owner's client or Narrator is required to finish cleanup.");
    const record = allRecords(actor).find(record => record.id === use.id);
    if (!record) throw new Error("A single-use tag record is missing. Ask the Narrator to check it.");
    if (record.state !== "consumed") await updateActorRecord(actor, use.id, "consumed", { messageUuid: message.uuid });
  }
  await applyHelpBookkeeping(message, context);
  await message.update({ [`flags.${MODULE_ID}.singleUseCleanupError`]: false, [`flags.${MODULE_ID}.singleUseCleanupComplete`]: true });
  return true;
}

export function runSingleUseOperation(payload, senderId = game.user.id) {
  const operation = operationQueue.then(() => {
    const user = game.users.get(senderId);
    return payload.action === "consume" ? applyConsumption(payload, user) : applySpend(payload, user);
  });
  operationQueue = operation.catch(() => {});
  return operation;
}

async function dispatch(payload) {
  const gm = game.users.activeGM;
  if (gm && gm.id !== game.user.id) {
    if (!socket) throw new Error("Socketlib is not ready. Reload the client and try again.");
    return socket.executeAsUser("singleUseOperation", gm.id, payload);
  }
  return runSingleUseOperation(payload);
}

function reportError(error) {
  console.error(`${MODULE_ID} | Roll tag operation failed.`, error);
  ui.notifications.error(error.message || "The roll tag operation failed. See the console for details.");
}

export function bindSpending(message, root) {
  const state = message.getFlag(SYSTEM_ID, "detailedSpend");
  if (!state) return;
  const editable = message.isAuthor || game.user.isGM;
  const pushLuck = root.querySelector("[data-push-your-luck]");
  if (pushLuck) pushLuck.disabled = !editable;
  const singleUse = root.querySelector('[data-spend-option="singleUse"]');
  if (singleUse) {
    singleUse.disabled = !editable || remainingPower(state) !== 1;
    singleUse.dataset.tooltip = "Create a single-use story tag with your final 1 Power. Removed when invoked; cannot be burned.";
  }
  for (const undo of root.querySelectorAll("[data-spend-undo]")) {
    const entry = state.entries?.[Number(undo.dataset.spendUndo)];
    const actor = entry?.qolSingleUseId ? [...game.actors.values()].find(actor => actor.uuid === entry.actorUuid) ?? ChatMessage.getSpeakerActor(message.speaker) : null;
    if (actor && allRecords(actor).find(record => record.id === entry.qolSingleUseId)?.state === "consumed") {
      undo.classList.add("litm-qol-undo-unavailable");
      undo.setAttribute("aria-disabled", "true");
      undo.dataset.tooltip = "Already used: this tag's Power cannot be refunded.";
    }
  }
  if (root.dataset.litmQolSpendingBound) return;
  root.dataset.litmQolSpendingBound = "true";
  // Capture before the native individual listeners. All ledger changes take
  // the same serialized route, so simultaneous GM/player clicks cannot lose
  // a single-use allocation or spend its last Power twice.
  root.addEventListener("click", async event => {
    const button = event.target.closest("[data-spend-option], [data-spend-undo], [data-push-your-luck]");
    if (!button || !root.contains(button)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!editable || button.disabled || button.getAttribute("aria-disabled") === "true" || busyMessages.has(message.uuid)) return;
    busyMessages.add(message.uuid);
    root.classList.add("litm-qol-spending-busy");
    try {
      let payload = { messageUuid: message.uuid };
      if (button.hasAttribute("data-push-your-luck")) {
        payload.action = button.dataset.pushYourLuck === "undo" ? "undoPushLuck" : "pushLuck";
        if (button.dataset.pushLuckGrant) payload.grantId = button.dataset.pushLuckGrant;
      } else if (button.dataset.spendOption) {
        payload = { ...payload, action: "spend", optionId: button.dataset.spendOption };
        if (payload.optionId === "singleUse") {
          let result;
          const group = message.getFlag(MODULE_ID, "rollContext")?.group;
          const recipients = (group?.actorIds ?? []).map(id => game.actors.get(id)).filter(Boolean);
          const recipientField = group ? `<label>Hero receiving the tag<select name="recipientActorId">${recipients.map(actor => `<option value="${actor.id}">${foundry.utils.escapeHTML(actor.name)}</option>`).join("")}</select></label>` : "";
          try { result = await foundry.applications.api.DialogV2.prompt({
            window: { title: "Create Single-Use Story Tag" }, classes: ["litm-qol-system-dialog"],
            content: `<p>Spend your final 1 Power to create a story tag. It is removed after use and cannot be burned.</p><label>Tag name<input type="text" name="tagName" maxlength="200" autofocus></label>${recipientField}`,
            ok: { label: "Create and Spend 1 Power", callback: (_event, button) => group ? { name: button.form.elements.tagName.value, recipientActorId: button.form.elements.recipientActorId.value } : button.form.elements.tagName.value }, rejectClose: false
          }); } catch { return; }
          const name = group ? result?.name : result;
          if (!String(name ?? "").trim()) return;
          payload.name = name;
          if (group) payload.recipientActorId = result.recipientActorId;
        }
      } else {
        const index = Number(button.dataset.spendUndo);
        const entry = message.getFlag(SYSTEM_ID, "detailedSpend").entries[index];
        if (!entry) return;
        payload = { ...payload, action: "undo", index, entryId: entry.id, fingerprint: JSON.stringify(entry) };
      }
      await dispatch(payload);
    } catch (error) { reportError(error); }
    finally { busyMessages.delete(message.uuid); root.classList.remove("litm-qol-spending-busy"); }
  }, { capture: true });
}

export function installSingleUseRolls(DiceRollApp, options, renderer) {
  spendOptions = options; renderNativeCard = renderer;
  const proto = DiceRollApp.prototype;
  if (proto[PATCHED]) return;
  installHelpRollState(DiceRollApp);
  const originalPrepare = DiceRollApp.getPreparedTagsAndStatusesForRoll;
  DiceRollApp.getPreparedTagsAndStatusesForRoll = function(actor) {
    const result = originalPrepare.call(this, actor);
    for (const tag of result) {
      if (tag.source !== "floating-tag") continue;
      const id = actor.system.floatingTagsAndStatuses[tag.index - 1]?.[TAG_ID];
      if (id && getSingleUseRecords(actor).some(record => record.id === id)) {
        tag.singleUseId = id; tag.toBurn = false;
      }
    }
    return result.filter(tag => {
      if (tag.source !== "floating-tag") return true;
      const id = actor.system.floatingTagsAndStatuses[tag.index - 1]?.[TAG_ID];
      return !id || Boolean(tag.singleUseId);
    });
  };
  const originalReset = proto.resetTags;
  proto.resetTags = function(...args) {
    const promise = this._litmQolGroupRoll ? Promise.resolve() : Promise.resolve(originalReset.apply(this, args));
    if (this._litmQolRollContext) this._litmQolRollContext.resetPromise = promise;
    return promise;
  };
  const originalShow = proto.addShowDicePromise;
  proto.addShowDicePromise = function(promises, roll) {
    const context = this._litmQolRollContext;
    if (context) {
      const render = roll.render;
      roll.render = async function(...args) {
        const html = await render.apply(this, args);
        return `${html}<span hidden class="litm-qol-roll-context" data-context="${foundry.utils.escapeHTML(JSON.stringify(context.data))}"></span>`;
      };
    }
    return originalShow.call(this, promises, roll);
  };
  const originalExecute = proto.executeRoll;
  proto.executeRoll = async function(values) {
    if (this._litmQolRollContext) return;
    if (this._litmQolHelpPending) { ui.notifications.warn("Wait for the contribution review or close this roll to cancel it."); return; }
    const applied = DiceRollApp.applyRulesToSelectedTags(this.selectedTags, this.selectedGmTags, this.selectedStoryTags, this.challengeTags);
    const uses = new Map();
    for (const tag of applied) {
      const id = tag.singleUseId ?? (tag.source === "floating-tag" ? this.actor.system.floatingTagsAndStatuses[tag.index - 1]?.[TAG_ID] : null);
      const use = id ? { actorUuid: this.actor.uuid, id } : tag.helperTagSingleUse && tag.helperSingleUseRecordId
        ? { actorUuid: game.actors.get(tag.helperActorId)?.uuid, id: tag.helperSingleUseRecordId } : null;
      if (use?.actorUuid) uses.set(`${use.actorUuid}:${use.id}`, use);
      if (use) tag.toBurn = false;
    }
    for (const use of uses.values()) {
      const actor = use.actorUuid === this.actor.uuid ? this.actor : await fromUuid(use.actorUuid);
      const record = actor && getSingleUseRecords(actor).find(record => record.id === use.id);
      if (!record || wasInvoked(use.actorUuid, use.id)) {
        ui.notifications.warn("A selected single-use tag has already been used. Refresh the selection before rolling again.");
        return;
      }
    }
    let help;
    try { help = captureHelpBookkeeping(this, applied); }
    catch (error) { ui.notifications.warn(error.message); return; }
    let finish;
    const context = { data: { id: foundry.utils.randomID(), rollType: this.rollType, actorId: this.actor.id, singleUse: [...uses.values()], help, group: clone(this._litmQolGroupRoll ?? null) },
      done: new Promise(resolve => { finish = resolve; }) };
    this._litmQolRollContext = context;
    executions.set(context.data.id, context);
    try { return await originalExecute.call(this, values); }
    finally {
      try { await context.resetPromise; }
      finally { finish(); executions.delete(context.data.id); this._litmQolRollContext = null; }
    }
  };
  Object.defineProperty(proto, PATCHED, { value: true });
}

Hooks.on("preCreateChatMessage", (message, data) => {
  const root = document.createElement("div");
  root.innerHTML = data.content ?? message.content ?? "";
  const marker = root.querySelector(".litm-qol-roll-context[data-context]");
  if (!marker) return;
  const context = JSON.parse(marker.dataset.context);
  marker.remove();
  const flags = clone(data.flags ?? message.flags ?? {});
  flags[MODULE_ID] = { ...flags[MODULE_ID], rollContext: context };
  if (flags[SYSTEM_ID]?.detailedSpend?.diceRollHTML) {
    const dice = document.createElement("div");
    dice.innerHTML = flags[SYSTEM_ID].detailedSpend.diceRollHTML;
    dice.querySelectorAll(".litm-qol-roll-context").forEach(marker => marker.remove());
    flags[SYSTEM_ID].detailedSpend.diceRollHTML = dice.innerHTML;
  }
  const update = { flags, content: root.innerHTML };
  if (context.group) update.speaker = { alias: game.i18n.localize("MIST_ENGINE.COLLAB.GroupTitle"), actor: null, token: null, scene: null };
  message.updateSource(update); Object.assign(data, update);
});

async function consumeForMessage(message) {
  const context = message.getFlag(MODULE_ID, "rollContext");
  if (!context || !(context.singleUse?.length || context.help?.burns?.length || context.help?.weaknesses?.length || context.help?.relationships?.length || context.help?.fellowshipTags?.length)) return;
  try {
    await executions.get(context.id)?.done;
    await dispatch({ action: "consume", messageUuid: message.uuid });
  } catch (error) {
    await message.update({ [`flags.${MODULE_ID}.singleUseCleanupError`]: true }).catch(() => {});
    reportError(error);
  }
}
Hooks.on("createChatMessage", (message, _options, userId) => {
  if (userId === game.user.id) void consumeForMessage(message);
});
Hooks.on("renderChatMessageHTML", (message, root) => {
  if (message.getFlag(MODULE_ID, "singleUseCleanupError") && (message.isAuthor || game.user.isGM)) {
    const button = document.createElement("button"); button.type = "button";
    button.textContent = "Retry roll tag bookkeeping";
    button.addEventListener("click", () => consumeForMessage(message)); root.append(button);
  }
});
Hooks.on("preUpdateActor", (actor, changes) => {
  const tags = changes["system.floatingTagsAndStatuses"] ?? changes.system?.floatingTagsAndStatuses;
  if (Array.isArray(tags)) for (const tag of tags) if (tag[TAG_ID]) tag.toBurn = false;
});

export function registerSingleUseSocket(api = socketlib) {
  socket = api.registerModule(MODULE_ID);
  socket.register("singleUseOperation", function(payload) { return runSingleUseOperation(payload, this.socketdata.userId); });
}
Hooks.once("socketlib.ready", () => registerSingleUseSocket());
Hooks.once("ready", async () => {
  for (const actor of game.actors) {
    if (!["character", "litm-character"].includes(actor.type)) continue;
    if ((game.users.activeGM ? game.user.id === game.users.activeGM.id : owner(actor, game.user)) && getSingleUseRecords(actor).some(record => !record.schemaVersion)) {
      try { await migrateLegacyTags(actor); } catch (error) { reportError(error); }
    }
  }
});
