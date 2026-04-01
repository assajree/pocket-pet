import BootScene from "./scenes/BootScene.js";
import GameScene from "./scenes/GameScene.js";
import UIScene from "./scenes/UIScene.js";

const bootGame = () => {
  const container = document.getElementById("game-container");
  const { clientWidth, clientHeight } = container;

  const config = {
    type: Phaser.AUTO,
    parent: "game-container",
    width: clientWidth,
    height: clientHeight,
    // width: Math.max(clientWidth, 360),
    // height: Math.max(clientHeight, 640),
    backgroundColor: "#b7c7b5",
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    render: {
      pixelArt: true,
      antialias: false
    },
    scene: [BootScene, GameScene, UIScene]
  };

  window.pocketPetGame = new Phaser.Game(config);
};

const registerServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch (error) {
    console.warn("Service worker registration failed.", error);
  }
};

const waitForPhaser = () => {
  if (window.Phaser) {
    bootGame();
    registerServiceWorker();
    return;
  }

  window.addEventListener(
    "load",
    () => {
      bootGame();
      registerServiceWorker();
    },
    { once: true }
  );
};

waitForPhaser();
