const SAVE_KEY = "pocket-pet-save-v1";
const MAX_LOGS = 18;
const STAGE_RULES = [
  { stage: "Child", minAgeMinutes: 2, requiredAverage: 35 },
  { stage: "Teen", minAgeMinutes: 5, requiredAverage: 50 },
  { stage: "Adult", minAgeMinutes: 9, requiredAverage: 65 }
];

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
  ageMinutes: 0,
  evolutionStage: "Baby",
  isAlive: true,
  isSleeping: false,
  isSick: false,
  poopCount: 0,
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
      text: "A new pet egg has hatched. Take good care of it.",
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

const updateEvolution = (state) => {
  let nextStage = state.evolutionStage;
  const averageStats = getAverageStats(state);

  for (const rule of STAGE_RULES) {
    if (state.ageMinutes >= rule.minAgeMinutes && averageStats >= rule.requiredAverage) {
      nextStage = rule.stage;
    }
  }

  if (nextStage !== state.evolutionStage) {
    state.evolutionStage = nextStage;
    addLog(state, `Your pet evolved into a ${nextStage}.`);
  }
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
    return ["Passed away"];
  }

  const moods = [];

  if (state.isSick) {
    moods.push("Feeling sick");
  }
  if (state.poopCount > 0) {
    moods.push("Needs cleaning");
  }
  if (state.isSleeping) {
    moods.push("Sleeping");
  }
  if (state.energy < 25) {
    moods.push("Sleepy");
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

export const applyAction = (state, action) => {
  if (!state.isAlive) {
    return { ok: false, message: "Your pet is gone. Start a new game." };
  }

  switch (action) {
    case "feed":
    case "meal":
      state.hunger = clamp(state.hunger + 24);
      state.cleanliness = clamp(state.cleanliness - 5);
      addLog(state, "You served rice and filled your pet up.");
      return { ok: true };
    case "snack":
      state.happiness = clamp(state.happiness + 16);
      state.weight = clamp(state.weight + 6, 0, 999);
      state.hunger = clamp(state.hunger + 5);
      addLog(state, "A sweet snack made your pet happier and a little heavier.");
      return { ok: true };
    case "play":
      if (state.energy < 12) {
        return { ok: false, message: "Your pet is too tired to play." };
      }
      state.isSleeping = false;
      state.happiness = clamp(state.happiness + 18);
      state.energy = clamp(state.energy - 12);
      state.hunger = clamp(state.hunger - 4);
      addLog(state, "Playtime lifted your pet's mood.");
      return { ok: true };
    case "sleep":
      state.isSleeping = true;
      state.actionLockUntil = Date.now() + 12000;
      state.energy = clamp(state.energy + 18);
      addLog(state, "Your pet curled up for a nap.");
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
      if (!state.isSick && state.health > 90) {
        return { ok: false, message: "Medicine is not needed right now." };
      }
      state.isSick = false;
      state.health = clamp(state.health + 24);
      addLog(state, "Medicine helped your pet recover.");
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

  while (state.timers.energyTick >= 60) {
    state.energy = clamp(state.energy + (state.isSleeping ? 14 : -4));
    state.timers.energyTick -= 60;
  }

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
    if (Math.random() < 0.22) {
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

export const addMiniGameReward = (state, taps) => {
  const happinessBoost = Math.min(24, 8 + taps * 2);
  state.happiness = clamp(state.happiness + happinessBoost);
  state.energy = clamp(state.energy - Math.min(10, Math.floor(taps / 2)));
  state.weight = clamp(state.weight - Math.min(4, Math.max(1, Math.floor(taps / 4))), 0, 999);
  addLog(state, `Mini game complete. ${taps} taps earned extra joy.`);
};
