"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Maximize2, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { MapComplaint } from "./map-canvas";
import "./resident-heatmap.css";
import "../app/jansetu-theme.css";

const MapCanvas = dynamic(() => import("./map-canvas"), {
  ssr: false,
  loading: () => <div className="resident-map-loading">Loading community map…</div>,
});

const categories = ["All categories", "Roads", "Water", "Drainage", "Sanitation", "Streetlights", "Public safety", "Other"];

export default function ResidentHeatmap() {
  const [data, setData] = useState<MapComplaint[]>([]);
  const [filter, setFilter] = useState("All categories");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState<"heat" | "pins">("heat");
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/map", { cache: "no-store" });
      const body = await res.json();
      if (res.ok && Array.isArray(body.complaints)) {
        setData(body.complaints.filter((x: MapComplaint) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude)));
        setIsDemo(Boolean(body.isDemo));
      }
    } catch {
      // Fallback empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    return data.filter((item) => {
      const matchesCategory = filter === "All categories" || item.category.toLowerCase() === filter.toLowerCase();
      const matchesQuery = `${item.title} ${item.category} ${item.ward ?? ""}`.toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [data, filter, query]);

  function locate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter([pos.coords.latitude, pos.coords.longitude]),
      () => {}
    );
  }

  async function toggleFullscreen() {
    if (!cardRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await cardRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen not supported
    }
  }

  return (
    <section className="resident-heatmap-section">
      <div className="resident-section-heading">
        <div>
          <span className="modal-kicker">COMMUNITY VISIBILITY</span>
          <h2>Live neighborhood issue heatmap</h2>
        </div>
        <p>
          View real-time issue density across your city.<br />
          Exact home locations are generalized to protect resident privacy.
        </p>
      </div>

      <div className="resident-map-card" ref={cardRef}>
        <div className="resident-map-toolbar">
          <label className="resident-map-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by issue type, ward, or keyword…"
            />
          </label>

          <select
            className="resident-map-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="resident-map-toggle">
            <button
              type="button"
              className={layer === "heat" ? "active" : ""}
              onClick={() => setLayer("heat")}
            >
              Heat map
            </button>
            <button
              type="button"
              className={layer === "pins" ? "active" : ""}
              onClick={() => setLayer("pins")}
            >
              Issue pins
            </button>
          </div>

          <div className="resident-map-count">
            {loading ? "Loading…" : `${filtered.length} reported issues`}
          </div>
        </div>

        <div className="resident-map-container">
          <MapCanvas complaints={filtered} center={center} layer={layer} />

          <div className="resident-map-controls">
            <button type="button" onClick={locate} title="Center on my location">
              <Crosshair size={16} />
            </button>
            <button type="button" onClick={toggleFullscreen} title="Full screen">
              <Maximize2 size={16} />
            </button>
            <button type="button" onClick={() => void load()} title="Refresh map data">
              <RefreshCw size={15} />
            </button>
          </div>

          {layer === "heat" ? (
            <div className="resident-map-legend">
              <b>Complaint density</b>
              <span>
                <i className="density-scale" /> Lower <span style={{ color: "#d96750" }}>●</span> Higher
              </span>
              <small>Based on clustered neighborhood reports</small>
            </div>
          ) : (
            <div className="resident-map-legend">
              <b>Priority level</b>
              <span><i style={{ width: 8, height: 8, borderRadius: "50%", background: "#d96750", display: "inline-block" }} /> High / Critical</span>
              <span><i style={{ width: 8, height: 8, borderRadius: "50%", background: "#e7a44c", display: "inline-block" }} /> Medium</span>
              <span><i style={{ width: 8, height: 8, borderRadius: "50%", background: "#6f9b72", display: "inline-block" }} /> Normal / Low</span>
            </div>
          )}
        </div>

        <footer className="resident-map-footer">
          <span>
            <ShieldCheck size={14} style={{ color: "#167c70" }} />
            Public safe view: Exact coordinates restricted to municipal dispatch.
          </span>
          {isDemo && (
            <span className="demo-tag">
              <Sparkles size={11} /> [DEMO] Synthetic municipal data
            </span>
          )}
        </footer>
      </div>
    </section>
  );
}
