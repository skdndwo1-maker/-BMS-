-- AI-generated raster images for design editor (separate from SVG illust/pictogram)
alter table public.user_generated_assets
  alter column svg_content drop not null;

alter table public.user_generated_assets
  add column if not exists image_mime text,
  add column if not exists image_content text;

alter table public.user_generated_assets
  drop constraint if exists user_generated_assets_asset_type_check;

alter table public.user_generated_assets
  add constraint user_generated_assets_asset_type_check
  check (asset_type in ('illustration', 'pictogram', 'image'));

alter table public.user_generated_assets
  drop constraint if exists user_generated_assets_content_check;

alter table public.user_generated_assets
  add constraint user_generated_assets_content_check
  check (
    (asset_type in ('illustration', 'pictogram') and svg_content is not null)
    or (asset_type = 'image' and image_content is not null and image_mime is not null)
  );
