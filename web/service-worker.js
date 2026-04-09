self.importScripts("./build-meta.js");

const buildMeta = self.__POCKET_PET_BUILD__ || {
  id: "fallback",
  version: "fallback",
  generatedAt: null
};
const CACHE_PREFIX = "pocket-pet";
const APP_SHELL_CACHE = `${CACHE_PREFIX}-app-shell-${buildMeta.id}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${buildMeta.id}`;
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./styles.css",
  "./main.js",
  "./build-meta.js",
  "./gameState.js",
  "./scenes/BootScene.js",
  "./scenes/GameScene.js",
  "./scenes/UIScene.js",
  "./helpers/items.js",
  "./helpers/linkSessionClient.js",
  "./helpers/linkTransport.js",
  "./helpers/menuFormatters.js",
  "./helpers/menus.js",
  "./helpers/minigames.js",
  "./helpers/petAssets.js",
  "./helpers/platform.js",
  "./helpers/uiConfig.js",
  "./minigames/index.js",
  "./minigames/playItems.js",
  "./minigames/sequenceMatch.js",
  "./minigames/tapCount.js",
  "./minigames/types.js",
  "./assets/audio/debug-sample.wav",
  "./assets/poop.svg",
  "./assets/ui/clean.svg",
  "./assets/ui/cleaning-room.svg",
  "./assets/ui/debug-drain.svg",
  "./assets/ui/debug-fill.svg",
  "./assets/ui/debug-sick.svg",
  "./assets/ui/debug.svg",
  "./assets/ui/feed.svg",
  "./assets/ui/feeding-meal.svg",
  "./assets/ui/feeding-snack.svg",
  "./assets/ui/meal.svg",
  "./assets/ui/medicine.svg",
  "./assets/ui/message.svg",
  "./assets/ui/play.svg",
  "./assets/ui/reaction-angry.svg",
  "./assets/ui/reaction-happy.svg",
  "./assets/ui/sleep.svg",
  "./assets/ui/snack.svg",
  "./assets/ui/status.svg",
  "./assets/ui/summary.svg",
  "./assets/ui/tap-sprint.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
const SHELL_DESTINATIONS = new Set(["document", "script", "style", "worker"]);
const STATIC_DESTINATIONS = new Set(["image", "font"]);

const isHttpRequest = (request) => request.url.startsWith("http://") || request.url.startsWith("https://");
const isSameOrigin = (requestUrl) => requestUrl.origin === self.location.origin;
const isNavigationRequest = (request) => request.mode === "navigate" || request.destination === "document";
const isLocalCodeAsset = (request, requestUrl) =>
  isSameOrigin(requestUrl) && (request.destination === "script" || request.destination === "style");
const isStaticAsset = (request, requestUrl) =>
  isSameOrigin(requestUrl) && STATIC_DESTINATIONS.has(request.destination);
const isAppShellRequest = (request, requestUrl) =>
  isNavigationRequest(request) ||
  (isSameOrigin(requestUrl) && SHELL_DESTINATIONS.has(request.destination));

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.addAll(CORE_ASSETS);
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(`${CACHE_PREFIX}-`) && key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !isHttpRequest(event.request)) {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (isAppShellRequest(event.request, requestUrl) || isLocalCodeAsset(event.request, requestUrl)) {
    event.respondWith(networkFirst(event.request, APP_SHELL_CACHE));
    return;
  }

  if (isStaticAsset(event.request, requestUrl)) {
    event.respondWith(staleWhileRevalidate(event.request, RUNTIME_CACHE));
    return;
  }

  event.respondWith(
    staleWhileRevalidate(event.request, RUNTIME_CACHE)
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    if (isNavigationRequest(request)) {
      const fallback = await cache.match("./index.html");
      if (fallback) {
        return fallback;
      }
    }

    return Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (isCacheableResponse(response)) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkResponse = await networkPromise;
  return networkResponse || Response.error();
}

function isCacheableResponse(response) {
  return Boolean(response) && (response.status < 400 || response.type === "opaque");
}
