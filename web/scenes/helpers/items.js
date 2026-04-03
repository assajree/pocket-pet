export const ITEM_LIST = [
  {
    key: "meal",
    label: "Rice",
    caption: "Serve rice to fill hunger.",
    icon: "meal",
    consumable: false,
    shopPrice: 0,
    effectStatus: { hunger: 24 }
  },
  {
    key: "snack",
    label: "Snack",
    caption: "Snack adds fun and weight.",
    icon: "snack",
    consumable: true,
    shopPrice: 6,
    maxQty: 9,
    effectStatus: { happiness: 16, weight: 6 }
  },
  {
    key: "medicine",
    label: "Med",
    caption: "Buy one medicine dose.",
    icon: "medicine",
    consumable: true,
    shopPrice: 12,
    maxQty: 9
  }
];

const ITEM_MAP = Object.fromEntries(ITEM_LIST.map((item) => [item.key, item]));

export const getItemDef = (itemKey) => ITEM_MAP[itemKey];
export const isConsumableItem = (itemKey) => ITEM_MAP[itemKey]?.consumable !== false;
export const getItemLabel = (itemKey) => ITEM_MAP[itemKey]?.label || itemKey.toUpperCase();
export const getShopPrice = (itemKey) => ITEM_MAP[itemKey]?.shopPrice ?? 0;
export const getMaxQty = (itemKey) => ITEM_MAP[itemKey]?.maxQty ?? 0;
export const isShopItem = (itemKey) => isConsumableItem(itemKey);
