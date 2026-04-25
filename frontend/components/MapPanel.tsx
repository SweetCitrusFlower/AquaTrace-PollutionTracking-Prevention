"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { GeoJSONSource, Map } from "maplibre-gl";

type ReportPoint = {
  id: string;
  latitude: number;
  longitude: number;
  type: string;
  status: string;
  confidence_score?: number;
  image_url?: string;
  created_at?: string;
};

type AnomalyPoint = {
  id: string;
  latitude: number;
  longitude: number;
  source: string;
  type: string;
  severity: number;
  confidence_score?: number;
  predicted_at?: string;
};

type SensorPoint = {
  id: string;
  latitude: number;
  longitude: number;
  provider: string;
  station_code: string;
  station_name?: string;
  nitrites_mg_l?: number;
  nitrates_mg_l?: number;
  phosphates_mg_l?: number;
  ph_value?: number;
  captured_at?: string;
};

type MapPayload = {
  reports: ReportPoint[];
  anomalies: AnomalyPoint[];
  sensors: SensorPoint[];
};

const DEFAULT_BBOX = "8.0,42.0,30.0,50.0";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

function toFeatureCollection(items: Array<{ latitude: number; longitude: number; [key: string]: unknown }>) {
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [item.longitude, item.latitude],
      },
      properties: { ...item },
    })),
  };
}

export default function MapPanel() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [mapPayload, setMapPayload] = useState<MapPayload>({ reports: [], anomalies: [], sensors: [] });

  const stats = useMemo(
    () => ({
      reports: mapPayload.reports.length,
      anomalies: mapPayload.anomalies.length,
      sensors: mapPayload.sensors.length,
      lastUpdate: lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : "--:--:--",
    }),
    [mapPayload, lastUpdatedAt],
  );

  useEffect(() => {
    let isDisposed = false;

    const loadData = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/map/data?bbox=${encodeURIComponent(DEFAULT_BBOX)}`);
        if (!response.ok) {
          throw new Error(`Map API returned ${response.status}`);
        }

        const data = (await response.json()) as MapPayload;
        if (!isDisposed) {
          setMapPayload({
            reports: data.reports || [],
            anomalies: data.anomalies || [],
            sensors: data.sensors || [],
          });
          setLastUpdatedAt(new Date().toISOString());
          setError(null);
        }
      } catch (requestError) {
        if (!isDisposed) {
          setError(requestError instanceof Error ? requestError.message : "Failed to fetch map data.");
        }
      } finally {
        if (!isDisposed) {
          setIsLoading(false);
        }
      }
    };

    void loadData();
    const intervalId = setInterval(() => {
      void loadData();
    }, 60_000);

    return () => {
      isDisposed = true;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [19.5, 45.3],
      zoom: 5.15,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("reports-source", {
        type: "geojson",
        data: toFeatureCollection([]),
      });

      map.addLayer({
        id: "reports-layer",
        type: "circle",
        source: "reports-source",
        paint: {
          "circle-radius": 5,
          "circle-color": "#1768AC",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.85,
        },
      });

      map.addSource("anomalies-source", {
        type: "geojson",
        data: toFeatureCollection([]),
      });

      map.addLayer({
        id: "anomalies-heat",
        type: "heatmap",
        source: "anomalies-source",
        paint: {
          "heatmap-weight": ["coalesce", ["get", "severity"], 0.3],
          "heatmap-intensity": 1.1,
          "heatmap-radius": 24,
          "heatmap-opacity": 0.72,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(34, 139, 34, 0)",
            0.25,
            "#8BC34A",
            0.5,
            "#FFC107",
            0.75,
            "#FF7043",
            1,
            "#D32F2F",
          ],
        },
      });

      map.addLayer({
        id: "anomalies-points",
        type: "circle",
        source: "anomalies-source",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["coalesce", ["get", "severity"], 0.2], 0, 4, 1, 10],
          "circle-color": "#D32F2F",
          "circle-opacity": 0.65,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addSource("sensors-source", {
        type: "geojson",
        data: toFeatureCollection([]),
      });

      map.addLayer({
        id: "sensors-layer",
        type: "circle",
        source: "sensors-source",
        paint: {
          "circle-radius": 6,
          "circle-color": "#00A7A0",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#003D5B",
          "circle-opacity": 0.88,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const syncSources = () => {
      const reportsSource = map.getSource("reports-source") as GeoJSONSource | undefined;
      const anomaliesSource = map.getSource("anomalies-source") as GeoJSONSource | undefined;
      const sensorsSource = map.getSource("sensors-source") as GeoJSONSource | undefined;

      reportsSource?.setData(toFeatureCollection(mapPayload.reports));
      anomaliesSource?.setData(toFeatureCollection(mapPayload.anomalies));
      sensorsSource?.setData(toFeatureCollection(mapPayload.sensors));
    };

    if (map.isStyleLoaded()) {
      syncSources();
    } else {
      map.once("load", syncSources);
    }
  }, [mapPayload]);

  return (
    <section className="map-panel">
      <header className="map-panel-header">
        <div>
          <h2>Live Basin View</h2>
          <p>Unified geospatial feed across reports, satellite anomalies, and field sensors.</p>
        </div>

        <div className="stats-grid">
          <article>
            <span>Reports</span>
            <strong>{stats.reports}</strong>
          </article>
          <article>
            <span>Anomalies</span>
            <strong>{stats.anomalies}</strong>
          </article>
          <article>
            <span>Sensors</span>
            <strong>{stats.sensors}</strong>
          </article>
          <article>
            <span>Updated</span>
            <strong>{stats.lastUpdate}</strong>
          </article>
        </div>
      </header>

      {isLoading && <p className="status-banner">Loading map layers...</p>}
      {error && <p className="status-banner error">{error}</p>}

      <div ref={mapContainerRef} className="map-canvas" />

      <footer className="map-legend">
        <div>
          <span className="legend-dot report" /> Citizen reports
        </div>
        <div>
          <span className="legend-dot anomaly" /> Copernicus anomalies
        </div>
        <div>
          <span className="legend-dot sensor" /> NGO sensors
        </div>
      </footer>
    </section>
  );
}