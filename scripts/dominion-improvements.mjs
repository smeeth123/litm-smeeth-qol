import { SPECIAL_USES, specialUsed } from "./circumstance-improvements.mjs";
import { sceneTagRecipientsShared } from "./scene-recipients.mjs";
import { reducedStatus } from "./status-reduction.mjs";
import { importSystemModule } from "./system-imports.mjs";
const MODULE_ID = "litm-smeeth-qol", DECREE_ID = "litmQolDominionId";
const clone = value => foundry.utils.deepClone(value);
const normalize = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const names = { "good-help-is-hard-to-find": "Good Help Is Hard to Find", "my-word-is-absolute": "My Word Is Absolute", regalia: "Regalia", "untarnished-glory": "Untarnished Glory" };
const has = (theme, name) => theme?.type === "themebook" && !theme.system.options?.isStoryTheme
  && theme.system.specialImprovements?.some(entry => entry.active && normalize(entry.name) === normalize(name));
const snapshot = status => JSON.stringify({ name: status.name, isStatus: status.isStatus, positive: status.positive, markings: status.markings });
let operation;
export const configureDominionUsage = callback => { operation = callback; };
export function extendDominionSchema() {
  if (game.system.id !== "mist-engine-fvtt") return;
  for (const Model of new Set([...Object.values(CONFIG.Actor.dataModels), CONFIG.Item?.dataModels?.["scene-data"]].filter(Boolean))) {
    const entry = Model.schema.fields.floatingTagsAndStatuses?.element;
    if (entry && !entry.fields[DECREE_ID]) entry.extendFields({ [DECREE_ID]: new foundry.data.fields.StringField({ required: false, blank: true, initial: "" }) });
  }
}
Hooks.once("init", extendDominionSchema);
Hooks.once("setup", extendDominionSchema);
function statusTargets(theme, sceneId, user = game.user) {
  const targets = new Map([[theme.parent.uuid, theme.parent]]), scene = game.scenes?.get(sceneId);
  for (const actor of sceneTagRecipientsShared(scene, user)) targets.set(actor.uuid, actor);
  const data = scene && game.items.find(item => item.type === "scene-data" && item.system.sceneKey === scene.id);
  if (data) targets.set(data.uuid, data);
  return [...targets.values()];
}
export function gloryChoices(theme, sceneId, user = game.user) {
  const choices = [];
  for (const target of statusTargets(theme, sceneId, user)) {
    if (!(user.isGM || target.testUserPermission(user, "OWNER") || game.users.activeGM)) continue;
    for (const [index, status] of (target.system.floatingTagsAndStatuses ?? []).entries()) {
      if (!status.isStatus || status.positive !== false || !status.name?.trim() || !status.markings?.some(Boolean)) continue;
      const label = target.type === "scene-data" ? `Scene: ${game.scenes.get(sceneId)?.name ?? target.name}` : target.name;
      choices.push({ mode: "reduce", targetUuid: target.uuid, index, snapshot: snapshot(status), name: status.name,
        label: `${status.name}-${status.value} (${label})` });
    }
  }
  for (const field of ["powertags", "weaknesstags"]) for (const [index, tag] of (theme.system[field] ?? []).entries()) {
    if (tag.name?.trim() && tag.burned && !tag.planned && !tag.expired) choices.push({ mode: "recover", field, index, originalName: tag.name, label: tag.name });
  }
  return choices;
}
export async function handleDominionTracker(theme, key, used) {
  if (!names[key]) return false;
  if (!operation) throw new Error("Dominion automation is not ready. Reload the client.");
  if (!used) { await operation({ themeUuid: theme.uuid, key, used: false }); return true; }
  if (specialUsed(theme, key)) return true;
  let result = {};
  if (!theme.getFlag(MODULE_ID, "dominionPending")?.[key]) {
    if (["good-help-is-hard-to-find", "my-word-is-absolute"].includes(key)) {
      result = await foundry.applications.api.DialogV2.wait({
        window: { title: names[key] }, classes: ["litm-qol-system-dialog"],
        content: `<p>${key === "my-word-is-absolute" ? "Name a story tag for your decree. This replaces the previous decree tag created by this improvement." : "Name the story tag your advisor, craftsman, or assistant provides."}</p><label>Story tag<input name="tagName" type="text" maxlength="200" autofocus></label>`,
        buttons: [{ action: "cancel", label: "Cancel", callback: () => null },
          { action: "create", label: "Create Story Tag", callback: (_event, button) => ({ name: button.form.elements.tagName.value.trim() }) }], rejectClose: false
      });
      if (!result) return true;
    } else if (key === "untarnished-glory") {
      const sceneId = globalThis.canvas?.scene?.id ?? game.scenes?.active?.id, choices = gloryChoices(theme, sceneId), esc = foundry.utils.escapeHTML;
      if (!choices.length) throw new Error("There are no negative statuses or scratched tags available for Untarnished Glory.");
      result = await foundry.applications.api.DialogV2.wait({
        window: { title: "Untarnished Glory" }, classes: ["litm-qol-system-dialog"],
        content: `<p>Choose a negative status representing your Dominion, or recover a scratched tag from this theme. Reducing a status slides every marked box left by two tiers.</p><select name="choice"><optgroup label="Reduce a negative status by 2 tiers">${choices.map((choice, index) => choice.mode === "reduce" ? `<option value="${index}">${esc(choice.label)}</option>` : "").join("")}</optgroup><optgroup label="Recover a scratched tag">${choices.map((choice, index) => choice.mode === "recover" ? `<option value="${index}">${esc(choice.label)}</option>` : "").join("")}</optgroup></select>`,
        buttons: [{ action: "cancel", label: "Cancel", callback: () => null },
          { action: "apply", label: "Apply", callback: (_event, button) => ({ ...choices[Number(button.form.elements.choice.value)], sceneId }) }], rejectClose: false
      });
      if (!result) return true;
    }
  }
  await operation({ themeUuid: theme.uuid, key, used: true, ...result });
  return true;
}
export async function applyDominionManual(payload, user) {
  const theme = await fromUuid(payload.themeUuid), actor = theme?.parent, key = payload.key;
  if (!user || !names[key] || !has(theme, names[key]) || !["character", "litm-character"].includes(actor?.type)
      || !(user.isGM || actor.testUserPermission(user, "OWNER")) || !(game.user.isGM || actor.isOwner)) {
    throw new Error("Only the Hero’s owner or Narrator can use this improvement.");
  }
  const path = `flags.${MODULE_ID}.${SPECIAL_USES}.${key}`;
  if (payload.used === false) { await theme.update({ [path]: false }); return true; }
  if (specialUsed(theme, key)) return true;
  const pending = clone(theme.getFlag(MODULE_ID, "dominionPending") ?? {});
  if (key === "untarnished-glory" && !pending[key] && payload.mode === "recover") {
    const field = payload.field;
    if (!["powertags", "weaknesstags"].includes(field) || !Number.isInteger(payload.index)) throw new Error("Choose a scratched tag from this theme.");
    const tags = clone(theme.system[field] ?? []), tag = tags[payload.index];
    if (!tag?.name?.trim() || tag.name !== payload.originalName || !tag.burned || tag.planned || tag.expired) throw new Error("The selected scratched tag changed. Choose it again.");
    Object.assign(tag, { burned: false, toBurn: false, selected: false });
    await theme.update({ [`system.${field}`]: tags, [path]: true });
    return true;
  }
  if (key === "untarnished-glory" && !pending[key] && payload.mode !== "reduce") throw new Error("Choose a negative status to reduce or a scratched tag to recover.");
  const intent = pending[key] ?? { id: foundry.utils.randomID(), ...(["good-help-is-hard-to-find", "my-word-is-absolute"].includes(key)
    ? { name: String(payload.name ?? "").trim(), mode: "tag" } : key === "regalia" ? { mode: "regalia" }
      : { mode: payload.mode, targetUuid: payload.targetUuid, index: payload.index, snapshot: payload.snapshot, sceneId: payload.sceneId }) };
  const target = intent.mode === "reduce" ? await fromUuid(intent.targetUuid) : actor;
  const receipt = `${theme.uuid}:${intent.id}`, receipts = clone(target?.getFlag(MODULE_ID, "dominionEffects") ?? []);
  let updated;
  if (!receipts.includes(receipt)) {
    if (!target || !Array.isArray(target.system.floatingTagsAndStatuses)) {
      if (pending[key]) await theme.update({ [`flags.${MODULE_ID}.dominionPending.-=${key}`]: null });
      throw new Error("The selected status source is no longer available. Choose again.");
    }
    updated = clone(target.system.floatingTagsAndStatuses);
    if (intent.mode === "reduce") {
      const eligible = statusTargets(theme, intent.sceneId, user).some(doc => doc.uuid === target.uuid), status = updated[intent.index];
      if (!eligible || !Number.isInteger(intent.index) || !status?.isStatus || status.positive !== false || !status.markings?.some(Boolean) || snapshot(status) !== intent.snapshot) {
        if (pending[key]) await theme.update({ [`flags.${MODULE_ID}.dominionPending.-=${key}`]: null });
        throw new Error("The selected negative status changed. Choose it again.");
      }
      if (!(user.isGM || target.testUserPermission(user, "OWNER") || game.user.isGM)) throw new Error("An active Narrator or ownership of the status source is required.");
      updated[intent.index] = reducedStatus(status, 2);
    } else if (intent.mode === "regalia") {
      const { FloatingTagAndStatusAdapter } = await importSystemModule("lib/floating-tag-and-status-adapter.mjs");
      updated = FloatingTagAndStatusAdapter.withStatusStacked(updated, { name: "majestic", isStatus: true, positive: true, value: 2,
        markings: [false, true, false, false, false, false], selected: false, burned: false, toBurn: false });
    } else if (intent.mode === "tag") {
      if (!intent.name || intent.name.length > 200) throw new Error("Enter a story tag name of 1–200 characters.");
      if (key === "my-word-is-absolute") {
        const previous = theme.getFlag(MODULE_ID, "dominionDecree");
        if (previous?.id) updated = updated.filter(tag => tag[DECREE_ID] !== previous.id);
      }
      updated.push({ ...(key === "my-word-is-absolute" ? { [DECREE_ID]: intent.id } : {}), name: intent.name, description: "",
        isStatus: false, positive: true, value: 0, markings: Array(6).fill(false), selected: false, burned: false, toBurn: false });
    } else throw new Error("Choose a status to reduce or a scratched tag to recover.");
    if (!pending[key]) { pending[key] = intent; await theme.update({ [`flags.${MODULE_ID}.dominionPending`]: pending }); }
    receipts.push(receipt);
    await target.update({ "system.floatingTagsAndStatuses": updated, [`flags.${MODULE_ID}.dominionEffects`]: receipts });
  }
  const final = { [path]: true, [`flags.${MODULE_ID}.dominionPending.-=${key}`]: null };
  if (key === "my-word-is-absolute") final[`flags.${MODULE_ID}.dominionDecree`] = { id: intent.id, name: intent.name };
  await theme.update(final);
  return true;
}
