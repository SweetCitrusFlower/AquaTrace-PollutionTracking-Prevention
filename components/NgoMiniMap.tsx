import type { PollutionPoint } from '@/lib/mockData';

const SEVERITY_COLOR: Record<PollutionPoint['severity'], string> = {
  low: '#84C5B1', moderate: '#d8cf86', high: '#d97706', critical: '#b91c1c',
};

// Project lat/lng (Danube basin bbox) into a 280x100 viewBox.
const BBOX = { minLng: 22, maxLng: 30, minLat: 43.5, maxLat: 46 };
function project([lat, lng]: [number, number]) {
  const x = ((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * 280;
  const y = 100 - ((lat - BBOX.minLat) / (BBOX.maxLat - BBOX.minLat)) * 100;
  return { x, y };
}

export default function NgoMiniMap({ points }: { points: PollutionPoint[] }) {
  return (
    <div className="bg-water/20 rounded-2xl overflow-hidden border border-water/40">
      <svg viewBox="0 0 280 100" className="w-full h-24">
        {/* Stylised Danube ribbon */}
        <path
          d="M 0,70 Q 70,40 140,55 T 280,45"
          stroke="#84C5B1" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7"
        />
        {points.map(p => {
          const { x, y } = project(p.coords);
          return (
            <g key={p.id}>
              <circle cx={x} cy={y} r="6" fill={SEVERITY_COLOR[p.severity]} opacity="0.3" />
              <circle cx={x} cy={y} r="3" fill={SEVERITY_COLOR[p.severity]} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
