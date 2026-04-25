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
import { X, Satellite, Radio, User, AlertTriangle, Layers, ExternalLink, Check, Flame, MapPin, Crosshair, Loader2 } from 'lucide-react';

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

    // @ts-expect-error — leaflet.heat extends L but its types are loose
    const heat = L.heatLayer(points, {
      radius:   35,
      blur:     25,
      maxZoom:  10,
      max:      1.0,
      gradient: {
        0.2: '#7DA78C', // sage   → low
        0.4: '#C2D099', // lime   → moderate
        0.6: '#f59e0b', // amber  → high
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
  active, onComplete, onCancel,
}: {
  active: boolean;
  onComplete: (bbox: AnalysisBbox) => void;
  onCancel:   () => void;
}) {
  const map = useMap();
  const handlerRef = useRef<L.Draw.Rectangle | null>(null);
  const layerRef   = useRef<L.Rectangle | null>(null);

  useEffect(() => {
    if (!active) return;

    // Clear any previous rectangle
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }

    // @ts-expect-error — leaflet-draw types don't expose the constructor cleanly
    const drawer = new L.Draw.Rectangle(map, {
      shapeOptions: { color: '#35858E', weight: 2, fillOpacity: 0.1 },
    });
    drawer.enable();
    handlerRef.current = drawer;

    const onCreated = (e: L.LeafletEvent) => {
      // @ts-expect-error — DrawEvents.Created has `layer`
      const layer = e.layer as L.Rectangle;
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

  // Allow parent to clear the rectangle
  useEffect(() => {
    if (!active && layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
  }, [active, map]);

  // Expose cancel to consumer if user presses Escape
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

  return (
    <div className="relative h-full md:rounded-3xl overflow-hidden md:shadow-soft">

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

      {/* Source selector panel - on mobile, slides up from bottom; on desktop, slides from right */}
      {panelOpen && (
        <div className="absolute md:top-0 md:right-0 md:bottom-0 z-[501] w-full md:w-80
                        bg-white/98 backdrop-blur-md shadow-2xl
                        md:border-l border-t border-grass/20 overflow-y-auto
                        md:animate-[slideInRight_0.2s_ease-out]
                        bottom-20 md:bottom-auto rounded-t-3xl md:rounded-none
                        animate-[slideUp_0.2s_ease-out] max-h-[70vh] md:max-h-none">
          <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-4 py-3
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
                <button onClick={() => setAnalysis(null)}
                  className="w-full text-xs font-semibold text-gray-500 hover:text-red-600 py-1">
                  Clear analysis
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

          {/* Legend */}
          <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm px-4 py-3 border-t border-grass/20">
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
          onComplete={handleBboxComplete}
          onCancel={() => setDrawing(false)}
        />

        {/* Generated heatmap image overlay from analysis */}
        <AnalysisOverlay
          url={analysis?.imageUrl ?? null}
          bounds={analysis?.bbox ?? null}
        />
      </MapContainer>

      {selected && <PointDetailSheet point={selected} onClose={() => setSelected(null)} />}

      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
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
