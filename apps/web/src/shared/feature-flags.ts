/**
 * Feature flags lus depuis les variables d'environnement Vite.
 *
 * Toutes les variables sont stringifiées par Vite. Pour rester prod-safe,
 * un flag absent (undefined) ou non strictement égal à "true" est considéré comme false.
 */

/**
 * Active l'onglet "Téléphone (OTP)" sur les pages /register et /login.
 *
 * - false par défaut (variable absente) → onglet caché → prod-safe.
 * - true uniquement si VITE_ENABLE_PHONE_AUTH=true dans le .env du build.
 *
 * À garder désactivé en prod tant que Beem (Sender Name "Kin-sell") n'est pas
 * approuvé pour la couverture multi-pays. La sandbox Africa's Talking peut être
 * utilisée en local en mettant VITE_ENABLE_PHONE_AUTH=true.
 */
export const isPhoneAuthEnabled =
  import.meta.env.VITE_ENABLE_PHONE_AUTH === "true";
