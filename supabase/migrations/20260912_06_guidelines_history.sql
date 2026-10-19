create table if not exists public.guidelines_history (
  id uuid primary key default gen_random_uuid(),
  guideline_id text not null references public.guidelines (id) on delete cascade,
  version int not null,
  changed_at timestamptz not null default now(),
  change_reason text null,

  constraint guidelines_history_guideline_version_uniq
    unique (guideline_id, version)
);

create index if not exists guidelines_history_guideline_idx
  on public.guidelines_history (guideline_id, changed_at desc);
