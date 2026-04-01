export const FEED_MENU_ITEMS = [
  {
    key: "meal",
    label: "RICE",
    caption: "Serve rice to fill hunger.",
    name: "RICE",
    icon: "meal",
    currentStatus: ({ hunger }) => [`HUNGER ${Math.round(hunger)}`],
    effectStatus: { hunger: 24 }
  },
  {
    key: "snack",
    label: "SNACK",
    caption: "Snack adds fun and weight.",
    name: "SNACK",
    icon: "snack",
    currentStatus: ({ happiness, weight }) => [`HAPPY ${Math.round(happiness)}`, `WEIGHT ${Math.round(weight)}`],
    effectStatus: { happiness: 16, weight: 6 }
  }
];
