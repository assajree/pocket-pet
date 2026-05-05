import { getItemLabel, saveState } from "../gameState.js";
import { getPetCombatElements, getPetTextureKey, getPetBattleBulletTextureKey, ensurePetStageAssetsLoaded } from "../helpers/petAssets.js";
import {
  ADVENTURE_BATTLE_CONSTANTS,
  calculateBattleDamage,
  createBattleSeededRng,
  getBattleAttackIntervalMs,
  getBattleAttackStat,
  getBattleCriticalChance,
  getBattleCriticalMultiplier,
  getBattleDefenseStat,
  getBattleDodgeChance,
  getBattleElementMultiplier,
  getBattleLevelBonus,
  getBattleRegenAmount,
  getBattleStageBonus,
  getBattleBulletScale
} from "../helpers/adventureBattle.js";
import { UI_COLORS } from "../helpers/uiConfig.js";

const BATTLE_LANE_Y_RATIOS = [0.58, 0.66, 0.74];
const BATTLE_PLAYER_Y = 0.72;
const BATTLE_ENEMY_ANCHOR_X_RATIO = 1;
const BATTLE_PLAYER_X_RATIO = 0.20;
const BATTLE_TARGET_PADDING_PX = 0;
const BATTLE_HIT_TEXT_OFFSET_Y = 54;
const BATTLE_HIT_TEXT_RISE_PX = 34;
const BATTLE_HIT_TEXT_DURATION_MS = 720;
const BATTLE_HIT_SPRITE_KEY = "battle-hit";
const BATTLE_HIT_SPRITE_URL = "./assets/battle/hit.svg";
const BATTLE_HIT_SPRITE_SIZE = 54;
const BATTLE_HIT_SPRITE_DURATION_MS = 260;
const RESULT_WIN_JUMP_COUNT = 3;
const RESULT_WIN_JUMP_HEIGHT_PX = 34;
const RESULT_WIN_JUMP_DURATION_MS = 220;
const RESULT_LOSS_FLIP_COUNT = 6;
const RESULT_LOSS_FLIP_DURATION_MS = 160;
const PLAYER_DODGE_FLIP_DURATION_MS = 220;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const getStatValue = (source, key) => Math.max(0, Math.round(Number.isFinite(source?.[key]) ? source[key] : 0));
const formatDropPreviewLine = (drop) => {
  const itemId = String(drop?.itemId || "").trim();
  if (!itemId) {
    return "";
  }

  const qty = Math.max(1, Math.round(drop?.qty ?? 1));
  return `FOUND \n${getItemLabel(itemId)} x${qty}`;
};

const ensureBattleHitSpriteLoaded = (scene) => new Promise((resolve, reject) => {
  if (scene.textures.exists(BATTLE_HIT_SPRITE_KEY)) {
    resolve();
    return;
  }

  const handleFileError = (file) => {
    if (file?.key === BATTLE_HIT_SPRITE_KEY) {
      cleanup();
      reject(new Error("Failed to load battle hit sprite."));
    }
  };
  const cleanup = () => {
    scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, handleFileError);
    scene.load.off(Phaser.Loader.Events.COMPLETE, handleComplete);
  };
  const handleComplete = () => {
    cleanup();
    resolve();
  };

  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, handleFileError);
  scene.load.once(Phaser.Loader.Events.COMPLETE, handleComplete);
  scene.load.image(BATTLE_HIT_SPRITE_KEY, BATTLE_HIT_SPRITE_URL);
  scene.load.start();
});

const buildResolvedStats = ({ baseStats, levelBonus, stageBonus, buffs = {} }) => {
  const effectiveBuffs = {
    str: getStatValue(buffs, "str"),
    agi: getStatValue(buffs, "agi"),
    vit: getStatValue(buffs, "vit"),
    dex: getStatValue(buffs, "dex"),
    luck: getStatValue(buffs, "luck")
  };

  return {
    str: getBattleAttackStat(baseStats.str, { levelBonus, stageBonus, buff: effectiveBuffs.str }),
    agi: Math.max(0, Math.round(getStatValue(baseStats, "agi") + effectiveBuffs.agi)),
    vit: getBattleDefenseStat(baseStats.vit, { levelBonus, stageBonus, buff: effectiveBuffs.vit }),
    dex: Math.max(0, Math.round(getStatValue(baseStats, "dex") + effectiveBuffs.dex)),
    luck: Math.max(0, Math.round(getStatValue(baseStats, "luck") + effectiveBuffs.luck))
  };
};

export default class FightScene extends Phaser.Scene {
  constructor() {
    super("FightScene");
    this.activeBullets = [];
    this.autoCloseSummary = true;
    this.summaryVisible = false;
    this.resultResolved = false;
    this.battleStarted = false;
    this.battleStopped = false;
    this.resultAnimationStarted = false;
    this.resultAnimationTween = null;
    this.playerDodgeTween = null;
  }

  async create(data = {}) {
    this.state = this.registry.get("petState");
    this.stageId = data.stageId || "";
    this.stageIndex = Number.isFinite(data.stageIndex) ? data.stageIndex : 0;
    this.monster = data.monster || null;
    this.dropPreview = data.dropPreview || null;
    this.runBuffs = data.runBuffs || {};
    this.autoCloseSummary = data.autoCloseSummary !== false;
    this.summaryDurationMs = Number.isFinite(data.summaryDurationMs) ? data.summaryDurationMs : ADVENTURE_BATTLE_CONSTANTS.SUMMARY_DURATION_MS;
    this.seed = data.seed || `${this.stageId}:${Date.now()}`;
    this.rng = createBattleSeededRng(this.seed);
    this.uiScene = this.scene.get("UIScene");
    this.adventureScene = this.scene.get("AdventureScene");
    this.playerCombatElements = getPetCombatElements(this.state);
    this.monsterCombatElement = this.monster?.element || "neutral";
    this.playerStageBonus = getBattleStageBonus(this.stageIndex);
    this.enemyStageBonus = getBattleStageBonus(this.stageIndex);
    this.playerLevelBonus = getBattleLevelBonus(this.state.evolutionStage);
    this.enemyLevelBonus = this.stageIndex + 1;

    this.loadingText = this.add.text(this.scale.width / 2, this.scale.height / 2, "Preparing battle...", {
      fontFamily: "Courier New",
      fontSize: "24px",
      color: UI_COLORS.screenInkStrong.hex,
      stroke: UI_COLORS.screenHighlight.hex,
      strokeThickness: 4
    }).setOrigin(0.5);

    try {
      await Promise.all([
        ensurePetStageAssetsLoaded(this, this.state.petId, this.state.evolutionStage),
        ensurePetStageAssetsLoaded(this, this.monster?.species || this.state.petId, "adult"),
        ensureBattleHitSpriteLoaded(this)
      ]);
      if (!this.scene.isActive()) {
        return;
      }
      this.loadingText?.destroy();
      this.buildScene();
      this.startIntro();
    } catch (error) {
      console.warn("Failed to prepare fight scene.", error);
      this.loadingText?.setText("Battle assets failed to load.");
      this.loadingText?.setColor(UI_COLORS.dangerText.hex);
    }

    this.events.on("shutdown", () => {
      this.clearTimers();
      this.destroyBullets();
    });
  }

  buildScene() {
    this.cameras.main.setBackgroundColor(UI_COLORS.battleSky.hex);
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, UI_COLORS.battleBackground.value).setOrigin(0);
    this.add.rectangle(0, this.scale.height * 0.78, this.scale.width, this.scale.height * 0.22, UI_COLORS.battleGround.value).setOrigin(0);
    this.add.rectangle(0, this.scale.height * 0.84, this.scale.width, 8, UI_COLORS.battleGroundLine.value).setOrigin(0);

    BATTLE_LANE_Y_RATIOS.forEach((ratio, index) => {
      const laneY = this.scale.height * ratio;
      this.add.line(0, laneY, 0, laneY, this.scale.width, laneY, UI_COLORS.battleLane.value, 0.55).setOrigin(0);
      this.add.text(14, laneY - 16, `${index + 1}`, {
        fontFamily: "Courier New",
        fontSize: "12px",
        color: UI_COLORS.screenInkSoft.hex
      });
    });

    this.playerX = this.scale.width * BATTLE_PLAYER_X_RATIO;
    this.playerY = this.scale.height * BATTLE_PLAYER_Y;
    this.enemyAnchorX = this.scale.width * BATTLE_ENEMY_ANCHOR_X_RATIO;

    this.playerSprite = this.add.image(this.playerX, this.playerY, getPetTextureKey({
      petId: this.state.petId,
      stage: this.state.evolutionStage,
      variant: "idle"
    })).setDepth(10);
    this.playerSprite.setDisplaySize(150, 150);

    // this.headerText = this.add.text(18, 14, `${this.monster?.name || "ENEMY"}`.toUpperCase(), {
    //   fontFamily: "Courier New",
    //   fontSize: "20px",
    //   color: "#2f3e2e",
    //   stroke: "#f4f7f0",
    //   strokeThickness: 4
    // });

    this.timerText = this.add.text(this.scale.width / 2, 16, "", {
      fontFamily: "Courier New",
      fontSize: "18px",
      color: UI_COLORS.screenInkStrong.hex,
      stroke: UI_COLORS.screenHighlight.hex,
      strokeThickness: 4
    }).setOrigin(0.5, 0);

    const hpHudTextStyle = {
      fontFamily: "Courier New",
      fontSize: "14px",
      color: UI_COLORS.screenInk.hex,
      stroke: UI_COLORS.screenHighlight.hex,
      strokeThickness: 3,
      lineSpacing: 4
    };

    this.playerHpText = this.add.text(18, 44, "", hpHudTextStyle).setOrigin(0, 0);
    this.enemyHpText = this.add.text(this.scale.width - 18, 44, "", {
      ...hpHudTextStyle,
      align: "right"
    }).setOrigin(1, 0);

    this.resultBanner = this.add.text(this.scale.width / 2, this.scale.height / 2 - 30, "", {
      fontFamily: "Courier New",
      fontSize: "34px",
      color: UI_COLORS.screenInkStrong.hex,
      stroke: UI_COLORS.screenHighlight.hex,
      strokeThickness: 6
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    this.summaryBackdrop = this.add.rectangle(0, 0, this.scale.width, this.scale.height, UI_COLORS.screenBackground.value, 1)
      .setOrigin(0)
      .setDepth(30)
      .setVisible(false);

    this.summaryText = this.add.text(this.scale.width / 2, this.scale.height / 2 - 40 , "", {
      fontFamily: "Courier New",
      fontSize: "24px",
      color: UI_COLORS.screenInkStrong.hex,
      align: "center",
      lineSpacing: 10,
      // stroke: "#f4f7f0",
      // strokeThickness: 4
    }).setOrigin(0.5).setDepth(31).setAlpha(0);

    this.summaryDropText = this.add.text(this.scale.width / 2, this.scale.height / 2 , "", {
      fontFamily: "Courier New",
      fontSize: "16px",
      color: UI_COLORS.screenInk.hex,
      align: "center"
    }).setOrigin(0.5).setDepth(31).setAlpha(0);

    // this.hintText = this.add.text(this.scale.width / 2, this.scale.height - 18, "Battle starts now. Trade shots and survive.", {
    //   fontFamily: "Courier New",
    //   fontSize: "14px",
    //   color: "#44514b"
    // }).setOrigin(0.5, 1).setDepth(32);

    const basePlayerStats = {
      str: getStatValue(this.state, "str"),
      agi: getStatValue(this.state, "agi"),
      vit: getStatValue(this.state, "vit"),
      dex: getStatValue(this.state, "dex"),
      luck: getStatValue(this.state, "luck")
    };
    const baseMonsterStats = {
      str: getStatValue(this.monster?.stats, "str"),
      agi: getStatValue(this.monster?.stats, "agi"),
      vit: getStatValue(this.monster?.stats, "vit"),
      dex: getStatValue(this.monster?.stats, "dex"),
      luck: getStatValue(this.monster?.stats, "luck")
    };

    this.playerStats = buildResolvedStats({
      baseStats: basePlayerStats,
    levelBonus: this.playerLevelBonus,
    stageBonus: this.playerStageBonus,
    buffs: this.runBuffs
  });
  this.enemyStats = buildResolvedStats({
    baseStats: baseMonsterStats,
    levelBonus: this.enemyLevelBonus,
    stageBonus: this.enemyStageBonus,
    buffs: this.monster?.buffs || {}
  });
    this.playerMaxHp = 100;
    this.enemyMaxHp = Math.max(18, Math.round(28 + this.enemyStats.vit * 4 + this.enemyStats.str * 1.5));
    this.playerHp = Math.max(1, Math.round(this.state.health));
    this.enemyHp = this.enemyMaxHp;

    this.playerAttackIntervalMs = getBattleAttackIntervalMs(this.playerStats.agi);
    this.enemyAttackIntervalMs = getBattleAttackIntervalMs(this.enemyStats.agi);
    this.playerNextShotAt = 0;
    this.enemyNextShotAt = 0;
    this.regenNextAt = 0;
    this.battleEndsAt = 0;
    this.playerDamage = 0;
    this.enemyDamage = 0;
    this.playerAttackCount = 0;
    this.enemyAttackCount = 0;
    this.playerCriticalCount = 0;
    this.enemyCriticalCount = 0;
    this.playerDodgeCount = 0;
    this.enemyDodgeCount = 0;
    this.battleStarted = false;
    this.battleStopped = false;
    this.summaryVisible = false;
    this.resultResolved = false;
    this.resultAnimationStarted = false;
    this.resultAnimationTween = null;
    this.playerDodgeTween = null;
  }

  clearTimers() {
    this.introTimer?.remove(false);
    this.introTimer = null;
    this.resultTimer?.remove(false);
    this.resultTimer = null;
    this.summaryTimer?.remove(false);
    this.summaryTimer = null;
    this.summaryAutoCloseTimer?.remove(false);
    this.summaryAutoCloseTimer = null;
    this.playerRevertTimer?.remove(false);
    this.playerRevertTimer = null;
    this.resultAnimationTween?.stop?.();
    this.resultAnimationTween = null;
    this.playerDodgeTween?.stop?.();
    this.playerDodgeTween = null;
  }

  startIntro() {
    this.introTimer = this.time.delayedCall(ADVENTURE_BATTLE_CONSTANTS.ENEMY_INTRO_MOVE_MS, () => {
      this.introTimer = null;
      this.beginBattle();
    });
  }

  beginBattle() {
    this.battleStarted = true;
    this.battleEndsAt = this.time.now + ADVENTURE_BATTLE_CONSTANTS.BATTLE_TIME_LIMIT_MS;
    this.playerNextShotAt = this.time.now + this.playerAttackIntervalMs;
    this.enemyNextShotAt = this.time.now + this.enemyAttackIntervalMs;
    this.regenNextAt = this.time.now + ADVENTURE_BATTLE_CONSTANTS.BATTLE_REGEN_INTERVAL_MS;
    this.resultBanner.setText("FIGHT!");
    this.resultBanner.setAlpha(1);
    this.summaryText.setAlpha(0);
    // this.hintText.setText("O button summary | timer 30s");
    this.flashResultBanner("FIGHT!", 800, UI_COLORS.screenInkStrong.value);
  }

  flashResultBanner(text, durationMs, color) {
    this.resultBanner.setText(text);
    this.resultBanner.setColor(color ? `#${color.toString(16).padStart(6, "0")}` : UI_COLORS.screenInkStrong.hex);
    this.resultBanner.setAlpha(1);
    this.resultTimer?.remove(false);
    this.resultTimer = this.time.delayedCall(durationMs, () => {
      this.resultBanner.setAlpha(0);
    });
  }

  update(time, delta) {
    if (!this.battleStarted || this.summaryVisible) {
      return;
    }

    if (!this.battleStopped) {
      if (time >= this.battleEndsAt || this.playerHp <= 0 || this.enemyHp <= 0) {
        this.stopBattle();
      }

      if (time >= this.regenNextAt) {
        this.regenNextAt = time + ADVENTURE_BATTLE_CONSTANTS.BATTLE_REGEN_INTERVAL_MS;
        const regenAmount = getBattleRegenAmount(this.playerStats.vit);
        const previousPlayerHp = this.playerHp;
        this.playerHp = Math.min(this.playerMaxHp, this.playerHp + regenAmount);
        const restored = Math.max(0, Math.round(this.playerHp - previousPlayerHp));
        if (restored > 0) {
          this.showRegenText(restored);
        }
        this.state.health = Math.min(100, Math.round(this.playerHp));
        saveState(this.state, "fight:regen");
      }

      if (!this.battleStopped) {
        if (time >= this.playerNextShotAt) {
          this.playerNextShotAt = time + this.playerAttackIntervalMs;
          this.spawnBullet("player");
        }

        if (time >= this.enemyNextShotAt) {
          this.enemyNextShotAt = time + this.enemyAttackIntervalMs;
          this.spawnBullet("enemy");
        }
      }
    }

    this.updateBullets(delta);
    this.updateHud();
    this.checkForResolution(time);
  }

  updateHud() {
    const remainingSeconds = Math.max(0, Math.ceil((this.battleEndsAt - this.time.now) / 1000));
    this.timerText.setText(`TIME ${remainingSeconds}`);
    // this.playerHpText.setText(`PLAYER \nHP ${Math.max(0, Math.round(this.playerHp))}/${this.playerMaxHp}`);
    this.playerHpText.setText(`PLAYER\nHP ${Math.max(0, Math.round(this.playerHp))}`);
    this.enemyHpText.setText(`ENEMY\nHP ${Math.max(0, Math.round(this.enemyHp))}`);
  }

  spawnBullet(side) {
    const isPlayer = side === "player";
    const shooterStats = isPlayer ? this.playerStats : this.enemyStats;
    const defenderStats = isPlayer ? this.enemyStats : this.playerStats;
    const shooterElement = isPlayer ? this.playerCombatElements.attackElement : this.monsterCombatElement;
    const defenderElement = isPlayer ? this.monsterCombatElement : this.playerCombatElements.defenseElement;
    const laneIndex = Math.floor(this.rng() * BATTLE_LANE_Y_RATIOS.length);
    const laneY = this.scale.height * BATTLE_LANE_Y_RATIOS[laneIndex];
    const criticalChance = getBattleCriticalChance({
      dex: shooterStats.dex,
      luck: shooterStats.luck,
      enemyLuck: defenderStats.luck
    });
    const dodgeChance = getBattleDodgeChance({
      dex: defenderStats.dex,
      luck: defenderStats.luck,
      enemyAgi: shooterStats.agi,
      enemyLuck: shooterStats.luck
    });
    const isCritical = this.rng() < criticalChance;
    const criticalMultiplier = getBattleCriticalMultiplier(shooterStats.luck);
    const attackMultiplier = getBattleElementMultiplier(shooterElement, defenderElement);
    const bulletPower = Math.max(1, Math.round(shooterStats.str));
    const defenseStat = Math.max(0, Math.round(defenderStats.vit));
    const bulletDamage = calculateBattleDamage({
      attack: bulletPower,
      defense: defenseStat,
      elementMultiplier: attackMultiplier,
      isCritical,
      criticalMultiplier
    });
    const bulletScale = getBattleBulletScale(bulletPower);
    const bulletTexture = isPlayer
      ? getPetBattleBulletTextureKey({ petId: this.state.petId, stage: this.state.evolutionStage })
      : getPetBattleBulletTextureKey({ petId: this.monster?.species || this.state.petId, stage: "adult" });
    const x = isPlayer ? this.playerSprite.x + this.playerSprite.displayWidth * 0.25 : this.enemyAnchorX;
    const direction = isPlayer ? 1 : -1;
    const sprite = this.add.image(x, laneY, bulletTexture).setDepth(12);
    sprite.setDisplaySize(32 * bulletScale, 32 * bulletScale);
    sprite.setFlipX(!isPlayer);

    this.activeBullets.push({
      side,
      laneIndex,
      sprite,
      power: bulletPower,
      attackStat: bulletPower,
      defenseStat,
      damage: bulletDamage,
      dodgeChance,
      isCritical,
      criticalMultiplier,
      attackMultiplier,
      direction,
      speedPxPerMs: (this.scale.width + ADVENTURE_BATTLE_CONSTANTS.BULLET_OFFSCREEN_PADDING) / ADVENTURE_BATTLE_CONSTANTS.BULLET_TRAVEL_MS
    });

    if (isPlayer) {
      this.playerAttackCount += 1;
      this.playerSprite.setTexture(getPetTextureKey({ petId: this.state.petId, stage: this.state.evolutionStage, variant: "angry" }));
      this.playerRevertTimer?.remove(false);
      this.playerRevertTimer = this.time.delayedCall(ADVENTURE_BATTLE_CONSTANTS.ATTACK_IDLE_RETURN_MS, () => {
        this.playerSprite.setTexture(getPetTextureKey({ petId: this.state.petId, stage: this.state.evolutionStage, variant: "idle" }));
      });
    } else {
      this.enemyAttackCount += 1;
    }
  }

  updateBullets(delta) {
    const playerBullets = [];
    const enemyBullets = [];

    this.activeBullets.forEach((bullet) => {
      if (!bullet?.sprite || !bullet.sprite.active) {
        return;
      }

      bullet.sprite.x += bullet.direction * bullet.speedPxPerMs * delta;
      if (bullet.side === "player") {
        playerBullets.push(bullet);
      } else {
        enemyBullets.push(bullet);
      }
    });

    this.resolveBulletCollisions(playerBullets, enemyBullets);

    this.activeBullets = this.activeBullets.filter((bullet) => {
      if (!bullet?.sprite || !bullet.sprite.active) {
        return false;
      }

      const offscreenX = -ADVENTURE_BATTLE_CONSTANTS.BULLET_OFFSCREEN_PADDING;
      const maxX = this.scale.width + ADVENTURE_BATTLE_CONSTANTS.BULLET_OFFSCREEN_PADDING;
      const isOffscreen = bullet.sprite.x < offscreenX || bullet.sprite.x > maxX;
      const targetHit = bullet.side === "player"
        ? bullet.sprite.x >= this.enemyAnchorX - BATTLE_TARGET_PADDING_PX
        : bullet.sprite.x <= this.playerSprite.x + this.playerSprite.displayWidth * 0.25;

      if (isOffscreen) {
        bullet.sprite.destroy();
        return false;
      }

      if (targetHit) {
        this.resolveBulletHit(bullet);
        return false;
      }

      return true;
    });
  }

  resolveBulletCollisions(playerBullets, enemyBullets) {
    for (const playerBullet of playerBullets) {
      if (!playerBullet.sprite.active) {
        continue;
      }

      for (const enemyBullet of enemyBullets) {
        if (!enemyBullet.sprite.active || playerBullet.laneIndex !== enemyBullet.laneIndex) {
          continue;
        }

        const playerHalf = playerBullet.sprite.displayWidth / 2;
        const enemyHalf = enemyBullet.sprite.displayWidth / 2;
        const overlap = Math.abs(playerBullet.sprite.x - enemyBullet.sprite.x) <= playerHalf + enemyHalf;
        if (!overlap) {
          continue;
        }

        this.showHitSprite((playerBullet.sprite.x + enemyBullet.sprite.x) / 2, playerBullet.sprite.y);

        if (playerBullet.damage === enemyBullet.damage) {
          playerBullet.sprite.destroy();
          enemyBullet.sprite.destroy();
          playerBullet.damage = 0;
          enemyBullet.damage = 0;
        } else if (playerBullet.damage > enemyBullet.damage) {
          playerBullet.damage = Math.max(1, playerBullet.damage - enemyBullet.damage);
          enemyBullet.sprite.destroy();
          enemyBullet.damage = 0;
        } else {
          enemyBullet.damage = Math.max(1, enemyBullet.damage - playerBullet.damage);
          playerBullet.sprite.destroy();
          playerBullet.damage = 0;
        }
      }
    }
  }

  resolveBulletHit(bullet) {
    const defenderIsEnemy = bullet.side === "player";
    const defenderStats = defenderIsEnemy ? this.enemyStats : this.playerStats;
    const dodgeChance = getBattleDodgeChance({
      dex: defenderStats.dex,
      luck: defenderStats.luck,
      enemyAgi: bullet.side === "player" ? this.playerStats.agi : this.enemyStats.agi,
      enemyLuck: bullet.side === "player" ? this.playerStats.luck : this.enemyStats.luck
    });
    const dodged = this.rng() < dodgeChance;
    if (dodged) {
      this.showHitText({ bullet, text: "miss", isMiss: true });
      if (bullet.side === "player") {
        this.enemyDodgeCount += 1;
      } else {
        this.playerDodgeCount += 1;
        this.playPlayerDodgeFlip();
      }
      bullet.sprite.destroy();
      return;
    }

    const impactX = bullet.side === "player"
      ? this.enemyAnchorX - BATTLE_TARGET_PADDING_PX
      : this.playerSprite.x + this.playerSprite.displayWidth * 0.25;
    this.showHitSprite(impactX, bullet.sprite.y, bullet.isCritical);

    const damage = Math.max(1, Math.round(bullet.damage));
    this.showHitText({
      bullet,
      text: `${damage*-1}${bullet.isCritical ? "!!" : ""}`,
      isCritical: bullet.isCritical
    });

    if (bullet.side === "player") {
      this.enemyHp = Math.max(0, this.enemyHp - damage);
      this.playerDamage += damage;
      if (bullet.isCritical) {
        this.playerCriticalCount += 1;
      }
    } else {
      this.playerHp = Math.max(0, this.playerHp - damage);
      this.enemyDamage += damage;
      this.state.health = Math.max(0, Math.round(this.playerHp));
      saveState(this.state, "fight:damage");
      if (bullet.isCritical) {
        this.enemyCriticalCount += 1;
      }
    }

    bullet.sprite.destroy();
  }

  showHitSprite(x, y, isCritical = false) {
    if (!this.textures.exists(BATTLE_HIT_SPRITE_KEY)) {
      return;
    }

    const spark = this.add.image(
      clamp(x, 24, this.scale.width - 24),
      clamp(y, 24, this.scale.height - 24),
      BATTLE_HIT_SPRITE_KEY
    ).setDepth(17).setAlpha(0.98);
    const baseSize = BATTLE_HIT_SPRITE_SIZE * (isCritical ? 1.22 : 1);
    spark.setDisplaySize(baseSize, baseSize);
    spark.setRotation(this.rng() * Math.PI);

    this.tweens.add({
      targets: spark,
      alpha: 0,
      scale: isCritical ? 1.45 : 1.25,
      angle: spark.angle + (isCritical ? 35 : 22),
      duration: BATTLE_HIT_SPRITE_DURATION_MS,
      ease: "Cubic.easeOut",
      onComplete: () => spark.destroy()
    });
  }

  showHitText({ bullet, text, isCritical = false, isMiss = false }) {
    if (!bullet?.sprite?.active || !text) {
      return;
    }

    const x = clamp(
      bullet.side === "player" ? this.enemyAnchorX - 42 : this.playerSprite.x + this.playerSprite.displayWidth * 0.2,
      28,
      this.scale.width - 28
    );
    const y = clamp(
      bullet.sprite.y - BATTLE_HIT_TEXT_OFFSET_Y,
      42,
      this.scale.height - 42
    );
    const label = this.add.text(x, y, text, {
      fontFamily: "Courier New",
      fontSize: isCritical ? "24px" : "20px",
      color: isMiss ? UI_COLORS.missText.hex : isCritical ? UI_COLORS.danger.hex : UI_COLORS.screenInkStrong.hex,
      stroke: UI_COLORS.screenHighlight.hex,
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(18);

    this.tweens.add({
      targets: label,
      y: y - BATTLE_HIT_TEXT_RISE_PX,
      alpha: 0,
      scale: isCritical ? 1.18 : 1,
      duration: BATTLE_HIT_TEXT_DURATION_MS,
      ease: "Cubic.easeOut",
      onComplete: () => label.destroy()
    });
  }

  showRegenText(amount) {
    const restored = Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0));
    if (restored <= 0 || !this.playerSprite) {
      return;
    }

    const x = clamp(this.playerSprite.x, 28, this.scale.width - 28);
    const y = clamp(
      this.playerSprite.y - this.playerSprite.displayHeight * 0.55,
      42,
      this.scale.height - 42
    );
    const label = this.add.text(x, y, `+${restored}`, {
      fontFamily: "Courier New",
      fontSize: "20px",
      color: UI_COLORS.success?.hex || UI_COLORS.screenInkStrong.hex,
      stroke: UI_COLORS.screenHighlight.hex,
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(18);

    this.tweens.add({
      targets: label,
      y: y - BATTLE_HIT_TEXT_RISE_PX,
      alpha: 0,
      scale: 1,
      duration: BATTLE_HIT_TEXT_DURATION_MS,
      ease: "Cubic.easeOut",
      onComplete: () => label.destroy()
    });
  }

  playPlayerDodgeFlip() {
    if (!this.playerSprite || !this.tweens || this.resultAnimationStarted) {
      return;
    }

    const startFlipX = !!this.playerSprite.flipX;
    this.playerDodgeTween?.stop?.();
    this.playerSprite.setFlipX?.(!startFlipX);
    this.playerSprite.flipX = !startFlipX;
    this.playerDodgeTween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: PLAYER_DODGE_FLIP_DURATION_MS,
      onComplete: () => {
        this.playerDodgeTween = null;
        this.playerSprite?.setFlipX?.(startFlipX);
        if (this.playerSprite) {
          this.playerSprite.flipX = startFlipX;
        }
      }
    });
  }

  stopBattle() {
    if (this.battleStopped) {
      return;
    }

    this.battleStopped = true;
    this.playerNextShotAt = Number.POSITIVE_INFINITY;
    this.enemyNextShotAt = Number.POSITIVE_INFINITY;
    this.regenNextAt = Number.POSITIVE_INFINITY;
  }

  getPlayerPetTextureKey(variant = "idle") {
    return getPetTextureKey({
      petId: this.state.petId,
      stage: this.state.evolutionStage,
      variant
    });
  }

  restorePlayerResultPose({ x, y, flipX }) {
    if (!this.playerSprite) {
      return;
    }

    this.playerSprite.setTexture?.(this.getPlayerPetTextureKey("idle"));
    this.playerSprite.setPosition?.(x, y);
    this.playerSprite.setFlipX?.(flipX);
    this.playerSprite.flipX = flipX;
  }

  playResultPetAnimation(victory) {
    if (this.resultAnimationStarted) {
      return;
    }

    this.resultAnimationStarted = true;
    this.playerRevertTimer?.remove(false);
    this.playerRevertTimer = null;

    if (!this.playerSprite || !this.tweens) {
      this.showSummary();
      return;
    }

    const startX = this.playerSprite.x;
    const startY = this.playerSprite.y;
    const startFlipX = !!this.playerSprite.flipX;
    this.playerSprite.setTexture?.(this.getPlayerPetTextureKey(victory ? "happy" : "sad"));

    const finish = () => {
      this.resultAnimationTween = null;
      this.restorePlayerResultPose({ x: startX, y: startY, flipX: startFlipX });
      this.showSummary();
    };

    this.resultAnimationTween = victory
      ? this.tweens.add({
          targets: this.playerSprite,
          y: startY - RESULT_WIN_JUMP_HEIGHT_PX,
          duration: RESULT_WIN_JUMP_DURATION_MS,
          ease: "Sine.easeOut",
          yoyo: true,
          repeat: RESULT_WIN_JUMP_COUNT - 1,
          onComplete: finish
        })
      : this.tweens.addCounter({
          from: 0,
          to: RESULT_LOSS_FLIP_COUNT,
          duration: RESULT_LOSS_FLIP_COUNT * RESULT_LOSS_FLIP_DURATION_MS,
          onUpdate: (tween) => {
            const value = Math.floor(tween.getValue());
            const flipX = value % 2 === 0 ? startFlipX : !startFlipX;
            this.playerSprite.setFlipX?.(flipX);
            this.playerSprite.flipX = flipX;
          },
          onComplete: finish
        });
  }

  showSummary() {
    if (this.summaryVisible) {
      return;
    }

    this.summaryVisible = true;
    const victory = this.playerDamage > this.enemyDamage;
    const outcomeText = victory ? "WIN" : "LOST";
    this.summaryBackdrop?.setVisible(true);
    this.resultBanner.setAlpha(0);
    const dropLine = victory ? formatDropPreviewLine(this.dropPreview) : "";
    this.summaryText.setText(outcomeText);
    this.summaryText.setAlpha(1);
    if (dropLine) {
      this.summaryDropText?.setText(dropLine);
      this.summaryDropText?.setAlpha(1);
    } else {
      this.summaryDropText?.setText("");
      this.summaryDropText?.setAlpha(0);
    }
    this.hintText?.setText(this.autoCloseSummary ? "Closing summary automatically..." : "Press O or X to close.");
    // this.summaryText.setText([
    //   `RESULT ${outcomeText}`,
    //   `DMG DEALT ${Math.round(this.playerDamage)}`,
    //   `DMG TAKEN ${Math.round(this.enemyDamage)}`,
    //   `HP LEFT ${Math.max(0, Math.round(this.playerHp))}/${this.playerMaxHp}`,
    //   `ATKS ${this.playerAttackCount + this.enemyAttackCount}`
    // ].join("\n"));
    // this.summaryText.setAlpha(1);
    // this.hintText.setText(this.autoCloseSummary ? "Closing summary automatically..." : "Press O or X to close.");

    if (this.autoCloseSummary) {
      this.summaryAutoCloseTimer = this.time.delayedCall(this.summaryDurationMs, () => {
        this.summaryAutoCloseTimer = null;
        this.closeSummary(victory);
      });
    }
  }

  closeSummary(victory) {
    if (this.resultResolved) {
      return;
    }

    this.resultResolved = true;
    this.destroyBullets();
    this.state.health = Math.max(0, Math.round(this.playerHp));
    saveState(this.state, "fight:summary");
    this.adventureScene?.handleFightResolved?.({
      victory,
      damageDealt: this.playerDamage,
      damageTaken: this.enemyDamage,
      playerHp: this.playerHp,
      enemyHp: this.enemyHp,
      attacks: this.playerAttackCount + this.enemyAttackCount,
      criticalHits: this.playerCriticalCount + this.enemyCriticalCount,
      dodges: this.playerDodgeCount + this.enemyDodgeCount
    });
    this.scene.stop();
  }

  destroyBullets() {
    this.activeBullets.forEach((bullet) => bullet?.sprite?.destroy());
    this.activeBullets = [];
  }

  handleAdventureInput(button) {
    if (!this.summaryVisible || this.resultResolved) {
      return;
    }

    if (button === "ok" || button === "cancel") {
      this.closeSummary(this.playerDamage > this.enemyDamage);
    }
  }

  checkForResolution(time) {
    if (this.battleStopped && !this.summaryVisible && !this.resultAnimationStarted && !this.activeBullets.length) {
      this.playResultPetAnimation(this.playerDamage > this.enemyDamage);
    }
  }
}
