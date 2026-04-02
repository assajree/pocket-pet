import { getItemLabel, getShopPrice, isInfiniteItem } from "../gameState.js";

const buildShopStatus = (itemKey, stockKey, label) => ({ money, inventory }) => [
  `MONEY ${Math.round(money)}G`,
  `OWN ${isInfiniteItem(stockKey) ? "INF" : (inventory?.[stockKey] ?? 0)} ${label}`,
  `COST ${getShopPrice(itemKey)}G`
];

export const SHOP_MENU_ITEMS = [
  {
    key: "buy-snack",
    label: "BUY SNACK",
    name: "BUY SNACK",
    icon: "snack",
    caption: "Buy one snack.",
    shopItemKey: "snack",
    currentStatus: buildShopStatus("snack", "snack", getItemLabel("snack")),
    visibleWhen: () => !isInfiniteItem("snack")
  },
  {
    key: "buy-medicine",
    label: "BUY MED",
    name: "BUY MED",
    icon: "medicine",
    caption: "Buy one medicine dose.",
    shopItemKey: "medicine",
    currentStatus: buildShopStatus("medicine", "medicine", getItemLabel("medicine")),
    visibleWhen: () => !isInfiniteItem("medicine")
  }
];
