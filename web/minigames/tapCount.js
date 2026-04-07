import { createMiniGameState } from "./types.js";

const buildBaseSession = (item) => ({
  ...createMiniGameState(),
  active: true,
  duration: item?.minigame?.durationSeconds || 5
});

const getMiniGameScoreText = (miniGame, item) => {
  const scoreUnit = item?.minigame?.scoreUnit || "points";
  return `${miniGame.score} ${scoreUnit}`;
};

export const tapCountType = {
  createSession(item) {
    return buildBaseSession(item);
  },
  applyInput(miniGame, button) {
    if (button === "cancel") {
      return { type: "cancel", miniGame };
    }

    if (button === "ok") {
      return {
        type: "update",
        miniGame: {
          ...miniGame,
          score: miniGame.score + 1
        }
      };
    }

    return { type: "noop", miniGame };
  },
  buildStatusText(miniGame, item) {
    const inputPrompt = item?.minigame?.inputPrompt || "O play  X exit";
    const timeLeft = Math.max(0, miniGame.duration - miniGame.elapsed).toFixed(1);
    return `${inputPrompt}\n${getMiniGameScoreText(miniGame, item)} ${timeLeft}s`;
  }
};
