-- A-Math Beta 0.4: Teacher access for Pitwall + Student Data
-- Run AFTER student_profiles and game-data.sql

create table if not exists public.teacher_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  school_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.teacher_profiles enable row level security;

drop policy if exists "teachers read own profile" on public.teacher_profiles;
create policy "teachers read own profile"
on public.teacher_profiles
for select
to authenticated
using (auth.uid() = user_id);

-- Central role check used by RLS policies below.
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

-- Teachers can read student profiles.
drop policy if exists "teachers read student profiles" on public.student_profiles;
create policy "teachers read student profiles"
on public.student_profiles
for select
to authenticated
using (public.is_teacher());

-- Teachers can read all matches for analysis.
drop policy if exists "teachers read matches" on public.matches;
create policy "teachers read matches"
on public.matches
for select
to authenticated
using (public.is_teacher());

-- Teachers can read turn telemetry.
drop policy if exists "teachers read turn events" on public.turn_events;
create policy "teachers read turn events"
on public.turn_events
for select
to authenticated
using (public.is_teacher());

-- Teachers can read live sessions for Pitwall.
drop policy if exists "teachers read live sessions" on public.live_sessions;
create policy "teachers read live sessions"
on public.live_sessions
for select
to authenticated
using (public.is_teacher());

create index if not exists teacher_profiles_active_idx
on public.teacher_profiles(active);
