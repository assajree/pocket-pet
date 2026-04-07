import test from "node:test";
import assert from "node:assert/strict";

import { createNewState, addMiniGameReward } from "../gameState.js";
import { resolveEffectStatus, resolveEffectValue } from "../scenes/helpers/effectStatus.js";
import { getMiniGameSummaryText } from "../scenes/minigames/index.js";

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
  const { PLAY_MENU_ITEMS } = await import("../scenes/minigames/playItems.js");
  const tapSprint = PLAY_MENU_ITEMS.find((item) => item.key === "tap-sprint");
  const resolved = resolveEffectStatus(tapSprint.effectStatus, { score: 8, taps: 8 });

  assert.deepEqual(resolved, {
    happiness: 24,
    energy: -4,
    weight: -3
  });
});
