/**
 * useRecoEngine — Moteur anti-spam de recommandations commerciales
 *
 * Rôle : orchestrer, prioriser, limiter et mémoriser les recommandations
 * pour éviter le spam. Un seul hook centralise tout le pipeline.
 *
 * Fonctionnalités :
 *  - Hiérarchie de priorité par type (CONTENT_TIP > BOOST > ADS > PLAN > ANALYTICS > STRATEGY)
 *  - Limitation : max N simultanées, max 1 par slot UI
 *  - Cooldown après fermeture (4 h par défaut)
 *  - Cooldown après vue sans fermeture (30 min)
 *  - Max 3 impressions/jour par recommandation
 *  - Détection de changement de contexte (fingerprint)
 *  - Stockage persistant dans localStorage
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

/* ═══════════════════════════════════════════ TYPES ═══════ */

/** Types de produits/recommandations (ordre = priorité descendante) */
export type RecoType =
  | "CONTENT_TIP"
  | "BOOST"
  | "ADS_PACK"
  | "ADS_PREMIUM"
  | "PLAN"
  | "ANALYTICS"
  | "STRATEGY";

/** Slots UI cibles — chaque slot ne peut contenir qu'1 reco à la fois */
export type RecoSlot =
  | "banner"
  | "card"
  | "tip"
  | "advisor"
  | "boost"
  | "upgrade"
  | "analytics";

/** Candidat soumis au moteur */
export interface RecoCandidate<T = unknown> {
  /** Identifiant unique stable (ex: `advice-BOOST-boost_3d`) */
  id: string;
  /** Type de la recommandation */
  type: RecoType;
  /** Slot UI ciblé */
  slot: RecoSlot;
  /** Priorité 1–10 (10 = priorité max) */
  priority: number;
  /** Confiance 0–100 (optionnel, sert de tie-breaker) */
  confidence?: number;
  /** Empreinte du contexte — si elle change, les cooldowns sont réinitialisés */
  contextKey?: string;
  /** Données métier à passer au composant KsReco */
  data: T;
}

/** Recommandation filtrée et prête à afficher */
export interface RecoResult<T = unknown> extends RecoCandidate<T> {
  /** Fonction pour fermer/dismisser cette reco */
  dismiss: () => void;
  /** Marque la reco comme "vue" (appelé automatiquement par le moteur) */
  markSeen: () => void;
}

/* ═══════════════════════════════════════════ CONFIG ═══════ */

export interface RecoEngineConfig {
  /** Max de recommandations visibles simultanément (défaut : 2) */
  maxSimultaneous?: number;
  /** Max par slot UI (défaut : 1) */
  maxPerSlot?: number;
  /** Cooldown après fermeture manuelle en ms (défaut : 4 h) */
  dismissCooldownMs?: number;
  /** Cooldown après simple vue en ms (défaut : 30 min) */
  seenCooldownMs?: number;
  /** Max d'impressions par jour par id (défaut : 3) */
  maxImpressionsPerDay?: number;
  /** Clé localStorage (défaut : "kr-reco-memory") */
  storageKey?: string;
}

const DEFAULT_CONFIG: Required<RecoEngineConfig> = {
  maxSimultaneous: 2,
  maxPerSlot: 1,
  dismissCooldownMs: 4 * 60 * 60 * 1000,   //  4 h
  seenCooldownMs: 30 * 60 * 1000,           // 30 min
  maxImpressionsPerDay: 3,
  storageKey: "kr-reco-memory",
};

/**
 * Priorité statique par type — plus c'est haut, plus ça passe en premier.
 * Sert de multiplicateur sur la priorité numérique du candidat.
 */
const TYPE_WEIGHT: Record<RecoType, number> = {
  CONTENT_TIP: 100,
  BOOST: 80,
  ADS_PACK: 60,
  ADS_PREMIUM: 55,
  PLAN: 40,
  ANALYTICS: 30,
  STRATEGY: 10,
};

/* ═══════════════════════════════════════════ STORAGE ═══════ */

interface DismissRecord {
  /** Timestamp de la fermeture */
  ts: number;
}

interface SeenRecord {
  /** Nombre d'impressions (compteur journalier) */
  count: number;
  /** Timestamp de la dernière impression */
  lastSeen: number;
  /** Jour ISO (YYYY-MM-DD) de comptage */
  day: string;
}

interface ContextRecord {
  /** Dernière empreinte de contexte connue */
  key: string;
}

interface RecoMemory {
  dismissed: Record<string, DismissRecord>;
  seen: Record<string, SeenRecord>;
  contexts: Record<string, ContextRecord>;
  /** Version du schéma pour migrations futures */
  v: number;
}

const MEMORY_VERSION = 1;

function emptyMemory(): RecoMemory {
  return { dismissed: {}, seen: {}, contexts: {}, v: MEMORY_VERSION };
}

function loadMemory(key: string): RecoMemory {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return emptyMemory();
    const parsed = JSON.parse(raw) as RecoMemory;
    if (parsed.v !== MEMORY_VERSION) return emptyMemory();
    return parsed;
  } catch {
    return emptyMemory();
  }
}

function saveMemory(key: string, mem: RecoMemory) {
  try {
    localStorage.setItem(key, JSON.stringify(mem));
  } catch {
    // quota dépassé — pas de crash
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ═══════════════════════════════════════════ ENGINE ═══════ */

function computeScore(c: RecoCandidate): number {
  const typeW = TYPE_WEIGHT[c.type] ?? 0;
  const conf = c.confidence ?? 50;
  // Score composite : poids type × priorité + confiance (0-1)
  return typeW * c.priority + conf / 100;
}

/**
 * Détermine si un candidat est éligible à l'affichage.
 */
function isEligible(
  c: RecoCandidate,
  mem: RecoMemory,
  now: number,
  cfg: Required<RecoEngineConfig>,
): boolean {
  const today = todayISO();

  // 1. Cooldown après dismiss
  const dismissRec = mem.dismissed[c.id];
  if (dismissRec) {
    const elapsed = now - dismissRec.ts;
    // Si le contexte a changé, ignorer le cooldown dismiss
    const ctxChanged = hasContextChanged(c, mem);
    if (!ctxChanged && elapsed < cfg.dismissCooldownMs) {
      return false;
    }
  }

  // 2. Cooldown après simple vue
  const seenRec = mem.seen[c.id];
  if (seenRec) {
    const elapsed = now - seenRec.lastSeen;
    const ctxChanged = hasContextChanged(c, mem);
    if (!ctxChanged && elapsed < cfg.seenCooldownMs) {
      return false;
    }

    // 3. Max impressions par jour
    if (seenRec.day === today && seenRec.count >= cfg.maxImpressionsPerDay) {
      return false;
    }
  }

  return true;
}

function hasContextChanged(c: RecoCandidate, mem: RecoMemory): boolean {
  if (!c.contextKey) return false;
  const stored = mem.contexts[c.id];
  if (!stored) return true; // jamais vu = contexte "nouveau"
  return stored.key !== c.contextKey;
}

/**
 * Pipeline complet : filtrer → trier → limiter
 */
function selectRecos<T>(
  candidates: RecoCandidate<T>[],
  mem: RecoMemory,
  cfg: Required<RecoEngineConfig>,
): RecoCandidate<T>[] {
  const now = Date.now();

  // Étape 1 : filtrer les non-éligibles
  const eligible = candidates.filter((c) => isEligible(c, mem, now, cfg));

  // Étape 2 : trier par score décroissant
  const sorted = [...eligible].sort((a, b) => computeScore(b) - computeScore(a));

  // Étape 3 : limiter par slot et total
  const slotCount: Record<string, number> = {};
  const result: RecoCandidate<T>[] = [];

  for (const c of sorted) {
    if (result.length >= cfg.maxSimultaneous) break;
    const sc = slotCount[c.slot] ?? 0;
    if (sc >= cfg.maxPerSlot) continue;
    slotCount[c.slot] = sc + 1;
    result.push(c);
  }

  return result;
}

/* ═══════════════════════════════════════════ HOOK ═══════ */

/**
 * Hook central anti-spam pour les recommandations commerciales.
 *
 * @example
 * ```tsx
 * const candidates = useMemo(() => [
 *   { id: "boost-3d", type: "BOOST", slot: "boost", priority: 8, data: { ... } },
 *   { id: "plan-pro", type: "PLAN", slot: "upgrade", priority: 5, data: { ... } },
 * ], []);
 *
 * const recos = useRecoEngine(candidates, { maxSimultaneous: 2 });
 *
 * return recos.map(r => <KsBanner key={r.id} {...r.data} onDismiss={r.dismiss} />);
 * ```
 */
export function useRecoEngine<T = unknown>(
  candidates: RecoCandidate<T>[],
  config?: RecoEngineConfig,
): RecoResult<T>[] {
  const cfg = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      config?.maxSimultaneous,
      config?.maxPerSlot,
      config?.dismissCooldownMs,
      config?.seenCooldownMs,
      config?.maxImpressionsPerDay,
      config?.storageKey,
    ],
  );

  const [memory, setMemory] = useState<RecoMemory>(() => loadMemory(cfg.storageKey));

  // Persist on change
  const memRef = useRef(memory);
  memRef.current = memory;
  useEffect(() => {
    saveMemory(cfg.storageKey, memory);
  }, [memory, cfg.storageKey]);

  // --- Actions ---

  const dismiss = useCallback(
    (id: string) => {
      setMemory((prev) => {
        const next: RecoMemory = {
          ...prev,
          dismissed: { ...prev.dismissed, [id]: { ts: Date.now() } },
        };
        return next;
      });
    },
    [],
  );

  const markSeen = useCallback(
    (id: string) => {
      const today = todayISO();
      setMemory((prev) => {
        const existing = prev.seen[id];
        const isSameDay = existing?.day === today;
        const next: RecoMemory = {
          ...prev,
          seen: {
            ...prev.seen,
            [id]: {
              count: isSameDay ? (existing?.count ?? 0) + 1 : 1,
              lastSeen: Date.now(),
              day: today,
            },
          },
        };
        return next;
      });
    },
    [],
  );

  // --- Update context fingerprints ---
  useEffect(() => {
    let changed = false;
    const newContexts = { ...memRef.current.contexts };
    for (const c of candidates) {
      if (c.contextKey) {
        const stored = newContexts[c.id];
        if (!stored || stored.key !== c.contextKey) {
          newContexts[c.id] = { key: c.contextKey };
          changed = true;
        }
      }
    }
    if (changed) {
      setMemory((prev) => ({ ...prev, contexts: newContexts }));
    }
    // only re-run when candidates identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  // --- Compute selection ---
  const selected = useMemo(
    () => selectRecos(candidates, memory, cfg),
    [candidates, memory, cfg],
  );

  // --- Auto mark seen ---
  const prevSelectedIds = useRef<string[]>([]);
  useEffect(() => {
    const currentIds = selected.map((s) => s.id);
    const newIds = currentIds.filter((id) => !prevSelectedIds.current.includes(id));
    prevSelectedIds.current = currentIds;
    for (const id of newIds) {
      markSeen(id);
    }
  }, [selected, markSeen]);

  // --- Build results ---
  const results: RecoResult<T>[] = useMemo(
    () =>
      selected.map((c) => ({
        ...c,
        dismiss: () => dismiss(c.id),
        markSeen: () => markSeen(c.id),
      })),
    [selected, dismiss, markSeen],
  );

  return results;
}

/* ═══════════════════════════════════════════ HELPERS ═══════ */

/**
 * Helper pour convertir les CommercialRecommendation du backend en candidats.
 */
export function adviceToCandidates(
  advices: Array<{
    productType: string;
    productCode: string;
    priority: number;
    confidence: number;
    title: string;
    message: string;
    rationale: string;
    ctaLabel: string;
    ctaTarget: string;
    pricing: string;
    signals: string[];
    metric: Record<string, number | string>;
  }>,
): RecoCandidate[] {
  return advices.map((a) => ({
    id: `advice-${a.productType}-${a.productCode}`,
    type: mapProductType(a.productType),
    slot: mapSlot(a.productType),
    priority: a.priority,
    confidence: a.confidence,
    contextKey: a.signals.sort().join("|"),
    data: {
      icon: typeIcon(a.productType),
      category: a.productType,
      title: a.title,
      message: a.message,
      rationale: a.rationale,
      ctaLabel: a.ctaLabel,
      ctaTarget: a.ctaTarget,
      pricing: a.pricing,
      signals: a.signals,
      metrics: a.metric,
    },
  }));
}

/**
 * Helper pour convertir les PricingNudge du backend en candidats.
 */
export function nudgeToCandidates(
  nudges: Array<{
    triggerType: string;
    priority: number;
    title: string;
    message: string;
    ctaLabel: string;
    ctaTarget: string;
    reason: string;
    metric?: Record<string, number | string>;
  }>,
): RecoCandidate[] {
  return nudges.map((n) => ({
    id: `nudge-${n.triggerType}`,
    type: "PLAN" as RecoType,
    slot: "upgrade" as RecoSlot,
    priority: n.priority,
    confidence: 60,
    contextKey: n.triggerType,
    data: {
      icon: "⚡",
      title: n.title,
      message: n.message,
      rationale: n.reason,
      ctaLabel: n.ctaLabel,
      ctaTarget: n.ctaTarget,
      metrics: n.metric,
    },
  }));
}

function mapProductType(pt: string): RecoType {
  switch (pt) {
    case "BOOST":
      return "BOOST";
    case "ADS_PACK":
      return "ADS_PACK";
    case "ADS_PREMIUM":
      return "ADS_PREMIUM";
    case "PLAN":
      return "PLAN";
    case "ANALYTICS":
      return "ANALYTICS";
    case "ADDON":
      return "BOOST";
    default:
      return "STRATEGY";
  }
}

function mapSlot(pt: string): RecoSlot {
  switch (pt) {
    case "BOOST":
      return "boost";
    case "ADS_PACK":
    case "ADS_PREMIUM":
      return "card";
    case "PLAN":
    case "ADDON":
      return "upgrade";
    case "ANALYTICS":
      return "analytics";
    default:
      return "banner";
  }
}

function typeIcon(pt: string): string {
  switch (pt) {
    case "BOOST":
      return "🚀";
    case "ADS_PACK":
      return "📢";
    case "ADS_PREMIUM":
      return "🌟";
    case "PLAN":
      return "⚡";
    case "ADDON":
      return "🔧";
    case "ANALYTICS":
      return "📊";
    default:
      return "💡";
  }
}

/**
 * Purge la mémoire — utile pour les tests ou un reset utilisateur.
 */
export function clearRecoMemory(storageKey = DEFAULT_CONFIG.storageKey) {
  localStorage.removeItem(storageKey);
}
