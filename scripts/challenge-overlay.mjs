import { importSystemModule } from "./system-imports.mjs";

const MODULE_ID = "litm-smeeth-qol";
const ENTRY_ID = "litmQolChallengeOverlayId";
const REVEALED = "challengeOverlayRevealed";
const PATCHED = Symbol.for(`${MODULE_ID}.challengeOverlay`);
let operations = Promise.resolve();
let refreshQueued = false;
let SceneApp;
const clone = value => foundry.utils.deepClone(value);
const isStatus = entry => entry?.isStatus === true || Number(entry?.value) > 0;
const rootElement = html => html?.querySelectorAll ? html : html?.[0];

export function extendChallengeOverlaySchema() {
  if (game.system.id !== "mist-engine-fvtt") return;
  const entry = CONFIG.Actor?.dataModels?.["litm-npc"]?.schema.fields.floatingTagsAndStatuses?.element;
  if (entry && !entry.fields[ENTRY_ID]) entry.extendFields({
    [ENTRY_ID]: new foundry.data.fields.StringField({ required: false, blank: true, initial: "" })
  });
}

function viewedScene() {
  return SceneApp?.instance?.getCurrentScene?.() ?? game.scenes?.current ?? globalThis.canvas?.scene;
}

export function challengeOverlayGroups(scene = viewedScene(), user = game.user) {
  const groups = [];
  for (const token of scene?.tokens?.contents ?? []) {
    if (token.actor?.type !== "litm-npc" || (!user.isGM && token.hidden)) continue;
    const revealed = token.getFlag(MODULE_ID, REVEALED) ?? {};
    const tags = (token.actor.system.floatingTagsAndStatuses ?? [])
      .filter(entry => entry.name?.trim() && !entry.expired && !entry.burned)
      .filter(entry => user.isGM || (entry[ENTRY_ID] && revealed[entry[ENTRY_ID]] === true))
      .map(entry => ({ name: entry.name, isStatus: isStatus(entry), value: entry.value ?? 0,
        positive: entry.positive !== false, selected: entry.selected === true,
        might: entry.might ?? 0, mightIcon: entry.mightIcon ?? "",
        revealed: Boolean(entry[ENTRY_ID] && revealed[entry[ENTRY_ID]] === true) }))
      .sort((a, b) => Number(a.isStatus) - Number(b.isStatus));
    if (tags.length) groups.push({ tokenId: token.id, name: token.name || token.actor.name, tags });
  }
  return groups;
}

/** Save visibility on the token; a tag's identity survives native edits and sorting. */
export function setChallengeEntryVisibility(token, expected, visible) {
  const task = operations.then(async () => {
    if (!game.user.isGM) throw new Error("Only the Narrator can reveal Challenge tags and statuses.");
    if (!token?.parent?.tokens?.get(token.id) || token.actor?.type !== "litm-npc") {
      throw new Error("This Challenge token is no longer in the scene.");
    }
    const entries = clone(token.actor.system.floatingTagsAndStatuses ?? []);
    const entry = expected.id ? entries.find(entry => entry[ENTRY_ID] === expected.id) : entries[expected.index];
    if (!entry || entry.name !== expected.name || isStatus(entry) !== expected.isStatus) {
      throw new Error("This tag or status changed. Refresh the Scene Tags dialog and try again.");
    }
    if (!entry[ENTRY_ID]) {
      entry[ENTRY_ID] = foundry.utils.randomID();
      await token.actor.update({ "system.floatingTagsAndStatuses": entries });
    }
    await token.update({ [`flags.${MODULE_ID}.${REVEALED}.${entry[ENTRY_ID]}`]: visible === true });
    queueChallengeOverlayRefresh();
    return true;
  });
  operations = task.catch(() => {});
  return task;
}

export function decorateChallengeVisibility(app, html) {
  const root = rootElement(html);
  if (!game.user.isGM || !root) return;
  const scene = app.getCurrentScene?.();
  for (const row of root.querySelectorAll('.floating-tag-and-status-entry[data-token-id]')) {
    row.querySelectorAll('.litm-qol-challenge-visibility').forEach(button => button.remove());
    const token = scene?.tokens.get(row.dataset.tokenId);
    const index = Number(row.dataset.index), entry = token?.actor?.system.floatingTagsAndStatuses?.[index];
    if (token?.actor?.type !== "litm-npc" || !entry?.name?.trim()) continue;
    const visible = Boolean(entry[ENTRY_ID] && token.getFlag(MODULE_ID, REVEALED)?.[entry[ENTRY_ID]] === true);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'litm-qol-challenge-visibility';
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute('aria-label', `${visible ? 'Hide' : 'Reveal'} ${entry.name} ${visible ? 'from' : 'to'} players`);
    button.dataset.tooltip = visible ? 'Shown on players’ scene overlays. Click to hide.' : 'Hidden from players’ scene overlays. Click to reveal.';
    const icon = document.createElement('i'); icon.className = `fa-solid ${visible ? 'fa-eye' : 'fa-eye-slash'}`;
    icon.setAttribute('aria-hidden', 'true'); button.append(icon);
    const expected = { id: entry[ENTRY_ID], index, name: entry.name, isStatus: isStatus(entry) };
    button.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      try { await setChallengeEntryVisibility(token, expected, !visible); }
      catch (error) { ui.notifications.error(error.message); }
      finally { button.disabled = false; }
    });
    row.querySelector('.fts-input-name')?.append(button);
  }
}

export function renderChallengeOverlay(root, groups, user = game.user) {
  root = rootElement(root);
  if (!root) return;
  root.querySelectorAll('.litm-qol-challenge-overlay').forEach(element => element.remove());
  const container = root.querySelector('.litm-sto');
  if (!container || !groups.length) return;
  const section = document.createElement('div'); section.className = 'litm-sto-row litm-qol-challenge-overlay';
  const caption = document.createElement('span'); caption.className = 'litm-sto-caption'; caption.textContent = 'Challenges';
  const list = document.createElement('div'); list.className = 'litm-sto-theme-groups'; section.append(caption, list);
  for (const group of groups) {
    const line = document.createElement('div'); line.className = 'litm-sto-theme-group'; line.dataset.tokenId = group.tokenId;
    const name = document.createElement('span'); name.className = 'litm-sto-theme-name'; name.textContent = group.name;
    const tags = document.createElement('div'); tags.className = 'litm-sto-tags'; line.append(name, tags);
    for (const entry of group.tags) {
      const tag = document.createElement('span');
      tag.className = `litm-sto-tag ${entry.isStatus ? 'status' : 'tag'}${entry.positive ? '' : ' negative'}${entry.selected ? ' selected' : ''}`;
      if (user.isGM && !entry.revealed) { tag.classList.add('litm-qol-overlay-unrevealed'); tag.title = 'Hidden from players'; }
      if (entry.might && ['origin', 'adventure', 'greatness'].includes(entry.mightIcon)) {
        const might = document.createElement('i'); might.className = `might-icon ${entry.mightIcon}`; tag.append(might);
      }
      tag.append(document.createTextNode(entry.name + (entry.isStatus ? `-${entry.value}` : ''))); tags.append(tag);
    }
    list.append(line);
  }
  container.append(section);
}

export function installChallengeOverlay(MistSceneApp, Overlay) {
  SceneApp = MistSceneApp;
  if (Overlay.prototype[PATCHED]) return;
  Object.defineProperty(Overlay.prototype, PATCHED, { value: true });
  const prepare = Overlay.prototype._prepareContext;
  Overlay.prototype._prepareContext = async function (...args) {
    const context = await prepare.apply(this, args);
    context.challengeTagGroups = challengeOverlayGroups();
    context.isEmpty = context.isEmpty && context.challengeTagGroups.length === 0;
    return context;
  };
  const render = Overlay.prototype._onRender;
  Overlay.prototype._onRender = async function (context, ...args) {
    await render.call(this, context, ...args);
    renderChallengeOverlay(this.element, context.challengeTagGroups ?? []);
  };
  // Native UI collapses linked duplicates; expose each token's own visibility controls.
  const characters = MistSceneApp.prototype._prepareContextForCharacters;
  MistSceneApp.prototype._prepareContextForCharacters = async function (...args) {
    const context = await characters.apply(this, args);
    if (!game.user.isGM) return context;
    const original = context.challenges ?? [];
    context.challenges = (this.getCurrentScene()?.tokens.contents ?? []).filter(t => t.actor?.type === 'litm-npc').map(token => {
      const base = original.find(entry => entry.tokenId === token.id) ?? original.find(entry => entry.id === token.actor.id);
      return { ...base, tokenId: token.id, name: token.name || token.actor.name };
    });
    return context;
  };
}

export function queueChallengeOverlayRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    const overlay = ui.litmSceneTags, app = SceneApp?.instance;
    if (overlay?.rendered) overlay.render({ force: false });
    if (app?.rendered && !app.minimized) app.render({ force: false });
  });
}

Hooks.once('init', extendChallengeOverlaySchema);
Hooks.once('setup', extendChallengeOverlaySchema);
Hooks.once('ready', async () => {
  if (game.system.id !== 'mist-engine-fvtt') return;
  try {
    const [{ MistSceneApp }, { MistSceneTagsOverlay }] = await Promise.all([
      importSystemModule('apps/scene-app.mjs'), importSystemModule('apps/scene-tags-overlay.mjs')
    ]);
    installChallengeOverlay(MistSceneApp, MistSceneTagsOverlay);
    Hooks.on('renderApplicationV2', (app, html) => {
      if (app instanceof MistSceneApp) decorateChallengeVisibility(app, html);
    });
    MistSceneTagsOverlay.refresh();
    queueChallengeOverlayRefresh();
  } catch (error) { console.error(`${MODULE_ID} | Challenge overlay could not initialize.`, error); }
});
Hooks.on('updateActor', actor => { if (actor.type === 'litm-npc') queueChallengeOverlayRefresh(); });
Hooks.on('updateToken', (_token, changes) => {
  if (Object.keys(changes).some(key => !['x', 'y', 'rotation', 'elevation', '_id'].includes(key))) queueChallengeOverlayRefresh();
});
for (const hook of ['createToken', 'deleteToken', 'canvasReady', 'updateScene', 'updateActorDelta']) Hooks.on(hook, queueChallengeOverlayRefresh);
