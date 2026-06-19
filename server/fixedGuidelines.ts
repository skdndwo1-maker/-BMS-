import { copyFileSync, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import {
  GUIDELINES_DIR,
  getGuideline,
  setGuideline,
  type GuidelineRecord,
  PROJECT_ROOT,
  resolveStoredPath
} from "./store.js";
import { syncGuidelineFromSupabaseLibrary, canSyncGuidelineFromSupabase } from "./guidelineSupabaseSync.js";

export type FixedGuidelineSpec = {
  relativeSource: string;
  /** Supabase 미동기화 시 시도할 레거시 로컬 경로 */
  legacyRelativeSources?: string[];
  displayName: string;
};

/**
 * 참조 가이드라인 옵션 ↔ 로컬 PDF 또는 Supabase Brand Library(`guide` 카테고리).
 * VI·Simply U+는 Supabase file_name(`U+_VI_Guidelines.pdf`, `Simply_U+_Guidelines.pdf`) 우선.
 */
export const FIXED_GUIDELINE_SOURCES: Record<string, FixedGuidelineSpec> = {
  "uplus-brand-guideline": {
    relativeSource: "data/guidelines/U+_Brand_Guidelines.pdf",
    legacyRelativeSources: ["data/guidelines/U+ 브랜드 가이드라인/U+ 브랜드 가이드라인.pdf"],
    displayName: "U+ 브랜드 가이드라인"
  },
  "uplus-vi-guideline": {
    relativeSource: "data/guidelines/U+_VI_Guidelines.pdf",
    legacyRelativeSources: ["data/guidelines/U+ VI 가이드라인/U+ VI 가이드라인.pdf"],
    displayName: "U+ VI 가이드라인"
  },
  "simply-uplus-guideline": {
    relativeSource: "data/guidelines/Simply_U+_Guidelines.pdf",
    legacyRelativeSources: ["data/guidelines/Simply U+ 가이드라인/Simply U+ 가이드라인.pdf"],
    displayName: "Simply U+ 설명자료·실천과제 V2 (18개 분류·학습용)",
  },
  "simply-uplus-job-guide": {
    relativeSource:
      "data/guidelines/Simply U+ 직무별 실행 가이드/직무별 Simply. U+ 실행 가이드_v1_학습용.pdf",
    displayName: "직무별 Simply U+ 실행 가이드 v1 (학습용)",
  },
};

/** `simplyHeart` 통합 분석에서 항상 레포 고정 PDF로 맥락에 넣는 id (브랜드/VI 제외) */
export const SIMPLY_HEART_FIXED_GUIDE_IDS: readonly string[] = [
  "simply-uplus-guideline",
  "simply-uplus-job-guide",
];

/** 브랜드 네이밍 생성·검수 — 항상 자동 참조(VI 제외) */
export const NAMING_FIXED_GUIDELINE_IDS = [
  "simply-uplus-guideline",
  "uplus-brand-guideline",
] as const;

export const NAMING_FIXED_GUIDELINE_DISPLAY: Record<(typeof NAMING_FIXED_GUIDELINE_IDS)[number], string> = {
  "simply-uplus-guideline": "Simply. U+ Guidebook",
  "uplus-brand-guideline": "Brand Guideline",
};

function resolveLocalSourcePath(spec: FixedGuidelineSpec): string | null {
  const candidates = [spec.relativeSource, ...(spec.legacyRelativeSources ?? [])];
  for (const rel of candidates) {
    const abs = join(PROJECT_ROOT, rel);
    if (existsSync(abs)) return abs;
  }
  return null;
}

function writeGuidelineRecordFromFile(id: string, absSrc: string, spec: FixedGuidelineSpec): GuidelineRecord {
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
  const safe = basename(absSrc).replace(/[^a-zA-Z0-9._-]/g, "_");
  const fname = `${id}-${Date.now()}-${safe}`;
  const destAbs = join(GUIDELINES_DIR, fname);
  copyFileSync(absSrc, destAbs);
  const stat = statSync(destAbs);
  const storedRelativePath = join("data", "guidelines", fname).replace(/\\/g, "/");

  const record: GuidelineRecord = {
    id,
    displayName: spec.displayName,
    originalName: basename(absSrc),
    storedRelativePath,
    mimeType: "application/pdf",
    size: stat.size,
    uploadedAt: new Date().toISOString(),
    aiSummary: null,
    aiAnalyzedAt: null
  };
  setGuideline(record);
  return record;
}

export function copyFixedGuidelineToSlot(id: string): GuidelineRecord {
  const spec = FIXED_GUIDELINE_SOURCES[id];
  if (!spec) {
    throw new Error(`unknown_guideline: ${id}`);
  }
  const absSrc = resolveLocalSourcePath(spec);
  if (!absSrc) {
    throw new Error(`fixed_file_missing: ${spec.relativeSource}`);
  }
  return writeGuidelineRecordFromFile(id, absSrc, spec);
}

/** 슬롯이 비어 있으면 로컬 고정 PDF로 동기화 (동기 — Supabase는 ensureFixedGuidelineSlotAsync 사용) */
export function ensureFixedGuidelineSlot(id: string): GuidelineRecord | null {
  let g = getGuideline(id);
  const fileMissing =
    !g?.storedRelativePath || !existsSync(resolveStoredPath(g.storedRelativePath));
  const notPdf = g != null && g.mimeType !== "application/pdf";
  if (!fileMissing && !notPdf) return g ?? null;
  if (!FIXED_GUIDELINE_SOURCES[id]) return g ?? null;

  try {
    g = copyFixedGuidelineToSlot(id);
  } catch (e) {
    console.error(
      `[guideline] ensureFixedGuidelineSlot(${id}):`,
      e instanceof Error ? e.message : String(e)
    );
  }
  return g ?? null;
}

/** Supabase Brand Library → 로컬 고정 PDF 순으로 슬롯 채우기 */
export async function ensureFixedGuidelineSlotAsync(id: string): Promise<GuidelineRecord | null> {
  let g = getGuideline(id);
  const fileMissing =
    !g?.storedRelativePath || !existsSync(resolveStoredPath(g.storedRelativePath));
  const notPdf = g != null && g.mimeType !== "application/pdf";
  if (!fileMissing && !notPdf) return g ?? null;
  if (!FIXED_GUIDELINE_SOURCES[id]) return g ?? null;

  if (canSyncGuidelineFromSupabase()) {
    try {
      return await syncGuidelineFromSupabaseLibrary(id);
    } catch (e) {
      console.warn(
        `[guideline] ensureFixedGuidelineSlotAsync(${id}) supabase:`,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  try {
    return copyFixedGuidelineToSlot(id);
  } catch (e) {
    console.error(
      `[guideline] ensureFixedGuidelineSlotAsync(${id}):`,
      e instanceof Error ? e.message : String(e)
    );
    return g ?? null;
  }
}
