import { applyOfflineProgress, loadState, saveState } from "../gameState.js";
import { ensurePetStageAssetsLoaded } from "./helpers/petAssets.js";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    this.load.setPath("./assets");
    this.load.image("poop", "poop.svg");

    const uiAssets = [
      "default-menu",
      "feed",
      "play",
      "sleep",
      "clean",
      "medicine",
      "meal",
      "snack",
      "tap-sprint",
      "status",
      "message",
      "summary",
      "debug",
      "debug-fill",
      "debug-drain",
      "debug-sick",
      "feeding-meal",
      "feeding-snack",
      "cleaning-room"
    ];

    uiAssets.forEach((assetKey) => {
      this.load.text(`ui-${assetKey}`, `ui/${assetKey}.svg`);
    });
  }

  create() {
    const state = loadState();
    // applyOfflineProgress(state);
    // saveState(state);

    this.registry.set("petState", state);
    ensurePetStageAssetsLoaded(this, state.petId, state.evolutionStage)
      .catch((error) => {
        console.warn("Initial pet assets failed to load.", error);
      })
      .finally(() => {
        this.scene.start("GameScene");
        this.scene.start("UIScene");
      });
  }
}
