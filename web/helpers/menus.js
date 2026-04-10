import { buildShopStatus } from "./menuFormatters.js";
import { ITEM_LIST } from "./items.js";
import { PLAY_MENU_ITEMS } from "../minigames/index.js";
import { getInventoryCount } from "../../gameState.js";
import { getPlatformCapabilities } from "./platform.js";

const LINK_GAME_HOST_ITEMS = PLAY_MENU_ITEMS.map((item) => ({
  ...item,
  key: `link-game-select-${item.key}`,
  submenu: "link-game-bet"
}));

const LINK_GAME_BET_ITEMS = [0, 10, 20, 50, 100].map((bet) => ({
  key: `link-game-bet-${bet}`,
  label: `${bet}G`,
  caption: bet ? `Bet ${bet}G on this match.` : "Play with no bet.",
  icon: ""
}));

export const MENUS = {
  main: {
    caption: "",
    items: [
      { key: "feed", label: "FEED", caption: "Open the feeding menu.", submenu: "feed" },
      { key: "play", label: "PLAY", caption: "Open the mini game list.", submenu: "play" },
      {
        key: "link",
        label: "LINK",
        caption: "Exchange pet status with another device.",
        submenu: "link",
        visibleWhen: () => getPlatformCapabilities().supportsLink
      },
      { key: "shop", label: "SHOP", caption: "Buy item.", submenu: "shop" },
      { key: "sleep", label: "SLEEP", caption: "Turn the lights off for sleep." },
      { key: "clean", label: "CLEAN", caption: "Clean the room and the mess." },
      { key: "medicine", label: "HEAL", caption: "Treat your pet when it feels sick." },
      { key: "debug", label: "DEBUG", caption: "Open debug tools.", submenu: "debug" }
    ]
  },
  feed: {
    caption: "",
    items: ITEM_LIST,
    visibleWhen: (item, state) => {
      return getInventoryCount(state, item.key) > 0;
    }
  },
  play: {
    caption: "",
    items: PLAY_MENU_ITEMS
  },
  link: {
    caption: "Choose a link mode to host or join.",
    items: [
      { key: "battle", label: "BATTLE", caption: "Host or join a battle link.", submenu: "link-battle" },
      { key: "dating", label: "DATING", caption: "Host or join a dating link.", submenu: "link-dating" },
      { key: "game", label: "GAME", caption: "Host or join a game link.", submenu: "link-game" }
    ]
  },
  "link-battle": {
    caption: "Battle links auto-resolve after exchange.",
    items: [
      { key: "link-battle-host", label: "HOST", caption: "Open a battle host session.", icon: "", status: (state, context) => context.scene?.getEncounterMenuStatus(state, { key: "link-battle-host" }) },
      { key: "link-battle-join", label: "JOIN", caption: "Join a battle host session.", icon: "", status: (state, context) => context.scene?.getEncounterMenuStatus(state, { key: "link-battle-join" }) }
    ]
  },
  "link-dating": {
    caption: "Dating links auto-resolve after exchange.",
    items: [
      { key: "link-dating-host", label: "HOST", caption: "Open a dating host session.", icon: "", status: (state, context) => context.scene?.getEncounterMenuStatus(state, { key: "link-dating-host" }) },
      { key: "link-dating-join", label: "JOIN", caption: "Join a dating host session.", icon: "", status: (state, context) => context.scene?.getEncounterMenuStatus(state, { key: "link-dating-join" }) }
    ]
  },
  "link-game": {
    caption: "Host picks the game and bet first.",
    items: [
      { key: "link-game-host", label: "HOST", caption: "Choose a game and open a room.", icon: "", submenu: "link-game-host" },
      { key: "link-game-join", label: "JOIN", caption: "Join a game room with a code.", icon: "", status: (state, context) => context.scene?.getLinkGameMenuStatus(state, { key: "link-game-join" }) }
    ]
  },
  "link-game-host": {
    caption: "Choose the mini game for this room.",
    items: LINK_GAME_HOST_ITEMS
  },
  "link-game-bet": {
    caption: "Choose the bet amount.",
    items: LINK_GAME_BET_ITEMS
  },
  shop: {
    caption: "",
    items: ITEM_LIST,
    visibleWhen: (item) => item.shopPrice > 0,
    currentStatus: (item) => buildShopStatus(item.key, item.key, item.label)
  },
  debug: {
    caption: "Debug menu",
    items: [
      { key: "debug-fill", label: "MAX ALL", caption: "Fill all core stats.", icon: "" },
      { key: "debug-drain", label: "LOW ALL", caption: "Lower core stats for testing.", icon: "" },
      { key: "debug-poop", label: "POOP +1", caption: "Force one poop for testing.", icon: "" },
      { key: "debug-evolve", label: "EVOLVE +1", caption: "Advance to the next pet stage.", icon: "" },
      { key: "debug-sick", label: "TOGGLE SICK", caption: "Toggle sickness on or off.", icon: "" },
      { key: "debug-dead", label: "DEAD", caption: "Mark the pet as dead immediately.", icon: "" },
      { key: "debug-reset-save", label: "RESET SAVE", caption: "Clear all save data and start again from an egg.", icon: "" },
      { key: "debug-new-egg", label: "NEW EGG", caption: "Reset the pet back to a fresh egg.", icon: "" },
      { key: "sample", label: "SAMPLE", caption: "Open sample asset previews.", submenu: "sample", icon: "" },
    ]
  },
  sample: {
    caption: "Sample menu",
    items: [
      { key: "debug-play-audio", label: "AUDIO", caption: "Play a sample sound from an audio asset file.", icon: "" },
      {
        key: "debug-sample-synth",
        label: "SYNTH",
        caption: "Play a Happy Birthday note sequence via the Web Audio synth (playSynthSequence).",
        icon: ""
      },
      { key: "debug-preview-gif", label: "GIF", caption: "Preview the animated cat.gif asset.", icon: "" }
    ]
  },
  dead: {
    caption: "Pet is gone",
    items: [
      { key: "new-egg", label: "NEW EGG", caption: "Hatch a fresh egg and start over.", icon: "" },
    ]
  }
};

export const isMenuView = (view) => Object.prototype.hasOwnProperty.call(MENUS, view);
