-- Rollback for 20261107_saved_results.sql (drops saved rows — run only if intentionally reverting).
drop table if exists public.saved_inspections;
drop table if exists public.saved_namings;
