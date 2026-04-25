BEGIN;

-- Generic room setup for location-based community chat.
-- No county-specific lock-in: these are default regional anchors.
INSERT INTO public.location_rooms (
  slug,
  name,
  county,
  center,
  radius_km,
  is_active
)
VALUES
  (
    'danube-general',
    'Danube General Room',
    'All Regions',
    ST_SetSRID(ST_MakePoint(26.4000, 44.9000), 4326)::geography,
    450,
    TRUE
  ),
  (
    'danube-west',
    'Danube West Corridor',
    'West Corridor',
    ST_SetSRID(ST_MakePoint(22.7000, 44.6200), 4326)::geography,
    130,
    TRUE
  ),
  (
    'danube-central',
    'Danube Central Corridor',
    'Central Corridor',
    ST_SetSRID(ST_MakePoint(26.1500, 44.4500), 4326)::geography,
    130,
    TRUE
  ),
  (
    'danube-east',
    'Danube East Corridor',
    'East Corridor',
    ST_SetSRID(ST_MakePoint(28.8200, 45.2500), 4326)::geography,
    130,
    TRUE
  )
ON CONFLICT (slug)
DO UPDATE SET
  name = EXCLUDED.name,
  county = EXCLUDED.county,
  center = EXCLUDED.center,
  radius_km = EXCLUDED.radius_km,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Bootstrap all existing users to the global room for immediate chat availability.
WITH general_room AS (
  SELECT id
  FROM public.location_rooms
  WHERE slug = 'danube-general'
)
INSERT INTO public.room_memberships (room_id, user_id, role)
SELECT gr.id, p.id, 'member'::public.room_member_role
FROM general_room gr
CROSS JOIN public.profiles p
ON CONFLICT (room_id, user_id) DO NOTHING;

COMMIT;
