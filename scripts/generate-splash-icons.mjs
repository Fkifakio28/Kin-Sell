/**
 * Generate splash_icon.png (Android 12+) and splash.png (Capacitor) for Kin-Sell.
 *
 * Key fix: the logo has a purple-to-cyan gradient on TRANSPARENT background.
 * On the dark #120B2B background, the logo is INVISIBLE.
 * Solution: place a WHITE circle behind the logo in the splash_icon,
 * and a white glow circle behind the logo in splash.png.
 * This makes the logo POP — like WhatsApp (green on white circle).
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resDir = path.join(__dirname, '..', 'apps', 'web', 'android', 'app', 'src', 'main', 'res');

// Source: highest res foreground icon (432×432, logo only, transparent bg)
const SOURCE = path.join(resDir, 'mipmap-xxxhdpi', 'ic_launcher_foreground.png');

const BG_COLOR = { r: 18, g: 11, b: 43, alpha: 1 }; // #120B2B
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// ── Android 12+ splash icon sizes (dp × density) ──
const SPLASH_ICON_SIZES = {
  'drawable-mdpi': 288,
  'drawable-hdpi': 432,
  'drawable-xhdpi': 576,
  'drawable-xxhdpi': 864,
  'drawable-xxxhdpi': 1152,
  'drawable': 288,
};

// ── Capacitor splash.png sizes ──
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

/**
 * Create a white filled circle PNG of given diameter.
 */
async function createWhiteCircle(diameter) {
  const r = diameter / 2;
  const svg = `<svg width="${diameter}" height="${diameter}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${r}" cy="${r}" r="${r}" fill="white"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Android 12+ splash_icon.png:
 * White circle fills the icon area → colorful logo centered on top.
 * The OS shows this inside a circle mask, so the white circle
 * becomes the background and the colorful logo stands out on the dark screen.
 */
async function generateSplashIcons() {
  console.log('Generating splash_icon.png (white circle + logo)...');
  const meta = await sharp(SOURCE).metadata();
  console.log(`Source: ${meta.width}x${meta.height}`);

  for (const [dir, size] of Object.entries(SPLASH_ICON_SIZES)) {
    // White circle takes ~92% of the icon (Android masks to 2/3 circle)
    const circleDiam = Math.round(size * 0.92);
    const circleOffset = Math.round((size - circleDiam) / 2);

    // Logo takes ~60% of the icon (inside the circle)
    const logoSize = Math.round(size * 0.60);
    const logoOffset = Math.round((size - logoSize) / 2);

    const whiteCircle = await createWhiteCircle(circleDiam);
    const resizedLogo = await sharp(SOURCE)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    // Dark background → white circle → logo on top
    await sharp({
      create: { width: size, height: size, channels: 4, background: BG_COLOR },
    })
      .composite([
        { input: whiteCircle, left: circleOffset, top: circleOffset },
        { input: resizedLogo, left: logoOffset, top: logoOffset },
      ])
      .png()
      .toFile(path.join(resDir, dir, 'splash_icon.png'));

    console.log(`  ${dir}/splash_icon.png: ${size}x${size} (circle ${circleDiam}px, logo ${logoSize}px)`);
  }
}

/**
 * Capacitor splash.png:
 * Full-screen dark background → white circle glow → big logo centered.
 */
async function generateSplashScreens() {
  console.log('\nGenerating splash.png (dark bg + white circle + big logo)...');

  const allSizes = {
    ...SPLASH_PORT_SIZES,
    ...SPLASH_LAND_SIZES,
    'drawable': [480, 800],
  };

  for (const [dir, [w, h]] of Object.entries(allSizes)) {
    const minDim = Math.min(w, h);

    // White circle: 50% of the smaller dimension
    const circleDiam = Math.round(minDim * 0.50);
    const circleLeft = Math.round((w - circleDiam) / 2);
    const circleTop = Math.round((h - circleDiam) / 2);

    // Logo: 40% of the smaller dimension (inside the circle)
    const logoSize = Math.round(minDim * 0.40);
    const logoLeft = Math.round((w - logoSize) / 2);
    const logoTop = Math.round((h - logoSize) / 2);

    const whiteCircle = await createWhiteCircle(circleDiam);
    const resizedLogo = await sharp(SOURCE)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp({
      create: { width: w, height: h, channels: 4, background: BG_COLOR },
    })
      .composite([
        { input: whiteCircle, left: circleLeft, top: circleTop },
        { input: resizedLogo, left: logoLeft, top: logoTop },
      ])
      .png()
      .toFile(path.join(resDir, dir, 'splash.png'));

    console.log(`  ${dir}/splash.png: ${w}x${h} (circle ${circleDiam}px, logo ${logoSize}px)`);
  }
}

async function main() {
  await generateSplashIcons();
  await generateSplashScreens();
  console.log('\nDone! All splash assets regenerated with white circle + visible logo.');
}

main().catch(console.error);
