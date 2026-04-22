import { PET_ELEMENTS, formatPetElementLabel } from "./petAssets.js";

const ATTACK_ELEMENT_DURATION_SECONDS = 600;

const ATTACK_ELEMENT_ITEM_LIST = PET_ELEMENTS.filter((element) => element !== "neutral").map((element) => ({
  key: `element-${element}`,
  label: `${formatPetElementLabel(element)} Orb`,
  caption: `Temporarily shift attack element to ${formatPetElementLabel(element)}.`,
  icon: "",
  consumable: true,
  shopPrice: 12,
  maxQty: 99,
  attackElement: element,
  attackElementDurationSeconds: ATTACK_ELEMENT_DURATION_SECONDS
}));

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
    maxQty: 99,
    effectStatus: { happiness: 16, weight: 6 }
  },
  {
    key: "medicine-food",
    label: "Medicine",
    caption: "Bitter taste \nbut heals the pet.",
    icon: "medicine",
    consumable: true,
    shopPrice: 10,
    maxQty: 99,
    effectStatus: { health: 5, love: -1 }
  },
  ...ATTACK_ELEMENT_ITEM_LIST
];

const ITEM_MAP = Object.fromEntries(ITEM_LIST.map((item) => [item.key, item]));

export const getItemDef = (itemKey) => ITEM_MAP[itemKey];
export const isConsumableItem = (itemKey) => ITEM_MAP[itemKey]?.consumable == true;
export const getItemLabel = (itemKey) => ITEM_MAP[itemKey]?.label || itemKey.toUpperCase();
export const getShopPrice = (itemKey) => ITEM_MAP[itemKey]?.shopPrice ?? 0;
export const getMaxQty = (itemKey) => ITEM_MAP[itemKey]?.maxQty ?? 0;
export const isShopItem = (itemKey) => isConsumableItem(itemKey);
