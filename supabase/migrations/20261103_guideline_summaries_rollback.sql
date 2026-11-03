-- Rollback for 20261103_guideline_summaries.sql
-- Does not delete other tables or data outside guideline_summaries.

drop table if exists public.guideline_summaries;
