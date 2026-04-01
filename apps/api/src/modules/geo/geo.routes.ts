/**
 * Routes Géolocalisation — Google Maps
 *
 * GET  /geo/autocomplete?input=...       → Suggestions de lieux
 * GET  /geo/place/:placeId               → Détails d'un lieu (lat/lng)
 * GET  /geo/geocode?address=...          → Adresse → coordonnées
 * GET  /geo/reverse?lat=...&lng=...      → Coordonnées → adresse
 */

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import * as geocodingService from "../../shared/geo/geocoding.service.js";

const router = Router();

const autocompleteSchema = z.object({
  input: z.string().min(2).max(200),
  sessionToken: z.string().optional(),
});

const geocodeSchema = z.object({
  address: z.string().min(2).max(300),
});

const reverseSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/**
 * Autocomplete de lieux (biaisé RDC / Kinshasa).
 */
router.get(
  "/autocomplete",
  asyncHandler(async (request, response) => {
    const { input, sessionToken } = autocompleteSchema.parse(request.query);
    const predictions = await geocodingService.autocomplete(input, sessionToken);
    response.json({ predictions });
  })
);

/**
 * Détails d'un lieu → coordonnées GPS.
 */
router.get(
  "/place/:placeId",
  asyncHandler(async (request, response) => {
    const placeId = request.params.placeId;
    const sessionToken = (request.query.sessionToken as string) || undefined;
    const details = await geocodingService.getPlaceDetails(placeId, sessionToken);
    response.json(details);
  })
);

/**
 * Géocodage : adresse texte → coordonnées.
 */
router.get(
  "/geocode",
  asyncHandler(async (request, response) => {
    const { address } = geocodeSchema.parse(request.query);
    const result = await geocodingService.geocodeAddress(address);
    response.json(result);
  })
);

/**
 * Géocodage inversé : coordonnées → adresse.
 */
router.get(
  "/reverse",
  asyncHandler(async (request, response) => {
    const { lat, lng } = reverseSchema.parse(request.query);
    const result = await geocodingService.reverseGeocode(lat, lng);
    response.json(result);
  })
);

export default router;
