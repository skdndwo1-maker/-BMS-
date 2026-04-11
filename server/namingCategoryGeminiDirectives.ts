/**
 * 브랜드 네이밍 검수 시 Gemini 프롬프트에만 사용하는 평가 지시문.
 * (클라이언트·`shared/categoryNamingRules.ts`가 보내는 「브랜드 계층 컨텍스트」와 별도 — 서버 측 보강만 여기서 수정)
 */

/** 모든 검수 공통: U+ 미표기를 단정적으로 위반으로 보지 않도록 */
export const GEMINI_AUDIT_CATEGORY_UNIVERSAL_DIRECTIVES = `
[브랜드 계층 컨텍스트 기반 평가 원칙 — 필수]
- 위에 기재된 「브랜드 계층 컨텍스트」·「이 레벨의 네이밍 룰」·마지막 불릿(따라서…)은 U+ 마스터브랜드·계층 정렬 해석에 **최우선**으로 적용합니다.
- 계층 정렬(hierarchyScore·detailLogicHierarchy)을 채점할 때, 가이드라인 PDF 요약만 보고 「U+가 없다」는 이유만으로 감점·NO-GO로 연결하지 마십시오. **선택된 서브카테고리 룰**에서 독립 네이밍·U+ 비접두·종속 명칭 등이 허용되면 그에 맞게 **정상**으로 평가합니다.
- U+ 미포함이 **해당 레벨 네이밍 룰·마지막 불릿에 부합하는 경우**, 이를 가이드라인 위반·계층 불일치로 판단하지 마십시오.
`.trim();

/** Personal > 인터넷 — 클라이언트 블록이 누락·구형일 때만 보강 (신규 형식이면 중복 삽입 안 함) */
export const GEMINI_DIRECTIVE_PERSONAL_INTERNET_FALLBACK = `
[보강 — Personal > 인터넷]
- 서브카테고리가 인터넷이면: U+ 마스터브랜드·U+인터넷 서브브랜드 접두어 없이 독립 서비스명이 허용되는 레벨입니다. U+ 미포함만으로 위반으로 단정하지 말 것.
`.trim();

function isPersonalInternetHierarchyBlock(s: string): boolean {
  return (
    /브랜드 계층 컨텍스트/i.test(s) &&
    /대카테고리:\s*Personal/i.test(s) &&
    /서브카테고리:\s*인터넷\b/i.test(s)
  );
}

function needsPersonalInternetFallback(s: string): boolean {
  if (!isPersonalInternetHierarchyBlock(s)) return false;
  return !/따라서 U\+ 미포함은 가이드라인 위반이 아님/i.test(s) && !/U\+ 미포함은 가이드라인 위반이 아님/i.test(s);
}

/**
 * 클라이언트가 보낸 auditCategory 전문(카테고리 + 네이밍 룰)과,
 * 서버 고정 지시문을 합쳐 Gemini 프롬프트에 넣을 섹션을 만든다.
 */
export function buildAuditCategoryGeminiPromptSection(auditCategoryRaw: string): string {
  const t = auditCategoryRaw.trim();
  if (!t) return "";

  const parts = [
    "[브랜드 계층 컨텍스트 — 분석·채점 시 최우선(특히 계층·U+ 표기 해석)]",
    t,
    "",
    GEMINI_AUDIT_CATEGORY_UNIVERSAL_DIRECTIVES
  ];

  if (needsPersonalInternetFallback(t)) {
    parts.push("", GEMINI_DIRECTIVE_PERSONAL_INTERNET_FALLBACK);
  }

  return parts.join("\n").trim();
}
