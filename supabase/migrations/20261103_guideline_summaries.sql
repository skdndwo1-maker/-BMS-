-- Cached AI summaries for guideline PDFs/text (inspection path).
-- Existing tables unchanged. Apply in Supabase SQL Editor.
--
-- service_role bypasses RLS (Express). anon/authenticated: deny by default (no policies).

create table if not exists public.guideline_summaries (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  checksum text not null,
  summary text not null,
  model text null,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  constraint guideline_summaries_source_checksum_uniq unique (source_key, checksum)
);

create index if not exists guideline_summaries_source_key_idx
  on public.guideline_summaries (source_key);

comment on table public.guideline_summaries is
  'Cached Gemini guideline summaries keyed by source_key + sha256(source_text + prompt_version).';

alter table public.guideline_summaries enable row level security;
