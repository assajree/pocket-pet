import {
  getItemLabel,
  getMaxQty,
  getShopPrice,
  isConsumableItem,
  isShopItem
} from "./scenes/helpers/items.js";
import { DEFAULT_PET_ID } from "./scenes/helpers/petAssets.js";
import { resolveEffectStatus } from "./scenes/helpers/effectStatus.js";

const SAVE_KEY = "pocket-pet-save-v2";
export const AUTO_SAVE_INTERVAL_SECONDS = 30;
const MAX_LOGS = 18;
const MAX_POOP_COUNT = 10;
const SLEEP_ENERGY_PER_SECOND = 2;
const AWAKE_ENERGY_CHANGE_PER_MINUTE = -4;
const MAX_COMBAT_STAT = 999;
const MAX_MONEY = 9999;
const EGG_HATCH_SECONDS = 60;
const CHILD_HATCH_CORE_STAT = 20;
const CHILD_HATCH_COMBAT_STAT = 5;
const EXCHANGE_SNAPSHOT_VERSION = 1;
const EXCHANGE_STAGE_ORDER = ["egg", "child", "teen", "adult"];
const EXCHANGE_STAGE_BONUS = {
  egg: 0,
  child: 6,
  teen: 12,
  adult: 18
};

export {
  isConsumableItem,
  getItemLabel,
  getShopPrice,
  getMaxQty,
  isShopItem
};

const STAGE_RULES = [
  { stage: "egg", nextStage: "child" },
  { stage: "child", minAgeMinutes: 1, requiredAverage: 0, nextStage: "teen" },
  { stage: "teen", minAgeMinutes: 5, requiredAverage: 50, nextStage: "adult" },
  { stage: "adult", minAgeMinutes: 9, requiredAverage: 65, nextStage: "adult" }
];

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const createLogId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}-${Math.random()}`;

const createInventoryState = (entries = {}) => ({ ...entries });

const normalizeInventory = (inventory) => {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    return createInventoryState(baseState?.inventory ?? {});
  }

  return createInventoryState({
    ...baseState.inventory,
    ...inventory
  });
};

export const createNewState = () => ({
  version: 1,
  createdAt: Date.now(),
  lastUpdatedAt: Date.now(),
  petId: DEFAULT_PET_ID,
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
  evolutionStage: "egg",
  isAlive: true,
  isSleeping: false,
  isSick: false,
  poopCount: 0,
  inventory: createInventoryState({
    meal: 1,
    snack: 1,
    medicine: 0
  }),
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
      petId: typeof parsed.petId === "string" && parsed.petId.trim() ? parsed.petId : baseState.petId,
      timers: {
        ...baseState.timers,
        ...parsed.timers
      },
      inventory: normalizeInventory(parsed.inventory),
      logs: Array.isArray(parsed.logs) && parsed.logs.length ? parsed.logs : createNewState().logs
    };
  } catch (error) {
    console.warn("Failed to load save data.", error);
    return createNewState();
  }
};

export const saveState = (state, source = "unknown") => {
  void source;
  // console.log('saveState', source, state);
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

const getStageRule = (stage) => STAGE_RULES.find((rule) => rule.stage === stage) ?? null;

const getDebugNextStage = (stage) => getStageRule(stage)?.nextStage ?? stage;

export const getEggHatchSecondsRemaining = (state, pendingSeconds = 0) => {
  if (state.evolutionStage !== "egg") {
    return 0;
  }

  const elapsedSeconds = (state.ageMinutes * 60) + (state.timers?.ageTick ?? 0) + Math.max(0, pendingSeconds);
  return Math.max(0, Math.ceil(EGG_HATCH_SECONDS - elapsedSeconds));
};

export const accelerateEggHatch = (state, seconds = 1) => {
  if (state.evolutionStage !== "egg" || !state.isAlive) {
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
    if (typeof rule.minAgeMinutes !== "number") {
      continue;
    }

    if (ageMinutesPrecise >= rule.minAgeMinutes && averageStats >= rule.requiredAverage) {
      nextStage = rule.stage;
    }
  }

  if (nextStage !== state.evolutionStage) {
    const previousStage = state.evolutionStage;
    state.evolutionStage = nextStage;
    if (previousStage === "egg" && nextStage === "child") {
      applyChildHatchState(state);
    }
    addLog(
      state,
      previousStage === "egg" && nextStage === "child"
        ? "The egg hatched into a child."
        : `Your pet evolved into a ${nextStage}.`
    );
  }
};

const evolveToNextStage = (state) => {
  applyDebugFill(state);
  const currentStage = state.evolutionStage;
  const currentRule = getStageRule(currentStage);  
  if (!currentRule) {
    const correctedStage = STAGE_RULES[0].stage;
    state.evolutionStage = correctedStage;
    addLog(state, `Debug: stage corrected to ${correctedStage}.`);
    return;
  }

  const nextStage = getDebugNextStage(currentStage);
  const nextRule = getStageRule(nextStage);    

  
  if(nextRule){
    state.ageMinutes = nextRule.minAgeMinutes;
  }

  state.evolutionStage = nextStage;
  if (currentStage === "egg" && nextStage === "child") {
    applyChildHatchState(state);
  }
  addLog(
    state,
    nextStage === currentStage
      ? `Debug: ${nextStage} is already the highest stage.`
      : `Debug: evolved pet to ${nextStage}.`
  );

  console.log('evolveToNextStage', {'nextRule': nextRule, 'state.ageMinutes': state.ageMinutes});
  // saveState(state, 'evolveToNextStage()');
  // updateEvolution(state);
  tickState(state, 1);
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

  if (state.evolutionStage === "egg") {
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

export const getNeedList = (state) => {
  if (!state.isAlive) {
    return ["Revive"];
  }

  if (state.evolutionStage === "egg") {
    return ["Hatch"];
  }

  const needs = [];

  if (state.isSick) {
    needs.push("Medicine");
  }
  if (state.poopCount > 0) {
    needs.push("Clean");
  }
  if (state.isSleeping) {
    needs.push("Sleep");
  } else if (state.energy < 25) {
    needs.push("Rest");
  }
  if (state.hunger < 30) {
    needs.push("Food");
  }
  if (state.happiness < 35) {
    needs.push("Play");
  }

  return needs;
};

export const getStatusText = (state) => {
  return getMoodList(state)[0];
};

const stableStringify = (value) => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
};

const hashString = (input) => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const createSeededRng = (seedText) => {
  let seed = parseInt(hashString(seedText), 16) >>> 0;

  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const sanitizeExchangePayload = (snapshot) => ({
  version: snapshot.version,
  petName: snapshot.petName || "",
  createdAt: snapshot.createdAt,
  evolutionStage: snapshot.evolutionStage,
  hunger: snapshot.hunger,
  happiness: snapshot.happiness,
  energy: snapshot.energy,
  health: snapshot.health,
  cleanliness: snapshot.cleanliness,
  weight: snapshot.weight,
  money: snapshot.money,
  str: snapshot.str,
  agi: snapshot.agi,
  int: snapshot.int,
  isAlive: snapshot.isAlive,
  isSleeping: snapshot.isSleeping,
  isSick: snapshot.isSick
});

const buildExchangeChecksum = (snapshot) => hashString(stableStringify(sanitizeExchangePayload(snapshot)));

const getExchangeStageBonus = (stage) => EXCHANGE_STAGE_BONUS[stage] ?? 0;

const getStageIndex = (stage) => {
  const index = EXCHANGE_STAGE_ORDER.indexOf(stage);
  return index < 0 ? 0 : index;
};

const getSnapshotLabel = (snapshot) =>
  snapshot.petName?.trim()
  || `${snapshot.evolutionStage} Pet ${String(snapshot.checksum).slice(0, 4).toUpperCase()}`;

const getCanonicalEncounterPair = (firstSnapshot, secondSnapshot) => {
  const ordered = [firstSnapshot, secondSnapshot].sort((left, right) =>
    left.checksum.localeCompare(right.checksum)
      || String(left.createdAt).localeCompare(String(right.createdAt))
  );

  return {
    alpha: ordered[0],
    beta: ordered[1],
    localIsAlpha: ordered[0].checksum === firstSnapshot.checksum
  };
};

const clampEncounterEffect = (value) => Math.round(value || 0);

const normalizeEncounterEffects = (effects = {}) => Object.fromEntries(
  Object.entries(effects)
    .filter(([, value]) => typeof value === "number" && value)
    .map(([key, value]) => [key, clampEncounterEffect(value)])
);

const formatEncounterEffects = (effects = {}) => {
  const lines = Object.entries(normalizeEncounterEffects(effects)).map(([key, value]) => {
    const label = ({
      health: "health",
      happiness: "happiness",
      energy: "energy",
      money: "money"
    })[key] || key;
    return `${value > 0 ? "+" : ""}${value} ${label}`;
  });

  return lines.join(", ");
};

const buildOutcomeSummary = (summaryText) => summaryText;

export const createExchangeSnapshot = (state) => {
  const snapshot = {
    version: EXCHANGE_SNAPSHOT_VERSION,
    petName: state.petName || "",
    createdAt: Date.now(),
    evolutionStage: state.evolutionStage,
    hunger: Math.round(state.hunger),
    happiness: Math.round(state.happiness),
    energy: Math.round(state.energy),
    health: Math.round(state.health),
    cleanliness: Math.round(state.cleanliness),
    weight: Math.round(state.weight),
    money: Math.round(state.money),
    str: Math.round(state.str),
    agi: Math.round(state.agi),
    int: Math.round(state.int),
    isAlive: !!state.isAlive,
    isSleeping: !!state.isSleeping,
    isSick: !!state.isSick
  };

  return {
    ...snapshot,
    checksum: buildExchangeChecksum(snapshot)
  };
};

export const encodeExchangeSnapshot = (snapshot) => stableStringify(snapshot);

export const decodeExchangeSnapshot = (text) => {
  const parsed = JSON.parse(String(text || "").trim());
  return {
    ...parsed,
    petName: typeof parsed.petName === "string" ? parsed.petName : ""
  };
};

export const validateExchangeSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { ok: false, message: "Snapshot data is invalid." };
  }

  if (snapshot.version !== EXCHANGE_SNAPSHOT_VERSION) {
    return { ok: false, message: "Snapshot version is not supported." };
  }

  const requiredNumericFields = [
    "createdAt",
    "hunger",
    "happiness",
    "energy",
    "health",
    "cleanliness",
    "weight",
    "money",
    "str",
    "agi",
    "int"
  ];
  for (const field of requiredNumericFields) {
    if (typeof snapshot[field] !== "number" || Number.isNaN(snapshot[field])) {
      return { ok: false, message: `Snapshot field ${field} is invalid.` };
    }
  }

  const requiredBooleanFields = ["isAlive", "isSleeping", "isSick"];
  for (const field of requiredBooleanFields) {
    if (typeof snapshot[field] !== "boolean") {
      return { ok: false, message: `Snapshot field ${field} is invalid.` };
    }
  }

  if (!EXCHANGE_STAGE_ORDER.includes(snapshot.evolutionStage)) {
    return { ok: false, message: "Snapshot stage is invalid." };
  }

  const expectedChecksum = buildExchangeChecksum(snapshot);
  if (snapshot.checksum !== expectedChecksum) {
    return { ok: false, message: "Snapshot checksum did not match." };
  }

  return {
    ok: true,
    snapshot: {
      ...sanitizeExchangePayload(snapshot),
      checksum: snapshot.checksum
    }
  };
};

export const createMatchSeed = (localChecksum, remoteChecksum, mode) =>
  [String(localChecksum), String(remoteChecksum)].sort().concat(String(mode || "")).join(":");

const buildCombatParticipant = (snapshot) => ({
  label: getSnapshotLabel(snapshot),
  power: snapshot.str * 1.2 + snapshot.agi * 0.8 + snapshot.int * 0.5 + getExchangeStageBonus(snapshot.evolutionStage),
  guard: snapshot.health * 0.25 + snapshot.cleanliness * 0.08 + snapshot.energy * 0.1,
  stamina: snapshot.energy * 0.2,
  sickPenalty: snapshot.isSick ? 9 : 0,
  sleepPenalty: snapshot.isSleeping ? 6 : 0
});

const buildCombatEffectsForSide = (winnerKey, sideKey) => {
  if (winnerKey === "draw") {
    return { health: -5, energy: -8, happiness: 2 };
  }

  if (winnerKey === sideKey) {
    return { health: -3, energy: -9, happiness: 8, money: 10 };
  }

  return { health: -10, energy: -12, happiness: -5, money: 2 };
};

export const runCombatEncounter = (localSnapshot, remoteSnapshot, seed) => {
  const canonical = getCanonicalEncounterPair(localSnapshot, remoteSnapshot);
  const alpha = buildCombatParticipant(canonical.alpha);
  const beta = buildCombatParticipant(canonical.beta);
  const rng = createSeededRng(seed);
  let alphaScore = 0;
  let betaScore = 0;
  const rounds = [];

  for (let round = 1; round <= 3; round += 1) {
    const alphaAttack = alpha.power + alpha.stamina + (rng() * 12) - alpha.sickPenalty - alpha.sleepPenalty;
    const betaAttack = beta.power + beta.stamina + (rng() * 12) - beta.sickPenalty - beta.sleepPenalty;
    const alphaTotal = alphaAttack + alpha.guard * 0.35;
    const betaTotal = betaAttack + beta.guard * 0.35;

    if (Math.abs(alphaTotal - betaTotal) < 3) {
      rounds.push(`R${round} draw`);
      continue;
    }

    const roundWinner = alphaTotal > betaTotal ? "alpha" : "beta";
    if (roundWinner === "alpha") {
      alphaScore += 1;
    } else {
      betaScore += 1;
    }
    rounds.push(`R${round} ${roundWinner === "alpha" ? alpha.label : beta.label}`);
  }

  const winnerKey = alphaScore === betaScore ? "draw" : (alphaScore > betaScore ? "alpha" : "beta");
  const winnerLabel = winnerKey === "draw" ? "Draw" : (winnerKey === "alpha" ? alpha.label : beta.label);
  const alphaEffects = buildCombatEffectsForSide(winnerKey, "alpha");
  const betaEffects = buildCombatEffectsForSide(winnerKey, "beta");
  const localEffects = canonical.localIsAlpha ? alphaEffects : betaEffects;
  const localWinner = winnerKey === "draw" ? "draw" : ((winnerKey === "alpha") === canonical.localIsAlpha ? "local" : "remote");
  const summaryBase = `Combat ${alpha.label} ${alphaScore}-${betaScore} ${beta.label}. Winner: ${winnerLabel}. ${rounds.join(" | ")}.`;

  return {
    mode: "combat",
    seed,
    localChecksum: localSnapshot.checksum,
    remoteChecksum: remoteSnapshot.checksum,
    summary: buildOutcomeSummary(summaryBase),
    localEffects: normalizeEncounterEffects(localEffects),
    winner: localWinner,
    rounds
  };
};

const buildDatingTier = (compatibility) => {
  if (compatibility >= 78) {
    return "Great";
  }
  if (compatibility >= 52) {
    return "Okay";
  }
  return "Bad";
};

const buildDatingEffects = (tier) => {
  switch (tier) {
    case "Great":
      return { happiness: 12, energy: -5, money: 6 };
    case "Okay":
      return { happiness: 5, energy: -4 };
    default:
      return { happiness: -4, energy: -3, health: -2 };
  }
};

export const runDatingEncounter = (localSnapshot, remoteSnapshot, seed) => {
  const canonical = getCanonicalEncounterPair(localSnapshot, remoteSnapshot);
  const rng = createSeededRng(seed);
  const alpha = canonical.alpha;
  const beta = canonical.beta;
  const sharedCore = (
    100
    - Math.abs(alpha.happiness - beta.happiness) * 0.28
    - Math.abs(alpha.energy - beta.energy) * 0.12
    - Math.abs(alpha.cleanliness - beta.cleanliness) * 0.1
    - Math.abs(getStageIndex(alpha.evolutionStage) - getStageIndex(beta.evolutionStage)) * 8
  );
  const bonus = ((alpha.health + beta.health) / 2) * 0.12 + rng() * 10;
  const penalties = (alpha.isSick ? 7 : 0) + (beta.isSick ? 7 : 0) + (alpha.isSleeping ? 4 : 0) + (beta.isSleeping ? 4 : 0);
  const compatibility = Math.round(clamp(sharedCore + bonus - penalties, 0, 100));
  const tier = buildDatingTier(compatibility);
  const localEffects = buildDatingEffects(tier);
  const summaryBase = `Dating ${getSnapshotLabel(alpha)} + ${getSnapshotLabel(beta)} scored ${compatibility} compatibility. Result: ${tier}.`;

  return {
    mode: "dating",
    seed,
    localChecksum: localSnapshot.checksum,
    remoteChecksum: remoteSnapshot.checksum,
    summary: buildOutcomeSummary(summaryBase),
    localEffects: normalizeEncounterEffects(localEffects),
    compatibility,
    tier
  };
};

export const applyEncounterOutcome = (state, outcome) => {
  if (!outcome || typeof outcome !== "object") {
    return { ok: false, message: "Encounter result is invalid." };
  }

  const localEffects = normalizeEncounterEffects(outcome.localEffects);
  Object.entries(localEffects).forEach(([key, delta]) => {
    if (typeof state[key] !== "number") {
      return;
    }
    state[key] = clampStatValue(key, state[key] + delta);
  });

  addLog(state, outcome.mode === "combat" ? "Encounter: combat resolved." : "Encounter: date resolved.");
  addLog(state, outcome.summary);
  const effectText = formatEncounterEffects(localEffects);
  if (effectText) {
    addLog(state, `Encounter effect: ${effectText}.`);
  }
  return { ok: true };
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

export const getInventoryCount = (state, itemKey) => normalizeInventory(state?.inventory)?.[itemKey] ?? 0;

const ensureInventoryState = (state) => {
  state.inventory = normalizeInventory(state.inventory);
  return state.inventory;
};

const setInventoryCount = (state, itemKey, nextCount) => {
  const inventory = ensureInventoryState(state);
  inventory[itemKey] = Math.max(0, nextCount);
  return inventory[itemKey];
};

const adjustInventoryCount = (state, itemKey, delta) =>
  setInventoryCount(state, itemKey, getInventoryCount(state, itemKey) + delta);

const useInventoryItem = (state, itemKey) => {
  if (!isConsumableItem(itemKey)) {
    return true;
  }

  const count = getInventoryCount(state, itemKey);
  if (count <= 0) {
    return false;
  }

  setInventoryCount(state, itemKey, count - 1);
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
  if (maxQty && getInventoryCount(state, itemKey) >= maxQty) {
    return { ok: false, message: "Inventory is full." };
  }

  state.money = clampStatValue("money", state.money - price);
  adjustInventoryCount(state, itemKey, 1);
  addLog(state, `Shop: bought ${itemKey} for ${price}g.`);
  return { ok: true };
};

const applyEffectStatus = (state, resolvedEffects) => {
  if (!resolvedEffects || typeof resolvedEffects !== "object") {
    return;
  }

  Object.entries(resolvedEffects).forEach(([stat, effectValue]) => {
    if (!effectValue || typeof state[stat] !== "number") {
      return;
    }

    state[stat] = clampStatValue(stat, state[stat] + effectValue);
  });
};

export const applyDebugFill = (state) => {
  state.hunger = 100;
  state.happiness = 100;
  state.energy = 100;
  state.health = 100;
  state.cleanliness = 100;
  state.money = 999;
  state.str = 25;
  state.agi = 25;
  state.int = 25;
  setInventoryCount(state, "snack", 9);
  setInventoryCount(state, "medicine", 9);
  state.isSick = false;
  state.poopCount = 0;
  state.isSleeping = false;
  state.actionLockUntil = 0;
  addLog(state, "Debug: all core stats were maxed out.");
  return { ok: true };
};

export const applyAction = (state, action, effectStatus = null, context = {}, resolvedEffects = null) => {
  if (!state.isAlive) {
    return { ok: false, message: "Your pet is gone. Start a new game." };
  }

  const actionEffects = resolvedEffects || resolveEffectStatus(effectStatus, context);

  switch (action) {
    case "feed":
    case "meal":
      applyEffectStatus(state, actionEffects);
      state.cleanliness = clamp(state.cleanliness - 5);
      addLog(state, "You served rice and filled your pet up.");
      return { ok: true };
    case "snack":
      if (!useInventoryItem(state, "snack")) {
        return { ok: false, message: "No snack left. Visit the shop." };
      }
      applyEffectStatus(state, actionEffects);
      addLog(state, "A sweet snack made your pet happier and a little heavier.");
      return { ok: true };
    case "play":
    case "tap-sprint":
      if (state.energy < 12) {
        return { ok: false, message: "Your pet is too tired to play." };
      }
      state.isSleeping = false;
      applyEffectStatus(state, actionEffects);
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
          adjustInventoryCount(state, "medicine", 1);
        }
        return { ok: false, message: "Medicine is not needed right now." };
      }
      state.isSick = false;
      state.health = clamp(state.health + 24);
      addLog(state, "Medicine helped your pet recover.");
      return { ok: true };
    case "debug-fill":
      return applyDebugFill(state);
    case "debug-new-egg": {
      const freshEgg = createNewState();
      Object.assign(state, freshEgg);
      addLog(state, "Debug: reset pet to a fresh egg.");
      return { ok: true };
    }
    case "debug-reset-save": {
      clearState();
      const freshEgg = createNewState();
      freshEgg.evolutionStage = "child";
      Object.assign(state, freshEgg);
      addLog(state, "Debug: cleared save data and reset to a fresh egg.");
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
      setInventoryCount(state, "snack", 0);
      setInventoryCount(state, "medicine", 0);
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

  if (state.evolutionStage === "egg") {
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

export const addMiniGameReward = (state, resolvedEffects, context = {}) => {
  const score = context.score ?? context.taps ?? 0;
  const result = applyAction(state, "play", null, { ...context, taps: score, score }, resolvedEffects);
  if (result.ok) {
    const earnedMoney = Math.max(1, Math.round(score / 2));
    state.money = clampStatValue("money", state.money + earnedMoney);
    addLog(state, `Mini game complete. ${score} score earned extra joy.`);
    addLog(state, `Mini game reward: +${earnedMoney}g.`);
  }
  return result;
};

export const applyLinkGameBetOutcome = (state, betAmount, outcome) => {
  const bet = Math.max(0, Math.round(betAmount || 0));
  if (!bet || outcome === "draw") {
    return { ok: true, delta: 0 };
  }

  const delta = outcome === "win" ? bet : -bet;
  state.money = clampStatValue("money", state.money + delta);
  addLog(state, `Link game bet: ${delta > 0 ? "+" : ""}${delta}g.`);
  return { ok: true, delta };
};
