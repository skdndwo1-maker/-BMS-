-- Canonical guideline registry (replaces JSON meta as source of truth over time).
create table if not exists public.guidelines (
  id text primary key,
  type text not null,
  title text not null,
  pdf_path text not null,
  checksum text null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guidelines_type_check
    check (type in ('vi', 'naming', 'simply'))
);

create index if not exists guidelines_type_idx on public.guidelines (type);
create index if not exists guidelines_updated_at_idx on public.guidelines (updated_at desc);

comment on table public.guidelines is
  'Brand/VI/Simply PDF slots; id aligns with runs.guideline_id and rag_sources.guideline_id.';
