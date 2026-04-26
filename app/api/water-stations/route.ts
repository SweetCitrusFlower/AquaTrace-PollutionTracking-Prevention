// app/api/water-stations/route.ts
// Proxy to Flask /api/water-stations.

import { NextRequest, NextResponse } from 'next/server';

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5000';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.search; // pass through query string
  try {
    const upstream = await fetch(`${FLASK_API_URL}/api/water-stations${search}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/water-stations] Upstream failed:', err);
    return NextResponse.json(
      { error: 'Backend unavailable. Frontend will use static fallback list.', stations: [] },
      { status: 502 }
    );
  }
}
