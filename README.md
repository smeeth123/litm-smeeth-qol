# Legend in the Mist – Smeeth’s QoL

A quality-of-life module for the **Legend in the Mist** system on Foundry Virtual Tabletop.

<img width="1728" height="1117" alt="Screenshot 2026-10-17 at 2 47 09 PM" src="https://github.com/user-attachments/assets/b053e2b0-20f4-479e-be1a-ceefb2b84202" />

## Installation

Install and enable **Socketlib**, then install this module using Foundry’s **Install Module → Manifest URL** field:

```text
https://github.com/smeeth123/litm-smeeth-qol/releases/latest/download/module.json
```

Enable **Legend in the Mist – Smeeth’s QoL** in your world and reload the GM and player clients after updating.

The manifest above follows published GitHub releases. Updating the source on `main` does not change the release download until a new release is published.

Smeeth’s QoL adds guided Hero and theme-development workflows, cooperative multiplayer rolls, expanded roll options, improved chat cards, and automatic tag, status, and Promise bookkeeping.

## Requirements

- Foundry Virtual Tabletop 14 or newer
- Legend in the Mist system 14.5.4 or newer
- Socketlib 1.1.0 or newer

Socketlib is required for enhanced native **Request Help**, **Acting Together**, and synchronized Power/tag bookkeeping.


## Forge and hosted games

System integrations resolve from Mist Engine’s actual loaded entry script, including Forge’s versioned CDN URLs. This prevents Trade Power and cooperative roll integrations from patching a separate copy of the system classes.

After updating on Forge, restart the hosted game and reload every connected client. Trade Power appears in **Detailed** roll dialogs. Socketlib must be installed and enabled in the world for multiplayer bookkeeping.

## Tropes

Create a **Trope** from the Items directory’s **Create Item** dialog. A Trope contains a rich-text description, three core Themekits, three additional Themekits from which a Hero will choose one, and three Backpack tags from which they will choose one.

Use the optional **Category** field beneath Name to organize a Trope, for example Village Folk or Oldways Practitioners. It saves with the Item in the world or a compendium. Existing Tropes without a category start blank.

Use **Choose** or drag a Themekit from World Items or a compendium into any of the six kit slots. **Open** inspects the linked kit and **Clear** removes the link. The chooser uses the system’s Themekit source settings. Kits remain linked to their source documents, so those sources need to remain available. Enter the Backpack choices directly in the three tag fields. Changes save automatically, and incomplete Tropes can be finished later. Tropes are ordinary Items that can be duplicated, exported, or stored in Item compendiums.

The Trope browser groups entries by **Category**, with categories and Trope names sorted alphabetically and **Uncategorized** last. Use the category selector to narrow the list, or search names and categories together. Empty groups disappear while filtering. Filtering out a selected Trope clears its selection before it can be used; existing source visibility and kit validation still apply.

In **Hero Creator**, choose **Start with a Trope** to browse visible Trope Items from the world and Item compendiums. Preview its description and core kits, choose the fourth kit and one Backpack tag, then customize all four themes through the normal tag, weakness, and Quest steps. Missing or unavailable core kits prevent using a Trope; individual unavailable alternatives cannot be selected. The native Themekit source settings apply to linked kits. **Build freely** retains the individual Themebook/Themekit choices. Reforging can use a Trope’s themes while retaining the Hero’s existing Backpack.

## Core Automation

### Single-Use Story Tags

On a successful Detailed roll, use the native **Single-Use** spending button when exactly 1 Power remains. Enter a tag name to create the tag and spend that Power together. Canceling does neither.

Tags appear in the Hero’s Tags and Statuses section with a single-use label. They cannot be burned and are removed only after a completed roll actually invokes them, including approved module Help/Group contributions. Ordinary chat, canceled rolls, and rejected approval do not consume them. Tags carry stable IDs, so duplicate names, renaming, and array reordering cannot redirect cleanup.

Undo removes an unused tag and refunds its allocation. Once a completed roll has invoked the tag, that allocation cannot be refunded. Native Spend and Undo remain the single spending ledger; operations are serialized through the active Narrator when connected.

Existing unambiguous tags receive IDs on reload. If old name-only records match multiple entries, the sheet offers **Identify legacy single-use tags** instead of guessing which tag to remove.

### Reduce Status

Right-clicking a status adds a **Reduce Status** option. Entering a number shifts all active status marks left by that many tiers. Marks reduced below tier 1 disappear.

### Fellowship Tags

Normal relationship-tag scratching is handled by the system’s native roll cleanup; the module does not duplicate it. The module still scratches contributed relationship tags on their original Heroes in enhanced Help/Group rolls. Invoked Fellowship Themecard powers in ordinary Quick, Detailed, Reaction, and Group rolls are scratched only after their result message is created, using saved source references and retry-safe bookkeeping. Unrelated chat, cancellation, and rejected rolls cannot trigger scratching. Native weakness Improve remains intact.

Open full and compact character sheets refresh automatically when their linked Fellowship Themecard changes, including selection, scratching/recovery, tags, trackers, and names. This works after closing/reopening and on every connected client receiving the document update. Refreshes replace stale cached references after assignment changes or deletion, preserve closed/minimized sheets, and coalesce rapid updates. No extra socket messages or document writes are used for display refresh.

### Roll Dialog Reset

Each newly opened Quick or Detailed roll dialog resets:

- Positive modifiers
- Negative modifiers
- Might
- Trade Power selections

This prevents values from canceled or previous rolls from carrying forward.

## Enhanced Themekit and Themebook Selectors

The module replaces the native Themekit selector with a searchable, scrollable two-panel browser. The same browser serves Themebook selection in Hero Creator and Replace Theme.

Themekit sources use the system’s native source picker in system settings, including its World Items option and compendium choices. These settings apply to every module Themekit browser, including Hero Creator and theme replacement, and refresh open browsers when changed. The module adds no second Themekit source filter.

For Themebooks, Quintessences, and Tropes, the GM configures **Configure Settings → Legend in the Mist – Smeeth’s QoL → Theme Browser Sources → Choose Sources**. Select **World Items** and individual visible Item compendiums, then **Save Sources**. **All** and **None** select or clear the list; each column is independent and saving no selections disables its sources. These world settings apply to everyone and refresh open browsers when changed. Hidden packs and documents are excluded. Before the GM saves a configuration, all permitted sources are available. Source controls are absent from the browsers themselves. The Hero Creator Trope chooser uses the Tropes column; source changes refresh the open chooser and clear its selection. The Moment of Fulfillment Quintessence chooser includes World Items and compendiums enabled in the Quintessences column, identifies each source, and retains the option to create a new Quintessence.

When assigning a kit from an existing Themebook, matching is trimmed and case-insensitive, using the book's name and the kit's theme type. Legacy kits with no theme type remain visible. **Show all Themekits** removes that filter. Hero Creator and replacement drafts start without a name filter.

Search always includes names. Toggles add descriptions, power tags/questions, weakness tags/questions, Special Improvements, Quest, and Story; all are enabled initially to retain broad searching. Search controls remain in place while selecting previews. A selection hidden by a filter is cleared before it can be confirmed.

Themekits are grouped by Might (Origin, Adventure, Greatness, Variable, Other), then theme type. Previews include descriptions, tags or questions, Quest, Story, Special Improvements, native tag/status markup, and document links. Each preview identifies its World or compendium source. Themekit Add, Assign, population, and merge continue through the system's native adapter.

Only selected sources are queried, using the requested Item type. One failed compendium does not hide results from other sources; **Retry sources** reloads them. Source and preview requests ignore obsolete responses after a GM source-setting change or closing the browser. Story Theme items are excluded from Themebook choices.

Selector content is read dynamically from the user’s installed world and compendiums; it is not bundled with this module.

## Hero Creator

The Actors directory includes a **Hero Creator** button that guides the player through four themes, one at a time. Naming is the final step after reviewing the completed themes, on both the Trope and free-build paths and when creating Reforged or replacement Heroes. Choose **Skip** to name the Hero later: new Heroes keep **New Hero**, while Reforging keeps the existing name.

Start with a **Trope** or **Build freely**. A Trope supplies three core Themekits, a choice of a fourth kit, and a Backpack tag choice; the player still customizes each theme. Build freely lets the player choose a Themekit or Themebook for each theme.

### Themekits

- Select a Themekit using the enhanced selector.
- Choose two power tags in addition to the title tag.
- Choose one weakness.
- Create custom tags where appropriate.
- Edit the Quest.

### Themebooks

- Select a Themebook from World Items or a selected compendium.
- Answer its fixed title-tag question.
- Select and answer two additional power-tag questions.
- Select and answer one weakness question.
- Create a Quest.

Special Improvements are not selected during Hero creation.

The Hero is finalized only after all four themes are complete and confirmed. Canceling removes the draft actor. On completion, editing mode is turned off and the player is reminded to create relationship tags for members of their Fellowship. Free builds also retain the reminder to choose a Backpack tag; Trope builds already include their chosen tag.

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

The workflow calculates Promise earned from the old theme, creates a replacement using a Themekit or Themebook from the selected sources, configures its title tag, Quest, and starting weakness, and presents a final confirmation. The old theme is not removed until the replacement is ready and confirmed.

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

This applies to manual counter clicks and Promise earned through Improve, Replace, Evolve, and other automated workflows.

- **Left-click:** Gain 1 Promise. The visible counter stops at 5; further awards are stored.
- **Right-click:** Remove 1 Promise, from stored overflow first and then the visible counter. The total cannot go below zero.
- The counter shows **+N stored** when overflow exists, on both full and compact sheets.
- Manual awards, automated awards, corrections, and fulfillment share a per-Hero queue through the active Narrator (or the owning client when no Narrator is connected). Rapid clicks and simultaneous GM/player awards are applied sequentially.
- Completing a Moment of Fulfillment spends 5 and applies stored Promise afterward.

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

Socketlib remains required. The module enhances the native **Request Help** and **Acting Together** entry points; its separate Ask for Help and Group Action buttons have been removed from roll dialogs.

### Request Help

Use **Request Help** beside Roll in the normal Quick, Detailed, or Reaction dialog. Choose active players with assigned Heroes; helpers accept or decline, select a tag from their sheet (or the available-tag selector on that sheet), and confirm it. The requester sees response statuses, and the Narrator reviews contributions and may add participant weaknesses before applying them.

Eligible contributions include active theme power tags, unexpired backpack tags, positive floating story tags, single-use story tags, and unscratched Fellowship relationship tags. Sources with identical names remain separate choices. Planned, burned, scratched, and expired entries are unavailable. A player cannot contribute through two accounts assigned the same Hero.

- Help contributes +1 Power and cannot be burned.
- Relationships contribute +1 and scratch the original relationship only after a completed roll invokes them; they cannot be burned.
- Single-use tags are consumed only by a completed roll that invokes them.
- Hindering weaknesses award one Improve per original theme, capped at three; native awards are not duplicated.
- Approved contributions survive sheet and scene refreshes, can be removed using the native trash control, and clear when the dialog closes or changes Hero/roll type.
- Pending reviews block rolling. Late approval cannot attach to a closed or repurposed dialog.
- Bookkeeping runs through the active Narrator for other players’ Heroes. Failed updates expose **Retry roll tag bookkeeping**, which preserves completed effects.

### Acting Together

Open **Acting Together** from the system’s Mist toolbar. This native tool is available to both the Narrator and players with an assigned Hero.

1. Choose **Detailed** or **Quick**, then **Start Group Action** and select participants. Players can include themselves.
2. Each participating Hero offers one tag. The Narrator reviews the offers, may approve one burn for 3 Power, and may add weaknesses. Relationships and single-use tags cannot be burned.
3. The Narrator reviews the contributions and modifier, and may invoke any relevant Fellowship theme power tags in addition to the Heroes’ contributions. No Hero leads or owns the group action.
4. **Roll for Group** opens the normal roll dialog with the approved contributions. Detailed actions retain Trade Power, the native spending tracker, and Push Your Luck. The group result identifies participants and states that its outcome affects everyone.

Heroes’ unrelated sheet selections are excluded from the group roll and left unchanged. The roll dialog, final Narrator confirmation, and chat message identify **Acting Together**, and the outcome affects the entire group. The final confirmation identifies the submitting player without presenting a Hero as the acting character. When group Power creates a single-use tag, choose the receiving Hero for that expenditure; Undo tracks that same Hero. Each Hero may contribute up to one tag representing their most significant contribution to the joint effort; relationship tags count toward this maximum. Relevant Fellowship theme power tags are additional shared contributions and do not count toward that limit. Removing a personal contribution from the native list also removes that Hero’s added weaknesses; the Hero remains part of the group affected by the outcome. **Choose Participants Again** restarts collection without spending resources.

Invoked Fellowship theme power tags are scratched on their original shared theme after the roll completes. Uninvoked tags and canceled rolls are unaffected; safe retries do not scratch tags recovered after an earlier roll.

Group burns, relationship scratches, single-use consumption, and weakness Improve apply to their original sources after the completed result message exists. Ordinary chat, Sacrifice, rejection, and cancellation do not trigger cooperative bookkeeping. Stale burn/weakness/relationship sources stop execution before dice are rolled.

## Expanded Roll Options

### Trade Power

Detailed rolls include two mutually exclusive options:

- **Throw Caution to the Wind:** At final Power 2 or less, apply −1 Power to the roll. On success, add 1 to the normal Detailed-roll Power available to spend.
- **Hedge Your Risks:** At final Power 2 or more, apply +1 Power to the roll. On success, reduce the original spendable Power by 1.

Both options respect the Detailed-roll minimum of 1 spendable Power. The resulting card displays the final total directly and explains the calculation in a tooltip. The native Power-spending tracker, Spend/Undo, and reloads use that same total. Trade selections survive Narrator approval without a timeout; changes to tags, modifiers, Might, or helpers are checked again before submission. Trade Power appears only in Detailed rolls.

### Make a Sacrifice

Use the system's **Sacrifice** button on the full or compact Hero sheet in Game Mode. The native dialog selects the Sacrifice level and Narrator modifier and handles the dice and Miracle, Fate, or In Vain result. Sacrifice is separate from the Quick-roll dialog.

The module adds consequence buttons to native Sacrifice result cards: scratch one power tag, scratch all power tags in a theme, replace a theme, or create a harmful tier-6 status. These actions do not invoke selected tags or consume help contributions. Completed consequences are marked on the message to prevent applying them again through its button.

### Reaction Rolls

Reaction dialogs use the enhanced native Request Help workflow described above. Reaction results of 7–9 and 10+ list the available ways to spend Power to lessen Consequences.

On a 10+:

- Power may also be spent on an appropriate Effect.
- The displayed Power receives an automatic +1 bonus.
- The Power tooltip explains the bonus.

## Improved Chat Cards

Dark chat cards use a dark paper palette, cream text, gold accents, and the module’s Labrada font. **Configure Settings → Smeeth’s QoL → Dark Chat Cards** is a personal setting, enabled by default, that updates existing cards immediately. Previously saved preferences are preserved. It applies to native Quick, Detailed, Reaction, Sacrifice, and Group roll cards, including popped-out cards. The surrounding card, tag lists, dice totals, spending controls outside parchment, and whisper indicators use the dark palette. Parchment result panels retain their native backgrounds, colors, typography, sizing, icons, and controls, including Push Your Luck. Ordinary chat messages keep their normal appearance. Disable the setting to restore native styling.

Result cards show a concise outcome and directly visible tag/status lists. Spending guidance is provided by button tooltips.

- Detailed results use one native Power budget and one set of spending controls. Tooltips explain effects without repeating the full menu.
- Single-use creation and Undo operate through those spending controls.
- Quick results omit a misleading spendable-Power counter; the dice formula retains the roll modifier.
- Reaction results retain their Power counter and 10+ bonus.
- Trade Power retains its rolled-Power note and corrected spending total.
- Native Sacrifice results retain the module’s consequence buttons.
- Detailed 10+ results offer **Push Your Luck (+1 Power)**. Clicking accepts Narrator-assigned Consequences and adds 1 spendable Power. Click again to undo the bonus; if all Power is allocated, undo at least 1 Power of spending first. At most one bonus can be active per roll. The toggle state and budget survive reloads. Quick 10+ results retain the Great Success reminder.

## Legal Notice

Legend in the Mist is a trademark of Son of Oak Game Studio LLC.

This is an unofficial community module and is not affiliated with or endorsed by Son of Oak Game Studio.

The module provides automation and concise rules summaries; it does not reproduce or replace the official game materials. Users should consult a legally obtained copy of Legend in the Mist for the complete rules.

No official artwork, logos, fonts, or other assets are distributed with this module.


## Quintessence automation: Beyond Luck

Add an Item of type **Quintessence** named **Beyond Luck** to a character's sheet. On Quick and Detailed actions, double ones no longer force an automatic miss. The modified total resolves normally: below 7 fails, 7–9 succeeds with consequences, and 10+ succeeds without consequences. Double sixes retain their existing automatic success. A short note on double-one cards identifies the effect.

The effect is checked from owned Items each time the character rolls. It needs no toggle, Active Effect, or migration; adding/removing the Quintessence takes effect on the next roll. Names are matched without case sensitivity and with surrounding/repeated whitespace ignored. Other item types and similarly named Quintessences do not activate it. A GM rolling that character receives the same benefit. Existing chat results are unchanged.

This integration targets Mist Engine 14.5.4 and preserves the module's existing Trade Power, GM approval, helping, and single-use wrappers. For affected characters only, it adapts the system's native action-roll routine to remove the double-one override; other characters delegate to the native method. The adapted routine must be reviewed when updating the system. Its MIT attribution is in `licenses/mist-engine-fvtt-LICENSE.txt`. No system files are edited.


## Quintessence automation: Diligent Drudge

Add a **Quintessence** Item named **Diligent Drudge** to a character. Matching ignores case and repeated/surrounding whitespace. Each personal theme's Improve track displays five boxes. Existing Improve marks are retained; adding the Quintessence does not reset progress.

The fifth mark resets that theme's Improve track to zero and banks **two improvements on that theme** in the same document update. Its **Improve Theme (2 available)** button opens the existing improvement workflow. Confirming one choice spends one earned improvement; the other remains available until used. Cancelling or closing a choice does not spend it. Earned improvements persist across reloads and removing the Quintessence. New Improve marks accumulated after the reset are preserved when spending banked improvements. Further completed tracks add two more credits.

Left-click marks Improve; the existing right-click action removes a mark from the current track. Weakness/inverted-power awards and Helping/Group Action bookkeeping also support marks four and five, with the existing once-per-theme rules. Shared Fellowship themecards and Story themes retain their existing rules. Ordinary characters keep the standard three-box workflow.

Diligent Drudge also applies to personal nascent themes: their usual one-mark Develop Theme action is replaced by the five-mark/two-improvement workflow while the Quintessence is owned. A nascent theme still matures when it gains its third active power tag. Removing the Quintessence restores the usual track/development rules without deleting earned credits or current progress.


## Quintessence automation: Fumbling Master

Add a **Quintessence** Item named **Fumbling Master** to the Hero. When one of that Hero's actual weakness tags is invoked, the Quick/Detailed roll dialog shows an optional **Fumbling Master** checkbox for the weakness. It starts unchecked. It also recognizes contributed weaknesses, labeling their owning Hero and theme. A GM invoking the Hero's weakness gets the same option. Power tags merely inverted to hinder, unrelated negative tags, and shared Fellowship weaknesses do not qualify.

Selecting the option replaces that weakness's contribution with **−2 Power total**, rather than applying an additional −2. For an ordinary hindering weakness, this adds one extra point of penalty beyond its normal −1. The Power preview, roll formula, Detailed spend budget, Trade Power eligibility, and native GM approval all include the adjustment. If a weakness has been inverted to help, choosing Fumbling Master replaces its +1 with −2. Choose at most one weakness per theme per roll, preserving the system's once-per-theme Improve rule. Separate themes can each use the option.

The selected weakness's owning theme earns **2 Improve instead of 1**. The module suppresses its normal cleanup mark and applies both marks through the existing saved roll receipt, including Helping and Group Actions. Retrying cleanup does not duplicate the award. With Diligent Drudge, a roll starting at 4 Improve completes the five-box track, banks its two improvements, and leaves the second Fumbling Master mark on the new track. On ordinary three-box tracks, any excess mark is saved and restored after the existing Improve Theme workflow is completed; its button tooltip identifies saved marks.

The choice applies only to the current roll. Closing/cancelling grants no marks, and choices clear after execution or when switching characters/roll types. During native GM approval the choices are locked; removing or changing the qualifying weakness/Quintessence before execution invalidates the saved choice. A short note on the resulting card records Fumbling Master's use.

## Quintessence automation: Larger Than Life

An owned Quintessence Item named **Larger Than Life** changes the roll dialog's **−3 Might** (Imperiled) option to **−2**. The radio value, selected state, Power preview, actual Quick/Detailed/Reaction roll modifier, Detailed spending, Trade Power calculation, and GM approval use the adjusted value. Names are matched without case or extra-whitespace sensitivity. Removing the Quintessence restores −3. Other Might choices, including −6, retain their existing values. Might must be enabled in system settings for its controls and preview contribution. Status Consequences remain manual.

## Quintessence usage: Lucky Bastard

An owned **Lucky Bastard** Quintessence gains a checkbox beside its name on the character sheet, labeled **Available** or **Used**. Eligible Quick, Detailed, and Reaction chat cards show **Use Lucky Bastard → 7** for the roller or GM. Clicking changes the displayed result to 7 and the outcome to success with Consequences (or the corresponding Reaction outcome), then marks the Quintessence **Used**. The original total and dice remain saved for reference. Detailed cards enable their normal spending controls with the original Power budget; existing spending data is preserved. Double ones are excluded even with Beyond Luck. Results above 6 and automatic successful outcomes do not offer the button.

Uncheck the sheet marker at the start of the next session. Usage is saved on the embedded Item and survives reloads. Owners and the GM can edit it; other viewers see its state. Buttons on other eligible cards become disabled after use. The operation runs through the existing serialized GM queue to prevent concurrent cards from consuming the same use. If the chat write fails after reserving the use, the same card offers a retry without consuming a second use. There is no automatic session reset. Older cards with a native two-d6 tooltip are supported; new cards save a structured dice snapshot.

## Quintessence automation: Virtuoso

An owned **Virtuoso** Quintessence gets the same compact **Available / Used** session dot as Lucky Bastard. Eligible 7–9 Quick, Detailed, and Reaction cards show **Use Virtuoso → 10** to the roller or GM. Using it updates the displayed total and outcome in the original card, records the previous total, and marks Virtuoso used this session. Detailed rolls keep their existing Power budget and spending entries. The upgraded success also supports the existing Push Your Luck controls.

Virtuoso has its own session use, independent of Lucky Bastard. Uncheck its dot at the next session to restore availability. Concurrent requests and failed message writes use the same serialized reservation/retry handling as Lucky Bastard. A result treated as 7 by Lucky Bastard may then use an available Virtuoso, preserving both receipts. Native fumbles and already automatic successes are not offered an outcome upgrade.