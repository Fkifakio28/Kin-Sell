import { useEffect, useState } from "react";
import { blog, type PublicBlogPost } from "../../lib/api-client";

function formatDate(value: string | null, fallback: string): string {
  return new Date(value ?? fallback).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function BlogPage() {
  const [posts, setPosts] = useState<PublicBlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await blog.publicPosts({ limit: 12 });
        if (!cancelled) {
          setPosts(data.posts);
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
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem 0 2rem" }}>
      <section className="glass-container" style={{ padding: "1.2rem" }}>
        <p style={{ margin: 0, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-primary-hover)" }}>Kin-Sell Blog</p>
        <h1 style={{ margin: "0.35rem 0 0.55rem", fontFamily: "var(--font-family-display)", color: "var(--color-text-primary)" }}>Actualités produit et évolutions de la plateforme</h1>
        <p style={{ margin: 0, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          Cette page rassemble les nouveautés publiées depuis l'espace admin: sécurité, IA, So-Kin, négociation, cartographie et outils business.
        </p>
      </section>

      {loading ? (
        <section className="glass-container" style={{ padding: "1rem", color: "var(--color-text-secondary)" }}>
          Chargement des articles…
        </section>
      ) : posts.length === 0 ? (
        <section className="glass-container" style={{ padding: "1rem", color: "var(--color-text-secondary)" }}>
          Aucun article publié pour le moment.
        </section>
      ) : (
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.9rem" }}>
          {posts.map((post) => (
            <article key={post.id} className="glass-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.22rem" }}>
                <span style={{ fontSize: "0.68rem", color: "var(--color-primary-hover)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {post.author} · {formatDate(post.publishedAt, post.createdAt)}
                </span>
                <h2 style={{ margin: 0, fontSize: "1rem", color: "var(--color-text-primary)" }}>{post.title}</h2>
              </div>
              <p style={{ margin: 0, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                {post.excerpt ?? post.content}
              </p>
              <p style={{ margin: 0, color: "var(--color-text-tertiary)", lineHeight: 1.7, fontSize: "0.9rem" }}>
                {post.content}
              </p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}