-- DanubeGuard OS - Supabase/PostgreSQL/PostGIS Schema
-- Execute this file in Supabase SQL Editor.

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ----------
-- Enums
-- ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_tier') then
    create type public.subscription_tier as enum ('free', 'premium');
  end if;

  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type public.report_status as enum ('pending', 'validated', 'rejected');
  end if;
end
$$;

-- ----------
-- Utility trigger for updated_at
-- ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------
-- Core tables
-- ----------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  user_segment text check (user_segment in ('farmer', 'fisherman', 'fish_breeder', 'citizen', 'ngo', 'admin')),
  token_balance integer not null default 0 check (token_balance >= 0),
  subscription_tier public.subscription_tier not null default 'free',
  premium_until timestamptz,
  home_location geometry(Point, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  report_type text not null,
  source text not null default 'citizen',
  image_url text not null,
  notes text,
  exif_taken_at timestamptz,
  gps_accuracy_m numeric(8, 2),
  confidence_score numeric(4, 3) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  status public.report_status not null default 'pending',
  location geometry(Point, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_report_type_check check (
    report_type in ('algae_bloom', 'dead_fish', 'oil_sheen', 'foam', 'odor', 'discoloration', 'litter', 'other')
  )
);

create table if not exists public.anomalies (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  anomaly_type text not null,
  severity numeric(4, 3) not null default 0.5 check (severity >= 0 and severity <= 1),
  confidence_score numeric(4, 3) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  predicted_at timestamptz not null default now(),
  valid_until timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_by text not null default 'copernicus-webhook',
  location geometry(Point, 4326) not null,
  created_at timestamptz not null default now(),
  constraint anomalies_source_check check (source in ('sentinel-1', 'sentinel-2', 'sentinel-3', 'copernicus-model', 'manual')),
  constraint anomalies_type_check check (anomaly_type in ('thermal_hotspot', 'chlorophyll_spike', 'harmful_algae_risk', 'runoff_risk', 'other'))
);

create table if not exists public.sensors (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  station_code text not null,
  station_name text,
  nitrites_mg_l numeric(10, 4),
  nitrates_mg_l numeric(10, 4),
  phosphates_mg_l numeric(10, 4),
  ph_value numeric(5, 2),
  water_temp_c numeric(5, 2),
  captured_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  location geometry(Point, 4326) not null,
  unique (provider, station_code, captured_at)
);

-- ----------
-- Indexes
-- ----------
create index if not exists idx_reports_location_gist on public.reports using gist (location);
create index if not exists idx_anomalies_location_gist on public.anomalies using gist (location);
create index if not exists idx_sensors_location_gist on public.sensors using gist (location);

create index if not exists idx_reports_created_at on public.reports (created_at desc);
create index if not exists idx_anomalies_predicted_at on public.anomalies (predicted_at desc);
create index if not exists idx_sensors_captured_at on public.sensors (captured_at desc);

-- ----------
-- Triggers
-- ----------
drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists trg_reports_updated_at on public.reports;
create trigger trg_reports_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

-- ----------
-- RPC: create citizen report and award tokens
-- ----------
create or replace function public.create_citizen_report(
  p_user_id uuid,
  p_report_type text,
  p_lat double precision,
  p_lon double precision,
  p_image_url text,
  p_exif_taken_at timestamptz default null,
  p_notes text default null,
  p_source text default 'citizen',
  p_gps_accuracy_m numeric default null,
  p_token_reward integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports;
  v_token_balance integer;
begin
  -- If called with an authenticated user context, enforce ownership.
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'auth.uid() does not match target user_id';
  end if;

  insert into public.reports (
    user_id,
    report_type,
    source,
    image_url,
    notes,
    exif_taken_at,
    gps_accuracy_m,
    location
  )
  values (
    p_user_id,
    p_report_type,
    coalesce(p_source, 'citizen'),
    p_image_url,
    p_notes,
    p_exif_taken_at,
    p_gps_accuracy_m,
    st_setsrid(st_makepoint(p_lon, p_lat), 4326)
  )
  returning * into v_report;

  update public.users
  set token_balance = token_balance + greatest(p_token_reward, 0)
  where id = p_user_id
  returning token_balance into v_token_balance;

  return jsonb_build_object(
    'id', v_report.id,
    'user_id', v_report.user_id,
    'report_type', v_report.report_type,
    'status', v_report.status,
    'image_url', v_report.image_url,
    'notes', v_report.notes,
    'latitude', st_y(v_report.location),
    'longitude', st_x(v_report.location),
    'created_at', v_report.created_at,
    'tokens_awarded', greatest(p_token_reward, 0),
    'token_balance', coalesce(v_token_balance, 0)
  );
end;
$$;

-- ----------
-- RPC: upsert Copernicus anomaly marker
-- ----------
create or replace function public.upsert_copernicus_anomaly(
  p_source text,
  p_anomaly_type text,
  p_lat double precision,
  p_lon double precision,
  p_severity numeric default 0.5,
  p_confidence_score numeric default null,
  p_predicted_at timestamptz default now(),
  p_valid_until timestamptz default null,
  p_payload jsonb default '{}'::jsonb,
  p_created_by text default 'copernicus-webhook'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anomaly_id uuid;
begin
  insert into public.anomalies (
    source,
    anomaly_type,
    severity,
    confidence_score,
    predicted_at,
    valid_until,
    payload,
    created_by,
    location
  )
  values (
    p_source,
    p_anomaly_type,
    greatest(least(p_severity, 1), 0),
    p_confidence_score,
    coalesce(p_predicted_at, now()),
    p_valid_until,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_created_by, 'copernicus-webhook'),
    st_setsrid(st_makepoint(p_lon, p_lat), 4326)
  )
  returning id into v_anomaly_id;

  return v_anomaly_id;
end;
$$;

-- ----------
-- RPC: bundled map payload (reports + anomalies + latest sensors)
-- ----------
create or replace function public.get_map_data(
  p_min_lon double precision default 8.0,
  p_min_lat double precision default 42.0,
  p_max_lon double precision default 30.0,
  p_max_lat double precision default 50.0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with bbox as (
  select st_makeenvelope(p_min_lon, p_min_lat, p_max_lon, p_max_lat, 4326) as geom
),
reports_data as (
  select jsonb_build_object(
    'id', r.id,
    'type', r.report_type,
    'status', r.status,
    'confidence_score', r.confidence_score,
    'image_url', r.image_url,
    'created_at', r.created_at,
    'latitude', st_y(r.location),
    'longitude', st_x(r.location)
  ) as item
  from public.reports r
  cross join bbox b
  where st_intersects(r.location, b.geom)
    and r.status in ('pending', 'validated')
),
anomalies_data as (
  select jsonb_build_object(
    'id', a.id,
    'source', a.source,
    'type', a.anomaly_type,
    'severity', a.severity,
    'confidence_score', a.confidence_score,
    'predicted_at', a.predicted_at,
    'valid_until', a.valid_until,
    'latitude', st_y(a.location),
    'longitude', st_x(a.location)
  ) as item
  from public.anomalies a
  cross join bbox b
  where st_intersects(a.location, b.geom)
    and (a.valid_until is null or a.valid_until >= now())
),
latest_sensors as (
  select distinct on (s.provider, s.station_code)
    s.*
  from public.sensors s
  order by s.provider, s.station_code, s.captured_at desc
),
sensors_data as (
  select jsonb_build_object(
    'id', s.id,
    'provider', s.provider,
    'station_code', s.station_code,
    'station_name', s.station_name,
    'nitrites_mg_l', s.nitrites_mg_l,
    'nitrates_mg_l', s.nitrates_mg_l,
    'phosphates_mg_l', s.phosphates_mg_l,
    'ph_value', s.ph_value,
    'water_temp_c', s.water_temp_c,
    'captured_at', s.captured_at,
    'latitude', st_y(s.location),
    'longitude', st_x(s.location)
  ) as item
  from latest_sensors s
  cross join bbox b
  where st_intersects(s.location, b.geom)
)
select jsonb_build_object(
  'reports', coalesce((select jsonb_agg(item) from reports_data), '[]'::jsonb),
  'anomalies', coalesce((select jsonb_agg(item) from anomalies_data), '[]'::jsonb),
  'sensors', coalesce((select jsonb_agg(item) from sensors_data), '[]'::jsonb)
);
$$;

-- ----------
-- RLS
-- ----------
alter table public.users enable row level security;
alter table public.reports enable row level security;
alter table public.anomalies enable row level security;
alter table public.sensors enable row level security;

-- Users: each user can only manage own profile
create policy if not exists users_select_own
on public.users
for select
using (auth.uid() = id);

create policy if not exists users_insert_own
on public.users
for insert
with check (auth.uid() = id);

create policy if not exists users_update_own
on public.users
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Reports: owner can insert/update own pending report; map-visible reports readable to all clients
create policy if not exists reports_select_public_or_owner
on public.reports
for select
using (
  status in ('pending', 'validated')
  or auth.uid() = user_id
);

create policy if not exists reports_insert_own
on public.reports
for insert
with check (auth.uid() = user_id);

create policy if not exists reports_update_own_pending
on public.reports
for update
using (auth.uid() = user_id and status = 'pending')
with check (auth.uid() = user_id);

-- Anomalies and sensors are public environmental layers
create policy if not exists anomalies_select_all
on public.anomalies
for select
using (true);

create policy if not exists sensors_select_all
on public.sensors
for select
using (true);

-- Optional grants for RPC usage from authenticated clients
grant execute on function public.create_citizen_report(uuid, text, double precision, double precision, text, timestamptz, text, text, numeric, integer) to authenticated;
grant execute on function public.get_map_data(double precision, double precision, double precision, double precision) to authenticated, anon;
grant execute on function public.upsert_copernicus_anomaly(text, text, double precision, double precision, numeric, numeric, timestamptz, timestamptz, jsonb, text) to authenticated;
