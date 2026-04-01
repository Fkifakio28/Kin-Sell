import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { formatPriceLabelToCdf } from '../../utils/currency';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { getDashboardPath } from '../../utils/role-routing';
import { useScrollRestore } from '../../utils/useScrollRestore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { orders as ordersApi, sokin as sokinApi, type SoKinApiFeedPost } from '../../lib/api-client';
import { useHoverPopup, ProfileHoverPopup, ArticleHoverPopup, type ProfileHoverData, type ArticleHoverData } from '../../components/HoverPopup';
import './sokin.css';
import { AdBanner } from '../../components/AdBanner';
import {
  SOKIN_ANALYTICS_FALLBACK,
  SOKIN_SUGGESTIONS,
  SOKIN_TRENDS,
  SOKIN_TRENDING_CATEGORIES,
  SOKIN_VIRAL_POSTS,
  type SoKinPost,
} from './sokin-data';

type VideoUiState = {
  played: boolean;
  controls: boolean;
};

type SoKinNotification = {
  id: string;
  label: string;
  detail: string;
  href: string;
  icon: string;
  time: string;
};

type SoKinAnalyticsOverview = {
  notifications: number;
  unreadMessages: number;
  postsToday: number;
  activeUsers: number;
  trends: typeof SOKIN_TRENDS;
  trendingCategories: typeof SOKIN_TRENDING_CATEGORIES;
  viralPosts: typeof SOKIN_VIRAL_POSTS;
  suggestions: typeof SOKIN_SUGGESTIONS;
};

const POSTS_PAGE_SIZE = 4;

const INFO_ITEMS = [
  { titleKey: "sokin.infoAbout", href: "/about" },
  { titleKey: "sokin.infoTerms", href: "/terms" },
  { titleKey: "sokin.infoGuide", href: "/guide" },
  { titleKey: "sokin.infoHowItWorks", href: "/how-it-works" },
  { titleKey: "sokin.infoPrivacy", href: "/privacy" },
  { titleKey: "sokin.infoLegal", href: "/legal" },
  { titleKey: "sokin.infoBlog", href: "/blog" },
  { titleKey: "sokin.infoFaq", href: "/faq" },
  { titleKey: "sokin.infoContact", href: "/contact" },
];

const buildContactUrl = (post: SoKinPost) => {
  const base = `/messages?contact=${encodeURIComponent(post.author.handle)}`;
  if (!post.author.isPrivate) {
    return base;
  }

  return `${base}&mode=limited&requestContact=1`;
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `il y a ${days}j`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

function mapApiFeedPost(p: SoKinApiFeedPost): SoKinPost {
  const username = p.author.profile?.username;
  const displayName = p.author.profile?.displayName ?? 'Utilisateur';
  const shortId = p.authorId.slice(0, 8);
  return {
    id: p.id,
    author: {
      name: displayName,
      handle: username ? `@${username}` : `@${shortId}`,
      avatarUrl: p.author.profile?.avatarUrl ?? '',
      kinId: username ? `#${username}` : `#${shortId}`,
      city: p.author.profile?.city ?? 'Kinshasa',
      isPrivate: false,
    },
    text: p.text,
    timestampLabel: formatRelativeTime(p.createdAt),
    visibility: 'PUBLIC',
    sponsored: false,
    media: p.mediaUrls.map((src) => ({ kind: 'image' as const, src, label: '' })),
    linkedCard: undefined,
    likes: 0,
    comments: 0,
    shares: 0,
    thread: [],
  };
}

export function SoKinPage() {
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const feedBoxRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const notifBtnRef = useRef<HTMLDivElement | null>(null);
  const [videoUiByKey, setVideoUiByKey] = useState<Record<string, VideoUiState>>({});
  const [visibleCount, setVisibleCount] = useState(POSTS_PAGE_SIZE);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [sokinNotifications, setSokinNotifications] = useState<SoKinNotification[]>([]);
  const [cartItemsCount, setCartItemsCount] = useState(0);
  const [activeCommentsPost, setActiveCommentsPost] = useState<SoKinPost | null>(null);
  const [analytics, setAnalytics] = useState<SoKinAnalyticsOverview>(SOKIN_ANALYTICS_FALLBACK);
  const [posts, setPosts] = useState<SoKinPost[]>([]);
  const [feedSearch, setFeedSearch] = useState('');
  
  /* ── Composer State ── */
  const [composerText, setComposerText] = useState('');
  const [composerLocation, setComposerLocation] = useState('');
  const [composerTags, setComposerTags] = useState<string[]>([]);
  const [composerHashtags, setComposerHashtags] = useState<string[]>([]);
  const [composerMediaFiles, setComposerMediaFiles] = useState<File[]>([]);
  const [showMediaPopup, setShowMediaPopup] = useState(false);
  const [showEditorPopup, setShowEditorPopup] = useState(false);
  const [showPreviewPopup, setShowPreviewPopup] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const navigate = useNavigate();
  const { isLoggedIn, user, logout } = useAuth();
  const { t } = useLocaleCurrency();
  const isMobile = useIsMobile();
  const dashboardPath = getDashboardPath(user?.role);
  const profileHover = useHoverPopup<ProfileHoverData>();
  const articleHover = useHoverPopup<ArticleHoverData>();
  useScrollRestore();

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
      if (notifBtnRef.current && !notifBtnRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
        setNotifOpen(false);
        setIsInfoOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  /* ── Chargement du fil public depuis l'API ── */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await sokinApi.publicFeed(20);
        if (cancelled) return;
        setPosts(data.posts.map(mapApiFeedPost));
      } catch {
        // Fil vide si l'API est indisponible
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const visiblePosts = useMemo(() => {
    const q = feedSearch.trim().toLowerCase();
    const filtered = q
      ? posts.filter((p) =>
          p.text.toLowerCase().includes(q) ||
          p.author.name.toLowerCase().includes(q) ||
          p.author.city.toLowerCase().includes(q)
        )
      : posts;
    return filtered.slice(0, visibleCount);
  }, [posts, visibleCount, feedSearch]);

  const hasMorePosts = visibleCount < posts.length;

  useEffect(() => {
    const feedElement = feedBoxRef.current;
    if (!feedElement) {
      return;
    }

    const onFeedScroll = () => {
      const nearBottom =
        feedElement.scrollTop + feedElement.clientHeight >= feedElement.scrollHeight - 180;
      if (nearBottom && hasMorePosts) {
        setVisibleCount((prev) => prev + POSTS_PAGE_SIZE);
      }
    };

    feedElement.addEventListener('scroll', onFeedScroll, { passive: true });
    return () => feedElement.removeEventListener('scroll', onFeedScroll);
  }, [hasMorePosts]);

  useEffect(() => {
    const controller = new AbortController();

    const loadAnalytics = async () => {
      try {
        const apiBaseUrl = import.meta.env.VITE_API_URL ?? '/api';
        const response = await fetch(`${apiBaseUrl}/analytics/sokin/overview`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as Partial<SoKinAnalyticsOverview>;
        setAnalytics((prev) => ({
          ...prev,
          ...payload,
          trends: payload.trends ?? prev.trends,
          trendingCategories: payload.trendingCategories ?? prev.trendingCategories,
          viralPosts: payload.viralPosts ?? prev.viralPosts,
          suggestions: payload.suggestions ?? prev.suggestions,
        }));
      } catch {
        // Keep fallback while analytics backend is not configured.
      }
    };

    loadAnalytics();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setSokinNotifications([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const notifs: SoKinNotification[] = [];
      try {
        const [buyerData, sellerData] = await Promise.all([
          ordersApi.buyerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
          ordersApi.sellerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
        ]);
        if (cancelled) return;
        if (buyerData) {
          for (const o of buyerData.orders) {
            const statusLabel = o.status === 'SHIPPED' ? 'expédiée' : o.status === 'CONFIRMED' ? 'confirmée' : 'en cours';
            notifs.push({
              id: `buy-${o.id}`,
              label: `Commande ${statusLabel}`,
              detail: `#${o.id.slice(0, 8).toUpperCase()} — ${o.itemsCount} article${o.itemsCount > 1 ? 's' : ''}`,
              href: dashboardPath,
              icon: '📦',
              time: new Date(o.createdAt).toLocaleDateString('fr-FR'),
            });
          }
        }
        if (sellerData) {
          for (const o of sellerData.orders) {
            notifs.push({
              id: `sell-${o.id}`,
              label: 'Nouvelle commande reçue',
              detail: `#${o.id.slice(0, 8).toUpperCase()} de ${o.buyer.displayName}`,
              href: dashboardPath,
              icon: '🛒',
              time: new Date(o.createdAt).toLocaleDateString('fr-FR'),
            });
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setSokinNotifications(notifs);
    };
    void load();
    return () => { cancelled = true; };
  }, [isLoggedIn, dashboardPath]);

  useEffect(() => {
    if (!isLoggedIn) {
      setCartItemsCount(0);
      return;
    }

    let cancelled = false;
    const loadCartCount = async () => {
      try {
        const cart = await ordersApi.buyerCart().catch(() => null);
        if (!cancelled) setCartItemsCount(cart?.itemsCount ?? 0);
      } catch {
        if (!cancelled) setCartItemsCount(0);
      }
    };

    void loadCartCount();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const handleVideoTileClick = (videoKey: string) => {
    const current = videoUiByKey[videoKey] ?? { played: false, controls: false };
    const videoElement = videoRefs.current[videoKey];

    if (!current.played) {
      if (videoElement) {
        videoElement.play().catch(() => {
          // Ignore autoplay restrictions; user can click again.
        });
      }
      setVideoUiByKey((prev) => ({
        ...prev,
        [videoKey]: { played: true, controls: false },
      }));
      return;
    }

    if (!current.controls) {
      setVideoUiByKey((prev) => ({
        ...prev,
        [videoKey]: { played: true, controls: true },
      }));
    }
  };

  const openCommentsModal = (post: SoKinPost) => {
    setActiveCommentsPost(post);
  };

  const closeCommentsModal = () => {
    setActiveCommentsPost(null);
  };

  const handlePost = async () => {
    const text = composerText.trim();
    if (!text || isPublishing || !isLoggedIn) return;
    setIsPublishing(true);
    try {
      const newPost = await sokinApi.createPost({
        text,
        mediaUrls: composerMediaFiles.length > 0 ? composerMediaFiles.map((f) => URL.createObjectURL(f)) : undefined,
        location: composerLocation || undefined,
        tags: composerTags.length > 0 ? composerTags : undefined,
        hashtags: composerHashtags.length > 0 ? composerHashtags : undefined,
      });
      const mapped = mapApiFeedPost({
        ...newPost,
        author: {
          id: newPost.authorId,
          profile: {
            username: user?.profile.username ?? null,
            displayName: user?.profile.displayName ?? 'Moi',
            avatarUrl: user?.profile.avatarUrl ?? null,
            city: user?.profile.city ?? null,
          },
        },
      });
      setPosts((prev) => [mapped, ...prev]);
      /* Reset composer */
      setComposerText('');
      setComposerLocation('');
      setComposerTags([]);
      setComposerHashtags([]);
      setComposerMediaFiles([]);
      setShowPreviewPopup(false);
    } catch {
      // Erreur : l'utilisateur peut réessayer
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <>
      {isMobile ? (
        <header className="sokin-mobile-header" role="banner">
          <button className="sokin-mobile-icon-btn" type="button" onClick={() => navigate(-1)} aria-label="Retour">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>

          <button className="sokin-mobile-logo" type="button" onClick={() => navigate('/')} aria-label="Kin-Sell — Accueil">
            <img
              src="/assets/kin-sell/logo.png"
              alt="Kin-Sell"
              className="sokin-mobile-logo-img"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="sokin-mobile-logo-text">Kin-Sell</span>
          </button>

          <button className="sokin-mobile-icon-btn" type="button" onClick={() => navigate('/cart')} aria-label={t('nav.cartAria')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {cartItemsCount > 0 ? <span className="sokin-mobile-badge">{cartItemsCount}</span> : null}
          </button>
        </header>
      ) : null}

      <section className="sokin-shell animate-fade-in">
      <aside className="sokin-left-nav" aria-label="Navigation So-Kin">
        <button type="button" className="sokin-nav-item" onClick={() => navigate('/')}>{t('sokin.home')}</button>
        <button type="button" className="sokin-nav-item active" onClick={() => navigate('/sokin')}>{t('sokin.sokinHome')}</button>
        {isLoggedIn ? (
          <button type="button" className="sokin-nav-item" onClick={() => navigate(`/user/${user?.profile.username}/sokin`)}>{t('sokin.myPosts')}</button>
        ) : null}
        <button type="button" className="sokin-nav-item" onClick={() => navigate('/sokin/profiles')}>{t('sokin.profiles')}</button>
        <button type="button" className="sokin-nav-item" onClick={() => navigate('/sokin/market')}>{t('sokin.market')}</button>
        <button type="button" className="sokin-nav-item sokin-nav-live" onClick={() => navigate('/sokin/live')}>🔴 Live</button>
        <button type="button" className="sokin-nav-item" onClick={() => navigate('/explorer')}>{t('sokin.goExplorer')}</button>

        <section className="sokin-left-ad" aria-label="Publicité navigation So-Kin" style={{ display: 'none' }} />
      </aside>

      <main className="sokin-main">
        <header className="sokin-topbar" aria-label="Barre So-Kin">
          <div className="sokin-logo-word" aria-label="Logo So-Kin">
            {['S', 'O', '-', 'K', 'I', 'N'].map((letter, index) => (
              <span key={`logo-${index}`} className="sokin-logo-tile">{letter}</span>
            ))}
          </div>

          <div className="sokin-top-search-wrap">
            <input
              type="search"
              className="sokin-top-search"
              placeholder={t('sokin.searchPlaceholder')}
              value={feedSearch}
              onChange={(e) => setFeedSearch(e.target.value)}
            />
          </div>

          <div className="sokin-top-actions">
            <div className="sokin-notif-wrap" ref={notifBtnRef}>
              <button
                className="sokin-top-icon-btn"
                title={t('sokin.notifications')}
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
              >
                🔔
                {sokinNotifications.length > 0 ? <span className="sokin-top-badge">{sokinNotifications.length}</span> : null}
              </button>

              {notifOpen && (
                <div className="sokin-notif-dropdown" role="menu">
                  <div className="sokin-notif-dropdown-head">
                    <strong>{t('sokin.notifications')}</strong>
                    <span className="sokin-notif-dropdown-count">{sokinNotifications.length}</span>
                  </div>
                  {sokinNotifications.length > 0 ? (
                    <div className="sokin-notif-dropdown-list">
                      {sokinNotifications.map((n) => (
                        <button
                          type="button"
                          key={n.id}
                          className="sokin-notif-dropdown-item"
                          role="menuitem"
                          onClick={() => {
                            setNotifOpen(false);
                            if (n.id.startsWith('buy-')) sessionStorage.setItem('ud-section', 'purchases');
                            if (n.id.startsWith('sell-')) sessionStorage.setItem('ud-section', 'sales');
                            navigate(n.href);
                          }}
                        >
                          <span className="sokin-notif-dropdown-icon">{n.icon}</span>
                          <div className="sokin-notif-dropdown-text">
                            <span className="sokin-notif-dropdown-label">{n.label}</span>
                            <span className="sokin-notif-dropdown-detail">{n.detail}</span>
                          </div>
                          <span className="sokin-notif-dropdown-time">{n.time}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="sokin-notif-dropdown-empty">{t('sokin.noNotifications')}</p>
                  )}
                </div>
              )}
            </div>

            <button type="button" className="ks-help-btn" title={t('sokin.helpInfo')} aria-label={t('sokin.helpInfo')} onClick={() => setIsInfoOpen(true)}>
              <span>?</span>
            </button>

            <button type="button" className="sokin-top-icon-btn" title={t('sokin.messaging')} onClick={() => { sessionStorage.setItem('ud-section', 'messages'); navigate(dashboardPath); }}>
              💬
            </button>

            <button type="button" className="sokin-top-icon-btn" title={t('nav.cartAria')} onClick={() => navigate('/cart')}>
              🛒
              {cartItemsCount > 0 ? <span className="sokin-top-badge">{cartItemsCount}</span> : null}
            </button>

            <div className="sokin-account-wrap" ref={accountMenuRef}>
              <button
                className="sokin-top-icon-btn sokin-top-icon-btn--account"
                type="button"
                title={t('sokin.account')}
                onClick={() => setAccountMenuOpen((prev) => !prev)}
              >
                {isLoggedIn && user?.profile.avatarUrl ? (
                  <img src={user.profile.avatarUrl} alt={t('sokin.myAccount')} className="sokin-top-avatar" />
                ) : (
                  <span>👤</span>
                )}
              </button>

              {accountMenuOpen ? (
                <div className="sokin-account-menu">
                  {isLoggedIn ? (
                    <>
                      <button type="button" onClick={() => { navigate(dashboardPath); setAccountMenuOpen(false); }}>{t('sokin.myAccount')}</button>
                      <button type="button" onClick={() => { sessionStorage.setItem('ud-section', 'messages'); navigate(dashboardPath); setAccountMenuOpen(false); }}>{t('sokin.messaging')}</button>
                      <button type="button" onClick={() => { navigate('/cart'); setAccountMenuOpen(false); }}>{t('nav.cartAria')}</button>
                      <button
                        type="button"
                        onClick={() => {
                          void logout();
                          setAccountMenuOpen(false);
                        }}
                      >
                        {t('sokin.disconnect')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => { navigate('/login'); setAccountMenuOpen(false); }}>{t('sokin.login')}</button>
                      <button type="button" onClick={() => { navigate('/register'); setAccountMenuOpen(false); }}>{t('sokin.createAccount')}</button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {accountMenuOpen ? <button className="sokin-account-overlay" onClick={() => setAccountMenuOpen(false)} aria-label={t('sokin.closeMenuAccount')} type="button" /> : null}

        {notifOpen ? <button className="sokin-notif-overlay" onClick={() => setNotifOpen(false)} aria-label={t('sokin.closeNotifications')} type="button" /> : null}

        <section className="sokin-composer" aria-label={t('sokin.createPost')}>
          <div className="sokin-composer-head">
            <h2>{t('sokin.compose')}</h2>
          </div>

          <textarea
            className="sokin-composer-input"
            placeholder={t('sokin.placeholder')}
            rows={4}
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            disabled={!isLoggedIn || isPublishing}
          />

          {/* Media preview */}
          {composerMediaFiles.length > 0 && (
            <div className="sokin-media-preview">
              <p>{composerMediaFiles.length} fichier(s) sélectionné(s)</p>
              <button type="button" onClick={() => setComposerMediaFiles([])}>Effacer</button>
            </div>
          )}

          {/* Tags/Hashtags preview */}
          {(composerTags.length > 0 || composerHashtags.length > 0 || composerLocation) && (
            <div className="sokin-metadata-preview">
              {composerLocation && <span className="sokin-meta-tag">📍 {composerLocation}</span>}
              {composerTags.map((tag) => <span key={tag} className="sokin-meta-tag">🏷️ {tag}</span>)}
              {composerHashtags.map((ht) => <span key={ht} className="sokin-meta-tag">#{ht}</span>)}
            </div>
          )}

          <div className="sokin-composer-actions">
            <button
              className="sokin-quick-btn"
              type="button"
              onClick={() => setShowMediaPopup(true)}
              title="Ajouter média"
              disabled={!isLoggedIn || isPublishing}
            >
              🖼️ + 🎬
            </button>

            <button
              className="sokin-quick-btn"
              type="button"
              onClick={() => setShowEditorPopup(true)}
              title="Ajouter localisation, tags, hashtags"
              disabled={!isLoggedIn || isPublishing}
            >
              ✨ 📍 🏷️ 🌐
            </button>

            <button
              className="sokin-secondary-btn"
              type="button"
              onClick={() => setShowPreviewPopup(true)}
              disabled={!isLoggedIn || isPublishing || composerText.trim().length === 0}
              title="Aperçu"
            >
              👁️ Aperçu
            </button>

            <button
              className="sokin-primary-btn"
              type="button"
              onClick={handlePost}
              disabled={!isLoggedIn || isPublishing || composerText.trim().length === 0}
              title={isLoggedIn ? t('sokin.publish') : t('sokin.loginToPost')}
            >
              {isPublishing ? '⏳' : '🚀'} Publier
            </button>
          </div>
        </section>

        {/* Media Popup */}
        {showMediaPopup && (
          <div className="sokin-modal-overlay" onClick={() => setShowMediaPopup(false)}>
            <div className="sokin-modal-box" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="sokin-modal-close" onClick={() => setShowMediaPopup(false)}>✕</button>
              <h3>Ajouter média</h3>
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => {
                  if (e.target.files) {
                    setComposerMediaFiles([...composerMediaFiles, ...Array.from(e.target.files)]);
                  }
                }}
              />
              <p>{composerMediaFiles.length} fichier(s)</p>
              <button type="button" onClick={() => { setComposerMediaFiles([]); setShowMediaPopup(false); }}>Confirmer</button>
            </div>
          </div>
        )}

        {/* Editor Popup */}
        {showEditorPopup && (
          <div className="sokin-modal-overlay" onClick={() => setShowEditorPopup(false)}>
            <div className="sokin-modal-box" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="sokin-modal-close" onClick={() => setShowEditorPopup(false)}>✕</button>
              <h3>Localisation, tags & hashtags</h3>
              
              <label>Localisation (📍)</label>
              <input
                type="text"
                value={composerLocation}
                onChange={(e) => setComposerLocation(e.target.value)}
                placeholder="ex: Gombe, Kinshasa"
              />

              <label>Tags (🏷️)</label>
              <input
                type="text"
                placeholder="ex: Produit, Service (séparés par virgules)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) {
                      setComposerTags([...composerTags, val]);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />
              <div>{composerTags.map((t) => <span key={t} className="sokin-tag-chip">{t} <button type="button" onClick={() => setComposerTags(composerTags.filter((x) => x !== t))}>✕</button></span>)}</div>

              <label>Hashtags (🌐#)</label>
              <input
                type="text"
                placeholder="ex: KinshsaMarket, Business (sans #)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) {
                      setComposerHashtags([...composerHashtags, val]);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />
              <div>{composerHashtags.map((h) => <span key={h} className="sokin-tag-chip">#{h} <button type="button" onClick={() => setComposerHashtags(composerHashtags.filter((x) => x !== h))}>✕</button></span>)}</div>

              <button type="button" onClick={() => setShowEditorPopup(false)}>Fermer</button>
            </div>
          </div>
        )}

        {/* Preview Popup */}
        {showPreviewPopup && (
          <div className="sokin-modal-overlay" onClick={() => setShowPreviewPopup(false)}>
            <div className="sokin-modal-box" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="sokin-modal-close" onClick={() => setShowPreviewPopup(false)}>✕</button>
              <h3>Aperçu de votre publication</h3>
              
              <article className="sokin-preview-post" style={{ borderRadius: '8px', padding: '16px', background: 'rgba(35, 24, 72, 0.4)' }}>
                <header style={{ marginBottom: '12px' }}>
                  <img src={user?.profile.avatarUrl || ''} alt={user?.profile.displayName} style={{ width: '40px', height: '40px', borderRadius: '50%', marginRight: '8px' }} />
                  <div>
                    <strong>{user?.profile.displayName}</strong>
                    <p style={{ fontSize: '0.9em', color: 'rgba(255,255,255,0.6)' }}>@{user?.profile.username}</p>
                  </div>
                </header>

                <p style={{ marginBottom: '12px', lineHeight: '1.6' }}>{composerText}</p>

                {composerMediaFiles.length > 0 && (
                  <div style={{ marginBottom: '12px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px' }}>
                    <p>[{composerMediaFiles.length} média(s)]</p>
                  </div>
                )}

                {(composerLocation || composerTags.length > 0 || composerHashtags.length > 0) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {composerLocation && <span style={{ background: 'rgba(111, 88, 255, 0.2)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.9em' }}>📍 {composerLocation}</span>}
                    {composerTags.map((t) => <span key={t} style={{ background: 'rgba(111, 88, 255, 0.2)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.9em' }}>🏷️ {t}</span>)}
                    {composerHashtags.map((h) => <span key={h} style={{ background: 'rgba(111, 88, 255, 0.2)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.9em' }}>#{h}</span>)}
                  </div>
                )}
              </article>

              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setShowPreviewPopup(false)} style={{ flex: 1 }}>Modifier</button>
                <button type="button" onClick={() => { handlePost(); }} style={{ flex: 1, background: 'rgba(111, 88, 255, 0.4)', fontWeight: 'bold' }}>✓ Confirmer et publier</button>
              </div>
            </div>
          </div>
        )}

        <section className="sokin-feed-box" aria-label={t('sokin.announcements')}>
          <div className="sokin-feed-box-head">
            <h2>{t('sokin.announcements')}</h2>
            <span>{analytics.postsToday} {t('sokin.today')} · {analytics.activeUsers} {t('sokin.active')}</span>
          </div>

          <div className="sokin-feed" ref={feedBoxRef} aria-label="Fil So-Kin">
          {visiblePosts.length === 0 ? (
            <div className="sokin-empty-feed">
              <p>{t('sokin.noPostYet')}</p>
              <p>{t('sokin.beFirst')}</p>
            </div>
          ) : null}
          {visiblePosts.map((post) => (
            <article key={post.id} className={`sokin-post${post.sponsored ? ' sponsored' : ''}`}>
              {post.sponsored ? <span className="sokin-sponsored-badge">{t('sokin.sponsoredTag')}</span> : null}

              <header className="sokin-post-head">
                <div className="sokin-author-wrap"
                  onMouseEnter={(e) => profileHover.handleMouseEnter({ avatarUrl: post.author.avatarUrl, name: post.author.name, username: post.author.handle?.replace('@', ''), kinId: post.author.kinId, publicPageUrl: post.author.isPrivate ? null : (post.author.handle ? `/user/${post.author.handle.replace('@', '')}` : null) }, e)}
                  onMouseLeave={profileHover.handleMouseLeave}
                >
                  <img className="sokin-avatar" src={post.author.avatarUrl} alt={post.author.name} />

                  <div>
                    <div className="sokin-author-line">
                      <span className="sokin-author">{post.author.name}</span>
                      <span className="sokin-author-handle">{post.author.handle}</span>
                      <span className="sokin-author-type">{post.author.kinId}</span>
                    </div>

                    <span className="sokin-author-meta">
                      {post.author.city} · {post.timestampLabel} · {post.visibility === 'PUBLIC' ? t('sokin.public') : t('sokin.contacts')}
                    </span>
                  </div>
                </div>
              </header>

              <p className="sokin-post-text">{post.text}</p>

              {post.media.length > 0 ? (
                <div className="sokin-media-scroll">
                  {post.media.map((media, index) => {
                    const key = `${post.id}-${index}`;

                    return (
                      <div className="sokin-media-tile" key={key}>
                        {media.kind === 'video' ? (
                          <button
                            className="sokin-video-wrap"
                            type="button"
                            onClick={() => handleVideoTileClick(key)}
                          >
                            <video
                              ref={(node) => {
                                videoRefs.current[key] = node;
                              }}
                              controls={videoUiByKey[key]?.controls === true}
                              preload="metadata"
                            >
                              <source src={media.src} type="video/mp4" />
                            </video>

                            {videoUiByKey[key]?.played !== true ? (
                              <span className="sokin-video-overlay">{t('sokin.clickToPlay')}</span>
                            ) : videoUiByKey[key]?.controls !== true ? (
                              <span className="sokin-video-overlay">{t('sokin.secondClick')}</span>
                            ) : null}
                          </button>
                        ) : (
                          <img src={media.src} alt={media.label} />
                        )}
                        <span className="sokin-media-label">{media.label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {post.linkedCard ? (
                <section className="sokin-linked-card" aria-label="Aperçu lié"
                  onMouseEnter={(e) => articleHover.handleMouseEnter({ title: post.linkedCard!.title, description: post.linkedCard!.subtitle, price: post.linkedCard!.priceLabel || 'Prix libre', sellerName: post.author.name }, e)}
                  onMouseLeave={articleHover.handleMouseLeave}
                >
                  <div className="sokin-linked-meta">
                    <span className="sokin-linked-kind">{post.linkedCard.kind}</span>
                    <h3>{post.linkedCard.title}</h3>
                    <p>{post.linkedCard.subtitle}</p>
                    {post.linkedCard.priceLabel ? <strong>{formatPriceLabelToCdf(post.linkedCard.priceLabel)}</strong> : null}
                  </div>

                  <button type="button" className="sokin-linked-action" onClick={() => navigate(post.linkedCard!.href)}>
                    {post.linkedCard.actionLabel}
                  </button>
                </section>
              ) : null}

              <footer className="sokin-post-actions">
                <button className="sokin-action-btn" type="button" aria-label="Likes">❤️ {post.likes}</button>
                <button
                  className="sokin-action-btn"
                  type="button"
                  aria-label="Commentaires"
                  onClick={() => openCommentsModal(post)}
                >
                  💬 {post.comments}
                </button>
                <button className="sokin-action-btn" type="button" aria-label="Partages">🔁 {post.shares}</button>
                <button type="button" className="sokin-contact-btn" onClick={() => navigate(buildContactUrl(post))} aria-label="Contacter">📩</button>
              </footer>

              {post.author.isPrivate ? (
                <p className="sokin-private-note">
                  {t('sokin.privateNote')}
                </p>
              ) : null}

            </article>
          ))}

          {hasMorePosts ? <div className="sokin-loading">{t('sokin.progressiveLoading')}</div> : null}
          </div>
        </section>

      </main>

      <aside className="sokin-side" aria-label={t('sokin.trendsSuggestions')}>
        <AdBanner page="sokin" variant="sidebar" />

        <section className="sokin-side-card">
          <h2 className="sokin-side-title">{t('sokin.trendsSide')}</h2>
          <ul className="sokin-side-list">
            {analytics.trends.map((item) => (
              <li key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.volume}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="sokin-side-card">
          <h2 className="sokin-side-title">{t('sokin.categoriesTrending')}</h2>
          <ul className="sokin-side-list">
            {analytics.trendingCategories.map((item) => (
              <li key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.volume}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="sokin-side-card">
          <h2 className="sokin-side-title">{t('sokin.viralPosts')}</h2>
          <ul className="sokin-side-list">
            {analytics.viralPosts.map((item) => (
              <li key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.volume}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="sokin-side-card">
          <h2 className="sokin-side-title">{t('sokin.suggestionsSide')}</h2>
          <ul className="sokin-side-list sokin-suggestion-list">
            {analytics.suggestions.map((item) => (
              <li key={item.name}
                onMouseEnter={(e) => profileHover.handleMouseEnter({ avatarUrl: null, name: item.name, username: null, kinId: null, publicPageUrl: item.href }, e)}
                onMouseLeave={profileHover.handleMouseLeave}
              >
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.type} · {item.metric}</small>
                </div>
                <button type="button" onClick={() => navigate(item.href)}>{t('sokin.follow')}</button>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <button className="sokin-fab" type="button" aria-label={t('sokin.fabLabel')}>+</button>

      {activeCommentsPost ? (
        <div className="sokin-comments-modal-backdrop" role="dialog" aria-modal="true" aria-label={t('sokin.comments')}>
          <section className="sokin-comments-modal">
            <header className="sokin-comments-modal-head">
              <h3>{t('sokin.comments')}</h3>
              <div className="sokin-comments-modal-head-actions">
                <button type="button" className="sokin-comment-add-btn" title={t('sokin.leaveComment')}>✍️</button>
                <button type="button" className="sokin-comment-close-btn" onClick={closeCommentsModal} aria-label={t('sokin.close')}>✕</button>
              </div>
            </header>

            <div className="sokin-comments-meta">
              <strong>{activeCommentsPost.author.name}</strong>
              <span>{activeCommentsPost.comments} {t('sokin.commentsCount')}</span>
            </div>

            <div className="sokin-comments-modal-list">
              {activeCommentsPost.thread.length === 0 ? (
                <p className="sokin-comments-empty">{t('sokin.noComments')}</p>
              ) : (
                activeCommentsPost.thread.map((comment) => (
                  <article key={comment.id} className="sokin-comment">
                    <div className="sokin-comment-top">
                      <span>{comment.author}</span>
                      <small>{comment.kinId}</small>
                    </div>
                    <p>{comment.text}</p>
                    <div className="sokin-comment-actions-row">
                      <button type="button" className="sokin-comment-like" aria-label={t('sokin.likeComment')}>❤️ {comment.likes}</button>
                      <button type="button" className="sokin-comment-dislike" aria-label={t('sokin.dislikeComment')}>👎 {Math.max(0, Math.floor(comment.likes / 4))}</button>
                      <button type="button" className="sokin-comment-reply" aria-label={t('sokin.replyComment')}>💬</button>
                    </div>

                    {comment.replies && comment.replies.length > 0 ? (
                      <div className="sokin-comment-replies">
                        {comment.replies.map((reply) => (
                          <article key={reply.id} className="sokin-comment reply">
                            <div className="sokin-comment-top">
                              <span>{reply.author}</span>
                              <small>{reply.kinId}</small>
                            </div>
                            <p>{reply.text}</p>
                            <div className="sokin-comment-actions-row">
                              <button type="button" className="sokin-comment-like" aria-label={t('sokin.likeReply')}>❤️ {reply.likes}</button>
                              <button type="button" className="sokin-comment-dislike" aria-label={t('sokin.dislikeReply')}>👎 {Math.max(0, Math.floor(reply.likes / 4))}</button>
                              <button type="button" className="sokin-comment-reply" aria-label={t('sokin.replyReply')}>💬</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      <ProfileHoverPopup popup={profileHover.popup} />
      <ArticleHoverPopup popup={articleHover.popup} />

      {isInfoOpen && createPortal(
        <div className="ks-info-overlay" onClick={() => setIsInfoOpen(false)}>
          <div className="ks-info-popup glass-container" onClick={(e) => e.stopPropagation()}>
            <div className="ks-info-popup-head">
              <strong>Kin-Sell</strong>
              <p>{t('sokin.quickNav')}</p>
              <button type="button" className="ks-info-popup-close" onClick={() => setIsInfoOpen(false)}>✕</button>
            </div>
            <nav className="ks-info-popup-links">
              {INFO_ITEMS.map((item) => (
                <button
                  type="button"
                  key={item.href}
                  onClick={() => { navigate(item.href); setIsInfoOpen(false); }}
                  className="ks-info-popup-link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}
                >
                  {t(item.titleKey)}
                </button>
              ))}
            </nav>
          </div>
        </div>,
        document.body
      )}
      </section>

      {isMobile ? (
        <>
          <div className="sokin-mobile-bottom-spacer" aria-hidden="true" />
          <nav className="sokin-mobile-bottom-nav" aria-label="Navigation mobile So-Kin">
            <button className="sokin-mobile-nav-item" type="button" onClick={() => navigate('/')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
              </svg>
              <span>Accueil</span>
            </button>

            <button className="sokin-mobile-nav-item" type="button" onClick={() => navigate('/sokin/live')}>
              <span style={{ fontSize: '18px' }}>🔴</span>
              <span>Live</span>
            </button>

            <button className="sokin-mobile-nav-fab" type="button" onClick={() => {
              navigate(isLoggedIn ? '/sokin/live?create=1' : '/login');
            }} aria-label="Lancer un live">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <button className="sokin-mobile-nav-item" type="button" onClick={() => {
              sessionStorage.setItem('ud-section', 'notifications');
              navigate(dashboardPath);
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {sokinNotifications.length > 0 ? <span className="sokin-mobile-badge">{sokinNotifications.length}</span> : null}
              <span>Notifs</span>
            </button>

            <button className="sokin-mobile-nav-item" type="button" onClick={() => navigate(dashboardPath)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Compte</span>
            </button>
          </nav>
        </>
      ) : null}
    </>
  );
}
