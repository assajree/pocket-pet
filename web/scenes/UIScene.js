import {
  accelerateEggHatch,
  addMiniGameReward,
  applyLinkGameBetOutcome,
  applyEncounterOutcome,
  applyAction,
  clearState,
  createExchangeSnapshot,
  createMatchSeed,
  createNewState,
  getEggHatchSecondsRemaining,
  getNeedList,
  getRpgStatStatusLines,
  purchaseItem,
  runCombatEncounter,
  runDatingEncounter,
  saveState,
  getMoodList,
  validateExchangeSnapshot,
  evolveToSpecies,
} from "../gameState.js";
import {
  applyMiniGameInput,
  createMiniGameSyncState,
  createMiniGameState,
  finalizeMiniGameResult,
  getSequenceMatchNextButtonLabel,
  getMiniGameStatusText as buildMiniGameStatusText,
  getMiniGameSummaryText as buildMiniGameSummaryText,
  initializeMiniGameSession
} from "../minigames/index.js";
import { MENUS, isMenuView } from "../helpers/menus.js";
import { getAdventureStageConfig, getAdventureStageMenuItems, getAdventureStageUnlockState } from "../helpers/adventure.js";
import { getMenuCaption, buildInventoryItemName, getShopExtraCaption } from "../helpers/menuFormatters.js";
import { formatPetElementLabel, getPetCombatElements } from "../helpers/petAssets.js";
import {
  ACTION_ANIMATION_CONFIG,
  LINK_GAME_COUNTDOWN_MS,
  LINK_GAME_RESULT_DURATION_MS,
  MINI_GAME_SUMMARY_DURATION_MS,
  MINI_GAME_SUMMARY_INPUT_LOCK_MS,
  SLEEP_OK_ENERGY_BOOST,
  HARDWARE_BUTTON_LABELS
} from "../helpers/uiConfig.js";
import { getPlatformCapabilities } from "../helpers/platform.js";
import {
  closeLinkSession,
  completeLinkSession,
  fetchLinkSessionState,
  hostLinkSession,
  joinLinkSession,
  sendLinkGameResult,
  sendLinkGameState,
  uploadLinkSnapshot
} from "../helpers/linkTransport.js";
import { createGameSynth, NOTE_DURATION_MS } from "../helpers/gameSynth.js";
import { createAudioService } from "../helpers/audioService.js";
import { ensurePetStageAssetsLoaded, PET_CATALOG, DEFAULT_PET_ID } from "../helpers/petAssets.js";
import { resolveEffectStatus } from "../helpers/effectStatus.js";

const LINK_GAME_BET_OPTIONS = [0, 10, 20, 50, 100];
const QUICK_MATCH_HIT_FLASH_MS = 150;
const MEDIA_PREVIEW_VIEW = "media-preview";
const KEY_TO_BUTTON = new Map([
  ["arrowleft", "left"],
  ["a", "left"],
  ["up", "left"],
  ["w", "left"],
  ["arrowright", "right"],
  ["d", "right"],
  ["down", "right"],
  ["s", "right"],
  ["cancel", "cancel"],
  ["backspace", "cancel"],
  ["x", "cancel"],
  ["escape", "cancel"],
  ["ok", "ok"],
  ["enter", "ok"],
  ["o", "ok"]
]);
const PREVENT_DEFAULT_KEYS = new Set([
  "arrowleft",
  "arrowright",
  "arrowup",
  "arrowdown",
  "a",
  "d",
  "x",
  "o",
  "escape",
  "backspace"
]);

/** Demo tune for DEBUG > SAMPLE > SYNTH (`playSynthSequence` + `NOTE_DURATION_MS`). */
const DEBUG_SAMPLE_HAPPY_BIRTHDAY_SEQUENCE = [
  { note: "c", octave: 4, duration: NOTE_DURATION_MS.eighth },
  { note: "c", octave: 4, duration: NOTE_DURATION_MS.eighth },
  { note: "d", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "c", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "f", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "e", octave: 4, duration: NOTE_DURATION_MS.half },
  { note: "c", octave: 4, duration: NOTE_DURATION_MS.eighth },
  { note: "c", octave: 4, duration: NOTE_DURATION_MS.eighth },
  { note: "d", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "c", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "g", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "f", octave: 4, duration: NOTE_DURATION_MS.half },
  { note: "c", octave: 4, duration: NOTE_DURATION_MS.eighth },
  { note: "c", octave: 4, duration: NOTE_DURATION_MS.eighth },
  { note: "c", octave: 5, duration: NOTE_DURATION_MS.quarter },
  { note: "a", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "f", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "e", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "d", octave: 4, duration: NOTE_DURATION_MS.half },
  { note: "bb", octave: 4, duration: NOTE_DURATION_MS.eighth },
  { note: "bb", octave: 4, duration: NOTE_DURATION_MS.eighth },
  { note: "a", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "f", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "g", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "f", octave: 4, duration: NOTE_DURATION_MS.half }
];

const formatCountdown = (secondsRemaining) => {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = Math.max(0, secondsRemaining % 60);
  if (minutes < 1) {
    return `${seconds}`;
  }
  return `${minutes}:${seconds}`;
};

const getPetNeedIconKeys = (state) => {
  if (!state.isAlive || state.evolutionStage === "egg") {
    return [];
  }

  const iconKeys = [];

  if (state.isSick) {
    iconKeys.push("medicine");
  }
  if (state.poopCount > 0) {
    iconKeys.push("clean");
  }
  if (state.isSleeping || state.energy < 25) {
    iconKeys.push("sleep");
  }
  if (state.hunger < 30) {
    iconKeys.push("meal");
  }
  if (state.happiness < 35) {
    iconKeys.push("play");
  }

  return iconKeys;
};

export default class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
    this.view = "pet";
    this.menuIndexes = Object.fromEntries(Object.keys(MENUS).map((menuKey) => [menuKey, 0]));
    this.menuPath = [];
    this.statusPageIndex = 0;
    this.miniGame = createMiniGameState();
    this.inputLockedUntil = 0;
    this.isEvolutionAnimationActive = false;
    this.summaryTimer = null;
    this.actionAnimationTimer = null;
    this.quickMatchHitFlashTimer = null;
    this.quickMatchHitFlashActive = false;
    this.currentActionAnimation = null;
    this.activeMiniGameItem = null;
    this.remoteEncounterSnapshot = null;
    this.exchangeSessionCode = "";
    this.exchangeRole = "";
    this.exchangeMode = "";
    this.expectedExchangeMode = "";
    this.exchangeConnectionState = "idle";
    this.localSnapshotSent = false;
    this.encounterResolved = false;
    this.lastExchangeError = "";
    this.exchangePollTimer = null;
    this.joinCodeSequence = [];
    this.pendingJoinMode = "";
    this.pendingLinkGameItem = null;
    this.pendingLinkGameBet = 0;
    this.localLinkGameReady = false;
    this.linkGameStateSent = false;
    this.linkGameResultSent = false;
    this.remoteLinkGameState = null;
    this.remoteLinkGameResult = null;
    this.linkGameCountdownEndsAt = 0;
    this.linkGameResultTimer = null;
    this.linkGameSyncState = null;
    this.linkGameOutcome = "";
    this.messageReturnState = null;
    this.mediaPreview = null;
    this.mediaPreviewTimer = null;
    this.mediaPreviewUnlockTimer = null;
    this.mediaPreviewObjectUrl = "";
    this.isRestarting = false;
    this.platformCapabilities = getPlatformCapabilities();
    this.gameSynth = createGameSynth();
    this.audioService = createAudioService(this, { masterVolume: 70 });
    this.adventureFlowActive = false;
  }

  create() {
    this.gameScene = this.scene.get("GameScene");
    this.state = this.registry.get("petState");

    this.cacheDom();
    this.bindUI();
    this.render(this.state);

    this.handleStateChanged = (state) => {
      this.state = state;
      this.render(state);
      // saveState(state, "ui:state-changed");
    };
    this.handleEvolutionAnimationChanged = (isActive) => {
      this.isEvolutionAnimationActive = !!isActive;
      this.render(this.state);
    };

    this.gameScene.events.on("state-changed", this.handleStateChanged, this);
    this.gameScene.events.on("evolution-transition-changed", this.handleEvolutionAnimationChanged, this);
    this.events.on("shutdown", () => {
      this.stopExchangePolling();
      this.gameScene.events.off("state-changed", this.handleStateChanged, this);
      this.gameScene.events.off("evolution-transition-changed", this.handleEvolutionAnimationChanged, this);
      window.removeEventListener("keydown", this.handleKeydown);
      this.summaryTimer?.remove(false);
      this.actionAnimationTimer?.remove(false);
      this.linkGameResultTimer?.remove(false);
      this.quickMatchHitFlashTimer?.remove(false);
      this.mediaPreviewTimer?.remove(false);
      this.mediaPreviewUnlockTimer?.remove(false);
      this.clearMediaPreviewObjectUrl();
    });
  }

  cacheDom() {
    this.brandTitle = document.getElementById("brand-title");
    this.brandStatus = document.getElementById("brand-status");
    this.petMood = document.getElementById("pet-mood");
    this.screenMenu = document.getElementById("screen-menu");
    this.screenMenuParent = document.getElementById("screen-menu-parent");
    this.screenMenuTitle = document.getElementById("screen-menu-title");
    this.screenMenuIcon = document.getElementById("screen-menu-icon");
    this.screenMenuStatus = document.getElementById("screen-menu-status");
    this.screenMenuIndicator = document.getElementById("screen-menu-indicator");
    this.mediaPreviewContainer = document.getElementById("media-preview");
    this.mediaPreviewImage = document.getElementById("media-preview-image");
    this.hardwareLeft = document.getElementById("hardware-left");
    this.hardwareRight = document.getElementById("hardware-right");
    this.hardwareCancel = document.getElementById("hardware-cancel");
    this.hardwareOk = document.getElementById("hardware-ok");
  }

  bindUI() {
    if (this.uiBound) {
      return;
    }

    this.hardwareLeft.innerText = HARDWARE_BUTTON_LABELS.left;
    this.hardwareRight.innerText = HARDWARE_BUTTON_LABELS.right;
    this.hardwareCancel.innerText = HARDWARE_BUTTON_LABELS.cancel;
    this.hardwareOk.innerText = HARDWARE_BUTTON_LABELS.ok;

    this.gameSynth.unlock();
    this.hardwareLeft.addEventListener("click", () => this.handleDirectionalInput("left"));
    this.hardwareRight.addEventListener("click", () => this.handleDirectionalInput("right"));
    this.hardwareCancel.addEventListener("click", () => this.handleDirectionalInput("cancel"));
    this.hardwareOk.addEventListener("click", () => this.handleDirectionalInput("ok"));
    window.addEventListener("keydown", this.handleKeydown);
    this.uiBound = true;
  }

  handleKeydown = (event) => {
    if (event.repeat) {
      return;
    }

    const normalizedKey = String(event.key || "").toLowerCase();
    if (PREVENT_DEFAULT_KEYS.has(normalizedKey)) {
      event.preventDefault();
    }

    const button = KEY_TO_BUTTON.get(normalizedKey);
    if (button) {
      this.handleDirectionalInput(button);
      return;
    }

    if (normalizedKey === "r" && !this.state.isAlive) {
      this.restartGame();
    }
  };

  handleDirectionalInput(button) {
    if (this.adventureFlowActive) {
      const rewardScene = this.scene.get("RewardScene");
      if (rewardScene?.scene?.isActive()) {
        rewardScene.handleAdventureInput?.(button);
        return;
      }

      const fightScene = this.scene.get("FightScene");
      if (fightScene?.scene?.isActive()) {
        fightScene.handleAdventureInput?.(button);
        return;
      }

      const adventureScene = this.scene.get("AdventureScene");
      if (adventureScene?.scene?.isActive()) {
        adventureScene.handleAdventureInput?.(button);
        return;
      }

      return;
    }

    this.gameSynth.playButtonPress(button);

    if (this.view === "action-animation" && (button === "ok" || button === "cancel")) {
      this.skipActionAnimation();
      return;
    }

    if (this.view === "summary") {
      if (this.time.now < this.inputLockedUntil) {
        return;
      }
      this.closeMiniGameSummary();
      return;
    }

    if (this.view === MEDIA_PREVIEW_VIEW) {
      if (button === "ok" || button === "cancel") {
        if (!this.isMediaPreviewInputLocked()) {
          this.closeMediaPreview();
        }
      }
      return;
    }

    if (this.isInputLocked()) {
      return;
    }

    // if (!this.state.isAlive && this.view !== "status" && button !== "cancel" && button !== "ok") {
    //   return;
    // }

    if (this.view === "pet") {
      if (this.state.isAlive && this.state.evolutionStage === "egg") {
        const previousPetId = this.state.petId;
        const previousStage = this.state.evolutionStage;
        const hatchStep = accelerateEggHatch(this.state, 1);
        saveState(this.state, "ui:egg-hatch-boost");
        if (hatchStep.changedStage) {
          this.gameScene.handlePetStateMutation({ previousPetId, previousStage });
        } else {
          this.gameScene.syncVisuals();
        }
        this.render(this.state);
        return;
      }



      if (!this.state.isAlive) {
        this.openDeadMenu();
        return;
      }

      if (this.state.isSleeping && button === "ok") {
        this.boostSleepingEnergy();
        return;
      }

      // open status screen
      if (button === "ok" || button === "cancel") {
        this.statusPageIndex = 0;
        this.view = "status";
        this.render(this.state);
        return;
      }

      // open main menu
      this.openMainMenu({ selectLastItem: button === "left" });
      return;
    }

    if (this.view === "minigame") {
      this.handleMiniGameInput(button);
      return;
    }

    if (this.view === "link-code-entry") {
      this.handleJoinCodeInput(button);
      return;
    }

    if (this.view === "link-host-code") {
      this.handleHostedCodeInput(button);
      return;
    }

    if (this.view === "link-game-ready") {
      this.handleLinkGameReadyInput(button);
      return;
    }

    if (this.view === "link-game-result") {
      return;
    }

    if (this.view === "dead") {
      if (button === "cancel") {
        return;
      }
      this.handleMenuNavigation(this.view, button);
      return;
    }

    if (button === "cancel") {
      this.closeMenu();
      return;
    }

    if (isMenuView(this.view)) {
      this.handleMenuNavigation(this.view, button);
      return;
    }

    if (this.view === "status") {
      if (button === "left" || button === "right") {
        this.stepStatusPage(button);
        return;
      }

      if (button === "ok") {
        this.stepStatusPage("right");
        // this.closeMenu();
      }
      return;
    }

    if (!this.state.isAlive) {
      return;
    }

    if (this.view === "message") {
      if (button === "cancel" || button === "ok") {
        this.closeMenu();
      }
      return;
    }

  }

  handleMenuNavigation(menuKey, button) {
    const menu = this.getVisibleMenuItems(menuKey);
    if (!menu || !menu.length) {
      return;
    }

    if (button === "left" || button === "right") {
      const delta = button === "right" ? 1 : -1;
      this.menuIndexes[menuKey] = (this.menuIndexes[menuKey] + delta + menu.length) % menu.length;
      this.render(this.state);
      return;
    }

    if (button === "ok") {
      const item = menu[this.menuIndexes[menuKey]];
      this.selectMenuItem(menuKey, item);
    }
  }

  selectMenuItem(menuKey, item) {

    if (String(item.key || "").startsWith("link-game-select-")) {
      this.pendingLinkGameItem = this.getLinkGameItemByKey(String(item.key).replace("link-game-select-", ""));
    }

    if (String(item.key || "").startsWith("adventure-stage-")) {
      this.handleAdventureStageSelection(item);
      return;
    }

    if (item.submenu) {
      this.pushMenuPath(item.submenu, item.name || item.label || item.submenu);
      this.view = item.submenu;
      this.render(this.state);
      return;
    }

    if (String(item.key || "").startsWith("link-")) {
      this.handleEncounterMenuAction(item.key);
      return;
    }

    if (item.minigame) {
      this.startMiniGame(item);
      return;
    }

    this.runAction(item);
  }

  getParentMenuKey() {
    const parentMenuKey = this.menuPath[this.menuPath.length - 1]?.key || "main";
    // console.log('getParentMenuKey()', parentMenuKey);
    return parentMenuKey;
  }

  runAction(item) {
    if (String(item.key || "").startsWith("debug-evolve-to-")) {
      const targetSpecies = String(item.key).replace("debug-evolve-to-", "");
      const previousPetId = this.state.petId;
      const previousStage = this.state.evolutionStage;
      const result = evolveToSpecies(this.state, targetSpecies);
      saveState(this.state, `ui:debug-evolve:${targetSpecies}`);

      if (result.ok) {
        this.gameScene.handlePetStateMutation({ previousPetId, previousStage });
        this.view = "pet";
        this.menuPath = [];
        this.render(this.state);
        return;
      }

      this.showMessage(result.message || "Evolution failed.", false);
      return;
    }

    if (item.key === "new-egg") {
      this.restartGame();
      return;
    }

    if (item.key === "debug-play-audio") {
      this.playDebugSampleAudio();
      return;
    }

    if (item.key === "debug-sample-synth") {
      this.gameSynth.playSynthSequence(DEBUG_SAMPLE_HAPPY_BIRTHDAY_SEQUENCE, item.key);
      this.showMessage("Played Happy Birthday via playSynthSequence (Web Audio synth).", true, {
        returnState: {
          view: this.view,
          menuPath: this.menuPath.map((entry) => ({ ...entry })),
          callback: () => {
            this.gameSynth.stopSynthSequence(item.key);
          }
        }
      });
      return;
    }

    if (item.key === "debug-preview-gif") {
      this.openMediaPreview({
        assetKey: "debug-sample-gif"
      });
      return;
    }

    if (this.view === "shop") {
      const purchase = purchaseItem(this.state, item.key);
      saveState(this.state, "ui:shop-purchase");
      if (purchase.ok) {
        this.render(this.state);
        return;
      }
      this.showMessage(purchase.message || "Unable to buy item.", false, {
        returnState: {
          view: this.view,
          menuPath: [
            { key: "main", label: "" },
            { key: "shop", label: "SHOP" },
            ...[item],
          ]
        }
      });
      return;
    }

    const previousPetId = this.state.petId;
    const previousStage = this.state.evolutionStage;
    const previousPoopCount = this.state.poopCount;
    const result = applyAction(this.state, item.key, item.effectStatus);
    saveState(this.state, `ui:action:${item.key}`);

    if (result.ok) {
      const poopsCreated = Math.max(0, this.state.poopCount - previousPoopCount);
      if (poopsCreated > 0) {
        this.gameScene.playPoopSound(poopsCreated);
      }

      if (previousPetId !== this.state.petId || previousStage !== this.state.evolutionStage) {
        this.gameScene.handlePetStateMutation({ previousPetId, previousStage });
      } else {
        this.gameScene.syncVisuals();
      }

      if (item.key === "meal" || item.key === "snack" || item.key === "clean") {
        this.showActionAnimation(item.key);
        return;
      }

      // eat other food items
      const parentMenuKey = this.getParentMenuKey();
      if (parentMenuKey === "feed") {
        this.showActionAnimation("meal");
        return;
      }

      if (item.key === "medicine") {
        this.showActionAnimation("reaction-happy");
        return;
      }

      if (this.view !== "feed") {
        this.view = "pet";
      }
      this.render(this.state);
      return;
    }

    if (item.key === "medicine") {
      this.showActionAnimation("reaction-angry");
      return;
    }

    this.showMessage(result.message || this.getSuccessMessage(item.key), false);
  }



  playDebugSampleAudio() {
    const didPlay = this.audioService.play("debug-sample-audio", { volume: 45 });
    if (didPlay) {
      this.showMessage("Played sample audio from assets/audio/debug-sample.wav.", true, {
        returnState: {
          view: this.view,
          menuPath: this.menuPath.map((entry) => ({ ...entry }))
        }
      });
      return;
    }

    this.showMessage("Sample audio could not play on this device.", false, {
      returnState: {
        view: this.view,
        menuPath: this.menuPath.map((entry) => ({ ...entry }))
      }
    });
  }

  buildMediaPreviewReturnState() {
    return {
      view: this.view,
      menuPath: this.menuPath.map((entry) => ({ ...entry }))
    };
  }

  clearMediaPreviewObjectUrl() {
    if (!this.mediaPreviewObjectUrl) {
      return;
    }

    URL.revokeObjectURL(this.mediaPreviewObjectUrl);
    this.mediaPreviewObjectUrl = "";
  }

  clearMediaPreviewRuntime() {
    this.mediaPreviewTimer?.remove(false);
    this.mediaPreviewTimer = null;
    this.mediaPreviewUnlockTimer?.remove(false);
    this.mediaPreviewUnlockTimer = null;
    this.mediaPreview = null;
    this.clearMediaPreviewObjectUrl();
    if (this.mediaPreviewImage) {
      this.mediaPreviewImage.removeAttribute("src");
    }
  }

  createMediaPreviewSourceFromAssetKey(assetKey) {
    if (!assetKey) {
      return null;
    }

    if (this.cache.binary.exists(assetKey)) {
      const binaryData = this.cache.binary.get(assetKey);
      let arrayBuffer = null;
      if (binaryData instanceof ArrayBuffer) {
        arrayBuffer = binaryData;
      } else if (ArrayBuffer.isView(binaryData)) {
        arrayBuffer = binaryData.buffer.slice(binaryData.byteOffset, binaryData.byteOffset + binaryData.byteLength);
      }
      if (!arrayBuffer) {
        return null;
      }
      return {
        src: URL.createObjectURL(new Blob([arrayBuffer], { type: "image/gif" })),
        mediaType: "gif"
      };
    }

    if (this.cache.text.exists(assetKey)) {
      const markup = this.cache.text.get(assetKey);
      if (typeof markup !== "string" || !markup.trim().startsWith("<svg")) {
        return null;
      }
      return {
        src: URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" })),
        mediaType: "svg"
      };
    }

    return null;
  }

  openMediaPreview({ assetKey, inputLockMs = 0, autoCloseMs = -1, returnMode = "previous" } = {}) {
    const resolvedSource = this.createMediaPreviewSourceFromAssetKey(assetKey);
    if (!resolvedSource) {
      this.showMessage(`Preview asset '${assetKey || "unknown"}' is unavailable.`, false, {
        returnState: this.buildMediaPreviewReturnState()
      });
      return;
    }

    this.clearMediaPreviewRuntime();
    this.mediaPreviewObjectUrl = resolvedSource.src;
    this.mediaPreview = {
      assetKey,
      mediaType: resolvedSource.mediaType,
      inputLockMs,
      inputUnlockAt: inputLockMs > 0 ? this.time.now + inputLockMs : 0,
      autoCloseMs,
      returnMode,
      returnState: this.buildMediaPreviewReturnState()
    };
    if (this.mediaPreviewImage) {
      this.mediaPreviewImage.setAttribute("src", resolvedSource.src);
      this.mediaPreviewImage.setAttribute("alt", `${resolvedSource.mediaType.toUpperCase()} asset preview`);
    }
    if (inputLockMs > 0) {
      this.mediaPreviewUnlockTimer = this.time.delayedCall(inputLockMs, () => {
        this.mediaPreviewUnlockTimer = null;
        this.render(this.state);
      });
    }
    this.view = MEDIA_PREVIEW_VIEW;
    this.render(this.state);
    if (autoCloseMs >= 0) {
      this.mediaPreviewTimer = this.time.delayedCall(autoCloseMs, () => {
        this.closeMediaPreview();
      });
    }
  }

  isMediaPreviewInputLocked() {
    if (!this.mediaPreview) {
      return false;
    }

    return this.mediaPreview.inputLockMs === -1 || this.time.now < this.mediaPreview.inputUnlockAt;
  }

  closeMediaPreview() {
    if (!this.mediaPreview) {
      return;
    }

    const { returnMode, returnState } = this.mediaPreview;
    this.clearMediaPreviewRuntime();
    if (returnMode === "pet") {
      this.statusPageIndex = 0;
      this.menuPath = [];
      this.view = "pet";
      this.render(this.state);
      return;
    }

    this.view = returnState?.view || "pet";
    this.menuPath = Array.isArray(returnState?.menuPath)
      ? returnState.menuPath.map((entry) => ({ ...entry }))
      : [];
    this.render(this.state);
  }

  getMediaPreviewParentText() {
    const path = this.mediaPreview?.returnState?.menuPath;
    if (!Array.isArray(path) || !path.length) {
      return "PREVIEW";
    }

    const labels = path
      .map((entry) => String(entry?.label || "").trim())
      .filter(Boolean);
    return labels.length ? labels.join(" / ") : "PREVIEW";
  }

  getLocalEncounterSnapshot() {
    return createExchangeSnapshot(this.state);
  }

  resetJoinCodeEntry() {
    this.joinCodeSequence = [];
    this.pendingJoinMode = "";
  }

  canUseLocalSnapshot() {
    return !!this.state.isAlive && this.state.evolutionStage !== "egg";
  }

  supportsLink() {
    return !!this.platformCapabilities?.supportsLink;
  }

  resetExchangeRuntime() {
    this.stopExchangePolling();
    this.remoteEncounterSnapshot = null;
    this.remoteLinkGameState = null;
    this.remoteLinkGameResult = null;
    this.exchangeSessionCode = "";
    this.exchangeRole = "";
    this.exchangeMode = "";
    this.expectedExchangeMode = "";
    this.exchangeConnectionState = "idle";
    this.localSnapshotSent = false;
    this.linkGameStateSent = false;
    this.linkGameResultSent = false;
    this.encounterResolved = false;
    this.lastExchangeError = "";
    this.pendingLinkGameItem = null;
    this.pendingLinkGameBet = 0;
    this.localLinkGameReady = false;
    this.linkGameCountdownEndsAt = 0;
    this.linkGameSyncState = null;
    this.linkGameOutcome = "";
    this.linkGameResultTimer?.remove(false);
    this.linkGameResultTimer = null;
    this.clearQuickMatchHitFlash();
  }

  clearQuickMatchHitFlash() {
    this.quickMatchHitFlashTimer?.remove(false);
    this.quickMatchHitFlashTimer = null;
    this.quickMatchHitFlashActive = false;
  }

  triggerQuickMatchHitFlash() {
    this.clearQuickMatchHitFlash();
    this.quickMatchHitFlashActive = true;
    // this.inputLockedUntil = Math.max(this.inputLockedUntil, this.time.now + QUICK_MATCH_HIT_FLASH_MS);
    this.quickMatchHitFlashTimer = this.time.delayedCall(QUICK_MATCH_HIT_FLASH_MS, () => {
      this.quickMatchHitFlashTimer = null;
      this.quickMatchHitFlashActive = false;
      this.render(this.state);
    });
  }

  stopExchangePolling() {
    if (!this.exchangePollTimer) {
      return;
    }

    window.clearInterval(this.exchangePollTimer);
    this.exchangePollTimer = null;
  }

  startExchangePolling() {
    this.stopExchangePolling();
    this.exchangePollTimer = window.setInterval(() => {
      this.pollExchangeSession();
    }, 1000);
  }

  getEncounterMenuStatus(_state, item) {
    const localSnapshotReady = this.canUseLocalSnapshot();
    const waitingText = this.exchangeSessionCode
      ? `CODE ${this.exchangeSessionCode.split("").join(" ")}\nSTATE ${this.exchangeConnectionState.toUpperCase()}`
      : "No active session.";

    switch (item.key) {
      case "link-battle-host":
        return [
          `LOCAL ${localSnapshotReady ? "READY" : "LOCKED"}`,
          this.exchangeSessionCode && this.exchangeMode === "combat" ? `SHARE ${waitingText}` : "Host a battle button code."
        ].join("\n");
      case "link-battle-join":
        return [
          `LOCAL ${localSnapshotReady ? "READY" : "LOCKED"}`,
          this.expectedExchangeMode === "combat" && this.exchangeSessionCode ? waitingText : "Press the 6-button host code."
        ].join("\n");
      case "link-dating-host":
        return [
          `LOCAL ${localSnapshotReady ? "READY" : "LOCKED"}`,
          this.exchangeSessionCode && this.exchangeMode === "dating" ? `SHARE ${waitingText}` : "Host a dating button code."
        ].join("\n");
      case "link-dating-join":
        return [
          `LOCAL ${localSnapshotReady ? "READY" : "LOCKED"}`,
          this.expectedExchangeMode === "dating" && this.exchangeSessionCode ? waitingText : "Press the 6-button host code."
        ].join("\n");
      default:
        return "";
    }
  }

  getEncounterGuardError() {
    if (!this.canUseLocalSnapshot()) {
      return "Your pet must be alive and hatched first.";
    }

    return "";
  }

  getLinkGameItemByKey(itemKey) {
    return MENUS.play.items.find((item) => item.key === itemKey) || null;
  }

  getPendingLinkGameTitle() {
    return this.pendingLinkGameItem?.name || this.pendingLinkGameItem?.label || "GAME";
  }

  getLinkGameBetFromItemKey(itemKey) {
    const rawValue = String(itemKey || "").replace("link-game-bet-", "");
    const bet = Number.parseInt(rawValue, 10);
    return Number.isFinite(bet) ? bet : 0;
  }

  canAffordBet(bet = 0) {
    return Math.round(this.state.money) >= Math.max(0, Math.round(bet));
  }

  getLinkGameGuardError(bet = 0) {
    const encounterGuardError = this.getEncounterGuardError();
    if (encounterGuardError) {
      return encounterGuardError;
    }

    if (!this.canAffordBet(bet)) {
      return `Not enough money for ${bet}G bet.`;
    }

    return "";
  }

  getLinkGameMenuStatus(_state, item) {
    const waitingText = this.exchangeSessionCode
      ? `CODE ${this.exchangeSessionCode.split("").join(" ")}\nSTATE ${this.exchangeConnectionState.toUpperCase()}`
      : "No active room.";

    if (item.key === "link-game-join") {
      return this.exchangeMode === "game" && this.exchangeSessionCode
        ? waitingText
        : "Join a game room by code.";
    }

    return "";
  }

  buildLinkGameReturnState(view = "link-game") {
    return {
      view,
      menuPath: [
        { key: "main", label: "" },
        { key: "link", label: "LINK" },
        { key: "link-game", label: "GAME" },
        ...(view === "link-game-host" ? [{ key: "link-game-host", label: "HOST" }] : []),
        ...(view === "link-game-bet" ? [{ key: "link-game-host", label: "HOST" }, { key: "link-game-bet", label: "BET" }] : [])
      ]
    };
  }

  buildLinkGameStatePayload(overrides = {}) {
    return {
      gameKey: this.pendingLinkGameItem?.key || this.remoteLinkGameState?.gameKey || "",
      gameName: this.getPendingLinkGameTitle(),
      bet: this.pendingLinkGameBet,
      ready: this.localLinkGameReady,
      countdownStarted: false,
      countdownEndsAt: 0,
      syncState: this.linkGameSyncState,
      ...overrides
    };
  }

  buildLinkGameResultPayload() {
    return {
      score: this.miniGame.result?.score ?? this.miniGame.score,
      success: this.miniGame.result?.success ?? this.miniGame.success,
      progress: this.miniGame.result?.progress ?? this.miniGame.progress,
      targetCount: this.miniGame.result?.targetCount ?? this.miniGame.sequence.length
    };
  }

  getRemoteLinkGameScore() {
    return Number(this.remoteLinkGameResult?.score ?? 0);
  }

  resolveLinkGameOutcome(localScore, remoteScore) {
    if (localScore > remoteScore) {
      return "win";
    }
    if (localScore < remoteScore) {
      return "lost";
    }
    return "draw";
  }

  formatLinkGameOutcome(outcome) {
    if (outcome === "win") return "WIN";
    if (outcome === "lost") return "LOST";
    return "DRAW";
  }

  async sendLinkGameStateIfReady(payloadOverrides = {}) {
    if (!this.exchangeSessionCode || !this.exchangeRole || this.exchangeMode !== "game") {
      return;
    }

    const payload = this.buildLinkGameStatePayload(payloadOverrides);
    await sendLinkGameState(this.exchangeSessionCode, this.exchangeRole, payload);
    this.linkGameStateSent = true;
  }

  async sendLinkGameResultIfReady() {
    if (!this.exchangeSessionCode || !this.exchangeRole || this.exchangeMode !== "game" || this.linkGameResultSent) {
      return;
    }

    const payload = this.buildLinkGameResultPayload();
    await sendLinkGameResult(this.exchangeSessionCode, this.exchangeRole, payload);
    this.linkGameResultSent = true;
  }

  async startHostedEncounter(mode) {
    if (!this.supportsLink()) {
      this.showMessage("Link is only available in the Android app.", false);
      return;
    }

    const guardError = this.getEncounterGuardError();
    if (guardError) {
      this.showMessage(guardError, false);
      return;
    }

    this.resetExchangeRuntime();
    this.exchangeConnectionState = "hosting";
    this.exchangeMode = mode;
    this.render(this.state);

    try {
      const session = await hostLinkSession(mode);
      this.exchangeSessionCode = session.code;
      this.exchangeRole = "host";
      this.exchangeMode = session.mode;
      this.exchangeConnectionState = "waiting";
      await this.sendLocalSnapshotIfReady();
      this.startExchangePolling();
      this.view = "link-host-code";
      this.menuPath = [
        { key: "main", label: "" },
        { key: "link", label: "LINK" },
        { key: mode === "dating" ? "link-dating" : "link-battle", label: mode === "dating" ? "DATING" : "BATTLE" }
      ];
      this.render(this.state);
    } catch (error) {
      this.handleExchangeFailure(error.message || "Could not host link session.");
    }
  }

  async startJoinedEncounter(mode) {
    if (!this.supportsLink()) {
      this.showMessage("Link is only available in the Android app.", false);
      return;
    }

    const guardError = this.getEncounterGuardError();
    if (guardError) {
      this.showMessage(guardError, false);
      return;
    }

    this.pendingJoinMode = mode;
    this.joinCodeSequence = [];
    this.view = "link-code-entry";
    this.render(this.state);
  }

  async startHostedGame(bet) {
    if (!this.supportsLink()) {
      this.showMessage("Link is only available in the Android app.", false);
      return;
    }

    if (!this.pendingLinkGameItem) {
      this.showMessage("Choose a game first.", false, { returnState: this.buildLinkGameReturnState("link-game-host") });
      return;
    }

    const guardError = this.getLinkGameGuardError(bet);
    if (guardError) {
      this.showMessage(guardError, false, { returnState: this.buildLinkGameReturnState("link-game-bet") });
      return;
    }

    const selectedLinkGameItem = this.pendingLinkGameItem;
    this.resetExchangeRuntime();
    this.pendingLinkGameItem = selectedLinkGameItem;
    this.pendingLinkGameBet = bet;
    this.exchangeConnectionState = "hosting";
    this.exchangeMode = "game";
    this.render(this.state);

    try {
      const syncState = createMiniGameSyncState(this.pendingLinkGameItem, (pool) => Phaser.Utils.Array.GetRandom(pool));
      this.linkGameSyncState = syncState;
      const session = await hostLinkSession("game", { gameKey: this.pendingLinkGameItem.key, bet });
      this.exchangeSessionCode = session.code;
      this.exchangeRole = "host";
      this.exchangeMode = session.mode;
      this.exchangeConnectionState = "waiting";
      await this.sendLinkGameStateIfReady({
        ready: false,
        countdownStarted: false,
        countdownEndsAt: 0,
        syncState
      });
      this.startExchangePolling();
      this.view = "link-game-ready";
      this.menuPath = [
        { key: "main", label: "" },
        { key: "link", label: "LINK" },
        { key: "link-game", label: "GAME" }
      ];
      this.render(this.state);
    } catch (error) {
      this.handleExchangeFailure(error.message || "Could not host game room.", false, {
        returnState: this.buildLinkGameReturnState("link-game-bet")
      });
    }
  }

  startJoinedGame() {
    if (!this.supportsLink()) {
      this.showMessage("Link is only available in the Android app.", false);
      return;
    }

    const guardError = this.getEncounterGuardError();
    if (guardError) {
      this.showMessage(guardError, false);
      return;
    }

    this.pendingJoinMode = "game";
    this.joinCodeSequence = [];
    this.view = "link-code-entry";
    this.render(this.state);
  }

  appendJoinCodeInput(button) {
    if (this.joinCodeSequence.length >= 6) {
      return;
    }

    const symbol = button === "left" ? "<" : button === "right" ? ">" : button === "ok" ? "O" : "";
    if (!symbol) {
      return;
    }

    this.joinCodeSequence.push(symbol);
  }

  removeLastJoinCodeInput() {
    this.joinCodeSequence.pop();
  }

  getJoinCodeValue() {
    return this.joinCodeSequence.join("");
  }

  getJoinCodeDisplay() {
    return Array.from({ length: 6 }, (_value, index) => this.joinCodeSequence[index] || "_").join(" ");
  }

  handleJoinCodeInput(button) {
    if (button === "left" || button === "right" || button === "ok") {
      this.appendJoinCodeInput(button);
      if (this.joinCodeSequence.length < 6) {
        this.render(this.state);
        return;
      }

      const mode = this.pendingJoinMode;
      const code = this.getJoinCodeValue();
      this.resetJoinCodeEntry();
      if (mode === "game") {
        this.performJoinedGame(code);
        return;
      }
      this.performJoinedEncounter(mode, code);
      return;
    }

    if (button !== "cancel") {
      return;
    }

    if (this.joinCodeSequence.length > 0) {
      this.removeLastJoinCodeInput();
      this.render(this.state);
      return;
    }

    const mode = this.pendingJoinMode;
    const fallbackView = mode === "combat" ? "link-battle" : mode === "dating" ? "link-dating" : "link-game";
    this.resetJoinCodeEntry();
    this.view = fallbackView;
    this.render(this.state);
  }

  async handleLinkGameReadyInput(button) {
    if (button === "cancel") {
      if (this.exchangeSessionCode) {
        try {
          await closeLinkSession(this.exchangeSessionCode);
        } catch (_error) {
          // Best effort close.
        }
      }
      this.resetExchangeRuntime();
      this.view = "link-game";
      this.menuPath = [
        { key: "main", label: "" },
        { key: "link", label: "LINK" },
        { key: "link-game", label: "GAME" }
      ];
      this.render(this.state);
      return;
    }

    if (button !== "ok") {
      return;
    }

    if (!this.canAffordBet(this.pendingLinkGameBet)) {
      this.showMessage(`Not enough money for ${this.pendingLinkGameBet}G bet.`, false, {
        returnState: this.buildLinkGameReturnState("link-game")
      });
      return;
    }

    this.localLinkGameReady = true;
    await this.sendLinkGameStateIfReady({
      ready: true,
      countdownStarted: false,
      countdownEndsAt: 0
    });
    this.render(this.state);
  }

  async handleHostedCodeInput(button) {
    if (button !== "cancel") {
      return;
    }

    const mode = this.exchangeMode;
    const returnState = this.buildJoinSubmenuReturnState(mode);
    if (this.exchangeSessionCode) {
      try {
        await closeLinkSession(this.exchangeSessionCode);
      } catch (_error) {
        // Best effort close.
      }
    }

    this.resetExchangeRuntime();
    this.view = returnState.view;
    this.menuPath = returnState.menuPath;
    this.render(this.state);
  }

  async performJoinedEncounter(mode, code) {
    if (!code) {
      this.showMessage("Join cancelled.", false);
      return;
    }

    this.resetExchangeRuntime();
    this.exchangeConnectionState = "joining";
    this.expectedExchangeMode = mode;
    this.render(this.state);

    try {
      const session = await joinLinkSession(code, mode);
      if (session.mode !== mode) {
        this.handleExchangeFailure(`Mode mismatch: host is ${session.mode}.`, false, {
          returnToSubmenu: true,
          mode
        });
        return;
      }

      this.exchangeSessionCode = session.code;
      this.exchangeRole = "join";
      this.exchangeMode = session.mode;
      this.expectedExchangeMode = mode;
      this.exchangeConnectionState = "connected";
      await this.sendLocalSnapshotIfReady();
      this.startExchangePolling();
      this.showMessage(`Connected to ${mode === "combat" ? "battle" : "dating"} host ${session.code}.`, true);
    } catch (error) {
      const hostMode = error.payload?.hostMode;
      const message = hostMode ? `Mode mismatch: host is ${hostMode}.` : (error.message || "Could not join link session.");
      this.handleExchangeFailure(message, false, {
        returnToSubmenu: true,
        mode
      });
    }
  }

  async performJoinedGame(code) {
    if (!code) {
      this.showMessage("Join cancelled.", false);
      return;
    }

    this.resetExchangeRuntime();
    this.exchangeConnectionState = "joining";
    this.expectedExchangeMode = "game";
    this.render(this.state);

    try {
      const session = await joinLinkSession(code, "game");
      if (session.mode !== "game") {
        this.handleExchangeFailure(`Mode mismatch: host is ${session.mode}.`, false, {
          returnState: this.buildLinkGameReturnState("link-game")
        });
        return;
      }

      if (!this.canAffordBet(session.bet || 0)) {
        try {
          await closeLinkSession(session.code);
        } catch (_error) {
          // Best effort close.
        }
        this.handleExchangeFailure(`Not enough money for ${session.bet}G bet.`, false, {
          returnState: this.buildLinkGameReturnState("link-game")
        });
        return;
      }

      this.exchangeSessionCode = session.code;
      this.exchangeRole = "join";
      this.exchangeMode = session.mode;
      this.expectedExchangeMode = "game";
      this.exchangeConnectionState = "connected";
      this.pendingLinkGameBet = session.bet || 0;
      this.pendingLinkGameItem = this.getLinkGameItemByKey(session.gameKey);
      this.startExchangePolling();
      this.view = "link-game-ready";
      this.menuPath = [
        { key: "main", label: "" },
        { key: "link", label: "LINK" },
        { key: "link-game", label: "GAME" }
      ];
      this.render(this.state);
    } catch (error) {
      const hostMode = error.payload?.hostMode;
      const message = hostMode ? `Mode mismatch: host is ${hostMode}.` : (error.message || "Could not join game room.");
      this.handleExchangeFailure(message, false, {
        returnState: this.buildLinkGameReturnState("link-game")
      });
    }
  }

  async sendLocalSnapshotIfReady() {
    if (!this.exchangeSessionCode || !this.exchangeRole || this.localSnapshotSent || !this.canUseLocalSnapshot()) {
      return;
    }

    const snapshot = this.getLocalEncounterSnapshot();
    await uploadLinkSnapshot(this.exchangeSessionCode, this.exchangeRole, snapshot);
    this.localSnapshotSent = true;
  }

  async pollExchangeSession() {
    if (!this.exchangeSessionCode || !this.exchangeRole || this.encounterResolved) {
      return;
    }

    try {
      const session = await fetchLinkSessionState(this.exchangeSessionCode, this.exchangeRole);
      const expectedMode = this.expectedExchangeMode || this.exchangeMode;
      if (expectedMode && session.mode !== expectedMode) {
        this.handleExchangeFailure(`Mode mismatch: host is ${session.mode}.`, true);
        return;
      }

      this.exchangeMode = session.mode;
      this.exchangeConnectionState = session.joinConnected ? "connected" : (this.exchangeRole === "host" ? "waiting" : "joining");

      if (session.mode === "game") {
        this.pendingLinkGameBet = session.bet || this.pendingLinkGameBet;
        if (!this.pendingLinkGameItem && session.gameKey) {
          this.pendingLinkGameItem = this.getLinkGameItemByKey(session.gameKey);
        }
        this.remoteLinkGameState = session.remoteGameState || this.remoteLinkGameState;
        this.remoteLinkGameResult = session.remoteGameResult || this.remoteLinkGameResult;
        await this.maybeResolveLinkGameSession();
        this.render(this.state);
        return;
      }

      if (!this.localSnapshotSent) {
        await this.sendLocalSnapshotIfReady();
      }

      if (session.remoteSnapshot && !this.remoteEncounterSnapshot) {
        const validated = validateExchangeSnapshot(session.remoteSnapshot);
        if (!validated.ok) {
          this.handleExchangeFailure(validated.message || "Remote snapshot is invalid.", true);
          return;
        }

        const snapshot = validated.snapshot;
        if (!snapshot.isAlive || snapshot.evolutionStage === "egg") {
          this.handleExchangeFailure("Remote pet must be alive and hatched.", true);
          return;
        }

        this.remoteEncounterSnapshot = snapshot;
        this.exchangeConnectionState = "ready";
      }

      await this.maybeResolveAutoEncounter();
      this.render(this.state);
    } catch (error) {
      this.handleExchangeFailure(error.message || "Link session disconnected.");
    }
  }

  async maybeResolveAutoEncounter() {
    if (
      this.encounterResolved
      || !this.exchangeMode
      || !this.localSnapshotSent
      || !this.remoteEncounterSnapshot
    ) {
      return;
    }

    this.encounterResolved = true;
    const localSnapshot = this.getLocalEncounterSnapshot();
    const remoteSnapshot = this.remoteEncounterSnapshot;
    const seed = createMatchSeed(localSnapshot.checksum, remoteSnapshot.checksum, this.exchangeMode);
    const outcome = this.exchangeMode === "combat"
      ? runCombatEncounter(localSnapshot, remoteSnapshot, seed)
      : runDatingEncounter(localSnapshot, remoteSnapshot, seed);

    const applied = applyEncounterOutcome(this.state, outcome);
    if (!applied.ok) {
      this.handleExchangeFailure(applied.message || "Encounter could not be applied.", true);
      return;
    }

    this.gameScene.syncVisuals();
    saveState(this.state, "ui:link-encounter-result");

    try {
      await completeLinkSession(this.exchangeSessionCode, this.exchangeRole);
    } catch (_error) {
      // The local result has already been applied; session completion is best-effort cleanup.
    }

    const summary = outcome.summary;
    this.resetExchangeRuntime();
    this.showMessage(summary, true);
  }

  async maybeResolveLinkGameSession() {
    if (this.exchangeMode !== "game") {
      return;
    }

    if (!this.pendingLinkGameItem) {
      return;
    }

    if (!this.linkGameStateSent) {
      await this.sendLinkGameStateIfReady({ ready: this.localLinkGameReady, countdownStarted: false, countdownEndsAt: 0 });
      if (!this.remoteLinkGameState) {
        return;
      }
    }

    const remoteState = this.remoteLinkGameState || {};
    if (remoteState.syncState && !this.linkGameSyncState) {
      this.linkGameSyncState = remoteState.syncState;
    }

    if (remoteState.countdownStarted && remoteState.countdownEndsAt) {
      this.linkGameCountdownEndsAt = remoteState.countdownEndsAt;
      if (this.view !== "minigame" && this.view !== "link-game-result") {
        this.view = "link-game-countdown";
      }
    }

    if (this.view === "link-game-ready" && this.exchangeRole === "host") {
      const localReady = this.localLinkGameReady;
      const remoteReady = !!remoteState.ready;
      if (localReady && remoteReady && !remoteState.countdownStarted) {
        const countdownEndsAt = Date.now() + LINK_GAME_COUNTDOWN_MS;
        this.linkGameCountdownEndsAt = countdownEndsAt;
        await this.sendLinkGameStateIfReady({
          ready: true,
          countdownStarted: true,
          countdownEndsAt
        });
        this.view = "link-game-countdown";
      }
    }

    if (!this.remoteLinkGameResult || this.view !== "link-game-result") {
      return;
    }

    const localScore = this.miniGame.result?.score ?? 0;
    const remoteScore = this.getRemoteLinkGameScore();
    const outcome = this.resolveLinkGameOutcome(localScore, remoteScore);
    if (!this.linkGameOutcome) {
      this.linkGameOutcome = outcome;
      applyLinkGameBetOutcome(this.state, this.pendingLinkGameBet, outcome);
      this.gameScene.syncVisuals();
      saveState(this.state, "ui:link-game-result");
    }

    if (!this.linkGameResultTimer) {
      this.linkGameResultTimer = this.time.delayedCall(LINK_GAME_RESULT_DURATION_MS, async () => {
        const code = this.exchangeSessionCode;
        const role = this.exchangeRole;
        this.resetExchangeRuntime();
        this.activeMiniGameItem = null;
        this.miniGame = createMiniGameState();
        this.view = "pet";
        this.menuPath = [];
        this.render(this.state);
        if (code && role) {
          try {
            await completeLinkSession(code, role);
          } catch (_error) {
            // Best effort cleanup.
          }
        }
      });
    }
  }

  buildJoinSubmenuReturnState(mode) {
    const isDating = mode === "dating";
    const view = isDating ? "link-dating" : "link-battle";
    const parentLabel = isDating ? "DATING" : "BATTLE";
    return {
      view,
      menuPath: [
        { key: "main", label: "" },
        { key: "link", label: "LINK" },
        { key: view, label: parentLabel }
      ]
    };
  }

  async handleExchangeFailure(message, shouldCloseRemote = false, options = {}) {
    const code = this.exchangeSessionCode;
    this.resetExchangeRuntime();
    this.lastExchangeError = message;
    if (shouldCloseRemote && code) {
      try {
        await closeLinkSession(code);
      } catch (_error) {
        // Ignore cleanup errors after a local failure.
      }
    }
    const returnState = options.returnState || (options.returnToSubmenu ? this.buildJoinSubmenuReturnState(options.mode) : null);
    this.showMessage(message, false, { returnState });
  }

  handleEncounterMenuAction(actionKey) {
    if (actionKey === "link-game-join") {
      this.startJoinedGame();
      return;
    }

    if (String(actionKey || "").startsWith("link-game-bet-")) {
      this.startHostedGame(this.getLinkGameBetFromItemKey(actionKey));
      return;
    }

    switch (actionKey) {
      case "link-battle-host":
        this.startHostedEncounter("combat");
        return;
      case "link-battle-join":
        this.startJoinedEncounter("combat");
        return;
      case "link-dating-host":
        this.startHostedEncounter("dating");
        return;
      case "link-dating-join":
        this.startJoinedEncounter("dating");
        return;
      default:
        break;
    }
  }

  showActionAnimation(action) {
    const config = ACTION_ANIMATION_CONFIG[action] || { durationMs: 2000, nextView: "pet" };
    this.actionAnimationTimer?.remove(false);
    this.currentActionAnimation = action;
    this.view = "action-animation";
    this.inputLockedUntil = this.time.now + config.durationMs;
    this.render(this.state);
    this.actionAnimationTimer = this.time.delayedCall(config.durationMs, () => {
      this.finishActionAnimation(action, config);
    });
  }

  skipActionAnimation() {
    if (this.view !== "action-animation") {
      return;
    }

    const action = this.currentActionAnimation;
    const config = ACTION_ANIMATION_CONFIG[action] || { durationMs: 2000, nextView: "pet" };
    this.actionAnimationTimer?.remove(false);
    this.finishActionAnimation(action, config);
  }

  finishActionAnimation(action, config) {
    this.actionAnimationTimer = null;
    this.currentActionAnimation = null;
    this.inputLockedUntil = 0;

    this.view = config.nextView;
    this.render(this.state);
  }

  getSuccessMessage(action) {
    switch (action) {
      case "meal":
        return "Rice served.";
      case "snack":
        return "Snack served.";
      case "medicine":
        return "Medicine used.";
      case "clean":
        return "Room cleaned.";
      case "sleep":
        return "Lights off.";
      default:
        return "Done.";
    }
  }

  startMiniGame(item) {
    this.clearQuickMatchHitFlash();
    this.activeMiniGameItem = item;
    this.miniGame = initializeMiniGameSession(
      item,
      (pool) => Phaser.Utils.Array.GetRandom(pool),
      this.exchangeMode === "game" ? this.linkGameSyncState : null
    );
    this.view = "minigame";
    this.render(this.state);
  }

  handleMiniGameInput(button) {
    if (this.exchangeMode === "game" && button === "cancel") {
      return;
    }

    const outcome = applyMiniGameInput(this.miniGame, this.activeMiniGameItem, button);
    this.miniGame = outcome.miniGame;

    if (outcome.type === "cancel") {
      this.finishMiniGame(true);
      return;
    }

    if (outcome.type === "complete") {
      this.clearQuickMatchHitFlash();
      this.finishMiniGame(false);
      return;
    }

    if (outcome.type === "update") {
      if (this.getMiniGameType() === "sequence-match") {
        this.triggerQuickMatchHitFlash();
      }
      this.render(this.state);
    }
  }

  finalizeMiniGameResult() {
    this.miniGame = finalizeMiniGameResult(this.miniGame, this.activeMiniGameItem);
  }

  finishMiniGame(cancelled = false) {
    if (!this.miniGame.active) {
      return;
    }

    this.clearQuickMatchHitFlash();
    this.miniGame.active = false;

    if (cancelled) {
      this.activeMiniGameItem = null;
      this.view = "pet";
      this.render(this.state);
      return;
    }

    this.finalizeMiniGameResult();
    const rewardContext = {
      score: this.miniGame.score,
      taps: this.miniGame.score,
      success: this.miniGame.success,
      progress: this.miniGame.progress,
      targetCount: this.miniGame.sequence.length
    };
    const resolvedEffects = resolveEffectStatus(this.activeMiniGameItem?.effectStatus, rewardContext);
    this.miniGame.result.resolvedEffects = resolvedEffects;
    const result = addMiniGameReward(
      this.state,
      resolvedEffects,
      rewardContext
    );
    if (!result.ok) {
      this.activeMiniGameItem = null;
      this.showMessage(result.message || "Unable to finish the mini game.", false);
      return;
    }

    this.gameScene.syncVisuals();
    saveState(this.state, "ui:minigame-reward");
    if (this.exchangeMode === "game") {
      this.showLinkedGameSummary();
      return;
    }
    this.showMiniGameSummary();
  }

  getMiniGameStatusText() {
    return buildMiniGameStatusText(this.miniGame, this.activeMiniGameItem);
  }

  getMiniGameSummaryText() {
    return buildMiniGameSummaryText(this.miniGame, this.activeMiniGameItem);
  }

  closeMiniGameSummary() {
    this.summaryTimer?.remove(false);
    this.summaryTimer = null;
    this.inputLockedUntil = 0;
    this.view = "pet";
    this.activeMiniGameItem = null;
    this.render(this.state);
  }

  showMiniGameSummary() {
    this.summaryTimer?.remove(false);
    this.summaryTimer = null;
    this.view = "summary";
    this.inputLockedUntil = this.time.now + MINI_GAME_SUMMARY_INPUT_LOCK_MS;
    this.render(this.state);
    this.summaryTimer = this.time.delayedCall(MINI_GAME_SUMMARY_DURATION_MS, () => {
      this.closeMiniGameSummary();
    });
  }

  async showLinkedGameSummary() {
    this.view = "link-game-result";
    this.linkGameOutcome = "";
    await this.sendLinkGameResultIfReady();
    this.render(this.state);
  }

  isInputLocked() {
    return this.time.now < this.inputLockedUntil || this.isEvolutionAnimationActive || this.isMediaPreviewInputLocked();
  }

  boostSleepingEnergy() {
    if (!this.state.isSleeping) {
      return;
    }

    let wokeUp = false;
    this.state.energy = Math.min(100, this.state.energy + SLEEP_OK_ENERGY_BOOST);
    if (this.state.energy >= 100) {
      this.state.isSleeping = false;
      this.state.actionLockUntil = 0;
      wokeUp = true;
    }

    this.gameScene.syncVisuals();
    saveState(this.state, "ui:sleep-boost");
    if (wokeUp) {
      this.gameSynth.playEvolutionCue("sleep");
      this.openMediaPreview({
        assetKey: "ui-reaction-happy",
        inputLockMs: -1,
        autoCloseMs: 1000,
        returnMode: "pet"
      });
      return;
    }
    this.render(this.state);
  }

  setMenuIcon(iconKey) {
    const markup = this.getUiAssetMarkup(iconKey);
    this.screenMenuIcon.innerHTML = markup;
    this.screenMenuIcon.classList.toggle("hidden", !markup);
    this.screenMenuIcon.classList.remove("action-icon");
  }

  setActionAnimationIcon(action) {
    const config = ACTION_ANIMATION_CONFIG[action] || {};
    const assetKey = config.assetKey || (action === "clean"
      ? "cleaning-room"
      : (action === "snack" ? "feeding-snack" : "feeding-meal"));
    this.screenMenuIcon.innerHTML = this.getUiAssetMarkup(assetKey);
    this.screenMenuIcon.classList.toggle("hidden", !this.screenMenuIcon.innerHTML);
    this.screenMenuIcon.classList.add("action-icon");
  }

  getUiAssetMarkup(assetKey) {
    return this.cache.text.get(`ui-${assetKey}`) || "";
  }

  hasUiAsset(assetKey) {
    if (!assetKey) {
      return false;
    }

    return !!this.getUiAssetMarkup(assetKey);
  }

  getMenuIconKey(item) {
    if (!item) {
      return "";
    }

    if (typeof item.icon === "string" && item.icon) {
      return item.icon;
    }

    if (typeof item.key === "string" && this.hasUiAsset(item.key)) {
      return item.key;
    }

    return "default-menu";
  }

  setPetMoodText(text = "") {
    this.petMood.textContent = text;
    this.petMood.classList.remove("pet-mood-icon");
    this.petMood.classList.toggle("hidden", !text);
  }

  setPetMoodIcon(iconKeys = []) {
    const markup = iconKeys
      .map((iconKey) => this.getUiAssetMarkup(iconKey))
      .filter(Boolean)
      .map((iconMarkup) => `<span class="pet-mood-icon-item">${iconMarkup}</span>`)
      .join("");
    this.petMood.innerHTML = markup;
    this.petMood.classList.toggle("pet-mood-icon", !!markup);
    this.petMood.classList.toggle("hidden", !markup);
  }

  getMiniGameConfig() {
    return this.activeMiniGameItem?.minigame || {};
  }

  getMiniGameTitle() {
    return this.activeMiniGameItem?.name || this.activeMiniGameItem?.label || "Mini Game";
  }

  getMiniGameIcon() {
    return this.activeMiniGameItem?.icon || "play";
  }

  getMiniGameType() {
    return this.activeMiniGameItem?.minigame?.type || "tap-count";
  }

  isTextMiniGamePlayView() {
    return this.view === "minigame" && ["sequence-match", "tap-count"].includes(this.getMiniGameType());
  }

  getMiniGameTimeLeftText() {
    return `${Math.max(0, this.miniGame.duration - this.miniGame.elapsed).toFixed(1)}s`;
  }

  getSequenceMatchPlayMarkup() {
    const inputPrompt = this.getMiniGameConfig().inputPrompt || "Match buttons";
    const nextButton = getSequenceMatchNextButtonLabel(this.miniGame);
    const progressText = `MATCH ${this.miniGame.progress}/${this.miniGame.sequence.length}`;
    const nextButtonClasses = `quick-match-next-button${this.quickMatchHitFlashActive ? " hidden-feedback" : ""}`;

    return `
      <div class="mini-game-play mini-game-play-sequence-match">
      <div class="${nextButtonClasses}">${nextButton}</div>
      <div class="mini-game-play-meta">${progressText}</div>
      <div class="mini-game-play-timer">${this.getMiniGameTimeLeftText()}</div>
      <div class="mini-game-play-prompt">${inputPrompt}</div>
      </div>
    `;
  }

  getTapCountPlayMarkup() {
    const inputPrompt = this.getMiniGameConfig().inputPrompt || "O play  X exit";
    const scoreUnit = (this.getMiniGameConfig().scoreUnit || "taps").toUpperCase();

    return `
      <div class="mini-game-play mini-game-play-tap-count">
      <div class="mini-game-play-count">${this.miniGame.score}</div>
      <div class="mini-game-play-meta">${scoreUnit}</div>
      <div class="mini-game-play-timer">${this.getMiniGameTimeLeftText()}</div>
      <div class="mini-game-play-prompt">${inputPrompt}</div>
      </div>
    `;
  }

  getMiniGamePlayMarkup() {
    if (this.getMiniGameType() === "tap-count") {
      return this.getTapCountPlayMarkup();
    }

    if (this.getMiniGameType() === "sequence-match") {
      return this.getSequenceMatchPlayMarkup();
    }

    return `
      <div class="mini-game-play">
        <div class="mini-game-play-prompt">${this.getMiniGameStatusText()}</div>
      </div>
    `;
  }

  getVisibleMenuItems(menuKey) {
    if (menuKey === "debug-evolve-species") {
      return Object.entries(PET_CATALOG).map(([speciesId, petData]) => ({
        key: `debug-evolve-to-${speciesId}`,
        label: petData.specieName.toUpperCase(),
        caption: `Force evolution to ${petData.specieName}.`,
        icon: ""
      }));
    }

    if (menuKey === "adventure-stage") {
      return getAdventureStageMenuItems(this.state);
    }

    const menu = MENUS[menuKey];
    const items = menu?.items;
    if (!items) {
      return null;
    }

    return items.filter((item) => {
      if (typeof menu.visibleWhen === "function") {
        return menu.visibleWhen(item, this.state);
      }

      if (typeof item.visibleWhen === "function") {
        return item.visibleWhen(this.state);
      }

      return item.visibleWhen !== false;
    });
  }

  getMenuItemTitle(item) {
    if (typeof item.name === "function") {
      return item.name(this.state);
    }
    // if (item.label) {
    //   return item.label;
    // }
    // if (item.key && !item.name) {
    //   return buildInventoryItemName(item.key)(this.state);
    // }
    return item.name || item.label;
  }

  showMessage(text, success = true, options = {}) {
    this.view = "message";
    this.messageText = text;
    this.messageSuccess = success;
    this.messageReturnState = options.returnState || null;
    this.render(this.state);
  }

  setMenuIndicator(count = 0, activeIndex = 0) {
    if (!this.screenMenuIndicator) {
      return;
    }

    if (count <= 1) {
      this.screenMenuIndicator.innerHTML = "";
      this.screenMenuIndicator.classList.add("hidden");
      return;
    }

    this.screenMenuIndicator.innerHTML = Array.from(
      { length: count },
      (_value, index) => `<span class="screen-menu-dot${index === activeIndex ? " active" : ""}"></span>`
    ).join("");
    this.screenMenuIndicator.classList.remove("hidden");
  }

  setMenuParent(text = "") {
    // console.log('setMenuParent()', text);
    if (!this.screenMenuParent) {
      return;
    }

    if (text == "SHOP") {
      text = `MONEY : ${this.state.money}G`;
    }

    this.screenMenuParent.textContent = text;
    this.screenMenuParent.classList.toggle("hidden", !text);
  }

  pushMenuPath(key, label) {
    const existingIndex = this.menuPath.findIndex((entry) => entry.key === key);
    const nextEntry = { key, label };
    if (existingIndex >= 0) {
      this.menuPath = this.menuPath.slice(0, existingIndex);
    }
    this.menuPath.push(nextEntry);
  }

  getMenuParentText() {
    if (this.menuPath.length <= 1) {
      return "";
    }

    return this.menuPath
      .slice(1)
      .map((entry) => entry.label)
      .join(" / ");
  }

  getStatusPages(state) {
    const needList = getNeedList(state);
    const petConfig = PET_CATALOG[state.petId] || PET_CATALOG[DEFAULT_PET_ID];
    const specieName = petConfig.specieName || state.petId;
    const combatElements = getPetCombatElements(state);

    return [
      {
        title: "Info",
        lines: [
          ["Specie ".padStart(14), `${specieName}`],
          ["Attack Element".padStart(18), formatPetElementLabel(combatElements.attackElement)],
          ["Defense Element".padStart(18), formatPetElementLabel(combatElements.defenseElement)],
          ...(combatElements.attackElementRemainingSeconds
            ? [["Buff Remaining".padStart(18), `${Math.floor(combatElements.attackElementRemainingSeconds / 60)}:${String(combatElements.attackElementRemainingSeconds % 60).padStart(2, "0")}`]]
            : []),
          ["Age    ".padStart(14), `${state.ageMinutes}m`],
          ["Stage  ".padStart(14), state.evolutionStage],
          ["Health ".padStart(14), Math.round(state.health)],
          ["Love   ".padStart(14), Math.round(state.love ?? 0)],
          ["Money  ".padStart(14), `${Math.round(state.money)}G`]
        ]
      },
      {
        title: "Needs",
        lines: [
          ["Hunger    ".padStart(16), Math.round(state.hunger)],
          ["Happiness ".padStart(16), Math.round(state.happiness)],
          ["Energy    ".padStart(16), Math.round(state.energy)],
          ["Weight    ".padStart(16), Math.round(state.weight)],
          "separator",
          ...(needList.length
            ? [`Your pet need(s) \n${needList.join(", ")}`]
            : ["Your pet is happy."])
        ]
      },

      {
        title: "Status",
        lines: getRpgStatStatusLines(state)
      }
    ];
  }

  stepStatusPage(button) {
    const pages = this.getStatusPages(this.state);
    if (pages.length <= 1) {
      return;
    }

    const delta = button === "right" ? 1 : -1;
    this.statusPageIndex = (this.statusPageIndex + delta + pages.length) % pages.length;
    this.render(this.state);
  }

  openMainMenu(options = {}) {
    const { selectLastItem = false } = options;
    Object.keys(this.menuIndexes).forEach((menuKey) => {
      this.menuIndexes[menuKey] = 0;
    });
    if (selectLastItem) {
      const mainItems = this.getVisibleMenuItems("main") || [];
      this.menuIndexes.main = Math.max(0, mainItems.length - 1);
    }
    this.menuPath = [{ key: "main", label: "" }];
    this.view = "main";
    this.render(this.state);
  }

  openDeadMenu() {
    this.menuIndexes.dead = 0;
    this.menuPath = [{ key: "dead", label: "New Egg" }];
    this.view = "dead";
    this.render(this.state);
  }

  handleAdventureStageSelection(item) {
    const stageId = String(item?.stageId || "").trim();
    const stageConfig = getAdventureStageConfig(stageId);
    if (!stageConfig) {
      this.showMessage("That adventure stage is unavailable.", false);
      return;
    }

    const unlockState = getAdventureStageUnlockState(this.state, stageConfig);
    if (!unlockState.unlocked) {
      this.showMessage(unlockState.reason || "That stage is locked.", false, {
        returnState: {
          view: this.view,
          menuPath: this.menuPath.map((entry) => ({ ...entry }))
        }
      });
      return;
    }

    this.startAdventureFlow(stageConfig);
  }

  startAdventureFlow(stageConfig) {
    if (this.adventureFlowActive) {
      return;
    }

    this.adventureFlowActive = true;
    this.menuPath = [];
    this.statusPageIndex = 0;
    this.view = "pet";
    this.render(this.state);
    if (this.gameScene?.scene?.isActive()) {
      this.scene.pause("GameScene");
    }
    const seed = `${stageConfig.id}:${Date.now()}:${this.state.petId}:${this.state.ageMinutes}`;
    this.scene.launch("AdventureScene", {
      stageId: stageConfig.id,
      seed,
      autoCloseSummary: true
    });
  }

  setAdventureFlowActive(isActive) {
    this.adventureFlowActive = !!isActive;
  }

  onAdventureFlowComplete(result = {}) {
    this.adventureFlowActive = false;
    this.state = this.registry.get("petState");
    this.scene.resume("GameScene");
    this.gameScene = this.scene.get("GameScene");

    if (this.gameScene?.syncVisuals) {
      this.gameScene.syncVisuals();
    }

    this.menuPath = [];
    this.statusPageIndex = 0;
    this.view = "pet";
    this.render(this.state);

    if (!result?.success && !result?.aborted) {
      this.showMessage("Adventure failed. Your pet became sick.", false, {
        returnState: {
          view: "pet",
          menuPath: []
        }
      });
    }
  }

  closeMenu() {
    if (this.view === "minigame") {
      this.finishMiniGame(true);
      return;
    }

    if (this.view === MEDIA_PREVIEW_VIEW) {
      this.closeMediaPreview();
      return;
    }

    if (this.view === "link-code-entry") {
      this.resetJoinCodeEntry();
    }

    if (this.view === "link-host-code") {
      this.resetExchangeRuntime();
    }

    if (this.view === "link-game-ready" || this.view === "link-game-countdown" || this.view === "link-game-result") {
      this.resetExchangeRuntime();
    }

    if (this.view === "message" && this.messageReturnState) {

      if (typeof this.messageReturnState.callback === "function") {
        try {
          this.messageReturnState.callback.call();
        } catch (error) {
          console.warn("Failed to resolve message returnState callback.", error);
          resolvedReturnState = null;
        }
      }

      this.view = this.messageReturnState.view;
      this.menuPath = this.messageReturnState.menuPath.map((entry) => ({ ...entry }));
      this.messageReturnState = null;
      this.render(this.state);
      return;
    }

    this.menuPath = [];
    this.statusPageIndex = 0;
    this.view = "pet";
    this.messageReturnState = null;
    this.render(this.state);
  }

  restartGame() {
    if (this.isRestarting) {
      return;
    }

    this.isRestarting = true;
    if (this.gameScene) {
      this.gameScene.events.off("state-changed", this.handleStateChanged, this);
      this.gameScene.events.off("evolution-transition-changed", this.handleEvolutionAnimationChanged, this);
    }

    clearState();
    const freshState = createNewState();
    this.registry.set("petState", freshState);
    this.state = freshState;
    this.menuPath = [];
    this.statusPageIndex = 0;
    this.view = "pet";
    this.inputLockedUntil = 0;
    this.isEvolutionAnimationActive = false;
    this.summaryTimer?.remove(false);
    this.summaryTimer = null;
    this.actionAnimationTimer?.remove(false);
    this.actionAnimationTimer = null;
    this.clearQuickMatchHitFlash();
    this.currentActionAnimation = null;
    this.activeMiniGameItem = null;
    this.messageReturnState = null;
    this.clearMediaPreviewRuntime();
    this.resetExchangeRuntime();
    this.adventureFlowActive = false;
    saveState(freshState, "ui:restart-game");
    this.render(freshState);
    this.scene.stop("GameScene");
    ensurePetStageAssetsLoaded(this, freshState.petId, freshState.evolutionStage)
      .catch((error) => {
        console.warn("Failed to preload restart pet assets.", error);
      })
      .finally(() => {
        this.isRestarting = false;
        this.scene.start("GameScene");
        this.gameScene = this.scene.get("GameScene");
        this.gameScene.events.on("state-changed", this.handleStateChanged, this);
        this.gameScene.events.on("evolution-transition-changed", this.handleEvolutionAnimationChanged, this);
        this.render(freshState);
      });
  }

  renderScreenMenu(state) {
    const petNeedIconKeys = getPetNeedIconKeys(state);
    const shouldShowNeedIcon = petNeedIconKeys.length > 0;
    const mediaPreviewActive = this.view === MEDIA_PREVIEW_VIEW;

    this.brandTitle.textContent = "Pocket Pet";
    this.brandStatus.textContent = state.isAlive ? "Pet View" : "New Egg";
    const fullScreenMenu = this.view !== "pet";
    const eggCountdownSeconds = getEggHatchSecondsRemaining(state, this.gameScene?.elapsedAccumulator ?? 0);
    const shouldShowEggCountdown = state.evolutionStage === "egg" && !fullScreenMenu;
    const shouldShowSleepEnergy = state.isSleeping && !fullScreenMenu;
    const shouldShowDeadText = !state.isAlive && !fullScreenMenu;
    if (this.gameScene?.scene?.isActive()) {
      this.gameScene.setMenuVisible(fullScreenMenu);
    }
    this.screenMenu.classList.toggle("status-view", this.view === "status");
    this.screenMenu.classList.toggle("action-animation-view", this.view === "action-animation");
    this.screenMenu.classList.toggle("mini-game-play-view", this.isTextMiniGamePlayView());
    const inputLocked = this.isInputLocked();
    const allowFeedSkip = this.view === "action-animation";
    this.hardwareLeft.disabled = inputLocked;
    this.hardwareRight.disabled = inputLocked;
    this.hardwareCancel.disabled = inputLocked && !allowFeedSkip;
    this.hardwareOk.disabled = inputLocked && !allowFeedSkip;
    if (this.mediaPreviewContainer) {
      this.mediaPreviewContainer.classList.toggle("hidden", !mediaPreviewActive);
      this.mediaPreviewContainer.setAttribute("aria-hidden", mediaPreviewActive ? "false" : "true");
    }
    this.petMood.textContent = `Mood: ${getMoodList(state).join(" • ")}`;
    if (fullScreenMenu) {
      this.petMood.classList.add("hidden");
      this.petMood.classList.remove("pet-mood-icon");
    } else if (shouldShowEggCountdown) {
      this.setPetMoodText(`Hatch in: ${formatCountdown(eggCountdownSeconds)} \nPress O button to increase hatch speed`);
    } else if (shouldShowSleepEnergy) {
      this.setPetMoodText(`Energy: ${Math.round(state.energy)}`);
    } else if (shouldShowDeadText) {
      this.setPetMoodText("Your pet is dead.\nGet a new egg to continue.");
    } else if (shouldShowNeedIcon) {
      this.setPetMoodIcon(petNeedIconKeys);
    } else {
      this.petMood.classList.add("hidden");
      this.petMood.classList.remove("pet-mood-icon");
    }

    if (!fullScreenMenu) {
      this.screenMenu.classList.add("hidden");
      this.setMenuParent("");
      this.setMenuIndicator(0, 0);
      return;
    }

    this.screenMenu.classList.remove("hidden");

    if (isMenuView(this.view)) {
      const menu = MENUS[this.view];
      const items = this.getVisibleMenuItems(this.view) || [];
      if (!items.length) {
        this.setMenuParent(this.getMenuParentText());
        this.setMenuIcon("");
        this.screenMenuTitle.textContent = "EMPTY";
        this.screenMenuStatus.textContent = "No items available.";
        this.setMenuIndicator(0, 0);
        return;
      }

      this.menuIndexes[this.view] = Math.min(this.menuIndexes[this.view], items.length - 1);
      const item = items[this.menuIndexes[this.view]];
      this.setMenuParent(this.getMenuParentText());
      this.setMenuIcon(this.getMenuIconKey(item));
      this.screenMenuTitle.textContent = this.getMenuItemTitle(item);

      const parentMenuKey = this.getParentMenuKey();
      if (parentMenuKey == "shop") {
        this.screenMenuStatus.textContent = getShopExtraCaption(item, state) + getMenuCaption(menu, item, state, {
          scene: this,
          remoteEncounterSnapshot: this.remoteEncounterSnapshot
        });
      }
      else {
        this.screenMenuStatus.textContent = getMenuCaption(menu, item, state, {
          scene: this,
          remoteEncounterSnapshot: this.remoteEncounterSnapshot
        });
      }

      this.setMenuIndicator(items.length, this.menuIndexes[this.view]);
      return;
    }

    if (this.view === "status") {
      this.setMenuParent("");
      this.setMenuIcon("");
      const pages = this.getStatusPages(state);
      const page = pages[this.statusPageIndex] || pages[0];
      const pageLines = Array.isArray(page?.lines) ? page.lines : [String(page?.lines ?? "")];
      this.statusPageIndex = Math.min(this.statusPageIndex, pages.length - 1);
      this.screenMenuTitle.textContent = page.title;
      this.screenMenuStatus.innerHTML = `<div class="status-lines"><div class="status-separator" aria-hidden="true"></div>${pageLines
        .map(
          (line) =>
            line === "separator"
              ? `<div class="status-separator" aria-hidden="true"></div>`
              : Array.isArray(line)
                ? `<div class="status-line"><span class="status-name">${line[0].replace(/[" "]/g, "&nbsp;")}:</span> <span class="status-value">${line[1]}</span></div>`
                : `<div class="status-line status-line-text">${line}</div>`
        )
        .join("")}<div class="status-separator" aria-hidden="true"></div><div class="status-line"></div></div>`;
      this.setMenuIndicator(pages.length, this.statusPageIndex);
      return;
    }

    if (this.view === "message") {
      this.setMenuParent("");
      this.setMenuIcon("message");
      this.screenMenuTitle.textContent = this.messageSuccess ? "Done" : "Notice";
      this.screenMenuStatus.textContent = this.messageText;
      this.setMenuIndicator(0, 0);
      return;
    }

    if (this.view === MEDIA_PREVIEW_VIEW) {
      const autoCloseText = this.mediaPreview?.autoCloseMs === -1
        ? "Auto close: off"
        : `Auto close: ${Math.max(0, this.mediaPreview?.autoCloseMs || 0)}ms`;
      const lockText = this.mediaPreview?.inputLockMs === -1
        ? "Input lock: until preview closes"
        : `Input lock: ${Math.max(0, this.mediaPreview?.inputLockMs || 0)}ms`;
      this.setMenuParent(this.getMediaPreviewParentText());
      this.setMenuIcon("");
      this.screenMenuTitle.textContent = (this.mediaPreview?.mediaType || "media").toUpperCase();
      this.screenMenuStatus.textContent = [
        `Asset: ${this.mediaPreview?.assetKey || "-"}`,
        lockText,
        autoCloseText,
        "",
        this.isMediaPreviewInputLocked() ? "Input locked" : "Press O or X to exit"
      ].join("\n");
      this.setMenuIndicator(0, 0);
      return;
    }

    if (this.view === "link-code-entry") {
      const parentText = this.pendingJoinMode === "dating"
        ? "DATING / JOIN"
        : this.pendingJoinMode === "game"
          ? "GAME / JOIN"
          : "BATTLE / JOIN";
      this.setMenuIcon("");
      this.setMenuParent(parentText);
      this.screenMenuTitle.textContent = "ENTER CODE";
      this.screenMenuStatus.textContent = [
        this.getJoinCodeDisplay(),
        "",
        "< > O = enter code",
        "X = back / cancel",
        `${this.joinCodeSequence.length}/6 entered`
      ].join("\n");
      this.setMenuIndicator(0, 0);
      return;
    }

    if (this.view === "link-host-code") {
      const parentText = this.exchangeMode === "dating" ? "DATING / HOST" : "BATTLE / HOST";
      this.setMenuIcon("");
      this.setMenuParent(parentText);
      this.screenMenuTitle.textContent = "HOST CODE";
      this.screenMenuStatus.textContent = [
        this.exchangeSessionCode ? this.exchangeSessionCode.split("").join(" ") : "_ _ _ _ _ _",
        "",
        "Share this 6-button code",
        `STATE ${this.exchangeConnectionState.toUpperCase()}`,
        "",
        "X = cancel room"
      ].join("\n");
      this.setMenuIndicator(0, 0);
      return;
    }

    if (this.view === "link-game-ready") {
      const remoteReady = !!this.remoteLinkGameState?.ready;
      this.setMenuParent("GAME");
      this.setMenuIcon("play");
      this.screenMenuTitle.textContent = this.getPendingLinkGameTitle();
      this.screenMenuStatus.textContent = [
        `BET ${this.pendingLinkGameBet}G`,
        "",
        `YOU ${this.localLinkGameReady ? "READY" : "WAIT"}`,
        `RIVAL ${remoteReady ? "READY" : "WAIT"}`,
        "",
        this.exchangeSessionCode ? `CODE ${this.exchangeSessionCode.split("").join(" ")}` : "",
        "Press O to ready",
        "Press X to cancel"
      ].filter(Boolean).join("\n");
      this.setMenuIndicator(0, 0);
      return;
    }

    if (this.view === "link-game-countdown") {
      const secondsRemaining = Math.max(0, Math.ceil((this.linkGameCountdownEndsAt - Date.now()) / 1000));
      this.setMenuParent("GAME");
      this.setMenuIcon("play");
      this.screenMenuTitle.textContent = this.getPendingLinkGameTitle();
      this.screenMenuStatus.textContent = [
        `BET ${this.pendingLinkGameBet}G`,
        "",
        secondsRemaining > 0 ? `START ${secondsRemaining}` : "START!"
      ].join("\n");
      this.setMenuIndicator(0, 0);
      return;
    }

    if (this.view === "link-game-result") {
      const localScore = this.miniGame.result?.score ?? this.miniGame.score;
      const remoteScore = this.getRemoteLinkGameScore();
      this.setMenuParent("GAME");
      this.setMenuIcon("summary");
      this.screenMenuTitle.textContent = this.remoteLinkGameResult
        ? this.formatLinkGameOutcome(this.linkGameOutcome || this.resolveLinkGameOutcome(localScore, remoteScore))
        : "WAIT";
      this.screenMenuStatus.textContent = [
        `YOU ${localScore}`,
        `RIVAL ${this.remoteLinkGameResult ? remoteScore : "..."}`,
        `BET ${this.pendingLinkGameBet}G`
      ].join("\n");
      this.setMenuIndicator(0, 0);
      return;
    }

    if (this.view === "minigame") {
      this.setMenuParent(this.getMenuParentText());
      this.screenMenuTitle.textContent = this.getMiniGameTitle();
      if (this.isTextMiniGamePlayView()) {
        this.setMenuIcon("");
        this.screenMenuStatus.innerHTML = this.getMiniGamePlayMarkup();
      } else {
        this.setMenuIcon(this.getMiniGameIcon());
        this.screenMenuStatus.textContent = this.getMiniGameStatusText();
      }
      this.setMenuIndicator(0, 0);
      return;
    }

    if (this.view === "summary") {
      this.setMenuParent(this.getMenuParentText());
      this.setMenuIcon("summary");
      this.screenMenuTitle.textContent = this.getMiniGameConfig().summaryTitle || "Result";
      this.screenMenuStatus.textContent = this.getMiniGameSummaryText() + "\n\nPress any key to continue.";
      this.setMenuIndicator(0, 0);
      return;
    }

    if (this.view === "action-animation") {
      const actionConfig = ACTION_ANIMATION_CONFIG[this.currentActionAnimation] || {};
      const parentLabel = actionConfig.parentLabel || (this.currentActionAnimation === "clean" ? "CLEAN" : "FEED");
      this.setMenuParent(parentLabel);
      this.setActionAnimationIcon(this.currentActionAnimation);
      return;
    }
  }

  render(state) {
    this.renderScreenMenu(state);
  }

  update(_time, delta) {
    if (this.view === "pet" && this.state?.isAlive && this.state.evolutionStage === "egg") {
      this.render(this.state);
    }

    if (this.view === "link-game-countdown" && this.linkGameCountdownEndsAt && Date.now() >= this.linkGameCountdownEndsAt) {
      this.linkGameCountdownEndsAt = 0;
      this.startMiniGame(this.pendingLinkGameItem);
      return;
    }

    if (!this.miniGame.active) {
      return;
    }

    this.miniGame.elapsed += delta / 1000;
    if (this.miniGame.elapsed >= this.miniGame.duration) {
      this.finishMiniGame(false);
      return;
    }

    this.render(this.state);
  }
}
