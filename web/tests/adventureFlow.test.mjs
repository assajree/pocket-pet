import test from "node:test";
import assert from "node:assert/strict";

import { createNewState, getInventoryCount, grantInventoryItem } from "../gameState.js";
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
  getBattleDodgeChance,
  getBattleRegenAmount
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

test("adventure monster progress uses current monster and stage monster total", async () => {
  globalThis.Phaser = {
    Scene: class {
      constructor(key) {
        this.sceneKey = key;
      }
    }
  };

  const { formatAdventureMonsterProgress } = await import("../scenes/AdventureScene.js");

  assert.equal(formatAdventureMonsterProgress(0, 4), "1/4");
  assert.equal(formatAdventureMonsterProgress(1, 4), "2/4");
  assert.equal(formatAdventureMonsterProgress(3, 4), "4/4");
  assert.equal(formatAdventureMonsterProgress(99, 4), "4/4");
  assert.equal(formatAdventureMonsterProgress(0, 0), "0/0");
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

test("battle regen scales from vit without requiring wit", () => {
  const lowVitRegen = getBattleRegenAmount(0);
  const highVitRegen = getBattleRegenAmount(90);

  assert.ok(highVitRegen > lowVitRegen);
  assert.ok(highVitRegen <= ADVENTURE_BATTLE_CONSTANTS.REGEN_MAX_PER_TICK);
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

test("grantInventoryItem returns earned quantity while storing no more than max qty", () => {
  const nearlyFullState = createNewState();
  nearlyFullState.inventory.snack = 98;

  assert.equal(grantInventoryItem(nearlyFullState, "snack", 2), 2);
  assert.equal(getInventoryCount(nearlyFullState, "snack"), 99);

  const fullState = createNewState();
  fullState.inventory.snack = 99;

  assert.equal(grantInventoryItem(fullState, "snack", 2), 2);
  assert.equal(getInventoryCount(fullState, "snack"), 99);
  assert.equal(grantInventoryItem(fullState, "", 2), 0);
  assert.equal(grantInventoryItem(fullState, "snack", 0), 0);
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
  scene.stageConfig = { id: "test-stage", name: "Test Stage", monsters: [] };
  scene.stageIndex = 0;
  scene.currentMonsterIndex = 0;
  scene.currentEncounterSprite = null;
  scene.menuPanel = null;
  scene.menuTitle = null;
  scene.menuBody = null;
  scene.promptText = { setText: () => {} };
  scene.infoText = { setVisible: () => {}, setText: () => {} };
  scene.titleText = { setText: () => {}, setPosition: () => ({ setOrigin: () => {} }) };
  scene.runBuffs = { str: 0, agi: 0, vit: 0, dex: 0, luck: 0 };
  scene.state = createNewState();

  scene.finishAdventureFailure();

  assert.deepEqual(events, ["stop:fight", "stop:reward", "complete", "stop:adventure"]);
});

test("adventure success returns reward payload directly to pet UI summary", async () => {
  globalThis.Phaser = {
    Scene: class {
      constructor(key) {
        this.sceneKey = key;
      }
    }
  };
  globalThis.localStorage = {
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {}
  };

  const { default: AdventureScene } = await import("../scenes/AdventureScene.js");
  const scene = new AdventureScene();
  const events = [];

  scene.scene = {
    get: () => null,
    launch: (sceneKey) => events.push(`launch:${sceneKey}`),
    stop: () => events.push("stop:adventure")
  };
  scene.uiScene = {
    onAdventureFlowComplete: (payload) => events.push(payload)
  };
  scene.stageConfig = {
    id: "test-stage",
    name: "Test Grove",
    monsters: [],
    reward: [{ itemId: "meal", qty: 2 }]
  };
  scene.currentEncounterSprite = null;
  scene.menuPanel = null;
  scene.menuTitle = null;
  scene.menuBody = null;
  scene.promptText = { setText: () => {} };
  scene.infoText = { setVisible: () => {}, setText: () => {} };
  scene.titleText = { setText: () => {}, setPosition: () => ({ setOrigin: () => {} }) };
  scene.petSprite = { setVisible: () => {} };
  scene.state = createNewState();
  scene.collectedDrops = [{ itemId: "snack", qty: 1 }];

  scene.finishAdventureSuccess();

  assert.equal(events.includes("launch:RewardScene"), false);
  assert.equal(events.at(-1), "stop:adventure");
  const payload = events.find((entry) => typeof entry === "object");
  assert.equal(payload.success, true);
  assert.equal(payload.stageId, "test-stage");
  assert.equal(payload.stageName, "Test Grove");
  assert.deepEqual(payload.rewards, [{ itemId: "meal", qty: 2 }, { itemId: "snack", qty: 1 }]);
});

test("adventure success summary shows earned rewards while inventory stays capped", async () => {
  globalThis.Phaser = {
    Scene: class {
      constructor(key) {
        this.sceneKey = key;
      }
    }
  };
  globalThis.localStorage = {
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {}
  };

  const { default: AdventureScene } = await import("../scenes/AdventureScene.js");
  const scene = new AdventureScene();
  const events = [];

  scene.scene = {
    get: () => null,
    stop: () => events.push("stop:adventure")
  };
  scene.uiScene = {
    onAdventureFlowComplete: (payload) => events.push(payload)
  };
  scene.stageConfig = ADVENTURE_STAGE_CONFIGS.find((stage) => stage.id === "mossy-path");
  scene.currentEncounterSprite = null;
  scene.menuPanel = null;
  scene.menuTitle = null;
  scene.menuBody = null;
  scene.promptText = { setText: () => {} };
  scene.infoText = { setVisible: () => {}, setText: () => {} };
  scene.titleText = { setText: () => {}, setPosition: () => ({ setOrigin: () => {} }) };
  scene.petSprite = { setVisible: () => {} };
  scene.state = createNewState();
  scene.state.inventory.snack = 99;
  scene.collectedDrops = [];

  scene.finishAdventureSuccess();

  const payload = events.find((entry) => typeof entry === "object");
  assert.deepEqual(payload.rewards, [
    { itemId: "snack", qty: 2 },
    { itemId: "meal", qty: 1 }
  ]);
  assert.equal(getInventoryCount(scene.state, "snack"), 99);
  assert.equal(getInventoryCount(scene.state, "meal"), 2);
});

test("adventure victory grants pending monster drop without resampling", async () => {
  globalThis.Phaser = {
    Scene: class {
      constructor(key) {
        this.sceneKey = key;
      }
    }
  };
  globalThis.localStorage = {
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {}
  };

  const { default: AdventureScene } = await import("../scenes/AdventureScene.js");
  const scene = new AdventureScene();
  const events = [];

  scene.scene = {
    get: () => null,
    stop: () => events.push("stop:adventure")
  };
  scene.uiScene = {
    onAdventureFlowComplete: (payload) => events.push(payload)
  };
  scene.stageConfig = {
    id: "test-stage",
    name: "Test Stage",
    monsters: [{ name: "Slime", drops: ["meal"] }],
    reward: []
  };
  scene.currentMonsterIndex = 0;
  scene.currentEncounterSprite = null;
  scene.menuPanel = null;
  scene.menuTitle = null;
  scene.menuBody = null;
  scene.promptText = { setText: () => {} };
  scene.infoText = { setVisible: () => {}, setText: () => {} };
  scene.titleText = { setText: () => {}, setPosition: () => ({ setOrigin: () => {} }) };
  scene.petSprite = { setVisible: () => {} };
  scene.state = createNewState();
  scene.collectedDrops = [];
  scene.pendingMonsterDrop = { itemId: "snack", qty: 1 };
  const initialSnack = getInventoryCount(scene.state, "snack");
  const initialMeal = getInventoryCount(scene.state, "meal");

  scene.handleFightResolved({ victory: true, playerHp: 80 });

  assert.equal(scene.pendingMonsterDrop, null);
  assert.equal(getInventoryCount(scene.state, "snack"), initialSnack + 1);
  assert.equal(getInventoryCount(scene.state, "meal"), initialMeal);
  const payload = events.find((entry) => typeof entry === "object");
  assert.deepEqual(payload.rewards, [{ itemId: "snack", qty: 1 }]);
});

test("fight summary shows full overlay with WIN and drop preview", async () => {
  globalThis.Phaser = {
    Scene: class {
      constructor(key) {
        this.sceneKey = key;
      }
    }
  };

  const { default: FightScene } = await import("../scenes/FightScene.js");
  const scene = new FightScene();
  const summaryUpdates = [];
  const dropUpdates = [];
  const backdropUpdates = [];
  const bannerAlphaUpdates = [];
  const hintUpdates = [];

  scene.playerDamage = 10;
  scene.enemyDamage = 1;
  scene.dropPreview = { itemId: "snack", qty: 2 };
  scene.summaryBackdrop = {
    setVisible: (value) => {
      backdropUpdates.push(value);
      return scene.summaryBackdrop;
    }
  };
  scene.resultBanner = {
    setAlpha: (value) => {
      bannerAlphaUpdates.push(value);
      return scene.resultBanner;
    }
  };
  scene.summaryText = {
    setText: (value) => {
      summaryUpdates.push(value);
      return scene.summaryText;
    },
    setAlpha: (value) => {
      summaryUpdates.push(`alpha:${value}`);
      return scene.summaryText;
    }
  };
  scene.summaryDropText = {
    setText: (value) => {
      dropUpdates.push(value);
      return scene.summaryDropText;
    },
    setAlpha: (value) => {
      dropUpdates.push(`alpha:${value}`);
      return scene.summaryDropText;
    }
  };
  scene.hintText = {
    setText: (value) => {
      hintUpdates.push(value);
      return scene.hintText;
    }
  };
  scene.time = {
    delayedCall: () => ({ remove: () => {} })
  };
  scene.summaryDurationMs = 1;
  scene.autoCloseSummary = true;

  scene.showSummary();

  assert.deepEqual(backdropUpdates, [true]);
  assert.deepEqual(bannerAlphaUpdates, [0]);
  assert.ok(summaryUpdates.includes("WIN"));
  assert.ok(summaryUpdates.includes("alpha:1"));
  assert.ok(dropUpdates.includes("FOUND \nSnack x2"));
  assert.ok(dropUpdates.includes("alpha:1"));
  assert.deepEqual(hintUpdates, ["Closing summary automatically..."]);
});

test("fight summary overlay shows LOST without drop preview", async () => {
  globalThis.Phaser = {
    Scene: class {
      constructor(key) {
        this.sceneKey = key;
      }
    }
  };

  const { default: FightScene } = await import("../scenes/FightScene.js");
  const scene = new FightScene();
  const summaryUpdates = [];
  const dropUpdates = [];

  scene.playerDamage = 1;
  scene.enemyDamage = 10;
  scene.dropPreview = { itemId: "snack", qty: 2 };
  scene.summaryBackdrop = { setVisible: () => scene.summaryBackdrop };
  scene.resultBanner = { setAlpha: () => scene.resultBanner };
  scene.summaryText = {
    setText: (value) => {
      summaryUpdates.push(value);
      return scene.summaryText;
    },
    setAlpha: () => scene.summaryText
  };
  scene.summaryDropText = {
    setText: (value) => {
      dropUpdates.push(value);
      return scene.summaryDropText;
    },
    setAlpha: (value) => {
      dropUpdates.push(`alpha:${value}`);
      return scene.summaryDropText;
    }
  };
  scene.hintText = { setText: () => scene.hintText };
  scene.time = {
    delayedCall: () => ({ remove: () => {} })
  };
  scene.summaryDurationMs = 1;
  scene.autoCloseSummary = true;

  scene.showSummary();

  assert.deepEqual(summaryUpdates, ["LOST"]);
  assert.deepEqual(dropUpdates, ["", "alpha:0"]);
});

test("adventure loss leaves pet sick with low stats instead of dead", async () => {
  globalThis.Phaser = {
    Scene: class {
      constructor(key) {
        this.sceneKey = key;
      }
    }
  };
  const saved = [];
  globalThis.localStorage = {
    setItem: (key, value) => saved.push({ key, value }),
    getItem: () => null,
    removeItem: () => {}
  };

  const { default: AdventureScene } = await import("../scenes/AdventureScene.js");
  const scene = new AdventureScene();
  const events = [];

  scene.scene = {
    get: () => null,
    stop: () => events.push("stop:adventure")
  };
  scene.uiScene = {
    onAdventureFlowComplete: (payload) => events.push(payload.success ? "success" : "failure")
  };
  scene.stageConfig = { id: "test-stage", name: "Test Stage", monsters: [{ name: "Slime" }] };
  scene.currentMonsterIndex = 0;
  scene.currentEncounterSprite = null;
  scene.menuPanel = null;
  scene.menuTitle = null;
  scene.menuBody = null;
  scene.promptText = { setText: () => {} };
  scene.infoText = { setVisible: () => {}, setText: () => {} };
  scene.titleText = { setText: () => {}, setPosition: () => ({ setOrigin: () => {} }) };
  scene.state = createNewState();
  scene.state.health = 92;

  scene.handleFightResolved({ victory: false, playerHp: 0 });

  assert.equal(scene.state.isAlive, true);
  assert.equal(scene.state.isSick, true);
  assert.equal(scene.state.isSleeping, false);
  assert.equal(scene.state.health, 10);
  assert.equal(scene.state.hunger, 20);
  assert.equal(scene.state.happiness, 20);
  assert.equal(scene.state.energy, 20);
  assert.equal(scene.state.cleanliness, 20);
  assert.deepEqual(events, ["failure", "stop:adventure"]);
  assert.ok(saved.some((entry) => entry.value.includes('"isAlive":true')));
});
