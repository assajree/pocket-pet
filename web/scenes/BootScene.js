import { applyOfflineProgress, loadState, saveState } from "../gameState.js";
import { getPetStageAssetBundle } from "./helpers/petAssets.js";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
    this.initialState = null;
  }

  preload() {
    const { width, height } = this.scale;
    this.add
      .text(width * 0.5, height * 0.5, "Booting...", {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: "24px",
        color: "#2f3e2e"
      })
      .setOrigin(0.5);

    this.initialState = loadState();
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

    const initialPetBundle = getPetStageAssetBundle(this.initialState.petId, this.initialState.evolutionStage);
    this.load.setPath("");
    initialPetBundle.textures.forEach((texture) => {
      this.load.image(texture.key, texture.url);
    });
  }

  create() {
    const state = this.initialState || loadState();
    // applyOfflineProgress(state);
    // saveState(state);

    this.registry.set("petState", state);
    this.scene.start("GameScene");
    this.scene.start("UIScene");
  }
}
