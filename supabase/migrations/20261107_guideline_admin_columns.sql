-- Admin guideline viewer/editor (/admin/guidelines). Additive columns only; server-only tables keep RLS on with no policies.

-- Admin edits of cached AI summaries.
alter table public.guideline_summaries add column if not exists edited_at timestamptz null;
alter table public.guideline_summaries add column if not exists edited_by text null;

-- Full admin-authored text for origin=human_supplement sources (chunks overlap, so the original is kept here).
alter table public.rag_sources add column if not exists body text null;
alter table public.rag_sources add column if not exists created_by text null;
