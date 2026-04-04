import { request } from "../api-core";

export type PlacePrediction = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

export type GeocodingResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  city: string | null;
  country: string | null;
};

export type StructuredLocation = {
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
  mapSource: "openstreetmap" | "manual" | "gps";
};

export type LocationVisibility =
  | "EXACT_PUBLIC"
  | "DISTRICT_PUBLIC"
  | "CITY_PUBLIC"
  | "REGION_PUBLIC"
  | "COUNTRY_PUBLIC"
  | "EXACT_PRIVATE";

export const geo = {
  autocomplete: (input: string, sessionToken?: string, country?: string) =>
    request<{ predictions: PlacePrediction[] }>("/geo/autocomplete", {
      params: { input, ...(sessionToken ? { sessionToken } : {}), ...(country ? { country } : {}) },
    }),
  placeDetails: (placeId: string, sessionToken?: string) =>
    request<GeocodingResult>(`/geo/place/${encodeURIComponent(placeId)}`, {
      params: sessionToken ? { sessionToken } : undefined,
    }),
  placeDetailsStructured: (placeId: string, sessionToken?: string) =>
    request<StructuredLocation>(`/geo/place/${encodeURIComponent(placeId)}/structured`, {
      params: sessionToken ? { sessionToken } : undefined,
    }),
  geocode: (address: string, region?: string) =>
    request<GeocodingResult>("/geo/geocode", { params: { address, ...(region ? { region } : {}) } }),
  reverse: (lat: number, lng: number) =>
    request<GeocodingResult>("/geo/reverse", { params: { lat, lng } }),
  reverseStructured: (lat: number, lng: number) =>
    request<StructuredLocation>("/geo/reverse-structured", { params: { lat, lng } }),
};
