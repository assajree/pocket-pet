# Pocket Pet Tamagotchi

A portrait-oriented Tamagotchi-style virtual pet built with Phaser 3 and packaged as a Progressive Web App.

## Features

- Phaser 3 scene-based architecture with `BootScene`, `GameScene`, and `UIScene`
- Hunger, happiness, energy, health, cleanliness, age, and evolution stages
- Random poop and sickness events
- Automatic localStorage save using JSON
- Installable PWA with offline asset caching
- Responsive portrait layout designed for mobile screens
- Web/PWA is single-device only; offline link is reserved for Android app builds

## Run locally

Run the bundled Node server to serve the game locally during development.

```bash
node server.js
```

Then open `http://localhost:8080`.

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

- Load the game once while online so the service worker can cache the assets.
- On supported mobile browsers, use "Add to Home Screen" to install it.
- The Web/PWA build does not include the `link` feature.
- Android app builds can provide offline link through a native bridge such as a Capacitor plugin.

## Save and offline progress

- Game state is saved in `localStorage` with automatic saves during play and UI actions.
- When the game boots, it loads the previous save and calculates offline progress from the elapsed real time since `lastUpdatedAt`.
- Offline progress is applied by calling `tickState(state, elapsedSeconds)`, so the same simulation rules are used both online and offline.
- This means hunger, happiness, energy, age, cleanliness, sickness rolls, poop rolls, health changes, evolution checks, and death checks all continue while the game is closed.
- Offline progress can cause the pet to die if hunger or health reaches `0` during the simulated elapsed time.
