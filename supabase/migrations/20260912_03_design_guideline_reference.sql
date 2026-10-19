create table if not exists public.design_guideline_reference (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs (id) on delete cascade,
  guideline_id text not null references public.guidelines (id) on delete restrict,
  applies_to text not null,
  context text null,
  created_at timestamptz not null default now(),

  constraint design_guideline_reference_applies_to_check
    check (applies_to in (
      'text', 'shape', 'image', 'icon', 'pictogram', 'logo', 'color',
      'badge_shape', 'badge_text_ratio', 'badge_padding'
    ))
);

create index if not exists design_guideline_reference_design_idx
  on public.design_guideline_reference (design_id);

create index if not exists design_guideline_reference_guideline_idx
  on public.design_guideline_reference (guideline_id);

create unique index if not exists design_guideline_reference_uniq
  on public.design_guideline_reference (design_id, guideline_id, applies_to, coalesce(context, ''));
