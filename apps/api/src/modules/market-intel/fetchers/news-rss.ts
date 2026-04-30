/**
 * Fetcher générique "news-rss"
 *
 * Tente d'abord /rss, /feed, /feed.xml, /rss.xml. Si trouvé, parse les items
 * (title + pubDate + description) et les renvoie comme "signaux" (retournés
 * dans `prices[]` avec value=0 pour alimenter l'aggrégateur de tendances —
 * on ne collecte PAS de prix depuis la presse).
 *
 * Les journaux servent au module Tendances (E7) pour détecter les thèmes
 * saisonniers (ramadan, rentrée, pluies, élections).
 */

import { emptyResult, httpGet, loadCheerio, type Fetcher, type FetchResult, type MarketSourceRow } from "./base.js";
import { logger } from "../../../shared/logger.js";

const RSS_CANDIDATES = ["/rss", "/feed", "/feed.xml", "/rss.xml", "/?feed=rss2", "/atom.xml"];

export const newsRssFetcher: Fetcher = {
  parser: "news-rss",

  async crawl(source: MarketSourceRow): Promise<FetchResult> {
    const result = emptyResult();
    let feedXml: string | null = null;
    let used = "";

    for (const path of RSS_CANDIDATES) {
      const url = source.baseUrl.replace(/\/$/, "") + path;
      const res = await httpGet(url, { accept: "application/rss+xml,application/xml,text/xml" });
      if (res.ok && /<(rss|feed)/i.test(res.text.slice(0, 500))) {
        feedXml = res.text;
        used = url;
        break;
      }
    }

    if (!feedXml) {
      result.errors.push(`No RSS feed found for ${source.name}`);
      result.ok = false;
      return result;
    }

    try {
      const $ = await loadCheerio(feedXml);
      const isAtom = /<feed/i.test(feedXml.slice(0, 500));
      const items = isAtom ? $("entry") : $("item");
      const collectedAt = new Date();

      items.slice(0, 30).each((_, el) => {
        const title = $(el).find("title").first().text().trim();
        const link = isAtom
          ? $(el).find("link").first().attr("href") ?? ""
          : $(el).find("link").first().text().trim();
        if (!title) return;
        // On stocke les titres comme "signaux" (value=0, currency="SIGNAL")
        result.prices.push({
          title,
          priceLocal: 0,
          currency: "SIGNAL",
          url: link || used,
          sourceId: source.id,
          collectedAt,
        });
      });

      logger.debug({ source: source.name, count: result.prices.length }, "[news-rss] parsed");
    } catch (err: any) {
      result.errors.push(`Parse error: ${err?.message ?? String(err)}`);
      result.ok = false;
    }

    return result;
  },
};
