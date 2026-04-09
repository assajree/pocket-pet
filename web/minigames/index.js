import { PLAY_MENU_ITEMS } from "./playItems.js";
import { getSequenceMatchButtonLabel, sequenceMatchType } from "./sequenceMatch.js";
import { tapCountType } from "./tapCount.js";
import { createMiniGameState } from "./types.js";
import { formatStatusObject } from "../helpers/menuFormatters.js";

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

export const finalizeMiniGameResult = (miniGame, item) => {
  const handler = getMiniGameTypeHandler(item);
  const finalizedMiniGame =
    typeof handler.finalizeResult === "function"
      ? handler.finalizeResult(miniGame, item)
      : miniGame;

  return {
    ...finalizedMiniGame,
    result: {
      score: finalizedMiniGame.score,
      success: finalizedMiniGame.success,
      progress: finalizedMiniGame.progress,
      targetCount: finalizedMiniGame.sequence.length,
      timeBonus: finalizedMiniGame.timeBonus ?? 0,
      remainingMs: finalizedMiniGame.remainingMs ?? 0,
      failureReason: finalizedMiniGame.failureReason ?? null
    }
  };
};

export const getMiniGameStatusText = (miniGame, item) => getMiniGameTypeHandler(item).buildStatusText(miniGame, item);

export const getSequenceMatchNextButtonLabel = (miniGame) =>
  getSequenceMatchButtonLabel(miniGame?.sequence?.[miniGame?.progress] || "");

export const getMiniGameSummaryText = (miniGame, item) => {
  const miniGameConfig = item?.minigame || {};
  const resolvedEffects = miniGame.result?.resolvedEffects || {};
  const effectStatusLines = formatStatusObject(resolvedEffects);
  const summaryPayload = {
    score: miniGame.result?.score ?? miniGame.score,
    duration: miniGame.duration,
    success: miniGame.result?.success ?? miniGame.success,
    progress: miniGame.result?.progress ?? miniGame.progress,
    targetCount: miniGame.result?.targetCount ?? miniGame.sequence.length,
    timeBonus: miniGame.result?.timeBonus ?? miniGame.timeBonus ?? 0,
    remainingMs: miniGame.result?.remainingMs ?? miniGame.remainingMs ?? 0,
    failureReason: miniGame.result?.failureReason ?? miniGame.failureReason ?? null,
    resolvedEffects,
    effectStatusLines
  };

  const summaryText = typeof miniGameConfig.getSummaryText === "function"
    ? miniGameConfig.getSummaryText(summaryPayload)
    : `${getMiniGameScoreText(miniGame, item)}\n`;

  if (effectStatusLines.length) {
    return [summaryText + "\n", ...effectStatusLines].filter(Boolean).join("\n");
  }

  if (typeof miniGameConfig.getSummaryText === "function") {
    return summaryText;
  }

  return summaryText;
};
