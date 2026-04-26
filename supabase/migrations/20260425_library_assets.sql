-- ===========================================================================
-- Brand Library: storage bucket + metadata table + RLS
-- 적용 방법: Supabase Dashboard → SQL Editor 에 그대로 붙여넣고 Run
-- 의존: 20260424_admin_users.sql (admin_users 테이블이 먼저 존재해야 함)
-- ===========================================================================

-- 0) Storage bucket (수동) ---------------------------------------------------
-- Supabase Dashboard → Storage → "New bucket"
--   이름: brand-library
--   Public bucket: ON  (다운로드용 공개 URL 사용)
--   Allowed MIME types: 비워두면 모든 형식 허용 (PDF, AI, PNG, JPEG, SVG, PSD,
--                       Excel, PPT 등)
-- 폴더 (자동 생성됨):
--   logo / slogan / icon / pictogram / image / template / font / guide

-- 1) 메타데이터 테이블 -------------------------------------------------------
create table if not exists public.library_assets (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in
    ('logo','slogan','icon','pictogram','image','template','font','guide')),
  name text not null,
  description text not null default '',
  tags text[] not null default '{}',
  formats text[] not null default '{}',
  file_path text not null,
  file_name text not null default '',
  file_size bigint not null default 0,
  mime_type text not null default '',
  thumbnail_path text not null default '',
  downloads int not null default 0,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_assets_category_idx
  on public.library_assets (category);
create index if not exists library_assets_created_at_idx
  on public.library_assets (created_at desc);
create unique index if not exists library_assets_file_path_uniq
  on public.library_assets (file_path);

-- updated_at 자동 갱신 트리거
create or replace function public.library_assets_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists library_assets_updated_at on public.library_assets;
create trigger library_assets_updated_at
  before update on public.library_assets
  for each row execute function public.library_assets_set_updated_at();

-- 2) RLS ---------------------------------------------------------------------
alter table public.library_assets enable row level security;

drop policy if exists "library: select for authed" on public.library_assets;
create policy "library: select for authed" on public.library_assets
for select
to authenticated
using ( true );

drop policy if exists "library: admin insert" on public.library_assets;
create policy "library: admin insert" on public.library_assets
for insert
to authenticated
with check (
  exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

drop policy if exists "library: admin update" on public.library_assets;
create policy "library: admin update" on public.library_assets
for update
to authenticated
using (
  exists (select 1 from public.admin_users a where a.user_id = auth.uid())
)
with check (
  exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

drop policy if exists "library: admin delete" on public.library_assets;
create policy "library: admin delete" on public.library_assets
for delete
to authenticated
using (
  exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

-- 3) 다운로드 카운터 RPC ----------------------------------------------------
create or replace function public.library_increment_downloads(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.library_assets
     set downloads = downloads + 1
   where id = p_id;
end;
$$;

revoke all on function public.library_increment_downloads(uuid) from public;
grant execute on function public.library_increment_downloads(uuid) to authenticated;

-- 4) Storage 정책 ----------------------------------------------------------
-- bucket_id = 'brand-library' 객체에 한해
--   읽기: 누구나 (Public bucket이므로 안전망)
--   쓰기/수정/삭제: admin_users 만

drop policy if exists "library storage: read" on storage.objects;
create policy "library storage: read" on storage.objects
for select
using ( bucket_id = 'brand-library' );

drop policy if exists "library storage: admin write" on storage.objects;
create policy "library storage: admin write" on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'brand-library'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

drop policy if exists "library storage: admin update" on storage.objects;
create policy "library storage: admin update" on storage.objects
for update
to authenticated
using (
  bucket_id = 'brand-library'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
)
with check (
  bucket_id = 'brand-library'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

drop policy if exists "library storage: admin delete" on storage.objects;
create policy "library storage: admin delete" on storage.objects
for delete
to authenticated
using (
  bucket_id = 'brand-library'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);
