import {
  accelerateEggHatch,
  addMiniGameReward,
  applyAction,
  clearState,
  createNewState,
  getEggHatchSecondsRemaining,
  getNeedList,
  purchaseItem,
  saveState,
  getMoodList,
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
import { getMenuStatusText, buildInventoryItemName } from "./menuFormatters.js";
import { ACTION_ANIMATION_CONFIG, MINI_GAME_SUMMARY_DURATION_MS, SLEEP_OK_ENERGY_BOOST } from "./uiConfig.js";

const formatCountdown = (secondsRemaining) => {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = Math.max(0, secondsRemaining % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
    this.summaryTimer = null;
    this.actionAnimationTimer = null;
    this.currentActionAnimation = null;
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
      this.actionAnimationTimer?.remove(false);
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
    if (item.submenu) {
      this.pushMenuPath(item.submenu, item.name || item.label || item.submenu);
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
    if (item.key && !item.name) {
      return buildInventoryItemName(item.key)(this.state);
    }
    return item.name || item.label;
  }

  showMessage(text, success = true) {
    this.view = "message";
    this.messageText = text;
    this.messageSuccess = success;
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
      },      
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

    this.menuPath = [];
    this.statusPageIndex = 0;
    this.view = "pet";
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
    this.menuPath = [];
    this.statusPageIndex = 0;
    this.view = "pet";
    this.inputLockedUntil = 0;
    this.summaryTimer?.remove(false);
    this.summaryTimer = null;
    this.actionAnimationTimer?.remove(false);
    this.actionAnimationTimer = null;
    this.currentActionAnimation = null;
    this.activeMiniGameItem = null;
    saveState(freshState);
    this.scene.stop("GameScene");
    this.scene.start("GameScene");
    this.gameScene = this.scene.get("GameScene");
    this.gameScene.events.on("state-changed", this.handleStateChanged, this);
    this.render(freshState);
  }

  renderScreenMenu(state) {
    const petNeedIconKeys = getPetNeedIconKeys(state);
    const shouldShowNeedIcon = petNeedIconKeys.length > 0;

    this.brandTitle.textContent = "Pocket Pet";
    this.brandStatus.textContent = state.isAlive ? "Pet View" : "New Egg";
    const fullScreenMenu = this.view !== "pet";
    const eggCountdownSeconds = getEggHatchSecondsRemaining(state);
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
      this.setPetMoodText(`Hatch in: ${formatCountdown(eggCountdownSeconds)}`);
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
      this.screenMenuStatus.textContent = getMenuStatusText(menu, item, state);
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
