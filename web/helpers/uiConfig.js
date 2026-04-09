export const MINI_GAME_SUMMARY_DURATION_MS = 30000;
export const MINI_GAME_SUMMARY_INPUT_LOCK_MS = 1000;
export const LINK_GAME_COUNTDOWN_MS = 3000;
export const LINK_GAME_RESULT_DURATION_MS = 3000;
export const SLEEP_OK_ENERGY_BOOST = 6;

export const ACTION_ANIMATION_CONFIG = {
  meal: { durationMs: 3000, nextView: "feed" },
  snack: { durationMs: 3000, nextView: "feed" },
  clean: { durationMs: 2000, nextView: "pet" },
  "reaction-happy": { durationMs: 2200, nextView: "pet", parentLabel: "HEAL", assetKey: "reaction-happy" },
  "reaction-angry": { durationMs: 2200, nextView: "pet", parentLabel: "HEAL", assetKey: "reaction-angry" }
};
