/**
 * MapView — Affichage d'une carte Google Maps avec marqueurs.
 *
 * Charge le SDK Google Maps dynamiquement via l'API JavaScript.
 * Utilise une clé transmise par le backend ou une variable VITE_GOOGLE_MAPS_KEY.
 *
 * Usage :
 *   <MapView
 *     center={{ lat: -4.325, lng: 15.322 }}
 *     markers={[{ lat: -4.33, lng: 15.31, title: "Shop A" }]}
 *     zoom={13}
 *     height="300px"
 *   />
 */

import { useEffect, useRef, useState } from "react";
import "./map-view.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const google: any;

type Marker = {
  lat: number;
  lng: number;
  title?: string;
  info?: string;
};

type Props = {
  center?: { lat: number; lng: number };
  markers?: Marker[];
  zoom?: number;
  height?: string;
  onClick?: (lat: number, lng: number) => void;
};

const MAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_KEY ?? "";

let loadPromise: Promise<void> | null = null;

function loadMapsScript(): Promise<void> {
  if ((window as any).google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    if (!MAPS_KEY) {
      reject(new Error("VITE_GOOGLE_MAPS_KEY non définie"));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&language=fr&region=CD`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Échec du chargement Google Maps"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export default function MapView({ center, markers, zoom = 13, height = "300px", onClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Init map
  useEffect(() => {
    if (!containerRef.current) return;

    loadMapsScript()
      .then(() => {
        if (!containerRef.current) return;

        const defaultCenter = center ?? { lat: -4.325, lng: 15.322 };
        const map = new google.maps.Map(containerRef.current, {
          center: defaultCenter,
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          styles: [
            { elementType: "geometry", stylers: [{ color: "#1d1d3b" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#8e8eaf" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1d1d3b" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c5a" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e0e2a" }] },
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
          ],
        });

        mapRef.current = map;

        if (onClick) {
          map.addListener("click", (e: any) => {
            if (e.latLng) {
              onClick(e.latLng.lat(), e.latLng.lng());
            }
          });
        }
      })
      .catch((err) => setError(err.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update center
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.panTo(center);
    }
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update markers
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear previous markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    (markers ?? []).forEach((m) => {
      const marker = new google.maps.Marker({
        position: { lat: m.lat, lng: m.lng },
        map: mapRef.current!,
        title: m.title,
      });

      if (m.info || m.title) {
        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="color:#1d1d3b;font-size:13px"><strong>${m.title ?? ""}</strong>${m.info ? `<br/>${m.info}` : ""}</div>`,
        });
        marker.addListener("click", () => infoWindow.open(mapRef.current!, marker));
      }

      markersRef.current.push(marker);
    });
  }, [markers]);

  if (error) {
    return (
      <div className="map-view map-view--fallback" style={{ height }}>
        <span className="map-view__icon">🗺️</span>
        <span className="map-view__msg">Carte non disponible</span>
        {center && (
          <span className="map-view__coords">
            {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
          </span>
        )}
      </div>
    );
  }

  return <div ref={containerRef} className="map-view" style={{ height }} />;
}
