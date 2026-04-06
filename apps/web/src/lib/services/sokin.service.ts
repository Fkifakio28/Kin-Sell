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

export const sokin = {
  myPosts: () =>
    request<{ posts: SoKinApiPost[] }>('/sokin/posts/mine'),
  createPost: (body: { text: string; mediaUrls?: string[]; location?: string; tags?: string[]; hashtags?: string[]; scheduledAt?: string }) =>
    mutate<SoKinApiPost>('/sokin/posts', { method: 'POST', body }, ['/sokin/posts']),
  archivePost: (id: string) =>
    mutate<SoKinApiPost>(`/sokin/posts/${encodeURIComponent(id)}/archive`, { method: 'PATCH' }, ['/sokin/posts']),
  deletePost: (id: string) =>
    mutate<{ success: boolean }>(`/sokin/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }, ['/sokin/posts']),
  publicFeed: (params?: { limit?: number; offset?: number; cursor?: string; city?: string; country?: string }) =>
    request<{ posts: SoKinApiFeedPost[] }>('/sokin/posts', {
      params: {
        limit: params?.limit,
        offset: params?.offset,
        cursor: params?.cursor,
        city: params?.city,
        country: params?.country,
      },
    }),
  publicPost: (id: string) =>
    request<{ post: SoKinApiFeedPost }>(`/sokin/posts/${encodeURIComponent(id)}`),
  postComments: (id: string, params?: { limit?: number }) =>
    request<{ comments: SoKinApiComment[] }>(`/sokin/posts/${encodeURIComponent(id)}/comments`, {
      params: {
        limit: params?.limit,
      },
    }),
  createComment: (id: string, body: { content: string; parentCommentId?: string }) =>
    mutate<{ comment: SoKinApiComment }>(`/sokin/posts/${encodeURIComponent(id)}/comments`, { method: 'POST', body }, [`/sokin/posts/${encodeURIComponent(id)}/comments`, `/sokin/posts/${encodeURIComponent(id)}`]),
  publicUsers: (params?: { city?: string; search?: string; country?: string }) =>
    request<{ users: SoKinPublicUser[] }>('/sokin/users', {
      params: params as Record<string, string | undefined>,
    }),
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
