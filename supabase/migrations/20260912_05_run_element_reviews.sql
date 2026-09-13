create table if not exists public.run_element_reviews (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  applies_to text not null,
  ai_judgment text null,
  human_judgment text null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),

  constraint run_element_reviews_applies_to_check
    check (applies_to in (
      'text', 'shape', 'image', 'icon', 'pictogram', 'logo', 'color',
      'badge_shape', 'badge_text_ratio', 'badge_padding'
    )),
  constraint run_element_reviews_ai_judgment_check
    check (ai_judgment is null or ai_judgment in ('pass', 'fail', 'review', 'unknown')),
  constraint run_element_reviews_human_judgment_check
    check (human_judgment is null or human_judgment in ('approved', 'rejected', 'pending'))
);

create index if not exists run_element_reviews_run_id_idx
  on public.run_element_reviews (run_id);

create unique index if not exists run_element_reviews_run_applies_uniq
  on public.run_element_reviews (run_id, applies_to);
