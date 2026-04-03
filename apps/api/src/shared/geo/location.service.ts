/**
 * Service de normalisation et gestion de la localisation
 *
 * - normalizeLocationFromGoogle() : parse les address_components Google Maps
 * - buildPublicLocationView() : filtre selon LocationVisibility
 * - buildPrivateLocationView() : retourne toutes les données au propriétaire
 */

// ── Types ──

export type LocationVisibility =
  | "EXACT_PUBLIC"
  | "DISTRICT_PUBLIC"
  | "CITY_PUBLIC"
  | "REGION_PUBLIC"
  | "COUNTRY_PUBLIC"
  | "EXACT_PRIVATE";

export interface StructuredLocation {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId: string | null;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  mapSource: "google_maps" | "manual" | "gps";
}

export interface PublicLocationView {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  displayLabel: string;
}

export interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

// ── Normalisation ──

/**
 * Parse les address_components de Google Maps en structure plate.
 */
export function normalizeLocationFromGoogle(
  addressComponents: GoogleAddressComponent[],
  geometry: { lat: number; lng: number },
  formattedAddress: string,
  placeId?: string
): StructuredLocation {
  const find = (type: string): string | null =>
    addressComponents.find((c) => c.types.includes(type))?.long_name ?? null;

  const findShort = (type: string): string | null =>
    addressComponents.find((c) => c.types.includes(type))?.short_name ?? null;

  return {
    latitude: geometry.lat,
    longitude: geometry.lng,
    formattedAddress,
    placeId: placeId ?? null,
    country: find("country"),
    countryCode: findShort("country"),      // ISO 3166-1 alpha-2 (ex: "CD", "MA")
    region: find("administrative_area_level_1"),
    city: find("locality") ?? find("administrative_area_level_2"),
    district:
      find("sublocality_level_1") ??
      find("sublocality") ??
      find("neighborhood") ??
      find("administrative_area_level_3"),
    postalCode: find("postal_code"),
    mapSource: "google_maps",
  };
}

// ── Vues publiques / privées ──

/**
 * Filtre les données de localisation selon le niveau de visibilité.
 * Utilisé pour les réponses API publiques.
 */
export function buildPublicLocationView(
  data: {
    country?: string | null;
    countryCode?: string | null;
    region?: string | null;
    city?: string | null;
    district?: string | null;
    formattedAddress?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    locationVisibility?: LocationVisibility | null;
  }
): PublicLocationView {
  const vis = data.locationVisibility ?? "CITY_PUBLIC";

  // Base : toujours le pays
  const view: PublicLocationView = {
    country: data.country ?? null,
    countryCode: data.countryCode ?? null,
    region: null,
    city: null,
    district: null,
    formattedAddress: null,
    latitude: null,
    longitude: null,
    displayLabel: data.country ?? "",
  };

  if (vis === "EXACT_PRIVATE" || vis === "COUNTRY_PUBLIC") {
    return view;
  }

  // REGION_PUBLIC et au-dessus
  if (vis === "REGION_PUBLIC" || vis === "CITY_PUBLIC" || vis === "DISTRICT_PUBLIC" || vis === "EXACT_PUBLIC") {
    view.region = data.region ?? null;
    view.displayLabel = [data.region, data.country].filter(Boolean).join(", ");
  }

  // CITY_PUBLIC et au-dessus
  if (vis === "CITY_PUBLIC" || vis === "DISTRICT_PUBLIC" || vis === "EXACT_PUBLIC") {
    view.city = data.city ?? null;
    view.displayLabel = [data.city, data.country].filter(Boolean).join(", ");
  }

  // DISTRICT_PUBLIC et au-dessus
  if (vis === "DISTRICT_PUBLIC" || vis === "EXACT_PUBLIC") {
    view.district = data.district ?? null;
    view.displayLabel = [data.district, data.city, data.country].filter(Boolean).join(", ");
    // Coordonnées arrondies (±0.01 ≈ 1km de précision)
    if (data.latitude != null && data.longitude != null) {
      view.latitude = Math.round(data.latitude * 100) / 100;
      view.longitude = Math.round(data.longitude * 100) / 100;
    }
  }

  // EXACT_PUBLIC : tout
  if (vis === "EXACT_PUBLIC") {
    view.formattedAddress = data.formattedAddress ?? null;
    view.latitude = data.latitude ?? null;
    view.longitude = data.longitude ?? null;
    view.displayLabel = data.formattedAddress ??
      [data.district, data.city, data.country].filter(Boolean).join(", ");
  }

  return view;
}

/**
 * Retourne toutes les données de localisation (pour le propriétaire / admin).
 */
export function buildPrivateLocationView(data: {
  country?: string | null;
  countryCode?: string | null;
  region?: string | null;
  city?: string | null;
  district?: string | null;
  postalCode?: string | null;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  locationVisibility?: LocationVisibility | null;
  serviceRadiusKm?: number | null;
  deliveryZones?: string[] | null;
}) {
  return {
    country: data.country ?? null,
    countryCode: data.countryCode ?? null,
    region: data.region ?? null,
    city: data.city ?? null,
    district: data.district ?? null,
    postalCode: data.postalCode ?? null,
    formattedAddress: data.formattedAddress ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    placeId: data.placeId ?? null,
    locationVisibility: data.locationVisibility ?? "CITY_PUBLIC",
    serviceRadiusKm: data.serviceRadiusKm ?? null,
    deliveryZones: data.deliveryZones ?? [],
  };
}
