-- Brand Library (Storage + meta DB)
-- Bucket: brand-library (private)
-- Meta table: brand_assets
-- Access:
-- - All authenticated users can read (list/view/download via signed URL).
-- - Only admin_users can upload/insert metadata.
-- - Delete is not allowed (no delete policies).

create extension if not exists "pgcrypto";

-- 1) Storage bucket (private)
insert into storage.buckets (id, name, public)
values ('brand-library', 'brand-library', false)
on conflict (id) do nothing;

-- 2) Meta table
create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid null,

  category text not null, -- logo|slogan|icon|pictogram|image|template|font|guide
  name text not null,
  description text null,
  tags text[] not null default '{}'::text[],

  -- file identity
  bucket text not null default 'brand-library',
  path text not null, -- storage object path (includes category folder)
  original_filename text null,
  mime_type text null,
  ext text null,
  size_bytes bigint null,

  -- optional preview (png/svg) for non-previewable originals like ai/ttf
  preview_path text null,

  -- metrics
  downloads bigint not null default 0
);

create index if not exists brand_assets_category_idx on public.brand_assets (category, created_at desc);
create index if not exists brand_assets_created_at_idx on public.brand_assets (created_at desc);
create index if not exists brand_assets_name_idx on public.brand_assets (name);

-- RLS
alter table public.brand_assets enable row level security;

-- All authenticated users can read metadata
drop policy if exists "brand_assets_read_auth" on public.brand_assets;
create policy "brand_assets_read_auth"
on public.brand_assets
for select
to authenticated
using (true);

-- Only admin_users can insert metadata
drop policy if exists "brand_assets_insert_admin" on public.brand_assets;
create policy "brand_assets_insert_admin"
on public.brand_assets
for insert
to authenticated
with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

-- Disallow update/delete by not creating policies (RLS denies by default)

-- 3) Storage policies (storage.objects)
-- Allow authenticated users to read/list objects in brand-library
drop policy if exists "brand_library_read_auth" on storage.objects;
create policy "brand_library_read_auth"
on storage.objects
for select
to authenticated
using (bucket_id = 'brand-library');

-- Allow only admin_users to upload to brand-library
drop policy if exists "brand_library_insert_admin" on storage.objects;
create policy "brand_library_insert_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'brand-library'
  and exists (select 1 from public.admin_users au where au.user_id = auth.uid())
);

-- No delete/update policies -> not allowed

