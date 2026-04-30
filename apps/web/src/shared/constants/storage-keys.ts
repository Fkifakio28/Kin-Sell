/**
 * Clés localStorage centralisées.
 * Source unique — interdiction d'utiliser des chaînes en dur ailleurs.
 */

/* ── Auth ── */
export const SK_ACCESS_TOKEN = "kin-sell.token";
export const SK_REFRESH_TOKEN = "kin-sell.refresh-token";
export const SK_SESSION_ID = "kin-sell.session-id";

/* ── UI / UX ── */
export const SK_THEME = "kin-sell.theme";
export const SK_PUSH_BANNER_DISMISSED = "kinsell.push.banner.dismissedAt";

/* ── Locale & Currency ── */
export const SK_LANGUAGE = "ks-language";
export const SK_CURRENCY = "ks-currency";
export const SK_CURRENCY_RATES = "ks-currency-rates";
export const SK_CURRENCY_RATES_TS = "ks-currency-rates-ts";

/* ── Market Preference ── */
export const SK_MARKET_COUNTRY = "ks-market-country";
export const SK_MARKET_SELECTION_MODE = "ks-market-selection-mode";
/** Flag de migration : la valeur par défaut "GLOBAL" a été appliquée pour tous les utilisateurs. */
export const SK_MARKET_GLOBAL_DEFAULT_APPLIED = "ks-market-global-default-applied-v1";

/* ── Auth Form Memory ── */
export const SK_REMEMBERED_IDENTIFIER = "kin-sell.remembered-identifier";
export const SK_REMEMBERED_ROLE = "kin-sell.remembered-role";

/* ── AI Feature Toggles (User) ── */
export const SK_AI_ADVICE = "ks-ai-advice";

/* ── Permissions Onboarding ── */
export const SK_PERMISSIONS_DONE = "ks-permissions-onboarding-done";
export const SK_WELCOME_ONBOARDING_DONE = "ks-welcome-onboarding-done";
export const SK_AI_AUTO_NEGO = "ks-ai-auto-nego";
export const SK_AI_COMMANDE = "ks-ai-commande";

/* ── AI Feature Toggles (Business) ── */
export const SK_BIZ_AI_ADVICE = "ks-biz-ai-advice";
export const SK_BIZ_AI_AUTO_NEGO = "ks-biz-ai-auto-nego";
export const SK_BIZ_AI_COMMANDE = "ks-biz-ai-commande";
