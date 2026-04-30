import { saveState } from "../gameState.js";
import {
  ADVENTURE_CHEST_OFFERS,
  ADVENTURE_STAGE_CONFIGS,
  applyAdventureChestChoice,
  chooseMonsterDrop,
  getAdventureStageConfig,
  grantAdventureRewardBundle,
  markAdventureStageCleared
} from "../helpers/adventure.js";
import { ADVENTURE_BATTLE_CONSTANTS, createBattleSeededRng } from "../helpers/adventureBattle.js";
import { ensurePetStageAssetsLoaded, getPetTextureKey } from "../helpers/petAssets.js";

const ADVENTURE_SCROLL_SPEED = 0.16;
const ADVENTURE_TRAVEL_SEGMENT_MS = 2200;
const ADVENTURE_PET_TOGGLE_MS = 260;
const ADVENTURE_ARRIVAL_THRESHOLD = 118;
const ADVENTURE_PANEL_WIDTH = 260;
const ADVENTURE_PANEL_HEIGHT = 116;
const ADVENTURE_PANEL_Y = 88;
const ADVENTURE_MENU_Y = 92;

const createAdventureStatBuff = () => ({ str: 0, agi: 0, vit: 0, dex: 0, luck: 0, wit: 0 });

const formatLootText = (entries = []) =>
  entries.length
    ? entries.map((entry) => `${entry.itemId.toUpperCase()} x${entry.qty}`).join("\n")
    : "No loot yet.";

const pickUniqueOffers = (count, rng) => {
  const pool = [...ADVENTURE_CHEST_OFFERS];
  const picks = [];
  while (pool.length && picks.length < count) {
    const index = Math.floor(rng() * pool.length);
    picks.push(pool.splice(index, 1)[0]);
  }
  return picks;
};

export default class AdventureScene extends Phaser.Scene {
  constructor() {
    super("AdventureScene");
    this.phase = "idle";
    this.travelTimer = null;
    this.travelTween = null;
    this.walkTimer = null;
    this.autoAdvanceTimer = null;
    this.rng = createBattleSeededRng("adventure");
    this.runBuffs = createAdventureStatBuff();
    this.collectedDrops = [];
  }

  async create(data = {}) {
    this.state = this.registry.get("petState");
    this.stageConfig = getAdventureStageConfig(data.stageId) || ADVENTURE_STAGE_CONFIGS[0];
    this.stageIndex = Math.max(0, ADVENTURE_STAGE_CONFIGS.findIndex((stage) => stage.id === this.stageConfig.id));
    this.seed = data.seed || `${this.stageConfig.id}:${Date.now()}`;
    this.autoCloseSummary = data.autoCloseSummary !== false;
    this.summaryDurationMs = Number.isFinite(data.summaryDurationMs) ? data.summaryDurationMs : ADVENTURE_BATTLE_CONSTANTS.SUMMARY_DURATION_MS;
    this.runBuffs = createAdventureStatBuff();
    this.collectedDrops = [];
    this.menuIndex = 0;
    this.chestChoices = [];
    this.currentMonsterIndex = 0;
    this.currentEncounterType = "chest";
    this.currentEncounterSprite = null;
    this.walkToggleAt = 0;
    this.scrollOffset = 0;
    this.phase = "loading";
    this.resultSummary = null;
    this.isEnding = false;
    this.rng = createBattleSeededRng(this.seed);
    this.uiScene = this.scene.get("UIScene");
    this.uiScene?.setAdventureFlowActive?.(true);

    this.loadingText = this.add.text(this.scale.width / 2, this.scale.height / 2, "Preparing adventure...", {
      fontFamily: "Courier New",
      fontSize: "24px",
      color: "#2f3e2e",
      stroke: "#f4f7f0",
      strokeThickness: 4,
      align: "center"
    }).setOrigin(0.5);

    try {
      await this.ensureAdventureAssetsLoaded();
      if (!this.scene.isActive()) {
        return;
      }
      this.loadingText?.destroy();
      this.buildScene();
      this.beginTravel("chest");
    } catch (error) {
      console.warn("Failed to prepare adventure scene.", error);
      this.loadingText?.setText("Adventure assets failed to load.");
      this.loadingText?.setColor("#7d2f2f");
      this.phase = "error";
    }

    this.events.on("shutdown", () => {
      this.clearTimers();
      this.destroyEncounterSprite();
      this.destroyChestMenu();
      this.destroySummaryOverlay();
      this.uiScene?.setAdventureFlowActive?.(false);
    });
  }

  async ensureAdventureAssetsLoaded() {
    const uniqueSpecies = new Set([this.state.petId, ...this.stageConfig.monsters.map((monster) => monster.species)]);
    const loadPromises = Array.from(uniqueSpecies).map((petId) => ensurePetStageAssetsLoaded(this, petId, petId === this.state.petId ? this.state.evolutionStage : "adult"));
    await Promise.all(loadPromises);
  }

  buildScene() {
    this.cameras.main.setBackgroundColor("#dfe9cf");
    if (!this.textures.exists("adventure-bg")) {
      const bgGraphics = this.make.graphics({ x: 0, y: 0, add: false });
      bgGraphics.fillStyle(0xe8f1dd, 1);
      bgGraphics.fillRect(0, 0, 64, 64);
      bgGraphics.fillStyle(0xd8e7c5, 1);
      bgGraphics.fillRect(0, 0, 12, 64);
      bgGraphics.fillRect(24, 0, 12, 64);
      bgGraphics.fillRect(48, 0, 12, 64);
      bgGraphics.generateTexture("adventure-bg", 64, 64);
      bgGraphics.destroy();
    }

    this.background = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, "adventure-bg")
      .setOrigin(0)
      .setAlpha(0.18);

    this.add.rectangle(0, this.scale.height * 0.72, this.scale.width, this.scale.height * 0.28, 0xb8c79f).setOrigin(0);
    this.add.rectangle(0, this.scale.height * 0.76, this.scale.width, 8, 0x8aa26d).setOrigin(0);

    this.petSprite = this.add.image(92, this.scale.height * 0.67, this.getPetTexture("idle"));
    this.petSprite.setDisplaySize(150, 150);
    this.petSprite.setDepth(10);

    this.encounterAnchorX = this.scale.width + 96;
    this.encounterAnchorY = this.scale.height * 0.63;

    this.titleText = this.add.text(18, 14, this.stageConfig.name.toUpperCase(), {
      fontFamily: "Courier New",
      fontSize: "20px",
      color: "#2f3e2e",
      stroke: "#f4f7f0",
      strokeThickness: 4
    });

    this.infoText = this.add.text(18, 40, "", {
      fontFamily: "Courier New",
      fontSize: "14px",
      color: "#44514b",
      stroke: "#f4f7f0",
      strokeThickness: 3,
      lineSpacing: 4
    });

    this.menuPanel = this.add.rectangle(this.scale.width / 2, this.scale.height - ADVENTURE_PANEL_Y, ADVENTURE_PANEL_WIDTH, ADVENTURE_PANEL_HEIGHT, 0xf4f7f0, 0.9)
      .setStrokeStyle(2, 0x44514b)
      .setDepth(20)
      .setVisible(false);
    this.menuTitle = this.add.text(this.scale.width / 2, this.scale.height - ADVENTURE_PANEL_Y - 38, "", {
      fontFamily: "Courier New",
      fontSize: "20px",
      color: "#2f3e2e",
      stroke: "#f4f7f0",
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(21).setVisible(false);
    this.menuBody = this.add.text(this.scale.width / 2, this.scale.height - ADVENTURE_PANEL_Y, "", {
      fontFamily: "Courier New",
      fontSize: "15px",
      color: "#44514b",
      align: "center",
      lineSpacing: 6
    }).setOrigin(0.5).setDepth(21).setVisible(false);

    this.promptText = this.add.text(this.scale.width / 2, this.scale.height - 20, "", {
      fontFamily: "Courier New",
      fontSize: "14px",
      color: "#2f3e2e"
    }).setOrigin(0.5).setDepth(21);

    this.toastText = this.add.text(this.scale.width / 2, this.scale.height * 0.18, "", {
      fontFamily: "Courier New",
      fontSize: "16px",
      color: "#2f3e2e",
      stroke: "#f4f7f0",
      strokeThickness: 4,
      align: "center"
    }).setOrigin(0.5).setDepth(25).setAlpha(0);

    this.refreshInfo();
  }

  clearTimers() {
    this.travelTimer?.remove(false);
    this.travelTimer = null;
    this.walkTimer?.remove(false);
    this.walkTimer = null;
    this.autoAdvanceTimer?.remove(false);
    this.autoAdvanceTimer = null;
  }

  getPetTexture(variant = "idle") {
    return getPetTextureKey({ petId: this.state.petId, stage: this.state.evolutionStage, variant });
  }

  refreshInfo(extraLine = "") {
    const monster = this.stageConfig.monsters[this.currentMonsterIndex];
    const clearedCount = Array.isArray(this.state.adventure?.clearedStageIds) ? this.state.adventure.clearedStageIds.length : 0;
    const lines = [
      `Stage ${this.stageIndex + 1}/${ADVENTURE_STAGE_CONFIGS.length}`,
      `HP ${Math.max(0, Math.round(this.state.health))}`,
      `Buffs STR ${this.runBuffs.str} AGI ${this.runBuffs.agi} VIT ${this.runBuffs.vit} WIT ${this.runBuffs.wit} DEX ${this.runBuffs.dex} LUCK ${this.runBuffs.luck}`,
      `Clear ${clearedCount} stages`
    ];
    if (monster) {
      lines.push(`Next: ${this.currentEncounterType === "chest" ? "Treasure" : monster.name}`);
    }
    if (extraLine) {
      lines.push(extraLine);
    }
    this.infoText.setText(lines.join("\n"));
  }

  beginTravel(nextEncounterType) {
    this.clearTimers();
    this.destroyEncounterSprite();
    this.destroyChestMenu();
    this.phase = "travel";
    this.currentEncounterType = nextEncounterType;
    this.walkToggleAt = this.time.now + ADVENTURE_PET_TOGGLE_MS;
    this.travelTimer = this.time.delayedCall(ADVENTURE_TRAVEL_SEGMENT_MS, () => {
      this.travelTimer = null;
      if (this.currentEncounterType === "chest") {
        this.openTreasureChest();
      } else {
        this.startFightEncounter();
      }
    });

    const monster = this.stageConfig.monsters[this.currentMonsterIndex];
    this.currentEncounterSprite = this.currentEncounterType === "chest"
      ? this.buildChestSprite()
      : this.buildMonsterSprite(monster);
    this.currentEncounterSprite.setPosition(this.encounterAnchorX, this.encounterAnchorY);
    this.currentEncounterSprite.setDepth(8);
    this.currentEncounterSpeed = (this.encounterAnchorX - this.petSprite.x - ADVENTURE_ARRIVAL_THRESHOLD) / Math.max(1, ADVENTURE_TRAVEL_SEGMENT_MS);
    this.showToast(this.currentEncounterType === "chest" ? "A treasure chest is approaching." : `A ${monster.name} is near.`, 800);
    this.promptText.setText("Traveling...");
    this.refreshInfo();
  }

  buildChestSprite() {
    const container = this.add.container(0, 0);
    const body = this.add.rectangle(0, 0, 74, 54, 0xb57c3f).setStrokeStyle(3, 0x5b3615);
    const lid = this.add.rectangle(0, -20, 78, 24, 0xd19a58).setStrokeStyle(3, 0x5b3615);
    const label = this.add.text(0, 0, "CHEST", {
      fontFamily: "Courier New",
      fontSize: "16px",
      color: "#2f3e2e",
      stroke: "#f4f7f0",
      strokeThickness: 3
    }).setOrigin(0.5);
    container.add([body, lid, label]);
    return container;
  }

  buildMonsterSprite(monster) {
    const container = this.add.container(0, 0);
    const sprite = this.add.image(0, -4, getPetTextureKey({ petId: monster.species, stage: "adult", variant: "idle" }));
    sprite.setDisplaySize(72, 72);
    const label = this.add.text(0, 44, monster.name.toUpperCase(), {
      fontFamily: "Courier New",
      fontSize: "12px",
      color: "#44514b",
      align: "center"
    }).setOrigin(0.5);
    container.add([sprite, label]);
    return container;
  }

  showToast(message, durationMs = 900) {
    this.toastText.setText(message);
    this.toastText.setAlpha(1);
    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      duration: Math.max(200, durationMs),
      delay: 20
    });
  }

  openTreasureChest() {
    this.phase = "chest";
    this.destroyEncounterSprite();
    this.chestChoices = pickUniqueOffers(3, this.rng);
    this.menuIndex = 0;
    this.menuPanel.setVisible(true);
    this.menuTitle.setVisible(true);
    this.menuBody.setVisible(true);
    this.menuTitle.setText("TREASURE");
    this.refreshChestMenu();
    this.promptText.setText("Left / Right choose, O take.");
    this.refreshInfo("Treasure found.");
  }

  refreshChestMenu() {
    const lines = this.chestChoices.map((choice, index) => {
      const marker = index === this.menuIndex ? ">" : " ";
      return `${marker} ${choice.label}\n${choice.caption}`;
    });
    this.menuBody.setText(lines.join("\n\n"));
  }

  destroyChestMenu() {
    this.menuPanel?.setVisible(false);
    this.menuTitle?.setVisible(false);
    this.menuBody?.setVisible(false);
  }

  destroyEncounterSprite() {
    if (!this.currentEncounterSprite) {
      return;
    }

    this.currentEncounterSprite.destroy(true);
    this.currentEncounterSprite = null;
  }

  destroySummaryOverlay() {
    this.summaryOverlay?.destroy?.(true);
    this.summaryOverlay = null;
  }

  startFightEncounter() {
    const monster = this.stageConfig.monsters[this.currentMonsterIndex];
    if (!monster) {
      this.finishAdventureSuccess();
      return;
    }

    this.phase = "fight";
    this.destroyEncounterSprite();
    this.destroyChestMenu();
    this.promptText.setText("Battle starting...");
    this.refreshInfo(`Facing ${monster.name}.`);

    this.scene.launch("FightScene", {
      stageId: this.stageConfig.id,
      stageIndex: this.stageIndex,
      seed: `${this.seed}:${this.currentMonsterIndex}:${monster.name}`,
      monster,
      runBuffs: { ...this.runBuffs },
      autoCloseSummary: this.autoCloseSummary,
      summaryDurationMs: ADVENTURE_BATTLE_CONSTANTS.SUMMARY_DURATION_MS,
      resultFlashMs: ADVENTURE_BATTLE_CONSTANTS.RESULT_FLASH_MS
    });
  }

  handleFightResolved(result) {
    if (this.isEnding) {
      return;
    }
    const monster = this.stageConfig.monsters[this.currentMonsterIndex];
    if (!result?.victory) {
      this.state.isSick = true;
      this.state.health = Math.max(0, Math.round(result?.playerHp ?? this.state.health));
      saveState(this.state, "adventure:loss");
      this.finishAdventureFailure(result);
      return;
    }

    const drop = chooseMonsterDrop(monster, this.rng);
    if (drop) {
      const gained = grantAdventureRewardBundle(this.state, [drop]);
      if (gained.length) {
        this.collectedDrops.push(...gained);
        this.showToast(`Found ${gained[0].itemId.toUpperCase()} x${gained[0].qty}.`, 1200);
      }
    }

    saveState(this.state, "adventure:monster-drop");
    this.currentMonsterIndex += 1;
    if (this.currentMonsterIndex >= this.stageConfig.monsters.length) {
      this.finishAdventureSuccess();
      return;
    }

    this.currentEncounterType = "chest";
    this.beginTravel("chest");
  }

  finishAdventureFailure(result = null) {
    this.isEnding = true;
    this.destroyEncounterSprite();
    this.destroyChestMenu();
    this.stopAdventureChildScenes();
    this.promptText.setText("Adventure failed.");
    this.refreshInfo("Pet became sick.");
    this.uiScene?.onAdventureFlowComplete?.({
      success: false,
      stageId: this.stageConfig.id,
      result
    });
    this.scene.stop();
  }

  finishAdventureSuccess() {
    if (this.isEnding) {
      return;
    }

    this.isEnding = true;
    this.destroyEncounterSprite();
    this.destroyChestMenu();
    const grantedRewards = grantAdventureRewardBundle(this.state, this.stageConfig.reward);
    markAdventureStageCleared(this.state, this.stageConfig.id);
    saveState(this.state, "adventure:success");
    const allLoot = [...grantedRewards, ...this.collectedDrops];
    this.scene.launch("RewardScene", {
      stageName: this.stageConfig.name,
      rewards: allLoot,
      autoCloseMs: this.autoCloseSummary ? this.summaryDurationMs : -1
    });
    this.promptText.setText("Adventure cleared!");
    this.refreshInfo("Stage complete.");
  }

  handleRewardClosed() {
    if (!this.isEnding) {
      return;
    }

    this.stopAdventureChildScenes();
    this.uiScene?.onAdventureFlowComplete?.({
      success: true,
      stageId: this.stageConfig.id,
      rewards: [...this.stageConfig.reward, ...this.collectedDrops]
    });
    this.scene.stop();
  }

  stopAdventureChildScenes() {
    ["FightScene", "RewardScene"].forEach((sceneKey) => {
      const childScene = this.scene.get(sceneKey);
      if (childScene?.scene?.isActive()) {
        childScene.scene.stop();
      }
    });
  }

  handleAdventureInput(button) {
    if (this.phase === "chest") {
      if (button === "left") {
        this.menuIndex = (this.menuIndex + this.chestChoices.length - 1) % this.chestChoices.length;
        this.refreshChestMenu();
        return;
      }

      if (button === "right") {
        this.menuIndex = (this.menuIndex + 1) % this.chestChoices.length;
        this.refreshChestMenu();
        return;
      }

      if (button === "ok" || button === "cancel") {
        const choice = this.chestChoices[this.menuIndex];
        const outcome = applyAdventureChestChoice(this.state, choice, this.runBuffs);
        this.showToast(outcome.message || "Treasure taken.", 900);
        saveState(this.state, "adventure:treasure");
        this.beginTravel("monster");
      }
      return;
    }
  }

  update(time, delta) {
    if (this.phase !== "travel" || !this.currentEncounterSprite) {
      return;
    }

    this.scrollOffset += ADVENTURE_SCROLL_SPEED * delta;
    if (this.background) {
      this.background.tilePositionX = this.scrollOffset;
    }

    if (time >= this.walkToggleAt) {
      this.walkToggleAt = time + ADVENTURE_PET_TOGGLE_MS;
      const textureVariant = this.petSprite.texture.key === this.getPetTexture("idle") ? "attack" : "idle";
      this.petSprite.setTexture(this.getPetTexture(textureVariant));
    }

    this.currentEncounterSprite.x -= this.currentEncounterSpeed * delta;
    if (this.currentEncounterSprite.x <= this.petSprite.x + ADVENTURE_ARRIVAL_THRESHOLD) {
      if (this.currentEncounterType === "chest") {
        this.openTreasureChest();
      } else {
        this.startFightEncounter();
      }
    }
  }
}
