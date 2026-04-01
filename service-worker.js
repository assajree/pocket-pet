const CACHE_NAME = "pocket-pet-cache-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./main.js",
  "./gameState.js",
  "./manifest.json",
  "./scenes/BootScene.js",
  "./scenes/GameScene.js",
  "./scenes/UIScene.js",
  "./assets/pet-baby.svg",
  "./assets/pet-child.svg",
  "./assets/pet-teen.svg",
  "./assets/pet-adult.svg",
  "./assets/poop.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
const CDN_ASSETS = ["https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);

      for (const asset of CDN_ASSETS) {
        try {
          const response = await fetch(asset, { mode: "no-cors" });
          await cache.put(asset, response);
        } catch (error) {
          console.warn("Failed to cache CDN asset", asset, error);
        }
      }

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      if (cached) {
        return cached;
      }

      try {
        const response = await fetch(event.request);
        if (response && response.status < 400) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (error) {
        const fallback = await caches.match("./index.html");
        return fallback || Response.error();
      }
    })()
  );
});
