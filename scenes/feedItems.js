import { getItemLabel, isInfiniteItem } from "../gameState.js";

export const FEED_MENU_ITEMS = [
  {
    key: "meal",
    label: "RICE",
    caption: "Serve rice to fill hunger.",
    inventoryItemKey: "meal",
    name: ({ inventory }) =>
      `${getItemLabel("meal")} x${isInfiniteItem("meal") ? "INF" : (inventory?.meal ?? 0)}`,
    icon: "meal",
    currentStatus: ({ hunger, inventory }) => [
      `QTY ${isInfiniteItem("meal") ? "INF" : (inventory?.meal ?? 0)}`,
      `HUNGER ${Math.round(hunger)}`
    ],
    effectStatus: { hunger: 24 }
  },
  {
    key: "snack",
    label: "SNACK",
    caption: "Snack adds fun and weight.",
    inventoryItemKey: "snack",
    name: ({ inventory }) =>
      `${getItemLabel("snack")} x${isInfiniteItem("snack") ? "INF" : (inventory?.snack ?? 0)}`,
    icon: "snack",
    visibleWhen: ({ inventory }) => (inventory?.snack ?? 0) > 0,
    currentStatus: ({ happiness, weight, inventory }) => [
      `QTY ${inventory?.snack ?? 0}`,
      `HAPPY ${Math.round(happiness)}`,
      `WEIGHT ${Math.round(weight)}`
    ],
    effectStatus: { happiness: 16, weight: 6 }
  }
];
