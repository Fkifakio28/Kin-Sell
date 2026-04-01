const SITE_URL = (process.env.SITE_URL || "https://kin-sell.com").replace(/\/$/, "");
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;

const INDEXNOW_KEY = process.env.INDEXNOW_KEY;
const INDEXNOW_KEY_LOCATION = process.env.INDEXNOW_KEY_LOCATION || `${SITE_URL}/${INDEXNOW_KEY || ""}.txt`;

async function submitIndexNow() {
  if (!INDEXNOW_KEY) {
    console.log("[notify] IndexNow: ignoré (INDEXNOW_KEY non défini).");
    return false;
  }

  const payload = {
    host: new URL(SITE_URL).hostname,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList: [SITEMAP_URL, SITE_URL],
  };

  try {
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      console.log(`[notify] IndexNow: OK (${response.status})`);
      return true;
    }

    const body = await response.text().catch(() => "");
    console.warn(`[notify] IndexNow: HTTP ${response.status}${body ? ` - ${body}` : ""}`);
    return false;
  } catch (error) {
    console.warn(`[notify] IndexNow: failed (${error?.message || "network error"})`);
    return false;
  }
}

async function run() {
  console.log(`[notify] Sitemap: ${SITEMAP_URL}`);

  const indexNowOk = await submitIndexNow();

  console.log(`[notify] Completed: IndexNow ${indexNowOk ? "acknowledged" : "not acknowledged"}.`);
  console.log("[notify] Google: soumettre manuellement dans Search Console (Sitemaps > Ajouter un sitemap), ou utiliser l'API Search Console avec OAuth service account.");
}

run().catch((error) => {
  console.error("[notify] Script failed:", error);
  process.exit(1);
});
