// lib/sensorHistoryApi.ts
// Fetches recent sensor readings for a station. Falls back to deterministic
// mock data so UI works even when Flask + Supabase aren't running.

export interface SensorReading {
  ts: string;          // ISO timestamp
  chlorophyll: number; // mg/m³
  nitrate: number;     // mg/L
  turbidity: number;   // NTU
}

export type WaterQuality = 'good' | 'fair' | 'poor' | 'critical';

export interface SensorSummary {
  readings: SensorReading[];
  /** Latest snapshot — used for badge + headline metrics */
  latest: SensorReading;
  /** Computed quality based on WFD-ish thresholds */
  quality: WaterQuality;
  isMock: boolean;
}

/** Fetch last N days of readings for a station id. */
export async function fetchSensorHistory(stationId: string, days = 7): Promise<SensorSummary> {
  // 1. Try the real backend first
  try {
    const res = await fetch(
      `/api/sensor-data/history?station_id=${encodeURIComponent(stationId)}&days=${days}`,
      { cache: 'no-store', signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.readings) && data.readings.length > 0) {
        const readings: SensorReading[] = data.readings.map((r: Record<string, unknown>) => ({
          ts:          String(r.ts ?? r.recorded_at ?? r.timestamp ?? ''),
          chlorophyll: Number(r.chlorophyll ?? r.chlorophyll_mg_m3 ?? 0),
          nitrate:     Number(r.nitrate     ?? r.nitrate_mg_l     ?? 0),
          turbidity:   Number(r.turbidity   ?? r.turbidity_ntu    ?? 0),
        }));
        const latest = readings[readings.length - 1];
        return {
          readings,
          latest,
          quality: classifyQuality(latest),
          isMock: false,
        };
      }
    }
  } catch {
    // fall through to mock
  }

  // 2. Deterministic mock — same station id always produces same series
  return generateMockHistory(stationId, days);
}

/** WFD-ish thresholds for the Danube. Picks the worst category among parameters. */
export function classifyQuality(r: SensorReading): WaterQuality {
  // Chlorophyll-a thresholds (eutrophication)
  const chlClass: WaterQuality = r.chlorophyll < 10 ? 'good'
                                : r.chlorophyll < 25 ? 'fair'
                                : r.chlorophyll < 50 ? 'poor'
                                :                      'critical';
  // Nitrate thresholds (mg/L NO3-N)
  const nitClass: WaterQuality = r.nitrate < 5  ? 'good'
                                : r.nitrate < 11 ? 'fair'
                                : r.nitrate < 25 ? 'poor'
                                :                  'critical';
  // Turbidity thresholds (NTU)
  const turClass: WaterQuality = r.turbidity < 10 ? 'good'
                                : r.turbidity < 25 ? 'fair'
                                : r.turbidity < 50 ? 'poor'
                                :                    'critical';
  // Worst wins
  const order: Record<WaterQuality, number> = { good: 0, fair: 1, poor: 2, critical: 3 };
  return [chlClass, nitClass, turClass].sort((a, b) => order[b] - order[a])[0];
}

/** Generate deterministic mock series — varies by station so different
 *  stations have different "personalities" but stay stable across renders. */
function generateMockHistory(stationId: string, days: number): SensorSummary {
  const seed = hashStr(stationId);
  const rand = (i: number) => ((Math.sin(seed + i * 17.3) + 1) / 2);

  // Base values: latitude-ish bias is gone here because we don't have lat,
  // but we vary per-station so stations show diverse stories.
  const chlBase = 8  + (seed % 30);          // 8..37
  const nitBase = 3  + (seed % 9);           // 3..11
  const turBase = 5  + (seed % 25);          // 5..29

  const readings: SensorReading[] = [];
  const now = Date.now();
  const stepMs = (days * 24 * 60 * 60 * 1000) / Math.max(1, days * 4); // ~4 samples/day

  for (let i = days * 4; i >= 0; i--) {
    // mild trend + noise
    const trend = Math.sin((i / (days * 4)) * Math.PI * 2) * 0.25;
    const noise = (rand(i) - 0.5) * 0.4;
    const factor = 1 + trend + noise;
    readings.push({
      ts: new Date(now - i * stepMs).toISOString(),
      chlorophyll: Math.max(1, chlBase * factor),
      nitrate:     Math.max(0.5, nitBase * factor),
      turbidity:   Math.max(2, turBase * factor),
    });
  }

  const latest = readings[readings.length - 1];
  return {
    readings,
    latest,
    quality: classifyQuality(latest),
    isMock: true,
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
