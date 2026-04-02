import { isConsumableItem, getItemLabel } from "../gameState.js";
import { buildShopStatus } from "./menuFormatters.js";

export const FEED_MENU_ITEMS = [
  {
    key: "meal",
    label: "RICE",
    caption: "Serve rice to fill hunger.",
    inventoryItemKey: "meal",
    icon: "meal",
    effectStatus: { hunger: 24 }
  },
  {
    key: "snack",
    label: "SNACK",
    caption: "Snack adds fun and weight.",
    inventoryItemKey: "snack",
    icon: "snack",
    visibleWhen: ({ inventory }) => (inventory?.snack ?? 0) > 0,
    effectStatus: { happiness: 16, weight: 6 }
  },
  {
    key: "buy-snack",
    label: "BUY SNACK",
    name: "BUY SNACK",
    icon: "snack",
    caption: "Buy one snack.",
    shopItemKey: "snack",
    currentStatus: buildShopStatus("snack", "snack", getItemLabel("snack")),
    visibleWhen: () => isConsumableItem("snack")
  },
  {
    key: "buy-medicine",
    label: "BUY MED",
    name: "BUY MED",
    icon: "medicine",
    caption: "Buy one medicine dose.",
    shopItemKey: "medicine",
    currentStatus: buildShopStatus("medicine", "medicine", getItemLabel("medicine")),
    visibleWhen: () => isConsumableItem("medicine")
  }
];
