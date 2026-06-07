-- Per-user AI-generated illustration / pictogram assets (design editor)
create table if not exists public.user_generated_assets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  asset_type text not null check (asset_type in ('illustration', 'pictogram')),
  name text not null,
  generation_direction text not null default '',
  illustration_style text check (
    illustration_style is null or illustration_style in ('2d', '3d')
  ),
  svg_content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_generated_assets_user_type_idx
  on public.user_generated_assets (user_id, asset_type, created_at desc);

create or replace function public.user_generated_assets_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_generated_assets_updated_at on public.user_generated_assets;
create trigger user_generated_assets_updated_at
  before update on public.user_generated_assets
  for each row execute function public.user_generated_assets_set_updated_at();

alter table public.user_generated_assets enable row level security;

drop policy if exists "user_generated_assets: select own" on public.user_generated_assets;
create policy "user_generated_assets: select own" on public.user_generated_assets
for select
to authenticated
using (auth.uid()::text = user_id);

drop policy if exists "user_generated_assets: insert own" on public.user_generated_assets;
create policy "user_generated_assets: insert own" on public.user_generated_assets
for insert
to authenticated
with check (auth.uid()::text = user_id);

drop policy if exists "user_generated_assets: delete own" on public.user_generated_assets;
create policy "user_generated_assets: delete own" on public.user_generated_assets
for delete
to authenticated
using (auth.uid()::text = user_id);
