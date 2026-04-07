import { AUTO_SAVE_INTERVAL_SECONDS, saveState, tickState } from "../gameState.js";
import { createButtonAudio } from "./helpers/buttonAudio.js";

const STAGE_TEXTURES = {
  Egg: "pet-egg",
  Baby: "pet-baby",
  Child: "pet-child",
  Teen: "pet-teen",
  Adult: "pet-adult"
};
const PET_MOVE_BLOCK_SIZE = 16;
const PET_MOVE_BLOCK_RANGE = 1;
const PET_MOVE_STEP_FPS = 1;
const PET_JUMP_STEP_FPS = 2;
const PET_FRAME_MOVE_JUMP_CHANCE = 0.15;
const EGG_IDLE_DURATION_MS = 900;
const EGG_IDLE_SCALE_MIN = 0.94;
const EGG_IDLE_SCALE_MAX = 1.04;
const EVOLUTION_ANIMATION_DURATION_MS = 950;
const EVOLUTION_TEXT_Y_OFFSET = 96;
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
    this.previousEvolutionStage = null;
    this.evolutionTween = null;
    this.evolutionTextTween = null;
    this.audio = createButtonAudio();
  }

  create() {
    this.state = this.registry.get("petState");
    this.basePetX = this.scale.width / 2;
    this.basePetY = this.scale.height / 2 + 20;
    this.poopSpots = [];

    this.pet = this.add.image(this.basePetX, this.basePetY, STAGE_TEXTURES[this.state.evolutionStage]);
    this.pet.setDisplaySize(148, 148);
    this.pet.setScale(1);
    this.previousEvolutionStage = this.state.evolutionStage;

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
    this.sleepText.setVisible(false);

    this.evolutionText = this.add.text(this.basePetX, this.basePetY - EVOLUTION_TEXT_Y_OFFSET, "", {
      fontFamily: "Courier New",
      fontSize: "22px",
      color: "#44514b",
      stroke: "#f4f7f0",
      strokeThickness: 5,
      align: "center"
    });
    this.evolutionText.setOrigin(0.5);
    this.evolutionText.setVisible(false);

    this.poopSprites = this.add.group();

    this.scale.on("resize", this.handleResize, this);
    this.events.on("shutdown", () => {
      this.scale.off("resize", this.handleResize, this);
      this.idleTween?.stop();
      this.idleTween = null;
      this.evolutionTween?.stop();
      this.evolutionTween = null;
      this.evolutionTextTween?.stop();
      this.evolutionTextTween = null;
      this.stopMovementTweens();
    });

    this.syncVisuals();
    this.updateIdleAnimation();
    this.events.emit("state-changed", this.state);
  }

  handleResize(gameSize) {
    const { width, height } = gameSize;
    this.basePetX = width / 2;
    this.basePetY = height / 2 + 20;
    this.snapPetToGrid();
    this.sickIcon.setPosition(this.pet.x + 72, this.pet.y - 72);
    this.sleepText.setPosition(this.pet.x + 86, this.pet.y - 28);
    this.evolutionText.setPosition(this.basePetX, this.basePetY - EVOLUTION_TEXT_Y_OFFSET);
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

  getPetTextureKey() {
    if (!this.state.isAlive) {
      return "pet-dead";
    }

    if (this.evolutionTween) {
      return STAGE_TEXTURES[this.state.evolutionStage];
    }

    if (this.jumpTween) {
      return "pet-attack";
    }

    if (this.state.isSick) {
      return "pet-sick";
    }

    if (this.state.happiness < LOW_HAPPINESS_THRESHOLD) {
      return "pet-angy";
    }

    return STAGE_TEXTURES[this.state.evolutionStage];
  }

  syncVisuals() {
    const texture = this.getPetTextureKey();
    if (this.pet.texture.key !== texture) {
      this.pet.setTexture(texture);
      const size = this.state.evolutionStage === "Adult"
        ? 170
        : this.state.evolutionStage === "Teen"
          ? 160
          : this.state.evolutionStage === "Egg"
            ? 132
            : 148;
      this.pet.setDisplaySize(size, size);
    }

    this.pet.setTint(this.state.isAlive ? (this.state.isSick ? 0x8c9890 : 0x44514b) : 0x7f8b85);
    this.pet.setAlpha(this.state.isAlive ? 1 : 0.55);
    this.sleepText.setVisible(this.state.isSleeping && this.state.isAlive);
    this.sickIcon.setVisible(this.state.isSick && this.state.isAlive);

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
      && !this.evolutionTween
      && this.state.evolutionStage !== "Egg"
      && !this.state.isSleeping
      && !this.menuVisible;
  }

  canPlayEggIdle() {
    return this.state.isAlive && !this.evolutionTween && this.state.evolutionStage === "Egg" && !this.menuVisible;
  }

  stopMovementTweens() {
    this.movementTween?.stop();
    this.movementTween = null;
    this.jumpTween = null;
    this.jumpFramesRemaining = 0;
    this.pet?.setY(this.basePetY);
  }

  updateIdleAnimation() {
    if (this.evolutionTween) {
      return;
    }

    const shouldPlayEggIdle = this.canPlayEggIdle();
    if (shouldPlayEggIdle && this.idleTween) {
      return;
    }

    this.idleTween?.stop();
    this.idleTween = null;
    this.pet.setScale(1, 1);
    this.pet.setY(this.basePetY);

    if (!shouldPlayEggIdle) {
      return;
    }

    this.idleTween = this.tweens.add({
      targets: this.pet,
      scaleX: { from: EGG_IDLE_SCALE_MIN, to: EGG_IDLE_SCALE_MAX },
      scaleY: { from: EGG_IDLE_SCALE_MIN, to: EGG_IDLE_SCALE_MAX },
      duration: EGG_IDLE_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1
    });
  }

  playEvolutionAnimation(previousStage, nextStage) {
    this.idleTween?.stop();
    this.idleTween = null;
    this.stopMovementTweens();
    this.evolutionTween?.stop();
    this.evolutionTextTween?.stop();
    this.snapPetToGrid();
    this.syncVisuals();
    this.pet.setAlpha(1);
    this.pet.setScale(1, 1);
    this.pet.setTint(0x44514b);
    this.audio.playEvolutionCue(previousStage, nextStage);

    const bannerText = previousStage === "Egg" ? "HATCH!" : "EVOLVE!";
    this.evolutionText.setText(bannerText);
    this.evolutionText.setAlpha(0);
    this.evolutionText.setScale(0.7);
    this.evolutionText.setVisible(true);

    this.evolutionTextTween = this.tweens.add({
      targets: this.evolutionText,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: this.basePetY - EVOLUTION_TEXT_Y_OFFSET - 10,
      duration: EVOLUTION_ANIMATION_DURATION_MS / 2,
      ease: "Quad.easeOut",
      yoyo: true
    });

    this.evolutionTween = this.tweens.add({
      targets: this.pet,
      scaleX: { from: 0.82, to: 1.18 },
      scaleY: { from: 0.82, to: 1.18 },
      alpha: { from: 0.35, to: 1 },
      duration: EVOLUTION_ANIMATION_DURATION_MS / 3,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: 2,
      onYoyo: () => {
        this.pet.setTint(this.pet.tintTopLeft === 0x44514b ? 0xf4f7f0 : 0x44514b);
      },
      onRepeat: () => {
        this.pet.setTint(this.pet.tintTopLeft === 0x44514b ? 0xf4f7f0 : 0x44514b);
      },
      onComplete: () => {
        this.evolutionTween = null;
        this.pet.setAlpha(this.state.isAlive ? 1 : 0.55);
        this.syncVisuals();
        this.evolutionText.setVisible(false);
        this.evolutionText.setAlpha(0);
        this.evolutionText.setScale(1);
        this.evolutionText.setY(this.basePetY - EVOLUTION_TEXT_Y_OFFSET);
        this.evolutionTextTween = null;
        this.updateIdleAnimation();
        this.events.emit("state-changed", this.state);
      }
    });
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
      this.sickIcon.setPosition(this.pet.x + 72, this.pet.y - 72);
      this.sleepText.setPosition(this.pet.x + 86, this.pet.y - 28);
      return;
    }

    const jumpHeight = Phaser.Math.Between(PET_JUMP_HEIGHT_MIN, PET_JUMP_HEIGHT_MAX);
    this.jumpTween = { active: true };
    this.jumpFramesRemaining = PET_JUMP_HOLD_FRAMES;
    this.pet.setY(this.basePetY - jumpHeight);
    this.syncVisuals();
    this.sickIcon.setPosition(this.pet.x + 72, this.pet.y - 72);
    this.sleepText.setPosition(this.pet.x + 86, this.pet.y - 28);
  }

  setMenuVisible(isVisible) {
    this.menuVisible = isVisible;
    const petVisible = !isVisible;
    this.pet.setVisible(petVisible);
    this.sickIcon.setVisible(petVisible && this.state.isSick && this.state.isAlive);
    this.sleepText.setVisible(petVisible && this.state.isSleeping && this.state.isAlive);
    this.evolutionText.setVisible(petVisible && !!this.evolutionTween);
    this.poopSprites.getChildren().forEach((sprite) => sprite.setVisible(petVisible));
    this.updateIdleAnimation();
    if (isVisible || !this.canAnimatePet()) {
      this.stopMovementTweens();
      this.snapPetToGrid();
    }
  }

  update(_time, delta) {
    const deltaSeconds = delta / 1000;
    const moveStepInterval = 1000 / PET_MOVE_STEP_FPS;
    const jumpStepInterval = 1000 / PET_JUMP_STEP_FPS;
    this.elapsedAccumulator += deltaSeconds;
    this.saveAccumulator += deltaSeconds;
    this.moveStepAccumulator += delta;

    const wholeElapsedSeconds = Math.floor(this.elapsedAccumulator);
    if (wholeElapsedSeconds >= 1) {
      const previousStage = this.state.evolutionStage;
      tickState(this.state, wholeElapsedSeconds);
      this.elapsedAccumulator -= wholeElapsedSeconds;
      this.syncVisuals();
      if (previousStage !== this.state.evolutionStage) {
        this.playEvolutionAnimation(previousStage, this.state.evolutionStage);
      } else {
        this.updateIdleAnimation();
      }
      this.previousEvolutionStage = this.state.evolutionStage;
      this.events.emit("state-changed", this.state);
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
          this.sickIcon.setPosition(this.pet.x + 72, this.pet.y - 72);
          this.sleepText.setPosition(this.pet.x + 86, this.pet.y - 28);
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
