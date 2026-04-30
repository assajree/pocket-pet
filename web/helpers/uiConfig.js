export const MINI_GAME_SUMMARY_DURATION_MS = 30000;
export const MINI_GAME_SUMMARY_INPUT_LOCK_MS = 1000;
export const LINK_GAME_COUNTDOWN_MS = 3000;
export const LINK_GAME_RESULT_DURATION_MS = 3000;
export const SLEEP_OK_ENERGY_BOOST = 6;

const createColorToken = (hex) => ({
  hex,
  value: Number.parseInt(hex.replace("#", ""), 16)
});

export const UI_COLORS = {
  appBackgroundTop: createColorToken("#f5f2ef"),
  appBackgroundBottom: createColorToken("#e7e4df"),
  shellFace: createColorToken("#fbfaf8"),
  shellFaceBottom: createColorToken("#efede9"),
  shellEdge: createColorToken("#d4d1cb"),
  screenFrame: createColorToken("#d3d1d1"),
  screenBezel: createColorToken("#bdb8b8"),
  buttonFaceTop: createColorToken("#dfdfdf"),
  buttonFace: createColorToken("#d8d8d8"),
  buttonShadow: createColorToken("#b3b3b3"),
  buttonText: createColorToken("#6a6782"),
  inkMain: createColorToken("#2c2a2a"),
  inkSoft: createColorToken("#656161"),
  screenBackground: createColorToken("#b7c7b5"),
  screenInk: createColorToken("#44514b"),
  screenInkStrong: createColorToken("#2f3e2e"),
  screenInkSoft: createColorToken("#6b7c67"),
  screenHighlight: createColorToken("#f4f7f0"),
  screenStrokeSoft: createColorToken("#dce7d9"),
  petSickTint: createColorToken("#8c9890"),
  petDeadTint: createColorToken("#7f8b85"),
  danger: createColorToken("#8d2f2f"),
  dangerText: createColorToken("#7d2f2f"),
  success: createColorToken("#2f6b2f"),
  missText: createColorToken("#5f6f75"),
  adventureSky: createColorToken("#dfe9cf"),
  adventureTileLight: createColorToken("#e8f1dd"),
  adventureTileShade: createColorToken("#d8e7c5"),
  adventureGround: createColorToken("#b8c79f"),
  adventureGroundLine: createColorToken("#8aa26d"),
  battleSky: createColorToken("#dae2cf"),
  battleBackground: createColorToken("#dde8d1"),
  battleGround: createColorToken("#b6c59b"),
  battleGroundLine: createColorToken("#8ba06c"),
  battleLane: createColorToken("#a4b590"),
  rewardOverlay: createColorToken("#f3f7ee"),
  rewardPanel: createColorToken("#fafcf7")
};

export const HARDWARE_BUTTON_LABELS = {
  left: "<",
  right: ">",
  cancel: "X",
  ok: "O"
};

export const ACTION_ANIMATION_CONFIG = {
  meal: { durationMs: 3000, nextView: "feed" },
  snack: { durationMs: 3000, nextView: "feed" },
  clean: { durationMs: 2000, nextView: "pet" },
  "reaction-happy": { durationMs: 2200, nextView: "pet", parentLabel: "HEAL", assetKey: "reaction-happy" },
  "reaction-angry": { durationMs: 2200, nextView: "pet", parentLabel: "HEAL", assetKey: "reaction-angry" }
};
