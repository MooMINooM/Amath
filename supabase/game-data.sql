-- A-Math Beta 0.3: match, turn telemetry, and realtime pitwall state
-- Run this in Supabase SQL Editor after student_profiles has been created.

create table if not exists public.matches (
  id text primary key,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  student_code text,
  student_name text,
  class_name text,
  room_no text,
  opponent_type text not null default 'bot',
  difficulty text,
  ruleset_id text,
  ruleset_label text,
  status text not null default 'active'
    check (status in ('active','finished','abandoned')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result text check (result is null or result in ('win','loss','draw','double_loss')),
  final_player_score integer,
  final_bot_score integer,
  end_reason text,
  clock jsonb,
  summary jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists matches_student_started_idx
on public.matches(student_user_id, started_at desc);

create table if not exists public.turn_events (
  id bigint generated always as identity primary key,
  match_id text not null references public.matches(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  actor text not null check (actor in ('player','bot')),
  turn_number integer not null,
  event_type text not null default 'move',
  occurred_at timestamptz not null default now(),
  move_score numeric,
  equation text,
  decision_time_ms integer,
  decision_quality numeric,
  tactical_loss numeric,
  move_value numeric,
  best_move_value numeric,
  gap_before numeric,
  gap_after numeric,
  rack_before jsonb,
  rack_after jsonb,
  board_state text,
  threat_before text,
  suggested_mode text,
  opponent_opportunity numeric,
  opponent_next_score numeric,
  raw jsonb
);

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

create index if not exists turn_events_match_turn_idx
on public.turn_events(match_id, turn_number, id);

create table if not exists public.live_sessions (
  student_user_id uuid primary key references auth.users(id) on delete cascade,
  match_id text references public.matches(id) on delete cascade,
  student_code text,
  student_name text,
  class_name text,
  room_no text,
  status text not null default 'idle'
    check (status in ('idle','playing','finished','disconnected')),
  ruleset_id text,
  difficulty text,
  turn_number integer not null default 0,
  active_side text,
  player_score integer not null default 0,
  bot_score integer not null default 0,
  bag_count integer,
  player_time_ms bigint,
  bot_time_ms bigint,
  decision_quality numeric,
  tactical_loss numeric,
  win_probability numeric,
  pressure_level numeric,
  rack_quality numeric,
  board_snapshot jsonb,
  rack_snapshot jsonb,
  last_equation text,
  last_move_score numeric,
  updated_at timestamptz not null default now()
);

-- Competition reset generation.
-- Every match/live/turn belongs to exactly one generation. This prevents a browser
-- that still holds an old in-memory match from repopulating data after a reset.
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

-- If an administrator uses TRUNCATE on matches, automatically invalidate every
-- browser that still belongs to the previous competition generation.
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

create index if not exists live_sessions_status_idx
on public.live_sessions(status, updated_at desc);

alter table public.matches enable row level security;
alter table public.turn_events enable row level security;
alter table public.live_sessions enable row level security;

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

-- Enable realtime for compact Pitwall state and turn telemetry.
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
