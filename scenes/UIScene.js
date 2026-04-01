import {
  addMiniGameReward,
  applyAction,
  clearState,
  createNewState,
  getMoodList,
  saveState
} from "../gameState.js";
import {
  applyMiniGameInput,
  createMiniGameState,
  finalizeMiniGameResult,
  getMiniGameStatusText as buildMiniGameStatusText,
  getMiniGameSummaryText as buildMiniGameSummaryText,
  initializeMiniGameSession
} from "./minigames/index.js";
import { MENUS, isMenuView } from "./menus.js";
import { getMenuStatusText } from "./menuFormatters.js";
import { FEED_ANIMATION_DURATION_MS, MINI_GAME_SUMMARY_DURATION_MS, SLEEP_OK_ENERGY_BOOST } from "./uiConfig.js";

export default class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
    this.view = "closed";
    this.menuIndexes = Object.fromEntries(Object.keys(MENUS).map((menuKey) => [menuKey, 0]));
    this.miniGame = createMiniGameState();
    this.inputLockedUntil = 0;
    this.summaryTimer = null;
    this.feedAnimationTimer = null;
    this.feedAnimationAction = null;
    this.activeMiniGameItem = null;
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

    this.gameScene.events.on("state-changed", this.handleStateChanged, this);
    this.events.on("shutdown", () => {
      this.gameScene.events.off("state-changed", this.handleStateChanged, this);
      window.removeEventListener("keydown", this.handleKeydown);
      this.summaryTimer?.remove(false);
      this.feedAnimationTimer?.remove(false);
    });
  }

  cacheDom() {
    this.brandTitle = document.getElementById("brand-title");
    this.brandStatus = document.getElementById("brand-status");
    this.petMood = document.getElementById("pet-mood");
    this.screenMenu = document.getElementById("screen-menu");
    this.screenMenuTitle = document.getElementById("screen-menu-title");
    this.screenMenuIcon = document.getElementById("screen-menu-icon");
    this.screenMenuStatus = document.getElementById("screen-menu-status");
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
    if (this.view === "feeding-animation" && (button === "ok" || button === "cancel")) {
      this.skipFeedAnimation();
      return;
    }

    if (this.isInputLocked()) {
      return;
    }

    if (!this.state.isAlive && button !== "cancel" && button !== "ok") {
      return;
    }

    if (this.view === "closed") {
      if (!this.state.isAlive && button === "ok") {
        this.restartGame();
        return;
      }

      if (button === "cancel") {
        this.view = "status";
        this.render(this.state);
        return;
      }

      if (this.state.isSleeping && button === "ok") {
        this.boostSleepingEnergy();
        return;
      }

      this.openMainMenu();
      return;
    }

    if (!this.state.isAlive) {
      return;
    }

    if (this.view === "minigame") {
      this.handleMiniGameInput(button);
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
      if (button === "ok") {
        this.closeMenu();
      }
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
    const menu = MENUS[menuKey]?.items;
    if (!menu) {
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
    if (item.submenu) {
      this.view = item.submenu;
      this.render(this.state);
      return;
    }

    if (item.minigame) {
      this.startMiniGame(item);
      return;
    }

    this.runAction(item);
  }

  runAction(item) {
    const result = applyAction(this.state, item.key, item.effectStatus);
    this.gameScene.syncVisuals();
    saveState(this.state);

    if (result.ok) {
      if (item.key === "meal" || item.key === "snack") {
        this.showFeedAnimation(item.key);
        return;
      }

      if (this.view !== "feed") {
        this.view = "closed";
      }
      this.render(this.state);
      return;
    }

    this.showMessage(result.message || this.getSuccessMessage(item.key), false);
  }

  showFeedAnimation(action) {
    this.feedAnimationTimer?.remove(false);
    this.feedAnimationAction = action;
    this.view = "feeding-animation";
    this.inputLockedUntil = this.time.now + FEED_ANIMATION_DURATION_MS;
    this.render(this.state);
    this.feedAnimationTimer = this.time.delayedCall(FEED_ANIMATION_DURATION_MS, () => {
      this.feedAnimationAction = null;
      this.inputLockedUntil = 0;
      this.view = "feed";
      this.render(this.state);
      this.feedAnimationTimer = null;
    });
  }

  skipFeedAnimation() {
    if (this.view !== "feeding-animation") {
      return;
    }

    this.feedAnimationTimer?.remove(false);
    this.feedAnimationTimer = null;
    this.feedAnimationAction = null;
    this.inputLockedUntil = 0;
    this.view = "feed";
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
    this.miniGame = initializeMiniGameSession(item, (pool) => Phaser.Utils.Array.GetRandom(pool));
    this.view = "minigame";
    this.render(this.state);
  }

  handleMiniGameInput(button) {
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
      this.view = "closed";
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
      this.view = "closed";
      this.activeMiniGameItem = null;
      this.render(this.state);
      this.summaryTimer = null;
    });
  }

  isInputLocked() {
    return this.time.now < this.inputLockedUntil;
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
    this.screenMenuIcon.classList.remove("feeding-icon");
  }

  setFeedAnimationIcon(action) {
    const assetKey = action === "snack" ? "feeding-snack" : "feeding-meal";
    this.screenMenuIcon.innerHTML = this.getUiAssetMarkup(assetKey);
    this.screenMenuIcon.classList.toggle("hidden", !this.screenMenuIcon.innerHTML);
    this.screenMenuIcon.classList.add("feeding-icon");
  }

  getUiAssetMarkup(assetKey) {
    return this.cache.text.get(`ui-${assetKey}`) || "";
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

  showMessage(text, success = true) {
    this.view = "message";
    this.messageText = text;
    this.messageSuccess = success;
    this.render(this.state);
  }

  openMainMenu() {
    Object.keys(this.menuIndexes).forEach((menuKey) => {
      this.menuIndexes[menuKey] = 0;
    });
    this.view = "main";
    this.render(this.state);
  }

  closeMenu() {
    if (this.view === "minigame") {
      this.finishMiniGame(true);
      return;
    }

    this.view = "closed";
    this.render(this.state);
  }

  restartGame() {
    if (this.gameScene) {
      this.gameScene.events.off("state-changed", this.handleStateChanged, this);
    }

    clearState();
    const freshState = createNewState();
    this.registry.set("petState", freshState);
    this.state = freshState;
    this.view = "closed";
    this.inputLockedUntil = 0;
    this.summaryTimer?.remove(false);
    this.summaryTimer = null;
    this.feedAnimationTimer?.remove(false);
    this.feedAnimationTimer = null;
    this.feedAnimationAction = null;
    this.activeMiniGameItem = null;
    saveState(freshState);
    this.scene.stop("GameScene");
    this.scene.start("GameScene");
    this.gameScene = this.scene.get("GameScene");
    this.gameScene.events.on("state-changed", this.handleStateChanged, this);
    this.render(freshState);
  }

  renderScreenMenu(state) {
    const moodList = getMoodList(state);
    const shouldShowMood = !(moodList.length === 1 && moodList[0] === "Happy");

    this.brandTitle.textContent = "Pocket Pet";
    this.brandStatus.textContent = state.isAlive ? "Pet View" : "New Egg";
    const fullScreenMenu = this.view !== "closed";
    const shouldShowSleepEnergy = state.isSleeping && !fullScreenMenu;
    this.gameScene.setMenuVisible(fullScreenMenu);
    this.screenMenu.classList.toggle("status-view", this.view === "status");
    this.screenMenu.classList.toggle("feeding-view", this.view === "feeding-animation");
    const inputLocked = this.isInputLocked();
    const allowFeedSkip = this.view === "feeding-animation";
    this.hardwareLeft.disabled = inputLocked;
    this.hardwareRight.disabled = inputLocked;
    this.hardwareCancel.disabled = inputLocked && !allowFeedSkip;
    this.hardwareOk.disabled = inputLocked && !allowFeedSkip;
    this.petMood.textContent = `Mood: ${getMoodList(state).join(" • ")}`;
    this.petMood.textContent = shouldShowSleepEnergy
      ? `Energy: ${Math.round(state.energy)}`
      : shouldShowMood
        ? `Mood: ${moodList.join(" | ")}`
        : "";
    this.petMood.classList.toggle("hidden", fullScreenMenu || (!shouldShowMood && !shouldShowSleepEnergy));

    if (!fullScreenMenu) {
      this.screenMenu.classList.add("hidden");
      return;
    }

    this.screenMenu.classList.remove("hidden");

    if (isMenuView(this.view)) {
      const menu = MENUS[this.view];
      const item = menu.items[this.menuIndexes[this.view]];
      this.setMenuIcon(item.icon || item.key);
      this.screenMenuTitle.textContent = item.name || item.label;
      this.screenMenuStatus.textContent = getMenuStatusText(menu, item, state);
      return;
    }

    if (this.view === "status") {
      this.setMenuIcon("status");
      const average = Math.round(
        (state.hunger + state.happiness + state.energy + state.health + state.cleanliness) / 5
      );
      this.screenMenuTitle.textContent = "Status";
      const lines = [
        ["Age", `${state.ageMinutes}m`],
        ["Stage", state.evolutionStage],
        // ["Mood", getStatusText(state)],
        "separator",
        ["Hunger", Math.round(state.hunger)],
        ["Happiness", Math.round(state.happiness)],
        ["Energy", Math.round(state.energy)],
        ["Health", Math.round(state.health)],
        ["Weight", Math.round(state.weight)],
        // ["Cleanliness", Math.round(state.cleanliness)],
        // ["Poop", state.poopCount],
        // ["Sick", state.isSick ? "Yes" : "No"],
        // ["Sleep", state.isSleeping ? "Yes" : "No"],
        // ["Overall", average]
      ];
      this.screenMenuStatus.innerHTML = `<div class="status-lines">${lines
        .map(
          (line) =>
            line === "separator"
              ? `<div class="status-separator" aria-hidden="true"></div>`
              : `<div class="status-line"><span class="status-name">${line[0]}:</span> <span class="status-value">${line[1]}</span></div>`
        )
        .join("")}</div>`;
      return;
    }

    if (this.view === "message") {
      this.setMenuIcon("message");
      this.screenMenuTitle.textContent = this.messageSuccess ? "Done" : "Notice";
      this.screenMenuStatus.textContent = this.messageText;
      return;
    }

    if (this.view === "minigame") {
      this.setMenuIcon(this.getMiniGameIcon());
      this.screenMenuTitle.textContent = this.getMiniGameTitle();
      this.screenMenuStatus.textContent = this.getMiniGameStatusText();
      return;
    }

    if (this.view === "summary") {
      this.setMenuIcon("summary");
      this.screenMenuTitle.textContent = this.getMiniGameConfig().summaryTitle || "Result";
      this.screenMenuStatus.textContent = this.getMiniGameSummaryText();
      return;
    }

    if (this.view === "feeding-animation") {
      this.setFeedAnimationIcon(this.feedAnimationAction);
      this.screenMenuTitle.textContent = this.feedAnimationAction === "snack" ? "Snack Time" : "Rice Time";
      this.screenMenuStatus.textContent =
        this.feedAnimationAction === "snack" ? "Chomp chomp\nFun is going up." : "Munch munch\nHunger is going down.";
    }
  }

  render(state) {
    this.renderScreenMenu(state);
  }

  update(_time, delta) {
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
