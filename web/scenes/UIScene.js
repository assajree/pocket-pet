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
  purchaseItem,
  runCombatEncounter,
  runDatingEncounter,
  saveState,
  getMoodList,
  validateExchangeSnapshot,
} from "../gameState.js";
import {
  applyMiniGameInput,
  createMiniGameSyncState,
  createMiniGameState,
  finalizeMiniGameResult,
  getMiniGameStatusText as buildMiniGameStatusText,
  getMiniGameSummaryText as buildMiniGameSummaryText,
  initializeMiniGameSession
} from "./minigames/index.js";
import { MENUS, isMenuView } from "./helpers/menus.js";
import { getMenuStatusText, buildInventoryItemName } from "./helpers/menuFormatters.js";
import {
  ACTION_ANIMATION_CONFIG,
  LINK_GAME_COUNTDOWN_MS,
  LINK_GAME_RESULT_DURATION_MS,
  MINI_GAME_SUMMARY_DURATION_MS,
  SLEEP_OK_ENERGY_BOOST
} from "./helpers/uiConfig.js";
import { getPlatformCapabilities } from "./helpers/platform.js";
import {
  closeLinkSession,
  completeLinkSession,
  fetchLinkSessionState,
  hostLinkSession,
  joinLinkSession,
  sendLinkGameResult,
  sendLinkGameState,
  uploadLinkSnapshot
} from "./helpers/linkTransport.js";

const LINK_GAME_BET_OPTIONS = [0, 10, 20, 50, 100];

const formatCountdown = (secondsRemaining) => {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = Math.max(0, secondsRemaining % 60);
  if (minutes < 1) {
    return `${seconds}`;
  }
  return `${minutes}:${seconds}`;
};

const getPetNeedIconKeys = (state) => {
  if (!state.isAlive || state.evolutionStage === "Egg") {
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
    this.platformCapabilities = getPlatformCapabilities();
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
      saveState(state);
    };
    this.handleEvolutionAnimationChanged = (isActive) => {
      this.isEvolutionAnimationActive = !!isActive;
      this.render(this.state);
    };

    this.gameScene.events.on("state-changed", this.handleStateChanged, this);
    this.gameScene.events.on("evolution-animation-changed", this.handleEvolutionAnimationChanged, this);
    this.events.on("shutdown", () => {
      this.stopExchangePolling();
      this.gameScene.events.off("state-changed", this.handleStateChanged, this);
      this.gameScene.events.off("evolution-animation-changed", this.handleEvolutionAnimationChanged, this);
      window.removeEventListener("keydown", this.handleKeydown);
      this.summaryTimer?.remove(false);
      this.actionAnimationTimer?.remove(false);
      this.linkGameResultTimer?.remove(false);
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
    this.hardwareLeft = document.getElementById("hardware-left");
    this.hardwareRight = document.getElementById("hardware-right");
    this.hardwareCancel = document.getElementById("hardware-cancel");
    this.hardwareOk = document.getElementById("hardware-ok");
  }

  bindUI() {
    if (this.uiBound) {
      return;
    }

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

    const key = event.key.toLowerCase();
    if (event.key.startsWith("Arrow") || key === "a" || key === "d" || key === "x" || key === "o") {
      event.preventDefault();
    }

    if (event.key === "ArrowLeft" || key === "a") {
      this.handleDirectionalInput("left");
      return;
    }

    if (event.key === "ArrowRight" || key === "d") {
      this.handleDirectionalInput("right");
      return;
    }

    if (key === "cancel" || key === "backspace" || key === "x") {
      this.handleDirectionalInput("cancel");
      return;
    }

    if (key === "ok" || key === "enter" || key === "o") {
      this.handleDirectionalInput("ok");
      return;
    }

    if (key === "r" && !this.state.isAlive) {
      this.restartGame();
    }
  };

  handleDirectionalInput(button) {
    if (this.view === "action-animation" && (button === "ok" || button === "cancel")) {
      this.skipActionAnimation();
      return;
    }

    if (this.isInputLocked()) {
      return;
    }

    // if (!this.state.isAlive && this.view !== "status" && button !== "cancel" && button !== "ok") {
    //   return;
    // }

    if (this.view === "pet") {
      if (this.state.isAlive && this.state.evolutionStage === "Egg") {
        const hatchStep = accelerateEggHatch(this.state, 1);
        this.gameScene.syncVisuals();
        saveState(this.state);
        if (hatchStep.changedStage) {
          this.gameScene.playEvolutionAnimation(hatchStep.previousStage, hatchStep.nextStage);
        }
        this.render(this.state);
        return;
      }

      if (button === "cancel") {
        this.statusPageIndex = 0;
        this.view = "status";
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

    if (this.view === "link-game-ready") {
      this.handleLinkGameReadyInput(button);
      return;
    }

    if (this.view === "link-game-result") {
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
        this.closeMenu();
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

  runAction(item) {
    if (item.key === "new-egg") {
      this.showActionAnimation("new-egg");
      return;
    }

    if (this.view === "shop") {
      const purchase = purchaseItem(this.state, item.key);
      saveState(this.state);
      if (purchase.ok) {
        this.render(this.state);
        return;
      }
      this.showMessage(purchase.message || "Unable to buy item.", false);
      return;
    }

    const previousStage = this.state.evolutionStage;
    const result = applyAction(this.state, item.key, item.effectStatus);
    this.gameScene.syncVisuals();
    saveState(this.state);

    if (result.ok) {
      if (previousStage !== this.state.evolutionStage) {
        this.gameScene.playEvolutionAnimation(previousStage, this.state.evolutionStage);
      }

      if (item.key === "meal" || item.key === "snack" || item.key === "clean") {
        this.showActionAnimation(item.key);
        return;
      }

        if (this.view !== "feed") {
          this.view = "pet";
        }
      this.render(this.state);
      return;
    }

    this.showMessage(result.message || this.getSuccessMessage(item.key), false);
  }

  getLocalEncounterSnapshot() {
    return createExchangeSnapshot(this.state);
  }

  resetJoinCodeEntry() {
    this.joinCodeSequence = [];
    this.pendingJoinMode = "";
  }

  canUseLocalSnapshot() {
    return !!this.state.isAlive && this.state.evolutionStage !== "Egg";
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
      this.showMessage(
        `Host ${mode === "combat" ? "battle" : "dating"} code: ${session.code.split("").join(" ")}`,
        true
      );
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

    this.resetExchangeRuntime();
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
        if (!snapshot.isAlive || snapshot.evolutionStage === "Egg") {
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
    saveState(this.state);

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
      saveState(this.state);
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
    const view = mode === "dating" ? "link-dating" : "link-battle";
    const parentLabel = mode === "dating" ? "DATING" : "BATTLE";
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

    if (action === "new-egg") {
      this.restartGame();
      return;
    }

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
      this.finishMiniGame(false);
      return;
    }

    if (outcome.type === "update") {
      this.render(this.state);
    }
  }

  finalizeMiniGameResult() {
    this.miniGame = finalizeMiniGameResult(this.miniGame);
  }

  finishMiniGame(cancelled = false) {
    if (!this.miniGame.active) {
      return;
    }

    this.miniGame.active = false;

    if (cancelled) {
      this.activeMiniGameItem = null;
      this.view = "pet";
      this.render(this.state);
      return;
    }

    this.finalizeMiniGameResult();
    const result = addMiniGameReward(
      this.state,
      this.activeMiniGameItem?.effectStatus,
      { score: this.miniGame.score, taps: this.miniGame.score, success: this.miniGame.success }
    );
    if (!result.ok) {
      this.activeMiniGameItem = null;
      this.showMessage(result.message || "Unable to finish the mini game.", false);
      return;
    }

    this.gameScene.syncVisuals();
    saveState(this.state);
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

  showMiniGameSummary() {
    this.summaryTimer?.remove(false);
    this.view = "summary";
    this.inputLockedUntil = this.time.now + MINI_GAME_SUMMARY_DURATION_MS;
    this.render(this.state);
    this.summaryTimer = this.time.delayedCall(MINI_GAME_SUMMARY_DURATION_MS, () => {
      this.inputLockedUntil = 0;
      this.view = "pet";
      this.activeMiniGameItem = null;
      this.render(this.state);
      this.summaryTimer = null;
    });
  }

  async showLinkedGameSummary() {
    this.view = "link-game-result";
    this.linkGameOutcome = "";
    await this.sendLinkGameResultIfReady();
    this.render(this.state);
  }

  isInputLocked() {
    return this.time.now < this.inputLockedUntil || this.isEvolutionAnimationActive;
  }

  boostSleepingEnergy() {
    if (!this.state.isSleeping) {
      return;
    }

    this.state.energy = Math.min(100, this.state.energy + SLEEP_OK_ENERGY_BOOST);
    if (this.state.energy >= 100) {
      this.state.isSleeping = false;
      this.state.actionLockUntil = 0;
    }

    this.gameScene.syncVisuals();
    saveState(this.state);
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
    const assetKey = config.assetKey || (action === "clean" ? "cleaning-room" : (action === "snack" ? "feeding-snack" : "feeding-meal"));
    this.screenMenuIcon.innerHTML = this.getUiAssetMarkup(assetKey);
    this.screenMenuIcon.classList.toggle("hidden", !this.screenMenuIcon.innerHTML);
    this.screenMenuIcon.classList.add("action-icon");
  }

  getUiAssetMarkup(assetKey) {
    return this.cache.text.get(`ui-${assetKey}`) || "";
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

  getVisibleMenuItems(menuKey) {
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
    if (item.label) {
      return item.label;
    }
    if (item.key && !item.name) {
      return buildInventoryItemName(item.key)(this.state);
    }
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
    if (!this.screenMenuParent) {
      return;
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

    return [
      {
        title: "Info",
        lines: [
          ["Age", `${state.ageMinutes}m`],
          ["Stage", state.evolutionStage],
          ["Health", Math.round(state.health)],
          ["Money", `${Math.round(state.money)}G`]
        ]
      },
      {
        title: "Needs",
        lines: [
          ["Hunger", Math.round(state.hunger)],
          ["Happiness", Math.round(state.happiness)],
          ["Energy", Math.round(state.energy)],
          ["Weight", Math.round(state.weight)],
          "separator",
          ...(needList.length
            ? needList.map((need) => ["Need", need])
            : ["Your pet is happy."])
        ]
      },
      {
        title: "Status",
        lines: [
          ["Str", Math.round(state.str)],
          ["Agi", Math.round(state.agi)],
          ["Int", Math.round(state.int)],
        ]
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

  closeMenu() {
    if (this.view === "minigame") {
      this.finishMiniGame(true);
      return;
    }

    if (this.view === "link-code-entry") {
      this.resetJoinCodeEntry();
    }

    if (this.view === "link-game-ready" || this.view === "link-game-countdown" || this.view === "link-game-result") {
      this.resetExchangeRuntime();
    }

    if (this.view === "message" && this.messageReturnState) {
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
    if (this.gameScene) {
      this.gameScene.events.off("state-changed", this.handleStateChanged, this);
      this.gameScene.events.off("evolution-animation-changed", this.handleEvolutionAnimationChanged, this);
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
    this.currentActionAnimation = null;
    this.activeMiniGameItem = null;
    this.messageReturnState = null;
    this.resetExchangeRuntime();
    saveState(freshState);
    this.scene.stop("GameScene");
    this.scene.start("GameScene");
    this.gameScene = this.scene.get("GameScene");
    this.gameScene.events.on("state-changed", this.handleStateChanged, this);
    this.gameScene.events.on("evolution-animation-changed", this.handleEvolutionAnimationChanged, this);
    this.render(freshState);
  }

  renderScreenMenu(state) {
    const petNeedIconKeys = getPetNeedIconKeys(state);
    const shouldShowNeedIcon = petNeedIconKeys.length > 0;

    this.brandTitle.textContent = "Pocket Pet";
    this.brandStatus.textContent = state.isAlive ? "Pet View" : "New Egg";
    const fullScreenMenu = this.view !== "pet";
    const eggCountdownSeconds = getEggHatchSecondsRemaining(state, this.gameScene?.elapsedAccumulator ?? 0);
    const shouldShowEggCountdown = state.evolutionStage === "Egg" && !fullScreenMenu;
    const shouldShowSleepEnergy = state.isSleeping && !fullScreenMenu;
    const shouldShowDeadText = !state.isAlive && !fullScreenMenu;
    this.gameScene.setMenuVisible(fullScreenMenu);
    this.screenMenu.classList.toggle("status-view", this.view === "status");
    this.screenMenu.classList.toggle("action-animation-view", this.view === "action-animation");
    const inputLocked = this.isInputLocked();
    const allowFeedSkip = this.view === "action-animation";
    this.hardwareLeft.disabled = inputLocked;
    this.hardwareRight.disabled = inputLocked;
    this.hardwareCancel.disabled = inputLocked && !allowFeedSkip;
    this.hardwareOk.disabled = inputLocked && !allowFeedSkip;
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
      this.setMenuIcon(item.icon !== undefined ? item.icon : item.key);
      this.screenMenuTitle.textContent = this.getMenuItemTitle(item);
      this.screenMenuStatus.textContent = getMenuStatusText(menu, item, state, {
        scene: this,
        remoteEncounterSnapshot: this.remoteEncounterSnapshot
      });
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
                ? `<div class="status-line"><span class="status-name">${line[0]}:</span> <span class="status-value">${line[1]}</span></div>`
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
      this.setMenuIcon(this.getMiniGameIcon());
      this.screenMenuTitle.textContent = this.getMiniGameTitle();
      this.screenMenuStatus.textContent = this.getMiniGameStatusText();
      this.setMenuIndicator(0, 0);
      return;
    }

    if (this.view === "summary") {
      this.setMenuParent(this.getMenuParentText());
      this.setMenuIcon("summary");
      this.screenMenuTitle.textContent = this.getMiniGameConfig().summaryTitle || "Result";
      this.screenMenuStatus.textContent = this.getMiniGameSummaryText();
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
    if (this.view === "pet" && this.state?.isAlive && this.state.evolutionStage === "Egg") {
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
