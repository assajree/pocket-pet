import { getInventoryCount, getItemLabel, getShopPrice, getMaxQty, isConsumableItem } from "../../gameState.js";

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
  money: "MONEY"
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

export const resolveStatusLines = (statusConfig, state) => {
  if (!statusConfig) {
    return [];
  }

  const resolved = typeof statusConfig === "function" ? statusConfig(state) : statusConfig;
  if (Array.isArray(resolved)) {
    return resolved.filter(Boolean);
  }

  if (resolved && typeof resolved === "object") {
    return formatStatusObject(resolved);
  }

  return resolved ? [resolved] : [];
};

export const getMenuStatusText = (menu, item, state, context = {}) => {
  let currentStatus = resolveStatusLines(item.currentStatus, state);

  if (!currentStatus.length && typeof menu.currentStatus === "function") {
    currentStatus = resolveStatusLines(menu.currentStatus(item), state);
  }
  const effectStatus = resolveStatusLines(item.effectStatus, state);

  if (!currentStatus.length && item.key && !item.currentStatus) {
    const extraStatsFn = (s) => {
      if (!item.effectStatus) return [];
      return Object.keys(item.effectStatus).map((k) => {
        const val = Math.round(s[k]);
        return `${STATUS_LABELS[k] || k.toUpperCase()} ${val}`;
      });
    };
    currentStatus = resolveStatusLines(buildInventoryItemStatus(item.key, extraStatsFn), state);
  }

  if (currentStatus.length || effectStatus.length) {
    return [...currentStatus, ...effectStatus, menu.statusText].filter(Boolean).join("\n");
  }

  if (typeof item.status === "function") {
    const value = item.status(state, context);
    return menu.statusText ? `${value}\n${menu.statusText}` : value;
  }

  if (typeof item.status === "string") {
    return menu.statusText ? `${item.status}\n${menu.statusText}` : item.status;
  }

  return menu.statusText;
};
