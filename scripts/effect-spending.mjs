import { reducedStatus } from "./status-reduction.mjs";
import { importSystemModule } from "./system-imports.mjs";

const MODULE_ID = "litm-smeeth-qol";
const SYSTEM_ID = "mist-engine-fvtt";
const EFFECT_ID = "litmQolEffectId";
const CHALLENGE_ID = "litmQolChallengeOverlayId";
const FLOATING = "system.floatingTagsAndStatuses";
const RECEIPTS = "rollEffectReceipts";
const clone = value => foundry.utils.deepClone(value);
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
const isStatus = entry => entry?.isStatus === true || Number(entry?.value) > 0;
const author = message => message.author?.id ?? message.user?.id;
const htmlRoot = content => { const root = document.createElement("div"); root.innerHTML = content; return root; };
const remaining = state => Math.max(0, state.total - (state.entries ?? []).reduce((sum, entry) => sum + entry.cost, 0));

export const REACTION_OPTIONS = [
  { id: "preventTag", label: "Prevent a tag from being added", cost: 2 },
  { id: "preventTagLoss", label: "Prevent the loss of a tag", cost: 2 },
  { id: "avoidIncomingStatus", label: "Avoid incoming status", cost: 1, tiered: true },
  { id: "avoidStatusLoss", label: "Avoid losing existing status", cost: 1, tiered: true }
];

export function rollSpendingState(message) {
  const detailed = message.getFlag(SYSTEM_ID, "detailedSpend");
  if (detailed) return detailed;
  const root = htmlRoot(message.content);
  const type = message.getFlag(MODULE_ID, "rollContext")?.rollType;
  const title = root.querySelector('.card-title')?.textContent.trim();
  if (type !== 'reaction' && title !== game.i18n.localize('MIST_ENGINE.ROLL_TYPES.reaction')) return null;
  const result = root.querySelector('.consequence-result-positive, .consequence-result-neutral, .consequence-result-negative');
  if (!result) return null;
  const outcome = result.classList.contains('consequence-result-positive') ? 1 : result.classList.contains('consequence-result-neutral') ? 0 : -1;
  const counter = result.querySelector('.power-counter');
  let total = Number(counter?.textContent.match(/-?\d+/)?.[0]);
  if (!Number.isFinite(total)) return null;
  // Result-changing abilities can promote an existing Reaction to 10+.
  if (outcome === 1 && counter.dataset.litmQolReactionBonusApplied !== 'true') total++;
  return { ...clone(message.getFlag(MODULE_ID, 'reactionSpend') ?? {}),
    reaction: true, total: Math.max(0, total), numPowerTags: total, consequenceResult: outcome,
    entries: clone(message.getFlag(MODULE_ID, 'reactionSpend')?.entries ?? []),
    canReact: outcome >= 0 || Boolean(message.getFlag(MODULE_ID, 'repelWitchery')) };
}

export const spendingFlag = state => state.reaction ? `flags.${MODULE_ID}.reactionSpend` : `flags.${SYSTEM_ID}.detailedSpend`;
export const canSpendRollPower = state => Boolean(state && (state.reaction ? state.canReact : state.consequenceResult >= 0 || state.litmQolOverextend));

export function allowedSpendingOptions(state, nativeOptions) {
  if (!state.reaction) return nativeOptions;
  return [...REACTION_OPTIONS, ...(state.consequenceResult === 1 ? nativeOptions : [])];
}

export function renderReactionSpending(message, root, state = rollSpendingState(message), nativeOptions = []) {
  root.querySelectorAll('.litm-qol-reaction-spend').forEach(node => node.remove());
  if (!state?.reaction || message.getFlag(MODULE_ID, 'foreseen') || (!state.canReact && !state.entries.length)) return;
  const editable = game.user.isGM || message.isAuthor;
  const section = document.createElement('div'); section.className = 'detailed-spend litm-qol-reaction-spend';
  const rem = remaining(state);
  section.innerHTML = `<div class="detailed-spend-header"><span>Power remaining</span><span class="detailed-spend-remaining">${rem} / ${state.total}</span></div>`;
  const options = document.createElement('div'); options.className = 'detailed-spend-options';
  for (const [index, option] of allowedSpendingOptions(state, nativeOptions).entries()) {
    if (index === REACTION_OPTIONS.length) {
      const divider = document.createElement('div');
      divider.className = 'litm-qol-reaction-effect-divider';
      divider.setAttribute('role', 'separator');
      options.append(divider);
    }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'detailed-spend-btn';
    button.dataset.spendOption = option.id;
    button.textContent = `${option.label ?? game.i18n.localize(option.labelKey)} (${option.cost}${option.tiered ? ' per tier' : ''})`;
    button.disabled = !editable || !state.canReact || option.cost > rem || (option.id === 'singleUse' && rem !== 1);
    options.append(button);
  }
  section.append(options);
  const list = document.createElement('ul'); list.className = 'detailed-spend-list';
  for (const [index, entry] of state.entries.entries()) {
    const li = document.createElement('li');
    const undo = document.createElement('i');
    undo.className = 'fa-solid fa-circle-xmark detailed-spend-undo';
    undo.dataset.spendUndo = String(index);
    undo.title = game.i18n.localize('MIST_ENGINE.DETAILED_SPEND.Undo');
    undo.setAttribute('aria-label', undo.title);
    undo.setAttribute('role', 'button');
    undo.setAttribute('aria-disabled', String(!editable));
    undo.tabIndex = editable ? 0 : -1;
    undo.addEventListener('keydown', event => {
      if (!editable || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault(); undo.click();
    });
    const cost = document.createElement('span'); cost.className = 'detailed-spend-cost';
    cost.textContent = `(${entry.cost})`;
    li.append(undo, document.createTextNode(` ${entry.label} `), cost);
    list.append(li);
  }
  section.append(list); (root.querySelector('.roll-card') ?? root).append(section);
}

export async function renderSpendingCard(message, state, nativeRenderer, nativeOptions) {
  if (!state.reaction) return nativeRenderer(state);
  const root = htmlRoot(message.content);
  renderReactionSpending(message, root, state, nativeOptions);
  return root.innerHTML;
}

export function effectScene(message) {
  const id = message.getFlag(MODULE_ID, 'rollContext')?.sceneId ?? message.speaker?.scene
    ?? globalThis.canvas?.scene?.id ?? game.scenes?.current?.id;
  return game.scenes?.get(id);
}

export function effectDestinations(message, user = game.user) {
  const scene = effectScene(message);
  if (!scene) return [];
  const targets = [{ key: 'scene', name: `Scene — ${scene.name}`, scene,
    doc: game.items.find(item => item.type === 'scene-data' && item.system.sceneKey === scene.id) }];
  for (const token of scene.tokens.contents) {
    if ((!user.isGM && token.hidden) || !['character', 'litm-character', 'litm-npc'].includes(token.actor?.type)) continue;
    targets.push({ key: `token:${token.id}`, name: token.name || token.actor.name, scene, token, doc: token.actor });
  }
  return targets;
}

export function effectChoices(target, kind, user = game.user) {
  const result = [];
  const add = (doc, path, label, scratchedField = 'burned') => {
    for (const [index, entry] of (foundry.utils.getProperty(doc, path) ?? []).entries()) {
      if (!(entry.name ?? entry.relationshipTag)?.trim() || entry.planned || entry.expired) continue;
      if (path === FLOATING && isStatus(entry) !== (kind === 'reduceStatus' || kind === 'giveStatus')) continue;
      if (target.doc?.type === 'litm-npc' && !user.isGM) {
        if (!entry[CHALLENGE_ID] || target.token.getFlag(MODULE_ID, 'challengeOverlayRevealed')?.[entry[CHALLENGE_ID]] !== true) continue;
      }
      if (kind === 'scratchTag' && entry[scratchedField]) continue;
      if (kind === 'recoverTag' && !entry[scratchedField]) continue;
      if (kind === 'reduceStatus' && !(Number(entry.value) > 0)) continue;
      const name = entry.name ?? entry.relationshipTag;
      const key = JSON.stringify([doc.uuid, path, entry[EFFECT_ID] ?? '', index, name, isStatus(entry)]);
      result.push({ key, doc, path, index, entry, scratchedField,
        label: `${name}${isStatus(entry) ? `-${entry.value}` : ''} (${label})` });
    }
  };
  if (!target.doc) return result;
  add(target.doc, FLOATING, target.key === 'scene' ? 'Scene' : target.doc.name, 'burned');
  if (['giveStatus', 'reduceStatus'].includes(kind) || target.doc.type === 'litm-npc' || target.key === 'scene') return result;
  for (const item of target.doc.items ?? []) {
    if (item.type === 'themebook') add(item, 'system.powertags', item.system.powertags?.[0]?.name || item.name);
    if (item.type === 'backpack') add(item, 'system.items', 'Backpack');
  }
  add(target.doc, 'system.fellowships', 'Relationship', 'scratched');
  const card = game.actors.get(target.doc.system.actorSharedSingleThemecardId);
  if (card) add(card, 'system.powertags', card.name);
  return result;
}

function tierOptions(maximum, selected = 1) {
  const limit = Math.min(6, Math.max(0, Math.floor(maximum)));
  const value = Math.max(1, Math.min(Number(selected) || 1, limit));
  return Array.from({ length: limit }, (_, index) => {
    const tier = index + 1;
    return `<option value="${tier}"${tier === value ? ' selected' : ''}>${tier}</option>`;
  }).join('');
}

async function chooseDialog(title, content, label = 'Continue', render) {
  return foundry.applications.api.DialogV2.wait({ window: { title }, classes: ['litm-qol-system-dialog'],
    content, render, buttons: [{ action: 'cancel', label: 'Cancel', callback: () => false },
      { action: 'confirm', label, callback: (_event, button) => Object.fromEntries(new FormData(button.form)) }], rejectClose: false });
}

export async function promptRollEffect(message, optionId) {
  const destinations = effectDestinations(message);
  if (!destinations.length) throw new Error('The roll’s scene is no longer available.');
  const actions = optionId === 'tag' ? [['addTag', 'Add a tag'], ['scratchTag', 'Scratch a tag'], ['recoverTag', 'Recover a tag']]
    : [['giveStatus', 'Give a status'], ['reduceStatus', 'Reduce a status']];
  const verbs = { addTag: 'Create', scratchTag: 'Scratch', recoverTag: 'Recover', giveStatus: 'Give', reduceStatus: 'Reduce' };
  const draft = { name: '', tiers: '1' };
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: optionId === 'tag' ? 'Tag Effect' : 'Status Effect' },
    position: { width: 400 }, classes: ['litm-qol-system-dialog'],
    content: `<label>Effect<select name="kind">${actions.map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label>Apply to<select name="destination">${destinations.map(target => `<option value="${escape(target.key)}"${target.key === 'scene' ? ' selected' : ''}>${escape(target.name)}</option>`).join('')}</select></label><div class="litm-qol-effect-fields standard-form"></div>`,
    buttons: [
      { action: 'cancel', label: 'Cancel', callback: () => false },
      { action: 'confirm', label: `${verbs[actions[0][0]]} and Spend ${optionId === 'tag' ? 2 : 1} Power`, default: true,
        callback: (_event, button) => Object.fromEntries(new FormData(button.form)) }
    ],
    render: (_event, app) => {
      const form = app.element.querySelector('form');
      const panel = form.querySelector('.litm-qol-effect-fields');
      const confirm = form.querySelector('[data-action="confirm"]');
      let choices = [];
      const remember = () => {
        for (const field of Object.keys(draft)) if (form.elements[field]) draft[field] = form.elements[field].value;
      };
      const updateCost = () => {
        const kind = form.elements.kind.value;
        const available = remaining(rollSpendingState(message));
        const cost = optionId === 'tag' ? 2 : Number(form.elements.tiers?.value);
        confirm.textContent = `${verbs[kind]} and Spend ${Number.isFinite(cost) && cost > 0 ? cost : 0} Power`;
        confirm.disabled = cost > available || !form.checkValidity()
          || (form.elements.name && !form.elements.name.value.trim())
          || (!['addTag', 'giveStatus'].includes(kind) && !form.elements.choice?.value);
      };
      const updateFields = () => {
        remember();
        const kind = form.elements.kind.value;
        const target = effectDestinations(message).find(target => target.key === form.elements.destination.value);
        choices = target ? effectChoices(target, kind) : [];
        const create = ['addTag', 'giveStatus'].includes(kind);
        const available = remaining(rollSpendingState(message));
        const existing = kind === 'giveStatus' && choices.length
          ? `<label>Status<select name="existingStatus"><option value="">New status</option>${choices.map(choice => `<option value="${escape(choice.key)}">${escape(choice.label)}</option>`).join('')}</select></label>` : '';
        const fields = create
          ? `<label>${kind === 'addTag' ? 'Tag' : 'Status'} name<input type="text" name="name" maxlength="200" value="${escape(draft.name)}" autofocus></label>`
          : choices.length
            ? `<label>${kind === 'reduceStatus' ? 'Status' : 'Tag'}<select name="choice" required>${choices.map(choice => `<option value="${escape(choice.key)}">${escape(choice.label)}</option>`).join('')}</select></label>`
            : `<p role="status">No eligible ${kind === 'reduceStatus' ? 'statuses' : 'tags'} at this destination.</p>`;
        const maximum = Math.min(6, available, kind === 'reduceStatus' ? choices[0]?.entry.value ?? 0 : 6);
        const tiers = optionId === 'status'
          ? `<label>Tiers<select name="tiers" required>${tierOptions(maximum, draft.tiers)}</select></label>` : '';
        panel.innerHTML = existing + fields + tiers;
        updateCost();
      };
      form.elements.kind.addEventListener('change', updateFields);
      form.elements.destination.addEventListener('change', updateFields);
      panel.addEventListener('input', event => {
        if (event.target.name === 'name' && form.elements.existingStatus) form.elements.existingStatus.value = '';
        updateCost();
      });
      panel.addEventListener('change', event => {
        if (event.target.name === 'existingStatus') {
          const choice = choices.find(choice => choice.key === event.target.value);
          form.elements.name.value = choice?.entry.name ?? '';
        }
        if (event.target.name === 'choice' && form.elements.kind.value === 'reduceStatus') {
          const choice = choices.find(choice => choice.key === event.target.value);
          const maximum = Math.min(remaining(rollSpendingState(message)), choice?.entry.value ?? 1);
          form.elements.tiers.innerHTML = tierOptions(maximum, form.elements.tiers.value);
        }
        updateCost();
      });
      updateFields();
      form.elements.name?.focus();
    },
    rejectClose: false
  });
  if (!result || typeof result !== 'object') return null;
  return { effect: result, requestId: foundry.utils.randomID() };
}

export async function promptReactionPrevention(option, available = 6) {
  if (!option.tiered) return { tiers: 1 };
  const result = await chooseDialog(option.label, `<label>Tiers avoided<select name="tiers" required>${tierOptions(available)}</select></label>`, 'Spend 1 Power', (_event, app) => {
    const form = app.element.querySelector('form');
    const confirm = form.querySelector('[data-action="confirm"]');
    const updateCost = () => {
      const tiers = Number(form.elements.tiers.value);
      confirm.textContent = `Spend ${Number.isFinite(tiers) && tiers > 0 ? tiers : 0} Power`;
      confirm.disabled = !form.checkValidity();
    };
    form.elements.tiers.addEventListener('change', updateCost); updateCost();
  });
  return result && typeof result === 'object' ? { tiers: Number(result.tiers) } : null;
}

export function extendEffectSchema() {
  if (game.system.id !== SYSTEM_ID) return;
  for (const Model of new Set([...Object.values(CONFIG.Actor.dataModels), ...Object.values(CONFIG.Item.dataModels)])) {
    for (const name of ['floatingTagsAndStatuses', 'powertags', 'items', 'fellowships']) {
      const entry = Model.schema.fields[name]?.element;
      if (entry?.fields && !entry.fields[EFFECT_ID]) entry.extendFields({
        [EFFECT_ID]: new foundry.data.fields.StringField({ required: false, blank: true, initial: '' })
      });
    }
  }
}
Hooks.once('init', extendEffectSchema);
Hooks.once('setup', extendEffectSchema);

function validTier(value) {
  const tier = Number(value);
  if (!Number.isInteger(tier) || tier < 1 || tier > 6) throw new Error('Choose between 1 and 6 tiers.');
  return tier;
}

async function planEffect(message, payload, user) {
  const effect = payload.effect;
  const kinds = payload.optionId === 'tag' ? ['addTag', 'scratchTag', 'recoverTag'] : ['giveStatus', 'reduceStatus'];
  if (!effect || !kinds.includes(effect.kind)) throw new Error('Choose the tag or status effect first.');
  const target = effectDestinations(message, user).find(target => target.key === effect.destination);
  if (!target) throw new Error('Choose a visible destination in the roll’s scene.');
  if (!target.doc && target.key === 'scene' && game.user.isGM) target.doc = await Item.create({
    name: `Scene Data: ${target.scene.name}`, type: 'scene-data', system: { sceneKey: target.scene.id }, flags: { mistmod: { hidden: true } }
  });
  let choice;
  if (['scratchTag', 'recoverTag', 'reduceStatus'].includes(effect.kind)) {
    choice = effectChoices(target, effect.kind, user).find(choice => choice.key === effect.choice);
    if (!choice) throw new Error('The selected entry changed or is no longer visible. Choose it again.');
  }
  const doc = choice?.doc ?? target.doc;
  if (!doc || !(game.user.isGM || doc.isOwner)) throw new Error('An active Narrator or ownership of the destination is required.');
  const path = choice?.path ?? FLOATING;
  const entries = clone(foundry.utils.getProperty(doc, path) ?? []);
  let before = choice ? clone(choice.entry) : null;
  let sourceIndex = choice?.index;
  let after;
  let cost = 2;
  const entryId = before?.[EFFECT_ID] || foundry.utils.randomID();
  if (before) before[EFFECT_ID] = entryId;
  if (effect.kind === 'addTag' || effect.kind === 'giveStatus') {
    const existingStatus = effect.kind === 'giveStatus' && effect.existingStatus
      ? effectChoices(target, 'giveStatus', user).find(choice => choice.key === effect.existingStatus) : null;
    if (effect.existingStatus && !existingStatus) throw new Error('The selected status changed or is no longer visible.');
    const name = String(existingStatus?.entry.name ?? effect.name ?? '').trim();
    if (!name || name.length > 200) throw new Error('Enter a name of 1–200 characters.');
    after = { name, description: '', isStatus: effect.kind === 'giveStatus', positive: existingStatus?.entry.positive !== false,
      value: 0, markings: Array(6).fill(false), selected: false, burned: false, toBurn: false };
    if (after.isStatus) {
      cost = validTier(effect.tiers); after.value = cost; after.markings[cost - 1] = true;
      const existingIndex = existingStatus?.index ?? entries.findIndex(entry => isStatus(entry) && entry.name.trim().toLowerCase() === name.toLowerCase() && (entry.positive !== false) === after.positive);
      if (existingIndex >= 0) {
        // An undisclosed Challenge status cannot be silently targeted by name.
        const visible = effectChoices(target, 'giveStatus', user).some(choice => choice.index === existingIndex);
        if (!visible) throw new Error('That existing status is not revealed to you. Choose a different status.');
        sourceIndex = existingIndex;
        before = clone(entries[existingIndex]); before[EFFECT_ID] ||= entryId;
      }
      const { FloatingTagAndStatusAdapter } = await importSystemModule('lib/floating-tag-and-status-adapter.mjs');
      const selected = existingIndex >= 0 ? [entries[existingIndex]] : [];
      after = clone(FloatingTagAndStatusAdapter.withStatusStacked(selected, after)[0]);
    }
  } else if (effect.kind === 'reduceStatus') {
    cost = validTier(effect.tiers);
    if (cost > Number(before.value)) throw new Error('Choose no more tiers than the status currently has.');
    after = reducedStatus(before, cost);
  } else after = { ...before, [choice.scratchedField]: effect.kind === 'scratchTag', selected: false, toBurn: false };
  after[EFFECT_ID] = before?.[EFFECT_ID] || entryId;
  if (doc.type === 'litm-npc' && ['addTag', 'giveStatus'].includes(effect.kind)) after[CHALLENGE_ID] ||= after[EFFECT_ID];
  const field = doc.system.constructor.schema?.fields?.[path.split('.')[1]]?.element;
  if (field?.clean) after = field.clean(after);
  const verbs = { addTag: 'Added', scratchTag: 'Scratched', recoverTag: 'Recovered', giveStatus: 'Gave', reduceStatus: 'Reduced' };
  const name = after.name ?? after.relationshipTag;
  const label = `${verbs[effect.kind]} ${name}${isStatus(after) ? ` (${cost} tier${cost === 1 ? '' : 's'})` : ''} — ${target.name}`;
  return { doc, cost, label, effect: { targetUuid: doc.uuid, destination: target.key, kind: effect.kind, path, sourceIndex, before, after, entryId: after[EFFECT_ID] } };
}

const sameEntry = (left, right) => {
  const clean = value => JSON.stringify(Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => !['selected', 'toBurn', CHALLENGE_ID].includes(key)).sort(([a], [b]) => a.localeCompare(b))));
  return clean(left) === clean(right);
};

export async function revealChallengeEntry(scene, actor, id, tokenId) {
  if (actor?.type !== 'litm-npc') return;
  if (!actor.system.floatingTagsAndStatuses.some(entry => entry[CHALLENGE_ID] === id)) {
    throw new Error('The Challenge entry is no longer available to reveal.');
  }
  const tokens = (scene?.tokens?.contents ?? []).filter(token => token.actor?.uuid === actor.uuid
    && (tokenId ? token.id === tokenId : !token.hidden));
  if (tokenId && !tokens.length) throw new Error('The Challenge token changed before its entry could be revealed.');
  for (const token of tokens) {
    if (token.getFlag(MODULE_ID, 'challengeOverlayRevealed')?.[id] === true) continue;
    await token.update({ [`flags.${MODULE_ID}.challengeOverlayRevealed.${id}`]: true });
  }
}

async function revealEffect(message, effect, doc) {
  if (!['addTag', 'giveStatus'].includes(effect.kind) || doc.type !== 'litm-npc') return;
  await revealChallengeEntry(effectScene(message), doc, effect.after[CHALLENGE_ID], effect.destination.slice(6));
}

async function writeEffect(message, entry, undo = false, user = game.user) {
  const effect = entry.qolEffect, doc = await fromUuid(effect.targetUuid);
  if (!doc || !(game.user.isGM || doc.isOwner)) throw new Error('The effect’s destination is unavailable.');
  const receipt = doc.getFlag(MODULE_ID, RECEIPTS)?.[entry.id];
  if (!undo && receipt === 'applied') { await revealEffect(message, effect, doc); return; }
  if (undo && receipt === 'undone') return;
  if (undo && receipt !== 'applied') return;
  if (!undo) {
    const target = effectDestinations(message, user).find(target => target.key === effect.destination);
    if (!target) throw new Error('The destination is no longer visible.');
    if (effect.before) {
      const eligible = effectChoices(target, effect.kind, user).some(choice => choice.doc.uuid === effect.targetUuid
        && choice.path === effect.path && sameEntry({ ...choice.entry, [EFFECT_ID]: effect.entryId }, effect.before));
      if (!eligible) throw new Error('The selected entry changed or is no longer revealed.');
    } else if (target.doc?.uuid !== effect.targetUuid) throw new Error('The destination changed. Choose it again.');
  }
  const entries = clone(foundry.utils.getProperty(doc, effect.path) ?? []);
  const expected = undo ? effect.after : effect.before;
  let index = entries.findIndex(value => value[EFFECT_ID] === effect.entryId);
  if (index < 0 && expected) {
    const candidate = entries[effect.sourceIndex];
    if (candidate && sameEntry({ ...candidate, [EFFECT_ID]: effect.entryId }, expected)) index = effect.sourceIndex;
  }
  if (expected && (index < 0 || !sameEntry({ ...entries[index], [EFFECT_ID]: effect.entryId }, expected))) {
    throw new Error('This entry changed after the effect. Resolve that change before continuing.');
  }
  const replacement = undo ? effect.before : effect.after;
  if (replacement) {
    const value = clone(replacement);
    // Keep the Narrator's current reveal identity through status adjustments.
    if (index >= 0 && entries[index][CHALLENGE_ID]) value[CHALLENGE_ID] = entries[index][CHALLENGE_ID];
    if (index >= 0) entries[index] = value; else entries.push(value);
  } else if (index >= 0) entries.splice(index, 1);
  await doc.update({ [effect.path]: entries, [`flags.${MODULE_ID}.${RECEIPTS}.${entry.id}`]: undo ? 'undone' : 'applied' });
  if (!undo) await revealEffect(message, effect, doc);
}

export async function applyRollEffect(payload, user, message, state, save) {
  if (!user?.isGM && author(message) !== user?.id) throw new Error('Only the roller or Narrator can spend this Power.');
  state.entries ??= [];
  if (payload.action === 'undo' || payload.action === 'retryEffect') {
    const entry = state.entries.find(entry => entry.id === payload.entryId);
    if (!entry?.qolEffect) throw new Error('This effect entry is no longer available.');
    if (payload.action === 'undo') {
      await writeEffect(message, entry, true, user);
      state.entries = state.entries.filter(value => value.id !== entry.id);
    } else {
      await writeEffect(message, entry, false, user); entry.effectPending = false;
    }
    await save(state); return true;
  }
  if (!payload.requestId || !/^[a-zA-Z0-9_-]{1,64}$/.test(payload.requestId)) throw new Error('The effect request is missing its identity.');
  if (state.entries.some(entry => entry.id === payload.requestId)) return true;
  if (!canSpendRollPower(state) || (state.reaction && state.consequenceResult !== 1)) throw new Error('This roll cannot spend Power on effects.');
  const plan = await planEffect(message, payload, user);
  if (plan.cost > remaining(state)) throw new Error('There is not enough Power remaining.');
  const entry = { id: payload.requestId, type: payload.optionId, cost: plan.cost, label: plan.label, qolEffect: plan.effect, effectPending: true };
  state.entries.push(entry);
  // Reserve Power before changing the destination. A failed write can be retried
  // or undone from the card without applying the effect twice.
  await save(state);
  await writeEffect(message, entry, false, user);
  entry.effectPending = false;
  await save(state);
  return true;
}

export function decoratePendingEffects(state, root) {
  for (const [index, entry] of (state?.entries ?? []).entries()) {
    if (!entry.effectPending) continue;
    const undo = root.querySelector(`[data-spend-undo="${index}"]`);
    const li = undo?.closest('li');
    if (!li || li.querySelector('[data-effect-retry]')) continue;
    const retry = document.createElement('button'); retry.type = 'button'; retry.dataset.effectRetry = entry.id;
    retry.className = 'detailed-spend-btn'; retry.textContent = 'Retry effect'; li.append(retry);
  }
}
