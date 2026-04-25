import dynamic from 'next/dynamic';

// SSR off — Leaflet needs `window`.
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-[calc(100vh-12rem)] flex items-center justify-center bg-water/20 rounded-3xl mx-4">
      <p className="text-dusk-dark animate-pulse">Loading satellite layer…</p>
    </div>
  ),
});

export default function MapPage() {
  return (
    <div className="px-0 md:px-6 py-0 md:py-4">
      <div className="px-4 md:px-0 mb-3">
        <h1 className="font-display text-2xl font-bold text-dusk-dark">Live Pollution Map</h1>
        <p className="text-sm text-dusk/70">Tap a marker to inspect pollution metrics &amp; data source.</p>
      </div>
      <MapView />
    </div>
  );
}
