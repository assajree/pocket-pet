import { createMiniGameState } from "./types.js";

export const SEQUENCE_MATCH_HIT_SCORE = 10000;

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

const getRemainingMs = (miniGame) =>
  Math.max(0, Math.round((miniGame.duration - miniGame.elapsed) * 1000));

const finalizeSequenceMatchState = (miniGame, success, failureReason = null) => {
  const remainingMs = success ? getRemainingMs(miniGame) : 0;

  return {
    ...miniGame,
    success,
    failureReason,
    timeBonus: remainingMs,
    remainingMs,
    score: miniGame.score + remainingMs
  };
};

export const sequenceMatchType = {
  createSyncState(item, randomPick) {
    return {
      sequence: createSequence(item?.minigame || {}, randomPick)
    };
  },
  createSession(item, randomPick, syncState = null) {
    const sequence = Array.isArray(syncState?.sequence) && syncState.sequence.length
      ? syncState.sequence
      : createSequence(item?.minigame || {}, randomPick);

    return {
      ...buildBaseSession(item),
      sequence
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
        score: miniGame.score + SEQUENCE_MATCH_HIT_SCORE
      };

      if (nextMiniGame.progress >= nextMiniGame.sequence.length) {
        return {
          type: "complete",
          miniGame: finalizeSequenceMatchState(nextMiniGame, true)
        };
      }

      return { type: "update", miniGame: nextMiniGame };
    }

    if (["left", "right", "ok"].includes(button)) {
      return {
        type: "complete",
        miniGame: finalizeSequenceMatchState(miniGame, false, "mistake")
      };
    }

    return { type: "noop", miniGame };
  },
  finalizeResult(miniGame) {
    if (miniGame.success || miniGame.failureReason === "mistake") {
      return miniGame;
    }

    return finalizeSequenceMatchState(miniGame, false, "timeout");
  },
  buildStatusText(miniGame, item) {
    const inputPrompt = item?.minigame?.inputPrompt || "Match buttons";
    const timeLeft = Math.max(0, miniGame.duration - miniGame.elapsed).toFixed(1);
    return `${inputPrompt}\n${getMiniGameSequenceText(miniGame)}\nMATCH ${miniGame.progress}/${miniGame.sequence.length} ${timeLeft}s`;
  }
};
