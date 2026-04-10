/**
 * useRealtimeSync — Invalidation centralisée via socket events.
 *
 * Stratégie unifiée :
 * - Écoute les événements socket (message, order, negotiation, cart, sokin)
 * - Déclenche des callbacks ciblés sans refetch global
 * - Gère le rattrapage automatique après reconnexion (ks:socket-reconnected)
 * - Gère la visibilité de l'onglet (refetch si caché > seuil)
 * - Remplace le polling dispersé par du push événementiel
 *
 * Événements supportés :
 *   message:new, message:edited, message:deleted, conversation:read
 *   order:created, order:status-updated, order:delivery-confirmed
 *   negotiation:updated, negotiation:expired
 *   cart:updated
 *   sokin:post-created
 */

import { useCallback, useEffect, useRef } from "react";
import { useSocketContext } from "../app/providers/SocketProvider";
import { useAuth } from "../app/providers/AuthProvider";

/* ── Types ── */

export type RealtimeChannel =
  | "messaging"
  | "orders"
  | "negotiations"
  | "cart"
  | "sokin";

export type RealtimeEvent =
  | { channel: "messaging"; event: "message:new" | "message:edited" | "message:deleted" | "conversation:read"; data: any }
  | { channel: "orders"; event: "order:created" | "order:status-updated" | "order:delivery-confirmed"; data: any }
  | { channel: "negotiations"; event: "negotiation:updated" | "negotiation:expired"; data: any }
  | { channel: "cart"; event: "cart:updated"; data: any }
  | { channel: "sokin"; event: "sokin:post-created"; data: any };

type InvalidateCallback = (event: RealtimeEvent) => void;
type ReconnectCallback = (staleSeconds: number) => void;

interface UseRealtimeSyncOptions {
  /** Channels à surveiller */
  channels: RealtimeChannel[];
  /** Callback quand un événement de ces channels arrive */
  onInvalidate: InvalidateCallback;
  /** Callback sur reconnexion socket (reçoit la durée d'absence en secondes) */
  onReconnect?: ReconnectCallback;
  /** Seuil de tab-hidden en ms avant resync au retour (défaut: 10s) */
  visibilityThresholdMs?: number;
  /** Callback quand l'onglet redevient visible après le seuil  */
  onVisibilityResync?: () => void;
  /** Activé seulement si true (défaut: true) */
  enabled?: boolean;
}

/* ── Mapping événement → channel ── */

const EVENT_CHANNEL_MAP: Record<string, RealtimeChannel> = {
  "message:new": "messaging",
  "message:edited": "messaging",
  "message:deleted": "messaging",
  "conversation:read": "messaging",
  "order:created": "orders",
  "order:status-updated": "orders",
  "order:delivery-confirmed": "orders",
  "negotiation:updated": "negotiations",
  "negotiation:expired": "negotiations",
  "cart:updated": "cart",
  "sokin:post-created": "sokin",
};

/* ── Hook ── */

export function useRealtimeSync(options: UseRealtimeSyncOptions) {
  const {
    channels,
    onInvalidate,
    onReconnect,
    visibilityThresholdMs = 10_000,
    onVisibilityResync,
    enabled = true,
  } = options;

  const { socketRef, isConnected } = useSocketContext();
  const { isLoggedIn } = useAuth();

  // Refs stables pour éviter abonnements/désabonnements inutiles
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;
  const onVisibilityResyncRef = useRef(onVisibilityResync);
  onVisibilityResyncRef.current = onVisibilityResync;
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  // Timestamp dernière déconnexion pour calculer durée d'absence
  const disconnectedAtRef = useRef<number | null>(null);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isConnected) {
      disconnectedAtRef.current = disconnectedAtRef.current ?? Date.now();
    } else {
      disconnectedAtRef.current = null;
    }
  }, [isConnected]);

  /* ── Socket events → invalidation ciblée ── */
  useEffect(() => {
    if (!enabled || !isLoggedIn) return;
    const socket = socketRef.current;
    if (!socket) return;

    const relevantEvents = Object.entries(EVENT_CHANNEL_MAP)
      .filter(([, ch]) => channelsRef.current.includes(ch))
      .map(([evt]) => evt);

    const handlers = new Map<string, (data: any) => void>();

    for (const evt of relevantEvents) {
      const handler = (data: any) => {
        const ch = EVENT_CHANNEL_MAP[evt];
        if (!ch) return;
        onInvalidateRef.current({ channel: ch, event: evt as any, data });
      };
      handlers.set(evt, handler);
      socket.on(evt, handler);
    }

    return () => {
      for (const [evt, handler] of handlers) {
        socket.off(evt, handler);
      }
    };
  // On re-subscribe quand le socket change (reconnexion) ou quand enabled/loggedIn change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isLoggedIn, isConnected]);

  /* ── Reconnexion rattrapage ── */
  useEffect(() => {
    if (!enabled || !isLoggedIn) return;

    const handleReconnect = () => {
      const staleMs = disconnectedAtRef.current
        ? Date.now() - disconnectedAtRef.current
        : 0;
      const staleSec = Math.round(staleMs / 1000);
      onReconnectRef.current?.(staleSec);
    };

    window.addEventListener("ks:socket-reconnected", handleReconnect);
    return () => window.removeEventListener("ks:socket-reconnected", handleReconnect);
  }, [enabled, isLoggedIn]);

  /* ── Visibilité onglet ── */
  useEffect(() => {
    if (!enabled || !isLoggedIn) return;

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
      } else {
        const elapsed = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
        hiddenAtRef.current = null;
        if (elapsed > visibilityThresholdMs) {
          onVisibilityResyncRef.current?.();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled, isLoggedIn, visibilityThresholdMs]);

  return { isConnected };
}
