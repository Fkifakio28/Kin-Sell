﻿import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ExplorerProfile } from '../explorer/explorer-data';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { sokin as sokinApi } from '../../lib/api-client';
import { useHoverPopup, ProfileHoverPopup, type ProfileHoverData } from '../../components/HoverPopup';
import { useScrollRestore } from '../../utils/useScrollRestore';
import { AdBanner } from '../../components/AdBanner';
import './sokin-directory.css';

const COLUMNS = 4;
const ROWS = 4;
const PAGE_SIZE = COLUMNS * ROWS;

const KINSHASA_COMMUNES = [
  'Gombe', 'Lemba', 'Ngaliema', 'Lingwala', 'Barumbu', 'Kasa-Vubu',
  'Kalamu', 'Ngaba', 'Masina', "N'djili", 'Kinshasa', 'Matete',
  'Limete', 'Mont-Ngafula', 'Selembao', 'Kimbanseke', 'Makala', 'Bumbu',
];

export function SoKinProfilesPage() {
  const navigate = useNavigate();
  const { t } = useLocaleCurrency();
  const profileHover = useHoverPopup<ProfileHoverData>();
  useScrollRestore();

  const [search, setSearch] = useState('');
  const [profiles, setProfiles] = useState<ExplorerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // '' = toutes les communes
  const [selectedCommune, setSelectedCommune] = useState('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [sliderPage, setSliderPage] = useState(0);

  /* �"?�"? Chargement unique de tous les profils publics �"?�"? */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        // Pas de filtre city : on charge tous les utilisateurs publics,
        // le filtre commune se fait côté client.
        const data = await sokinApi.publicUsers();
        if (cancelled) return;
        setProfiles(
          data.users.map((u) => ({
            id: u.userId,
            name: u.displayName,
            // username est garanti non-null par le backend (filtre username != null)
            kinId: `@${u.username!}`,
            rating: 0,
            reviews: 0,
            badge: u.verificationStatus === 'VERIFIED' ? 'sokin.verified' : 'sokin.memberBadge',
            href: `/user/${u.username!}`,
            city: u.city ?? '',
            domain: u.domain ?? u.qualification ?? '',
            avatarImage: u.avatarUrl ?? '',
          }))
        );
      } catch {
        // �?tat vide si l'API est indisponible
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  /* �"?�"? Filtre côté client �"?�"? */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      const matchesCommune = !selectedCommune ||
        p.city.toLowerCase().includes(selectedCommune.toLowerCase());
      const matchesSearch = !q ||
        [p.name, p.kinId, p.city, p.domain, p.badge].join(' ').toLowerCase().includes(q);
      return matchesCommune && matchesSearch;
    });
  }, [profiles, search, selectedCommune]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageProfiles = filtered.slice(sliderPage * PAGE_SIZE, (sliderPage + 1) * PAGE_SIZE);

  useEffect(() => {
    setSliderPage(0);
  }, [search, selectedCommune]);

  const locationLabel = selectedCommune || t('sokin.allCommunes');

  /* ── Profils suggérés (hors page courante) ── */
  const suggestedProfiles = useMemo(() => {
    const pageIds = new Set(pageProfiles.map((p) => p.id));
    const pool = profiles.filter((p) => !pageIds.has(p.id));
    // Mélange Fisher-Yates puis 3 premiers
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles.length, sliderPage]);

  return (
    <section className="skd-shell skd-shell-users animate-fade-in">
      <header className="skd-topbar">
        <button type="button" onClick={() => navigate('/sokin')} className="skd-back">{t('sokin.back')}</button>
        <h1 className="skd-title">{t('sokin.profiles')}</h1>
      </header>

      <section className="skd-hero skd-hero-users">
        <p className="skd-hero-kicker">{t('sokin.profilesTitle')}</p>
        <h2 className="skd-hero-title">{t('sokin.profilesHeroTitle')}</h2>
        <p className="skd-hero-desc">
          {t('sokin.profilesHeroDesc')}
        </p>
        <div className="skd-hero-metrics">
          <article>
            <strong>{isLoading ? '\u2026' : profiles.length.toLocaleString('fr-FR')}</strong>
            <span>{t('sokin.publicMembers')}</span>
          </article>
          <article>
            <strong>{isLoading ? '\u2026' : filtered.length.toLocaleString('fr-FR')}</strong>
            <span>{selectedCommune ? `\uD83D\uDCCD ${selectedCommune}` : t('sokin.total')}</span>
          </article>
          <article><strong>{t('sokin.community')}</strong><span>{t('sokin.trustNetwork')}</span></article>
        </div>
      </section>

      {/* Bannière publicitaire */}
      <AdBanner page="sokin-profiles" />

      <div className="skd-search-zone">
        <div className="skd-search-label">{t('sokin.smartSearch')}</div>
        <div className="skd-search-wrap skd-search-wrap--wide">
          <input
            type="search"
            className="skd-search"
            placeholder={t('sokin.searchUserPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => { document.getElementById('skd-users-grid')?.scrollIntoView({ behavior: 'smooth' }); }}
          className="skd-hero-cta"
        >
          {t('sokin.exploreProfiles')}
        </button>

        <div className="skd-location-row">
          <button
            type="button"
            className="skd-location-chip"
            onClick={() => setShowLocationPicker((prev) => !prev)}
            aria-label={t('sokin.changeLocation')}
          >
            {'\uD83D\uDCCD'} {locationLabel} · {isLoading ? '\u2026' : `${filtered.length} profil${filtered.length !== 1 ? 's' : ''}`}
          </button>
          {showLocationPicker && (
            <div className="skd-location-picker" role="listbox" aria-label={t('sokin.chooseCommune')}>
              <p className="skd-location-picker-label">{t('sokin.chooseCommune')}</p>
              <button
                type="button"
                role="option"
                aria-selected={selectedCommune === ''}
                className={`skd-location-option${selectedCommune === '' ? ' active' : ''}`}
                onClick={() => { setSelectedCommune(''); setShowLocationPicker(false); }}
              >
                {t('sokin.allCommunes')}
              </button>
              {KINSHASA_COMMUNES.map((commune) => (
                <button
                  type="button"
                  key={commune}
                  role="option"
                  aria-selected={selectedCommune === commune}
                  className={`skd-location-option${selectedCommune === commune ? ' active' : ''}`}
                  onClick={() => { setSelectedCommune(commune); setShowLocationPicker(false); }}
                >
                  {commune}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="skd-layout-full">
        {/* ── Profils suggérés ── */}
        {suggestedProfiles.length > 0 && (
          <aside className="skd-suggested" aria-label={t('sokin.suggestedProfiles')}>
            <p className="skd-suggested-title">{t('sokin.suggestedProfiles')}</p>
            <div className="skd-suggested-list">
              {suggestedProfiles.map((sp) => (
                <div
                  key={sp.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(sp.href)}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(sp.href); }}
                  className="skd-suggested-item"
                >
                  {sp.avatarImage ? (
                    <img className="skd-suggested-avatar" src={sp.avatarImage} alt={sp.name} />
                  ) : (
                    <div className="skd-suggested-avatar skd-suggested-avatar--placeholder">
                      <span>{sp.name.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="skd-suggested-info">
                    <strong>{sp.name}</strong>
                    <span>{sp.kinId}</span>
                    {sp.city ? <span>{'\uD83D\uDCCD'} {sp.city}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Bannière publicitaire (uniquement si publiée) */}
        <AdBanner page="sokin-profiles" />

        <div id="skd-users-grid" className="skd-content-full">
          <div className="skd-slider-box">
            <div className="skd-slider-header">
              {isLoading ? (
                <span className="skd-slider-info">{t('sokin.loadingProfiles')}</span>
              ) : (
                <span className="skd-slider-info">
                  {filtered.length === 0
                    ? t('sokin.noProfile')
                    : `${t('sokin.page')} ${sliderPage + 1} / ${totalPages} \u2014 ${filtered.length} profil${filtered.length !== 1 ? 's' : ''}`}
                </span>
              )}
              <div className="skd-slider-nav">
                <button
                  type="button"
                  className="skd-slider-btn"
                  disabled={sliderPage === 0}
                  onClick={() => setSliderPage((p) => Math.max(0, p - 1))}
                  aria-label={t('sokin.prevPage')}
                >
                  {'\u25C0'}
                </button>
                <button
                  type="button"
                  className="skd-slider-btn"
                  disabled={sliderPage >= totalPages - 1}
                  onClick={() => setSliderPage((p) => Math.min(totalPages - 1, p + 1))}
                  aria-label={t('sokin.nextPage')}
                >
                  {'\u25B6'}
                </button>
              </div>
            </div>

            {isLoading ? (
              <p className="skd-empty">{t('sokin.loadingInProgress')}</p>
            ) : pageProfiles.length === 0 ? (
              <p className="skd-empty">
                {profiles.length === 0
                  ? t('sokin.noPublicProfile')
                  : `${t('sokin.noProfileFound')}${selectedCommune ? ` ${t('sokin.inArea')} ${selectedCommune}` : ''}${search ? ` "${search}"` : ''}.`}
              </p>
            ) : (
              <div className="skd-slider-grid skd-grid-with-ads">
                {pageProfiles.map((profile, index) => (
                    <div
                      key={profile.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(profile.href)}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(profile.href); }}
                      className="skd-card"
                      onMouseEnter={(e) => profileHover.handleMouseEnter({
                        avatarUrl: profile.avatarImage || null,
                        name: profile.name,
                        username: profile.kinId.replace('@', ''),
                        kinId: profile.kinId,
                        publicPageUrl: profile.href,
                      }, e)}
                      onMouseLeave={profileHover.handleMouseLeave}
                    >
                      <div className="skd-card-cover-wrap">
                        {profile.avatarImage ? (
                          <img className="skd-card-cover" src={profile.avatarImage} alt={profile.name} />
                        ) : (
                          <div className="skd-card-cover skd-card-cover--placeholder">
                            <span>{profile.name.charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <span className="skd-card-badge">{t(profile.badge)}</span>
                      </div>
                      <div className="skd-card-body">
                        <h3 className="skd-card-name">{profile.name}</h3>
                        <p className="skd-card-domain">{profile.kinId}</p>
                        {profile.domain ? <p className="skd-card-domain">{profile.domain}</p> : null}
                        {profile.city ? <p className="skd-card-city">{'\uD83D\uDCCD'} {profile.city}</p> : null}
                        <span className="skd-card-action">{t('sokin.viewProfile')}</span>
                      </div>
                    </div>
                ))}
              </div>
            )}

            {!isLoading && totalPages > 1 && (
              <div className="skd-slider-dots">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    type="button"
                    key={i}
                    className={`skd-dot${i === sliderPage ? ' active' : ''}`}
                    onClick={() => setSliderPage(i)}
                    aria-label={`${t('sokin.goToPage')} ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ProfileHoverPopup popup={profileHover.popup} />
    </section>
  );
}
