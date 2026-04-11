import { Fragment, useState, useRef, useEffect, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileText,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  ArrowUp,
  Download,
  Loader2,
  FileCheck,
  ScanSearch,
  ShieldCheck,
  Scale,
  BadgeCheck,
  ChevronDown,
  X,
  Mic,
  Globe,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  analyzeGuideline,
  fetchGuideline,
  fetchHealth,
  runBrandNaming,
  syncGuidelineFromFixed,
  normalizeNamingProposal,
  type BrandNamingProposal,
  type BrandNamingRunResult,
  type GuidelineInfo,
} from "@/lib/guidelineApi";
import { GUIDELINE_REFERENCE_OPTIONS } from "@/constants/guidelineReferences";
import { buildAuditCategoryContext } from "@/constants/namingCategoryRules";
import { downloadBrandNamingReport, type ExportFormat } from "@/lib/inspectionExport";

// ───────────────────────────────────────────
// Types
// ───────────────────────────────────────────
type AuditStep = "idle" | "analyzing" | "checking" | "verifying" | "complete";

// ───────────────────────────────────────────
// Constants
// ───────────────────────────────────────────
const AUDIT_STEPS = [
  { id: "analyzing", label: "분석", icon: ScanSearch },
  { id: "checking", label: "검토", icon: Scale },
  { id: "verifying", label: "검증", icon: ShieldCheck },
  { id: "complete", label: "완료", icon: CheckCircle2 },
] as const;

const STEP_ORDER: AuditStep[] = ["idle", "analyzing", "checking", "verifying", "complete"];

/** 본문 섹션 타이틀: 기존 대비 약 1.3배 */
const SECTION_TITLE = "text-[19.5px] font-semibold text-gray-900";

/** 검수 — 작명의도 행과 동일 높이(검수명+작명의도 부모 189px·gap-8 기준 flex-[120] 행) */
const NAMING_AUDIT_INTENT_ROW_H_PX = Math.round(((189 - 8) * 120) / 200);
/** 대카테고리만 선택된 상태(서브 미표시): 탭 한 줄만 들어갈 최소 높이 */
const NAMING_AUDIT_CATEGORY_COMPACT_H_PX = 52;

const NAMING_AUDIT_MAJORS = ["Personal", "Enterprise", "AI"] as const;
type NamingAuditMajor = (typeof NAMING_AUDIT_MAJORS)[number];
const NAMING_AUDIT_SUBS: Record<NamingAuditMajor, readonly string[]> = {
  Personal: ["모바일", "인터넷", "IPTV", "스마트홈", "멤버십", "구독", "채널"],
  Enterprise: ["Infra", "Works", "AX"],
  AI: ["Service", "Feature", "Tech"],
};

const categoryTabBase =
  "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43182]/40";
const categoryTabIdle = "border-gray-200 bg-white text-gray-700 hover:border-gray-300";
const categoryTabActive = "border-[#F43182] bg-[#F43182]/10 text-[#F43182]";
const SECTION_ICON = "h-[26px] w-[26px] shrink-0";

// ───────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────

/** 스텝 바 — 스텝은 고정 폭, 연결선만 flex-1로 동일 분배(검증~완료 간만 넓어지는 현상 방지) */
function StepBar({ currentStep }: { currentStep: AuditStep }) {
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-[1280px] mx-auto px-[24px] py-[16px]">
        <div className="flex w-full items-center">
          {AUDIT_STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = index <= currentIdx - 1;
            const isCurrent = index === currentIdx - 1;
            return (
              <Fragment key={step.id}>
                <div className="flex w-[72px] shrink-0 flex-col items-center gap-[8px] sm:w-[88px]">
                  <div
                    className={`flex h-[40px] w-[40px] items-center justify-center rounded-full transition-all
                    ${isActive || isCurrent ? "bg-[#F43182] text-white" : "bg-gray-100 text-gray-400"}
                    ${isCurrent ? "ring-4 ring-[#F43182]/20" : ""}`}
                  >
                    {isCurrent && currentStep !== "complete" ? (
                      <Loader2 className="h-[20px] w-[20px] animate-spin" />
                    ) : (
                      <StepIcon className="h-[20px] w-[20px]" />
                    )}
                  </div>
                  <span
                    className={`text-center text-[12px] font-medium ${isActive || isCurrent ? "text-gray-900" : "text-gray-400"}`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < AUDIT_STEPS.length - 1 ? (
                  <div
                    className={`mx-1 h-[2px] min-w-[8px] flex-1 transition-all sm:mx-2 ${index <= currentIdx - 1 ? "bg-[#F43182]" : "bg-gray-200"}`}
                  />
                ) : null}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 검수 결과 상단 점수 서클 (r·scoreSize 기준 동기 확대) */
const NAMING_AUDIT_GAUGE_R = 84;
const NAMING_AUDIT_GAUGE_DIAMETER_PX = (NAMING_AUDIT_GAUGE_R + 16) * 2;
/** 지름의 3/4만큼 좌측 이동 */
const NAMING_AUDIT_GAUGE_SHIFT_LEFT_PX = Math.round((NAMING_AUDIT_GAUGE_DIAMETER_PX * 3) / 4);
/** 지름의 1/6만큼 아래로(기존 -1cm 보정에 가산) */
const NAMING_AUDIT_GAUGE_SHIFT_DOWN_PX = Math.round(NAMING_AUDIT_GAUGE_DIAMETER_PX / 6);
/** 지름의 1/8만큼 추가로 아래로(크기 유지·위치만 조정) */
const NAMING_AUDIT_GAUGE_SHIFT_DOWN_EIGHTH_PX = Math.round(NAMING_AUDIT_GAUGE_DIAMETER_PX / 8);

/** 점수 게이지 (큰 버전). scoreSize: 중앙 점수 숫자(px), 기본 48 */
function ScoreGauge({ score, r = 85, scoreSize = 48 }: { score: number; r?: number; scoreSize?: number }) {
  const size = (r + 16) * 2;
  const circ = 2 * Math.PI * r;
  const subSize = Math.round(scoreSize * 0.33);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90">
        <circle cx={r+16} cy={r+16} r={r} stroke="#E5E7EB" strokeWidth="16" fill="none" />
        <circle cx={r+16} cy={r+16} r={r} stroke="#F43182" strokeWidth="16" fill="none"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)}
          strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold text-gray-900 leading-none" style={{ fontSize: scoreSize }}>{score}</span>
        <span className="text-gray-500" style={{ fontSize: subSize }}>/ 100</span>
      </div>
    </div>
  );
}

/** 검수 가중합과 동일: 계층 40% · 독창 30% · 발음·언어 20% · 적법 10% */
function weightedProposalOverall(p: BrandNamingProposal): number {
  const h = Math.min(100, Math.max(0, Number(p.hierarchyScore) || 0));
  const o = Math.min(100, Math.max(0, Number(p.originalityDimensionScore) || 0));
  const pr = Math.min(100, Math.max(0, Number(p.pronunciationScore) || 0));
  const l = Math.min(100, Math.max(0, Number(p.legalityScore) || 0));
  return Math.min(100, Math.max(0, Math.round(h * 0.4 + o * 0.3 + pr * 0.2 + l * 0.1)));
}

const GENERATE_EVAL_BOXES: {
  dim: keyof BrandNamingProposal["proposalDetailLogic"];
  label: string;
  score: (p: BrandNamingProposal) => number;
}[] = [
  { dim: "hierarchy", label: "브랜드 계층 정렬", score: (p) => p.hierarchyScore },
  { dim: "originality", label: "독창성", score: (p) => p.originalityDimensionScore },
  { dim: "pronunciationLanguage", label: "발음·언어", score: (p) => p.pronunciationScore },
  { dim: "legality", label: "적법성", score: (p) => p.legalityScore },
];

/** 생성 모드 평가 점수 바 — 대안 1~4 카드 공통: 고정 높이, 트랙·채움 색 통일 */
const NAMING_EVAL_PROGRESS_HEIGHT_PX = 8;

function NamingEvalProgressBar({ percent }: { percent: number }) {
  const v = Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : 0;
  return (
    <div
      className="naming-eval-progress w-full min-w-0 shrink-0 overflow-hidden rounded-full bg-[#EBEBEB]"
      style={{ height: NAMING_EVAL_PROGRESS_HEIGHT_PX }}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full min-h-0 rounded-full bg-[#BEBEBE] transition-[width] duration-150 ease-out"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

function ProposalDimensionBars({ proposal }: { proposal: BrandNamingProposal }) {
  const [detailOpen, setDetailOpen] = useState<null | keyof BrandNamingProposal["proposalDetailLogic"]>(null);
  const dl = proposal.proposalDetailLogic ?? {
    hierarchy: "",
    originality: "",
    pronunciationLanguage: "",
    legality: "",
  };
  const overall = weightedProposalOverall(proposal);

  return (
    <>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4">
        <div className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-gray-100 bg-gray-50/80 px-6 py-4 sm:w-[min(100%,112px)]">
          <span className="text-[11px] font-medium text-gray-500">종합</span>
          <span className="mt-1 text-[30px] font-bold tabular-nums leading-none text-[#E91E8C] sm:text-[34px]">{overall}</span>
          <span className="mt-0.5 text-[10px] text-gray-400">/ 100</span>
          <span className="mt-2 max-w-[7.5rem] text-center text-[9px] leading-snug text-gray-500">
            4항목 가중합
            <br />
            (계층40%·독창30%·발음·언어20%·적법10%)
          </span>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
          {GENERATE_EVAL_BOXES.map(({ dim, label, score }) => {
            const raw = score(proposal);
            const n = Number(raw);
            const v = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
            return (
              <div
                key={dim}
                className="relative flex min-h-[72px] min-w-0 flex-col justify-center rounded-lg border border-gray-100 bg-gray-50/80 px-3 pb-2 pt-7"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-7 px-2 text-[10px] font-medium text-gray-500 hover:text-gray-800"
                  onClick={() => setDetailOpen(dim)}
                >
                  상세보기
                </Button>
                <div className="mb-1 flex items-center justify-between gap-1 pr-12">
                  <span className="text-[11px] font-medium text-gray-600">{label}</span>
                  <span className="text-[12px] font-bold tabular-nums text-[#E91E8C]">{v}</span>
                </div>
                <NamingEvalProgressBar percent={v} />
              </div>
            );
          })}
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
            className="relative z-10 flex max-h-[min(80vh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                {GENERATE_EVAL_BOXES.find((b) => b.dim === detailOpen)?.label ?? "상세"} — 채점 근거
              </h3>
              <button
                type="button"
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                aria-label="닫기"
                onClick={() => setDetailOpen(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-[13px] leading-relaxed text-gray-800 whitespace-pre-wrap">
              {dl[detailOpen]?.trim() ? dl[detailOpen] : "상세 근거가 비어 있습니다."}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ───────────────────────────────────────────
// Main Component
// ───────────────────────────────────────────
export function BrandNaming() {
  const navigate = useNavigate();

  const [namingInput, setNamingInput] = useState("");
  /** 검수 모드 전용: 위·아래 분리 입력 */
  const [auditName, setAuditName] = useState("");
  const [namingIntent, setNamingIntent] = useState("");
  const [auditCategoryMajor, setAuditCategoryMajor] = useState<NamingAuditMajor | null>(null);
  const [auditCategoryMinor, setAuditCategoryMinor] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceText, setReferenceText] = useState("");
  const [namingMode, setNamingMode] = useState<"generate" | "audit">("audit");
  const [currentStep, setCurrentStep] = useState<AuditStep>("idle");
  const [namingResult, setNamingResult] = useState<BrandNamingRunResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [serverGuideline, setServerGuideline] = useState<GuidelineInfo | null>(null);
  const [guidelineLoading, setGuidelineLoading] = useState(false);
  const [guidelineUploadError, setGuidelineUploadError] = useState<string | null>(null);
  const [guidelineAnalyzing, setGuidelineAnalyzing] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [guidelineDetailOpen, setGuidelineDetailOpen] = useState(false);
  const [selectedGuidelineLibrary, setSelectedGuidelineLibrary] = useState("");
  const [namingExportFormat, setNamingExportFormat] = useState<ExportFormat>("pdf");
  const [auditLogicModalOpen, setAuditLogicModalOpen] = useState(false);
  const [auditZoomDimension, setAuditZoomDimension] = useState<
    null | "hierarchy" | "originality" | "pronunciation" | "legality"
  >(null);

  const referenceInputRef = useRef<HTMLInputElement>(null);
  const namingStepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    void fetchHealth()
      .then((h) => setGeminiConfigured(h.gemini))
      .catch(() => setGeminiConfigured(null));
  }, []);

  useEffect(() => {
    if (!guidelineDetailOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [guidelineDetailOpen]);

  useEffect(() => {
    return () => {
      namingStepTimersRef.current.forEach(clearTimeout);
      namingStepTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedGuidelineLibrary) {
      setServerGuideline(null);
      setGuidelineUploadError(null);
      setGuidelineLoading(false);
      return;
    }
    void (async () => {
      setGuidelineLoading(true);
      setGuidelineUploadError(null);
      try {
        const synced = await syncGuidelineFromFixed(selectedGuidelineLibrary);
        if (cancelled) return;
        setServerGuideline(synced.guideline);
      } catch (e) {
        if (!cancelled) {
          setServerGuideline(null);
          setGuidelineUploadError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setGuidelineLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedGuidelineLibrary]);

  const handleAnalyzeStoredGuideline = () => {
    if (!selectedGuidelineLibrary) return;
    setGuidelineUploadError(null);
    void (async () => {
      setGuidelineAnalyzing(true);
      try {
        await analyzeGuideline(selectedGuidelineLibrary);
        const g = await fetchGuideline(selectedGuidelineLibrary);
        setServerGuideline(g);
      } catch (err) {
        setGuidelineUploadError(err instanceof Error ? err.message : String(err));
      } finally {
        setGuidelineAnalyzing(false);
      }
    })();
  };

  const isRunning = currentStep !== "idle" && currentStep !== "complete";
  const auditCategoryLine =
    auditCategoryMajor && auditCategoryMinor.trim()
      ? buildAuditCategoryContext(auditCategoryMajor, auditCategoryMinor.trim())
      : "";

  const namingCanSubmit =
    namingMode === "audit"
      ? Boolean(
          (auditName.trim() || namingIntent.trim()) &&
            auditCategoryMajor &&
            auditCategoryMinor.trim()
        )
      : Boolean(
          namingInput.trim() && auditCategoryMajor && auditCategoryMinor.trim()
        );
  const overallScore = namingResult?.overallScore ?? null;
  const finalVerdict =
    namingResult?.goRecommendation === "go" || (overallScore !== null && overallScore >= 70) ? "go" : "no-go";

  const handleReferenceUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setReferenceFile(file);
  };

  const handleReferenceFileCancel = () => {
    setReferenceFile(null);
    if (referenceInputRef.current) referenceInputRef.current.value = "";
  };

  const switchNamingMode = (mode: "generate" | "audit") => {
    setNamingMode(mode);
    setShowResults(false);
    setNamingResult(null);
    setCurrentStep("idle");
    setRunError(null);
    setAuditLogicModalOpen(false);
    setAuditZoomDimension(null);
    namingStepTimersRef.current.forEach(clearTimeout);
    namingStepTimersRef.current = [];
  };

  const primaryCtaLabel =
    namingMode === "generate" ? "AI 브랜드 네이밍 생성" : "AI 브랜드 네이밍 검수";

  const namingRequestExportText =
    namingMode === "audit"
      ? `${auditCategoryLine ? `${auditCategoryLine}\n\n` : ""}[검수명]\n${auditName.trim()}\n\n[작명의도]\n${namingIntent.trim()}`
      : `${auditCategoryLine ? `${auditCategoryLine}\n\n` : ""}[생성 요청]\n${namingInput}`;

  const handleNamingReportDownload = () => {
    if (!namingResult) return;
    downloadBrandNamingReport(
      {
        mode: namingMode,
        result: namingResult,
        requestText: namingRequestExportText,
        referenceText,
      },
      namingExportFormat
    );
  };

  /** 검수 결과에서 입력·참고·결과 상태를 초기화하고 검수 입력부터 다시 시작 */
  const handleAuditResetToInput = () => {
    namingStepTimersRef.current.forEach(clearTimeout);
    namingStepTimersRef.current = [];
    setAuditLogicModalOpen(false);
    setAuditZoomDimension(null);
    setShowResults(false);
    setNamingResult(null);
    setRunError(null);
    setCurrentStep("idle");
    setNamingInput("");
    setAuditName("");
    setNamingIntent("");
    setAuditCategoryMajor(null);
    setAuditCategoryMinor("");
    setReferenceText("");
    setReferenceFile(null);
    if (referenceInputRef.current) referenceInputRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleVerify = () => {
    if (!namingCanSubmit || isRunning) return;
    setRunError(null);
    setNamingResult(null);
    setShowResults(false);
    namingStepTimersRef.current.forEach(clearTimeout);
    namingStepTimersRef.current = [];
    setCurrentStep("analyzing");
    namingStepTimersRef.current.push(
      setTimeout(() => setCurrentStep("checking"), 600),
      setTimeout(() => setCurrentStep("verifying"), 1200)
    );

    const clearNamingStepTimers = () => {
      namingStepTimersRef.current.forEach(clearTimeout);
      namingStepTimersRef.current = [];
    };

    void (async () => {
      try {
        const res = await runBrandNaming({
          mode: namingMode,
          requestText: namingMode === "generate" ? namingInput : "",
          auditName: namingMode === "audit" ? auditName : undefined,
          namingIntent: namingMode === "audit" ? namingIntent : undefined,
          auditCategory: auditCategoryLine || undefined,
          referenceText,
          supplementaryReference: referenceFile,
          useGuidelineLibrary: Boolean(selectedGuidelineLibrary),
          guidelineId: selectedGuidelineLibrary || undefined,
        });
        clearNamingStepTimers();
        setNamingResult(res);
        setShowResults(true);
        setCurrentStep("complete");
      } catch (e) {
        clearNamingStepTimers();
        setRunError(e instanceof Error ? e.message : String(e));
        setCurrentStep("idle");
      }
    })();
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">

      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" type="button" onClick={() => navigate("/options")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                옵션으로
              </Button>
              <div className="h-6 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0">
                  <img src="/uplus-main-logo.png" alt="U+ Layer" className="h-full w-full object-contain" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">U+ Layer</h1>
                  <p className="text-xs text-gray-500">브랜드 네이밍 검토 Brand Naming Audit</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── 스텝 바 ── */}
      {namingMode === "audit" && currentStep !== "idle" && <StepBar currentStep={currentStep} />}

      {/* ── 메인 ── */}
      <main className="max-w-[1280px] mx-auto px-[24px] py-[32px]">
        <div className="flex flex-col gap-[24px]">

          {/* 카테고리 선택 (요청 내용 입력 위) — 생성·검수 동일 */}
          <div className="rounded-[12px] border border-gray-200 bg-white px-[32px] pb-2 pt-[21px]">
              <div className="mb-[16px] flex min-w-0 items-center gap-[8px]">
                <Layers className={`${SECTION_ICON} text-[#F43182]`} />
                <h2 className={SECTION_TITLE}>카테고리 선택</h2>
              </div>
              <div
                className={`flex min-h-0 flex-col gap-2 ${auditCategoryMajor ? "justify-center" : "justify-start"}`}
                style={
                  auditCategoryMajor
                    ? { minHeight: NAMING_AUDIT_INTENT_ROW_H_PX, height: NAMING_AUDIT_INTENT_ROW_H_PX }
                    : { minHeight: NAMING_AUDIT_CATEGORY_COMPACT_H_PX, height: "auto" }
                }
              >
                <div className="flex flex-wrap gap-2">
                  {NAMING_AUDIT_MAJORS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setAuditCategoryMajor(m);
                        setAuditCategoryMinor("");
                      }}
                      className={`${categoryTabBase} ${auditCategoryMajor === m ? categoryTabActive : categoryTabIdle}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {auditCategoryMajor ? (
                  <div className="flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto">
                    {NAMING_AUDIT_SUBS[auditCategoryMajor].map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setAuditCategoryMinor(sub)}
                        className={`${categoryTabBase} ${auditCategoryMinor === sub ? categoryTabActive : categoryTabIdle}`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

          {/* Row 1: 요청 내용 — 상·하 패딩 32px 대비 약 1/3 축소(≈21px), 좌우 32px 유지 */}
          <div className="rounded-[12px] border border-gray-200 bg-white px-[32px] pb-[21px] pt-[21px]">
            <div className="mb-[16px] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-[8px]">
                <Sparkles className={`${SECTION_ICON} text-[#F43182]`} />
                <h2 className={SECTION_TITLE}>요청 내용 입력</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                <Button
                  type="button"
                  size="sm"
                  variant={namingMode === "generate" ? "default" : "outline"}
                  className={namingMode === "generate" ? "bg-[#F43182] hover:bg-[#d41f6e]" : ""}
                  onClick={() => switchNamingMode("generate")}
                >
                  생성
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={namingMode === "audit" ? "default" : "outline"}
                  className={namingMode === "audit" ? "bg-[#F43182] hover:bg-[#d41f6e]" : ""}
                  onClick={() => switchNamingMode("audit")}
                >
                  검수
                </Button>
              </div>
            </div>
            {namingMode === "generate" ? (
              <textarea
                value={namingInput}
                onChange={(e) => setNamingInput(e.target.value)}
                placeholder="브랜드명·슬로건 후보, 또는 네이밍에 대한 요청 사항을 입력하세요..."
                rows={2}
                className="h-[88px] min-h-[88px] w-full resize-y rounded-[12px] border-2 border-gray-200 px-[24px] py-[12px] text-[20px] font-semibold outline-none transition-all placeholder:font-normal placeholder:text-gray-300 focus:border-[#F43182] focus:ring-4 focus:ring-[#F43182]/20"
              />
            ) : (
              <div className="flex h-[189px] min-h-[189px] flex-col gap-2">
                <div className="flex min-h-0 shrink-0 flex-[80] flex-col gap-1">
                  <label htmlFor="naming-audit-name" className="text-[12px] font-medium text-gray-600">
                    검수명
                  </label>
                  <textarea
                    id="naming-audit-name"
                    value={auditName}
                    onChange={(e) => setAuditName(e.target.value)}
                    placeholder="검수할 브랜드명·표현을 입력하세요"
                    className="min-h-0 flex-1 resize-none rounded-[12px] border-2 border-gray-200 px-[20px] py-[12px] text-[18px] font-semibold outline-none transition-all placeholder:font-normal placeholder:text-gray-300 focus:border-[#F43182] focus:ring-4 focus:ring-[#F43182]/20"
                  />
                </div>
                <div className="flex min-h-0 flex-[120] flex-col gap-1">
                  <label htmlFor="naming-intent" className="text-[12px] font-medium text-gray-600">
                    작명의도
                  </label>
                  <textarea
                    id="naming-intent"
                    value={namingIntent}
                    onChange={(e) => setNamingIntent(e.target.value)}
                    placeholder="작명 배경·의도·톤 등을 입력하세요"
                    className="min-h-0 flex-1 resize-none rounded-[12px] border-2 border-gray-200 px-[20px] py-[12px] text-[18px] font-semibold outline-none transition-all placeholder:font-normal placeholder:text-gray-300 focus:border-[#F43182] focus:ring-4 focus:ring-[#F43182]/20"
                  />
                </div>
              </div>
            )}
            <p className="mt-[12px] px-[2px] text-[13px] text-gray-500">
              {namingMode === "generate"
                ? "생성 모드: 상단에서 카테고리를 선택한 뒤 요청을 입력하면, 동일한 브랜드 계층 맥락으로 네이밍 후보를 제안합니다."
                : "검수 모드: 입력하신 문구를 가이드라인·참고 자료 기준으로 평가합니다."}
            </p>
            <p className="mt-[8px] px-[2px] text-[12px] text-gray-400">
              이 입력란·참고 직접 입력·업로드 파일·선택한 저장 참고 문서는 서버에서 하나의 맥락으로 묶여 Gemini로 전달됩니다.
            </p>
          </div>

          {runError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{runError}</div>
          )}

          {/* Row 2: 참고 자료 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[24px]">

            {/* 파일 업로드 */}
            <div className="rounded-[12px] border border-gray-200 bg-white p-[24px]">
              <div className="mb-[16px] flex items-center gap-[8px]">
                <FileText className={`${SECTION_ICON} text-blue-500`} />
                <h2 className={SECTION_TITLE}>브랜드 전략 & 계층 문서 업로드</h2>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => referenceInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    referenceInputRef.current?.click();
                  }
                }}
                className="mb-[16px] flex h-[140px] cursor-pointer items-center justify-center rounded-[12px] border-2 border-dashed border-gray-300 text-center transition-all hover:border-blue-400 hover:bg-blue-50/50"
              >
                {referenceFile ? (
                  <div className="flex flex-col items-center gap-[8px] p-[16px]">
                    <FileText className="h-12 w-12 text-blue-500" />
                    <p className="text-[13px] text-gray-600">{referenceFile.name}</p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          referenceInputRef.current?.click();
                        }}
                      >
                        파일 변경
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-gray-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReferenceFileCancel();
                        }}
                      >
                        취소
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-[8px] p-[16px]">
                    <div className="w-[48px] h-[48px] bg-blue-100 rounded-full flex items-center justify-center">
                      <Upload className="w-[24px] h-[24px] text-blue-500" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-gray-900 mb-[4px]">파일 직접 업로드</p>
                      <p className="text-[11px] text-gray-500">PDF, PNG, JPEG 지원</p>
                    </div>
                  </div>
                )}
              </div>
              <input ref={referenceInputRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={handleReferenceUpload} />

              {/* 구분선 */}
              <div className="relative mb-[16px]">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center"><span className="bg-white px-[8px] text-[12px] text-gray-500">또는</span></div>
              </div>

              <div>
                <label className="mb-[8px] block text-[13px] font-medium text-gray-700" htmlFor="naming-reference-guideline">
                  저장된 참고 문서에서 선택
                </label>
                <div className="relative shrink-0">
                  <select
                    id="naming-reference-guideline"
                    value={selectedGuidelineLibrary}
                    onChange={(e) => setSelectedGuidelineLibrary(e.target.value)}
                    className="w-full cursor-pointer appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-9 text-sm text-gray-800"
                  >
                    <option value="">참고 문서 선택…</option>
                    {GUIDELINE_REFERENCE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-gray-500"
                  />
                </div>
                {guidelineUploadError && (
                  <p className="mt-2 line-clamp-2 text-[11px] text-red-600">{guidelineUploadError}</p>
                )}
              </div>

              <div className="mt-2 min-h-0 shrink-0 rounded-lg border border-violet-100 bg-violet-50/60 p-2.5 text-xs text-gray-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-violet-900">서버 연동 상태</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {guidelineLoading ? (
                      <span className="inline-flex items-center gap-1.5 text-gray-500">
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                        확인 중
                      </span>
                    ) : (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          serverGuideline?.hasFile ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {serverGuideline?.hasFile ? "ON" : "OFF"}
                      </span>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 border-violet-300 text-[11px]"
                      disabled={guidelineLoading}
                      onClick={() => setGuidelineDetailOpen(true)}
                    >
                      상세 보기
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* 직접 입력 */}
            <div className="rounded-[12px] border border-gray-200 bg-white p-[24px]">
              <div className="mb-[16px] flex items-center gap-[8px]">
                <FileText className={`${SECTION_ICON} text-blue-500`} />
                <h2 className={SECTION_TITLE}>참고 정보 직접 입력</h2>
              </div>
              <textarea
                value={referenceText}
                onChange={(e) => setReferenceText(e.target.value)}
                placeholder={"브랜드 계층 구조, 네이밍 룰, 전략적 방향성을 입력하세요...\n\n예시:\n• Master Brand: Brand'uty\n• Sub-brand Structure: [서비스명] by Brand'uty\n• Naming Convention: 명확성, 발음 용이성, 글로벌 확장 가능성\n• Target Industry: 디자인 자동화 SaaS"}
                className="w-full h-[248px] px-[16px] py-[12px] text-[13px] border border-gray-200 rounded-[12px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 resize-none"
              />
              <p className="mt-2 text-[11px] text-gray-400">
                이 내용은 네이밍 요청과 함께 서버로 전달되어 Gemini 추론에 포함됩니다.
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleVerify}
            disabled={!namingCanSubmit || isRunning}
            className="h-14 w-full bg-[#F43182] text-base font-semibold text-white shadow-lg hover:bg-[#d41f6e] disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {namingMode === "generate" ? "생성 중…" : "검증 진행 중…"}
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 h-5 w-5" />
                {primaryCtaLabel}
              </>
            )}
          </Button>

          {/* ── 결과 섹션 ── */}
          {showResults && namingResult && (
            <>
              {namingMode === "generate" && (
                <>
                <div className="rounded-[12px] border-2 border-[#F43182]/35 bg-gradient-to-br from-pink-50/90 via-white to-violet-50/50 p-[28px] shadow-sm">
                  <div className="mb-[10px] flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-[12px]">
                      <div className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-[#F43182] text-white shadow-md">
                        <Sparkles className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="text-[22px] font-bold text-gray-900">AI 네이밍 제안 (4안)</h2>
                        <p className="mt-[6px] text-[13px] leading-snug text-gray-600">
                          각 안의 종합 점수는 4개 평가 항목의 가중합(계층 40%·독창 30%·발음·언어 20%·적법 10%)입니다.
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pt-0.5">
                      <label htmlFor="naming-generate-report-format" className="sr-only">
                        생성 리포트 파일 형식
                      </label>
                      <div className="relative shrink-0">
                        <select
                          id="naming-generate-report-format"
                          value={namingExportFormat}
                          onChange={(e) => setNamingExportFormat(e.target.value as ExportFormat)}
                          className="cursor-pointer appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-2 pr-8 text-xs text-gray-800"
                        >
                          <option value="pdf">PDF</option>
                          <option value="png">PNG</option>
                          <option value="jpeg">JPEG</option>
                        </select>
                        <ChevronDown
                          aria-hidden
                          className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500"
                        />
                      </div>
                      <Button type="button" variant="outline" size="sm" className="border-gray-300" onClick={handleNamingReportDownload}>
                        <Download className="mr-2 h-4 w-4 shrink-0" />
                        생성 리포트 다운로드
                      </Button>
                    </div>
                  </div>
                  {(namingResult.namingProposals?.length ?? 0) > 0 ? (
                    <ul className="flex flex-col gap-3">
                      {(namingResult.namingProposals ?? []).map((raw, i) => {
                        const p = normalizeNamingProposal(raw);
                        return (
                        <li
                          key={`${i}-${p.name}`}
                          className="rounded-[12px] border border-pink-200/90 bg-white p-5 shadow-sm"
                        >
                          <div className="mb-2 flex flex-wrap items-baseline gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#F43182]">
                              대안 {i + 1}
                            </span>
                            <h3 className="text-[18px] font-bold text-gray-900">{p.name}</h3>
                          </div>
                          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">{p.rationale}</p>
                          <ProposalDimensionBars proposal={p} />
                        </li>
                        );
                      })}
                    </ul>
                  ) : namingResult.suggestedNames.length > 0 ? (
                    <ul className="flex flex-col gap-4">
                      {namingResult.suggestedNames.map((name, i) => (
                        <li
                          key={`${i}-${name}`}
                          className="rounded-[10px] border border-pink-200/80 bg-white px-4 py-3 text-[15px] font-semibold text-gray-900"
                        >
                          대안 {i + 1}: {name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-[13px] text-amber-900">
                      제안 후보가 비어 있습니다. 요청을 구체화하거나 참고 문서를 선택한 뒤 다시 시도해 보세요.
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  className="mt-8 h-14 w-full bg-[#F43182] text-base font-semibold text-white shadow-lg hover:bg-[#d41f6e]"
                  onClick={handleAuditResetToInput}
                >
                  <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/90 bg-white/15">
                    <ArrowUp className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                  </span>
                  처음으로
                </Button>
                </>
              )}

              {/* 종합 적합성 점수 — 검수 모드 (가중 채점 4항목) */}
              {namingMode === "audit" && overallScore !== null && namingResult && (() => {
                const dim = {
                  hierarchy: namingResult.hierarchyScore,
                  originality: namingResult.originalityDimensionScore ?? namingResult.trademarkScore,
                  pronunciation: namingResult.pronunciationScore ?? namingResult.pronunciationLanguageScore ?? 0,
                  legality: namingResult.legalityScore ?? namingResult.copyrightScore,
                };
                const dl = namingResult.detailLogic ?? {
                  hierarchy: "",
                  originality: "",
                  pronunciationLanguage: "",
                  legality: "",
                };
                return (
              <div className="overflow-x-visible bg-gradient-to-br from-white to-gray-50 rounded-[12px] border-2 border-gray-200 p-[24px] sm:p-[32px]">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-[20px] font-bold text-gray-900 mb-[4px]">종합 적합성 점수</h2>
                    <p className="text-[13px] text-gray-500">가중합 100점 (계층 40% · 독창 30% · 발음·언어 20% · 적법성 10%)</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <label htmlFor="naming-audit-report-format" className="sr-only">
                      검수 리포트 파일 형식
                    </label>
                    <div className="relative shrink-0">
                      <select
                        id="naming-audit-report-format"
                        value={namingExportFormat}
                        onChange={(e) => setNamingExportFormat(e.target.value as ExportFormat)}
                        className="cursor-pointer appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-2 pr-8 text-xs text-gray-800"
                      >
                        <option value="pdf">PDF</option>
                        <option value="png">PNG</option>
                        <option value="jpeg">JPEG</option>
                      </select>
                      <ChevronDown
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500"
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" className="border-gray-300" onClick={handleNamingReportDownload}>
                      <Download className="mr-2 h-4 w-4 shrink-0" />
                      검수 리포트 다운로드
                    </Button>
                  </div>
                </div>

                <div className="grid w-full min-w-0 grid-cols-1 gap-4 overflow-x-visible lg:min-h-[320px] lg:grid-cols-[auto_minmax(0,1fr)] lg:grid-rows-[auto_auto] lg:items-stretch lg:gap-x-5 lg:gap-y-3">
                  <div
                    className="flex h-full min-h-0 w-full min-w-0 items-center justify-center"
                    style={{
                      transform: `translate(-${NAMING_AUDIT_GAUGE_SHIFT_LEFT_PX}px, calc(-1cm + ${NAMING_AUDIT_GAUGE_SHIFT_DOWN_PX + NAMING_AUDIT_GAUGE_SHIFT_DOWN_EIGHTH_PX}px))`,
                    }}
                  >
                    <ScoreGauge score={overallScore} r={NAMING_AUDIT_GAUGE_R} scoreSize={60} />
                  </div>
                  <div
                    className={`flex min-h-0 min-w-0 w-full max-w-full flex-col justify-between rounded-xl border-2 p-5 lg:max-w-none lg:w-[150%] lg:-ml-[50%] ${
                      finalVerdict === "go" ? "border-green-200 bg-green-50/80" : "border-red-200 bg-red-50/80"
                    }`}
                  >
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <h3
                        className={`text-[18px] font-bold ${finalVerdict === "go" ? "text-green-900" : "text-red-900"}`}
                      >
                        {finalVerdict === "go" ? "사용 권장 (GO)" : "재검토 필요 (NO-GO)"}
                      </h3>
                      <p
                        className={`mt-2 text-[13px] leading-relaxed ${finalVerdict === "go" ? "text-green-800" : "text-red-800"}`}
                      >
                        {namingResult.finalSummary}
                      </p>
                    </div>
                    <div className="mt-3 flex shrink-0 flex-wrap justify-end gap-2 border-t border-black/5 pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={finalVerdict === "go" ? "border-green-600 text-green-800" : "border-red-600 text-red-800"}
                        onClick={() => setAuditLogicModalOpen(true)}
                      >
                        <FileCheck className="mr-2 h-4 w-4" />
                        상세 논리 보기
                      </Button>
                    </div>
                  </div>
                  <div
                    className="flex min-h-0 w-full min-w-0 items-center justify-center"
                    style={{ transform: `translateX(-${NAMING_AUDIT_GAUGE_SHIFT_LEFT_PX}px)` }}
                  >
                    <div
                      className="grid w-full max-w-full shrink-0 grid-cols-4 items-center gap-[2.2px] overflow-visible bg-transparent px-[2.2px] py-[6.6px] text-center"
                      style={{ width: NAMING_AUDIT_GAUGE_DIAMETER_PX, maxWidth: "100%" }}
                    >
                      {(
                        [
                          { label: "계층", val: dim.hierarchy },
                          { label: "독창", val: dim.originality },
                          { label: "발음", val: dim.pronunciation },
                          { label: "적법", val: dim.legality },
                        ] as const
                      ).map((row) => (
                        <div
                          key={row.label}
                          className="flex min-w-0 flex-row items-baseline justify-center gap-[2.2px] leading-none"
                        >
                          <span className="shrink-0 whitespace-nowrap text-[9.9px] text-gray-400 sm:text-[11px]">{row.label}</span>
                          <span className="text-[12.1px] font-semibold tabular-nums text-[#F43182] sm:text-[13.2px]">{row.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex h-full min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:max-w-none lg:w-[150%] lg:-ml-[50%]">
                    <p className="mb-1 shrink-0 text-[12px] font-semibold tracking-wide text-gray-600">AI 추가 제안 네이밍</p>
                    <p className="mb-2 shrink-0 text-[11px] leading-snug text-gray-500">
                      Gemini가 검수 맥락(가이드·작명 의도)을 반영해, 검수 대상과 다른 대안 이름만 제안합니다.
                    </p>
                    <div className="min-h-0 flex-1 overflow-y-auto text-[13px] leading-relaxed text-gray-700">
                      {(namingResult.additionalNamingSuggestions?.length ?? 0) > 0 ? (
                        <ul className="list-disc space-y-1.5 pl-4">
                          {(namingResult.additionalNamingSuggestions ?? []).map((name, idx) => (
                            <li key={`${idx}-${name}`}>{name}</li>
                          ))}
                        </ul>
                      ) : (namingResult.namingGeminiConfigured ?? geminiConfigured) === false ? (
                        <p className="text-[13px] leading-relaxed text-amber-800">
                          서버에 <code className="rounded bg-amber-100 px-1 text-[12px]">GEMINI_API_KEY</code>가 없어 Gemini 연동이 꺼져 있습니다. 프로젝트 루트{" "}
                          <code className="rounded bg-amber-100 px-1 text-[12px]">.env</code>에 키를 넣고 서버를 재시작하면 이 영역에 AI 추가 제안이 채워집니다.
                        </p>
                      ) : (
                        <p className="text-[13px] text-gray-500">
                          Gemini가 추가 제안을 비웠습니다. 검수명·작명 의도를 구체화한 뒤 검수를 다시 실행해 보세요.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    {
                      id: "hierarchy" as const,
                      title: "브랜드 계층 정렬",
                      w: 40,
                      score: dim.hierarchy,
                      icon: BadgeCheck,
                      iconCls: "text-green-600",
                      body: (
                        <>
                          <p className="mb-2 text-[14px] leading-relaxed text-gray-700">{namingResult.hierarchy.message}</p>
                          <p className="text-[14px] leading-relaxed text-gray-700">{namingResult.hierarchy.details}</p>
                          {dl.hierarchy ? (
                            <p className="mt-2 whitespace-pre-wrap border-t border-gray-100 pt-2 text-[14px] leading-relaxed text-gray-700">
                              {dl.hierarchy}
                            </p>
                          ) : null}
                        </>
                      ),
                    },
                    {
                      id: "originality" as const,
                      title: "독창성",
                      w: 30,
                      score: dim.originality,
                      icon: Sparkles,
                      iconCls: "text-[#F43182]",
                      body: (
                        <>
                          <p className="mb-2 text-[14px] leading-relaxed text-gray-700">{namingResult.trademark.recommendation}</p>
                          {namingResult.trademark.conflicts.slice(0, 4).map((c, i) => (
                            <div key={i} className="mb-1 text-[14px] leading-relaxed text-gray-700">
                              · {c.name} ({c.similarity}%)
                            </div>
                          ))}
                          {dl.originality ? (
                            <p className="mt-2 whitespace-pre-wrap border-t border-gray-100 pt-2 text-[14px] leading-relaxed text-gray-700">
                              {dl.originality}
                            </p>
                          ) : null}
                        </>
                      ),
                    },
                    {
                      id: "pronunciation" as const,
                      title: "발음·언어",
                      w: 20,
                      score: dim.pronunciation,
                      icon: Mic,
                      iconCls: "text-violet-600",
                      body: (
                        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-gray-700">
                          {dl.pronunciationLanguage?.trim()
                            ? dl.pronunciationLanguage
                            : "발음·언어 항목이 아직 없습니다. 다시 검수하거나 잠시 후 재시도해 주세요."}
                        </p>
                      ),
                    },
                    {
                      id: "legality" as const,
                      title: "적법성",
                      w: 10,
                      score: dim.legality,
                      icon: Scale,
                      iconCls: "text-orange-600",
                      body: (
                        <>
                          <p className="mb-2 text-[14px] leading-relaxed text-gray-700">{namingResult.copyright.verdict}</p>
                          {namingResult.copyright.risks.slice(0, 4).map((risk, i) => (
                            <div key={i} className="mb-1 text-[14px] leading-relaxed text-gray-700">
                              · {risk.type}: {risk.description}
                            </div>
                          ))}
                          {dl.legality ? (
                            <p className="mt-2 whitespace-pre-wrap border-t border-gray-100 pt-2 text-[14px] leading-relaxed text-gray-700">
                              {dl.legality}
                            </p>
                          ) : null}
                        </>
                      ),
                    },
                  ].map((box) => {
                    const BoxIcon = box.icon;
                    return (
                    <div
                      key={box.id}
                      className="flex h-[320px] flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <BoxIcon className={`mt-0.5 h-[22px] w-[22px] shrink-0 ${box.iconCls}`} />
                          <h4 className="line-clamp-3 text-[18px] font-semibold leading-tight text-gray-900">{box.title}</h4>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="block text-[13px] text-gray-400">{box.w}%</span>
                          <span className="text-[19px] font-bold tabular-nums leading-none text-[#F43182]">{box.score}</span>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto pr-1 leading-relaxed">{box.body}</div>
                      <div className="mt-2 flex shrink-0 justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-[13px] text-gray-600"
                          onClick={() => setAuditZoomDimension(box.id)}
                        >
                          상세보기
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  className="mt-8 h-14 w-full bg-[#F43182] text-base font-semibold text-white shadow-lg hover:bg-[#d41f6e]"
                  onClick={handleAuditResetToInput}
                >
                  <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/90 bg-white/15">
                    <ArrowUp className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                  </span>
                  처음으로
                </Button>
              </div>
                );
              })()}
            </>
          )}
        </div>
      </main>

      {guidelineDetailOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="배경 닫기"
            onClick={() => setGuidelineDetailOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="naming-guideline-detail-title"
            className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 id="naming-guideline-detail-title" className="text-sm font-semibold text-gray-900">
                서버 연동 상세
              </h3>
              <button
                type="button"
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                aria-label="닫기"
                onClick={() => setGuidelineDetailOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-xs text-gray-700">
              {guidelineUploadError && (
                <p className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-red-800">{guidelineUploadError}</p>
              )}
              {guidelineLoading ? (
                <p className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  불러오는 중…
                </p>
              ) : serverGuideline?.hasFile ? (
                <>
                  <p className="text-gray-600">
                    등록 파일:{" "}
                    <span className="font-medium text-gray-900">{serverGuideline.originalName ?? "—"}</span>
                  </p>
                  {serverGuideline.uploadedAt && (
                    <p className="mt-1 text-gray-500">
                      업로드: {new Date(serverGuideline.uploadedAt).toLocaleString()}
                    </p>
                  )}
                  {serverGuideline.aiSummary && (
                    <p className="mt-3 whitespace-pre-wrap text-gray-800">{serverGuideline.aiSummary}</p>
                  )}
                  {!serverGuideline.aiSummary && geminiConfigured && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <p className="text-amber-700">AI 요약이 없습니다. 저장된 파일로 요약을 생성할 수 있습니다.</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={guidelineAnalyzing}
                        onClick={handleAnalyzeStoredGuideline}
                        className="shrink-0 border-violet-300"
                      >
                        {guidelineAnalyzing ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            요약 생성 중…
                          </>
                        ) : (
                          "AI 요약 생성"
                        )}
                      </Button>
                    </div>
                  )}
                  {!serverGuideline.aiSummary && geminiConfigured === false && (
                    <p className="mt-2 text-amber-700">
                      AI 요약 없음 — 루트 .env에 GEMINI_API_KEY를 설정한 뒤 서버를 재시작하거나, 터미널에서{" "}
                      <code className="rounded bg-amber-100 px-1">npm run analyze:guideline</code>을 실행하세요.
                    </p>
                  )}
                </>
              ) : !selectedGuidelineLibrary ? (
                <p className="text-amber-800">
                  위에서 참고 문서(U+ 브랜드 가이드라인 등)를 선택하면 <code className="rounded bg-amber-100 px-1">data/guidelines</code>{" "}
                  고정 PDF가 서버 슬롯에 복사되어 Gemini 추론에 사용됩니다.
                </p>
              ) : (
                <p className="text-amber-800">
                  아직 서버에 가이드 파일이 없습니다. 동기화를 다시 시도하거나 브랜드 검수 화면에서 참조 가이드라인을 맞춰 주세요.
                </p>
              )}
              {geminiConfigured === false && (
                <p className="mt-3 text-amber-800">
                  백엔드에 GEMINI_API_KEY가 없으면 검수는 모의 점수로 동작합니다.
                </p>
              )}
            </div>
            <div className="shrink-0 border-t border-gray-100 px-4 py-3">
              <Button type="button" variant="outline" onClick={() => setGuidelineDetailOpen(false)}>
                닫기
              </Button>
            </div>
          </div>
        </div>
      )}

      {namingResult && namingMode === "audit" && auditLogicModalOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="닫기"
            onClick={() => setAuditLogicModalOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3">
              <h3 className="text-base font-semibold text-gray-900">상세 논리 (4개 평가 기준)</h3>
              <button
                type="button"
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
                onClick={() => setAuditLogicModalOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px] leading-relaxed text-gray-800">
              {(() => {
                const dl = namingResult.detailLogic ?? {
                  hierarchy: "",
                  originality: "",
                  pronunciationLanguage: "",
                  legality: "",
                };
                const blocks = [
                  { t: "1. 브랜드 계층 정렬 (40%)", c: dl.hierarchy },
                  { t: "2. 독창성 (30%) — KIPRIS 등 지식재산 정보 반영 시 출처 명시", c: dl.originality },
                  { t: "3. 발음·언어 (20%)", c: dl.pronunciationLanguage },
                  { t: "4. 적법성 (10%) — 국가법령정보 연동 시 출처 명시", c: dl.legality },
                ];
                return (
                  <div className="flex flex-col gap-6">
                    {blocks.map((b, i) => (
                      <section key={b.t}>
                        <h4 className="mb-2 text-[14px] font-semibold text-[#F43182]">{b.t}</h4>
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">
                          {b.c.trim() || "(상세 문단 없음)"}
                        </p>
                        {i === 1 && (
                          <p className="mt-3 text-[12px] text-gray-600">
                            <span className="font-medium text-gray-800">상표·독창성 참고: </span>
                            <a
                              href="https://plus.kipris.or.kr/portal/main.do"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              KIPRIS Plus
                            </a>
                          </p>
                        )}
                      </section>
                    ))}
                    <div className="border-t border-gray-200 pt-4">
                      <p className="mb-2 text-[11px] font-semibold text-gray-900">법령·공식 참고 (적법성 등)</p>
                      <div className="flex flex-col gap-2 text-[12px]">
                        <a
                          href="https://www.law.go.kr/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-blue-600 hover:underline"
                        >
                          <Globe className="h-3.5 w-3.5 shrink-0" />
                          국가법령정보센터 (law.go.kr)
                        </a>
                        <a
                          href="https://open.law.go.kr/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-blue-600 hover:underline"
                        >
                          <Globe className="h-3.5 w-3.5 shrink-0" />
                          법령정보 오픈API (open.law.go.kr)
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {namingResult && namingMode === "audit" && auditZoomDimension && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="닫기"
            onClick={() => setAuditZoomDimension(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                {auditZoomDimension === "hierarchy" && "브랜드 계층 정렬 — 확대"}
                {auditZoomDimension === "originality" && "독창성 — 확대"}
                {auditZoomDimension === "pronunciation" && "발음·언어 — 확대"}
                {auditZoomDimension === "legality" && "적법성 — 확대"}
              </h3>
              <button
                type="button"
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
                onClick={() => setAuditZoomDimension(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-[14px] leading-relaxed text-gray-800">
              <p className="whitespace-pre-wrap">
                {(() => {
                  const k =
                    auditZoomDimension === "pronunciation" ? "pronunciationLanguage" : auditZoomDimension;
                  const v = namingResult.detailLogic?.[k as keyof NonNullable<typeof namingResult.detailLogic>];
                  return (typeof v === "string" && v.trim() ? v : "(내용 없음)") as string;
                })()}
              </p>
              {(auditZoomDimension === "originality" || auditZoomDimension === "legality") && (
              <div className="mt-4 border-t border-gray-100 pt-3 text-[13px]">
                <p className="mb-2 font-semibold text-gray-800">관련 공식 링크</p>
                {auditZoomDimension === "originality" && (
                  <a
                    href="https://plus.kipris.or.kr/portal/main.do"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    KIPRIS Plus →
                  </a>
                )}
                {auditZoomDimension === "legality" && (
                  <>
                    <a
                      href="https://www.law.go.kr/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mr-3 text-blue-600 hover:underline"
                    >
                      국가법령정보센터 →
                    </a>
                    <a
                      href="https://open.law.go.kr/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      open.law.go.kr →
                    </a>
                  </>
                )}
              </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
