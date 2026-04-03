/**
 * Génère les icônes Android (launcher, round, notification, splash)
 * à partir du logo Kin-Sell (pwa-512.png).
 *
 * Usage: node scripts/generate-android-icons.mjs
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const RES = "apps/web/android/app/src/main/res";
const SRC_LOGO = "apps/web/public/assets/kin-sell/pwa-512.png";
const BRAND_BG = "#120B2B";
const BRAND_VIOLET = "#6f58ff";

// ── Tailles Android ──
const MIPMAP_SIZES = {
  "mipmap-mdpi":    48,
  "mipmap-hdpi":    72,
  "mipmap-xhdpi":   96,
  "mipmap-xxhdpi":  144,
  "mipmap-xxxhdpi": 192,
};

const NOTIFICATION_SIZES = {
  "drawable-mdpi":    24,
  "drawable-hdpi":    36,
  "drawable-xhdpi":   48,
  "drawable-xxhdpi":  72,
  "drawable-xxxhdpi": 96,
};

// Splash screen sizes (portrait)
const SPLASH_PORT = {
  "drawable":              { w: 480, h: 800 },
  "drawable-port-mdpi":    { w: 480, h: 800 },
  "drawable-port-hdpi":    { w: 720, h: 1280 },
  "drawable-port-xhdpi":   { w: 1080, h: 1920 },
  "drawable-port-xxhdpi":  { w: 1440, h: 2560 },
  "drawable-port-xxxhdpi": { w: 2160, h: 3840 },
};

const SPLASH_LAND = {
  "drawable-land-mdpi":    { w: 800, h: 480 },
  "drawable-land-hdpi":    { w: 1280, h: 720 },
  "drawable-land-xhdpi":   { w: 1920, h: 1080 },
  "drawable-land-xxhdpi":  { w: 2560, h: 1440 },
  "drawable-land-xxxhdpi": { w: 3840, h: 2160 },
};

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

async function generateLauncherIcons() {
  console.log("── Launcher icons ──");
  const logo = sharp(SRC_LOGO);

  for (const [folder, size] of Object.entries(MIPMAP_SIZES)) {
    const dir = join(RES, folder);
    ensureDir(dir);

    // ic_launcher.png — carré avec padding + fond sombre
    const padding = Math.round(size * 0.1);
    const logoSize = size - padding * 2;
    const logoResized = await sharp(SRC_LOGO)
      .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp({
      create: { width: size, height: size, channels: 4, background: BRAND_BG },
    })
      .composite([{ input: logoResized, gravity: "centre" }])
      .png()
      .toFile(join(dir, "ic_launcher.png"));

    // ic_launcher_round.png — même chose mais dans un cercle
    const circleRadius = Math.floor(size / 2);
    const circleSvg = `<svg width="${size}" height="${size}"><circle cx="${circleRadius}" cy="${circleRadius}" r="${circleRadius}" fill="${BRAND_BG}"/></svg>`;
    const circleBuffer = await sharp(Buffer.from(circleSvg))
      .png()
      .toBuffer();

    await sharp(circleBuffer)
      .composite([{ input: logoResized, gravity: "centre" }])
      .png()
      .toFile(join(dir, "ic_launcher_round.png"));

    // ic_launcher_foreground.png — pour adaptive icons (108dp canvas, logo centré dans 66dp safe zone)
    const adaptiveSize = Math.round(size * 108 / 48);
    const safeZone = Math.round(adaptiveSize * 66 / 108);
    const fgLogoResized = await sharp(SRC_LOGO)
      .resize(safeZone, safeZone, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp({
      create: { width: adaptiveSize, height: adaptiveSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: fgLogoResized, gravity: "centre" }])
      .png()
      .toFile(join(dir, "ic_launcher_foreground.png"));

    console.log(`  ✓ ${folder} (${size}px)`);
  }
}

async function generateNotificationIcon() {
  console.log("── Notification small icon ──");

  // Créer une icône monochrome blanche : silhouette de panier simplifié
  // Android exige : blanc (#FFFFFF) sur transparent, pas de couleur
  for (const [folder, size] of Object.entries(NOTIFICATION_SIZES)) {
    const dir = join(RES, folder);
    ensureDir(dir);

    // Dessiner un panier d'achat simplifié en SVG monochrome
    const cartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="white">
      <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>
    </svg>`;

    await sharp(Buffer.from(cartSvg))
      .resize(size, size)
      .png()
      .toFile(join(dir, "ic_notification.png"));

    console.log(`  ✓ ${folder} (${size}px)`);
  }
}

async function generateSplashScreens() {
  console.log("── Splash screens ──");

  const allSplash = { ...SPLASH_PORT, ...SPLASH_LAND };

  for (const [folder, { w, h }] of Object.entries(allSplash)) {
    const dir = join(RES, folder);
    ensureDir(dir);

    // Logo centré, taille = 30% de la plus petite dimension
    const logoSize = Math.round(Math.min(w, h) * 0.30);
    const logoResized = await sharp(SRC_LOGO)
      .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp({
      create: { width: w, height: h, channels: 4, background: BRAND_BG },
    })
      .composite([{ input: logoResized, gravity: "centre" }])
      .png()
      .toFile(join(dir, "splash.png"));

    console.log(`  ✓ ${folder} (${w}×${h})`);
  }
}

async function main() {
  console.log("🚀 Génération des assets Android Kin-Sell\n");
  await generateLauncherIcons();
  await generateNotificationIcon();
  await generateSplashScreens();
  console.log("\n✅ Terminé !");
}

main().catch((err) => {
  console.error("Erreur:", err);
  process.exit(1);
});
