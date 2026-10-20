/** Beyond Luck automation for Mist Engine 14.5.4.
 * executeBeyondLuck adapts the system's executeRoll (MIT; see licenses/).
 * Installed beneath the existing Trade Power and single-use wrappers so their
 * approval, spending, contribution and consumption behavior is preserved.
 * Other actors delegate to the original method unchanged.
 */
const PATCHED = Symbol.for("litm-smeeth-qol.quintessenceAutomation");

export function hasBeyondLuck(actor) {
  return hasQuintessence(actor, "Beyond Luck");
}

export function hasQuintessence(actor, name) {
  if (!["character", "litm-character"].includes(actor?.type)) return false;
  return actor.items?.some(item => item.type === "quintessence"
    && String(item.name ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() === name.toLowerCase()) ?? false;
}

export function installQuintessenceAutomation(DiceRollApp, createDetailedMessage) {
  const proto = DiceRollApp.prototype;
  if (proto[PATCHED]) return;
  const original = proto.executeRoll;
    async function executeBeyondLuck({ numModPositive, numModNegative, mightScale }) {
        let numPositiveTags = numModPositive;
        let numNegativeTags = numModNegative;

        let tagsAndStatusForRoll = DiceRollApp.applyRulesToSelectedTags(this.selectedTags, this.selectedGmTags, this.selectedStoryTags, this.challengeTags);
        let countTags = DiceRollApp.calculatePowerTags(tagsAndStatusForRoll);
        numPositiveTags += countTags.positive;
        numNegativeTags += countTags.negative;

        // Helping Each Other (p. 131): +1 Power per contributed tag (never burned).
        const helpingContribs = (this.helpingTags ?? []).map(h => ({ name: `${h.name} (${h.helperName})`, positive: true, source: "help" }));
        numPositiveTags += helpingContribs.length;


        const dicePromises = [];

        let rollFormula = `2d6`;
        if (numPositiveTags > 0) rollFormula += ` + ${numPositiveTags}`;
        if (numNegativeTags > 0) rollFormula += ` - ${numNegativeTags}`;

        let numPowerTags = parseInt(numPositiveTags) - parseInt(numNegativeTags);

        if (mightScale != 0) {
            rollFormula += ` + ${mightScale}`;
            numPowerTags += mightScale;
        }

        // clamp only AFTER might is applied, otherwise a negative tag total
        // gets lifted to 1 first and might is added on top (issue #97)
        if (numPowerTags <= 0) numPowerTags = 1; // at least 1 power tag

        const diceRoll = new Roll(rollFormula, this.actor.getRollData());
        await diceRoll.evaluate();

        this.addShowDicePromise(dicePromises, diceRoll);
        await Promise.all(dicePromises);

        let diceResults = [...diceRoll.terms[0].results].map(r => r.result);

        let isCritical = (diceResults[0] === 6 && diceResults[1] === 6);
        const doubleOnes = diceResults[0] === 1 && diceResults[1] === 1;
        const isFumble = doubleOnes && !hasBeyondLuck(this.actor);

        let diceRollHTML = await diceRoll.render();
        if (doubleOnes && !isFumble) diceRollHTML += '<p class="litm-qol-quintessence-note">Beyond Luck: double ones resolve normally.</p>';

        let consequenceResult = -1;
        if (diceRoll.total >= 10) {
            consequenceResult = 1;
        }
        else if (diceRoll.total >= 7 && diceRoll.total <= 9) {
            consequenceResult = 0;
        }

        // double sixes always mean Success without Consequences, double ones
        // always Consequences without Success — regardless of Power!!!!
        if (isCritical) consequenceResult = 1;
        if (isFumble) consequenceResult = -1;

        let positiveTags = [...tagsAndStatusForRoll.filter(t => t.positive), ...helpingContribs];
        let negativeTags = tagsAndStatusForRoll.filter(t => !t.positive);

        const chatVars = {
            diceRollHTML: diceRollHTML,
            label: game.i18n.localize(`MIST_ENGINE.ROLL_TYPES.${this.rollType}`),
            tagsAndStatusForRoll: this.tagsAndStatusForRoll,
            positiveTags: positiveTags,
            negativeTags: negativeTags,
            consequenceResult: consequenceResult,
            isCritical: isCritical,
            isFumble: isFumble,
            numPowerTags: numPowerTags,
        };

        const speaker = ChatMessage.getSpeaker({ actor: this.actor });
        if (this.rollType === "detailed") {
            // detailed action gets an interactive Power-spending tracker (p. 154)
            await createDetailedMessage(chatVars, speaker);
        } else {
            const html = await foundry.applications.handlebars.renderTemplate(
                `systems/mist-engine-fvtt/templates/chat/${this.rollType}-result.hbs`,
                chatVars
            );
            ChatMessage.create({ content: html, speaker });
        }

        this.numModPositive = 0;
        this.numModNegative = 0;
        this.mightScale = 0;
        this.helpingTags = [];
        this.pendingHelpReqId = null;
        this.invertedTags.clear(); // #35: the inversion only applied to this roll
        this.invertedChallengeEntries.clear(); // #104: the inversion only applied to this roll

        this.resetTags();
        this.close();
    }

  proto.executeRoll = function(values) {
    return hasBeyondLuck(this.actor)
      ? executeBeyondLuck.call(this, values)
      : original.call(this, values);
  };
  Object.defineProperty(proto, PATCHED, { value: true });
}
