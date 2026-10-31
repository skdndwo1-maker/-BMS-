-- Lock server-only tables: enable RLS with NO policies.
-- Effect: anon / authenticated cannot read or write via PostgREST.
-- service_role bypasses RLS (Express API / outbox relay unchanged).
--
-- Frontend supabase.from(...) usage (do NOT touch these):
--   designs, library_assets, admin_users, user_generated_assets
--   (+ storage bucket brand-library; rpc is_current_user_admin)
--
-- Safe: no DROP COLUMN, no DELETE, no policy CREATE (deny-by-default).
--
-- ── ROLLBACK (수동) ──────────────────────────────────────────────────────────
-- alter table public.runs disable row level security;
-- alter table public.run_artifacts disable row level security;
-- alter table public.reviews disable row level security;
-- alter table public.rag_sources disable row level security;
-- alter table public.rag_chunks disable row level security;
-- alter table public.rag_embeddings disable row level security;
-- alter table public.guidelines disable row level security;
-- alter table public.guidelines_history disable row level security;
-- alter table public.run_layout_reviews disable row level security;
-- alter table public.run_element_reviews disable row level security;
-- alter table public.design_guideline_reference disable row level security;
-- alter table public.outbox_events disable row level security;
-- ────────────────────────────────────────────────────────────────────────────

alter table public.runs enable row level security;
alter table public.run_artifacts enable row level security;
alter table public.reviews enable row level security;
alter table public.rag_sources enable row level security;
alter table public.rag_chunks enable row level security;
alter table public.rag_embeddings enable row level security;
alter table public.guidelines enable row level security;
alter table public.guidelines_history enable row level security;
alter table public.run_layout_reviews enable row level security;
alter table public.run_element_reviews enable row level security;
alter table public.design_guideline_reference enable row level security;
alter table public.outbox_events enable row level security;

-- ── VERIFY ───────────────────────────────────────────────────────────────────
-- select c.relname, c.relrowsecurity
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname in (
--     'runs','run_artifacts','reviews','rag_sources','rag_chunks','rag_embeddings',
--     'guidelines','guidelines_history','run_layout_reviews','run_element_reviews',
--     'design_guideline_reference','outbox_events'
--   )
-- order by 1;
-- -- expect relrowsecurity = true for all
--
-- select schemaname, tablename, policyname
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in (
--     'runs','run_artifacts','reviews','rag_sources','rag_chunks','rag_embeddings',
--     'guidelines','guidelines_history','run_layout_reviews','run_element_reviews',
--     'design_guideline_reference','outbox_events'
--   );
-- -- expect 0 rows (no policies)
