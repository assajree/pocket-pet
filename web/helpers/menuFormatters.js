import { getInventoryCount, getItemLabel, getShopPrice, getMaxQty, isConsumableItem } from "../gameState.js";

export const buildShopStatus = (itemKey, stockKey, label) => ({ money, inventory }) => {
  const qty = getInventoryCount({ inventory }, stockKey);
  const maxQty = getMaxQty(stockKey);
  const ownedText = maxQty ? `${qty}/${maxQty}` : (!isConsumableItem(stockKey) ? "INF" : `${qty}`);
  return [
    `MONEY ${Math.round(money)}G`,
    `OWN ${ownedText} ${label}`,
    `COST ${getShopPrice(itemKey)}G`
  ];
};

export const buildInventoryItemName = (itemKey) => ({ inventory }) =>
  `${getItemLabel(itemKey)} x${!isConsumableItem(itemKey) ? "INF" : getInventoryCount({ inventory }, itemKey)}`;

export const buildInventoryItemStatus = (itemKey, extraStatsFn) => (state) => {
  const lines = [`QTY ${!isConsumableItem(itemKey) ? "INF" : getInventoryCount(state, itemKey)}`];
  if (extraStatsFn) {
    const extra = extraStatsFn(state);
    if (Array.isArray(extra)) {
      lines.push(...extra);
    }
  }
  return lines;
};

const STATUS_LABELS = {
  hunger: "HUNGER",
  happiness: "HAPPY",
  energy: "ENERGY",
  health: "HEALTH",
  weight: "WEIGHT",
  cleanliness: "CLEAN",
  money: "MONEY",
  score: "SCORE",
  bet: "BET"
};

const formatStatusRange = (key, value) => {
  const label = STATUS_LABELS[key] || key.toUpperCase();
  if (typeof value.min === "number" && typeof value.max === "number") {
    const minText = `${value.min > 0 ? "+" : ""}${value.min}`;
    const maxText = `${value.max > 0 ? "+" : ""}${value.max}`;
    return `${minText}~${maxText} ${label}`;
  }

  return label;
};

export const formatStatusObject = (statusObject) =>
  Object.entries(statusObject)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      if (value && typeof value === "object") {
        return formatStatusRange(key, value);
      }

      return `${value > 0 ? "+" : ""}${value} ${STATUS_LABELS[key] || key.toUpperCase()}`;
    });


export const getMenuCaption = (menu, item, state, context = {}) => {
  // console.log('getMenuCaption()', {'item': item});
  const menuCaption = item.caption;
  const effectStatus = formatStatusObject(item.effectStatus??{});

  if (effectStatus.length) {
    return [...effectStatus, menuCaption].filter(Boolean).join("\n");
  }

  if (typeof item.status === "function") {
    const value = item.status(state, context);
    return menuCaption ? `${value}\n${menuCaption}` : value;
  }

  if (typeof item.status === "string") {
    return menuCaption ? `${item.status}\n${menuCaption}` : item.status;
  }

  return menuCaption;
};
