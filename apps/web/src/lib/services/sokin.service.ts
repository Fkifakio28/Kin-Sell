import { request, mutate } from "../api-core";

// ── So-Kin Posts ──
export type SoKinApiPost = {
  id: string;
  authorId: string;
  text: string;
  mediaUrls: string[];
  location: string | null;
  tags: string[];
  hashtags: string[];
  likes: number;
  comments: number;
  shares: number;
  status: 'ACTIVE' | 'HIDDEN' | 'FLAGGED' | 'DELETED';
  createdAt: string;
  updatedAt: string;
};

export type SoKinReactionType = 'LIKE' | 'LOVE' | 'HAHA' | 'WOW' | 'SAD' | 'ANGRY';

export type SoKinApiFeedPost = SoKinApiPost & {
  author: {
    id: string;
    profile: {
      username: string | null;
      displayName: string;
      avatarUrl: string | null;
      city: string | null;
    } | null;
  };
  reactionCounts: Partial<Record<SoKinReactionType, number>>;
  myReaction: SoKinReactionType | null;
};

export type SoKinPublicUser = {
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  domain: string | null;
  qualification: string | null;
  verificationStatus: string;
};

export type SoKinStory = {
  id: string;
  authorId: string;
  author: {
    id: string;
    profile: {
      username: string | null;
      displayName: string;
      avatarUrl: string | null;
    } | null;
  };
  mediaUrl: string | null;
  mediaType: 'IMAGE' | 'VIDEO' | 'TEXT';
  caption: string | null;
  bgColor: string | null;
  viewCount: number;
  viewedByMe: boolean;
  expiresAt: string;
  createdAt: string;
};

export const sokin = {
  myPosts: () =>
    request<{ posts: SoKinApiPost[] }>('/sokin/posts/mine'),
  createPost: (body: { text: string; mediaUrls?: string[]; location?: string; tags?: string[]; hashtags?: string[]; scheduledAt?: string }) =>
    mutate<SoKinApiPost>('/sokin/posts', { method: 'POST', body }, ['/sokin/posts']),
  archivePost: (id: string) =>
    mutate<SoKinApiPost>(`/sokin/posts/${encodeURIComponent(id)}/archive`, { method: 'PATCH' }, ['/sokin/posts']),
  deletePost: (id: string) =>
    mutate<{ success: boolean }>(`/sokin/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }, ['/sokin/posts']),
  publicFeed: (params?: { limit?: number; city?: string; country?: string }) =>
    request<{ posts: SoKinApiFeedPost[] }>('/sokin/posts', {
      params: {
        limit: params?.limit,
        city: params?.city,
        country: params?.country,
      },
    }),
  publicPost: (id: string) =>
    request<{ post: SoKinApiFeedPost }>(`/sokin/posts/${encodeURIComponent(id)}`),
  publicUsers: (params?: { city?: string; search?: string; country?: string }) =>
    request<{ users: SoKinPublicUser[] }>('/sokin/users', {
      params: params as Record<string, string | undefined>,
    }),
  reactToPost: (id: string, type: SoKinReactionType) =>
    mutate<{ ok: boolean; type: string }>(`/sokin/posts/${encodeURIComponent(id)}/react`, { method: 'POST', body: { type } }, [`/sokin/posts/${encodeURIComponent(id)}`]),
  unreactToPost: (id: string) =>
    mutate<{ ok: boolean }>(`/sokin/posts/${encodeURIComponent(id)}/react`, { method: 'DELETE' }, [`/sokin/posts/${encodeURIComponent(id)}`]),
  sharePost: (id: string) =>
    mutate<{ ok: boolean; shares: number }>(`/sokin/posts/${encodeURIComponent(id)}/share`, { method: 'POST' }, [`/sokin/posts/${encodeURIComponent(id)}`]),
  stories: () =>
    request<{ stories: SoKinStory[] }>('/sokin/stories'),
  createStory: (body: { mediaUrl?: string; mediaType?: 'IMAGE' | 'VIDEO' | 'TEXT'; caption?: string; bgColor?: string; scheduledAt?: string }) =>
    mutate<SoKinStory>('/sokin/stories', { method: 'POST', body }, ['/sokin/stories']),
  viewStory: (id: string) =>
    mutate<{ ok: boolean }>(`/sokin/stories/${encodeURIComponent(id)}/view`, { method: 'POST' }, ['/sokin/stories']),
  deleteStory: (id: string) =>
    mutate<{ ok: boolean }>(`/sokin/stories/${encodeURIComponent(id)}`, { method: 'DELETE' }, ['/sokin/stories']),
};

// ── So-Kin Live ──

export type SoKinLiveProfile = {
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  city?: string | null;
};

export type SoKinLiveData = {
  id: string;
  hostId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  replayUrl?: string | null;
  aspect: 'LANDSCAPE' | 'PORTRAIT';
  status: 'WAITING' | 'LIVE' | 'ENDED' | 'CANCELED';
  viewerCount: number;
  peakViewers: number;
  likesCount: number;
  giftsCount: number;
  featuredListingId?: string | null;
  featuredListing?: {
    id: string;
    title: string;
    priceUsdCents: number;
    city: string;
    imageUrl: string | null;
    type: 'PRODUIT' | 'SERVICE';
  } | null;
  tags: string[];
  city: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  host: { id?: string; profile: SoKinLiveProfile | null };
  participants?: {
    id: string;
    userId: string;
    role: string;
    user: { id?: string; profile: SoKinLiveProfile | null };
  }[];
};

export type SoKinLiveChatMsg = {
  id: string;
  liveId: string;
  userId: string;
  text: string;
  isGift: boolean;
  giftType: string | null;
  isPinned: boolean;
  createdAt: string;
  user: { id?: string; profile: SoKinLiveProfile | null };
};

export const sokinLive = {
  list: (limit?: number) =>
    request<{ lives: SoKinLiveData[] }>('/sokin/lives', {
      params: limit ? { limit } : undefined,
    }),
  history: (limit?: number) =>
    request<{ lives: SoKinLiveData[] }>('/sokin/lives/history', {
      params: limit ? { limit } : undefined,
    }),
  get: (id: string) =>
    request<SoKinLiveData>(`/sokin/lives/${encodeURIComponent(id)}`),
  create: (body: { title: string; description?: string; aspect: 'LANDSCAPE' | 'PORTRAIT'; tags?: string[]; city?: string; thumbnailUrl?: string; featuredListingId?: string }) =>
    mutate<SoKinLiveData>('/sokin/lives', { method: 'POST', body }, ['/sokin/lives']),
  start: (id: string) =>
    mutate<SoKinLiveData>(`/sokin/lives/${encodeURIComponent(id)}/start`, { method: 'PATCH' }, ['/sokin/lives']),
  end: (id: string) =>
    mutate<SoKinLiveData>(`/sokin/lives/${encodeURIComponent(id)}/end`, { method: 'PATCH' }, ['/sokin/lives']),
  join: (id: string) =>
    mutate<{ id: string }>(`/sokin/lives/${encodeURIComponent(id)}/join`, { method: 'POST' }, [`/sokin/lives/${encodeURIComponent(id)}`]),
  leave: (id: string) =>
    mutate<{ success: boolean }>(`/sokin/lives/${encodeURIComponent(id)}/leave`, { method: 'POST' }, [`/sokin/lives/${encodeURIComponent(id)}`]),
  requestGuest: (id: string) =>
    request<{ id: string; role: string }>(`/sokin/lives/${encodeURIComponent(id)}/request-guest`, { method: 'POST' }),
  chat: (id: string, limit?: number) =>
    request<{ messages: SoKinLiveChatMsg[] }>(`/sokin/lives/${encodeURIComponent(id)}/chat`, {
      params: limit ? { limit } : undefined,
    }),
  sendChat: (id: string, body: { text: string; isGift?: boolean; giftType?: string }) =>
    mutate<SoKinLiveChatMsg>(`/sokin/lives/${encodeURIComponent(id)}/chat`, { method: 'POST', body }, [`/sokin/lives/${encodeURIComponent(id)}/chat`]),
  like: (id: string) =>
    mutate<{ likesCount: number }>(`/sokin/lives/${encodeURIComponent(id)}/like`, { method: 'POST' }, [`/sokin/lives/${encodeURIComponent(id)}`]),
  myListings: (id: string) =>
    request<{ listings: Array<{ id: string; title: string; priceUsdCents: number; city: string; imageUrl: string | null; type: 'PRODUIT' | 'SERVICE' }> }>(`/sokin/lives/${encodeURIComponent(id)}/my-listings`),
  setFeaturedListing: (id: string, listingId: string | null) =>
    mutate<SoKinLiveData>(`/sokin/lives/${encodeURIComponent(id)}/featured-listing`, { method: 'PATCH', body: { listingId } }, [`/sokin/lives/${encodeURIComponent(id)}`]),
};

// ── Blog ──

export type PublicBlogPost = {
  id: string;
  title: string;
  content: string;
  excerpt: string | null;
  coverImage: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  publishedAt: string | null;
  createdAt: string;
  author: string;
};

export const blog = {
  publicPosts: (params?: { page?: number; limit?: number }) =>
    request<{ total: number; page: number; totalPages: number; posts: PublicBlogPost[] }>("/blog", {
      params: params as Record<string, string | number | undefined>,
    }),
};
