"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapComplaint = {
  complaint_id: string;
  title: string;
  category: string;
  status: string;
  priority: string;
  latitude: number;
  longitude: number;
  created_at: string;
  ward: string | null;
};

type Props = {
  complaints: MapComplaint[];
  center: [number, number] | null;
  layer: "heat" | "pins";
};

function distanceKm(a: MapComplaint, b: MapComplaint) {
  const lat = (b.latitude - a.latitude) * 111;
  const lng = (b.longitude - a.longitude) * 111 * Math.cos(a.latitude * Math.PI / 180);
  return Math.hypot(lat, lng);
}

function severityColor(priority: string) {
  return priority === "p0" || priority === "p1" || priority === "critical" || priority === "high"
    ? "#d96750"
    : priority === "p2" || priority === "medium" ? "#e7a44c" : "#6f9b72";
}

export default function MapCanvas({ complaints, center, layer }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layers = useRef<LayerGroup | null>(null);

  useEffect(() => {
    if (!host.current || map.current) return;
    const instance = L.map(host.current, { center: [12.9716, 77.5946], zoom: 12, zoomControl: true });
    map.current = instance;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);
    layers.current = L.layerGroup().addTo(instance);
    const timer = window.setTimeout(() => instance.invalidateSize(), 80);
    return () => {
      window.clearTimeout(timer);
      instance.remove();
      map.current = null;
      layers.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (center) instance.setView(center, 14, { animate: false });
    else if (complaints.length > 1) {
      instance.fitBounds(complaints.map(item => [item.latitude, item.longitude]), { padding: [38, 38], maxZoom: 14 });
    } else if (complaints.length === 1) {
      instance.setView([complaints[0].latitude, complaints[0].longitude], 14, { animate: false });
    }
  }, [center, complaints]);

  useEffect(() => {
    const group = layers.current;
    if (!group) return;
    group.clearLayers();
    if (layer === "heat") {
      for (const point of complaints) {
        const nearby = complaints.reduce((count, other) => count + (distanceKm(point, other) <= 0.35 ? 1 : 0), 0);
        const color = nearby >= 6 ? "#d96750" : nearby >= 3 ? "#e7a44c" : "#78a77a";
        const radius = Math.min(500, 170 + nearby * 35);
        L.circle([point.latitude, point.longitude], { radius: radius * 1.55, stroke: false, fillColor: color, fillOpacity: 0.075, interactive: false }).addTo(group);
        L.circle([point.latitude, point.longitude], { radius, stroke: false, fillColor: color, fillOpacity: 0.13, interactive: false }).addTo(group);
        L.circle([point.latitude, point.longitude], { radius: radius * 0.42, stroke: false, fillColor: color, fillOpacity: 0.17, interactive: false }).addTo(group);
      }
      return;
    }
    for (const point of complaints) {
      const icon = L.divIcon({ className: "jansetu-map-dot", html: `<span style="--dot-color:${severityColor(point.priority)}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] });
      const marker = L.marker([point.latitude, point.longitude], { icon, title: `${point.title} · ${point.category}` });
      const popup = document.createElement("div");
      popup.className = "jansetu-map-popup";
      const title = document.createElement("strong");
      title.textContent = point.title;
      const detail = document.createElement("small");
      detail.textContent = `${point.category} · ${point.priority.toUpperCase()} · ${point.ward ?? "Jurisdiction pending"}`;
      popup.append(title, detail);
      marker.bindPopup(popup).addTo(group);
    }
  }, [complaints, layer]);

  return <div ref={host} className="jansetu-map-canvas" role="region" aria-label={`Staff complaint map with ${complaints.length} visible reports`} />;
}
