// lib/waterStationsApi.ts
// Client for water station data. Tries the live backend first, falls back
// to a static list of real Romanian Danube stations so the UI works even
// when Flask + Supabase aren't running.

export interface WaterStation {
  id: string;
  name: string;
  station_type: 'treatment' | 'monitoring' | 'intake' | string;
  river_name: string;
  operator: string | null;
  capacity_m3_day: number | null;
  is_active: boolean;
  /** [lat, lng] tuple for Leaflet */
  coords: [number, number];
}

/** Backend returns location as a GeoJSON-like field that we normalise here. */
interface BackendStationRow {
  id: string;
  name: string;
  station_type: string;
  river_name: string;
  operator: string | null;
  capacity_m3_day: number | null;
  is_active: boolean;
  // Supabase PostGIS exports — could be GeoJSON or WKT depending on RPC config
  location?: unknown;
  longitude?: number;
  latitude?: number;
}

function extractCoords(row: BackendStationRow): [number, number] | null {
  if (typeof row.latitude === 'number' && typeof row.longitude === 'number') {
    return [row.latitude, row.longitude];
  }
  // Try GeoJSON Point: { type: 'Point', coordinates: [lng, lat] }
  const loc = row.location as { type?: string; coordinates?: [number, number] } | undefined;
  if (loc?.type === 'Point' && Array.isArray(loc.coordinates)) {
    return [loc.coordinates[1], loc.coordinates[0]];
  }
  // WKT string fallback: "POINT(lng lat)"
  if (typeof row.location === 'string') {
    const m = row.location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
    if (m) return [parseFloat(m[2]), parseFloat(m[1])];
  }
  return null;
}

export async function fetchWaterStations(): Promise<WaterStation[]> {
  try {
    const res = await fetch('/api/water-stations', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rows: BackendStationRow[] = data.stations ?? [];

    const stations = rows
      .map((row) => {
        const coords = extractCoords(row);
        if (!coords) return null;
        return {
          id: row.id,
          name: row.name,
          station_type: row.station_type,
          river_name: row.river_name,
          operator: row.operator,
          capacity_m3_day: row.capacity_m3_day,
          is_active: row.is_active,
          coords,
        } as WaterStation;
      })
      .filter((s): s is WaterStation => s !== null);

    if (stations.length === 0) throw new Error('Empty station list');
    return stations;
  } catch (err) {
    console.warn('[waterStations] Falling back to static list:', err);
    return STATIC_STATIONS;
  }
}

/** Find nearest stations to a point. Tries backend RPC, falls back to local sort. */
export async function fetchNearestStations(
  lat: number,
  lng: number,
  limit = 5,
): Promise<WaterStation[]> {
  try {
    const url = `/api/water-stations/nearest?lat=${lat}&lng=${lng}&radius_km=300&limit=${limit}`;
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rows: BackendStationRow[] = data.stations ?? [];
    if (rows.length === 0) throw new Error('Empty');

    return rows
      .map((row) => {
        const coords = extractCoords(row);
        if (!coords) return null;
        return {
          id: row.id, name: row.name, station_type: row.station_type,
          river_name: row.river_name, operator: row.operator,
          capacity_m3_day: row.capacity_m3_day, is_active: row.is_active, coords,
        } as WaterStation;
      })
      .filter((s): s is WaterStation => s !== null);
  } catch {
    // Local fallback: haversine sort on static list
    return [...STATIC_STATIONS]
      .map((s) => ({ ...s, _d: haversineKm([lat, lng], s.coords) }))
      .sort((a, b) => a._d - b._d)
      .slice(0, limit);
  }
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/* ─────────────────────────────────────────────────────────────────────
   Static fallback — same 20 stations as in seeds/002_seed_water_stations.sql
   so the UI always renders something even without Supabase.
   ───────────────────────────────────────────────────────────────────── */
export const STATIC_STATIONS: WaterStation[] = [
  { id: 'st-orsova',   name: 'Stația de Tratare Orșova',                station_type: 'treatment',  river_name: 'Dunărea', operator: 'Hidro Mehedinți',           capacity_m3_day: 35000, is_active: true, coords: [44.7231, 22.3956] },
  { id: 'st-drobeta',  name: 'Stația de Tratare Drobeta-Turnu Severin', station_type: 'treatment',  river_name: 'Dunărea', operator: 'Apă Canal Mehedinți',       capacity_m3_day: 80000, is_active: true, coords: [44.6317, 22.6567] },
  { id: 'st-calafat',  name: 'Stația de Monitorizare Calafat',          station_type: 'monitoring', river_name: 'Dunărea', operator: 'INHGA / ABADL',             capacity_m3_day: null,  is_active: true, coords: [43.9917, 22.9417] },
  { id: 'st-corabia',  name: 'Stația de Tratare Corabia',               station_type: 'treatment',  river_name: 'Dunărea', operator: 'Apă Canal Olt',             capacity_m3_day: 25000, is_active: true, coords: [43.7750, 24.5028] },
  { id: 'st-tmagurele',name: 'Stația de Tratare Turnu Măgurele',        station_type: 'treatment',  river_name: 'Dunărea', operator: 'Apă Canal Teleorman',       capacity_m3_day: 30000, is_active: true, coords: [43.7528, 24.8694] },
  { id: 'st-zimnicea', name: 'Stația de Monitorizare Zimnicea',         station_type: 'monitoring', river_name: 'Dunărea', operator: 'INHGA',                     capacity_m3_day: null,  is_active: true, coords: [43.6500, 25.3667] },
  { id: 'st-giurgiu',  name: 'Stația de Tratare Giurgiu',               station_type: 'treatment',  river_name: 'Dunărea', operator: 'Apă Canal Giurgiu',         capacity_m3_day: 55000, is_active: true, coords: [43.8936, 25.9697] },
  { id: 'st-oltenita', name: 'Stația de Monitorizare Oltenița',         station_type: 'monitoring', river_name: 'Dunărea', operator: 'INHGA',                     capacity_m3_day: null,  is_active: true, coords: [44.0861, 26.6361] },
  { id: 'st-calarasi', name: 'Stația de Tratare Călărași',              station_type: 'treatment',  river_name: 'Dunărea', operator: 'Apă Canal Călărași',        capacity_m3_day: 40000, is_active: true, coords: [44.2025, 27.3306] },
  { id: 'st-cernavoda',name: 'Stația de Monitorizare Cernavodă',        station_type: 'monitoring', river_name: 'Dunărea', operator: 'INHGA',                     capacity_m3_day: null,  is_active: true, coords: [44.3411, 28.0319] },
  { id: 'st-hirsova',  name: 'Stația de Tratare Hârșova',               station_type: 'treatment',  river_name: 'Dunărea', operator: 'Apă Canal Constanța',       capacity_m3_day: 18000, is_active: true, coords: [44.6892, 27.9494] },
  { id: 'st-braila',   name: 'Stația de Tratare Brăila',                station_type: 'treatment',  river_name: 'Dunărea', operator: 'Compania de Utilități Publice', capacity_m3_day: 70000, is_active: true, coords: [45.2692, 27.9578] },
  { id: 'st-galati',   name: 'Stația de Tratare Galați',                station_type: 'treatment',  river_name: 'Dunărea', operator: 'Apă Canal Galați',          capacity_m3_day: 90000, is_active: true, coords: [45.4353, 28.0080] },
  { id: 'st-tulcea',   name: 'Stația de Tratare Tulcea',                station_type: 'treatment',  river_name: 'Dunărea', operator: 'Aquaserv Tulcea',           capacity_m3_day: 35000, is_active: true, coords: [45.1853, 28.7950] },
  { id: 'st-isaccea',  name: 'Stația de Monitorizare Isaccea',          station_type: 'monitoring', river_name: 'Dunărea', operator: 'INHGA',                     capacity_m3_day: null,  is_active: true, coords: [45.2667, 28.4642] },
  { id: 'st-sulina',   name: 'Stația de Monitorizare Sulina',           station_type: 'monitoring', river_name: 'Dunărea', operator: 'INHGA / DDBRA',             capacity_m3_day: null,  is_active: true, coords: [45.1500, 29.6500] },
  { id: 'st-cetate',   name: 'Stația de Monitorizare Cetate',           station_type: 'monitoring', river_name: 'Dunărea', operator: 'INHGA',                     capacity_m3_day: null,  is_active: true, coords: [44.0500, 22.9000] },
  { id: 'st-bechet',   name: 'Stația de Tratare Bechet',                station_type: 'treatment',  river_name: 'Dunărea', operator: 'Apă Canal Dolj',            capacity_m3_day: 12000, is_active: true, coords: [43.7833, 23.9472] },
  { id: 'st-pscaraman',name: 'Punct de Captare Scarman',                station_type: 'intake',     river_name: 'Dunărea', operator: 'Apă Canal Constanța',       capacity_m3_day: 8000,  is_active: true, coords: [44.5611, 28.6750] },
  { id: 'st-fetesti',  name: 'Stația de Monitorizare Fetești',          station_type: 'monitoring', river_name: 'Dunărea', operator: 'INHGA',                     capacity_m3_day: null,  is_active: true, coords: [44.3850, 27.8333] },
];
