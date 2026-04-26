'use client';

import { useEffect, useState } from 'react';
import { Database, Loader2, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { fetchDataSources, type DataSource } from '@/lib/dataSourcesApi';

/** Compact card showing the live status of all integrated data sources.
 *  Renders cleanly even when the backend is offline (uses static fallback). */
export default function DataSourcesCard() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDataSources()
      .then((res) => {
        if (cancelled) return;
        setSources(res.sources);
        setOffline(res.offline === true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-white border border-grass/30 rounded-3xl p-5 shadow-soft">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-dusk/10 flex items-center justify-center">
            <Database className="w-4 h-4 text-dusk" />
          </div>
          <div>
            <h3 className="font-display text-sm font-bold text-gray-900">Live Data Sources</h3>
            <p className="text-[10px] text-gray-400">Real APIs powering this platform</p>
          </div>
        </div>
        {offline && (
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
            Backend offline
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : (
        <ul className="space-y-2">
          {sources.map((s) => (
            <SourceRow key={s.id} source={s} />
          ))}
        </ul>
      )}

      <p className="mt-4 pt-3 border-t border-gray-100 text-[10px] text-gray-400 leading-relaxed">
        EEA Waterbase, Copernicus, EMODnet — all connected via official EU open-data APIs. Sources marked
        <span className="text-amber-600 font-semibold"> mock</span> are stubbed for hackathon and ready
        for live integration post-event.
      </p>
    </div>
  );
}

function SourceRow({ source }: { source: DataSource }) {
  const statusMeta = STATUS_META[source.status] ?? STATUS_META.unknown;
  const Icon = statusMeta.icon;

  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${statusMeta.color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-900 truncate">{source.name}</p>
        {source.data_type && (
          <p className="text-[10px] text-gray-500 truncate">{source.data_type}</p>
        )}
      </div>
      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${statusMeta.bgColor}`}>
        {source.status}
      </span>
    </li>
  );
}

const STATUS_META: Record<string, {
  icon: typeof CheckCircle2;
  color: string;
  bgColor: string;
}> = {
  active:  { icon: CheckCircle2, color: 'text-green-600', bgColor: 'bg-green-50 text-green-700' },
  mock:    { icon: AlertCircle,  color: 'text-amber-600', bgColor: 'bg-amber-50 text-amber-700' },
  unknown: { icon: HelpCircle,   color: 'text-gray-400',  bgColor: 'bg-gray-100 text-gray-500' },
};
