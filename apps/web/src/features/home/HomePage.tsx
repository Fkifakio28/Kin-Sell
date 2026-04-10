import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { getDashboardPath } from "../../utils/role-routing";
import { listings as listingsApi, orders as ordersApi, explorer as explorerApi, sokin as sokinApi, blog as blogApi, messaging, users as usersApi, resolveMediaUrl, ApiError, type PublicListing, type CartSummary, type OrderSummary, type ExplorerShopApi, type ExplorerProfileApi, type SoKinApiFeedPost, type SoKinApiComment, type PublicBlogPost } from "../../lib/api-client";
import { useHoverPopup, ArticleHoverPopup, type ArticleHoverData } from "../../components/HoverPopup";
import { useScrollRestore } from "../../utils/useScrollRestore";
import { useSocket } from "../../hooks/useSocket";
import { useMarketPreference } from "../../app/providers/MarketPreferenceProvider";
import { NegotiatePopup } from "../negotiations/NegotiatePopup";
import { useLockedCategories, isCategoryLocked } from "../../hooks/useLockedCategories";
import { AdBanner } from "../../components/AdBanner";
import { SeoMeta } from "../../components/SeoMeta";
import { HOME_PRODUCT_CATEGORIES, HOME_SERVICE_CATEGORIES } from "../../shared/constants/categories";
import { SoKinToastProvider } from "../../components/feedback/SoKinToast";
import { AnnounceCard, type MediaItem } from "../sokin/AnnounceCard";
import { MediaViewer, CommentsDrawer, type CommentProfileState, type MissingPublicProfile } from "../sokin/SoKinShared";
import "../sokin/sokin.css";
import "./home.css";

/* ════════════════════════════════════════
   DATA
   ════════════════════════════════════════ */

const LETTERS = ["K", "I", "N", "-", "S", "E", "L", "L"];

const INFO_ITEMS = [
  { titleKey: "home.aboutUs", href: "/about" },
  { titleKey: "home.terms", href: "/terms" },
  { titleKey: "home.usageTips", href: "/guide" },
  { titleKey: "home.howItWorks", href: "/how-it-works" },
  { titleKey: "home.dataProcessing", href: "/privacy" },
  { titleKey: "home.legalNotice", href: "/legal" },
  { titleKey: "home.blog", href: "/blog" },
  { titleKey: "home.faq", href: "/faq" },
  { titleKey: "home.contact", href: "/contact" },
];

const PRODUCT_CATEGORIES = HOME_PRODUCT_CATEGORIES;

const SERVICE_CATEGORIES = HOME_SERVICE_CATEGORIES;

const TIPS_KEYS = [
  "home.tip1", "home.tip2", "home.tip3", "home.tip4",
  "home.tip5", "home.tip6", "home.tip7", "home.tip8",
];



/* ════════════════════════════════════════
   COMPONENT
   ════════════════════════════════════════ */

export function HomePage() {
  const { t, formatMoneyFromUsdCents, formatPriceLabelFromUsdCents } = useLocaleCurrency();
  const lockedCats = useLockedCategories();
  const [searchQuery, setSearchQuery] = useState("");
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sokinIndex, setSokinIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [shopIndex, setShopIndex] = useState(0);
  const [sellerIndex, setSellerIndex] = useState(0);
  const [blogIndex, setBlogIndex] = useState(0);
  const [heroCatIndex, setHeroCatIndex] = useState(0);
  const [accountMenuPos, setAccountMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [liveProducts, setLiveProducts] = useState<PublicListing[]>([]);
  const [liveServices, setLiveServices] = useState<PublicListing[]>([]);
  const [isLoadingArticles, setIsLoadingArticles] = useState(true);
  const [trendingShops, setTrendingShops] = useState<ExplorerShopApi[]>([]);
  const [trendingProfiles, setTrendingProfiles] = useState<ExplorerProfileApi[]>([]);
  const [sokinFeed, setSokinFeed] = useState<SoKinApiFeedPost[]>([]);
  /* So-Kin interaction state (media viewer, comments, contact) */
  const [viewerItem, setViewerItem] = useState<MediaItem | null>(null);
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, SoKinApiComment[]>>({});
  const [loadingCommentsPostId, setLoadingCommentsPostId] = useState<string | null>(null);
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyToComment, setReplyToComment] = useState<SoKinApiComment | null>(null);
  const [commentSort, setCommentSort] = useState<'recent' | 'relevant'>('recent');
  const [commentProfileState, setCommentProfileState] = useState<CommentProfileState>({ status: 'idle', profile: null, message: null });
  const [contactingPostId, setContactingPostId] = useState<string | null>(null);
  const [blogPosts, setBlogPosts] = useState<PublicBlogPost[]>([]);
  const [buyerCart, setBuyerCart] = useState<CartSummary | null>(null);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<{ id: string; label: string; detail: string; icon: string; section: string }[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);
  const [sellerStats, setSellerStats] = useState<{ total: number; delivered: number; inProgress: number; revenue: number }>({ total: 0, delivered: 0, inProgress: 0, revenue: 0 });
  const [lastBuyerOrder, setLastBuyerOrder] = useState<OrderSummary | null>(null);
  const sokinTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  void sokinTimer; // kept for compatibility
  const { isLoggedIn, user, logout } = useAuth();
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const defaultCity = getCountryConfig(effectiveCountry).defaultCity;
  const { on, off } = useSocket();
  const navigate = useNavigate();
  const articleHover = useHoverPopup<ArticleHoverData>();
  const [negotiateListing, setNegotiateListing] = useState<PublicListing | null>(null);
  const [cardCartBusy, setCardCartBusy] = useState<string | null>(null);
  const [cardCartFeedback, setCardCartFeedback] = useState<{ id: string; msg: string } | null>(null);
  const [cardQty, setCardQty] = useState<Record<string, number>>({});
  const getQty = (id: string) => cardQty[id] ?? 1;
  const changeQty = (id: string, delta: number, e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setCardQty((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + delta) })); };
  useScrollRestore();

  /* ── So-Kin handlers (media viewer, comments, contact) ── */
  const clearCommentsComposer = useCallback(() => {
    setReplyToComment(null);
    setCommentProfileState({ status: 'idle', profile: null, message: null });
    setCommentDraft('');
  }, []);

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

  const handleOpenComments = useCallback((postId: string) => {
    setOpenCommentsPostId(postId);
    setCommentSort('recent');
    clearCommentsComposer();
    void loadComments(postId, 'recent');
  }, [clearCommentsComposer, loadComments]);

  const handleCloseComments = useCallback(() => {
    setOpenCommentsPostId(null);
    clearCommentsComposer();
  }, [clearCommentsComposer]);

  const handleCommentSortChange = useCallback((newSort: 'recent' | 'relevant') => {
    setCommentSort(newSort);
    if (openCommentsPostId) {
      void loadComments(openCommentsPostId, newSort);
    }
  }, [openCommentsPostId, loadComments]);

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
    const getErrorStatus = (error: unknown) => (error instanceof ApiError ? error.status : undefined);
    const openResolvedProfile = (username: string) => {
      setCommentProfileState({ status: 'success', profile: profilePreview, message: null });
      navigate(`/user/${username}`);
    };
    setCommentProfileState({ status: 'loading', profile: profilePreview, message: 'Chargement du profil public…' });
    const directUsername = normalizeUsername(comment.author.profile?.username);
    if (directUsername) {
      try { await usersApi.publicProfile(directUsername); openResolvedProfile(directUsername); return; }
      catch (error) { if (getErrorStatus(error) !== 404) { setCommentProfileState({ status: 'error', profile: profilePreview, message: 'Erreur technique: impossible d\'ouvrir le profil public pour le moment.' }); return; } }
    }
    try {
      const payload = (await usersApi.publicProfileById(comment.author.id)) as { username?: string | null };
      const resolved = normalizeUsername(payload?.username);
      if (resolved) { openResolvedProfile(resolved); return; }
      setCommentProfileState({ status: 'not-available', profile: profilePreview, message: 'L\'utilisateur ou l\'entreprise n\'a pas de profil public ou de boutique en ligne.' });
    } catch (error) {
      if (getErrorStatus(error) === 404) { setCommentProfileState({ status: 'not-available', profile: profilePreview, message: 'L\'utilisateur ou l\'entreprise n\'a pas de profil public ou de boutique en ligne.' }); return; }
      setCommentProfileState({ status: 'error', profile: profilePreview, message: 'Erreur technique: impossible d\'ouvrir le profil public pour le moment.' });
    }
  }, [navigate]);

  const handleSubmitComment = useCallback(async () => {
    if (!openCommentsPostId) return;
    if (!isLoggedIn) { navigate('/login'); return; }
    const content = commentDraft.trim();
    if (!content) return;
    setSubmittingCommentPostId(openCommentsPostId);
    try {
      const payload = await sokinApi.createComment(openCommentsPostId, { content, parentCommentId: replyToComment?.id });
      const created = payload.comment;
      setCommentsByPost((prev) => ({ ...prev, [openCommentsPostId]: [created, ...(prev[openCommentsPostId] ?? [])] }));
      setSokinFeed((prev) => prev.map((p) => p.id === openCommentsPostId ? { ...p, comments: (p.comments ?? 0) + 1 } : p));
      setCommentDraft('');
      setReplyToComment(null);
    } catch { /* conserver le draft */ }
    finally { setSubmittingCommentPostId((prev) => (prev === openCommentsPostId ? null : prev)); }
  }, [openCommentsPostId, isLoggedIn, navigate, commentDraft, replyToComment]);

  const handleSokinContact = useCallback(async (post: SoKinApiFeedPost) => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (!user?.id || post.author.id === user.id) return;
    if (contactingPostId) return;
    setContactingPostId(post.id);
    try {
      const { conversation } = await messaging.createDM(post.author.id);
      const mainMedia = post.mediaUrls?.[0] ? resolveMediaUrl(post.mediaUrls[0]) : null;
      const textPreview = (post.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      navigate(`/messaging/${conversation.id}`, {
        state: {
          sokinPost: {
            id: post.id, text: textPreview, mediaUrl: mainMedia,
            authorName: post.author.profile?.displayName ?? 'Utilisateur',
            authorId: post.author.id,
            authorHandle: post.author.profile?.username ?? post.author.id,
          },
        },
      });
    } catch { navigate('/messaging'); }
    finally { setContactingPostId(null); }
  }, [isLoggedIn, user?.id, contactingPostId, navigate]);

  const reloadSokinFeed = useCallback(async () => {
    try {
      const feedData = await sokinApi.publicFeed({ limit: 4 });
      setSokinFeed(feedData.posts);
      setSokinIndex(0);
    } catch {
      // ignore
    }
  }, []);

  const reloadDashOverview = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const [cart, sellerData, buyerData, buyerNotifs, sellerNotifs] = await Promise.all([
        ordersApi.buyerCart().catch(() => null),
        ordersApi.sellerOrders({ limit: 50 }).catch(() => null),
        ordersApi.buyerOrders({ limit: 1 }).catch(() => null),
        ordersApi.buyerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
        ordersApi.sellerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
      ]);
      if (cart) setBuyerCart(cart);
      const items: typeof notifItems = [];
      if (buyerNotifs) {
        for (const o of buyerNotifs.orders) {
          const sl = o.status === 'SHIPPED' ? 'Expédié' : o.status === 'CONFIRMED' ? 'Confirmé' : 'En cours';
          items.push({ id: `buy-${o.id}`, label: `Commande ${sl}`, detail: `#${o.id.slice(0, 8).toUpperCase()} — ${o.itemsCount} article${o.itemsCount > 1 ? 's' : ''}`, icon: '📦', section: 'purchases' });
        }
      }
      if (sellerNotifs) {
        for (const o of sellerNotifs.orders) {
          items.push({ id: `sell-${o.id}`, label: 'Nouvelle commande reçue', detail: `#${o.id.slice(0, 8).toUpperCase()} de ${o.buyer.displayName}`, icon: '🛒', section: 'sales' });
        }
      }
      setNotifItems(items);
      setNotificationsCount(items.length);
      if (sellerData) {
        const all = sellerData.orders;
        setSellerStats({
          total: sellerData.total,
          delivered: all.filter((o) => o.status === 'DELIVERED').length,
          inProgress: all.filter((o) => ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(o.status)).length,
          revenue: all.filter((o) => o.status === 'DELIVERED').reduce((s, o) => s + o.totalUsdCents, 0),
        });
      }
      if (buyerData && buyerData.orders.length > 0) setLastBuyerOrder(buyerData.orders[0]);
    } catch {
      // ignore
    }
  }, [isLoggedIn, notifItems]);

  // ── Fullscreen toggle ──
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  // Load real listings from API (with fallback: city+country → country only → no filter)
  useEffect(() => {
    let cancelled = false;
    const loadType = async (type: 'PRODUIT' | 'SERVICE', limit: number) => {
      // Try with city + country
      let results = await listingsApi.latest({ type, city: defaultCity, country: effectiveCountry, limit }).catch(() => []);
      if (results.length > 0) return results;
      // Fallback: country only (no city filter)
      results = await listingsApi.latest({ type, country: effectiveCountry, limit }).catch(() => []);
      if (results.length > 0) return results;
      // Fallback: no geo filter at all
      return listingsApi.latest({ type, limit }).catch(() => []);
    };
    const load = async () => {
      setIsLoadingArticles(true);
      try {
        const [products, services] = await Promise.all([
          loadType('PRODUIT', 8),
          loadType('SERVICE', 8),
        ]);
        if (!cancelled) {
          setLiveProducts(products);
          setLiveServices(services);
        }
      } catch { /* API indisponible — afficher état vide */ }
      finally { if (!cancelled) setIsLoadingArticles(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [defaultCity, effectiveCountry]);

  // Load sidebar data: trending shops, profiles, So-Kin feed
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [shopsRes, profilesRes, feedRes, blogRes] = await Promise.allSettled([
        explorerApi.shops({ limit: 3, city: defaultCity, country: effectiveCountry }),
        explorerApi.profiles({ limit: 3, city: defaultCity, country: effectiveCountry }),
        sokinApi.publicFeed({ limit: 4 }),
        blogApi.publicPosts({ limit: 3 }),
      ]);
      if (cancelled) return;
      if (shopsRes.status === 'fulfilled') setTrendingShops(shopsRes.value);
      if (profilesRes.status === 'fulfilled') setTrendingProfiles(profilesRes.value);
      if (feedRes.status === 'fulfilled') { setSokinFeed(feedRes.value.posts); setSokinIndex(0); }
      if (blogRes.status === 'fulfilled') setBlogPosts(blogRes.value.posts);
    };
    void load();
    const poll = setInterval(() => { void load(); }, 120_000); // refresh sidebar every 2min
    return () => { cancelled = true; clearInterval(poll); };
  }, [defaultCity, effectiveCountry]);

  // Load cart, seller stats, last buyer order
  useEffect(() => {
    if (!isLoggedIn) {
      setBuyerCart(null);
      setNotificationsCount(0);
      setNotifItems([]);
      setSellerStats({ total: 0, delivered: 0, inProgress: 0, revenue: 0 });
      setLastBuyerOrder(null);
      return;
    }
    let cancelled = false;
    const loadDash = async () => {
      try {
        const [cart, sellerData, buyerData, buyerNotifs, sellerNotifs] = await Promise.all([
          ordersApi.buyerCart().catch(() => null),
          ordersApi.sellerOrders({ limit: 50 }).catch(() => null),
          ordersApi.buyerOrders({ limit: 1 }).catch(() => null),
          ordersApi.buyerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
          ordersApi.sellerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
        ]);
        if (cancelled) return;
        if (cart) setBuyerCart(cart);
        // Build notification items
        const items: typeof notifItems = [];
        if (buyerNotifs) {
          for (const o of buyerNotifs.orders) {
            const sl = o.status === 'SHIPPED' ? 'Expédié' : o.status === 'CONFIRMED' ? 'Confirmé' : 'En cours';
            items.push({ id: `buy-${o.id}`, label: `Commande ${sl}`, detail: `#${o.id.slice(0, 8).toUpperCase()} — ${o.itemsCount} article${o.itemsCount > 1 ? 's' : ''}`, icon: '📦', section: 'purchases' });
          }
        }
        if (sellerNotifs) {
          for (const o of sellerNotifs.orders) {
            items.push({ id: `sell-${o.id}`, label: 'Nouvelle commande reçue', detail: `#${o.id.slice(0, 8).toUpperCase()} de ${o.buyer.displayName}`, icon: '🛒', section: 'sales' });
          }
        }
        setNotifItems(items);
        setNotificationsCount(items.length);
        if (sellerData) {
          const all = sellerData.orders;
          setSellerStats({
            total: sellerData.total,
            delivered: all.filter((o) => o.status === 'DELIVERED').length,
            inProgress: all.filter((o) => ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(o.status)).length,
            revenue: all.filter((o) => o.status === 'DELIVERED').reduce((s, o) => s + o.totalUsdCents, 0),
          });
        }
        if (buyerData && buyerData.orders.length > 0) setLastBuyerOrder(buyerData.orders[0]);
      } catch { /* ignore */ }
    };
    void loadDash();
    const poll = setInterval(() => { void loadDash(); }, 60_000); // refresh every 60s
    return () => { cancelled = true; clearInterval(poll); };
  }, [isLoggedIn]);

  useEffect(() => {
    const handlePostCreated = (_payload: {
      type: 'SOKIN_POST_CREATED';
      postId: string;
      authorId: string;
      createdAt: string;
      sourceUserId: string;
    }) => {
      void reloadSokinFeed();
    };

    const handleOrderChanged = (_payload: {
      type: 'ORDER_STATUS_UPDATED' | 'ORDER_CONFIRMATION_COMPLETED';
      orderId: string;
      status: string;
      buyerUserId: string;
      sellerUserId: string;
      sourceUserId: string;
      updatedAt: string;
    }) => {
      void reloadDashOverview();
    };

    const handleNegotiationChanged = (_payload: {
      type: 'NEGOTIATION_UPDATED';
      action: 'CREATED' | 'RESPONDED' | 'CANCELED' | 'JOINED' | 'BUNDLE_CREATED';
      negotiationId: string;
      buyerUserId: string;
      sellerUserId: string;
      sourceUserId: string;
      updatedAt: string;
    }) => {
      void reloadDashOverview();
    };

    on('sokin:post-created', handlePostCreated);
    on('order:status-updated', handleOrderChanged);
    on('order:delivery-confirmed', handleOrderChanged);
    on('negotiation:updated', handleNegotiationChanged);

    return () => {
      off('sokin:post-created', handlePostCreated);
      off('order:status-updated', handleOrderChanged);
      off('order:delivery-confirmed', handleOrderChanged);
      off('negotiation:updated', handleNegotiationChanged);
    };
  }, [on, off, reloadSokinFeed, reloadDashOverview]);

  const money = (cents: number) => formatMoneyFromUsdCents(cents);

  /* ── Article card actions ── */
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const handleCardAddToCart = async (listingId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) { navigate('/login'); return; }
    if (isAdmin) { setCardCartFeedback({ id: listingId, msg: `🔒 ${t('home.adminNoTransact')}` }); setTimeout(() => setCardCartFeedback(null), 3000); return; }
    // Anti-self-purchase : trouver l'article dans les listes réelles
    const listing = [...liveProducts, ...liveServices].find(l => l.id === listingId);
    if (listing && user && listing.owner.userId === user.id) {
      setCardCartFeedback({ id: listingId, msg: `⚠️ ${t('home.cannotBuyOwn')}` });
      setTimeout(() => setCardCartFeedback(null), 3000);
      return;
    }
    if (cardCartBusy) return;
    setCardCartBusy(listingId);
    try {
      const qty = getQty(listingId);
      await ordersApi.addCartItem({ listingId, quantity: qty });
      setCardCartFeedback({ id: listingId, msg: `✓ ${qty > 1 ? qty + '× ' : ''}${t('home.addedToCart')}` });
      setCardQty((prev) => { const next = { ...prev }; delete next[listingId]; return next; });
    } catch {
      setCardCartFeedback({ id: listingId, msg: `✗ ${t('home.errorGeneric')}` });
    } finally {
      setCardCartBusy(null);
      setTimeout(() => setCardCartFeedback(null), 2000);
    }
  };

  const handleCardNegotiate = (listing: PublicListing, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) { navigate('/login'); return; }
    if (isAdmin) { setCardCartFeedback({ id: listing.id, msg: `🔒 ${t('home.adminNoNegotiate')}` }); setTimeout(() => setCardCartFeedback(null), 3000); return; }
    setNegotiateListing(listing);
  };

  const navigateToArticle = (p: PublicListing) => {
    if (p.owner.username) {
      navigate(`/user/${p.owner.username}#listing-${p.id}`);
    } else {
      navigate('/explorer?type=produits');
    }
  };

  const userName = user?.profile.displayName || user?.profile.username || user?.email || t("home.visitor");
  const userCode = user
    ? `${user.role === "BUSINESS" ? t("home.businessRole") : t("home.userRole")} · ${user.id.slice(0, 8)}`
    : t("home.visitorMode");

  // Scroll reveal
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("is-visible"); });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".h-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // So-Kin auto-rotate (single-card slider, 2 min)
  useEffect(() => {
    if (sokinFeed.length <= 1) return;
    const timer = setInterval(() => {
      setSokinIndex((prev) => (prev + 1) % sokinFeed.length);
    }, 120_000);
    return () => clearInterval(timer);
  }, [sokinFeed.length]);

  // Blog auto-rotate
  useEffect(() => {
    if (blogPosts.length <= 1) return;
    const timer = setInterval(() => {
      setBlogIndex((prev) => (prev + 1) % blogPosts.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [blogPosts.length]);

  // Hero categories auto-slide (groups of 5)
  const HERO_CATS_PER_SLIDE = 5;
  const heroCatSlides = Math.ceil(PRODUCT_CATEGORIES.length / HERO_CATS_PER_SLIDE);
  useEffect(() => {
    if (heroCatSlides <= 1) return;
    const timer = setInterval(() => {
      setHeroCatIndex((prev) => (prev + 1) % heroCatSlides);
    }, 3500);
    return () => clearInterval(timer);
  }, [heroCatSlides]);

  // Close popups on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setIsInfoOpen(false); setIsAccountOpen(false); setNotifDropdownOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Close notif dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = searchQuery.trim();
    window.location.href = q ? `/explorer?query=${encodeURIComponent(q)}` : "/explorer";
  };

  const currentTip = t(TIPS_KEYS[tipIndex]);
  const fullscreenLabel = t(isFullscreen ? 'home.fullscreenExit' : 'home.fullscreenEnter');
  const heroTitle = isLoggedIn
    ? t('home.heroWelcome').replace('{name}', userName)
    : t('home.heroGuestTitle');

  // Safe indices pour les widgets rotatifs de la sidebar
  const safeShopIdx = trendingShops.length > 0 ? shopIndex % trendingShops.length : 0;
  const safeSellerIdx = trendingProfiles.length > 0 ? sellerIndex % trendingProfiles.length : 0;
  const safeKinIdx = sokinFeed.length > 0 ? sokinIndex % sokinFeed.length : 0;
  const currentSokinPost = sokinFeed.length > 0 ? sokinFeed[safeKinIdx] : null;

  return (
    <div className="h-shell">
      <SeoMeta
        title={t('home.metaTitle')}
        description={t('home.metaDescription')}
        canonical="https://kin-sell.com/"
      />
      {/* ═══════ TOP BAR ═══════ */}
      <header className="h-topbar">
        {/* Enseigne KIN-SELL */}
        <div className="h-enseigne glass-container" role="button" onClick={() => navigate('/')} aria-label={t('home.homeAria')} style={{ cursor: 'pointer' }}>
          <span className="h-enseigne-shine" aria-hidden="true" />
          {LETTERS.map((letter, i) => (
            <span key={`${letter}-${i}`} className="h-letter glass-card" style={{ animationDelay: `${i * 140}ms` }}>
              {letter}
            </span>
          ))}
        </div>

        {/* Search */}
        <form className="h-search glass-container" onSubmit={handleSearch}>
          <span className="h-search-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('home.searchPlaceholder')}
            className="h-search-input"
          />
          <button type="button" className="h-action-btn h-fullscreen-btn" onClick={toggleFullscreen} aria-label={fullscreenLabel} title={fullscreenLabel}>
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            )}
          </button>
        </form>

        {/* Actions */}
        <div className="h-actions glass-container">
          <button type="button" className="h-action-btn ks-help-btn" onClick={() => setIsInfoOpen(true)} aria-label={t('home.info')} title={t('home.info')}>
            <span>?</span>
          </button>
          {isLoggedIn ? (
            <>
              {/* Notifications dropdown */}
              <div className="h-notif-wrap" ref={notifRef} style={{ position: 'relative' }}>
                <button type="button" className="h-action-btn h-action-btn--notif" aria-label={t('home.notifications')} title={t('home.notifications')} onClick={() => setNotifDropdownOpen((p) => !p)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                  {notificationsCount > 0 && <span className="h-notif-badge">{notificationsCount}</span>}
                </button>
                {notifDropdownOpen && (
                  <div className="h-notif-dropdown glass-container">
                    <div className="h-notif-dropdown-head">
                      <strong>{t('home.notifications')}</strong>
                      <span className="h-notif-dropdown-count">{notifItems.length}</span>
                    </div>
                    {notifItems.length > 0 ? (
                      <div className="h-notif-dropdown-list">
                        {notifItems.map((n) => (
                          <button key={n.id} type="button" className="h-notif-dropdown-item" onClick={() => { setNotifDropdownOpen(false); sessionStorage.setItem('ud-section', n.section); navigate(getDashboardPath(user?.role)); }}>
                            <span className="h-notif-dropdown-icon">{n.icon}</span>
                            <div className="h-notif-dropdown-text">
                              <span className="h-notif-dropdown-label">{n.label}</span>
                              <span className="h-notif-dropdown-detail">{n.detail}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="h-notif-dropdown-empty">{t('nav.noNotif')}</p>
                    )}
                  </div>
                )}
              </div>
              <button type="button" className="h-action-btn" aria-label={t('home.messaging')} title={t('home.messaging')} onClick={() => { sessionStorage.setItem('ud-section', 'messages'); navigate(getDashboardPath(user?.role)); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </button>
              <button type="button" className="h-action-btn h-action-btn--cart" aria-label={t('home.cartLabel')} title={t('home.cartLabel')} onClick={() => navigate('/cart')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                {buyerCart && buyerCart.itemsCount > 0 && <span className="h-cart-count">{buyerCart.itemsCount}</span>}
              </button>
              {/* Account button */}
              <button
                type="button"
                className="h-action-btn"
                aria-label={t('home.account')}
                title={t('home.account')}
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  setAccountMenuPos({ top: rect.bottom + 10, left: rect.left - 120, width: 260 });
                  setIsAccountOpen(true);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
            </>
          ) : (
            <>
              {/* Login / Register for non-logged users */}
              <button
                type="button"
                className="h-action-btn"
                aria-label={t('common.login')}
                title={t('common.login')}
                onClick={() => navigate('/login')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
            </>
          )}
          <div
            role="button"
            onClick={() => {
              navigate('/');
              window.dispatchEvent(new CustomEvent("ks-pwa-force-show"));
            }}
            className="h-logo-round"
            aria-label={t('home.homeAria')}
            title={t('home.homeAria')}
            style={{ cursor: 'pointer' }}
          >
            <img src="/assets/kin-sell/Logo%20Kin-Sell.png" alt="Kin-Sell" />
          </div>
        </div>
      </header>

      {/* ═══════ HERO BANNER ═══════ */}
      <section className="h-hero h-reveal">
        <div className="h-hero-glow" aria-hidden="true" />
        <div className="h-hero-content">
          <h1 className="h-hero-title">
            {heroTitle}
          </h1>
          <p className="h-hero-sub">{t('home.heroSubtitle')}</p>
          <div className="h-hero-cats">
            {PRODUCT_CATEGORIES.slice(heroCatIndex * HERO_CATS_PER_SLIDE, heroCatIndex * HERO_CATS_PER_SLIDE + HERO_CATS_PER_SLIDE).map((c) => (
              <button key={c.code + c.nameKey} type="button" className="h-hero-chip" onClick={() => navigate(c.href)}>
                <span>{c.code}</span> {t(c.nameKey)}
              </button>
            ))}
          </div>
          {heroCatSlides > 1 && (
            <div className="h-sokin-dots" style={{ justifyContent: 'center', marginTop: '0.4rem' }}>
              {Array.from({ length: heroCatSlides }).map((_, i) => (
                <button key={i} type="button" className={`h-sokin-dot${i === heroCatIndex ? " active" : ""}`} onClick={() => setHeroCatIndex(i)} aria-label={t('home.categoryPageAria').replace('{page}', String(i + 1))} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════ MAIN 3-COLUMN ═══════ */}
      <main className="h-main">
        {/* ── LEFT SIDEBAR ── */}
        <aside className="h-sidebar h-reveal">
          {/* Account block */}
          <div
            className="h-account glass-container"
            role="button"
            tabIndex={0}
            onClick={(event) => {
              const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
              setAccountMenuPos({ top: rect.bottom + 10, left: rect.left, width: rect.width });
              setIsAccountOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                setAccountMenuPos({ top: rect.bottom + 10, left: rect.left, width: rect.width });
                setIsAccountOpen(true);
              }
            }}
          >
            <div className="h-avatar">
              {user?.profile.avatarUrl ? (
                <img src={resolveMediaUrl(user.profile.avatarUrl)} alt={userName} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : null}
              <span className="h-avatar-fallback">{userName.charAt(0).toUpperCase()}</span>
            </div>
            <div className="h-account-info">
              <strong>{userName}</strong>
              <span className="h-user-code">{userCode}</span>
            </div>
          </div>

          {/* Categories Produits */}
          <nav className="h-cat-box glass-container">
            <p className="h-cat-title">{t('home.productCategories')}</p>
            <div className="h-cat-list">
              {PRODUCT_CATEGORIES.map((c) => (
                <button type="button" key={c.code} onClick={() => navigate(c.href)} className="h-cat-item">
                  <span className="h-cat-code">{c.code}</span>
                  <span>{t(c.nameKey)}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* Link services & produits */}
          <button type="button" onClick={() => navigate('/explorer')} className="h-link-services glass-container">
            {t('home.servicesAndProducts')}
          </button>

          {/* Categories Services */}
          <nav className="h-cat-box glass-container">
            <p className="h-cat-title">{t('home.serviceCategories')}</p>
            <div className="h-cat-list">
              {SERVICE_CATEGORIES.map((c) => (
                <button type="button" key={c.code} onClick={() => navigate(c.href)} className="h-cat-item">
                  <span className="h-cat-code">{c.code}</span>
                  <span>{t(c.nameKey)}</span>
                </button>
              ))}
            </div>
          </nav>


          {/* Boutiques en vogue — données réelles */}
          <div className="h-trending glass-container">
            <p className="h-cat-title">{t('home.trendingShops')}</p>
            {trendingShops.length === 0 ? (
              <p className="h-trending-empty">{t('home.noShops')}</p>
            ) : (
              <>
                <div role="button" onClick={() => navigate(`/business/${trendingShops[safeShopIdx].slug}`)} className="h-trending-card glass-card" style={{ cursor: 'pointer' }}>
                  <div className="h-trending-avatar">{trendingShops[safeShopIdx].name.charAt(0).toUpperCase()}</div>
                  <div className="h-trending-info">
                    <strong>{trendingShops[safeShopIdx].name}</strong>
                    <span className="h-tag">{trendingShops[safeShopIdx].badge}</span>
                    <span className="h-tag">{trendingShops[safeShopIdx].city}</span>
                  </div>
                </div>
                <div className="h-trending-dots">
                  {trendingShops.map((_, i) => (
                    <button key={i} type="button" className={`h-sokin-dot${i === safeShopIdx ? " active" : ""}`} onClick={() => setShopIndex(i)} aria-label={`${t('home.trendingShops')} ${i + 1}`} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Vendeurs populaires — données réelles */}
          <div className="h-trending glass-container">
            <p className="h-cat-title">{t('home.popularSellers')}</p>
            {trendingProfiles.length === 0 ? (
              <p className="h-trending-empty">{t('home.noProfiles')}</p>
            ) : (
              <>
                <div role="button" onClick={() => navigate(trendingProfiles[safeSellerIdx].username ? `/user/${trendingProfiles[safeSellerIdx].username}` : '/explorer/public-profiles')} className="h-trending-card glass-card" style={{ cursor: 'pointer' }}>
                  <div className="h-trending-avatar">
                    {trendingProfiles[safeSellerIdx].avatarUrl
                      ? <img src={resolveMediaUrl(trendingProfiles[safeSellerIdx].avatarUrl!)} alt={trendingProfiles[safeSellerIdx].displayName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : trendingProfiles[safeSellerIdx].displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="h-trending-info">
                    <strong>{trendingProfiles[safeSellerIdx].displayName}</strong>
                    <span className="h-tag">{trendingProfiles[safeSellerIdx].badge}</span>
                    <span className="h-tag">{trendingProfiles[safeSellerIdx].city}</span>
                  </div>
                </div>
                <div className="h-trending-dots">
                  {trendingProfiles.map((_, i) => (
                    <button key={i} type="button" className={`h-sokin-dot${i === safeSellerIdx ? " active" : ""}`} onClick={() => setSellerIndex(i)} aria-label={`${t('home.popularSellers')} ${i + 1}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* ── CENTER CONTENT ── */}
        <div className="h-center">
          {/* Dashboard row: Panier | Stats | Commande */}
          <div className="h-dash-row h-reveal">
            <div role="button" onClick={() => navigate('/cart')} className="h-dash-card glass-card" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
              <div className="h-dash-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              </div>
              <p className="h-dash-label">{t('home.cartLabel')}</p>
              <p className="h-dash-value">{buyerCart ? buyerCart.itemsCount : 0}</p>
              <p className="h-dash-note">{buyerCart && buyerCart.itemsCount > 0 ? `${buyerCart.itemsCount} ${t('home.itemsInCart')}` : t('home.emptyCart')}</p>
              <p className="h-dash-amount">{buyerCart ? money(buyerCart.subtotalUsdCents) : '0,00 $'}</p>
            </div>

            <div role="button" onClick={() => { sessionStorage.setItem('ud-section', 'sales'); navigate(getDashboardPath(user?.role)); }} className="h-dash-card glass-card" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
              <div className="h-dash-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
              </div>
              <p className="h-dash-label">{t('home.salesStats')}</p>
              <p className="h-dash-value">{sellerStats.total}</p>
              <p className="h-dash-note">{sellerStats.inProgress} {t('home.inProgress')} · {sellerStats.delivered} {t('home.deliveredLabel')}</p>
              <p className="h-dash-amount">{money(sellerStats.revenue)} {t('home.revenue')}</p>
            </div>

            <div role="button" onClick={() => navigate('/cart')} className="h-dash-card glass-card" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
              <div className="h-dash-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <p className="h-dash-label">{t('home.lastOrder')}</p>
              {lastBuyerOrder ? (
                <>
                  <p className="h-dash-value">{money(lastBuyerOrder.totalUsdCents)}</p>
                  <p className="h-dash-note">#{lastBuyerOrder.id.slice(0, 8).toUpperCase()} · {lastBuyerOrder.status === 'DELIVERED' ? t('home.statusDelivered') : lastBuyerOrder.status === 'CANCELED' ? t('home.statusCanceled') : t('home.statusInProgress')}</p>
                </>
              ) : (
                <p className="h-dash-note">{t('home.noOrders')}</p>
              )}
            </div>
          </div>

          {/* Bannière publicitaire */}
          <AdBanner page="home" />

          {/* Articles Produits — 4×2 grid, scrollable inside glass */}
          <section className="h-articles h-reveal glass-container">
            <div className="h-articles-head">
              <p className="h-section-title">{t('home.productsForSale')}</p>
              <button type="button" onClick={() => navigate('/explorer?type=produits')} className="h-articles-link">{t('home.viewAll')}</button>
            </div>
          <div className="h-articles-scroll">
              {isLoadingArticles ? (
                <p className="h-articles-empty">{t('home.loadingProducts')}</p>
              ) : liveProducts.length === 0 ? (
                <p className="h-articles-empty">{t('home.noProducts')}</p>
              ) : (
              <div className="h-articles-grid">
                {liveProducts.map((p) => (
                  <div key={p.id} className="h-article-card glass-card" role="button" tabIndex={0}
                    onClick={() => navigateToArticle(p)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigateToArticle(p); }}
                    onMouseEnter={(e) => articleHover.handleMouseEnter({ title: p.title, description: p.description, price: formatPriceLabelFromUsdCents(p.promoActive && p.promoPriceUsdCents != null ? p.promoPriceUsdCents : p.priceUsdCents), sellerName: p.owner.displayName || t("common.seller") }, e)}
                    onMouseLeave={articleHover.handleMouseLeave}
                  >
                    <div className="h-article-thumb" style={p.imageUrl ? { backgroundImage: `url(${resolveMediaUrl(p.imageUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                      <span className="h-article-cat">{p.category}</span>
                      {p.promoActive && p.promoPriceUsdCents != null && <span className="h-article-promo-badge ks-promo-badge">{formatPriceLabelFromUsdCents(p.promoPriceUsdCents)}</span>}
                    </div>
                    <div className="h-article-body">
                      <strong className="h-article-title">{p.title}</strong>
                      {p.promoActive && p.promoPriceUsdCents != null ? (
                        <span className="h-article-price"><s className="ks-price-old">{formatPriceLabelFromUsdCents(p.priceUsdCents)}</s> {formatPriceLabelFromUsdCents(p.promoPriceUsdCents)}</span>
                      ) : (
                        <span className="h-article-price">{formatPriceLabelFromUsdCents(p.priceUsdCents)}</span>
                      )}
                      {p.owner.displayName && (
                        <span className="h-article-seller">
                          {p.owner.avatarUrl ? <img src={resolveMediaUrl(p.owner.avatarUrl)} alt="" className="h-article-seller-avatar" loading="lazy" /> : <span className="h-article-seller-dot" />}
                          {p.owner.displayName}
                        </span>
                      )}
                      <div className="h-article-actions">
                        <span className="h-qty-selector">
                          <button type="button" className="h-qty-btn" onClick={(e) => changeQty(p.id, -1, e)} disabled={getQty(p.id) <= 1}>−</button>
                          <span className="h-qty-value">{getQty(p.id)}</span>
                          <button type="button" className="h-qty-btn" onClick={(e) => changeQty(p.id, 1, e)}>+</button>
                        </span>
                        <button type="button" className="h-article-action-btn" title={t("common.addToCart")} disabled={cardCartBusy === p.id} onClick={(e) => void handleCardAddToCart(p.id, e)}>🛒</button>
                        {p.isNegotiable !== false && !isCategoryLocked(lockedCats, p.category) && <button type="button" className="h-article-action-btn" title={t("common.negotiate")} onClick={(e) => handleCardNegotiate(p, e)}>🤝</button>}
                      </div>
                      {cardCartFeedback?.id === p.id && <span className="h-article-feedback">{cardCartFeedback.msg}</span>}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          </section>

          {/* Articles Services — 4×2 grid, scrollable inside glass */}
          <section className="h-articles h-reveal glass-container">
            <div className="h-articles-head">
              <p className="h-section-title">{t('home.servicesForSale')}</p>
              <button type="button" onClick={() => navigate('/explorer?type=services')} className="h-articles-link">{t('home.viewAll')}</button>
            </div>
          <div className="h-articles-scroll">
              {isLoadingArticles ? (
                <p className="h-articles-empty">{t('home.loadingServices')}</p>
              ) : liveServices.length === 0 ? (
                <p className="h-articles-empty">{t('home.noServices')}</p>
              ) : (
              <div className="h-articles-grid">
                {liveServices.map((s) => (
                  <div key={s.id} className="h-article-card h-article-card--svc glass-card" role="button" tabIndex={0}
                    onClick={() => { if (s.owner.username) navigate(`/user/${s.owner.username}#listing-${s.id}`); else navigate('/explorer?type=services'); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { if (s.owner.username) navigate(`/user/${s.owner.username}#listing-${s.id}`); else navigate('/explorer?type=services'); } }}
                    onMouseEnter={(e) => articleHover.handleMouseEnter({ title: s.title, description: s.description, price: formatPriceLabelFromUsdCents(s.promoActive && s.promoPriceUsdCents != null ? s.promoPriceUsdCents : s.priceUsdCents), sellerName: s.owner.displayName || t("common.seller") }, e)}
                    onMouseLeave={articleHover.handleMouseLeave}
                  >
                    <div className="h-article-thumb h-article-thumb--svc" style={s.imageUrl ? { backgroundImage: `url(${resolveMediaUrl(s.imageUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                      <span className="h-article-cat">{s.category}</span>
                      {s.promoActive && s.promoPriceUsdCents != null && <span className="h-article-promo-badge ks-promo-badge">{formatPriceLabelFromUsdCents(s.promoPriceUsdCents)}</span>}
                    </div>
                    <div className="h-article-body">
                      <strong className="h-article-title">{s.title}</strong>
                      {s.promoActive && s.promoPriceUsdCents != null ? (
                        <span className="h-article-price"><s className="ks-price-old">{formatPriceLabelFromUsdCents(s.priceUsdCents)}</s> {formatPriceLabelFromUsdCents(s.promoPriceUsdCents)}</span>
                      ) : (
                        <span className="h-article-price">{formatPriceLabelFromUsdCents(s.priceUsdCents)}</span>
                      )}
                      {s.owner.displayName && (
                        <span className="h-article-seller">
                          {s.owner.avatarUrl ? <img src={resolveMediaUrl(s.owner.avatarUrl)} alt="" className="h-article-seller-avatar" loading="lazy" /> : <span className="h-article-seller-dot" />}
                          {s.owner.displayName}
                        </span>
                      )}
                      <div className="h-article-actions">
                        <span className="h-qty-selector">
                          <button type="button" className="h-qty-btn" onClick={(e) => changeQty(s.id, -1, e)} disabled={getQty(s.id) <= 1}>−</button>
                          <span className="h-qty-value">{getQty(s.id)}</span>
                          <button type="button" className="h-qty-btn" onClick={(e) => changeQty(s.id, 1, e)}>+</button>
                        </span>
                        <button type="button" className="h-article-action-btn" title={t("common.addToCart")} disabled={cardCartBusy === s.id} onClick={(e) => void handleCardAddToCart(s.id, e)}>🛒</button>
                        {s.isNegotiable !== false && !isCategoryLocked(lockedCats, s.category) && <button type="button" className="h-article-action-btn" title={t("common.negotiate")} onClick={(e) => handleCardNegotiate(s, e)}>🤝</button>}
                      </div>
                      {cardCartFeedback?.id === s.id && <span className="h-article-feedback">{cardCartFeedback.msg}</span>}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          </section>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <aside className="h-right h-reveal">
          <div className="h-sokin-box glass-container">
            <p className="h-sokin-title">So-Kin</p>
            <p className="h-sokin-subtitle">{t('home.sokinFeed')}</p>

            {sokinFeed.length === 0 ? (
              <div className="h-sokin-card glass-card">
                <p className="h-sokin-text" style={{ opacity: 0.6 }}>{t('home.noSokinPosts')}</p>
              </div>
            ) : (
              <SoKinToastProvider>
                <div className="h-sokin-real-feed h-sokin-slider">
                  {(() => {
                    const post = sokinFeed[sokinIndex % sokinFeed.length];
                    return (
                      <div className="h-sokin-slide" key={post.id}>
                        <AnnounceCard
                          post={post}
                          t={t}
                          isLoggedIn={isLoggedIn}
                          onMediaClick={(item) => setViewerItem(item)}
                          isCommentsOpen={openCommentsPostId === post.id}
                          onOpenComments={() => handleOpenComments(post.id)}
                          onContact={() => void handleSokinContact(post)}
                          isContacting={contactingPostId === post.id}
                          feedSource="home"
                        />
                      </div>
                    );
                  })()}
                </div>
                {sokinFeed.length > 1 && (
                  <div className="h-sokin-slider-dots">
                    {sokinFeed.slice(0, 8).map((_, i) => (
                      <button key={i} type="button" className={`h-sokin-dot${i === sokinIndex % sokinFeed.length ? ' active' : ''}`} onClick={() => setSokinIndex(i)} aria-label={`Post ${i + 1}`} />
                    ))}
                  </div>
                )}
              </SoKinToastProvider>
            )}

            <button type="button" onClick={() => navigate('/sokin')} className="glass-button primary h-sokin-cta">{t('home.viewMoreSokin')}</button>
          </div>

          {/* Liens So-Kin */}
          <div className="h-sokin-links">
            <button type="button" onClick={() => navigate('/explorer/public-profiles')} className="glass-button secondary h-sokin-cta">{t('home.sokinProfiles')}</button>
            <button type="button" onClick={() => navigate('/explorer/shops-online')} className="glass-button secondary h-sokin-cta">{t('home.sokinMarket')}</button>
          </div>

          {/* Conseils d'utilisation */}
          <div className="h-tips-box glass-container">
            <p className="h-sokin-title">{t('home.usageTips')}</p>
            <p className="h-tip-text">{currentTip}</p>
            <div className="h-sokin-dots">
              {TIPS_KEYS.map((_, i) => (
                <button key={i} type="button" className={`h-sokin-dot${i === tipIndex ? " active" : ""}`} onClick={() => setTipIndex(i)} aria-label={`${t('home.usageTips')} ${i + 1}`} />
              ))}
            </div>
          </div>

          {/* Kin-Sell Blog */}
          <div className="h-blog-box glass-container">
            <p className="h-sokin-title">{t('home.blog')}</p>
            <p className="h-blog-note">{t('home.blogNote')}</p>
            <div className="h-blog-list">
              {blogPosts.length === 0 ? (
                <div className="h-blog-card glass-card">
                  <span className="h-blog-card-title">Kin-Sell continue d'évoluer</span>
                  <span className="h-blog-card-excerpt">Les prochains articles publiés via l'espace admin apparaîtront ici.</span>
                </div>
              ) : (
                <button key={blogPosts[blogIndex % blogPosts.length].id} type="button" className="h-blog-card glass-card" onClick={() => navigate('/blog')}>
                  <span className="h-blog-card-meta">{blogPosts[blogIndex % blogPosts.length].author} · {new Date(blogPosts[blogIndex % blogPosts.length].publishedAt ?? blogPosts[blogIndex % blogPosts.length].createdAt).toLocaleDateString('fr-FR')}</span>
                  <span className="h-blog-card-title">{blogPosts[blogIndex % blogPosts.length].title}</span>
                  <span className="h-blog-card-excerpt">{blogPosts[blogIndex % blogPosts.length].excerpt ?? `${blogPosts[blogIndex % blogPosts.length].content.slice(0, 110)}…`}</span>
                </button>
              )}
            </div>
            {blogPosts.length > 1 && (
              <div className="h-sokin-dots">
                {blogPosts.map((_, i) => (
                  <button key={i} type="button" className={`h-sokin-dot${i === blogIndex % blogPosts.length ? " active" : ""}`} onClick={() => setBlogIndex(i)} aria-label={`Blog ${i + 1}`} />
                ))}
              </div>
            )}
            <button type="button" onClick={() => navigate('/blog')} className="glass-button secondary h-sokin-cta">{t('home.readBlog')}</button>
          </div>

        </aside>
      </main>

      {/* ═══════ INFO POPUP ═══════ */}
      {isInfoOpen && (
        <div className="h-popup-overlay" onClick={() => setIsInfoOpen(false)}>
          <div className="h-popup glass-container" onClick={(e) => e.stopPropagation()}>
            <div className="h-popup-head">
              <strong>Kin-Sell</strong>
              <p>{t('home.quickNav')}</p>
              <button type="button" className="h-popup-close" onClick={() => setIsInfoOpen(false)}>✕</button>
            </div>
            <nav className="h-popup-links">
              {INFO_ITEMS.map((item) => (
                <button type="button" key={item.href} onClick={() => { navigate(item.href); setIsInfoOpen(false); }} className="h-popup-link">{t(item.titleKey)}</button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* ═══════ ACCOUNT POPUP ═══════ */}
      {isAccountOpen && (
        <div className="h-popup-overlay" onClick={() => setIsAccountOpen(false)}>
          <div
            className="h-popup h-popup--sm h-popup--account glass-container"
            style={accountMenuPos ? { top: accountMenuPos.top, left: accountMenuPos.left, width: Math.max(260, accountMenuPos.width) } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-popup-head">
              <strong>{t('home.account')}</strong>
              <button type="button" className="h-popup-close" onClick={() => setIsAccountOpen(false)}>✕</button>
            </div>
            {isLoggedIn ? (
              <nav className="h-popup-links">
                <button type="button" className="h-popup-link h-popup-link--btn" onClick={() => { setIsAccountOpen(false); navigate(getDashboardPath(user?.role)); }}>{t('home.myAccount')}</button>
                <button type="button" className="h-popup-link h-popup-link--btn" onClick={() => { setIsAccountOpen(false); sessionStorage.setItem('ud-section', 'messages'); navigate(getDashboardPath(user?.role)); }}>{t('home.messaging')}</button>
                <button type="button" className="h-popup-link h-popup-link--btn" onClick={() => { setIsAccountOpen(false); navigate('/cart'); }}>{t('home.cartLabel')}</button>
                <button
                  type="button"
                  className="h-popup-link h-popup-link--btn"
                  onClick={() => {
                    void logout().then(() => navigate('/login'));
                    setIsAccountOpen(false);
                  }}
                >
                  {t('home.disconnect')}
                </button>
              </nav>
            ) : (
              <nav className="h-popup-links">
                <button type="button" className="h-popup-link h-popup-link--btn" onClick={() => { setIsAccountOpen(false); navigate('/login'); }}>{t('home.login')}</button>
                <button type="button" className="h-popup-link h-popup-link--btn" onClick={() => { setIsAccountOpen(false); navigate('/register'); }}>{t('home.createAccount')}</button>
              </nav>
            )}
          </div>
        </div>
      )}

      <ArticleHoverPopup popup={articleHover.popup} />

      {negotiateListing ? (
        <NegotiatePopup
          listing={{
            id: negotiateListing.id,
            title: negotiateListing.title,
            imageUrl: negotiateListing.imageUrl,
            type: negotiateListing.type,
            priceUsdCents: negotiateListing.priceUsdCents,
            ownerDisplayName: negotiateListing.owner.displayName,
          }}
          onClose={() => setNegotiateListing(null)}
          onSuccess={() => {
            setNegotiateListing(null);
            navigate('/cart');
          }}
        />
      ) : null}

      {/* So-Kin Media Viewer */}
      {viewerItem && <MediaViewer item={viewerItem} onClose={() => setViewerItem(null)} />}

      {/* So-Kin Comments Drawer */}
      <CommentsDrawer
        post={sokinFeed.find((p) => p.id === openCommentsPostId) ?? null}
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
    </div>
  );
}
