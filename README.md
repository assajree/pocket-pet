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

Because service workers only work on secure origins or localhost, serve the folder with a small local web server instead of opening `index.html` directly.

### Option 1: Python

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

### Option 2: VS Code Live Server

Open the project folder and run the Live Server extension.

## PWA notes

- Load the game once while online so the service worker can cache the assets.
- On supported mobile browsers, use "Add to Home Screen" to install it.
