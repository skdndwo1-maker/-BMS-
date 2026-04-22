-- Fix: reliably insert vector embeddings via RPC (casts inside DB).
-- Apply in Supabase SQL editor once.

create or replace function public.insert_rag_embedding(
  p_chunk_id uuid,
  p_model text,
  p_embedding text
)
returns void
language plpgsql
as $$
begin
  insert into public.rag_embeddings (chunk_id, model, embedding)
  values (
    p_chunk_id,
    coalesce(nullif(trim(p_model), ''), 'text-embedding-004'),
    (p_embedding::vector(768))
  )
  on conflict (chunk_id) do update
    set model = excluded.model,
        embedding = excluded.embedding;
end;
$$;

