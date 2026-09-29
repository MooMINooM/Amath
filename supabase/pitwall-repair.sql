-- A-Math Beta 0.9: Pitwall data reliability / RLS repair
-- Safe to run multiple times in Supabase SQL Editor.
-- Run after game-data.sql and after teacher_profiles exists.

-- 1) Teacher role function.
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_profiles
    where user_id = auth.uid()
      and active = true
  );
$$;

revoke all on function public.is_teacher() from public;
grant execute on function public.is_teacher() to authenticated;

-- 2) Ensure RLS is enabled.
alter table public.matches enable row level security;
alter table public.turn_events enable row level security;
alter table public.live_sessions enable row level security;

-- 3) Students can write/read only their own telemetry.
drop policy if exists "students manage own matches" on public.matches;
create policy "students manage own matches"
on public.matches
for all
to authenticated
using (auth.uid() = student_user_id)
with check (auth.uid() = student_user_id);

drop policy if exists "students manage own turn events" on public.turn_events;
create policy "students manage own turn events"
on public.turn_events
for all
to authenticated
using (auth.uid() = student_user_id)
with check (auth.uid() = student_user_id);

drop policy if exists "students manage own live session" on public.live_sessions;
create policy "students manage own live session"
on public.live_sessions
for all
to authenticated
using (auth.uid() = student_user_id)
with check (auth.uid() = student_user_id);

-- 4) Teachers can read all telemetry needed by Pitwall / Deep Analysis.
drop policy if exists "teachers read matches" on public.matches;
create policy "teachers read matches"
on public.matches
for select
to authenticated
using (public.is_teacher());

drop policy if exists "teachers read turn events" on public.turn_events;
create policy "teachers read turn events"
on public.turn_events
for select
to authenticated
using (public.is_teacher());

drop policy if exists "teachers read live sessions" on public.live_sessions;
create policy "teachers read live sessions"
on public.live_sessions
for select
to authenticated
using (public.is_teacher());

-- Student profiles are needed for names/classes in teacher views.
drop policy if exists "teachers read student profiles" on public.student_profiles;
create policy "teachers read student profiles"
on public.student_profiles
for select
to authenticated
using (public.is_teacher());

-- 5) Ensure live_sessions and turn_events participate in Supabase Realtime.
do $pitwall$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_sessions'
  ) then
    alter publication supabase_realtime add table public.live_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'turn_events'
  ) then
    alter publication supabase_realtime add table public.turn_events;
  end if;
end $pitwall$;

-- 6) Helpful indexes (safe if already present).
create index if not exists live_sessions_status_idx
on public.live_sessions(status, updated_at desc);

create index if not exists matches_student_started_idx
on public.matches(student_user_id, started_at desc);

-- Verification queries: after running, these should return rows when data exists.
select count(*) as live_session_rows from public.live_sessions;
select count(*) as match_rows from public.matches;
select count(*) as turn_event_rows from public.turn_events;
