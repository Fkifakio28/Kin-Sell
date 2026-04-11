/**
 * InlineSearchResults — Résultats de recherche inline sous la barre de saisie.
 * Utilisé dans les overlays de recherche mobile (Home, So-Kin, espace privé).
 */
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  listings as listingsApi,
  explorer as explorerApi,
  resolveMediaUrl,
  type ExplorerShopApi,
  type ExplorerProfileApi,
} from "../lib/api-client";
import { useLocaleCurrency } from "../app/providers/LocaleCurrencyProvider";
import "./inline-search-results.css";

type SearchResultItem =
  | { kind: "product" | "service"; id: string; title: string; price: string; image: string | null; owner: string; link: string }
  | { kind: "shop"; id: string; name: string; city: string; logo: string | null; slug: string }
  | { kind: "profile"; id: string; displayName: string; username: string | null; avatar: string | null; city: string };

export function InlineSearchResults({
  query,
  onNavigate,
  t,
}: {
  query: string;
  onNavigate: () => void;
  t: (k: string) => string;
}) {
  const navigate = useNavigate();
  const { formatPriceLabelFromUsdCents } = useLocaleCurrency();
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return;
      setLoading(true);
      try {
        const [prodRes, svcRes, profiles, shops] = await Promise.all([
          listingsApi.search({ q, type: "PRODUIT", limit: 5 }).catch(() => ({ results: [] as any[] })),
          listingsApi.search({ q, type: "SERVICE", limit: 5 }).catch(() => ({ results: [] as any[] })),
          explorerApi.profiles({ limit: 5 }).catch(() => [] as ExplorerProfileApi[]),
          explorerApi.shops({ limit: 5 }).catch(() => [] as ExplorerShopApi[]),
        ]);
        if (controller.signal.aborted) return;

        const items: SearchResultItem[] = [];

        for (const item of prodRes.results) {
          items.push({
            kind: "product",
            id: item.id,
            title: item.title,
            price: formatPriceLabelFromUsdCents(
              item.promoActive && item.promoPriceUsdCents != null ? item.promoPriceUsdCents : item.priceUsdCents
            ),
            image: item.imageUrl,
            owner: item.owner.displayName,
            link: item.owner.username ? `/user/${item.owner.username}#${item.id}` : `/explorer?q=${encodeURIComponent(item.title)}`,
          });
        }

        for (const item of svcRes.results) {
          items.push({
            kind: "service",
            id: item.id,
            title: item.title,
            price: formatPriceLabelFromUsdCents(
              item.promoActive && item.promoPriceUsdCents != null ? item.promoPriceUsdCents : item.priceUsdCents
            ),
            image: item.imageUrl,
            owner: item.owner.displayName,
            link: item.owner.username ? `/user/${item.owner.username}#${item.id}` : `/explorer?q=${encodeURIComponent(item.title)}`,
          });
        }

        const ql = q.toLowerCase();
        for (const p of profiles) {
          const match = [p.displayName, p.username, p.city].filter(Boolean).join(" ").toLowerCase().includes(ql);
          if (match) {
            items.push({
              kind: "profile",
              id: p.userId,
              displayName: p.displayName,
              username: p.username,
              avatar: p.avatarUrl,
              city: p.city,
            });
          }
        }

        for (const s of shops) {
          const match = [s.name, s.city, s.publicDescription].filter(Boolean).join(" ").toLowerCase().includes(ql);
          if (match) {
            items.push({
              kind: "shop",
              id: s.id,
              name: s.name,
              city: s.city,
              logo: s.logo,
              slug: s.slug,
            });
          }
        }

        setResults(items);
      } catch {
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, formatPriceLabelFromUsdCents]);

  const handleClick = (item: SearchResultItem) => {
    onNavigate();
    if (item.kind === "product" || item.kind === "service") {
      navigate(item.link);
    } else if (item.kind === "profile") {
      navigate(item.username ? `/user/${item.username}` : `/explorer/profils-publics`);
    } else if (item.kind === "shop") {
      navigate(`/shop/${item.slug}`);
    }
  };

  if (query.trim().length < 2) return null;

  return (
    <div className="isr-container">
      {loading && <div className="isr-loading">{t("common.loading")}</div>}

      {!loading && results.length === 0 && query.trim().length >= 2 && (
        <div className="isr-empty">{t("common.noResults")}</div>
      )}

      {results.length > 0 && (
        <ul className="isr-list">
          {results.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="isr-item" onClick={() => handleClick(item)}>
              <div className="isr-item-thumb">
                {item.kind === "product" || item.kind === "service" ? (
                  <img src={resolveMediaUrl(item.image) || "/assets/kin-sell/placeholder.jpg"} alt="" />
                ) : item.kind === "shop" ? (
                  <img src={resolveMediaUrl(item.logo) || "/assets/kin-sell/placeholder.jpg"} alt="" />
                ) : item.kind === "profile" ? (
                  <img src={resolveMediaUrl(item.avatar) || "/assets/kin-sell/placeholder.jpg"} alt="" />
                ) : null}
              </div>
              <div className="isr-item-info">
                {(item.kind === "product" || item.kind === "service") && (
                  <>
                    <span className="isr-item-title">{item.title}</span>
                    <span className="isr-item-meta">{item.price} · {item.owner}</span>
                  </>
                )}
                {item.kind === "shop" && (
                  <>
                    <span className="isr-item-title">🏪 {item.name}</span>
                    <span className="isr-item-meta">{item.city}</span>
                  </>
                )}
                {item.kind === "profile" && (
                  <>
                    <span className="isr-item-title">👤 {item.displayName}</span>
                    <span className="isr-item-meta">{item.username ? `@${item.username}` : ""} · {item.city}</span>
                  </>
                )}
              </div>
              <span className="isr-item-badge">
                {item.kind === "product" ? "📦" : item.kind === "service" ? "🔧" : item.kind === "shop" ? "🏪" : "👤"}
              </span>
            </li>
          ))}

          {/* Lien "Voir tout dans Explorer" en bas */}
          <li
            className="isr-item isr-item--seeall"
            onClick={() => {
              onNavigate();
              navigate(`/explorer?q=${encodeURIComponent(query.trim())}`);
            }}
          >
            <span className="isr-seeall-text">{t("common.seeMore")} → Explorer</span>
          </li>
        </ul>
      )}
    </div>
  );
}
