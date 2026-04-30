import { useEffect, useState } from "react";
import { blog, type PublicBlogPost } from "../../lib/api-client";
import { resolveMediaUrl } from "../../lib/api-core";
import { SeoMeta } from "../../components/SeoMeta";
import { useAuth } from "../../app/providers/AuthProvider";
import "./blog.css";

function formatDate(value: string | null, fallback: string): string {
  return new Date(value ?? fallback).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function BlogPage() {
  const { isLoggedIn } = useAuth();
  const [posts, setPosts] = useState<PublicBlogPost[]>([]);
  const [myReactions, setMyReactions] = useState<Record<string, "like" | "dislike" | null>>({});
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await blog.publicPosts({ limit: 50 });
        const posts = Array.isArray(data.posts) ? data.posts : [];
        if (!cancelled) {
          setPosts(posts);
          if (isLoggedIn && posts.length > 0) {
            const reactionState = await blog.myReactions(posts.map((p) => p.id));
            if (!cancelled) setMyReactions(reactionState.reactions);
          }
        }
      } catch {
        if (!cancelled) {
          setPosts([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const reactToPost = async (post: PublicBlogPost, reaction: "like" | "dislike") => {
    if (!isLoggedIn || actionBusy) return;
    setActionBusy(`${post.id}:${reaction}`);
    try {
      const current = myReactions[post.id] ?? null;
      const next = current === reaction ? "clear" : reaction;
      const res = await blog.react(post.slug, next);
      setPosts((prev) => prev.map((p) => (
        p.id === post.id ? { ...p, likes: res.likes, dislikes: res.dislikes } : p
      )));
      setMyReactions((prev) => ({ ...prev, [post.id]: res.myReaction }));
    } finally {
      setActionBusy(null);
    }
  };

  const sharePost = async (post: PublicBlogPost) => {
    if (actionBusy) return;
    setActionBusy(`${post.id}:share`);
    try {
      const shareUrl = `https://kin-sell.com/blog#${post.slug}`;
      if (navigator.share) {
        await navigator.share({ title: post.title, text: post.excerpt ?? post.title, url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      const res = await blog.share(post.slug);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, shares: res.shares } : p)));
    } catch {
      // Aucun blocage UI si le partage est annulé.
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="blog">
      <SeoMeta
        title="Blog Kin-Sell — Actualités et nouveautés"
        description="Suivez les dernières actualités, améliorations et annonces de la plateforme Kin-Sell: sécurité, IA, So-Kin, négociation et outils business."
        canonical="https://kin-sell.com/blog"
      />
      <section className="glass-container blog-hero">
        <p className="blog-hero-eyebrow">Kin-Sell Blog</p>
        <h1 className="blog-hero-title">Actualités produit et évolutions de la plateforme</h1>
        <p className="blog-hero-desc">
          Cette page rassemble les nouveautés publiées depuis l'espace admin: sécurité, IA, So-Kin, négociation, cartographie et outils business.
        </p>
      </section>

      {loading ? (
        <section className="glass-container blog-status">
          Chargement des articles…
        </section>
      ) : posts.length === 0 ? (
        <section className="glass-container blog-status">
          Aucun article publié pour le moment.
        </section>
      ) : (
        <section className="blog-grid">
          {posts.map((post) => (
            <article key={post.id} className="glass-card blog-card">
              {post.coverImage && (
                <img className="blog-card-cover" src={resolveMediaUrl(post.coverImage)} alt={post.title} loading="lazy" decoding="async" />
              )}
              {post.mediaUrl && post.mediaType === "video" && (
                <video className="blog-card-video" controls preload="metadata" src={resolveMediaUrl(post.mediaUrl)} />
              )}
              {post.gifUrl && (
                <img className="blog-card-gif" src={resolveMediaUrl(post.gifUrl)} alt={`GIF ${post.title}`} loading="lazy" decoding="async" />
              )}
              <div>
                <span className="blog-card-meta">
                  {post.author} · {formatDate(post.publishedAt, post.createdAt)}
                </span>
                <h2 className="blog-card-title">{post.title}</h2>
              </div>
              <p className="blog-card-excerpt">
                {post.excerpt ?? post.content}
              </p>
              <p className="blog-card-content">
                {post.content}
              </p>
              <div className="blog-card-actions">
                <button
                  type="button"
                  className={`blog-action-btn ${myReactions[post.id] === "like" ? "is-active" : ""}`}
                  onClick={() => reactToPost(post, "like")}
                  disabled={!isLoggedIn || actionBusy === `${post.id}:like`}
                  title={isLoggedIn ? "J'aime" : "Connectez-vous pour réagir"}
                >
                  👍 {post.likes}
                </button>
                <button
                  type="button"
                  className={`blog-action-btn ${myReactions[post.id] === "dislike" ? "is-active" : ""}`}
                  onClick={() => reactToPost(post, "dislike")}
                  disabled={!isLoggedIn || actionBusy === `${post.id}:dislike`}
                  title={isLoggedIn ? "Je n'aime pas" : "Connectez-vous pour réagir"}
                >
                  👎 {post.dislikes}
                </button>
                <button
                  type="button"
                  className="blog-action-btn"
                  onClick={() => sharePost(post)}
                  disabled={actionBusy === `${post.id}:share`}
                  title="Partager"
                >
                  ↗️ {post.shares}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}