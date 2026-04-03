import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "web");
const distDir = path.join(rootDir, "dist");
const buildId = createBuildId();

const assetPaths = [
  "assets",
  "icons",
  "scenes",
  "index.html",
  "main.js",
  "gameState.js",
  "styles.css",
  "manifest.json",
  "service-worker.js"
];

mkdirSync(distDir, { recursive: true });
writeBuildMeta(path.join(distDir, "build-meta.js"), buildId);

for (const relativePath of assetPaths) {
  const sourcePath = path.join(webDir, relativePath);

  if (!existsSync(sourcePath)) {
    throw new Error(`Missing asset required for Android build: ${relativePath}`);
  }

  copyEntry(sourcePath, path.join(distDir, relativePath));
}

console.log(`Prepared Android web assets from ${webDir} into ${distDir} with build ${buildId}`);

function copyEntry(sourcePath, targetPath) {
  const stats = lstatSync(sourcePath);

  if (stats.isDirectory()) {
    mkdirSync(targetPath, { recursive: true });

    for (const entry of readdirSync(sourcePath)) {
      copyEntry(path.join(sourcePath, entry), path.join(targetPath, entry));
    }

    return;
  }

  mkdirSync(path.dirname(targetPath), { recursive: true });

  try {
    copyFileSync(sourcePath, targetPath);
  } catch (error) {
    if (error && error.code === "EPERM" && existsSync(targetPath)) {
      console.warn(`Skipped locked file in dist: ${path.relative(rootDir, targetPath)}`);
      return;
    }

    throw error;
  }
}

function createBuildId() {
  const now = new Date();
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function writeBuildMeta(targetPath, nextBuildId) {
  const contents = [
    "self.__POCKET_PET_BUILD__ = Object.freeze({",
    `  id: ${JSON.stringify(nextBuildId)},`,
    `  version: ${JSON.stringify(nextBuildId)},`,
    `  generatedAt: ${JSON.stringify(new Date().toISOString())}`,
    "});",
    ""
  ].join("\n");

  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, contents);
}
