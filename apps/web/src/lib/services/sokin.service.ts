import { request, mutate } from "../api-core";

// ── So-Kin Post Types ──
export type SoKinPostType = 'SHOWCASE' | 'DISCUSSION' | 'QUESTION' | 'SELLING' | 'PROMO' | 'SEARCH' | 'UPDATE' | 'REVIEW' | 'TREND';

// ── So-Kin Posts ──
export type SoKinApiPost = {
  id: string;
  authorId: string;
  postType: SoKinPostType;
  subject: string | null;
  text: string;
  mediaUrls: string[];
  location: string | null;
  tags: string[];
  hashtags: string[];
  likes: number;
  comments: number;
  shares: number;
  repostOfId: string | null;
  backgroundStyle: string | null;
  status: 'ACTIVE' | 'HIDDEN' | 'ARCHIVED' | 'FLAGGED' | 'DELETED';
  createdAt: string;
  updatedAt: string;
};

export type SoKinReactionType = 'LIKE' | 'LOVE' | 'HAHA' | 'WOW' | 'SAD' | 'ANGRY';

export type SoKinReportReason = 'SPAM' | 'HARASSMENT' | 'HATE_SPEECH' | 'VIOLENCE' | 'NUDITY' | 'SCAM' | 'MISINFORMATION' | 'OTHER';

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
  repostOf?: SoKinApiFeedPost | null;
};

export type SoKinApiComment = {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  parentCommentId: string | null;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    profile: {
      username: string | null;
      displayName: string;
      avatarUrl: string | null;
      city: string | null;
    } | null;
  };
  replies?: SoKinApiComment[];
  _count?: { replies: number };
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

export type SoKinContentTab = 'all' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED' | 'DELETED' | 'BOOKMARKS';

export const sokin = {
  myPosts: (params?: { status?: SoKinContentTab }) =>
    request<{ posts: SoKinApiPost[] }>('/sokin/posts/mine', {
      params: { status: params?.status },
    }),
  myCounts: () =>
    request<{ counts: Record<string, number> }>('/sokin/posts/counts'),
  createPost: (body: { text: string; mediaUrls?: string[]; location?: string; tags?: string[]; hashtags?: string[]; scheduledAt?: string; postType?: SoKinPostType; subject?: string; backgroundStyle?: string }) =>
    mutate<SoKinApiPost>('/sokin/posts', { method: 'POST', body }, ['/sokin/posts']),
  archivePost: (id: string) =>
    mutate<SoKinApiPost>(`/sokin/posts/${encodeURIComponent(id)}/archive`, { method: 'PATCH' }, ['/sokin/posts']),
  togglePost: (id: string) =>
    mutate<{ post: SoKinApiPost }>(`/sokin/posts/${encodeURIComponent(id)}/toggle`, { method: 'PATCH' }, ['/sokin/posts']),
  deletePost: (id: string) =>
    mutate<{ success: boolean }>(`/sokin/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }, ['/sokin/posts']),
  updatePost: (id: string, body: { text?: string; mediaUrls?: string[]; postType?: SoKinPostType; subject?: string | null; location?: string | null; tags?: string[]; hashtags?: string[]; backgroundStyle?: string | null }) =>
    mutate<{ post: SoKinApiPost }>(`/sokin/posts/${encodeURIComponent(id)}`, { method: 'PATCH', body }, ['/sokin/posts']),
  publicFeed: (params?: { limit?: number; offset?: number; cursor?: string; city?: string; country?: string; types?: string[] }) =>
    request<{ posts: SoKinApiFeedPost[] }>('/sokin/posts', {
      params: {
        limit: params?.limit,
        offset: params?.offset,
        cursor: params?.cursor,
        city: params?.city,
        country: params?.country,
        types: params?.types?.join(','),
      },
    }),
  publicPost: (id: string) =>
    request<{ post: SoKinApiFeedPost }>(`/sokin/posts/${encodeURIComponent(id)}`),
  postComments: (id: string, params?: { limit?: number; sort?: 'recent' | 'relevant' }) =>
    request<{ comments: SoKinApiComment[] }>(`/sokin/posts/${encodeURIComponent(id)}/comments`, {
      params: {
        limit: params?.limit,
        sort: params?.sort,
      },
    }),
  createComment: (id: string, body: { content: string; parentCommentId?: string }) =>
    mutate<{ comment: SoKinApiComment }>(`/sokin/posts/${encodeURIComponent(id)}/comments`, { method: 'POST', body }, [`/sokin/posts/${encodeURIComponent(id)}/comments`, `/sokin/posts/${encodeURIComponent(id)}`]),
  publicUsers: (params?: { city?: string; search?: string; country?: string }) =>
    request<{ users: SoKinPublicUser[] }>('/sokin/users', {
      params: params as Record<string, string | undefined>,
    }),

  // ── Interactions sociales ──

  /** Réagir à un post (toggle) */
  react: (id: string, type: SoKinReactionType = 'LIKE') =>
    mutate<{ action: 'added' | 'removed' | 'changed'; reaction: { type: SoKinReactionType } | null }>(
      `/sokin/posts/${encodeURIComponent(id)}/react`, { method: 'POST', body: { type } }, []
    ),

  /** Sauvegarder/retirer un post des favoris */
  bookmark: (id: string) =>
    mutate<{ saved: boolean }>(
      `/sokin/posts/${encodeURIComponent(id)}/bookmark`, { method: 'POST' }, []
    ),

  /** Liste des posts sauvegardés */
  myBookmarks: (params?: { limit?: number }) =>
    request<{ posts: SoKinApiFeedPost[] }>('/sokin/bookmarks', {
      params: { limit: params?.limit },
    }),

  /** Signaler un post */
  report: (id: string, body: { reason: SoKinReportReason; details?: string }) =>
    mutate<{ report: { id: string } }>(
      `/sokin/posts/${encodeURIComponent(id)}/report`, { method: 'POST', body }, []
    ),

  /** Reposter une publication */
  repost: (id: string, body?: { comment?: string }) =>
    mutate<SoKinApiFeedPost>(
      `/sokin/posts/${encodeURIComponent(id)}/repost`, { method: 'POST', body: body ?? {} }, ['/sokin/posts']
    ),

  /** État social sur plusieurs posts (réactions + bookmarks) */
  socialState: (postIds: string[]) =>
    request<{ reactions: Record<string, SoKinReactionType>; bookmarks: string[] }>(
      '/sokin/posts/social-state', { params: { postIds: postIds.join(',') } }
    ),
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
