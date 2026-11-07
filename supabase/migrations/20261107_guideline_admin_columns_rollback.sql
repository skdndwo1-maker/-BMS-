-- Rollback for 20261107_guideline_admin_columns.sql (drops admin edit metadata and supplement bodies).
alter table public.rag_sources drop column if exists created_by;
alter table public.rag_sources drop column if exists body;
alter table public.guideline_summaries drop column if exists edited_by;
alter table public.guideline_summaries drop column if exists edited_at;
