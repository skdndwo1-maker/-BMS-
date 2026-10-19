create table if not exists public.run_layout_reviews (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  check_type text not null,
  ai_judgment text null,
  human_judgment text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint run_layout_reviews_check_type_check
    check (check_type in (
      'overall_margin', 'element_spacing', 'corner_safe_zone', 'grid_alignment'
    )),
  constraint run_layout_reviews_ai_judgment_check
    check (ai_judgment is null or ai_judgment in ('pass', 'fail', 'review', 'unknown')),
  constraint run_layout_reviews_human_judgment_check
    check (human_judgment is null or human_judgment in ('approved', 'rejected', 'pending'))
);

create index if not exists run_layout_reviews_run_id_idx
  on public.run_layout_reviews (run_id);

create unique index if not exists run_layout_reviews_run_check_uniq
  on public.run_layout_reviews (run_id, check_type);
