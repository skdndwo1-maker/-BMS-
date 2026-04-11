/**
 * 각 id는 서버 `FIXED_GUIDELINE_SOURCES`와 동일하며, 번들 PDF는 다음 폴더의 최종 파일과 연동됩니다.
 * - uplus-brand-guideline → data/guidelines/U+ 브랜드 가이드라인/
 * - uplus-vi-guideline → data/guidelines/U+ VI 가이드라인/
 */
export const GUIDELINE_REFERENCE_OPTIONS = [
  { id: "uplus-brand-guideline", name: "U+ 브랜드 가이드라인" },
  { id: "uplus-vi-guideline", name: "U+ VI 가이드라인" },
] as const;

export type GuidelineReferenceId = (typeof GUIDELINE_REFERENCE_OPTIONS)[number]["id"];
