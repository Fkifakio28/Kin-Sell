/**
 * Confidence Score & Source Attribution Service — Kin-Sell
 *
 * Provides confidence scoring and source attribution for all IA-generated data.
 * Every piece of intelligence is tagged with:
 *   - source: INTERNAL | EXTERNAL | HYBRID | INFERRED
 *   - confidence: 0..1
 *   - reasoning: why this confidence level
 *
 * Rules:
 *   - INTERNAL data (from Kin-Sell DB): confidence based on data volume
 *   - EXTERNAL data (from Gemini/web): confidence = 0.5 baseline, adjusted by freshness
 *   - HYBRID: weighted average of internal + external
 *   - INFERRED: extrapolated data, always ≤ 0.6
 *   - Never present EXTERNAL or INFERRED as internal facts
 */

export type DataSource = "INTERNAL" | "EXTERNAL" | "HYBRID" | "INFERRED";

export interface ConfidenceScore {
  source: DataSource;
  confidence: number; // 0..1
  reasoning: string;
  dataPoints: number;    // how many data points used
  freshness: "FRESH" | "RECENT" | "STALE"; // < 1 day | < 7 days | > 7 days
}

export interface ScoredInsight<T> {
  data: T;
  score: ConfidenceScore;
}

/**
 * Score internal data based on volume of data points.
 */
export function scoreInternal(dataPoints: number, label?: string): ConfidenceScore {
  let confidence: number;
  let reasoning: string;

  if (dataPoints >= 100) {
    confidence = 0.95;
    reasoning = `Basé sur ${dataPoints} points de données internes — très fiable`;
  } else if (dataPoints >= 30) {
    confidence = 0.8;
    reasoning = `Basé sur ${dataPoints} points de données internes — fiable`;
  } else if (dataPoints >= 10) {
    confidence = 0.65;
    reasoning = `Basé sur ${dataPoints} points de données internes — modérément fiable`;
  } else if (dataPoints >= 1) {
    confidence = 0.4;
    reasoning = `Seulement ${dataPoints} point(s) de données internes — données limitées`;
  } else {
    confidence = 0.1;
    reasoning = "Aucune donnée interne disponible";
  }

  if (label) reasoning = `[${label}] ${reasoning}`;

  return {
    source: "INTERNAL",
    confidence,
    reasoning,
    dataPoints,
    freshness: "FRESH",
  };
}

/**
 * Score external data (from Gemini/web grounding).
 */
export function scoreExternal(
  succeeded: boolean,
  ageHours: number = 0,
  sourceName?: string,
): ConfidenceScore {
  if (!succeeded) {
    return {
      source: "EXTERNAL",
      confidence: 0,
      reasoning: "Recherche externe échouée — données non disponibles",
      dataPoints: 0,
      freshness: "STALE",
    };
  }

  const freshness: "FRESH" | "RECENT" | "STALE" =
    ageHours < 24 ? "FRESH" : ageHours < 168 ? "RECENT" : "STALE";

  const baseConfidence = 0.55;
  const freshnessBonus = freshness === "FRESH" ? 0.15 : freshness === "RECENT" ? 0.05 : -0.1;
  const confidence = Math.min(0.8, Math.max(0.1, baseConfidence + freshnessBonus));

  const source = sourceName ? ` (${sourceName})` : "";
  return {
    source: "EXTERNAL",
    confidence,
    reasoning: `Données externes${source} — fraîcheur: ${freshness.toLowerCase()}`,
    dataPoints: 1,
    freshness,
  };
}

/**
 * Combine internal + external scores into a hybrid score.
 */
export function scoreHybrid(
  internal: ConfidenceScore,
  external: ConfidenceScore,
): ConfidenceScore {
  if (internal.dataPoints === 0 && external.confidence === 0) {
    return {
      source: "INFERRED",
      confidence: 0.1,
      reasoning: "Aucune donnée interne ni externe — estimation peu fiable",
      dataPoints: 0,
      freshness: "STALE",
    };
  }

  if (internal.dataPoints === 0) return { ...external, source: "EXTERNAL" };
  if (external.confidence === 0) return { ...internal, source: "INTERNAL" };

  // Weighted average: internal data is weighted more heavily
  const internalWeight = 0.65;
  const externalWeight = 0.35;
  const confidence = Math.min(
    0.95,
    internal.confidence * internalWeight + external.confidence * externalWeight,
  );

  return {
    source: "HYBRID",
    confidence,
    reasoning: `Combinaison données internes (${internal.dataPoints} points) + intelligence externe`,
    dataPoints: internal.dataPoints + external.dataPoints,
    freshness: internal.freshness === "FRESH" || external.freshness === "FRESH" ? "FRESH" : "RECENT",
  };
}

/**
 * Create an inferred score (extrapolated data).
 * Confidence is always capped at 0.6.
 */
export function scoreInferred(reasoning: string, baseDataPoints: number = 0): ConfidenceScore {
  return {
    source: "INFERRED",
    confidence: Math.min(0.6, 0.3 + baseDataPoints * 0.02),
    reasoning: `[Estimation] ${reasoning}`,
    dataPoints: baseDataPoints,
    freshness: "STALE",
  };
}

/**
 * Wrap any data with a confidence score.
 */
export function withScore<T>(data: T, score: ConfidenceScore): ScoredInsight<T> {
  return { data, score };
}
