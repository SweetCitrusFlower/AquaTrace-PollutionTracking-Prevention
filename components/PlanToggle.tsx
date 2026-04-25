'use client';
import { useState } from 'react';
import { Check, X, Crown } from 'lucide-react';
import clsx from 'clsx';

const FEATURES = [
  { label: 'Live Copernicus satellite data',     free: true,  premium: true  },
  { label: 'NGO sensor network access',          free: true,  premium: true  },
  { label: '1-2 day pollution prediction',       free: true,  premium: true  },
  { label: '7+ day predictive forecasts',        free: false, premium: true  },
  { label: 'Advanced heatmaps (chlorophyll/temp)', free: false, premium: true },
  { label: 'API access for fish-farms & agri',   free: false, premium: true  },
  { label: 'Custom zone alerts (SMS/email)',     free: false, premium: true  },
];

export default function PlanToggle() {
  const [plan, setPlan] = useState<'free' | 'premium'>('free');

  return (
    <div>
      <div className="inline-flex bg-grass/40 rounded-2xl p-1 mb-5">
        {(['free', 'premium'] as const).map(p => (
          <button key={p} onClick={() => setPlan(p)}
            className={clsx(
              'px-5 py-2 rounded-xl text-sm font-bold capitalize transition',
              plan === p
                ? p === 'premium' ? 'bg-dusk text-sand-light shadow-soft' : 'bg-white text-dusk-dark shadow-soft'
                : 'text-dusk/70'
            )}
          >
            {p === 'premium' && <Crown className="inline w-3.5 h-3.5 mr-1" />}
            {p}
          </button>
        ))}
      </div>

      <ul className="space-y-2 max-w-lg">
        {FEATURES.map(f => {
          const enabled = plan === 'premium' ? f.premium : f.free;
          return (
            <li key={f.label} className={clsx(
              'flex items-center gap-3 px-4 py-2 rounded-xl transition',
              enabled ? 'bg-white/70' : 'opacity-40 line-through'
            )}>
              {enabled ? <Check className="w-4 h-4 text-water-dark" /> : <X className="w-4 h-4 text-dusk/50" />}
              <span className="text-sm text-dusk-dark">{f.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
