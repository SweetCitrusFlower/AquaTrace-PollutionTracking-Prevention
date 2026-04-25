'use client';

import { ChevronDown, MapPin } from 'lucide-react';
import { DANUBE_REGIONS, type DanubeRegion } from '@/lib/mockData';

interface RegionSelectorProps {
  selectedRegion: DanubeRegion | null;
  onSelect: (region: DanubeRegion) => void;
  isLoading?: boolean;
}

export default function RegionSelector({ selectedRegion, onSelect, isLoading }: RegionSelectorProps) {
  return (
    <div className="absolute top-4 left-4 z-[500] w-64">
      <div className="relative">
        <select
          value={selectedRegion?.id || ''}
          onChange={(e) => {
            const region = DANUBE_REGIONS.find((r) => r.id === e.target.value);
            if (region) onSelect(region);
          }}
          disabled={isLoading}
          className="w-full appearance-none bg-white/95 backdrop-blur-sm rounded-xl px-4 py-3 pl-10 pr-10 
                     border-2 border-dusk/20 shadow-soft text-dusk-dark font-medium
                     focus:outline-none focus:border-dusk focus:ring-2 focus:ring-dusk/20
                     disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          <option value="">Select Danube region...</option>
          {DANUBE_REGIONS.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dusk/50" />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dusk/50 pointer-events-none" />
      </div>
    </div>
  );
}

export { DANUBE_REGIONS };
export type { DanubeRegion };