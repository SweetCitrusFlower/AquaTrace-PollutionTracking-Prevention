// lib/anomaliesApi.ts
// Lists recent water-quality anomalies. Uses backend if available, mock otherwise.

export type AnomalySeverity = 'low' | 'moderate' | 'high' | 'critical';

export interface Anomaly {
  id: string;
  detected_at: string;          // ISO
  station_name: string;
  river_name: string;
  parameter: string;            // e.g. "Chlorophyll-a", "Nitrate", "Turbidity"
  measured_value: number;
  threshold: number;
  unit: string;
  severity: AnomalySeverity;
  coords: [number, number];     // [lat, lng]
  status: 'open' | 'acknowledged' | 'resolved';
  description?: string;
}

export interface AnomaliesResponse {
  anomalies: Anomaly[];
  isMock: boolean;
}

export async function fetchAnomalies(limit = 25): Promise<AnomaliesResponse> {
  try {
    const res = await fetch(`/api/anomalies?limit=${limit}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.anomalies) && data.anomalies.length > 0) {
        return { anomalies: data.anomalies, isMock: false };
      }
    }
  } catch {
    // fall through
  }
  return { anomalies: MOCK_ANOMALIES, isMock: true };
}

/** Realistic mock data — typical anomaly events along the Romanian Danube. */
const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

const MOCK_ANOMALIES: Anomaly[] = [
  {
    id: 'an-001',
    detected_at: hoursAgo(0.5),
    station_name: 'Stația de Tratare Giurgiu',
    river_name: 'Dunărea',
    parameter: 'Chlorophyll-a',
    measured_value: 58.4,
    threshold: 50,
    unit: 'mg/m³',
    severity: 'critical',
    coords: [43.8936, 25.9697],
    status: 'open',
    description: 'Sentinel-2 detected anomalous chlorophyll bloom — possible eutrophication event.',
  },
  {
    id: 'an-002',
    detected_at: hoursAgo(2),
    station_name: 'Stația de Tratare Brăila',
    river_name: 'Dunărea',
    parameter: 'Turbidity',
    measured_value: 42.1,
    threshold: 25,
    unit: 'NTU',
    severity: 'high',
    coords: [45.2692, 27.9578],
    status: 'open',
    description: 'Turbidity spike following upstream rainfall event in Carpathian foothills.',
  },
  {
    id: 'an-003',
    detected_at: hoursAgo(4),
    station_name: 'Stația de Monitorizare Calafat',
    river_name: 'Dunărea',
    parameter: 'Nitrate',
    measured_value: 14.2,
    threshold: 11,
    unit: 'mg/L',
    severity: 'high',
    coords: [43.9917, 22.9417],
    status: 'acknowledged',
    description: 'Elevated nitrate readings — likely agricultural runoff from Bulgarian side.',
  },
  {
    id: 'an-004',
    detected_at: hoursAgo(6),
    station_name: 'Stația de Tratare Drobeta-Turnu Severin',
    river_name: 'Dunărea',
    parameter: 'Heat anomaly',
    measured_value: 1.4,
    threshold: 1.0,
    unit: '°C',
    severity: 'moderate',
    coords: [44.6317, 22.6567],
    status: 'open',
    description: 'Surface temperature 1.4°C above 7-day baseline (Sentinel-3 SLSTR).',
  },
  {
    id: 'an-005',
    detected_at: hoursAgo(9),
    station_name: 'Stația de Monitorizare Cernavodă',
    river_name: 'Dunărea',
    parameter: 'Citizen report cluster',
    measured_value: 7,
    threshold: 3,
    unit: 'reports/day',
    severity: 'moderate',
    coords: [44.3411, 28.0319],
    status: 'open',
    description: '7 citizen reports of "fishy" smell within 5 km radius — investigating.',
  },
  {
    id: 'an-006',
    detected_at: hoursAgo(14),
    station_name: 'Stația de Tratare Tulcea',
    river_name: 'Dunărea',
    parameter: 'Chlorophyll-a',
    measured_value: 28.7,
    threshold: 25,
    unit: 'mg/m³',
    severity: 'moderate',
    coords: [45.1853, 28.7950],
    status: 'open',
  },
  {
    id: 'an-007',
    detected_at: hoursAgo(20),
    station_name: 'Stația de Monitorizare Zimnicea',
    river_name: 'Dunărea',
    parameter: 'Turbidity',
    measured_value: 18.3,
    threshold: 25,
    unit: 'NTU',
    severity: 'low',
    coords: [43.6500, 25.3667],
    status: 'resolved',
    description: 'Turbidity returned to baseline after 6h.',
  },
  {
    id: 'an-008',
    detected_at: hoursAgo(28),
    station_name: 'Stația de Tratare Galați',
    river_name: 'Dunărea',
    parameter: 'Discharge spike',
    measured_value: 8200,
    threshold: 7500,
    unit: 'm³/s',
    severity: 'low',
    coords: [45.4353, 28.0080],
    status: 'resolved',
  },
];
