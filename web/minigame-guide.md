# Adding a New Mini Game

This project supports two ways to add a mini game:

- Reuse an existing mini game type such as `tap-count` or `sequence-match`
- Create a brand new mini game type with its own runtime and UI

In most cases, reuse an existing type first. It keeps the work smaller and automatically plugs into the current `PLAY` and `LINK > GAME` flows.

## Current Architecture

- `minigames/playItems.js`
  Stores the list of mini games shown in the `PLAY` menu
- `minigames/index.js`
  Connects `minigame.type` to its runtime handler
- `minigames/tapCount.js`
  Runtime for score-by-tapping games
- `minigames/sequenceMatch.js`
  Runtime for ordered-input games
- `scenes/UIScene.js`
  Starts mini games, handles input, shows play UI, summary UI, and reward flow
- `scenes/BootScene.js`
  Preloads UI assets such as menu icons
- `service-worker.js`
  Pre-caches offline assets

## Fast Path: Add a Game That Reuses an Existing Type

If the new game can behave like a tap race or sequence memory game, only add a new item in `minigames/playItems.js`.

Example:

```js
{
  key: "my-new-game",
  label: "MY NEW GAME",
  caption: "Short description shown in the menu.",
  name: "MY NEW GAME",
  icon: "play",
  minigame: {
    type: "tap-count",
    durationSeconds: 4,
    inputPrompt: "O tap  X exit",
    scoreUnit: "taps",
    summaryTitle: "Result",
    getSummaryText: ({ score }) => `${score} taps\nNice run.`
  },
  currentStatus: ({ happiness, energy }) => ({
    happiness: Math.round(happiness),
    energy: Math.round(energy)
  }),
  effectStatus: {
    happiness: { min: 6, max: 18, minScore: 0, maxScore: 10 },
    energy: { min: -1, max: -8, minScore: 0, maxScore: 16 }
  }
}
```

### Required Fields

- `key`
  Unique id used by local play and link play
- `label`
  Short menu label
- `caption`
  Description shown in menu details
- `name`
  Display title during play
- `icon`
  UI icon key, usually an asset name from `assets/ui`
- `minigame`
  Runtime config consumed by the handler
- `effectStatus`
  Reward or penalty applied after the game ends

### What Happens Automatically

Once the item is added to `PLAY_MENU_ITEMS`:

- It appears under `PLAY`
- It appears under `LINK > GAME > HOST`
- It uses the common reward flow in `UIScene.js`
- It uses the common summary flow in `UIScene.js`

No extra menu wiring is needed.

## Advanced Path: Add a Brand New Mini Game Type

Use this path when the game cannot fit `tap-count` or `sequence-match`.

### 1. Create a New Runtime File

Add a new file under `minigames/`, for example:

- `minigames/reactionWindow.js`

Follow the same handler shape used by the existing runtimes:

```js
export const reactionWindowType = {
  createSyncState(item, randomPick) {
    return null;
  },
  createSession(item, randomPick, syncState = null) {
    return {
      ...createMiniGameState(),
      active: true,
      duration: item?.minigame?.durationSeconds || 5
    };
  },
  applyInput(miniGame, button, item) {
    return { type: "noop", miniGame };
  },
  finalizeResult(miniGame, item) {
    return miniGame;
  },
  buildStatusText(miniGame, item) {
    return "Status text";
  }
};
```

### 2. Register the Type

Update `minigames/index.js`:

- Import the new handler
- Add it to `MINI_GAME_TYPE_HANDLERS`

Example:

```js
const MINI_GAME_TYPE_HANDLERS = {
  "tap-count": tapCountType,
  "sequence-match": sequenceMatchType,
  "reaction-window": reactionWindowType
};
```

### 3. Add a Play Item

Create a new entry in `minigames/playItems.js` with:

```js
minigame: {
  type: "reaction-window",
  ...
}
```

### 4. Add a Dedicated Play UI If Needed

If text-only status is enough, no extra UI work is required.

If the game needs a custom play screen:

- Add a new markup method in `scenes/UIScene.js`
- Extend `getMiniGamePlayMarkup()` to render that view when the new `type` is active
- Add matching CSS in `styles.css`

Without this step, the game falls back to the generic text play view.

### 5. Add Sync State for Link Games If Needed

If both players must receive identical randomized data, implement `createSyncState()` in the handler.

Use this for cases like:

- shared sequence
- shared target
- shared random seed data

If the game does not need synchronized random state, return `null`.

## Rewards and Summary

Rewards are not hardcoded per mini game. They are resolved from the play item's `effectStatus`.

The current flow is:

1. `UIScene` finalizes the mini game
2. `resolveEffectStatus()` computes stat changes from score/result data
3. `addMiniGameReward()` applies the resolved effects through the common `play` action
4. Summary text is built from `minigames/index.js`

Useful summary fields passed into `getSummaryText()` include:

- `score`
- `success`
- `progress`
- `targetCount`
- `timeBonus`
- `remainingMs`
- `failureReason`
- `resolvedEffects`
- `effectStatusLines`

## Icons and Assets

If the new mini game uses an existing icon such as `play`, no asset work is needed.

If it needs a new icon:

1. Add an SVG under `assets/ui/`
2. Preload it in `scenes/BootScene.js`
3. Add it to `CORE_ASSETS` in `service-worker.js`

If step 2 or 3 is skipped, the icon may fail in normal play or offline mode.

## Testing Checklist

At minimum, verify:

- The game appears in `PLAY`
- The game appears in `LINK > GAME > HOST`
- Starting the game creates the expected session state
- Input updates score and progress correctly
- Completion or timeout produces the expected result object
- Reward values from `effectStatus` are applied correctly
- Summary text matches the game outcome

Recommended unit test coverage:

- session creation
- input handling
- successful completion
- failure or timeout path
- summary text output
- reward resolution

Existing tests already cover the current mini game system in `tests/effectStatus.test.mjs`.

## Practical Rules

- Prefer config-only additions before building a new type
- Keep `key` stable because link game mode uses it as `gameKey`
- Reuse the common reward flow instead of adding new actions to `gameState.js`
- Only add custom UI when the generic text view is not enough
- Add `createSyncState()` when link mode requires deterministic shared data

## Quick Decision Guide

Use `tap-count` when:

- the score is mostly "how many times the player pressed OK"

Use `sequence-match` when:

- the player must follow a known input order

Create a new type when:

- the game has its own state machine
- the scoring rules do not fit the existing handlers
- the play screen needs custom rendering or behavior
