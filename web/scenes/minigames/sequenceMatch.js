import { createMiniGameState } from "./types.js";

const buildBaseSession = (item) => ({
  ...createMiniGameState(),
  active: true,
  duration: item?.minigame?.durationSeconds || 5
});

const getMiniGameButtonLabel = (button) => {
  const labels = {
    left: "L",
    right: "R",
    ok: "O",
    cancel: "X"
  };

  return labels[button] || button.toUpperCase();
};

const getMiniGameSequenceText = (miniGame) =>
  miniGame.sequence
    .map((button, index) => {
      const label = getMiniGameButtonLabel(button);
      return index === miniGame.progress ? `[${label}]` : label;
    })
    .join(" ");

const createSequence = (miniGameConfig, randomPick) => {
  const buttonPool =
    Array.isArray(miniGameConfig.buttonPool) && miniGameConfig.buttonPool.length
      ? miniGameConfig.buttonPool
      : ["left", "right", "ok"];
  const sequenceLength = miniGameConfig.sequenceLength || 5;

  return Array.from({ length: sequenceLength }, () => randomPick(buttonPool));
};

export const sequenceMatchType = {
  createSession(item, randomPick) {
    return {
      ...buildBaseSession(item),
      sequence: createSequence(item?.minigame || {}, randomPick)
    };
  },
  applyInput(miniGame, button) {
    if (button === "cancel") {
      return { type: "cancel", miniGame };
    }

    const expectedButton = miniGame.sequence[miniGame.progress];
    if (button === expectedButton) {
      const nextMiniGame = {
        ...miniGame,
        progress: miniGame.progress + 1,
        score: miniGame.score + 1
      };

      if (nextMiniGame.progress >= nextMiniGame.sequence.length) {
        return {
          type: "complete",
          miniGame: {
            ...nextMiniGame,
            success: true
          }
        };
      }

      return { type: "update", miniGame: nextMiniGame };
    }

    if (["left", "right", "ok"].includes(button)) {
      return {
        type: "update",
        miniGame: {
          ...miniGame,
          progress: 0
        }
      };
    }

    return { type: "noop", miniGame };
  },
  buildStatusText(miniGame, item) {
    const inputPrompt = item?.minigame?.inputPrompt || "Match buttons";
    const timeLeft = Math.max(0, miniGame.duration - miniGame.elapsed).toFixed(1);
    return `${inputPrompt}\n${getMiniGameSequenceText(miniGame)}\nMATCH ${miniGame.progress}/${miniGame.sequence.length} ${timeLeft}s`;
  }
};
