import test from "node:test";
import assert from "node:assert/strict";

import { applyAction, createNewState, loadState, tickState } from "../gameState.js";

const withMockLocalStorage = async (storedValue, callback) => {
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map();

  if (storedValue !== undefined) {
    store.set("pocket-pet-save-v2", storedValue);
  }

  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };

  try {
    await callback();
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
};

test("new saves start with love at 0", () => {
  const state = createNewState();

  assert.equal(state.love, 0);
});

test("loadState backfills love and untreated sickness timers for legacy saves", async () => {
  await withMockLocalStorage(
    JSON.stringify({
      petId: "classic",
      evolutionStage: "child",
      health: 55,
      timers: {
        hungerTick: 5
      }
    }),
    async () => {
      const state = loadState();

      assert.equal(state.love, 0);
      assert.equal(state.timers.hungerTick, 5);
      assert.equal(state.timers.sickUntreatedSeconds, 0);
      assert.equal(state.timers.sickUntreatedHealthTick, 0);
      assert.equal(state.timers.sickUntreatedLovePenaltyApplied, false);
    }
  );
});

test("loadState migrates legacy RPG stats into stat bonuses and drops int", async () => {
  await withMockLocalStorage(
    JSON.stringify({
      petId: "classic",
      evolutionStage: "child",
      str: 11,
      agi: 9,
      int: 77
    }),
    async () => {
      const state = loadState();

      assert.equal(state.version, 2);
      assert.equal(state.statBonus.str, 6);
      assert.equal(state.statBonus.agi, 4);
      assert.equal(state.statBonus.vit, 0);
      assert.equal(state.statBonus.dex, 0);
      assert.equal(state.statBonus.luck, 0);
      assert.equal(state.int, undefined);
      assert.equal(state.str, undefined);
      assert.equal(state.agi, undefined);
    }
  );
});

test("healing a sick pet increases love and clears sickness tracking", () => {
  const state = createNewState();
  state.evolutionStage = "child";
  state.isSick = true;
  state.love = 10;
  state.health = 40;
  state.timers.sickUntreatedSeconds = 120;
  state.timers.sickUntreatedHealthTick = 8;
  state.timers.sickUntreatedLovePenaltyApplied = true;

  const result = applyAction(state, "medicine");

  assert.equal(result.ok, true);
  assert.equal(state.isSick, false);
  assert.equal(state.health, 64);
  assert.equal(state.love, 18);
  assert.equal(state.timers.sickUntreatedSeconds, 0);
  assert.equal(state.timers.sickUntreatedHealthTick, 0);
  assert.equal(state.timers.sickUntreatedLovePenaltyApplied, false);
});

test("using medicine when not sick lowers love and does not heal", () => {
  const state = createNewState();
  state.evolutionStage = "child";
  state.love = 20;
  state.health = 70;

  const result = applyAction(state, "medicine");

  assert.equal(result.ok, false);
  assert.equal(result.message, "Your pet does not need treatment right now.");
  assert.equal(state.health, 70);
  assert.equal(state.love, 14);
});

test("untreated sickness deducts love once after the delay and then drains health over time", () => {
  const state = createNewState();
  state.evolutionStage = "child";
  state.isSick = true;
  state.hunger = 100;
  state.energy = 100;
  state.cleanliness = 100;
  state.health = 100;
  state.love = 40;
  const originalRandom = Math.random;
  Math.random = () => 1;

  try {
    tickState(state, 600);

    assert.equal(state.love, 30);
    assert.equal(state.timers.sickUntreatedLovePenaltyApplied, true);
    assert.equal(state.timers.sickUntreatedSeconds, 600);
    assert.ok(Math.abs(state.health - 79) < 1e-9);

    tickState(state, 20);

    assert.equal(state.love, 30);
    assert.ok(Math.abs(state.health - 72.3) < 1e-9);
    assert.equal(state.timers.sickUntreatedHealthDrainLogged, true);
  } finally {
    Math.random = originalRandom;
  }
});

test("debug-poop adds one poop, reduces cleanliness, and respects the cap", () => {
  const state = createNewState();
  state.evolutionStage = "child";
  state.cleanliness = 8;

  const firstResult = applyAction(state, "debug-poop");

  assert.equal(firstResult.ok, true);
  assert.equal(state.poopCount, 1);
  assert.equal(state.cleanliness, 0);

  for (let index = 0; index < 20; index += 1) {
    const result = applyAction(state, "debug-poop");
    assert.equal(result.ok, true);
  }

  assert.equal(state.poopCount, 10);
  assert.equal(state.cleanliness, 0);

  const cappedResult = applyAction(state, "debug-poop");

  assert.equal(cappedResult.ok, true);
  assert.equal(state.poopCount, 10);
  assert.equal(state.cleanliness, 0);
});
