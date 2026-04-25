BEGIN;

-- Extensions required by UUID generation and geospatial queries.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== ENUMS =====
DO $$
BEGIN
  CREATE TYPE public.pollution_type AS ENUM (
    'oil',
    'algae',
    'sewage',
    'chemical',
    'plastic',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.classification_source AS ENUM (
    'manual',
    'rule_based'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.room_member_role AS ENUM (
    'member',
    'moderator',
    'admin'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.moderation_action AS ENUM (
    'hide_message',
    'unhide_message',
    'verify_report',
    'reject_report',
    'mute_user',
    'unmute_user',
    'warn_user'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- ===== BASE TABLE EXTENSIONS =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'citizen';

UPDATE public.profiles
SET role = 'citizen'
WHERE role IS NULL;

DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('citizen', 'moderator', 'admin'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE public.profiles
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS pollution_type public.pollution_type,
  ADD COLUMN IF NOT EXISTS classification_source public.classification_source,
  ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

UPDATE public.reports
SET status = 'pending'
WHERE status IS NULL OR status NOT IN ('pending', 'verified', 'rejected');

DO $$
BEGIN
  ALTER TABLE public.reports
    ADD CONSTRAINT reports_status_check
    CHECK (status IN ('pending', 'verified', 'rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE public.reports
    ADD CONSTRAINT reports_classification_confidence_range
    CHECK (
      classification_confidence IS NULL OR
      (classification_confidence >= 0 AND classification_confidence <= 1)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- ===== NEW TABLES =====
CREATE TABLE IF NOT EXISTS public.location_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  county TEXT NOT NULL,
  center GEOGRAPHY(POINT, 4326) NOT NULL,
  radius_km NUMERIC(6,2) NOT NULL DEFAULT 25,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT location_rooms_radius_positive CHECK (radius_km > 0)
);

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES public.location_rooms(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.room_memberships (
  room_id UUID NOT NULL REFERENCES public.location_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.room_member_role NOT NULL DEFAULT 'member',
  muted_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.location_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  message_text TEXT,
  image_url TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT room_messages_has_payload CHECK (
    COALESCE(NULLIF(TRIM(message_text), ''), image_url) IS NOT NULL
  ),
  CONSTRAINT room_messages_text_length CHECK (
    message_text IS NULL OR char_length(message_text) <= 2000
  ),
  CONSTRAINT room_messages_image_url_length CHECK (
    image_url IS NULL OR char_length(image_url) <= 2048
  )
);

CREATE TABLE IF NOT EXISTS public.report_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  width_px INTEGER,
  height_px INTEGER,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_media_size_positive CHECK (
    size_bytes IS NULL OR size_bytes > 0
  )
);

CREATE TABLE IF NOT EXISTS public.report_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  pollution_type public.pollution_type NOT NULL,
  source public.classification_source NOT NULL DEFAULT 'manual',
  confidence NUMERIC(4,3),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_classifications_confidence_range CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE TABLE IF NOT EXISTS public.moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table TEXT NOT NULL,
  target_id UUID NOT NULL,
  room_id UUID REFERENCES public.location_rooms(id) ON DELETE SET NULL,
  action public.moderation_action NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT moderation_events_target_check CHECK (
    target_table IN ('reports', 'room_messages', 'profiles')
  )
);

-- ===== HELPERS / TRIGGERS =====
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_location_rooms_updated_at ON public.location_rooms;
CREATE TRIGGER trg_location_rooms_updated_at
BEFORE UPDATE ON public.location_rooms
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_room_messages_updated_at ON public.room_messages;
CREATE TRIGGER trg_room_messages_updated_at
BEFORE UPDATE ON public.room_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.report_classifications_set_current()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_current THEN
    UPDATE public.report_classifications
      SET is_current = FALSE
      WHERE report_id = NEW.report_id
        AND id <> NEW.id
        AND is_current = TRUE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_report_classifications_set_current ON public.report_classifications;
CREATE TRIGGER trg_report_classifications_set_current
BEFORE INSERT OR UPDATE OF is_current ON public.report_classifications
FOR EACH ROW
EXECUTE FUNCTION public.report_classifications_set_current();

CREATE OR REPLACE FUNCTION public.is_moderator_or_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = COALESCE(uid, auth.uid())
      AND p.role IN ('moderator', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_room_member(target_room_id UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_memberships rm
    WHERE rm.room_id = target_room_id
      AND rm.user_id = COALESCE(uid, auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_send_room_message(target_room_id UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_memberships rm
    WHERE rm.room_id = target_room_id
      AND rm.user_id = COALESCE(uid, auth.uid())
      AND (rm.muted_until IS NULL OR rm.muted_until <= NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.get_location_rooms_near_point(
  in_lng DOUBLE PRECISION,
  in_lat DOUBLE PRECISION,
  in_max_distance_km NUMERIC DEFAULT 250,
  in_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
  room_id UUID,
  slug TEXT,
  name TEXT,
  county TEXT,
  radius_km NUMERIC,
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
  lr.id AS room_id,
  lr.slug,
  lr.name,
  lr.county,
  lr.radius_km,
  ROUND((ST_Distance(lr.center, up.geog) / 1000.0)::NUMERIC, 3) AS distance_km
FROM public.location_rooms lr
CROSS JOIN user_point up
WHERE lr.is_active = TRUE
  AND ST_DWithin(lr.center, up.geog, GREATEST(in_max_distance_km, 0)::DOUBLE PRECISION * 1000.0)
ORDER BY ST_Distance(lr.center, up.geog) ASC
LIMIT GREATEST(1, LEAST(COALESCE(in_limit, 20), 100));
$$;

CREATE OR REPLACE FUNCTION public.resolve_room_for_point(
  in_lng DOUBLE PRECISION,
  in_lat DOUBLE PRECISION
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH user_point AS (
  SELECT ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography AS geog
)
SELECT lr.id
FROM public.location_rooms lr
CROSS JOIN user_point up
WHERE lr.is_active = TRUE
  AND ST_DWithin(lr.center, up.geog, lr.radius_km::DOUBLE PRECISION * 1000.0)
ORDER BY ST_Distance(lr.center, up.geog) ASC
LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.assign_report_room(in_report_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id UUID;
BEGIN
  SELECT public.resolve_room_for_point(
    ST_X(r.location::geometry),
    ST_Y(r.location::geometry)
  )
  INTO v_room_id
  FROM public.reports r
  WHERE r.id = in_report_id;

  IF v_room_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.reports
  SET room_id = v_room_id
  WHERE id = in_report_id
    AND room_id IS DISTINCT FROM v_room_id;

  RETURN v_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_report_room()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.room_id IS NULL AND NEW.location IS NOT NULL THEN
    NEW.room_id := public.resolve_room_for_point(
      ST_X(NEW.location::geometry),
      ST_Y(NEW.location::geometry)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_auto_assign_room ON public.reports;
CREATE TRIGGER trg_reports_auto_assign_room
BEFORE INSERT OR UPDATE OF location, room_id ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_report_room();

-- Public markers endpoint base (used by map frontend without exposing write tables directly).
CREATE OR REPLACE FUNCTION public.get_public_map_markers(
  in_min_lng DOUBLE PRECISION DEFAULT NULL,
  in_min_lat DOUBLE PRECISION DEFAULT NULL,
  in_max_lng DOUBLE PRECISION DEFAULT NULL,
  in_max_lat DOUBLE PRECISION DEFAULT NULL,
  in_limit INTEGER DEFAULT 500
)
RETURNS TABLE(
  marker_id UUID,
  marker_type TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  severity INTEGER,
  title TEXT,
  pollution_type public.pollution_type,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH bbox AS (
  SELECT
    CASE
      WHEN in_min_lng IS NULL OR in_min_lat IS NULL OR in_max_lng IS NULL OR in_max_lat IS NULL THEN NULL
      ELSE ST_MakeEnvelope(in_min_lng, in_min_lat, in_max_lng, in_max_lat, 4326)
    END AS geom
),
anomaly_markers AS (
  SELECT
    a.id AS marker_id,
    'anomaly'::TEXT AS marker_type,
    ST_Y(a.location::geometry) AS lat,
    ST_X(a.location::geometry) AS lng,
    a.severity,
    a.anomaly_type AS title,
    CASE
      WHEN LOWER(a.anomaly_type) LIKE '%oil%' THEN 'oil'::public.pollution_type
      WHEN LOWER(a.anomaly_type) LIKE '%algae%' THEN 'algae'::public.pollution_type
      WHEN LOWER(a.anomaly_type) LIKE '%sewage%' THEN 'sewage'::public.pollution_type
      WHEN LOWER(a.anomaly_type) LIKE '%chemical%' THEN 'chemical'::public.pollution_type
      WHEN LOWER(a.anomaly_type) LIKE '%plastic%' THEN 'plastic'::public.pollution_type
      ELSE 'other'::public.pollution_type
    END AS pollution_type,
    a.created_at
  FROM public.anomalies a
  CROSS JOIN bbox b
  WHERE a.resolved = FALSE
    AND (b.geom IS NULL OR ST_Intersects(a.location::geometry, b.geom))
),
report_markers AS (
  SELECT
    r.id AS marker_id,
    'report'::TEXT AS marker_type,
    ST_Y(r.location::geometry) AS lat,
    ST_X(r.location::geometry) AS lng,
    NULL::INTEGER AS severity,
    COALESCE(r.title, 'Citizen report') AS title,
    r.pollution_type,
    r.created_at
  FROM public.reports r
  CROSS JOIN bbox b
  WHERE r.status = 'verified'
    AND (b.geom IS NULL OR ST_Intersects(r.location::geometry, b.geom))
),
sensor_markers AS (
  SELECT
    s.id AS marker_id,
    'sensor'::TEXT AS marker_type,
    ST_Y(s.location::geometry) AS lat,
    ST_X(s.location::geometry) AS lng,
    NULL::INTEGER AS severity,
    s.ngo_name AS title,
    NULL::public.pollution_type AS pollution_type,
    s.last_updated AS created_at
  FROM public.sensors s
  CROSS JOIN bbox b
  WHERE (b.geom IS NULL OR ST_Intersects(s.location::geometry, b.geom))
)
SELECT
  m.marker_id,
  m.marker_type,
  m.lat,
  m.lng,
  m.severity,
  m.title,
  m.pollution_type,
  m.created_at
FROM (
  SELECT * FROM anomaly_markers
  UNION ALL
  SELECT * FROM report_markers
  UNION ALL
  SELECT * FROM sensor_markers
) m
ORDER BY m.created_at DESC NULLS LAST
LIMIT GREATEST(1, LEAST(COALESCE(in_limit, 500), 2000));
$$;

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

CREATE INDEX IF NOT EXISTS idx_sensors_location ON public.sensors USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_sensors_last_updated ON public.sensors(last_updated DESC);

CREATE INDEX IF NOT EXISTS idx_anomalies_location ON public.anomalies USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_anomalies_created_at ON public.anomalies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_unresolved_created ON public.anomalies(created_at DESC) WHERE resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_reports_location ON public.reports USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_pending_created ON public.reports(created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reports_room_id ON public.reports(room_id);

CREATE INDEX IF NOT EXISTS idx_location_rooms_center ON public.location_rooms USING GIST (center);
CREATE INDEX IF NOT EXISTS idx_location_rooms_active ON public.location_rooms(is_active);

CREATE INDEX IF NOT EXISTS idx_room_memberships_user_room ON public.room_memberships(user_id, room_id);
CREATE INDEX IF NOT EXISTS idx_room_memberships_role ON public.room_memberships(role);

CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON public.room_messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_messages_visible_room_created ON public.room_messages(room_id, created_at DESC) WHERE is_hidden = FALSE;
CREATE INDEX IF NOT EXISTS idx_room_messages_report_id ON public.room_messages(report_id);

CREATE INDEX IF NOT EXISTS idx_report_media_report_id ON public.report_media(report_id);
CREATE INDEX IF NOT EXISTS idx_report_media_uploaded_by ON public.report_media(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_report_classifications_report_created ON public.report_classifications(report_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_report_classifications_current ON public.report_classifications(report_id) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_moderation_events_target ON public.moderation_events(target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_moderation_events_created_at ON public.moderation_events(created_at DESC);

-- ===== RLS =====
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_events ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_self_or_mod'
  ) THEN
    CREATE POLICY profiles_select_self_or_mod
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (id = auth.uid() OR public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_insert_self_or_mod'
  ) THEN
    CREATE POLICY profiles_insert_self_or_mod
      ON public.profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (id = auth.uid() OR public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_self_or_mod'
  ) THEN
    CREATE POLICY profiles_update_self_or_mod
      ON public.profiles
      FOR UPDATE
      TO authenticated
      USING (id = auth.uid() OR public.is_moderator_or_admin(auth.uid()))
      WITH CHECK (id = auth.uid() OR public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

-- Public read for markers source tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sensors' AND policyname = 'sensors_select_public'
  ) THEN
    CREATE POLICY sensors_select_public
      ON public.sensors
      FOR SELECT
      TO anon, authenticated
      USING (TRUE);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'anomalies' AND policyname = 'anomalies_select_public'
  ) THEN
    CREATE POLICY anomalies_select_public
      ON public.anomalies
      FOR SELECT
      TO anon, authenticated
      USING (TRUE);
  END IF;
END;
$$;

-- Reports policies.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reports' AND policyname = 'reports_select_verified_public'
  ) THEN
    CREATE POLICY reports_select_verified_public
      ON public.reports
      FOR SELECT
      TO anon, authenticated
      USING (status = 'verified');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reports' AND policyname = 'reports_select_own'
  ) THEN
    CREATE POLICY reports_select_own
      ON public.reports
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reports' AND policyname = 'reports_insert_own'
  ) THEN
    CREATE POLICY reports_insert_own
      ON public.reports
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reports' AND policyname = 'reports_update_own_pending'
  ) THEN
    CREATE POLICY reports_update_own_pending
      ON public.reports
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid() AND status = 'pending')
      WITH CHECK (user_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reports' AND policyname = 'reports_update_moderator_admin'
  ) THEN
    CREATE POLICY reports_update_moderator_admin
      ON public.reports
      FOR UPDATE
      TO authenticated
      USING (public.is_moderator_or_admin(auth.uid()))
      WITH CHECK (public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

-- Rooms and memberships.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'location_rooms' AND policyname = 'location_rooms_select_public'
  ) THEN
    CREATE POLICY location_rooms_select_public
      ON public.location_rooms
      FOR SELECT
      TO anon, authenticated
      USING (is_active = TRUE);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'location_rooms' AND policyname = 'location_rooms_manage_mod_admin'
  ) THEN
    CREATE POLICY location_rooms_manage_mod_admin
      ON public.location_rooms
      FOR ALL
      TO authenticated
      USING (public.is_moderator_or_admin(auth.uid()))
      WITH CHECK (public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'room_memberships' AND policyname = 'room_memberships_select_own_or_mod'
  ) THEN
    CREATE POLICY room_memberships_select_own_or_mod
      ON public.room_memberships
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid() OR public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'room_memberships' AND policyname = 'room_memberships_insert_self_or_mod'
  ) THEN
    CREATE POLICY room_memberships_insert_self_or_mod
      ON public.room_memberships
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid() OR public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'room_memberships' AND policyname = 'room_memberships_update_self_or_mod'
  ) THEN
    CREATE POLICY room_memberships_update_self_or_mod
      ON public.room_memberships
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid() OR public.is_moderator_or_admin(auth.uid()))
      WITH CHECK (user_id = auth.uid() OR public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

-- Room messages.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'room_messages' AND policyname = 'room_messages_select_member_or_mod'
  ) THEN
    CREATE POLICY room_messages_select_member_or_mod
      ON public.room_messages
      FOR SELECT
      TO authenticated
      USING (
        (public.is_room_member(room_id, auth.uid()) AND is_hidden = FALSE)
        OR public.is_moderator_or_admin(auth.uid())
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'room_messages' AND policyname = 'room_messages_insert_member'
  ) THEN
    CREATE POLICY room_messages_insert_member
      ON public.room_messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND public.can_send_room_message(room_id, auth.uid())
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'room_messages' AND policyname = 'room_messages_update_author_or_mod'
  ) THEN
    CREATE POLICY room_messages_update_author_or_mod
      ON public.room_messages
      FOR UPDATE
      TO authenticated
      USING (
        (user_id = auth.uid() AND is_hidden = FALSE)
        OR public.is_moderator_or_admin(auth.uid())
      )
      WITH CHECK (
        (user_id = auth.uid())
        OR public.is_moderator_or_admin(auth.uid())
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'room_messages' AND policyname = 'room_messages_delete_mod_admin'
  ) THEN
    CREATE POLICY room_messages_delete_mod_admin
      ON public.room_messages
      FOR DELETE
      TO authenticated
      USING (public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

-- Report media.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'report_media' AND policyname = 'report_media_select_verified_or_owner_or_mod'
  ) THEN
    CREATE POLICY report_media_select_verified_or_owner_or_mod
      ON public.report_media
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.reports r
          WHERE r.id = report_id
            AND (
              r.status = 'verified'
              OR r.user_id = auth.uid()
              OR public.is_moderator_or_admin(auth.uid())
            )
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'report_media' AND policyname = 'report_media_insert_owner'
  ) THEN
    CREATE POLICY report_media_insert_owner
      ON public.report_media
      FOR INSERT
      TO authenticated
      WITH CHECK (
        uploaded_by = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.reports r
          WHERE r.id = report_id
            AND r.user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'report_media' AND policyname = 'report_media_update_mod_admin'
  ) THEN
    CREATE POLICY report_media_update_mod_admin
      ON public.report_media
      FOR UPDATE
      TO authenticated
      USING (public.is_moderator_or_admin(auth.uid()))
      WITH CHECK (public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

-- Report classifications.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'report_classifications' AND policyname = 'report_classifications_select_public'
  ) THEN
    CREATE POLICY report_classifications_select_public
      ON public.report_classifications
      FOR SELECT
      TO anon, authenticated
      USING (TRUE);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'report_classifications' AND policyname = 'report_classifications_insert_mod_admin'
  ) THEN
    CREATE POLICY report_classifications_insert_mod_admin
      ON public.report_classifications
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'report_classifications' AND policyname = 'report_classifications_update_mod_admin'
  ) THEN
    CREATE POLICY report_classifications_update_mod_admin
      ON public.report_classifications
      FOR UPDATE
      TO authenticated
      USING (public.is_moderator_or_admin(auth.uid()))
      WITH CHECK (public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

-- Moderation events.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'moderation_events' AND policyname = 'moderation_events_select_mod_admin'
  ) THEN
    CREATE POLICY moderation_events_select_mod_admin
      ON public.moderation_events
      FOR SELECT
      TO authenticated
      USING (public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'moderation_events' AND policyname = 'moderation_events_insert_mod_admin'
  ) THEN
    CREATE POLICY moderation_events_insert_mod_admin
      ON public.moderation_events
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_moderator_or_admin(auth.uid()));
  END IF;
END;
$$;

-- Function execution grants.
GRANT EXECUTE ON FUNCTION public.get_public_map_markers(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  INTEGER
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_room_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_room_message(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_moderator_or_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_location_rooms_near_point(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  NUMERIC,
  INTEGER
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_room_for_point(
  DOUBLE PRECISION,
  DOUBLE PRECISION
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_report_room(UUID) TO authenticated;

COMMIT;
