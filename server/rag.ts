import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { getSupabaseServiceClient } from "./supabase.js";

type RagMatch = {
  chunk_id: string;
  source_id: string;
  source_title: string;
  guideline_id: string | null;
  content: string;
  similarity: number;
};

export function isSupabaseRagEnabled(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function splitIntoChunks(text: string, opts?: { chunkChars?: number; overlapChars?: number }): string[] {
  const chunkChars = Math.max(300, Math.min(3000, opts?.chunkChars ?? 1200));
  const overlapChars = Math.max(0, Math.min(chunkChars - 50, opts?.overlapChars ?? 160));
  const t = text.replace(/\r/g, "").trim();
  if (!t) return [];

  const chunks: string[] = [];
  let i = 0;
  while (i < t.length) {
    const end = Math.min(t.length, i + chunkChars);
    const slice = t.slice(i, end).trim();
    if (slice) chunks.push(slice);
    if (end >= t.length) break;
    i = Math.max(end - overlapChars, i + 1);
  }
  return chunks;
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function upsertGuidelineSource(args: {
  guidelineId: string;
  title: string;
  storedRelativePath: string | null;
  mimeType: string | null;
  checksum: string | null;
}): Promise<{ sourceId: string } | null> {
  if (!isSupabaseRagEnabled()) return null;
  const sb = getSupabaseServiceClient();

  // Upsert by (type,guideline_id,title) via a select-first approach (no unique constraint assumed)
  const { data: existing, error: exErr } = await sb
    .from("rag_sources")
    .select("id")
    .eq("type", "guideline")
    .eq("guideline_id", args.guidelineId)
    .eq("title", args.title)
    .limit(1);
  if (exErr) {
    console.error("[supabase] upsertGuidelineSource select failed:", exErr.message);
    return null;
  }
  const nowIso = new Date().toISOString();
  if (existing && existing.length > 0) {
    const id = existing[0].id as string;
    const { error } = await sb
      .from("rag_sources")
      .update({
        stored_relative_path: args.storedRelativePath,
        mime_type: args.mimeType,
        checksum: args.checksum,
        updated_at: nowIso,
        status: "active",
      })
      .eq("id", id);
    if (error) console.error("[supabase] upsertGuidelineSource update failed:", error.message);
    return { sourceId: id };
  }

  const { data, error } = await sb
    .from("rag_sources")
    .insert({
      type: "guideline",
      title: args.title,
      guideline_id: args.guidelineId,
      stored_relative_path: args.storedRelativePath,
      mime_type: args.mimeType,
      checksum: args.checksum,
      updated_at: nowIso,
      status: "active",
    })
    .select("id")
    .single();
  if (error) {
    console.error("[supabase] upsertGuidelineSource insert failed:", error.message);
    return null;
  }
  return { sourceId: data.id as string };
}

export async function upsertRunQaSource(args: {
  runId: string;
  title: string;
  guidelineId?: string | null;
}): Promise<{ sourceId: string } | null> {
  if (!isSupabaseRagEnabled()) return null;
  const sb = getSupabaseServiceClient();
  const { data: existing, error: exErr } = await sb
    .from("rag_sources")
    .select("id")
    .eq("type", "run_qa")
    .eq("run_id", args.runId)
    .limit(1);
  if (exErr) {
    console.error("[supabase] upsertRunQaSource select failed:", exErr.message);
    return null;
  }
  const nowIso = new Date().toISOString();
  if (existing && existing.length > 0) {
    const id = existing[0].id as string;
    const { error } = await sb
      .from("rag_sources")
      .update({
        title: args.title,
        guideline_id: args.guidelineId ?? null,
        updated_at: nowIso,
        status: "active",
      })
      .eq("id", id);
    if (error) console.error("[supabase] upsertRunQaSource update failed:", error.message);
    return { sourceId: id };
  }

  const { data, error } = await sb
    .from("rag_sources")
    .insert({
      type: "run_qa",
      title: args.title,
      run_id: args.runId,
      guideline_id: args.guidelineId ?? null,
      updated_at: nowIso,
      status: "active",
    })
    .select("id")
    .single();
  if (error) {
    console.error("[supabase] upsertRunQaSource insert failed:", error.message);
    return null;
  }
  return { sourceId: data.id as string };
}

export async function deleteChunksForSource(sourceId: string): Promise<void> {
  if (!isSupabaseRagEnabled()) return;
  const sb = getSupabaseServiceClient();
  const { error } = await sb.from("rag_chunks").delete().eq("source_id", sourceId);
  if (error) console.error("[supabase] deleteChunksForSource failed:", error.message);
}

/** `public.rag_embeddings.embedding` is `vector(768)` in migrations. We force outputDimensionality=768 in geminiEmbeddings. */
const RAG_EMBEDDING_VECTOR_DIM = 768;

export async function insertChunksWithEmbeddings(args: {
  sourceId: string;
  chunks: string[];
  embeddingModel?: string;
  embed: (text: string) => Promise<number[]>;
  /** Must match DB `vector(N)`. Default 768. */
  expectedVectorDimensions?: number;
}): Promise<{ chunkCount: number; embeddedCount: number } | null> {
  if (!isSupabaseRagEnabled()) return null;
  const sb = getSupabaseServiceClient();
  const embeddingModel = args.embeddingModel ?? "gemini-embedding-001";
  const expectedDim = args.expectedVectorDimensions ?? RAG_EMBEDDING_VECTOR_DIM;
  let embeddedCount = 0;

  for (let idx = 0; idx < args.chunks.length; idx++) {
    const content = args.chunks[idx];
    const contentHash = sha256Hex(content);
    const { data: chunkRow, error: chunkErr } = await sb
      .from("rag_chunks")
      .insert({
        source_id: args.sourceId,
        chunk_index: idx,
        content,
        content_hash: contentHash,
        meta: {},
      })
      .select("id")
      .single();
    if (chunkErr) {
      console.error(
        `[RAG] rag_chunks insert failed | sourceId=${args.sourceId} chunkIndex=${idx} | ${chunkErr.message}`
      );
      continue;
    }
    if (!chunkRow?.id) continue;

    let vec: number[];
    try {
      vec = await args.embed(content);
      console.log(
        `[RAG] embed() ok | sourceId=${args.sourceId} chunkIndex=${idx} model=${embeddingModel} | vec.length=${Array.isArray(vec) ? vec.length : "(not array)"}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[RAG] embed() failed | sourceId=${args.sourceId} chunkId=${chunkRow.id} chunkIndex=${idx} model=${embeddingModel} | ${msg}`
      );
      continue;
    }

    if (!Array.isArray(vec)) {
      console.error(
        `[RAG] invalid embedding: not a number[] | sourceId=${args.sourceId} chunkId=${chunkRow.id} chunkIndex=${idx} model=${embeddingModel} | typeof=${typeof vec}`
      );
      continue;
    }
    if (vec.length !== expectedDim) {
      console.error(
        `[RAG] embedding dimension mismatch | sourceId=${args.sourceId} chunkId=${chunkRow.id} chunkIndex=${idx} model=${embeddingModel} | expected=${expectedDim} (DB rag_embeddings is vector(${expectedDim})) | got.length=${vec.length} — use a 768-dim model or change DB/RPC/expectedVectorDimensions`
      );
      continue;
    }

    const vecText = `[${vec.join(",")}]`;
    const ok = await upsertEmbeddingForChunk({
      sb,
      sourceId: args.sourceId,
      chunkId: chunkRow.id as string,
      chunkIndex: idx,
      model: embeddingModel,
      vecText,
      vecLength: vec.length,
    });
    if (ok) embeddedCount += 1;
  }

  const n = args.chunks.length;
  if (n > 0 && embeddedCount < n) {
    console.error(
      `[RAG] insertChunksWithEmbeddings incomplete | sourceId=${args.sourceId} | embeddedCount=${embeddedCount}/${n} (missing=${n - embeddedCount})`
    );
  }
  return { chunkCount: n, embeddedCount };
}

type SupabaseClientLike = ReturnType<typeof getSupabaseServiceClient>;

/** Insert embedding via RPC; on failure fall back to direct table insert (service role client bypasses RLS). */
async function upsertEmbeddingForChunk(args: {
  sb: SupabaseClientLike;
  sourceId: string;
  chunkId: string;
  chunkIndex: number;
  model: string;
  vecText: string;
  vecLength: number;
}): Promise<boolean> {
  const { sb, sourceId, chunkId, chunkIndex, model, vecText, vecLength } = args;
  const { error: rpcErr } = await sb.rpc("insert_rag_embedding", {
    p_chunk_id: chunkId,
    p_model: model,
    p_embedding: vecText,
  });
  if (!rpcErr) return true;

  const p = rpcErr as { message?: string; code?: string; details?: string; hint?: string };
  const parts = [
    `[RAG] insert_rag_embedding RPC failed`,
    `sourceId=${sourceId}`,
    `chunkId=${chunkId}`,
    `chunkIndex=${chunkIndex}`,
    `model=${model}`,
    `vec.length=${vecLength}`,
    `vecText.length=${vecText.length}`,
    `message=${p.message ?? "(no message)"}`,
  ];
  if (p.code) parts.push(`code=${p.code}`);
  if (p.details) parts.push(`details=${p.details}`);
  if (p.hint) parts.push(`hint=${p.hint}`);
  console.error(parts.join(" | "));

  console.warn(`[RAG] falling back to direct insert into rag_embeddings | chunkId=${chunkId}`);
  const { error: delErr } = await sb.from("rag_embeddings").delete().eq("chunk_id", chunkId);
  if (delErr) {
    console.error(
      `[RAG] direct insert: cleanup existing failed | chunkId=${chunkId} | ${delErr.message}`
    );
  }
  const { error: insErr } = await sb.from("rag_embeddings").insert({
    chunk_id: chunkId,
    model,
    embedding: vecText,
  });
  if (insErr) {
    const ip = insErr as { message?: string; code?: string; details?: string; hint?: string };
    console.error(
      [
        `[RAG] direct insert into rag_embeddings failed`,
        `sourceId=${sourceId}`,
        `chunkId=${chunkId}`,
        `chunkIndex=${chunkIndex}`,
        `model=${model}`,
        `vec.length=${vecLength}`,
        `message=${ip.message ?? "(no message)"}`,
        ip.code ? `code=${ip.code}` : null,
        ip.details ? `details=${ip.details}` : null,
        ip.hint ? `hint=${ip.hint}` : null,
      ]
        .filter(Boolean)
        .join(" | ")
    );
    return false;
  }
  return true;
}

/** Find chunks with no embedding row and embed them (used by backfill). */
export async function backfillMissingEmbeddings(args: {
  embed: (text: string) => Promise<number[]>;
  embeddingModel?: string;
  expectedVectorDimensions?: number;
  limit?: number;
}): Promise<{ scanned: number; embedded: number; failed: number }> {
  if (!isSupabaseRagEnabled()) return { scanned: 0, embedded: 0, failed: 0 };
  const sb = getSupabaseServiceClient();
  const embeddingModel = args.embeddingModel ?? "gemini-embedding-001";
  const expectedDim = args.expectedVectorDimensions ?? 768;
  const limit = Math.max(1, Math.min(2000, args.limit ?? 500));

  const { data: existing, error: existingErr } = await sb
    .from("rag_embeddings")
    .select("chunk_id")
    .limit(100000);
  if (existingErr) {
    console.error(`[RAG] backfill: load existing failed | ${existingErr.message}`);
    return { scanned: 0, embedded: 0, failed: 0 };
  }
  const have = new Set<string>();
  for (const row of (existing ?? []) as Array<{ chunk_id: string }>) have.add(row.chunk_id);

  const { data: chunks, error: chunksErr } = await sb
    .from("rag_chunks")
    .select("id, source_id, chunk_index, content")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (chunksErr) {
    console.error(`[RAG] backfill: load chunks failed | ${chunksErr.message}`);
    return { scanned: 0, embedded: 0, failed: 0 };
  }

  let scanned = 0;
  let embedded = 0;
  let failed = 0;
  for (const c of (chunks ?? []) as Array<{ id: string; source_id: string; chunk_index: number; content: string }>) {
    if (have.has(c.id)) continue;
    scanned += 1;
    let vec: number[];
    try {
      vec = await args.embed(c.content);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[RAG] backfill: embed() failed | chunkId=${c.id} | ${msg}`);
      failed += 1;
      continue;
    }
    if (!Array.isArray(vec) || vec.length !== expectedDim) {
      console.error(
        `[RAG] backfill: unexpected vec.length | chunkId=${c.id} | length=${Array.isArray(vec) ? vec.length : "(not array)"} expected=${expectedDim}`
      );
      failed += 1;
      continue;
    }
    const ok = await upsertEmbeddingForChunk({
      sb,
      sourceId: c.source_id,
      chunkId: c.id,
      chunkIndex: c.chunk_index,
      model: embeddingModel,
      vecText: `[${vec.join(",")}]`,
      vecLength: vec.length,
    });
    if (ok) embedded += 1;
    else failed += 1;
  }
  console.log(`[RAG] backfill done | scanned=${scanned} embedded=${embedded} failed=${failed}`);
  return { scanned, embedded, failed };
}

export async function matchRagChunks(args: {
  queryEmbedding: number[];
  guidelineId?: string | null;
  sourceType?: string | null;
  topK?: number;
}): Promise<RagMatch[]> {
  if (!isSupabaseRagEnabled()) return [];
  const sb = getSupabaseServiceClient();
  const vecText = `[${args.queryEmbedding.join(",")}]`;
  const { data, error } = await sb.rpc("match_rag_chunks", {
    query_embedding: vecText,
    match_count: args.topK ?? 8,
    filter_guideline_id: args.guidelineId ?? null,
    filter_source_type: args.sourceType ?? null,
    filter_status: "active",
  });
  if (error) {
    console.error("[supabase] matchRagChunks failed:", error.message);
    return [];
  }
  return (data ?? []) as RagMatch[];
}

export function fileSha256Hex(absPath: string): string | null {
  try {
    const buf = readFileSync(absPath);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

