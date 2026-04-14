/**
 * Generate properly-sized splash_icon.png and splash.png for Android 12+ splash screen
 * Uses the high-res ic_launcher_foreground.png as source
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resDir = path.join(__dirname, '..', 'apps', 'web', 'android', 'app', 'src', 'main', 'res');

// Source: highest res foreground icon
const SOURCE = path.join(resDir, 'mipmap-xxxhdpi', 'ic_launcher_foreground.png');

const BG_COLOR = { r: 18, g: 11, b: 43, alpha: 1 }; // #120B2B

// Android 12+ splash icon sizes (dp * density)
// The icon area is 288dp, content should be ~192dp (inner 2/3)
// We create the splash_icon at the full size, with the logo centered
const SPLASH_ICON_SIZES = {
  'drawable-mdpi': 288,
  'drawable-hdpi': 432,
  'drawable-xhdpi': 576,
  'drawable-xxhdpi': 864,
  'drawable-xxxhdpi': 1152,
  'drawable': 288, // fallback = mdpi
};

// Capacitor splash.png sizes (portrait and landscape)
const SPLASH_PORT_SIZES = {
  'drawable-port-mdpi': [480, 800],
  'drawable-port-hdpi': [720, 1280],
  'drawable-port-xhdpi': [960, 1600],
  'drawable-port-xxhdpi': [1440, 2560],
  'drawable-port-xxxhdpi': [1440, 2560],
};
const SPLASH_LAND_SIZES = {
  'drawable-land-mdpi': [800, 480],
  'drawable-land-hdpi': [1280, 720],
  'drawable-land-xhdpi': [1600, 960],
  'drawable-land-xxhdpi': [2560, 1440],
  'drawable-land-xxxhdpi': [2560, 1440],
};

async function generateSplashIcons() {
  console.log('Generating splash_icon.png files...');
  const source = sharp(SOURCE);
  const meta = await source.metadata();
  console.log(`Source: ${meta.width}x${meta.height}`);

  for (const [dir, size] of Object.entries(SPLASH_ICON_SIZES)) {
    // Logo takes ~66% of the icon area (inner safe zone)
    const logoSize = Math.round(size * 0.66);
    const padding = Math.round((size - logoSize) / 2);

    const resizedLogo = await sharp(SOURCE)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    // Create transparent canvas with logo centered
    const icon = await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: resizedLogo, left: padding, top: padding }])
      .png()
      .toFile(path.join(resDir, dir, 'splash_icon.png'));

    console.log(`  ${dir}/splash_icon.png: ${size}x${size} (logo ${logoSize}px)`);
  }
}

async function generateSplashScreens() {
  console.log('\nGenerating splash.png files...');

  const allSizes = {
    ...SPLASH_PORT_SIZES,
    ...SPLASH_LAND_SIZES,
    'drawable': [480, 800], // fallback
  };

  for (const [dir, [w, h]] of Object.entries(allSizes)) {
    // Logo at 55% of the smaller dimension for a prominent WhatsApp/Facebook-style splash
    const logoSize = Math.round(Math.min(w, h) * 0.55);

    const resizedLogo = await sharp(SOURCE)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    const left = Math.round((w - logoSize) / 2);
    const top = Math.round((h - logoSize) / 2);

    await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: BG_COLOR,
      },
    })
      .composite([{ input: resizedLogo, left, top }])
      .png()
      .toFile(path.join(resDir, dir, 'splash.png'));

    console.log(`  ${dir}/splash.png: ${w}x${h} (logo ${logoSize}px)`);
  }
}

async function main() {
  await generateSplashIcons();
  await generateSplashScreens();
  console.log('\nDone! All splash assets regenerated.');
}

main().catch(console.error);
