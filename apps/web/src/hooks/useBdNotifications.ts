/**
 * Hook React pour le centre de notifications BD Kin-Sell.
 * - Charge la première page
 * - Écoute Socket.io `notification:new` pour pousser en haut + bump unread
 * - Expose actions : markRead / markAllRead / archive / remove / loadMore / refresh
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSocketContext } from "../app/providers/SocketProvider";
import { useAuth } from "../app/providers/AuthProvider";
import {
  notificationsBd,
  type BdNotification,
  type BdNotificationCategory,
} from "../lib/services/notifications-bd";

interface Options {
  pageSize?: number;
  category?: BdNotificationCategory;
  unreadOnly?: boolean;
  includeArchived?: boolean;
  enabled?: boolean;
}

export function useBdNotifications(opts: Options = {}) {
  const { pageSize = 20, category, unreadOnly, includeArchived, enabled = true } = opts;
  const { on, off } = useSocketContext();
  const { user } = useAuth();
  const isAuthed = !!user?.id && enabled;

  const [items, setItems] = useState<BdNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Garde la référence des params pour invalider quand ils changent
  const paramsKey = useMemo(
    () => JSON.stringify({ category, unreadOnly, includeArchived }),
    [category, unreadOnly, includeArchived],
  );
  const mountedRef = useRef(false);

  const loadFirstPage = useCallback(async () => {
    if (!isAuthed) return;
    setLoading(true);
    setError(null);
    try {
      const [list, count] = await Promise.all([
        notificationsBd.list({ limit: pageSize, category, unreadOnly, includeArchived }),
        notificationsBd.unreadCount().catch(() => ({ count: 0 })),
      ]);
      setItems(list.items);
      setNextCursor(list.nextCursor);
      setUnreadCount(count.count);
    } catch (e: any) {
      setError(e?.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [isAuthed, pageSize, category, unreadOnly, includeArchived]);

  useEffect(() => {
    void loadFirstPage();
    mountedRef.current = true;
  }, [loadFirstPage, paramsKey]);

  /* Socket — push live notifications */
  useEffect(() => {
    if (!isAuthed) return;
    const handler = (data: BdNotification) => {
      // Filtrer si une catégorie est sélectionnée
      if (category && data.category !== category) {
        // Toujours bumper le compteur global non-lu
        setUnreadCount((c) => c + 1);
        return;
      }
      setItems((prev) => {
        if (prev.some((n) => n.id === data.id)) return prev;
        return [data, ...prev];
      });
      setUnreadCount((c) => c + 1);
    };
    on("notification:new", handler);
    return () => off("notification:new", handler);
  }, [on, off, isAuthed, category]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const list = await notificationsBd.list({
        cursor: nextCursor,
        limit: pageSize,
        category,
        unreadOnly,
        includeArchived,
      });
      setItems((prev) => [...prev, ...list.items]);
      setNextCursor(list.nextCursor);
    } catch (e: any) {
      setError(e?.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading, pageSize, category, unreadOnly, includeArchived]);

  const markRead = useCallback(
    async (id: string) => {
      const target = items.find((n) => n.id === id);
      if (!target || target.readAt) return;
      // Optimiste
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await notificationsBd.markRead(id);
      } catch {
        // Rollback discret en cas d'erreur (rare)
        void loadFirstPage();
      }
    },
    [items, loadFirstPage],
  );

  const markAllRead = useCallback(async () => {
    if (unreadCount === 0) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    try {
      await notificationsBd.markAllRead();
    } catch {
      void loadFirstPage();
    }
  }, [unreadCount, loadFirstPage]);

  const archive = useCallback(
    async (id: string) => {
      const target = items.find((n) => n.id === id);
      if (!target) return;
      setItems((prev) => prev.filter((n) => n.id !== id));
      if (!target.readAt) setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await notificationsBd.archive(id);
      } catch {
        void loadFirstPage();
      }
    },
    [items, loadFirstPage],
  );

  const remove = useCallback(
    async (id: string) => {
      const target = items.find((n) => n.id === id);
      if (!target) return;
      setItems((prev) => prev.filter((n) => n.id !== id));
      if (!target.readAt) setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await notificationsBd.remove(id);
      } catch {
        void loadFirstPage();
      }
    },
    [items, loadFirstPage],
  );

  return {
    items,
    unreadCount,
    nextCursor,
    hasMore: !!nextCursor,
    loading,
    error,
    refresh: loadFirstPage,
    loadMore,
    markRead,
    markAllRead,
    archive,
    remove,
  };
}
