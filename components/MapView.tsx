'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';
import 'leaflet.heat';
import 'leaflet-draw';
import {
  MapContainer, CircleMarker, Tooltip,
  AttributionControl, useMap,
} from 'react-leaflet';
import { useState, useEffect, useRef } from 'react';
import { POLLUTION_POINTS, type PollutionPoint } from '@/lib/mockData';
import { fetchWaterStations, fetchNearestStations, type WaterStation } from '@/lib/waterStationsApi';
import { fetchRiverGeometry } from '@/lib/riverGeometryApi';
import { X, Satellite, Radio, User, AlertTriangle, Layers, ExternalLink, Check, Flame, MapPin, Crosshair, Loader2, Navigation, Clock, Gauge, Route, Factory, Activity, TrendingUp, TrendingDown, Minus, Droplet, Beaker } from 'lucide-react';
import { fetchSensorHistory, type WaterQuality, type SensorReading } from '@/lib/sensorHistoryApi';
import { fetchDischarge, type DischargeData } from '@/lib/dischargeApi';
import Sparkline from './Sparkline';

/* ── Colour scale ─────────────────────────────────────────────── */
const SEVERITY_COLOR: Record<PollutionPoint['severity'], string> = {
  low: '#7DA78C', moderate: '#C2D099', high: '#f59e0b', critical: '#dc2626',
};

const SOURCE_META = {
  satellite:    { label: 'Satellite (Copernicus)', icon: Satellite },
  'ngo-sensor': { label: 'NGO Sensor',             icon: Radio },
  citizen:      { label: 'Citizen Report',          icon: User },
} as const;

/* ── Map sources: each has a base tile + optional WMS overlay ─── */
type SourceId = 'osm' | 'eea' | 'copernicus' | 'satellite' | 'dark';

interface MapSource {
  id: SourceId;
  name: string;
  org: string;
  description: string;
  url?: string;
  color: string;
  tileUrl: string;
  tileAttribution: string;
  wms?: { url: string; layers: string; label: string };
}

const MAP_SOURCES: MapSource[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    org: 'OSM Contributors',
    description: 'Standard street map — best for urban pollution points and infrastructure context.',
    color: '#35858E',
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: 'eea',
    name: 'EEA Water Quality',
    org: 'European Environment Agency',
    description: 'Official EU monitoring — adds WFD surface water body status overlay (nitrates, phosphates, DO, conductivity from Apele Române).',
    url: 'https://www.eea.europa.eu/data-and-maps/dashboards/wise-wfd-status-and-target',
    color: '#246069',
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> | &copy; <a href="https://www.eea.europa.eu">EEA</a>',
    wms: {
      url: 'https://water.discomap.eea.europa.eu/arcgis/services/Water/WISE_SOW_SurfaceWaterBody/MapServer/WMSServer',
      layers: '0',
      label: 'WFD Surface Water Bodies',
    },
  },
  {
    id: 'copernicus',
    name: 'Copernicus CORINE',
    org: 'ESA / European Commission',
    description: 'Land cover classification layer — shows agricultural zones, wetlands, and urban areas correlated with pollution risk.',
    url: 'https://land.copernicus.eu/en/map-viewer',
    color: '#4da3ad',
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> | &copy; <a href="https://land.copernicus.eu">Copernicus</a>',
    wms: {
      url: 'https://image.discomap.eea.europa.eu/arcgis/services/Corine/CLC2018_WM/MapServer/WmsServer',
      layers: '0',
      label: 'CORINE Land Cover 2018',
    },
  },
  {
    id: 'satellite',
    name: 'Satellite Imagery',
    org: 'Esri World Imagery',
    description: 'High-resolution aerial/satellite base layer — ideal for visual inspection of river banks and industrial sites.',
    color: '#7DA78C',
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    tileAttribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
  },
  {
    id: 'dark',
    name: 'CartoDB Dark',
    org: 'CARTO',
    description: 'Dark basemap — makes pollution markers and severity colours stand out clearly at night or in dark mode.',
    color: '#9ca3af',
    tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://carto.com">CARTO</a>',
  },
];

/* ── Heatmap layer ──────────────────────────────────────────────
   Uses leaflet.heat plugin to render pollution density.        */
const SEVERITY_WEIGHT: Record<PollutionPoint['severity'], number> = {
  low: 0.3, moderate: 0.55, high: 0.8, critical: 1.0,
};

function HeatmapLayer({ visible }: { visible: boolean }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    // Tear down any previous heat layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!visible) return;

    // [lat, lng, intensity] tuples — leaflet.heat reads them directly
    const points = POLLUTION_POINTS.map(p => [
      p.coords[0], p.coords[1], SEVERITY_WEIGHT[p.severity],
    ]) as [number, number, number][];

    // @ts-ignore — leaflet.heat extends L but its types are loose
    const heat = L.heatLayer(points, {
      radius:     18,   // tight — blobs only around actual coords
      blur:       12,   // less bleed
      minOpacity: 0.35, // visible but not a fog
      maxZoom:    14,
      max:        1.0,
      gradient: {
        0.3: '#7DA78C', // sage   → low
        0.55: '#f59e0b', // amber  → moderate/high
        0.8: '#dc2626', // red    → critical
        1.0: '#7f1d1d', // dark red → severe cluster
      },
    });
    heat.addTo(map);
    layerRef.current = heat;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [visible, map]);

  return null;
}

/* ── Rectangle draw controller for satellite analysis ──────────── */
interface AnalysisBbox {
  minLat: number; minLng: number; maxLat: number; maxLng: number;
}

function DrawController({
  active, clearKey, onComplete, onCancel,
}: {
  active: boolean;
  /** Increment to force-clear the rectangle */
  clearKey: number;
  onComplete: (bbox: AnalysisBbox) => void;
  onCancel:   () => void;
}) {
  const map = useMap();
  const handlerRef = useRef<L.Draw.Rectangle | null>(null);
  const layerRef   = useRef<L.Rectangle | null>(null);

  // Activate the drawer when `active` flips on
  useEffect(() => {
    if (!active) return;

    // Clear any previous rectangle when re-entering draw mode
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }

    const drawer = new (L as any).Draw.Rectangle(map, {
      shapeOptions: { color: '#35858E', weight: 2, fillOpacity: 0.1 },
    });
    drawer.enable();
    handlerRef.current = drawer;

    const onCreated = (e: L.LeafletEvent) => {
      const layer = (e as any).layer as L.Rectangle;
      layer.addTo(map);
      layerRef.current = layer;
      const b = layer.getBounds();
      onComplete({
        minLat: b.getSouth(), minLng: b.getWest(),
        maxLat: b.getNorth(), maxLng: b.getEast(),
      });
    };

    map.on(L.Draw.Event.CREATED, onCreated);

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      if (handlerRef.current) handlerRef.current.disable();
      handlerRef.current = null;
    };
  }, [active, map, onComplete]);

  // Force-clear the rectangle whenever `clearKey` changes
  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
  }, [clearKey, map]);

  // Allow Escape to cancel drawing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && active) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onCancel]);

  return null;
}

/* ── Image overlay for satellite analysis result ──────────────── */
function AnalysisOverlay({
  url, bounds,
}: {
  url: string | null;
  bounds: AnalysisBbox | null;
}) {
  const map = useMap();
  const overlayRef = useRef<L.ImageOverlay | null>(null);

  useEffect(() => {
    if (overlayRef.current) {
      map.removeLayer(overlayRef.current);
      overlayRef.current = null;
    }
    if (!url || !bounds) return;

    const overlay = L.imageOverlay(url, [
      [bounds.minLat, bounds.minLng],
      [bounds.maxLat, bounds.maxLng],
    ], { opacity: 0.7 });
    overlay.addTo(map);
    overlayRef.current = overlay;

    return () => {
      if (overlayRef.current) { map.removeLayer(overlayRef.current); overlayRef.current = null; }
    };
  }, [url, bounds, map]);

  return null;
}

/* ── ETA tool: collects pollution + station coords via map clicks ─── */
type LatLng = { lat: number; lng: number };

function ETAController({
  active, step, onPick, onCancel,
}: {
  active: boolean;
  step: 'pollution' | 'station' | null;
  onPick: (coords: LatLng) => void;
  onCancel: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!active || !step) return;

    // Show crosshair cursor
    const container = map.getContainer();
    container.style.cursor = 'crosshair';

    const onClick = (e: L.LeafletMouseEvent) => {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    map.on('click', onClick);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      map.off('click', onClick);
      window.removeEventListener('keydown', onKey);
      container.style.cursor = '';
    };
  }, [active, step, map, onPick, onCancel]);

  return null;
}

/* ── Visual: draws the pollution → station route on the map ──────── */
interface EtaResult {
  distance_km: number;
  current_discharge_m3s: number;
  estimated_velocity_kmh: number;
  transit_time_hours: number;
  eta_timestamp: string;
  used_fallback_distance: boolean;
  upstream_warning: boolean;
}

function ETAVisualization({
  pollution, station, result, routeGeometry,
}: {
  pollution: LatLng | null;
  station:   LatLng | null;
  result:    EtaResult | null;
  /** Optional curved polyline along the river. Falls back to straight line if absent. */
  routeGeometry: [number, number][] | null;
}) {
  const map = useMap();
  const layersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    // Clean up previous layers
    layersRef.current.forEach(l => map.removeLayer(l));
    layersRef.current = [];

    // Pollution marker (red)
    if (pollution) {
      const m = L.circleMarker([pollution.lat, pollution.lng], {
        radius: 10, color: '#dc2626', fillColor: '#dc2626',
        fillOpacity: 0.85, weight: 3,
      }).bindTooltip('Pollution source', { permanent: false }).addTo(map);
      layersRef.current.push(m);
    }

    // Station marker (blue)
    if (station) {
      const m = L.circleMarker([station.lat, station.lng], {
        radius: 10, color: '#2563eb', fillColor: '#2563eb',
        fillOpacity: 0.85, weight: 3,
      }).bindTooltip('Monitoring station', { permanent: false }).addTo(map);
      layersRef.current.push(m);
    }

    // Route polyline + arrows (only when we have both endpoints AND a result)
    if (pollution && station && result) {
      const isUpstream  = result.upstream_warning;
      const isStraight  = result.used_fallback_distance || !routeGeometry || routeGeometry.length < 2;
      const color = isUpstream ? '#dc2626' : isStraight ? '#f59e0b' : '#35858E';

      // Pick the polyline: river-following if available, else straight
      const polylineCoords: [number, number][] = isStraight
        ? [[pollution.lat, pollution.lng], [station.lat, station.lng]]
        : routeGeometry as [number, number][];

      const line = L.polyline(polylineCoords, {
        color, weight: 4, opacity: 0.85,
        dashArray: isStraight ? '8, 8' : undefined,
        smoothFactor: 1.0, // gentle smoothing without losing river curves
      }).addTo(map);
      layersRef.current.push(line);

      // Place direction arrows at evenly spaced points along the polyline.
      // For curved river paths we want several arrows so the flow direction
      // is unambiguous; for straight fallback one arrow is enough.
      const arrowCount = isStraight ? 1 : 5;
      const arrowPositions = computeArrowPositions(polylineCoords, arrowCount);

      for (const { point, angleDeg } of arrowPositions) {
        const arrowIcon = L.divIcon({
          className: 'eta-arrow',
          html: `<div style="transform: rotate(${-angleDeg}deg); color: ${color}; font-size: 24px; line-height: 1; text-shadow: 0 0 6px white, 0 0 6px white;">➤</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        const arrow = L.marker(point, {
          icon: arrowIcon, interactive: false,
        }).addTo(map);
        layersRef.current.push(arrow);
      }

      // Auto-fit map to show the full route
      const bounds = L.latLngBounds(polylineCoords);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 9 });
    }

    return () => {
      layersRef.current.forEach(l => map.removeLayer(l));
      layersRef.current = [];
    };
  }, [pollution, station, result, routeGeometry, map]);

  return null;
}

/** Compute `count` evenly-spaced points along a polyline (by cumulative distance)
 *  along with the local segment angle in degrees so we can rotate an arrow icon. */
function computeArrowPositions(
  coords: [number, number][],
  count: number,
): { point: [number, number]; angleDeg: number }[] {
  if (coords.length < 2 || count < 1) return [];

  // Cumulative distance per vertex (using simple equirectangular approx — fine for arrow placement)
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + segDist(coords[i - 1], coords[i]));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return [];

  const out: { point: [number, number]; angleDeg: number }[] = [];
  for (let k = 1; k <= count; k++) {
    // Place arrows at fractions 1/(count+1), 2/(count+1), ..., count/(count+1)
    // so they're evenly distributed without touching the endpoints.
    const target = total * (k / (count + 1));
    // Find the segment containing this distance
    let i = 1;
    while (i < cum.length && cum[i] < target) i++;
    if (i >= cum.length) i = cum.length - 1;
    const segStart = cum[i - 1];
    const segLen   = cum[i] - segStart || 1;
    const t = (target - segStart) / segLen;
    const lat = coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t;
    const lng = coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t;
    const angleDeg = (Math.atan2(
      coords[i][0] - coords[i - 1][0],
      coords[i][1] - coords[i - 1][1],
    ) * 180) / Math.PI;
    out.push({ point: [lat, lng], angleDeg });
  }
  return out;
}

function segDist(a: [number, number], b: [number, number]): number {
  // Equirectangular approximation — sufficient for relative spacing
  const dLat = (a[0] - b[0]) * 111;
  const dLng = (a[1] - b[1]) * 111 * Math.cos((a[0] * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/* ── Water stations layer ────────────────────────────────────────
   Renders treatment/monitoring/intake stations as small icon markers.
   Different colors per type for quick visual distinction.           */
const STATION_TYPE_COLOR: Record<string, string> = {
  treatment:  '#35858E', // dusk — most important
  monitoring: '#7DA78C', // sage
  intake:     '#C2D099', // lime
};

function StationsLayer({
  stations, visible, onSelect,
}: {
  stations: WaterStation[];
  visible: boolean;
  onSelect: (s: WaterStation) => void;
}) {
  const map = useMap();
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    // Clear previous
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    if (!visible) return;

    stations.forEach(s => {
      const color = STATION_TYPE_COLOR[s.station_type] ?? '#6b7280';
      // Compact divIcon with a Factory-ish glyph (★ for treatment, ◆ for monitoring, ▼ for intake).
      const glyph = s.station_type === 'treatment' ? '★'
                  : s.station_type === 'monitoring' ? '◆'
                  : '▼';
      const icon = L.divIcon({
        className: 'station-marker',
        html: `<div style="
          background:${color};
          color:white;
          width:22px; height:22px;
          border-radius:6px;
          display:flex; align-items:center; justify-content:center;
          font-size:13px; font-weight:bold;
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          border: 2px solid white;
        ">${glyph}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L.marker(s.coords, { icon })
        .bindTooltip(s.name, { direction: 'top', offset: [0, -8] })
        .on('click', () => onSelect(s))
        .addTo(map);
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(m => map.removeLayer(m));
      markersRef.current = [];
    };
  }, [stations, visible, map, onSelect]);

  return null;
}

/* ── Imperative layer controller ────────────────────────────────
   Uses Leaflet's native API so layer swaps are guaranteed.      */
function TileLayerController({ source }: { source: MapSource }) {
  const map = useMap();
  const layersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    // Remove all previous tile layers
    layersRef.current.forEach(l => map.removeLayer(l));
    layersRef.current = [];

    // Add base tile layer
    const base = L.tileLayer(source.tileUrl, {
      attribution: source.tileAttribution,
      maxZoom: 19,
    }).addTo(map);
    layersRef.current.push(base);

    // Add WMS overlay if the source has one
    if (source.wms) {
      const wms = L.tileLayer.wms(source.wms.url, {
        layers:      source.wms.layers,
        format:      'image/png',
        transparent: true,
        opacity:     0.6,
        attribution: source.tileAttribution,
      } as L.WMSOptions).addTo(map);
      layersRef.current.push(wms);
    }

    return () => {
      layersRef.current.forEach(l => map.removeLayer(l));
      layersRef.current = [];
    };
  }, [source.id]); // re-run only when source changes

  return null;
}

/* ── Main component ─────────────────────────────────────────────── */
type DisplayMode = 'markers' | 'heatmap' | 'both';

interface AnalysisResult {
  bbox: AnalysisBbox;
  imageUrl: string;       // generated heatmap PNG (data-URL SVG)
  metrics: {
    chlorophyll_avg: number;
    chlorophyll_max: number;
    turbidity_avg: number; // replaces nitrate_avg (Sentinel can't see nitrates)
    confidence: number;    // 0..1
  };
  source?: string;         // human-readable data source label
}

export default function MapView() {
  const [selected, setSelected] = useState<PollutionPoint | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeSource, setActiveSource] = useState<MapSource>(MAP_SOURCES[0]);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('markers');

  // Water stations state
  const [stationsVisible, setStationsVisible] = useState(false);
  const [stations, setStations] = useState<WaterStation[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [selectedStation, setSelectedStation] = useState<WaterStation | null>(null);

  // Satellite analysis state
  const [drawing, setDrawing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  // Bumped to force the DrawController to remove the visible rectangle
  const [clearKey, setClearKey] = useState(0);

  // ETA tool state
  // Flow: pick pollution point → fetch nearest stations → user picks station → result
  const [etaStep, setEtaStep] = useState<'pollution' | 'station' | null>(null);
  const [pollutionPt, setPollutionPt] = useState<LatLng | null>(null);
  const [stationPt,   setStationPt]   = useState<LatLng | null>(null);
  const [etaCandidates, setEtaCandidates] = useState<WaterStation[]>([]);
  const [etaLoading, setEtaLoading] = useState(false);
  const [etaError, setEtaError] = useState<string | null>(null);
  const [etaResult, setEtaResult] = useState<EtaResult | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);

  const showMarkers = displayMode === 'markers' || displayMode === 'both';
  const showHeatmap = displayMode === 'heatmap' || displayMode === 'both';

  // Lazy-load stations when first toggled on
  useEffect(() => {
    if (!stationsVisible || stations.length > 0) return;
    setStationsLoading(true);
    fetchWaterStations()
      .then(setStations)
      .finally(() => setStationsLoading(false));
  }, [stationsVisible, stations.length]);

  const handleBboxComplete = async (bbox: AnalysisBbox) => {
    setDrawing(false);
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bbox),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAnalysis({ bbox, imageUrl: data.imageUrl, metrics: data.metrics, source: data.source });
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  // Called when user clicks on the map during ETA picking (only step is 'pollution' now)
  const handleEtaPick = async (coords: LatLng) => {
    if (etaStep !== 'pollution') return;
    setPollutionPt(coords);
    setStationPt(null);
    setEtaResult(null);
    setEtaStep(null); // exit map-click mode
    setPanelOpen(true); // open panel so user sees station picker

    // Fetch nearest treatment/monitoring stations to that point
    setEtaLoading(true);
    setEtaError(null);
    try {
      const candidates = await fetchNearestStations(coords.lat, coords.lng, 5);
      if (candidates.length === 0) {
        setEtaError('No nearby water stations found.');
      } else {
        setEtaCandidates(candidates);
      }
    } catch (err) {
      setEtaError(err instanceof Error ? err.message : 'Failed to load stations');
    } finally {
      setEtaLoading(false);
    }
  };

  // Triggered when user picks one of the candidate stations
  const handleStationPick = async (station: WaterStation) => {
    if (!pollutionPt) return;
    const stationLatLng: LatLng = { lat: station.coords[0], lng: station.coords[1] };
    setStationPt(stationLatLng);
    setEtaCandidates([]); // close picker
    setEtaLoading(true);
    setEtaError(null);
    setRouteGeometry(null); // clear previous trajectory
    try {
      const res = await fetch('/api/eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pollution_lat: pollutionPt.lat,
          pollution_lon: pollutionPt.lng,
          station_lat:   station.coords[0],
          station_lon:   station.coords[1],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEtaResult(data);

      // Fire river geometry fetch in parallel — UI already shows metrics,
      // the curved trajectory will appear once Overpass responds.
      // We don't await it: failures gracefully fall back to straight line.
      if (!data.upstream_warning && !data.used_fallback_distance) {
        fetchRiverGeometry(
          [pollutionPt.lat, pollutionPt.lng],
          [station.coords[0], station.coords[1]],
        )
          .then(geom => {
            if (!geom.isFallback) setRouteGeometry(geom.coords);
          })
          .catch(err => console.warn('[river-geometry] fetch failed:', err));
      }
    } catch (err) {
      setEtaError(err instanceof Error ? err.message : 'ETA calculation failed');
    } finally {
      setEtaLoading(false);
    }
  };

  const startEta = () => {
    setEtaStep('pollution');
    setPollutionPt(null);
    setStationPt(null);
    setEtaResult(null);
    setEtaError(null);
    setEtaCandidates([]);
    setPanelOpen(false);
  };

  const clearEta = () => {
    setEtaStep(null);
    setPollutionPt(null);
    setStationPt(null);
    setEtaResult(null);
    setEtaError(null);
    setEtaCandidates([]);
    setRouteGeometry(null);
  };

  return (
    <div className="flex flex-row h-full md:rounded-3xl overflow-hidden md:shadow-soft">

      {/* ── Map area: fills all space not occupied by the panel ── */}
      <div className="relative flex-1 min-w-0">

      {/* Source toggle button */}
      <button
        onClick={() => setPanelOpen(o => !o)}
        className="absolute top-3 right-3 z-[500] flex items-center gap-2
                   bg-white/95 backdrop-blur-sm px-3 py-2 rounded-xl shadow-soft
                   text-sm font-semibold text-gray-700 border border-grass/30
                   hover:bg-white transition-all duration-300 hover:shadow-lg
                   active:scale-[0.98]"
      >
        <Layers className="w-4 h-4 text-dusk" />
        <span className="hidden sm:inline">{activeSource.name}</span>
        <span className="w-2 h-2 rounded-full ml-1" style={{ background: activeSource.color }} />
      </button>

      {/* Mobile panel — closes by tapping backdrop */}
      {panelOpen && (
        <div
          className="absolute md:hidden inset-0 z-[501] flex items-end animate-[fadeIn_0.2s_ease-out]"
          onClick={() => setPanelOpen(false)}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />
          <div
            className="relative bottom-20 inset-x-0 w-full bg-white/98 backdrop-blur-md shadow-2xl
                        border-t border-grass/20 rounded-t-3xl animate-[slideUp_0.24s_ease-out]
                        max-h-[70vh] flex flex-col overflow-hidden"
            // Stop wheel events from reaching Leaflet (which would zoom the map)
            onWheel={(e) => e.stopPropagation()}
            // Same for touch on mobile so panel scroll doesn't pan the map
            onTouchMove={(e) => e.stopPropagation()}
            // Don't let drag-select on the panel become a map drag
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
          <button
            onClick={() => setPanelOpen(false)}
            className="md:hidden absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center border border-grass/20 hover:scale-105 active:scale-95 transition-transform"
            aria-label="Close panel"
          >
            <X className="w-5 h-5 text-gray-700" />
          </button>
          {/* Panel header — fixed at top, never scrolls */}
          <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm px-4 py-3
                          border-b border-grass/20 flex items-center justify-between">
            <div>
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-gray-200" />
              <h2 className="font-display font-bold text-gray-900 text-sm">Map Layers</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Choose source, display, or analyze a zone</p>
            </div>
            <button onClick={() => setPanelOpen(false)}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Scrollable body — sits between the header and the legend footer */}
          <div className="flex-1 overflow-y-auto overscroll-contain pb-3">

          {/* === DISPLAY MODE TOGGLE === */}
          <div className="px-4 pt-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Display
            </p>
            <div className="grid grid-cols-3 gap-1.5 bg-gray-100 p-1 rounded-xl">
              {([
                { id: 'markers', label: 'Markers', icon: MapPin },
                { id: 'heatmap', label: 'Heatmap', icon: Flame },
                { id: 'both',    label: 'Both',    icon: Layers },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setDisplayMode(id)}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded-lg text-[11px] font-semibold transition
                    ${displayMode === id
                      ? 'bg-white text-dusk shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* === LAYERS === */}
          <div className="px-4 pt-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Layers
            </p>
            <button onClick={() => setStationsVisible(v => !v)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition border-2
                ${stationsVisible
                  ? 'bg-dusk text-white border-dusk'
                  : 'bg-white text-gray-700 border-grass/30 hover:border-dusk/40'}`}>
              <span className="inline-flex items-center gap-2">
                <Factory className="w-4 h-4" />
                Water Stations
                {stationsVisible && stations.length > 0 && (
                  <span className="text-[10px] font-normal opacity-80">· {stations.length}</span>
                )}
              </span>
              {stationsLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <span className={`w-2 h-2 rounded-full ${stationsVisible ? 'bg-white' : 'bg-gray-300'}`} />}
            </button>
          </div>

          {/* === SATELLITE ANALYSIS === */}
          <div className="px-4 pt-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Satellite Analysis
            </p>
            {!analysis && !drawing && !analyzing && (
              <button onClick={() => { setDrawing(true); setPanelOpen(false); setAnalysisError(null); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-dusk/30 hover:border-dusk hover:bg-dusk/5 text-sm font-semibold text-dusk transition">
                <Crosshair className="w-4 h-4" />
                Draw zone to analyze
              </button>
            )}
            {drawing && (
              <div className="bg-dusk/5 border border-dusk/20 rounded-xl p-3 text-xs text-gray-700">
                <p className="font-semibold text-dusk mb-1">📐 Draw a rectangle on the map</p>
                <p className="text-gray-500">Click and drag to select the analysis zone. Press Esc to cancel.</p>
                <button onClick={() => setDrawing(false)}
                  className="mt-2 text-xs font-semibold text-gray-500 hover:text-gray-800">
                  Cancel
                </button>
              </div>
            )}
            {analyzing && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-dusk/5 text-sm text-dusk font-semibold">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing zone…
              </div>
            )}
            {analysisError && (
              <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {analysisError}
              </div>
            )}
            {analysis && (
              <div className="space-y-2">
                <div className="bg-dusk/5 border border-dusk/20 rounded-xl p-3 text-xs">
                  <p className="font-semibold text-dusk mb-1.5">✓ Zone analyzed</p>
                  <div className="grid grid-cols-2 gap-1.5 text-gray-700">
                    <div><span className="text-gray-400">Chl-a avg:</span><br/><b>{analysis.metrics.chlorophyll_avg.toFixed(1)} mg/m³</b></div>
                    <div><span className="text-gray-400">Chl-a max:</span><br/><b>{analysis.metrics.chlorophyll_max.toFixed(1)} mg/m³</b></div>
                    <div><span className="text-gray-400">Turbidity:</span><br/><b>{analysis.metrics.turbidity_avg.toFixed(1)} NTU</b></div>
                    <div><span className="text-gray-400">Confidence:</span><br/><b>{(analysis.metrics.confidence * 100).toFixed(0)}%</b></div>
                  </div>
                  {analysis.source && (
                    <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100 italic">
                      {analysis.source}
                    </p>
                  )}
                </div>
                <button onClick={() => { setAnalysis(null); setAnalysisError(null); setClearKey(k => k + 1); }}
                  className="w-full text-xs font-semibold text-gray-500 hover:text-red-600 py-1">
                  Clear analysis &amp; remove zone
                </button>
              </div>
            )}
          </div>

          {/* === POLLUTION ETA === */}
          <div className="px-4 pt-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Pollution ETA
            </p>

            {!etaStep && !etaLoading && !etaResult && !etaError && (
              <button onClick={startEta}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-dusk/30 hover:border-dusk hover:bg-dusk/5 text-sm font-semibold text-dusk transition">
                <Navigation className="w-4 h-4" />
                Track plume downstream
              </button>
            )}

            {etaStep === 'pollution' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-gray-700">
                <p className="font-semibold text-red-700 mb-1">📍 Step 1 / 2 — Pollution source</p>
                <p className="text-gray-600">Click on the map where pollution was detected. Press Esc to cancel.</p>
                <button onClick={clearEta}
                  className="mt-2 text-xs font-semibold text-gray-500 hover:text-gray-800">
                  Cancel
                </button>
              </div>
            )}

            {etaCandidates.length > 0 && !etaResult && !etaLoading && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs">
                <p className="font-semibold text-blue-700 mb-2">📡 Step 2 / 2 — Pick downstream station</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {etaCandidates.map(s => (
                    <button key={s.id} onClick={() => handleStationPick(s)}
                      className="w-full text-left bg-white hover:bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2 transition">
                      <p className="font-semibold text-gray-800 text-[11px] leading-tight">{s.name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {s.station_type} · {s.operator || 'Unknown operator'}
                      </p>
                    </button>
                  ))}
                </div>
                <button onClick={clearEta}
                  className="mt-2 text-xs font-semibold text-gray-500 hover:text-gray-800">
                  Cancel
                </button>
              </div>
            )}

            {etaLoading && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-dusk/5 text-sm text-dusk font-semibold">
                <Loader2 className="w-4 h-4 animate-spin" />
                Computing route &amp; discharge…
              </div>
            )}

            {etaError && (
              <div className="space-y-2">
                <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {etaError}
                </div>
                <button onClick={clearEta}
                  className="w-full text-xs font-semibold text-gray-500 hover:text-red-600 py-1">
                  Reset
                </button>
              </div>
            )}

            {etaResult && (
              <div className="space-y-2">
                {etaResult.upstream_warning && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-[11px] text-red-700 inline-flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>Station appears upstream of the pollution — plume cannot reach it via downstream flow.</span>
                  </div>
                )}
                {etaResult.used_fallback_distance && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 text-[11px] text-amber-800">
                    River geometry unavailable — using straight-line approximation.
                  </div>
                )}

                <div className="bg-dusk/5 border border-dusk/20 rounded-xl p-3 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 text-dusk font-bold pb-1.5 border-b border-dusk/15">
                    <Navigation className="w-3.5 h-3.5" />
                    Plume trajectory
                  </div>
                  <MetricRow icon={<Route   className="w-3.5 h-3.5" />} label="Distance"     value={`${etaResult.distance_km.toFixed(1)} km`} />
                  <MetricRow icon={<Gauge   className="w-3.5 h-3.5" />} label="Velocity"     value={`${etaResult.estimated_velocity_kmh.toFixed(2)} km/h`} />
                  <MetricRow icon={<Gauge   className="w-3.5 h-3.5" />} label="Discharge"    value={`${Math.round(etaResult.current_discharge_m3s)} m³/s`} />
                  <MetricRow icon={<Clock   className="w-3.5 h-3.5" />} label="Transit"      value={`${etaResult.transit_time_hours.toFixed(1)} h`} />
                  <MetricRow icon={<Clock   className="w-3.5 h-3.5" />} label="ETA"          value={new Date(etaResult.eta_timestamp).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})} />
                  <p className="text-[10px] text-gray-400 pt-1.5 mt-1.5 border-t border-dusk/10 italic">
                    {routeGeometry
                      ? `Route follows ${routeGeometry.length} river points (OSM geometry)`
                      : etaResult.used_fallback_distance
                        ? 'Straight-line geodesic estimate'
                        : 'Computing river path…'}
                  </p>
                </div>

                <button onClick={clearEta}
                  className="w-full text-xs font-semibold text-gray-500 hover:text-red-600 py-1">
                  Clear ETA &amp; remove markers
                </button>
              </div>
            )}
          </div>

          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Map Source
            </p>
          </div>

          <div className="p-3 pt-1 space-y-2">
            {MAP_SOURCES.map(src => {
              const isActive = activeSource.id === src.id;
              return (
                <button
                  key={src.id}
                  onClick={() => { setActiveSource(src); setPanelOpen(false); }}
                  className={`w-full text-left p-3.5 rounded-xl border-2 transition-all duration-300 group
                              ${isActive
                                ? 'border-dusk bg-dusk/5 shadow-soft animate-[softPop_0.2s_ease-out]'
                                : 'border-grass/20 hover:border-dusk/40 hover:shadow-soft hover:-translate-y-[1px]'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: src.color }}
                      />
                      <div>
                        <p className={`font-semibold text-sm transition-colors
                                       ${isActive ? 'text-dusk' : 'text-gray-900 group-hover:text-dusk'}`}>
                          {src.name}
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                          {src.org}
                        </p>
                      </div>
                    </div>
                    {isActive
                      ? <Check className="w-4 h-4 text-dusk flex-shrink-0 mt-0.5" />
                      : src.url && <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-dusk transition-colors flex-shrink-0 mt-0.5" />
                    }
                  </div>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed pl-5">
                    {src.description}
                  </p>
                  {src.wms && (
                    <span className="mt-2 ml-5 inline-block text-[10px] bg-dusk/10 text-dusk
                                     px-2 py-0.5 rounded-full font-semibold">
                      + {src.wms.label}
                    </span>
                  )}
                  {src.url && !isActive && (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="mt-1 ml-5 inline-block text-[10px] text-dusk hover:underline"
                    >
                      Open portal →
                    </a>
                  )}
                </button>
              );
            })}
          </div>

          </div>{/* end scrollable body */}

          {/* Legend — sticky footer outside the scroll area */}
          <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm px-4 py-3 border-t border-grass/20">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Severity legend
            </p>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(SEVERITY_COLOR).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ background: v }} />
                  <span className="text-xs capitalize text-gray-600">{k}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Active source label (bottom-left) */}
      <div className="absolute bottom-4 left-3 z-[999] bg-white/90 backdrop-blur-sm
                      px-2.5 py-1 rounded-lg text-[11px] font-semibold text-gray-600
                      border border-grass/20 shadow-soft pointer-events-none">
        {activeSource.name}
        {activeSource.wms && ` + ${activeSource.wms.label}`}
      </div>

      {/* ETA picking floating banner (visible when panel closed) */}
      {etaStep && !panelOpen && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[999]
                        bg-white/95 backdrop-blur-sm shadow-soft border border-grass/30
                        px-4 py-2 rounded-xl text-sm font-semibold text-gray-800
                        flex items-center gap-3 max-w-[90%]">
          <span className={`w-2 h-2 rounded-full ${etaStep === 'pollution' ? 'bg-red-600' : 'bg-blue-600'} animate-pulse`} />
          <span>
            {etaStep === 'pollution'
              ? '📍 Click on the pollution source'
              : '📡 Click on the monitoring station'}
          </span>
          <button onClick={clearEta}
            className="text-xs font-semibold text-gray-400 hover:text-red-600 ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <MapContainer
        center={[44.7, 26.5]}
        zoom={7}
        scrollWheelZoom
        className="w-full h-full"
        attributionControl={false}
      >
        <AttributionControl position="bottomleft" prefix={false} />
        <TileLayerController source={activeSource} />

        {/* Heatmap (only when enabled) */}
        <HeatmapLayer visible={showHeatmap} />

        {/* Markers (only when enabled) */}
        {showMarkers && POLLUTION_POINTS.map(p => (
          <CircleMarker
            key={p.id}
            center={p.coords}
            radius={12}
            pathOptions={{
              color:       SEVERITY_COLOR[p.severity],
              fillColor:   SEVERITY_COLOR[p.severity],
              fillOpacity: 0.75,
              weight:      2.5,
            }}
            eventHandlers={{ click: () => setSelected(p) }}
          >
            <Tooltip>{p.name}</Tooltip>
          </CircleMarker>
        ))}

        {/* Water stations layer */}
        <StationsLayer
          stations={stations}
          visible={stationsVisible}
          onSelect={setSelectedStation}
        />

        {/* Rectangle drawer for satellite analysis */}
        <DrawController
          active={drawing}
          clearKey={clearKey}
          onComplete={handleBboxComplete}
          onCancel={() => setDrawing(false)}
        />

        {/* Generated heatmap image overlay from analysis */}
        <AnalysisOverlay
          url={analysis?.imageUrl ?? null}
          bounds={analysis?.bbox ?? null}
        />

        {/* ETA picker — captures map clicks during selection */}
        <ETAController
          active={etaStep !== null}
          step={etaStep}
          onPick={handleEtaPick}
          onCancel={clearEta}
        />

        {/* ETA visualization — renders markers + route line + arrow */}
        <ETAVisualization
          pollution={pollutionPt}
          station={stationPt}
          result={etaResult}
          routeGeometry={routeGeometry}
        />
      </MapContainer>

      {selected && <PointDetailSheet point={selected} onClose={() => setSelected(null)} />}
      {selectedStation && <StationDetailSheet station={selectedStation} onClose={() => setSelectedStation(null)} />}

      </div>{/* end map area */}

      {/* ── Desktop sidebar panel — flex sibling, NEVER overlaps the map ── */}
      {panelOpen && (
        <div
          className="hidden md:flex flex-col w-80 flex-shrink-0
                      bg-white/98 border-l border-grass/20 shadow-2xl
                      animate-[slideInRight_0.22s_ease-out] overflow-hidden"
          onWheel={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm px-4 py-3
                          border-b border-grass/20 flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-gray-900 text-sm">Map Layers</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Choose source, display, or analyze a zone</p>
            </div>
            <button onClick={() => setPanelOpen(false)}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain pb-3">

            {/* Display mode */}
            <div className="px-4 pt-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Display</p>
              <div className="grid grid-cols-3 gap-1.5 bg-gray-100 p-1 rounded-xl">
                {([
                  { id: 'markers', label: 'Markers', icon: MapPin },
                  { id: 'heatmap', label: 'Heatmap', icon: Flame },
                  { id: 'both',    label: 'Both',    icon: Layers },
                ] as const).map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setDisplayMode(id)}
                    className={`flex flex-col items-center gap-0.5 py-2 rounded-lg text-[11px] font-semibold transition
                      ${displayMode === id
                        ? 'bg-white text-dusk shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Layers */}
            <div className="px-4 pt-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Layers</p>
              <button onClick={() => setStationsVisible(v => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition border-2
                  ${stationsVisible
                    ? 'bg-dusk text-white border-dusk'
                    : 'bg-white text-gray-700 border-grass/30 hover:border-dusk/40'}`}>
                <span className="inline-flex items-center gap-2">
                  <Factory className="w-4 h-4" />
                  Water Stations
                  {stationsVisible && stations.length > 0 && (
                    <span className="text-[10px] font-normal opacity-80">· {stations.length}</span>
                  )}
                </span>
                {stationsLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <span className={`w-2 h-2 rounded-full ${stationsVisible ? 'bg-white' : 'bg-gray-300'}`} />}
              </button>
            </div>

            {/* Satellite Analysis */}
            <div className="px-4 pt-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Satellite Analysis</p>
              {!analysis && !drawing && !analyzing && (
                <button onClick={() => { setDrawing(true); setPanelOpen(false); setAnalysisError(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-dusk/30 hover:border-dusk hover:bg-dusk/5 text-sm font-semibold text-dusk transition">
                  <Crosshair className="w-4 h-4" />
                  Draw zone to analyze
                </button>
              )}
              {drawing && (
                <div className="bg-dusk/5 border border-dusk/20 rounded-xl p-3 text-xs text-gray-700">
                  <p className="font-semibold text-dusk mb-1">📐 Draw a rectangle on the map</p>
                  <p className="text-gray-500">Click and drag to select the analysis zone. Press Esc to cancel.</p>
                  <button onClick={() => setDrawing(false)} className="mt-2 text-xs font-semibold text-gray-500 hover:text-gray-800">Cancel</button>
                </div>
              )}
              {analyzing && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-dusk/5 text-sm text-dusk font-semibold">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing zone…
                </div>
              )}
              {analysisError && (
                <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">{analysisError}</div>
              )}
              {analysis && (
                <div className="space-y-2">
                  <div className="bg-dusk/5 border border-dusk/20 rounded-xl p-3 text-xs">
                    <p className="font-semibold text-dusk mb-1.5">✓ Zone analyzed</p>
                    <div className="grid grid-cols-2 gap-1.5 text-gray-700">
                      <div><span className="text-gray-400">Chl-a avg:</span><br/><b>{analysis.metrics.chlorophyll_avg.toFixed(1)} mg/m³</b></div>
                      <div><span className="text-gray-400">Chl-a max:</span><br/><b>{analysis.metrics.chlorophyll_max.toFixed(1)} mg/m³</b></div>
                      <div><span className="text-gray-400">Turbidity:</span><br/><b>{analysis.metrics.turbidity_avg.toFixed(1)} NTU</b></div>
                      <div><span className="text-gray-400">Confidence:</span><br/><b>{(analysis.metrics.confidence * 100).toFixed(0)}%</b></div>
                    </div>
                    {analysis.source && (
                      <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100 italic">
                        {analysis.source}
                      </p>
                    )}
                  </div>
                  <button onClick={() => { setAnalysis(null); setAnalysisError(null); setClearKey(k => k + 1); }}
                    className="w-full text-xs font-semibold text-gray-500 hover:text-red-600 py-1">
                    Clear analysis &amp; remove zone
                  </button>
                </div>
              )}
            </div>

            {/* Pollution ETA */}
            <div className="px-4 pt-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Pollution ETA</p>
              {!etaStep && !etaLoading && !etaResult && !etaError && (
                <button onClick={startEta}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-dusk/30 hover:border-dusk hover:bg-dusk/5 text-sm font-semibold text-dusk transition">
                  <Navigation className="w-4 h-4" />
                  Track plume downstream
                </button>
              )}
              {etaStep === 'pollution' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-gray-700">
                  <p className="font-semibold text-red-700 mb-1">📍 Step 1 / 2 — Pollution source</p>
                  <p className="text-gray-600">Click on the map where pollution was detected. Press Esc to cancel.</p>
                  <button onClick={clearEta} className="mt-2 text-xs font-semibold text-gray-500 hover:text-gray-800">Cancel</button>
                </div>
              )}
              {etaCandidates.length > 0 && !etaResult && !etaLoading && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs">
                  <p className="font-semibold text-blue-700 mb-2">📡 Step 2 / 2 — Pick downstream station</p>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {etaCandidates.map(s => (
                      <button key={s.id} onClick={() => handleStationPick(s)}
                        className="w-full text-left bg-white hover:bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2 transition">
                        <p className="font-semibold text-gray-800 text-[11px] leading-tight">{s.name}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {s.station_type} · {s.operator || 'Unknown operator'}
                        </p>
                      </button>
                    ))}
                  </div>
                  <button onClick={clearEta} className="mt-2 text-xs font-semibold text-gray-500 hover:text-gray-800">Cancel</button>
                </div>
              )}
              {etaLoading && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-dusk/5 text-sm text-dusk font-semibold">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Computing route &amp; discharge…
                </div>
              )}
              {etaError && (
                <div className="space-y-2">
                  <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">{etaError}</div>
                  <button onClick={clearEta} className="w-full text-xs font-semibold text-gray-500 hover:text-red-600 py-1">Reset</button>
                </div>
              )}
              {etaResult && (
                <div className="space-y-2">
                  {etaResult.upstream_warning && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-[11px] text-red-700 inline-flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>Station appears upstream — plume cannot reach it via downstream flow.</span>
                    </div>
                  )}
                  {etaResult.used_fallback_distance && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 text-[11px] text-amber-800">
                      River geometry unavailable — using straight-line approximation.
                    </div>
                  )}
                  <div className="bg-dusk/5 border border-dusk/20 rounded-xl p-3 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 text-dusk font-bold pb-1.5 border-b border-dusk/15">
                      <Navigation className="w-3.5 h-3.5" />
                      Plume trajectory
                    </div>
                    <MetricRow icon={<Route   className="w-3.5 h-3.5" />} label="Distance"  value={`${etaResult.distance_km.toFixed(1)} km`} />
                    <MetricRow icon={<Gauge   className="w-3.5 h-3.5" />} label="Velocity"  value={`${etaResult.estimated_velocity_kmh.toFixed(2)} km/h`} />
                    <MetricRow icon={<Gauge   className="w-3.5 h-3.5" />} label="Discharge" value={`${Math.round(etaResult.current_discharge_m3s)} m³/s`} />
                    <MetricRow icon={<Clock   className="w-3.5 h-3.5" />} label="Transit"   value={`${etaResult.transit_time_hours.toFixed(1)} h`} />
                    <MetricRow icon={<Clock   className="w-3.5 h-3.5" />} label="ETA"       value={new Date(etaResult.eta_timestamp).toLocaleString(undefined, {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})} />
                    <p className="text-[10px] text-gray-400 pt-1.5 mt-1.5 border-t border-dusk/10 italic">
                      {routeGeometry
                        ? `Route follows ${routeGeometry.length} river points (OSM geometry)`
                        : etaResult.used_fallback_distance
                          ? 'Straight-line geodesic estimate'
                          : 'Computing river path…'}
                    </p>
                  </div>
                  <button onClick={clearEta} className="w-full text-xs font-semibold text-gray-500 hover:text-red-600 py-1">Clear ETA &amp; remove markers</button>
                </div>
              )}
            </div>

            {/* Map source list */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Map Source</p>
            </div>
            <div className="p-3 pt-1 space-y-2">
              {MAP_SOURCES.map(src => {
                const isActive = activeSource.id === src.id;
                return (
                  <button
                    key={src.id}
                    onClick={() => { setActiveSource(src); }}
                    className={`w-full text-left p-3.5 rounded-xl border-2 transition-all duration-300 group
                                ${isActive
                                  ? 'border-dusk bg-dusk/5 shadow-soft animate-[softPop_0.2s_ease-out]'
                                  : 'border-grass/20 hover:border-dusk/40 hover:shadow-soft hover:-translate-y-[1px]'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: src.color }} />
                        <div>
                          <p className={`font-semibold text-sm transition-colors ${isActive ? 'text-dusk' : 'text-gray-900 group-hover:text-dusk'}`}>{src.name}</p>
                          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{src.org}</p>
                        </div>
                      </div>
                      {isActive
                        ? <Check className="w-4 h-4 text-dusk flex-shrink-0 mt-0.5" />
                        : src.url && <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-dusk transition-colors flex-shrink-0 mt-0.5" />
                      }
                    </div>
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed pl-5">{src.description}</p>
                    {src.wms && (
                      <span className="mt-2 ml-5 inline-block text-[10px] bg-dusk/10 text-dusk px-2 py-0.5 rounded-full font-semibold">+ {src.wms.label}</span>
                    )}
                    {src.url && !isActive && (
                      <a href={src.url} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="mt-1 ml-5 inline-block text-[10px] text-dusk hover:underline">
                        Open portal →
                      </a>
                    )}
                  </button>
                );
              })}
            </div>

          </div>{/* end scrollable body */}

          {/* Legend footer */}
          <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm px-4 py-3 border-t border-grass/20">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Severity legend</p>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(SEVERITY_COLOR).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ background: v }} />
                  <span className="text-xs capitalize text-gray-600">{k}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>

  );
}

/* ── Detail sheet ────────────────────────────────────────────── */
function PointDetailSheet({ point, onClose }: { point: PollutionPoint; onClose: () => void }) {
  const Source = SOURCE_META[point.source];
  return (
    <div className="absolute inset-x-0 bottom-20 md:bottom-0 z-[400] bg-white rounded-t-3xl shadow-2xl
                    p-5 pb-safe animate-[slideUp_0.25s_ease-out] max-h-[60%] overflow-auto">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Source.icon className="w-4 h-4 text-dusk" />
            <span className="text-xs uppercase tracking-wider font-bold text-dusk">{Source.label}</span>
          </div>
          <h3 className="font-display text-xl font-bold text-gray-900">{point.name}</h3>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-gray-50 border-l-4"
        style={{ borderColor: SEVERITY_COLOR[point.severity] }}>
        <AlertTriangle className="w-4 h-4 text-gray-600" />
        <span className="text-sm font-semibold text-gray-700 capitalize">{point.severity} severity</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric label="Chlorophyll"  value={`${point.metrics.chlorophyll_mg_m3} mg/m³`} />
        <Metric label="Nitrates"     value={`${point.metrics.nitrates_mg_l} mg/L`} />
        <Metric label="Phosphates"   value={`${point.metrics.phosphates_mg_l} mg/L`} />
        <Metric label="Heat Anomaly" value={`+${point.metrics.heatAnomaly_C} °C`} />
      </div>

      {point.notes && (
        <p className="mt-4 text-sm text-gray-500 italic bg-gray-50 rounded-xl p-3">
          &ldquo;{point.notes}&rdquo;
        </p>
      )}
      <p className="mt-3 text-xs text-gray-400">
        Reported {new Date(point.reportedAt).toLocaleString()}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{label}</p>
      <p className="font-display text-lg font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function MetricRow({ icon, label, value }:
  { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-gray-700">
      <span className="inline-flex items-center gap-1.5 text-gray-500">
        {icon} {label}
      </span>
      <span className="font-bold text-gray-900">{value}</span>
    </div>
  );
}

/* ── Station detail sheet ──────────────────────────────────────── */
function StationDetailSheet({
  station, onClose,
}: { station: WaterStation; onClose: () => void }) {
  const typeMeta: Record<string, { label: string; color: string; emoji: string }> = {
    treatment:  { label: 'Treatment Plant',     color: '#35858E', emoji: '★' },
    monitoring: { label: 'Monitoring Station',  color: '#7DA78C', emoji: '◆' },
    intake:     { label: 'Water Intake',        color: '#C2D099', emoji: '▼' },
  };
  const meta = typeMeta[station.station_type] ?? { label: station.station_type, color: '#6b7280', emoji: '•' };

  // Sensor history + discharge are loaded lazily when sheet opens
  const [history, setHistory] = useState<{
    readings: SensorReading[];
    latest: SensorReading;
    quality: WaterQuality;
    isMock: boolean;
  } | null>(null);
  const [discharge, setDischarge] = useState<DischargeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchSensorHistory(station.id, 7),
      fetchDischarge(station.coords[0], station.coords[1]),
    ])
      .then(([h, d]) => {
        if (cancelled) return;
        setHistory(h);
        setDischarge(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [station.id, station.coords]);

  const qualityMeta = QUALITY_META[history?.quality ?? 'good'];

  return (
    <div className="absolute inset-x-0 bottom-0 md:bottom-auto md:top-16 md:right-3 md:left-auto md:w-96
                    z-[600] bg-white rounded-t-3xl md:rounded-2xl shadow-2xl
                    border border-grass/30 overflow-hidden
                    animate-[slideUp_0.2s_ease-out] max-h-[85vh] overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between"
           style={{ background: `linear-gradient(90deg, ${meta.color}20, transparent)` }}>
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-base"
                style={{ background: meta.color }}>{meta.emoji}</span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: meta.color }}>
              {meta.label}
            </p>
            <p className="text-xs text-gray-400">{station.river_name}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        <p className="font-display font-bold text-gray-900 text-sm leading-tight">{station.name}</p>

        {/* Water Quality Badge */}
        {!loading && history && (
          <div className={`rounded-xl border p-3 flex items-center gap-3 ${qualityMeta.bg} ${qualityMeta.border}`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${qualityMeta.iconBg}`}>
              <Droplet className={`w-5 h-5 ${qualityMeta.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] uppercase tracking-widest font-bold ${qualityMeta.text}`}>
                Water quality
              </p>
              <p className={`font-display font-bold text-base capitalize ${qualityMeta.text}`}>
                {history.quality}
              </p>
            </div>
            {history.isMock && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 bg-white/60 px-1.5 py-0.5 rounded">
                est.
              </span>
            )}
          </div>
        )}

        {/* Live discharge */}
        {!loading && discharge && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">
                Live discharge
              </p>
              {discharge.isMock ? (
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">offline</span>
              ) : (
                <span className="text-[9px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  Open-Meteo
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display font-bold text-2xl text-blue-900">
                {Math.round(discharge.current_m3s).toLocaleString()}
              </span>
              <span className="text-xs text-blue-700 font-semibold">m³/s</span>
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-blue-700">
                {discharge.trend === 'rising'  && <><TrendingUp className="w-3.5 h-3.5" /> rising</>}
                {discharge.trend === 'falling' && <><TrendingDown className="w-3.5 h-3.5" /> falling</>}
                {discharge.trend === 'stable'  && <><Minus className="w-3.5 h-3.5" /> stable</>}
              </span>
            </div>
          </div>
        )}

        {/* Sensor history sparklines */}
        {!loading && history && history.readings.length > 1 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                7-day trend
              </p>
              <span className="text-[9px] text-gray-400 uppercase tracking-wider">
                {history.readings.length} readings
              </span>
            </div>

            <SensorSpark
              icon={<Beaker className="w-3 h-3 text-green-700" />}
              label="Chl-a"
              unit="mg/m³"
              value={history.latest.chlorophyll}
              data={history.readings.map(r => r.chlorophyll)}
              color="#16a34a"
            />
            <SensorSpark
              icon={<Beaker className="w-3 h-3 text-amber-700" />}
              label="Nitrate"
              unit="mg/L"
              value={history.latest.nitrate}
              data={history.readings.map(r => r.nitrate)}
              color="#d97706"
            />
            <SensorSpark
              icon={<Beaker className="w-3 h-3 text-blue-700" />}
              label="Turbidity"
              unit="NTU"
              value={history.latest.turbidity}
              data={history.readings.map(r => r.turbidity)}
              color="#0284c7"
            />
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Loading sensors…</span>
          </div>
        )}

        {/* Static metadata at the bottom */}
        <div className="space-y-1.5 text-xs pt-1">
          {station.operator && (
            <MetricRow icon={<Activity className="w-3.5 h-3.5" />} label="Operator"
              value={station.operator} />
          )}
          {station.capacity_m3_day && (
            <MetricRow icon={<Gauge className="w-3.5 h-3.5" />} label="Capacity"
              value={`${station.capacity_m3_day.toLocaleString()} m³/day`} />
          )}
          <MetricRow icon={<MapPin className="w-3.5 h-3.5" />} label="Coordinates"
            value={`${station.coords[0].toFixed(4)}, ${station.coords[1].toFixed(4)}`} />
          <MetricRow icon={<Check className="w-3.5 h-3.5" />} label="Status"
            value={station.is_active ? 'Active' : 'Inactive'} />
        </div>
      </div>
    </div>
  );
}

/* ── Quality badge color palette ─────────────────────────────────── */
const QUALITY_META: Record<WaterQuality, {
  bg: string; border: string; text: string; iconBg: string; iconColor: string;
}> = {
  good:     { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-800',  iconBg: 'bg-green-200',  iconColor: 'text-green-700' },
  fair:     { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', iconBg: 'bg-yellow-200', iconColor: 'text-yellow-700' },
  poor:     { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', iconBg: 'bg-orange-200', iconColor: 'text-orange-700' },
  critical: { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-800',    iconBg: 'bg-red-200',    iconColor: 'text-red-700'    },
};

/** One sensor's row: icon + label + sparkline + current value */
function SensorSpark({
  icon, label, unit, value, data, color,
}: {
  icon: React.ReactNode; label: string; unit: string;
  value: number; data: number[]; color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-600 font-semibold">
          {icon} {label}
        </span>
        <span className="text-[11px] text-gray-700 font-bold">
          {value.toFixed(1)} <span className="text-gray-400 font-normal">{unit}</span>
        </span>
      </div>
      <Sparkline data={data} color={color} height={28} />
    </div>
  );
}
