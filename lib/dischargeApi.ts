// lib/dischargeApi.ts
// Fetches live river discharge (m³/s) from Open-Meteo's flood forecast API.
// Used to show real-time hydrological data on water station popups.

export interface DischargeData {
  current_m3s: number;
  trend: 'rising' | 'stable' | 'falling';
  isMock: boolean;
}

/** Open-Meteo flood API — free, no API key, very reliable. */
const FLOOD_URL = 'https://flood-api.open-meteo.com/v1/flood';

export async function fetchDischarge(
  lat: number,
  lng: number,
): Promise<DischargeData> {
  try {
    const url = `${FLOOD_URL}?latitude=${lat}&longitude=${lng}&daily=river_discharge&forecast_days=2&past_days=1`;
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const series: number[] = data?.daily?.river_discharge ?? [];

    // Filter out null/undefined readings and use the most recent valid value
    const valid = series.filter((v): v is number => typeof v === 'number' && !isNaN(v));
    if (valid.length < 2) throw new Error('insufficient series');

    const current = valid[valid.length - 2] ?? valid[valid.length - 1];
    const previous = valid[0];
    const delta = current - previous;
    const trend: DischargeData['trend'] =
      Math.abs(delta) / Math.max(1, current) < 0.05 ? 'stable' :
      delta > 0 ? 'rising' : 'falling';

    return { current_m3s: current, trend, isMock: false };
  } catch {
    // Mock fallback — Danube average ~6500 m³/s with seasonal variation
    return {
      current_m3s: 5500 + Math.random() * 2500,
      trend: 'stable',
      isMock: true,
    };
  }
}
