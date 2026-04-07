import test from "node:test";
import assert from "node:assert/strict";

import { createNewState, addMiniGameReward } from "../gameState.js";
import { resolveEffectStatus, resolveEffectValue } from "../helpers/effectStatus.js";
import { SEQUENCE_MATCH_HIT_SCORE } from "../minigames/sequenceMatch.js";
import {
  applyMiniGameInput,
  finalizeMiniGameResult,
  getMiniGameSummaryText,
  initializeMiniGameSession
} from "../minigames/index.js";

test("resolveEffectValue supports number, function, and object configs", () => {
  assert.equal(resolveEffectValue(4), 4);
  assert.equal(resolveEffectValue(({ score }) => score + 1, { score: 6 }), 7);
  assert.equal(resolveEffectValue({ value: 9 }), 9);
  assert.equal(resolveEffectValue({ value: ({ taps }) => taps * 2 }, { taps: 3 }), 6);
  assert.equal(resolveEffectValue(null, { score: 5 }), 0);
});

test("resolveEffectValue supports score range configs with clamping and rounding", () => {
  const config = { min: -1, max: -4, minScore: 10, maxScore: 40 };

  assert.equal(resolveEffectValue(config, { score: 0 }), -1);
  assert.equal(resolveEffectValue(config, { score: 10 }), -1);
  assert.equal(resolveEffectValue(config, { score: 25 }), -2);
  assert.equal(resolveEffectValue(config, { score: 39 }), -4);
  assert.equal(resolveEffectValue(config, { score: 40 }), -4);
  assert.equal(resolveEffectValue(config, { score: 100 }), -4);
});

test("resolveEffectValue treats equal minScore and maxScore as a threshold", () => {
  const config = { min: 1, max: 5, minScore: 3, maxScore: 3 };

  assert.equal(resolveEffectValue(config, { score: 2 }), 1);
  assert.equal(resolveEffectValue(config, { score: 3 }), 5);
  assert.equal(resolveEffectValue(config, { score: 6 }), 5);
});

test("resolveEffectStatus returns non-zero resolved values from runtime context", () => {
  const resolved = resolveEffectStatus(
    {
      happiness: { value: ({ score }) => score * 2 },
      energy: { value: ({ score }) => -score },
      weight: { value: () => 0 }
    },
    { score: 5 }
  );

  assert.deepEqual(resolved, {
    happiness: 10,
    energy: -5
  });
});

test("resolveEffectStatus resolves score range configs and filters zero or invalid values", () => {
  const resolved = resolveEffectStatus(
    {
      happiness: { min: 4, max: 18, minScore: 0, maxScore: 7 },
      energy: { min: 0, max: -10, minScore: 0, maxScore: 20 },
      weight: { min: 0, max: 0, minScore: 0, maxScore: 1 },
      health: { value: Number.NaN }
    },
    { score: 4 }
  );

  assert.deepEqual(resolved, {
    happiness: 12,
    energy: -2
  });
});

test("addMiniGameReward applies pre-resolved effects without recalculating config", () => {
  const state = createNewState();
  state.evolutionStage = "child";
  state.energy = 50;
  state.happiness = 40;

  const result = addMiniGameReward(
    state,
    {
      happiness: 12,
      energy: -4
    },
    { score: 6, taps: 6, success: true }
  );

  assert.equal(result.ok, true);
  assert.equal(state.happiness, 52);
  assert.equal(state.energy, 46);
});

test("minigame summary reuses resolved effects and appends formatted status lines", () => {
  const miniGame = {
    score: 8,
    duration: 5,
    success: true,
    progress: 5,
    sequence: ["ok", "ok", "left", "right", "ok"],
    result: {
      score: 8,
      success: true,
      progress: 5,
      targetCount: 5,
      resolvedEffects: {
        happiness: 18,
        energy: -5
      }
    }
  };
  const item = {
    minigame: {
      scoreUnit: "taps",
      getSummaryText: ({ score }) => `${score} taps\nPlease wait...`
    }
  };

  assert.equal(getMiniGameSummaryText(miniGame, item), "8 taps\nPlease wait...\n+18 HAPPY\n-5 ENERGY");
});

test("play menu score-range config resolves via normalized score context", async () => {
  const { PLAY_MENU_ITEMS } = await import("../minigames/playItems.js");
  const tapSprint = PLAY_MENU_ITEMS.find((item) => item.key === "tap-sprint");
  const resolved = resolveEffectStatus(tapSprint.effectStatus, { score: 8, taps: 8 });

  assert.deepEqual(resolved, {
    happiness: 24,
    energy: -4,
    weight: -3
  });
});

test("sequence match awards 10000 points for each correct input", async () => {
  const { PLAY_MENU_ITEMS } = await import("../minigames/playItems.js");
  const quickMatch = PLAY_MENU_ITEMS.find((item) => item.key === "quick-match");
  const miniGame = initializeMiniGameSession(quickMatch, (choices) => choices[0], {
    sequence: ["left", "right", "ok", "left", "ok"]
  });

  const outcome = applyMiniGameInput(miniGame, quickMatch, "left");

  assert.equal(outcome.type, "update");
  assert.equal(outcome.miniGame.score, SEQUENCE_MATCH_HIT_SCORE);
  assert.equal(outcome.miniGame.progress, 1);
});

test("sequence match completion adds remaining milliseconds as a time bonus", async () => {
  const { PLAY_MENU_ITEMS } = await import("../minigames/playItems.js");
  const quickMatch = PLAY_MENU_ITEMS.find((item) => item.key === "quick-match");
  const session = {
    ...initializeMiniGameSession(quickMatch, (choices) => choices[0], {
      sequence: ["left"]
    }),
    elapsed: 2.345
  };

  const outcome = applyMiniGameInput(session, quickMatch, "left");

  assert.equal(outcome.type, "complete");
  assert.equal(outcome.miniGame.success, true);
  assert.equal(outcome.miniGame.timeBonus, 4655);
  assert.equal(outcome.miniGame.remainingMs, 4655);
  assert.equal(outcome.miniGame.score, 14655);
});

test("sequence match wrong input ends the game immediately without a time bonus", async () => {
  const { PLAY_MENU_ITEMS } = await import("../minigames/playItems.js");
  const quickMatch = PLAY_MENU_ITEMS.find((item) => item.key === "quick-match");
  const session = {
    ...initializeMiniGameSession(quickMatch, (choices) => choices[0], {
      sequence: ["right", "left", "ok"]
    }),
    score: 20000,
    progress: 2,
    elapsed: 1.25
  };

  const outcome = applyMiniGameInput(session, quickMatch, "left");

  assert.equal(outcome.type, "complete");
  assert.equal(outcome.miniGame.success, false);
  assert.equal(outcome.miniGame.failureReason, "mistake");
  assert.equal(outcome.miniGame.timeBonus, 0);
  assert.equal(outcome.miniGame.score, 20000);
});

test("sequence match timeout finalization records failure reason and keeps earned reward score", async () => {
  const { PLAY_MENU_ITEMS } = await import("../minigames/playItems.js");
  const quickMatch = PLAY_MENU_ITEMS.find((item) => item.key === "quick-match");
  const resolved = finalizeMiniGameResult(
    {
      ...initializeMiniGameSession(quickMatch, (choices) => choices[0], {
        sequence: ["left", "ok", "right"]
      }),
      active: false,
      elapsed: 7,
      score: 30000,
      progress: 3
    },
    quickMatch
  );

  assert.equal(resolved.result.success, false);
  assert.equal(resolved.result.failureReason, "timeout");
  assert.equal(resolved.result.timeBonus, 0);
  assert.equal(resolved.result.score, 30000);

  const rewardEffects = resolveEffectStatus(quickMatch.effectStatus, { score: resolved.result.score });
  const state = createNewState();
  state.evolutionStage = "child";
  state.energy = 50;
  state.happiness = 40;

  const rewardResult = addMiniGameReward(state, rewardEffects, {
    score: resolved.result.score,
    taps: resolved.result.score,
    success: resolved.result.success,
    progress: resolved.result.progress,
    targetCount: resolved.result.targetCount
  });

  assert.equal(rewardResult.ok, true);
});

test("sequence match summary text distinguishes success, mistake, and timeout", async () => {
  const { PLAY_MENU_ITEMS } = await import("../minigames/playItems.js");
  const quickMatch = PLAY_MENU_ITEMS.find((item) => item.key === "quick-match");

  const successSummary = getMiniGameSummaryText(
    {
      score: 0,
      duration: 7,
      sequence: ["left", "right", "ok", "left", "ok"],
      result: {
        score: 54678,
        success: true,
        progress: 5,
        targetCount: 5,
        timeBonus: 4678,
        remainingMs: 4678,
        failureReason: null
      }
    },
    quickMatch
  );

  const mistakeSummary = getMiniGameSummaryText(
    {
      score: 0,
      duration: 7,
      sequence: ["left", "right", "ok", "left", "ok"],
      result: {
        score: 20000,
        success: false,
        progress: 2,
        targetCount: 5,
        timeBonus: 0,
        remainingMs: 0,
        failureReason: "mistake"
      }
    },
    quickMatch
  );

  const timeoutSummary = getMiniGameSummaryText(
    {
      score: 0,
      duration: 7,
      sequence: ["left", "right", "ok", "left", "ok"],
      result: {
        score: 30000,
        success: false,
        progress: 3,
        targetCount: 5,
        timeBonus: 0,
        remainingMs: 0,
        failureReason: "timeout"
      }
    },
    quickMatch
  );

  assert.equal(successSummary, "54678 points\nSequence cleared. +4678 time bonus.");
  assert.equal(mistakeSummary, "20000 points\nMissed input at 2/5. Reward kept.");
  assert.equal(timeoutSummary, "30000 points\n3/5 matched. Time ran out.");
});
