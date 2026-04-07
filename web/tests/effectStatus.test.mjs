import test from "node:test";
import assert from "node:assert/strict";

import { createNewState, addMiniGameReward } from "../gameState.js";
import { resolveEffectStatus, resolveEffectValue } from "../effectStatus.js";
import { getMiniGameSummaryText } from "../scenes/minigames/index.js";

test("resolveEffectValue supports number, function, and object configs", () => {
  assert.equal(resolveEffectValue(4), 4);
  assert.equal(resolveEffectValue(({ score }) => score + 1, { score: 6 }), 7);
  assert.equal(resolveEffectValue({ value: 9 }), 9);
  assert.equal(resolveEffectValue({ value: ({ taps }) => taps * 2 }, { taps: 3 }), 6);
  assert.equal(resolveEffectValue(null, { score: 5 }), 0);
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
