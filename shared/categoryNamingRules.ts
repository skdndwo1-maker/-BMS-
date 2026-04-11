/**
 * 검수 카테고리 — 브랜드 계층 컨텍스트·추가 제안 네이밍 조건의 단일 소스.
 * 프론트(요청 본문)·서버(Gemini 보조 호출)가 동일 모듈을 참조합니다.
 */

export type NamingCategoryMajor = "Personal" | "Enterprise" | "AI";

export type BrandHierarchyRow = {
  subcategoryRole: string;
  namingTarget: string;
  levelNamingRule: string;
  markConclusion: string;
  /**
   * Gemini NO-GO 시 `additionalNamingSuggestions` 보충용 프롬프트 블록.
   * 없으면 `buildAdditionalNamingSuggestionBlock`이 레벨 룰로 자동 생성.
   */
  additionalNamingSuggestionBlock?: string;
  /**
   * 생성 모드: 종속·부가 레벨 등에서 U+/U+tv 등 상위 브랜드 접두 없이 독립 작명해야 할 때
   * `buildNamingGenerationRuleBlock`으로 Gemini 프롬프트에 고정 안내를 넣음.
   */
  forbidParentBrandPrefixInGeneration?: boolean;
};

const PERSONAL: Record<string, BrandHierarchyRow> = {
  모바일: {
    subcategoryRole: "B2C 모바일 서비스 및 그 하위 종속·부가 명칭 작명",
    namingTarget:
      "U+모바일 등 서비스 브랜드 아래에 속하는 요금제·부가서비스·혜택·프로모션 등 고객 접점 명칭",
    levelNamingRule:
      "서비스 브랜드 레벨에서는 가이드에 따라 U+ 결합(예: U+모바일)이 가능하고,\n  요금·혜택·부가 서비스 등 종속 레벨 명칭은 U+를 붙이지 않고 기능·혜택 중심의 직관적 독립 네이밍을 쓰는 것이 원칙",
    markConclusion:
      "종속·부가 레벨에서 U+ 미포함이 해당 룰에 부합하면 가이드 위반으로 단정하지 말 것",
  },
  인터넷: {
    subcategoryRole: "U+인터넷 서비스의 하위 종속 서비스명 작명",
    namingTarget: "U+인터넷 브랜드 아래에 속하는\n  개별 요금제 또는 부가서비스 이름",
    forbidParentBrandPrefixInGeneration: true,
    levelNamingRule:
      "U+ 마스터브랜드 및\n  U+인터넷 서브브랜드 접두어 없이\n  독립적인 서비스명으로 작명하는 것이 원칙",
    markConclusion: "따라서 U+ 미포함은 가이드라인 위반이 아님",
    additionalNamingSuggestionBlock: [
      "제안 네이밍 조건:",
      "- 선택 카테고리: Personal > 인터넷 하위 종속 서비스",
      "- 이 레벨은 U+ 마스터브랜드 및 서브브랜드",
      "  접두어 없이 독립 서비스명으로 작명하는 것이 원칙",
      "- U+, U+ 인터넷 등 상위 브랜드명을",
      "  포함한 제안은 절대 하지 말 것",
      "- 예시처럼 독립적인 단어 조합으로만 제안할 것",
    ].join("\n"),
  },
  IPTV: {
    subcategoryRole: "U+tv 등 TV·미디어 서비스 하위 종속 명칭 작명",
    namingTarget: "TV·미디어 서비스 브랜드 아래 채널·패키지·프로모션 등 종속 레벨 명칭",
    forbidParentBrandPrefixInGeneration: true,
    levelNamingRule:
      "서비스 브랜드는 U+tv 등 서비스 브랜드 규칙을 따르고,\n  채널·패키지·프로모션 등 종속 명칭은 U+ 결합 없이 직관적 독립 네이밍을 쓰는 것이 원칙이며 서비스 브랜드와 종속 명칭을 한 덩어리로 결합해 쓰지 않음",
    markConclusion:
      "종속 레벨에서 U+ 미포함이 해당 룰에 맞으면 가이드 위반으로 단정하지 말 것",
  },
  스마트홈: {
    subcategoryRole: "스마트홈·IoT 서비스 및 기기·부가 혜택 명칭 작명",
    namingTarget: "스마트홈·IoT 고객 접점 서비스 및 기기·요금·부가 혜택 등 종속 레벨 명칭",
    forbidParentBrandPrefixInGeneration: true,
    levelNamingRule:
      "고객 접점 서비스명은 가이드에 따른 U+ 서비스 브랜드 규칙을 적용하고,\n  기기·요금·부가 혜택 등 종속 레벨은 U+ 없이 기능 중심 독립 네이밍을 권장",
    markConclusion:
      "종속 레벨에서 U+ 미포함이 해당 룰에 부합하면 계층 위반으로만 단정하지 말 것",
  },
  멤버십: {
    subcategoryRole: "멤버십·혜택 프로그램 등 종속 서비스 명칭 작명",
    namingTarget: "멤버십·혜택·프로모션 등 고객 혜택 접점의 종속 명칭",
    forbidParentBrandPrefixInGeneration: true,
    levelNamingRule:
      "종속 서비스 레벨에서는 U+ 결합을 하지 않으며 혜택·가치가 드러나는 직관적 명칭을 쓰는 것이 원칙",
    markConclusion:
      "해당 성격의 명칭에서 U+ 미포함은 허용되는 경우가 많으므로 룰·가이드를 함께 적용해 판단할 것",
  },
  구독: {
    subcategoryRole: "구독 상품·패스 등 종속·부가 명칭 작명",
    namingTarget: "구독 상품·패스 및 부가 혜택 등 종속 레벨 명칭",
    forbidParentBrandPrefixInGeneration: true,
    levelNamingRule:
      "종속·부가 명칭은 U+ 결합 없이 상품 혜택이 분명한 독립 네이밍을 쓰는 것이 원칙이며 서비스 마스터와 종속 명칭의 결합 표기는 금지",
    markConclusion:
      "종속 레벨에서 U+ 미포함이 룰에 맞으면 가이드 위반으로 연결하지 말 것",
  },
  채널: {
    subcategoryRole: "방송·채널·콘텐츠 관련 종속 명칭 작명",
    namingTarget: "방송·채널·콘텐츠 브랜딩에서 서비스/프로모션에 따르는 각 레벨 명칭",
    forbidParentBrandPrefixInGeneration: true,
    levelNamingRule:
      "서비스/프로모션 구분에 따라 U+ 규칙 또는 독립 네이밍을 적용하고,\n  종속 레벨은 U+ 없이 직관적 표현을 쓰는 것이 원칙",
    markConclusion:
      "종속 레벨에서 U+ 미포함이 해당 룰에 부합하면 위반으로 단정하지 말 것",
  },
};

const ENTERPRISE: Record<string, BrandHierarchyRow> = {
  Infra: {
    subcategoryRole: "Enterprise(B2B) 인프라·솔루션 영역 명칭",
    namingTarget: "B2B 인프라·네트워크·솔루션 등 Enterprise 카테고리 하위 명칭·지면 표기",
    levelNamingRule:
      "별도 마스터브랜드 없이 LG U+ CI가 브랜드를 보증하며,\n  지면에는 Enterprise 카테고리 표기와 LG U+ CI를 일정 간격으로 병기",
    markConclusion:
      "B2C처럼 서비스명에 U+를 접두 결합하는 방식으로 단정하지 말고 Enterprise·CI 병기 규정을 우선할 것",
  },
  Works: {
    subcategoryRole: "Enterprise Works B2B 솔루션·업무 영역 명칭",
    namingTarget: "B2B 솔루션·업무 서비스 및 관련 지면·캠페인 명칭",
    levelNamingRule:
      "LG U+ CI 보증 하에 적용하며 마스터브랜드 U+를 B2C처럼 서비스명에 결합하지 않음.\n  Enterprise 표기·CI 병기 규정을 따름",
    markConclusion:
      "U+ 미포함이 Enterprise Works 룰 및 CI 병기에 맞으면 B2C U+ 결합 누락으로 단정하지 말 것",
  },
  AX: {
    subcategoryRole: "Enterprise AX · AI·디지털 전환 등 AX 성격 명칭",
    namingTarget: "AX 관련 솔루션·서비스 및 지면에 쓰이는 명칭",
    levelNamingRule:
      "가이드에 따라 ixi 마스터브랜드 적용이 가능하며 LG U+ CI와의 병기·표기 규정을 준수",
    markConclusion:
      "ixi·CI 병기 맥락에서 U+ 접두 요구를 B2C 규칙과 혼동하지 말 것",
  },
};

const AI_CAT: Record<string, BrandHierarchyRow> = {
  Service: {
    subcategoryRole: "ixi 마스터브랜드 기반 AI 서비스 명칭",
    namingTarget: "ixi를 뿌리로 하는 AI 서비스·고객 접점 명칭",
    levelNamingRule:
      "ixi를 독립적으로 운영하며 LG U+ CI가 보증.\n  네이밍은 ixi + 수식어(Modifier) 형태를 권장하고 서비스/종속 구분 없이 동일 원칙 적용",
    markConclusion:
      "B2C U+ 접두 규칙으로 ixi 서비스명을 판단하지 말고 ixi·가이드 원칙을 우선할 것",
  },
  Feature: {
    subcategoryRole: "ixi 기반 AI 기능·특장점 명칭",
    namingTarget: "AI 기능·특장점을 드러내는 기능명·수식어 조합",
    levelNamingRule:
      "ixi 기반으로 기능명을 설계할 때 수식어 조합을 명확히 하고 B2C U+ 규칙과 혼동되지 않도록 함",
    markConclusion:
      "기능명에 B2C U+ 결합 누락을 이유로 단정하지 말 것",
  },
  Tech: {
    subcategoryRole: "ixi 기반 AI 기술·플랫폼 명칭",
    namingTarget: "AI 기술·플랫폼·스택을 가리키는 명칭",
    levelNamingRule:
      "ixi 마스터브랜드와 기술 설명 수식어를 조합하는 형태를 권장하며 가이드에 없는 임의 U+ 결합은 사용하지 않음",
    markConclusion:
      "기술 명칭은 ixi·가이드에 맞게 평가하고 B2C U+ 접두를 기본 전제로 두지 말 것",
  },
};

const BY_MAJOR: Record<NamingCategoryMajor, Record<string, BrandHierarchyRow>> = {
  Personal: PERSONAL,
  Enterprise: ENTERPRISE,
  AI: AI_CAT,
};

export function getBrandHierarchyRow(
  major: NamingCategoryMajor,
  minor: string
): BrandHierarchyRow | null {
  const row = BY_MAJOR[major]?.[minor];
  return row ?? null;
}

export function getNamingRuleForCategory(major: NamingCategoryMajor, minor: string): string {
  const row = getBrandHierarchyRow(major, minor);
  if (!row) return "";
  const first = row.levelNamingRule.split("\n")[0]?.trim() ?? row.levelNamingRule;
  return first;
}

export function buildAuditCategoryContext(major: NamingCategoryMajor, minor: string): string {
  const row = getBrandHierarchyRow(major, minor);
  if (!row) {
    return [
      "브랜드 계층 컨텍스트:",
      `- 대카테고리: ${major}`,
      `- 서브카테고리: ${minor}`,
      "- (등록된 네이밍 룰이 없습니다. 가이드 PDF와 참고 자료를 우선하세요.)",
    ].join("\n");
  }

  return [
    "브랜드 계층 컨텍스트:",
    `- 대카테고리: ${major}`,
    `- 서브카테고리: ${minor} (${row.subcategoryRole})`,
    `- 작명 대상: ${row.namingTarget}`,
    `- 이 레벨의 네이밍 룰: ${row.levelNamingRule}`,
    `- ${row.markConclusion}`,
  ].join("\n");
}

/** `buildAuditCategoryContext` 본문에서 대·서브 파싱 */
export function parseBrandHierarchyFromAuditRaw(auditCategoryRaw: string): {
  major: NamingCategoryMajor;
  minor: string;
} | null {
  const t = auditCategoryRaw.trim();
  if (!t) return null;
  const mMajor = t.match(/대카테고리:\s*(Personal|Enterprise|AI)\b/);
  const mMinor = t.match(/서브카테고리:\s*([^\n(]+?)\s*(?:\(|$)/);
  if (!mMajor || !mMinor) return null;
  const minor = mMinor[1].trim();
  if (!minor) return null;
  return { major: mMajor[1] as NamingCategoryMajor, minor };
}

/**
 * 생성 모드 Gemini: 상위 브랜드(U+, U+tv 등) 접두 금지가 필요한 카테고리일 때만 비어 있지 않은 블록.
 */
export function buildNamingGenerationRuleBlock(
  major: NamingCategoryMajor,
  minor: string
): string {
  const row = getBrandHierarchyRow(major, minor);
  if (!row?.forbidParentBrandPrefixInGeneration) return "";
  return [
    "네이밍 생성 규칙:",
    `- 선택 카테고리: ${major} > ${minor}`,
    "- 이 레벨은 상위 브랜드(U+, U+tv 등) 접두어 없이 독립적인 서비스명으로 작명하는 것이 원칙",
    "- U+ 또는 상위 브랜드명이 포함된 네이밍은 절대 제안하지 말 것",
    "- 반드시 독립 단어 조합으로만 제안할 것",
  ].join("\n");
}

export function buildNamingGenerationRuleBlockFromAuditRaw(auditCategoryRaw: string): string {
  const p = parseBrandHierarchyFromAuditRaw(auditCategoryRaw);
  if (!p) return "";
  return buildNamingGenerationRuleBlock(p.major, p.minor);
}

/**
 * NO-GO 후 추가 제안 네이밍용 — 카테고리별로 평가(`buildAuditCategoryContext`)와 동일 소스.
 */
export function buildAdditionalNamingSuggestionBlock(
  major: NamingCategoryMajor,
  minor: string
): string {
  const row = getBrandHierarchyRow(major, minor);
  if (!row) return "";
  if (row.additionalNamingSuggestionBlock?.trim()) {
    return row.additionalNamingSuggestionBlock.trim();
  }
  const ruleOneLine = row.levelNamingRule.replace(/\s*\n\s*/g, " ").trim();
  return [
    "제안 네이밍 조건:",
    `- 선택 카테고리: ${major} > ${minor}`,
    `- 이 레벨의 네이밍 룰: ${ruleOneLine}`,
    `- ${row.markConclusion}`,
    "- [요청 맥락]과 모순되지 않는 범위에서만 제안하고, 검수에 올린 기존 명칭·슬로건과 동일·유사한 표기는 넣지 말 것",
  ].join("\n");
}

export function buildAdditionalNamingSuggestionBlockFromAuditRaw(auditCategoryRaw: string): string {
  const p = parseBrandHierarchyFromAuditRaw(auditCategoryRaw);
  if (!p) return "";
  return buildAdditionalNamingSuggestionBlock(p.major, p.minor);
}
