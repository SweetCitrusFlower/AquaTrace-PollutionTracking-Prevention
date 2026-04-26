// app/api/water-stations/nearest/route.ts
// Proxy to Flask /api/water-stations/nearest.

import { NextRequest, NextResponse } from 'next/server';

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5000';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.search;
  try {
    const upstream = await fetch(`${FLASK_API_URL}/api/water-stations/nearest${search}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/water-stations/nearest] Upstream failed:', err);
    return NextResponse.json(
      { error: 'Backend unavailable.', stations: [] },
      { status: 502 }
    );
  }
}
