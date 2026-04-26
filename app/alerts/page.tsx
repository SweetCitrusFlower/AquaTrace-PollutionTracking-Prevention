'use client';
// app/alerts/page.tsx
// Real-time anomaly feed — shows water-quality alerts detected by sensors,
// satellite analysis, and citizen report clusters.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, MapPin, Clock, CheckCircle2, Eye, ExternalLink } from 'lucide-react';
import { fetchAnomalies, type Anomaly, type AnomalySeverity } from '@/lib/anomaliesApi';

export default function AlertsPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | AnomalySeverity>('all');

  useEffect(() => {
    let cancelled = false;
    fetchAnomalies(50)
      .then(res => {
        if (cancelled) return;
        setAnomalies(res.anomalies);
        setIsMock(res.isMock);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = anomalies.filter(a => {
    if (filter === 'all')  return true;
    if (filter === 'open') return a.status === 'open';
    return a.severity === filter;
  });

  const counts = {
    all:      anomalies.length,
    open:     anomalies.filter(a => a.status === 'open').length,
    critical: anomalies.filter(a => a.severity === 'critical').length,
    high:     anomalies.filter(a => a.severity === 'high').length,
    moderate: anomalies.filter(a => a.severity === 'moderate').length,
  };

  return (
    <div className="px-4 md:px-10 py-6 max-w-4xl mx-auto">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
          <h1 className="font-display text-3xl font-bold text-gray-900 dark:text-gray-100">
            Anomaly Feed
          </h1>
          {isMock && (
            <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
              demo
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
          Live water-quality alerts — combining Sentinel-2 satellite anomalies, sensor threshold breaches,
          and citizen report clusters. Sorted by detection time.
        </p>
      </header>

      {/* Filter chips */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
        <FilterChip active={filter === 'all'}      onClick={() => setFilter('all')}      label="All"      count={counts.all}      color="dusk" />
        <FilterChip active={filter === 'open'}     onClick={() => setFilter('open')}     label="Open"     count={counts.open}     color="amber" />
        <FilterChip active={filter === 'critical'} onClick={() => setFilter('critical')} label="Critical" count={counts.critical} color="red" />
        <FilterChip active={filter === 'high'}     onClick={() => setFilter('high')}     label="High"     count={counts.high}     color="orange" />
        <FilterChip active={filter === 'moderate'} onClick={() => setFilter('moderate')} label="Moderate" count={counts.moderate} color="yellow" />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading alerts…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-grass/10 dark:bg-[#1f2937] rounded-2xl p-8 text-center border border-grass/30">
          <CheckCircle2 className="w-10 h-10 text-dusk mx-auto mb-3" />
          <p className="font-display font-bold text-gray-700 dark:text-gray-200">
            No alerts in this category
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            All clear — water quality is within thresholds.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map(a => <AnomalyCard key={a.id} a={a} />)}
        </ul>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, count, color }: {
  active: boolean; onClick: () => void; label: string; count: number; color: string;
}) {
  const baseColor: Record<string, { bg: string; text: string; activeBg: string }> = {
    dusk:   { bg: 'bg-dusk/10',    text: 'text-dusk',     activeBg: 'bg-dusk text-white' },
    amber:  { bg: 'bg-amber-100',  text: 'text-amber-700', activeBg: 'bg-amber-600 text-white' },
    red:    { bg: 'bg-red-100',    text: 'text-red-700',   activeBg: 'bg-red-600 text-white' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-700', activeBg: 'bg-orange-600 text-white' },
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', activeBg: 'bg-yellow-600 text-white' },
  };
  const c = baseColor[color] ?? baseColor.dusk;

  return (
    <button onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap
        ${active ? c.activeBg : `${c.bg} ${c.text} hover:opacity-80`}`}>
      {label} <span className="opacity-70">· {count}</span>
    </button>
  );
}

function AnomalyCard({ a }: { a: Anomaly }) {
  const sevMeta = SEVERITY_META[a.severity];
  const statusMeta = STATUS_META[a.status];
  const ago = formatRelativeTime(a.detected_at);
  const overshoot = ((a.measured_value - a.threshold) / a.threshold * 100);

  return (
    <article className={`rounded-2xl p-4 border-l-4 ${sevMeta.borderL}
                         bg-white dark:bg-[#1f2937] border-r border-y border-grass/20 dark:border-[#374151]
                         shadow-soft hover:shadow-md transition`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${sevMeta.iconBg}`}>
          <AlertTriangle className={`w-5 h-5 ${sevMeta.iconColor}`} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row: severity + status + time */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${sevMeta.badge}`}>
              {a.severity}
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${statusMeta.badge}`}>
              {statusMeta.icon}
              {a.status}
            </span>
            <span className="text-[11px] text-gray-400 inline-flex items-center gap-1 ml-auto">
              <Clock className="w-3 h-3" /> {ago}
            </span>
          </div>

          {/* Parameter + headline value */}
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <p className="font-display font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">
              {a.parameter}
            </p>
            <p className="font-display font-bold text-lg whitespace-nowrap" style={{ color: sevMeta.color }}>
              {a.measured_value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              <span className="text-xs text-gray-400 font-normal ml-1">{a.unit}</span>
            </p>
          </div>

          {/* Threshold info */}
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            <span className="text-gray-400">Threshold:</span> {a.threshold} {a.unit}
            {overshoot > 0 && (
              <span className="ml-2 font-bold" style={{ color: sevMeta.color }}>
                +{overshoot.toFixed(0)}% above
              </span>
            )}
          </p>

          {/* Description */}
          {a.description && (
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-2 leading-relaxed">
              {a.description}
            </p>
          )}

          {/* Footer: location */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-[#374151]">
            <span className="text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1 truncate min-w-0">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{a.station_name}</span>
              <span className="text-gray-400">· {a.river_name}</span>
            </span>
            <Link href="/map"
              className="text-[11px] font-bold text-dusk hover:underline inline-flex items-center gap-0.5 flex-shrink-0">
              View on map <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

const SEVERITY_META: Record<AnomalySeverity, {
  color: string; iconBg: string; iconColor: string; borderL: string; badge: string;
}> = {
  low:      { color: '#7DA78C', iconBg: 'bg-green-100',  iconColor: 'text-green-700',  borderL: 'border-l-green-400',  badge: 'bg-green-100 text-green-800' },
  moderate: { color: '#d97706', iconBg: 'bg-yellow-100', iconColor: 'text-yellow-700', borderL: 'border-l-yellow-400', badge: 'bg-yellow-100 text-yellow-800' },
  high:     { color: '#ea580c', iconBg: 'bg-orange-100', iconColor: 'text-orange-700', borderL: 'border-l-orange-500', badge: 'bg-orange-100 text-orange-800' },
  critical: { color: '#dc2626', iconBg: 'bg-red-100',    iconColor: 'text-red-700',    borderL: 'border-l-red-500',    badge: 'bg-red-100 text-red-800' },
};

const STATUS_META: Record<Anomaly['status'], { badge: string; icon: React.ReactNode }> = {
  open:         { badge: 'bg-red-50 text-red-700 border border-red-200',     icon: <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" /> },
  acknowledged: { badge: 'bg-amber-50 text-amber-700 border border-amber-200', icon: <Eye className="w-2.5 h-2.5" /> },
  resolved:     { badge: 'bg-green-50 text-green-700 border border-green-200', icon: <CheckCircle2 className="w-2.5 h-2.5" /> },
};

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
