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
/**
 * 단계별(요금제) 네이밍 생성 시 `tierNamingAlternatives[].storyline` 톤.
 * Personal = B2C 커머셜·일상 맥락, Enterprise = B2B 진중·무게감.
 */
export function buildTierStorylineToneBlock(auditCategoryRaw: string): string {
  const t = auditCategoryRaw.trim();
  const m = t.match(/대카테고리:\s*(Personal|Enterprise|AI)\b/i);
  const major = m ? m[1] : null;

  if (!major) {
    return [
      "【단계별 네이밍 — 세계관·스토리라인 톤】",
      "- 대카테고리가 위에 명시되지 않았다면, **요금제·상품 라인업**과 맞는 서사로 4개 대안을 **서로 다른** 세계관으로 창작한다.",
      "- **「기타」「etc.」「무특정」** 같은 모호한 설정만으로 끝내지 말고, 고객이 상품 가치를 떠올릴 수 있는 **구체적 상황·가치**가 드러나게 한다."
    ].join("\n");
  }

  const key = major.charAt(0).toUpperCase() + major.slice(1).toLowerCase();

  if (key === "Personal") {
    return [
      "【단계별 네이밍 — 세계관·스토리라인 톤 — Personal】",
      "- **Personal(B2C)** 맥락에서 스토리라인은 **커머셜·일상 소비**에 바로 옮겨 닿게 쓴다(요금·혜택·콘텐츠·생활 밀착 서비스를 사는 고객의 장면).",
      "- 동화·판타지·추상적 세계만 깔고 끝내지 말고, **실제 요금제·상품명으로 썼을 때 납득되는** 호감·기억 포인트가 서사에 녹아 있게 한다.",
      "- 4개 대안은 감성·서사를 **다채롭게** 달라도 되나, **etc·기타·무특정**으로 톤을 뭉개지 말 것.",
      "- 단계별 네이밍은 이 스토리 안에서 **티어(가격대) 차이가 자연스럽게 이어지도록** 파생시킨다."
    ].join("\n");
  }

  if (key === "Enterprise") {
    return [
      "【단계별 네이밍 — 세계관·스토리라인 톤 — Enterprise】",
      "- **Enterprise(B2B)** 맥락에서 스토리라인은 **무게감·신뢰·진중함**을 최우선한다. 가벼운 유행어·밈·과장된 놀이 문체는 피한다.",
      "- 의사결정자·조직 도입·계약·SLA 등 **사업 맥락**이 서사에서 읽히게 하고, **전문성·안정성·지속 가능성**이 드러나게 쓴다.",
      "- 4개 대안은 세계관을 **서로 구분**하되, 공통으로 **절제되고 품격 있는** 문장 톤을 유지한다.",
      "- 단계별 네이밍은 이 톤 안에서 **라인업·등급 체계**가 명확히 보이도록 파생시킨다."
    ].join("\n");
  }

  // AI
  return [
    "【단계별 네이밍 — 세계관·스토리라인 톤 — AI】",
    "- **AI** 맥락: 혁신·지능형 서비스 연상은 허용하되, **과장된 SF 클리셰만**으로 채우지 말고 실제 도입·사용 시나리오와 연결한다.",
    "- B2C에 가까우면 Personal 톤(이해 쉬움·접점), B2B에 가까우면 Enterprise 톤(진중·신뢰)을 **요청·참고 정보**에 맞게 가늠한다.",
    "- 4개 대안은 서사를 달리하되 **etc·기타**로 흐리지 말 것."
  ].join("\n");
}

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
