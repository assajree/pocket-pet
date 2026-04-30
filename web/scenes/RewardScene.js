import { getItemLabel } from "../gameState.js";
import { UI_COLORS } from "../helpers/uiConfig.js";

const REWARD_AUTO_CLOSE_DEFAULT_MS = 3000;

const formatRewardLines = (rewards = []) => {
  if (!Array.isArray(rewards) || !rewards.length) {
    return ["No reward items were added."];
  }

  return rewards.map((reward) => `${getItemLabel(reward.itemId)} x${Math.max(1, Math.round(reward.qty ?? 1))}`);
};

export default class RewardScene extends Phaser.Scene {
  constructor() {
    super("RewardScene");
    this.rewardClosed = false;
  }

  create(data = {}) {
    this.stageName = data.stageName || "Adventure";
    this.rewards = Array.isArray(data.rewards) ? data.rewards : [];
    this.autoCloseMs = Number.isFinite(data.autoCloseMs) ? data.autoCloseMs : REWARD_AUTO_CLOSE_DEFAULT_MS;
    this.adventureScene = this.scene.get("AdventureScene");

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, UI_COLORS.rewardOverlay.value, 0.96).setOrigin(0);
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, Math.min(420, this.scale.width - 36), Math.min(320, this.scale.height - 48), UI_COLORS.rewardPanel.value, 1)
      .setStrokeStyle(3, UI_COLORS.screenInk.value);

    this.titleText = this.add.text(this.scale.width / 2, 66, `${this.stageName.toUpperCase()} REWARD`, {
      fontFamily: "Courier New",
      fontSize: "24px",
      color: UI_COLORS.screenInkStrong.hex,
      stroke: UI_COLORS.screenHighlight.hex,
      strokeThickness: 4
    }).setOrigin(0.5);

    this.rewardText = this.add.text(this.scale.width / 2, 126, formatRewardLines(this.rewards).join("\n"), {
      fontFamily: "Courier New",
      fontSize: "18px",
      color: UI_COLORS.screenInk.hex,
      align: "center",
      lineSpacing: 10
    }).setOrigin(0.5, 0);

    this.promptText = this.add.text(this.scale.width / 2, this.scale.height - 56, this.autoCloseMs >= 0 ? "Closing automatically..." : "Press O or X to close.", {
      fontFamily: "Courier New",
      fontSize: "14px",
      color: UI_COLORS.screenInk.hex
    }).setOrigin(0.5);

    if (this.autoCloseMs >= 0) {
      this.autoCloseTimer = this.time.delayedCall(this.autoCloseMs, () => {
        this.autoCloseTimer = null;
        this.closeReward();
      });
    }

    this.events.on("shutdown", () => {
      this.autoCloseTimer?.remove(false);
      this.autoCloseTimer = null;
    });
  }

  handleAdventureInput(button) {
    if (this.rewardClosed) {
      return;
    }

    if (this.autoCloseMs < 0 && (button === "ok" || button === "cancel")) {
      this.closeReward();
    }
  }

  closeReward() {
    if (this.rewardClosed) {
      return;
    }

    this.rewardClosed = true;
    this.adventureScene?.handleRewardClosed?.();
    this.scene.stop();
  }
}
