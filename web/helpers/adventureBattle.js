import { PET_ELEMENTS, getPetTextureKey, resolvePetId } from "./petAssets.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const softValue = (value, scale = 40) => {
  const safeValue = Math.max(0, Number.isFinite(value) ? value : 0);
  return safeValue / (safeValue + scale);
};

const normalizeElement = (element) => (PET_ELEMENTS.includes(element) ? element : "neutral");

const ELEMENT_MULTIPLIER_TABLE = {
  neutral: {
    neutral: 1,
    water: 1,
    earth: 1,
    fire: 1,
    wind: 1,
    poison: 1,
    holy: 1,
    shadow: 1,
    ghost: 1,
    undead: 1
  },
  water: {
    neutral: 1,
    water: 0.9,
    earth: 1,
    fire: 1.15,
    wind: 0.95,
    poison: 1,
    holy: 1,
    shadow: 1,
    ghost: 1,
    undead: 1
  },
  earth: {
    neutral: 1,
    water: 1,
    earth: 0.9,
    fire: 0.95,
    wind: 1.15,
    poison: 1,
    holy: 1,
    shadow: 1,
    ghost: 1,
    undead: 1
  },
  fire: {
    neutral: 1,
    water: 0.95,
    earth: 1.15,
    fire: 0.9,
    wind: 1,
    poison: 1,
    holy: 1,
    shadow: 1,
    ghost: 1,
    undead: 1.05
  },
  wind: {
    neutral: 1,
    water: 1.1,
    earth: 0.95,
    fire: 1,
    wind: 0.9,
    poison: 1,
    holy: 1,
    shadow: 1,
    ghost: 1,
    undead: 1
  },
  poison: {
    neutral: 1,
    water: 1,
    earth: 1.05,
    fire: 1.05,
    wind: 1.05,
    poison: 0.9,
    holy: 0.95,
    shadow: 0.95,
    ghost: 1,
    undead: 0.9
  },
  holy: {
    neutral: 1,
    water: 1,
    earth: 1,
    fire: 1,
    wind: 1,
    poison: 1,
    holy: 0.9,
    shadow: 1.15,
    ghost: 1,
    undead: 1.15
  },
  shadow: {
    neutral: 1,
    water: 1,
    earth: 1,
    fire: 1,
    wind: 1,
    poison: 1,
    holy: 0.95,
    shadow: 0.9,
    ghost: 1,
    undead: 1.1
  },
  ghost: {
    neutral: 1,
    water: 1,
    earth: 1,
    fire: 1,
    wind: 1,
    poison: 1,
    holy: 1,
    shadow: 1,
    ghost: 0.9,
    undead: 1.1
  },
  undead: {
    neutral: 1,
    water: 1,
    earth: 1,
    fire: 1,
    wind: 1,
    poison: 1,
    holy: 1.15,
    shadow: 0.95,
    ghost: 1,
    undead: 0.9
  }
};

export const ADVENTURE_BATTLE_CONSTANTS = {
  BATTLE_TIME_LIMIT_MS: 30000,
  ENEMY_INTRO_TOGGLE_MS: 220,
  ENEMY_INTRO_MOVE_MS: 1100,
  ENEMY_INTRO_JUMP_COUNT: 3,
  ENEMY_INTRO_JUMP_HEIGHT_PX: 34,
  ENEMY_INTRO_JUMP_DURATION_MS: 220,
  ENEMY_INTRO_EXIT_SPEED_PX_PER_MS: 0.42,
  ENEMY_INTRO_EXIT_OFFSCREEN_PADDING: 96,
  RESULT_FLASH_MS: 2000,
  SUMMARY_DURATION_MS: 3000,
  BATTLE_REGEN_INTERVAL_MS: 3200,
  WALK_TOGGLE_MS: 260,
  BULLET_TRAVEL_MS: 1200,
  BULLET_OFFSCREEN_PADDING: 96,
  BULLET_SCALE_MIN: 0.7,
  BULLET_SCALE_MAX: 1.85,
  BULLET_SCALE_DIVISOR: 42,
  ATTACK_INTERVAL_MIN_MS: 360,
  ATTACK_INTERVAL_MAX_MS: 1250,
  ATTACK_IDLE_RETURN_MS: 320,
  DODGE_CAP: 0.8,
  CRITICAL_CAP: 0.8,
  CRITICAL_MULTIPLIER: 1.5,
  REGEN_MAX_PER_TICK: 7
};

export const createBattleSeededRng = (seed = "adventure") => {
  let hash = 2166136261;
  String(seed || "adventure")
    .split("")
    .forEach((char) => {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    });

  return () => {
    hash += hash << 13;
    hash ^= hash >>> 7;
    hash += hash << 3;
    hash ^= hash >>> 17;
    hash += hash << 5;
    return ((hash >>> 0) % 1000000) / 1000000;
  };
};

export const getBattleStageBonus = (stageIndex = 0) => Math.max(0, Math.round(stageIndex * 2));

export const getBattleLevelBonus = (evolutionStage = "") => {
  switch (evolutionStage) {
    case "child":
      return 2;
    case "teen":
      return 4;
    case "adult":
      return 6;
    default:
      return 0;
  }
};

export const getBattleAttackStat = (stat = 0, { levelBonus = 0, stageBonus = 0, buff = 0, debuff = 0 } = {}) =>
  Math.max(1, Math.round(8 + (Number.isFinite(stat) ? stat : 0) * 1.35 + levelBonus + stageBonus + buff - debuff));

export const getBattleDefenseStat = (stat = 0, { levelBonus = 0, stageBonus = 0, buff = 0, debuff = 0 } = {}) =>
  Math.max(0, Math.round(5 + (Number.isFinite(stat) ? stat : 0) * 1.15 + levelBonus + stageBonus + buff - debuff));

export const getBattleAttackIntervalMs = (agi = 0) =>
  clamp(
    Math.round(
      ADVENTURE_BATTLE_CONSTANTS.ATTACK_INTERVAL_MAX_MS -
      softValue(agi, 35) * (ADVENTURE_BATTLE_CONSTANTS.ATTACK_INTERVAL_MAX_MS - 360)
    ),
    ADVENTURE_BATTLE_CONSTANTS.ATTACK_INTERVAL_MIN_MS,
    ADVENTURE_BATTLE_CONSTANTS.ATTACK_INTERVAL_MAX_MS
  );

export const getBattleCriticalChance = ({
  dex = 0,
  luck = 0,
  enemyLuck = 0,
  buff = 0,
  debuff = 0
} = {}) =>
  clamp(
    0.05
      + softValue(dex, 48) * 0.18
      + softValue(luck, 60) * 0.22
      - softValue(enemyLuck, 60) * 0.16
      + buff
      - debuff,
    0,
    ADVENTURE_BATTLE_CONSTANTS.CRITICAL_CAP
  );

export const getBattleDodgeChance = ({
  dex = 0,
  luck = 0,
  enemyAgi = 0,
  enemyLuck = 0,
  buff = 0,
  debuff = 0
} = {}) =>
  clamp(
    0.04
      + softValue(dex, 40) * 0.22
      + softValue(luck, 55) * 0.14
      - softValue(enemyAgi, 50) * 0.2
      - softValue(enemyLuck, 55) * 0.12
      + buff
      - debuff,
    0,
    ADVENTURE_BATTLE_CONSTANTS.DODGE_CAP
  );

export const getBattleCriticalMultiplier = (luck = 0) =>
  clamp(ADVENTURE_BATTLE_CONSTANTS.CRITICAL_MULTIPLIER + softValue(luck, 60) * 0.15, 1.45, 1.7);

export const getBattleElementMultiplier = (attackerElement, defenderElement) => {
  const normalizedAttacker = normalizeElement(attackerElement);
  const normalizedDefender = normalizeElement(defenderElement);
  return ELEMENT_MULTIPLIER_TABLE[normalizedAttacker]?.[normalizedDefender] ?? 1;
};

export const calculateBattleDamage = ({
  attack = 0,
  defense = 0,
  elementMultiplier = 1,
  isCritical = false,
  criticalMultiplier = ADVENTURE_BATTLE_CONSTANTS.CRITICAL_MULTIPLIER,
  bonusDamage = 0
} = {}) => {
  const adjustedAttack = Math.max(1, Math.round(Math.max(0, attack) * elementMultiplier));
  const adjustedDefense = Math.max(0, Math.round(defense));
  const baseDamage = Math.max(1, adjustedAttack - adjustedDefense);
  const critDamage = isCritical ? Math.max(1, Math.round(baseDamage * (criticalMultiplier - 1))) : 0;
  return Math.max(1, Math.round(baseDamage + critDamage + bonusDamage));
};

export const getBattleBulletScale = (attack = 0) =>
  clamp(0.65 + (Math.max(0, Number.isFinite(attack) ? attack : 0) / ADVENTURE_BATTLE_CONSTANTS.BULLET_SCALE_DIVISOR), ADVENTURE_BATTLE_CONSTANTS.BULLET_SCALE_MIN, ADVENTURE_BATTLE_CONSTANTS.BULLET_SCALE_MAX);

export const getBattleRegenAmount = (wit = 0) =>
  clamp(Math.round(1 + softValue(wit, 35) * 6), 1, ADVENTURE_BATTLE_CONSTANTS.REGEN_MAX_PER_TICK);

export const getBattleStageAttackBonus = (stageIndex = 0) => getBattleStageBonus(stageIndex);

export const getBattleMonsterTextureKey = ({ species, stage = "adult" }) => {
  const resolvedSpecies = resolvePetId(species);
  return getPetTextureKey({ petId: resolvedSpecies, stage, variant: "idle" });
};
