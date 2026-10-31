import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { importSystemModule } from "./system-imports.mjs";
const MODULE_ID = "litm-smeeth-qol", SYSTEM_ID = "mist-engine-fvtt", FORETOLD = "as-foretold", MEET = "meet-it-head-on", ENDS = "not-how-it-ends";
const STATE = "foretoldState";
const clone = value => foundry.utils.deepClone(value);
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase().replace(/^meet it head on$/, "meet it head-on");
const has = (theme, name) => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === normalize(name));
const isHero = actor => ["character", "litm-character"].includes(actor?.type);
const mayUse = (message, user) => user?.isGM || (message.author?.id ?? message.user?.id) === user?.id;
const cards = new Map();
let operation;
export const configureDestinyOperations = callback => { operation = callback; };
Hooks.once("init", () => game.settings.register(MODULE_ID, STATE, { scope: "world", config: false, type: Object, default: { pending: [], claims: {} } }));
const stateFor = () => clone(game.settings.get(MODULE_ID, STATE) || { pending: [], claims: {} });
const setState = state => game.settings.set(MODULE_ID, STATE, state);
const controls = (actor, user) => Boolean(user && (user.isGM || actor?.testUserPermission(user, "OWNER")));
async function ownedTheme(uuid, user) {
  const theme = await fromUuid(uuid), actor = theme?.parent;
  if (!isHero(actor) || !controls(actor, user) || !(game.user.isGM || actor.isOwner)) throw new Error("Only the Hero’s owner or Narrator can use this improvement.");
  return { actor, theme };
}
async function validGrant(grant) {
  const theme = await fromUuid(grant.themeUuid);
  return has(theme, "As Foretold") && specialUsed(theme, FORETOLD) && theme.getFlag(MODULE_ID, "foretoldGrant")?.id === grant.id;
}
function requiresNarrator() { if (!game.user.isGM) throw new Error("An active Narrator is required to coordinate As Foretold across clients."); }
async function armForetold(payload, user) {
  requiresNarrator();
  const { actor, theme } = await ownedTheme(payload.themeUuid, user);
  if (!has(theme, "As Foretold")) throw new Error("As Foretold is no longer active on this theme.");
  const state = stateFor(); state.pending ??= []; state.claims ??= {};
  if (payload.used === false) {
    if (Object.values(state.claims).some(claim => claim.themeUuid === theme.uuid && claim.state === "reserved")) throw new Error("As Foretold is being used for a roll. Wait for that roll to finish.");
    state.pending = state.pending.filter(grant => grant.themeUuid !== theme.uuid);
    await setState(state);
    await theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.${FORETOLD}`]: false, [`flags.${MODULE_ID}.-=foretoldGrant`]: null });
    return true;
  }
  if (specialUsed(theme, FORETOLD)) return true;
  const grant = { id: foundry.utils.randomID(), themeUuid: theme.uuid, actorUuid: actor.uuid };
  await theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.${FORETOLD}`]: true, [`flags.${MODULE_ID}.foretoldGrant`]: grant });
  try { state.pending.push(grant); await setState(state); }
  catch (error) {
    await theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.${FORETOLD}`]: false, [`flags.${MODULE_ID}.-=foretoldGrant`]: null }).catch(() => {});
    throw error;
  }
  return true;
}
export async function pruneForetoldPending() {
  if (!game.user.isGM) return;
  const state = stateFor(), valid = [];
  for (const grant of state.pending ?? []) if (await validGrant(grant)) valid.push(grant);
  if (valid.length !== (state.pending ?? []).length) { state.pending = valid; await setState(state); }
}
async function claimForetold(payload, user) {
  requiresNarrator();
  const actor = await fromUuid(payload.actorUuid);
  if (!isHero(actor) || !controls(actor, user) || !payload.executionId) throw new Error("You cannot use As Foretold for this roll.");
  const state = stateFor(); state.pending ??= []; state.claims ??= {};
  if (state.claims[payload.executionId]) return state.claims[payload.executionId];
  let grant, changed = false;
  while (state.pending.length) {
    const next = state.pending.shift(); changed = true;
    if (await validGrant(next)) { grant = next; break; }
  }
  if (grant) {
    grant = { ...grant, executionId: payload.executionId, rollerUuid: actor.uuid, userId: user.id, state: "reserved" };
    state.claims[payload.executionId] = grant;
  }
  if (changed) await setState(state);
  return grant ?? null;
}
async function finishForetold(payload, user) {
  requiresNarrator();
  const state = stateFor(), claim = state.claims?.[payload.executionId];
  if (!claim) return true;
  if (!(user?.isGM || user?.id === claim.userId)) throw new Error("You cannot finish another player’s As Foretold roll.");
  if (payload.kind === "release") {
    if (claim.state === "completed") return true;
    delete state.claims[payload.executionId];
    if (await validGrant(claim)) state.pending.unshift({ id: claim.id, themeUuid: claim.themeUuid, actorUuid: claim.actorUuid });
    await setState(state);
    return true;
  }
  const message = await fromUuid(payload.messageUuid), context = message?.getFlag(MODULE_ID, "rollContext");
  if (!message || context?.foretold?.id !== claim.id || context.foretold.executionId !== payload.executionId) throw new Error("No completed As Foretold result was found.");
  if (claim.state !== "completed") {
    state.claims[payload.executionId] = { ...claim, state: "completed", messageUuid: message.uuid };
    // Keep recent receipts for retries without growing the hidden setting forever.
    const completed = Object.keys(state.claims).filter(key => state.claims[key].state === "completed");
    for (const key of completed.slice(0, Math.max(0, completed.length - 200))) delete state.claims[key];
    await setState(state);
  }
  const theme = await fromUuid(claim.themeUuid);
  if (theme?.getFlag(MODULE_ID, "foretoldGrant")?.id === claim.id) await theme.update({ [`flags.${MODULE_ID}.-=foretoldGrant`]: null });
  return true;
}

export async function handleDestinyTracker(theme, key, used) {
  if (![FORETOLD, MEET].includes(key)) return false;
  if (!operation) throw new Error("Destiny automation is not ready. Reload the client.");
  if (key === FORETOLD) { await operation({ kind: "arm", themeUuid: theme.uuid, used }); return true; }
  if (!used) { await operation({ kind: "meet", themeUuid: theme.uuid, used: false }); return true; }
  if (specialUsed(theme, key)) return true;
  const pending = theme.getFlag(MODULE_ID, "destinyPending")?.[MEET];
  let result;
  if (!pending) {
    result = await foundry.applications.api.DialogV2.wait({
      window: { title: "Meet It Head-On" }, classes: ["litm-qol-system-dialog"],
      content: `<p>Choose what your Hero gains to represent their readiness.</p><label>Gain<select name="kind"><option value="tag">Story tag</option><option value="status">Tier-2 status</option></select></label><label>Name<input name="name" type="text" maxlength="200" autofocus></label>`,
      buttons: [{ action: "cancel", label: "Cancel", callback: () => null },
        { action: "create", label: "Create", callback: (_event, button) => ({ gainKind: button.form.elements.kind.value, name: button.form.elements.name.value.trim() }) }], rejectClose: false
    });
    if (!result) return true;
  }
  await operation({ kind: "meet", themeUuid: theme.uuid, used: true, ...result });
  return true;
}
async function meetHeadOn(payload, user) {
  const { actor, theme } = await ownedTheme(payload.themeUuid, user);
  if (!has(theme, "Meet It Head-On")) throw new Error("Meet It Head-On is no longer active on this theme.");
  const path = `flags.${MODULE_ID}.${SPECIAL_USES}.${MEET}`;
  if (payload.used === false) { await theme.update({ [path]: false }); return true; }
  if (specialUsed(theme, MEET)) return true;
  const pending = clone(theme.getFlag(MODULE_ID, "destinyPending") ?? {});
  if (!pending[MEET]) {
    const name = String(payload.name ?? "").trim();
    if (!name || name.length > 200 || !["tag", "status"].includes(payload.gainKind)) throw new Error("Choose a story tag or status and enter a name of 1–200 characters.");
    pending[MEET] = { id: foundry.utils.randomID(), name, gainKind: payload.gainKind };
    await theme.update({ [`flags.${MODULE_ID}.destinyPending`]: pending });
  }
  const intent = pending[MEET], receipts = clone(actor.getFlag(MODULE_ID, "destinyGains") ?? []), receipt = `${theme.uuid}:${intent.id}`;
  if (!receipts.includes(receipt)) {
    const status = intent.gainKind === "status";
    const entry = { name: intent.name, description: "", isStatus: status, positive: true, value: status ? 2 : 0,
      markings: [false, status, false, false, false, false], selected: false, burned: false, toBurn: false };
    let tags = clone(actor.system.floatingTagsAndStatuses ?? []);
    if (status) {
      const { FloatingTagAndStatusAdapter } = await importSystemModule("lib/floating-tag-and-status-adapter.mjs");
      tags = FloatingTagAndStatusAdapter.withStatusStacked(tags, entry);
    } else tags.push(entry);
    receipts.push(receipt);
    await actor.update({ "system.floatingTagsAndStatuses": tags, [`flags.${MODULE_ID}.destinyGains`]: receipts });
  }
  await theme.update({ [path]: true, [`flags.${MODULE_ID}.destinyPending.-=${MEET}`]: null });
  return true;
}

export function captureDestinyThemes(app) {
  if (!["quick", "detailed", "reaction"].includes(app.rollType)) return [];
  const actors = app._litmQolGroupRoll ? (app._litmQolGroupRoll.actorIds ?? []).map(id => game.actors.get(id)).filter(Boolean) : [app.actor];
  const sources = [];
  for (const actor of actors) for (const theme of actor?.items ?? []) if (has(theme, "Not How It Ends") && !specialUsed(theme, ENDS)) {
    sources.push({ actorUuid: actor.uuid, actorId: actor.id, itemId: theme.id });
  }
  return sources;
}
function consequences(message) {
  const context = message.getFlag(MODULE_ID, "rollContext");
  if (!["quick", "detailed", "reaction"].includes(context?.rollType)) return false;
  const state = message.getFlag(SYSTEM_ID, "detailedSpend");
  if (state) return state.consequenceResult < 1 || Boolean(state.pushYourLuck);
  const root = document.createElement("div"); root.innerHTML = message.content;
  return Boolean(root.querySelector('.consequence-result-negative,.consequence-result-neutral'));
}
function endsSource(message, entry, actor) {
  const theme = actor?.items.get(entry.itemId), used = Object.values(message.getFlag(MODULE_ID, "notHowItEnds") ?? {});
  return !used.some(result => result.actorUuid === actor?.uuid) && has(theme, "Not How It Ends") && (!specialUsed(theme, ENDS)
    || theme.getFlag(MODULE_ID, "specialImprovementMessages")?.[ENDS] === message.uuid) ? { actor, theme } : null;
}
export function notHowItEndsCandidates(message) {
  if (!consequences(message)) return [];
  return (message.getFlag(MODULE_ID, "rollContext")?.destinyThemes ?? []).map(entry => {
    const actor = globalThis.fromUuidSync?.(entry.actorUuid) ?? game.actors.get(entry.actorId);
    return actor?.uuid === entry.actorUuid ? endsSource(message, entry, actor) : null;
  }).filter(Boolean);
}
async function avoidConsequences(payload, user) {
  const message = await fromUuid(payload.messageUuid);
  if (!message || !mayUse(message, user)) throw new Error("Only the roller or Narrator can use Not How It Ends.");
  if (!consequences(message)) throw new Error("This roll has no Consequences to avoid.");
  let choice;
  for (const entry of message.getFlag(MODULE_ID, "rollContext")?.destinyThemes ?? []) {
    const actor = await fromUuid(entry.actorUuid), theme = actor?.items.get(entry.itemId);
    const existing = Object.values(message.getFlag(MODULE_ID, "notHowItEnds") ?? {}).find(result => result.actorUuid === actor?.uuid);
    if (theme?.uuid === payload.themeUuid && existing?.themeUuid === theme.uuid) return true;
    const source = endsSource(message, entry, actor);
    if (source?.theme.uuid === payload.themeUuid) { choice = source; break; }
  }
  if (!choice || !controls(choice.actor, user) || !(game.user.isGM || choice.actor.isOwner)) throw new Error("Not How It Ends is no longer available to this Hero.");
  await choice.theme.update({ [`flags.${MODULE_ID}.${SPECIAL_USES}.${ENDS}`]: true,
    [`flags.${MODULE_ID}.specialImprovementMessages.${ENDS}`]: message.uuid });
  const results = Object.values(clone(message.getFlag(MODULE_ID, "notHowItEnds") ?? {}));
  results.push({ actorUuid: choice.actor.uuid, themeUuid: choice.theme.uuid, actorName: choice.actor.name });
  await message.update({ [`flags.${MODULE_ID}.notHowItEnds`]: results });
  return true;
}
export async function applyDestinyOperation(payload, user) {
  if (payload.kind === "arm") return armForetold(payload, user);
  if (payload.kind === "claim") return claimForetold(payload, user);
  if (["commit", "release"].includes(payload.kind)) return finishForetold(payload, user);
  if (payload.kind === "meet") return meetHeadOn(payload, user);
  if (payload.kind === "avoid") return avoidConsequences(payload, user);
  throw new Error("Unknown Destiny action.");
}
export async function completeForetold(message, user) {
  const grant = message.getFlag(MODULE_ID, "rollContext")?.foretold;
  if (grant) await finishForetold({ kind: "commit", executionId: grant.executionId, messageUuid: message.uuid }, user);
}

export async function restoreForetoldForPrediction(message, user) {
  const grant = message.getFlag(MODULE_ID, "rollContext")?.foretold;
  if (!grant) return;
  requiresNarrator();
  if (!mayUse(message, user)) throw new Error("You cannot restore this As Foretold use.");
  const state = stateFor(), claim = state.claims?.[grant.executionId];
  if (claim?.reversed || state.pending?.some(entry => entry.id === grant.id)) return;
  const theme = await fromUuid(grant.themeUuid);
  if (!theme || !specialUsed(theme, FORETOLD)) return;
  const latest = Object.values(state.claims ?? {}).filter(entry => entry.themeUuid === grant.themeUuid).at(-1);
  if (latest && latest.executionId !== grant.executionId) return;
  const armed = theme.getFlag(MODULE_ID, "foretoldGrant");
  if (armed && armed.id !== grant.id) throw new Error("A newer As Foretold use is already queued. Resolve it before restoring this prediction.");
  if (!armed) await theme.update({ [`flags.${MODULE_ID}.foretoldGrant`]: { id: grant.id, themeUuid: grant.themeUuid, actorUuid: grant.actorUuid } });
  state.pending ??= []; state.claims ??= {};
  state.pending.unshift({ id: grant.id, themeUuid: grant.themeUuid, actorUuid: grant.actorUuid });
  state.claims[grant.executionId] = { ...(claim ?? grant), state: "completed", reversed: true, messageUuid: message.uuid };
  await setState(state);
}

export function installDestinyRolls(Class) {
  const proto = Class.prototype, key = Symbol.for(`${MODULE_ID}.destinyRolls`);
  if (proto[key]) return;
  const execute = proto.executeRoll;
  proto.executeRoll = async function(values) {
    if (this._litmQolForetoldBusy) return;
    if (!isHero(this.actor) || !["quick", "detailed", "reaction"].includes(this.rollType)) return execute.call(this, values);
    this._litmQolForetoldBusy = true; this._litmQolForetoldCanceled = false;
    const actorUuid = this.actor.uuid, rollType = this.rollType, executionId = foundry.utils.randomID();
    let grant;
    try {
      const mayCoordinate = game.user.isGM || game.users.activeGM || stateFor().pending?.length;
      if (mayCoordinate) grant = await operation({ kind: "claim", actorUuid, executionId });
      if (this._litmQolForetoldCanceled || this.actor.uuid !== actorUuid || this.rollType !== rollType) return;
      this._litmQolForetoldExecuting = grant ?? null;
      this._litmQolForetoldStarted = true;
      return await execute.call(this, values);
    } finally {
      if (grant) {
        const message = [...game.messages].find(message => message.getFlag(MODULE_ID, "rollContext")?.foretold?.executionId === executionId);
        try { await operation(message ? { kind: "commit", executionId, messageUuid: message.uuid } : { kind: "release", executionId }); }
        catch (error) {
          if (message) await message.update({ [`flags.${MODULE_ID}.singleUseCleanupError`]: true }).catch(() => {});
          ui.notifications.error(error.message || "Could not finish As Foretold. Retry the roll cleanup.");
        }
      }
      this._litmQolForetoldExecuting = null; this._litmQolForetoldStarted = false; this._litmQolForetoldBusy = false;
    }
  };
  const close = proto._onClose;
  proto._onClose = function(...args) {
    if (this._litmQolForetoldBusy && !this._litmQolForetoldStarted) this._litmQolForetoldCanceled = true;
    return close?.apply(this, args);
  };
  Object.defineProperty(proto, key, { value: true });
}
export function renderDestinyActions(message, root, use) {
  root.querySelectorAll('.litm-qol-destiny-action,.litm-qol-destiny-note').forEach(element => element.remove());
  const results = Object.values(message.getFlag(MODULE_ID, 'notHowItEnds') ?? {}), group = message.getFlag(MODULE_ID, 'rollContext')?.group;
  for (const result of results) {
    const note = document.createElement('p'); note.className = 'litm-qol-destiny-note'; note.textContent = group
      ? `Not How It Ends: ${result.actorName} avoids the Consequences for this group action.`
      : 'Not How It Ends: avoid the Consequences that hinder your Destiny.';
    (root.querySelector('.roll-card') ?? root).append(note);
  }
  if (!mayUse(message, game.user)) return;
  let shown = false;
  for (const { actor, theme } of notHowItEndsCandidates(message)) {
    if (!(game.user.isGM || actor.isOwner)) continue;
    shown = true;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'litm-qol-destiny-action'; button.textContent = 'Not How It Ends — Avoid Consequences';
    button.dataset.tooltip = 'Once per session. Use when these Consequences would hinder your Destiny.';
    button.addEventListener('click', async () => {
      if (button.disabled) return; button.disabled = true;
      try { await use({ messageUuid: message.uuid, themeUuid: theme.uuid }); }
      catch (error) { ui.notifications.error(error.message); }
      finally { renderDestinyActions(message, root, use); }
    });
    (root.querySelector('.roll-card') ?? root).append(button);
  }
  if (shown) cards.set(message.uuid, { root, refresh: () => renderDestinyActions(message, root, use) }); else cards.delete(message.uuid);
}
Hooks.on('updateItem', item => {
  if (item.type !== 'themebook') return;
  for (const [id, card] of cards) { if (card.root.isConnected) card.refresh(); else cards.delete(id); }
});
