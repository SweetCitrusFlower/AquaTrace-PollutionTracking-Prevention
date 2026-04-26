// app/api/data/sources/route.ts
// Proxy to Flask /api/data/sources — lists external data sources & their status.

import { NextResponse } from 'next/server';

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5000';

export async function GET() {
  try {
    const upstream = await fetch(`${FLASK_API_URL}/api/data/sources`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/data/sources] Upstream failed:', err);
    // Static fallback — same shape as Flask response so UI never breaks
    return NextResponse.json({
      sources: [
        { id: 'eea_waterbase', name: 'EEA Waterbase / WISE', status: 'unknown', type: 'csv', updated: null },
        { id: 'emodnet',       name: 'EMODnet Physics',       status: 'unknown', type: 'wfs', updated: null },
        { id: 'copernicus',    name: 'Copernicus Sentinel-2', status: 'unknown', type: 'satellite', updated: null },
        { id: 'open-meteo',    name: 'Open-Meteo Flood API',  status: 'unknown', type: 'api', updated: null },
        { id: 'overpass',      name: 'OpenStreetMap (Overpass)', status: 'unknown', type: 'api', updated: null },
      ],
      offline: true,
    });
  }
}
