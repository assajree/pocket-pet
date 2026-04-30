import test from "node:test";
import assert from "node:assert/strict";

import { createNewState } from "../gameState.js";
import {
  ADVENTURE_STAGE_CONFIGS,
  getAdventureStageUnlockState,
  isAdventureStageUnlocked,
  markAdventureStageCleared
} from "../helpers/adventure.js";
import {
  ADVENTURE_BATTLE_CONSTANTS,
  calculateBattleDamage,
  createBattleSeededRng,
  getBattleAttackIntervalMs,
  getBattleCriticalChance,
  getBattleDodgeChance
} from "../helpers/adventureBattle.js";

test("adventure stages unlock in sequence and respect extra requirements", () => {
  const state = createNewState();
  const stage1 = ADVENTURE_STAGE_CONFIGS[0];
  const stage2 = ADVENTURE_STAGE_CONFIGS[1];
  const stage3 = ADVENTURE_STAGE_CONFIGS[2];

  assert.equal(isAdventureStageUnlocked(state, stage1), true);
  assert.equal(isAdventureStageUnlocked(state, stage2), false);
  assert.match(getAdventureStageUnlockState(state, stage2).reason, /Clear Mossy Path first/i);

  markAdventureStageCleared(state, stage1.id);
  assert.equal(isAdventureStageUnlocked(state, stage2), true);
  assert.equal(isAdventureStageUnlocked(state, stage3), false);

  markAdventureStageCleared(state, stage2.id);
  assert.equal(isAdventureStageUnlocked(state, stage3), false);

  state.evolutionStage = "adult";
  assert.equal(isAdventureStageUnlocked(state, stage3), true);
});

test("battle damage helpers clamp crit and dodge while keeping faster agi on shorter intervals", () => {
  const slowInterval = getBattleAttackIntervalMs(5);
  const fastInterval = getBattleAttackIntervalMs(55);

  assert.ok(fastInterval < slowInterval);
  assert.ok(slowInterval <= ADVENTURE_BATTLE_CONSTANTS.ATTACK_INTERVAL_MAX_MS);
  assert.ok(fastInterval >= ADVENTURE_BATTLE_CONSTANTS.ATTACK_INTERVAL_MIN_MS);

  const critChance = getBattleCriticalChance({
    dex: 999,
    luck: 999,
    enemyLuck: 0,
    buff: 1,
    debuff: 0
  });
  const dodgeChance = getBattleDodgeChance({
    dex: 999,
    luck: 999,
    enemyAgi: 0,
    enemyLuck: 0,
    buff: 1,
    debuff: 0
  });

  assert.equal(critChance, ADVENTURE_BATTLE_CONSTANTS.CRITICAL_CAP);
  assert.equal(dodgeChance, ADVENTURE_BATTLE_CONSTANTS.DODGE_CAP);
});

test("battle damage stays positive and critical hits deal more", () => {
  const normalDamage = calculateBattleDamage({
    attack: 20,
    defense: 14,
    elementMultiplier: 1
  });
  const critDamage = calculateBattleDamage({
    attack: 20,
    defense: 14,
    elementMultiplier: 1,
    isCritical: true,
    criticalMultiplier: 1.5
  });

  assert.ok(normalDamage > 0);
  assert.ok(critDamage > normalDamage);
});

test("battle rng is deterministic for the same seed", () => {
  const rngA = createBattleSeededRng("seed-123");
  const rngB = createBattleSeededRng("seed-123");
  const rngC = createBattleSeededRng("seed-999");

  const valuesA = [rngA(), rngA(), rngA()];
  const valuesB = [rngB(), rngB(), rngB()];
  const valuesC = [rngC(), rngC(), rngC()];

  assert.deepEqual(valuesA, valuesB);
  assert.notDeepEqual(valuesA, valuesC);
});

test("adventure completion stops child scenes before returning to pet UI", async () => {
  globalThis.Phaser = {
    Scene: class {
      constructor(key) {
        this.sceneKey = key;
      }
    }
  };

  const { default: AdventureScene } = await import("../scenes/AdventureScene.js");
  const scene = new AdventureScene();
  const events = [];
  const fightScene = {
    scene: {
      isActive: () => true,
      stop: () => events.push("stop:fight")
    }
  };
  const rewardScene = {
    scene: {
      isActive: () => true,
      stop: () => events.push("stop:reward")
    }
  };

  scene.scene = {
    get: (sceneKey) => (sceneKey === "FightScene" ? fightScene : sceneKey === "RewardScene" ? rewardScene : null),
    stop: () => events.push("stop:adventure")
  };
  scene.uiScene = {
    onAdventureFlowComplete: () => events.push("complete")
  };
  scene.stageConfig = { id: "test-stage", monsters: [] };
  scene.stageIndex = 0;
  scene.currentMonsterIndex = 0;
  scene.currentEncounterSprite = null;
  scene.menuPanel = null;
  scene.menuTitle = null;
  scene.menuBody = null;
  scene.promptText = { setText: () => {} };
  scene.infoText = { setText: () => {} };
  scene.runBuffs = { str: 0, agi: 0, vit: 0, wit: 0, dex: 0, luck: 0 };
  scene.state = createNewState();

  scene.finishAdventureFailure();

  assert.deepEqual(events, ["stop:fight", "stop:reward", "complete", "stop:adventure"]);
});
