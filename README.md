# Legend in the Mist – Smeeth’s QoL

A quality-of-life module for the **Legend in the Mist** system on Foundry Virtual Tabletop.

Smeeth’s QoL adds guided Hero and theme-development workflows, cooperative multiplayer rolls, expanded roll options, improved chat cards, and automatic tag, status, and Promise bookkeeping.

## Requirements

- Foundry Virtual Tabletop 13 or newer
- Legend in the Mist system 14.4.4 or newer
- Socketlib 1.1.0 or newer

Socketlib is required for the multiplayer **Ask for Help** and **Group Action** workflows.



## Core Automation

### Single-Use Story Tags

Successful Detailed-roll cards include a button for creating a Single-Use Story Tag.

The tag is added to the Hero’s Tags and Statuses section, cannot be burned, and is deleted automatically after it contributes to a roll. The same cleanup occurs when it is contributed through Ask for Help or Group Action.

### Reduce Status

Right-clicking a status adds a **Reduce Status** option. Entering a number shifts all active status marks left by that many tiers. Marks reduced below tier 1 disappear.

### Fellowship Tags

Fellowship Themecard power tags are automatically scratched after they are invoked in a roll.

### Roll Dialog Reset

Each newly opened Quick or Detailed roll dialog resets:

- Positive modifiers
- Negative modifiers
- Might
- Trade Power selections

This prevents values from canceled or previous rolls from carrying forward.

## Enhanced Themekit and Themebook Selectors

The module replaces the native Themekit selector throughout the system with a searchable, scrollable two-panel browser.

Themekits are grouped by Might:

- Origin
- Adventure
- Greatness
- Variable
- Other

Each group is subdivided by theme type, such as Duty, Influence, or Devotion.

The matching world Themebook selector prominently displays descriptions, questions, Quest information, tags, and Special Improvement descriptions where applicable.

Selector content is read dynamically from the user’s installed world and system data; it is not bundled with this module.

## Hero Creator

The Actors directory includes a **Hero Creator** button that guides the player through four themes, one at a time.

For each theme, the player chooses a Themekit or Themebook.

### Themekits

- Select a Themekit using the enhanced selector.
- Choose two power tags in addition to the title tag.
- Choose one weakness.
- Create custom tags where appropriate.
- Edit the Quest.

### Themebooks

- Select a world Themebook.
- Answer its fixed title-tag question.
- Select and answer two additional power-tag questions.
- Select and answer one weakness question.
- Create a Quest.

Special Improvements are not selected during Hero creation.

The Hero is finalized only after all four themes are complete and confirmed. Canceling removes the draft actor. On completion, editing mode is turned off and the player is reminded to choose a Backpack tag and create relationship tags for members of their Fellowship.

The Hero Creator is also reused by the Be Reforged and Journey’s End workflows described below.

## Theme Development

### Improve Theme

When all three Improve marks are filled, an **Improve Theme** button appears.

The guided workflow can:

- Create a power tag or activate a planned one.
- Add, activate, or remove a weakness tag.
- Gain an unused Special Improvement.
- Reset Abandon, Milestones, or both.
- Mark Promise on a Hero theme.
- Revise an eligible existing power or weakness tag.

Changes remain staged until final confirmation. Completing the workflow applies the Improvement, resets the Improve tracker, and whispers a detailed summary to the Narrator.

Fellowship themes use the same workflow without Mark Promise.

### Replace Theme

When a Hero theme reaches three Abandon marks, a **Replace Theme** button appears.

The workflow calculates Promise earned from the old theme, creates a replacement using a Themekit or world Themebook, configures its title tag, Quest, and starting weakness, and presents a final confirmation. The old theme is not removed until the replacement is ready and confirmed.

Promise is awarded for:

- Replacing the theme
- Each active power tag beyond the third
- Each active weakness beyond the first
- Each active Special Improvement

### Nascent Themes

A replacement begins as a **Nascent** theme.

Improve on a nascent theme becomes **Develop Theme**, allowing the player to activate a planned power tag or create a new one. Once the theme has three active power tags including its title, the Nascent state is removed automatically.

### Evolve Theme

When a theme reaches three Milestones, an **Evolve Theme** button appears.

The player can:

1. Mark 1 Promise.
2. Choose a new title tag.
3. Change either theme type or Might.
4. Revise active power and weakness tags.
5. Revise the Quest.
6. Trade eligible surplus tags, weaknesses, or Special Improvements.
7. Complete one Improvement workflow for each trade.
8. Confirm the evolved theme and reset Milestones.

### Expand Theme

Instead of evolving the completed theme directly, the player can rewrite its Quest, choose another Hero theme to replace, and create a related nascent replacement theme.

### Fellowship Theme Development

Fellowship themes receive corresponding development controls:

- **Improve:** Uses the standard Improvement workflow without Promise.
- **Replace:** At three Abandon, manually creates a nascent Fellowship theme with a name, title tag, Quest, and weakness.
- **Develop:** Adds power tags until the nascent Fellowship theme reaches three active power tags.
- **Evolve:** At three Milestones, revises the title, tags, and Quest and permits eligible trades for Improvements.

Fellowship development does not award Promise, change theme type or Might, or offer Expand Theme.

## Promise and Moments of Fulfillment

### Promise Overflow

Promise earned beyond the visible maximum of 5 is preserved instead of lost. Stored Promise is applied after a Moment of Fulfillment is completed.

This applies to Promise earned through Improve, Replace, Evolve, and other automated workflows.

### Moments of Fulfillment

At 5 Promise, the Hero sheet displays a **Moment of Fulfillment** button with six paths:

- Arrive at Journey’s End
- Be Reforged
- Gain a Quintessence
- Shake the Foundations of Magic
- Speak Words Eternal
- Unearth Lost Truths

Completing a Moment of Fulfillment spends 5 Promise and applies stored overflow afterward.

#### Arrive at Journey’s End

Records the Hero’s retirement haven, new life, and safe-haven benefit in their Notes without deleting existing content. The player may finish without a replacement, use the Hero Creator for a new Hero from scratch, or create a replacement Hero with parity subject to Narrator approval.

#### Be Reforged

Uses the Hero Creator to build four replacement themes. The workflow calculates inherited free Improvements, preserves remaining Promise and Quintessences, and replaces the old themes only after final confirmation.

Inherited Improvements can be spent through the normal Improve Theme workflow without using the new theme’s Improve marks.

#### Gain a Quintessence

Choose an existing world Quintessence or create a new one with a name and description.

#### Narrative Fulfillments

Shake the Foundations of Magic, Speak Words Eternal, and Unearth Lost Truths provide concise prompts for resolving their narrative effects with the Narrator.

## Cooperative Rolls

### Ask for Help

Ask for Help is available on Quick, Detailed, and Reaction rolls.

The requester chooses one or more active players. Each helper receives a Socketlib request and can accept or decline. An accepting helper selects and confirms a power tag directly from their character sheet, while the requester sees live response statuses.

After everyone responds, the Narrator reviews the proposed contributions and may add active weakness tags from the involved Heroes. Approved contributions are inserted directly into the requester’s open roll dialog.

Additional automation includes:

- Contributed tags provide +1 Power.
- Contributions identify their source Hero.
- The helper’s tag does not remain selected for their own roll.
- Contributed single-use tags are deleted only when the assisted roll is made.
- Narrator-added weaknesses mark Improve on their original themes when used.
- Canceling the roll does not consume tags or grant Improve.

### Group Actions

Group Actions are available on Quick and Detailed rolls and use the same request and Narrator-approval process.

Each participant may contribute one power tag:

- A normal contribution provides 1 Power.
- One participant may burn a tag to provide 3 Power.

Helpers offer a burned contribution using the tag’s native burn control. The original tag is burned only when the Group Action roll is made. Only one burned tag is permitted across the entire roll, including a tag already selected for burning by the initiating Hero.

Single-use tags may be contributed normally but cannot be burned.

## Expanded Roll Options

### Trade Power

Detailed rolls include two mutually exclusive options:

- **Throw Caution to the Wind:** At final Power 2 or less, apply −1 Power to the roll. On success, add 1 to the normal Detailed-roll Power available to spend.
- **Hedge Your Risks:** At final Power 2 or more, apply +1 Power to the roll. On success, reduce the original spendable Power by 1.

Both options respect the Detailed-roll minimum of 1 spendable Power. The resulting card displays the final total directly and explains the calculation in a tooltip.

### Make a Sacrifice

Quick rolls include Painful, Scarring, and Grave Sacrifices.

Selecting a Sacrifice removes selected tag and status contributions, resets existing modifiers, and locks Might at 0. Positive and negative modifiers remain available afterward for a Narrator-assigned bonus or penalty.

Sacrifice rolls receive custom Miracle, Fate, and In Vain chat results. Each result includes the appropriate consequence and a functional button to:

- Choose and scratch one power tag.
- Choose a theme and scratch all its power tags.
- Choose a theme and launch the previously described Replace Theme workflow.
- Create a named tier-6 status.

Weakness tags are never offered by the Sacrifice scratching actions.

### Reaction Rolls

Reaction dialogs include the previously described Ask for Help workflow. Reaction results of 7–9 and 10+ list the available ways to spend Power to lessen Consequences.

On a 10+:

- Power may also be spent on an appropriate Effect.
- The displayed Power receives an automatic +1 bonus.
- The Power tooltip explains the bonus.

## Improved Chat Cards

Detailed 7–9 and 10+ cards include an expanded Power-spending reference for tags, statuses, Valuable Details, Extra Feats, and Single-Use Story Tags.

Additional card improvements include:

- Concise rules tooltips.
- Push Your Luck reminders on Quick and Detailed 10+ results.
- Correct final Power totals after Trade Power.
- Functional Single-Use Story Tag creation.
- Sacrifice consequence buttons.
- Reaction 10+ bonus Power.


## Legal Notice

Legend in the Mist is a trademark of Son of Oak Game Studio LLC.

This is an unofficial community module and is not affiliated with or endorsed by Son of Oak Game Studio.

The module provides automation and concise rules summaries; it does not reproduce or replace the official game materials. Users should consult a legally obtained copy of Legend in the Mist for the complete rules.

No official artwork, logos, fonts, or other assets are distributed with this module.
