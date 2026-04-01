import {
  addMiniGameReward,
  applyAction,
  clearState,
  createNewState,
  getMoodList,
  getStatusText,
  saveState
} from "../gameState.js";

const MAIN_MENU = [
  { key: "status", label: "STATUS", caption: "View your pet status." },
  { key: "feed", label: "FEED", caption: "Open the feeding menu." },
  { key: "play", label: "PLAY", caption: "Open the mini game list." },
  { key: "sleep", label: "SLEEP", caption: "Turn the lights off for sleep." },
  { key: "clean", label: "CLEAN", caption: "Clean the room and the mess." },
  { key: "medicine", label: "MEDICINE", caption: "Use medicine when your pet is sick." },
];

const FEED_MENU = [
  { key: "meal", label: "RICE", caption: "Serve rice to fill hunger." },
  { key: "snack", label: "SNACK", caption: "Snack adds fun and weight." }
];

const PLAY_MENU = [{ key: "tap-sprint", label: "TAP SPRINT", caption: "Press O fast for five seconds." }];
const MINI_GAME_SUMMARY_DURATION_MS = 3000;

export default class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
    this.view = "closed";
    this.menuIndexes = {
      main: 0,
      feed: 0,
      play: 0
    };
    this.miniGame = {
      active: false,
      elapsed: 0,
      duration: 5,
      taps: 0
    };
    this.inputLockedUntil = 0;
    this.summaryTimer = null;
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
    });
  }

  cacheDom() {
    this.brandTitle = document.getElementById("brand-title");
    this.brandStatus = document.getElementById("brand-status");
    this.petMood = document.getElementById("pet-mood");
    this.screenMenu = document.getElementById("screen-menu");
    this.screenMenuTitle = document.getElementById("screen-menu-title");
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

      this.openMainMenu();
      return;
    }

    if (button === "cancel") {
      this.closeMenu();
      return;
    }

    if (!this.state.isAlive) {
      return;
    }

    if (this.view === "menu") {
      this.handleMenuNavigation("main", button);
      return;
    }

    if (this.view === "feed") {
      this.handleMenuNavigation("feed", button);
      return;
    }

    if (this.view === "play") {
      this.handleMenuNavigation("play", button);
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

    if (this.view === "minigame" && button === "ok") {
      this.tapMiniGame();
      return;
    }

    if (this.view === "minigame" && button === "cancel") {
      this.finishMiniGame(true);
      return;
    }
  }

  handleMenuNavigation(menuKey, button) {
    const menus = {
      main: MAIN_MENU,
      feed: FEED_MENU,
      play: PLAY_MENU
    };

    if (button === "left" || button === "right") {
      const delta = button === "right" ? 1 : -1;
      const menu = menus[menuKey];
      this.menuIndexes[menuKey] = (this.menuIndexes[menuKey] + delta + menu.length) % menu.length;
      this.render(this.state);
      return;
    }

    if (button === "ok") {
      const item = menus[menuKey][this.menuIndexes[menuKey]];
      this.selectMenuItem(menuKey, item);
    }
  }

  selectMenuItem(menuKey, item) {
    if (menuKey === "main") {
      if (item.key === "status") {
        this.view = "status";
        this.render(this.state);
        return;
      }

      if (item.key === "feed") {
        this.view = "feed";
        this.render(this.state);
        return;
      }

      if (item.key === "play") {
        this.view = "play";
        this.render(this.state);
        return;
      }

      this.runAction(item.key);
      return;
    }

    if (menuKey === "feed") {
      this.runAction(item.key);
      return;
    }

    if (menuKey === "play" && item.key === "tap-sprint") {
      this.startMiniGame();
    }
  }

  runAction(action) {
    const result = applyAction(this.state, action);
    this.gameScene.syncVisuals();
    saveState(this.state);

    if (result.ok) {
      this.view = "closed";
      this.render(this.state);
      return;
    }

    this.showMessage(result.message || this.getSuccessMessage(action), false);
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

  startMiniGame() {
    this.miniGame.active = true;
    this.miniGame.elapsed = 0;
    this.miniGame.taps = 0;
    this.view = "minigame";
    this.render(this.state);
  }

  tapMiniGame() {
    if (!this.miniGame.active) {
      return;
    }

    this.miniGame.taps += 1;
    this.render(this.state);
  }

  finishMiniGame(cancelled = false) {
    if (!this.miniGame.active) {
      return;
    }

    this.miniGame.active = false;

    if (cancelled) {
      this.view = "closed";
      this.render(this.state);
      return;
    }

    addMiniGameReward(this.state, this.miniGame.taps);
    this.gameScene.syncVisuals();
    saveState(this.state);
    this.showMiniGameSummary();
  }

  showMiniGameSummary() {
    this.summaryTimer?.remove(false);
    this.view = "summary";
    this.inputLockedUntil = this.time.now + MINI_GAME_SUMMARY_DURATION_MS;
    this.render(this.state);
    this.summaryTimer = this.time.delayedCall(MINI_GAME_SUMMARY_DURATION_MS, () => {
      this.inputLockedUntil = 0;
      this.view = "closed";
      this.render(this.state);
      this.summaryTimer = null;
    });
  }

  isInputLocked() {
    return this.time.now < this.inputLockedUntil;
  }

  showMessage(text, success = true) {
    this.view = "message";
    this.messageText = text;
    this.messageSuccess = success;
    this.render(this.state);
  }

  openMainMenu() {
    this.menuIndexes.main = 0;
    this.menuIndexes.feed = 0;
    this.menuIndexes.play = 0;
    this.view = "menu";
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
    saveState(freshState);
    this.scene.stop("GameScene");
    this.scene.start("GameScene");
    this.gameScene = this.scene.get("GameScene");
    this.gameScene.events.on("state-changed", this.handleStateChanged, this);
    this.render(freshState);
  }

  renderScreenMenu(state) {
    this.brandTitle.textContent = "Pocket Pet";
    this.brandStatus.textContent = state.isAlive ? "Pet View" : "New Egg";
    const fullScreenMenu = this.view !== "closed";
    this.gameScene.setMenuVisible(fullScreenMenu);
    this.screenMenu.classList.toggle("status-view", this.view === "status");
    const inputLocked = this.isInputLocked();
    this.hardwareLeft.disabled = inputLocked;
    this.hardwareRight.disabled = inputLocked;
    this.hardwareCancel.disabled = inputLocked;
    this.hardwareOk.disabled = inputLocked;
    this.petMood.textContent = `Mood: ${getMoodList(state).join(" • ")}`;
    this.petMood.textContent = `Mood: ${getMoodList(state).join(" | ")}`;
    this.petMood.classList.toggle("hidden", fullScreenMenu);

    if (!fullScreenMenu) {
      this.screenMenu.classList.add("hidden");
      return;
    }

    this.screenMenu.classList.remove("hidden");

    if (this.view === "menu") {
      const item = MAIN_MENU[this.menuIndexes.main];
      this.screenMenuTitle.textContent = item.label;
      this.screenMenuStatus.textContent = "L/R move  O select  X exit";
      return;
    }

    if (this.view === "feed") {
      const item = FEED_MENU[this.menuIndexes.feed];
      this.screenMenuTitle.textContent = item.label;
      this.screenMenuStatus.textContent = "Food menu";
      return;
    }

    if (this.view === "play") {
      const item = PLAY_MENU[this.menuIndexes.play];
      this.screenMenuTitle.textContent = item.label;
      this.screenMenuStatus.textContent = "Game menu";
      return;
    }

    if (this.view === "status") {
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
      this.screenMenuTitle.textContent = this.messageSuccess ? "Done" : "Notice";
      this.screenMenuStatus.textContent = this.messageText;
      return;
    }

    if (this.view === "minigame") {
      this.screenMenuTitle.textContent = "Tap Sprint";
      this.screenMenuStatus.textContent = `O tap  X exit\n${this.miniGame.taps} taps ${Math.max(
        0,
        this.miniGame.duration - this.miniGame.elapsed
      ).toFixed(1)}s`;
      return;
    }

    if (this.view === "summary") {
      this.screenMenuTitle.textContent = "Result";
      this.screenMenuStatus.textContent = `${this.miniGame.taps} taps\nPlease wait...`;
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
