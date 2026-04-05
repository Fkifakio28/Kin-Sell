import { request, mutate } from "../api-core";

// ══════════════════════════════════════════════
// VERIFICATION BADGE — Frontend Service
// ══════════════════════════════════════════════

export interface CredibilityMetrics {
  completedOrders: number;
  avgRating: number;
  reviewCount: number;
  avgResponseTimeMinutes: number;
  avgTransactionDays: number;
  disputeCount: number;
  reportCount: number;
  accountAgeDays: number;
  profileComplete: boolean;
  listingsCount: number;
  activityScore: number;
}

export interface VerificationHistoryEntry {
  id: string;
  requestId: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  source: string;
  performedBy: string | null;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface VerificationRequestData {
  id: string;
  userId: string | null;
  businessId: string | null;
  source: string;
  status: string;
  adminLocked: boolean;
  aiScore: number | null;
  aiRecommendation: string | null;
  aiEvaluatedAt: string | null;
  adminNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  metricsSnapshot: CredibilityMetrics | null;
  createdAt: string;
  updatedAt: string;
  history: VerificationHistoryEntry[];
  user?: { id: string; email: string; phone: string; trustScore: number; profile: { displayName: string; verificationStatus: string } | null };
  business?: { id: string; publicName: string; verificationStatus: string } | null;
  resolver?: { id: string; email: string; profile: { displayName: string } | null } | null;
  freshAiScore?: number;
  freshMetrics?: CredibilityMetrics;
  freshRecommendation?: string;
}

export interface VerificationStatusResponse {
  userStatus: string;
  businesses: { id: string; name: string; status: string }[];
  latestRequest: VerificationRequestData | null;
}

export interface CredibilityScoreResponse {
  score: number;
  metrics: CredibilityMetrics;
  recommendation: string;
  eligible: boolean;
}

export interface VerificationListResponse {
  requests: VerificationRequestData[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ─── USER ENDPOINTS ───────────────────────────

export const verification = {
  // Soumettre une demande
  requestVerification: (accountType: "USER" | "BUSINESS", businessId?: string) =>
    mutate<VerificationRequestData>(
      "/verification/request",
      { method: "POST", body: { accountType, businessId } },
      ["/verification"]
    ),

  // Mon statut
  getStatus: () =>
    request<VerificationStatusResponse>("/verification/status"),

  // Mon score de crédibilité
  getCredibility: () =>
    request<CredibilityScoreResponse>("/verification/credibility"),

  // Score crédibilité d'un business
  getBusinessCredibility: (businessId: string) =>
    request<CredibilityScoreResponse>(`/verification/credibility/business/${businessId}`),

  // ─── ADMIN ENDPOINTS ─────────────────────────

  admin: {
    // Liste des demandes
    getRequests: (filters?: { status?: string; page?: number; limit?: number }) =>
      request<VerificationListResponse>("/verification/admin/requests", { params: filters as any }),

    // Détail d'une demande
    getDetail: (id: string) =>
      request<VerificationRequestData>(`/verification/admin/requests/${encodeURIComponent(id)}`),

    // Actions admin
    approve: (id: string, note?: string) =>
      mutate<VerificationRequestData>(
        `/verification/admin/requests/${encodeURIComponent(id)}/approve`,
        { method: "PATCH", body: { note } },
        ["/verification"]
      ),

    reject: (id: string, note?: string) =>
      mutate<VerificationRequestData>(
        `/verification/admin/requests/${encodeURIComponent(id)}/reject`,
        { method: "PATCH", body: { note } },
        ["/verification"]
      ),

    revoke: (id: string, note?: string) =>
      mutate<VerificationRequestData>(
        `/verification/admin/requests/${encodeURIComponent(id)}/revoke`,
        { method: "PATCH", body: { note } },
        ["/verification"]
      ),

    lockVerified: (id: string, note?: string) =>
      mutate<VerificationRequestData>(
        `/verification/admin/requests/${encodeURIComponent(id)}/lock-verified`,
        { method: "PATCH", body: { note } },
        ["/verification"]
      ),

    lockRevoked: (id: string, note?: string) =>
      mutate<VerificationRequestData>(
        `/verification/admin/requests/${encodeURIComponent(id)}/lock-revoked`,
        { method: "PATCH", body: { note } },
        ["/verification"]
      ),

    reactivate: (id: string, note?: string) =>
      mutate<VerificationRequestData>(
        `/verification/admin/requests/${encodeURIComponent(id)}/reactivate`,
        { method: "PATCH", body: { note } },
        ["/verification"]
      ),

    // Lancer un scan IA manuellement
    runAiScan: () =>
      mutate<{ check: unknown; scan: unknown }>(
        "/verification/admin/ai-scan",
        { method: "POST" },
        ["/verification"]
      ),
  },
};
