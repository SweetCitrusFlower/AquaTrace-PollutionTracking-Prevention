// app/page.tsx
import Link from 'next/link';
import { ArrowRight, Satellite, Waves, Thermometer, Sparkles, Crown } from 'lucide-react';
import { NGOS, POLLUTION_POINTS } from '@/lib/mockData';
import NgoMiniMap from '@/components/NgoMiniMap';
import PlanToggle from '@/components/PlanToggle';

export default function HomePage() {
  return (
    <div className="px-4 md:px-10 py-6 max-w-6xl mx-auto space-y-12">
      {/* === HERO === */}
      <section className="bg-gradient-to-br from-water/40 via-grass/30 to-sand rounded-4xl p-6 md:p-12 shadow-soft relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-dusk/10 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 bg-white/60 px-3 py-1 rounded-full text-xs font-semibold text-dusk-dark mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Live Beta · Hackathon Edition
          </span>
          <h1 className="font-display text-3xl md:text-5xl font-bold text-dusk-dark leading-tight">
            Protecting the Danube,<br />one pixel & one citizen at a time.
          </h1>
          <p className="mt-4 text-dusk/80 max-w-2xl">
            DanubeGuard OS fuses real-time Copernicus satellite data with on-the-ground reports from
            citizens and NGOs to detect, predict, and prevent water pollution along Europe&apos;s second-longest river.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/map" className="btn-primary inline-flex items-center gap-2">
              Explore the Map <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/camera" className="btn-ghost">Report a sighting</Link>
          </div>
        </div>
      </section>

      {/* === COPERNICUS === */}
      <section>
        <h2 className="font-display text-2xl font-bold text-dusk-dark mb-4">Powered by Copernicus</h2>
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
          <h2 className="font-display text-2xl font-bold text-dusk-dark">NGO Network</h2>
          <Link href="/map" className="text-sm font-semibold text-water-dark hover:underline">
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
                    <h3 className="font-display font-bold text-dusk-dark">{ngo.name}</h3>
                    <p className="text-xs text-dusk/70">{ngo.region}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg bg-${ngo.accent}/30 text-dusk-dark`}>
                    {ngo.sensorCount} sensors
                  </span>
                </div>
                <p className="text-sm text-dusk-dark/80 mb-4">{ngo.description}</p>

                {/* Inline mini-map preview — pure SVG, no Leaflet, super fast. */}
                <NgoMiniMap points={points} />
              </article>
            );
          })}
        </div>
      </section>

      {/* === BUSINESS MODEL TEASER === */}
      <section className="bg-sand-light rounded-4xl p-6 md:p-10 shadow-soft">
        <div className="flex items-center gap-2 mb-2">
          <Crown className="w-5 h-5 text-dusk" />
          <h2 className="font-display text-2xl font-bold text-dusk-dark">Free vs. Premium</h2>
        </div>
        <p className="text-dusk/70 text-sm mb-6 max-w-xl">
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
    <div className="bg-white/60 rounded-3xl p-5 border border-grass/50 hover:shadow-soft transition">
      <div className="w-10 h-10 rounded-xl bg-water/40 flex items-center justify-center text-dusk-dark mb-3">
        {icon}
      </div>
      <h3 className="font-display font-bold text-dusk-dark">{mission}</h3>
      <p className="text-xs uppercase tracking-wider text-water-dark font-semibold mb-2">{role}</p>
      <p className="text-sm text-dusk/80">{detail}</p>
    </div>
  );
}
