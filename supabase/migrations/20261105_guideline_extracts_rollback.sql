-- Rollback for 20261105_guideline_extracts.sql
-- Does not delete other tables or data outside guideline_extracts.

drop table if exists public.guideline_extracts;
