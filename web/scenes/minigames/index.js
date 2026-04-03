import { PLAY_MENU_ITEMS } from "./playItems.js";
import { sequenceMatchType } from "./sequenceMatch.js";
import { tapCountType } from "./tapCount.js";
import { createMiniGameState } from "./types.js";

const getMiniGameType = (item) => item?.minigame?.type || "tap-count";

const MINI_GAME_TYPE_HANDLERS = {
  "tap-count": tapCountType,
  "sequence-match": sequenceMatchType
};

const getMiniGameTypeHandler = (item) => MINI_GAME_TYPE_HANDLERS[getMiniGameType(item)] || tapCountType;

const getMiniGameScoreText = (miniGame, item) => {
  const scoreUnit = item?.minigame?.scoreUnit || "points";
  return `${miniGame.score} ${scoreUnit}`;
};

export { PLAY_MENU_ITEMS, createMiniGameState };

export const createMiniGameSyncState = (item, randomPick) => {
  const handler = getMiniGameTypeHandler(item);
  if (typeof handler.createSyncState !== "function") {
    return null;
  }

  return handler.createSyncState(item, randomPick);
};

export const initializeMiniGameSession = (item, randomPick, syncState = null) =>
  getMiniGameTypeHandler(item).createSession(item, randomPick, syncState);

export const applyMiniGameInput = (miniGame, item, button) => {
  if (!miniGame.active) {
    return { type: "noop", miniGame };
  }

  return getMiniGameTypeHandler(item).applyInput(miniGame, button, item);
};

export const finalizeMiniGameResult = (miniGame) => ({
  ...miniGame,
  result: {
    score: miniGame.score,
    success: miniGame.success,
    progress: miniGame.progress,
    targetCount: miniGame.sequence.length
  }
});

export const getMiniGameStatusText = (miniGame, item) => getMiniGameTypeHandler(item).buildStatusText(miniGame, item);

export const getMiniGameSummaryText = (miniGame, item) => {
  const miniGameConfig = item?.minigame || {};
  const summaryPayload = {
    score: miniGame.result?.score ?? miniGame.score,
    duration: miniGame.duration,
    success: miniGame.result?.success ?? miniGame.success,
    progress: miniGame.result?.progress ?? miniGame.progress,
    targetCount: miniGame.result?.targetCount ?? miniGame.sequence.length
  };

  if (typeof miniGameConfig.getSummaryText === "function") {
    return miniGameConfig.getSummaryText(summaryPayload);
  }

  return `${getMiniGameScoreText(miniGame, item)}\nPlease wait...`;
};
