import { buildShopStatus } from "./menuFormatters.js";
import { ITEM_LIST } from "./items.js";
import { PLAY_MENU_ITEMS } from "../minigames/index.js";
import { getInventoryCount } from "../../gameState.js";

export const MENUS = {
  main: {
    statusText: "",
    items: [
      { key: "feed", label: "FEED", caption: "Open the feeding menu.", submenu: "feed" },
      { key: "play", label: "PLAY", caption: "Open the mini game list.", submenu: "play" },
      { key: "link", label: "LINK", caption: "Exchange pet status with another device.", submenu: "link" },
      { key: "shop", label: "SHOP", caption: "Buy item.", submenu: "shop" },
      { key: "sleep", label: "SLEEP", caption: "Turn the lights off for sleep." },
      { key: "clean", label: "CLEAN", caption: "Clean the room and the mess." },
      { key: "medicine", label: "MEDICINE", caption: "Use medicine when your pet is sick." },
      { key: "debug", label: "DEBUG", caption: "Open debug tools.", submenu: "debug" }
    ]
  },
  feed: {
    statusText: "",
    items: ITEM_LIST,
    visibleWhen: (item, state) => {
      if (item.key === "medicine") return false;
      if (item.key === "snack") return getInventoryCount(state, item.key) > 0;
      return true;
    }
  },
  play: {
    statusText: "",
    items: PLAY_MENU_ITEMS
  },
  link: {
    statusText: "Choose a link mode to host or join.",
    items: [
      { key: "battle", label: "BATTLE", caption: "Host or join a battle link.", submenu: "link-battle" },
      { key: "dating", label: "DATING", caption: "Host or join a dating link.", submenu: "link-dating" }
    ]
  },
  "link-battle": {
    statusText: "Battle links auto-resolve after exchange.",
    items: [
      { key: "link-battle-host", label: "HOST", caption: "Open a battle host session.", icon: "", status: (state, context) => context.scene?.getEncounterMenuStatus(state, { key: "link-battle-host" }) },
      { key: "link-battle-join", label: "JOIN", caption: "Join a battle host session.", icon: "", status: (state, context) => context.scene?.getEncounterMenuStatus(state, { key: "link-battle-join" }) }
    ]
  },
  "link-dating": {
    statusText: "Dating links auto-resolve after exchange.",
    items: [
      { key: "link-dating-host", label: "HOST", caption: "Open a dating host session.", icon: "", status: (state, context) => context.scene?.getEncounterMenuStatus(state, { key: "link-dating-host" }) },
      { key: "link-dating-join", label: "JOIN", caption: "Join a dating host session.", icon: "", status: (state, context) => context.scene?.getEncounterMenuStatus(state, { key: "link-dating-join" }) }
    ]
  },
  shop: {
    statusText: "",
    items: ITEM_LIST,
    visibleWhen: (item) => item.shopPrice > 0,
    currentStatus: (item) => buildShopStatus(item.key, item.key, item.label)
  },
  debug: {
    statusText: "Debug menu",
    items: [
      { key: "debug-new-egg", label: "NEW EGG", caption: "Reset the pet back to a fresh egg.", icon: "" },
      { key: "debug-reset-save", label: "RESET SAVE", caption: "Clear all save data and start again from an egg.", icon: "new-egg" },
      { key: "debug-fill", label: "MAX ALL", caption: "Fill all core stats.", icon: "" },
      { key: "debug-drain", label: "LOW ALL", caption: "Lower core stats for testing.", icon: "" },
      { key: "debug-evolve", label: "EVOLVE +1", caption: "Advance to the next pet stage.", icon: "" },
      { key: "debug-sick", label: "TOGGLE SICK", caption: "Toggle sickness on or off.", icon: "" },
      { key: "debug-dead", label: "DEAD", caption: "Mark the pet as dead immediately.", icon: "" }
    ]
  },
  dead: {
    statusText: "Pet is gone",
    items: [
      { key: "new-egg", label: "NEW EGG", caption: "Hatch a fresh egg and start over.", icon: "" }
    ]
  }
};

export const isMenuView = (view) => Object.prototype.hasOwnProperty.call(MENUS, view);
