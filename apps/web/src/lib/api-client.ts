/**
 * Kin-Sell API Client — Barrel Re-exports
 *
 * Ce fichier re-exporte tout depuis api-core et les services domaine.
 * Les imports existants (import { auth, orders, ... } from "lib/api-client")
 * continuent a fonctionner sans modification.
 *
 * Pour du nouveau code, importer directement depuis :
 *   - lib/api-core       (infrastructure: request, cache, tokens, ApiError)
 *   - lib/services/*     (services domaine: auth, orders, listings, ...)
 */

// Core infrastructure
export {
  API_BASE,
  resolveMediaUrl,
  invalidateCache,
  clearCache,
  getToken,
  setToken,
  getRefreshToken,
  setRefreshToken,
  setSessionId,
  clearToken,
  clearAuthSession,
  ApiError,
  health,
  request,
} from "./api-core";
export type { AccountUser } from "./api-core";

// Domain services
export * from "./services";
