-- ===========================================================================
-- Brand Library: 누구나 목록 조회 가능 (브랜드 자산은 비공개 데이터가 아님)
-- 적용 방법: Supabase Dashboard → SQL Editor 에 그대로 붙여넣고 Run
-- ===========================================================================

-- library_assets: anon + authenticated 모두 SELECT 허용
drop policy if exists "library: select for authed" on public.library_assets;
drop policy if exists "library: select for all" on public.library_assets;
create policy "library: select for all" on public.library_assets
for select
to anon, authenticated
using ( true );

-- storage.objects 의 brand-library 버킷도 listing 허용 (이미 public이지만 명시)
drop policy if exists "library storage: read" on storage.objects;
create policy "library storage: read" on storage.objects
for select
to anon, authenticated
using ( bucket_id = 'brand-library' );
