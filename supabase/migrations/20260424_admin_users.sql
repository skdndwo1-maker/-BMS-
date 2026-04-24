-- Admin users table for "아이디 기반 관리자 권한" (A안)
-- Apply in Supabase SQL editor.

create table if not exists public.admin_users (
  user_id uuid primary key,
  email text null,
  created_at timestamptz not null default now()
);

create index if not exists admin_users_email_idx on public.admin_users (email);

