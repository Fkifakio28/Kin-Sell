import { useEffect, useState } from "react";
import { blog, type PublicBlogPost } from "../../lib/api-client";
import { SeoMeta } from "../../components/SeoMeta";
import "./blog.css";

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
            </article>
          ))}
        </section>
      )}
    </div>
  );
}