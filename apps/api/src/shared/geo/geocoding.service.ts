/**
 * Service de géocodage — OpenStreetMap Nominatim (multi-pays)
 *
 * - Autocomplete d'adresses (Nominatim search)
 * - Géocodage : adresse → coordonnées
 * - Géocodage inversé : coordonnées → adresse
 * - Structure complète → StructuredLocation
 *
 * Gratuit, sans clé API, respecte les conditions d'utilisation Nominatim :
 * - User-Agent obligatoire
 * - Max 1 requête/seconde (géré côté route par rate-limit global)
 */

import { HttpError } from "../errors/http-error.js";
import { normalizeLocationFromNominatim, type StructuredLocation } from "./location.service.js";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "KinSell/2.0 (https://kin-sell.com)";

// Tous les pays Kin-Sell (ISO 3166-1 alpha-2)
const SUPPORTED_COUNTRIES = ["cd", "ga", "cg", "ao", "ci", "gn", "sn", "ma"];

const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };

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

interface NominatimSearchResult {
  place_id: number;
  osm_id: number;
  osm_type: string;
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
  type?: string;
  class?: string;
}

interface NominatimAddress {
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  region?: string;
  country?: string;
  country_code?: string;
  postcode?: string;
  [key: string]: string | undefined;
}

/**
 * Autocomplete d'adresses / lieux — multi-pays Afrique.
 * Utilise Nominatim /search avec limit=5.
 */
export async function autocomplete(
  input: string,
  _sessionToken?: string,
  countryHint?: string
): Promise<PlacePrediction[]> {
  const countryCodes = countryHint
    ? countryHint.toLowerCase()
    : SUPPORTED_COUNTRIES.join(",");

  const params = new URLSearchParams({
    q: input,
    format: "json",
    addressdetails: "1",
    limit: "6",
    countrycodes: countryCodes,
    "accept-language": "fr",
  });

  const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, { headers });
  if (!res.ok) throw new HttpError(502, "Nominatim search error");

  const data = (await res.json()) as NominatimSearchResult[];

  return data.map((r) => {
    const addr = r.address ?? {};
    const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? "";
    const country = addr.country ?? "";
    const mainText = extractMainText(r);
    const secondaryText = [city, addr.state, country].filter(Boolean).join(", ");

    // Stocker osm_type+osm_id comme placeId (format attendu par /lookup : N123, W456, R789)
    const osmPrefix = r.osm_type === "node" ? "N" : r.osm_type === "way" ? "W" : "R";
    const osmPlaceId = `${osmPrefix}${r.osm_id}`;

    return {
      placeId: osmPlaceId,
      description: r.display_name,
      mainText: mainText || r.display_name.split(",")[0],
      secondaryText,
    };
  });
}

function extractMainText(r: NominatimSearchResult): string {
  const addr = r.address ?? {};
  return addr.road ?? addr.neighbourhood ?? addr.suburb ?? r.display_name.split(",")[0] ?? "";
}

/**
 * Obtenir les coordonnées et la structure d'un placeId Nominatim.
 */
export async function getPlaceDetails(placeId: string, _sessionToken?: string): Promise<GeocodingResult> {
  const structured = await getPlaceDetailsStructured(placeId, _sessionToken);
  return {
    latitude: structured.latitude,
    longitude: structured.longitude,
    formattedAddress: structured.formattedAddress,
    city: structured.city,
    country: structured.country,
  };
}

/**
 * Obtenir la structure complète d'un placeId Nominatim via /lookup.
 * Le placeId est au format OSM : "N123456", "W789", "R456" (node/way/relation + osm_id).
 */
export async function getPlaceDetailsStructured(
  placeId: string,
  _sessionToken?: string
): Promise<StructuredLocation> {
  const params = new URLSearchParams({
    osm_ids: placeId,
    format: "json",
    addressdetails: "1",
    "accept-language": "fr",
  });

  const res = await fetch(`${NOMINATIM_BASE}/lookup?${params}`, { headers });
  if (!res.ok) throw new HttpError(502, "Nominatim lookup error");

  const data = (await res.json()) as NominatimSearchResult[];
  if (!data.length) throw new HttpError(404, "Lieu non trouvé");

  const first = data[0];
  return normalizeLocationFromNominatim(first.address ?? {}, {
    lat: parseFloat(first.lat),
    lng: parseFloat(first.lon),
  }, first.display_name, placeId);
}

/**
 * Géocodage : adresse texte → coordonnées.
 */
export async function geocodeAddress(address: string, regionHint?: string): Promise<GeocodingResult> {
  const params = new URLSearchParams({
    q: address,
    format: "json",
    addressdetails: "1",
    limit: "1",
    "accept-language": "fr",
  });
  if (regionHint) params.set("countrycodes", regionHint.toLowerCase());

  const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, { headers });
  if (!res.ok) throw new HttpError(502, "Nominatim geocode error");

  const data = (await res.json()) as NominatimSearchResult[];
  if (!data.length) throw new HttpError(404, "Adresse non trouvée");

  const first = data[0];
  const addr = first.address ?? {};

  return {
    latitude: parseFloat(first.lat),
    longitude: parseFloat(first.lon),
    formattedAddress: first.display_name,
    city: addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? null,
    country: addr.country ?? null,
  };
}

/**
 * Géocodage inversé : coordonnées → adresse lisible.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "json",
    addressdetails: "1",
    "accept-language": "fr",
  });

  const res = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, { headers });
  if (!res.ok) throw new HttpError(502, "Nominatim reverse error");

  const data = (await res.json()) as NominatimSearchResult;
  if (!data.lat) throw new HttpError(404, "Coordonnées non reconnues");

  const addr = data.address ?? {};

  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: data.display_name,
    city: addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? null,
    country: addr.country ?? null,
  };
}

/**
 * Géocodage inversé structuré : coordonnées → StructuredLocation complète.
 */
export async function reverseGeocodeStructured(lat: number, lng: number): Promise<StructuredLocation> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "json",
    addressdetails: "1",
    "accept-language": "fr",
  });

  const res = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, { headers });
  if (!res.ok) throw new HttpError(502, "Nominatim reverse error");

  const data = (await res.json()) as NominatimSearchResult;
  if (!data.lat) throw new HttpError(404, "Coordonnées non reconnues");

  const osmPrefix = data.osm_type === "node" ? "N" : data.osm_type === "way" ? "W" : "R";
  const osmPlaceId = `${osmPrefix}${data.osm_id}`;

  return normalizeLocationFromNominatim(data.address ?? {}, { lat, lng }, data.display_name, osmPlaceId);
}
