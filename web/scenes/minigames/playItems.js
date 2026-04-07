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
      happiness: { min: 8, max: 24, value: ({ taps = 0 }) => Math.min(24, 8 + taps * 2) },
      energy: { min: 0, max: -10, value: ({ taps = 0 }) => -Math.min(10, Math.floor(taps / 2)) },
      weight: { min: -1, max: -4, value: ({ taps = 0 }) => -Math.min(4, Math.max(1, Math.floor(taps / 4))) }
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
      happiness: { min: 6, max: 20, value: ({ taps = 0 }) => Math.min(20, 6 + taps * 2) },
      energy: { min: -2, max: -8, value: ({ taps = 0 }) => -Math.min(8, Math.max(2, Math.ceil(taps / 2))) },
      weight: { min: -2, max: -8, value: ({ taps = 0 }) => -Math.min(8, Math.max(2, Math.ceil(taps / 2))) }
    }
  },
  {
    key: "quick-match",
    label: "QUICK MATCH",
    caption: "Press the shown 5-button pattern before time runs out.",
    name: "QUICK MATCH",
    icon: "play",
    minigame: {
      type: "sequence-match",
      durationSeconds: 7,
      inputPrompt: "Match 5 buttons",
      scoreUnit: "hits",
      sequenceLength: 5,
      buttonPool: ["left", "right", "ok"],
      summaryTitle: "Match",
      getSummaryText: ({ score, success, progress, targetCount }) =>
        success ? `${score}/${targetCount} correct\nSequence cleared.` : `${progress}/${targetCount} matched\nTime ran out.`
    },
    currentStatus: ({ happiness, energy }) => ({
      happiness: Math.round(happiness),
      energy: Math.round(energy)
    }),
    effectStatus: {
      happiness: { min: 4, max: 18, value: ({ score = 0 }) => Math.min(18, 4 + score * 2) },
      energy: { min: -2, max: -7, value: ({ score = 0 }) => -Math.min(7, Math.max(2, score + 1)) },
      weight: { min: -2, max: -7, value: ({ score = 0 }) => -Math.min(7, Math.max(2, score + 1)) }
    }
  }
];
