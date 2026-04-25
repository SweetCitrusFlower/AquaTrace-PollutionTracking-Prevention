# Dev A Runbook - Data Platform and Security

## Goal
Deliver the data foundation used by all backend features except chatbot:
- geospatial map data
- generic location-based community rooms
- report media and classification
- moderation and audit trail
- row-level security boundaries

## Files delivered by Dev A
- database/migrations/001_dev_a_data_platform.sql
- database/seeds/001_seed_default_rooms.sql

## Safe ownership boundaries (to avoid team conflicts)
Dev A edits only database migration/seed files and security contracts.
Dev A does not modify frontend pages, map UI components, or Flask route handlers owned by other developers.

## Execution order in Supabase SQL Editor
1. Run database/schema.sql (base schema).
2. Run database/migrations/001_dev_a_data_platform.sql.
3. Run database/seeds/001_seed_default_rooms.sql.

## What this migration adds
1. New enums:
- pollution_type
- classification_source
- room_member_role
- moderation_action

2. Table upgrades:
- profiles.role with citizen/moderator/admin guard
- reports classification and verification columns

3. New tables:
- location_rooms
- room_memberships
- room_messages
- report_media
- report_classifications
- moderation_events

4. New helper functions:
- is_moderator_or_admin
- is_room_member
- can_send_room_message
- get_public_map_markers
- get_location_rooms_near_point
- resolve_room_for_point
- assign_report_room

5. Security:
- RLS enabled on platform tables
- public read path for map markers
- authenticated write on reports/messages
- classification updates limited to moderator/admin

6. Performance indexes:
- geography GIST indexes
- created_at and status indexes
- pending reports partial index

## Quick smoke tests
Run after migration and seed.

1) Default rooms exist
SELECT slug, name, county, radius_km, is_active
FROM public.location_rooms
ORDER BY slug;

2) Nearby room discovery works
SELECT *
FROM public.get_location_rooms_near_point(26.10, 44.43, 400, 10);

3) Public marker function returns rows
SELECT *
FROM public.get_public_map_markers(NULL, NULL, NULL, NULL, 50)
LIMIT 5;

4) Reports pending index path
EXPLAIN ANALYZE
SELECT id, created_at
FROM public.reports
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 20;

5) RLS status
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles',
    'sensors',
    'anomalies',
    'reports',
    'location_rooms',
    'room_memberships',
    'room_messages',
    'report_media',
    'report_classifications',
    'moderation_events'
  )
ORDER BY tablename;

## Contracts for other developers
For Dev B (Map Engine):
- Use function public.get_public_map_markers as read contract.
- Add map aggregation RPCs in new migration files only, no edits inside Dev A migration.

For Dev C (Reports and classification):
- Write reports to public.reports.
- Write media metadata to public.report_media.
- Write manual/rule-based classification to public.report_classifications.

For Dev D (Community room):
- Read/write room data in location_rooms, room_memberships, room_messages.
- Use get_location_rooms_near_point for room picker UX.
- Use resolve_room_for_point when auto-selecting room by coordinates.
- Use moderation_events for audit trail when hiding messages or muting users.

## Notes
- Service role key bypasses RLS for trusted server actions.
- Client-side queries should use anon/authenticated roles and RLS-safe paths.
- Keep future schema changes additive in new migration files to avoid merge conflicts.
