'use client';
import dynamic from 'next/dynamic';
import { useT } from '@/lib/useT';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-[calc(100vh-12rem)] flex items-center justify-center bg-dusk/5 rounded-3xl mx-4">
      <p className="text-gray-500 animate-pulse text-sm">Loading satellite layer…</p>
    </div>
  ),
});

export default function MapPage() {
  const t = useT();
  return (
    <div className="px-0 md:px-6 py-0 md:py-4 pb-4">
      <div className="px-4 md:px-0 mb-3">
        <h1 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100">{t('map.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('map.sub')}</p>
      </div>
      <div className="h-[calc(100dvh-16rem)] md:h-[calc(100vh-12rem)]">
        <MapView />
      </div>
    </div>
  );
}
