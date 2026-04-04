/**
 * MapView — Affichage d'une carte OpenStreetMap via Leaflet.
 *
 * Utilise des tuiles CartoDB Dark (dark_all) pour le thème sombre Kin-Sell.
 * Aucune clé API nécessaire.
 *
 * Usage :
 *   <MapView
 *     center={{ lat: -4.325, lng: 15.322 }}
 *     markers={[{ lat: -4.33, lng: 15.31, title: "Shop A" }]}
 *     zoom={13}
 *     height="300px"
 *   />
 */

import { useEffect, useRef, useState, memo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map-view.css";

// Fix Leaflet default marker icons (webpack/vite asset issue)
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

type MarkerData = {
  lat: number;
  lng: number;
  title?: string;
  info?: string;
};

type Props = {
  center?: { lat: number; lng: number };
  markers?: MarkerData[];
  zoom?: number;
  height?: string;
  onClick?: (lat: number, lng: number) => void;
};

/** Tuiles sombres CartoDB — excellent rendu en Afrique, gratuit, sans clé */
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

function MapView({ center, markers, zoom = 13, height = "300px", onClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    try {
      const defaultCenter = center ?? { lat: -4.325, lng: 15.322 };
      const map = L.map(containerRef.current, {
        center: [defaultCenter.lat, defaultCenter.lng],
        zoom,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer(DARK_TILES, {
        attribution: TILE_ATTRIBUTION,
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);

      if (onClick) {
        map.on("click", (e: L.LeafletMouseEvent) => {
          onClick(e.latlng.lat, e.latlng.lng);
        });
      }

      map.whenReady(() => {
        setLoading(false);
        // Fix tiles quand le conteneur n'est pas visible au mount (toggle liste/carte)
        setTimeout(() => map.invalidateSize(), 100);
      });
      mapRef.current = map;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'initialisation de la carte");
      setLoading(false);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersLayerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalculer la taille quand le conteneur devient visible
  useEffect(() => {
    if (mapRef.current && containerRef.current) {
      mapRef.current.invalidateSize();
    }
  });

  // Update center
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.panTo([center.lat, center.lng]);
    }
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update markers
  useEffect(() => {
    if (!markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    const KINSHASA_CENTER = { lat: -4.325, lng: 15.322 };
    const validMarkers = (markers ?? []).filter(
      (m) => !(m.lat === KINSHASA_CENTER.lat && m.lng === KINSHASA_CENTER.lng && !m.title)
    );

    validMarkers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng]);

      if (m.info || m.title) {
        const html = `<div class="map-view__popup"><strong>${m.title ?? ""}</strong>${m.info ? `<br/>${m.info}` : ""}</div>`;
        marker.bindPopup(html);
      }

      marker.addTo(markersLayerRef.current!);
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

  return (
    <div className="map-view" style={{ height }}>
      {loading && (
        <div className="map-view--loading">
          <div className="map-view__spinner" />
          <span className="map-view__msg">Chargement de la carte…</span>
        </div>
      )}
      <div ref={containerRef} className="map-view__container" style={{ height: "100%" }} />
    </div>
  );
}

export default memo(MapView);
