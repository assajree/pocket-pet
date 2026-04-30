import { saveState, startSicknessEpisode } from "../gameState.js";
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
const ADVENTURE_FAILURE_LOW_STAT = 20;
const ADVENTURE_FAILURE_HEALTH = 10;
const ADVENTURE_MENU_BACKGROUND = 0xb7c7b5;
const ADVENTURE_MENU_TEXT = "#44514b";

const createAdventureStatBuff = () => ({ str: 0, agi: 0, vit: 0, dex: 0, luck: 0, wit: 0 });

const applyAdventureFailurePenalty = (state, result = null) => {
  state.isAlive = true;
  state.isSleeping = false;
  startSicknessEpisode(state, "Adventure failed. Your pet became sick.");

  const remainingHp = Math.round(result?.playerHp ?? state.health ?? 0);
  state.health = Math.max(ADVENTURE_FAILURE_HEALTH, remainingHp);
  state.hunger = Math.min(state.hunger, ADVENTURE_FAILURE_LOW_STAT);
  state.happiness = Math.min(state.happiness, ADVENTURE_FAILURE_LOW_STAT);
  state.energy = Math.min(state.energy, ADVENTURE_FAILURE_LOW_STAT);
  state.cleanliness = Math.min(state.cleanliness, ADVENTURE_FAILURE_LOW_STAT);
};

const formatChestHeader = (stageName, stageIndex, totalStages) =>
  `${stageName} ${stageIndex + 1}/${totalStages}`;

const formatChestChoiceLines = (choices = [], activeIndex = 0) =>
  choices.map((choice, index) => `${index === activeIndex ? ">" : " "} ${choice.label}`);

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
    this.exitConfirmActive = false;
    this.phaseBeforeExitConfirm = null;
    this.pausedTravelRemainingMs = null;
    this.travelSegmentStartedAt = 0;
    this.travelSegmentDurationMs = ADVENTURE_TRAVEL_SEGMENT_MS;
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
    this.exitConfirmActive = false;
    this.phaseBeforeExitConfirm = null;
    this.pausedTravelRemainingMs = null;
    this.travelSegmentStartedAt = 0;
    this.travelSegmentDurationMs = ADVENTURE_TRAVEL_SEGMENT_MS;
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
      this.destroyExitConfirmOverlay();
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
       color: ADVENTURE_MENU_TEXT,
      align: "center",
      // color: "#2f3e2e",
      // stroke: "#f4f7f0",
      // strokeThickness: 4
    }).setDepth(21);

    this.infoText = this.add.text(18, 40, "", {
      fontFamily: "Courier New",
      fontSize: "14px",
      color: "#44514b",
      stroke: "#f4f7f0",
      strokeThickness: 3,
      lineSpacing: 4
    }).setDepth(21);

    this.chestBackdrop = this.add.rectangle(0, 0, this.scale.width, this.scale.height, ADVENTURE_MENU_BACKGROUND, 1)
      .setOrigin(0)
      .setDepth(19)
      .setVisible(false);

    this.menuTitle = this.add.text(this.scale.width / 2, 92, "", {
      fontFamily: "Courier New",
      fontSize: "18px",
      color: ADVENTURE_MENU_TEXT,
      align: "center"
    }).setOrigin(0.5).setDepth(21).setVisible(false);
    this.menuBody = this.add.text(this.scale.width / 2, this.scale.height / 2 + 8, "", {
      fontFamily: "Courier New",
      fontSize: "16px",
      color: ADVENTURE_MENU_TEXT,
      align: "left",
      lineSpacing: 12
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

    this.exitConfirmBackdrop = this.add.rectangle(0, 0, this.scale.width, this.scale.height, ADVENTURE_MENU_BACKGROUND, 0.96)
      .setOrigin(0)
      .setDepth(30)
      .setVisible(false);
    this.exitConfirmTitle = this.add.text(this.scale.width / 2, this.scale.height * 0.42, "Exit adventure?", {
      fontFamily: "Courier New",
      fontSize: "22px",
      color: ADVENTURE_MENU_TEXT,
      align: "center"
    }).setOrigin(0.5).setDepth(31).setVisible(false);
    this.exitConfirmBody = this.add.text(this.scale.width / 2, this.scale.height * 0.52, "O confirm\nX continue", {
      fontFamily: "Courier New",
      fontSize: "16px",
      color: ADVENTURE_MENU_TEXT,
      align: "center",
      lineSpacing: 8
    }).setOrigin(0.5).setDepth(31).setVisible(false);

    this.refreshInfo();
  }

  clearTimers() {
    this.travelTimer?.remove(false);
    this.travelTimer = null;
    this.walkTimer?.remove(false);
    this.walkTimer = null;
    this.autoAdvanceTimer?.remove(false);
    this.autoAdvanceTimer = null;
    this.fightIntroExitTween?.stop();
    this.fightIntroExitTween = null;
    this.fightIntroJumpTween?.stop();
    this.fightIntroJumpTween = null;
  }

  getPetTexture(variant = "idle") {
    return getPetTextureKey({ petId: this.state.petId, stage: this.state.evolutionStage, variant });
  }

  refreshInfo() {
    this.infoText.setVisible(true);
    this.infoText.setText(`Stage ${this.stageIndex + 1}/${ADVENTURE_STAGE_CONFIGS.length}`);
  }

  beginTravel(nextEncounterType) {
    this.clearTimers();
    this.destroyEncounterSprite();
    this.destroyChestMenu();
    this.titleText.setText(this.stageConfig.name.toUpperCase());
    this.titleText.setPosition(18, 14).setOrigin(0);
    this.infoText.setVisible(true);
    this.phase = "travel";
    this.currentEncounterType = nextEncounterType;
    this.walkToggleAt = this.time.now + ADVENTURE_PET_TOGGLE_MS;
    this.scheduleTravelTimer(ADVENTURE_TRAVEL_SEGMENT_MS);

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
    sprite.flipX = true;
    // const label = this.add.text(0, 44, monster.name.toUpperCase(), {
    //   fontFamily: "Courier New",
    //   fontSize: "12px",
    //   color: "#44514b",
    //   align: "center"
    // }).setOrigin(0.5);
    // container.add([sprite, label]);
    container.add([sprite]);
    return container;
  }

  showToast(message, durationMs = 900) {
    console.log('TOAST:', message);
    // this.toastText.setText(message);
    // this.toastText.setAlpha(1);
    // this.tweens.add({
    //   targets: this.toastText,
    //   alpha: 0,
    //   duration: Math.max(200, durationMs),
    //   delay: 20
    // });
  }

  openTreasureChest() {
    if (this.isEnding || this.exitConfirmActive || this.phase !== "travel") {
      return;
    }
    this.phase = "chest";
    this.destroyEncounterSprite();
    this.chestChoices = pickUniqueOffers(3, this.rng);
    this.menuIndex = 0;
    this.titleText.setText(formatChestHeader(this.stageConfig.name, this.stageIndex, ADVENTURE_STAGE_CONFIGS.length));
    this.titleText.setPosition(this.scale.width / 2, 32).setOrigin(0.5);
    this.infoText.setVisible(false);
    this.chestBackdrop.setVisible(true);
    this.menuTitle.setVisible(true);
    this.menuBody.setVisible(true);
    this.menuTitle.setText("Treasure Found");
    this.refreshChestMenu();
    this.promptText.setText("Left / Right choose, O take.");
  }

  refreshChestMenu() {
    const lines = formatChestChoiceLines(this.chestChoices, this.menuIndex);
    this.menuBody.setText(lines.join("\n"));
  }

  destroyChestMenu() {
    this.chestBackdrop?.setVisible(false);
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

  destroyFightIntroSprite() {
    if (!this.fightIntroSprite) {
      return;
    }
    this.fightIntroSprite.destroy(true);
    this.fightIntroSprite = null;
  }

  destroySummaryOverlay() {
    this.summaryOverlay?.destroy?.(true);
    this.summaryOverlay = null;
  }

  openExitConfirm() {
    if (this.isEnding || this.exitConfirmActive) {
      return;
    }
    if (!["travel", "chest", "fight"].includes(this.phase)) {
      return;
    }

    this.phaseBeforeExitConfirm = this.phase;
    this.exitConfirmActive = true;
    this.phase = "confirm-exit";
    if (this.phaseBeforeExitConfirm === "travel") {
      this.pauseTravelTimerForConfirm();
    }
    this.exitConfirmBackdrop?.setVisible(true);
    this.exitConfirmTitle?.setVisible(true);
    this.exitConfirmBody?.setVisible(true);
    this.promptText?.setText("Confirm exit.");
  }

  closeExitConfirm() {
    if (!this.exitConfirmActive) {
      return;
    }
    this.exitConfirmActive = false;
    this.exitConfirmBackdrop?.setVisible(false);
    this.exitConfirmTitle?.setVisible(false);
    this.exitConfirmBody?.setVisible(false);
    this.phase = this.phaseBeforeExitConfirm || "travel";
    this.phaseBeforeExitConfirm = null;
    if (this.phase === "travel") {
      this.resumeTravelTimerAfterConfirm();
    }
    if (this.phase === "travel") {
      this.promptText?.setText("Traveling...");
    } else if (this.phase === "chest") {
      this.promptText?.setText("Left / Right choose, O take.");
    } else if (this.phase === "fight") {
      const monster = this.stageConfig.monsters[this.currentMonsterIndex];
      this.promptText?.setText(`${monster.name} want to fight.`);
    }
  }

  destroyExitConfirmOverlay() {
    this.exitConfirmBackdrop?.destroy?.(true);
    this.exitConfirmTitle?.destroy?.(true);
    this.exitConfirmBody?.destroy?.(true);
    this.exitConfirmBackdrop = null;
    this.exitConfirmTitle = null;
    this.exitConfirmBody = null;
    this.exitConfirmActive = false;
    this.phaseBeforeExitConfirm = null;
  }

  abortAdventure() {
    if (this.isEnding) {
      return;
    }
    this.isEnding = true;
    this.closeExitConfirm();
    this.clearTimers();
    this.destroyEncounterSprite();
    this.destroyFightIntroSprite();
    this.destroyChestMenu();
    this.stopAdventureChildScenes();
    this.uiScene?.onAdventureFlowComplete?.({
      success: false,
      aborted: true,
      stageId: this.stageConfig.id
    });
    this.scene.stop();
  }

  scheduleTravelTimer(delayMs) {
    const safeDelay = Math.max(1, Math.round(Number.isFinite(delayMs) ? delayMs : ADVENTURE_TRAVEL_SEGMENT_MS));
    this.travelSegmentStartedAt = this.time.now;
    this.travelSegmentDurationMs = safeDelay;
    this.pausedTravelRemainingMs = null;
    this.travelTimer = this.time.delayedCall(safeDelay, () => {
      this.travelTimer = null;
      if (this.isEnding || this.exitConfirmActive || this.phase !== "travel") {
        return;
      }
      if (this.currentEncounterType === "chest") {
        this.openTreasureChest();
      } else {
        this.startFightEncounter();
      }
    });
  }

  pauseTravelTimerForConfirm() {
    if (!this.travelTimer) {
      this.pausedTravelRemainingMs = ADVENTURE_TRAVEL_SEGMENT_MS;
      return;
    }
    const elapsed = Math.max(0, this.time.now - this.travelSegmentStartedAt);
    const remaining = Math.max(1, Math.round(this.travelSegmentDurationMs - elapsed));
    this.pausedTravelRemainingMs = remaining;
    this.travelTimer.remove(false);
    this.travelTimer = null;
  }

  resumeTravelTimerAfterConfirm() {
    if (this.travelTimer || this.phase !== "travel") {
      return;
    }
    const nextDelay = Math.max(1, Math.round(this.pausedTravelRemainingMs ?? ADVENTURE_TRAVEL_SEGMENT_MS));
    this.scheduleTravelTimer(nextDelay);
  }

  startFightEncounter() {
    if (this.isEnding || this.exitConfirmActive || this.phase !== "travel") {
      return;
    }
    const monster = this.stageConfig.monsters[this.currentMonsterIndex];
    if (!monster) {
      this.finishAdventureSuccess();
      return;
    }

    this.phase = "fight-intro";
    this.clearTimers();
    this.destroyEncounterSprite();
    this.destroyFightIntroSprite();
    this.destroyChestMenu();
    this.titleText.setText(this.stageConfig.name.toUpperCase());
    this.titleText.setPosition(18, 14).setOrigin(0);
    this.infoText.setVisible(true);
    this.promptText.setText(`${monster.name} want to fight.`);
    this.refreshInfo(`Facing ${monster.name}.`);

    this.playFightIntro(monster);
  }

  playFightIntro(monster) {
    if (this.isEnding || this.exitConfirmActive || this.phase !== "fight-intro") {
      return;
    }

    this.petSprite.setVisible(false);
    this.fightIntroSprite = this.buildMonsterSprite(monster);
    this.fightIntroSprite.setDepth(12);
    const centerX = this.scale.width * 0.5;
    const centerY = this.scale.height * 0.58;
    this.fightIntroSprite.setPosition(centerX, centerY);

    const jumpUpY = centerY - ADVENTURE_BATTLE_CONSTANTS.ENEMY_INTRO_JUMP_HEIGHT_PX;
    const singleJumpMs = ADVENTURE_BATTLE_CONSTANTS.ENEMY_INTRO_JUMP_DURATION_MS;
    const jumpCount = Math.max(1, ADVENTURE_BATTLE_CONSTANTS.ENEMY_INTRO_JUMP_COUNT);

    this.fightIntroJumpTween = this.tweens.add({
      targets: this.fightIntroSprite,
      y: jumpUpY,
      duration: singleJumpMs,
      ease: "Sine.easeOut",
      yoyo: true,
      repeat: jumpCount - 1,
      onComplete: () => {
        this.fightIntroJumpTween = null;
        this.startFightIntroExit(monster);
      }
    });
  }

  startFightIntroExit(monster) {
    if (!this.fightIntroSprite || this.isEnding || this.phase !== "fight-intro") {
      return;
    }
    const enemySprite = this.fightIntroSprite.getAt?.(0);
    if (enemySprite?.setFlipX) {
      enemySprite.setFlipX(false);
    } else if (enemySprite) {
      enemySprite.flipX = false;
    }

    const offscreenX = this.scale.width + ADVENTURE_BATTLE_CONSTANTS.ENEMY_INTRO_EXIT_OFFSCREEN_PADDING;
    const distance = Math.max(1, offscreenX - this.fightIntroSprite.x);
    const durationMs = Math.max(1, Math.round(distance / ADVENTURE_BATTLE_CONSTANTS.ENEMY_INTRO_EXIT_SPEED_PX_PER_MS));

    this.fightIntroExitTween = this.tweens.add({
      targets: this.fightIntroSprite,
      x: offscreenX,
      duration: durationMs,
      ease: "Linear",
      onComplete: () => {
        this.fightIntroExitTween = null;
        this.destroyFightIntroSprite();
        if (this.isEnding || this.exitConfirmActive || this.phase !== "fight-intro") {
          return;
        }
        this.petSprite.setVisible(true);
        this.phase = "fight";
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
    });
  }

  handleFightResolved(result) {
    if (this.isEnding) {
      return;
    }
    const monster = this.stageConfig.monsters[this.currentMonsterIndex];
    if (!result?.victory) {
      applyAdventureFailurePenalty(this.state, result);
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
    this.destroyFightIntroSprite();
    this.petSprite?.setVisible(true);
    this.destroyChestMenu();
    this.stopAdventureChildScenes();
    this.titleText.setText(this.stageConfig.name.toUpperCase());
    this.titleText.setPosition(18, 14).setOrigin(0);
    this.infoText.setVisible(true);
    this.promptText.setText("Adventure failed.");
    this.refreshInfo("Pet became sick.");
    this.uiScene?.onAdventureFlowComplete?.({
      success: false,
      stageId: this.stageConfig.id,
      stageName: this.stageConfig.name,
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
    this.destroyFightIntroSprite();
    this.petSprite?.setVisible(true);
    this.destroyChestMenu();
    this.titleText.setText(this.stageConfig.name.toUpperCase());
    this.titleText.setPosition(18, 14).setOrigin(0);
    this.infoText.setVisible(true);
    const grantedRewards = grantAdventureRewardBundle(this.state, this.stageConfig.reward);
    markAdventureStageCleared(this.state, this.stageConfig.id);
    saveState(this.state, "adventure:success");
    this.promptText.setText("Adventure cleared!");
    this.refreshInfo("Stage complete.");
    this.stopAdventureChildScenes();
    this.uiScene?.onAdventureFlowComplete?.({
      success: true,
      stageId: this.stageConfig.id,
      stageName: this.stageConfig.name,
      rewards: [...grantedRewards, ...this.collectedDrops]
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
    if (this.isEnding) {
      return;
    }

    if (this.exitConfirmActive) {
      if (button === "ok") {
        this.abortAdventure();
        return;
      }
      if (button === "cancel") {
        this.closeExitConfirm();
      }
      return;
    }

    if (button === "cancel" && ["travel", "chest", "fight"].includes(this.phase)) {
      this.openExitConfirm();
      return;
    }

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

      if (button === "ok") {
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
    if (this.exitConfirmActive) {
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
