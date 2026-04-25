'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet';
import { useState } from 'react';
import { POLLUTION_POINTS, type PollutionPoint } from '@/lib/mockData';
import { X, Satellite, Radio, User, AlertTriangle, Loader2 } from 'lucide-react';

const SEVERITY_COLOR: Record<PollutionPoint['severity'], string> = {
  low: '#84C5B1', moderate: '#d8cf86', high: '#f59e0b', critical: '#dc2626',
};
const SOURCE_META = {
  satellite:   { label: 'Satellite (Copernicus)', icon: Satellite },
  'ngo-sensor':{ label: 'NGO Sensor',             icon: Radio     },
  citizen:     { label: 'Citizen Report',         icon: User      },
} as const;

export default function MapView() {
  const [selected, setSelected] = useState<PollutionPoint | null>(null);
  const [clickedPoint, setClickedPoint] = useState<PollutionPoint | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleMapClick = async (lat: number, lng: number) => {
    setIsLoading(true);
    try {
      const resp = await fetch('/api/map/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setClickedPoint(data as PollutionPoint);
        setSelected(data as PollutionPoint);
      }
    } catch (err) {
      console.error('Failed to analyze location:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative h-[calc(100vh-12rem)] md:rounded-3xl overflow-hidden md:shadow-soft">
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute top-4 right-4 z-[500] bg-white/95 backdrop-blur-sm rounded-xl px-4 py-2 shadow-soft flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-dusk animate-spin" />
          <span className="text-sm font-medium text-dusk">Analyzing...</span>
        </div>
      )}

      <MapContainer
        center={[44.7, 26.5]}
        zoom={7}
        scrollWheelZoom
        className="w-full h-full"
      >
        <TileLayer
          attribution='© OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Pre-defined pollution markers */}
        {POLLUTION_POINTS.map(p => (
          <CircleMarker
            key={p.id}
            center={p.coords}
            radius={12}
            pathOptions={{
              color:       SEVERITY_COLOR[p.severity],
              fillColor:   SEVERITY_COLOR[p.severity],
              fillOpacity: 0.7,
              weight:      2,
            }}
            eventHandlers={{ click: () => setSelected(p) }}
          >
            <Tooltip>{p.name}</Tooltip>
          </CircleMarker>
        ))}

        {/* Click handler component */}
        <MapClickHandler onClick={handleMapClick} />
      </MapContainer>

      {/* Bottom-sheet detail panel */}
      {selected && (
        <PointDetailSheet 
          point={selected} 
          onClose={() => {
            setSelected(null);
            setClickedPoint(null);
          }} 
        />
      )}
    </div>
  );
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function PointDetailSheet({ point, onClose }: { point: PollutionPoint; onClose: () => void }) {
  const Source = SOURCE_META[point.source];
  return (
    <div className="absolute inset-x-0 bottom-0 z-[1000] bg-sand-light rounded-t-3xl shadow-2xl p-5 pb-safe
                    animate-[slideUp_0.25s_ease-out] max-h-[60%] overflow-auto">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Source.icon className="w-4 h-4 text-water-dark" />
            <span className="text-xs uppercase tracking-wider font-bold text-water-dark">{Source.label}</span>
          </div>
          <h3 className="font-display text-xl font-bold text-dusk-dark">{point.name}</h3>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-grass/40">
          <X className="w-5 h-5 text-dusk-dark" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-white/70 border-l-4"
        style={{ borderColor: SEVERITY_COLOR[point.severity] }}>
        <AlertTriangle className="w-4 h-4 text-dusk-dark" />
        <span className="text-sm font-semibold text-dusk-dark capitalize">{point.severity} severity</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric label="Chlorophyll"   value={`${point.metrics.chlorophyll_mg_m3} mg/m³`} />
        <Metric label="Nitrates"      value={`${point.metrics.nitrates_mg_l} mg/L`} />
        <Metric label="Phosphates"    value={`${point.metrics.phosphates_mg_l} mg/L`} />
        <Metric label="Heat Anomaly"  value={`+${point.metrics.heatAnomaly_C} °C`} />
      </div>

      {point.notes && (
        <p className="mt-4 text-sm text-dusk/80 italic bg-grass/30 rounded-xl p-3">
          &ldquo;{point.notes}&rdquo;
        </p>
      )}
      <p className="mt-3 text-xs text-dusk/60">
        Reported {new Date(point.reportedAt).toLocaleString()}
      </p>

      <style jsx>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/70 rounded-2xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-dusk/60 font-bold">{label}</p>
      <p className="font-display text-lg font-bold text-dusk-dark">{value}</p>
    </div>
  );
}
