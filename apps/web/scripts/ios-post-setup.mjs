#!/usr/bin/env node
/**
 * ios-post-setup.mjs — Post-setup script for iOS platform
 *
 * Run after `npx cap add ios` to:
 *  1. Inject required Info.plist permission keys
 *  2. Add URL scheme for OAuth deep links
 *  3. Add UIBackgroundModes for push notifications
 *  4. Configure entitlements for Push & Associated Domains
 *
 * Usage:  node scripts/ios-post-setup.mjs [--production]
 * Requires: macOS with Xcode, after running `npx cap add ios`
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IOS_APP_DIR = path.resolve(__dirname, "..", "ios", "App", "App");
const PLIST_PATH = path.join(IOS_APP_DIR, "Info.plist");
const ENTITLEMENTS_PATH = path.join(IOS_APP_DIR, "App.entitlements");
const IS_PRODUCTION = process.argv.includes("--production");

/* ── 1. Info.plist permission keys ── */

const PLIST_KEYS_TO_ADD = `
\t<!-- Kin-Sell: Camera for video calls & media uploads -->
\t<key>NSCameraUsageDescription</key>
\t<string>Kin-Sell utilise la caméra pour les appels vidéo et l'envoi de photos.</string>

\t<!-- Kin-Sell: Microphone for voice/video calls & audio messages -->
\t<key>NSMicrophoneUsageDescription</key>
\t<string>Kin-Sell utilise le microphone pour les appels audio/vidéo et les messages vocaux.</string>

\t<!-- Kin-Sell: Location for market explorer & listings -->
\t<key>NSLocationWhenInUseUsageDescription</key>
\t<string>Kin-Sell utilise votre position pour afficher les articles et marchés proches de vous.</string>

\t<!-- Kin-Sell: Photo Library for media uploads -->
\t<key>NSPhotoLibraryUsageDescription</key>
\t<string>Kin-Sell accède à vos photos pour publier des images sur vos annonces.</string>

\t<!-- Kin-Sell: Photo Library addition for saving images -->
\t<key>NSPhotoLibraryAddUsageDescription</key>
\t<string>Kin-Sell enregistre des images dans vos photos.</string>`;

const URL_SCHEME_BLOCK = `
\t<!-- Kin-Sell: Custom URL scheme for OAuth deep links -->
\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>com.kinsell.app</string>
\t\t\t</array>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>com.kinsell.app</string>
\t\t</dict>
\t</array>`;

const BACKGROUND_MODES_BLOCK = `
\t<!-- Kin-Sell: Background modes for push notifications -->
\t<key>UIBackgroundModes</key>
\t<array>
\t\t<string>remote-notification</string>
\t</array>`;

function patchInfoPlist() {
  if (!fs.existsSync(PLIST_PATH)) {
    console.error("❌ Info.plist not found at:", PLIST_PATH);
    console.error("   Run `npx cap add ios` first.");
    process.exit(1);
  }

  let plist = fs.readFileSync(PLIST_PATH, "utf8");

  // Insert permission keys before closing </dict>
  if (!plist.includes("NSCameraUsageDescription")) {
    plist = plist.replace(
      /(\s*)<\/dict>\s*<\/plist>/,
      `\n${PLIST_KEYS_TO_ADD}\n$1</dict>\n</plist>`
    );
    console.log("✅ Permission keys added to Info.plist");
  } else {
    console.log("ℹ️  Permission keys already present in Info.plist");
  }

  // Insert URL scheme if not present
  if (!plist.includes("CFBundleURLTypes")) {
    plist = plist.replace(
      /(\s*)<\/dict>\s*<\/plist>/,
      `\n${URL_SCHEME_BLOCK}\n$1</dict>\n</plist>`
    );
    console.log("✅ URL scheme added to Info.plist");
  } else {
    console.log("ℹ️  URL scheme already present in Info.plist");
  }

  // Insert background modes for push notifications
  if (!plist.includes("UIBackgroundModes")) {
    plist = plist.replace(
      /(\s*)<\/dict>\s*<\/plist>/,
      `\n${BACKGROUND_MODES_BLOCK}\n$1</dict>\n</plist>`
    );
    console.log("✅ UIBackgroundModes (remote-notification) added to Info.plist");
  } else {
    console.log("ℹ️  UIBackgroundModes already present in Info.plist");
  }

  fs.writeFileSync(PLIST_PATH, plist, "utf8");
}

/* ── 2. Entitlements for Push & Associated Domains ── */

const apsEnvironment = IS_PRODUCTION ? "production" : "development";

const ENTITLEMENTS_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>aps-environment</key>
\t<string>${apsEnvironment}</string>
\t<key>com.apple.developer.associated-domains</key>
\t<array>
\t\t<string>applinks:kin-sell.com</string>
\t\t<string>webcredentials:kin-sell.com</string>
\t</array>
</dict>
</plist>
`;

function writeEntitlements() {
  if (fs.existsSync(ENTITLEMENTS_PATH)) {
    console.log("ℹ️  App.entitlements already exists, skipping");
    return;
  }
  fs.writeFileSync(ENTITLEMENTS_PATH, ENTITLEMENTS_CONTENT, "utf8");
  console.log(`✅ App.entitlements created (aps-environment: ${apsEnvironment})`);
}

/* ── 3. Privacy Manifest ── */

const PRIVACY_MANIFEST_SRC = path.resolve(__dirname, "..", "ios-privacy", "PrivacyInfo.xcprivacy");
const PRIVACY_MANIFEST_DEST = path.join(IOS_APP_DIR, "PrivacyInfo.xcprivacy");

function copyPrivacyManifest() {
  if (!fs.existsSync(PRIVACY_MANIFEST_SRC)) {
    console.error("❌ PrivacyInfo.xcprivacy source not found at:", PRIVACY_MANIFEST_SRC);
    return;
  }
  if (fs.existsSync(PRIVACY_MANIFEST_DEST)) {
    console.log("ℹ️  PrivacyInfo.xcprivacy already exists in iOS project, overwriting");
  }
  fs.copyFileSync(PRIVACY_MANIFEST_SRC, PRIVACY_MANIFEST_DEST);
  console.log("✅ PrivacyInfo.xcprivacy copied to iOS project");
}

/* ── Run ── */
console.log(`\n🍎 Kin-Sell iOS Post-Setup (${IS_PRODUCTION ? "PRODUCTION" : "DEVELOPMENT"})\n`);
patchInfoPlist();
writeEntitlements();
copyPrivacyManifest();
console.log("\n✅ iOS post-setup complete!");
console.log("   Next: Open Xcode with `npx cap open ios`");
console.log("   Then: Add 'Push Notifications' capability in Signing & Capabilities");
console.log("   Then: Add 'Associated Domains' and verify the entitlements file\n");
