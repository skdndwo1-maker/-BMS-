-- Cached PDF extracts for design/naming reference (not AI summaries).
-- Existing tables unchanged. Apply in Supabase SQL Editor.
--
-- service_role bypasses RLS (Express). anon/authenticated: deny by default (no policies).

create table if not exists public.guideline_extracts (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  file_checksum text not null,
  extract_text text not null,
  char_count int not null,
  created_at timestamptz not null default now(),
  constraint guideline_extracts_source_checksum_uniq unique (source_key, file_checksum)
);

create index if not exists guideline_extracts_source_key_idx
  on public.guideline_extracts (source_key, created_at desc);

comment on table public.guideline_extracts is
  'PDF text extracts keyed by source_key + sha256(file bytes). Used as model context when the file is missing on disk.';

alter table public.guideline_extracts enable row level security;
