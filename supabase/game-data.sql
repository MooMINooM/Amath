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
end $pitwall$;
