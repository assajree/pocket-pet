import {
  getItemInventoryLabel,
  getItemLabel,
  getMaxQty,
  getShopPrice,
  isConsumableItem,
  isShopItem
} from "./scenes/items.js";

const SAVE_KEY = "pocket-pet-save-v1";
const MAX_LOGS = 18;
const MAX_POOP_COUNT = 10;
const SLEEP_ENERGY_PER_SECOND = 2;
const AWAKE_ENERGY_CHANGE_PER_MINUTE = -4;
const MAX_COMBAT_STAT = 999;
const MAX_MONEY = 9999;
const EGG_HATCH_SECONDS = 60;
const CHILD_HATCH_CORE_STAT = 20;
const CHILD_HATCH_COMBAT_STAT = 5;

export {
  isConsumableItem,
  getItemLabel,
  getItemInventoryLabel,
  getShopPrice,
  getMaxQty,
  isShopItem
};

const STAGE_RULES = [
  { stage: "Child", minAgeMinutes: 1, requiredAverage: 0 },
  { stage: "Teen", minAgeMinutes: 5, requiredAverage: 50 },
  { stage: "Adult", minAgeMinutes: 9, requiredAverage: 65 }
];
const STAGE_ORDER = ["Egg", "Child", "Teen", "Adult"];

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const createLogId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}-${Math.random()}`;

export const createNewState = () => ({
  version: 1,
  createdAt: Date.now(),
  lastUpdatedAt: Date.now(),
  hunger: 82,
  happiness: 84,
  energy: 78,
  health: 92,
  cleanliness: 88,
  weight: 32,
  money: 24,
  str: 12,
  agi: 11,
  int: 10,
  ageMinutes: 0,
  evolutionStage: "Egg",
  isAlive: true,
  isSleeping: false,
  isSick: false,
  poopCount: 0,
  inventory: {
    meal: 1,
    snack: 1,
    medicine: 0
  },
  actionLockUntil: 0,
  timers: {
    hungerTick: 0,
    happinessTick: 0,
    energyTick: 0,
    ageTick: 0,
    poopRoll: 0,
    sicknessRoll: 0,
    healthTick: 0,
    cleanlinessTick: 0
  },
  logs: [
    {
      id: createLogId(),
      text: "A new egg is waiting to hatch.",
      time: Date.now()
    }
  ]
});

const baseState = createNewState();

const addLog = (state, text) => {
  state.logs.unshift({
    id: createLogId(),
    text,
    time: Date.now()
  });
  state.logs = state.logs.slice(0, MAX_LOGS);
};

export const loadState = () => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return createNewState();
    }

    const parsed = JSON.parse(raw);
    return {
      ...createNewState(),
      ...parsed,
      timers: {
        ...baseState.timers,
        ...parsed.timers
      },
      inventory: {
        ...baseState.inventory,
        ...(parsed.inventory || {})
      },
      logs: Array.isArray(parsed.logs) && parsed.logs.length ? parsed.logs : createNewState().logs
    };
  } catch (error) {
    console.warn("Failed to load save data.", error);
    return createNewState();
  }
};

export const saveState = (state) => {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
};

export const clearState = () => {
  localStorage.removeItem(SAVE_KEY);
};

const getAverageStats = (state) =>
  (state.hunger + state.happiness + state.energy + state.health + state.cleanliness) / 5;

const lockEggState = (state) => {
  state.hunger = 100;
  state.happiness = 100;
  state.energy = 100;
  state.health = 100;
  state.cleanliness = 100;
  state.isSick = false;
  state.isSleeping = false;
  state.poopCount = 0;
  state.actionLockUntil = 0;
};

const applyChildHatchState = (state) => {
  state.hunger = CHILD_HATCH_CORE_STAT;
  state.happiness = CHILD_HATCH_CORE_STAT;
  state.energy = CHILD_HATCH_CORE_STAT;
  state.health = CHILD_HATCH_CORE_STAT;
  state.cleanliness = CHILD_HATCH_CORE_STAT;
  state.str = CHILD_HATCH_COMBAT_STAT;
  state.agi = CHILD_HATCH_COMBAT_STAT;
  state.int = CHILD_HATCH_COMBAT_STAT;
  state.isSick = false;
  state.isSleeping = false;
  state.poopCount = 0;
  state.actionLockUntil = 0;
};

export const getEggHatchSecondsRemaining = (state) => {
  if (state.evolutionStage !== "Egg") {
    return 0;
  }

  const elapsedSeconds = (state.ageMinutes * 60) + (state.timers?.ageTick ?? 0);
  return Math.max(0, Math.ceil(EGG_HATCH_SECONDS - elapsedSeconds));
};

export const accelerateEggHatch = (state, seconds = 1) => {
  if (state.evolutionStage !== "Egg" || !state.isAlive) {
    return { ok: false, changedStage: false };
  }

  const previousStage = state.evolutionStage;
  lockEggState(state);
  state.timers.ageTick += Math.max(0, seconds);

  while (state.timers.ageTick >= 60) {
    state.ageMinutes += 1;
    state.timers.ageTick -= 60;
  }

  updateEvolution(state);
  return {
    ok: true,
    changedStage: previousStage !== state.evolutionStage,
    previousStage,
    nextStage: state.evolutionStage
  };
};

const updateEvolution = (state) => {
  let nextStage = state.evolutionStage;
  const averageStats = getAverageStats(state);
  const ageMinutesPrecise = state.ageMinutes + ((state.timers?.ageTick ?? 0) / 60);

  for (const rule of STAGE_RULES) {
    if (ageMinutesPrecise >= rule.minAgeMinutes && averageStats >= rule.requiredAverage) {
      nextStage = rule.stage;
    }
  }

  if (nextStage !== state.evolutionStage) {
    const previousStage = state.evolutionStage;
    state.evolutionStage = nextStage;
    if (previousStage === "Egg" && nextStage === "Child") {
      applyChildHatchState(state);
    }
    addLog(
      state,
      previousStage === "Egg" && nextStage === "Child"
        ? "The egg hatched into a Child."
        : `Your pet evolved into a ${nextStage}.`
    );
  }
};

const evolveToNextStage = (state) => {
  if (state.evolutionStage === "Baby") {
    state.evolutionStage = "Child";
    addLog(state, "Debug: evolved pet to Child.");
    return "Child";
  }

  const currentIndex = STAGE_ORDER.indexOf(state.evolutionStage);
  if (currentIndex < 0) {
    state.evolutionStage = STAGE_ORDER[0];
    addLog(state, `Debug: stage corrected to ${STAGE_ORDER[0]}.`);
    return STAGE_ORDER[0];
  }

  const nextStage = STAGE_ORDER[Math.min(currentIndex + 1, STAGE_ORDER.length - 1)];
  state.evolutionStage = nextStage;
  addLog(
    state,
    nextStage === state.evolutionStage && currentIndex === STAGE_ORDER.length - 1
      ? `Debug: ${nextStage} is already the highest stage.`
      : `Debug: evolved pet to ${nextStage}.`
  );
  return nextStage;
};

const wakeIfFullyRested = (state) => {
  if (!state.isSleeping || state.energy < 100) {
    return;
  }

  state.isSleeping = false;
  state.actionLockUntil = 0;
  addLog(state, "Your pet woke up fully rested.");
};

const maybeDie = (state, reasonText) => {
  if (!state.isAlive) {
    return;
  }

  if (state.hunger <= 0 || state.health <= 0) {
    state.isAlive = false;
    state.isSleeping = false;
    state.hunger = clamp(state.hunger);
    state.health = clamp(state.health);
    addLog(state, reasonText);
  }
};

export const getMoodList = (state) => {
  if (!state.isAlive) {
    return ["Dead"];
  }

  if (state.evolutionStage === "Egg") {
    return ["Egg"];
  }

  const moods = [];

  if (state.isSick) {
    moods.push("Sick");
  }
  if (state.poopCount > 0) {
    moods.push("Dirty");
  }
  if (state.isSleeping) {
    moods.push("Asleep");
  }
  if (state.energy < 25) {
    moods.push("Tired");
  }
  if (state.hunger < 30) {
    moods.push("Hungry");
  }
  if (state.happiness < 35) {
    moods.push("Bored");
  }

  if (!moods.length) {
    moods.push("Happy");
  }

  return moods;
};

export const getStatusText = (state) => {
  return getMoodList(state)[0];
};


const clampStatValue = (stat, value) => {
  if (stat === "weight") {
    return clamp(value, 0, MAX_COMBAT_STAT);
  }

  if (stat === "str" || stat === "agi" || stat === "int") {
    return clamp(value, 0, MAX_COMBAT_STAT);
  }

  if (stat === "money") {
    return clamp(value, 0, MAX_MONEY);
  }

  return clamp(value);
};

const useInventoryItem = (state, itemKey) => {
  if (!isConsumableItem(itemKey)) {
    return true;
  }

  const count = state.inventory?.[itemKey] ?? 0;
  if (count <= 0) {
    return false;
  }

  state.inventory[itemKey] = count - 1;
  return true;
};

export const purchaseItem = (state, key) => {
  if (!state.isAlive) {
    return { ok: false, message: "Your pet is gone. Start a new egg first." };
  }

  const itemKey = key;
  const price = getShopPrice(itemKey);
  if (!price) {
    return { ok: false, message: "That item is not sold here." };
  }

  if (state.money < price) {
    return { ok: false, message: "Not enough money." };
  }

  const maxQty = getMaxQty(itemKey);
  if (maxQty && (state.inventory[itemKey] ?? 0) >= maxQty) {
    return { ok: false, message: "Inventory is full." };
  }

  state.money = clampStatValue("money", state.money - price);
  state.inventory[itemKey] = (state.inventory[itemKey] ?? 0) + 1;
  addLog(state, `Shop: bought ${itemKey} for ${price}g.`);
  return { ok: true };
};

const resolveEffectValue = (effectConfig, context = {}) => {
  if (typeof effectConfig === "function") {
    return effectConfig(context);
  }

  if (typeof effectConfig === "number") {
    return effectConfig;
  }

  if (effectConfig && typeof effectConfig === "object") {
    if (typeof effectConfig.value === "function") {
      return effectConfig.value(context);
    }

    if (typeof effectConfig.value === "number") {
      return effectConfig.value;
    }
  }

  return 0;
};

const applyEffectStatus = (state, effectStatus, context = {}) => {
  if (!effectStatus || typeof effectStatus !== "object") {
    return;
  }

  Object.entries(effectStatus).forEach(([stat, effectConfig]) => {
    const effectValue = resolveEffectValue(effectConfig, context);
    if (!effectValue || typeof state[stat] !== "number") {
      return;
    }

    state[stat] = clampStatValue(stat, state[stat] + effectValue);
  });
};

export const applyAction = (state, action, effectStatus = null, context = {}) => {
  if (!state.isAlive) {
    return { ok: false, message: "Your pet is gone. Start a new game." };
  }

  switch (action) {
    case "feed":
    case "meal":
      applyEffectStatus(state, effectStatus, context);
      state.cleanliness = clamp(state.cleanliness - 5);
      addLog(state, "You served rice and filled your pet up.");
      return { ok: true };
    case "snack":
      if (!useInventoryItem(state, "snack")) {
        return { ok: false, message: "No snack left. Visit the shop." };
      }
      applyEffectStatus(state, effectStatus, context);
      addLog(state, "A sweet snack made your pet happier and a little heavier.");
      return { ok: true };
    case "play":
    case "tap-sprint":
      if (state.energy < 12) {
        return { ok: false, message: "Your pet is too tired to play." };
      }
      state.isSleeping = false;
      applyEffectStatus(state, effectStatus, context);
      addLog(state, "Playtime lifted your pet's mood.");
      return { ok: true };
    case "sleep":
      state.isSleeping = true;
      state.actionLockUntil = Date.now() + 12000;
      state.energy = clamp(state.energy + 18);
      addLog(state, "Your pet curled up for a nap.");
      wakeIfFullyRested(state);
      return { ok: true };
    case "clean":
      if (state.poopCount <= 0 && state.cleanliness > 90) {
        return { ok: false, message: "Everything is already sparkling clean." };
      }
      state.poopCount = 0;
      state.cleanliness = clamp(state.cleanliness + 30);
      state.health = clamp(state.health + 4);
      addLog(state, "You cleaned up and freshened the room.");
      return { ok: true };
    case "medicine":
      if (!useInventoryItem(state, "medicine")) {
        return { ok: false, message: "No medicine left. Visit the shop." };
      }
      if (!state.isSick && state.health > 90) {
        if (isConsumableItem("medicine")) {
          state.inventory.medicine += 1;
        }
        return { ok: false, message: "Medicine is not needed right now." };
      }
      state.isSick = false;
      state.health = clamp(state.health + 24);
      addLog(state, "Medicine helped your pet recover.");
      return { ok: true };
    case "debug-fill":
      state.hunger = 100;
      state.happiness = 100;
      state.energy = 100;
      state.health = 100;
      state.cleanliness = 100;
      state.money = 999;
      state.str = 25;
      state.agi = 25;
      state.int = 25;
      state.inventory.snack = 9;
      state.inventory.medicine = 9;
      state.isSick = false;
      state.poopCount = 0;
      state.isSleeping = false;
      state.actionLockUntil = 0;
      addLog(state, "Debug: all core stats were maxed out.");
      return { ok: true };
    case "debug-new-egg": {
      const freshEgg = createNewState();
      Object.assign(state, freshEgg);
      addLog(state, "Debug: reset pet to a fresh egg.");
      return { ok: true };
    }
    case "debug-drain":
      state.hunger = 20;
      state.happiness = 20;
      state.energy = 20;
      state.health = 20;
      state.cleanliness = 20;
      state.money = 5;
      state.str = 5;
      state.agi = 5;
      state.int = 5;
      state.inventory.snack = 0;
      state.inventory.medicine = 0;
      state.isSleeping = false;
      state.actionLockUntil = 0;
      addLog(state, "Debug: core stats were lowered for testing.");
      return { ok: true };
    case "debug-sick":
      state.isSick = !state.isSick;
      addLog(state, state.isSick ? "Debug: pet marked sick." : "Debug: pet cured.");
      return { ok: true };
    case "debug-evolve":
      evolveToNextStage(state);
      return { ok: true };
    case "debug-dead":
      state.isAlive = false;
      state.isSleeping = false;
      addLog(state, "Debug: pet marked dead.");
      return { ok: true };
    case "minigame":
      return { ok: true };
    default:
      return { ok: false, message: "Unknown action." };
  }
};

const applyPassiveEffects = (state) => {
  const poopPenalty = state.poopCount > 0 ? state.poopCount * 0.35 : 0;
  const sickPenalty = state.isSick ? 0.7 : 0;
  const starvationPenalty = state.hunger < 20 ? 0.8 : 0;
  const exhaustionPenalty = state.energy < 15 ? 0.4 : 0;

  state.health = clamp(state.health - poopPenalty - sickPenalty - starvationPenalty - exhaustionPenalty);
  state.cleanliness = clamp(state.cleanliness - state.poopCount * 0.45);
};

export const tickState = (state, deltaSeconds) => {
  if (!state.isAlive) {
    return state;
  }

  const delta = Math.max(deltaSeconds, 0);
  state.lastUpdatedAt = Date.now();

  if (state.evolutionStage === "Egg") {
    lockEggState(state);
    state.timers.ageTick += delta;

    while (state.timers.ageTick >= 60) {
      state.ageMinutes += 1;
      state.timers.ageTick -= 60;
    }

    updateEvolution(state);
    return state;
  }

  state.timers.hungerTick += delta;
  state.timers.happinessTick += delta;
  state.timers.energyTick += delta;
  state.timers.ageTick += delta;
  state.timers.poopRoll += delta;
  state.timers.sicknessRoll += delta;
  state.timers.healthTick += delta;
  state.timers.cleanlinessTick += delta;

  while (state.timers.hungerTick >= 30) {
    state.hunger = clamp(state.hunger - (state.isSleeping ? 1 : 4));
    state.timers.hungerTick -= 30;
  }

  while (state.timers.happinessTick >= 45) {
    state.happiness = clamp(state.happiness - (state.isSleeping ? 1 : 3));
    state.timers.happinessTick -= 45;
  }

  while (state.timers.energyTick >= 1) {
    state.energy = clamp(
      state.energy + (state.isSleeping ? SLEEP_ENERGY_PER_SECOND : AWAKE_ENERGY_CHANGE_PER_MINUTE / 60)
    );
    state.timers.energyTick -= 1;
  }

  wakeIfFullyRested(state);

  while (state.timers.ageTick >= 60) {
    state.ageMinutes += 1;
    state.timers.ageTick -= 60;
  }

  while (state.timers.cleanlinessTick >= 25) {
    state.cleanliness = clamp(state.cleanliness - 2);
    state.timers.cleanlinessTick -= 25;
  }

  while (state.timers.healthTick >= 20) {
    applyPassiveEffects(state);
    state.timers.healthTick -= 20;
  }

  while (state.timers.poopRoll >= 35) {
    if (Math.random() < 0.22 && state.poopCount < MAX_POOP_COUNT) {
      state.poopCount += 1;
      state.cleanliness = clamp(state.cleanliness - 10);
      addLog(state, "Oops. Your pet made a mess.");
    }
    state.timers.poopRoll -= 35;
  }

  while (state.timers.sicknessRoll >= 50) {
    if (!state.isSick && Math.random() < 0.14) {
      state.isSick = true;
      addLog(state, "Your pet caught a bug and needs medicine.");
    }
    state.timers.sicknessRoll -= 50;
  }

  if (state.isSleeping && Date.now() >= state.actionLockUntil) {
    state.isSleeping = false;
    addLog(state, "Your pet woke up rested.");
  }

  updateEvolution(state);
  maybeDie(
    state,
    state.hunger <= 0
      ? "Your pet starved. Its journey has ended."
      : "Your pet's health failed. Its journey has ended."
  );

  return state;
};

export const applyOfflineProgress = (state) => {
  const elapsedSeconds = Math.floor((Date.now() - (state.lastUpdatedAt || Date.now())) / 1000);
  if (elapsedSeconds > 0) {
    tickState(state, elapsedSeconds);
    addLog(state, `Your pet lived through ${elapsedSeconds}s away from the game.`);
  }
};

export const addMiniGameReward = (state, effectStatus, context = {}) => {
  const score = context.score ?? context.taps ?? 0;
  const result = applyAction(state, "play", effectStatus, { ...context, taps: score, score });
  if (result.ok) {
    const earnedMoney = Math.max(1, Math.round(score / 2));
    state.money = clampStatValue("money", state.money + earnedMoney);
    addLog(state, `Mini game complete. ${score} score earned extra joy.`);
    addLog(state, `Mini game reward: +${earnedMoney}g.`);
  }
  return result;
};
