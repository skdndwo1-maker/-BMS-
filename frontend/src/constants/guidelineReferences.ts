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
