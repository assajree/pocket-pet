import "./build-meta.js";
import BootScene from "./scenes/BootScene.js";
import GameScene from "./scenes/GameScene.js";
import UIScene from "./scenes/UIScene.js";
import { isAndroidAppRuntime } from "./scenes/helpers/platform.js";

const buildMeta = self.__POCKET_PET_BUILD__ || {
  id: "unknown",
  version: "unknown",
  generatedAt: null
};
let hasReloadedForServiceWorkerUpdate = false;

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
  if (!("serviceWorker" in navigator) || isAndroidAppRuntime()) {
    return;
  }

  try {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hasReloadedForServiceWorkerUpdate) {
        return;
      }

      hasReloadedForServiceWorkerUpdate = true;
      window.location.reload();
    });

    const registration = await navigator.serviceWorker.register("./service-worker.js");
    activateWaitingServiceWorker(registration);
    watchForServiceWorkerUpdate(registration);
    await registration.update();
  } catch (error) {
    console.warn("Service worker registration failed.", error);
  }
};

const activateWaitingServiceWorker = (registration) => {
  if (!registration.waiting) {
    return;
  }

  registration.waiting.postMessage({
    type: "SKIP_WAITING",
    buildId: buildMeta.id
  });
};

const watchForServiceWorkerUpdate = (registration) => {
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) {
      return;
    }

    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        activateWaitingServiceWorker(registration);
      }
    });
  });
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
