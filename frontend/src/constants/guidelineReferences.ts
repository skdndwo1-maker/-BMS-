/**
 * 각 id는 서버 `FIXED_GUIDELINE_SOURCES` / Supabase Brand Library(`guide`)와 동일합니다.
 * - uplus-vi-guideline → U+_VI_Guidelines.pdf
 * - simply-uplus-guideline → Simply_U+_Guidelines.pdf
 * - uplus-brand-guideline → U+ 브랜드 가이드라인.pdf (로컬)
 */
export const GUIDELINE_REFERENCE_OPTIONS = [
  { id: "uplus-brand-guideline", name: "브랜드 가이드라인" },
  { id: "uplus-vi-guideline", name: "VI 가이드라인" },
] as const;

export type GuidelineReferenceId = (typeof GUIDELINE_REFERENCE_OPTIONS)[number]["id"];

/** 브랜드 네이밍 — 사용자 선택 없이 항상 참조(VI 제외) */
export const NAMING_FIXED_GUIDELINE_OPTIONS = [
  { id: "simply-uplus-guideline", name: "Simply. U+ Guidebook" },
  { id: "uplus-brand-guideline", name: "Brand Guideline" },
] as const;
