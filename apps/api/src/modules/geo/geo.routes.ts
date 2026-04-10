/**
 * Routes Géolocalisation — OpenStreetMap Nominatim (multi-pays)
 *
 * GET  /geo/autocomplete?input=...&country=...  → Suggestions de lieux
 * GET  /geo/place/:placeId                      → Détails basiques (rétro-compat)
 * GET  /geo/place/:placeId/structured           → Détails complets (StructuredLocation)
 * GET  /geo/geocode?address=...&region=...      → Adresse → coordonnées
 * GET  /geo/reverse?lat=...&lng=...             → Coordonnées → adresse
 * GET  /geo/reverse-structured?lat=...&lng=...  → Coordonnées → StructuredLocation
 */

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import * as geocodingService from "../../shared/geo/geocoding.service.js";

const router = Router();

const autocompleteSchema = z.object({
  input: z.string().min(2).max(200),
  sessionToken: z.string().optional(),
  country: z.string().min(2).max(2).optional(), // ISO 3166-1 alpha-2
});

const geocodeSchema = z.object({
  address: z.string().min(2).max(300),
  region: z.string().min(2).max(2).optional(),
});

const reverseSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/**
 * Autocomplete de lieux — multi-pays Afrique.
 */
router.get(
  "/autocomplete",
  rateLimit(RateLimits.PUBLIC_SEARCH),
  asyncHandler(async (request, response) => {
    const { input, sessionToken, country } = autocompleteSchema.parse(request.query);
    const predictions = await geocodingService.autocomplete(input, sessionToken, country);
    response.json({ predictions });
  })
);

/**
 * Détails d'un lieu → coordonnées GPS (rétro-compatibilité).
 */
router.get(
  "/place/:placeId",
  rateLimit(RateLimits.PUBLIC_SEARCH),
  asyncHandler(async (request, response) => {
    const placeId = request.params.placeId;
    const sessionToken = (request.query.sessionToken as string) || undefined;
    const details = await geocodingService.getPlaceDetails(placeId, sessionToken);
    response.json(details);
  })
);

/**
 * Détails d'un lieu → StructuredLocation complète.
 */
router.get(
  "/place/:placeId/structured",
  rateLimit(RateLimits.PUBLIC_SEARCH),
  asyncHandler(async (request, response) => {
    const placeId = request.params.placeId;
    const sessionToken = (request.query.sessionToken as string) || undefined;
    const details = await geocodingService.getPlaceDetailsStructured(placeId, sessionToken);
    response.json(details);
  })
);

/**
 * Géocodage : adresse texte → coordonnées.
 */
router.get(
  "/geocode",
  rateLimit(RateLimits.PUBLIC_SEARCH),
  asyncHandler(async (request, response) => {
    const { address, region } = geocodeSchema.parse(request.query);
    const result = await geocodingService.geocodeAddress(address, region);
    response.json(result);
  })
);

/**
 * Géocodage inversé : coordonnées → adresse.
 */
router.get(
  "/reverse",
  rateLimit(RateLimits.PUBLIC_SEARCH),
  asyncHandler(async (request, response) => {
    const { lat, lng } = reverseSchema.parse(request.query);
    const result = await geocodingService.reverseGeocode(lat, lng);
    response.json(result);
  })
);

/**
 * Géocodage inversé structuré : coordonnées → StructuredLocation complète.
 */
router.get(
  "/reverse-structured",
  rateLimit(RateLimits.PUBLIC_SEARCH),
  asyncHandler(async (request, response) => {
    const { lat, lng } = reverseSchema.parse(request.query);
    const result = await geocodingService.reverseGeocodeStructured(lat, lng);
    response.json(result);
  })
);

export default router;
