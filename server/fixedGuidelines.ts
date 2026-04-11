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
  }
};

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
