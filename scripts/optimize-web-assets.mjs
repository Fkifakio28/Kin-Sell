#!/usr/bin/env node
/**
 * Optimise les images lourdes de public/assets/kin-sell :
 *  - produit un .webp à qualité 78
 *  - réduit la dimension max (1920px pour hero, 1280px splash)
 *  - écrase le JPG/PNG original en version compressée (q 78, taille réduite)
 *    → le fallback reste fonctionnel si le navigateur ne lit pas .webp
 *
 * Usage : node scripts/optimize-web-assets.mjs
 */

import sharp from "sharp";
import { readdir, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ASSETS_DIR = join(HERE, "..", "apps", "web", "public", "assets", "kin-sell");

const TARGETS = [
  // { name, maxWidth, jpegQuality, webpQuality }
  { match: /^black-man-standing-cafe-with-shopping-bags\.jpg$/, maxWidth: 1600, jpegQuality: 72, webpQuality: 72 },
  { match: /^blackfriday-celebration-marketing\.jpg$/,          maxWidth: 1600, jpegQuality: 72, webpQuality: 72 },
  { match: /^warehouse-order-delivery\.jpg$/,                   maxWidth: 1600, jpegQuality: 72, webpQuality: 72 },
  { match: /^woman-using-computer-credit-card\.jpg$/,           maxWidth: 1600, jpegQuality: 72, webpQuality: 72 },
  { match: /^influencer-doing-shopping-haul\.jpg$/,             maxWidth: 1600, jpegQuality: 72, webpQuality: 72 },
  { match: /^auth-kinsell-2\.png$/,                             maxWidth: 1600, jpegQuality: 78, webpQuality: 75 },
  { match: /^splash-desktop\.png$/,                             maxWidth: 1920, jpegQuality: 85, webpQuality: 82 },
  { match: /^splash-mobile\.png$/,                              maxWidth: 1080, jpegQuality: 85, webpQuality: 82 },
];

const HR = "─".repeat(68);

async function fileSizeKB(p) {
  try { return Math.round((await stat(p)).size / 1024); } catch { return 0; }
}

async function optimize(filePath, cfg) {
  const originalKB = await fileSizeKB(filePath);
  const ext = extname(filePath).toLowerCase();
  const base = basename(filePath, ext);
  const dir = filePath.slice(0, -(basename(filePath).length));
  const webpPath = join(dir, `${base}.webp`);

  // 1) écriture webp
  await sharp(filePath)
    .rotate()
    .resize({ width: cfg.maxWidth, withoutEnlargement: true })
    .webp({ quality: cfg.webpQuality, effort: 5 })
    .toFile(webpPath);

  // 2) remplacement du JPG/PNG d'origine par version compressée
  const tmp = filePath + ".tmp";
  let pipe = sharp(filePath).rotate().resize({ width: cfg.maxWidth, withoutEnlargement: true });
  if (ext === ".png") {
    pipe = pipe.png({ quality: cfg.jpegQuality, compressionLevel: 9, palette: true });
  } else {
    pipe = pipe.jpeg({ quality: cfg.jpegQuality, mozjpeg: true });
  }
  await pipe.toFile(tmp);
  const { rename } = await import("node:fs/promises");
  await rename(tmp, filePath);

  const newKB = await fileSizeKB(filePath);
  const webpKB = await fileSizeKB(webpPath);
  return { originalKB, newKB, webpKB };
}

async function main() {
  const files = await readdir(ASSETS_DIR);
  console.log(HR);
  console.log("Optimisation images — Kin-Sell");
  console.log(HR);
  console.log(`Répertoire : ${ASSETS_DIR}`);
  console.log(HR);

  let totalBefore = 0;
  let totalAfter = 0;

  for (const name of files) {
    const cfg = TARGETS.find((t) => t.match.test(name));
    if (!cfg) continue;
    const fp = join(ASSETS_DIR, name);
    process.stdout.write(`- ${name} … `);
    try {
      const r = await optimize(fp, cfg);
      totalBefore += r.originalKB;
      totalAfter += r.newKB + r.webpKB;
      const delta = r.originalKB - r.newKB;
      const pct = r.originalKB > 0 ? Math.round((delta / r.originalKB) * 100) : 0;
      console.log(`${r.originalKB}KB → ${r.newKB}KB (-${pct}%) + ${r.webpKB}KB webp`);
    } catch (err) {
      console.log(`ERREUR: ${err.message}`);
    }
  }

  console.log(HR);
  const saved = totalBefore - totalAfter;
  console.log(`Total avant : ${totalBefore}KB`);
  console.log(`Total après (incl. webp) : ${totalAfter}KB`);
  console.log(`Économie : ${saved}KB (~${totalBefore > 0 ? Math.round((saved / totalBefore) * 100) : 0}%)`);
  console.log(HR);
}

main().catch((err) => { console.error(err); process.exit(1); });
