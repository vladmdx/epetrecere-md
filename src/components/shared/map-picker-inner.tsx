"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapPickerProps } from "./map-picker";

// Fix Leaflet's default marker icon paths (they break under webpack/next)
const DefaultIcon = L.icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Center on Chișinău by default
const CHISINAU: [number, number] = [47.0105, 28.8638];

export default function MapPickerInner({
  lat,
  lng,
  onChange,
  defaultZoom = 12,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Initialise the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] =
      lat !== null && lng !== null ? [lat, lng] : CHISINAU;

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: lat !== null && lng !== null ? 16 : defaultZoom,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Click map to set / move pin
    map.on("click", (e) => {
      const { lat, lng } = e.latlng;
      onChange(lat, lng);
    });

    mapRef.current = map;

    // If we have an initial pin, place it
    if (lat !== null && lng !== null) {
      const marker = L.marker([lat, lng], {
        icon: DefaultIcon,
        draggable: true,
      }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChange(p.lat, p.lng);
      });
      markerRef.current = marker;
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync marker when lat/lng change externally
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (lat === null || lng === null) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], {
        icon: DefaultIcon,
        draggable: true,
      }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChange(p.lat, p.lng);
      });
      markerRef.current = marker;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className="h-[350px] w-full overflow-hidden rounded-lg border border-border/40"
      style={{ background: "#1a1a2e" }}
    />
  );
}
