-- PostgREST embed: runs → guidelines (left join on guideline_id).
-- Some legacy rows store comma-separated ids; those rows won't match a single guidelines row (embed null).
alter table public.runs
  drop constraint if exists runs_guideline_id_fkey;

alter table public.runs
  add constraint runs_guideline_id_fkey
  foreign key (guideline_id) references public.guidelines (id)
  on delete set null
  not valid;
