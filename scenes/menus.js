import { FEED_MENU_ITEMS } from "./feedItems.js";
import { PLAY_MENU_ITEMS } from "./minigames/index.js";

export const MENUS = {
  main: {
    statusText: "L/R move  O select  X exit",
    items: [
      { key: "feed", label: "FEED", caption: "Open the feeding menu.", submenu: "feed" },
      { key: "play", label: "PLAY", caption: "Open the mini game list.", submenu: "play" },
      { key: "sleep", label: "SLEEP", caption: "Turn the lights off for sleep." },
      { key: "clean", label: "CLEAN", caption: "Clean the room and the mess." },
      { key: "medicine", label: "MEDICINE", caption: "Use medicine when your pet is sick." },
      { key: "debug", label: "DEBUG", caption: "Open debug tools.", submenu: "debug" }
    ]
  },
  feed: {
    statusText: "",
    items: FEED_MENU_ITEMS
  },
  play: {
    statusText: "",
    items: PLAY_MENU_ITEMS
  },
  debug: {
    statusText: "Debug menu",
    items: [
      { key: "debug-fill", label: "MAX ALL", caption: "Fill all core stats." },
      { key: "debug-drain", label: "LOW ALL", caption: "Lower core stats for testing." },
      { key: "debug-sick", label: "TOGGLE SICK", caption: "Toggle sickness on or off." }
    ]
  }
};

export const isMenuView = (view) => Object.prototype.hasOwnProperty.call(MENUS, view);
