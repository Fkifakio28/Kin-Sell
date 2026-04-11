export type PlanCatalogItem = {
  code: string;
  name: string;
  scope: "USER" | "BUSINESS";
  monthlyPriceUsdCents: number;
  features: string[];
  analyticsTier: "NONE" | "MEDIUM" | "PREMIUM";
};

export type AddonCatalogItem = {
  code: "IA_MERCHANT" | "IA_ORDER" | "BOOST_VISIBILITY" | "ADS_PACK" | "ADS_PREMIUM";
  name: string;
  priceLabel: string;
  scope: "ALL" | "USER" | "BUSINESS";
  details: string[];
};

export const USER_PLAN_CODES = ["FREE", "BOOST", "AUTO", "PRO_VENDOR"] as const;
export const BUSINESS_PLAN_CODES = ["STARTER", "BUSINESS", "SCALE"] as const;

export const PLAN_CATALOG: PlanCatalogItem[] = [
  {
    code: "FREE",
    name: "FREE",
    scope: "USER",
    monthlyPriceUsdCents: 0,
    analyticsTier: "NONE",
    features: ["POST_LISTINGS", "BUY", "MESSAGING", "IA_MERCHANT"]
  },
  {
    code: "FREE",
    name: "FREE",
    scope: "BUSINESS",
    monthlyPriceUsdCents: 0,
    analyticsTier: "NONE",
    features: ["SHOP"]
  },
  {
    code: "BOOST",
    name: "BOOST",
    scope: "USER",
    monthlyPriceUsdCents: 600,
    analyticsTier: "NONE",
    features: ["BOOST_PROFILE", "BOOST_LISTINGS", "BASIC_ADS", "BETTER_VISIBILITY"]
  },
  {
    code: "AUTO",
    name: "AUTO",
    scope: "USER",
    monthlyPriceUsdCents: 1200,
    analyticsTier: "NONE",
    features: ["BOOST_PROFILE", "BOOST_LISTINGS", "IA_ORDER", "AUTO_REPLY", "SALES_AUTOMATION"]
  },
  {
    code: "PRO_VENDOR",
    name: "PRO VENDEUR",
    scope: "USER",
    monthlyPriceUsdCents: 2000,
    analyticsTier: "MEDIUM",
    features: ["IA_ORDER", "AUTO_REPLY", "SALES_AUTOMATION", "ANALYTICS_MEDIUM"]
  },
  {
    code: "STARTER",
    name: "STARTER",
    scope: "BUSINESS",
    monthlyPriceUsdCents: 1500,
    analyticsTier: "NONE",
    features: ["SHOP", "BASIC_VISIBILITY", "BASIC_ADS"]
  },
  {
    code: "BUSINESS",
    name: "BUSINESS",
    scope: "BUSINESS",
    monthlyPriceUsdCents: 3000,
    analyticsTier: "MEDIUM",
    features: ["SHOP", "BASIC_VISIBILITY", "BASIC_ADS", "IA_MERCHANT", "IA_ORDER", "ANALYTICS_MEDIUM"]
  },
  {
    code: "SCALE",
    name: "SCALE",
    scope: "BUSINESS",
    monthlyPriceUsdCents: 5000,
    analyticsTier: "PREMIUM",
    features: ["SHOP", "BASIC_VISIBILITY", "BASIC_ADS", "IA_MERCHANT", "IA_ORDER", "ANALYTICS_PREMIUM"]
  }
];

export const ADDON_CATALOG: AddonCatalogItem[] = [
  {
    code: "IA_MERCHANT",
    name: "IA marchand",
    priceLabel: "3$/mois",
    scope: "ALL",
    details: ["Aide négociation", "Suggestion prix", "Contre-offres", "Gratuite sur plan utilisateur FREE"]
  },
  {
    code: "IA_ORDER",
    name: "IA commande",
    priceLabel: "7$/mois",
    scope: "ALL",
    details: ["Automation vente", "Réponse auto", "Suivi client"]
  },
  {
    code: "BOOST_VISIBILITY",
    name: "Boost visibilité",
    priceLabel: "1$/24h · 5$/7j · 15$/30j",
    scope: "ALL",
    details: ["Boost profil/boutique", "Priorité locale", "Durée flexible"]
  },
  {
    code: "ADS_PACK",
    name: "Pack publicité",
    priceLabel: "3 pubs 5$ · 7 pubs 10$ · 10 pubs 15$",
    scope: "ALL",
    details: ["Diffusion multi-zones", "Budget maîtrisé", "Format marketplace"]
  },
  {
    code: "ADS_PREMIUM",
    name: "Publicité premium",
    priceLabel: "25$",
    scope: "ALL",
    details: ["Homepage", "Top résultats", "Ciblage ville"]
  }
];

export function getPlanOrThrow(planCode: string, scope: "USER" | "BUSINESS") {
  const plan = PLAN_CATALOG.find((item) => item.code === planCode && item.scope === scope);
  if (!plan) {
    throw new Error("Plan invalide pour ce scope");
  }
  return plan;
}
