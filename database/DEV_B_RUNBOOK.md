# Dev B Runbook - Water Stations + Sensor Data + External Sources

## Goal
Deliver the data platform extensions for:
- Water treatment/monitoring station registry (ETA prediction target)
- Historical sensor data time-series (charts, trends, heatmaps)
- External data source integration (EEA, EMODnet, Copernicus, mock NGO/GRDC)
- Automatic anomaly detection via threshold checks

## Files delivered by Dev B
- database/migrations/002_water_stations_sensor_data.sql
- database/seeds/002_seed_water_stations.sql
- backend/services/external_data_service.py
- backend/services/data_ingestion.py
- backend/app.py (new routes added at the bottom)

## Safe ownership boundaries
Dev B adds new tables and new Flask routes only.
Dev B does not modify existing tables, RLS policies, or frontend components owned by Dev A, C, or D.

## Execution order in Supabase SQL Editor
1. Ensure schema.sql + 001_dev_a_data_platform.sql have been run first.
2. Run database/migrations/002_water_stations_sensor_data.sql.
3. Run database/seeds/002_seed_water_stations.sql.

## What this migration adds

### New tables
- `water_stations` — Treatment plants, monitoring stations, intake points
- `sensor_data` — Time-series readings from all external sources

### New helper functions
- `get_nearest_water_stations(lng, lat, radius_km, limit)` — Find closest stations
- `get_sensor_data_summary(source, days, bbox, limit)` — Aggregated data query

### New indexes
- GIST on water_stations.location and sensor_data.location
- B-tree on sensor_data(source), sensor_data(recorded_at)

### RLS policies
- water_stations: public SELECT, mod/admin management
- sensor_data: public SELECT, mod/admin INSERT

### New Flask API routes
- `GET  /api/water-stations` — List stations (filter by type, river, active)
- `GET  /api/water-stations/nearest` — Nearest stations to a point
- `GET  /api/sensor-data/history` — Historical data with filters
- `POST /api/data/ingest` — Trigger data pipeline
- `GET  /api/data/sources` — List external data sources and their status

## Quick smoke tests

### SQL (run in Supabase SQL Editor after migration)

```sql
-- 1) Water stations exist
SELECT id, name, station_type, river_name
FROM public.water_stations
ORDER BY name
LIMIT 5;

-- 2) Nearest station function works
SELECT * FROM public.get_nearest_water_stations(26.10, 44.43, 200, 3);

-- 3) Sensor data table columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sensor_data'
ORDER BY ordinal_position;

-- 4) RLS status
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('water_stations', 'sensor_data')
ORDER BY tablename;
```

### Flask (run with curl after starting backend)

```bash
# Health check
curl http://localhost:5000/health

# List water stations
curl http://localhost:5000/api/water-stations

# Nearest stations to Bucharest
curl "http://localhost:5000/api/water-stations/nearest?lat=44.43&lng=26.10&radius_km=300"

# List data sources
curl http://localhost:5000/api/data/sources

# Trigger data ingestion (all sources)
curl -X POST http://localhost:5000/api/data/ingest -H "Content-Type: application/json"

# Trigger only EEA + Copernicus
curl -X POST http://localhost:5000/api/data/ingest \
  -H "Content-Type: application/json" \
  -d '{"sources": ["eea", "copernicus"]}'

# Fetch sensor data history (last 7 days)
curl "http://localhost:5000/api/sensor-data/history?days=7&limit=50"
```

## Contracts for other developers

### For Map Engine (Dev C):
- Use `GET /api/water-stations` to render station markers on the map.
- Use `GET /api/sensor-data/history` to populate heatmap layers.
- Use `GET /api/water-stations/nearest` for the ETA prediction dropdown.

### For Dashboard/Charts (Dev D):
- Use `GET /api/sensor-data/history?source=X&days=N` for time-series charts.
- Use `GET /api/data/sources` to show data source status cards.

### For Admin Panel:
- Use `POST /api/data/ingest` to trigger manual data refresh.
