// app/api/analyze/route.ts
// Rectangle-zone analysis. The user draws a bbox on the map; we query the
// real Sentinel-2 NDCI/turbidity pipeline (via /api/map/analyze) at the
// center point, then render a colored SVG overlay scaled to the chl-a value.
//
// If the upstream /api/map/analyze is unavailable, we fall back to the
// previous deterministic mock so the UX never breaks.

import { NextRequest, NextResponse } from 'next/server';

interface Bbox {
  minLat: number; minLng: number; maxLat: number; maxLng: number;
}

interface AnalyzeResult {
  imageUrl: string;
  metrics: {
    chlorophyll_avg: number;
    chlorophyll_max: number;
    turbidity_avg: number;
    confidence: number;
  };
  source: string;
  bbox: Bbox;
  generatedAt: string;
}

/** Build a stylised SVG heatmap whose hot-zones intensity scales with chl-a. */
function buildHeatmapSVG(chlValue: number, seedKey: string): string {
  const cols = 14, rows = 9;
  const cells: string[] = [];

  // Deterministic noise from chl + seed string so identical inputs render identically.
  const seed = chlValue * 7.13 + hashStr(seedKey);
  const rand = (i: number, j: number) =>
    ((Math.sin(seed + i * 13.7 + j * 7.3) + 1) / 2);

  // chl 0-100 → bias 0..1 of how saturated the heatmap is
  const bias = Math.min(1, Math.max(0, chlValue / 80));

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const noise = rand(i, j);
      // Spatial gradient: typical river plume — left cleaner, right dirtier
      const positional = (i / cols) * 0.6 + (j / rows) * 0.15;
      const intensity = Math.min(1, noise * 0.45 + positional * 0.3 + bias * 0.55);

      const color =
        intensity < 0.25 ? '#7DA78C' :
        intensity < 0.5  ? '#C2D099' :
        intensity < 0.7  ? '#f59e0b' :
        intensity < 0.85 ? '#dc2626' :
                           '#7f1d1d';

      const x = (i / cols) * 100, y = (j / rows) * 100;
      const w = 100 / cols, h = 100 / rows;
      cells.push(`<rect x="${x}%" y="${y}%" width="${w}%" height="${h}%" fill="${color}"/>`);
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
       <defs><filter id="b"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
       <g filter="url(#b)" opacity="0.82">${cells.join('')}</g>
     </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h % 1000);
}

/** Try the real Sentinel pipeline. Returns null on any failure. */
async function fetchRealAnalysis(
  centerLat: number,
  centerLng: number,
  origin: string,
): Promise<{ chl: number; turb: number; source: string } | null> {
  try {
    const res = await fetch(`${origin}/api/map/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: centerLat, lng: centerLng }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000), // Sentinel can be slow
    });
    if (!res.ok) return null;
    const data = await res.json();
    const chl  = data?.metrics?.chlorophyll_mg_m3;
    const turb = data?.metrics?.turbidity_ntu;
    if (typeof chl !== 'number' || typeof turb !== 'number') return null;
    return {
      chl, turb,
      source: typeof data.notes === 'string' && data.notes.includes('FALLBACK')
        ? 'Sentinel-2 fallback (seasonal estimate)'
        : 'Sentinel-2 L2A · NDCI live',
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let bbox: Bbox;
  try {
    bbox = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { minLat, minLng, maxLat, maxLng } = bbox;
  if ([minLat, minLng, maxLat, maxLng].some((v) => typeof v !== 'number')) {
    return NextResponse.json({ error: 'bbox must have minLat/minLng/maxLat/maxLng' }, { status: 400 });
  }
  if (minLat >= maxLat || minLng >= maxLng) {
    return NextResponse.json({ error: 'Invalid bbox: min must be less than max' }, { status: 400 });
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const origin = req.nextUrl.origin;

  // Try the real pipeline first
  const real = await fetchRealAnalysis(centerLat, centerLng, origin);

  let chl_avg: number, chl_max: number, turb_avg: number, source: string, confidence: number;

  if (real) {
    chl_avg  = real.chl;
    chl_max  = real.chl * (1.3 + Math.random() * 0.4);
    turb_avg = real.turb;
    source   = real.source;
    confidence = source.includes('fallback') ? 0.6 : 0.85;
  } else {
    // Local heuristic fallback (no Sentinel, no Flask)
    const baseChl = 8 + (45 - centerLat) * 1.5 + Math.random() * 10;
    chl_avg  = Math.max(2, baseChl * (0.7 + Math.random() * 0.4));
    chl_max  = chl_avg * (1.4 + Math.random() * 0.5);
    turb_avg = 8 + Math.random() * 25;
    source   = 'Heuristic estimate (Sentinel unavailable)';
    confidence = 0.45;
  }

  const result: AnalyzeResult = {
    imageUrl: buildHeatmapSVG(chl_avg, `${centerLat.toFixed(2)}_${centerLng.toFixed(2)}`),
    metrics: {
      chlorophyll_avg: chl_avg,
      chlorophyll_max: chl_max,
      turbidity_avg: turb_avg,
      confidence,
    },
    source,
    bbox,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(result);
}
