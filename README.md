# Pocket Pet Tamagotchi

A portrait-oriented Tamagotchi-style virtual pet built with Phaser 3 and packaged as a Progressive Web App.

## Features

- Phaser 3 scene-based architecture with `BootScene`, `GameScene`, and `UIScene`
- Hunger, happiness, energy, health, cleanliness, age, and evolution stages
- Random poop and sickness events
- Automatic localStorage save using JSON
- Installable PWA with offline asset caching
- Responsive portrait layout designed for mobile screens

## Run locally

Run the bundled Node server so the game and LAN link session API are served from the same origin.

```bash
node server.js
```

Then open `http://localhost:8080`.

For LAN linking on another device, open `http://<host-ip>:8080` from that device while both devices are on the same Wi-Fi or hotspot.

## PWA notes

- Load the game once while online so the service worker can cache the assets.
- On supported mobile browsers, use "Add to Home Screen" to install it.

## Save and offline progress

- Game state is saved in `localStorage` with automatic saves during play and UI actions.
- When the game boots, it loads the previous save and calculates offline progress from the elapsed real time since `lastUpdatedAt`.
- Offline progress is applied by calling `tickState(state, elapsedSeconds)`, so the same simulation rules are used both online and offline.
- This means hunger, happiness, energy, age, cleanliness, sickness rolls, poop rolls, health changes, evolution checks, and death checks all continue while the game is closed.
- Offline progress can cause the pet to die if hunger or health reaches `0` during the simulated elapsed time.
