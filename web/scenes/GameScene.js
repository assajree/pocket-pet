import { AUTO_SAVE_INTERVAL_SECONDS, saveState, tickState } from "../gameState.js";
import { createButtonAudio } from "../helpers/buttonAudio.js";
import {
  ensurePetStageAssetsLoaded,
  getPetDisplaySize,
  getPetTextureKey,
  resolvePetId
} from "../helpers/petAssets.js";

const PET_MOVE_BLOCK_SIZE = 16;
const PET_MOVE_BLOCK_RANGE = 1;
const PET_MOVE_STEP_FPS = 1;
const PET_JUMP_STEP_FPS = 2;
const PET_FRAME_MOVE_JUMP_CHANCE = 0.15;
const EGG_IDLE_DURATION_MS = 900;
const EGG_IDLE_SCALE_MIN = 0.94;
const EGG_IDLE_SCALE_MAX = 1.04;
const SLEEP_IDLE_DURATION_MS = 1400;
const SLEEP_IDLE_SCALE_MIN = 0.98;
const SLEEP_IDLE_SCALE_MAX = 1.02;
const SLEEP_IDLE_BOB_OFFSET = 4;
const SLEEP_TEXT_TOP_MARGIN = 6;
const EVOLUTION_FLASH_DURATION_MS = 180;
const EVOLUTION_FADE_DURATION_MS = 240;
const EVOLUTION_MIN_DISPLAY_MS = 900;
const PET_JUMP_HEIGHT_MIN = 30;
const PET_JUMP_HEIGHT_MAX = 60;
const PET_JUMP_HOLD_FRAMES = 1;
const POOP_COLUMNS = 10;
const POOP_ROWS = 2;
const POOP_SIZE = 28;
const POOP_SIDE_PADDING = 14;
const POOP_TOP_OFFSET = 96;
const POOP_ROW_GAP = 24;
const LOW_HAPPINESS_THRESHOLD = 35;
const EVOLUTION_OVERLAY_TEXT = "EVOLUTION";
const POOP_SOUND_KEY = "poop-sfx";

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
    this.elapsedAccumulator = 0;
    this.saveAccumulator = 0;
    this.menuVisible = false;
    this.idleTween = null;
    this.movementTween = null;
    this.jumpTween = null;
    this.jumpFramesRemaining = 0;
    this.moveStepAccumulator = 0;
    this.jumpStepAccumulator = 0;
    this.transitionFlashTween = null;
    this.transitionTextTween = null;
    this.transitionPromise = null;
    this.isEvolutionTransitionActive = false;
    this.currentIdleMode = null;
    this.currentPetDisplaySize = null;
    this.audio = createButtonAudio();
  }

  create() {
    this.state = this.registry.get("petState");
    this.activePetId = resolvePetId(this.state.petId);
    this.activePetStage = this.state.evolutionStage;
    this.basePetX = this.scale.width / 2;
    this.basePetY = this.scale.height / 2 + 20;
    this.poopSpots = [];

    this.pet = this.add.image(
      this.basePetX,
      this.basePetY,
      this.getSafeInitialTextureKey()
    );
    this.applyPetDisplaySize(true);
    this.pet.setScale(1);

    this.sickIcon = this.add.text(this.pet.x + 72, this.pet.y - 72, "!", {
      fontFamily: "Courier New",
      fontSize: "30px",
      color: "#44514b",
      stroke: "#dce7d9",
      strokeThickness: 5
    });
    this.sickIcon.setVisible(false);

    this.sleepText = this.add.text(this.pet.x + 86, this.pet.y - 28, "Zz", {
      fontFamily: "Courier New",
      fontSize: "24px",
      color: "#44514b",
      stroke: "#dce7d9",
      strokeThickness: 4
    });
    this.sleepText.setOrigin(0.5, 1);
    this.sleepText.setVisible(false);

    this.evolutionBackdrop = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x44514b, 0);
    this.evolutionBackdrop.setOrigin(0);
    this.evolutionBackdrop.setDepth(50);
    this.evolutionBackdrop.setVisible(false);

    this.evolutionFlash = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xf4f7f0, 0);
    this.evolutionFlash.setOrigin(0);
    this.evolutionFlash.setDepth(51);
    this.evolutionFlash.setVisible(false);

    this.evolutionText = this.add.text(this.scale.width / 2, this.scale.height / 2, EVOLUTION_OVERLAY_TEXT, {
      fontFamily: "Courier New",
      fontSize: "30px",
      color: "#f4f7f0",
      stroke: "#44514b",
      strokeThickness: 6,
      align: "center"
    });
    this.evolutionText.setOrigin(0.5);
    this.evolutionText.setDepth(52);
    this.evolutionText.setVisible(false);

    this.poopSprites = this.add.group();

    this.scale.on("resize", this.handleResize, this);
    this.events.on("shutdown", () => {
      this.scale.off("resize", this.handleResize, this);
      this.idleTween?.stop();
      this.idleTween = null;
      this.currentIdleMode = null;
      this.transitionFlashTween?.stop();
      this.transitionFlashTween = null;
      this.transitionTextTween?.stop();
      this.transitionTextTween = null;
      this.stopMovementTweens();
    });

    this.syncVisuals();
    this.updateIdleAnimation();
    this.events.emit("state-changed", this.state);
  }

  playPoopSound(poopsCreated = 1) {
    if (poopsCreated <= 0) {
      return;
    }

    if (!this.sound || this.sound.lock || !this.cache.audio.exists(POOP_SOUND_KEY)) {
      return;
    }

    this.sound.play(POOP_SOUND_KEY);
  }

  getSafeInitialTextureKey() {
    const preferredTexture = getPetTextureKey({ petId: this.activePetId, stage: this.activePetStage, variant: "idle" });
    if (this.textures.exists(preferredTexture)) {
      return preferredTexture;
    }

    return "__MISSING";
  }

  handleResize(gameSize) {
    const { width, height } = gameSize;
    this.basePetX = width / 2;
    this.basePetY = height / 2 + 20;
    this.snapPetToGrid();
    this.updateOverlayPositions();
    this.evolutionBackdrop.setSize(width, height);
    this.evolutionFlash.setSize(width, height);
    this.evolutionText.setPosition(width / 2, height / 2);
    this.layoutPoop();
  }

  getSnappedPetX(targetX = this.basePetX) {
    const minX = 72;
    const maxX = this.scale.width - 72;
    const relativeX = targetX - this.basePetX;
    const snappedOffset = Math.round(relativeX / PET_MOVE_BLOCK_SIZE) * PET_MOVE_BLOCK_SIZE;
    return Phaser.Math.Clamp(this.basePetX + snappedOffset, minX, maxX);
  }

  snapPetToGrid(targetX = this.basePetX) {
    this.pet.setPosition(this.getSnappedPetX(targetX), this.basePetY);
  }

  layoutPoop() {
    const sprites = this.poopSprites.getChildren();
    sprites.forEach((sprite, index) => {
      const spot = this.poopSpots[index];
      if (!spot) {
        return;
      }
      sprite.setPosition(spot.x, spot.y);
    });
  }

  createPoopSpot(index) {
    const clampedIndex = index % (POOP_COLUMNS * POOP_ROWS);
    const row = Math.floor(clampedIndex / POOP_COLUMNS);
    const column = clampedIndex % POOP_COLUMNS;
    const availableWidth = Math.max(this.scale.width - POOP_SIDE_PADDING * 2 - POOP_SIZE, 0);
    const stepX = POOP_COLUMNS > 1 ? availableWidth / (POOP_COLUMNS - 1) : 0;
    const x = POOP_SIDE_PADDING + POOP_SIZE / 2 + column * stepX;
    const y = this.basePetY + POOP_TOP_OFFSET + row * POOP_ROW_GAP;
    return { x, y };
  }

  getDisplayedPetTextureKey() {
    const petId = this.activePetId;
    const stage = this.activePetStage;

    if (!this.state.isAlive) {
      return getPetTextureKey({ petId, stage, variant: "dead" });
    }

    if (this.jumpTween) {
      return getPetTextureKey({ petId, stage, variant: "attack" });
    }

    if (this.state.isSick) {
      return getPetTextureKey({ petId, stage, variant: "sick" });
    }

    if (this.state.happiness < LOW_HAPPINESS_THRESHOLD) {
      return getPetTextureKey({ petId, stage, variant: "angry" });
    }

    return getPetTextureKey({ petId, stage, variant: "idle" });
  }

  applyPetDisplaySize(force = false) {
    const size = getPetDisplaySize(this.activePetId, this.activePetStage);
    if (!force && this.currentPetDisplaySize === size) {
      return;
    }

    this.pet.setDisplaySize(size, size);
    this.currentPetDisplaySize = size;
  }

  updateSleepTextPosition() {
    const sleepTextY = this.pet.y - (this.pet.displayHeight / 2) - SLEEP_TEXT_TOP_MARGIN;
    this.sleepText.setPosition(this.pet.x, sleepTextY);
  }

  updateOverlayPositions() {
    this.sickIcon.setPosition(this.pet.x + 72, this.pet.y - 72);
    this.updateSleepTextPosition();
  }

  syncVisuals() {
    const texture = this.getDisplayedPetTextureKey();
    if (this.pet.texture.key !== texture && this.textures.exists(texture)) {
      this.pet.setTexture(texture);
    }

    this.applyPetDisplaySize();
    this.updateOverlayPositions();
    this.pet.setTint(this.state.isAlive ? (this.state.isSick ? 0x8c9890 : 0x44514b) : 0x7f8b85);
    this.pet.setAlpha(this.state.isAlive ? 1 : 0.55);
    this.sleepText.setVisible(this.state.isSleeping && this.state.isAlive && !this.menuVisible);
    this.sickIcon.setVisible(this.state.isSick && this.state.isAlive && !this.menuVisible);

    const currentCount = this.poopSprites.getLength();
    if (currentCount < this.state.poopCount) {
      for (let index = currentCount; index < this.state.poopCount; index += 1) {
        const poop = this.add.image(0, 0, "poop").setDisplaySize(POOP_SIZE, POOP_SIZE);
        this.poopSpots[index] = this.createPoopSpot(index);
        this.poopSprites.add(poop);
      }
    } else if (currentCount > this.state.poopCount) {
      const sprites = this.poopSprites.getChildren();
      for (let index = currentCount - 1; index >= this.state.poopCount; index -= 1) {
        const sprite = sprites[index];
        this.poopSprites.remove(sprite, true, true);
        this.poopSpots.pop();
      }
    }

    this.layoutPoop();
  }

  canAnimatePet() {
    return this.state.isAlive
      && !this.isEvolutionTransitionActive
      && this.activePetStage !== "egg"
      && !this.state.isSleeping
      && !this.menuVisible;
  }

  canPlayEggIdle() {
    return this.state.isAlive
      && !this.isEvolutionTransitionActive
      && this.activePetStage === "egg"
      && !this.menuVisible;
  }

  stopMovementTweens() {
    this.movementTween?.stop();
    this.movementTween = null;
    this.jumpTween = null;
    this.jumpFramesRemaining = 0;
    this.pet?.setY(this.basePetY);
    this.updateOverlayPositions();
  }

  updateIdleAnimation() {
    if (this.isEvolutionTransitionActive) {
      return;
    }

    const idleMode = this.canPlayEggIdle()
      ? "egg"
      : (this.state.isAlive && this.state.isSleeping && !this.menuVisible ? "sleep" : null);

    if (idleMode && this.idleTween && this.currentIdleMode === idleMode) {
      return;
    }

    this.idleTween?.stop();
    this.idleTween = null;
    this.currentIdleMode = null;
    this.pet.setScale(1, 1);
    this.pet.setY(this.basePetY);
    this.updateOverlayPositions();

    if (!idleMode) {
      return;
    }

    this.currentIdleMode = idleMode;

    if (idleMode === "egg") {
      this.idleTween = this.tweens.add({
        targets: this.pet,
        scaleX: { from: EGG_IDLE_SCALE_MIN, to: EGG_IDLE_SCALE_MAX },
        scaleY: { from: EGG_IDLE_SCALE_MIN, to: EGG_IDLE_SCALE_MAX },
        duration: EGG_IDLE_DURATION_MS,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1
      });
      return;
    }

    this.idleTween = this.tweens.add({
      targets: this.pet,
      scaleX: { from: SLEEP_IDLE_SCALE_MIN, to: SLEEP_IDLE_SCALE_MAX },
      scaleY: { from: SLEEP_IDLE_SCALE_MAX, to: SLEEP_IDLE_SCALE_MIN },
      y: { from: this.basePetY, to: this.basePetY + SLEEP_IDLE_BOB_OFFSET },
      duration: SLEEP_IDLE_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
      onUpdate: () => {
        this.updateOverlayPositions();
      }
    });
  }

  setEvolutionTransitionActive(isActive) {
    this.isEvolutionTransitionActive = isActive;
    this.events.emit("evolution-transition-changed", isActive);
    this.events.emit("evolution-animation-changed", isActive);
  }

  showEvolutionOverlay(text = EVOLUTION_OVERLAY_TEXT) {
    this.transitionFlashTween?.stop();
    this.transitionTextTween?.stop();
    this.evolutionBackdrop.setVisible(true);
    this.evolutionFlash.setVisible(true);
    this.evolutionText.setVisible(true);
    this.evolutionBackdrop.setAlpha(0.88);
    this.evolutionFlash.setAlpha(0.08);
    this.evolutionText.setText(text);
    this.evolutionText.setAlpha(1);
    this.evolutionText.setScale(0.88);

    this.transitionFlashTween = this.tweens.add({
      targets: this.evolutionFlash,
      alpha: { from: 0.08, to: 0.32 },
      duration: EVOLUTION_FLASH_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1
    });

    this.transitionTextTween = this.tweens.add({
      targets: this.evolutionText,
      scaleX: { from: 0.88, to: 1.02 },
      scaleY: { from: 0.88, to: 1.02 },
      duration: EVOLUTION_FLASH_DURATION_MS * 2,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1
    });
  }

  wait(ms) {
    return new Promise((resolve) => {
      this.time.delayedCall(ms, resolve);
    });
  }

  hideEvolutionOverlay() {
    return new Promise((resolve) => {
      this.transitionFlashTween?.stop();
      this.transitionTextTween?.stop();
      this.transitionFlashTween = null;
      this.transitionTextTween = null;

      this.tweens.add({
        targets: [this.evolutionBackdrop, this.evolutionFlash, this.evolutionText],
        alpha: 0,
        duration: EVOLUTION_FADE_DURATION_MS,
        ease: "Quad.easeOut",
        onComplete: () => {
          this.evolutionBackdrop.setVisible(false);
          this.evolutionFlash.setVisible(false);
          this.evolutionText.setVisible(false);
          this.evolutionText.setScale(1);
          resolve();
        }
      });
    });
  }

  async startPetSwapTransition({
    previousPetId = this.activePetId,
    previousStage = this.activePetStage,
    nextPetId = this.state.petId,
    nextStage = this.state.evolutionStage
  } = {}) {
    if (this.transitionPromise) {
      return this.transitionPromise;
    }

    this.transitionPromise = (async () => {
      const resolvedPreviousPetId = resolvePetId(previousPetId);
      const resolvedNextPetId = resolvePetId(nextPetId);
      const transitionStartedAt = Date.now();

      this.idleTween?.stop();
      this.idleTween = null;
      this.stopMovementTweens();
      this.snapPetToGrid();
      this.pet.setAlpha(1);
      this.pet.setScale(1, 1);
      this.pet.setTint(0x44514b);
      this.updateOverlayPositions();
      this.setEvolutionTransitionActive(true);
      this.showEvolutionOverlay();
      this.audio.playEvolutionCue(previousStage, nextStage);

      try {
        await ensurePetStageAssetsLoaded(this, resolvedNextPetId, nextStage);
        const remainingDelay = EVOLUTION_MIN_DISPLAY_MS - (Date.now() - transitionStartedAt);
        if (remainingDelay > 0) {
          await this.wait(remainingDelay);
        }

        this.activePetId = resolvedNextPetId;
        this.activePetStage = nextStage;
        this.syncVisuals();
      } catch (error) {
        console.warn("Pet asset swap failed.", error);
        this.state.petId = resolvedPreviousPetId;
        this.state.evolutionStage = previousStage;
        this.activePetId = resolvedPreviousPetId;
        this.activePetStage = previousStage;
        this.syncVisuals();
        saveState(this.state, "game:pet-swap-reverted");
      }

      await this.hideEvolutionOverlay();
      this.setEvolutionTransitionActive(false);
      this.updateIdleAnimation();
      this.events.emit("state-changed", this.state);
    })().finally(() => {
      this.transitionPromise = null;
    });

    return this.transitionPromise;
  }

  handlePetStateMutation({ previousPetId = this.activePetId, previousStage = this.activePetStage } = {}) {
    if (resolvePetId(previousPetId) !== resolvePetId(this.state.petId) || previousStage !== this.state.evolutionStage) {
      void this.startPetSwapTransition({
        previousPetId,
        previousStage,
        nextPetId: this.state.petId,
        nextStage: this.state.evolutionStage
      });
      return;
    }

    this.syncVisuals();
    this.updateIdleAnimation();
    this.events.emit("state-changed", this.state);
  }

  stepPetMovement() {
    if (!this.canAnimatePet()) {
      this.snapPetToGrid();
      this.layoutPoop();
      this.updateIdleAnimation();
      return;
    }

    this.stopMovementTweens();
    const roll = Math.random();

    if (roll >= PET_FRAME_MOVE_JUMP_CHANCE) {
      const blockStep = Phaser.Math.Between(-PET_MOVE_BLOCK_RANGE, PET_MOVE_BLOCK_RANGE);
      const fallbackStep = blockStep === 0 ? 1 : blockStep;
      const targetX = this.getSnappedPetX(this.pet.x + fallbackStep * PET_MOVE_BLOCK_SIZE);
      this.pet.setFlipX(targetX < this.pet.x);
      this.snapPetToGrid(targetX);
      this.updateOverlayPositions();
      return;
    }

    const jumpHeight = Phaser.Math.Between(PET_JUMP_HEIGHT_MIN, PET_JUMP_HEIGHT_MAX);
    this.jumpTween = { active: true };
    this.jumpFramesRemaining = PET_JUMP_HOLD_FRAMES;
    this.pet.setY(this.basePetY - jumpHeight);
    this.syncVisuals();
    this.updateOverlayPositions();
  }

  setMenuVisible(isVisible) {
    this.menuVisible = isVisible;
    const petVisible = !isVisible;
    this.pet.setVisible(petVisible);
    this.sickIcon.setVisible(petVisible && this.state.isSick && this.state.isAlive);
    this.sleepText.setVisible(petVisible && this.state.isSleeping && this.state.isAlive);
    this.poopSprites.getChildren().forEach((sprite) => sprite.setVisible(petVisible));
    this.updateIdleAnimation();
    if (isVisible || !this.canAnimatePet()) {
      this.stopMovementTweens();
      this.snapPetToGrid();
    }
  }

  update(_time, delta) {
    if (this.isEvolutionTransitionActive) {
      return;
    }

    const deltaSeconds = delta / 1000;
    const moveStepInterval = 1000 / PET_MOVE_STEP_FPS;
    const jumpStepInterval = 1000 / PET_JUMP_STEP_FPS;
    this.elapsedAccumulator += deltaSeconds;
    this.saveAccumulator += deltaSeconds;
    this.moveStepAccumulator += delta;

    const wholeElapsedSeconds = Math.floor(this.elapsedAccumulator);
    if (wholeElapsedSeconds >= 1) {
      const previousPetId = this.state.petId;
      const previousStage = this.state.evolutionStage;
      const previousPoopCount = this.state.poopCount;
      tickState(this.state, wholeElapsedSeconds);
      const poopsCreated = Math.max(0, this.state.poopCount - previousPoopCount);
      this.elapsedAccumulator -= wholeElapsedSeconds;
      this.playPoopSound(poopsCreated);
      this.handlePetStateMutation({ previousPetId, previousStage });
    }

    if (this.jumpTween) {
      this.jumpStepAccumulator += delta;
      while (this.jumpStepAccumulator >= jumpStepInterval && this.jumpTween) {
        this.jumpFramesRemaining -= 1;
        this.jumpStepAccumulator -= jumpStepInterval;
        if (this.jumpFramesRemaining <= 0) {
          this.jumpTween = null;
          this.pet.setY(this.basePetY);
          this.syncVisuals();
          this.updateOverlayPositions();
        }
      }
    } else {
      this.jumpStepAccumulator = 0;
    }

    while (this.moveStepAccumulator >= moveStepInterval) {
      this.moveStepAccumulator -= moveStepInterval;
      if (this.canAnimatePet() && !this.jumpTween) {
        this.stepPetMovement();
      }
    }

    if (this.saveAccumulator >= AUTO_SAVE_INTERVAL_SECONDS) {
      saveState(this.state, "game:auto-save");
      this.saveAccumulator = 0;
    }
  }
}
