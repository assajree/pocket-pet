import { saveState, tickState } from "../gameState.js";

const STAGE_TEXTURES = {
  Baby: "pet-baby",
  Child: "pet-child",
  Teen: "pet-teen",
  Adult: "pet-adult"
};

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
    this.elapsedAccumulator = 0;
    this.saveAccumulator = 0;
    this.menuVisible = false;
    this.idleTween = null;
    this.movementTween = null;
    this.jumpTween = null;
    this.nextMovementEvent = null;
  }

  create() {
    this.state = this.registry.get("petState");
    this.basePetX = this.scale.width / 2;
    this.basePetY = this.scale.height / 2 + 20;
    this.poopSpots = [];

    this.pet = this.add.image(this.basePetX, this.basePetY, STAGE_TEXTURES[this.state.evolutionStage]);
    this.pet.setDisplaySize(148, 148);
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
    this.sleepText.setVisible(false);

    this.poopSprites = this.add.group();

    this.scale.on("resize", this.handleResize, this);
    this.events.on("shutdown", () => {
      this.scale.off("resize", this.handleResize, this);
      this.idleTween?.stop();
      this.idleTween = null;
      this.stopMovementTweens();
      this.nextMovementEvent?.remove(false);
    });

    this.syncVisuals();
    this.updateIdleAnimation();
    this.queueNextMovement();
    this.events.emit("state-changed", this.state);
  }

  handleResize(gameSize) {
    const { width, height } = gameSize;
    this.basePetX = width / 2;
    this.basePetY = height / 2 + 20;
    this.pet.setPosition(this.basePetX, this.basePetY);
    this.sickIcon.setPosition(this.pet.x + 72, this.pet.y - 72);
    this.sleepText.setPosition(this.pet.x + 86, this.pet.y - 28);
    this.layoutPoop();
    this.queueNextMovement(true);
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
    const columns = 3;
    const row = Math.floor(index / columns);
    const column = index % columns;
    const startX = this.scale.width / 2 - 34;
    const x = startX + column * 34;
    const y = this.basePetY + 96 + row * 24;
    return { x, y };
  }

  syncVisuals() {
    const texture = STAGE_TEXTURES[this.state.evolutionStage];
    if (this.pet.texture.key !== texture) {
      this.pet.setTexture(texture);
      const size = this.state.evolutionStage === "Adult" ? 170 : this.state.evolutionStage === "Teen" ? 160 : 148;
      this.pet.setDisplaySize(size, size);
    }

    this.pet.setTint(this.state.isAlive ? (this.state.isSick ? 0x8c9890 : 0x44514b) : 0x7f8b85);
    this.pet.setAlpha(this.state.isAlive ? 1 : 0.55);
    this.sleepText.setVisible(this.state.isSleeping && this.state.isAlive);
    this.sickIcon.setVisible(this.state.isSick && this.state.isAlive);

    const currentCount = this.poopSprites.getLength();
    if (currentCount < this.state.poopCount) {
      for (let index = currentCount; index < this.state.poopCount; index += 1) {
        const poop = this.add.image(0, 0, "poop").setDisplaySize(28, 28);
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
    return this.state.isAlive && !this.state.isSleeping && !this.menuVisible;
  }

  stopMovementTweens() {
    this.movementTween?.stop();
    this.jumpTween?.stop();
    this.movementTween = null;
    this.jumpTween = null;
  }

  updateIdleAnimation() {
    const shouldIdle = this.canAnimatePet() && !this.jumpTween;

    if (!shouldIdle) {
      this.idleTween?.stop();
      this.idleTween = null;
      this.pet.setScale(1, 1);
      return;
    }

    if (this.idleTween) {
      return;
    }

    this.idleTween = this.tweens.add({
      targets: this.pet,
      scaleX: 1.03,
      scaleY: 0.97,
      duration: Phaser.Math.Between(420, 620),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
  }

  queueNextMovement(resetPosition = false) {
    this.nextMovementEvent?.remove(false);
    this.nextMovementEvent = null;

    if (resetPosition) {
      this.stopMovementTweens();
      this.pet.setPosition(this.basePetX, this.basePetY);
      this.layoutPoop();
    }

    if (!this.canAnimatePet()) {
      return;
    }

    const delay = Phaser.Math.Between(700, 1800);
    this.nextMovementEvent = this.time.delayedCall(delay, () => {
      this.performRandomMovement();
    });
  }

  performRandomMovement() {
    if (!this.canAnimatePet()) {
      this.pet.setPosition(this.basePetX, this.basePetY);
      this.layoutPoop();
      this.updateIdleAnimation();
      return;
    }

    this.stopMovementTweens();
    const roll = Math.random();

    if (roll < 0.25) {
      this.updateIdleAnimation();
      this.queueNextMovement();
      return;
    }

    if (roll < 0.65) {
      this.updateIdleAnimation();
      const moveOffset = Phaser.Math.Between(-48, 48);
      const targetX = Phaser.Math.Clamp(this.basePetX + moveOffset, 72, this.scale.width - 72);
      this.pet.setFlipX(targetX < this.pet.x);
      this.movementTween = this.tweens.add({
        targets: this.pet,
        x: targetX,
        duration: Phaser.Math.Between(500, 1100),
        ease: "Sine.easeInOut",
        onUpdate: () => {
          this.sickIcon.setPosition(this.pet.x + 72, this.pet.y - 72);
          this.sleepText.setPosition(this.pet.x + 86, this.pet.y - 28);
        },
        onComplete: () => {
          this.queueNextMovement();
        }
      });
      return;
    }

    this.updateIdleAnimation();
    const jumpHeight = Phaser.Math.Between(16, 30);
    this.jumpTween = this.tweens.add({
      targets: this.pet,
      y: this.basePetY - jumpHeight,
      duration: Phaser.Math.Between(180, 280),
      yoyo: true,
      ease: "Quad.easeOut",
      onUpdate: () => {
        this.sickIcon.setPosition(this.pet.x + 72, this.pet.y - 72);
        this.sleepText.setPosition(this.pet.x + 86, this.pet.y - 28);
      },
      onComplete: () => {
        this.jumpTween = null;
        this.pet.setY(this.basePetY);
        this.updateIdleAnimation();
        this.queueNextMovement();
      }
    });
  }

  setMenuVisible(isVisible) {
    this.menuVisible = isVisible;
    const petVisible = !isVisible;
    this.pet.setVisible(petVisible);
    this.sickIcon.setVisible(petVisible && this.state.isSick && this.state.isAlive);
    this.sleepText.setVisible(petVisible && this.state.isSleeping && this.state.isAlive);
    this.poopSprites.getChildren().forEach((sprite) => sprite.setVisible(petVisible));
    this.updateIdleAnimation();
    this.queueNextMovement(isVisible || !this.canAnimatePet());
  }

  update(_time, delta) {
    const deltaSeconds = delta / 1000;
    this.elapsedAccumulator += deltaSeconds;
    this.saveAccumulator += deltaSeconds;

    if (this.elapsedAccumulator >= 1) {
      tickState(this.state, this.elapsedAccumulator);
      this.elapsedAccumulator = 0;
      this.syncVisuals();
      this.updateIdleAnimation();
      if (!this.canAnimatePet()) {
        this.queueNextMovement(true);
      } else if (!this.movementTween && !this.jumpTween && !this.nextMovementEvent) {
        this.queueNextMovement();
      }
      this.events.emit("state-changed", this.state);
    }

    if (this.saveAccumulator >= 5) {
      saveState(this.state);
      this.saveAccumulator = 0;
    }
  }
}
