alter table public.rag_sources
  add column if not exists origin text not null default 'pdf_auto';

alter table public.rag_sources
  drop constraint if exists rag_sources_origin_check;

alter table public.rag_sources
  add constraint rag_sources_origin_check
  check (origin in ('pdf_auto', 'human_supplement'));

create index if not exists rag_sources_guideline_origin_idx
  on public.rag_sources (guideline_id, origin)
  where status = 'active';

comment on column public.rag_sources.origin is
  'pdf_auto: derived from guideline PDF; subject to checksum-based re-index/cache invalidation. '
  'human_supplement: admin-added; must NOT be auto-deleted or re-embedded when the PDF changes.';

-- ── Cache invalidation policy (application layer) ──
-- When a guideline PDF checksum changes:
--   1) Re-chunk/re-embed ONLY rag_sources where origin = 'pdf_auto' AND type = 'guideline'.
--   2) Leave origin = 'human_supplement' rows untouched (status, chunks, embeddings).
--   3) Optionally archive superseded pdf_auto rows instead of hard delete.
--
-- TODO(admin-notify): On PDF update, query human_supplement sources for the same guideline_id:
--   SELECT id, title, created_at FROM rag_sources
--   WHERE guideline_id = :gid AND origin = 'human_supplement' AND status = 'active';
--   Surface this list to admins (dashboard banner / email / Slack) so they can manually
--   reconcile supplemental docs against the new PDF. Notification delivery NOT implemented yet.
