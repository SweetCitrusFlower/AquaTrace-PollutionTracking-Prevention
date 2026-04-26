// app/api/analyze/route.ts
// Mock satellite zone-analysis endpoint.
// Real implementation: forward bbox to your Sencast / Copernicus pipeline and
// return a generated heatmap PNG (or GeoTIFF rendered to PNG).
//
// Input:  { minLat, minLng, maxLat, maxLng }
// Output: { imageUrl (data URL), metrics }

import { NextRequest, NextResponse } from 'next/server';

interface Bbox {
  minLat: number; minLng: number; maxLat: number; maxLng: number;
}

/** Build a stylised SVG chlorophyll heatmap for the given bbox.
 *  We embed it as a data URL — Leaflet renders it as imageOverlay.    */
function buildMockHeatmapSVG(): string {
  // Generate 8x6 grid of colored cells (sage → lime → amber → red)
  const cols = 12, rows = 8;
  const cells: string[] = [];

  // Use a deterministic-ish pseudo-random based on time so each draw differs slightly
  const seed = Date.now() % 1000;
  const rand = (i: number, j: number) =>
    ((Math.sin(seed + i * 13.7 + j * 7.3) + 1) / 2);

  // Bias the gradient — left side cleaner, right side dirtier (typical river plume)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const noise = rand(i, j);
      const positionalBias = (i / cols) * 0.7 + (j / rows) * 0.2;
      const intensity = Math.min(1, noise * 0.5 + positionalBias);

      let color: string;
      if      (intensity < 0.3) color = '#7DA78C';  // sage
      else if (intensity < 0.55) color = '#C2D099'; // lime
      else if (intensity < 0.75) color = '#f59e0b'; // amber
      else                       color = '#dc2626'; // red

      const x = (i / cols) * 100;
      const y = (j / rows) * 100;
      const w = 100 / cols;
      const h = 100 / rows;
      cells.push(`<rect x="${x}%" y="${y}%" width="${w}%" height="${h}%" fill="${color}" />`);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
    <defs>
      <filter id="b" x="0" y="0" width="100%" height="100%">
        <feGaussianBlur stdDeviation="1.8" />
      </filter>
    </defs>
    <g filter="url(#b)" opacity="0.85">
      ${cells.join('')}
    </g>
  </svg>`;

  // Encode as data URL (no base64 needed — SVG can be percent-encoded)
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export async function POST(req: NextRequest) {
  let bbox: Bbox;
  try {
    bbox = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { minLat, minLng, maxLat, maxLng } = bbox;
  if ([minLat, minLng, maxLat, maxLng].some(v => typeof v !== 'number')) {
    return NextResponse.json({ error: 'Bbox must have minLat/minLng/maxLat/maxLng numbers' }, { status: 400 });
  }
  if (minLat >= maxLat || minLng >= maxLng) {
    return NextResponse.json({ error: 'Invalid bbox: min must be less than max' }, { status: 400 });
  }

  // Simulate Copernicus processing latency (1-2.5s feels realistic)
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));

  // Mock metrics — derived from bbox size & latitude (vaguely plausible)
  const area = (maxLat - minLat) * (maxLng - minLng);
  const lat  = (minLat + maxLat) / 2;
  const baseChl = 8 + (45 - lat) * 1.5 + Math.random() * 15; // higher in lower latitudes (delta zone)
  const chl_avg = Math.max(2, baseChl * (0.7 + Math.random() * 0.4));
  const chl_max = chl_avg * (1.4 + Math.random() * 0.8);
  const nitrate = 1.5 + Math.random() * 8 + (area > 0.5 ? 3 : 0);

  return NextResponse.json({
    imageUrl: buildMockHeatmapSVG(),
    metrics: {
      chlorophyll_avg: chl_avg,
      chlorophyll_max: chl_max,
      nitrate_avg:     nitrate,
      confidence:      0.72 + Math.random() * 0.25,
    },
    bbox,
    source: 'Sentinel-3 OLCI · Sencast pipeline (mock)',
    generatedAt: new Date().toISOString(),
  });
}
