BEGIN;

-- Enable PostGIS (required for GEOGRAPHY type)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function (safe to re-create if already exists from migration 001)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- Migration 002: water_stations + sensor_data
-- Purpose: Support ETA prediction (water treatment stations) and historical
--          sensor readings (from Copernicus, EEA, NGO sensors, etc.)
-- Run AFTER: schema.sql + 001_dev_a_data_platform.sql
-- ============================================================================

-- ===== 1. WATER STATIONS =====
-- Stores water treatment plants, monitoring stations, and intake points along
-- the Danube and its Romanian tributaries. Used by the ETA prediction module
-- to calculate how fast a pollution plume reaches a downstream station.

CREATE TABLE IF NOT EXISTS public.water_stations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    station_type  TEXT NOT NULL DEFAULT 'treatment',
    location      GEOGRAPHY(POINT, 4326) NOT NULL,
    river_name    TEXT,
    operator      TEXT,
    capacity_m3_day NUMERIC,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT water_stations_type_check CHECK (
        station_type IN ('treatment', 'monitoring', 'intake', 'pumping')
    )
);

-- Spatial index for fast map queries and nearest-station lookups
CREATE INDEX IF NOT EXISTS idx_water_stations_location
    ON public.water_stations USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_water_stations_active
    ON public.water_stations(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_water_stations_river
    ON public.water_stations(river_name);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_water_stations_updated_at ON public.water_stations;
CREATE TRIGGER trg_water_stations_updated_at
BEFORE UPDATE ON public.water_stations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- RLS: publicly readable (stations are public infrastructure)
ALTER TABLE public.water_stations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'water_stations'
      AND policyname = 'water_stations_select_public'
  ) THEN
    CREATE POLICY water_stations_select_public
      ON public.water_stations
      FOR SELECT
      TO anon, authenticated
      USING (TRUE);
  END IF;
END;
$$;

-- Authenticated users can insert stations (backend uses service role anyway)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'water_stations'
      AND policyname = 'water_stations_insert_authenticated'
  ) THEN
    CREATE POLICY water_stations_insert_authenticated
      ON public.water_stations
      FOR INSERT
      TO authenticated
      WITH CHECK (TRUE);
  END IF;
END;
$$;


-- ===== 2. SENSOR DATA (Historical Readings) =====
-- Stores every individual reading from any data source. This is the "time-series"
-- table that powers charts, trend analysis, and heatmaps.
-- Sources include: Copernicus/Sentinel, EEA Waterbase, NGO field sensors, GRDC.

CREATE TABLE IF NOT EXISTS public.sensor_data (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Optional FK to a physical sensor (NULL for satellite/EEA data)
    sensor_id             UUID,

    -- Data source identifier
    source                TEXT NOT NULL,

    -- Geolocation of the measurement
    location              GEOGRAPHY(POINT, 4326) NOT NULL,

    -- Water quality metrics (all nullable — different sources report different params)
    chlorophyll_mg_m3     NUMERIC,
    turbidity_ntu         NUMERIC,
    nitrates_mg_l         NUMERIC,
    nitrites_mg_l         NUMERIC,       -- nitriți
    phosphates_mg_l       NUMERIC,
    sulfates_mg_l         NUMERIC,       -- sulfați (SO₄²⁻)
    sulfites_mg_l         NUMERIC,       -- sulfiți (SO₃²⁻)
    ph                    NUMERIC,
    dissolved_oxygen_mg_l NUMERIC,
    temperature_c         NUMERIC,
    conductivity_us_cm    NUMERIC,
    water_purity_index    NUMERIC,       -- indicele general de puritate (WQI / GPI)

    -- Hydrological metrics (from GRDC / Open-Meteo / INHGA)
    discharge_m3_s        NUMERIC,       -- river discharge
    water_level_m         NUMERIC,       -- water level (stage)
    flow_velocity_m_s     NUMERIC,       -- surface velocity

    -- Raw payload from the external API (for debugging / reprocessing)
    raw_payload           JSONB,

    -- When the measurement was actually taken (not when we imported it)
    recorded_at           TIMESTAMPTZ NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT sensor_data_source_check CHECK (
        source IN (
            'copernicus', 'sentinel',
            'eea_waterbase', 'eea_wise',
            'emodnet',
            'grdc',
            'inhga',
            'ngo_sensor',
            'citizen',
            'mock'
        )
    ),
    CONSTRAINT sensor_data_ph_range CHECK (
        ph IS NULL OR (ph >= 0 AND ph <= 14)
    )
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_sensor_data_location
    ON public.sensor_data USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_sensor_data_recorded_at
    ON public.sensor_data(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_data_source
    ON public.sensor_data(source);
CREATE INDEX IF NOT EXISTS idx_sensor_data_source_recorded
    ON public.sensor_data(source, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_data_sensor_id
    ON public.sensor_data(sensor_id) WHERE sensor_id IS NOT NULL;

-- RLS: sensor data is public (open data philosophy)
ALTER TABLE public.sensor_data ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sensor_data'
      AND policyname = 'sensor_data_select_public'
  ) THEN
    CREATE POLICY sensor_data_select_public
      ON public.sensor_data
      FOR SELECT
      TO anon, authenticated
      USING (TRUE);
  END IF;
END;
$$;

-- Backend inserts via service role (bypasses RLS). Allow authenticated too.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sensor_data'
      AND policyname = 'sensor_data_insert_authenticated'
  ) THEN
    CREATE POLICY sensor_data_insert_authenticated
      ON public.sensor_data
      FOR INSERT
      TO authenticated
      WITH CHECK (TRUE);
  END IF;
END;
$$;


-- ===== 3. HELPER FUNCTION: Nearest Water Station =====
-- Used by the ETA module to find the closest downstream station.

CREATE OR REPLACE FUNCTION public.get_nearest_water_stations(
    in_lng DOUBLE PRECISION,
    in_lat DOUBLE PRECISION,
    in_max_distance_km NUMERIC DEFAULT 200,
    in_limit INTEGER DEFAULT 5
)
RETURNS TABLE(
    station_id UUID,
    name TEXT,
    station_type TEXT,
    river_name TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    distance_km NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH user_point AS (
    SELECT ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography AS geog
)
SELECT
    ws.id AS station_id,
    ws.name,
    ws.station_type,
    ws.river_name,
    ST_Y(ws.location::geometry) AS lat,
    ST_X(ws.location::geometry) AS lng,
    ROUND((ST_Distance(ws.location, up.geog) / 1000.0)::NUMERIC, 2) AS distance_km
FROM public.water_stations ws
CROSS JOIN user_point up
WHERE ws.is_active = TRUE
  AND ST_DWithin(ws.location, up.geog, GREATEST(in_max_distance_km, 0)::DOUBLE PRECISION * 1000.0)
ORDER BY ST_Distance(ws.location, up.geog) ASC
LIMIT GREATEST(1, LEAST(COALESCE(in_limit, 5), 50));
$$;

GRANT EXECUTE ON FUNCTION public.get_nearest_water_stations(
    DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, INTEGER
) TO anon, authenticated;


-- ===== 4. HELPER FUNCTION: Sensor Data Aggregation =====
-- Returns averaged sensor data for a bounding box, grouped by source,
-- useful for the dashboard charts and heatmap tiles.

CREATE OR REPLACE FUNCTION public.get_sensor_data_summary(
    in_source TEXT DEFAULT NULL,
    in_days INTEGER DEFAULT 7,
    in_min_lng DOUBLE PRECISION DEFAULT NULL,
    in_min_lat DOUBLE PRECISION DEFAULT NULL,
    in_max_lng DOUBLE PRECISION DEFAULT NULL,
    in_max_lat DOUBLE PRECISION DEFAULT NULL,
    in_limit INTEGER DEFAULT 200
)
RETURNS TABLE(
    data_id UUID,
    source TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    chlorophyll_mg_m3 NUMERIC,
    turbidity_ntu NUMERIC,
    nitrates_mg_l NUMERIC,
    phosphates_mg_l NUMERIC,
    ph NUMERIC,
    dissolved_oxygen_mg_l NUMERIC,
    temperature_c NUMERIC,
    discharge_m3_s NUMERIC,
    recorded_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH bbox AS (
    SELECT
        CASE
            WHEN in_min_lng IS NULL OR in_min_lat IS NULL
                 OR in_max_lng IS NULL OR in_max_lat IS NULL THEN NULL
            ELSE ST_MakeEnvelope(in_min_lng, in_min_lat, in_max_lng, in_max_lat, 4326)
        END AS geom
)
SELECT
    sd.id AS data_id,
    sd.source,
    ST_Y(sd.location::geometry) AS lat,
    ST_X(sd.location::geometry) AS lng,
    sd.chlorophyll_mg_m3,
    sd.turbidity_ntu,
    sd.nitrates_mg_l,
    sd.phosphates_mg_l,
    sd.ph,
    sd.dissolved_oxygen_mg_l,
    sd.temperature_c,
    sd.discharge_m3_s,
    sd.recorded_at
FROM public.sensor_data sd
CROSS JOIN bbox b
WHERE sd.recorded_at >= NOW() - (in_days || ' days')::INTERVAL
  AND (in_source IS NULL OR sd.source = in_source)
  AND (b.geom IS NULL OR ST_Intersects(sd.location::geometry, b.geom))
ORDER BY sd.recorded_at DESC
LIMIT GREATEST(1, LEAST(COALESCE(in_limit, 200), 2000));
$$;

GRANT EXECUTE ON FUNCTION public.get_sensor_data_summary(
    TEXT, INTEGER,
    DOUBLE PRECISION, DOUBLE PRECISION,
    DOUBLE PRECISION, DOUBLE PRECISION,
    INTEGER
) TO anon, authenticated;


COMMIT;
