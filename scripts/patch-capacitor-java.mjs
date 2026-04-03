import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const targets = [
  "node_modules/@capacitor/android/capacitor/build.gradle",
  "android/app/capacitor.build.gradle",
  "android/capacitor-cordova-android-plugins/build.gradle"
];

for (const relativePath of targets) {
  const filePath = path.join(rootDir, relativePath);
  if (!existsSync(filePath)) {
    continue;
  }

  const current = readFileSync(filePath, "utf8");
  const next = current.replaceAll("JavaVersion.VERSION_21", "JavaVersion.VERSION_17");

  if (next !== current) {
    writeFileSync(filePath, next, "utf8");
    console.log(`Patched Java compatibility in ${relativePath}`);
  }
}
