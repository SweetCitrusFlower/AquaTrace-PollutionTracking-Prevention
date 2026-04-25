'use client';
import { useState } from 'react';
import { Check, X, Crown } from 'lucide-react';
import clsx from 'clsx';

const FEATURES = [
  { label: 'Live Copernicus satellite data',      free: true,  premium: true  },
  { label: 'NGO sensor network access',           free: true,  premium: true  },
  { label: '1-2 day pollution prediction',        free: true,  premium: true  },
  { label: '7+ day predictive forecasts',         free: false, premium: true  },
  { label: 'Advanced heatmaps (chlorophyll/temp)',free: false, premium: true  },
  { label: 'API access for fish-farms & agri',    free: false, premium: true  },
  { label: 'Custom zone alerts (SMS/email)',      free: false, premium: true  },
];

export default function PlanToggle() {
  const [plan, setPlan] = useState<'free' | 'premium'>('free');

  return (
    <div>
      {/* Toggle */}
      <div className="inline-flex bg-grass/30 dark:bg-[#374151] rounded-2xl p-1 mb-5">
        {(['free', 'premium'] as const).map(p => (
          <button key={p} onClick={() => setPlan(p)}
            className={clsx(
              'px-5 py-2 rounded-xl text-sm font-bold capitalize transition',
              plan === p
                ? p === 'premium'
                  ? 'bg-dusk text-white shadow-soft'
                  : 'bg-white dark:bg-[#1f2937] text-gray-900 dark:text-gray-100 shadow-soft'
                : 'text-gray-500 dark:text-gray-400'
            )}
          >
            {p === 'premium' && <Crown className="inline w-3.5 h-3.5 mr-1" />}
            {p}
          </button>
        ))}
      </div>

      {/* Feature list */}
      <ul className="space-y-2 max-w-lg">
        {FEATURES.map(f => {
          const enabled = plan === 'premium' ? f.premium : f.free;
          return (
            <li key={f.label} className={clsx(
              'flex items-center gap-3 px-4 py-2.5 rounded-xl transition',
              enabled
                ? 'bg-white/80 dark:bg-[#1f2937] border border-grass/20 dark:border-[#374151]'
                : 'opacity-40 line-through'
            )}>
              {enabled
                ? <Check className="w-4 h-4 text-dusk flex-shrink-0" />
                : <X className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              <span className="text-sm text-gray-700 dark:text-gray-300">{f.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
