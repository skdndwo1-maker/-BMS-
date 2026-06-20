/**
 * 각 id는 서버 `FIXED_GUIDELINE_SOURCES` / Supabase Brand Library(`guide`)와 동일합니다.
 * - design-editor-brand-guideline → Jason B2C Brand Guidelines (디자인 AI 시각·텍스트)
 * - uplus-brand-guideline → V1.1 (라이브러리 보관만, AI 미사용)
 * - simply-uplus-guideline → Simply_U+_Guidelines.pdf
 */
export const DESIGN_EDITOR_INSPECTION_GUIDELINE_ID = "design-editor-brand-guideline" as const;

export const DESIGN_EDITOR_JASON_PDF_LABEL =
  "LG U+ B2C Brand Guidelines (Jason For Parsing)" as const;

/** 브랜드 검수 화면 참조 옵션 — V1.1 제외 */
export const GUIDELINE_REFERENCE_OPTIONS = [
  { id: DESIGN_EDITOR_INSPECTION_GUIDELINE_ID, name: "B2C Brand Guidelines (Jason)" },
  { id: "uplus-vi-guideline", name: "VI 가이드라인" },
] as const;

export type GuidelineReferenceId = (typeof GUIDELINE_REFERENCE_OPTIONS)[number]["id"];

/** 브랜드 네이밍 — 사용자 선택 없이 항상 참조(VI 제외) */
export const NAMING_FIXED_GUIDELINE_OPTIONS = [
  { id: "simply-uplus-guideline", name: "Simply. U+ Guidebook" },
  { id: DESIGN_EDITOR_INSPECTION_GUIDELINE_ID, name: "B2C Brand Guidelines (Jason)" },
] as const;
