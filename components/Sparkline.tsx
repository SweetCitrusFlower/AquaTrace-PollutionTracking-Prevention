'use client';
// components/Sparkline.tsx
// Minimal SVG sparkline for displaying small time-series data.
// Renders a smooth line with a subtle area fill.

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  showDots?: boolean;
}

export default function Sparkline({
  data,
  color = '#35858E',
  height = 40,
  width = 200,
  showDots = false,
}: SparklineProps) {
  if (data.length < 2) {
    return <div className="h-10 flex items-center justify-center text-[10px] text-gray-400">No data</div>;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  // Build SVG path data — smooth curve via simple polyline
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as [number, number];
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  // Area path — close down to bottom for fill
  const areaD = pathD + ` L${width},${height} L0,${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
         className="block">
      <defs>
        <linearGradient id={`sparkfill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sparkfill-${color.replace('#', '')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
      {showDots && points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.5" fill={color} />
      ))}
    </svg>
  );
}
