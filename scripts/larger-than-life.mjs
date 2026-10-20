import { hasQuintessence } from "./quintessence-automation.mjs";

/** The Imperiled option keeps its identity when the Quintessence is removed. */
export function effectiveMight(actor, value) {
  const might = Number(value) || 0;
  if (might !== -3 && might !== -2) return might;
  return hasQuintessence(actor, "Larger Than Life") ? -2 : -3;
}

export function renderLargerThanLife(app, root) {
  const radio = root.querySelector('.might-scale-radio[value="-3"], .might-scale-radio[value="-2"]');
  if (!radio) return;
  const might = effectiveMight(app.actor, -3);
  app.mightScale = effectiveMight(app.actor, app.mightScale);
  radio.value = String(might);
  radio.checked = app.mightScale === might;
  const entry = radio.closest(".might-scale-entry");
  if (entry) {
    for (const node of [...entry.childNodes]) if (node.nodeType === 3) node.remove();
    entry.append(document.createTextNode(String(might)));
    if (might === -2) entry.dataset.tooltip = "Larger Than Life: Imperiled costs only 2 Power.";
    else delete entry.dataset.tooltip;
  }
  const label = root.querySelector(".power-label");
  if (label) label.textContent = `Power: ${app.computePowerAmount()}`;
}
