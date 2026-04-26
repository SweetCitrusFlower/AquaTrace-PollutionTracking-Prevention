-- Enable PostGIS for geographic calculations
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. USERS (Extends Supabase Auth)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE,
    tokens INTEGER DEFAULT 0,
    is_premium BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. NGO SENSORS
CREATE TABLE public.sensors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ngo_name TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    latest_reading JSONB, -- Stores {"ph": 7.2, "turbidity": 12.5}
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ANOMALIES (Triggered by Copernicus/ML)
CREATE TABLE public.anomalies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source TEXT NOT NULL, -- 'Sentinel-1', 'Sentinel-2', 'Sensor'
    anomaly_type TEXT NOT NULL, -- 'Algae Bloom', 'Oil Spill', 'Nitrate Runoff'
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    severity INTEGER CHECK (severity BETWEEN 1 AND 5),
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CITIZEN REPORTS
CREATE TABLE public.reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id),
    anomaly_id UUID REFERENCES public.anomalies(id), -- Nullable, if spontaneous
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    image_url TEXT,
    smell_score INTEGER CHECK (smell_score BETWEEN 1 AND 5),
    water_flow TEXT, -- 'stagnant', 'slow', 'fast'
    human_activity TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'verified', 'rejected'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create spatial indexes for hyper-fast map loading
CREATE INDEX idx_sensors_location ON public.sensors USING GIST (location);
CREATE INDEX idx_anomalies_location ON public.anomalies USING GIST (location);
CREATE INDEX idx_reports_location ON public.reports USING GIST (location);