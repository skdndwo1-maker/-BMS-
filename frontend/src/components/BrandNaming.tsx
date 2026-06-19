import { useState, useRef, useEffect, useMemo, type ChangeEvent } from "react";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";
import { GlobalBrandNav } from "@/components/GlobalBrandNav";
import { registerGlobalNavPersist } from "@/lib/globalNavPersistence";
import { useLeavePageGuard } from "@/hooks/useLeavePageGuard";
import {
  Upload,
  FileText,
  Sparkles,
  ArrowUp,
  Download,
  Loader2,
  FileCheck,
  ShieldCheck,
  Scale,
  BadgeCheck,
  ChevronDown,
  X,
  Mic,
  Globe,
  Layers,
  RefreshCw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ensureGuidelineSlot,
  fetchHealth,
  runBrandNaming,
  syncGuidelineFromFixed,
  normalizeNamingProposal,
  type BrandNamingRunResult,
  type NamingFormatMode,
  type NamingLanguageMode,
} from "@/lib/guidelineApi";
import { NAMING_FIXED_GUIDELINE_OPTIONS } from "@/constants/guidelineReferences";
import { buildAuditCategoryContext } from "@/constants/namingCategoryRules";
import { downloadBrandNamingReport, type ExportFormat } from "@/lib/inspectionExport";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  EMPTY_NAMING_OVERVIEW,
  ETC_TOOLTIP_TEXT,
  NAMING_AUDIT_CATEGORY_COMPACT_H_PX,
  NAMING_AUDIT_GAUGE_R,
  NAMING_AUDIT_INTENT_ROW_H_PX,
  NAMING_AUDIT_MAJORS,
  NAMING_AUDIT_SUBS,
  NAMING_FAIL_TEXT_MD,
  NAMING_FAIL_TEXT_SM,
  NAMING_NAV_DRAFT_KEY,
  NAMING_PASS_BADGE_MD,
  NAMING_PASS_BADGE_SM,
  NamingOverviewGrid,
  NamingResultSectionTitle,
  ProposalDimensionBars,
  SECTION_ICON,
  SECTION_TITLE,
  ScoreGauge,
  StepBar,
  buildAuditCategoryLineForEtc,
  buildNamingOverviewForPrompt,
  categoryTabActive,
  categoryTabBase,
  categoryTabIdle,
  generateStyleTabActive,
  generateStyleTabIdle,
  generateLanguageTabActive,
  generateLanguageTabIdle,
  hasNamingOverviewInput,
  namingMinorTabActive,
  namingMinorTabIdle,
  passFail,
  resizeTierLabels,
  tierPackageToProposal,
  type AuditStep,
  type NamingAuditMajor,
  type NamingOverviewFields,
} from "./namingSections";

/**
 * 브랜드 네이밍 생성·검수 메인 컴포넌트.
 *
 * 결과 패널·점수 카드·진행 바·검수 모달 등 시각 요소는 `./brandNaming/` 서브 모듈에 분리되어 있고
 * 여기서는 상태 관리, 입력 폼, API 호출, 화면 조립만 담당합니다.
 */
export function BrandNaming() {
  const [auditName, setAuditName] = useState("");
  const [auditOverview, setAuditOverview] = useState<NamingOverviewFields>(EMPTY_NAMING_OVERVIEW);
  const [generateOverview, setGenerateOverview] = useState<NamingOverviewFields>(EMPTY_NAMING_OVERVIEW);
  const [auditCategoryMajor, setAuditCategoryMajor] = useState<NamingAuditMajor | null>(null);
  const [auditCategoryMinor, setAuditCategoryMinor] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const referenceText = "";
  const [namingMode, setNamingMode] = useState<"generate" | "audit">("audit");
  const [currentStep, setCurrentStep] = useState<AuditStep>("idle");
  const [namingResult, setNamingResult] = useState<BrandNamingRunResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [namingExportFormat, setNamingExportFormat] = useState<ExportFormat>("pdf");
  /** 생성 모드: 일반(4안) vs 단계별(1~6단계 요금제 라인업) */
  const [generateStyle, setGenerateStyle] = useState<"general" | "tiered">("general");
  /** 생성 모드: 네이밍 대안 언어 구성 */
  const [generateLanguageMode, setGenerateLanguageMode] = useState<NamingLanguageMode>("unlimited");
  /** 생성 모드: 일반 vs Collaboration 표기 */
  const [generateFormat, setGenerateFormat] = useState<NamingFormatMode>("general");
  const [collaborationBrand, setCollaborationBrand] = useState("");
  const [tierStepCount, setTierStepCount] = useState(3);
  const [tierLabels, setTierLabels] = useState<string[]>(["최고가", "중가", "저가"]);
  const [auditLogicModalOpen, setAuditLogicModalOpen] = useState(false);
  const [auditZoomDimension, setAuditZoomDimension] = useState<
    null | "hierarchy" | "originality" | "pronunciation" | "legality" | "publicAppeal" | "scalability"
  >(null);
  const [fixedGuidelineStatus, setFixedGuidelineStatus] = useState<
    Record<string, { loading: boolean; connected: boolean }>
  >({});

  const referenceInputRef = useRef<HTMLInputElement>(null);
  const namingStepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const runTokenRef = useRef(0);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(NAMING_NAV_DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        v?: number;
        auditName?: string;
        auditOverview?: NamingOverviewFields;
        generateOverview?: NamingOverviewFields;
        auditCategoryMajor?: NamingAuditMajor | null;
        auditCategoryMinor?: string;
        namingMode?: "generate" | "audit";
        generateStyle?: "general" | "tiered";
        tierStepCount?: number;
        tierLabels?: string[];
        generateLanguageMode?: NamingLanguageMode;
        generateFormat?: NamingFormatMode;
        collaborationBrand?: string;
        namingExportFormat?: ExportFormat;
      };
      if (d.v !== 1) return;
      if (typeof d.auditName === "string") setAuditName(d.auditName);
      if (d.auditOverview && typeof d.auditOverview === "object") {
        setAuditOverview({ ...EMPTY_NAMING_OVERVIEW, ...d.auditOverview });
      }
      if (d.generateOverview && typeof d.generateOverview === "object") {
        setGenerateOverview({ ...EMPTY_NAMING_OVERVIEW, ...d.generateOverview });
      }
      if (d.auditCategoryMajor != null && (NAMING_AUDIT_MAJORS as readonly string[]).includes(d.auditCategoryMajor)) {
        setAuditCategoryMajor(d.auditCategoryMajor as NamingAuditMajor);
      }
      if (typeof d.auditCategoryMinor === "string") setAuditCategoryMinor(d.auditCategoryMinor);
      if (d.namingMode === "generate" || d.namingMode === "audit") setNamingMode(d.namingMode);
      if (d.generateStyle === "general" || d.generateStyle === "tiered") setGenerateStyle(d.generateStyle);
      if (typeof d.tierStepCount === "number" && Number.isFinite(d.tierStepCount)) {
        const n = Math.min(6, Math.max(1, Math.round(d.tierStepCount)));
        setTierStepCount(n);
      }
      if (Array.isArray(d.tierLabels) && d.tierLabels.every((x) => typeof x === "string")) {
        setTierLabels(d.tierLabels);
      }
      if (d.generateLanguageMode === "ko" || d.generateLanguageMode === "en" || d.generateLanguageMode === "unlimited") {
        setGenerateLanguageMode(d.generateLanguageMode);
      }
      if (d.generateFormat === "general" || d.generateFormat === "collaboration") {
        setGenerateFormat(d.generateFormat);
      }
      if (typeof d.collaborationBrand === "string") setCollaborationBrand(d.collaborationBrand);
      if (d.namingExportFormat === "pdf" || d.namingExportFormat === "png" || d.namingExportFormat === "jpeg") {
        setNamingExportFormat(d.namingExportFormat);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return registerGlobalNavPersist(() => {
      try {
        sessionStorage.setItem(
          NAMING_NAV_DRAFT_KEY,
          JSON.stringify({
            v: 1,
            auditName,
            auditOverview,
            generateOverview,
            auditCategoryMajor,
            auditCategoryMinor,
            namingMode,
            generateStyle,
            tierStepCount,
            tierLabels,
            generateLanguageMode,
            generateFormat,
            collaborationBrand,
            namingExportFormat,
          }),
        );
      } catch (e) {
        console.warn("[namingNavDraft]", e);
      }
    });
  }, [
    auditName,
    auditOverview,
    generateOverview,
    auditCategoryMajor,
    auditCategoryMinor,
    namingMode,
    generateStyle,
    tierStepCount,
    tierLabels,
    generateLanguageMode,
    generateFormat,
    collaborationBrand,
    namingExportFormat,
  ]);

  useEffect(() => {
    void fetchHealth()
      .then((h) => setGeminiConfigured(h.gemini))
      .catch(() => setGeminiConfigured(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const docs = NAMING_FIXED_GUIDELINE_OPTIONS;
    setFixedGuidelineStatus(
      Object.fromEntries(docs.map((doc) => [doc.id, { loading: true, connected: false }]))
    );
    void Promise.all(
      docs.map(async (doc) => {
        try {
          const ensured = await ensureGuidelineSlot(doc.id);
          if (cancelled) return;
          setFixedGuidelineStatus((prev) => ({
            ...prev,
            [doc.id]: { loading: false, connected: Boolean(ensured.guideline?.hasFile) },
          }));
        } catch {
          if (!cancelled) {
            setFixedGuidelineStatus((prev) => ({
              ...prev,
              [doc.id]: { loading: false, connected: false },
            }));
          }
        }
      })
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const handleResyncFixedGuideline = async (docId: string) => {
    setFixedGuidelineStatus((prev) => ({
      ...prev,
      [docId]: { loading: true, connected: prev[docId]?.connected ?? false },
    }));
    try {
      const synced = await syncGuidelineFromFixed(docId);
      setFixedGuidelineStatus((prev) => ({
        ...prev,
        [docId]: { loading: false, connected: Boolean(synced.guideline?.hasFile) },
      }));
    } catch {
      setFixedGuidelineStatus((prev) => ({
        ...prev,
        [docId]: { loading: false, connected: false },
      }));
    }
  };

  useEffect(() => {
    return () => {
      namingStepTimersRef.current.forEach(clearTimeout);
      namingStepTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (generateStyle !== "tiered") return;
    setTierLabels((prev) => resizeTierLabels(tierStepCount, prev));
  }, [tierStepCount, generateStyle]);

  const isRunning = currentStep !== "idle" && currentStep !== "complete";
  const auditCategoryLine =
    auditCategoryMajor && (auditCategoryMajor === "etc." || auditCategoryMinor.trim())
      ? auditCategoryMajor === "etc."
        ? buildAuditCategoryLineForEtc()
        : buildAuditCategoryContext(
            auditCategoryMajor as Exclude<NamingAuditMajor, "etc.">,
            auditCategoryMinor.trim()
          )
      : "";

  const namingOverviewForPrompt =
    namingMode === "audit" ? buildNamingOverviewForPrompt(auditOverview) : buildNamingOverviewForPrompt(generateOverview);
  const namingCanSubmit =
    namingMode === "audit"
      ? Boolean(
          (auditName.trim() || namingOverviewForPrompt) &&
            auditCategoryMajor &&
            (auditCategoryMajor === "etc." || auditCategoryMinor.trim())
        )
      : Boolean(
          Boolean(namingOverviewForPrompt) &&
            auditCategoryMajor &&
            (auditCategoryMajor === "etc." || auditCategoryMinor.trim()) &&
            (generateFormat !== "collaboration" || collaborationBrand.trim())
        );

  const hasNamingSessionWork = useMemo(() => {
    if (isRunning) return true;
    if (showResults && namingResult) return true;
    if (referenceFile) return true;
    if (auditName.trim()) return true;
    if (auditCategoryMajor) return true;
    if (auditCategoryMinor.trim()) return true;
    if (hasNamingOverviewInput(auditOverview)) return true;
    if (hasNamingOverviewInput(generateOverview)) return true;
    if (collaborationBrand.trim()) return true;
    return false;
  }, [
    isRunning,
    showResults,
    namingResult,
    referenceFile,
    auditName,
    auditCategoryMajor,
    auditCategoryMinor,
    auditOverview,
    generateOverview,
    collaborationBrand,
  ]);

  const { leaveConfirmDialog } = useLeavePageGuard({
    enabled: hasNamingSessionWork,
    description: "생성된 내용이 사라집니다. 계속하시겠습니까?",
    confirmLabel: "계속",
  });

  const overallScore = namingResult?.overallScore ?? null;
  const finalVerdict = namingResult?.goRecommendation === "go" ? "go" : "no-go";

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
    setGenerateStyle("general");
    setGenerateLanguageMode("unlimited");
    setGenerateFormat("general");
    setCollaborationBrand("");
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
      ? `${auditCategoryLine ? `${auditCategoryLine}\n\n` : ""}[검수명]\n${auditName.trim()}\n\n${namingOverviewForPrompt || "[작명 개요]\n(입력 없음)"}`
      : `${auditCategoryLine ? `${auditCategoryLine}\n\n` : ""}${namingOverviewForPrompt || "[작명 개요]\n(입력 없음)"}`;

  const handleNamingReportDownload = () => {
    if (!namingResult) return;
    void downloadBrandNamingReport(
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
    runTokenRef.current += 1;
    setAuditLogicModalOpen(false);
    setAuditZoomDimension(null);
    setShowResults(false);
    setNamingResult(null);
    setRunError(null);
    setCurrentStep("idle");
    setAuditName("");
    setAuditOverview(EMPTY_NAMING_OVERVIEW);
    setGenerateOverview(EMPTY_NAMING_OVERVIEW);
    setAuditCategoryMajor(null);
    setAuditCategoryMinor("");
    setGenerateStyle("general");
    setTierStepCount(3);
    setTierLabels(["최고가", "중가", "저가"]);
    // referenceText는 UI 입력을 제거하여 항상 빈 값으로 전달
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
    const runToken = (runTokenRef.current += 1);
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
        const overviewPromptForThisRun = namingMode === "audit"
          ? buildNamingOverviewForPrompt(auditOverview)
          : buildNamingOverviewForPrompt(generateOverview);
        const auditRunRequestText =
          namingMode === "audit"
            ? `${auditCategoryLine ? `${auditCategoryLine}\n\n` : ""}[검수명]\n${auditName.trim()}\n\n${
                overviewPromptForThisRun || "[작명 개요]\n(입력 없음)"
              }`.trim()
            : "";
        const res = await runBrandNaming({
          mode: namingMode,
          requestText: namingMode === "generate" ? overviewPromptForThisRun : auditRunRequestText,
          auditName: namingMode === "audit" ? auditName : undefined,
          namingIntent: namingMode === "audit" ? overviewPromptForThisRun : undefined,
          auditCategory: auditCategoryLine || undefined,
          referenceText,
          supplementaryReference: referenceFile,
          languageMode: namingMode === "generate" ? generateLanguageMode : undefined,
          namingFormat: namingMode === "generate" ? generateFormat : undefined,
          collaborationBrand:
            namingMode === "generate" && generateFormat === "collaboration" ? collaborationBrand : undefined,
          generateStyle: namingMode === "generate" ? generateStyle : undefined,
          tierStepCount: namingMode === "generate" && generateStyle === "tiered" ? tierStepCount : undefined,
          tierLabels: namingMode === "generate" && generateStyle === "tiered" ? tierLabels : undefined,
        });
        clearNamingStepTimers();
        if (runToken !== runTokenRef.current) return;
        setNamingResult(res);
        setShowResults(true);
        setCurrentStep("complete");
      } catch (e) {
        clearNamingStepTimers();
        if (runToken !== runTokenRef.current) return;
        setRunError(e instanceof Error ? e.message : String(e));
        setCurrentStep("idle");
      }
    })();
  };

  return (
    <div className="min-h-screen brand-app-shell">
      <header className="sticky top-0 z-10 border-b border-[rgba(0,0,0,0.06)] bg-white shadow-[0_4px_24px_-6px_rgba(0,0,0,0.08),0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 flex-1 items-center">
              <AxisBrandTitle subtitle="브랜드 네이밍" />
            </div>
          </div>
        </div>
        <GlobalBrandNav className="bg-white" innerClassName="max-w-7xl px-6" />
      </header>

      {/* ── 스텝 바 ── */}
      {namingMode === "audit" && currentStep !== "idle" && <StepBar currentStep={currentStep} />}

      {/* ── 메인 ── */}
      <main className="max-w-[1280px] mx-auto px-[24px] py-[32px]">
        <div className="flex flex-col gap-[24px]">

          {/* 카테고리 선택 (요청 내용 입력 위) — 생성·검수 동일 */}
          <div className="brand-naming-section px-[32px] pb-2 pt-[21px]">
              <div className="mb-[16px] flex min-w-0 items-center gap-[8px]">
                <Layers className={`${SECTION_ICON} text-[#FF7F66]`} />
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
                  <TooltipProvider>
                    {NAMING_AUDIT_MAJORS.map((m) =>
                      m === "etc." ? (
                        <Tooltip key={m}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => {
                                setAuditCategoryMajor(m);
                                setAuditCategoryMinor("");
                              }}
                              className={`${categoryTabBase} ${auditCategoryMajor === m ? categoryTabActive : categoryTabIdle}`}
                            >
                              {m}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[320px] whitespace-pre-line">
                            {ETC_TOOLTIP_TEXT}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
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
                      )
                    )}
                  </TooltipProvider>
                </div>
                {auditCategoryMajor && auditCategoryMajor !== "etc." ? (
                  <div className="flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto">
                    {NAMING_AUDIT_SUBS[auditCategoryMajor].map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setAuditCategoryMinor(sub)}
                        className={`${categoryTabBase} ${auditCategoryMinor === sub ? namingMinorTabActive : namingMinorTabIdle}`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

          {/* Row 1: 요청 내용 — 상·하 패딩 32px 대비 약 1/3 축소(≈21px), 좌우 32px 유지 */}
          <div className="brand-naming-section px-[32px] pb-[21px] pt-[21px]">
            <div className="mb-[16px] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-[8px]">
                <Sparkles className={`${SECTION_ICON} text-[#FF7F66]`} />
                <h2 className={SECTION_TITLE}>요청 내용 입력</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={
                    namingMode === "generate"
                      ? "h-8 rounded-full border-transparent bg-black px-4 text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.25)] hover:bg-black/90"
                      : "h-8 rounded-full border-[rgba(0,0,0,0.1)] bg-white text-[#6B6B6B]"
                  }
                  onClick={() => switchNamingMode("generate")}
                >
                  생성
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={
                    namingMode === "audit"
                      ? "h-8 rounded-full border-transparent bg-black px-4 text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.25)] hover:bg-black/90"
                      : "h-8 rounded-full border-[rgba(0,0,0,0.1)] bg-white text-[#6B6B6B]"
                  }
                  onClick={() => switchNamingMode("audit")}
                >
                  검수
                </Button>
              </div>
            </div>
            {namingMode === "generate" ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-4 py-3">
                  <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-start lg:gap-x-10 lg:gap-y-3">
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <span className="shrink-0 whitespace-nowrap text-[12px] font-medium text-gray-600">
                        작명 개요
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={generateStyle === "general" ? generateStyleTabActive : generateStyleTabIdle}
                          onClick={() => setGenerateStyle("general")}
                        >
                          일반 생성
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={generateStyle === "tiered" ? generateStyleTabActive : generateStyleTabIdle}
                          onClick={() => setGenerateStyle("tiered")}
                        >
                          단계별 생성
                        </Button>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <span className="shrink-0 whitespace-nowrap text-[12px] font-medium text-gray-600">
                        네이밍 언어
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={generateLanguageMode === "ko" ? generateLanguageTabActive : generateLanguageTabIdle}
                          onClick={() => setGenerateLanguageMode("ko")}
                        >
                          국문
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={generateLanguageMode === "en" ? generateLanguageTabActive : generateLanguageTabIdle}
                          onClick={() => setGenerateLanguageMode("en")}
                        >
                          영문
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={
                            generateLanguageMode === "unlimited" ? generateLanguageTabActive : generateLanguageTabIdle
                          }
                          onClick={() => setGenerateLanguageMode("unlimited")}
                        >
                          제한없음
                        </Button>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <span className="shrink-0 whitespace-nowrap text-[12px] font-medium text-gray-600">
                        네이밍 형식
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={generateFormat === "general" ? generateStyleTabActive : generateStyleTabIdle}
                          onClick={() => setGenerateFormat("general")}
                        >
                          일반
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={generateFormat === "collaboration" ? generateStyleTabActive : generateStyleTabIdle}
                          onClick={() => setGenerateFormat("collaboration")}
                        >
                          Collaboration
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                {generateFormat === "collaboration" ? (
                  <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F5F3F0] px-3 py-3">
                    <label htmlFor="naming-collaboration-brand" className="text-[11px] font-medium text-gray-600">
                      타사 브랜드명
                    </label>
                    <input
                      id="naming-collaboration-brand"
                      value={collaborationBrand}
                      onChange={(e) => setCollaborationBrand(e.target.value)}
                      placeholder="예) Google, Apple, Netflix"
                      className="mt-2 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-[#FF7F66] focus:ring-2 focus:ring-[#FF7F66]/20"
                    />
                    <p className="mt-2 text-[11px] leading-snug text-gray-500">
                      생성된 네이밍 뒤에 <span className="font-medium text-gray-700"> l [타사 브랜드명]</span> 형식으로
                      자동 결합되어 표시됩니다. (예: 생성된 네이밍 l Google)
                    </p>
                  </div>
                ) : null}
                {generateStyle === "tiered" ? (
                  <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F5F3F0] px-3 py-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <label htmlFor="naming-tier-step-count" className="text-[11px] font-medium text-gray-600">
                        단계 수 (1~6)
                      </label>
                      <select
                        id="naming-tier-step-count"
                        value={tierStepCount}
                        onChange={(e) => setTierStepCount(Math.min(6, Math.max(1, Number(e.target.value) || 3)))}
                        className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-gray-800 outline-none focus:border-[#FF7F66]"
                      >
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            {n}단계
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="mb-2 text-[11px] leading-snug text-gray-500">
                      요금제·가격대별(예: 최고가~최저가)로 서로 다른 네이밍을 한 세트로 제안합니다. 각 단계 라벨에 맞는 후보명과, 전 단계를 묶어서 보는 6대 평가 근거가 함께 생성됩니다.
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {tierLabels.map((lb, i) => (
                        <div key={i} className="flex min-w-0 items-center gap-2">
                          <span className="w-6 shrink-0 text-center text-[11px] font-semibold text-[#FF7F66]">{i + 1}</span>
                          <input
                            value={lb}
                            onChange={(e) => {
                              const v = e.target.value;
                              setTierLabels((prev) => {
                                const copy = [...prev];
                                copy[i] = v;
                                return copy;
                              });
                            }}
                            placeholder={`단계 ${i + 1} 라벨`}
                            className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-[13px] outline-none focus:border-[#FF7F66] focus:ring-2 focus:ring-[#FF7F66]/20"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <NamingOverviewGrid value={generateOverview} onChange={setGenerateOverview} />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col">
                  <label htmlFor="naming-audit-name" className="mb-1 text-[12px] font-medium text-gray-600">
                    검수명
                  </label>
                  <input
                    id="naming-audit-name"
                    value={auditName}
                    onChange={(e) => setAuditName(e.target.value)}
                    placeholder="검수할 브랜드명·표현을 입력하세요"
                    className="h-10 w-full rounded-[12px] border-2 border-gray-200 px-[20px] text-[15px] font-normal outline-none transition-all placeholder:text-gray-300 focus:border-[#FF7F66] focus:ring-4 focus:ring-[#FF7F66]/20"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-medium text-gray-600">작명 개요</label>
                  <NamingOverviewGrid value={auditOverview} onChange={setAuditOverview} />
                </div>
              </div>
            )}
            <p className="mt-[16px] px-[2px] text-[13px] text-gray-500">
              {namingMode === "generate"
                ? generateStyle === "tiered"
                  ? "단계별 생성: 한 번의 실행마다 서로 다른 세계관을 가진 패키지 대안이 네 가지 나오며, 각 패키지는 설정한 모든 단계 네이밍과 스토리라인·패키지 단위 평가(창의성에 스토리 연계 반영)를 포함합니다."
                  : "일반 생성: 상단에서 카테고리를 선택한 뒤 요청을 입력하면, 동일한 브랜드 계층 맥락으로 네이밍 후보 4안을 제안합니다."
                : "검수 모드: 입력하신 문구를 가이드라인·참고 자료 기준으로 평가합니다."}
            </p>
            <p className="mt-[8px] px-[2px] text-[12px] text-gray-400">
              입력·업로드 자료는 서버에서 맥락으로 묶이며, Simply. U+ Guidebook과 Brand Guideline은 항상 자동 참조됩니다.
            </p>
          </div>

          {runError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{runError}</div>
          )}

          {/* Row 2: 참고 자료 */}
          <div className="brand-naming-section p-[24px]">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF7F66]/12">
                <FileText className="h-5 w-5 text-[#FF7F66]" />
              </div>
              <h2 className={SECTION_TITLE}>참고 자료</h2>
            </div>

            <div className="grid grid-cols-1 gap-5 rounded-[20px] border border-[rgba(0,0,0,0.05)] bg-[#FAFAF8] p-4 sm:p-5 lg:grid-cols-2 lg:items-stretch lg:gap-6">
              <div className="flex min-h-0 min-w-0 flex-col lg:h-full">
                <h3 className="mb-3 shrink-0 text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                  사업 및 서비스 개요 자료
                </h3>
                <div className="flex min-h-0 flex-1 flex-col">
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
                    className="brand-naming-ref-dropzone flex min-h-[128px] flex-1 cursor-pointer flex-col items-center justify-center px-3 py-3 text-center lg:min-h-0"
                  >
                    {referenceFile ? (
                      <div className="flex w-full max-w-full flex-col items-center justify-center gap-2 px-1 py-1">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#FF7F66]/12">
                          <FileText className="h-6 w-6 text-[#FF7F66]" />
                        </div>
                        <p className="line-clamp-2 w-full text-center text-[12px] font-medium text-gray-800">
                          {referenceFile.name}
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-800 shadow-sm hover:border-[#FF7F66]/35 hover:bg-white"
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
                            className="h-8 rounded-full px-3 text-[11px] font-medium text-gray-500 hover:bg-black/5 hover:text-gray-800"
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
                      <div className="flex max-w-[240px] flex-col items-center justify-center gap-1.5 px-1">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF7F66]/12">
                          <Upload className="h-5 w-5 text-[#FF7F66]" />
                        </div>
                        <p className="text-[12px] font-semibold leading-tight text-gray-900">파일 직접 업로드</p>
                        <p className="text-[10px] leading-snug text-gray-500">탭하여 선택 · PDF·PNG·JPEG</p>
                      </div>
                    )}
                  </div>
                </div>
                <input
                  ref={referenceInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  className="hidden"
                  onChange={handleReferenceUpload}
                />
              </div>

              <div className="flex min-h-0 min-w-0 flex-col lg:h-full">
                <h3 className="mb-3 shrink-0 text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                  기본 참조 문서 (고정)
                </h3>
                <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-4 shadow-sm">
                  <p className="text-[12px] leading-relaxed text-gray-600">
                    네이밍 생성·검수 시 아래 두 문서가 항상 AI 맥락에 포함됩니다.
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {NAMING_FIXED_GUIDELINE_OPTIONS.map((doc) => {
                      const status = fixedGuidelineStatus[doc.id];
                      return (
                        <li
                          key={doc.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(0,0,0,0.05)] bg-[#FAFAF8] px-3 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <FileCheck className="h-4 w-4 shrink-0 text-[#FF7F66]" />
                            <span className="truncate text-[13px] font-medium text-gray-900">{doc.name}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5 pl-2">
                            {status?.loading ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                확인 중
                              </span>
                            ) : (
                              <>
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                    status?.connected
                                      ? "bg-[#c8d9c4] font-bold text-[#2f4a38]"
                                      : "bg-gray-200 text-gray-600"
                                  }`}
                                >
                                  {status?.connected ? "연결됨" : "미연결"}
                                </span>
                                <button
                                  type="button"
                                  title="재동기화 (AI 요약 포함)"
                                  onClick={() => void handleResyncFixedGuideline(doc.id)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleVerify}
            disabled={!namingCanSubmit || isRunning}
            className="brand-btn-primary h-14 w-full text-base font-semibold disabled:pointer-events-none disabled:opacity-50"
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

          {isRunning && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAuditResetToInput}
              className="h-10 w-full border-[#FF7F66]/30 text-[13px] text-[#FF7F66] hover:bg-[#FF7F66]/10 hover:text-[#FF7F66]"
            >
              중지하고 돌아가기
            </Button>
          )}

          {/* ── 결과 섹션 ── */}
          {showResults && namingResult && (
            <>
              {namingMode === "generate" && (
                <>
                <div className="brand-naming-section p-7 sm:p-8">
                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FF7F66] text-white shadow-[0_4px_14px_-4px_rgba(255,127,102,0.5)]">
                        <Sparkles className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <NamingResultSectionTitle>
                          {namingResult.generateMeta?.style === "tiered"
                            ? `AI 네이밍 제안 (${namingResult.generateMeta.tierStepCount ?? namingResult.namingProposals?.length ?? 0}단계 × 대안 4패키지)`
                            : "AI 네이밍 제안 (4안)"}
                        </NamingResultSectionTitle>
                        <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
                          {namingResult.generateMeta?.style === "tiered"
                            ? "한 번의 생성마다 서로 다른 세계관·스토리라인을 가진 패키지 대안이 4개 제시됩니다. 각 패키지는 요청한 모든 단계 네이밍을 포함하며, 단계 간 이름은 같은 스토리라인에서 파생되도록 설계된 것이 기본입니다. 평가 표시 순서는 계층·적법·창의·대중·직관·확장이며, 종합 점수는 창의 30%·대중 30%·직관 20%·확장 20% 가중합입니다(계층·적법은 Pass/Fail만)."
                            : "표시 순서: 계층·적법·창의·대중·직관·확장. 종합 점수는 창의×0.3 + 대중×0.3 + 직관×0.2 + 확장×0.2 입니다. 브랜드 계층·적법은 종합에 넣지 않으며 70점 미만 시 Fail·NO-GO입니다."}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pt-1">
                      <label htmlFor="naming-generate-report-format" className="sr-only">
                        생성 리포트 파일 형식
                      </label>
                      <div className="relative shrink-0 min-w-[100px]">
                        <select
                          id="naming-generate-report-format"
                          value={namingExportFormat}
                          onChange={(e) => setNamingExportFormat(e.target.value as ExportFormat)}
                          className="brand-naming-ref-select !py-2 !pl-3 !pr-8 !text-xs"
                        >
                          <option value="pdf">PDF</option>
                          <option value="png">PNG</option>
                          <option value="jpeg">JPEG</option>
                        </select>
                        <ChevronDown
                          aria-hidden
                          className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-500"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 shadow-sm hover:border-black/20"
                        onClick={handleNamingReportDownload}
                      >
                        <Download className="mr-2 h-4 w-4 shrink-0" />
                        생성 리포트 다운로드
                      </Button>
                    </div>
                  </div>
                  {namingResult.generateMeta?.style === "tiered" &&
                  namingResult.tierNamingAlternatives &&
                  namingResult.tierNamingAlternatives.length > 0 ? (
                    <ul className="flex flex-col gap-5">
                      {namingResult.tierNamingAlternatives.map((alt, i) => (
                        <li
                          key={`tier-alt-${i}`}
                          className="rounded-[24px] border border-[rgba(0,0,0,0.06)] bg-white p-6 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08),0_2px_8px_-4px_rgba(0,0,0,0.04)]"
                        >
                          <div className="mb-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF7F66]">
                              대안 패키지 {i + 1} / 4
                            </span>
                            <h3 className="mt-1.5 text-[16px] font-bold text-gray-900">세계관·스토리라인</h3>
                            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">
                              {alt.storyline}
                            </p>
                          </div>
                          <div className="mb-4">
                            <h4 className="mb-2.5 text-[12px] font-semibold tracking-wide text-gray-500">단계별 네이밍</h4>
                            <ul className="flex flex-col gap-2">
                              {alt.tierSteps.map((row, j) => (
                                <li
                                  key={`${i}-${j}-${row.name}`}
                                  className="rounded-[14px] border border-[rgba(0,0,0,0.05)] bg-[#FAFAF8] px-3.5 py-2.5 text-[13px]"
                                >
                                  <span className="font-semibold text-[#FF7F66]">
                                    {row.tierLabel || namingResult.generateMeta?.tierLabels?.[j] || `단계 ${j + 1}`}
                                  </span>
                                  {" — "}
                                  <span className="font-bold text-gray-900">{row.name}</span>
                                  {row.rationale ? (
                                    <span className="mt-1 block text-[12px] leading-snug text-gray-600">
                                      {row.rationale}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="mb-1.5 text-[12px] font-semibold text-gray-800">
                              패키지 통합 평가 (창의성·스토리 연계)
                            </h4>
                            <p className="mb-2 text-[11px] leading-snug text-gray-500">
                              창의성 상세에는 위 스토리라인과 각 단계 이름의 연결이 서술됩니다.
                            </p>
                            <ProposalDimensionBars proposal={tierPackageToProposal(alt.tierPackageEvaluation)} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : namingResult.generateMeta?.style === "tiered" && namingResult.tierPackageEvaluation ? (
                    <div className="mb-4 rounded-[24px] border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] p-6">
                      <h3 className="mb-1 text-[15px] font-bold text-gray-900">패키지 통합 평가 (레거시 단일 패키지)</h3>
                      <p className="mb-3 text-[12px] leading-snug text-gray-500">
                        {namingResult.generateMeta.tierStepCount ?? namingResult.namingProposals?.length ?? 0}단계 네이밍을 하나의 요금제 라인업으로 본 4대 항목 평가입니다.
                      </p>
                      <ProposalDimensionBars proposal={tierPackageToProposal(namingResult.tierPackageEvaluation)} />
                    </div>
                  ) : null}
                  {(namingResult.namingProposals?.length ?? 0) > 0 &&
                  !(
                    namingResult.generateMeta?.style === "tiered" &&
                    namingResult.tierNamingAlternatives &&
                    namingResult.tierNamingAlternatives.length > 0
                  ) ? (
                    <ul className="flex flex-col gap-4">
                      {(namingResult.namingProposals ?? []).map((raw, i) => {
                        const p = normalizeNamingProposal(raw);
                        const tierLb =
                          namingResult.generateMeta?.style === "tiered" &&
                          namingResult.generateMeta.tierLabels?.[i]?.trim();
                        const showPerCardBars =
                          namingResult.generateMeta?.style !== "tiered" || !namingResult.tierPackageEvaluation;
                        return (
                        <li
                          key={`${i}-${p.name}`}
                          className="rounded-[24px] border border-[rgba(0,0,0,0.06)] bg-white p-6 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08),0_2px_8px_-4px_rgba(0,0,0,0.04)]"
                        >
                          <div className="mb-2 flex flex-wrap items-baseline gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF7F66]">
                              {tierLb ? `${tierLb} · ` : ""}대안 {i + 1}
                            </span>
                            <h3 className="text-[18px] font-bold text-gray-900">{p.name}</h3>
                          </div>
                          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">{p.rationale}</p>
                          {showPerCardBars ? <ProposalDimensionBars proposal={p} /> : null}
                        </li>
                        );
                      })}
                    </ul>
                  ) : namingResult.suggestedNames.length > 0 ? (
                    <ul className="flex flex-col gap-3">
                      {namingResult.suggestedNames.map((name, i) => (
                        <li
                          key={`${i}-${name}`}
                          className="rounded-[20px] border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-5 py-3.5 text-[15px] font-semibold text-gray-900"
                        >
                          대안 {i + 1}: {name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-[18px] border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-3.5 text-[13px] text-gray-800">
                      제안 후보가 비어 있습니다. 요청을 구체화하거나 참고 문서를 선택한 뒤 다시 시도해 보세요.
                    </p>
                  )}
                </div>
                <div className="mt-8 flex flex-col gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!namingCanSubmit || isRunning}
                    className="h-14 w-full border border-[rgba(0,0,0,0.12)] text-[15px] font-semibold text-[#1A1A1A] hover:bg-black/[0.04]"
                    onClick={handleVerify}
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 shrink-0 animate-spin" />
                        생성 중…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-5 w-5 shrink-0" />
                        다시 생성하기
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    className="brand-btn-primary h-14 w-full text-base font-semibold"
                    onClick={handleAuditResetToInput}
                  >
                    <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/90 bg-white/15">
                      <ArrowUp className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                    </span>
                    처음으로
                  </Button>
                </div>
                </>
              )}

              {/* 종합 적합성 점수 — 검수 (가중: 창의30·대중30·직관20·확장20, 계층·적법 70↓ NO-GO) */}
              {namingMode === "audit" && overallScore !== null && namingResult && (() => {
                const dim = {
                  hierarchy: namingResult.hierarchyScore,
                  originality: namingResult.originalityDimensionScore ?? namingResult.trademarkScore,
                  pronunciation: namingResult.pronunciationScore ?? namingResult.pronunciationLanguageScore ?? 0,
                  legality: namingResult.legalityScore ?? namingResult.copyrightScore,
                  publicAppeal: namingResult.publicAppealScore ?? 50,
                  scalability: namingResult.scalabilityScore ?? 50,
                };
                const dl = namingResult.detailLogic ?? {
                  hierarchy: "",
                  originality: "",
                  pronunciationLanguage: "",
                  legality: "",
                  publicAppeal: "",
                  scalability: "",
                };
                return (
              <div className="brand-naming-section p-6 sm:p-8">

                {/* ── 헤더: 제목 + 설명 + 다운로드 ── */}
                <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <NamingResultSectionTitle>종합 적합성 점수</NamingResultSectionTitle>
                    <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-gray-500">
                      항목 순서: 계층 → 적법 → 창의 → 대중 → 직관 → 확장. 종합 점수는 창의성 30%·대중성 30%·직관성 20%·확장성 20% 가중합이며, 브랜드 계층 정렬·적법성(법적 적법성 + 사회적 이슈·민감도)은 Pass/Fail만(종합 미포함, 70점 미만 NO-GO)입니다.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pt-1">
                    <label htmlFor="naming-audit-report-format" className="sr-only">검수 리포트 파일 형식</label>
                    <div className="relative min-w-[90px] shrink-0">
                      <select
                        id="naming-audit-report-format"
                        value={namingExportFormat}
                        onChange={(e) => setNamingExportFormat(e.target.value as ExportFormat)}
                        className="brand-naming-ref-select !py-2 !pl-3 !pr-8 !text-xs"
                      >
                        <option value="pdf">PDF</option>
                        <option value="png">PNG</option>
                        <option value="jpeg">JPEG</option>
                      </select>
                      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 shadow-sm hover:border-black/20"
                      onClick={handleNamingReportDownload}
                    >
                      <Download className="mr-2 h-4 w-4 shrink-0" />
                      검수 리포트 다운로드
                    </Button>
                  </div>
                </div>

                {/* ── 상단 요약 패널: 게이지+미니표 | GO/NO-GO+AI제안 ── */}
                <div className="mb-7 rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] p-5 sm:p-6">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

                    {/* 좌: 게이지 + 3×2 미니 카드 */}
                    <div className="flex shrink-0 flex-col items-center gap-4 lg:w-[260px]">
                      <ScoreGauge score={overallScore} r={NAMING_AUDIT_GAUGE_R} scoreSize={60} />
                      <div className="w-full">
                        <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">항목별</p>
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              { label: "계층", val: dim.hierarchy, pf: true },
                              { label: "적법", val: dim.legality, pf: true },
                              { label: "창의", val: dim.originality, pf: false },
                              { label: "대중", val: dim.publicAppeal, pf: false },
                              { label: "직관", val: dim.pronunciation, pf: false },
                              { label: "확장", val: dim.scalability, pf: false },
                            ] as const
                          ).map((row) => {
                            const pf = row.pf ? passFail(Number(row.val)) : null;
                            return (
                              <div
                                key={row.label}
                                className="flex min-h-[72px] flex-col items-center justify-between gap-1 rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-1.5 py-2.5 text-center shadow-sm"
                              >
                                <span
                                  className={`max-w-full truncate text-[9px] font-semibold ${row.pf ? "text-[#2f5550]" : "text-[#c14d38]"}`}
                                  title={row.label}
                                >
                                  {row.label}
                                </span>
                                {pf ? (
                                  <span className={pf === "PASS" ? NAMING_PASS_BADGE_SM : NAMING_FAIL_TEXT_SM}>
                                    {pf}
                                  </span>
                                ) : (
                                  <span className="font-mono text-[14px] font-bold tabular-nums leading-none text-[#c14d38]">
                                    {row.val}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* 우: GO/NO-GO 카드 + AI 추가 제안 */}
                    <div className="flex min-w-0 flex-1 flex-col gap-4">
                      {/* GO/NO-GO 판정 카드 */}
                      <div
                        className={`rounded-2xl border bg-white p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] ${
                          finalVerdict === "go"
                            ? "border-[rgba(0,0,0,0.06)] border-l-4 border-l-[#5a7a5c]"
                            : "border-[rgba(0,0,0,0.06)] border-l-4 border-l-[#FF7F66]"
                        }`}
                      >
                        <div className="mb-3 flex flex-wrap items-center gap-2.5">
                          <span
                            className={
                              finalVerdict === "go"
                                ? "brand-pill--success !text-[11px] !font-bold"
                                : "brand-pill--danger !text-[11px] !font-bold"
                            }
                          >
                            {finalVerdict === "go" ? "GO" : "NO-GO"}
                          </span>
                          <h3 className="text-[17px] font-bold leading-tight text-gray-900">
                            {finalVerdict === "go" ? "사용 권장" : "재검토 필요"}
                          </h3>
                        </div>
                        <p className="text-[13px] leading-relaxed text-gray-600">{namingResult.finalSummary}</p>
                        <div className="mt-4 flex justify-end border-t border-[rgba(0,0,0,0.06)] pt-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full border border-gray-200 bg-white text-[12px] font-medium text-gray-800 shadow-sm hover:border-black/20"
                            onClick={() => setAuditLogicModalOpen(true)}
                          >
                            <FileCheck className="mr-2 h-3.5 w-3.5" />
                            상세 논리 보기
                          </Button>
                        </div>
                      </div>

                      {/* AI 추가 제안 카드 */}
                      <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-4">
                        <p className="text-[12px] font-semibold text-gray-900">AI 추가 제안 네이밍</p>
                        <p className="mt-0.5 mb-3 text-[11px] leading-snug text-gray-500">
                          Gemini가 검수 맥락(가이드·작명 의도)을 반영해, 검수 대상과 다른 대안 이름만 제안합니다.
                        </p>
                        <div className="max-h-[160px] overflow-y-auto text-[13px] leading-relaxed text-gray-600">
                          {(namingResult.additionalNamingSuggestions?.length ?? 0) > 0 ? (
                            <ul className="divide-y divide-[rgba(0,0,0,0.05)]">
                              {(namingResult.additionalNamingSuggestions ?? []).map((name, idx) => (
                                <li key={`${idx}-${name}`} className="py-1.5 first:pt-0 last:pb-0">
                                  {name}
                                </li>
                              ))}
                            </ul>
                          ) : (namingResult.namingGeminiConfigured ?? geminiConfigured) === false ? (
                            <p className="text-[12px] leading-relaxed text-gray-700">
                              서버에 <code className="rounded bg-[#F0EFEC] px-1.5 py-0.5 text-[11px] text-gray-800">GEMINI_API_KEY</code>가 없어 Gemini 연동이 꺼져 있습니다. <code className="rounded bg-[#F0EFEC] px-1.5 py-0.5 text-[11px]">.env</code>에 키를 넣고 서버를 재시작해 주세요.
                            </p>
                          ) : (
                            <p className="text-[12px] text-gray-500">
                              Gemini가 추가 제안을 비웠습니다. 검수명·작명 의도를 구체화한 뒤 재검수해 보세요.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── 항목별 상세 평가 ── */}
                <div className="flex flex-col gap-6">

                  {/* Pass / Fail 항목 (계층 · 적법) */}
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#92b8b1]" />
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Pass / Fail 항목</p>
                      <span className="text-[10px] text-gray-400">— NO-GO 70점 미만 · 종합 미반영</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {(
                        [
                          {
                            id: "hierarchy" as const,
                            title: "브랜드 계층 정렬",
                            score: dim.hierarchy,
                            icon: BadgeCheck,
                            iconWrap: "bg-[rgba(146,184,177,0.18)] text-[#2f5550]",
                            body: (
                              <>
                                <p className="mb-1.5 text-[13px] leading-relaxed text-gray-600">{namingResult.hierarchy.message}</p>
                                <p className="text-[13px] leading-relaxed text-gray-600">{namingResult.hierarchy.details}</p>
                                {dl.hierarchy ? (
                                  <p className="mt-2 whitespace-pre-wrap border-t border-[rgba(0,0,0,0.06)] pt-2 text-[12px] leading-relaxed text-gray-500">
                                    {dl.hierarchy}
                                  </p>
                                ) : null}
                              </>
                            ),
                          },
                          {
                            id: "legality" as const,
                            title: "적법성",
                            score: dim.legality,
                            icon: Scale,
                            iconWrap: "bg-[rgba(146,184,177,0.18)] text-[#2f5550]",
                            body: (
                              <>
                                <p className="mb-1.5 text-[13px] leading-relaxed text-gray-600">{namingResult.copyright.verdict}</p>
                                {namingResult.copyright.risks.slice(0, 4).map((risk, i) => (
                                  <p key={i} className="mb-1 text-[13px] leading-relaxed text-gray-600">
                                    · {risk.type}: {risk.description}
                                  </p>
                                ))}
                                {dl.legality ? (
                                  <p className="mt-2 whitespace-pre-wrap border-t border-[rgba(0,0,0,0.06)] pt-2 text-[12px] leading-relaxed text-gray-500">
                                    {dl.legality}
                                  </p>
                                ) : null}
                              </>
                            ),
                          },
                        ] as const
                      ).map((box) => {
                        const BoxIcon = box.icon;
                        const pf = passFail(typeof box.score === "number" ? box.score : Number(box.score));
                        return (
                          <div
                            key={box.id}
                            className="flex flex-col rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_2px_16px_-6px_rgba(0,0,0,0.07)]"
                          >
                            {/* 카드 헤더 */}
                            <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.05)] px-5 py-4">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${box.iconWrap}`}>
                                  <BoxIcon className="h-4.5 w-4.5" />
                                </div>
                                <h4 className="truncate text-[15px] font-semibold text-gray-900">{box.title}</h4>
                              </div>
                              <span className={`shrink-0 ${pf === "PASS" ? NAMING_PASS_BADGE_MD : NAMING_FAIL_TEXT_MD}`}>
                                {pf}
                              </span>
                            </div>
                            {/* 카드 본문 */}
                            <div className="max-h-[200px] min-h-[80px] overflow-y-auto px-5 py-4">
                              {box.body}
                            </div>
                            {/* 카드 푸터 */}
                            <div className="flex justify-end border-t border-[rgba(0,0,0,0.05)] px-4 py-3">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-full px-3 text-[12px] font-medium text-gray-500 hover:bg-black/[0.04] hover:text-gray-900"
                                onClick={() => setAuditZoomDimension(box.id)}
                              >
                                상세보기
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 종합 가중 항목 (창의 · 대중 · 직관 · 확장) */}
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF7F66]" />
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">종합 가중 항목</p>
                      <span className="text-[10px] text-gray-400">— 창의 30% · 대중 30% · 직관 20% · 확장 20%</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {(
                        [
                          {
                            id: "originality" as const,
                            title: "창의성",
                            weightLabel: "30%",
                            score: dim.originality,
                            icon: Sparkles,
                            iconWrap: "bg-[rgba(255,127,102,0.12)] text-[#FF7F66]",
                            body: (
                              <>
                                <p className="mb-1.5 text-[13px] leading-relaxed text-gray-600">{namingResult.trademark.recommendation}</p>
                                {namingResult.trademark.conflicts.slice(0, 4).map((c, i) => (
                                  <p key={i} className="mb-1 text-[13px] leading-relaxed text-gray-600">
                                    · {c.name} ({c.similarity}%)
                                  </p>
                                ))}
                                {dl.originality ? (
                                  <p className="mt-2 whitespace-pre-wrap border-t border-[rgba(0,0,0,0.06)] pt-2 text-[12px] leading-relaxed text-gray-500">
                                    {dl.originality}
                                  </p>
                                ) : null}
                              </>
                            ),
                          },
                          {
                            id: "publicAppeal" as const,
                            title: "대중성",
                            weightLabel: "30%",
                            score: dim.publicAppeal,
                            icon: Users,
                            iconWrap: "bg-[#F0EFEC] text-gray-600",
                            body: (
                              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">
                                {dl.publicAppeal?.trim()
                                  ? dl.publicAppeal
                                  : "대중성(사회·문화적 수용) 근거가 아직 없습니다. 다시 검수하거나 잠시 후 재시도해 주세요."}
                              </p>
                            ),
                          },
                          {
                            id: "pronunciation" as const,
                            title: "직관성",
                            weightLabel: "20%",
                            score: dim.pronunciation,
                            icon: Mic,
                            iconWrap: "bg-[rgba(255,127,102,0.12)] text-[#FF7F66]",
                            body: (
                              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">
                                {dl.pronunciationLanguage?.trim()
                                  ? dl.pronunciationLanguage
                                  : "직관성 항목이 아직 없습니다. 다시 검수하거나 잠시 후 재시도해 주세요."}
                              </p>
                            ),
                          },
                          {
                            id: "scalability" as const,
                            title: "확장성",
                            weightLabel: "20%",
                            score: dim.scalability,
                            icon: Layers,
                            iconWrap: "bg-[#F0EFEC] text-gray-600",
                            body: (
                              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">
                                {dl.scalability?.trim()
                                  ? dl.scalability
                                  : "확장성(브랜드 생태계) 근거가 아직 없습니다. 다시 검수하거나 잠시 후 재시도해 주세요."}
                              </p>
                            ),
                          },
                        ] as const
                      ).map((box) => {
                        const BoxIcon = box.icon;
                        return (
                          <div
                            key={box.id}
                            className="flex flex-col rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_2px_16px_-6px_rgba(0,0,0,0.07)]"
                          >
                            {/* 카드 헤더 */}
                            <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.05)] px-5 py-4">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${box.iconWrap}`}>
                                  <BoxIcon className="h-4 w-4" />
                                </div>
                                <h4 className="truncate text-[15px] font-semibold text-gray-900">{box.title}</h4>
                              </div>
                              <div className="shrink-0 text-right">
                                <span className="block text-[10px] text-gray-400">종합 {box.weightLabel}</span>
                                <span className="font-mono text-[22px] font-bold tabular-nums leading-tight text-[#c14d38]">
                                  {box.score}
                                </span>
                              </div>
                            </div>
                            {/* 카드 본문 */}
                            <div className="max-h-[200px] min-h-[80px] overflow-y-auto px-5 py-4">
                              {box.body}
                            </div>
                            {/* 카드 푸터 */}
                            <div className="flex justify-end border-t border-[rgba(0,0,0,0.05)] px-4 py-3">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-full px-3 text-[12px] font-medium text-gray-500 hover:bg-black/[0.04] hover:text-gray-900"
                                onClick={() => setAuditZoomDimension(box.id)}
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

                {/* ── 처음으로 버튼 ── */}
                <Button
                  type="button"
                  className="brand-btn-primary mt-8 h-14 w-full text-base font-semibold"
                  onClick={handleAuditResetToInput}
                >
                  <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10">
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
            className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_8px_40px_-8px_rgba(0,0,0,0.15)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-5 py-3.5">
              <h3 className="text-base font-semibold text-gray-900">상세 논리 (6개 평가 기준)</h3>
              <button
                type="button"
                className="rounded-full p-1.5 text-gray-500 hover:bg-white hover:text-gray-900"
                aria-label="닫기"
                onClick={() => setAuditLogicModalOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px] leading-relaxed text-gray-700">
              {(() => {
                const dl = namingResult.detailLogic ?? {
                  hierarchy: "",
                  originality: "",
                  pronunciationLanguage: "",
                  legality: "",
                  publicAppeal: "",
                  scalability: "",
                };
                const blocks = [
                  { t: "1. 브랜드 계층 정렬 (Pass/Fail · 종합 미포함 · 70점 미만 NO-GO)", c: dl.hierarchy },
                  { t: "2. 적법성 (Pass/Fail · 종합 미포함 · 70점 미만 NO-GO) — [법적 적법성](국가법령정보 연동 시 출처 명시) + [사회적 이슈·민감도](Gemini 추론)", c: dl.legality },
                  { t: "3. 창의성 (종합 30%) — Gemini 추론만 사용", c: dl.originality },
                  { t: "4. 대중성 (종합 30%) — 사회·문화적 수용", c: dl.publicAppeal },
                  { t: "5. 직관성 (종합 20%)", c: dl.pronunciationLanguage },
                  { t: "6. 확장성 (종합 20%) — 브랜드 생태계·파생", c: dl.scalability },
                ];
                return (
                  <div className="flex flex-col gap-6">
                    {blocks.map((b, bi) => (
                      <section key={b.t}>
                        <h4
                          className={`mb-2 text-[14px] font-semibold ${
                            bi < 2 ? "text-[#92b8b1]" : "text-[#FF7F66]"
                          }`}
                        >
                          {b.t}
                        </h4>
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">
                          {String(b.c ?? "").trim() || "(상세 문단 없음)"}
                        </p>
                      </section>
                    ))}
                    <div className="border-t border-gray-200 pt-4">
                      <p className="mb-2 text-[11px] font-semibold text-gray-900">법령·공식 참고 ([법적 적법성])</p>
                      <div className="flex flex-col gap-2 text-[12px]">
                        <a
                          href="https://www.law.go.kr/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-gray-800 underline decoration-[rgba(0,0,0,0.2)] underline-offset-2 transition-colors hover:text-[#FF7F66] hover:decoration-[#FF7F66]/50"
                        >
                          <Globe className="h-3.5 w-3.5 shrink-0" />
                          국가법령정보센터 (law.go.kr)
                        </a>
                        <a
                          href="https://open.law.go.kr/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-gray-800 underline decoration-[rgba(0,0,0,0.2)] underline-offset-2 transition-colors hover:text-[#FF7F66] hover:decoration-[#FF7F66]/50"
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
            className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[22px] border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_8px_40px_-8px_rgba(0,0,0,0.15)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-4 py-3.5">
              <h3 className="text-sm font-semibold text-gray-900">
                {auditZoomDimension === "hierarchy" && "브랜드 계층 정렬 — 확대"}
                {auditZoomDimension === "originality" && "창의성 — 확대"}
                {auditZoomDimension === "pronunciation" && "직관성 — 확대"}
                {auditZoomDimension === "legality" && "적법성 — 확대"}
                {auditZoomDimension === "publicAppeal" && "대중성 — 확대"}
                {auditZoomDimension === "scalability" && "확장성 — 확대"}
              </h3>
              <button
                type="button"
                className="rounded-full p-1.5 text-gray-500 hover:bg-white hover:text-gray-900"
                aria-label="닫기"
                onClick={() => setAuditZoomDimension(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 text-[14px] leading-relaxed text-gray-700">
              <p className="whitespace-pre-wrap">
                {(() => {
                  const k: keyof NonNullable<typeof namingResult.detailLogic> =
                    auditZoomDimension === "pronunciation" ? "pronunciationLanguage" : auditZoomDimension;
                  const v = namingResult.detailLogic?.[k];
                  return (typeof v === "string" && v.trim() ? v : "(내용 없음)") as string;
                })()}
              </p>
              {auditZoomDimension === "legality" && (
              <div className="mt-4 border-t border-[rgba(0,0,0,0.06)] pt-3 text-[13px]">
                <p className="mb-2 font-semibold text-gray-800">관련 공식 링크</p>
                <a
                  href="https://www.law.go.kr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mr-3 text-gray-800 underline decoration-[rgba(0,0,0,0.2)] underline-offset-2 transition-colors hover:text-[#FF7F66]"
                >
                  국가법령정보센터 →
                </a>
                <a
                  href="https://open.law.go.kr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-800 underline decoration-[rgba(0,0,0,0.2)] underline-offset-2 transition-colors hover:text-[#FF7F66]"
                >
                  open.law.go.kr →
                </a>
              </div>
              )}
            </div>
          </div>
        </div>
      )}
      {leaveConfirmDialog}
    </div>
  );
}
