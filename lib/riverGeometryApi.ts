// lib/riverGeometryApi.ts
// Fetches the river polyline between two points from OpenStreetMap (Overpass API).
// Used to draw curved plume trajectories on the map instead of straight lines.

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

export interface RiverGeometryResult {
  /** Ordered [lat, lng] points along the river between the two endpoints */
  coords: [number, number][];
  /** True when the geometry is a straight-line fallback (Overpass failed) */
  isFallback: boolean;
}

/** Fetch a curved polyline approximating the river path between two points.
 *  Falls back to a 2-point straight line if Overpass is unavailable. */
export async function fetchRiverGeometry(
  start: [number, number],
  end:   [number, number],
  riverName = 'Dunărea',
): Promise<RiverGeometryResult> {
  const fallback: RiverGeometryResult = {
    coords: [start, end],
    isFallback: true,
  };

  // Compute bbox covering both endpoints with a small padding so we capture
  // the river even when it meanders outside the direct corridor.
  const padding = 0.1; // ~11 km — Danube can meander significantly
  const minLat = Math.min(start[0], end[0]) - padding;
  const maxLat = Math.max(start[0], end[0]) + padding;
  const minLng = Math.min(start[1], end[1]) - padding;
  const maxLng = Math.max(start[1], end[1]) + padding;

  // Overpass query — fetch waterway=river segments for the named river
  // along with their alternative names. We try Romanian, English, and
  // German variants since OSM names vary across the Danube basin.
  const altNames = ['Дунав', 'Дунав', 'Donau', 'Duna', 'Danube', riverName];
  const nameRegex = `^(${altNames.join('|')})$`;
  const query = `
    [out:json][timeout:25];
    (
      way["waterway"="river"]["name"~"${nameRegex}"]
        (${minLat},${minLng},${maxLat},${maxLng});
    );
    out geom;
  `.trim();

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const ways: Array<{ geometry: Array<{ lat: number; lon: number }> }> = data.elements ?? [];
      if (ways.length === 0) continue;

      // Flatten all way geometries into one big bag of points
      const allPoints: [number, number][] = [];
      for (const w of ways) {
        if (!w.geometry) continue;
        for (const p of w.geometry) {
          allPoints.push([p.lat, p.lon]);
        }
      }
      if (allPoints.length < 2) continue;

      // Find the closest river point to each endpoint, then carve the
      // sub-polyline that connects them following the river's direction.
      const startIdx = nearestPointIndex(allPoints, start);
      const endIdx   = nearestPointIndex(allPoints, end);

      const slice = startIdx <= endIdx
        ? allPoints.slice(startIdx, endIdx + 1)
        : allPoints.slice(endIdx, startIdx + 1).reverse();

      if (slice.length < 2) continue;

      // Anchor the polyline to the user's actual click points so the
      // markers align cleanly with the line ends.
      const result: [number, number][] = [start, ...slice, end];
      return { coords: result, isFallback: false };
    } catch (err) {
      // Try next endpoint
      console.warn(`[overpass] endpoint ${endpoint} failed:`, err);
      continue;
    }
  }

  return fallback;
}

function nearestPointIndex(
  points: [number, number][],
  target: [number, number],
): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = haversineSq(points[i], target);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/** Squared haversine — sufficient for nearest-point comparisons (avoids sqrt). */
function haversineSq(a: [number, number], b: [number, number]): number {
  const dLat = a[0] - b[0];
  const dLng = a[1] - b[1];
  return dLat * dLat + dLng * dLng;
}
