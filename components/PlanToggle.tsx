'use client';
import { useState } from 'react';
import { Check, X, Crown, Building2, Sprout } from 'lucide-react';
import clsx from 'clsx';

type Tier = 'free' | 'premium' | 'enterprise';

interface FeatureRow {
  label: string;
  free: boolean;
  premium: boolean;
  enterprise: boolean;
}

const FEATURES: FeatureRow[] = [
  // Map & data access
  { label: 'Interactive base map',                              free: true,  premium: true,  enterprise: true },
  { label: 'Real-time data feed (live sensors)',                free: false, premium: true,  enterprise: true },
  { label: '24-hour delayed data',                              free: true,  premium: false, enterprise: false },

  // Alerts
  { label: 'In-app standard alerts',                            free: true,  premium: true,  enterprise: true },
  { label: 'Personalized threshold alerts',                     free: false, premium: true,  enterprise: true },
  { label: 'Push, SMS & Email notifications',                   free: false, premium: true,  enterprise: true },

  // History
  { label: 'Water quality history (7 days)',                    free: true,  premium: false, enterprise: false },
  { label: 'Extended history (12 months)',                      free: false, premium: true,  enterprise: true },
  { label: 'CSV / PDF export',                                  free: false, premium: true,  enterprise: true },

  // Enterprise-only
  { label: 'API access / Bring Your Own Key',                   free: false, premium: false, enterprise: true },
  { label: 'Private IoT sensor integration',                    free: false, premium: false, enterprise: true },
  { label: 'Multi-user team accounts',                          free: false, premium: false, enterprise: true },
  { label: 'AI predictive analytics modules',                   free: false, premium: false, enterprise: true },
];

const TIER_META: Record<Tier, {
  label: string;
  audience: string;
  price: string;
  icon: typeof Sprout;
  iconBg: string;
  iconColor: string;
}> = {
  free: {
    label:    'Free',
    audience: 'Citizens & enthusiasts',
    price:    '€0',
    icon:     Sprout,
    iconBg:   'bg-grass/20',
    iconColor: 'text-dusk',
  },
  premium: {
    label:    'Premium',
    audience: 'Small farms · NGOs · Researchers',
    price:    '€9.99/mo',
    icon:     Crown,
    iconBg:   'bg-dusk',
    iconColor: 'text-white',
  },
  enterprise: {
    label:    'Enterprise',
    audience: 'Corporations · Governments · Institutions',
    price:    'Custom',
    icon:     Building2,
    iconBg:   'bg-gray-900 dark:bg-gray-100',
    iconColor: 'text-white dark:text-gray-900',
  },
};

export default function PlanToggle() {
  const [plan, setPlan] = useState<Tier>('premium');
  const meta = TIER_META[plan];
  const Icon = meta.icon;

  return (
    <div>
      {/* Tier picker — 3 mini-cards */}
      <div className="grid grid-cols-3 gap-2 mb-6 max-w-2xl">
        {(['free', 'premium', 'enterprise'] as Tier[]).map(t => {
          const m = TIER_META[t];
          const TierIcon = m.icon;
          const active = plan === t;
          return (
            <button key={t} onClick={() => setPlan(t)}
              className={clsx(
                'rounded-2xl px-3 py-3 transition border-2 text-left',
                active
                  ? 'bg-white dark:bg-[#1f2937] border-dusk shadow-soft'
                  : 'bg-grass/10 dark:bg-[#374151] border-transparent hover:border-grass/40 dark:hover:border-[#4b5563]'
              )}>
              <div className={clsx(
                'w-7 h-7 rounded-lg flex items-center justify-center mb-2',
                m.iconBg
              )}>
                <TierIcon className={clsx('w-3.5 h-3.5', m.iconColor)} />
              </div>
              <p className="font-display font-bold text-sm text-gray-900 dark:text-gray-100">{m.label}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{m.price}</p>
            </button>
          );
        })}
      </div>

      {/* Selected tier header */}
      <div className="mb-4 max-w-2xl">
        <div className="flex items-center gap-2 mb-1">
          <div className={clsx('w-6 h-6 rounded-lg flex items-center justify-center', meta.iconBg)}>
            <Icon className={clsx('w-3.5 h-3.5', meta.iconColor)} />
          </div>
          <span className="font-display font-bold text-gray-900 dark:text-gray-100 text-base">
            {meta.label}
          </span>
          <span className="text-xs text-gray-400 ml-auto">{meta.audience}</span>
        </div>
      </div>

      {/* Feature list */}
      <ul className="space-y-1.5 max-w-2xl">
        {FEATURES.map(f => {
          const enabled =
            plan === 'enterprise' ? f.enterprise :
            plan === 'premium'    ? f.premium    :
                                    f.free;
          return (
            <li key={f.label} className={clsx(
              'flex items-center gap-3 px-4 py-2 rounded-xl transition text-sm',
              enabled
                ? 'bg-white/80 dark:bg-[#1f2937] border border-grass/20 dark:border-[#374151]'
                : 'opacity-40 line-through'
            )}>
              {enabled
                ? <Check className="w-4 h-4 text-dusk flex-shrink-0" />
                : <X className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              <span className="text-gray-700 dark:text-gray-300">{f.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
