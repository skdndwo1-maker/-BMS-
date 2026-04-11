/**
 * U+ 브랜드 가이드라인 PDF의 「네이밍 규칙」을 검수 UI 대·소카테고리와 매핑합니다.
 * 가이드 개정·PDF 교체 시 `data/guidelines-meta.json`의 aiSummary 및 원문과 함께 검토하세요.
 *
 * 실제 문구·룰 정의는 프로젝트 루트 `shared/categoryNamingRules.ts` 단일 소스입니다.
 */

export type { NamingCategoryMajor } from "../../../shared/categoryNamingRules";
export {
  buildAdditionalNamingSuggestionBlock,
  buildAdditionalNamingSuggestionBlockFromAuditRaw,
  buildAuditCategoryContext,
  buildNamingGenerationRuleBlock,
  buildNamingGenerationRuleBlockFromAuditRaw,
  getBrandHierarchyRow,
  getNamingRuleForCategory,
  parseBrandHierarchyFromAuditRaw,
} from "../../../shared/categoryNamingRules";
