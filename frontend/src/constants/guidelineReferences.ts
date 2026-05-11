/**
 * 각 id는 서버 `FIXED_GUIDELINE_SOURCES`와 동일하며, 번들 PDF는 다음 폴더의 최종 파일과 연동됩니다.
 * - simply-uplus-guideline → data/guidelines/Simply U+ 가이드라인/Simply U+ 가이드라인.pdf
 * - simply-uplus-job-guide → data/guidelines/Simply U+ 직무별 실행 가이드/직무별 Simply. U+ 실행 가이드_v1_학습용.pdf
 * - uplus-brand-guideline → data/guidelines/브랜드 가이드라인/
 * - uplus-vi-guideline → data/guidelines/VI 가이드라인/
 */
export const GUIDELINE_REFERENCE_OPTIONS = [
  { id: "uplus-brand-guideline", name: "브랜드 가이드라인" },
  { id: "uplus-vi-guideline", name: "VI 가이드라인" },
] as const;

export type GuidelineReferenceId = (typeof GUIDELINE_REFERENCE_OPTIONS)[number]["id"];
