/**
 * Service client API — Centre de notifications persistant Kin-Sell.
 *
 * Communique avec :
 *   - GET    /notifications              liste paginée
 *   - GET    /notifications/unread-count compteur badge
 *   - PATCH  /notifications/:id/read     marquer lu
 *   - POST   /notifications/read-all     tout marquer lu
 *   - POST   /notifications/:id/archive  archiver
 *   - DELETE /notifications/:id          supprimer
 *   - GET    /notifications/preferences  lire prefs granulaires
 *   - PUT    /notifications/preferences  mettre à jour prefs
 */
import { request } from "../api-core";

export type BdNotificationCategory =
  | "ORDER" | "NEGOTIATION" | "PAYMENT" | "MESSAGE" | "SOCIAL" | "SYSTEM" | "AI" | "PROMO";

export interface BdNotification {
  id: string;
  category: BdNotificationCategory;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  url: string | null;
  icon: string | null;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface BdNotificationsListResult {
  items: BdNotification[];
  nextCursor: string | null;
}

export interface BdListParams {
  cursor?: string;
  limit?: number;
  category?: BdNotificationCategory;
  unreadOnly?: boolean;
  includeArchived?: boolean;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  marketingEmails: boolean;
  notifyOrderEmail: boolean;
  notifyOrderPush: boolean;
  notifyOrderInApp: boolean;
  notifyNegotiationEmail: boolean;
  notifyNegotiationPush: boolean;
  notifyNegotiationInApp: boolean;
  notifyPaymentEmail: boolean;
  notifyPaymentPush: boolean;
  notifyPaymentInApp: boolean;
  notifyMessageEmail: boolean;
  notifyMessagePush: boolean;
  notifyMessageInApp: boolean;
  notifySocialEmail: boolean;
  notifySocialPush: boolean;
  notifySocialInApp: boolean;
  notifySystemEmail: boolean;
  notifySystemPush: boolean;
  notifySystemInApp: boolean;
}

export const notificationsBd = {
  list(params: BdListParams = {}): Promise<BdNotificationsListResult> {
    const qs: Record<string, string | number> = {};
    if (params.cursor) qs.cursor = params.cursor;
    if (params.limit) qs.limit = params.limit;
    if (params.category) qs.category = params.category;
    if (params.unreadOnly) qs.unreadOnly = "true";
    if (params.includeArchived) qs.includeArchived = "true";
    return request<BdNotificationsListResult>("/notifications", { params: qs });
  },
  unreadCount(): Promise<{ count: number }> {
    return request<{ count: number }>("/notifications/unread-count");
  },
  markRead(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/notifications/${id}/read`, { method: "PATCH", body: {} });
  },
  markAllRead(): Promise<{ ok: true; count: number }> {
    return request<{ ok: true; count: number }>("/notifications/read-all", { method: "POST", body: {} });
  },
  archive(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/notifications/${id}/archive`, { method: "POST", body: {} });
  },
  remove(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/notifications/${id}`, { method: "DELETE" });
  },
  getPreferences(): Promise<NotificationPreferences> {
    return request<NotificationPreferences>("/notifications/preferences");
  },
  updatePreferences(patch: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    return request<NotificationPreferences>("/notifications/preferences", { method: "PUT", body: patch });
  },
};
