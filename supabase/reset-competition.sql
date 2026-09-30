-- A-Math safe competition reset
-- Keeps auth.users, student_profiles and teacher_profiles.
-- Requires the reset-generation protocol from supabase/pitwall-repair.sql.
--
-- Preferred reset:
select public.reset_amath_competition() as new_generation;

-- Verify that the new generation is active and competition data is empty.
select generation, updated_at
from public.amath_system_state
where id = 1;

select count(*) as live_session_rows from public.live_sessions;
select count(*) as match_rows from public.matches;
select count(*) as turn_event_rows from public.turn_events;

-- Manual TRUNCATE is also supported after the protocol is installed:
-- truncate table public.turn_events, public.live_sessions, public.matches restart identity;
-- The AFTER TRUNCATE trigger on public.matches will automatically increment generation.
