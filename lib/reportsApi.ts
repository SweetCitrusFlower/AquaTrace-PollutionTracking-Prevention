// lib/reportsApi.ts
// Submits citizen-science reports to the backend.

export interface ReportInput {
  user_id?: string;
  lat: number;
  lng: number;
  image_url?: string;
  smell_score?: number;     // 1-5
  water_flow?: 'stagnant' | 'slow' | 'fast' | string;
  human_activity?: string;
}

export interface ReportResult {
  ok: boolean;
  offline?: boolean;
  data?: unknown;
  error?: string;
}

export async function submitReport(input: ReportInput): Promise<ReportResult> {
  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();

    if (!res.ok) {
      // 502 from our proxy = backend down. We still want UX to feel "saved".
      return { ok: false, offline: data.offline === true, error: data.error };
    }
    return { ok: true, data: data.data };
  } catch (err) {
    return { ok: false, offline: true, error: err instanceof Error ? err.message : 'Network error' };
  }
}
