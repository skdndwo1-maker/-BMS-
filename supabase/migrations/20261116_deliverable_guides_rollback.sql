-- Rollback for 20261116_deliverable_guides.sql
-- Drops only objects introduced by that migration. Does not touch other tables' data
-- except removing the three nullable columns added to runs.

drop function if exists public.rollback_deliverable_guide(uuid, uuid, text);
drop function if exists public.publish_deliverable_guide(uuid);

drop table if exists public.run_rule_verdicts;

drop index if exists public.runs_deliverable_created_at_idx;

alter table public.runs drop column if exists deliverable_guide_id;
alter table public.runs drop column if exists common_guide_id;
alter table public.runs drop column if exists deliverable_id;

drop table if exists public.deliverable_guides;
drop table if exists public.deliverable_templates;
drop table if exists public.deliverables;
