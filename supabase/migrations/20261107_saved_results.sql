-- Per-account saved results for brand naming (generate/audit) and brand design inspection.
-- Frontend reads/writes directly with the user's JWT; RLS restricts every row to its owner.
-- Existing tables unchanged.

create table if not exists public.saved_namings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  mode text not null check (mode in ('generate', 'audit')),
  summary text null,
  input jsonb not null default '{}'::jsonb,
  result jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_namings_user_updated_idx
  on public.saved_namings (user_id, updated_at desc);

alter table public.saved_namings enable row level security;

drop policy if exists "saved_namings_owner_select" on public.saved_namings;
create policy "saved_namings_owner_select" on public.saved_namings
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "saved_namings_owner_insert" on public.saved_namings;
create policy "saved_namings_owner_insert" on public.saved_namings
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "saved_namings_owner_update" on public.saved_namings;
create policy "saved_namings_owner_update" on public.saved_namings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "saved_namings_owner_delete" on public.saved_namings;
create policy "saved_namings_owner_delete" on public.saved_namings
  for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.saved_inspections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  score int null,
  summary text null,
  input jsonb not null default '{}'::jsonb,
  result jsonb null,
  -- data URLs (downscaled on the client); kept out of list queries
  design_image text null,
  revised_image text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_inspections_user_updated_idx
  on public.saved_inspections (user_id, updated_at desc);

alter table public.saved_inspections enable row level security;

drop policy if exists "saved_inspections_owner_select" on public.saved_inspections;
create policy "saved_inspections_owner_select" on public.saved_inspections
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "saved_inspections_owner_insert" on public.saved_inspections;
create policy "saved_inspections_owner_insert" on public.saved_inspections
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "saved_inspections_owner_update" on public.saved_inspections;
create policy "saved_inspections_owner_update" on public.saved_inspections
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "saved_inspections_owner_delete" on public.saved_inspections;
create policy "saved_inspections_owner_delete" on public.saved_inspections
  for delete to authenticated using ((select auth.uid()) = user_id);