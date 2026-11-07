import {
  FIXED_GUIDELINE_SOURCES,
  ensureFixedGuidelineSlotAsync,
} from "./fixedGuidelines.js";
import { loadGuidelineExtractWithMeta } from "./guidelineExtractCache.js";
import { embedTextWithGemini } from "./geminiEmbeddings.js";
import {
  deleteChunksForSource,
  insertChunksWithEmbeddings,
  isSupabaseRagEnabled,
  splitIntoChunks,
  upsertGuidelineSource,
} from "./rag.js";
import { getGuideline } from "./store.js";
import { getSupabaseServiceClient } from "./supabase.js";

export const GUIDELINE_RAG_SLOT_IDS = [
  "design-editor-brand-guideline",
  "uplus-vi-guideline",
  "simply-uplus-guideline",
  "uplus-company-brand-2026",
] as const;

export type GuidelineRagSlotId = (typeof GUIDELINE_RAG_SLOT_IDS)[number];

const CHUNK_CHARS = 1200;
const CHUNK_OVERLAP = 160;

/** insertChunksWithEmbeddings inter-chunk delay + typical embed latency */
const EST_MS_PER_EMBED = 700;

export type GuidelineRagPlan = {
  slotId: string;
  title: string;
  checksum: string | null;
  charCount: number;
  chunkCount: number;
  embedCalls: number;
  estMs: number;
  skipReason: string | null;
  /** same checksum already indexed */
  alreadyIndexed: boolean;
  text: string;
  storedRelativePath: string | null;
  mimeType: string | null;
};

export type GuidelineRagIndexResult = {
  slotId: string;
  ok: boolean;
  skipped: boolean;
  skipReason: string | null;
  sourceId: string | null;
  chunkCount: number;
  embedded: number;
  inserted: number;
  failed: number;
  error: string | null;
};

async function findPdfAutoSource(
  guidelineId: string
): Promise<{ id: string; checksum: string | null; title: string } | null> {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb
    .from("rag_sources")
    .select("id, checksum, title")
    .eq("type", "guideline")
    .eq("origin", "pdf_auto")
    .eq("guideline_id", guidelineId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    console.warn("[guideline_rag] find source failed:", error.message);
    return null;
  }
  const row = data?.[0];
  if (!row?.id) return null;
  return {
    id: row.id as string,
    checksum: typeof row.checksum === "string" ? row.checksum : null,
    title: typeof row.title === "string" ? row.title : guidelineId,
  };
}

async function countChunksAndEmbeddings(sourceId: string): Promise<{ chunks: number; embeddings: number }> {
  const sb = getSupabaseServiceClient();
  const { count: chunkCount, error: cErr } = await sb
    .from("rag_chunks")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId);
  if (cErr) console.warn("[guideline_rag] chunk count failed:", cErr.message);

  const { data: chunkRows, error: idsErr } = await sb.from("rag_chunks").select("id").eq("source_id", sourceId);
  if (idsErr) {
    console.warn("[guideline_rag] chunk ids failed:", idsErr.message);
    return { chunks: chunkCount ?? 0, embeddings: 0 };
  }
  const ids = (chunkRows ?? []).map((r) => r.id as string);
  if (ids.length === 0) return { chunks: chunkCount ?? 0, embeddings: 0 };

  const { count: embCount, error: eErr } = await sb
    .from("rag_embeddings")
    .select("id", { count: "exact", head: true })
    .in("chunk_id", ids);
  if (eErr) console.warn("[guideline_rag] embedding count failed:", eErr.message);

  return { chunks: chunkCount ?? ids.length, embeddings: embCount ?? 0 };
}

/**
 * Resolve extract text + checksum for a slot (read-only: does not write extracts).
 * Prefers local PDF text in memory, else latest DB extract.
 */
export async function planGuidelineRagIndex(slotId: string): Promise<GuidelineRagPlan> {
  const title =
    getGuideline(slotId)?.displayName ??
    FIXED_GUIDELINE_SOURCES[slotId]?.displayName ??
    slotId;

  try {
    await ensureFixedGuidelineSlotAsync(slotId);
  } catch {
    /* continue — extracts-only path may still work */
  }

  const meta = await loadGuidelineExtractWithMeta(slotId, { persistExtract: false });
  if (!meta.text.trim()) {
    return {
      slotId,
      title,
      checksum: null,
      charCount: 0,
      chunkCount: 0,
      embedCalls: 0,
      estMs: 0,
      skipReason:
        "no extract text (local PDF missing and no guideline_extracts row)",
      alreadyIndexed: false,
      text: "",
      storedRelativePath: meta.storedRelativePath,
      mimeType: meta.mimeType,
    };
  }

  const chunks = splitIntoChunks(meta.text, { chunkChars: CHUNK_CHARS, overlapChars: CHUNK_OVERLAP });
  let alreadyIndexed = false;
  if (meta.checksum && isSupabaseRagEnabled()) {
    const existing = await findPdfAutoSource(slotId);
    if (existing?.checksum && existing.checksum === meta.checksum) {
      const counts = await countChunksAndEmbeddings(existing.id);
      if (counts.chunks > 0 && counts.embeddings > 0) {
        alreadyIndexed = true;
      }
    }
  }

  return {
    slotId,
    title,
    checksum: meta.checksum,
    charCount: meta.text.length,
    chunkCount: chunks.length,
    embedCalls: alreadyIndexed ? 0 : chunks.length,
    estMs: alreadyIndexed ? 0 : chunks.length * EST_MS_PER_EMBED,
    skipReason: alreadyIndexed ? "same checksum already indexed (pdf_auto)" : null,
    alreadyIndexed,
    text: meta.text,
    storedRelativePath: meta.storedRelativePath,
    mimeType: meta.mimeType,
  };
}

/**
 * Index one guideline slot from extract/PDF into rag_sources (type=guideline, origin=pdf_auto).
 * Does not touch human_supplement sources.
 */
export async function indexGuidelineFromExtract(
  slotId: string,
  opts?: { force?: boolean }
): Promise<GuidelineRagIndexResult> {
  if (!isSupabaseRagEnabled()) {
    return {
      slotId,
      ok: false,
      skipped: true,
      skipReason: "Supabase RAG env missing",
      sourceId: null,
      chunkCount: 0,
      embedded: 0,
      inserted: 0,
      failed: 0,
      error: null,
    };
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return {
      slotId,
      ok: false,
      skipped: true,
      skipReason: "GEMINI_API_KEY unset",
      sourceId: null,
      chunkCount: 0,
      embedded: 0,
      inserted: 0,
      failed: 0,
      error: null,
    };
  }

  // Persist extracts when applying (local PDF → guideline_extracts).
  const meta = await loadGuidelineExtractWithMeta(slotId, { persistExtract: true });
  const title = meta.title;
  if (!meta.text.trim()) {
    return {
      slotId,
      ok: false,
      skipped: true,
      skipReason: "no extract text (local PDF missing and no guideline_extracts row)",
      sourceId: null,
      chunkCount: 0,
      embedded: 0,
      inserted: 0,
      failed: 0,
      error: null,
    };
  }

  const chunks = splitIntoChunks(meta.text, { chunkChars: CHUNK_CHARS, overlapChars: CHUNK_OVERLAP });
  if (!opts?.force && meta.checksum) {
    const existing = await findPdfAutoSource(slotId);
    if (existing?.checksum && existing.checksum === meta.checksum) {
      const counts = await countChunksAndEmbeddings(existing.id);
      if (counts.chunks > 0 && counts.embeddings > 0) {
        return {
          slotId,
          ok: true,
          skipped: true,
          skipReason: "same checksum already indexed (pdf_auto)",
          sourceId: existing.id,
          chunkCount: counts.chunks,
          embedded: counts.embeddings,
          inserted: 0,
          failed: 0,
          error: null,
        };
      }
    }
  }

  try {
    const src = await upsertGuidelineSource({
      guidelineId: slotId,
      title,
      storedRelativePath: meta.storedRelativePath,
      mimeType: meta.mimeType ?? "application/pdf",
      checksum: meta.checksum,
    });
    if (!src?.sourceId) {
      return {
        slotId,
        ok: false,
        skipped: false,
        skipReason: null,
        sourceId: null,
        chunkCount: chunks.length,
        embedded: 0,
        inserted: 0,
        failed: 0,
        error: "upsertGuidelineSource returned null",
      };
    }

    await deleteChunksForSource(src.sourceId);
    const result = await insertChunksWithEmbeddings({
      sourceId: src.sourceId,
      chunks,
      embeddingModel: "gemini-embedding-001",
      embed: (t) => embedTextWithGemini(t, { model: "gemini-embedding-001" }),
    });
    if (!result) {
      return {
        slotId,
        ok: false,
        skipped: false,
        skipReason: null,
        sourceId: src.sourceId,
        chunkCount: chunks.length,
        embedded: 0,
        inserted: 0,
        failed: 0,
        error: "insertChunksWithEmbeddings returned null",
      };
    }
    const counts = await countChunksAndEmbeddings(src.sourceId);
    return {
      slotId,
      ok: result.failed === 0 || result.embedded > 0,
      skipped: false,
      skipReason: null,
      sourceId: src.sourceId,
      chunkCount: counts.chunks,
      embedded: counts.embeddings,
      inserted: result.inserted,
      failed: result.failed,
      error: result.failed > 0 ? `embed_failed=${result.failed}` : null,
    };
  } catch (e) {
    return {
      slotId,
      ok: false,
      skipped: false,
      skipReason: null,
      sourceId: null,
      chunkCount: chunks.length,
      embedded: 0,
      inserted: 0,
      failed: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function formatEstDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `~${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `~${min}m ${rem}s`;
}
