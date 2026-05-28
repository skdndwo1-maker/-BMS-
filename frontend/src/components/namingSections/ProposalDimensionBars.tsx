import { useState } from "react";
import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { BrandNamingProposal } from "@/lib/guidelineApi";

import {
  NAMING_FAIL_TEXT_MD,
  NAMING_PASS_BADGE_MD,
} from "./constants";
import { NamingEvalProgressBar } from "./NamingEvalProgressBar";
import type { ProposalEvalDim } from "./types";
import { passFail, weightedProposalOverall } from "./utils";

/** 1~2: Pass/Fail · 3~6: 표시 순서 계층→적법→창의→대중→직관→확장, 종합은 창의·대중·직관·확장만 가중 */
const GENERATE_EVAL_BOXES: {
  dim: ProposalEvalDim;
  label: string;
  score: (p: BrandNamingProposal) => number;
  overallWeightPct?: number;
}[] = [
  { dim: "hierarchy", label: "브랜드 계층 정렬", score: (p) => p.hierarchyScore },
  { dim: "legality", label: "적법성", score: (p) => p.legalityScore },
  { dim: "originality", label: "창의성", score: (p) => p.originalityDimensionScore, overallWeightPct: 30 },
  { dim: "publicAppeal", label: "대중성", score: (p) => p.publicAppealScore, overallWeightPct: 30 },
  { dim: "pronunciationLanguage", label: "직관성", score: (p) => p.pronunciationScore, overallWeightPct: 20 },
  { dim: "scalability", label: "확장성", score: (p) => p.scalabilityScore, overallWeightPct: 20 },
];

/** 생성·검수 공통 평가 카드 + 상세 모달. Proposal 단일 객체에 대한 6대 평가 시각화 */
export function ProposalDimensionBars({ proposal }: { proposal: BrandNamingProposal }) {
  const [detailOpen, setDetailOpen] = useState<null | ProposalEvalDim>(null);
  const dl = proposal.proposalDetailLogic ?? {
    hierarchy: "",
    originality: "",
    pronunciationLanguage: "",
    legality: "",
    publicAppeal: "",
    scalability: "",
  };
  const overall = weightedProposalOverall(proposal);

  return (
    <>
      <div className="mt-4 rounded-[22px] border border-[rgba(0,0,0,0.05)] bg-[#FAFAF8] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-5">
          <div className="flex shrink-0 flex-col items-center justify-center rounded-[20px] border border-[rgba(0,0,0,0.06)] bg-white px-5 py-5 text-center shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] sm:w-[min(100%,128px)]">
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-[#FF7F66]/12">
              <Sparkles className="h-5 w-5 text-[#FF7F66]" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">종합</span>
            <span className="mt-0.5 text-[32px] font-bold leading-none tabular-nums text-black sm:text-[36px]">
              {overall}
            </span>
            <span className="mt-0.5 text-[10px] text-gray-400">/ 100</span>
            <span className="mt-2 max-w-[8.5rem] text-center text-[9px] leading-snug text-gray-500">
              창의30%·대중30%
              <br />
              직관20%·확장20%
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pass / Fail</p>
              <div className="grid grid-cols-2 gap-3 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
                {GENERATE_EVAL_BOXES.slice(0, 2).map(({ dim, label, score }) => {
                  const raw = score(proposal);
                  const n = Number(raw);
                  const v = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
                  const passfail = passFail(v);
                  return (
                    <div
                      key={dim}
                      className="relative flex min-h-[88px] min-w-0 flex-col justify-center rounded-[18px] border border-[rgba(0,0,0,0.06)] bg-white px-3 pb-2 pt-2.5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
                    >
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <span className="text-[11px] font-medium text-gray-700">{label}</span>
                      </div>
                      <NamingEvalProgressBar variant="tierLegality" percent={passfail === "PASS" ? 100 : 0} />
                      <div className="mt-1.5 flex w-full min-w-0 items-center justify-between gap-2">
                        <span
                          className={passfail === "PASS" ? NAMING_PASS_BADGE_MD : NAMING_FAIL_TEXT_MD}
                        >
                          {passfail}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 rounded-full px-2.5 text-[12px] font-medium text-gray-500 hover:bg-black/[0.04] hover:text-gray-900"
                          onClick={() => setDetailOpen(dim)}
                        >
                          상세보기
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                종합 가중 (창의 30% · 대중 30% · 직관 20% · 확장 20%) — 계층·적법은 미반영
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] sm:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                {GENERATE_EVAL_BOXES.slice(2, 6).map(({ dim, label, score, overallWeightPct }) => {
                  const raw = score(proposal);
                  const n = Number(raw);
                  const v = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
                  return (
                    <div
                      key={dim}
                      className="relative flex min-h-[88px] min-w-0 flex-col justify-center rounded-[18px] border border-[rgba(0,0,0,0.06)] bg-white px-3 pb-2 pt-2.5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
                    >
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <span className="text-[11px] font-medium text-gray-700">
                          {label}
                          {overallWeightPct != null ? (
                            <span className="ml-1 text-[9px] font-normal text-gray-400">({overallWeightPct}%)</span>
                          ) : null}
                        </span>
                        <span className="text-[12px] font-bold tabular-nums text-[#FF7F66]">{v}</span>
                      </div>
                      <NamingEvalProgressBar percent={v} />
                      <div className="mt-1.5 flex w-full min-w-0 items-center justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 rounded-full px-2.5 text-[12px] font-medium text-gray-500 hover:bg-black/[0.04] hover:text-gray-900"
                          onClick={() => setDetailOpen(dim)}
                        >
                          상세보기
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {detailOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="닫기"
            onClick={() => setDetailOpen(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 flex max-h-[min(80vh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-[22px] border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_8px_40px_-8px_rgba(0,0,0,0.15),0_4px_16px_-6px_rgba(0,0,0,0.08)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.05)] bg-[#FAFAF8] px-5 py-3.5">
              <h3 className="text-sm font-semibold text-gray-900">
                {GENERATE_EVAL_BOXES.find((b) => b.dim === detailOpen)?.label ?? "상세"} — 채점 근거
              </h3>
              <button
                type="button"
                className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-white hover:text-gray-900"
                aria-label="닫기"
                onClick={() => setDetailOpen(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap p-5 text-[13px] leading-relaxed text-gray-700">
              {dl[detailOpen]?.trim() ? dl[detailOpen] : "상세 근거가 비어 있습니다."}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
