import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  GUIDELINES_DIR,
  getGuideline,
  setGuideline,
  resolveStoredPath,
  type GuidelineRecord,
} from "./store.js";
import { getSupabaseServiceClient } from "./supabase.js";
import { FIXED_GUIDELINE_SOURCES } from "./fixedGuidelines.js";

const LIBRARY_BUCKET = "brand-library";

/** Supabase library_assets.file_name 기준 (category=guide) */
export const SUPABASE_GUIDELINE_FILE_NAMES: Record<string, string> = {
  "uplus-vi-guideline": "U+_VI_Guidelines.pdf",
  "simply-uplus-guideline": "Simply_U+_Guidelines.pdf",
};

export function canSyncGuidelineFromSupabase(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

/**
 * brand-library + library_assets 에서 가이드 PDF를 내려받아 로컬 슬롯에 등록합니다.
 */
export async function syncGuidelineFromSupabaseLibrary(id: string): Promise<GuidelineRecord> {
  const spec = FIXED_GUIDELINE_SOURCES[id];
  const fileName = SUPABASE_GUIDELINE_FILE_NAMES[id];
  if (!spec || !fileName) {
    throw new Error(`supabase_guideline_not_configured: ${id}`);
  }
  if (!canSyncGuidelineFromSupabase()) {
    throw new Error("SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되어 있지 않습니다.");
  }

  const sb = getSupabaseServiceClient();
  const { data: row, error: qErr } = await sb
    .from("library_assets")
    .select("file_path,file_name,name,mime_type,file_size")
    .eq("category", "guide")
    .eq("file_name", fileName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qErr) throw new Error(qErr.message);
  if (!row?.file_path) {
    throw new Error(
      `Supabase library_assets에 guide / ${fileName} 가 없습니다. Brand Library에 업로드해 주세요.`
    );
  }

  const { data: blob, error: dErr } = await sb.storage.from(LIBRARY_BUCKET).download(row.file_path);
  if (dErr || !blob) {
    throw new Error(dErr?.message ?? `storage_download_failed: ${row.file_path}`);
  }

  const prev = getGuideline(id);
  if (prev?.storedRelativePath) {
    const oldAbs = resolveStoredPath(prev.storedRelativePath);
    try {
      if (existsSync(oldAbs)) unlinkSync(oldAbs);
    } catch {
      /* ignore */
    }
  }

  mkdirSync(GUIDELINES_DIR, { recursive: true });
  const safe = fileName.replace(/[^a-zA-Z0-9._+-]/g, "_");
  const fname = `${id}-${Date.now()}-${safe}`;
  const destAbs = join(GUIDELINES_DIR, fname);
  const buf = Buffer.from(await blob.arrayBuffer());
  writeFileSync(destAbs, buf);

  const record: GuidelineRecord = {
    id,
    displayName: spec.displayName,
    originalName: row.file_name ?? fileName,
    storedRelativePath: join("data", "guidelines", fname).replace(/\\/g, "/"),
    mimeType: row.mime_type || "application/pdf",
    size: row.file_size ?? buf.length,
    uploadedAt: new Date().toISOString(),
    aiSummary: null,
    aiAnalyzedAt: null,
  };
  setGuideline(record);
  return record;
}
