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

/**
 * 참조 가이드라인 옵션 ↔ `data/guidelines/` 하위 폴더의 최종 PDF 1개.
 * 프론트에서 옵션 선택 시 sync-fixed가 이 파일을 슬롯으로 복사하고 Gemini로 요약·검수 맥락에 사용합니다.
 */
export const FIXED_GUIDELINE_SOURCES: Record<string, { relativeSource: string; displayName: string }> = {
  "uplus-brand-guideline": {
    relativeSource: "data/guidelines/U+ 브랜드 가이드라인/U+ 브랜드 가이드라인.pdf",
    displayName: "U+ 브랜드 가이드라인"
  },
  "uplus-vi-guideline": {
    relativeSource: "data/guidelines/U+ VI 가이드라인/U+ VI 가이드라인.pdf",
    displayName: "U+ VI 가이드라인"
  },
  /** 심플리하게 분석 — repo의 고정 원본 PDF (sync-fixed 시 슬롯으로 복사) */
  "simply-uplus-guideline": {
    relativeSource: "data/guidelines/Simply U+ 가이드라인/Simply U+ 가이드라인.pdf",
    displayName: "Simply U+ 설명자료·실천과제 V2 (18개 분류·학습용)",
  },
  /** simplyHeart 분석 두 번째 참조: 직무별 실행 가이드 (레포 고정 경로) */
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

export function copyFixedGuidelineToSlot(id: string): GuidelineRecord {
  const spec = FIXED_GUIDELINE_SOURCES[id];
  if (!spec) {
    throw new Error(`unknown_guideline: ${id}`);
  }
  const absSrc = join(PROJECT_ROOT, spec.relativeSource);
  if (!existsSync(absSrc)) {
    throw new Error(`fixed_file_missing: ${spec.relativeSource}`);
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
  const safe = basename(spec.relativeSource).replace(/[^a-zA-Z0-9._-]/g, "_");
  const fname = `${id}-${Date.now()}-${safe}`;
  const destAbs = join(GUIDELINES_DIR, fname);
  copyFileSync(absSrc, destAbs);
  const stat = statSync(destAbs);
  const storedRelativePath = join("data", "guidelines", fname).replace(/\\/g, "/");

  const record: GuidelineRecord = {
    id,
    displayName: spec.displayName,
    originalName: basename(spec.relativeSource),
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

/** 슬롯이 비어 있거나 파일이 없으면 레포 고정 PDF로 자동 동기화 (Railway 등 fresh deploy 대응) */
export function ensureFixedGuidelineSlot(id: string): GuidelineRecord | null {
  let g = getGuideline(id);
  const fileMissing =
    !g?.storedRelativePath || !existsSync(resolveStoredPath(g.storedRelativePath));
  const notPdf = g != null && g.mimeType !== "application/pdf";
  if ((fileMissing || notPdf) && FIXED_GUIDELINE_SOURCES[id]) {
    try {
      g = copyFixedGuidelineToSlot(id);
    } catch (e) {
      console.error(
        `[guideline] ensureFixedGuidelineSlot(${id}):`,
        e instanceof Error ? e.message : String(e)
      );
    }
  }
  return g ?? null;
}
