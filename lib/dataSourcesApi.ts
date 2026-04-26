// lib/dataSourcesApi.ts
// Lists external data sources (EEA, Copernicus, EMODnet, etc.) and their status.

export interface DataSource {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'mock' | 'unknown' | string;
  data_type?: string;
  coverage?: string;
  update_frequency?: string;
}

export interface DataSourcesResponse {
  sources: DataSource[];
  offline?: boolean;
}

const STATIC_FALLBACK: DataSource[] = [
  { id: 'eea_waterbase', name: 'EEA Waterbase',           type: 'water_quality',    status: 'unknown', data_type: 'Chemical parameters', coverage: 'EU-wide' },
  { id: 'copernicus',    name: 'Copernicus Sentinel-2',   type: 'satellite',        status: 'unknown', data_type: 'Chlorophyll-a, turbidity', coverage: 'Danube corridor' },
  { id: 'emodnet',       name: 'EMODnet Physics',         type: 'oceanographic',    status: 'unknown', data_type: 'Temperature, salinity', coverage: 'Black Sea / Delta' },
  { id: 'open_meteo',    name: 'Open-Meteo Flood API',    type: 'hydrology',        status: 'unknown', data_type: 'River discharge', coverage: 'Global' },
  { id: 'overpass',      name: 'OpenStreetMap Overpass',  type: 'geospatial',       status: 'unknown', data_type: 'River geometry', coverage: 'Worldwide' },
];

export async function fetchDataSources(): Promise<DataSourcesResponse> {
  try {
    const res = await fetch('/api/data/sources', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: DataSourcesResponse = await res.json();
    if (!Array.isArray(data.sources) || data.sources.length === 0) {
      throw new Error('Empty');
    }
    return data;
  } catch (err) {
    console.warn('[dataSources] using static fallback:', err);
    return { sources: STATIC_FALLBACK, offline: true };
  }
}
