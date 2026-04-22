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

export async function insertChunksWithEmbeddings(args: {
  sourceId: string;
  chunks: string[];
  embeddingModel?: string;
  embed: (text: string) => Promise<number[]>;
}): Promise<{ chunkCount: number } | null> {
  if (!isSupabaseRagEnabled()) return null;
  const sb = getSupabaseServiceClient();
  const model = args.embeddingModel ?? "text-embedding-004";

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
      console.error("[supabase] insert chunk failed:", chunkErr.message);
      continue;
    }

    const vec = await args.embed(content);
    const vecText = `[${vec.join(",")}]`;
    const { error: embErr } = await sb.rpc("insert_rag_embedding", {
      p_chunk_id: chunkRow.id,
      p_model: model,
      p_embedding: vecText,
    });
    if (embErr) {
      console.error("[supabase] insert embedding failed:", embErr.message);
    }
  }

  return { chunkCount: args.chunks.length };
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

