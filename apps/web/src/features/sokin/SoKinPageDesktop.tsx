import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatPriceLabelToCdf } from '../../utils/currency';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { useMarketPreference } from '../../app/providers/MarketPreferenceProvider';
import { getDashboardPath } from '../../utils/role-routing';
import { prepareMediaUrl, prepareMediaUrls } from '../../utils/media-upload';
import { useScrollRestore } from '../../utils/useScrollRestore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSocket } from '../../hooks/useSocket';
import { listings as listingsApi, orders as ordersApi, sokin as sokinApi, resolveMediaUrl, type MyListing, type SoKinApiFeedPost, type SoKinStory } from '../../lib/api-client';
import type { SoKinReactionType as ApiReactionType } from '../../lib/api-client';
import { useHoverPopup, ProfileHoverPopup, ArticleHoverPopup, type ProfileHoverData, type ArticleHoverData } from '../../components/HoverPopup';
import './sokin-desktop.css';
import { AdBanner } from '../../components/AdBanner';
import { SeoMeta } from '../../components/SeoMeta';
import {
  SOKIN_ANALYTICS_FALLBACK,
  SOKIN_SUGGESTIONS,
  SOKIN_TRENDS,
  SOKIN_TRENDING_CATEGORIES,
  SOKIN_VIRAL_POSTS,
  type SoKinPost,
} from './sokin-data';
import type { SoKinReactionType } from './sokin-data';

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

type StoryVisibility = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' | 'CLIENTS';

const PRODUCT_TAG_PREFIX = '__product__';

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

function formatRelativeTime(iso: string, t: (k: string) => string, formatDate: (isoDate: string | Date) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('msg.justNow');
  if (mins < 60) return `${mins} ${t('msg.minuteShort')}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} j`;
  return formatDate(iso);
}

function formatStoryAge(iso: string, t: (k: string) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diff / 60_000));
  if (mins < 60) return `${mins} ${t('msg.minuteShort')}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  return `${Math.floor(hrs / 24)} j`;
}

function extractLinkedProduct(tags: string[] | undefined) {
  if (!tags || tags.length === 0) return null;
  const get = (key: string) => tags.find((tag) => tag.startsWith(`${PRODUCT_TAG_PREFIX}${key}:`))?.slice(`${PRODUCT_TAG_PREFIX}${key}:`.length);
  const id = get('id');
  const title = get('title');
  if (!id || !title) return null;
  const price = get('price');
  const city = get('city');
  const type = get('type');
  return {
    id,
    title,
    price,
    city,
    type,
  };
}

function buildProductTags(listing: MyListing | null): string[] {
  if (!listing) return [];
  return [
    `${PRODUCT_TAG_PREFIX}id:${listing.id}`,
    `${PRODUCT_TAG_PREFIX}title:${listing.title}`,
    `${PRODUCT_TAG_PREFIX}price:${listing.priceUsdCents}`,
    `${PRODUCT_TAG_PREFIX}city:${listing.city}`,
    `${PRODUCT_TAG_PREFIX}type:${listing.type}`,
  ];
}

function mapApiFeedPost(
  p: SoKinApiFeedPost,
  t: (k: string) => string,
  formatDate: (isoDate: string | Date) => string,
  formatMoneyFromUsdCents: (usdCents: number) => string
): SoKinPost {
  const username = p.author.profile?.username;
  const displayName = p.author.profile?.displayName ?? t('home.defaultUser');
  const shortId = p.authorId.slice(0, 8);
  const linkedProduct = extractLinkedProduct(p.tags);
  return {
    id: p.id,
    author: {
      name: displayName,
      handle: username ? `@${username}` : `@${shortId}`,
      avatarUrl: resolveMediaUrl(p.author.profile?.avatarUrl) || '',
      kinId: username ? `#${username}` : `#${shortId}`,
      city: p.author.profile?.city ?? 'Kinshasa',
      isPrivate: false,
    },
    text: p.text,
    timestampLabel: formatRelativeTime(p.createdAt, t, formatDate),
    visibility: 'PUBLIC',
    sponsored: false,
    media: p.mediaUrls.map((src) => ({ kind: 'image' as const, src: resolveMediaUrl(src), label: '' })),
    linkedCard: linkedProduct
      ? {
          kind: linkedProduct.type === 'SERVICE' ? 'service' : 'product',
          title: linkedProduct.title,
          subtitle: linkedProduct.city ?? 'Kinshasa',
          priceLabel: linkedProduct.price ? formatMoneyFromUsdCents(Number(linkedProduct.price) || 0) : undefined,
          actionLabel: 'Voir',
          href: `/explorer?q=${encodeURIComponent(linkedProduct.title)}`,
        }
      : undefined,
    likes: p.likes,
    reactionCounts: (p.reactionCounts ?? {}) as Partial<Record<SoKinReactionType, number>>,
    myReaction: (p.myReaction ?? null) as SoKinReactionType | null,
    comments: p.comments,
    shares: p.shares,
    thread: [],
  };
}

export function SoKinPageDesktop() {
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const composerSectionRef = useRef<HTMLElement | null>(null);
  const feedBoxRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const notifBtnRef = useRef<HTMLDivElement | null>(null);
  const storyPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const storySelfieInputRef = useRef<HTMLInputElement | null>(null);
  const storyVideoInputRef = useRef<HTMLInputElement | null>(null);
  const storyGalleryInputRef = useRef<HTMLInputElement | null>(null);
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
  const [reactionPickerPostId, setReactionPickerPostId] = useState<string | null>(null);
  const [reactionBusy, setReactionBusy] = useState<string | null>(null);
  const [shareBusyPostId, setShareBusyPostId] = useState<string | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const [stories, setStories] = useState<Awaited<ReturnType<typeof sokinApi.stories>>["stories"]>([]);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [storyViewerPaused, setStoryViewerPaused] = useState(false);
  const [showStoryComposer, setShowStoryComposer] = useState(false);
  const [storyText, setStoryText] = useState('');
  const [storyBgColor, setStoryBgColor] = useState('#241752');
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [storyPreviewUrl, setStoryPreviewUrl] = useState<string | null>(null);
  const [storyVisibility, setStoryVisibility] = useState<StoryVisibility>('PUBLIC');
  const [storyAllowReplies, setStoryAllowReplies] = useState(true);
  const [storyAllowReactions, setStoryAllowReactions] = useState(true);
  const [storyProductName, setStoryProductName] = useState('');
  const [storyEnableProductCta, setStoryEnableProductCta] = useState(false);
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [loadingMyListings, setLoadingMyListings] = useState(false);
  const [selectedPostListingId, setSelectedPostListingId] = useState('');
  const [selectedStoryListingId, setSelectedStoryListingId] = useState('');
  const storyTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, user, logout } = useAuth();
  const { t, formatDate, formatMoneyFromUsdCents } = useLocaleCurrency();
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const defaultCity = getCountryConfig(effectiveCountry).defaultCity;
  const { on, off } = useSocket();
  const isMobile = useIsMobile();
  const dashboardPath = getDashboardPath(user?.role);
  const sharedPostId = useMemo(() => new URLSearchParams(location.search).get('post')?.trim() || null, [location.search]);
  const profileHover = useHoverPopup<ProfileHoverData>();
  const articleHover = useHoverPopup<ArticleHoverData>();
  useScrollRestore();

  const loadPublicFeed = useCallback(async () => {
    try {
      const data = await sokinApi.publicFeed({ limit: sharedPostId ? 50 : 20, city: defaultCity, country: effectiveCountry });
      setPosts(data.posts.map((post) => mapApiFeedPost(post, t, formatDate, formatMoneyFromUsdCents)));
    } catch {
      // Fil vide si l'API est indisponible
    }
  }, [defaultCity, effectiveCountry, sharedPostId, t, formatDate, formatMoneyFromUsdCents]);

  const loadStories = useCallback(async () => {
    try {
      const data = await sokinApi.stories();
      setStories(data.stories);
    } catch {
      setStories([]);
    }
  }, []);

  const loadSokinNotifications = useCallback(async () => {
    if (!isLoggedIn) {
      setSokinNotifications([]);
      return;
    }

    const notifs: SoKinNotification[] = [];
    try {
      const [buyerData, sellerData] = await Promise.all([
        ordersApi.buyerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
        ordersApi.sellerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
      ]);
      if (buyerData) {
        for (const o of buyerData.orders) {
          const statusLabel = o.status === 'SHIPPED' ? t('nav.shipped') : o.status === 'CONFIRMED' ? t('nav.confirmed') : t('nav.inProgress');
          notifs.push({
            id: `buy-${o.id}`,
            label: `${t('nav.orderStatus')} ${statusLabel}`,
            detail: `#${o.id.slice(0, 8).toUpperCase()} — ${o.itemsCount} ${o.itemsCount > 1 ? t('nav.articles') : t('nav.article')}`,
            href: dashboardPath,
            icon: '📦',
            time: formatDate(o.createdAt),
          });
        }
      }
      if (sellerData) {
        for (const o of sellerData.orders) {
          notifs.push({
            id: `sell-${o.id}`,
            label: t('nav.newOrderReceived'),
            detail: `#${o.id.slice(0, 8).toUpperCase()} de ${o.buyer.displayName}`,
            href: dashboardPath,
            icon: '🛒',
            time: formatDate(o.createdAt),
          });
        }
      }
    } catch {
      // ignore
    }
    setSokinNotifications(notifs);
  }, [isLoggedIn, dashboardPath, t, formatDate]);

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
    void loadPublicFeed();
  }, [loadPublicFeed]);

  useEffect(() => {
    void loadStories();
    const timer = setInterval(loadStories, 45_000);
    return () => {
      clearInterval(timer);
    };
  }, [loadStories]);

  useEffect(() => {
    const handlePostCreated = (payload: {
      type: 'SOKIN_POST_CREATED';
      postId: string;
      authorId: string;
      createdAt: string;
      sourceUserId: string;
    }) => {
      if (payload.sourceUserId === user?.id) return;
      void loadPublicFeed();
    };

    const handleStoryCreated = (payload: {
      type: 'SOKIN_STORY_CREATED';
      storyId: string;
      authorId: string;
      createdAt: string;
      sourceUserId: string;
    }) => {
      if (payload.sourceUserId === user?.id) return;
      void loadStories();
    };

    const handlePostShared = (payload: {
      type: 'SOKIN_POST_SHARED';
      postId: string;
      shares: number;
      sourceUserId: string;
      updatedAt: string;
    }) => {
      setPosts((prev) => prev.map((post) => (post.id === payload.postId ? { ...post, shares: payload.shares } : post)));
    };

    on('sokin:post-created', handlePostCreated);
    on('sokin:story-created', handleStoryCreated);
    on('sokin:post-shared', handlePostShared);

    return () => {
      off('sokin:post-created', handlePostCreated);
      off('sokin:story-created', handleStoryCreated);
      off('sokin:post-shared', handlePostShared);
    };
  }, [on, off, user?.id, loadPublicFeed, loadStories]);

  useEffect(() => {
    if (!sharedPostId || posts.length === 0) return;

    const target = document.getElementById(`sokin-post-${sharedPostId}`);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedPostId(sharedPostId);

    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedPostId((current) => (current === sharedPostId ? null : current));
      highlightTimeoutRef.current = null;
    }, 4200);
  }, [sharedPostId, posts]);

  useEffect(() => {
    if (!sharedPostId) return;
    if (posts.some((post) => post.id === sharedPostId)) return;

    let cancelled = false;
    const loadSharedPost = async () => {
      try {
        const data = await sokinApi.publicPost(sharedPostId);
        if (cancelled) return;
        setPosts((prev) => {
          if (prev.some((post) => post.id === sharedPostId)) {
            return prev;
          }
          return [mapApiFeedPost(data.post, t, formatDate, formatMoneyFromUsdCents), ...prev];
        });
      } catch {
        // Ignore si le post n'est plus public ou a disparu.
      }
    };

    void loadSharedPost();
    return () => {
      cancelled = true;
    };
  }, [sharedPostId, posts, t, formatDate, formatMoneyFromUsdCents]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
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
    void loadSokinNotifications();
  }, [loadSokinNotifications]);

  useEffect(() => {
    const handleOrderChanged = () => {
      void loadSokinNotifications();
    };

    const handleNegotiationChanged = () => {
      void loadSokinNotifications();
    };

    on('order:status-updated', handleOrderChanged);
    on('order:delivery-confirmed', handleOrderChanged);
    on('negotiation:updated', handleNegotiationChanged);

    return () => {
      off('order:status-updated', handleOrderChanged);
      off('order:delivery-confirmed', handleOrderChanged);
      off('negotiation:updated', handleNegotiationChanged);
    };
  }, [on, off, loadSokinNotifications]);

  useEffect(() => {
    if (!isLoggedIn) {
      setMyListings([]);
      setSelectedPostListingId('');
      setSelectedStoryListingId('');
      return;
    }
    let cancelled = false;
    const loadMyListings = async () => {
      setLoadingMyListings(true);
      try {
        const data = await listingsApi.mine({ status: 'ACTIVE', page: 1, limit: 100 });
        if (cancelled) return;
        setMyListings(data.listings ?? []);
      } catch {
        if (!cancelled) setMyListings([]);
      } finally {
        if (!cancelled) setLoadingMyListings(false);
      }
    };
    void loadMyListings();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!storyFile) {
      setStoryPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(storyFile);
    setStoryPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [storyFile]);

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
      const selectedListing = myListings.find((listing) => listing.id === selectedPostListingId) ?? null;
      const productTags = buildProductTags(selectedListing);
      const productLine = selectedListing ? `\n\n🛒 ${selectedListing.title} · ${formatMoneyFromUsdCents(selectedListing.priceUsdCents)}` : '';
      const mediaUrls = composerMediaFiles.length > 0
        ? await prepareMediaUrls(composerMediaFiles)
        : undefined;
      const newPost = await sokinApi.createPost({
        text: `${text}${productLine}`,
        mediaUrls,
        location: composerLocation || undefined,
        tags: [...composerTags, ...productTags].length > 0 ? [...composerTags, ...productTags] : undefined,
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
        reactionCounts: {},
        myReaction: null,
      }, t, formatDate, formatMoneyFromUsdCents);
      setPosts((prev) => [mapped, ...prev]);
      /* Reset composer */
      setComposerText('');
      setComposerLocation('');
      setComposerTags([]);
      setComposerHashtags([]);
      setComposerMediaFiles([]);
      setSelectedPostListingId('');
      setShowPreviewPopup(false);
    } catch {
      // Erreur : l'utilisateur peut réessayer
    } finally {
      setIsPublishing(false);
    }
  };

  const handleReaction = async (postId: string, type: SoKinReactionType) => {
    if (!isLoggedIn || reactionBusy === postId) return;
    setReactionBusy(postId);
    setReactionPickerPostId(null);
    try {
      setPosts((prev) => prev.map((p) => {
        if (p.id !== postId) return p;
        const prevCounts = { ...p.reactionCounts };
        const prevMine = p.myReaction;
        if (prevMine) {
          prevCounts[prevMine] = Math.max(0, (prevCounts[prevMine] ?? 1) - 1);
          if (prevCounts[prevMine] === 0) delete prevCounts[prevMine];
        }
        if (prevMine === type) {
          return { ...p, reactionCounts: prevCounts, myReaction: null, likes: Math.max(0, p.likes - 1) };
        }
        prevCounts[type] = (prevCounts[type] ?? 0) + 1;
        return { ...p, reactionCounts: prevCounts, myReaction: type, likes: (prevMine ? p.likes : p.likes + 1) };
      }));
      const currentPost = posts.find((p) => p.id === postId);
      if (currentPost?.myReaction === type) {
        await sokinApi.unreactToPost(postId);
      } else {
        await sokinApi.reactToPost(postId, type as ApiReactionType);
      }
    } catch {
      const data = await sokinApi.publicFeed({ limit: 20, city: defaultCity, country: effectiveCountry }).catch(() => null);
      if (data) setPosts(data.posts.map((post) => mapApiFeedPost(post, t, formatDate, formatMoneyFromUsdCents)));
    } finally {
      setReactionBusy(null);
    }
  };

  const handleOpenStory = async (index: number) => {
    const story = stories[index];
    if (!story) return;
    setStoryViewerIndex(index);
    setStoryViewerOpen(true);
    if (isLoggedIn && !story.viewedByMe) {
      void sokinApi.viewStory(story.id).catch(() => {});
      setStories((prev) => prev.map((s) => (s.id === story.id ? { ...s, viewedByMe: true, viewCount: s.viewCount + 1 } : s)));
    }
  };

  const handleCreateStory = async () => {
    if (!isLoggedIn) return;
    const text = storyText.trim();
    if (!text && !storyFile) return;
    try {
      const selectedListing = myListings.find((listing) => listing.id === selectedStoryListingId) ?? null;
      const mediaUrl = storyFile ? await prepareMediaUrl(storyFile) : undefined;
      const mediaType = storyFile ? (storyFile.type.startsWith('video/') ? 'VIDEO' : 'IMAGE') : 'TEXT';
      const effectiveProductName = selectedListing?.title || storyProductName.trim();
      const caption = [
        text,
        storyEnableProductCta && effectiveProductName
          ? `🛒 ${effectiveProductName}${selectedListing ? ` · ${formatMoneyFromUsdCents(selectedListing.priceUsdCents)}` : ''}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
      const created = await sokinApi.createStory({
        mediaUrl,
        mediaType,
        caption: caption || undefined,
        bgColor: mediaType === 'TEXT' ? storyBgColor : undefined,
      });
      setStories((prev) => [created, ...prev]);
      setShowStoryComposer(false);
      setStoryText('');
      setStoryFile(null);
      setStoryVisibility('PUBLIC');
      setStoryAllowReplies(true);
      setStoryAllowReactions(true);
      setStoryProductName('');
      setSelectedStoryListingId('');
      setStoryEnableProductCta(false);
    } catch {
      // Ignore - l'utilisateur peut réessayer
    }
  };

  const handleSharePost = async (postId: string) => {
    if (!isLoggedIn || shareBusyPostId === postId) return;

    const currentShareCount = posts.find((post) => post.id === postId)?.shares ?? 0;
    setShareBusyPostId(postId);
    setPosts((prev) => prev.map((post) => (post.id === postId ? { ...post, shares: post.shares + 1 } : post)));

    const shareUrl = `${window.location.origin}/sokin?post=${encodeURIComponent(postId)}`;
    const currentPost = posts.find((post) => post.id === postId);
    const shareData = {
      title: 'So-Kin',
      text: currentPost?.text?.trim().slice(0, 120) || 'Regarde cette publication sur So-Kin',
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }

      const result = await sokinApi.sharePost(postId);
      setPosts((prev) => prev.map((post) => (post.id === postId ? { ...post, shares: result.shares } : post)));
    } catch {
      setPosts((prev) => prev.map((post) => (post.id === postId ? { ...post, shares: currentShareCount } : post)));
    } finally {
      setShareBusyPostId(null);
    }
  };

  const currentStory = storyViewerOpen ? stories[storyViewerIndex] : null;

  useEffect(() => {
    if (!storyViewerOpen || !currentStory || currentStory.mediaType === 'VIDEO' || storyViewerPaused) {
      return;
    }
    const timer = window.setTimeout(() => {
      setStoryViewerIndex((prev) => {
        if (prev >= stories.length - 1) {
          setStoryViewerOpen(false);
          return prev;
        }
        return prev + 1;
      });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [currentStory, storyViewerOpen, storyViewerPaused, stories.length]);

  const openStoryCapture = (mode: 'photo' | 'selfie' | 'video' | 'gallery') => {
    setShowStoryComposer(true);
    const map = {
      photo: storyPhotoInputRef,
      selfie: storySelfieInputRef,
      video: storyVideoInputRef,
      gallery: storyGalleryInputRef,
    };
    window.setTimeout(() => map[mode].current?.click(), 30);
  };

  const currentUserName = user?.profile.displayName ?? 'Vous';
  const currentUserAvatar = resolveMediaUrl(user?.profile.avatarUrl) || '';
  const selectedPostListing = myListings.find((listing) => listing.id === selectedPostListingId) ?? null;
  const selectedStoryListing = myListings.find((listing) => listing.id === selectedStoryListingId) ?? null;

  const waveCards = stories.slice(0, 12);

  const renderWaveCard = (story: SoKinStory, index: number) => {
    const authorName = story.author.profile?.displayName ?? 'Utilisateur';
    const hasMedia = Boolean(story.mediaUrl);
    return (
      <button
        key={story.id}
        type="button"
        className={`sokin-wave-card${story.viewedByMe ? ' viewed' : ''}`}
        onClick={() => void handleOpenStory(index)}
      >
        <div
          className="sokin-wave-card-media"
          style={hasMedia ? { backgroundImage: `linear-gradient(180deg, rgba(10, 8, 24, 0.05), rgba(10, 8, 24, 0.86)), url(${resolveMediaUrl(story.mediaUrl)})` } : { background: story.bgColor ?? 'linear-gradient(145deg, rgba(111, 88, 255, 0.85), rgba(36, 23, 82, 0.96))' }}
        >
          <span className="sokin-wave-card-badge">Wave</span>
          <span className="sokin-wave-card-time">{formatStoryAge(story.createdAt, t)}</span>
          <span className="sokin-wave-card-avatar-wrap">
            {story.author.profile?.avatarUrl ? (
              <img src={resolveMediaUrl(story.author.profile.avatarUrl)} alt={authorName} className="sokin-wave-card-avatar" />
            ) : (
              <span className="sokin-wave-card-avatar sokin-wave-card-avatar-fallback">👤</span>
            )}
          </span>
          <div className="sokin-wave-card-copy">
            <strong>{authorName}</strong>
            <span>{story.caption?.trim() ? story.caption.slice(0, 48) : 'Ouvrir la Wave'}</span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <>
      <SeoMeta
        title="So-Kin — Le réseau social de Kinshasa"
        description="Partagez vos actualités, suivez vos contacts et découvrez les lives et tendances sur So-Kin, le réseau social de Kin-Sell."
        canonical="https://kin-sell.com/so-kin"
      />
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
                  <img src={resolveMediaUrl(user.profile.avatarUrl)} alt={t('sokin.myAccount')} className="sokin-top-avatar" />
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
                          void logout().then(() => navigate('/login'));
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

        <section className="sokin-composer" aria-label={t('sokin.createPost')} ref={composerSectionRef}>
          <div className="sokin-composer-head">
            <div className="sokin-composer-headline">
              <span className="sokin-composer-kicker">Studio So-Kin</span>
              <h2>{t('sokin.compose')}</h2>
              <p>Un seul flux pour publier un post, préparer une Wave, ajouter un produit et visualiser le rendu avant diffusion.</p>
            </div>
            <div className="sokin-composer-head-actions">
              <button className="sokin-quick-btn" type="button" onClick={() => isLoggedIn ? setShowStoryComposer(true) : navigate('/login')} disabled={isPublishing}>
                Wave rapide
              </button>
              <button className="sokin-quick-btn" type="button" onClick={() => setShowPreviewPopup(true)} disabled={!isLoggedIn || isPublishing || composerText.trim().length === 0}>
                Aperçu live
              </button>
            </div>
          </div>

          <div className="sokin-composer-surface">
            <div className="sokin-composer-author-pill">
              {currentUserAvatar ? <img src={currentUserAvatar} alt={currentUserName} className="sokin-composer-author-avatar" /> : <span className="sokin-composer-author-avatar sokin-composer-author-avatar-fallback">👤</span>}
              <div>
                <strong>{currentUserName}</strong>
                <span>Feed public Kinshasa, publication rapide, CTA produit prêt.</span>
              </div>
            </div>

            <textarea
              className="sokin-composer-input"
              placeholder={t('sokin.placeholder')}
              rows={5}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              disabled={!isLoggedIn || isPublishing}
            />
          </div>

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

          {selectedPostListing ? (
            <div className="sokin-linked-card" aria-label="Produit relié à la publication">
              <div className="sokin-linked-meta">
                <span className="sokin-linked-kind">{selectedPostListing.type === 'SERVICE' ? 'Service' : 'Produit'}</span>
                <h3>{selectedPostListing.title}</h3>
                <p>{selectedPostListing.city}</p>
                <strong>{formatMoneyFromUsdCents(selectedPostListing.priceUsdCents)}</strong>
              </div>
              <button type="button" className="sokin-linked-action" onClick={() => navigate(`/explorer?q=${encodeURIComponent(selectedPostListing.title)}`)}>
                Voir produit
              </button>
            </div>
          ) : null}

          <div className="sokin-composer-actions">
            <button
              className="sokin-quick-btn"
              type="button"
              onClick={() => setShowMediaPopup(true)}
              disabled={!isLoggedIn || isPublishing}
            >
              Média
            </button>

            <button
              className="sokin-quick-btn"
              type="button"
              onClick={() => setShowEditorPopup(true)}
              disabled={!isLoggedIn || isPublishing}
            >
              Éditer
            </button>

            <button
              className="sokin-quick-btn"
              type="button"
              onClick={() => isLoggedIn ? setShowStoryComposer(true) : navigate('/login')}
              disabled={!isLoggedIn || isPublishing}
            >
              Publier en Wave
            </button>

            <button
              className="sokin-secondary-btn"
              type="button"
              onClick={() => setShowPreviewPopup(true)}
              disabled={!isLoggedIn || isPublishing || composerText.trim().length === 0}
            >
              Aperçu
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
              <p className="sokin-modal-intro">Prépare un carousel social ou une publication plus commerce avec visuels, vidéo et ordre de lecture clair.</p>
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
              <h3>Édition du contenu</h3>
              <p className="sokin-modal-intro">Structure ta publication avec localisation, tags, hashtags et signal commercial réutilisable dans le feed.</p>
              
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

              <label>Produit Kin-Sell (🛒)</label>
              <select value={selectedPostListingId} onChange={(e) => setSelectedPostListingId(e.target.value)}>
                <option value="">Aucun produit lié</option>
                {myListings.map((listing) => (
                  <option key={listing.id} value={listing.id}>{listing.title} · {formatMoneyFromUsdCents(listing.priceUsdCents)}</option>
                ))}
              </select>
              {loadingMyListings ? <p className="sokin-modal-intro">Chargement de vos produits…</p> : null}

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
              <p className="sokin-modal-intro">Vérifie le rendu avant diffusion dans le feed. La version Wave se prépare depuis le bouton dédié.</p>
              
              <article className="sokin-preview-post" style={{ borderRadius: '18px', padding: '18px', background: 'rgba(35, 24, 72, 0.4)' }}>
                <header style={{ marginBottom: '12px' }}>
                  <img src={resolveMediaUrl(user?.profile.avatarUrl || '')} alt={user?.profile.displayName} style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
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

              <div className="sokin-popup-confirm-row" style={{ marginTop: '16px' }}>
                <button type="button" onClick={() => setShowPreviewPopup(false)}>Modifier</button>
                <button type="button" onClick={() => { handlePost(); }}>✔ Confirmer et publier</button>
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
            <article key={post.id} id={`sokin-post-${post.id}`} className={`sokin-post${post.sponsored ? ' sponsored' : ''}${highlightedPostId === post.id ? ' sokin-post--highlighted' : ''}`}>
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
                {/* ── Reaction picker style Facebook ── */}
                <div className="sokin-reaction-wrap" onMouseLeave={() => setReactionPickerPostId(null)}>
                  <button
                    className={`sokin-action-btn sokin-action-btn--react${post.myReaction ? ' sokin-action-btn--reacted' : ''}`}
                    type="button"
                    aria-label="Réagir"
                    onMouseEnter={() => setReactionPickerPostId(post.id)}
                    onClick={() => handleReaction(post.id, post.myReaction ?? 'LIKE')}
                  >
                    {post.myReaction === 'LOVE' ? '❤️' : post.myReaction === 'HAHA' ? '😂' : post.myReaction === 'WOW' ? '😮' : post.myReaction === 'SAD' ? '😢' : post.myReaction === 'ANGRY' ? '😡' : '👍'}
                    {' '}{post.likes > 0 ? post.likes : ''}
                  </button>
                  {reactionPickerPostId === post.id && (
                    <div className="sokin-reaction-picker" role="toolbar" aria-label="Choisir une réaction">
                      {(['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY'] as const).map((type) => {
                        const emoji = type === 'LIKE' ? '👍' : type === 'LOVE' ? '❤️' : type === 'HAHA' ? '😂' : type === 'WOW' ? '😮' : type === 'SAD' ? '😢' : '😡';
                        const label = type === 'LIKE' ? 'J\'aime' : type === 'LOVE' ? 'J\'adore' : type === 'HAHA' ? 'Haha' : type === 'WOW' ? 'Wow' : type === 'SAD' ? 'Triste' : 'En colère';
                        return (
                          <button
                            key={type}
                            className={`sokin-reaction-btn${post.myReaction === type ? ' sokin-reaction-btn--active' : ''}`}
                            type="button"
                            title={label}
                            onClick={() => handleReaction(post.id, type)}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  className="sokin-action-btn"
                  type="button"
                  aria-label="Commentaires"
                  onClick={() => openCommentsModal(post)}
                >
                  💬 {post.comments}
                </button>
                <button
                  className="sokin-action-btn"
                  type="button"
                  aria-label="Partages"
                  onClick={() => void handleSharePost(post.id)}
                  disabled={shareBusyPostId === post.id}
                >
                  🔁 {post.shares}
                </button>
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

      <input ref={storyPhotoInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setStoryFile(e.target.files?.[0] ?? null)} />
      <input ref={storySelfieInputRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => setStoryFile(e.target.files?.[0] ?? null)} />
      <input ref={storyVideoInputRef} type="file" accept="video/*" capture="environment" hidden onChange={(e) => setStoryFile(e.target.files?.[0] ?? null)} />
      <input ref={storyGalleryInputRef} type="file" accept="image/*,video/*" hidden onChange={(e) => setStoryFile(e.target.files?.[0] ?? null)} />

      {showStoryComposer ? (
        <div className="sokin-story-modal" onClick={() => setShowStoryComposer(false)}>
          <div className="sokin-story-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sokin-wave-composer-head">
              <div>
                <span className="sokin-composer-kicker">Wave Studio</span>
                <h3>Créer une Wave</h3>
              </div>
              <button type="button" className="sokin-modal-close" onClick={() => setShowStoryComposer(false)}>✕</button>
            </div>

            <div className="sokin-wave-capture-grid">
              <button type="button" className="sokin-wave-capture-btn" onClick={() => openStoryCapture('photo')}>📷 Photo</button>
              <button type="button" className="sokin-wave-capture-btn" onClick={() => openStoryCapture('video')}>🎥 Vidéo</button>
              <button type="button" className="sokin-wave-capture-btn" onClick={() => openStoryCapture('gallery')}>🖼️ Galerie</button>
              <button type="button" className="sokin-wave-capture-btn" onClick={() => openStoryCapture('selfie')}>🔄 Selfie</button>
            </div>

            <div className="sokin-wave-composer-layout">
              <div className="sokin-wave-composer-preview" style={!storyPreviewUrl ? { background: storyBgColor } : undefined}>
                {storyPreviewUrl ? (
                  storyFile?.type.startsWith('video/') ? <video src={storyPreviewUrl} autoPlay muted loop controls /> : <img src={storyPreviewUrl} alt="Aperçu Wave" />
                ) : (
                  <div className="sokin-wave-composer-placeholder">
                    <strong>Caméra instantanée</strong>
                    <span>Photo au tap, vidéo au choix, galerie et selfie disponibles selon l’appareil.</span>
                  </div>
                )}
                {storyText.trim() ? <p className="sokin-wave-composer-caption">{storyText}</p> : null}
              </div>

              <div className="sokin-wave-composer-form">
                <textarea value={storyText} onChange={(e) => setStoryText(e.target.value)} placeholder="Quoi montrer, vendre ou annoncer ?" maxLength={180} />

                {!storyFile ? (
                  <label className="sokin-wave-color-field">
                    <span>Couleur de fond</span>
                    <input type="color" value={storyBgColor} onChange={(e) => setStoryBgColor(e.target.value)} />
                  </label>
                ) : null}

                <label>
                  <span>Produit à mettre en avant</span>
                  <input type="text" value={storyProductName} onChange={(e) => setStoryProductName(e.target.value)} placeholder="Nom du produit ou offre" />
                </label>

                <label>
                  <span>Visibilité</span>
                  <select value={storyVisibility} onChange={(e) => setStoryVisibility(e.target.value as StoryVisibility)}>
                    <option value="PUBLIC">Public</option>
                    <option value="FOLLOWERS">Abonnés</option>
                    <option value="PRIVATE">Privé</option>
                    <option value="CLIENTS">Clients uniquement</option>
                  </select>
                </label>

                <div className="sokin-wave-toggle-list">
                  <label><input type="checkbox" checked={storyAllowReplies} onChange={(e) => setStoryAllowReplies(e.target.checked)} /> Réponses autorisées</label>
                  <label><input type="checkbox" checked={storyAllowReactions} onChange={(e) => setStoryAllowReactions(e.target.checked)} /> Réactions actives</label>
                  <label><input type="checkbox" checked={storyEnableProductCta} onChange={(e) => setStoryEnableProductCta(e.target.checked)} /> Bouton Voir produit</label>
                </div>

                <label>
                  <span>Produit Kin-Sell (réel)</span>
                  <select value={selectedStoryListingId} onChange={(e) => {
                    setSelectedStoryListingId(e.target.value);
                    const picked = myListings.find((listing) => listing.id === e.target.value);
                    if (picked) setStoryProductName(picked.title);
                  }}>
                    <option value="">Aucun produit lié</option>
                    {myListings.map((listing) => (
                      <option key={listing.id} value={listing.id}>{listing.title} · {formatMoneyFromUsdCents(listing.priceUsdCents)}</option>
                    ))}
                  </select>
                </label>

                <div className="sokin-wave-meta-preview">
                  <span>24h</span>
                  <span>{storyVisibility === 'CLIENTS' ? 'Clients seulement' : storyVisibility === 'FOLLOWERS' ? 'Abonnés' : storyVisibility === 'PRIVATE' ? 'Privé' : 'Public'}</span>
                  {storyEnableProductCta && (selectedStoryListing?.title || storyProductName.trim()) ? <span>🛒 {selectedStoryListing?.title || storyProductName.trim()}</span> : null}
                </div>
              </div>
            </div>

            <div className="sokin-story-modal-actions">
              <button type="button" onClick={() => setShowStoryComposer(false)}>Annuler</button>
              <button type="button" onClick={() => void handleCreateStory()}>Publier</button>
            </div>
          </div>
        </div>
      ) : null}

      {storyViewerOpen && currentStory ? (
        <div className="sokin-story-modal" onClick={() => setStoryViewerOpen(false)}>
          <div
            className="sokin-story-viewer"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={() => setStoryViewerPaused(true)}
            onMouseUp={() => setStoryViewerPaused(false)}
            onMouseLeave={() => setStoryViewerPaused(false)}
            onTouchStart={(e) => {
              setStoryViewerPaused(true);
              const touch = e.changedTouches[0];
              storyTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={(e) => {
              setStoryViewerPaused(false);
              const start = storyTouchStartRef.current;
              const touch = e.changedTouches[0];
              if (!start) return;
              const dx = touch.clientX - start.x;
              const dy = touch.clientY - start.y;
              if (dy > 90) {
                setStoryViewerOpen(false);
                return;
              }
              if (dx > 80) {
                setStoryViewerIndex((n) => Math.max(0, n - 1));
                return;
              }
              if (dx < -80) {
                setStoryViewerIndex((n) => Math.min(stories.length - 1, n + 1));
              }
            }}
            style={{ background: currentStory.mediaType === 'TEXT' ? (currentStory.bgColor ?? '#241752') : undefined }}
          >
            <div className="sokin-story-progress">
              {stories.map((story, index) => (
                <span key={story.id} className={`sokin-story-progress-bar${index === storyViewerIndex ? ' active' : ''}${index < storyViewerIndex ? ' done' : ''}`} />
              ))}
            </div>

            <div className="sokin-story-viewer-head">
              <div className="sokin-story-viewer-author">
                {currentStory.author.profile?.avatarUrl ? <img src={resolveMediaUrl(currentStory.author.profile.avatarUrl)} alt={currentStory.author.profile.displayName} /> : <span>👤</span>}
                <div>
                  <strong>{currentStory.author.profile?.displayName ?? 'Utilisateur'}</strong>
                  <span>{formatStoryAge(currentStory.createdAt, t)} · {currentStory.viewCount} vues</span>
                </div>
              </div>
              <button type="button" className="sokin-story-viewer-close" onClick={() => setStoryViewerOpen(false)}>✕</button>
            </div>

            <div className="sokin-story-stage">
              {currentStory.mediaType !== 'TEXT' && currentStory.mediaUrl ? (
                currentStory.mediaType === 'VIDEO' ? <video src={resolveMediaUrl(currentStory.mediaUrl)} controls autoPlay playsInline /> : <img src={resolveMediaUrl(currentStory.mediaUrl)} alt="Wave" />
              ) : (
                <div className="sokin-story-text-stage">
                  <p>{currentStory.caption ?? 'Wave textuelle'}</p>
                </div>
              )}

              <button type="button" className="sokin-story-hotspot sokin-story-hotspot--prev" disabled={storyViewerIndex <= 0} onClick={() => setStoryViewerIndex((n) => Math.max(0, n - 1))} aria-label="Wave précédente" />
              <button type="button" className="sokin-story-hotspot sokin-story-hotspot--next" disabled={storyViewerIndex >= stories.length - 1} onClick={() => setStoryViewerIndex((n) => Math.min(stories.length - 1, n + 1))} aria-label="Wave suivante" />
            </div>

            {currentStory.mediaType !== 'TEXT' && currentStory.caption ? <p>{currentStory.caption}</p> : null}

            <div className="sokin-story-nav">
              <button type="button" disabled={storyViewerIndex <= 0} onClick={() => setStoryViewerIndex((n) => Math.max(0, n - 1))}>Précédente</button>
              <button type="button" disabled={storyViewerIndex >= stories.length - 1} onClick={() => setStoryViewerIndex((n) => Math.min(stories.length - 1, n + 1))}>Suivante</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
