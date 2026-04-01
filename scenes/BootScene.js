import { applyOfflineProgress, loadState, saveState } from "../gameState.js";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    this.load.setPath("./assets");
    this.load.image("pet-baby", "pet-baby.svg");
    this.load.image("pet-child", "pet-child.svg");
    this.load.image("pet-teen", "pet-teen.svg");
    this.load.image("pet-adult", "pet-adult.svg");
    this.load.image("poop", "poop.svg");
  }

  create() {
    const state = loadState();
    applyOfflineProgress(state);
    saveState(state);

    this.registry.set("petState", state);
    this.scene.start("GameScene");
    this.scene.start("UIScene");
  }
}
