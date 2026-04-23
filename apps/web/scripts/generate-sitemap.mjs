import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

const SITE_URL = (process.env.SITE_URL || "https://kin-sell.com").replace(/\/$/, "");
const API_URL = (process.env.SITEMAP_API_URL || process.env.VITE_API_BASE_URL || "https://api.kin-sell.com").replace(/\/$/, "");

// Pages publiques réellement routées dans apps/web/src/app/router/routes.ts
const staticPaths = [
  "/",
  "/explorer",
  "/explorer?type=produits",
  "/explorer?type=services",
  "/services",
  "/forfaits",
  "/sokin",
];

const xmlEscape = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

async function safeFetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function getDynamicPaths() {
  const [shopsRes, profilesRes] = await Promise.all([
    safeFetchJson(`${API_URL}/explorer/shops?limit=50`),
    safeFetchJson(`${API_URL}/explorer/profiles?limit=50`),
  ]);

  const shopPaths = Array.isArray(shopsRes)
    ? shopsRes
    : Array.isArray(shopsRes?.result)
      ? shopsRes.result
      : Array.isArray(shopsRes?.shops)
        ? shopsRes.shops
        : [];

  const profilePaths = Array.isArray(profilesRes)
    ? profilesRes
    : Array.isArray(profilesRes?.result)
      ? profilesRes.result
      : Array.isArray(profilesRes?.profiles)
        ? profilesRes.profiles
        : [];

  const dynamic = [];

  for (const shop of shopPaths) {
    if (typeof shop?.slug === "string" && shop.slug.trim()) {
      dynamic.push(`/business/${encodeURIComponent(shop.slug.trim())}`);
    }
  }

  for (const profile of profilePaths) {
    if (typeof profile?.username === "string" && profile.username.trim()) {
      dynamic.push(`/user/${encodeURIComponent(profile.username.trim())}`);
    }
  }

  return dynamic;
}

function buildUrlset(paths, now, priority = "0.7") {
  const urls = paths
    .map((routePath) => {
      const loc = `${SITE_URL}${routePath}`;
      return [
        "  <url>",
        `    <loc>${xmlEscape(loc)}</loc>`,
        `    <lastmod>${now}</lastmod>`,
        "    <changefreq>daily</changefreq>",
        `    <priority>${priority}</priority>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

function buildSitemapIndex(now, sitemapFiles) {
  const nodes = sitemapFiles
    .map((name) => {
      const loc = `${SITE_URL}/${name}`;
      return [
        "  <sitemap>",
        `    <loc>${xmlEscape(loc)}</loc>`,
        `    <lastmod>${now}</lastmod>`,
        "  </sitemap>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    nodes,
    "</sitemapindex>",
    "",
  ].join("\n");
}

async function generateSitemap() {
  const dynamicPaths = Array.from(new Set(await getDynamicPaths()));
  const uniqueStaticPaths = Array.from(new Set(staticPaths));
  const now = new Date().toISOString();

  const staticSitemap = buildUrlset(uniqueStaticPaths, now, "0.8");
  const dynamicSitemap = buildUrlset(dynamicPaths, now, "0.7");
  const sitemapIndex = buildSitemapIndex(now, ["sitemap-static.xml", "sitemap-dynamic.xml"]);

  await writeFile(path.join(publicDir, "sitemap-static.xml"), staticSitemap, "utf8");
  await writeFile(path.join(publicDir, "sitemap-dynamic.xml"), dynamicSitemap, "utf8");
  await writeFile(path.join(publicDir, "sitemap.xml"), sitemapIndex, "utf8");

  const robots = [
    "User-agent: *",
    "Allow: /",
    "Allow: /explorer",
    "Allow: /services",
    "Allow: /forfaits",
    "Allow: /sokin",
    "",
    "# Pages privées / authentifiées",
    "Disallow: /login",
    "Disallow: /register",
    "Disallow: /forgot-password",
    "Disallow: /auth/",
    "Disallow: /account",
    "Disallow: /admin/",
    "Disallow: /business/dashboard",
    "Disallow: /messaging",
    "Disallow: /cart",
    "Disallow: /suspended",
    "Disallow: /offline",
    "Disallow: /sokin/dashboard",
    "Disallow: /sokin/bookmarks",
    "",
    "# Paramètres dynamiques (éviter le contenu dupliqué)",
    "Disallow: /*?*utm_",
    "Disallow: /*?*ref=",
    "",
    "# Bots autorisés explicitement",
    "User-agent: Googlebot",
    "Allow: /",
    "",
    "User-agent: Bingbot",
    "Allow: /",
    "",
    "User-agent: GPTBot",
    "Allow: /",
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");

  await writeFile(path.join(publicDir, "robots.txt"), robots, "utf8");

  console.log(`[sitemap] Generated static=${uniqueStaticPaths.length}, dynamic=${dynamicPaths.length}, total=${uniqueStaticPaths.length + dynamicPaths.length}`);
}

generateSitemap().catch((error) => {
  console.error("[sitemap] Generation failed:", error);
  process.exit(1);
});
