import type { BrandNamingProposal } from "@/lib/guidelineApi";

/** 검수 진행 단계 */
export type AuditStep = "idle" | "analyzing" | "checking" | "verifying" | "complete";

export const NAMING_AUDIT_MAJORS = ["Personal", "Enterprise", "AI", "etc."] as const;
export type NamingAuditMajor = (typeof NAMING_AUDIT_MAJORS)[number];

export type NamingOverviewKey =
  | "targetUser"
  | "planningIntent"
  | "primaryUse"
  | "namingDirection"
  | "alternatives"
  | "misc";

export type NamingOverviewFields = Record<NamingOverviewKey, string>;

/** 평가 박스 dim 키 (proposal.proposalDetailLogic의 키와 동일) */
export type ProposalEvalDim = keyof BrandNamingProposal["proposalDetailLogic"];
