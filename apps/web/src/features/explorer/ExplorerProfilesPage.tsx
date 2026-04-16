import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './explorer.css';
import { explorer as explorerApi, type ExplorerProfileApi } from '../../lib/api-client';
import { useMarketPreference } from '../../app/providers/MarketPreferenceProvider';
import { useHoverPopup, ProfileHoverPopup, type ProfileHoverData } from '../../components/HoverPopup';
import { useScrollRestore } from '../../utils/useScrollRestore';
import { SeoMeta } from '../../components/SeoMeta';

export function ExplorerProfilesPage() {
  const navigate = useNavigate();
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const defaultCity = getCountryConfig(effectiveCountry).defaultCity;
  const [profiles, setProfiles] = useState<ExplorerProfileApi[]>([]);
  const [loading, setLoading] = useState(true);
  const profileHover = useHoverPopup<ProfileHoverData>();
  useScrollRestore();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await explorerApi.profiles({ limit: 50, city: defaultCity, country: effectiveCountry });
        if (!cancelled) setProfiles(data);
      } catch {
        // silencieux
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [defaultCity, effectiveCountry]);

  return (
    <section className="explorer-directory-shell animate-fade-in">
      <SeoMeta
        title="Profils publics | Kin-Sell"
        description="Consultez les vendeurs et prestataires actifs sur Kin-Sell. Trouvez le bon profil pour vos achats à Kinshasa."
        canonical="https://kin-sell.com/explorer/public-profiles"
      />
      <div className="explorer-directory-hero">
        <p className="explorer-hero-label">👥 Profils publics</p>
        <h1 className="explorer-directory-title">Tous les profils publics disponibles</h1>
        <p className="explorer-directory-subtitle">
          Consulte les vendeurs et prestataires qui ont activé leur visibilité publique sur Kin-Sell.
        </p>
        <div className="explorer-directory-count">
          {loading ? '…' : `${profiles.length} profil${profiles.length > 1 ? 's' : ''} trouvé${profiles.length > 1 ? 's' : ''}`}
        </div>
      </div>

      {loading ? (
        <div className="explorer-directory-loader">Chargement des profils…</div>
      ) : profiles.length === 0 ? (
        <div className="explorer-directory-empty">
          <span className="explorer-directory-empty-icon">👥</span>
          <p>Aucun profil public disponible pour le moment.</p>
          <p className="explorer-directory-empty-hint">Les profils apparaîtront ici dès que des utilisateurs activeront leur visibilité.</p>
        </div>
      ) : (
        <div className="explorer-directory-grid explorer-directory-grid--profiles">
          {profiles.map((profile) => (
            <div role="button" key={profile.id} onClick={() => navigate(profile.username ? `/user/${profile.username}` : '#')} className="explorer-dir-card explorer-dir-card--profile"
              onMouseEnter={(e) => profileHover.handleMouseEnter({ avatarUrl: profile.avatarUrl, name: profile.displayName, username: profile.username, kinId: null, publicPageUrl: profile.username ? `/user/${profile.username}` : null }, e)}
              onMouseLeave={profileHover.handleMouseLeave}
            >
              <div className="explorer-dir-card-avatar">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.displayName} />
                ) : (
                  <div className="explorer-dir-card-avatar--placeholder">👤</div>
                )}
                <span className="explorer-dir-card-badge">{profile.badge}</span>
              </div>
              <div className="explorer-dir-card-body">
                <h3 className="explorer-dir-card-name">{profile.displayName}</h3>
                <p className="explorer-dir-card-city">📍 {profile.city}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProfileHoverPopup popup={profileHover.popup} />
    </section>
  );
}