import type {
  BrandNamingProposal,
  TierPackageEvaluation,
} from "@/lib/guidelineApi";

import { DEFAULT_TIER_LABELS, NAMING_OVERVIEW_FIELDS } from "./constants";
import type { NamingOverviewFields } from "./types";

export function hasNamingOverviewInput(fields: NamingOverviewFields): boolean {
  return NAMING_OVERVIEW_FIELDS.some(({ key }) => String(fields[key] ?? "").trim().length > 0);
}

/** 작명 개요 6필드를 프롬프트용 멀티라인 텍스트로 변환 */
export function buildNamingOverviewForPrompt(fields: NamingOverviewFields): string {
  const rows = NAMING_OVERVIEW_FIELDS.map(({ key, label }) => {
    const v = (fields[key] ?? "").trim();
    if (!v) return null;
    return `- ${label}: ${v}`;
  }).filter(Boolean) as string[];

  if (rows.length === 0) return "";
  return ["[작명 개요]", ...rows].join("\n").trim();
}

/** etc. 카테고리 전용 안내문 (가이드 PDF·작명개요 우선 강조) */
export function buildAuditCategoryLineForEtc(): string {
  return [
    "브랜드 계층 컨텍스트:",
    "- 대카테고리: etc.",
    "- 서브카테고리: (없음)",
    "- (등록된 네이밍 룰이 없습니다. 가이드 PDF와 참고 자료를 우선하세요.)",
    "",
    "[etc. 전용 지시 — 필수]",
    "- 브랜드 위계체계에 포함되지 않는 내부 사용/프로모션/AI 무관 작명 업무입니다.",
    "- 브랜드 가이드라인 PDF를 최우선 참조하십시오.",
    "- 아래 [작명 개요]의 항목별 내용을 각각 분리해 분석하고, 결론 도출에 반영하십시오.",
    "- 다른 카테고리보다 [작명 개요]의 가중치를 높게 두고 추론하십시오.",
  ].join("\n").trim();
}

/** 단계별 생성 단계 수 변경 시 라벨 배열을 보존·보강 */
export function resizeTierLabels(count: number, prev: string[]): string[] {
  const next = prev.slice(0, count);
  while (next.length < count) {
    next.push(DEFAULT_TIER_LABELS[next.length] ?? `단계 ${next.length + 1}`);
  }
  return next;
}

/** 종합: 창의 30% · 대중 30% · 직관 20% · 확장 20% (계층·적법 미포함) */
export function weightedProposalOverall(p: BrandNamingProposal): number {
  const c = (n: unknown) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
  const o = c(p.originalityDimensionScore);
  const pa = c(p.publicAppealScore);
  const pr = c(p.pronunciationScore);
  const sc = c(p.scalabilityScore);
  const raw = o * 0.3 + pa * 0.3 + pr * 0.2 + sc * 0.2;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/** Pass/Fail 컷오프: 70점 */
export function passFail(score: number): "PASS" | "FAIL" {
  const v = Number.isFinite(score) ? score : 0;
  return v >= 70 ? "PASS" : "FAIL";
}

/** 단계별 패키지 평가 → 단일 Proposal 형태로 정규화 (UI 공통 카드 재사용) */
export function tierPackageToProposal(tp: TierPackageEvaluation): BrandNamingProposal {
  return {
    name: "(단계별 패키지 전체)",
    rationale: "",
    hierarchyScore: tp.hierarchyScore,
    originalityDimensionScore: tp.originalityDimensionScore,
    pronunciationScore: tp.pronunciationScore,
    legalityScore: tp.legalityScore,
    publicAppealScore: tp.publicAppealScore ?? 50,
    scalabilityScore: tp.scalabilityScore ?? 50,
    proposalDetailLogic: tp.proposalDetailLogic,
  };
}
