import { SEQUENCE_MATCH_HIT_SCORE } from "./sequenceMatch.js";

const QUICK_MATCH_SEQUENCE_LENGTH = 5;

export const PLAY_MENU_ITEMS = [
  {
    key: "tap-sprint",
    label: "TAP SPRINT",
    caption: "Press O fast for five seconds.",
    name: "TAP SPRINT",
    icon: "tap-sprint",
    minigame: {
      type: "tap-count",
      durationSeconds: 5,
      inputPrompt: "O tap  X exit",
      scoreUnit: "taps",
      summaryTitle: "Result",
      getSummaryText: ({ score }) => `${score} taps\nPlease wait...`
    },
    currentStatus: ({ happiness, energy, weight }) => ({
      happiness: Math.round(happiness),
      energy: Math.round(energy),
      weight: Math.round(weight)
    }),
    effectStatus: {
      happiness: { min: 8, max: 24, minScore: 0, maxScore: 8 },
      energy: { min: 0, max: -10, minScore: 0, maxScore: 20 },
      weight: { min: -1, max: -4, minScore: 0, maxScore: 12 }
    }
  },
  {
    key: "cheer-burst",
    label: "CHEER BURST",
    caption: "Mash O for a quick cheer boost.",
    name: "CHEER BURST",
    icon: "play",
    minigame: {
      type: "tap-count",
      durationSeconds: 3,
      inputPrompt: "O cheer  X exit",
      scoreUnit: "cheers",
      summaryTitle: "Cheer",
      getSummaryText: ({ score }) => `${score} cheers\nMood boosted.`
    },
    currentStatus: ({ happiness, energy }) => ({
      happiness: Math.round(happiness),
      energy: Math.round(energy)
    }),
    effectStatus: {
      happiness: { min: 6, max: 20, minScore: 0, maxScore: 7 },
      energy: { min: -2, max: -8, minScore: 0, maxScore: 12 },
      weight: { min: -2, max: -8, minScore: 0, maxScore: 12 }
    }
  },
  {
    key: "quick-match",
    label: "QUICK MATCH",
    caption: `Press the shown ${QUICK_MATCH_SEQUENCE_LENGTH}-button pattern before time runs out.`,
    name: "QUICK MATCH",
    icon: "play",
    minigame: {
      type: "sequence-match",
      durationSeconds: 7,
      inputPrompt: `Match ${QUICK_MATCH_SEQUENCE_LENGTH} buttons`,
      scoreUnit: "points",
      sequenceLength: QUICK_MATCH_SEQUENCE_LENGTH,
      buttonPool: ["left", "right", "ok"],
      summaryTitle: "Match",
      getSummaryText: ({ score, success, progress, targetCount, timeBonus, failureReason }) => {
        if (success) {
          return `${score} points\nSequence cleared. +${timeBonus} time bonus.`;
        }

        if (failureReason === "mistake") {
          return `${score} points\nMissed input at ${progress}/${targetCount}. Reward kept.`;
        }

        return `${score} points\n${progress}/${targetCount} matched. Time ran out.`;
      }
    },
    currentStatus: ({ happiness, energy }) => ({
      happiness: Math.round(happiness),
      energy: Math.round(energy)
    }),
    effectStatus: {
      happiness: { min: 0, max: 10, minScore: 1, maxScore: QUICK_MATCH_SEQUENCE_LENGTH * SEQUENCE_MATCH_HIT_SCORE },
      energy: { min: -2, max: -7, minScore: 0, maxScore: QUICK_MATCH_SEQUENCE_LENGTH * SEQUENCE_MATCH_HIT_SCORE },
      weight: { min: -2, max: -7, minScore: 0, maxScore: QUICK_MATCH_SEQUENCE_LENGTH * SEQUENCE_MATCH_HIT_SCORE }
    }
  }
];
