import { request, mutate } from "../api-core";

export type MessageUser = {
  id: string;
  role?: string;
  profile: { displayName: string; avatarUrl: string | null; username: string | null };
};

export type ConversationParticipant = {
  id: string;
  conversationId: string;
  userId: string;
  lastReadAt: string;
  isAdmin: boolean;
  muted: boolean;
  user: MessageUser;
};

export type MessageReplyTo = {
  id: string;
  content: string | null;
  type: string;
  sender: { profile: { displayName: string } };
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "FILE" | "SYSTEM";
  content: string | null;
  mediaUrl: string | null;
  fileName: string | null;
  replyToId: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  sender: MessageUser;
  replyTo: MessageReplyTo | null;
  readReceipts: Array<{ userId: string; readAt: string }>;
};

export type ConversationSummary = {
  id: string;
  isGroup: boolean;
  groupName: string | null;
  groupAvatar: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ConversationParticipant[];
  messages: ChatMessage[];
  unreadCount: number;
};

export type CallLogEntry = {
  id: string;
  conversationId: string;
  callerUserId: string;
  receiverUserId: string;
  callType: "AUDIO" | "VIDEO";
  status: "MISSED" | "ANSWERED" | "REJECTED" | "NO_ANSWER";
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  caller: { id: string; profile: { displayName: string; avatarUrl: string | null; username: string | null } };
  receiver: { id: string; profile: { displayName: string; avatarUrl: string | null; username: string | null } };
};

export const messaging = {
  conversations: () =>
    request<{ conversations: ConversationSummary[] }>("/messaging/conversations"),

  createDM: (targetUserId: string) =>
    mutate<{ conversation: ConversationSummary }>("/messaging/conversations/dm", { method: "POST", body: { targetUserId } }, ["/messaging/conversations"]),

  createGroup: (memberIds: string[], groupName: string) =>
    mutate<{ conversation: ConversationSummary }>("/messaging/conversations/group", { method: "POST", body: { memberIds, groupName } }, ["/messaging/conversations"]),

  messages: (conversationId: string, cursor?: string) =>
    request<{ messages: ChatMessage[] }>(`/messaging/conversations/${conversationId}/messages`, { params: { cursor, limit: 50 } }),

  sendMessage: (conversationId: string, body: { content?: string; type?: string; mediaUrl?: string; fileName?: string; replyToId?: string }) =>
    mutate<{ message: ChatMessage }>(`/messaging/conversations/${conversationId}/messages`, { method: "POST", body }, [`/messaging/conversations/${conversationId}`, "/messaging/conversations"]),

  editMessage: (messageId: string, content: string) =>
    mutate<{ message: ChatMessage }>(`/messaging/messages/${messageId}`, { method: "PATCH", body: { content } }, ["/messaging"]),

  deleteMessage: (messageId: string) =>
    mutate<{ ok: boolean }>(`/messaging/messages/${messageId}`, { method: "DELETE" }, ["/messaging"]),

  markRead: (conversationId: string) =>
    mutate<{ ok: boolean }>(`/messaging/conversations/${conversationId}/read`, { method: "POST" }, [`/messaging/conversations`]),

  searchUsers: (q: string) =>
    request<{ users: Array<{ id: string; profile: { displayName: string; avatarUrl: string | null; username: string | null; city: string | null } }> }>("/messaging/users/search", { params: { q } }),

  callLogs: (cursor?: string) =>
    request<{ callLogs: CallLogEntry[] }>("/messaging/call-logs", { params: cursor ? { cursor } : {} }),
};
