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


-- 1.1) Competition reset generation (safe to run repeatedly).
create table if not exists public.amath_system_state (
  id smallint primary key check (id = 1),
  generation bigint not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.amath_system_state(id,generation)
values (1,1)
on conflict (id) do nothing;

alter table public.amath_system_state enable row level security;

drop policy if exists "authenticated read amath system state" on public.amath_system_state;
create policy "authenticated read amath system state"
on public.amath_system_state
for select
to authenticated
using (true);

grant select on public.amath_system_state to authenticated;

create or replace function public.current_amath_generation()
returns bigint
language sql
stable
security definer
set search_path = public
as $generation$
  select coalesce((select generation from public.amath_system_state where id = 1),1);
$generation$;

revoke all on function public.current_amath_generation() from public;
grant execute on function public.current_amath_generation() to authenticated;

alter table public.matches add column if not exists generation bigint;
alter table public.turn_events add column if not exists generation bigint;
alter table public.live_sessions add column if not exists generation bigint;

update public.matches
set generation = public.current_amath_generation()
where generation is null;

update public.turn_events
set generation = public.current_amath_generation()
where generation is null;

update public.live_sessions
set generation = public.current_amath_generation()
where generation is null;

alter table public.matches alter column generation set default public.current_amath_generation();
alter table public.turn_events alter column generation set default public.current_amath_generation();
alter table public.live_sessions alter column generation set default public.current_amath_generation();

alter table public.matches alter column generation set not null;
alter table public.turn_events alter column generation set not null;
alter table public.live_sessions alter column generation set not null;

create index if not exists matches_generation_idx
on public.matches(generation, student_user_id, started_at desc);

create index if not exists turn_events_generation_idx
on public.turn_events(generation, match_id, turn_number, id);

create index if not exists live_sessions_generation_idx
on public.live_sessions(generation, status, updated_at desc);

create or replace function public.bump_amath_generation_after_truncate()
returns trigger
language plpgsql
security definer
set search_path = public
as $generation_trigger$
begin
  update public.amath_system_state
  set generation = generation + 1,
      updated_at = now()
  where id = 1;
  return null;
end;
$generation_trigger$;

drop trigger if exists amath_matches_truncate_generation on public.matches;
create trigger amath_matches_truncate_generation
after truncate on public.matches
for each statement
execute function public.bump_amath_generation_after_truncate();

create or replace function public.reset_amath_competition()
returns bigint
language plpgsql
security definer
set search_path = public
as $reset_competition$
declare
  next_generation bigint;
begin
  if auth.uid() is not null and not public.is_teacher() then
    raise exception 'Only an active teacher can reset A-Math competition data';
  end if;

  update public.amath_system_state
  set generation = generation + 1,
      updated_at = now()
  where id = 1
  returning generation into next_generation;

  delete from public.turn_events;
  delete from public.live_sessions;
  delete from public.matches;

  return next_generation;
end;
$reset_competition$;

revoke all on function public.reset_amath_competition() from public;
grant execute on function public.reset_amath_competition() to authenticated;

-- Ensure older turn_events tables receive telemetry columns added after Beta 0.3.
alter table public.turn_events add column if not exists decision_time_ms integer;
alter table public.turn_events add column if not exists decision_quality numeric;
alter table public.turn_events add column if not exists tactical_loss numeric;
alter table public.turn_events add column if not exists move_value numeric;
alter table public.turn_events add column if not exists best_move_value numeric;
alter table public.turn_events add column if not exists gap_before numeric;
alter table public.turn_events add column if not exists gap_after numeric;
alter table public.turn_events add column if not exists rack_before jsonb;
alter table public.turn_events add column if not exists rack_after jsonb;
alter table public.turn_events add column if not exists board_state text;
alter table public.turn_events add column if not exists threat_before text;
alter table public.turn_events add column if not exists suggested_mode text;
alter table public.turn_events add column if not exists opponent_opportunity numeric;
alter table public.turn_events add column if not exists opponent_next_score numeric;
alter table public.turn_events add column if not exists raw jsonb;

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
using (
  auth.uid() = student_user_id
  and generation = public.current_amath_generation()
)
with check (
  auth.uid() = student_user_id
  and generation = public.current_amath_generation()
);

drop policy if exists "students manage own turn events" on public.turn_events;
create policy "students manage own turn events"
on public.turn_events
for all
to authenticated
using (
  auth.uid() = student_user_id
  and generation = public.current_amath_generation()
)
with check (
  auth.uid() = student_user_id
  and generation = public.current_amath_generation()
);

drop policy if exists "students manage own live session" on public.live_sessions;
create policy "students manage own live session"
on public.live_sessions
for all
to authenticated
using (
  auth.uid() = student_user_id
  and generation = public.current_amath_generation()
)
with check (
  auth.uid() = student_user_id
  and generation = public.current_amath_generation()
);

-- 4) Teachers can read all telemetry needed by Pitwall / Deep Analysis.
drop policy if exists "teachers read matches" on public.matches;
create policy "teachers read matches"
on public.matches
for select
to authenticated
using (
  public.is_teacher()
  and generation = public.current_amath_generation()
);

drop policy if exists "teachers read turn events" on public.turn_events;
create policy "teachers read turn events"
on public.turn_events
for select
to authenticated
using (
  public.is_teacher()
  and generation = public.current_amath_generation()
);

drop policy if exists "teachers read live sessions" on public.live_sessions;
create policy "teachers read live sessions"
on public.live_sessions
for select
to authenticated
using (
  public.is_teacher()
  and generation = public.current_amath_generation()
);

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

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'amath_system_state'
  ) then
    alter publication supabase_realtime add table public.amath_system_state;
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

select generation as current_generation from public.amath_system_state where id = 1;
