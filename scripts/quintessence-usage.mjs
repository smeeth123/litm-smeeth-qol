const MODULE_ID = "litm-smeeth-qol";
const USED_FLAG = "usedThisSession";
const pending = new Set();
const normalize = name => String(name ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const tracked = new Map([["lucky bastard", "Lucky Bastard"], ["virtuoso", "Virtuoso"]]);

export const isTrackedUsageQuintessence = item => item?.type === "quintessence" && tracked.has(normalize(item.name));

export function renderQuintessenceUsage(actor, root) {
  if (!["character", "litm-character"].includes(actor?.type) || !root) return;
  const items = [...actor.items].filter(item => item.type === "quintessence" && tracked.has(normalize(item.name)));
  for (const name of root.querySelectorAll(".litm-pc-quintessence")) {
    const nameKey = normalize(name.textContent);
    const featureName = tracked.get(nameKey);
    if (!featureName) continue;
    const index = items.findIndex(item => normalize(item.name) === nameKey);
    const item = index < 0 ? null : items.splice(index, 1)[0];
    const row = name.closest(".item-powertag-line");
    if (!item || !row) continue;
    row.querySelector(".litm-qol-session-use")?.remove();
    const label = document.createElement("label");
    label.className = "litm-qol-session-use";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.setAttribute("aria-label", `${featureName} used this session`);
    const dot = document.createElement("span");
    dot.className = "litm-qol-session-use-dot";
    dot.setAttribute("aria-hidden", "true");
    const key = item.uuid ?? `${actor.id}:${item.id}`;
    const paint = () => {
      box.checked = item.getFlag(MODULE_ID, USED_FLAG) === true;
      box.disabled = pending.has(key) || !(game.user.isGM || actor.isOwner);
      label.dataset.tooltip = `${featureName}: ${box.checked ? "Used" : "Unused"} this session. Click to toggle. Uncheck at the start of the next session.`;
    };
    paint();
    label.addEventListener("click", event => event.stopPropagation());
    box.addEventListener("change", async event => {
      event.stopPropagation();
      if (pending.has(key) || !(game.user.isGM || actor.isOwner)) { paint(); return; }
      const used = box.checked;
      pending.add(key); box.disabled = true;
      try { await item.setFlag(MODULE_ID, USED_FLAG, used); }
      catch (error) {
        console.error(`${MODULE_ID} | Could not save ${featureName} usage`, error);
        ui.notifications.error(`Could not save ${featureName} usage. Try again.`);
      } finally {
        pending.delete(key);
        // A document update can replace the row while this save is pending.
        if (root.isConnected) renderQuintessenceUsage(actor, root);
        if (actor.sheet?.element && actor.sheet.element !== root) renderQuintessenceUsage(actor, actor.sheet.element);
      }
    });
    label.append(box, dot); row.append(label);
  }
}
