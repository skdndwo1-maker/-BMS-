import { existsSync } from "node:fs";

import { FIXED_GUIDELINE_SOURCES } from "./fixedGuidelines.js";
import { embedTextWithGemini } from "./geminiEmbeddings.js";
import { extractGuidelineSummarySource, GUIDELINE_SUMMARY_PROMPT_VERSION } from "./gemini/guideline.js";
import { GUIDELINE_RAG_SLOT_IDS } from "./guidelineRagIndex.js";
import { checksumForGuidelineSummarySource } from "./guidelineSummaryCache.js";
import { insertChunksWithEmbeddings, sha256Hex, splitIntoChunks } from "./rag.js";
import { getGuideline, resolveStoredPath, setGuideline } from "./store.js";
import { getSupabaseServiceClient } from "./supabase.js";

const SUPPLEMENT_CHUNK_CHARS = 1200;
const SUPPLEMENT_CHUNK_OVERLAP = 160;
const SUPPLEMENT_MAX_CHARS = 40_000;

export function isGuidelineAdminSlot(slotId: string): boolean {
  return (GUIDELINE_RAG_SLOT_IDS as readonly string[]).includes(slotId);
}

function slotTitle(slotId: string): string {
  return getGuideline(slotId)?.displayName ?? FIXED_GUIDELINE_SOURCES[slotId]?.displayName ?? slotId;
}

export type GuidelineAdminSlotOverview = {
  slotId: string;
  title: string;
  extract: { charCount: number; fileChecksum: string | null; createdAt: string | null } | null;
  summary: { charCount: number; createdAt: string | null; editedAt: string | null } | null;
  pdfAuto: { sourceId: string; checksum: string | null; chunkCount: number; updatedAt: string | null } | null;
  supplementCount: number;
};

export type GuidelineSummaryRow = {
  id: string;
  checksum: string;
  summary: string;
  model: string | null;
  promptVersion: string;
  createdAt: string;
  editedAt: string | null;
  editedBy: string | null;
};

export type GuidelineSupplement = {
  sourceId: string;
  title: string;
  body: string;
  status: string;
  chunkCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GuidelineAdminDetail = {
  slotId: string;
  title: string;
  extract: { text: string; charCount: number; fileChecksum: string | null; createdAt: string | null } | null;
  localSummary: string | null;
  summaries: GuidelineSummaryRow[];
  pdfAuto: {
    sourceId: string;
    checksum: string | null;
    updatedAt: string | null;
    chunks: { chunkIndex: number; content: string }[];
  } | null;
  supplements: GuidelineSupplement[];
};

async function latestExtractRow(slotId: string, withText: boolean) {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb
    .from("guideline_extracts")
    .select(withText ? "extract_text, char_count, file_checksum, created_at" : "char_count, file_checksum, created_at")
    .eq("source_key", slotId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`guideline_extracts: ${error.message}`);
  return (data ?? null) as {
    extract_text?: string;
    char_count: number | null;
    file_checksum: string | null;
    created_at: string | null;
  } | null;
}

async function listSummaryRows(slotId: string, limit: number): Promise<GuidelineSummaryRow[]> {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb
    .from("guideline_summaries")
    .select("id, checksum, summary, model, prompt_version, created_at, edited_at, edited_by")
    .eq("source_key", slotId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`guideline_summaries: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    checksum: String(r.checksum),
    summary: String(r.summary ?? ""),
    model: typeof r.model === "string" ? r.model : null,
    promptVersion: String(r.prompt_version ?? ""),
    createdAt: String(r.created_at),
    editedAt: typeof r.edited_at === "string" ? r.edited_at : null,
    editedBy: typeof r.edited_by === "string" ? r.edited_by : null,
  }));
}

async function findPdfAutoSourceRow(slotId: string) {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb
    .from("rag_sources")
    .select("id, checksum, updated_at")
    .eq("type", "guideline")
    .eq("origin", "pdf_auto")
    .eq("guideline_id", slotId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`rag_sources: ${error.message}`);
  return (data ?? null) as { id: string; checksum: string | null; updated_at: string | null } | null;
}

async function countChunks(sourceId: string): Promise<number> {
  const sb = getSupabaseServiceClient();
  const { count, error } = await sb
    .from("rag_chunks")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId);
  if (error) throw new Error(`rag_chunks: ${error.message}`);
  return count ?? 0;
}

export async function listGuidelineAdminOverview(): Promise<GuidelineAdminSlotOverview[]> {
  const sb = getSupabaseServiceClient();
  const out: GuidelineAdminSlotOverview[] = [];
  for (const slotId of GUIDELINE_RAG_SLOT_IDS) {
    const extract = await latestExtractRow(slotId, false);
    const [summary] = await listSummaryRows(slotId, 1);
    const pdfAuto = await findPdfAutoSourceRow(slotId);
    const { count: supplementCount, error: supErr } = await sb
      .from("rag_sources")
      .select("id", { count: "exact", head: true })
      .eq("type", "guideline")
      .eq("origin", "human_supplement")
      .eq("guideline_id", slotId)
      .eq("status", "active");
    if (supErr) throw new Error(`rag_sources: ${supErr.message}`);

    out.push({
      slotId,
      title: slotTitle(slotId),
      extract: extract
        ? {
            charCount: extract.char_count ?? 0,
            fileChecksum: extract.file_checksum,
            createdAt: extract.created_at,
          }
        : null,
      summary: summary
        ? { charCount: summary.summary.length, createdAt: summary.createdAt, editedAt: summary.editedAt }
        : null,
      pdfAuto: pdfAuto
        ? {
            sourceId: pdfAuto.id,
            checksum: pdfAuto.checksum,
            chunkCount: await countChunks(pdfAuto.id),
            updatedAt: pdfAuto.updated_at,
          }
        : null,
      supplementCount: supplementCount ?? 0,
    });
  }
  return out;
}

async function listSupplements(slotId: string): Promise<GuidelineSupplement[]> {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb
    .from("rag_sources")
    .select("id, title, body, status, created_by, created_at, updated_at")
    .eq("type", "guideline")
    .eq("origin", "human_supplement")
    .eq("guideline_id", slotId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`rag_sources: ${error.message}`);
  const rows = data ?? [];
  const out: GuidelineSupplement[] = [];
  for (const r of rows) {
    const id = String(r.id);
    out.push({
      sourceId: id,
      title: String(r.title ?? ""),
      body: typeof r.body === "string" ? r.body : "",
      status: String(r.status ?? "active"),
      chunkCount: await countChunks(id),
      createdBy: typeof r.created_by === "string" ? r.created_by : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    });
  }
  return out;
}

export async function getGuidelineAdminDetail(slotId: string): Promise<GuidelineAdminDetail> {
  const sb = getSupabaseServiceClient();
  const extract = await latestExtractRow(slotId, true);
  const summaries = await listSummaryRows(slotId, 5);
  const pdfAutoRow = await findPdfAutoSourceRow(slotId);

  let pdfAuto: GuidelineAdminDetail["pdfAuto"] = null;
  if (pdfAutoRow) {
    const { data, error } = await sb
      .from("rag_chunks")
      .select("chunk_index, content")
      .eq("source_id", pdfAutoRow.id)
      .order("chunk_index", { ascending: true });
    if (error) throw new Error(`rag_chunks: ${error.message}`);
    pdfAuto = {
      sourceId: pdfAutoRow.id,
      checksum: pdfAutoRow.checksum,
      updatedAt: pdfAutoRow.updated_at,
      chunks: (data ?? []).map((c) => ({ chunkIndex: Number(c.chunk_index), content: String(c.content ?? "") })),
    };
  }

  const extractText = extract?.extract_text ?? "";
  return {
    slotId,
    title: slotTitle(slotId),
    extract: extract
      ? {
          text: extractText,
          charCount: extract.char_count ?? extractText.length,
          fileChecksum: extract.file_checksum,
          createdAt: extract.created_at,
        }
      : null,
    localSummary: getGuideline(slotId)?.aiSummary?.trim() || null,
    summaries,
    pdfAuto,
    supplements: await listSupplements(slotId),
  };
}

/**
 * Overwrites the summary used by brand inspection for this slot.
 * Keyed by the current source checksum when the file exists, so restarts reload the edited text
 * from guideline_summaries; otherwise the latest row is updated in place.
 */
export async function saveGuidelineSummary(args: {
  slotId: string;
  summary: string;
  editor: string;
}): Promise<{ checksum: string; mode: "upsert_current" | "update_latest" }> {
  const summary = args.summary.trim();
  if (!summary) throw new Error("summary_empty");
  const sb = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  const g = getGuideline(args.slotId);
  let checksum: string | null = null;
  if (g?.storedRelativePath) {
    const abs = resolveStoredPath(g.storedRelativePath);
    if (existsSync(abs)) {
      const source = await extractGuidelineSummarySource(abs, g.mimeType);
      if (source.kind === "text") checksum = checksumForGuidelineSummarySource({ kind: "text", sourceText: source.sourceText });
      else if (source.kind === "image") checksum = checksumForGuidelineSummarySource({ kind: "image", base64: source.base64 });
    }
  }

  let mode: "upsert_current" | "update_latest";
  if (checksum) {
    const { error } = await sb.from("guideline_summaries").upsert(
      {
        source_key: args.slotId,
        checksum,
        summary,
        model: "admin_edit",
        prompt_version: GUIDELINE_SUMMARY_PROMPT_VERSION,
        edited_at: nowIso,
        edited_by: args.editor,
      },
      { onConflict: "source_key,checksum" }
    );
    if (error) throw new Error(`guideline_summaries upsert: ${error.message}`);
    mode = "upsert_current";
  } else {
    const [latest] = await listSummaryRows(args.slotId, 1);
    if (!latest) throw new Error("summary_source_unavailable");
    const { error } = await sb
      .from("guideline_summaries")
      .update({ summary, edited_at: nowIso, edited_by: args.editor })
      .eq("id", latest.id);
    if (error) throw new Error(`guideline_summaries update: ${error.message}`);
    checksum = latest.checksum;
    mode = "update_latest";
  }

  if (g) setGuideline({ ...g, aiSummary: summary, aiAnalyzedAt: nowIso });
  console.log(`[guideline_admin] summary saved slot=${args.slotId} mode=${mode} chars=${summary.length} by=${args.editor}`);
  return { checksum, mode };
}

function normalizeSupplementInput(title: string, body: string): { title: string; body: string } {
  const t = title.trim().slice(0, 200);
  const b = body.replace(/\r/g, "").trim();
  if (!t) throw new Error("title_required");
  if (!b) throw new Error("body_required");
  if (b.length > SUPPLEMENT_MAX_CHARS) throw new Error(`body_too_long (max ${SUPPLEMENT_MAX_CHARS})`);
  return { title: t, body: b };
}

async function embedSupplement(sourceId: string, body: string) {
  const chunks = splitIntoChunks(body, { chunkChars: SUPPLEMENT_CHUNK_CHARS, overlapChars: SUPPLEMENT_CHUNK_OVERLAP });
  const result = await insertChunksWithEmbeddings({
    sourceId,
    chunks,
    embeddingModel: "gemini-embedding-001",
    embed: (t) => embedTextWithGemini(t, { model: "gemini-embedding-001" }),
  });
  return {
    chunkCount: chunks.length,
    embedded: result?.embedded ?? 0,
    failed: result?.failed ?? chunks.length,
  };
}

/** Admin-authored RAG note (origin=human_supplement); never touched by PDF re-index. */
export async function createGuidelineSupplement(args: {
  slotId: string;
  title: string;
  body: string;
  editor: string;
}) {
  const { title, body } = normalizeSupplementInput(args.title, args.body);
  const sb = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("rag_sources")
    .insert({
      type: "guideline",
      origin: "human_supplement",
      title,
      guideline_id: args.slotId,
      body,
      checksum: sha256Hex(body),
      created_by: args.editor,
      status: "active",
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`rag_sources insert: ${error?.message ?? "no row"}`);
  const sourceId = String(data.id);
  const embed = await embedSupplement(sourceId, body);
  console.log(
    `[guideline_admin] supplement created slot=${args.slotId} source=${sourceId.slice(0, 8)} chunks=${embed.chunkCount} embedded=${embed.embedded} failed=${embed.failed}`
  );
  return { sourceId, ...embed };
}

async function loadSupplementOrThrow(sourceId: string) {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb
    .from("rag_sources")
    .select("id, origin, type, guideline_id, checksum, title")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw new Error(`rag_sources: ${error.message}`);
  if (!data) throw new Error("supplement_not_found");
  if (data.origin !== "human_supplement" || data.type !== "guideline") throw new Error("not_a_supplement");
  return data as { id: string; guideline_id: string | null; checksum: string | null; title: string };
}

export async function updateGuidelineSupplement(args: {
  sourceId: string;
  title: string;
  body: string;
  editor: string;
}) {
  const existing = await loadSupplementOrThrow(args.sourceId);
  const { title, body } = normalizeSupplementInput(args.title, args.body);
  const sb = getSupabaseServiceClient();
  const checksum = sha256Hex(body);
  const { error } = await sb
    .from("rag_sources")
    .update({ title, body, checksum, updated_at: new Date().toISOString() })
    .eq("id", args.sourceId);
  if (error) throw new Error(`rag_sources update: ${error.message}`);

  if (existing.checksum === checksum) {
    return { sourceId: args.sourceId, chunkCount: await countChunks(args.sourceId), embedded: 0, failed: 0, reembedded: false };
  }
  const embed = await embedSupplement(args.sourceId, body);
  console.log(
    `[guideline_admin] supplement updated source=${args.sourceId.slice(0, 8)} chunks=${embed.chunkCount} embedded=${embed.embedded} failed=${embed.failed} by=${args.editor}`
  );
  return { sourceId: args.sourceId, ...embed, reembedded: true };
}

/** Soft-remove: archived sources are excluded by match_rag_chunks(filter_status='active'). */
export async function archiveGuidelineSupplement(sourceId: string, editor: string): Promise<void> {
  await loadSupplementOrThrow(sourceId);
  const sb = getSupabaseServiceClient();
  const { error } = await sb
    .from("rag_sources")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", sourceId);
  if (error) throw new Error(`rag_sources archive: ${error.message}`);
  console.log(`[guideline_admin] supplement archived source=${sourceId.slice(0, 8)} by=${editor}`);
}
