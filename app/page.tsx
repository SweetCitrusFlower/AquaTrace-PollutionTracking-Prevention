'use client';
// app/page.tsx
import Link from 'next/link';
import { ArrowRight, Satellite, Waves, Thermometer, Crown } from 'lucide-react';
import { NGOS, POLLUTION_POINTS } from '@/lib/mockData';
import NgoMiniMap from '@/components/NgoMiniMap';
import PlanToggle from '@/components/PlanToggle';
import { useT } from '@/lib/useT';

export default function HomePage() {
  const t = useT();

  return (
    <div className="px-4 md:px-10 py-6 max-w-6xl mx-auto space-y-12">
      {/* === HERO === */}
      <section className="bg-gradient-to-br from-dusk/15 via-grass/20 to-sand rounded-3xl p-6 md:p-12 shadow-soft relative overflow-hidden border border-grass/25 dark:border-[#374151] dark:from-dusk/10 dark:via-[#1f2937] dark:to-[#1a2433]">
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-dusk/8 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-water/10 blur-2xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 bg-dusk/10 border border-dusk/20 px-3 py-1 rounded-full text-xs font-semibold text-dusk tracking-wide mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-dusk animate-pulse" />
            {t('hero.badge')}
          </span>
          <h1 className="font-display text-3xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 leading-tight tracking-tight whitespace-pre-line">
            {t('hero.title')}
          </h1>
          <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-2xl text-sm md:text-base leading-relaxed">
            {t('hero.sub')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/map" className="btn-primary inline-flex items-center gap-2">
              {t('hero.cta.map')} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/camera" className="btn-ghost">{t('hero.cta.cam')}</Link>
          </div>
        </div>
      </section>

      {/* === COPERNICUS === */}
      <section>
        <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">{t('map.powered')}</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <SatelliteCard
            mission="Sentinel-1"
            role="SAR radar imaging"
            detail="Detects oil spills and surface anomalies through clouds, day and night."
            icon={<Satellite className="w-5 h-5" />}
          />
          <SatelliteCard
            mission="Sentinel-2"
            role="Optical multispectral"
            detail="Tracks color changes, sediment plumes, and chlorophyll proxies at 10m resolution."
            icon={<Waves className="w-5 h-5" />}
          />
          <SatelliteCard
            mission="Sentinel-3"
            role="Ocean & thermal"
            detail="OLCI chlorophyll + SLSTR sea-surface temperature for bloom and heat-anomaly detection."
            icon={<Thermometer className="w-5 h-5" />}
          />
        </div>
      </section>

      {/* === NGO PARTNERS === */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100">NGO Network</h2>
          <Link href="/map" className="text-sm font-semibold text-dusk hover:underline">
            View all on map →
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {NGOS.map(ngo => {
            const points = POLLUTION_POINTS.filter(p => ngo.pointIds.includes(p.id));
            return (
              <article key={ngo.id} className="card-eco flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-display font-bold text-gray-900 dark:text-gray-100">{ngo.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ngo.region}</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-lg bg-dusk/10 text-dusk">
                    {ngo.sensorCount} sensors
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{ngo.description}</p>
                <NgoMiniMap points={points} />
              </article>
            );
          })}
        </div>
      </section>

      {/* === BUSINESS MODEL TEASER === */}
      <section className="bg-sand-light dark:bg-[#1f2937] rounded-3xl p-6 md:p-10 shadow-soft border border-grass/20 dark:border-[#374151]">
        <div className="flex items-center gap-2 mb-2">
          <Crown className="w-5 h-5 text-dusk" />
          <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100">Free vs. Premium</h2>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-xl">
          Citizens get the essentials free, forever. Farmers, fish breeders, and water authorities
          unlock predictive heatmaps and 7+ day forecasts on Premium.
        </p>
        <PlanToggle />
      </section>
    </div>
  );
}

function SatelliteCard({ mission, role, detail, icon }:
  { mission: string; role: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white/60 dark:bg-[#1f2937] rounded-2xl p-5 border border-grass/25 dark:border-[#374151] hover:shadow-soft transition-shadow">
      <div className="w-10 h-10 rounded-lg bg-dusk/10 flex items-center justify-center text-dusk mb-4">
        {icon}
      </div>
      <h3 className="font-display font-bold text-gray-900 dark:text-gray-100 text-sm tracking-tight">{mission}</h3>
      <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2 mt-0.5">{role}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{detail}</p>
    </div>
  );
}
