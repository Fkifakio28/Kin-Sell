/**
 * So-Kin Page — v4 Mobile First
 *
 * Structure:
 * - Flux vertical d'annonces (style Facebook orienté annonces)
 * - Carte avec en-tête (auteur + contact), corps (texte + collage médias), pied (réponses)
 * - Collage médias Facebook-style : 1 à 5 médias, max 2 vidéos
 * - Viewer simple au clic sur un média (pas de galerie complexe)
 * - Tiroir de réponses inline sous chaque carte
 * - Layout adaptatif mobile/tablette/desktop
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { useMarketPreference } from '../../app/providers/MarketPreferenceProvider';
import { prepareMediaUrl } from '../../utils/media-upload';
import { getDashboardPath } from '../../utils/role-routing';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSocket } from '../../hooks/useSocket';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import {
  sokin as sokinApi,
  messaging,
  users as usersApi,
  listings as listingsApi,
  explorer as explorerApi,
  geo as geoApi,
  orders as ordersApi,
  resolveMediaUrl,
  type SoKinApiFeedPost,
  type SoKinApiComment,
  type SoKinApiPost,
  type SoKinPostType,
  type SoKinReactionType,
  type SoKinReportReason,
  type SoKinContentTab,
} from '../../lib/api-client';
import { ApiError } from '../../lib/api-core';
import { SoKinToastProvider, useSoKinToast } from '../../components/feedback/SoKinToast';
import { AdBanner } from '../../components/AdBanner';
import { SeoMeta } from '../../components/SeoMeta';
import { buildSoKinFeedItems } from './ad-cadence';
import { observePostView, trackSoKinEvent, flushTracking } from '../../lib/services/sokin-tracking.service';
import { sokinTrends, sokinAnalytics, type TrendingTopic, type TrendingHashtag, type SuggestedProfile, type PostInsight, type PostInsightCard, type AuthorTip, type SmartFeedBlocks, type SoKinAccessInfo, type SoKinTier, type ScoredPost } from '../../lib/services/sokin-analytics.service';
import {
  AnnounceCard,
  MediaCollage,
  type MediaItem,
  POST_TYPE_META,
  COMMERCIAL_TYPES,
  REPORT_REASONS,
  relTime,
  isVideoUrl,
  categorizeMedia,
  IconMessage,
  IconHeart,
  IconComment,
  IconRepost,
  IconBookmark,
  IconMoreHoriz,
} from './AnnounceCard';
import { MediaViewer, CommentsDrawer, type CommentProfileState, type MissingPublicProfile } from './SoKinShared';
import './sokin.css';

/* ─────────────────────────────────────────────────────── */
/* TYPES LOCAUX                                             */
/* ─────────────────────────────────────────────────────── */

/** Référence minimale d'une annonce So-Kin transmise à la messagerie */
type SoKinPostRef = {
  id: string;
  text: string;
  mediaUrl: string | null;
  authorName: string;
  authorId: string;
  authorHandle: string;
};

type SoKinPublishPayload = {
  text: string;
  mediaFiles: File[];
  existingMediaUrls?: string[];
  postType: SoKinPostType;
  subject?: string;
  location?: string;
  tags?: string[];
  hashtags?: string[];
  scheduledAt?: string;
};

/** Types visuels qui exigent au moins 1 média */
const MEDIA_REQUIRED_TYPES: SoKinPostType[] = ['SHOWCASE', 'SELLING', 'PROMO'];

/** Badge visuel du tier premium */
const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  FREE: { label: 'FREE', cls: 'sk-tier-badge--free' },
  ANALYTICS: { label: 'PRO', cls: 'sk-tier-badge--pro' },
  ADS: { label: 'PRO+', cls: 'sk-tier-badge--pro' },
  ADMIN: { label: 'ADMIN', cls: 'sk-tier-badge--admin' },
};

type HeaderNotification = {
  id: string;
  label: string;
  detail: string;
  href: string;
  icon: string;
  time: string;
};

const DESKTOP_INFO_ITEMS = [
  { title: 'À propos', href: '/about' },
  { title: 'Conditions', href: '/terms' },
  { title: 'Guide', href: '/guide' },
  { title: 'Comment ça marche', href: '/how-it-works' },
  { title: 'Confidentialité', href: '/privacy' },
  { title: 'Mentions légales', href: '/legal' },
  { title: 'Blog', href: '/blog' },
  { title: 'FAQ', href: '/faq' },
  { title: 'Contact', href: '/contact' },
] as const;

const CREATE_DRAFT_STORAGE_KEY = 'ks-sokin-create-draft-v1';
const OVERLAY_VISIBILITY_LOCK_MS = 180;

type SoKinCreateDraft = {
  text?: string;
  postType?: SoKinPostType;
  subject?: string;
  location?: string;
  tags?: string[];
  hashtags?: string[];
  scheduledAt?: string;
};

type SoKinEditorDraftState = {
  location: string;
  selectedTags: string[];
  selectedArticles: string[];
  scheduledAt: string;
};

function readSoKinCreateDraft(): SoKinCreateDraft {
  try {
    const raw = localStorage.getItem(CREATE_DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SoKinCreateDraft;
    const validTypes: SoKinPostType[] = ['SHOWCASE', 'DISCUSSION', 'QUESTION', 'SELLING', 'PROMO', 'SEARCH', 'UPDATE', 'REVIEW', 'TREND'];
    return {
      text: typeof parsed.text === 'string' ? parsed.text.slice(0, 500) : '',
      postType: typeof parsed.postType === 'string' && validTypes.includes(parsed.postType as SoKinPostType) ? parsed.postType as SoKinPostType : undefined,
      subject: typeof parsed.subject === 'string' ? parsed.subject.slice(0, 120) : '',
      location: typeof parsed.location === 'string' ? parsed.location.slice(0, 120) : '',
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((v): v is string => typeof v === 'string').slice(0, 20) : [],
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.filter((v): v is string => typeof v === 'string').slice(0, 20) : [],
      scheduledAt: typeof parsed.scheduledAt === 'string' ? parsed.scheduledAt : '',
    };
  } catch {
    return {};
  }
}

/* ─────────────────────────────────────────────────────── */
/* HELPERS                                                  */
/* ─────────────────────────────────────────────────────── */

/** Onglets de feed */
type FeedTab = 'pour-toi' | 'suivis' | 'local' | 'ventes';

const FEED_TABS: { key: FeedTab; label: string; icon: string; soon?: boolean }[] = [
  { key: 'pour-toi', label: 'Pour toi',  icon: '✨' },
  { key: 'suivis',   label: 'Suivis',    icon: '👥', soon: true },
  { key: 'local',    label: 'Local',     icon: '📍' },
  { key: 'ventes',   label: 'Ventes',    icon: '🏷️' },
];

/* ─────────────────────────────────────────────────────── */
/* ICÔNES SVG INLINE (locales à SoKinPage)                  */
/* ─────────────────────────────────────────────────────── */

function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

/* MediaViewer, CommentsDrawer, IconSend → importés depuis ./SoKinShared */


/* ─────────────────────────────────────────────────────── */
/* COMPOSE ZONE — déclencheur de publication               */
/* ─────────────────────────────────────────────────────── */

function ComposeZone({
  avatarUrl,
  displayName,
  onCreatePost,
}: {
  avatarUrl: string;
  displayName: string;
  onCreatePost: () => void;
}) {
  return (
    <section className="sk-compose">
      <div className="sk-compose-inner" onClick={onCreatePost} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onCreatePost(); }}>
        {avatarUrl ? (
          <img
            src={resolveMediaUrl(avatarUrl)}
            alt={displayName}
            className="sk-compose-avatar"
          />
        ) : (
          <span className="sk-compose-avatar sk-compose-avatar--empty" aria-hidden="true">
            {(displayName.charAt(0) || '?').toUpperCase()}
          </span>
        )}
        <span className="sk-compose-trigger">
          Quoi de neuf ?
        </span>
        <div className="sk-compose-quick-actions">
          <span className="sk-compose-quick-btn" title="Photo/Vidéo">{'\u{1F5BC}\u{FE0F}'}</span>
          <span className="sk-compose-quick-btn" title="Vente">{'\u{1F6CD}\u{FE0F}'}</span>
          <span className="sk-compose-quick-btn" title="Question">{'\u{2753}'}</span>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────── */
/* SKELETONS — placeholders de chargement                  */
/* ─────────────────────────────────────────────────────── */

function FeedSkeletons() {
  return (
    <div className="sk-feed sk-feed--loading" aria-busy="true" aria-label="Chargement…">
      {[1, 2, 3].map((i) => (
        <div key={i} className="sk-card-skeleton">
          <div className="sk-skeleton-header">
            <div className="sk-skeleton-avatar" />
            <div className="sk-skeleton-lines">
              <div className="sk-skeleton-line sk-skeleton-line--name" />
              <div className="sk-skeleton-line sk-skeleton-line--meta" />
            </div>
          </div>
          <div className="sk-skeleton-media" />
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/* SCORING DRAWER — scoring détaillé post (premium)        */
/* ─────────────────────────────────────────────────────── */

const SCORE_COLORS: Record<string, string> = {
  social: '#6f58ff',
  business: '#00c896',
  boost: '#ff8c42',
};

function scoreTier(v: number): string {
  if (v >= 70) return 'high';
  if (v >= 40) return 'mid';
  return 'low';
}

function ScoreRing({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = Math.min(value / max, 1);
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  return (
    <div className="sk-scoring-ring-wrap">
      <svg className="sk-scoring-ring" viewBox="0 0 88 88" width="88" height="88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle
          cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          transform="rotate(-90 44 44)"
        />
      </svg>
      <span className="sk-scoring-ring-value">{value}</span>
      <span className="sk-scoring-ring-label">{label}</span>
    </div>
  );
}

function BreakdownBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="sk-scoring-bar-row">
      <span className="sk-scoring-bar-label">{label}</span>
      <div className="sk-scoring-bar-track">
        <div className="sk-scoring-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="sk-scoring-bar-val">{value}/{max}</span>
    </div>
  );
}

function ScoringDrawer({ data, loading, onClose }: { data: ScoredPost | null; loading: boolean; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="sk-scoring-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Scoring détaillé">
      <aside className="sk-scoring-drawer glass-container" onClick={(e) => e.stopPropagation()}>
        <div className="sk-scoring-header">
          <h3>📊 Scoring détaillé</h3>
          <button type="button" className="sk-scoring-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {loading && (
          <div className="sk-scoring-loading">
            <div className="sk-scoring-spinner" />
            <p>Analyse en cours…</p>
          </div>
        )}

        {!loading && !data && (
          <div className="sk-scoring-empty">
            <p>😕 Scoring indisponible pour ce post.</p>
            <p className="sk-scoring-empty-sub">Cette fonctionnalité est réservée aux abonnés Analytics.</p>
          </div>
        )}

        {!loading && data && (
          <>
            {/* ── Score rings ── */}
            <div className="sk-scoring-rings">
              <ScoreRing value={data.socialScore} max={100} color={SCORE_COLORS.social} label="Social" />
              <ScoreRing value={data.businessScore} max={100} color={SCORE_COLORS.business} label="Business" />
              <ScoreRing value={data.boostScore} max={100} color={SCORE_COLORS.boost} label="Boost" />
            </div>

            {/* ── Social breakdown ── */}
            <details className="sk-scoring-section" open>
              <summary className="sk-scoring-section-title">
                <span className="sk-scoring-section-dot" style={{ background: SCORE_COLORS.social }} />
                Social — <span data-tier={scoreTier(data.socialScore)}>{data.socialScore}/100</span>
              </summary>
              <div className="sk-scoring-bars">
                <BreakdownBar label="Réactions" value={data.breakdown.social.reactionsPoints} max={20} />
                <BreakdownBar label="Commentaires" value={data.breakdown.social.commentsPoints} max={15} />
                <BreakdownBar label="Réponses" value={data.breakdown.social.repliesPoints} max={10} />
                <BreakdownBar label="Partages" value={data.breakdown.social.sharesPoints} max={15} />
                <BreakdownBar label="Sauvegardes" value={data.breakdown.social.bookmarksPoints} max={10} />
                <BreakdownBar label="Vélocité" value={data.breakdown.social.velocityPoints} max={15} />
                <BreakdownBar label="Clics profil" value={data.breakdown.social.profileClicksPoints} max={5} />
                <BreakdownBar label="Intérêt local" value={data.breakdown.social.localInterestPoints} max={10} />
              </div>
            </details>

            {/* ── Business breakdown ── */}
            <details className="sk-scoring-section">
              <summary className="sk-scoring-section-title">
                <span className="sk-scoring-section-dot" style={{ background: SCORE_COLORS.business }} />
                Business — <span data-tier={scoreTier(data.businessScore)}>{data.businessScore}/100</span>
              </summary>
              <div className="sk-scoring-bars">
                <BreakdownBar label="Clics annonce" value={data.breakdown.business.listingClicksPoints} max={25} />
                <BreakdownBar label="Clics contact" value={data.breakdown.business.contactClicksPoints} max={20} />
                <BreakdownBar label="DMs ouverts" value={data.breakdown.business.dmOpensPoints} max={20} />
                <BreakdownBar label="Nature du post" value={data.breakdown.business.postNaturePoints} max={15} />
                <BreakdownBar label="Demande locale" value={data.breakdown.business.localDemandPoints} max={10} />
                <BreakdownBar label="Profil auteur" value={data.breakdown.business.authorProfilePoints} max={10} />
              </div>
            </details>

            {/* ── Boost breakdown ── */}
            <details className="sk-scoring-section">
              <summary className="sk-scoring-section-title">
                <span className="sk-scoring-section-dot" style={{ background: SCORE_COLORS.boost }} />
                Boost — <span data-tier={scoreTier(data.boostScore)}>{data.boostScore}/100</span>
              </summary>
              <div className="sk-scoring-bars">
                <BreakdownBar label="Poids social" value={data.breakdown.boost.socialWeight} max={30} />
                <BreakdownBar label="Poids business" value={data.breakdown.boost.businessWeight} max={30} />
                <BreakdownBar label="Qualité contenu" value={data.breakdown.boost.contentQualityPoints} max={20} />
                <BreakdownBar label="Portée géo" value={data.breakdown.boost.geoReachPoints} max={10} />
                <BreakdownBar label="Type de post" value={data.breakdown.boost.postTypePoints} max={10} />
              </div>
            </details>

            {/* ── Légende pédagogique ── */}
            <div className="sk-scoring-legend">
              <p className="sk-scoring-legend-title">Comment lire ce score ?</p>
              <div className="sk-scoring-legend-items">
                <span className="sk-scoring-legend-item" data-tier="high">70+ Excellent</span>
                <span className="sk-scoring-legend-item" data-tier="mid">40-69 Moyen</span>
                <span className="sk-scoring-legend-item" data-tier="low">&lt;40 À améliorer</span>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/* ANNOUNCES FEED — fil infini                             */
/* ─────────────────────────────────────────────────────── */

function AnnouncesFeed({
  posts,
  hasMore,
  loading,
  sentinelRef,
  t,
  isLoggedIn,
  openCommentsPostId,
  onOpenComments,
  onMediaClick,
  onContact,
  contactingPostId,
  immersiveDesktop = false,
  currentUserId,
  postInsightsCache,
  onLoadInsight,
  feedSource,
  advisorTips,
  dismissedTipIds,
  onDismissTip,
  onRepost,
  onToggle,
  socialState,
  onScoring,
}: {
  posts: SoKinApiFeedPost[];
  hasMore: boolean;
  loading: boolean;
  sentinelRef: React.RefObject<HTMLDivElement>;
  t: (k: string) => string;
  isLoggedIn: boolean;
  openCommentsPostId: string | null;
  onOpenComments: (postId: string) => void;
  onMediaClick: (item: MediaItem) => void;
  onContact: (post: SoKinApiFeedPost) => void;
  contactingPostId: string | null;
  immersiveDesktop?: boolean;
  currentUserId?: string;
  postInsightsCache?: Record<string, PostInsight | PostInsightCard>;
  onLoadInsight?: (postId: string) => void;
  feedSource?: string;
  advisorTips?: AuthorTip[];
  dismissedTipIds?: Set<string>;
  onDismissTip?: (tipId: string) => void;
  onRepost?: (post: SoKinApiFeedPost) => void;
  onToggle?: (postId: string) => void;
  socialState?: { reactions: Record<string, SoKinReactionType>; bookmarks: Set<string> };
  onScoring?: (postId: string) => void;
}) {
  const feedItems = useMemo(() => buildSoKinFeedItems(posts, 4), [posts]);
  const [resolvedAdsBySlot, setResolvedAdsBySlot] = useState<Record<string, string | null>>({});

  const getPreviousAdId = useCallback((sequence: number) => {
    if (sequence <= 1) return null;
    return resolvedAdsBySlot[`sokin-slot-${sequence - 1}`] ?? null;
  }, [resolvedAdsBySlot]);

  if (loading && posts.length === 0) {
    return <FeedSkeletons />;
  }

  if (posts.length === 0) {
    return (
      <div className="sk-feed">
        <div className="sk-feed-empty">
          <p>
            📭 Pas encore d'annonces.
            <br />
            Soyez le premier à publier !
          </p>
        </div>
      </div>
    );
  }

  const items: React.ReactNode[] = [];
  feedItems.forEach((entry) => {
    if (entry.type === 'post') {
      const post = entry.post;
      const isAuthor = currentUserId ? post.authorId === currentUserId : false;
      const card = (
        <AnnounceCard
          key={post.id}
          post={post}
          t={t}
          isLoggedIn={isLoggedIn}
          onMediaClick={onMediaClick}
          isCommentsOpen={openCommentsPostId === post.id}
          onOpenComments={() => onOpenComments(post.id)}
          onContact={() => onContact(post)}
          isContacting={contactingPostId === post.id}
          isAuthor={isAuthor}
          postInsight={postInsightsCache?.[post.id] ?? null}
          onLoadInsight={onLoadInsight ? () => onLoadInsight(post.id) : undefined}
          feedSource={feedSource}
          onRepost={onRepost}
          onToggle={onToggle}
          initialReaction={socialState?.reactions[post.id] ?? null}
          initialSaved={socialState?.bookmarks.has(post.id) ?? false}
          onScoring={onScoring}
        />
      );

      items.push(
        immersiveDesktop ? (
          <div key={`slide-${post.id}`} className="sk-feed-slide">
            {card}
          </div>
        ) : (
          card
        )
      );
      return;
    }

    const previousAdId = getPreviousAdId(entry.slot.sequence) ?? undefined;
    items.push(
      <AdBanner
        key={entry.slot.slotKey}
        page="sokin"
        variant="slim"
        hideWhenEmpty
        slotKey={entry.slot.slotKey}
        excludeAdId={previousAdId}
        onAdResolved={(adId) => {
          setResolvedAdsBySlot((prev) => {
            if (prev[entry.slot.slotKey] === adId) return prev;
            return { ...prev, [entry.slot.slotKey]: adId };
          });
        }}
        className={immersiveDesktop ? 'sk-feed-inline-ad sk-feed-inline-ad--immersive' : 'sk-feed-inline-ad'}
      />
    );
  });

  // ── Injeter les tips IA entre les posts (max 2, positions 3 et 8) ──
  const visibleTips = (advisorTips ?? []).filter((t) => !(dismissedTipIds ?? new Set()).has(t.id));
  const tipSlots = [3, 8]; // après le 3e et le 8e item
  let injected = 0;
  for (let i = 0; i < tipSlots.length && injected < visibleTips.length; i++) {
    const pos = tipSlots[i] + injected; // adjust for already-inserted
    if (pos < items.length) {
      const tip = visibleTips[injected];
      items.splice(pos, 0, (
        <div key={`tip-${tip.id}`} className="sk-tip-card">
          <div className="sk-tip-card-header">
            <span className="sk-tip-card-icon">🤖</span>
            <span className="sk-tip-card-label">Conseil IA</span>
            {onDismissTip && (
              <button
                type="button"
                className="sk-tip-card-close"
                onClick={() => onDismissTip(tip.id)}
                aria-label="Fermer"
              >
                ✕
              </button>
            )}
          </div>
          <h3 className="sk-tip-card-title">{tip.title}</h3>
          <p className="sk-tip-card-msg">{tip.message}</p>
          {tip.actionType && (
            <span className="sk-tip-card-action">{tip.actionType === 'open_boost_dialog' ? '🚀 Booster' : '💡 Appliquer'}</span>
          )}
        </div>
      ));
      injected++;
    }
  }

  return (
    <section className={`sk-feed${immersiveDesktop ? ' sk-feed--immersive' : ''}`} aria-label="Fil d'annonces So-Kin">
      {items}
      {hasMore && (
        <div ref={sentinelRef} className="sk-sentinel" aria-hidden="true" />
      )}
      {!hasMore && posts.length >= 10 && (
        <p className="sk-feed-end">Vous avez tout vu 🎉</p>
      )}
    </section>
  );
}

function DesktopStudioComposer({
  avatarUrl,
  displayName,
  userIdentifier,
  cityLabel,
  country,
  isPublishing,
  publishError,
  onPublish,
}: {
  avatarUrl: string;
  displayName: string;
  userIdentifier: string;
  cityLabel: string;
  country: string;
  isPublishing: boolean;
  publishError: string | null;
  onPublish: (data: SoKinPublishPayload) => void;
}) {
  const [postType, setPostType] = useState<SoKinPostType>('SHOWCASE');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [location, setLocation] = useState('');
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ok' | 'denied' | 'error'>('idle');

  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ key: string; label: string; handle: string; avatarUrl: string | null }>>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [articleInput, setArticleInput] = useState('');
  const [articleSuggestions, setArticleSuggestions] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedArticles, setSelectedArticles] = useState<string[]>([]);

  const [scheduledAt, setScheduledAt] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  const mediaRequired = MEDIA_REQUIRED_TYPES.includes(postType);
  const typeMeta = POST_TYPE_META[postType];
  const canPreview = text.trim().length > 0 || mediaFiles.length > 0;
  const hasText = text.trim().length > 0;
  const hasMedia = mediaFiles.length > 0;
  const canPublish = (hasText || hasMedia) && (!mediaRequired || hasMedia);

  useEffect(() => {
    const urls = mediaFiles.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [mediaFiles]);

  useEffect(() => {
    let cancelled = false;
    if (tagInput.trim().length < 2) {
      setTagSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const q = tagInput.trim().toLowerCase();
        const [profiles, shops] = await Promise.all([
          explorerApi.profiles({ limit: 50, city: cityLabel, country }).catch(() => []),
          explorerApi.shops({ limit: 50, city: cityLabel, country }).catch(() => []),
        ]);
        if (cancelled) return;

        const profileItems = profiles
          .filter((p) => `${p.displayName} ${p.username ?? ''}`.toLowerCase().includes(q))
          .slice(0, 5)
          .map((p) => ({
            key: `u-${p.userId}`,
            label: p.displayName,
            handle: `@${(p.username ?? p.displayName).replace(/^@/, '').replace(/\s+/g, '_')}`,
            avatarUrl: p.avatarUrl,
          }));

        const shopItems = shops
          .filter((s) => `${s.name} ${s.slug}`.toLowerCase().includes(q))
          .slice(0, 5)
          .map((s) => ({
            key: `b-${s.businessId}`,
            label: s.name,
            handle: `@${s.slug.replace(/^@/, '')}`,
            avatarUrl: s.logo ?? s.coverImage,
          }));

        setTagSuggestions([...profileItems, ...shopItems].slice(0, 8));
      } catch {
        if (!cancelled) setTagSuggestions([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tagInput, cityLabel, country]);

  useEffect(() => {
    let cancelled = false;
    if (articleInput.trim().length < 2) {
      setArticleSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const result = await listingsApi.search({ q: articleInput.trim(), city: cityLabel, country, limit: 8 });
        if (cancelled) return;
        const next = result.results.slice(0, 8).map((item) => ({
          id: item.id,
          label: `#${item.title.replace(/\s+/g, '_').slice(0, 40)}`,
        }));
        setArticleSuggestions(next);
      } catch {
        if (!cancelled) setArticleSuggestions([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [articleInput, cityLabel, country]);

  const addFiles = (fileList: FileList) => {
    setLocalError(null);
    const current = [...mediaFiles];
    let videoCount = current.filter((f) => f.type.startsWith('video/')).length;
    const toAdd: File[] = [];

    for (const f of Array.from(fileList)) {
      if (current.length + toAdd.length >= 5) break;
      if (f.type.startsWith('video/') && videoCount >= 2) continue;
      if (f.type.startsWith('video/')) videoCount += 1;
      toAdd.push(f);
    }

    if (toAdd.length === 0) {
      setLocalError('Ajout refusé: maximum 5 médias dont 2 vidéos.');
      return;
    }

    setMediaFiles([...current, ...toAdd]);
  };

  const resolveLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocalError('Géolocalisation indisponible sur cet appareil.');
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const reversed = await geoApi.reverse(position.coords.latitude, position.coords.longitude);
          setLocation(reversed.city ? `${reversed.city}, ${reversed.country ?? 'RDC'}` : reversed.formattedAddress);
          setLocationStatus('ok');
        } catch {
          setLocation(`${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`);
          setLocationStatus('ok');
        }
      },
      () => {
        setLocationStatus('denied');
        setLocalError('Permission localisation refusée. Vous pouvez saisir la localisation manuellement.');
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  };

  const addTag = (handleRaw?: string) => {
    const handle = (handleRaw ?? tagInput).trim();
    if (!handle) return;
    const normalized = handle.startsWith('@') ? handle : `@${handle}`;
    setSelectedTags((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setTagInput('');
    setTagSuggestions([]);
  };

  const addArticle = (valueRaw?: string) => {
    const raw = (valueRaw ?? articleInput).trim();
    if (!raw) return;
    const normalized = raw.startsWith('#') ? raw : `#${raw}`;
    setSelectedArticles((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setArticleInput('');
    setArticleSuggestions([]);
  };

  const validateDesktopSchedule = (value: string): string | null => {
    if (!value) return null;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'Date de programmation invalide.';
    const max = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (dt > max) return 'Programmation invalide: maximum 30 jours.';
    if (dt < new Date()) return 'La date de programmation est déjà passée.';
    return null;
  };

  const confirmDesktopEditor = () => {
    const err = validateDesktopSchedule(scheduledAt);
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    setIsEditorOpen(false);
  };

  const submit = () => {
    setLocalError(null);
    if (!canPublish) {
      if (mediaRequired && mediaFiles.length < 1) {
        setLocalError('Ce type de publication nécessite au moins 1 média.');
      } else {
        setLocalError('Ajoutez du texte ou au moins 1 média.');
      }
      return;
    }
    const schedErr = validateDesktopSchedule(scheduledAt);
    if (schedErr) {
      setLocalError(schedErr);
      if (!isEditorOpen) setIsEditorOpen(true);
      return;
    }

    onPublish({
      text,
      mediaFiles,
      postType,
      subject: subject.trim() || undefined,
      location: location.trim() || undefined,
      tags: selectedTags.map((v) => v.replace(/^@/, '')),
      hashtags: selectedArticles.map((v) => v.replace(/^#/, '')),
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    });
  };

  return (
    <section className="sk-desktop-studio glass-container" aria-label="Studio So-Kin">
      <header className="sk-desktop-studio-head">
        <div>
          <strong>Studio So-Kin</strong>
          <span>Créer</span>
        </div>
        <p>Un seul flux pour publier un post et visualiser le rendu avant diffusion.</p>
      </header>

      {(publishError || localError) && <div className="sk-modal-error" role="alert">⚠️ {publishError ?? localError}</div>}

      <article className="sk-studio-card">
        <header className="sk-studio-profile">
          {avatarUrl ? (
            <img src={resolveMediaUrl(avatarUrl)} alt={displayName} className="sk-studio-avatar" />
          ) : (
            <span className="sk-studio-avatar sk-studio-avatar--empty" aria-hidden="true">{(displayName.charAt(0) || '?').toUpperCase()}</span>
          )}
          <div className="sk-studio-profile-meta">
            <strong>{displayName}</strong>
            <span>{userIdentifier}</span>
          </div>
        </header>

        <p className="sk-studio-context">Feed public ({cityLabel})</p>

        {/* ── Sélecteur de type (desktop) ── */}
        <div className="sk-type-selector" role="radiogroup" aria-label="Type de publication">
          {(Object.keys(POST_TYPE_META) as SoKinPostType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={`sk-type-chip${postType === type ? ' sk-type-chip--active' : ''}`}
              onClick={() => setPostType(type)}
              role="radio"
              aria-checked={postType === type}
            >
              <span className="sk-type-chip-icon">{POST_TYPE_META[type].icon}</span>
              <span className="sk-type-chip-label">{POST_TYPE_META[type].label}</span>
            </button>
          ))}
        </div>

        {/* ── Sujet optionnel ── */}
        {(['QUESTION', 'REVIEW', 'TREND', 'SEARCH'] as SoKinPostType[]).includes(postType) && (
          <input
            type="text"
            className="sk-modal-input sk-subject-input"
            placeholder="Sujet (optionnel)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
          />
        )}

        <p className="sk-studio-question">{typeMeta.icon} {typeMeta.label}</p>

        <textarea
          className="sk-modal-textarea sk-modal-textarea--studio"
          placeholder={typeMeta.placeholder}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          rows={7}
        />

        <div className="sk-studio-actions">
          <button type="button" className="sk-btn sk-btn--outline" onClick={() => fileRef.current?.click()} disabled={isPublishing || mediaFiles.length >= 5}>🖼️</button>
          <button type="button" className="sk-btn sk-btn--outline" onClick={() => setIsEditorOpen((v) => !v)}>{isEditorOpen ? '← Retour' : 'Éditer'}</button>
          <button type="button" className="sk-btn sk-btn--primary" onClick={() => setShowPreview(true)} disabled={!canPreview || isPublishing}>Envoyer</button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
            }}
          />
        </div>

        {mediaFiles.length > 0 && (
          <div className="sk-modal-previews">
            {mediaFiles.map((f, i) => (
              <div key={i} className="sk-modal-preview-item">
                {f.type.startsWith('video/') ? (
                  <video src={previewUrls[i]} className="sk-modal-preview-thumb" muted playsInline />
                ) : (
                  <img src={previewUrls[i]} alt="" className="sk-modal-preview-thumb" />
                )}
              </div>
            ))}
          </div>
        )}

        {isEditorOpen && (
          <section className="sk-desktop-editor-panel" aria-label="Édition enrichie">
            <label className="sk-modal-label" htmlFor="sk-location">📍 Localisation</label>
            <div className="sk-modal-tags-input-row">
              <input
                id="sk-location"
                className="sk-modal-input"
                placeholder="Gombe, Kinshasa"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <button type="button" className="sk-btn sk-btn--sm" onClick={resolveLocation} disabled={locationStatus === 'loading'}>
                {locationStatus === 'loading' ? '📍…' : '📍'}
              </button>
            </div>

            <label className="sk-modal-label" htmlFor="sk-tags">🏷️ Tags</label>
            <div className="sk-modal-tags-input-row">
              <input
                id="sk-tags"
                className="sk-modal-input"
                placeholder="Ajouter un tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
              />
              <button type="button" className="sk-btn sk-btn--sm" onClick={() => addTag()}>+</button>
            </div>
            {tagSuggestions.length > 0 && (
              <div className="sk-modal-suggestions">
                {tagSuggestions.map((item) => (
                  <button key={item.key} type="button" className="sk-modal-suggestion-item" onClick={() => addTag(item.handle)}>
                    {item.avatarUrl ? <img src={resolveMediaUrl(item.avatarUrl)} className="sk-modal-suggestion-avatar" alt="" /> : <span className="sk-modal-suggestion-avatar">👤</span>}
                    <span className="sk-modal-suggestion-text">
                      <strong>{item.label}</strong>
                      <span className="sk-modal-suggestion-handle">{item.handle}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selectedTags.length > 0 && (
              <div className="sk-modal-tags-list">
                {selectedTags.map((tag) => (
                  <span key={tag} className="sk-modal-tag">{tag}
                    <button type="button" className="sk-modal-tag-remove" onClick={() => setSelectedTags((prev) => prev.filter((v) => v !== tag))}>✕</button>
                  </span>
                ))}
              </div>
            )}

            <label className="sk-modal-label" htmlFor="sk-articles"># Articles</label>
            <div className="sk-modal-tags-input-row">
              <input
                id="sk-articles"
                className="sk-modal-input"
                placeholder="#Ajouter un article"
                value={articleInput}
                onChange={(e) => setArticleInput(e.target.value)}
              />
              <button type="button" className="sk-btn sk-btn--sm" onClick={() => addArticle()}>+</button>
            </div>
            {articleSuggestions.length > 0 && (
              <div className="sk-modal-suggestions">
                {articleSuggestions.map((item) => (
                  <button key={item.id} type="button" className="sk-modal-suggestion-item" onClick={() => addArticle(item.label)}>
                    <span className="sk-modal-suggestion-text"><strong>{item.label}</strong></span>
                  </button>
                ))}
              </div>
            )}
            {selectedArticles.length > 0 && (
              <div className="sk-modal-tags-list">
                {selectedArticles.map((tag) => (
                  <span key={tag} className="sk-modal-tag">{tag}
                    <button type="button" className="sk-modal-tag-remove" onClick={() => setSelectedArticles((prev) => prev.filter((v) => v !== tag))}>✕</button>
                  </span>
                ))}
              </div>
            )}

            <label className="sk-modal-label" htmlFor="sk-schedule">📅 Programmer (max 30j)</label>
            <input
              id="sk-schedule"
              type="datetime-local"
              className="sk-modal-input"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />

            <div className="sk-desktop-editor-actions">
              <button type="button" className="sk-btn sk-btn--outline" onClick={() => { setLocalError(null); setIsEditorOpen(false); }} disabled={isPublishing}>Annuler</button>
              <button type="button" className="sk-btn sk-btn--primary" onClick={confirmDesktopEditor} disabled={isPublishing}>Confirmer ✔</button>
            </div>
          </section>
        )}
      </article>

      {showPreview && (
        <div className="sk-desktop-preview-overlay" onClick={() => setShowPreview(false)}>
          <div className="sk-desktop-preview-modal" onClick={(e) => e.stopPropagation()}>
            <header className="sk-desktop-preview-head">
              <strong>{typeMeta.icon} {typeMeta.label} — Prévisualisation</strong>
              <button type="button" className="sk-btn sk-btn--primary" onClick={submit} disabled={isPublishing || !canPublish}>
                {isPublishing ? 'Publication…' : 'Publier'}
              </button>
            </header>
            {subject.trim() && <p className="sk-create-preview-subject"><strong>{subject}</strong></p>}
            <p className="sk-create-preview-text">{text || 'Aucun texte saisi.'}</p>
            {previewUrls.length > 0 ? (
              <div className="sk-modal-previews">
                {previewUrls.map((url, i) => (
                  <div key={i} className="sk-modal-preview-item">
                    {mediaFiles[i]?.type.startsWith('video/') ? (
                      <video src={url} className="sk-modal-preview-thumb" muted playsInline controls={false} />
                    ) : (
                      <img src={url} alt="" className="sk-modal-preview-thumb" />
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="sk-preview-metadata">
              {location && <span className="sk-preview-meta-item">📍 {location}</span>}
              {selectedTags.map((v) => <span key={v} className="sk-preview-meta-item">{v}</span>)}
              {selectedArticles.map((v) => <span key={v} className="sk-preview-meta-item">{v}</span>)}
              {scheduledAt && <span className="sk-preview-meta-item">📅 {new Date(scheduledAt).toLocaleString('fr-FR')}</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────── */
/* CREATE SCREEN — création d'annonce mobile plein écran   */
/* ─────────────────────────────────────────────────────── */

function CreateAnnounceScreen({
  onClose,
  onPublish,
  isPublishing,
  publishError,
  avatarUrl,
  displayName,
  userIdentifier,
  cityLabel,
  country,
  initialPostType = 'SHOWCASE',
  editingPost,
}: {
  onClose: () => void;
  onPublish: (data: SoKinPublishPayload) => void;
  isPublishing: boolean;
  publishError?: string | null;
  avatarUrl: string;
  displayName: string;
  userIdentifier: string;
  cityLabel: string;
  country: string;
  initialPostType?: SoKinPostType;
  editingPost?: SoKinApiPost | null;
}) {
  const isEditMode = Boolean(editingPost);
  const initialDraft = useMemo(() => (editingPost ? null : readSoKinCreateDraft()), [editingPost]);
  const [postType, setPostType] = useState<SoKinPostType>(editingPost?.postType ?? initialDraft?.postType ?? initialPostType);
  const [subject, setSubject] = useState(editingPost?.subject ?? initialDraft?.subject ?? '');
  const [text, setText] = useState(editingPost?.text ?? initialDraft?.text ?? '');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [existingMediaUrls, setExistingMediaUrls] = useState<string[]>(editingPost?.mediaUrls ?? []);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'editor' | 'preview'>('edit');
  const [showRestoreInfo, setShowRestoreInfo] = useState(() => !isEditMode && text.trim().length > 0);
  const [location, setLocation] = useState(editingPost?.location ?? initialDraft?.location ?? '');
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ok' | 'denied' | 'error'>('idle');

  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ key: string; label: string; handle: string; avatarUrl: string | null }>>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    (editingPost?.tags ?? initialDraft?.tags ?? []).map((v) => (v.startsWith('@') ? v : `@${v}`))
  );
  const [isSearchingTags, setIsSearchingTags] = useState(false);
  const [tagSearchNonce, setTagSearchNonce] = useState(0);

  const [articleInput, setArticleInput] = useState('');
  const [articleSuggestions, setArticleSuggestions] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedArticles, setSelectedArticles] = useState<string[]>(
    (editingPost?.hashtags ?? initialDraft?.hashtags ?? []).map((v) => (v.startsWith('#') ? v : `#${v}`))
  );
  const [isSearchingArticles, setIsSearchingArticles] = useState(false);
  const [articleSearchNonce, setArticleSearchNonce] = useState(0);

  const [scheduledAt, setScheduledAt] = useState(initialDraft?.scheduledAt ?? '');
  const [editorDraft, setEditorDraft] = useState<SoKinEditorDraftState | null>(null);
  const [editorBaseline, setEditorBaseline] = useState<SoKinEditorDraftState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mediaRequired = MEDIA_REQUIRED_TYPES.includes(postType);
  const typeMeta = POST_TYPE_META[postType];
  const totalMediaCount = mediaFiles.length + existingMediaUrls.length;
  const canPreview = text.trim().length > 0 || totalMediaCount > 0;
  const hasText = text.trim().length > 0;
  const hasMedia = totalMediaCount > 0;
  const canPublish = (hasText || hasMedia) && (!mediaRequired || hasMedia);
  const imageCount = mediaFiles.filter((f) => !f.type.startsWith('video/')).length;
  const videoCount = mediaFiles.filter((f) => f.type.startsWith('video/')).length;
  const hasUnsavedInput =
    text.trim().length > 0 ||
    mediaFiles.length > 0 ||
    location.trim().length > 0 ||
    selectedTags.length > 0 ||
    selectedArticles.length > 0 ||
    scheduledAt.trim().length > 0 ||
    subject.trim().length > 0;
  const maxScheduleLocal = useMemo(() => {
    const target = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const offset = target.getTimezoneOffset() * 60_000;
    return new Date(target.getTime() - offset).toISOString().slice(0, 16);
  }, []);
  const minScheduleLocal = useMemo(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 16);
  }, []);

  const validateSchedule = useCallback((raw: string): string | null => {
    if (!raw) return null;
    const dt = new Date(raw);
    const now = new Date();
    const max = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(dt.getTime())) return 'Date de programmation invalide.';
    if (dt < now) return 'La date de programmation doit être dans le futur.';
    if (dt > max) return 'Programmation invalide: maximum 30 jours dans le futur.';
    return null;
  }, []);

  const validateMediaSelection = (files: File[]) => {
    const total = files.length + existingMediaUrls.length;
    if (mediaRequired && total < 1) return 'Ajoutez au moins 1 média pour ce type de publication.';
    if (total > 5) return 'Maximum 5 médias par publication.';
    const vc = files.filter((f) => f.type.startsWith('video/')).length;
    if (vc > 2) return 'Maximum 2 vidéos par publication.';
    return null;
  };

  // Gère les object URLs pour les aperçus (nettoyage pour éviter les fuites mémoire)
  useEffect(() => {
    const urls = mediaFiles.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [mediaFiles]);

  // Bloque le scroll du body
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Autosave minimal du brouillon local (texte) — skip en mode édition
  useEffect(() => {
    if (isEditMode) return;
    try {
      const hasAnyDraft =
        text.trim().length > 0 ||
        location.trim().length > 0 ||
        selectedTags.length > 0 ||
        selectedArticles.length > 0 ||
        scheduledAt.trim().length > 0 ||
        subject.trim().length > 0;
      if (!hasAnyDraft) {
        localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
        return;
      }
      localStorage.setItem(
        CREATE_DRAFT_STORAGE_KEY,
        JSON.stringify({
          text,
          postType,
          subject,
          location,
          tags: selectedTags.map((v) => v.replace(/^@/, '')),
          hashtags: selectedArticles.map((v) => v.replace(/^#/, '')),
          scheduledAt,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // Ignorer les erreurs storage (quota / private mode)
    }
  }, [text, postType, subject, location, selectedTags, selectedArticles, scheduledAt]);

  useEffect(() => {
    let cancelled = false;
    const query = tagInput.trim().toLowerCase();
    if (query.length < 2 && tagSearchNonce === 0) {
      setTagSuggestions([]);
      setIsSearchingTags(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearchingTags(true);
      try {
        const [profiles, shops] = await Promise.all([
          explorerApi.profiles({ limit: 50, city: cityLabel, country }).catch(() => []),
          explorerApi.shops({ limit: 50, city: cityLabel, country }).catch(() => []),
        ]);
        if (cancelled) return;

        const profileItems = profiles
          .filter((p) => {
            if (!query) return true;
            return `${p.displayName} ${p.username ?? ''}`.toLowerCase().includes(query);
          })
          .slice(0, 5)
          .map((p) => ({
            key: `u-${p.userId}`,
            label: p.displayName,
            handle: `@${(p.username ?? p.displayName).replace(/^@/, '').replace(/\s+/g, '_')}`,
            avatarUrl: p.avatarUrl,
          }));

        const shopItems = shops
          .filter((s) => {
            if (!query) return true;
            return `${s.name} ${s.slug}`.toLowerCase().includes(query);
          })
          .slice(0, 5)
          .map((s) => ({
            key: `b-${s.businessId}`,
            label: s.name,
            handle: `@${s.slug.replace(/^@/, '')}`,
            avatarUrl: s.logo ?? s.coverImage,
          }));

        setTagSuggestions([...profileItems, ...shopItems].slice(0, 8));
      } catch {
        if (!cancelled) setTagSuggestions([]);
      } finally {
        if (!cancelled) setIsSearchingTags(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tagInput, cityLabel, country, tagSearchNonce]);

  useEffect(() => {
    let cancelled = false;
    const query = articleInput.trim();
    if (query.length < 2 && articleSearchNonce === 0) {
      setArticleSuggestions([]);
      setIsSearchingArticles(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearchingArticles(true);
      try {
        const result = await listingsApi.search({ q: query || undefined, city: cityLabel, country, limit: 8 });
        if (cancelled) return;
        const next = result.results.slice(0, 8).map((item) => ({
          id: item.id,
          label: `#${item.title.replace(/\s+/g, '_').slice(0, 40)}`,
        }));
        setArticleSuggestions(next);
      } catch {
        if (!cancelled) setArticleSuggestions([]);
      } finally {
        if (!cancelled) setIsSearchingArticles(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [articleInput, cityLabel, country, articleSearchNonce]);

  // Garde-fou abandon navigateur quand le draft est en cours
  useEffect(() => {
    if (!hasUnsavedInput) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedInput]);

  const requestClose = useCallback(() => {
    if (isPublishing) return;
    if (hasUnsavedInput && !isEditMode) {
      const confirmed = window.confirm('Vous avez un brouillon en cours. Quitter sans publier ?');
      if (!confirmed) return;
    }
    onClose();
  }, [hasUnsavedInput, isPublishing, isEditMode, onClose]);

  const addFiles = (fileList: FileList) => {
    setLocalError(null);
    const current = [...mediaFiles];
    const existingCount = existingMediaUrls.length;
    let videoCount = current.filter((f) => f.type.startsWith('video/')).length;
    const toAdd: File[] = [];
    let droppedVideos = 0;
    let droppedOverflow = 0;

    for (const f of Array.from(fileList)) {
      if (existingCount + current.length + toAdd.length >= 5) {
        droppedOverflow++;
        continue;
      }
      if (f.type.startsWith('video/') && videoCount >= 2) {
        droppedVideos++;
        continue;
      }
      if (f.type.startsWith('video/')) videoCount++;
      toAdd.push(f);
    }

    if (toAdd.length > 0) {
      setMediaFiles([...current, ...toAdd]);
    }

    if (droppedVideos > 0) {
      setLocalError('Maximum 2 vidéos par annonce.');
      return;
    }

    if (droppedOverflow > 0) {
      setLocalError('Maximum 5 médias par annonce.');
    }
  };

  const removeFile = (idx: number) => {
    setLocalError(null);
    setMediaFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const openPreview = () => {
    setLocalError(null);
    if (!canPreview) {
      setLocalError('Ajoutez un texte ou un média pour prévisualiser.');
      return;
    }
    const mediaError = validateMediaSelection(mediaFiles);
    if (mediaError) {
      setLocalError(mediaError);
      return;
    }
    const scheduleError = validateSchedule(scheduledAt);
    if (scheduleError) {
      setLocalError(scheduleError);
      return;
    }
    setMode('preview');
  };

  const openEditor = useCallback(() => {
    const snapshot: SoKinEditorDraftState = {
      location,
      selectedTags,
      selectedArticles,
      scheduledAt,
    };
    setEditorBaseline(snapshot);
    setEditorDraft(snapshot);
    setTagInput('');
    setTagSuggestions([]);
    setArticleInput('');
    setArticleSuggestions([]);
    setLocationStatus('idle');
    setMode('editor');
  }, [location, scheduledAt, selectedArticles, selectedTags]);

  const hasEditorChanges = useCallback(() => {
    if (!editorDraft || !editorBaseline) return false;
    return (
      editorDraft.location !== editorBaseline.location ||
      editorDraft.scheduledAt !== editorBaseline.scheduledAt ||
      editorDraft.selectedTags.join('||') !== editorBaseline.selectedTags.join('||') ||
      editorDraft.selectedArticles.join('||') !== editorBaseline.selectedArticles.join('||')
    );
  }, [editorBaseline, editorDraft]);

  const cancelEditor = useCallback(() => {
    if (isPublishing) return;
    if (hasEditorChanges()) {
      const confirmed = window.confirm('Voulez-vous abandonner les modifications ?');
      if (!confirmed) return;
    }
    setEditorDraft(null);
    setEditorBaseline(null);
    setTagInput('');
    setTagSuggestions([]);
    setArticleInput('');
    setArticleSuggestions([]);
    setLocationStatus('idle');
    setMode('edit');
  }, [hasEditorChanges, isPublishing]);

  const confirmEditor = useCallback(() => {
    if (isPublishing || !editorDraft) return;
    const scheduleError = validateSchedule(editorDraft.scheduledAt);
    if (scheduleError) {
      setLocalError(scheduleError);
      return;
    }
    setLocation(editorDraft.location);
    setSelectedTags(editorDraft.selectedTags);
    setSelectedArticles(editorDraft.selectedArticles);
    setScheduledAt(editorDraft.scheduledAt);
    setEditorDraft(null);
    setEditorBaseline(null);
    setTagInput('');
    setTagSuggestions([]);
    setArticleInput('');
    setArticleSuggestions([]);
    setLocationStatus('idle');
    setMode('edit');
  }, [editorDraft, isPublishing, validateSchedule]);

  const resolveLocation = () => {
    setLocalError(null);
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocalError('Géolocalisation indisponible sur cet appareil.');
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const reversed = await geoApi.reverse(position.coords.latitude, position.coords.longitude);
          const resolved = reversed.city ? `${reversed.city}, ${reversed.country ?? 'RDC'}` : reversed.formattedAddress;
          setEditorDraft((prev) => (prev ? { ...prev, location: resolved } : prev));
          setLocationStatus('ok');
        } catch {
          const fallback = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
          setEditorDraft((prev) => (prev ? { ...prev, location: fallback } : prev));
          setLocationStatus('ok');
        }
      },
      () => {
        setLocationStatus('denied');
        setLocalError('Permission localisation refusée. Vous pouvez saisir la localisation manuellement.');
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  };

  const addTag = (handleRaw: string) => {
    const handle = handleRaw.trim();
    if (!handle) return;
    const normalized = handle.startsWith('@') ? handle : `@${handle}`;
    setEditorDraft((prev) => {
      if (!prev) return prev;
      return prev.selectedTags.includes(normalized)
        ? prev
        : { ...prev, selectedTags: [...prev.selectedTags, normalized] };
    });
    setTagInput('');
    setTagSuggestions([]);
    setTagSearchNonce(0);
  };

  const addArticle = (item: { id: string; label: string }) => {
    const normalized = item.label.trim();
    if (!normalized || !normalized.startsWith('#')) return;
    setEditorDraft((prev) => {
      if (!prev) return prev;
      return prev.selectedArticles.includes(normalized)
        ? prev
        : { ...prev, selectedArticles: [...prev.selectedArticles, normalized] };
    });
    setArticleInput('');
    setArticleSuggestions([]);
    setArticleSearchNonce(0);
  };

  const submit = () => {
    setLocalError(null);
    if (!text.trim() && mediaFiles.length === 0 && existingMediaUrls.length === 0) {
      setLocalError('Ajoutez du texte ou au moins 1 média.');
      setMode('edit');
      return;
    }
    const mediaError = validateMediaSelection(mediaFiles);
    if (mediaError) {
      setLocalError(mediaError);
      setMode('edit');
      return;
    }
    if (!isEditMode) {
      const scheduleError = validateSchedule(scheduledAt);
      if (scheduleError) {
        setLocalError(scheduleError);
        setMode('editor');
        return;
      }
    }

    onPublish({
      text,
      mediaFiles,
      existingMediaUrls,
      postType,
      subject: subject.trim() || undefined,
      location: location.trim() || undefined,
      tags: selectedTags.map((v) => v.replace(/^@/, '')),
      hashtags: selectedArticles.map((v) => v.replace(/^#/, '')),
      scheduledAt: !isEditMode && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    });
  };

  return (
    <section className="sk-create-screen" role="dialog" aria-modal="true" aria-label={isEditMode ? 'Modifier une annonce' : 'Créer une annonce'}>
      <header className="sk-create-screen-head">
        {mode === 'edit' ? (
          <>
            <button type="button" className="sk-btn sk-btn--outline" onClick={requestClose} disabled={isPublishing}>Retour</button>
            <div className="sk-studio-head-title">
              <strong>Studio So-Kin</strong>
              <span>{isEditMode ? 'Modifier' : 'Créer'}</span>
            </div>
            <div className="sk-studio-head-spacer" aria-hidden="true" />
          </>
        ) : mode === 'editor' ? (
          <>
            <button type="button" className="sk-btn sk-btn--outline" onClick={cancelEditor} disabled={isPublishing}>← Annuler</button>
            <strong>Édition mobile</strong>
            <button type="button" className="sk-btn sk-btn--primary" onClick={confirmEditor} disabled={isPublishing}>Confirmer ✔</button>
          </>
        ) : (
          <>
            <button type="button" className="sk-btn sk-btn--outline" onClick={openEditor} disabled={isPublishing}>Éditer</button>
            <strong>Prévisualisation</strong>
            <button type="button" className="sk-btn sk-btn--primary" onClick={submit} disabled={!canPublish || isPublishing}>
              {isPublishing ? (isEditMode ? 'Modification…' : 'Publication…') : (isEditMode ? '✏️ Modifier' : 'Publier')}
            </button>
          </>
        )}
      </header>

      <div className="sk-create-screen-body">
        {showRestoreInfo && (
          <div className="sk-modal-info" role="status">
            Brouillon restauré automatiquement.
            <button
              type="button"
              className="sk-modal-info-dismiss"
              onClick={() => setShowRestoreInfo(false)}
              aria-label="Masquer l'information"
            >
              ✕
            </button>
          </div>
        )}

        {(publishError || localError) && (
          <div className="sk-modal-error" role="alert">
            ⚠️ {publishError ?? localError}
          </div>
        )}

        {mode === 'edit' ? (
          <>
            <article className="sk-studio-card" aria-label="Zone de création de publication">
              <header className="sk-studio-profile">
                {avatarUrl ? (
                  <img src={resolveMediaUrl(avatarUrl)} alt={displayName} className="sk-studio-avatar" />
                ) : (
                  <span className="sk-studio-avatar sk-studio-avatar--empty" aria-hidden="true">{(displayName.charAt(0) || '?').toUpperCase()}</span>
                )}
                <div className="sk-studio-profile-meta">
                  <strong>{displayName}</strong>
                  <span>{userIdentifier}</span>
                </div>
              </header>

              <p className="sk-studio-context">Feed public {cityLabel}</p>

              {/* ── Sélecteur de type ── */}
              <div className="sk-type-selector" role="radiogroup" aria-label="Type de publication">
                {(Object.keys(POST_TYPE_META) as SoKinPostType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`sk-type-chip${postType === type ? ' sk-type-chip--active' : ''}`}
                    onClick={() => setPostType(type)}
                    role="radio"
                    aria-checked={postType === type}
                  >
                    <span className="sk-type-chip-icon">{POST_TYPE_META[type].icon}</span>
                    <span className="sk-type-chip-label">{POST_TYPE_META[type].label}</span>
                  </button>
                ))}
              </div>

              {/* ── Sujet optionnel ── */}
              {(['QUESTION', 'REVIEW', 'TREND', 'SEARCH'] as SoKinPostType[]).includes(postType) && (
                <input
                  type="text"
                  className="sk-modal-input sk-subject-input"
                  placeholder="Sujet (optionnel)"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={120}
                />
              )}

              <p className="sk-studio-question">{typeMeta.icon} {typeMeta.label}</p>

              <div className="sk-studio-text-wrap">
                <textarea
                  ref={textareaRef}
                  className="sk-modal-textarea sk-modal-textarea--studio"
                  placeholder={typeMeta.placeholder}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setLocalError(null);
                  }}
                  rows={7}
                  maxLength={500}
                  autoFocus
                />
                <button
                  type="button"
                  className="sk-studio-media-btn"
                  onClick={() => fileRef.current?.click()}
                  disabled={totalMediaCount >= 5 || isPublishing}
                  aria-label="Ajouter un média"
                  title="Ajouter un média"
                >
                  🖼️
                </button>
              </div>

              <span className="sk-modal-char-count">{text.length}/500</span>

              <div className="sk-studio-actions">
                <button
                  type="button"
                  className="sk-btn sk-btn--outline"
                  onClick={openEditor}
                  disabled={isPublishing}
                >
                  Éditer
                </button>
                <button
                  type="button"
                  className="sk-btn sk-btn--primary"
                  onClick={openPreview}
                  disabled={!canPreview || isPublishing}
                >
                  {isEditMode ? 'Aperçu & Modifier' : 'Envoyer'}
                </button>
              </div>
            </article>

            {(existingMediaUrls.length > 0 || mediaFiles.length > 0) && (
              <div className="sk-modal-previews">
                {existingMediaUrls.map((url, i) => (
                  <div key={`existing-${i}`} className="sk-modal-preview-item">
                    {/\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(url) ? (
                      <video src={url} className="sk-modal-preview-thumb" muted playsInline />
                    ) : (
                      <img src={url} alt="" className="sk-modal-preview-thumb" />
                    )}
                    <button
                      type="button"
                      className="sk-modal-preview-remove"
                      onClick={() => setExistingMediaUrls((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Retirer ce média"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {mediaFiles.map((f, i) => (
                  <div key={`new-${i}`} className="sk-modal-preview-item">
                    {f.type.startsWith('video/') ? (
                      <video src={previewUrls[i]} className="sk-modal-preview-thumb" muted playsInline />
                    ) : (
                      <img src={previewUrls[i]} alt="" className="sk-modal-preview-thumb" />
                    )}
                    <button
                      type="button"
                      className="sk-modal-preview-remove"
                      onClick={() => removeFile(i)}
                      aria-label="Supprimer ce média"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="sk-modal-media-row">
              <span className="sk-modal-media-hint">Médias: {totalMediaCount}/5 {mediaRequired ? '(obligatoire)' : '(optionnel)'}</span>
              <span className="sk-modal-media-hint">Jusqu'à 5 médias, dont 2 vidéos max</span>
              <span className="sk-media-counter" aria-live="polite">
                {imageCount} image{imageCount > 1 ? 's' : ''} / {videoCount} vidéo{videoCount > 1 ? 's' : ''}
              </span>
              <span className="sk-media-counter" aria-live="polite">
                Détails: {selectedTags.length + selectedArticles.length + (location ? 1 : 0) + (scheduledAt ? 1 : 0)}
              </span>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,video/*"
                hidden
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                }}
              />
            </div>
          </>
        ) : mode === 'editor' ? (
          <article className="sk-mobile-editor-panel" aria-label="Édition enrichie mobile">
            <section className="sk-modal-section">
              <label className="sk-modal-label" htmlFor="sk-mobile-location">📍 Localisation</label>
              <div className="sk-modal-tags-input-row">
                <input
                  id="sk-mobile-location"
                  className="sk-modal-input"
                  placeholder="Gombe, Kinshasa"
                  value={editorDraft?.location ?? ''}
                  onChange={(e) => setEditorDraft((prev) => (prev ? { ...prev, location: e.target.value } : prev))}
                />
                <button type="button" className="sk-btn sk-btn--sm" onClick={resolveLocation} disabled={locationStatus === 'loading'}>
                  {locationStatus === 'loading' ? '📍…' : '📍'}
                </button>
              </div>
              {locationStatus === 'ok' && <p className="sk-modal-hint">Localisation mise à jour.</p>}
              {locationStatus === 'denied' && <p className="sk-modal-hint">Permission refusée: saisissez la zone manuellement.</p>}
              {locationStatus === 'error' && <p className="sk-modal-hint">Localisation indisponible sur cet appareil.</p>}
            </section>

            <section className="sk-modal-section">
              <label className="sk-modal-label" htmlFor="sk-mobile-tags">🏷️ Tags</label>
              <div className="sk-modal-tags-input-row">
                <input
                  id="sk-mobile-tags"
                  className="sk-modal-input"
                  placeholder="Ajouter un tag"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setTagSearchNonce(0);
                  }}
                />
                <button
                  type="button"
                  className="sk-btn sk-btn--sm"
                  onClick={() => setTagSearchNonce((v) => v + 1)}
                >
                  +
                </button>
              </div>
              {isSearchingTags && <p className="sk-modal-searching">Recherche des profils Kin-Sell…</p>}
              {tagSuggestions.length > 0 && (
                <div className="sk-modal-suggestions">
                  {tagSuggestions.map((item) => (
                    <button key={item.key} type="button" className="sk-modal-suggestion-item" onClick={() => addTag(item.handle)}>
                      {item.avatarUrl ? <img src={resolveMediaUrl(item.avatarUrl)} className="sk-modal-suggestion-avatar" alt="" /> : <span className="sk-modal-suggestion-avatar">👤</span>}
                      <span className="sk-modal-suggestion-text">
                        <strong>{item.label}</strong>
                        <span className="sk-modal-suggestion-handle">{item.handle}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {(editorDraft?.selectedTags.length ?? 0) > 0 && (
                <div className="sk-modal-tags-list">
                  {(editorDraft?.selectedTags ?? []).map((tag) => (
                    <span key={tag} className="sk-modal-tag">{tag}
                      <button
                        type="button"
                        className="sk-modal-tag-remove"
                        onClick={() => setEditorDraft((prev) => (prev ? { ...prev, selectedTags: prev.selectedTags.filter((v) => v !== tag) } : prev))}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="sk-modal-section">
              <label className="sk-modal-label" htmlFor="sk-mobile-articles"># Articles</label>
              <div className="sk-modal-tags-input-row">
                <input
                  id="sk-mobile-articles"
                  className="sk-modal-input"
                  placeholder="#Ajouter un article"
                  value={articleInput}
                  onChange={(e) => {
                    setArticleInput(e.target.value);
                    setArticleSearchNonce(0);
                  }}
                />
                <button
                  type="button"
                  className="sk-btn sk-btn--sm"
                  onClick={() => setArticleSearchNonce((v) => v + 1)}
                >
                  +
                </button>
              </div>
              {isSearchingArticles && <p className="sk-modal-searching">Recherche des articles…</p>}
              {articleSuggestions.length > 0 && (
                <div className="sk-modal-suggestions">
                  {articleSuggestions.map((item) => (
                    <button key={item.id} type="button" className="sk-modal-suggestion-item" onClick={() => addArticle(item)}>
                      <span className="sk-modal-suggestion-text"><strong>{item.label}</strong></span>
                    </button>
                  ))}
                </div>
              )}
              {(editorDraft?.selectedArticles.length ?? 0) > 0 && (
                <div className="sk-modal-tags-list">
                  {(editorDraft?.selectedArticles ?? []).map((tag) => (
                    <span key={tag} className="sk-modal-tag">{tag}
                      <button
                        type="button"
                        className="sk-modal-tag-remove"
                        onClick={() => setEditorDraft((prev) => (prev ? { ...prev, selectedArticles: prev.selectedArticles.filter((v) => v !== tag) } : prev))}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="sk-modal-section">
              <label className="sk-modal-label" htmlFor="sk-mobile-schedule">📅 Programmer (max 30j)</label>
              <input
                id="sk-mobile-schedule"
                type="datetime-local"
                className="sk-modal-input"
                value={editorDraft?.scheduledAt ?? ''}
                min={minScheduleLocal}
                max={maxScheduleLocal}
                onChange={(e) => {
                  setEditorDraft((prev) => (prev ? { ...prev, scheduledAt: e.target.value } : prev));
                  const nextError = validateSchedule(e.target.value);
                  setLocalError(nextError);
                }}
              />
              <p className="sk-modal-hint">Format: jj/mm/aaaa --:--, limite 30 jours.</p>
              {editorDraft?.scheduledAt && !validateSchedule(editorDraft.scheduledAt) && (
                <p className="sk-modal-hint">Sélection: {new Date(editorDraft.scheduledAt).toLocaleString('fr-FR')}</p>
              )}
            </section>

            <div className="sk-mobile-editor-actions">
              <button
                type="button"
                className="sk-btn sk-btn--outline"
                onClick={cancelEditor}
                disabled={isPublishing}
              >
                Annuler
              </button>
              <button
                type="button"
                className="sk-btn sk-btn--primary"
                onClick={confirmEditor}
                disabled={isPublishing}
              >
                Confirmer ✔
              </button>
            </div>
          </article>
        ) : (
          <article className="sk-create-preview-card" aria-label="Prévisualisation annonce">
            <header className="sk-studio-profile">
              {avatarUrl ? (
                <img src={resolveMediaUrl(avatarUrl)} alt={displayName} className="sk-studio-avatar" />
              ) : (
                <span className="sk-studio-avatar sk-studio-avatar--empty" aria-hidden="true">{(displayName.charAt(0) || '?').toUpperCase()}</span>
              )}
              <div className="sk-studio-profile-meta">
                <strong>{displayName}</strong>
                <span>{userIdentifier}</span>
              </div>
            </header>
            <h3 className="sk-create-preview-title">{typeMeta.icon} {typeMeta.label} — Publication prête</h3>
            {subject.trim() && <p className="sk-create-preview-subject"><strong>{subject}</strong></p>}
            <p className="sk-create-preview-text">{text.trim() || 'Aucun texte saisi.'}</p>
            {mediaFiles.length > 0 ? (
              <div className="sk-modal-previews">
                {mediaFiles.map((f, i) => (
                  <div key={i} className="sk-modal-preview-item">
                    {f.type.startsWith('video/') ? (
                      <video src={previewUrls[i]} className="sk-modal-preview-thumb" muted playsInline controls={false} />
                    ) : (
                      <img src={previewUrls[i]} alt="" className="sk-modal-preview-thumb" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="sk-modal-media-hint">Aucun média ajouté.</p>
            )}
            <div className="sk-preview-metadata">
              {location && <span className="sk-preview-meta-item">📍 {location}</span>}
              {selectedTags.map((v) => <span key={v} className="sk-preview-meta-item">{v}</span>)}
              {selectedArticles.map((v) => <span key={v} className="sk-preview-meta-item">{v}</span>)}
              {scheduledAt && <span className="sk-preview-meta-item">📅 {new Date(scheduledAt).toLocaleString('fr-FR')}</span>}
            </div>

            <div className="sk-preview-actions">
              <button type="button" className="sk-btn sk-btn--outline" onClick={openEditor} disabled={isPublishing}>Éditer</button>
              <button type="button" className="sk-btn sk-btn--primary" onClick={submit} disabled={!canPublish || isPublishing}>
                {isPublishing ? '⏳ Publication…' : '🚀 Publier'}
              </button>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────── */
/* MAIN: So-Kin Page                                        */
/* ─────────────────────────────────────────────────────── */

export function SoKinPage() {
  return (
    <SoKinToastProvider>
      <SoKinPageInner />
    </SoKinToastProvider>
  );
}

function SoKinPageInner() {
  const navigate = useNavigate();
  const { isLoggedIn, user, logout } = useAuth();
  const { t } = useLocaleCurrency();
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const { on, off } = useSocket();
  const isMobile = useIsMobile(1023);
  const toast = useSoKinToast();

  // ── State — TOUS les hooks avant tout return conditionnel ──
  const scrollDir = useScrollDirection();

  const [posts, setPosts] = useState<SoKinApiFeedPost[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [showCreateScreen, setShowCreateScreen] = useState(false);
  const [editingPost, setEditingPost] = useState<SoKinApiPost | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [overlayUiLock, setOverlayUiLock] = useState(false);
  const [myPublishedPosts, setMyPublishedPosts] = useState<SoKinApiPost[]>([]);
  const [loadingMyPublishedPosts, setLoadingMyPublishedPosts] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deleteConfirmPostId, setDeleteConfirmPostId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [togglingPostId, setTogglingPostId] = useState<string | null>(null);
  const [contentTab, setContentTab] = useState<SoKinContentTab>('all');
  const [postCounts, setPostCounts] = useState<Record<string, number>>({ ACTIVE: 0, HIDDEN: 0, ARCHIVED: 0, DELETED: 0, BOOKMARKS: 0 });
  const [archivingPostId, setArchivingPostId] = useState<string | null>(null);
  const [myBookmarks, setMyBookmarks] = useState<SoKinApiFeedPost[]>([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [removingBookmarkId, setRemovingBookmarkId] = useState<string | null>(null);
  const [feedTab, setFeedTab] = useState<FeedTab>('pour-toi');

  // Viewer (géré au niveau page : un seul à la fois)
  const [viewerItem, setViewerItem] = useState<MediaItem | null>(null);
  // Commentaires
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, SoKinApiComment[]>>({});
  const [loadingCommentsPostId, setLoadingCommentsPostId] = useState<string | null>(null);
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyToComment, setReplyToComment] = useState<SoKinApiComment | null>(null);
  const [commentSort, setCommentSort] = useState<'recent' | 'relevant'>('recent');
  const [commentProfileState, setCommentProfileState] = useState<CommentProfileState>({
    status: 'idle',
    profile: null,
    message: null,
  });
  // Ouverture messagerie depuis une annonce
  const [contactingPostId, setContactingPostId] = useState<string | null>(null);
  const [desktopSearch, setDesktopSearch] = useState('');
  const [desktopHelpOpen, setDesktopHelpOpen] = useState(false);
  const [desktopNotifOpen, setDesktopNotifOpen] = useState(false);
  const [desktopAccountOpen, setDesktopAccountOpen] = useState(false);
  const [desktopNotifications, setDesktopNotifications] = useState<HeaderNotification[]>([]);

  // ── State Intelligence — Tendances & Insights ──
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<TrendingHashtag[]>([]);
  const [suggestedProfiles, setSuggestedProfiles] = useState<SuggestedProfile[]>([]);
  const [postInsightsCache, setPostInsightsCache] = useState<Record<string, PostInsight | PostInsightCard>>({});
  const [advisorTips, setAdvisorTips] = useState<AuthorTip[]>([]);
  const [dismissedTipIds, setDismissedTipIds] = useState<Set<string>>(new Set());
  const [smartBlocks, setSmartBlocks] = useState<SmartFeedBlocks | null>(null);
  const [socialStateMap, setSocialStateMap] = useState<{ reactions: Record<string, SoKinReactionType>; bookmarks: Set<string> }>({ reactions: {}, bookmarks: new Set() });
  const [accessInfo, setAccessInfo] = useState<SoKinAccessInfo | null>(null);
  const [scoringDrawerPostId, setScoringDrawerPostId] = useState<string | null>(null);
  const [scoringData, setScoringData] = useState<ScoredPost | null>(null);
  const [scoringLoading, setScoringLoading] = useState(false);

  const city = user?.profile?.city ?? getCountryConfig(effectiveCountry).defaultCity;
  const country = effectiveCountry;
  const avatarUrl = user?.profile?.avatarUrl ?? '';
  const displayName = user?.profile?.displayName ?? 'Utilisateur';
  const dashboardPath = getDashboardPath(user?.role);

  // ── Flush tracking au démontage ──
  useEffect(() => () => { flushTracking(); }, []);

  // ── Chargement du fil ──
  const VENTES_TYPES = ['SELLING', 'PROMO', 'SHOWCASE'];
  const loadFeed = useCallback(
    async (reset = false) => {
      if (loadingRef.current) return;
      if (!reset && !hasMore) return;
      loadingRef.current = true;
      try {
        const limit = 20;
        const currentOffset = reset ? 0 : offsetRef.current;
        const feedParams: { limit: number; offset: number; city?: string; types?: string[] } = { limit, offset: currentOffset };
        if (feedTab === 'local') feedParams.city = city;
        // 'suivis' tab is disabled in UI — no feed branch needed
        if (feedTab === 'ventes') feedParams.types = VENTES_TYPES;
        const data = await sokinApi.publicFeed(feedParams);
        const incoming = data.posts;

        // ── Batch social-state: réactions + bookmarks en 1 appel ──
        if (isLoggedIn && incoming.length > 0) {
          try {
            const ids = incoming.map((p) => p.id);
            const state = await sokinApi.socialState(ids);
            setSocialStateMap((prev) => {
              const nextReactions = { ...prev.reactions, ...state.reactions };
              const nextBookmarks = new Set(prev.bookmarks);
              for (const id of state.bookmarks) nextBookmarks.add(id);
              return { reactions: nextReactions, bookmarks: nextBookmarks };
            });
          } catch { /* graceful — cards fall back to default */ }
        }

        if (reset) {
          setPosts(incoming);
          offsetRef.current = incoming.length;
          setLoadingFeed(false);
        } else {
          setPosts((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            const fresh = incoming.filter((p) => !ids.has(p.id));
            offsetRef.current += fresh.length;
            return [...prev, ...fresh];
          });
        }
        setHasMore(incoming.length >= limit);
      } catch {
        setHasMore(false);
        if (reset) setLoadingFeed(false);
      } finally {
        loadingRef.current = false;
      }
    },
    [hasMore, feedTab, city, isLoggedIn]
  );

  const loadMyPublishedPosts = useCallback(async (tab?: SoKinContentTab) => {
    if (!isLoggedIn) {
      setMyPublishedPosts([]);
      return;
    }
    const filterTab = tab ?? contentTab;

    // ── Onglet Favoris : chargement séparé ──
    if (filterTab === 'BOOKMARKS') {
      setLoadingBookmarks(true);
      try {
        const data = await sokinApi.myBookmarks({ limit: 50 });
        setMyBookmarks(data.posts ?? []);
      } catch {
        setMyBookmarks([]);
      } finally {
        setLoadingBookmarks(false);
      }
      // On charge aussi les compteurs
      try {
        const countsData = await sokinApi.myCounts();
        setPostCounts({ ACTIVE: 0, HIDDEN: 0, ARCHIVED: 0, DELETED: 0, BOOKMARKS: 0, ...countsData.counts });
      } catch { /* noop */ }
      return;
    }

    setLoadingMyPublishedPosts(true);
    try {
      const [postsData, countsData] = await Promise.all([
        sokinApi.myPosts({ status: filterTab === 'all' ? undefined : filterTab }),
        sokinApi.myCounts().catch(() => ({ counts: {} })),
      ]);
      const posts = postsData.posts ?? [];
      // Si onglet 'all', on exclut DELETED pour ne pas polluer la vue par défaut
      setMyPublishedPosts(filterTab === 'all' ? posts.filter((p) => p.status !== 'DELETED') : posts);
      setPostCounts({
        ACTIVE: 0, HIDDEN: 0, ARCHIVED: 0, DELETED: 0, BOOKMARKS: 0,
        ...countsData.counts,
      });
    } catch {
      setMyPublishedPosts([]);
    } finally {
      setLoadingMyPublishedPosts(false);
    }
  }, [isLoggedIn, contentTab]);

  // Chargement initial
  useEffect(() => {
    void loadFeed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rechargement quand l'onglet feed change
  useEffect(() => {
    setPosts([]);
    offsetRef.current = 0;
    setHasMore(true);
    setLoadingFeed(true);
    void loadFeed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedTab]);

  useEffect(() => {
    void loadMyPublishedPosts();
  }, [loadMyPublishedPosts]);

  useEffect(() => {
    if (!isLoggedIn) {
      setDesktopNotifications([]);
      return;
    }
    let cancelled = false;
    const loadDesktopNotifications = async () => {
      try {
        const [buyerData, sellerData] = await Promise.all([
          ordersApi.buyerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
          ordersApi.sellerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
        ]);
        if (cancelled) return;

        const notifs: HeaderNotification[] = [];
        if (buyerData) {
          for (const o of buyerData.orders) {
            const statusLabel = o.status === 'SHIPPED' ? 'Expédiée' : o.status === 'CONFIRMED' ? 'Confirmée' : 'En cours';
            notifs.push({
              id: `buy-${o.id}`,
              label: `Commande ${statusLabel}`,
              detail: `#${o.id.slice(0, 8).toUpperCase()} • ${o.itemsCount} article${o.itemsCount > 1 ? 's' : ''}`,
              href: getDashboardPath(user?.role),
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
              detail: `#${o.id.slice(0, 8).toUpperCase()} • ${o.buyer.displayName}`,
              href: getDashboardPath(user?.role),
              icon: '🛒',
              time: new Date(o.createdAt).toLocaleDateString('fr-FR'),
            });
          }
        }
        setDesktopNotifications(notifs);
      } catch {
        if (!cancelled) setDesktopNotifications([]);
      }
    };
    void loadDesktopNotifications();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user?.role]);

  // ── Chargement des tendances & profils suggérés ──
  useEffect(() => {
    let cancelled = false;
    const loadTrends = async () => {
      try {
        const [trendsData, profilesData, smartData] = await Promise.all([
          sokinTrends.trending({ city, limit: 8 }).catch(() => ({ topics: [], hashtags: [] })),
          sokinTrends.suggestedProfiles({ city, limit: 5 }).catch(() => ({ profiles: [] })),
          sokinTrends.smartFeed({ city }).catch(() => null),
        ]);
        if (cancelled) return;
        setTrendingTopics(trendsData.topics ?? []);
        setTrendingHashtags(trendsData.hashtags ?? []);
        setSuggestedProfiles(profilesData.profiles ?? []);
        if (smartData) setSmartBlocks(smartData);
      } catch {
        // silencieux
      }
    };
    void loadTrends();
    return () => { cancelled = true; };
  }, [city]);

  // ── Chargement des tips IA Ads (auteur connecté) ──
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    sokinTrends.advisorTips(3).then((res) => {
      if (!cancelled) setAdvisorTips(res.tips ?? []);
    }).catch(() => { /* silencieux — pas de tips si erreur ou pas premium */ });
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  // ── Chargement de l'accès So-Kin (tier + features + upsells) ──
  useEffect(() => {
    if (!isLoggedIn) { setAccessInfo(null); return; }
    let cancelled = false;
    sokinTrends.access().then((data) => {
      if (!cancelled) setAccessInfo(data);
    }).catch(() => { /* silencieux — FREE par défaut */ });
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const handleDismissTip = useCallback((tipId: string) => {
    setDismissedTipIds((prev) => new Set(prev).add(tipId));
  }, []);

  // ── Repost ──
  const [repostTarget, setRepostTarget] = useState<SoKinApiFeedPost | null>(null);
  const [repostComment, setRepostComment] = useState('');
  const [reposting, setReposting] = useState(false);

  const handleOpenRepost = useCallback((post: SoKinApiFeedPost) => {
    if (!isLoggedIn) { navigate('/login'); return; }
    setRepostTarget(post);
    setRepostComment('');
  }, [isLoggedIn, navigate]);

  const handleConfirmRepost = useCallback(async () => {
    if (!repostTarget || reposting) return;
    setReposting(true);
    try {
      const repost = await sokinApi.repost(repostTarget.id, { comment: repostComment.trim() || undefined });
      setPosts((prev) => [repost, ...prev]);
      setRepostTarget(null);
      setRepostComment('');
      toast.success('Repost publié');
    } catch (err: any) {
      const msg = err?.message || 'Erreur lors du repost';
      toast.error(msg);
    } finally {
      setReposting(false);
    }
  }, [repostTarget, reposting, repostComment, toast]);

  // ── Post insight pour l'auteur (chargement à la demande) ──
  const loadPostInsight = useCallback(async (postId: string) => {
    if (postInsightsCache[postId] || !isLoggedIn) return;
    try {
      const card = await sokinTrends.postInsightCard(postId);
      setPostInsightsCache((prev) => ({ ...prev, [postId]: card }));
    } catch {
      try {
        const insight = await sokinTrends.postInsight(postId);
        setPostInsightsCache((prev) => ({ ...prev, [postId]: insight }));
      } catch {
        // silencieux — pas d'insights si erreur
      }
    }
  }, [postInsightsCache, isLoggedIn]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setDesktopHelpOpen(false);
      setDesktopNotifOpen(false);
      setDesktopAccountOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  const handleDesktopSearch = useCallback(() => {
    const q = desktopSearch.trim();
    if (!q) {
      navigate('/explorer');
      return;
    }
    navigate(`/explorer?q=${encodeURIComponent(q)}`);
  }, [desktopSearch, navigate]);

  const handleDesktopLogout = useCallback(async () => {
    await logout();
    setDesktopAccountOpen(false);
    navigate('/login');
  }, [logout, navigate]);

  // Scroll infini
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !loadingRef.current) void loadFeed();
      },
      { rootMargin: '300px' }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadFeed]);

  // Socket : nouveaux posts en temps réel
  useEffect(() => {
    const handleNewPost = (payload: { sourceUserId?: string }) => {
      if (payload?.sourceUserId === user?.id) return;
      void loadFeed(true);
    };
    on('sokin:post-created', handleNewPost);
    return () => off('sokin:post-created', handleNewPost);
  }, [user?.id, on, off, loadFeed]);

  // ── Handlers ──
  const loadComments = useCallback(async (postId: string, sort: 'recent' | 'relevant' = 'recent') => {
    setLoadingCommentsPostId(postId);
    try {
      const data = await sokinApi.postComments(postId, { limit: 100, sort });
      setCommentsByPost((prev) => ({ ...prev, [postId]: data.comments ?? [] }));
    } catch {
      setCommentsByPost((prev) => ({ ...prev, [postId]: [] }));
    } finally {
      setLoadingCommentsPostId((prev) => (prev === postId ? null : prev));
    }
  }, []);

  const clearCommentsComposer = useCallback(() => {
    setReplyToComment(null);
    setCommentProfileState({ status: 'idle', profile: null, message: null });
    setCommentDraft('');
  }, []);

  const handleOpenComments = useCallback((postId: string) => {
    setOpenCommentsPostId(postId);
    setCommentSort('recent');
    clearCommentsComposer();
    void loadComments(postId, 'recent');
  }, [clearCommentsComposer, loadComments]);

  const handleCommentSortChange = useCallback((newSort: 'recent' | 'relevant') => {
    setCommentSort(newSort);
    if (openCommentsPostId) {
      void loadComments(openCommentsPostId, newSort);
    }
  }, [openCommentsPostId, loadComments]);

  const handleCloseComments = useCallback(() => {
    setOpenCommentsPostId(null);
    clearCommentsComposer();
  }, [clearCommentsComposer]);

  const handlePrepareReply = useCallback((comment: SoKinApiComment) => {
    const targetName = comment.author.profile?.displayName ?? 'Utilisateur';
    const mention = `@${targetName}`;
    setReplyToComment(comment);
    setCommentDraft((prev) => {
      const trimmed = prev.trim();
      if (trimmed.startsWith(mention)) return prev;
      if (!trimmed) return `${mention} `;
      return `${mention} ${trimmed}`;
    });
  }, []);

  const handleOpenCommentProfile = useCallback(async (comment: SoKinApiComment) => {
    const profilePreview: MissingPublicProfile = {
      avatarUrl: comment.author.profile?.avatarUrl ?? null,
      displayName: comment.author.profile?.displayName ?? 'Utilisateur',
      identifier: comment.author.profile?.username ? `@${comment.author.profile.username.replace('@', '')}` : comment.author.id,
    };

    const normalizeUsername = (value?: string | null) => (value ?? '').replace('@', '').trim();
    const getErrorStatus = (error: unknown) => {
      if (error instanceof ApiError) return error.status;
      return undefined;
    };

    const openResolvedProfile = (username: string) => {
      setCommentProfileState({ status: 'success', profile: profilePreview, message: null });
      navigate(`/user/${username}`);
    };

    setCommentProfileState({
      status: 'loading',
      profile: profilePreview,
      message: 'Chargement du profil public…',
    });

    const directUsername = normalizeUsername(comment.author.profile?.username);

    if (directUsername) {
      try {
        await usersApi.publicProfile(directUsername);
        openResolvedProfile(directUsername);
        return;
      } catch (error) {
        const status = getErrorStatus(error);
        if (status !== 404) {
          setCommentProfileState({
            status: 'error',
            profile: profilePreview,
            message: 'Erreur technique: impossible d’ouvrir le profil public pour le moment.',
          });
          return;
        }
      }
    }

    try {
      const payload = (await usersApi.publicProfileById(comment.author.id)) as { username?: string | null };
      const resolved = normalizeUsername(payload?.username);
      if (resolved) {
        openResolvedProfile(resolved);
        return;
      }

      setCommentProfileState({
        status: 'not-available',
        profile: profilePreview,
        message: 'L\'utilisateur ou l\'entreprise n\'a pas de profil public ou de boutique en ligne.',
      });
    } catch (error) {
      const status = getErrorStatus(error);
      if (status === 404) {
        setCommentProfileState({
          status: 'not-available',
          profile: profilePreview,
          message: 'L\'utilisateur ou l\'entreprise n\'a pas de profil public ou de boutique en ligne.',
        });
        return;
      }

      setCommentProfileState({
        status: 'error',
        profile: profilePreview,
        message: 'Erreur technique: impossible d’ouvrir le profil public pour le moment.',
      });
    }
  }, [navigate]);

  const handleSubmitComment = useCallback(async () => {
    if (!openCommentsPostId) return;
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    const content = commentDraft.trim();
    if (!content) return;

    setSubmittingCommentPostId(openCommentsPostId);
    try {
      const payload = await sokinApi.createComment(openCommentsPostId, {
        content,
        parentCommentId: replyToComment?.id,
      });
      const created = payload.comment;

      setCommentsByPost((prev) => ({
        ...prev,
        [openCommentsPostId]: [created, ...(prev[openCommentsPostId] ?? [])],
      }));
      setPosts((prev) => prev.map((p) => p.id === openCommentsPostId ? { ...p, comments: (p.comments ?? 0) + 1 } : p));
      setCommentDraft('');
      setReplyToComment(null);
    } catch {
      // no-op UI: conserver le draft pour permettre la ré-émission
    } finally {
      setSubmittingCommentPostId((prev) => (prev === openCommentsPostId ? null : prev));
    }
  }, [openCommentsPostId, isLoggedIn, navigate, commentDraft, replyToComment]);

  const handleContact = useCallback(async (post: SoKinApiFeedPost) => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    if (!user?.id || post.author.id === user.id) return;
    if (contactingPostId) return;

    setContactingPostId(post.id);
    try {
      const { conversation } = await messaging.createDM(post.author.id);
      const mainMedia = post.mediaUrls?.[0] ? resolveMediaUrl(post.mediaUrls[0]) : null;
      const textPreview = (post.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const postRef: SoKinPostRef = {
        id: post.id,
        text: textPreview,
        mediaUrl: mainMedia,
        authorName: post.author.profile?.displayName ?? 'Utilisateur',
        authorId: post.author.id,
        authorHandle: post.author.profile?.username ?? post.author.id,
      };
      navigate(`/messaging/${conversation.id}`, { state: { sokinPost: postRef } });
    } catch {
      navigate('/messaging');
    } finally {
      setContactingPostId(null);
    }
  }, [isLoggedIn, user?.id, contactingPostId, navigate]);

  const handleOpenCreate = useCallback(() => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    setShowCreateScreen(true);
  }, [isLoggedIn, navigate]);

  const handleCloseCreate = useCallback(() => {
    setShowCreateScreen(false);
    setEditingPost(null);
  }, []);

  const openAccountArticles = useCallback(() => {
    try {
      sessionStorage.setItem('ud-section', 'articles');
    } catch {
      // no-op
    }
    navigate(dashboardPath || '/account');
  }, [dashboardPath, navigate]);

  const handleOpenPublishedPost = useCallback(async (postId: string) => {
    try {
      const found = posts.find((item) => item.id === postId);
      if (found) {
        setPosts((prev) => [found, ...prev.filter((item) => item.id !== found.id)]);
        return;
      }
      const payload = await sokinApi.publicPost(postId);
      if (payload?.post) {
        setPosts((prev) => [payload.post, ...prev.filter((item) => item.id !== payload.post.id)]);
      }
    } catch {
      openAccountArticles();
    }
  }, [posts, openAccountArticles]);

  const handleDeletePublishedPost = useCallback((postId: string) => {
    if (deletingPostId) return;
    setDeleteError(null);
    setDeleteSuccess(false);
    setDeleteConfirmPostId(postId);
  }, [deletingPostId]);

  const confirmDeletePost = useCallback(async () => {
    if (!deleteConfirmPostId || deletingPostId) return;
    setDeletingPostId(deleteConfirmPostId);
    setDeleteError(null);
    try {
      await sokinApi.deletePost(deleteConfirmPostId);
      setMyPublishedPosts((prev) => prev.filter((item) => item.id !== deleteConfirmPostId));
      setPosts((prev) => prev.filter((item) => item.id !== deleteConfirmPostId));
      setPostCounts((prev) => ({
        ...prev,
        ACTIVE: Math.max(0, (prev.ACTIVE ?? 0) - 1),
        DELETED: (prev.DELETED ?? 0) + 1,
      }));
      setDeleteSuccess(true);
      toast.success('Publication supprimée');
      setTimeout(() => {
        setDeleteConfirmPostId(null);
        setDeleteSuccess(false);
      }, 1200);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Erreur lors de la suppression';
      setDeleteError(errMsg);
      toast.error(errMsg);
    } finally {
      setDeletingPostId(null);
    }
  }, [deleteConfirmPostId, deletingPostId, toast]);

  const cancelDelete = useCallback(() => {
    if (deletingPostId) return;
    setDeleteConfirmPostId(null);
    setDeleteError(null);
    setDeleteSuccess(false);
  }, [deletingPostId]);

  const handleTogglePublishedPost = useCallback(async (postId: string) => {
    if (togglingPostId) return;
    setTogglingPostId(postId);
    try {
      const data = await sokinApi.togglePost(postId);
      const updated = data.post;
      setMyPublishedPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: updated.status } : p)));
      if (updated.status === 'HIDDEN') {
        setPosts((prev) => prev.filter((item) => item.id !== postId));
      }
      toast.success(updated.status === 'HIDDEN' ? 'Publication masquée' : 'Publication visible');
    } catch {
      toast.error('Erreur lors du changement de visibilité');
    } finally {
      setTogglingPostId(null);
    }
  }, [togglingPostId, toast]);

  /** Toggle depuis le feed — garde la carte visible pour l'auteur avec le bandeau */
  const handleToggleFromFeed = useCallback(async (postId: string) => {
    try {
      const data = await sokinApi.togglePost(postId);
      const updated = data.post;
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: updated.status } : p)));
      setMyPublishedPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: updated.status } : p)));
      toast.success(updated.status === 'HIDDEN' ? 'Publication masquée' : 'Publication visible');
    } catch {
      toast.error('Erreur lors du changement de visibilité');
    }
  }, [toast]);

  const handleOpenScoring = useCallback(async (postId: string) => {
    setScoringDrawerPostId(postId);
    setScoringData(null);
    setScoringLoading(true);
    try {
      const data = await sokinTrends.scoringDetail(postId);
      setScoringData(data);
    } catch {
      // scoring unavailable
    } finally {
      setScoringLoading(false);
    }
  }, []);

  const handleEditPublishedPost = useCallback((postId: string) => {
    const post = myPublishedPosts.find((p) => p.id === postId);
    if (!post) return;
    setEditingPost(post);
    setShowCreateScreen(true);
  }, [myPublishedPosts]);

  const handleArchivePublishedPost = useCallback(async (postId: string) => {
    if (archivingPostId) return;
    setArchivingPostId(postId);
    try {
      const updated = await sokinApi.archivePost(postId);
      setMyPublishedPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: updated.status } : p)));
      if (updated.status === 'ARCHIVED') {
        setPosts((prev) => prev.filter((item) => item.id !== postId));
      }
      setPostCounts((prev) => {
        const next = { ...prev };
        if (updated.status === 'ARCHIVED') {
          next.ACTIVE = Math.max(0, (next.ACTIVE ?? 0) - 1);
          next.ARCHIVED = (next.ARCHIVED ?? 0) + 1;
        } else {
          next.ARCHIVED = Math.max(0, (next.ARCHIVED ?? 0) - 1);
          next.ACTIVE = (next.ACTIVE ?? 0) + 1;
        }
        return next;
      });
      toast.success(updated.status === 'ARCHIVED' ? 'Publication archivée' : 'Publication restaurée');
    } catch {
      toast.error('Erreur lors de l\'archivage');
    } finally {
      setArchivingPostId(null);
    }
  }, [archivingPostId, toast]);

  const handleContentTabChange = useCallback((tab: SoKinContentTab) => {
    setContentTab(tab);
    void loadMyPublishedPosts(tab);
  }, [loadMyPublishedPosts]);

  const handleRemoveBookmark = useCallback(async (postId: string) => {
    if (removingBookmarkId) return;
    setRemovingBookmarkId(postId);
    try {
      await sokinApi.bookmark(postId);
      setMyBookmarks((prev) => prev.filter((p) => p.id !== postId));
      toast.success('Retiré des favoris');
    } catch {
      toast.error('Erreur');
    } finally {
      setRemovingBookmarkId(null);
    }
  }, [removingBookmarkId]);

  const handlePublish = async (data: SoKinPublishPayload) => {
    if (isPublishing || !isLoggedIn) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      // Upload nouveaux fichiers média
      const newMediaUrls = await Promise.all(
        data.mediaFiles.map((f) => prepareMediaUrl(f))
      );
      const allMediaUrls = [...(data.existingMediaUrls ?? []), ...newMediaUrls];

      // ── Mode édition ──
      if (editingPost) {
        const resp = await sokinApi.updatePost(editingPost.id, {
          text: data.text,
          mediaUrls: allMediaUrls,
          postType: data.postType,
          subject: data.subject,
          location: data.location,
          tags: data.tags,
          hashtags: data.hashtags,
        });

        if (!resp?.post?.id) {
          throw new Error('Modification non confirmée par le serveur.');
        }

        // Mettre à jour les listes locales
        const updatedPost = resp.post;
        setMyPublishedPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
        setPosts((prev) => prev.map((item) => (item.id === updatedPost.id ? { ...item, ...updatedPost } : item)));

        setShowCreateScreen(false);
        setEditingPost(null);
        toast.success('Publication modifiée');
        return;
      }

      // ── Mode création ──
      if (!data.text.trim() && allMediaUrls.length === 0) {
        throw new Error('Le texte de la publication est obligatoire.');
      }

      const created = await sokinApi.createPost({
        text: data.text,
        mediaUrls: allMediaUrls,
        postType: data.postType,
        subject: data.subject,
        location: data.location,
        tags: data.tags,
        hashtags: data.hashtags,
        scheduledAt: data.scheduledAt,
      });

      if (!created?.id) {
        throw new Error('Publication non confirmée par le serveur.');
      }

      try {
        localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
      } catch {
        // Ignore storage failures
      }

      setShowCreateScreen(false);

      toast.success('Publication créée');

      try {
        const full = await sokinApi.publicPost(created.id);
        setPosts((prev) => [full.post, ...prev.filter((item) => item.id !== full.post.id)]);
      } catch {
        void loadFeed(true);
      }
    } catch (err) {
      setPublishError(
        err instanceof Error ? err.message : 'Erreur lors de la publication'
      );
    } finally {
      setIsPublishing(false);
    }
  };

  // Anti-flicker overlays: petit verrou de visibilité après transitions d'ouverture/fermeture
  useEffect(() => {
    setOverlayUiLock(true);
    const timer = window.setTimeout(() => setOverlayUiLock(false), OVERLAY_VISIBILITY_LOCK_MS);
    return () => window.clearTimeout(timer);
  }, [showCreateScreen, openCommentsPostId, viewerItem]);

  // ── Mobile: retour physique ferme les commentaires au lieu de quitter la page ──
  useEffect(() => {
    if (!openCommentsPostId) return;
    const onPopState = (e: PopStateEvent) => {
      e.preventDefault();
      handleCloseComments();
    };
    window.history.pushState({ skComments: true }, '');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [openCommentsPostId, handleCloseComments]);

  // ── Mobile manage posts drawer ──
  const [showMobileManage, setShowMobileManage] = useState(false);

  // ── Visibility des barres (top bar + FAB) ──
  const hasActiveOverlay = showCreateScreen || Boolean(openCommentsPostId) || Boolean(viewerItem) || showMobileManage;
  const fabVisible = !showCreateScreen && !openCommentsPostId && !viewerItem && !showMobileManage && (overlayUiLock || scrollDir === 'up');
  const barsVisible =
    hasActiveOverlay ||
    overlayUiLock ||
    scrollDir === 'up';

  return (
    <>
      <SeoMeta
        title="So-Kin — Annonces Kin-Sell"
        description="Publiez et découvrez des annonces à Kinshasa et en RDC."
        canonical="https://kin-sell.com/sokin"
      />

      {isMobile ? (
        <>
          <div className={`sk-page${barsVisible ? '' : ' sk-page--expanded'}`}>
            {/* ── Topbar sticky sociale ── */}
            <header className={`sk-topbar${barsVisible ? '' : ' sk-topbar--hidden'}`}>
              <button
                type="button"
                className="sk-topbar-back"
                onClick={() => navigate('/')}
                aria-label="Retour à l'accueil"
              >
                <IconBack />
              </button>
              <div className="sk-topbar-center">
                <span className="sk-topbar-title">So-Kin</span>
                {isLoggedIn && accessInfo && (
                  <span className={`sk-tier-badge ${TIER_BADGE[accessInfo.tier]?.cls ?? 'sk-tier-badge--free'}`}>
                    {TIER_BADGE[accessInfo.tier]?.label ?? 'FREE'}
                  </span>
                )}
              </div>
              <div className="sk-topbar-end">
                {isLoggedIn && (
                  <>
                    <button type="button" className="sk-topbar-action" onClick={() => navigate('/messaging')} aria-label="Messages">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </button>
                    <button type="button" className="sk-topbar-action" onClick={() => navigate('/notifications')} aria-label="Notifications">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                    </button>
                  </>
                )}
              </div>
            </header>

            {/* ── Onglets de feed (4 tabs) ── */}
            <nav className="sk-feed-tabs" aria-label="Onglets du fil">
              {FEED_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`sk-feed-tab${feedTab === tab.key ? ' sk-feed-tab--active' : ''}${tab.soon ? ' sk-feed-tab--soon' : ''}`}
                  onClick={() => { if (!tab.soon) setFeedTab(tab.key); }}
                  aria-disabled={tab.soon || undefined}
                >
                  <span className="sk-feed-tab-icon">{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.soon && <span className="sk-feed-tab-badge">Bientôt</span>}
                </button>
              ))}
            </nav>

            {/* ── Composer capsule sociale ── */}
            <ComposeZone
              avatarUrl={avatarUrl}
              displayName={displayName}
              onCreatePost={handleOpenCreate}
            />

            {/* ── Smart Feed Blocks — Mobile carrousel ── */}
            {smartBlocks && (
              <div className="sk-smart-mobile">
                {/* Tendances */}
                {smartBlocks.trendingTopics.length > 0 && (
                  <section className="sk-smart-block glass-container" aria-label="Tendances">
                    <h4 className="sk-smart-block-title">🔥 Tendances</h4>
                    <div className="sk-smart-scroll">
                      {smartBlocks.trendingTopics.slice(0, 6).map((t) => (
                        <div key={t.topic} className="sk-smart-chip sk-smart-chip--trend">
                          <span className="sk-smart-chip-label">{t.label}</span>
                          <span className="sk-smart-chip-meta">
                            {t.momentum === 'UP' ? '📈' : t.momentum === 'EMERGING' ? '✨' : '📊'} {t.posts7d} posts
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Hashtags chauds */}
                {smartBlocks.hotHashtags.length > 0 && (
                  <section className="sk-smart-block glass-container" aria-label="Hashtags">
                    <h4 className="sk-smart-block-title">🏷️ Hashtags chauds</h4>
                    <div className="sk-smart-scroll">
                      {smartBlocks.hotHashtags.slice(0, 8).map((h) => (
                        <span key={h.hashtag} className={`sk-smart-hashtag sk-smart-hashtag--${h.velocity.toLowerCase()}`}>
                          #{h.hashtag}
                          {h.velocity === 'RISING' && <span className="sk-smart-velocity">🚀</span>}
                          {h.velocity === 'NEW' && <span className="sk-smart-velocity">✨</span>}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {/* Formats gagnants */}
                {smartBlocks.winningFormats.length > 0 && (
                  <section className="sk-smart-block glass-container" aria-label="Formats gagnants">
                    <h4 className="sk-smart-block-title">🏆 Formats gagnants</h4>
                    <div className="sk-smart-scroll">
                      {smartBlocks.winningFormats.slice(0, 4).map((f) => (
                        <div key={f.postType} className="sk-smart-chip sk-smart-chip--format">
                          <span className="sk-smart-chip-label">{f.label}</span>
                          <span className="sk-smart-chip-meta">
                            {f.trend === 'HOT' ? '🔥' : f.trend === 'STABLE' ? '📊' : '❄️'} {f.avgViews} vues moy.
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Idées de publication */}
                {smartBlocks.publishIdeas.length > 0 && (
                  <section className="sk-smart-block glass-container" aria-label="Idées">
                    <h4 className="sk-smart-block-title">💡 Idées pour vous</h4>
                    <div className="sk-smart-scroll">
                      {smartBlocks.publishIdeas.slice(0, 3).map((idea) => (
                        <div key={idea.id} className="sk-smart-idea">
                          <span className="sk-smart-idea-title">{idea.title}</span>
                          <span className="sk-smart-idea-reason">{idea.reason}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* ── Premium upsell teaser (mobile, FREE only) ── */}
            {isLoggedIn && accessInfo && accessInfo.tier === 'FREE' && accessInfo.upsells.length > 0 && (
              <div className="sk-premium-teaser glass-container">
                <div className="sk-premium-teaser-head">
                  <span className="sk-premium-teaser-icon">✨</span>
                  <strong>Débloquez plus avec So-Kin Pro</strong>
                </div>
                <div className="sk-premium-teaser-features">
                  <span className="sk-premium-teaser-feat">📊 Analytics détaillés</span>
                  <span className="sk-premium-teaser-feat">🤖 Conseils IA</span>
                  <span className="sk-premium-teaser-feat">🏆 Formats gagnants</span>
                </div>
                <div className="sk-premium-teaser-preview">
                  <div className="sk-premium-blur-card">
                    <span>📈 Engagement: ██.█%</span>
                    <span>👁️ Vues: ████</span>
                    <span>🎯 Score: ██/100</span>
                  </div>
                </div>
                <button type="button" className="sk-premium-teaser-cta" onClick={() => navigate('/forfaits')}>
                  {accessInfo.upsells[0]?.ctaLabel ?? 'Voir les forfaits'} →
                </button>
              </div>
            )}

            {/* ── Feed social pleine largeur ── */}
            <AnnouncesFeed
              posts={posts}
              hasMore={hasMore}
              loading={loadingFeed}
              sentinelRef={sentinelRef}
              t={t}
              isLoggedIn={isLoggedIn}
              openCommentsPostId={openCommentsPostId}
              onOpenComments={handleOpenComments}
              onMediaClick={(item) => setViewerItem(item)}
              onContact={handleContact}
              contactingPostId={contactingPostId}
              currentUserId={user?.id}
              postInsightsCache={postInsightsCache}
              onLoadInsight={loadPostInsight}
              feedSource={feedTab}
              advisorTips={advisorTips}
              dismissedTipIds={dismissedTipIds}
              onDismissTip={handleDismissTip}
              onRepost={handleOpenRepost}
              onToggle={handleToggleFromFeed}
              socialState={socialStateMap}
              onScoring={handleOpenScoring}
            />
          </div>

          {/* ── FAB social — Publier + Mon contenu ── */}
          <div className={`sk-fab-group${fabVisible ? '' : ' sk-fab-group--hidden'}`}>
            <button
              type="button"
              className="sk-fab sk-fab--publish"
              aria-label="Nouvelle publication"
              onClick={() => { if (!isLoggedIn) { navigate('/login'); return; } handleOpenCreate(); }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button
              type="button"
              className="sk-fab sk-fab--manage"
              aria-label="Mon contenu"
              onClick={async () => { if (!isLoggedIn) { navigate('/login'); return; } setShowMobileManage(true); await loadMyPublishedPosts(); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </button>
          </div>

          {/* ── Mobile: Mon contenu Drawer ── */}
          {showMobileManage && (
            <div className="sk-mobile-manage-overlay" onClick={() => setShowMobileManage(false)}>
              <aside className="sk-mobile-manage-drawer" onClick={(e) => e.stopPropagation()}>
                <header className="sk-mobile-manage-header">
                  <h3>📋 Mon contenu</h3>
                  <button type="button" onClick={() => setShowMobileManage(false)} className="sk-mobile-manage-close">✕</button>
                </header>

                {/* Onglets de filtre */}
                <nav className="sk-content-tabs" aria-label="Filtrer par statut">
                  {([
                    ['all', 'Tout', postCounts.ACTIVE + postCounts.HIDDEN + postCounts.ARCHIVED],
                    ['ACTIVE', 'Publiés', postCounts.ACTIVE],
                    ['HIDDEN', 'Masqués', postCounts.HIDDEN],
                    ['ARCHIVED', 'Archivés', postCounts.ARCHIVED],
                    ['DELETED', 'Supprimés', postCounts.DELETED],
                    ['BOOKMARKS', '🔖 Favoris', postCounts.BOOKMARKS ?? myBookmarks.length],
                  ] as [SoKinContentTab, string, number][]).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="button"
                      className={`sk-content-tab${contentTab === key ? ' sk-content-tab--active' : ''}`}
                      onClick={() => handleContentTabChange(key)}
                    >
                      {label} <span className="sk-content-tab-count">{count}</span>
                    </button>
                  ))}
                </nav>

                <div className="sk-mobile-manage-body">
                  {contentTab === 'BOOKMARKS' ? (
                    /* ── Vue Favoris ── */
                    loadingBookmarks ? (
                      <p className="sk-mobile-manage-empty">Chargement…</p>
                    ) : myBookmarks.length === 0 ? (
                      <p className="sk-mobile-manage-empty">Aucun favori pour le moment.</p>
                    ) : (
                      myBookmarks.map((post) => (
                        <article key={post.id} className="sk-mobile-manage-item sk-mobile-manage-item--bookmark">
                          <button type="button" className="sk-mobile-manage-main" onClick={() => { setShowMobileManage(false); void handleOpenPublishedPost(post.id); }}>
                            {post.author?.profile?.avatarUrl && (
                              <img src={resolveMediaUrl(post.author.profile.avatarUrl)} alt="" className="sk-bookmark-avatar" />
                            )}
                            <div className="sk-bookmark-info">
                              <strong>{post.text?.slice(0, 60) || 'Publication sans texte'}</strong>
                              <span className="sk-bookmark-meta">
                                {post.author?.profile?.displayName ?? 'Utilisateur'} · {new Date(post.createdAt).toLocaleDateString('fr-FR')}
                              </span>
                            </div>
                          </button>
                          <div className="sk-mobile-manage-stats">
                            <span title="Likes">❤️ {post.likes ?? 0}</span>
                            <span title="Commentaires">💬 {post.comments ?? 0}</span>
                          </div>
                          <div className="sk-mobile-manage-actions">
                            <button
                              type="button"
                              className="sk-mobile-manage-btn sk-mobile-manage-btn--bookmark-remove"
                              onClick={() => void handleRemoveBookmark(post.id)}
                              disabled={removingBookmarkId === post.id}
                            >
                              {removingBookmarkId === post.id ? '⏳' : '🔖 Retirer'}
                            </button>
                          </div>
                        </article>
                      ))
                    )
                  ) : (
                    /* ── Vue Mes publications ── */
                    loadingMyPublishedPosts ? (
                    <p className="sk-mobile-manage-empty">Chargement…</p>
                  ) : myPublishedPosts.length === 0 ? (
                    <p className="sk-mobile-manage-empty">Aucune publication dans cette catégorie.</p>
                  ) : (
                    myPublishedPosts.map((post) => {
                      const statusConfig: Record<string, { icon: string; label: string; cls: string }> = {
                        ACTIVE: { icon: '🟢', label: 'Publié', cls: 'sk-mobile-manage-status--active' },
                        HIDDEN: { icon: '🟡', label: 'Masqué', cls: 'sk-mobile-manage-status--hidden' },
                        ARCHIVED: { icon: '📦', label: 'Archivé', cls: 'sk-mobile-manage-status--archived' },
                        DELETED: { icon: '🗑️', label: 'Supprimé', cls: 'sk-mobile-manage-status--deleted' },
                      };
                      const sc = statusConfig[post.status] ?? statusConfig.ACTIVE;
                      return (
                        <article key={post.id} className={`sk-mobile-manage-item${post.status !== 'ACTIVE' ? ` sk-mobile-manage-item--${post.status.toLowerCase()}` : ''}`}>
                          <button type="button" className="sk-mobile-manage-main" onClick={() => { setShowMobileManage(false); void handleOpenPublishedPost(post.id); }}>
                            <strong>{post.text?.slice(0, 50) || 'Publication sans texte'}</strong>
                            <span>{new Date(post.createdAt).toLocaleDateString('fr-FR')}</span>
                            <span className={`sk-mobile-manage-status ${sc.cls}`}>{sc.icon} {sc.label}</span>
                          </button>
                          {/* Mini stats */}
                          <div className="sk-mobile-manage-stats">
                            <span title="Likes">❤️ {post.likes ?? 0}</span>
                            <span title="Commentaires">💬 {post.comments ?? 0}</span>
                            <span title="Partages">🔄 {post.shares ?? 0}</span>
                          </div>
                          {post.status !== 'DELETED' && (
                            <div className="sk-mobile-manage-actions">
                              {post.status !== 'ARCHIVED' && (
                                <button type="button" className="sk-mobile-manage-btn sk-mobile-manage-btn--toggle" onClick={() => void handleTogglePublishedPost(post.id)} disabled={togglingPostId === post.id}>
                                  {togglingPostId === post.id ? '⏳' : post.status === 'ACTIVE' ? '⏸️ Masquer' : '▶️ Publier'}
                                </button>
                              )}
                              <button type="button" className="sk-mobile-manage-btn sk-mobile-manage-btn--archive" onClick={() => void handleArchivePublishedPost(post.id)} disabled={archivingPostId === post.id}>
                                {archivingPostId === post.id ? '⏳' : post.status === 'ARCHIVED' ? '📤 Désarchiver' : '📦 Archiver'}
                              </button>
                              <button type="button" className="sk-mobile-manage-btn sk-mobile-manage-btn--edit" onClick={() => { setShowMobileManage(false); handleEditPublishedPost(post.id); }}>✏️ Modifier</button>
                              <button type="button" className="sk-mobile-manage-btn sk-mobile-manage-btn--delete" onClick={() => void handleDeletePublishedPost(post.id)} disabled={deletingPostId === post.id}>
                                {deletingPostId === post.id ? '⏳' : '🗑️ Supprimer'}
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })
                  ))}
                </div>
                <footer className="sk-mobile-manage-footer">
                  <button type="button" className="sk-mobile-manage-new" onClick={() => { setShowMobileManage(false); handleOpenCreate(); }}>+ Nouvelle publication</button>
                </footer>
              </aside>
            </div>
          )}
        </>
      ) : (
        <div className="sk-desktop-shell">
          {/* ═══════ TOPBAR ═══════ */}
          <header className="sk-desktop-topbar" aria-label="Barre supérieure So-Kin">
            {/* Logo So-Kin — bubbles premium */}
            <button type="button" className="sk-desktop-logo-bubbles glass-container" onClick={() => navigate('/sokin')} aria-label="Aller à So-Kin">
              <span className="sk-desktop-logo-shine" aria-hidden="true" />
              {['S', 'o', '-', 'K', 'i', 'n'].map((letter, idx) => (
                <span key={letter + idx} className="sk-desktop-logo-bubble glass-card" style={{ animationDelay: `${idx * 140}ms` }}>{letter}</span>
              ))}
            </button>

            {/* Search */}
            <div className="sk-desktop-global-search glass-container">
              <span className="sk-desktop-search-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input
                type="search"
                value={desktopSearch}
                onChange={(e) => setDesktopSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDesktopSearch();
                }}
                placeholder="Rechercher sur So-Kin…"
                aria-label="Recherche So-Kin"
              />
            </div>

            {/* Actions */}
            <div className="sk-desktop-topbar-actions glass-container">
              <button type="button" className="sk-desktop-head-icon ks-help-btn" onClick={() => setDesktopHelpOpen(true)} aria-label="Aide">
                <span>?</span>
              </button>
              <button type="button" className="sk-desktop-head-icon sk-desktop-head-icon--notif" onClick={() => setDesktopNotifOpen((prev) => !prev)} aria-label="Notifications">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                {desktopNotifications.length > 0 && <span className="sk-desktop-notif-badge">{desktopNotifications.length}</span>}
              </button>
              <button type="button" className="sk-desktop-head-icon" onClick={() => setDesktopAccountOpen(true)} aria-label="Compte">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
            </div>

            {/* Notifications dropdown */}
            {desktopNotifOpen && (
              <div className="sk-desktop-notif-panel glass-container" role="menu">
                <header>
                  <strong>Notifications</strong>
                  <span>{desktopNotifications.length}</span>
                </header>
                {desktopNotifications.length === 0 ? (
                  <p className="sk-desktop-user-meta" style={{ padding: '16px', textAlign: 'center' }}>Aucune notification.</p>
                ) : (
                  <div className="sk-desktop-notif-list">
                    {desktopNotifications.map((item) => (
                      <button key={item.id} type="button" className="sk-desktop-notif-item" onClick={() => {
                        setDesktopNotifOpen(false);
                        navigate(item.href);
                      }}>
                        <span>{item.icon}</span>
                        <div>
                          <strong>{item.label}</strong>
                          <small>{item.detail}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </header>

          {/* ═══════ 3-COLUMN GRID ═══════ */}
          <div className="sk-desktop-grid">
            {/* ── LEFT SIDEBAR — Navigation sociale ── */}
            <aside className="sk-desktop-left" aria-label="Navigation So-Kin">
              <nav className="sk-desktop-nav glass-container">
                <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/')}>
                  <span className="sk-desktop-nav-icon">🏠</span><span className="sk-desktop-nav-label">Accueil</span>
                </button>
                <button type="button" className="sk-desktop-nav-item sk-desktop-nav-item--active" onClick={() => navigate('/sokin')}>
                  <span className="sk-desktop-nav-icon">📱</span><span className="sk-desktop-nav-label">So-Kin</span>
                </button>
                <button type="button" className="sk-desktop-nav-item" onClick={() => setFeedTab('pour-toi')}>
                  <span className="sk-desktop-nav-icon">✨</span><span className="sk-desktop-nav-label">Pour toi</span>
                </button>
                <button type="button" className="sk-desktop-nav-item sk-desktop-nav-item--soon" aria-disabled>
                  <span className="sk-desktop-nav-icon">👥</span><span className="sk-desktop-nav-label">Suivis</span><span className="sk-feed-tab-badge">Bientôt</span>
                </button>
                <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/explorer')}>
                  <span className="sk-desktop-nav-icon">🔍</span><span className="sk-desktop-nav-label">Explorer</span>
                </button>

                <hr className="sk-desktop-nav-sep" />

                <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/explorer/shops-online')}>
                  <span className="sk-desktop-nav-icon">🔥</span><span className="sk-desktop-nav-label">Tendances</span>
                </button>
                {isLoggedIn && (
                  <>
                    <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/sokin/bookmarks')}>
                      <span className="sk-desktop-nav-icon">🔖</span><span className="sk-desktop-nav-label">Enregistrés</span>
                    </button>
                    <button type="button" className="sk-desktop-nav-item" onClick={async () => { setShowMobileManage(true); await loadMyPublishedPosts(); }}>
                      <span className="sk-desktop-nav-icon">📋</span><span className="sk-desktop-nav-label">Mon contenu</span>
                    </button>
                    <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/messaging')}>
                      <span className="sk-desktop-nav-icon">💬</span><span className="sk-desktop-nav-label">Messages</span>
                    </button>
                    <button type="button" className="sk-desktop-nav-item" onClick={() => navigate(dashboardPath)}>
                      <span className="sk-desktop-nav-icon">👤</span><span className="sk-desktop-nav-label">Profil</span>
                    </button>
                    {accessInfo && (
                      <div className="sk-desktop-tier-row">
                        <span className={`sk-tier-badge ${TIER_BADGE[accessInfo.tier]?.cls ?? 'sk-tier-badge--free'}`}>
                          {TIER_BADGE[accessInfo.tier]?.label ?? 'FREE'}
                        </span>
                        {accessInfo.tier === 'FREE' && (
                          <button type="button" className="sk-desktop-upgrade-link" onClick={() => navigate('/forfaits')}>
                            Passer Pro ✨
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </nav>

              {/* Bouton CTA Publier */}
              {isLoggedIn && (
                <button
                  type="button"
                  className="sk-desktop-publish-btn"
                  onClick={handleOpenCreate}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>Publier</span>
                </button>
              )}
            </aside>

            {/* ── CENTER — Feed principal ── */}
            <main className="sk-desktop-center" aria-label="Contenu principal So-Kin">
              {/* Onglets de feed desktop */}
              <nav className="sk-feed-tabs sk-feed-tabs--desktop" aria-label="Onglets du fil">
                {FEED_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`sk-feed-tab${feedTab === tab.key ? ' sk-feed-tab--active' : ''}${tab.soon ? ' sk-feed-tab--soon' : ''}`}
                    onClick={() => { if (!tab.soon) setFeedTab(tab.key); }}
                    aria-disabled={tab.soon || undefined}
                  >
                    <span className="sk-feed-tab-icon">{tab.icon}</span>
                    <span>{tab.label}</span>
                    {tab.soon && <span className="sk-feed-tab-badge">Bientôt</span>}
                  </button>
                ))}
              </nav>

              <DesktopStudioComposer
                avatarUrl={avatarUrl}
                displayName={displayName}
                userIdentifier={user?.profile?.username ? `@${user.profile.username.replace('@', '')}` : `ID ${user?.id?.slice(0, 8) ?? 'invité'}`}
                cityLabel={city}
                country={country}
                isPublishing={isPublishing}
                publishError={publishError}
                onPublish={handlePublish}
              />

              <AnnouncesFeed
                posts={posts}
                hasMore={hasMore}
                loading={loadingFeed}
                sentinelRef={sentinelRef}
                t={t}
                isLoggedIn={isLoggedIn}
                openCommentsPostId={openCommentsPostId}
                onOpenComments={handleOpenComments}
                onMediaClick={(item) => setViewerItem(item)}
                onContact={handleContact}
                contactingPostId={contactingPostId}
                immersiveDesktop
                currentUserId={user?.id}
                postInsightsCache={postInsightsCache}
                onLoadInsight={loadPostInsight}
                feedSource={feedTab}
                advisorTips={advisorTips}
                dismissedTipIds={dismissedTipIds}
                onDismissTip={handleDismissTip}
                onRepost={handleOpenRepost}
                onToggle={handleToggleFromFeed}
                socialState={socialStateMap}
                onScoring={handleOpenScoring}
              />
            </main>

            {/* ── RIGHT SIDEBAR — Social-first ── */}
            <aside className="sk-desktop-right" aria-label="Découvrir et informations">

              {/* ── Recherche rapide ── */}
              <section className="sk-desktop-panel sk-desktop-search-panel glass-container" aria-label="Recherche">
                <div className="sk-desktop-search-inline">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    type="search"
                    value={desktopSearch}
                    onChange={(e) => setDesktopSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleDesktopSearch(); }}
                    placeholder="Rechercher…"
                    className="sk-desktop-search-input-sm"
                  />
                </div>
              </section>

              {/* ── Tendances locales (dynamiques) ── */}
              <section className="sk-desktop-panel sk-desktop-trends glass-container" aria-label="Tendances locales">
                <h3>🔥 Tendances à {city}</h3>
                <ul className="sk-desktop-trend-list">
                  {trendingTopics.length > 0 ? trendingTopics.map((topic) => (
                    <li key={topic.tag} className="sk-desktop-trend-item">
                      <span className="sk-desktop-trend-tag">{topic.label}</span>
                      <span className="sk-desktop-trend-meta">
                        {topic.trend === 'up' ? '📈' : topic.trend === 'new' ? '✨' : ''} {topic.count} post{topic.count > 1 ? 's' : ''}
                      </span>
                    </li>
                  )) : (
                    <>
                      <li className="sk-desktop-trend-item"><span className="sk-desktop-trend-tag">#Kinshasa</span><span className="sk-desktop-trend-meta">Populaire</span></li>
                      <li className="sk-desktop-trend-item"><span className="sk-desktop-trend-tag">#SoKin</span><span className="sk-desktop-trend-meta">Réseau local</span></li>
                    </>
                  )}
                </ul>
              </section>

              {/* ── Suggestions de profils (dynamiques) ── */}
              <section className="sk-desktop-panel sk-desktop-suggestions glass-container" aria-label="Suggestions">
                <h3>🌟 Profils à découvrir</h3>
                <div className="sk-desktop-suggestion-list">
                  {suggestedProfiles.length > 0 ? suggestedProfiles.map((profile) => (
                    <div key={profile.userId} className="sk-desktop-suggestion-item">
                      <span className="sk-desktop-suggestion-avatar">
                        {profile.avatarUrl ? (
                          <img src={profile.avatarUrl} alt="" className="sk-desktop-suggestion-avatar-img" />
                        ) : (
                          profile.displayName.charAt(0).toUpperCase()
                        )}
                      </span>
                      <div className="sk-desktop-suggestion-info">
                        <strong>{profile.displayName}</strong>
                        <span>{profile.username ? `@${profile.username}` : `${profile.postCount} post${profile.postCount > 1 ? 's' : ''}`}</span>
                      </div>
                      <button type="button" className="sk-desktop-suggestion-follow" onClick={() => navigate(`/user/${profile.username ?? profile.userId}`)}>Voir</button>
                    </div>
                  )) : (
                    <p className="sk-desktop-empty-hint">Aucune suggestion pour le moment</p>
                  )}
                </div>
              </section>

              {/* ── Hashtags chauds (dynamiques) ── */}
              <section className="sk-desktop-panel sk-desktop-hashtags glass-container" aria-label="Hashtags populaires">
                <h3>🏷️ Hashtags du moment</h3>
                <div className="sk-desktop-hashtag-cloud">
                  {trendingHashtags.length > 0 ? trendingHashtags.slice(0, 8).map((h) => (
                    <span key={h.hashtag} className="sk-desktop-hashtag-chip">{h.hashtag}</span>
                  )) : (
                    <>
                      <span className="sk-desktop-hashtag-chip">#Kinshasa</span>
                      <span className="sk-desktop-hashtag-chip">#SoKin</span>
                      <span className="sk-desktop-hashtag-chip">#Commerce</span>
                    </>
                  )}
                </div>
              </section>

              {/* ── Smart: Formats gagnants ── */}
              {smartBlocks && smartBlocks.winningFormats.length > 0 && (
                <section className="sk-desktop-panel sk-desktop-smart glass-container" aria-label="Formats gagnants">
                  <h3>🏆 Formats gagnants</h3>
                  <ul className="sk-desktop-smart-list">
                    {smartBlocks.winningFormats.slice(0, 4).map((f) => (
                      <li key={f.postType} className="sk-desktop-smart-item">
                        <span className="sk-desktop-smart-label">{f.label}</span>
                        <span className={`sk-desktop-smart-badge sk-desktop-smart-badge--${f.trend.toLowerCase()}`}>
                          {f.trend === 'HOT' ? '🔥 Hot' : f.trend === 'STABLE' ? '📊 Stable' : '❄️ Cool'}
                        </span>
                        <span className="sk-desktop-smart-meta">{f.avgViews} vues · {f.avgEngagement}% eng.</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* ── Smart: Idées de publication ── */}
              {smartBlocks && smartBlocks.publishIdeas.length > 0 && (
                <section className="sk-desktop-panel sk-desktop-smart glass-container" aria-label="Idées de publication">
                  <h3>💡 Idées pour vous</h3>
                  <ul className="sk-desktop-smart-list">
                    {smartBlocks.publishIdeas.slice(0, 3).map((idea) => (
                      <li key={idea.id} className="sk-desktop-smart-idea">
                        <strong className="sk-desktop-smart-idea-title">{idea.title}</strong>
                        <span className="sk-desktop-smart-idea-reason">{idea.reason}</span>
                        <button type="button" className="sk-desktop-smart-idea-action" onClick={handleOpenCreate}>{idea.actionLabel}</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* ── Smart: Opportunités boost ── */}
              {smartBlocks && smartBlocks.boostOpportunities.length > 0 && (
                <section className="sk-desktop-panel sk-desktop-smart glass-container" aria-label="Boost">
                  <h3>🚀 Boost recommandé</h3>
                  <ul className="sk-desktop-smart-list">
                    {smartBlocks.boostOpportunities.slice(0, 2).map((b) => (
                      <li key={b.postId} className="sk-desktop-smart-boost">
                        <span className="sk-desktop-smart-boost-reason">{b.reason}</span>
                        <span className="sk-desktop-smart-boost-score">Score {b.boostScore}/100</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* ── Premium upsell sidebar (FREE only) ── */}
              {isLoggedIn && accessInfo && accessInfo.tier === 'FREE' && (
                <section className="sk-desktop-panel sk-desktop-premium-upsell glass-container" aria-label="Débloquer premium">
                  <h3>✨ Débloquer So-Kin Pro</h3>
                  <p className="sk-desktop-premium-desc">Accédez aux analytics avancés, conseils IA et bien plus.</p>
                  <div className="sk-desktop-premium-preview">
                    <div className="sk-desktop-premium-blur-row">📊 Engagement: ██.█%</div>
                    <div className="sk-desktop-premium-blur-row">👁️ Vues 7j: ████</div>
                    <div className="sk-desktop-premium-blur-row">🎯 Score: ██/100</div>
                  </div>
                  {accessInfo.upsells.map((u, i) => (
                    <button key={i} type="button" className="sk-desktop-premium-cta" onClick={() => navigate(u.ctaRoute)}>
                      {u.ctaLabel} →
                    </button>
                  ))}
                </section>
              )}

              {/* ── Bloc business discret ── */}
              <section className="sk-desktop-panel sk-desktop-commercial sk-desktop-commercial--discreet glass-container" aria-label="Kin-Sell Business">
                <p className="sk-desktop-commercial-line">📦 Boostez votre visibilité sur So-Kin</p>
                <button type="button" className="sk-desktop-outline" onClick={handleOpenCreate}>Créer un post</button>
              </section>
              {/* ── Mon contenu (inline management) ── */}
              {isLoggedIn && (myPublishedPosts.length > 0 || myBookmarks.length > 0) && (
                <section className="sk-desktop-panel sk-desktop-my-content glass-container" aria-label="Mon contenu">
                  <h3>📋 Mon contenu</h3>
                  {/* Mini-tabs desktop */}
                  <nav className="sk-desktop-content-tabs" aria-label="Onglets contenu">
                    <button type="button" className={`sk-desktop-content-tab${contentTab !== 'BOOKMARKS' ? ' sk-desktop-content-tab--active' : ''}`} onClick={() => handleContentTabChange('all')}>
                      Mes posts <span className="sk-desktop-content-tab-count">{(postCounts.ACTIVE ?? 0) + (postCounts.HIDDEN ?? 0)}</span>
                    </button>
                    <button type="button" className={`sk-desktop-content-tab${contentTab === 'BOOKMARKS' ? ' sk-desktop-content-tab--active' : ''}`} onClick={() => handleContentTabChange('BOOKMARKS')}>
                      🔖 Favoris <span className="sk-desktop-content-tab-count">{postCounts.BOOKMARKS ?? myBookmarks.length}</span>
                    </button>
                  </nav>

                  {contentTab === 'BOOKMARKS' ? (
                    /* ── Vue Favoris desktop ── */
                    <div className="sk-desktop-published-list">
                      {loadingBookmarks ? (
                        <p className="sk-desktop-empty">Chargement…</p>
                      ) : myBookmarks.length === 0 ? (
                        <p className="sk-desktop-empty">Aucun favori pour le moment.</p>
                      ) : (
                        myBookmarks.map((post) => (
                          <article key={post.id} className="sk-desktop-published-item sk-desktop-published-item--bookmark">
                            <button type="button" className="sk-desktop-published-main" onClick={() => void handleOpenPublishedPost(post.id)} title="Voir la publication">
                              <strong>{post.text?.slice(0, 46) || 'Publication sans texte'}</strong>
                              <span className="sk-desktop-published-meta">
                                {post.author?.profile?.displayName ?? 'Utilisateur'} · {new Date(post.createdAt).toLocaleDateString('fr-FR')}
                              </span>
                            </button>
                            <div className="sk-desktop-published-actions">
                              <button type="button" className="sk-desktop-action-btn sk-desktop-action-btn--danger" title="Retirer des favoris" onClick={() => void handleRemoveBookmark(post.id)} disabled={removingBookmarkId === post.id}>
                                {removingBookmarkId === post.id ? '⏳' : '🔖'}
                              </button>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  ) : (
                    /* ── Vue Mes publications desktop ── */
                    <div className="sk-desktop-published-list">
                      {myPublishedPosts.map((post) => {
                      const statusConfig: Record<string, { icon: string; label: string }> = {
                        ACTIVE: { icon: '🟢', label: 'Publié' },
                        HIDDEN: { icon: '🟡', label: 'Masqué' },
                        ARCHIVED: { icon: '📦', label: 'Archivé' },
                        DELETED: { icon: '🗑️', label: 'Supprimé' },
                      };
                      const sc = statusConfig[post.status] ?? statusConfig.ACTIVE;
                      return (
                        <article key={post.id} className="sk-desktop-published-item">
                          <button
                            type="button"
                            className="sk-desktop-published-main"
                            onClick={() => void handleOpenPublishedPost(post.id)}
                            title="Voir la publication"
                          >
                            <strong>{post.text?.slice(0, 46) || 'Publication sans texte'}</strong>
                            <span className="sk-desktop-published-meta">
                              {sc.icon} {sc.label} · {new Date(post.createdAt).toLocaleDateString('fr-FR')}
                            </span>
                          </button>
                          {post.status !== 'DELETED' && (
                            <div className="sk-desktop-published-actions">
                              <button type="button" className="sk-desktop-action-btn" title="Modifier" onClick={() => handleEditPublishedPost(post.id)}>✏️</button>
                              {post.status !== 'ARCHIVED' && (
                                <button type="button" className="sk-desktop-action-btn" title={post.status === 'ACTIVE' ? 'Masquer' : 'Publier'} onClick={() => void handleTogglePublishedPost(post.id)} disabled={togglingPostId === post.id}>
                                  {togglingPostId === post.id ? '⏳' : post.status === 'ACTIVE' ? '⏸️' : '▶️'}
                                </button>
                              )}
                              <button type="button" className="sk-desktop-action-btn" title={post.status === 'ARCHIVED' ? 'Désarchiver' : 'Archiver'} onClick={() => void handleArchivePublishedPost(post.id)} disabled={archivingPostId === post.id}>
                                {archivingPostId === post.id ? '⏳' : post.status === 'ARCHIVED' ? '📤' : '📦'}
                              </button>
                              <button type="button" className="sk-desktop-action-btn sk-desktop-action-btn--danger" title="Supprimer" onClick={() => void handleDeletePublishedPost(post.id)} disabled={deletingPostId === post.id}>
                                {deletingPostId === post.id ? '⏳' : '🗑️'}
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                    </div>
                  )}
                  <button type="button" className="sk-desktop-outline" onClick={handleOpenCreate}>+ Nouvelle publication</button>
                </section>
              )}
            </aside>
          </div>

          {desktopHelpOpen && (
            <div className="sk-desktop-help-overlay" onClick={() => setDesktopHelpOpen(false)}>
              <div className="sk-desktop-help-popup" onClick={(e) => e.stopPropagation()}>
                <header>
                  <strong>Kin-Sell</strong>
                  <button type="button" onClick={() => setDesktopHelpOpen(false)}>✕</button>
                </header>
                <nav>
                  {DESKTOP_INFO_ITEMS.map((item) => (
                    <button key={item.href} type="button" onClick={() => {
                      setDesktopHelpOpen(false);
                      navigate(item.href);
                    }}>{item.title}</button>
                  ))}
                </nav>
              </div>
            </div>
          )}

          {desktopAccountOpen && (
            <div className="sk-desktop-account-overlay" onClick={() => setDesktopAccountOpen(false)}>
              <div className="sk-desktop-account-popup" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => {
                  setDesktopAccountOpen(false);
                  navigate(getDashboardPath(user?.role));
                }}>Compte</button>
                <button type="button" onClick={() => {
                  setDesktopAccountOpen(false);
                  navigate('/messaging');
                }}>Messagerie</button>
                <button type="button" onClick={() => void handleDesktopLogout()}>Déconnexion</button>
              </div>
            </div>
          )}
        </div>
      )}

      <CommentsDrawer
        post={posts.find((p) => p.id === openCommentsPostId) ?? null}
        open={Boolean(openCommentsPostId)}
        isLoggedIn={isLoggedIn}
        comments={openCommentsPostId ? (commentsByPost[openCommentsPostId] ?? []) : []}
        loading={loadingCommentsPostId === openCommentsPostId}
        draft={commentDraft}
        submitting={submittingCommentPostId === openCommentsPostId}
        replyTo={replyToComment}
        profileState={commentProfileState}
        sort={commentSort}
        onClose={handleCloseComments}
        onDraftChange={setCommentDraft}
        onSubmit={handleSubmitComment}
        onPrepareReply={handlePrepareReply}
        onOpenProfile={handleOpenCommentProfile}
        onCloseProfileState={() => setCommentProfileState({ status: 'idle', profile: null, message: null })}
        onSortChange={handleCommentSortChange}
      />

      {showCreateScreen && (
        <CreateAnnounceScreen
          onClose={handleCloseCreate}
          onPublish={handlePublish}
          isPublishing={isPublishing}
          publishError={publishError}
          avatarUrl={avatarUrl}
          displayName={displayName}
          userIdentifier={user?.profile?.username ? `@${user.profile.username.replace('@', '')}` : `ID ${user?.id?.slice(0, 8) ?? 'invité'}`}
          cityLabel={city}
          country={country}
          editingPost={editingPost}
        />
      )}

      {viewerItem && (
        <MediaViewer item={viewerItem} onClose={() => setViewerItem(null)} />
      )}

      {/* ═══ MODAL REPOST ═══ */}
      {repostTarget && (
        <div className="sk-repost-overlay" onClick={() => setRepostTarget(null)} role="dialog" aria-modal="true" aria-label="Reposter">
          <div className="sk-repost-modal glass-container" onClick={(e) => e.stopPropagation()}>
            <div className="sk-repost-header">
              <h3>🔄 Reposter</h3>
              <button type="button" className="sk-repost-close" onClick={() => setRepostTarget(null)} aria-label="Fermer">✕</button>
            </div>
            <textarea
              className="sk-repost-comment"
              placeholder="Ajouter un commentaire (optionnel)…"
              maxLength={300}
              value={repostComment}
              onChange={(e) => setRepostComment(e.target.value)}
              rows={3}
            />
            <div className="sk-repost-preview">
              <div className="sk-repost-preview-header">
                <strong>{repostTarget.author.profile?.displayName ?? 'Utilisateur'}</strong>
                <span className="sk-repost-preview-handle">
                  @{repostTarget.author.profile?.username ?? repostTarget.author.id.slice(0, 8)}
                </span>
              </div>
              <p className="sk-repost-preview-text">
                {repostTarget.text.length > 120 ? repostTarget.text.slice(0, 120) + '…' : repostTarget.text}
              </p>
              {repostTarget.mediaUrls.length > 0 && (
                <img
                  className="sk-repost-preview-thumb"
                  src={resolveMediaUrl(repostTarget.mediaUrls[0])}
                  alt=""
                  loading="lazy"
                />
              )}
            </div>
            <button
              type="button"
              className="sk-repost-confirm"
              onClick={handleConfirmRepost}
              disabled={reposting}
              aria-busy={reposting}
            >
              {reposting ? '⏳ Repost en cours…' : '🔄 Reposter'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ DELETE CONFIRM MODAL ═══ */}
      {deleteConfirmPostId && (
        <div className="sk-delete-overlay" onClick={cancelDelete} role="dialog" aria-modal="true" aria-label="Confirmer la suppression">
          <div className="sk-delete-modal glass-container" onClick={(e) => e.stopPropagation()}>
            {deleteSuccess ? (
              <div className="sk-delete-success">
                <span className="sk-delete-success-icon" aria-hidden="true">✓</span>
                <p>Publication supprimée</p>
              </div>
            ) : (
              <>
                <div className="sk-delete-icon" aria-hidden="true">🗑️</div>
                <h3 className="sk-delete-title">Supprimer cette publication ?</h3>
                <p className="sk-delete-desc">Cette action est irréversible. La publication sera définitivement retirée.</p>
                {deleteError && <p className="sk-delete-error" role="alert">{deleteError}</p>}
                <div className="sk-delete-actions">
                  <button type="button" className="sk-btn sk-btn--outline sk-delete-cancel" onClick={cancelDelete} disabled={Boolean(deletingPostId)}>Annuler</button>
                  <button type="button" className="sk-btn sk-delete-confirm" onClick={() => void confirmDeletePost()} disabled={Boolean(deletingPostId)}>
                    {deletingPostId ? 'Suppression…' : 'Supprimer'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ SCORING DRAWER ═══ */}
      {scoringDrawerPostId && (
        <ScoringDrawer
          data={scoringData}
          loading={scoringLoading}
          onClose={() => { setScoringDrawerPostId(null); setScoringData(null); }}
        />
      )}
    </>
  );
}
