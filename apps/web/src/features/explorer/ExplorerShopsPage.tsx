import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './explorer.css';
import { explorer as explorerApi, type ExplorerShopApi } from '../../lib/api-client';
import { useHoverPopup, ProfileHoverPopup, type ProfileHoverData } from '../../components/HoverPopup';
import { useScrollRestore } from '../../utils/useScrollRestore';

export function ExplorerShopsPage() {
  const navigate = useNavigate();
  const [shops, setShops] = useState<ExplorerShopApi[]>([]);
  const [loading, setLoading] = useState(true);
  const shopHover = useHoverPopup<ProfileHoverData>();
  useScrollRestore();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await explorerApi.shops(50);
        if (!cancelled) setShops(data);
      } catch {
        // silencieux
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="explorer-directory-shell animate-fade-in">
      <div className="explorer-directory-hero">
        <p className="explorer-hero-label">🏪 Boutiques en ligne</p>
        <h1 className="explorer-directory-title">Toutes les boutiques actives sur Kin-Sell</h1>
        <p className="explorer-directory-subtitle">
          Découvrez toutes les vitrines publiques actuellement disponibles et actives sur la plateforme.
        </p>
        <div className="explorer-directory-count">
          {loading ? '…' : `${shops.length} boutique${shops.length > 1 ? 's' : ''} trouvée${shops.length > 1 ? 's' : ''}`}
        </div>
      </div>

      {loading ? (
        <div className="explorer-directory-loader">Chargement des boutiques…</div>
      ) : shops.length === 0 ? (
        <div className="explorer-directory-empty">
          <span className="explorer-directory-empty-icon">🏪</span>
          <p>Aucune boutique active pour le moment.</p>
          <p className="explorer-directory-empty-hint">Les boutiques apparaîtront ici dès leur création.</p>
        </div>
      ) : (
        <div className="explorer-directory-grid explorer-directory-grid--shops">
          {shops.map((shop) => (
            <div role="button" key={shop.id} onClick={() => navigate(`/business/${shop.slug}`)} className="explorer-dir-card"
              onMouseEnter={(e) => shopHover.handleMouseEnter({ avatarUrl: shop.coverImage || shop.logo, name: shop.name, username: shop.slug, kinId: null, publicPageUrl: `/business/${shop.slug}` }, e)}
              onMouseLeave={shopHover.handleMouseLeave}
            >
              <div className="explorer-dir-card-cover">
                {shop.coverImage ? (
                  <img src={shop.coverImage} alt={shop.name} />
                ) : (
                  <div className="explorer-dir-card-cover--placeholder">🏪</div>
                )}
                <span className="explorer-dir-card-badge">{shop.badge}</span>
              </div>
              <div className="explorer-dir-card-body">
                <h3 className="explorer-dir-card-name">{shop.name}</h3>
                <p className="explorer-dir-card-city">📍 {shop.city}</p>
                {shop.publicDescription && (
                  <p className="explorer-dir-card-desc">{shop.publicDescription}</p>
                )}
                <span className="explorer-dir-card-status explorer-dir-card-status--online">En ligne</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProfileHoverPopup popup={shopHover.popup} />
    </section>
  );
}