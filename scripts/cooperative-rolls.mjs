import { importSystemModule } from "./system-imports.mjs";
import { recordForTag } from "./single-use-tags.mjs";
const MODULE_ID = "litm-smeeth-qol";
const isCharacterActor = actor => ["character", "litm-character"].includes(actor?.type);
let helpSocket = null;
let nativeCollaboration = null;
export const canBurnContribution = tag => Boolean(tag && !tag.singleUse && ["themebook", "backpack"].includes(tag.source));
const sourceLabel = tag => ({ themebook: "power tag", backpack: "Backpack", rote: "Rote", floating: "story tag", relationship: "relationship" })[tag.source] ?? tag.source;
const helpRequests = new Map();
const helpStatusDialogs = new Map();
const helpRollApps = new Map();

function getPlayerCharacter(user) {
  const actor = user?.character;
  return isCharacterActor(actor) ? actor : null;
}

export function getAvailablePowerTags(actor) {
  if (!actor) return [];
  const native = nativeCollaboration?.contributableTags(actor);
  if (nativeCollaboration?.BURNABLE_SOURCES instanceof Set && native && native.every(entry => entry && typeof entry === "object" && entry.source)) {
    return native.flatMap(entry => {
      const source = ({ powertag: "themebook", "floating-tag": "floating", "fellowship-relationship": "relationship" })[entry.source] ?? entry.source;
      const singleUseRecord = source === "floating" ? recordForTag(actor, entry.index) : null;
      if (source === "floating" && actor.system.floatingTagsAndStatuses[entry.index]?.litmQolId && !singleUseRecord) return [];
      const tag = { id: source === "relationship" ? `relationship:${entry.index}` : source === "floating" ? `floating:${entry.index}` : `${source}:${entry.docId}:${entry.index}`,
        name: entry.name, actorId: actor.id, actorName: actor.name, source, index: entry.index,
        itemId: ["themebook", "backpack", "rote"].includes(source) ? entry.docId : undefined,
        singleUse: Boolean(singleUseRecord), singleUseRecordId: singleUseRecord?.id ?? null,
        ...(source === "relationship" ? { companion: actor.system.fellowships[entry.index]?.companion ?? "" } : {}) };
      tag.canBurn = entry.burnable && canBurnContribution(tag);
      return [tag];
    }).sort((a, b) => a.name.localeCompare(b.name));
  }
  const tags = [];

  for (const item of actor.items ?? []) {
    if (item.type === "themebook") {
      for (const [index, tag] of (item.system.powertags ?? []).entries()) {
        if (!tag?.name?.trim() || tag.burned || tag.planned || tag.expired) continue;
        tags.push({
          id: `themebook:${item.id}:${index}`,
          name: tag.name.trim(),
          actorId: actor.id,
          actorName: actor.name,
          source: "themebook",
          itemId: item.id,
          index
        });
      }
    }

    if (item.type === "backpack") {
      for (const [index, tag] of (item.system.items ?? []).entries()) {
        if (!tag?.name?.trim() || tag.burned || tag.planned || tag.expired) continue;
        tags.push({
          id: `backpack:${item.id}:${index}`,
          name: tag.name.trim(),
          actorId: actor.id,
          actorName: actor.name,
          source: "backpack",
          itemId: item.id,
          index
        });
      }
    }
  }

  for (const [index, tag] of (actor.system.floatingTagsAndStatuses ?? []).entries()) {
    if (!tag?.name?.trim() || tag.isStatus || tag.positive === false || tag.burned) continue;

    const name = tag.name.trim();
    const singleUseRecord = recordForTag(actor, index);
    if (tag.litmQolId && !singleUseRecord) continue;

    tags.push({
      id: `floating:${index}`,
      name,
      actorId: actor.id,
      actorName: actor.name,
      source: "floating",
      index,
      singleUse: Boolean(singleUseRecord),
      singleUseRecordId: singleUseRecord?.id ?? null
    });
  }

  for (const [index, entry] of (actor.system.fellowships ?? []).entries()) {
    if (!entry.relationshipTag?.trim() || entry.scratched) continue;
    tags.push({ id: `relationship:${index}`, name: entry.relationshipTag.trim(), actorId: actor.id,
      actorName: actor.name, source: "relationship", index, companion: entry.companion ?? "", canBurn: false });
  }
  for (const item of actor.items ?? []) {
    if (item.type === "rote" && item.name?.trim()) tags.push({ id: `rote:${item.id}:0`, name: item.name.trim(), actorId: actor.id, actorName: actor.name, source: "rote", itemId: item.id, index: 0, canBurn: false });
  }
  return tags.map(tag => ({ ...tag, canBurn: canBurnContribution(tag) })).sort((a, b) => a.name.localeCompare(b.name));
}

function getAvailableWeaknesses(actor) {
  if (!actor) return [];
  const tags = [];
  for (const item of actor.items ?? []) {
    if (item.type !== "themebook") continue;
    for (const [index, tag] of (item.system.weaknesstags ?? []).entries()) {
      if (!tag?.name?.trim() || tag.planned) continue;
      tags.push({
        id: `${actor.id}:${item.id}:${index}`,
        name: tag.name.trim(),
        actorId: actor.id,
        actorName: actor.name,
        itemId: item.id,
        index
      });
    }
  }
  return tags.sort((a, b) => a.actorName.localeCompare(b.actorName) || a.name.localeCompare(b.name));
}

function helpStatusLabel(response) {
  if (!response || response.status === "pending") return `<span class="litm-qol-help-pending">Pending</span>`;
  if (response.status === "declined") return `<span class="litm-qol-help-declined">Declined</span>`;
  if (response.status === "accepted") {
    const burn = response.burn ? ` <strong>(Burn for 3 Power)</strong>` : "";
    return `<span class="litm-qol-help-accepted">Accepted — <span class="tag positive">${foundry.utils.escapeHTML(response.tag?.name ?? "Tag")}</span>${burn}</span>`;
  }
  return foundry.utils.escapeHTML(response.status ?? "Pending");
}

function helpStatusRows(request) {
  return request.targetUserIds.map(userId => {
    const user = game.users.get(userId);
    const response = request.responses[userId] ?? { status: "pending" };
    return `<div class="litm-qol-help-status-row"><strong>${foundry.utils.escapeHTML(user?.name ?? "Player")}</strong><span>${helpStatusLabel(response)}</span></div>`;
  }).join("");
}

function updateHelpStatusDialog(requestId) {
  const request = helpRequests.get(requestId);
  const dialog = helpStatusDialogs.get(requestId);
  const root = dialog?.element;
  if (!request || !root) return;
  const list = root.querySelector(".litm-qol-help-status-list");
  if (list) list.innerHTML = helpStatusRows(request);
  const note = root.querySelector(".litm-qol-help-status-note");
  if (note) {
    note.textContent = request.sentToGm
      ? "All responses received. Waiting for the Narrator’s approval."
      : "Waiting for responses…";
  }
}

function openHelpStatusDialog(request) {
  const dialog = new foundry.applications.api.DialogV2({
    window: { title: request.mode === "group" ? "Group Action" : "Ask for Help" },
    classes: ["mist-engine", "litm-qol-system-dialog"],
    content: `
      <div class="litm-qol-help-status-dialog">
        <p class="litm-qol-help-status-note">Waiting for responses…</p>
        <div class="litm-qol-help-status-list">${helpStatusRows(request)}</div>
      </div>`,
    buttons: [{ action: "close", label: "Close", default: true }],
    close: () => helpStatusDialogs.delete(request.id)
  });
  helpStatusDialogs.set(request.id, dialog);
  dialog.render(true);
}

export function tagFromSheetElement(element, tags) {
  if (!element) return null;

  if (element.matches(".rote-title-selectable")) {
    return tags.find(tag => tag.source === "rote" && tag.itemId === element.dataset.itemId) ?? null;
  }

  if (element.matches(".pt-selectable")) {
    const itemId = element.dataset.itemId ?? "";
    const index = Number(element.dataset.powertagIndex);
    return tags.find(tag => tag.itemId === itemId && tag.index === index) ?? null;
  }

  if (element.matches(".pcfr-selectable")) {
    return tags.find(tag => tag.source === "relationship" && tag.index === Number(element.dataset.index)) ?? null;
  }
  if (element.matches(".fts-selectable")) {
    const index = Number(element.dataset.index);
    return tags.find(tag => tag.source === "floating" && tag.index === index) ?? null;
  }

  return null;
}

async function chooseHelpTagFromCharacterSheet(actor, request) {
  const tags = getAvailablePowerTags(actor);
  if (!tags.length) {
    ui.notifications.warn("Your character has no available tags to contribute.");
    return null;
  }

  const sheet = actor.sheet;
  if (!sheet) {
    ui.notifications.error("Could not open your character sheet.");
    return null;
  }

  sheet.render(true);

  return new Promise(resolve => {
    let settled = false;
    let instructionDialog = null;
    let banner = null;
    let confirming = false;

    const cleanup = (result = null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("click", onSheetClick, true);
      banner?.remove();
      sheet.element?.classList?.remove("litm-qol-help-pick-mode");
      instructionDialog?.close?.({ animate: false });
      resolve(result);
    };

    const confirmTag = async (tag, burn = false) => {
      if (!tag || (burn && !canBurnContribution(tag))) return;
      confirming = true;
      let result = null;
      const power = burn ? 3 : 1;
      try {
        result = await foundry.applications.api.DialogV2.wait({
          window: { title: request.mode === "group" ? "Confirm Group Action Tag" : "Confirm Help Tag" },
          classes: ["mist-engine", "litm-qol-system-dialog"],
          content: `
            <div class="litm-qol-help-confirm">
              <p>Contribute <span class="tag positive">${foundry.utils.escapeHTML(tag.name)}</span> from <strong>${foundry.utils.escapeHTML(actor.name)}</strong>?</p>
              <p>This adds +${power} Power to ${request.mode === "group" ? "the group roll" : foundry.utils.escapeHTML(request.requesterActorName) + "’s roll"} if the Narrator approves it.${burn ? " The tag will be burned when the Group Action roll is made." : tag.source === "relationship" ? " The relationship will be scratched after the roll." : ""}</p>
            </div>`,
          buttons: [
            {
              action: "confirm",
              label: burn ? "Confirm Burn" : "Confirm Tag",
              default: true,
              callback: () => ({ confirmed: true })
            },
            { action: "another", label: "Choose Another", callback: () => ({ confirmed: false }) }
          ],
          close: () => ({ confirmed: false })
        });
      } catch (_error) {
        result = null;
      }
      confirming = false;
      if (result?.confirmed) cleanup({ tag, burn });
    };

    const install = () => {
      if (settled) return;
      const root = sheet.element;
      if (!root) {
        setTimeout(install, 50);
        return;
      }

      root.classList.add("litm-qol-help-pick-mode");
      const content = root.querySelector(".window-content") ?? root;
      banner = document.createElement("div");
      banner.className = "litm-qol-sheet-pick-banner";
      const burnInstruction = request.mode === "group"
        ? (request.existingBurnPresent
          ? "A tag is already being burned for this roll, so additional burn contributions are unavailable."
          : "Click a tag for +1 Power, or click its burn icon for +3 Power. Only one tag may be burned.")
        : "Click an available tag on this sheet.";
      banner.innerHTML = `<strong>${request.mode === "group" ? "Choose one tag representing your Hero’s most significant contribution to the joint effort." : "Choose one tag to help " + foundry.utils.escapeHTML(request.requesterActorName) + "."}</strong><span>${burnInstruction} Burned tags cannot be contributed.</span>`;
      // This selector also reaches tags on a hidden sheet tab or compact view.
      const picker = document.createElement("div"); picker.className = "litm-qol-contribution-picker";
      picker.innerHTML = `<label>Available tag<select name="contribution">${tags.map(tag => `<option value="${tag.id}">${foundry.utils.escapeHTML(tag.name)}${` (${sourceLabel(tag)})`}</option>`).join("")}</select></label>
        ${request.mode === "group" && !request.existingBurnPresent ? '<label><input type="checkbox" name="burnContribution"> Burn for 3 Power</label>' : ''}
        <button type="button">Use Selected Tag</button>`;
      const select = picker.querySelector("select"); const burnBox = picker.querySelector("input");
      const syncBurn = () => { const tag = tags.find(tag => tag.id === select.value); if (burnBox) { burnBox.disabled = !canBurnContribution(tag); if (burnBox.disabled) burnBox.checked = false; } };
      select.addEventListener("change", syncBurn); syncBurn();
      picker.querySelector("button").addEventListener("click", () => { if (!confirming) void confirmTag(tags.find(tag => tag.id === select.value), Boolean(burnBox?.checked)); });
      banner.append(picker);
      content.prepend(banner);
      document.addEventListener("click", onSheetClick, true);
    };

    const onSheetClick = event => {
      if (confirming) return;
      const root = sheet.element;
      if (!root || !root.contains(event.target)) return;

      const burnControl = event.target.closest?.('.burn-indicator[data-action="toggleToBurn"]');
      if (burnControl && root.contains(burnControl)) {
        if (request.mode !== "group") {
          event.preventDefault(); event.stopImmediatePropagation();
          ui.notifications.warn("Help contributions cannot be burned."); return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (request.existingBurnPresent) {
          ui.notifications.warn("A tag is already being burned for this Group Action.");
          return;
        }

        const itemId = burnControl.dataset.itemId ?? "";
        const index = Number(burnControl.dataset.powertagIndex);
        const tag = tags.find(entry => entry.itemId === itemId && entry.index === index) ?? null;
        if (!canBurnContribution(tag)) {
          ui.notifications.warn("That tag cannot be burned as a Group Action contribution.");
          return;
        }

        void confirmTag(tag, true);
        return;
      }

      const element = event.target.closest?.(".pt-selectable, .fts-selectable, .pcfr-selectable, .rote-title-selectable");
      if (!element || !root.contains(element)) return;

      const tag = tagFromSheetElement(element, tags);
      if (!tag) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void confirmTag(tag, false);
    };

    instructionDialog = new foundry.applications.api.DialogV2({
      window: { title: "Choose a Tag to Contribute" },
      classes: ["mist-engine", "litm-qol-system-dialog"],
      content: `
        <div class="litm-qol-help-sheet-instructions">
          <p>Choose one tag directly from <strong>${foundry.utils.escapeHTML(actor.name)}</strong>'s character sheet.</p>
          <p class="litm-qol-help-sheet-note">You will confirm the contribution before it is submitted.</p>
        </div>`,
      buttons: [{ action: "cancel", label: "Cancel", callback: () => cleanup(null) }],
      close: () => cleanup(null)
    });

    instructionDialog.render(true);
    install();
  });
}

async function socketPromptHelperForTag(request) {
  const actor = getPlayerCharacter(game.user);
  if (!actor) return { status: "declined" };

  let willHelp = false;
  try {
    willHelp = await foundry.applications.api.DialogV2.confirm({
      window: { title: request.mode === "group" ? "Contribute to a Group Action" : `${request.requesterActorName} Is Asking for Help` },
      classes: ["mist-engine", "litm-qol-system-dialog"],
      content: `
        <div class="litm-qol-help-confirm">
          <p>${request.mode === "group" ? "The Fellowship is acting together using one " + foundry.utils.escapeHTML(request.rollType) + " roll. The outcome affects the entire group." : "<strong>" + foundry.utils.escapeHTML(request.requesterActorName) + "</strong> is asking for help with a " + foundry.utils.escapeHTML(request.rollType) + " roll."}</p>
          <p>Contribute one tag from <strong>${foundry.utils.escapeHTML(actor.name)}</strong> to give the roll <strong>+1 Power</strong> if the Narrator approves?</p>
          ${request.mode === "group" ? `<p>${request.existingBurnPresent ? "A tag is already being burned for this roll, so your contribution must be worth 1 Power." : "You may click the tag’s burn icon on your sheet to offer it for 3 Power instead."}</p>` : ""}
        </div>`,
      yes: { label: "Choose a Tag" },
      no: { label: "Decline" }
    });
  } catch (_error) {
    willHelp = false;
  }

  if (!willHelp) return { status: "declined" };

  const selection = await chooseHelpTagFromCharacterSheet(actor, request);
  return selection ? { status: "accepted", tag: selection.tag, burn: Boolean(selection.burn) } : { status: "declined" };
}

async function socketPromptGmForHelpApproval(request) {
  const seenActors = new Set();
  const accepted = request.targetUserIds
    .map(id => ({ userId: id, userName: game.users.get(id)?.name ?? "Player", response: request.responses[id] }))
    .filter(entry => {
      if (entry.response?.status !== "accepted") return false;
      const actor = getPlayerCharacter(game.users.get(entry.userId));
      const tag = getAvailablePowerTags(actor).find(tag => tag.id === entry.response.tag?.id && tag.name === entry.response.tag?.name);
      if (!actor || actor.id !== entry.response.tag?.actorId || !tag || seenActors.has(actor.id)) return false;
      seenActors.add(actor.id);
      entry.response = { ...entry.response, tag, burn: request.mode === "group" && Boolean(entry.response.burn) && canBurnContribution(tag) };
      return true;
    });

  const involvedActorIds = new Set([
    ...(request.mode === "group" ? request.targetUserIds.map(id => getPlayerCharacter(game.users.get(id))?.id).filter(Boolean) : [request.requesterActorId]),
    ...accepted.map(entry => entry.response.tag?.actorId).filter(Boolean)
  ]);
  const weaknesses = [...involvedActorIds]
    .map(id => game.actors.get(id))
    .flatMap(actor => getAvailableWeaknesses(actor));

  const fellowshipTags = request.mode === "group" ? getFellowshipPowerTags([...involvedActorIds]) : [];

  const burnCandidates = request.existingBurnPresent
    ? []
    : accepted.filter(entry => entry.response.burn);
  const contributionRows = accepted.length
    ? accepted.map(entry => `<li><strong>${foundry.utils.escapeHTML(entry.userName)}</strong><span class="tag positive">${foundry.utils.escapeHTML(entry.response.tag.name)} (from ${foundry.utils.escapeHTML(entry.response.tag.actorName)})</span>${entry.response.burn ? " <strong>— offered to burn</strong>" : ""}</li>`).join("")
    : "<li>No players accepted.</li>";

  const weaknessRows = weaknesses.length
    ? weaknesses.map(weakness => `
        <label class="litm-qol-help-weakness-choice">
          <input type="checkbox" name="weakness" value="${weakness.id}">
          <span class="tag negative">${foundry.utils.escapeHTML(weakness.name)} (from ${foundry.utils.escapeHTML(weakness.actorName)})</span>
        </label>`).join("")
    : `<p class="litm-qol-help-sheet-note">No available weakness tags were found on the involved characters.</p>`;

  let result;
  try {
    result = await foundry.applications.api.DialogV2.wait({
      window: { title: request.mode === "group" ? "Approve Group Action" : `Approve Help for ${request.requesterActorName}` },
      classes: ["mist-engine", "litm-qol-system-dialog"],
      content: `
        <div class="litm-qol-help-gm-review">
          <p>Review the proposed ${request.mode === "group" ? "Group Action" : "help"} contributions before adding them to the open roll.</p>
          <ul>${contributionRows}</ul>
          ${request.mode === "group" && request.existingBurnPresent ? `<p class="litm-qol-help-sheet-note">One tag is already queued to burn, so all other contributions are limited to 1 Power.</p>` : ""}
          ${request.mode === "group" && burnCandidates.length ? `
            <fieldset class="litm-qol-group-burn-review">
              <legend>Burned contribution (maximum one)</legend>
              <label><input type="radio" name="burnUserId" value=""> None</label>
              ${burnCandidates.map((entry, index) => `<label><input type="radio" name="burnUserId" value="${entry.userId}" ${burnCandidates.length === 1 && index === 0 ? "checked" : ""}> ${foundry.utils.escapeHTML(entry.response.tag.name)} (from ${foundry.utils.escapeHTML(entry.response.tag.actorName)}) — 3 Power</label>`).join("")}
            </fieldset>` : ""}
          ${fellowshipTags.length ? `<fieldset class="litm-qol-fellowship-contributions"><legend>Relevant Fellowship theme power tags</legend><p>Invoke any relevant tags. These are additional to each Hero’s single contribution.</p>${fellowshipTags.map(tag => `<label><input type="checkbox" name="fellowshipTag" value="${tag.id}"> ${foundry.utils.escapeHTML(tag.name)} (${foundry.utils.escapeHTML(tag.actorName)})</label>`).join("")}</fieldset>` : ""}
          <fieldset class="litm-qol-help-weaknesses">
            <legend>Optional weaknesses to add</legend>
            ${weaknessRows}
          </fieldset>
        </div>`,
      buttons: [
        {
          action: "approve",
          label: "Approve",
          default: true,
          callback: (_event, button) => ({
            approved: true,
            fellowshipTagIds: [...button.form.querySelectorAll('input[name="fellowshipTag"]:checked')].map(input => input.value),
            weaknessIds: [...button.form.querySelectorAll('input[name="weakness"]:checked')].map(input => input.value),
            burnUserId: button.form.querySelector('input[name="burnUserId"]:checked')?.value ?? ""
          })
        },
        {
          action: "reject",
          label: "Reject All",
          callback: () => ({ approved: false, weaknessIds: [], burnUserId: "" })
        }
      ],
      close: () => ({ approved: false, weaknessIds: [], burnUserId: "" })
    });
  } catch (_error) {
    result = { approved: false, weaknessIds: [], burnUserId: "" };
  }

  const selectedFellowshipIds = new Set(result?.fellowshipTagIds ?? []);
  const selectedWeaknessIds = new Set(result?.weaknessIds ?? []);
  return {
    approved: Boolean(result?.approved),
    contributions: result?.approved
      ? accepted.map(entry => ({
          userId: entry.userId,
          userName: entry.userName,
          tag: entry.response.tag,
          burn: request.mode === "group" && result?.burnUserId === entry.userId
        }))
      : [],
    fellowshipTags: result?.approved ? fellowshipTags.filter(tag => selectedFellowshipIds.has(tag.id)) : [],
    weaknesses: result?.approved
      ? weaknesses.filter(entry => selectedWeaknessIds.has(entry.id))
      : []
  };
}

function allHelpResponsesComplete(request) {
  return request.targetUserIds.every(id => ["accepted", "declined"].includes(request.responses[id]?.status));
}

async function requestHelpFromPlayers(request) {
  const jobs = request.targetUserIds.map(async userId => {
    let response = { status: "declined" };
    try {
      response = await helpSocket.executeAsUser("promptHelperForTag", userId, request) ?? response;
    } catch (error) {
      console.error(`${MODULE_ID} | Help request to user ${userId} failed.`, error);
      response = { status: "declined" };
    }

    request.responses[userId] = {
      status: response.status === "accepted" ? "accepted" : "declined",
      tag: response.tag ?? null,
      burn: Boolean(response.burn)
    };
    updateHelpStatusDialog(request.id);
  });

  await Promise.all(jobs);
  if (request.canceled || !allHelpResponsesComplete(request)) return;

  request.sentToGm = true;
  updateHelpStatusDialog(request.id);

  let result;
  try {
    result = await helpSocket.executeAsGM("promptGmForHelpApproval", request);
  } catch (error) {
    console.error(`${MODULE_ID} | GM help approval failed.`, error);
    ui.notifications.error(`The ${request.mode === "group" ? "Group Action" : "help request"} could not be sent to an active Narrator.`);
    return;
  }

  applyApprovedHelpToRoll({
    requestId: request.id,
    requesterUserId: request.requesterUserId,
    approved: Boolean(result?.approved),
    contributions: result?.contributions ?? [],
    weaknesses: result?.weaknesses ?? [],
    fellowshipTags: result?.fellowshipTags ?? []
  });
}

export async function choosePlayersForHelp(app, mode = "help") {
  if (app._litmQolHelpPending || app.pendingRequest) return;
  if (mode === "help" && app._litmQolGroupRoll) return;
  if (!helpSocket) {
    ui.notifications.error("Socketlib is not ready. Confirm that Socketlib is enabled, then reload the world.");
    return;
  }

  const candidates = eligiblePlayers(app, mode);

  if (!candidates.length) {
    ui.notifications.warn("No other active players with assigned characters are available.");
    return;
  }

  let selectedIds;
  try {
    selectedIds = await foundry.applications.api.DialogV2.prompt({
      window: { title: mode === "group" ? "Group Action" : "Ask for Help" },
      classes: ["mist-engine", "litm-qol-system-dialog"],
      content: `
        <div class="litm-qol-help-player-picker">
          <p>${mode === "group" ? "Select the players invited to contribute to the Group Action." : "Select the players you want to ask for help."}</p>
          ${candidates.map(user => `<label><input type="checkbox" name="helper" value="${user.id}"> <span>${foundry.utils.escapeHTML(user.name)}</span></label>`).join("")}
        </div>`,
      ok: {
        label: "Send Requests",
        callback: (_event, button) => [...button.form.querySelectorAll('input[name="helper"]:checked')].map(input => input.value)
      }
    });
  } catch (_error) {
    return;
  }

  selectedIds = [...new Set(selectedIds ?? [])].filter(id => candidates.some(user => user.id === id));
  if (!selectedIds.length) return;
  if (mode === "group") {
    app.actor = getPlayerCharacter(game.users.get(selectedIds[0]));
    app.selectedTags = []; app._litmQolApproved = false;
  }

  const request = {
    id: foundry.utils.randomID(),
    mode,
    requesterUserId: game.user.id,
    requesterActorId: app.actor?.id,
    requesterActorName: mode === "group" ? "the group" : app.actor?.name ?? game.user.name,
    rollType: app.rollType,
    targetUserIds: selectedIds,
    responses: Object.fromEntries(selectedIds.map(id => [id, { status: "pending" }])),
    sentToGm: false,
    existingBurnPresent: mode === "group" && (app.selectedTags ?? []).some(tag => Boolean(tag?.toBurn)),
    createdAt: Date.now()
  };

  helpRequests.set(request.id, request);
  helpRollApps.set(request.id, app);
  app._litmQolHelpRequestId = request.id;
  if (mode === "group") app.groupId = request.id;
  app._litmQolHelpPending = true;
  app.render(true, { focus: true });
  openHelpStatusDialog(request);
  app._litmQolHelpTask = requestHelpFromPlayers(request).finally(() => {
    if (app._litmQolHelpRequestId === request.id) { app._litmQolHelpPending = false; if (app.rendered) app.render(); }
    helpRequests.delete(request.id); helpRollApps.delete(request.id);
  });
  return request.id;
}

function applyApprovedHelpToRoll(payload) {
  if (payload.requesterUserId !== game.user.id) return;
  const request = helpRequests.get(payload.requestId);
  const originalApp = helpRollApps.get(payload.requestId);
  const activeApp = originalApp?.rendered && originalApp._litmQolHelpRequestId === payload.requestId ? originalApp : null;
  helpRollApps.delete(payload.requestId);
  let applied = false;

  if (!payload.approved) {
    ui.notifications.warn(`The Narrator did not approve the ${request?.mode === "group" ? "Group Action" : "help request"}.`);
  } else if (!activeApp || activeApp.actor?.id !== request?.requesterActorId) {
    ui.notifications.warn("Help was approved, but the original roll dialog is no longer open.");
  } else {
    activeApp.selectedTags = activeApp.selectedTags.filter(tag => !["litm-qol-help", "litm-qol-fellowship"].includes(tag.source));
    let burnAlreadyUsed = activeApp.selectedTags.some(tag => Boolean(tag?.toBurn));
    for (const contribution of payload.contributions ?? []) {
      const contributionBurn = Boolean(contribution.burn) && canBurnContribution(contribution.tag) && !burnAlreadyUsed;
      if (contributionBurn) burnAlreadyUsed = true;
      activeApp.selectedTags.push({
        name: `${contribution.tag.name} (from ${contribution.tag.actorName})`,
        originalName: contribution.tag.name,
        helperCompanion: contribution.tag.companion ?? "",
        positive: true,
        source: "litm-qol-help",
        helperUserId: contribution.userId,
        helperActorId: contribution.tag.actorId,
        helperTagSource: contribution.tag.source,
        helperTagItemId: contribution.tag.itemId ?? null,
        helperTagIndex: contribution.tag.index,
        helperTagSingleUse: Boolean(contribution.tag.singleUse),
        helperSingleUseRecordId: contribution.tag.singleUseRecordId ?? null,
        helperContributionBurn: contributionBurn,
        toBurn: contributionBurn,
        isClickable: false
      });
    }
    for (const weakness of payload.weaknesses ?? []) {
      activeApp.selectedTags.push({
        name: `${weakness.name} (from ${weakness.actorName})`,
        originalName: weakness.name,
        positive: false,
        weakness: true,
        source: "litm-qol-help",
        helperActorId: weakness.actorId,
        helperThemebookId: weakness.itemId,
        helperWeaknessIndex: weakness.index,
        isClickable: false
      });
    }
    if (request.mode === "group") {
      for (const tag of payload.fellowshipTags ?? []) activeApp.selectedTags.push({
        name: `${tag.name} (Fellowship: ${tag.actorName})`, originalName: tag.name, positive: true,
        source: "litm-qol-fellowship", helperActorId: tag.actorId, helperTagSource: "fellowship-theme",
        helperTagIndex: tag.index, isClickable: false
      });
      activeApp._litmQolGroupActors = [...new Set(request.targetUserIds.map(id => getPlayerCharacter(game.users.get(id))?.id).filter(Boolean))];
      activeApp._litmQolApproved = true;
      if (activeApp.selectedExtras instanceof Set) {
        activeApp.selectedExtras.clear();
        for (const tag of activeApp.selectedTags.filter(tag => tag.source === "litm-qol-fellowship")) activeApp.selectedExtras.add(`${tag.helperActorId}:${tag.helperTagIndex}`);
      }
      syncGroupContributions(activeApp);
    }
    applied = true;
    activeApp.render(true, { focus: true });
    ui.notifications.info(`The approved ${request?.mode === "group" ? "Group Action" : "help"} contributions have been added to the roll.`);
  }

  const dialog = helpStatusDialogs.get(payload.requestId);
  const root = dialog?.element;
  if (root) {
    const note = root.querySelector(".litm-qol-help-status-note");
    if (note) note.textContent = applied
      ? "Approved by the Narrator and added to the roll."
      : payload.approved ? "The original roll is closed or changed; these contributions were not added."
        : `The Narrator rejected the ${request?.mode === "group" ? "Group Action" : "help request"}.`;
  }
}

Hooks.once("socketlib.ready", () => {
  try {
    registerCooperativeSocket();
    game.modules.get(MODULE_ID).socket = helpSocket;
    console.log(`${MODULE_ID} | Socketlib help workflow registered.`);
  } catch (error) {
    console.error(`${MODULE_ID} | Could not register Socketlib help workflow.`, error);
  }
});

export function registerCooperativeSocket(api = socketlib) {
  helpSocket = api.registerModule(MODULE_ID);
  for (const [name, handler] of [["promptHelperForTag", socketPromptHelperForTag], ["promptGmForHelpApproval", socketPromptGmForHelpApproval]]) {
    helpSocket.register(name, function(request) {
      if (request.requesterUserId !== this.socketdata.userId) throw new Error("The contribution request sender does not match.");
      return handler(request);
    });
  }
}

export function eligiblePlayers(app, mode = "help") {
  const actors = new Set();
  return game.users.filter(user => {
    const actor = getPlayerCharacter(user);
    if (!user.active || user.isGM || !actor || actors.has(actor.id)) return false;
    if (mode === "help" && (user.id === game.user.id || actor.id === app.actor?.id)) return false;
    actors.add(actor.id); return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function clearCooperativeRoll(app) {
  app.selectedTags = (app.selectedTags ?? []).filter(tag => !["litm-qol-help", "litm-qol-fellowship"].includes(tag.source));
  app._litmQolHelpRequestId = null;
  app._litmQolHelpPending = false;
  app._litmQolGroupRoll = null;
  app._litmQolGroupActors = null;
  app.selectedExtras?.clear?.();
  for (const [requestId, rollApp] of helpRollApps) if (rollApp === app) {
    const request = helpRequests.get(requestId); if (request) request.canceled = true;
    const note = helpStatusDialogs.get(requestId)?.element?.querySelector(".litm-qol-help-status-note");
    if (note) note.textContent = "The original roll was closed or changed. No contributions will be added.";
    helpRollApps.delete(requestId);
  }
}

export function syncGroupContributions(app) {
  app.contributions = app.selectedTags.filter(tag => tag.positive && tag.source === "litm-qol-help").map(tag => ({
    actorId: tag.helperActorId, actorName: game.actors.get(tag.helperActorId)?.name ?? "Hero",
    tagName: tag.originalName, burn: Boolean(tag.toBurn)
  }));
  const participantIds = app._litmQolGroupActors ?? app.contributions.map(entry => entry.actorId);
  if (!participantIds.includes(app.actor?.id)) app.actor = game.actors.get(participantIds[0]);
}

export function syncNativeFellowshipSelections(app) {
  if (!(app.selectedExtras instanceof Set) || typeof app.fellowshipTags !== "function") return;
  const selected = app.fellowshipTags().filter(tag => app.selectedExtras.has(tag.key));
  app.selectedTags = (app.selectedTags ?? []).filter(tag => tag.source !== "litm-qol-fellowship");
  for (const tag of selected) app.selectedTags.push({ name: `${tag.name} (Fellowship: ${tag.themecardName})`, originalName: tag.name,
    positive: true, source: "litm-qol-fellowship", helperActorId: tag.themecardId,
    helperTagSource: "fellowship-theme", helperTagIndex: tag.index, isClickable: false });
}

export async function openGroupRoll(app, DiceRollApp) {
  if (!app._litmQolApproved || app._litmQolHelpPending || !app.actor) return;
  if (DiceRollApp.instance?.rendered) {
    ui.notifications.warn("Finish or close the current roll dialog before rolling for the group."); return;
  }
  syncNativeFellowshipSelections(app);
  const contributions = foundry.utils.deepClone(app.selectedTags);
  const actor = app.actor;
  const actorIds = app._litmQolGroupActors ?? app.contributions.map(entry => entry.actorId);
  const group = { id: app.groupId, actorIds,
    actorNames: actorIds.map(id => game.actors.get(id)?.name ?? "Hero") };
  const modifier = app.gmMod || 0;
  const roll = DiceRollApp.getInstance({ actor, type: app.rollType ?? "detailed" });
  roll._litmQolGroupRoll = group;
  roll.options.window.title = `Acting Together — ${app.rollType === "quick" ? "Quick" : "Detailed"}`;
  roll.selectedTags = contributions;
  roll.selectedGmTags = []; roll.selectedStoryTags = []; roll.challengeTags = [];
  roll.helpingTags = [];
  roll.numModPositive = Math.max(0, modifier); roll.numModNegative = Math.max(0, -modifier); roll.mightScale = 0;
  await roll.render(true, { focus: true });
  app.groupId = null; app.contributions = []; clearCooperativeRoll(app); app.close();
  return roll;
}

const INTEGRATED = Symbol.for(`${MODULE_ID}.cooperativeIntegration`);
export function installCooperativeRolls(Collaboration, DiceRollApp, GroupActionApp) {
  nativeCollaboration = Collaboration;
  if (Collaboration[INTEGRATED]) return;
  Object.defineProperty(Collaboration, INTEGRATED, { value: true });
  Collaboration.requestHelp = app => choosePlayersForHelp(app, "help");
  const prepare = DiceRollApp.prototype._prepareContext;
  DiceRollApp.prototype._prepareContext = async function(options) {
    const context = await prepare.call(this, options);
    context.canRequestHelp = !this.pendingRequest && !this._litmQolHelpPending && !this._litmQolGroupRoll && eligiblePlayers(this).length > 0;
    return context;
  };
  const configure = DiceRollApp.prototype._configureRenderOptions;
  DiceRollApp.prototype._configureRenderOptions = function(options) {
    const result = configure?.call(this, options);
    if (this._litmQolGroupRoll) {
      options.window ??= {};
      options.window.title = `Acting Together — ${this.rollType === "quick" ? "Quick" : "Detailed"}`;
    }
    return result;
  };
  const deselect = DiceRollApp.DEFAULT_OPTIONS.actions.clickDeselectTag;
  DiceRollApp.DEFAULT_OPTIONS.actions.clickDeselectTag = function(event, target) {
    const index = Number(target.dataset.index);
    if (["litm-qol-help", "litm-qol-fellowship"].includes(this.selectedTags[index]?.source)) {
      this.selectedTags.splice(index, 1); this.render(); return;
    }
    return deselect.call(this, event, target);
  };
  GroupActionApp.open = () => GroupActionApp.getInstance().render(true, { focus: true });
  Object.assign(GroupActionApp.DEFAULT_OPTIONS.actions, {
    groupStart() { this.rollType ??= "detailed"; return choosePlayersForHelp(this, "group"); },
    groupRoll() { return openGroupRoll(this, DiceRollApp); },
    groupRemove(_event, target) {
      if (this._litmQolHelpPending) return;
      const actorId = this.contributions[Number(target.dataset.index)]?.actorId;
      if (!actorId) return;
      this.selectedTags = this.selectedTags.filter(tag => tag.helperActorId !== actorId);
      syncGroupContributions(this); this.render();
    }
  });
  if (typeof GroupActionApp.prototype.fellowshipTags === "function") {
    GroupActionApp.prototype.fellowshipTags = function() {
      const actorIds = this._litmQolGroupActors ?? this.contributions.map(entry => entry.actorId);
      return getFellowshipPowerTags(actorIds).map(tag => ({ key: `${tag.actorId}:${tag.index}`, name: tag.name,
        themecardId: tag.actorId, themecardName: tag.actorName, index: tag.index,
        selected: this.selectedExtras.has(`${tag.actorId}:${tag.index}`) }));
    };
  }
  GroupActionApp.prototype.computePower = function() {
    syncNativeFellowshipSelections(this);
    const count = DiceRollApp.calculatePowerTags(this.selectedTags ?? []);
    return Math.max(1, count.positive - count.negative + (this.gmMod || 0));
  };
  // Reject legacy name-only broadcasts: this workflow needs a confirmed source.
  GroupActionApp.prototype.receiveContribution = function() {};
  const onRender = GroupActionApp.prototype._onRender;
  GroupActionApp.prototype._onRender = function(...args) {
    onRender.apply(this, args);
    this.rollType ??= "detailed";
    this.selectedTags ??= [];
    renderGroupOptions(this);
  };
  const onClose = GroupActionApp.prototype._onClose;
  GroupActionApp.prototype._onClose = function(...args) {
    clearCooperativeRoll(this); this.groupId = null; this.contributions = []; this.gmMod = 0; this._litmQolApproved = false;
    return onClose.apply(this, args);
  };
  Hooks.on("renderApplicationV2", (app, root) => {
    if (!(app instanceof DiceRollApp) || !app._litmQolGroupRoll || root.querySelector(".litm-qol-group-roll-note")) return;
    const note = document.createElement("p"); note.className = "litm-qol-group-roll-note";
    note.textContent = `Acting Together. The outcome affects the entire group. When creating a single-use tag with group Power, choose which Hero receives it.`;
    const selectedLabel = root.querySelector(".selected-tags-container > .resource-label");
    if (selectedLabel) selectedLabel.textContent = "Group contributions:";
    root.querySelector("form")?.prepend(note);
  });
}

export function renderGroupOptions(app) {
  const root = app.element;
  const container = root?.querySelector(".group-action-container");
  if (!container || container.querySelector(".litm-qol-group-options")) return;
  const options = document.createElement("div"); options.className = "litm-qol-group-options";
  const participants = (app._litmQolGroupActors ?? (app.contributions ?? []).map(entry => entry.actorId)).map(id => game.actors.get(id)).filter(Boolean);
  options.innerHTML = `<label>Action<select name="groupRollType"><option value="detailed">Detailed</option><option value="quick">Quick</option></select></label>`;
  const hint = container.querySelector(".group-action-hint");
  if (hint) hint.textContent = "The Narrator may use a single roll for the group. Each Hero may contribute one tag representing their most significant contribution; relationship tags count toward this limit. One Hero may burn a tag. Any relevant Fellowship theme power tags may also be invoked. The outcome affects the entire group.";
  const type = options.querySelector('[name="groupRollType"]'); type.value = app.rollType;
  type.disabled = Boolean(app._litmQolHelpPending);
  type.addEventListener("change", () => { app.rollType = type.value; });
  const shared = (app.selectedTags ?? []).filter(tag => tag.source === "litm-qol-fellowship");
  if (shared.length && typeof app.fellowshipTags !== "function") {
    const note = document.createElement("p"); note.textContent = `Fellowship theme tags: ${shared.map(tag => tag.name).join(", ")}`;
    options.append(note);
  }
  container.prepend(options);
  if (app.groupId) {
    const restart = document.createElement("button"); restart.type = "button";
    restart.dataset.action = "groupStart"; restart.textContent = "Choose Participants Again";
    restart.disabled = Boolean(app._litmQolHelpPending);
    options.append(restart);
  }
  const roll = container.querySelector('[data-action="groupRoll"]');
  if (roll) roll.disabled = !app._litmQolApproved || app._litmQolHelpPending || !participants.length;
  const empty = container.querySelector(".group-empty");
  if (empty && app._litmQolApproved) empty.textContent = "No personal tags invoked.";
  const weak = (app.selectedTags ?? []).filter(tag => !tag.positive);
  if (weak.length) {
    const list = document.createElement("p"); list.className = "litm-qol-group-weaknesses";
    list.textContent = `Weaknesses: ${weak.map(tag => tag.name).join(", ")}`;
    container.querySelector(".group-contributions")?.append(list);
  }
}

Hooks.once("ready", async () => {
  if (game.system.id !== "mist-engine-fvtt") return;
  try {
    const [{ Collaboration }, { DiceRollApp }, { GroupActionApp }, { RollConfirmation }] = await Promise.all([
      importSystemModule("lib/collaboration.mjs"),
      importSystemModule("apps/dice-roll-app.mjs"),
      importSystemModule("apps/group-action-app.mjs"),
      importSystemModule("lib/roll-confirmation.mjs")
    ]);
    installCooperativeRolls(Collaboration, DiceRollApp, GroupActionApp);
    installGroupConfirmation(RollConfirmation);
  } catch (error) {
    console.error(`${MODULE_ID} | Native cooperative integration failed.`, error);
    ui.notifications.error("Smeeth's QoL could not integrate native Help and Acting Together. See the console for details.");
  }
});

// Register before the initial canvas controls are built.
Hooks.on("getSceneControlButtons", controls => {
    const tool = controls["mist-engine"]?.tools?.group_action_app;
    if (tool) tool.visible = game.user.isGM || Boolean(getPlayerCharacter(game.user));
  });

// Fellowship theme powers are shared resources, not a Hero's one contribution.
export function getFellowshipPowerTags(actorIds) {
  const cards = new Map();
  for (const id of actorIds) {
    const hero = game.actors.get(id);
    const card = game.actors.get(hero?.system.actorSharedSingleThemecardId) ?? hero?.sheet?.getActorFellowshipThemecard?.();
    if (card?.type === "litm-fellowship-themecard") cards.set(card.id, card);
  }
  return [...cards.values()].flatMap(card => (card.system.powertags ?? []).flatMap((tag, index) =>
    tag.name?.trim() && !tag.planned && !tag.burned ? [{ id: `fellowship:${card.id}:${index}`,
      actorId: card.id, actorName: card.name, index, name: tag.name.trim() }] : []));
}

const CONFIRMATION = Symbol.for(`${MODULE_ID}.groupConfirmation`);
export function installGroupConfirmation(RollConfirmation) {
  if (RollConfirmation[CONFIRMATION]) return;
  Object.defineProperty(RollConfirmation, CONFIRMATION, { value: true });
  const groups = new Map();
  const channel = RollConfirmation.SOCKET;
  // The native handler awaits its template before creating the dialog. This
  // listener records group context from the same request before it renders.
  game.socket.on(channel, message => {
    if (message.action === "rollConfirmRequest" && message.snapshot?.qolGroup && game.user === game.users.activeGM) {
      groups.set(message.requestId, { ...message.snapshot.qolGroup, userId: message.userId, rollType: message.rollType });
    } else if (["rollConfirmCancel", "rollConfirmResponse"].includes(message.action)) groups.delete(message.requestId);
  });
  const send = RollConfirmation.sendRequest;
  RollConfirmation.sendRequest = function(app, values) {
    if (!app._litmQolGroupRoll) return send.call(this, app, values);
    const requestId = foundry.utils.randomID();
    // Keep native approval, rejection, cancellation, and frozen tag snapshots.
    // No Hero is the group speaker; actorId is intentionally empty.
    game.socket.emit(channel, { action: "rollConfirmRequest", requestId, userId: game.user.id, actorId: null,
      rollType: app.rollType, snapshot: {
        selectedTags: foundry.utils.deepClone(app.selectedTags), selectedGmTags: foundry.utils.deepClone(app.selectedGmTags),
        selectedStoryTags: foundry.utils.deepClone(app.selectedStoryTags), challengeTags: foundry.utils.deepClone(app.challengeTags),
        numModPositive: values.numModPositive, numModNegative: values.numModNegative, mightScale: values.mightScale,
        power: app.computePowerAmount(), qolGroup: foundry.utils.deepClone(app._litmQolGroupRoll)
      } });
    return requestId;
  };
  Hooks.on("renderApplicationV2", (app, root) => {
    const id = app.id ?? app.options?.id;
    const prefix = "gm-roll-confirm-";
    if (!id?.startsWith(prefix)) return;
    const group = groups.get(id.slice(prefix.length)) ?? app._litmQolConfirmationGroup;
    const header = root.querySelector(".gm-roll-confirm > p");
    if (!group || !header) return;
    app._litmQolConfirmationGroup = group;
    const title = document.createElement("strong");
    title.textContent = `Acting Together — ${group.rollType === "quick" ? "Quick" : "Detailed"}`;
    header.replaceChildren(title, document.createElement("br"), document.createTextNode(
      `Submitted by ${game.users.get(group.userId)?.name ?? "a player"}. The outcome affects the entire group.`));
    const tagsLabel = root.querySelector(".selected-tags-container > .resource-label");
    if (tagsLabel) tagsLabel.textContent = "Group contributions";
    groups.delete(id.slice(prefix.length));
  });
}
