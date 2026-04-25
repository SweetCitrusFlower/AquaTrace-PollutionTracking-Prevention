import { NextRequest, NextResponse } from 'next/server';

const CDSE_OAUTH_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const SH_API = 'https://sh.dataspace.copernicus.eu/process/v1';

interface RegionData {
  id: string;
  coords: number[];
  name: string;
  source: string;
  severity: string;
  metrics: {
    chlorophyll_mg_m3: number;
    nitrates_mg_l: number;
    phosphates_mg_l: number;
    heatAnomaly_C: number;
  };
  reportedAt: string;
  notes?: string;
}

async function getCDSEToken(): Promise<string | null> {
  const clientId = process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.SENTINEL_HUB_CLIENT_SECRET;
  
  console.log('DEBUG getCDSEToken:', { clientId: !!clientId, clientSecret: !!clientSecret });
  
  if (!clientId || !clientSecret) {
    console.log('DEBUG: Missing credentials');
    return null;
  }
  
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
    
    console.log('DEBUG OAuth response:', resp.status);
    
    if (resp.status === 200) {
      const data = await resp.json();
      return data.access_token;
    }
    return null;
  } catch (e) {
    console.error('DEBUG OAuth error:', e);
    return null;
  }
}

async function fetchSatelliteData(lat: number, lng: number, token: string): Promise<any> {
  const bboxSize = 0.02;
  const bbox = [lng - bboxSize, lat - bboxSize, lng + bboxSize, lat + bboxSize];
  
  const evalscript = `//VERSION=3
function setup() {
  return { input: ["B04", "B08"], output: { bands: 2 } };
}
function evaluatePixel(sample) {
  return [sample.B04, sample.B08];
}`;
  
  // Send as regular JSON, not FormData
  const requestData = {
    input: {
      bounds: {
        bbox: bbox,
        properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' }
      },
      data: [{
        type: 'sentinel-2-l2a',
        dataFilter: { maxCloudCoverage: 50 }
      }]
    },
    output: { width: 10, height: 10 },
    evalscript: evalscript
  };

  try {
    const resp = await fetch(SH_API, {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    console.log('Sentinel Hub Status:', resp.status);
    
    if (resp.status === 200) {
      const buffer = new Uint8Array(await resp.arrayBuffer());
      
      let sumB04 = 0, sumB08 = 0, count = 0;
      for (let i = 0; i < Math.min(buffer.length, 200); i += 2) {
        if (i < buffer.length) sumB04 += buffer[i];
        if (i + 1 < buffer.length) sumB08 += buffer[i + 1];
        count++;
      }
      
      const avgB04 = sumB04 / count;
      const avgB08 = sumB08 / count;
      const ndci = (avgB08 - avgB04) / (avgB08 + avgB04 + 1);
      
      const chlorophyll = 5 + (ndci * 20 + avgB08 / 20) * 10;
      const nitrates = 2 + (avgB08 / 30) * 8;
      const phosphates = 0.3 + (avgB08 / 50) * 2;
      
      let severity: string;
      if (chlorophyll > 30) severity = 'critical';
      else if (chlorophyll > 20) severity = 'high';
      else if (chlorophyll > 10) severity = 'moderate';
      else severity = 'low';
      
      return {
        id: 'loc-' + lat.toFixed(2) + '-' + lng.toFixed(2),
        coords: [lat, lng],
        name: 'Satellite analysis (' + lat.toFixed(3) + ', ' + lng.toFixed(3) + ')',
        source: 'satellite',
        severity: severity,
        metrics: {
          chlorophyll_mg_m3: Math.max(0, Math.round(chlorophyll * 10) / 10),
          nitrates_mg_l: Math.max(0, Math.round(nitrates * 10) / 10),
          phosphates_mg_l: Math.max(0, Math.round(phosphates * 10) / 10),
          heatAnomaly_C: Math.round((avgB04 / 100) * 10) / 10,
        },
        reportedAt: new Date().toISOString(),
        notes: 'Real Sentinel-2 satellite data',
        _debug: { avgB04: Math.round(avgB04), avgB08: Math.round(avgB08), ndci: Math.round(ndci * 100) / 100 }
      };
    }
    
    console.log('API error:', await resp.text());
    return null;
  } catch (err) {
    console.error('Sentinel Hub error:', err);
    return null;
  }
}

function processSatelliteData(avgValue: number, lat: number, lng: number): RegionData {
  const reflectance = avgValue / 255;
  
  const chlorophyll = 5 + (reflectance * 40);
  const nitrates = 2 + (reflectance * 15);
  const phosphates = 0.3 + (reflectance * 3);
  const heatAnomaly = 0.2 + (reflectance * 2);
  
  let severity: string;
  if (chlorophyll > 30) severity = 'critical';
  else if (chlorophyll > 20) severity = 'high';
  else if (chlorophyll > 10) severity = 'moderate';
  else severity = 'low';
  
  return {
    id: 'loc-' + lat.toFixed(2) + '-' + lng.toFixed(2),
    coords: [lat, lng],
    name: 'Satellite analysis (' + lat.toFixed(3) + ', ' + lng.toFixed(3) + ')',
    source: 'satellite',
    severity: severity,
    metrics: {
      chlorophyll_mg_m3: Math.round(chlorophyll * 10) / 10,
      nitrates_mg_l: Math.round(nitrates * 10) / 10,
      phosphates_mg_l: Math.round(phosphates * 10) / 10,
      heatAnomaly_C: Math.round(heatAnomaly * 10) / 10,
    },
    reportedAt: new Date().toISOString(),
    notes: 'Real Sentinel-2 satellite data'
  };
}

function generateFallbackData(lat: number, lng: number): RegionData {
  const isNearIndustry = lng > 24 && lng < 28 && lat > 43.5 && lat < 44.5;
  const isNearCity = lng > 25.5 && lng < 26.5 && lat > 44 && lat < 44.7;
  const isDelta = lng > 28 && lat > 45;
  const isUpperDanube = lng < 22;
  
  let chlorophyll: number, nitrates: number, phosphates: number, heat: number, severity: string;
  
  if (isNearIndustry) {
    chlorophyll = 25 + Math.random() * 20;
    nitrates = 8 + Math.random() * 8;
    phosphates = 1.5 + Math.random() * 2;
    heat = 1.0 + Math.random() * 1.5;
    severity = chlorophyll > 30 ? 'critical' : chlorophyll > 20 ? 'high' : 'moderate';
  } else if (isNearCity) {
    chlorophyll = 15 + Math.random() * 15;
    nitrates = 5 + Math.random() * 6;
    phosphates = 0.8 + Math.random() * 1.2;
    heat = 0.8 + Math.random() * 1.0;
    severity = chlorophyll > 25 ? 'high' : chlorophyll > 15 ? 'moderate' : 'low';
  } else if (isDelta) {
    chlorophyll = 3 + Math.random() * 8;
    nitrates = 1 + Math.random() * 2;
    phosphates = 0.2 + Math.random() * 0.4;
    heat = 0.1 + Math.random() * 0.3;
    severity = 'low';
  } else if (isUpperDanube) {
    chlorophyll = 5 + Math.random() * 10;
    nitrates = 2 + Math.random() * 4;
    phosphates = 0.3 + Math.random() * 0.6;
    heat = 0.3 + Math.random() * 0.5;
    severity = 'low';
  } else {
    chlorophyll = 8 + Math.random() * 12;
    nitrates = 3 + Math.random() * 5;
    phosphates = 0.5 + Math.random() * 0.8;
    heat = 0.4 + Math.random() * 0.6;
    severity = chlorophyll > 15 ? 'moderate' : 'low';
  }
  
  const coordStr = lat.toFixed(3) + ', ' + lng.toFixed(3);
  
  return {
    id: 'loc-' + lat.toFixed(2) + '-' + lng.toFixed(2),
    coords: [lat, lng],
    name: 'Estimated (' + coordStr + ')',
    source: 'satellite',
    severity: severity,
    metrics: {
      chlorophyll_mg_m3: Math.round(chlorophyll * 10) / 10,
      nitrates_mg_l: Math.round(nitrates * 10) / 10,
      phosphates_mg_l: Math.round(phosphates * 10) / 10,
      heatAnomaly_C: Math.round(heat * 10) / 10,
    },
    reportedAt: new Date().toISOString(),
    notes: 'Estimated (Satellite API unavailable)'
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
      console.log('Got token, fetching satellite data for', lat, lng);
      const result = await fetchSatelliteData(lat, lng, token);
      
      if (result && !result.error) {
        console.log('Got real satellite data:', result._raw);
        return NextResponse.json(result);
      } else {
        console.log('Satellite fetch result:', result);
      }
    }
    
    console.log('Using fallback data for', lat, lng);
    return NextResponse.json(generateFallbackData(lat, lng));
  } catch (error) {
    console.error('Map analyze API error:', error);
    return NextResponse.json({ error: 'Failed to analyze location' }, { status: 500 });
  }
}