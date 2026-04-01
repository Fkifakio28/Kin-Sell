/**
 * Service de géocodage — Google Maps Platform
 *
 * - Autocomplete d'adresses (Places API)
 * - Géocodage : adresse → coordonnées
 * - Géocodage inversé : coordonnées → adresse
 */

import { env } from "../../config/env.js";
import { HttpError } from "../errors/http-error.js";

const MAPS_BASE = "https://maps.googleapis.com/maps/api";

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
 * Autocomplete d'adresses / lieux (biaisé vers Kinshasa, RDC).
 */
export async function autocomplete(input: string, sessionToken?: string): Promise<PlacePrediction[]> {
  const key = requireKey();
  const params = new URLSearchParams({
    input,
    key,
    language: "fr",
    components: "country:cd",
    // Biais vers Kinshasa (-4.32, 15.31)
    location: "-4.325,15.322",
    radius: "50000",
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
 * Obtenir les coordonnées d'un placeId (après autocomplete).
 */
export async function getPlaceDetails(placeId: string, sessionToken?: string): Promise<GeocodingResult> {
  const key = requireKey();
  const params = new URLSearchParams({
    place_id: placeId,
    key,
    fields: "geometry,formatted_address,address_components",
    language: "fr",
  });
  if (sessionToken) params.set("sessiontoken", sessionToken);

  const res = await fetch(`${MAPS_BASE}/place/details/json?${params}`);
  if (!res.ok) throw new HttpError(502, "Google Place Details API error");

  const data = (await res.json()) as {
    result: {
      geometry: { location: { lat: number; lng: number } };
      formatted_address: string;
      address_components: Array<{ types: string[]; long_name: string }>;
    };
  };

  const loc = data.result.geometry.location;
  const components = data.result.address_components;
  const city = components.find((c) => c.types.includes("locality"))?.long_name ?? null;
  const country = components.find((c) => c.types.includes("country"))?.long_name ?? null;

  return {
    latitude: loc.lat,
    longitude: loc.lng,
    formattedAddress: data.result.formatted_address,
    city,
    country,
  };
}

/**
 * Géocodage : adresse texte → coordonnées.
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult> {
  const key = requireKey();
  const params = new URLSearchParams({
    address,
    key,
    language: "fr",
    region: "cd",
  });

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
