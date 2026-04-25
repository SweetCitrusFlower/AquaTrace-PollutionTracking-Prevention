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
import { X, Satellite, Radio, User, AlertTriangle, Layers, ExternalLink, Check, Flame, MapPin, Crosshair, Loader2, Navigation, Clock, Gauge, Route } from 'lucide-react';

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
  pollution, station, result,
}: {
  pollution: LatLng | null;
  station:   LatLng | null;
  result:    EtaResult | null;
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

    // Route line (only when we have both endpoints AND a result)
    if (pollution && station && result) {
      const isUpstream = result.upstream_warning;
      const isFallback = result.used_fallback_distance;
      const color = isUpstream ? '#dc2626' : isFallback ? '#f59e0b' : '#35858E';

      const line = L.polyline(
        [[pollution.lat, pollution.lng], [station.lat, station.lng]],
        {
          color, weight: 4, opacity: 0.85,
          // Dashed for fallback to communicate "approximate"
          dashArray: isFallback ? '8, 8' : undefined,
        }
      ).addTo(map);
      layersRef.current.push(line);

      // Direction arrow at midpoint
      const midLat = (pollution.lat + station.lat) / 2;
      const midLng = (pollution.lng + station.lng) / 2;
      const angle = (Math.atan2(
        station.lat - pollution.lat,
        station.lng - pollution.lng,
      ) * 180) / Math.PI;

      const arrowIcon = L.divIcon({
        className: 'eta-arrow',
        html: `<div style="transform: rotate(${-angle}deg); color: ${color}; font-size: 28px; line-height: 1; text-shadow: 0 0 6px white, 0 0 6px white;">➤</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const arrow = L.marker([midLat, midLng], {
        icon: arrowIcon, interactive: false,
      }).addTo(map);
      layersRef.current.push(arrow);

      // Auto-fit map to show both endpoints
      map.fitBounds([
        [pollution.lat, pollution.lng],
        [station.lat, station.lng],
      ], { padding: [60, 60], maxZoom: 9 });
    }

    return () => {
      layersRef.current.forEach(l => map.removeLayer(l));
      layersRef.current = [];
    };
  }, [pollution, station, result, map]);

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
  imageUrl: string;       // generated heatmap PNG (mock: data-URL SVG)
  metrics: {
    chlorophyll_avg: number;
    chlorophyll_max: number;
    nitrate_avg: number;
    confidence: number;   // 0..1
  };
}

export default function MapView() {
  const [selected, setSelected] = useState<PollutionPoint | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeSource, setActiveSource] = useState<MapSource>(MAP_SOURCES[0]);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('markers');

  // Satellite analysis state
  const [drawing, setDrawing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  // Bumped to force the DrawController to remove the visible rectangle
  const [clearKey, setClearKey] = useState(0);

  // ETA tool state
  const [etaStep, setEtaStep] = useState<'pollution' | 'station' | null>(null);
  const [pollutionPt, setPollutionPt] = useState<LatLng | null>(null);
  const [stationPt,   setStationPt]   = useState<LatLng | null>(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [etaError, setEtaError] = useState<string | null>(null);
  const [etaResult, setEtaResult] = useState<EtaResult | null>(null);

  const showMarkers = displayMode === 'markers' || displayMode === 'both';
  const showHeatmap = displayMode === 'heatmap' || displayMode === 'both';

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
      setAnalysis({ bbox, imageUrl: data.imageUrl, metrics: data.metrics });
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  // Called when user clicks on the map during ETA picking
  const handleEtaPick = async (coords: LatLng) => {
    if (etaStep === 'pollution') {
      setPollutionPt(coords);
      setStationPt(null);
      setEtaResult(null);
      setEtaStep('station');
    } else if (etaStep === 'station') {
      setStationPt(coords);
      setEtaStep(null);
      // Fire the ETA request
      if (!pollutionPt) return;
      setEtaLoading(true);
      setEtaError(null);
      try {
        const res = await fetch('/api/eta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pollution_lat: pollutionPt.lat,
            pollution_lon: pollutionPt.lng,
            station_lat:   coords.lat,
            station_lon:   coords.lng,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setEtaResult(data);
      } catch (err) {
        setEtaError(err instanceof Error ? err.message : 'ETA calculation failed');
      } finally {
        setEtaLoading(false);
      }
    }
  };

  const startEta = () => {
    setEtaStep('pollution');
    setPollutionPt(null);
    setStationPt(null);
    setEtaResult(null);
    setEtaError(null);
    setPanelOpen(false);
  };

  const clearEta = () => {
    setEtaStep(null);
    setPollutionPt(null);
    setStationPt(null);
    setEtaResult(null);
    setEtaError(null);
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
                   hover:bg-white transition"
      >
        <Layers className="w-4 h-4 text-dusk" />
        <span className="hidden sm:inline">{activeSource.name}</span>
        <span className="w-2 h-2 rounded-full ml-1" style={{ background: activeSource.color }} />
      </button>

      {/* Mobile panel — slides up from bottom over the map (unchanged behaviour) */}
      {panelOpen && (
        <div
          className="absolute md:hidden bottom-20 inset-x-0 z-[501]
                        bg-white/98 backdrop-blur-md shadow-2xl
                        border-t border-grass/20
                        rounded-t-3xl
                        animate-[slideUp_0.2s_ease-out] max-h-[70vh]
                        flex flex-col overflow-hidden"
          // Stop wheel events from reaching Leaflet (which would zoom the map)
          onWheel={(e) => e.stopPropagation()}
          // Same for touch on mobile so panel scroll doesn't pan the map
          onTouchMove={(e) => e.stopPropagation()}
          // Don't let drag-select on the panel become a map drag
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Panel header — fixed at top, never scrolls */}
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
                    <div><span className="text-gray-400">Nitrates:</span><br/><b>{analysis.metrics.nitrate_avg.toFixed(1)} mg/L</b></div>
                    <div><span className="text-gray-400">Confidence:</span><br/><b>{(analysis.metrics.confidence * 100).toFixed(0)}%</b></div>
                  </div>
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

            {etaStep === 'station' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-gray-700">
                <p className="font-semibold text-blue-700 mb-1">📡 Step 2 / 2 — Monitoring station</p>
                <p className="text-gray-600">Click the downstream station to estimate arrival.</p>
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
                  className={`w-full text-left p-3.5 rounded-xl border-2 transition-all group
                              ${isActive
                                ? 'border-dusk bg-dusk/5 shadow-soft'
                                : 'border-grass/20 hover:border-dusk/40 hover:shadow-soft'}`}
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
        />
      </MapContainer>

      {selected && <PointDetailSheet point={selected} onClose={() => setSelected(null)} />}

      </div>{/* end map area */}

      {/* ── Desktop sidebar panel — flex sibling, NEVER overlaps the map ── */}
      {panelOpen && (
        <div
          className="hidden md:flex flex-col w-80 flex-shrink-0
                      bg-white/98 border-l border-grass/20 shadow-2xl
                      animate-[slideInRight_0.2s_ease-out] overflow-hidden"
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
                      <div><span className="text-gray-400">Nitrates:</span><br/><b>{analysis.metrics.nitrate_avg.toFixed(1)} mg/L</b></div>
                      <div><span className="text-gray-400">Confidence:</span><br/><b>{(analysis.metrics.confidence * 100).toFixed(0)}%</b></div>
                    </div>
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
              {etaStep === 'station' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-gray-700">
                  <p className="font-semibold text-blue-700 mb-1">📡 Step 2 / 2 — Monitoring station</p>
                  <p className="text-gray-600">Click the downstream station to estimate arrival.</p>
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
                    className={`w-full text-left p-3.5 rounded-xl border-2 transition-all group
                                ${isActive
                                  ? 'border-dusk bg-dusk/5 shadow-soft'
                                  : 'border-grass/20 hover:border-dusk/40 hover:shadow-soft'}`}
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
