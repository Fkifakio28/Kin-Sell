import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { sokin as sokinApi, type SoKinApiFeedPost } from "../../lib/services/sokin.service";
import { SeoMeta } from "../../components/SeoMeta";
import { SoKinMobileNav } from "./SoKinMobileNav";
import "./sokin.css";

/* ── Helpers ── */
const POST_TYPE_META: Record<string, { icon: string; label: string }> = {
  SELLING: { icon: "💰", label: "Vente" },
  PROMO: { icon: "🔥", label: "Promo" },
  SHOWCASE: { icon: "📸", label: "Vitrine" },
  DISCUSSION: { icon: "💬", label: "Discussion" },
  QUESTION: { icon: "❓", label: "Question" },
  SEARCH: { icon: "🔍", label: "Recherche" },
  UPDATE: { icon: "📢", label: "Actu" },
  REVIEW: { icon: "⭐", label: "Avis" },
  TREND: { icon: "📈", label: "Tendance" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}j`;
  return new Date(dateStr).toLocaleDateString("fr-FR");
}

/* ── Main component ── */
export function SoKinBookmarks() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [posts, setPosts] = useState<SoKinApiFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const fetchBookmarks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await sokinApi.myBookmarks({ limit: 100 });
      setPosts(res.posts ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    fetchBookmarks();
  }, [user, navigate, fetchBookmarks]);

  const handleRemoveBookmark = useCallback(async (postId: string) => {
    setRemovingIds((prev) => new Set(prev).add(postId));
    try {
      await sokinApi.bookmark(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      /* silently fail */
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  }, []);

  const handleOpenPost = useCallback((postId: string) => {
    navigate(`/sokin?post=${postId}`);
  }, [navigate]);

  /* ── Render ── */
  return (
    <>
      <SeoMeta
        title="Enregistrés — So-Kin"
        description="Vos publications sauvegardées sur So-Kin"
        canonical="https://kin-sell.com/sokin/bookmarks"
      />

      <div className="sk-bookmarks-page">
        {/* ── Header ── */}
        <header className="sk-bookmarks-header glass-container">
          <button
            type="button"
            className="sk-bookmarks-back"
            onClick={() => navigate("/sokin")}
            aria-label="Retour à So-Kin"
          >
            ← So-Kin
          </button>
          <h1 className="sk-bookmarks-title">🔖 Enregistrés</h1>
          <span className="sk-bookmarks-count">
            {posts.length} publication{posts.length !== 1 ? "s" : ""}
          </span>
        </header>

        {/* ── Content ── */}
        <main className="sk-bookmarks-content">
          {loading && (
            <div className="sk-bookmarks-loading">
              <div className="sk-feed-skeleton" />
              <div className="sk-feed-skeleton" />
              <div className="sk-feed-skeleton" />
            </div>
          )}

          {error && (
            <div className="sk-bookmarks-error glass-container">
              <p>❌ {error}</p>
              <button type="button" className="sk-bookmarks-retry" onClick={fetchBookmarks}>
                Réessayer
              </button>
            </div>
          )}

          {!loading && !error && posts.length === 0 && (
            <div className="sk-bookmarks-empty glass-container">
              <span className="sk-bookmarks-empty-icon">🔖</span>
              <h2>Aucune publication enregistrée</h2>
              <p>Appuyez sur le bouton sauvegarder d'une publication pour la retrouver ici.</p>
              <button type="button" className="sk-bookmarks-cta" onClick={() => navigate("/sokin")}>
                Explorer So-Kin
              </button>
            </div>
          )}

          {!loading && !error && posts.length > 0 && (
            <div className="sk-bookmarks-list">
              {posts.map((post) => {
                const meta = POST_TYPE_META[post.postType] ?? { icon: "📝", label: post.postType };
                const profile = post.author?.profile;
                const displayName = profile?.displayName ?? "Utilisateur";
                const avatarUrl = profile?.avatarUrl;
                const firstMedia = post.mediaUrls?.[0];

                return (
                  <article
                    key={post.id}
                    className="sk-bookmarks-card glass-container"
                  >
                    {/* Author row */}
                    <div className="sk-bookmarks-card-head">
                      <span className="sk-bookmarks-avatar">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="sk-bookmarks-avatar-img" />
                        ) : (
                          displayName.charAt(0).toUpperCase()
                        )}
                      </span>
                      <div className="sk-bookmarks-author-info">
                        <strong>{displayName}</strong>
                        <span className="sk-bookmarks-meta">
                          {meta.icon} {meta.label} · {timeAgo(post.createdAt)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="sk-bookmarks-remove"
                        onClick={() => handleRemoveBookmark(post.id)}
                        disabled={removingIds.has(post.id)}
                        aria-label="Retirer des enregistrés"
                        title="Retirer"
                      >
                        {removingIds.has(post.id) ? "⏳" : "✕"}
                      </button>
                    </div>

                    {/* Content (clickable) */}
                    <button
                      type="button"
                      className="sk-bookmarks-card-body"
                      onClick={() => handleOpenPost(post.id)}
                    >
                      {post.text && (
                        <p className="sk-bookmarks-text">
                          {post.text.length > 180 ? post.text.slice(0, 180) + "…" : post.text}
                        </p>
                      )}
                      {firstMedia && (
                        <div className="sk-bookmarks-thumb">
                          {firstMedia.match(/\.(mp4|mov|webm)/i) ? (
                            <div className="sk-bookmarks-thumb-video">🎬</div>
                          ) : (
                            <img src={firstMedia} alt="" className="sk-bookmarks-thumb-img" loading="lazy" />
                          )}
                          {post.mediaUrls.length > 1 && (
                            <span className="sk-bookmarks-media-count">+{post.mediaUrls.length - 1}</span>
                          )}
                        </div>
                      )}
                    </button>

                    {/* Footer stats */}
                    <div className="sk-bookmarks-card-foot">
                      <span>❤️ {post.likes}</span>
                      <span>💬 {post.comments}</span>
                      <span>🔄 {post.shares}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        <SoKinMobileNav />
        <div className="sk-sub-bnav-spacer" />
      </div>
    </>
  );
}
