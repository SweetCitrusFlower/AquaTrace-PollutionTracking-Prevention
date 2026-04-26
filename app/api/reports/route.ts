// app/api/reports/route.ts
// Proxy to Flask /api/reports — saves citizen-science photo reports to Supabase.

import { NextRequest, NextResponse } from 'next/server';

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5000';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${FLASK_API_URL}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/reports] Upstream failed:', err);
    // Graceful failure: tell client we couldn't persist but UI can keep going
    return NextResponse.json(
      {
        error: 'Backend unavailable — report saved locally only.',
        offline: true,
      },
      { status: 502 }
    );
  }
}
