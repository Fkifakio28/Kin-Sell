/**
 * LocationPicker — Sélection d'adresse avec autocomplétion Google Maps
 *
 * Usage basique:
 *   <LocationPicker
 *     value={{ lat: -4.325, lng: 15.322, address: "Kinshasa" }}
 *     onChange={({ lat, lng, address, city }) => { ... }}
 *   />
 *
 * Usage structuré (multi-pays):
 *   <LocationPicker
 *     value={{ lat: -4.325, lng: 15.322, address: "Kinshasa" }}
 *     onChange={...}
 *     onStructuredChange={(loc) => { ... }}
 *     countryHint="cd"
 *   />
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { geo, type PlacePrediction, type StructuredLocation } from "../lib/api-client";
import "./location-picker.css";

export type LocationValue = {
  lat: number;
  lng: number;
  address: string;
  city?: string;
};

type Props = {
  value?: LocationValue;
  onChange: (value: LocationValue) => void;
  /** Callback structuré complet (country, region, district, placeId, etc.) */
  onStructuredChange?: (location: StructuredLocation) => void;
  /** Code pays ISO pour biaiser l'autocomplete (ex: "cd", "ma") */
  countryHint?: string;
  placeholder?: string;
};

export default function LocationPicker({ value, onChange, onStructuredChange, countryHint, placeholder }: Props) {
  const [query, setQuery] = useState(value?.address ?? "");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const sessionTokenRef = useRef(crypto.randomUUID());
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fermer le dropdown au clic extérieur
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleInput = useCallback((input: string) => {
    setQuery(input);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (input.length < 2) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await geo.autocomplete(input, sessionTokenRef.current, countryHint);
        setPredictions(result.predictions);
        setShowDropdown(result.predictions.length > 0);
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [countryHint]);

  const handleSelect = useCallback(async (prediction: PlacePrediction) => {
    setShowDropdown(false);
    setQuery(prediction.description);
    setLoading(true);

    try {
      // Si onStructuredChange, récupérer la structure complète
      if (onStructuredChange) {
        const structured = await geo.placeDetailsStructured(prediction.placeId, sessionTokenRef.current);
        onStructuredChange(structured);
        onChange({
          lat: structured.latitude,
          lng: structured.longitude,
          address: structured.formattedAddress,
          city: structured.city ?? undefined,
        });
      } else {
        const details = await geo.placeDetails(prediction.placeId, sessionTokenRef.current);
        onChange({
          lat: details.latitude,
          lng: details.longitude,
          address: details.formattedAddress,
          city: details.city ?? undefined,
        });
      }
      // Nouveau session token après sélection
      sessionTokenRef.current = crypto.randomUUID();
    } catch {
      // Fallback: garder la description comme adresse
    } finally {
      setLoading(false);
    }
  }, [onChange, onStructuredChange]);

  // Géolocalisation du navigateur
  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) return;

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          if (onStructuredChange) {
            const structured = await geo.reverseStructured(position.coords.latitude, position.coords.longitude);
            setQuery(structured.formattedAddress);
            onStructuredChange(structured);
            onChange({
              lat: structured.latitude,
              lng: structured.longitude,
              address: structured.formattedAddress,
              city: structured.city ?? undefined,
            });
          } else {
            const result = await geo.reverse(position.coords.latitude, position.coords.longitude);
            setQuery(result.formattedAddress);
            onChange({
              lat: result.latitude,
              lng: result.longitude,
              address: result.formattedAddress,
              city: result.city ?? undefined,
            });
          }
        } catch {
          // Position récupérée mais pas de reverse geocoding
          onChange({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            address: `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`,
          });
        } finally {
          setGeoLoading(false);
        }
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [onChange, onStructuredChange]);

  return (
    <div className="location-picker" ref={wrapperRef}>
      <div className="location-picker__input-row">
        <input
          type="text"
          className="location-picker__input"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder ?? "Rechercher une adresse..."}
          autoComplete="off"
        />
        <button
          type="button"
          className="location-picker__geo-btn"
          onClick={handleGeolocate}
          disabled={geoLoading}
          title="Utiliser ma position GPS"
        >
          {geoLoading ? "⏳" : "📍"}
        </button>
      </div>

      {loading && <div className="location-picker__loading">Recherche...</div>}

      {showDropdown && (
        <ul className="location-picker__dropdown">
          {predictions.map((p) => (
            <li key={p.placeId} onClick={() => handleSelect(p)}>
              <span className="location-picker__main">{p.mainText}</span>
              <span className="location-picker__secondary">{p.secondaryText}</span>
            </li>
          ))}
        </ul>
      )}

      {value && (
        <div className="location-picker__coords">
          📌 {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
          {value.city && <span> — {value.city}</span>}
        </div>
      )}
    </div>
  );
}
