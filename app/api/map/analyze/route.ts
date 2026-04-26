import { NextRequest, NextResponse } from 'next/server';

const CDSE_OAUTH_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const SH_STATS_API = 'https://sh.dataspace.copernicus.eu/api/v1/statistics';

interface RegionData {
  id: string;
  coords: number[];
  name: string;
  source: string;
  severity: string;
  metrics: {
    chlorophyll_mg_m3: number;
    turbidity_ntu: number;
    nitrates_mg_l?: number;
    phosphates_mg_l?: number;
  };
  reportedAt: string;
  notes?: string;
}

async function getCDSEToken(): Promise<string | null> {
  const clientId = process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.SENTINEL_HUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const formData = new URLSearchParams();
    formData.append('grant_type', 'client_credentials');
    formData.append('client_id', clientId);
    formData.append('client_secret', clientSecret);

    const resp = await fetch(CDSE_OAUTH_URL, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (resp.status === 200) {
      const data = await resp.json();
      return data.access_token ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchSatelliteStats(lat: number, lng: number, token: string): Promise<RegionData | null> {
  const d = 0.05;
  const bbox = [lng - d, lat - d, lng + d, lat + d];

  const now = new Date();
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const toIso = (dt: Date) => dt.toISOString().replace(/\.\d+Z$/, 'Z');

  const evalscript = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03","B04","B05","B08"], units: "REFLECTANCE" }],
    output: [
      { id: "ndci",      bands: 1, sampleType: "FLOAT32" },
      { id: "turbidity", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask",  bands: 1, sampleType: "UINT8"   }
    ]
  };
}
function evaluatePixel(sample) {
  var ndwi = (sample.B03 - sample.B08) / (sample.B03 + sample.B08 + 1e-10);
  var isWater = ndwi > 0 ? 1 : 0;
  var ndci = (sample.B05 - sample.B04) / (sample.B05 + sample.B04 + 1e-10);
  var turb = (228.1 * sample.B04) / (1.0 - sample.B04 / 0.1641);
  return {
    ndci:      [ndci],
    turbidity: [Math.max(0, Math.min(turb, 1000))],
    dataMask:  [isWater]
  };
}`;

  const body = {
    input: {
      bounds: {
        bbox,
        properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' },
      },
      data: [{ type: 'sentinel-2-l2a', dataFilter: { maxCloudCoverage: 30 } }],
    },
    aggregation: {
      timeRange: { from: toIso(tenDaysAgo), to: toIso(now) },
      aggregationInterval: { of: 'P10D' },
      evalscript,
    },
  };

  try {
    const resp = await fetch(SH_STATS_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      console.error('Statistics API error:', resp.status, await resp.text());
      return null;
    }

    const json = await resp.json();
    const intervals: any[] = json?.data ?? [];

    for (const interval of [...intervals].reverse()) {
      const outputs = interval?.outputs;
      const ndciMean: number | null = outputs?.ndci?.bands?.B0?.stats?.mean ?? null;
      const turbMean: number | null = outputs?.turbidity?.bands?.B0?.stats?.mean ?? null;
      const waterPixels: number = outputs?.ndci?.bands?.B0?.stats?.sampleCount ?? 0;

      if (ndciMean == null || turbMean == null || !isFinite(ndciMean) || !isFinite(turbMean)) {
        continue;
      }

      const chl = 14.039 + 86.115 * ndciMean + 194.325 * ndciMean * ndciMean;
      const chlorophyll = Math.max(0, chl);
      const turbidity = Math.max(0, turbMean);

      return {
        id: `loc-${lat.toFixed(2)}-${lng.toFixed(2)}`,
        coords: [lat, lng],
        name: `Satellite analysis (${lat.toFixed(3)}, ${lng.toFixed(3)})`,
        source: 'satellite',
        severity: classifySeverity(chlorophyll, turbidity),
        metrics: {
          chlorophyll_mg_m3: Math.round(chlorophyll * 10) / 10,
          turbidity_ntu: Math.round(turbidity * 10) / 10,
        },
        reportedAt: new Date().toISOString(),
        notes: `Sentinel-2 L2A · NDCI=${ndciMean.toFixed(3)} · ${waterPixels} water pixels`,
      };
    }

    return null;
  } catch (err) {
    console.error('Statistics API fetch error:', err);
    return null;
  }
}

function classifySeverity(chl: number, turb: number): string {
  if (chl > 75 || turb > 100) return 'critical';
  if (chl > 25 || turb > 50) return 'high';
  if (chl > 10 || turb > 10) return 'moderate';
  return 'low';
}

function generateFallbackData(lat: number, lng: number): RegionData {
  const isNearIndustry = lng > 24 && lng < 28 && lat > 43.5 && lat < 44.5;
  const isNearCity = lng > 25.5 && lng < 26.5 && lat > 44 && lat < 44.7;
  const isDelta = lng > 28 && lat > 45;
  const isUpperDanube = lng < 22;

  let chlorophyll: number;
  let turbidity: number;

  if (isNearIndustry) {
    chlorophyll = 25 + Math.random() * 20;
    turbidity = 35 + Math.random() * 40;
  } else if (isNearCity) {
    chlorophyll = 15 + Math.random() * 15;
    turbidity = 20 + Math.random() * 25;
  } else if (isDelta) {
    chlorophyll = 3 + Math.random() * 8;
    turbidity = 5 + Math.random() * 8;
  } else if (isUpperDanube) {
    chlorophyll = 5 + Math.random() * 10;
    turbidity = 8 + Math.random() * 10;
  } else {
    chlorophyll = 8 + Math.random() * 12;
    turbidity = 10 + Math.random() * 15;
  }

  return {
    id: `loc-${lat.toFixed(2)}-${lng.toFixed(2)}`,
    coords: [lat, lng],
    name: `Estimated (${lat.toFixed(3)}, ${lng.toFixed(3)})`,
    source: 'satellite',
    severity: classifySeverity(chlorophyll, turbidity),
    metrics: {
      chlorophyll_mg_m3: Math.round(chlorophyll * 10) / 10,
      turbidity_ntu: Math.round(turbidity * 10) / 10,
    },
    reportedAt: new Date().toISOString(),
    notes: 'Estimated - satellite data unavailable',
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lat, lng } = body;

    if (lat === undefined || lng === undefined) {
      return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 });
    }

    const token = await getCDSEToken();
    if (token) {
      const result = await fetchSatelliteStats(lat, lng, token);
      if (result) return NextResponse.json(result);
    }

    return NextResponse.json(generateFallbackData(lat, lng));
  } catch (error) {
    console.error('Map analyze API error:', error);
    return NextResponse.json({ error: 'Failed to analyze location' }, { status: 500 });
  }
}
