import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { extractGuidelineText } from "./guidelineExtract.js";
import { ensureFixedGuidelineSlotAsync, FIXED_GUIDELINE_SOURCES } from "./fixedGuidelines.js";
import { getGuideline, PROJECT_ROOT, resolveStoredPath } from "./store.js";
import { getSupabaseServiceClient } from "./supabase.js";

export type GuidelineExtractCache = "hit" | "miss" | "db_latest" | "local" | "empty";

function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

function sha256File(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

function resolveExistingPdf(sourceKey: string): string | null {
  const g = getGuideline(sourceKey);
  if (g?.mimeType === "application/pdf" && g.storedRelativePath) {
    const abs = resolveStoredPath(g.storedRelativePath);
    if (existsSync(abs)) return abs;
  }
  const spec = FIXED_GUIDELINE_SOURCES[sourceKey];
  if (!spec) return null;
  for (const rel of [spec.relativeSource, ...(spec.legacyRelativeSources ?? [])]) {
    const abs = join(PROJECT_ROOT, rel);
    if (existsSync(abs)) return abs;
  }
  return null;
}

async function lookupByChecksum(sourceKey: string, fileChecksum: string): Promise<string | null> {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb
    .from("guideline_extracts")
    .select("extract_text")
    .eq("source_key", sourceKey)
    .eq("file_checksum", fileChecksum)
    .maybeSingle();
  if (error) {
    console.warn("[guideline_extract] lookup failed:", error.message);
    return null;
  }
  const text = typeof data?.extract_text === "string" ? data.extract_text.trim() : "";
  return text || null;
}

async function lookupLatest(sourceKey: string): Promise<string | null> {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb
    .from("guideline_extracts")
    .select("extract_text")
    .eq("source_key", sourceKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[guideline_extract] latest lookup failed:", error.message);
    return null;
  }
  const text = typeof data?.extract_text === "string" ? data.extract_text.trim() : "";
  return text || null;
}

async function upsertExtract(sourceKey: string, fileChecksum: string, extractText: string): Promise<void> {
  const sb = getSupabaseServiceClient();
  const { error } = await sb.from("guideline_extracts").upsert(
    {
      source_key: sourceKey,
      file_checksum: fileChecksum,
      extract_text: extractText,
      char_count: extractText.length,
    },
    { onConflict: "source_key,file_checksum" }
  );
  if (error) console.warn("[guideline_extract] upsert failed:", error.message);
}

/**
 * PDF 추출문. 파일이 있으면 바이트 체크섬으로 조회하고, 없으면 추출 후 저장합니다.
 * 파일이 없고 DB 행만 있으면 그 source_key의 최신 행을 반환합니다.
 */
export async function loadGuidelineExtract(sourceKey: string): Promise<{
  text: string;
  cache: GuidelineExtractCache;
}> {
  try {
    await ensureFixedGuidelineSlotAsync(sourceKey);
  } catch (e) {
    console.warn(
      `[guideline_extract] ensure ${sourceKey}:`,
      e instanceof Error ? e.message : String(e)
    );
  }

  const abs = resolveExistingPdf(sourceKey);
  if (!abs) {
    if (supabaseConfigured()) {
      const latest = await lookupLatest(sourceKey);
      if (latest) return { text: latest, cache: "db_latest" };
    }
    return { text: "", cache: "empty" };
  }

  const checksum = sha256File(abs);
  if (supabaseConfigured()) {
    const hit = await lookupByChecksum(sourceKey, checksum);
    if (hit) return { text: hit, cache: "hit" };
  }

  const extracted = (await extractGuidelineText(abs, "application/pdf")).trim();
  if (!extracted) return { text: "", cache: "empty" };

  if (supabaseConfigured()) {
    await upsertExtract(sourceKey, checksum, extracted);
    return { text: extracted, cache: "miss" };
  }
  return { text: extracted, cache: "local" };
}
