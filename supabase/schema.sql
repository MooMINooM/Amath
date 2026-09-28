-- A-Math Beta: student identity/profile layer
-- Run in Supabase SQL Editor.

create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_code text not null unique,
  full_name text not null,
  class_name text,
  room_no text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.student_profiles enable row level security;

drop policy if exists "students can read own profile" on public.student_profiles;
create policy "students can read own profile"
on public.student_profiles
for select
to authenticated
using (auth.uid() = user_id);

create index if not exists student_profiles_student_code_idx
on public.student_profiles(student_code);

-- Beta login convention:
-- Auth email = lower(student_code) || '@student.amath.local'
-- Example student code S003 -> s003@student.amath.local
--
-- Create the Auth user from Supabase Dashboard (Authentication > Users)
-- with that email and a PIN/password, then insert the matching profile row:
--
-- insert into public.student_profiles
--   (user_id, student_code, full_name, class_name, room_no)
-- values
--   ('<AUTH_USER_UUID>', 'S003', 'เด็กชายธนภัทร สุขใจ', 'ป.6', '1');
