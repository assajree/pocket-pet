# Pocket Pet Tamagotchi

A portrait-oriented Tamagotchi-style virtual pet built with Phaser 3 and packaged as a Progressive Web App.

## Features

- Phaser 3 scene-based architecture with `BootScene`, `GameScene`, and `UIScene`
- Hunger, happiness, energy, health, cleanliness, age, and evolution stages
- Random poop and sickness events
- Automatic localStorage save using JSON
- Installable PWA with offline asset caching
- Responsive portrait layout designed for mobile screens
- Web `LINK` works when the game is served by the bundled Node.js server; Android app builds can still use the native offline bridge

## Run locally

Run the bundled Node server to serve the game locally during development.

```bash
node server.js
```

Then open `http://localhost:8080`.

This server now also exposes the `/api/link/*` endpoints used by the browser `LINK` menu for battle, dating, and game rooms.

The web app source files now live under `web/`, while `dist/` is generated for Capacitor/Android sync.

## Android debug build

Build the static web assets and sync them into Capacitor:

```bash
npm run android:sync
```

This sync step also patches Capacitor's generated Gradle files to target Java 17 for this machine.

Open the Android project in Android Studio:

```bash
npm run android:open
```

Or build a debug APK from the command line:

```bash
npm run android:build:debug
```

The generated APK will be under `android/app/build/outputs/apk/debug/`.

## PWA notes

- Browser/PWA builds register the service worker, but Android Capacitor builds do not.
- Load the game once while online so the service worker can cache the app shell.
- On supported mobile browsers, use "Add to Home Screen" to install it.
- The `LINK` menu is visible on web and PWA builds.
- Web/PWA `LINK` actions only work when the current origin also serves the Node.js `/api/link/*` endpoints, such as `node server.js`.
- Static hosting without that backend still shows the menu, but host/join actions will report that the web link server is unavailable.
- Android app builds can provide offline link through a native bridge such as a Capacitor plugin instead of the HTTP API.
- HTML and local code assets use a network-first update path, so new releases should refresh into place without manual cache clearing.

## Save and offline progress

- Game state is saved in `localStorage` with automatic saves during play and UI actions.
- When the game boots, it loads the previous save and calculates offline progress from the elapsed real time since `lastUpdatedAt`.
- Offline progress is applied by calling `tickState(state, elapsedSeconds)`, so the same simulation rules are used both online and offline.
- This means hunger, happiness, energy, age, cleanliness, sickness rolls, poop rolls, health changes, evolution checks, and death checks all continue while the game is closed.
- Offline progress can cause the pet to die if hunger or health reaches `0` during the simulated elapsed time.
