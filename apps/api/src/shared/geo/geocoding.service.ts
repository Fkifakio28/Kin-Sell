/**
 * Service de géocodage — Google Maps Platform (multi-pays)
 *
 * - Autocomplete d'adresses (Places API)
 * - Géocodage : adresse → coordonnées
 * - Géocodage inversé : coordonnées → adresse
 * - Place Details → StructuredLocation complète
 */

import { env } from "../../config/env.js";
import { HttpError } from "../errors/http-error.js";
import { normalizeLocationFromGoogle, type StructuredLocation, type GoogleAddressComponent } from "./location.service.js";

const MAPS_BASE = "https://maps.googleapis.com/maps/api";

// Tous les pays Kin-Sell (ISO 3166-1 alpha-2)
const SUPPORTED_COUNTRIES = ["cd", "ga", "cg", "ao", "ci", "gn", "sn", "ma"];

function requireKey(): string {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new HttpError(503, "Google Maps API non configurée");
  return key;
}

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  city: string | null;
  country: string | null;
}

/**
 * Autocomplete d'adresses / lieux — multi-pays Afrique.
 * @param countryHint - Code pays ISO (ex: "cd", "ma") pour biaiser les résultats.
 *                      Si absent, les 8 pays supportés sont utilisés.
 */
export async function autocomplete(
  input: string,
  sessionToken?: string,
  countryHint?: string
): Promise<PlacePrediction[]> {
  const key = requireKey();
  const countries = countryHint
    ? [`country:${countryHint.toLowerCase()}`]
    : SUPPORTED_COUNTRIES.map((c) => `country:${c}`);

  const params = new URLSearchParams({
    input,
    key,
    language: "fr",
    components: countries.join("|"),
  });
  if (sessionToken) params.set("sessiontoken", sessionToken);

  const res = await fetch(`${MAPS_BASE}/place/autocomplete/json?${params}`);
  if (!res.ok) throw new HttpError(502, "Google Places API error");

  const data = (await res.json()) as {
    predictions: Array<{
      place_id: string;
      description: string;
      structured_formatting: { main_text: string; secondary_text: string };
    }>;
  };

  return data.predictions.map((p) => ({
    placeId: p.place_id,
    description: p.description,
    mainText: p.structured_formatting.main_text,
    secondaryText: p.structured_formatting.secondary_text,
  }));
}

/**
 * Obtenir les coordonnées et la structure complète d'un placeId.
 * Retourne un GeocodingResult basique pour rétro-compatibilité.
 */
export async function getPlaceDetails(placeId: string, sessionToken?: string): Promise<GeocodingResult> {
  const structured = await getPlaceDetailsStructured(placeId, sessionToken);
  return {
    latitude: structured.latitude,
    longitude: structured.longitude,
    formattedAddress: structured.formattedAddress,
    city: structured.city,
    country: structured.country,
  };
}

/**
 * Obtenir la structure complète normalisée d'un placeId.
 * Champs demandés limités pour optimiser les coûts.
 */
export async function getPlaceDetailsStructured(
  placeId: string,
  sessionToken?: string
): Promise<StructuredLocation> {
  const key = requireKey();
  const params = new URLSearchParams({
    place_id: placeId,
    key,
    fields: "geometry,formatted_address,address_components,place_id",
    language: "fr",
  });
  if (sessionToken) params.set("sessiontoken", sessionToken);

  const res = await fetch(`${MAPS_BASE}/place/details/json?${params}`);
  if (!res.ok) throw new HttpError(502, "Google Place Details API error");

  const data = (await res.json()) as {
    result: {
      geometry: { location: { lat: number; lng: number } };
      formatted_address: string;
      address_components: GoogleAddressComponent[];
      place_id: string;
    };
  };

  return normalizeLocationFromGoogle(
    data.result.address_components,
    data.result.geometry.location,
    data.result.formatted_address,
    data.result.place_id
  );
}

/**
 * Géocodage : adresse texte → coordonnées.
 * @param regionHint - Code pays ISO pour biaiser (ex: "cd", "ma").
 */
export async function geocodeAddress(address: string, regionHint?: string): Promise<GeocodingResult> {
  const key = requireKey();
  const params = new URLSearchParams({
    address,
    key,
    language: "fr",
  });
  if (regionHint) params.set("region", regionHint.toLowerCase());

  const res = await fetch(`${MAPS_BASE}/geocode/json?${params}`);
  if (!res.ok) throw new HttpError(502, "Google Geocoding API error");

  const data = (await res.json()) as {
    results: Array<{
      geometry: { location: { lat: number; lng: number } };
      formatted_address: string;
      address_components: Array<{ types: string[]; long_name: string }>;
    }>;
  };

  if (!data.results.length) throw new HttpError(404, "Adresse non trouvée");

  const first = data.results[0];
  const loc = first.geometry.location;
  const components = first.address_components;

  return {
    latitude: loc.lat,
    longitude: loc.lng,
    formattedAddress: first.formatted_address,
    city: components.find((c) => c.types.includes("locality"))?.long_name ?? null,
    country: components.find((c) => c.types.includes("country"))?.long_name ?? null,
  };
}

/**
 * Géocodage inversé : coordonnées → adresse lisible.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult> {
  const key = requireKey();
  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key,
    language: "fr",
  });

  const res = await fetch(`${MAPS_BASE}/geocode/json?${params}`);
  if (!res.ok) throw new HttpError(502, "Google Reverse Geocoding API error");

  const data = (await res.json()) as {
    results: Array<{
      geometry: { location: { lat: number; lng: number } };
      formatted_address: string;
      address_components: Array<{ types: string[]; long_name: string }>;
    }>;
  };

  if (!data.results.length) throw new HttpError(404, "Coordonnées non reconnues");

  const first = data.results[0];
  const components = first.address_components;

  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: first.formatted_address,
    city: components.find((c) => c.types.includes("locality"))?.long_name ?? null,
    country: components.find((c) => c.types.includes("country"))?.long_name ?? null,
  };
}

/**
 * Géocodage inversé structuré : coordonnées → StructuredLocation complète.
 */
export async function reverseGeocodeStructured(lat: number, lng: number): Promise<StructuredLocation> {
  const key = requireKey();
  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key,
    language: "fr",
  });

  const res = await fetch(`${MAPS_BASE}/geocode/json?${params}`);
  if (!res.ok) throw new HttpError(502, "Google Reverse Geocoding API error");

  const data = (await res.json()) as {
    results: Array<{
      geometry: { location: { lat: number; lng: number } };
      formatted_address: string;
      address_components: GoogleAddressComponent[];
      place_id?: string;
    }>;
  };

  if (!data.results.length) throw new HttpError(404, "Coordonnées non reconnues");

  const first = data.results[0];
  return normalizeLocationFromGoogle(
    first.address_components,
    { lat, lng },
    first.formatted_address,
    first.place_id
  );
}
