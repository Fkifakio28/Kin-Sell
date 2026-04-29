/**
 * Hook léger pour afficher le badge "non-lus" sur la cloche.
 * Utilise GET /notifications/unread-count + Socket `notification:new`.
 */
import { useCallback, useEffect, useState } from "react";
import { useSocketContext } from "../app/providers/SocketProvider";
import { useAuth } from "../app/providers/AuthProvider";
import { notificationsBd } from "../lib/services/notifications-bd";

export function useNotificationBadge() {
  const { on, off } = useSocketContext();
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!user?.id) {
      setCount(0);
      return;
    }
    notificationsBd
      .unreadCount()
      .then((r) => setCount(r.count))
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user?.id) return;
    const onNew = () => setCount((c) => c + 1);
    const onRead = () => refresh();
    on("notification:new", onNew);
    on("notification:read", onRead);
    return () => {
      off("notification:new", onNew);
      off("notification:read", onRead);
    };
  }, [on, off, user?.id, refresh]);

  return { count, refresh, setCount };
}
