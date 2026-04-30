import { getItemLabel } from "../gameState.js";
import { grantInventoryItem } from "../gameState.js";

const resolveStageIndex = (stageId) => ADVENTURE_STAGE_CONFIGS.findIndex((stage) => stage.id === stageId);

const buildUnlockState = (state, stageConfig) => {
  const unlock = stageConfig.unlock || {};
  const stageIndex = resolveStageIndex(stageConfig.id);
  const clearedStageIds = Array.isArray(state?.adventure?.clearedStageIds) ? state.adventure.clearedStageIds : [];

  if (stageIndex <= 0) {
    return { unlocked: true, reason: "" };
  }

  const previousStage = ADVENTURE_STAGE_CONFIGS[stageIndex - 1];
  if (previousStage && !clearedStageIds.includes(previousStage.id)) {
    return {
      unlocked: false,
      reason: `LOCKED\nClear ${previousStage.name} first.`
    };
  }

  if (typeof unlock.when === "function" && !unlock.when(state, stageConfig)) {
    return {
      unlocked: false,
      reason: `LOCKED\n${unlock.reason || "Additional condition not met."}`
    };
  }

  if (Array.isArray(unlock.requiresClearedStages)) {
    const missingStage = unlock.requiresClearedStages.find((stageId) => !clearedStageIds.includes(stageId));
    if (missingStage) {
      const missingStageConfig = ADVENTURE_STAGE_CONFIGS.find((stage) => stage.id === missingStage);
      return {
        unlocked: false,
        reason: `LOCKED\nClear ${missingStageConfig?.name || missingStage} first.`
      };
    }
  }

  return { unlocked: true, reason: "" };
};

const adventureStages = [
  {
    id: "mossy-path",
    name: "Mossy Path",
    reward: [
      { itemId: "snack", qty: 2 },
      { itemId: "meal", qty: 1 }
    ],
    unlock: {},
    monsters: [
      {
        name: "Green Slime",
        species: "classic",
        element: "water",
        drops: ["snack", "meal", "element-water"],
        stats: { str: 1, agi: 0, vit: 0, wit: 0, dex: 0, luck: 0 }
      },
      {
        name: "Moss Moth",
        species: "specie1",
        element: "wind",
        drops: ["snack", "element-wind", "medicine-food"],
        stats: { str: 1, agi: 1, vit: 0, wit: 0, dex: 0, luck: 0 }
      }
    ]
  },
  {
    id: "sunken-hall",
    name: "Sunken Hall",
    reward: [
      { itemId: "medicine-food", qty: 1 },
      { itemId: "element-water", qty: 1 }
    ],
    unlock: {
      requiresClearedStages: ["mossy-path"]
    },
    monsters: [
      {
        name: "Hall Guard",
        species: "classic",
        element: "earth",
        drops: ["snack", "meal", "element-earth"],
        stats: { str: 9, agi: 6, vit: 8, wit: 5, dex: 6, luck: 5 }
      },
      {
        name: "Cave Spark",
        species: "specie2",
        element: "shadow",
        drops: ["medicine-food", "element-shadow", "snack"],
        stats: { str: 10, agi: 8, vit: 7, wit: 6, dex: 7, luck: 6 }
      }
    ]
  },
  {
    id: "sky-ruin",
    name: "Sky Ruin",
    reward: [
      { itemId: "snack", qty: 3 },
      { itemId: "medicine-food", qty: 2 },
      { itemId: "element-shadow", qty: 1 }
    ],
    unlock: {
      requiresClearedStages: ["sunken-hall"],
      when: (state) => state?.evolutionStage === "adult",
      reason: "Reach adult stage."
    },
    monsters: [
      {
        name: "Ruin Drone",
        species: "specie2",
        element: "shadow",
        drops: ["element-shadow", "snack", "medicine-food"],
        stats: { str: 12, agi: 9, vit: 10, wit: 7, dex: 8, luck: 7 }
      },
      {
        name: "Sky Wisp",
        species: "specie1",
        element: "holy",
        drops: ["element-holy", "element-shadow", "medicine-food"],
        stats: { str: 13, agi: 10, vit: 10, wit: 8, dex: 9, luck: 8 }
      }
    ]
  }
];

export const ADVENTURE_STAGE_CONFIGS = adventureStages;

export const ADVENTURE_CHEST_OFFERS = [
  {
    key: "chest-heal-small",
    label: "Potion",
    caption: "Restore 12 HP now.",
    type: "heal",
    amount: 12
  },
  {
    key: "chest-heal-medium",
    label: "Potion+",
    caption: "Restore 22 HP now.",
    type: "heal",
    amount: 22
  },
  {
    key: "chest-str",
    label: "STR Up",
    caption: "Gain +2 STR for this adventure.",
    type: "buff",
    stat: "str",
    amount: 2
  },
  {
    key: "chest-agi",
    label: "AGI Up",
    caption: "Gain +2 AGI for this adventure.",
    type: "buff",
    stat: "agi",
    amount: 2
  },
  {
    key: "chest-vit",
    label: "VIT Up",
    caption: "Gain +2 VIT for this adventure.",
    type: "buff",
    stat: "vit",
    amount: 2
  },
  {
    key: "chest-wit",
    label: "WIT Up",
    caption: "Gain +2 WIT for this adventure.",
    type: "buff",
    stat: "wit",
    amount: 2
  },
  {
    key: "chest-dex",
    label: "DEX Up",
    caption: "Gain +2 DEX for this adventure.",
    type: "buff",
    stat: "dex",
    amount: 2
  },
  {
    key: "chest-luck",
    label: "Luck Up",
    caption: "Gain +2 Luck for this adventure.",
    type: "buff",
    stat: "luck",
    amount: 2
  },
  {
    key: "chest-item",
    label: "Supply",
    caption: "Gain one snack item.",
    type: "item",
    itemId: "snack",
    amount: 1
  }
];

export const getAdventureStageConfig = (stageId) => ADVENTURE_STAGE_CONFIGS.find((stage) => stage.id === stageId) || null;

export const getAdventureStageUnlockState = (state, stageConfig) => buildUnlockState(state, stageConfig);

export const isAdventureStageUnlocked = (state, stageConfig) => buildUnlockState(state, stageConfig).unlocked;

export const getAdventureStageMenuItems = (state) =>
  ADVENTURE_STAGE_CONFIGS.map((stageConfig) => {
    const unlockState = buildUnlockState(state, stageConfig);
    const rewardText = stageConfig.reward
      .map((reward) => `${getItemLabel(reward.itemId)} x${reward.qty}`)
      .join(", ");
    return {
      key: `adventure-stage-${stageConfig.id}`,
      stageId: stageConfig.id,
      label: stageConfig.name.toUpperCase(),
      name: stageConfig.name.toUpperCase(),
      caption: `Enter ${stageConfig.name}.`,
      icon: "",
      status: () => {
        if (!unlockState.unlocked) {
          return unlockState.reason;
        }

        return `OPEN\nReward: ${rewardText}`;
      }
    };
  });

export const markAdventureStageCleared = (state, stageId) => {
  if (!state.adventure || typeof state.adventure !== "object") {
    state.adventure = { clearedStageIds: [] };
  }

  const clearedStageIds = Array.isArray(state.adventure.clearedStageIds) ? state.adventure.clearedStageIds : [];
  if (!clearedStageIds.includes(stageId)) {
    clearedStageIds.push(stageId);
  }
  state.adventure.clearedStageIds = clearedStageIds;
};

export const isAdventureStageCleared = (state, stageId) =>
  Array.isArray(state?.adventure?.clearedStageIds) && state.adventure.clearedStageIds.includes(stageId);

export const grantAdventureRewardBundle = (state, rewardBundle = []) => {
  const granted = [];
  rewardBundle.forEach((reward) => {
    const itemId = String(reward?.itemId || "").trim();
    const qty = Math.max(1, Math.round(reward?.qty ?? 1));
    if (!itemId) {
      return;
    }

    const gained = grantInventoryItem(state, itemId, qty);
    if (gained > 0) {
      granted.push({ itemId, qty: gained });
    }
  });
  return granted;
};

export const chooseMonsterDrop = (monster, rng = Math.random) => {
  const dropPool = Array.isArray(monster?.drops) ? monster.drops.filter(Boolean) : [];
  if (!dropPool.length) {
    return null;
  }

  const index = Math.min(dropPool.length - 1, Math.floor(Math.max(0, rng()) * dropPool.length));
  return { itemId: dropPool[index], qty: 1 };
};

export const applyAdventureChestChoice = (state, choice, runBuffs = {}) => {
  if (!choice) {
    return { ok: false, message: "No treasure choice was selected." };
  }

  if (choice.type === "heal") {
    const healed = Math.min(100, Math.round(state.health + choice.amount));
    const restored = healed - state.health;
    state.health = healed;
    return {
      ok: true,
      message: `Recovered ${restored} HP.`
    };
  }

  if (choice.type === "buff") {
    const statKey = choice.stat;
    if (!statKey) {
      return { ok: false, message: "That treasure could not be used." };
    }

    const currentValue = Number.isFinite(runBuffs[statKey]) ? runBuffs[statKey] : 0;
    runBuffs[statKey] = currentValue + Math.max(1, Math.round(choice.amount ?? 1));
    return {
      ok: true,
      message: `${statKey.toUpperCase()} increased for this adventure.`
    };
  }

  if (choice.type === "item") {
    const gained = grantInventoryItem(state, choice.itemId, choice.amount ?? 1);
    return {
      ok: gained > 0,
      message: gained > 0 ? `Received ${getItemLabel(choice.itemId)} x${gained}.` : "Inventory is full."
    };
  }

  return { ok: false, message: "That treasure could not be used." };
};
