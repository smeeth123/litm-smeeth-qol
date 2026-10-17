import { bindSpending } from "./single-use-tags.mjs";

const MODULE_ID = "litm-smeeth-qol";
const SYSTEM_ID = "mist-engine-fvtt";
export function cleanResultCard(message, root) {
  const context = message.getFlag(MODULE_ID, "rollContext");
  const spending = message.getFlag(SYSTEM_ID, "detailedSpend");
  const title = root.querySelector(".card-title")?.textContent.trim();
  const type = context?.rollType ?? (spending ? "detailed" : ["quick", "detailed", "reaction"].find(type =>
    title === game.i18n.localize(`MIST_ENGINE.ROLL_TYPES.${type}`)));
  if (!["quick", "detailed", "reaction"].includes(type)) return;
  const result = root.querySelector(".consequence-result-positive, .consequence-result-neutral, .consequence-result-negative");
  if (!result) return;
  if (root.dataset.litmQolCardCleaned !== "true") {
    root.dataset.litmQolCardCleaned = "true";
    const outcome = result.classList.contains("consequence-result-positive") ? 1 : result.classList.contains("consequence-result-neutral") ? 0 : -1;
    const heading = result.querySelector(".heading");
    const counter = result.querySelector(".power-counter");
    const summary = document.createElement("p");
    summary.className = "litm-qol-outcome-summary";
    summary.textContent = type === "reaction"
      ? outcome < 0 ? "Suffer the Consequences as-is." : outcome === 0 ? "Spend Power to lessen the Consequences." : "Spend Power to lessen Consequences or gain an appropriate Effect."
      : spending?.pushYourLuck ? "Your action succeeds, with Consequences from Push Your Luck."
        : outcome < 0 ? "The Narrator introduces a Consequence." : outcome === 0 ? "Your action succeeds, with a Consequence." : "Your action succeeds without Consequences.";
    if (context?.group) summary.textContent = summary.textContent
      .replace("Your action succeeds", "The group succeeds")
      .replace("Your action", "The group’s action");
    let groupNote;
    if (context?.group) {
      groupNote = document.createElement("p"); groupNote.className = "litm-qol-group-outcome";
      groupNote.textContent = `Acting Together. The outcome affects the entire group.`;
    }
    // Retain the actual dice outcome/Power; replace verbose historic content,
    // duplicate spending lists, and the old unbudgeted Create Tag button.
    result.replaceChildren(...[heading, summary].filter(Boolean));
    if (groupNote) result.append(groupNote);
    if (type === "reaction" && counter) result.append(counter);
    // Detailed success has one budget display in the native tracker. Quick
    // rolls do not have spendable Power; the dice formula shows its modifier.
    if (type === "detailed" && !spending && counter) result.append(counter);
    if (outcome === 1 && (type === "quick" || type === "detailed")) {
      const note = document.createElement("p");
      note.className = "litm-qol-push-luck-note";
      if (type === "detailed" && spending) {
        const button = document.createElement("button"); button.type = "button";
        button.className = "detailed-spend-btn litm-qol-push-luck-button";
        button.dataset.pushYourLuck = spending.pushYourLuck ? "undo" : "apply";
        button.setAttribute("aria-pressed", String(Boolean(spending.pushYourLuck)));
        if (spending.pushYourLuck) button.dataset.pushLuckGrant = String(spending.pushYourLuck.id ?? spending.pushYourLuck.at);
        button.textContent = spending.pushYourLuck ? "Undo Push Your Luck (−1 Power)" : "Push Your Luck (+1 Power)";
        button.dataset.tooltip = spending.pushYourLuck
          ? "Remove the bonus Power. If all Power is allocated, undo 1 Power of spending first."
          : "Accept Consequences from the Narrator to gain 1 spendable Power. Click again to undo. Core Book Vol. I, p. 158.";
        note.append(button);
      } else {
        const label = document.createElement("strong"); label.textContent = "Push Your Luck: ";
        note.append(label, document.createTextNode(type === "detailed"
          ? "accept Consequences for +1 Power."
          : "accept Consequences for a Great Success."));
        note.dataset.tooltip = "Agree on the Consequences with the Narrator before applying the benefit. Core Book Vol. I, p. 158.";
      }
      result.append(note);
    }
    for (const breakdown of root.querySelectorAll(".litm-qol-roll-tags")) {
      breakdown.replaceWith(...breakdown.querySelectorAll(".selected-tags"));
    }
    for (const group of root.querySelectorAll(".selected-tags")) if (!group.querySelector(".tag")) group.remove();
    for (const button of root.querySelectorAll("[data-spend-option]")) {
      if (button.dataset.spendOption === "singleUse") continue;
      button.dataset.tooltip = {
        tag: "Add, give, recover, or scratch a tag — 2 Power.",
        status: "Give or reduce a status — 1 Power per tier.",
        discover: "Discover a useful detail suited to the investigation — 1 Power.",
        feat: "Gain an additional narrative benefit within this action — 1 Power."
      }[button.dataset.spendOption] ?? "";
    }
  }
  if (spending) {
    const label = root.querySelector(".detailed-spend-header > span");
    if (label) label.textContent = "Power remaining";
    bindSpending(message, root);
  }
}
