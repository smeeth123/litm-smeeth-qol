# Legend in the Mist – Smeeth’s QoL

A quality-of-life module for the **Legend in the Mist** system on Foundry Virtual Tabletop.

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



## Settings

Find these under **Configure Settings → Legend in the Mist – Smeeth’s QoL**:

| Setting | Who configures it | Effect |
| --- | --- | --- |
| **Theme Browser Sources → Choose Sources** | GM | Select World Items and individual compendiums separately for Themebooks and Themekits. Applies to the whole world. |
| **Dark Chat Cards (Experimental)** | Each user | Optional dark surroundings, Labrada fonts, and gold accents. Off by default; changes apply immediately. Parchment result panels retain their native appearance. |

## Changes since 1.0.0

The 1.0.19 source includes:

- Integration with the native Request Help and Acting Together tools, including relationship tags and correct burn, weakness, single-use, and Fellowship bookkeeping.
- Trade Power integrated with native approval and Power spending, native Sacrifice consequence actions, and reversible Push Your Luck.
- Single-use story tags through native Spend/Undo, concise chat cards, and directly visible tag/status lists.
- Fellowship themecard live refresh, reliable manual Promise overflow, and preserved character-sheet scroll positions.
- Updated Themebook/Themekit browsers with GM-controlled sources, native matching/search options, and rich previews.
- Optional dark chat cards that preserve parchment panels, with centered dice totals.

## Core Automation

### Character Sheet Scroll

Full and compact character sheets preserve their current scroll position when Promise, tags, and other actor data change, including shared Fellowship updates. Character, Other, Biography, and Notes tabs are included.

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

The GM configures sources under **Configure Settings → Legend in the Mist – Smeeth's QoL → Theme Browser Sources → Choose Sources**. Select **World Items** and individual visible Item compendiums independently for Themebooks and Themekits, then **Save Sources**. **All** and **None** apply to their own column; saving no selections disables sources for that browser. These world settings apply to everyone and refresh open browsers when changed. Source controls are absent from the browsers themselves. Themekit availability also respects the system's source-pack restrictions and Include World Items setting; sources excluded there are omitted from the module menu. Hidden packs and documents are excluded. Before the GM saves a configuration, all currently permitted sources are available. The previous per-client source preferences are no longer used.

When assigning a kit from an existing Themebook, matching is trimmed and case-insensitive, using the book's name and the kit's theme type. Legacy kits with no theme type remain visible. **Show all Themekits** removes that filter. Hero Creator and replacement drafts start without a name filter.

Search always includes names. Toggles add descriptions, power tags/questions, weakness tags/questions, Special Improvements, Quest, and Story; all are enabled initially to retain broad searching. Search controls remain in place while selecting previews. A selection hidden by a filter is cleared before it can be confirmed.

Themekits are grouped by Might (Origin, Adventure, Greatness, Variable, Other), then theme type. Previews include descriptions, tags or questions, Quest, Story, Special Improvements, native tag/status markup, and document links. Each preview identifies its World or compendium source. Themekit Add, Assign, population, and merge continue through the system's native adapter.

Only selected sources are queried, using the requested Item type. One failed compendium does not hide results from other sources; **Retry sources** reloads them. Source and preview requests ignore obsolete responses after a GM source-setting change or closing the browser. Story Theme items are excluded from Themebook choices.

Selector content is read dynamically from the user’s installed world and compendiums; it is not bundled with this module.

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

- Select a Themebook from World Items or a selected compendium.
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

Enable **Configure Settings → Smeeth’s QoL → Dark Chat Cards (Experimental)** to try a dark paper palette, cream text, gold accents, and the module’s Labrada font. This personal setting is off by default and updates existing cards immediately. It applies to native Quick, Detailed, Reaction, Sacrifice, and Group roll cards, including popped-out cards. The surrounding card, tag lists, dice totals, spending controls outside parchment, and whisper indicators use the dark palette. Parchment result panels retain their native backgrounds, colors, typography, sizing, icons, and controls, including Push Your Luck. Ordinary chat messages keep their normal appearance. Disable the setting to restore native styling.

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
