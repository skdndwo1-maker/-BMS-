-- Initial schema for runs storage + RAG corpus + admin review workflow.
-- Apply in Supabase SQL editor (or via migrations) once per project.

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ─────────────────────────────────────────────────────────────────────────────
-- Core: runs (inspection/generation/audit executions) + artifacts
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- request identity
  source text not null default 'server',
  ip text null,
  user_agent text null,
  session_id text null,

  -- what happened
  type text not null, -- e.g. inspection, naming_generate, naming_audit, design_editor_inspection
  status text not null default 'pending_review', -- pending_review | approved | rejected

  guideline_id text null,
  template_id text null,
  media_type text null, -- online/offline

  -- structured IO payloads (store prompt inputs and model outputs)
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,

  -- optional searchable text (for admin and RAG reuse)
  input_text text null,
  output_text text null,

  -- scoring/metrics
  score numeric null,
  model text null,
  tokens_input int null,
  tokens_output int null,
  latency_ms int null
);

create index if not exists runs_created_at_idx on public.runs (created_at desc);
create index if not exists runs_type_idx on public.runs (type);
create index if not exists runs_status_idx on public.runs (status, created_at desc);

create table if not exists public.run_artifacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid not null references public.runs(id) on delete cascade,
  kind text not null, -- e.g. design_image, pdf_report, canvas_capture, prompt, json
  mime_type text null,
  url text null,
  data_json jsonb not null default '{}'::jsonb
);

create index if not exists run_artifacts_run_id_idx on public.run_artifacts (run_id, created_at desc);

-- Admin review decisions
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid not null references public.runs(id) on delete cascade,
  decision text not null, -- approved | rejected
  reason text null,
  reviewer text null
);

create index if not exists reviews_run_id_idx on public.reviews (run_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- RAG: sources -> chunks -> embeddings (vector)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rag_sources (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  type text not null, -- guideline | run_qa | external
  title text not null,
  guideline_id text null,
  run_id uuid null references public.runs(id) on delete set null,

  -- provenance
  stored_relative_path text null,
  mime_type text null,
  checksum text null,

  -- lifecycle
  status text not null default 'active' -- active | archived
);

create index if not exists rag_sources_type_idx on public.rag_sources (type, created_at desc);
create index if not exists rag_sources_guideline_id_idx on public.rag_sources (guideline_id);
create index if not exists rag_sources_run_id_idx on public.rag_sources (run_id);

create table if not exists public.rag_chunks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_id uuid not null references public.rag_sources(id) on delete cascade,
  chunk_index int not null,

  -- raw text
  content text not null,
  content_hash text not null,

  -- lightweight metadata
  page_start int null,
  page_end int null,
  meta jsonb not null default '{}'::jsonb
);

create unique index if not exists rag_chunks_source_chunk_idx on public.rag_chunks (source_id, chunk_index);
create index if not exists rag_chunks_source_id_idx on public.rag_chunks (source_id);
create index if not exists rag_chunks_content_hash_idx on public.rag_chunks (content_hash);

-- Gemini text-embedding-004 dimension is 768 (as of 2026). If you use another model, adjust the vector size.
create table if not exists public.rag_embeddings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  chunk_id uuid not null references public.rag_chunks(id) on delete cascade,
  model text not null default 'text-embedding-004',
  embedding vector(768) not null
);

create unique index if not exists rag_embeddings_chunk_id_uniq on public.rag_embeddings (chunk_id);
create index if not exists rag_embeddings_model_idx on public.rag_embeddings (model);
create index if not exists rag_embeddings_embedding_ivfflat
  on public.rag_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Vector search helper RPC
-- Pass `query_embedding` as a text-formatted vector, e.g. "[0.1,0.2,...]".
create or replace function public.match_rag_chunks(
  query_embedding text,
  match_count int default 8,
  filter_guideline_id text default null,
  filter_source_type text default null,
  filter_status text default 'active'
)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_title text,
  guideline_id text,
  content text,
  similarity float4
)
language sql
stable
as $$
  select
    c.id as chunk_id,
    s.id as source_id,
    s.title as source_title,
    s.guideline_id,
    c.content,
    1 - (e.embedding <=> (query_embedding::vector(768))) as similarity
  from public.rag_embeddings e
  join public.rag_chunks c on c.id = e.chunk_id
  join public.rag_sources s on s.id = c.source_id
  where s.status = filter_status
    and (filter_guideline_id is null or s.guideline_id = filter_guideline_id)
    and (filter_source_type is null or s.type = filter_source_type)
  order by e.embedding <=> (query_embedding::vector(768))
  limit match_count;
$$;

-- RLS is optional because server uses service role. Keep off by default.
-- If you later enable RLS, define appropriate policies for anon/auth users.

