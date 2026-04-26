// app/api/eta/route.ts
// Server-side proxy to Flask /api/predict-eta endpoint.
// Forwards the user's pollution+station coords and returns the velocity/ETA result.
//
// Configure via FLASK_API_URL env var (defaults to http://localhost:5000).

import { NextRequest, NextResponse } from 'next/server';

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5000';

interface EtaInput {
  pollution_lat: number;
  pollution_lon: number;
  station_lat: number;
  station_lon: number;
  timestamp_detection?: string;
}

export async function POST(req: NextRequest) {
  let body: EtaInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Default detection timestamp = now
  const payload = {
    ...body,
    timestamp_detection: body.timestamp_detection ?? new Date().toISOString(),
  };

  // Validate
  for (const k of ['pollution_lat', 'pollution_lon', 'station_lat', 'station_lon'] as const) {
    if (typeof payload[k] !== 'number') {
      return NextResponse.json({ error: `Missing or invalid ${k}` }, { status: 400 });
    }
  }

  try {
    const upstream = await fetch(`${FLASK_API_URL}/api/predict-eta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      // 35s timeout — Overpass can be slow
      signal: AbortSignal.timeout(35000),
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/eta] Upstream failed:', err);
    return NextResponse.json(
      {
        error:
          'Could not reach ETA backend. Make sure the Flask server is running on ' +
          FLASK_API_URL +
          '. Run: cd backend && python app.py',
      },
      { status: 502 }
    );
  }
}
