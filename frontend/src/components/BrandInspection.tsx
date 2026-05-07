import { Fragment, useState, useRef, useEffect, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  analyzeGuideline,
  fetchGuideline,
  fetchHealth,
  runInspection,
  syncGuidelineFromFixed,
  type GuidelineInfo,
} from "@/lib/guidelineApi";
import { GUIDELINE_REFERENCE_OPTIONS } from "@/constants/guidelineReferences";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";
import { GlobalBrandNav } from "@/components/GlobalBrandNav";
import { registerGlobalNavPersist } from "@/lib/globalNavPersistence";
import {
  downloadInspectionReport,
  downloadRevisedImageInFormat,
  type ExportFormat,
} from "@/lib/inspectionExport";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  Download,
  Loader2,
  FileCheck,
  ScanSearch,
  ChevronDown,
  X,
  RotateCcw,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type InspectionStep = "idle" | "uploading" | "analyzing" | "reviewing" | "complete";

type DesignGroup = "online" | "offline";
type DesignType = "사내공지" | "프로모션" | "신제품 홍보" | "매장 제작물" | "안전";

const DESIGN_GROUPS: ReadonlyArray<{ id: DesignGroup; label: string }> = [
  { id: "online", label: "온라인" },
  { id: "offline", label: "오프라인" },
];
const DESIGN_TYPES: readonly DesignType[] = ["사내공지", "프로모션", "신제품 홍보", "매장 제작물", "안전"];

/** 대시보드 ref: 필터·칩 — 비활성 베이지 톤, 활성 검은 pill */
const categoryTabBase =
  "inline-flex items-center justify-center rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20";
const categoryTabIdle =
  "border-[rgba(0,0,0,0.08)] bg-white text-[#5C5C5C] hover:bg-[#EBE9E1] hover:border-[rgba(0,0,0,0.1)]";
const categoryTabActive = "border-black bg-black text-white shadow-[0_4px_14px_-4px_rgba(0,0,0,0.25)]";

const inspectionCard =
  "rounded-[22px] border border-[rgba(0,0,0,0.06)] bg-white p-6 shadow-[0_4px_28px_-10px_rgba(0,0,0,0.08),0_2px_12px_-6px_rgba(0,0,0,0.04)]";

const INSPECTION_NAV_DRAFT_KEY = "brandAxis:inspectionNavDraft";

function InspectionSectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={`flex items-center gap-2.5 text-[17px] font-bold tracking-tight text-[#1A1A1A] ${className}`.trim()}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#FF7F66] shadow-[0_0_0_3px_rgba(255,127,102,0.22)]"
        aria-hidden
      />
      {children}
    </h2>
  );
}

interface Violation {
  category: string;
  issue: string;
  severity: "high" | "medium" | "low";
}

function inspectionResultBadges(score: number, violationCount: number) {
  const tierLabel = score >= 80 ? "우수" : score >= 60 ? "보통" : "주의";
  const delta = score - 60;
  const pass: "pass" | "warn" | "fail" =
    score >= 80 && violationCount === 0 ? "pass" : score >= 60 && violationCount <= 3 ? "warn" : "fail";
  return { tierLabel, pass, delta };
}

function severityLabel(sev: Violation["severity"]): { text: string; pill: string } {
  if (sev === "high") return { text: "높음", pill: "bg-red-500 text-white" };
  if (sev === "medium") return { text: "중간", pill: "bg-[#FF7F66] text-white" };
  return { text: "낮음", pill: "bg-[#E5E3DD] text-[#4B4B4B]" };
}

interface Suggestion {
  category: string;
  recommendation: string;
}

interface PassedCriteria {
  category: string;
  description: string;
}

export function BrandInspection() {
  const navigate = useNavigate();
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [designPreview, setDesignPreview] = useState<string | null>(null);
  const [guidelineFile, setGuidelineFile] = useState<File | null>(null);
  const [guidelineText, setGuidelineText] = useState("");
  const [selectedGuidelineLibrary, setSelectedGuidelineLibrary] = useState<string>("uplus-brand-guideline");
  const [currentStep, setCurrentStep] = useState<InspectionStep>("idle");
  const [brandScore, setBrandScore] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [serverGuideline, setServerGuideline] = useState<GuidelineInfo | null>(null);
  const [guidelineLoading, setGuidelineLoading] = useState(true);
  const [guidelineUploadError, setGuidelineUploadError] = useState<string | null>(null);
  const [guidelineAnalyzing, setGuidelineAnalyzing] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [inspectionOverallSummary, setInspectionOverallSummary] = useState<string | null>(null);
  /** 검수 응답의 AI 교정 이미지 1회분만 유지 (추가 생성 없음) */
  const [revisedImageAsset, setRevisedImageAsset] = useState<{ mimeType: string; dataUrl: string } | null>(null);
  const [revisionNote, setRevisionNote] = useState<string | null>(null);

  const [guidelineDetailOpen, setGuidelineDetailOpen] = useState(false);
  const [reportExportFormat, setReportExportFormat] = useState<ExportFormat>("png");
  const [revisedExportFormat, setRevisedExportFormat] = useState<ExportFormat>("png");

  const [selectedDesignGroup, setSelectedDesignGroup] = useState<DesignGroup>("online");
  const [selectedDesignType, setSelectedDesignType] = useState<DesignType | null>(null);

  const designInputRef = useRef<HTMLInputElement>(null);
  const guidelineInputRef = useRef<HTMLInputElement>(null);
  /** 검수 요청 취소 시 증가 → 진행 중 응답은 상태 반영 안 함 */
  const inspectionEpochRef = useRef(0);

  const steps = [
    { id: "uploading", label: "업로드", icon: Upload },
    { id: "analyzing", label: "분석", icon: ScanSearch },
    { id: "reviewing", label: "검토", icon: FileCheck },
    { id: "complete", label: "완료", icon: CheckCircle2 },
  ];

  const suggestions: Suggestion[] = [];
  const passedCriteria: PassedCriteria[] = [];

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(INSPECTION_NAV_DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        v?: number;
        selectedDesignGroup?: DesignGroup;
        selectedDesignType?: DesignType | null;
        guidelineText?: string;
        selectedGuidelineLibrary?: string;
      };
      if (d.v !== 1) return;
      if (d.selectedDesignGroup === "online" || d.selectedDesignGroup === "offline") setSelectedDesignGroup(d.selectedDesignGroup);
      if (
        d.selectedDesignType === null ||
        (typeof d.selectedDesignType === "string" && (DESIGN_TYPES as readonly string[]).includes(d.selectedDesignType))
      ) {
        setSelectedDesignType(d.selectedDesignType ?? null);
      }
      if (typeof d.guidelineText === "string") setGuidelineText(d.guidelineText);
      if (typeof d.selectedGuidelineLibrary === "string") setSelectedGuidelineLibrary(d.selectedGuidelineLibrary);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return registerGlobalNavPersist(() => {
      try {
        sessionStorage.setItem(
          INSPECTION_NAV_DRAFT_KEY,
          JSON.stringify({
            v: 1,
            selectedDesignGroup,
            selectedDesignType,
            guidelineText,
            selectedGuidelineLibrary,
          }),
        );
      } catch (e) {
        console.warn("[inspectionNavDraft]", e);
      }
    });
  }, [
    selectedDesignGroup,
    selectedDesignType,
    guidelineText,
    selectedGuidelineLibrary,
  ]);

  useEffect(() => {
    if (!guidelineDetailOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [guidelineDetailOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGuidelineLoading(true);
      setGuidelineUploadError(null);
      try {
        const h = await fetchHealth();
        if (cancelled) return;
        setGeminiConfigured(h.gemini);
        const synced = await syncGuidelineFromFixed(selectedGuidelineLibrary);
        if (cancelled) return;
        setServerGuideline(synced.guideline);
      } catch (e) {
        if (!cancelled) {
          setGeminiConfigured(null);
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

  const handleDesignUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDesignFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setDesignPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleDesignUploadCancel = () => {
    setDesignFile(null);
    setDesignPreview(null);
    if (designInputRef.current) designInputRef.current.value = "";
  };

  const handleGuidelineUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGuidelineFile(file);
    setGuidelineUploadError(null);
  };

  const handleGuidelineUploadCancel = () => {
    setGuidelineFile(null);
    setGuidelineUploadError(null);
    if (guidelineInputRef.current) guidelineInputRef.current.value = "";
  };

  const handleAnalyzeStoredGuideline = () => {
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

  const isBusy = currentStep === "analyzing";

  const handleStopAndResetFromProgress = () => {
    inspectionEpochRef.current += 1;
    setCurrentStep("idle");
    setShowResults(false);
    setBrandScore(null);
    setInspectionError(null);
    setViolations([]);
    setInspectionOverallSummary(null);
    setRevisedImageAsset(null);
    setRevisionNote(null);
    handleDesignUploadCancel();
    setGuidelineFile(null);
    setGuidelineUploadError(null);
    if (guidelineInputRef.current) guidelineInputRef.current.value = "";
    setGuidelineText("");
  };

  const handleRunAudit = () => {
    if (!designFile) return;

    inspectionEpochRef.current += 1;
    const epoch = inspectionEpochRef.current;

    setInspectionError(null);
    setShowResults(false);
    setRevisedImageAsset(null);
    setCurrentStep("analyzing");

    void (async () => {
      try {
        const res = await runInspection({
          design: designFile,
          guidelineId: selectedGuidelineLibrary,
          additionalNotes: guidelineText,
          supplementaryReference: guidelineFile ?? undefined,
          designGroup: selectedDesignGroup,
          designType: selectedDesignType ?? undefined,
        });
        if (epoch !== inspectionEpochRef.current) return;
        setBrandScore(res.score);
        setInspectionOverallSummary(res.overallSummary?.trim() && res.overallSummary.trim().length > 0 ? res.overallSummary.trim() : null);
        if (res.revisedImage?.data && res.revisedImage.mimeType) {
          const asset = {
            mimeType: res.revisedImage.mimeType,
            dataUrl: `data:${res.revisedImage.mimeType};base64,${res.revisedImage.data}`,
          };
          setRevisedImageAsset(asset);
        } else {
          setRevisedImageAsset(null);
        }
        setRevisionNote(res.revisionNote?.trim() ? res.revisionNote.trim() : null);
        setViolations(
          res.violations.map((v) => ({
            category: v.category,
            issue: v.issue,
            severity: (["high", "medium", "low"].includes(v.severity)
              ? v.severity
              : "medium") as Violation["severity"],
          }))
        );
        setCurrentStep("complete");
        setShowResults(true);
      } catch (err) {
        if (epoch !== inspectionEpochRef.current) return;
        setInspectionError(err instanceof Error ? err.message : String(err));
        setCurrentStep("idle");
      }
    })();
  };

  const handlePrimaryCta = () => {
    if (currentStep === "complete") {
      setCurrentStep("idle");
      setShowResults(false);
      setBrandScore(null);
      setInspectionError(null);
      setViolations([]);
      setInspectionOverallSummary(null);
      setRevisedImageAsset(null);
      setRevisionNote(null);
      return;
    }
    handleRunAudit();
  };

  const getStepIndex = (step: InspectionStep) => {
    const stepOrder: InspectionStep[] = ["idle", "uploading", "analyzing", "reviewing", "complete"];
    return stepOrder.indexOf(step);
  };

  const currentStepIndex = getStepIndex(currentStep);

  return (
    <div className="min-h-screen bg-[#F8F7F4] font-sans">
      <header className="sticky top-0 z-10 border-b border-[rgba(0,0,0,0.06)] bg-white/95 shadow-[0_4px_24px_-6px_rgba(0,0,0,0.06)] backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <AxisBrandTitle subtitle="브랜드 디자인 검수" />
            </div>
          </div>
        </div>
        <GlobalBrandNav className="bg-white/95" innerClassName="max-w-7xl px-6" />
      </header>

      {currentStep !== "idle" && (
        <div className="border-b border-[rgba(0,0,0,0.06)] bg-[#EBE9E1]/50">
          <div className="mx-auto max-w-7xl px-6 py-5">
            <div className="flex w-full items-center">
              {steps.map((step, index) => {
                const StepIcon = step.icon;
                const isActive = index <= currentStepIndex - 1;
                const isCurrent = index === currentStepIndex - 1;
                const allComplete = currentStep === "complete";

                return (
                  <Fragment key={step.id}>
                    <div className="flex w-[72px] shrink-0 flex-col items-center gap-2 sm:w-[88px]">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-full transition-all ${
                          allComplete
                            ? "bg-black text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)]"
                            : isActive && !isCurrent
                              ? "bg-black text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)]"
                              : isCurrent
                                ? "bg-[#FF7F66] text-white shadow-[0_4px_16px_-4px_rgba(255,127,102,0.45)] ring-4 ring-[#FF7F66]/25"
                                : "bg-[#E5E3DD] text-[#9CA3AF]"
                        }`}
                      >
                        {isCurrent && currentStep !== "complete" ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <StepIcon className="h-5 w-5" />
                        )}
                      </div>
                      <span
                        className={`text-center text-[11px] font-semibold ${isActive || isCurrent ? "text-[#1A1A1A]" : "text-gray-400"}`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {index < steps.length - 1 ? (
                      <div
                        className={`mx-1 h-[3px] min-w-[8px] flex-1 rounded-full transition-all sm:mx-2 ${
                          allComplete || index <= currentStepIndex - 2 ? "bg-black" : "bg-[#D6D4CD]"
                        }`}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-10">
        <div className="space-y-8">
          {/* ── 제작물 유형 ── */}
          <div className={`${inspectionCard} px-5 py-5 sm:px-8`}>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <InspectionSectionTitle>제작물 유형</InspectionSectionTitle>
                <p className="mt-2 text-sm text-[#6B6B6B]">검수 맥락에 맞는 온라인·오프라인과 세부 유형을 지정하세요.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:ml-auto" role="group" aria-label="브랜드 디자인 모드">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full border-[rgba(0,0,0,0.1)] bg-white text-[#6B6B6B]"
                  onClick={() => navigate("/brand-graphics")}
                >
                  디자인 제작
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full border-transparent bg-black px-4 text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.25)] hover:bg-black/90"
                >
                  디자인 검수
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {DESIGN_GROUPS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedDesignGroup(g.id)}
                    className={`${categoryTabBase} ${selectedDesignGroup === g.id ? categoryTabActive : categoryTabIdle}`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {DESIGN_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedDesignType(t)}
                    className={`${categoryTabBase} ${selectedDesignType === t ? categoryTabActive : categoryTabIdle}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400">온라인/오프라인 전환 시에도 세부 유형 선택은 유지됩니다.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
            <div className={`flex min-h-0 flex-col ${inspectionCard} !p-5 lg:self-start`}>
              <div className="mb-4">
                <InspectionSectionTitle className="!text-[16px]">검수할 디자인 업로드</InspectionSectionTitle>
                <p className="mt-1.5 text-xs text-[#6B6B6B]">PNG · JPEG · PDF · 최대 10MB</p>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => designInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    designInputRef.current?.click();
                  }
                }}
                className="flex h-[320px] w-full shrink-0 cursor-pointer flex-col overflow-hidden rounded-[20px] border-2 border-dashed border-[rgba(0,0,0,0.1)] bg-[#FAFAF8] text-center transition-all hover:border-[#FF7F66]/60 hover:bg-[#FFF7F5]"
              >
                {designPreview ? (
                  <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
                    <div className="mt-[calc(0.25rem/3)] flex min-h-0 min-w-0 flex-1 flex-col">
                      <div className="flex min-h-0 flex-1 items-end justify-center overflow-hidden px-3 pb-1 pt-0">
                        <img
                          src={designPreview}
                          alt="Design preview"
                          className="mx-auto block h-auto max-h-[91.728%] w-auto max-w-full min-h-0 min-w-0 rounded-lg border border-gray-200 object-contain object-bottom shadow-sm"
                        />
                      </div>
                      <div className="shrink-0 px-3 pb-2 pt-0.5">
                        <p className="max-w-full break-all leading-snug text-[8.5px] text-gray-600">
                          {designFile?.name}
                        </p>
                        <div className="mt-2 flex flex-row flex-wrap items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            className="h-[22px] min-h-0 shrink-0 rounded-full border-[rgba(0,0,0,0.12)] px-3 py-0 text-[10px] leading-none"
                            onClick={(e) => {
                              e.stopPropagation();
                              designInputRef.current?.click();
                            }}
                          >
                            파일 변경
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            className="h-[22px] min-h-0 shrink-0 rounded-full px-2 py-0 text-[10px] leading-none text-gray-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDesignUploadCancel();
                            }}
                          >
                            취소
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
                    <div className="mx-auto flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#EBE9E1]">
                      <Upload className="h-8 w-8 text-[#6B6B6B]" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[#1A1A1A]">클릭하여 파일 업로드</p>
                      <p className="text-xs text-[#6B6B6B]">PNG, JPEG, PDF 지원 (최대 10MB)</p>
                    </div>
                  </div>
                )}
              </div>
              <input
                ref={designInputRef}
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                className="hidden"
                onChange={handleDesignUpload}
              />
            </div>

            <div className={`flex min-h-0 flex-col ${inspectionCard} !p-5`}>
              <div className="mb-3">
                <InspectionSectionTitle className="!text-[16px]">검수 참조 파일 업로드</InspectionSectionTitle>
                <p className="mt-2 text-xs leading-relaxed text-[#6B6B6B]">
                  아래 <span className="font-semibold text-[#1A1A1A]">참조 가이드라인</span> 옵션에 연동된 문서를{" "}
                  <span className="font-semibold text-[#1A1A1A]">우선</span>으로 검수합니다. 여기에 올린 파일은 고정
                  자료를 바꾸지 않으며, 검수 실행 시{" "}
                  <span className="font-semibold text-[#C14D38]">추가 보완 자료</span>로만 함께 반영됩니다.
                </p>
              </div>

              <div className="flex min-h-[220px] flex-1 flex-col gap-3">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => guidelineInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      guidelineInputRef.current?.click();
                    }
                  }}
                  className="flex min-h-0 flex-1 basis-0 cursor-pointer items-center justify-center overflow-hidden rounded-[20px] border-2 border-dashed border-[rgba(0,0,0,0.1)] bg-[#FAFAF8] py-3 text-center transition-all hover:border-[#FF7F66]/50 hover:bg-[#FFF7F5]"
                >
                    {guidelineFile ? (
                      <div className="flex w-full max-w-full flex-col items-center justify-center gap-1.5 px-3 py-1">
                        <FileText className="mx-auto h-7 w-7 shrink-0 text-[#FF7F66]" strokeWidth={1.75} />
                        <p className="line-clamp-2 max-w-full break-all text-[11px] leading-snug text-[#4B4B4B]">
                          {guidelineFile.name}
                        </p>
                        <div className="mt-0.5 flex flex-row flex-wrap items-center justify-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            className="h-[22px] min-h-0 shrink-0 rounded-full border-[rgba(0,0,0,0.12)] px-3 py-0 text-[10px] leading-none"
                            onClick={(e) => {
                              e.stopPropagation();
                              guidelineInputRef.current?.click();
                            }}
                          >
                            파일 변경
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            className="h-[22px] min-h-0 shrink-0 rounded-full px-2 py-0 text-[10px] leading-none text-gray-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGuidelineUploadCancel();
                            }}
                          >
                            취소
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex w-full flex-col items-center justify-center gap-1.5 px-3 py-2">
                        <div className="mx-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EBE9E1]">
                          <Upload className="h-4 w-4 text-[#6B6B6B]" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-[#1A1A1A]">추가 참조 (선택)</p>
                          <p className="text-[11px] text-[#6B6B6B]">PDF, PNG, JPEG · 검수 시 보완 맥락</p>
                        </div>
                      </div>
                    )}
                </div>

                <div className="flex min-h-0 flex-1 basis-0 flex-col justify-center gap-2 overflow-y-auto rounded-[18px] border border-[rgba(0,0,0,0.06)] bg-[#EBE9E1]/60 px-3 py-2.5">
                  <label className="text-xs font-bold text-[#1A1A1A]" htmlFor="reference-guideline">
                    참조 가이드라인
                  </label>
                  <div className="relative shrink-0">
                    <select
                      id="reference-guideline"
                      value={selectedGuidelineLibrary}
                      onChange={(e) => {
                        setSelectedGuidelineLibrary(e.target.value);
                        setGuidelineFile(null);
                        if (guidelineInputRef.current) guidelineInputRef.current.value = "";
                      }}
                      className="w-full appearance-none rounded-xl border border-[rgba(0,0,0,0.08)] bg-white py-2 pl-3 pr-9 text-sm text-[#1A1A1A] shadow-sm focus:border-[#FF7F66] focus:outline-none focus:ring-2 focus:ring-[#FF7F66]/20"
                    >
                      {GUIDELINE_REFERENCE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-[#6B6B6B]"
                    />
                  </div>
                  {guidelineUploadError && (
                    <p className="line-clamp-2 text-[11px] text-red-600">{guidelineUploadError}</p>
                  )}
                </div>
              </div>

              <input
                ref={guidelineInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="hidden"
                onChange={handleGuidelineUpload}
              />

              <div className="mt-3 min-h-0 shrink-0 rounded-[16px] border border-[rgba(0,0,0,0.06)] bg-white p-3 text-xs text-[#4B4B4B] shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-[#1A1A1A]">서버 연동 상태</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {guidelineLoading ? (
                      <span className="inline-flex items-center gap-1.5 text-[#6B6B6B]">
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                        확인 중
                      </span>
                    ) : (
                      <span
                        className={
                          serverGuideline?.hasFile
                            ? "inline-flex items-center rounded-full bg-[#FF7F66] px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm"
                            : "rounded-full bg-[#E5E3DD] px-2.5 py-0.5 text-[11px] font-semibold text-[#6B6B6B]"
                        }
                      >
                        {serverGuideline?.hasFile ? "Active" : "Off"}
                      </span>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full border-[rgba(0,0,0,0.12)] text-[11px] font-semibold"
                      disabled={guidelineLoading}
                      onClick={() => setGuidelineDetailOpen(true)}
                    >
                      상세 보기
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`${inspectionCard} !p-6`}>
            <InspectionSectionTitle className="!text-[16px]">검수 사항 직접 입력</InspectionSectionTitle>
            <textarea
              value={guidelineText}
              onChange={(e) => setGuidelineText(e.target.value)}
              placeholder={
                "브랜드 가이드라인을 직접 입력하세요...\n\n예시:\n• 로고는 항상 15mm 이상 크기로 사용\n• 브랜드 컬러는 #FF7F66 (액센트 코랄)\n• 공식 폰트는 LG Smart UI 사용\n• 로고 주변 최소 10mm 여백 확보\n• 그리드 시스템: 12컬럼 레이아웃"
              }
              className="mt-4 h-40 w-full resize-none overflow-y-auto rounded-[16px] border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF] focus:border-[#FF7F66] focus:outline-none focus:ring-2 focus:ring-[#FF7F66]/20"
            />
          </div>

          {inspectionError && (
            <div className="rounded-[16px] border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-800">
              {inspectionError}
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={handlePrimaryCta}
              disabled={!designFile || isBusy}
              className="brand-btn-primary h-14 w-full text-base font-semibold disabled:pointer-events-none disabled:opacity-45"
            >
              {isBusy ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  검수 진행 중...
                </>
              ) : currentStep === "complete" ? (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  처음으로
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  브랜드 검수 실행 ✨
                </>
              )}
            </button>
            {isBusy && (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-full border-[rgba(0,0,0,0.12)] text-sm font-medium text-[#1A1A1A] hover:bg-[#EBE9E1]"
                onClick={handleStopAndResetFromProgress}
              >
                <RotateCcw className="mr-2 h-4 w-4 shrink-0" />
                중지하고 처음부터
              </Button>
            )}
          </div>

          {showResults && brandScore !== null && (() => {
            const { tierLabel, pass, delta } = inspectionResultBadges(brandScore, violations.length);
            return (
            <div className={`${inspectionCard} !p-0 overflow-hidden`}>
              {/* Overview-style hero */}
              <div className="border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-6 py-6 sm:px-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Overview</p>
                <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <h2 className="text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-[26px]">검수 결과</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.2)]">
                      검수 완료
                    </span>
                    {pass === "pass" ? (
                      <span className="inline-flex items-center rounded-full bg-[#76B947] px-2.5 py-1 text-[11px] font-bold text-white">
                        통과
                      </span>
                    ) : pass === "warn" ? (
                      <span className="inline-flex items-center rounded-full bg-[#FF7F66] px-2.5 py-1 text-[11px] font-bold text-white">
                        조건부
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white">
                        재검토
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1A1A1A]">
                      등급 · {tierLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Metric sub-cards (dashboard reference) */}
              <div className="grid grid-cols-1 gap-4 border-b border-[rgba(0,0,0,0.06)] bg-white px-6 py-6 sm:grid-cols-3 sm:px-8">
                <div className="rounded-[18px] border border-[rgba(0,0,0,0.05)] bg-[#FAFAF8] p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,127,102,0.16)]">
                      <BarChart3 className="h-5 w-5 text-[#C14D38]" strokeWidth={2} />
                    </div>
                    {delta >= 0 ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FF7F66] px-2 py-0.5 text-[11px] font-bold text-white">
                        <TrendingUp className="h-3 w-3" />
                        +{delta}pts
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
                        {delta}pts
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-xs font-medium text-[#6B6B6B]">디자인 점수</p>
                  <p className="mt-0.5 text-3xl font-bold tabular-nums tracking-tight text-[#1A1A1A]">{brandScore}</p>
                </div>
                <div className="rounded-[18px] border border-[rgba(0,0,0,0.05)] bg-[#FAFAF8] p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(0,0,0,0.05)]">
                      <XCircle className="h-5 w-5 text-[#DC2626]" />
                    </div>
                    {violations.length === 0 ? (
                      <span className="inline-flex rounded-full bg-[#76B947] px-2 py-0.5 text-[10px] font-bold text-white">Clear</span>
                    ) : (
                      <span className="inline-flex rounded-full bg-[#FF7F66] px-2 py-0.5 text-[10px] font-bold text-white">Issue</span>
                    )}
                  </div>
                  <p className="mt-3 text-xs font-medium text-[#6B6B6B]">위반 사항</p>
                  <p className="mt-0.5 text-3xl font-bold tabular-nums text-[#1A1A1A]">{violations.length}</p>
                </div>
                <div className="rounded-[18px] border border-[rgba(0,0,0,0.05)] bg-[#FAFAF8] p-4 shadow-sm sm:col-span-1">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(255,127,102,0.12)]">
                    <Sparkles className="h-5 w-5 text-[#E85A42]" />
                  </div>
                  <p className="mt-3 text-xs font-medium text-[#6B6B6B]">AI 요약</p>
                  <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-[#1A1A1A]">
                    {inspectionOverallSummary
                      ? "종합 코멘트는 우측 패널에서 전체를 확인하세요."
                      : "제공된 요약이 없습니다."}
                  </p>
                </div>
              </div>

              {/* Rounded bar chart (two-tone coral) */}
              <div className="border-b border-[rgba(0,0,0,0.06)] bg-white px-6 py-4 sm:px-8">
                <div className="mb-1.5 flex items-center justify-between text-xs text-[#6B6B6B]">
                  <span>적정성 지수 (0–100)</span>
                  <span className="font-semibold text-[#1A1A1A]">{brandScore}%</span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-[rgba(255,127,102,0.12)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#FF9A7A] to-[#FF7F66] shadow-sm transition-all duration-700"
                    style={{ width: `${Math.min(100, brandScore)}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-[#9CA3AF]">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
              </div>

              <div className="flex flex-col gap-0 md:flex-row md:items-stretch">
                <div className="flex w-full shrink-0 flex-col border-b border-[rgba(0,0,0,0.06)] bg-[#EBE9E1]/50 p-6 md:w-80 md:max-w-[320px] md:border-b-0 md:border-r">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 md:justify-start">
                    <h2 className="text-sm font-bold text-[#1A1A1A]">적정성 평가</h2>
                    <span className="inline-flex items-center rounded-full bg-[#FF7F66] px-2.5 py-1 text-xs font-bold text-white shadow-sm">
                      {brandScore}%
                    </span>
                  </div>
                  <div className="flex flex-1 items-center justify-center py-3">
                    <div className="relative h-44 w-44 shrink-0">
                      <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 160 160">
                        <circle cx="80" cy="80" r="68" stroke="#E0DDD6" strokeWidth="14" fill="none" />
                        <circle
                          cx="80"
                          cy="80"
                          r="68"
                          stroke="#FF7F66"
                          strokeWidth="14"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 68}`}
                          strokeDashoffset={`${2 * Math.PI * 68 * (1 - brandScore / 100)}`}
                          strokeLinecap="round"
                          className="transition-all duration-1000"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-bold tracking-tight text-[#1A1A1A]">{brandScore}</span>
                        <span className="text-sm font-medium text-[#6B6B6B]">/ 100</span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-1 text-center text-sm leading-relaxed text-[#4B4B4B] md:text-left">
                    {brandScore >= 80
                      ? "우수: 브랜드 가이드라인을 잘 준수하고 있습니다."
                      : brandScore >= 60
                        ? "보통: 일부 개선이 필요합니다."
                        : "미흡: 여러 가이드라인 위반 사항이 있습니다."}
                  </p>
                </div>

                <div className="flex min-w-0 flex-1 flex-col p-6">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <InspectionSectionTitle className="!text-[16px]">검수 상세</InspectionSectionTitle>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <label htmlFor="report-export-format" className="sr-only">
                        리포트 파일 형식
                      </label>
                      <select
                        id="report-export-format"
                        value={reportExportFormat}
                        onChange={(e) => setReportExportFormat(e.target.value as ExportFormat)}
                        className="h-10 rounded-full border border-[rgba(0,0,0,0.1)] bg-[#E8E6E0]/80 px-3 text-xs font-medium text-[#1A1A1A] focus:border-[#FF7F66] focus:outline-none focus:ring-2 focus:ring-[#FF7F66]/20"
                      >
                        <option value="png">PNG</option>
                        <option value="pdf">PDF</option>
                        <option value="jpeg">JPEG</option>
                      </select>
                      <button
                        type="button"
                        className="brand-btn-primary h-10 gap-2 px-5 text-sm font-semibold"
                        onClick={() => {
                          if (brandScore === null) return;
                          void downloadInspectionReport(
                            {
                              brandScore,
                              overallSummary: inspectionOverallSummary,
                              violations,
                            },
                            reportExportFormat
                          );
                        }}
                      >
                        <Download className="h-4 w-4" />
                        리포트 다운로드
                      </button>
                    </div>
                  </div>

                  {inspectionOverallSummary && (
                    <div className="mb-4 rounded-[16px] border border-[rgba(0,0,0,0.05)] bg-[#FAFAF8] p-4 text-sm leading-relaxed text-[#374151]">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                          <Sparkles className="h-4 w-4 text-[#FF7F66]" />
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wide text-[#6B6B6B]">AI 코멘트</span>
                      </div>
                      {inspectionOverallSummary}
                    </div>
                  )}

                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto md:max-h-[min(420px,52vh)]">
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <h3 className="text-sm font-bold text-[#1A1A1A]">피드백 · 위반</h3>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          {violations.length}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {violations.length === 0 ? (
                          <p className="rounded-[16px] border border-dashed border-[rgba(0,0,0,0.1)] bg-[#FAFAF8] px-4 py-6 text-center text-sm text-[#6B6B6B]">
                            등록된 위반 사항이 없습니다.
                          </p>
                        ) : (
                          violations.map((violation, index) => {
                            const sev = severityLabel(violation.severity);
                            return (
                              <div
                                key={index}
                                className="flex gap-3 rounded-[18px] border border-[rgba(0,0,0,0.06)] bg-white p-3.5 shadow-[0_2px_14px_-8px_rgba(0,0,0,0.1)]"
                              >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3F1EC] text-[10px] font-bold text-[#FF7F66]">
                                  AI
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-[#1A1A1A]">{violation.category}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sev.pill}`}>{sev.text}</span>
                                  </div>
                                  <p className="mt-1.5 text-sm leading-relaxed text-[#4B4B4B]">{violation.issue}</p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {suggestions.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-[#FF7F66]" />
                          <h3 className="text-sm font-bold text-[#1A1A1A]">개선 제안</h3>
                          <span className="rounded-full bg-[rgba(255,127,102,0.15)] px-2 py-0.5 text-xs font-semibold text-[#C14D38]">
                            {suggestions.length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {suggestions.map((suggestion, index) => (
                            <div
                              key={index}
                              className="flex gap-3 rounded-[16px] border border-[rgba(255,127,102,0.2)] bg-[#FFF7F4] p-3"
                            >
                              <div className="mt-0.5 shrink-0">
                                <Sparkles className="h-4 w-4 text-[#FF7F66]" />
                              </div>
                              <div className="flex-1">
                                <p className="mb-0.5 text-xs font-semibold text-[#1A1A1A]">{suggestion.category}</p>
                                <p className="text-xs leading-relaxed text-[#4B4B4B]">{suggestion.recommendation}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {passedCriteria.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-[#76B947]" />
                          <h3 className="text-sm font-bold text-[#1A1A1A]">준수 항목</h3>
                          <span className="inline-flex items-center rounded-full bg-[#C8D9C4] px-2 py-0.5 text-xs font-bold text-[#2F4A38]">
                            {passedCriteria.length} Active
                          </span>
                        </div>
                        <div className="space-y-2">
                          {passedCriteria.map((criteria, index) => (
                            <div
                              key={index}
                              className="flex gap-2 rounded-[16px] border border-[rgba(118,185,71,0.3)] bg-[#F4FAF0] p-2.5"
                            >
                              <div className="mt-0.5 shrink-0">
                                <CheckCircle2 className="h-3.5 w-3.5 text-[#76B947]" />
                              </div>
                              <div className="flex-1">
                                <p className="mb-0.5 text-xs font-semibold text-[#1A1A1A]">{criteria.category}</p>
                                <p className="text-xs text-[#4B4B4B]">{criteria.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {showResults && designPreview && (
            <div className={`${inspectionCard} !p-6`}>
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <InspectionSectionTitle className="!text-[16px]">AI 수정본 (Gemini)</InspectionSectionTitle>
                  <p className="mt-1.5 text-xs text-[#6B6B6B]">
                    검수 1회에 대해 교정 이미지를 1번만 생성합니다. (PNG/JPEG 검수 대상만)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="revised-export-format" className="sr-only">
                    수정본 파일 형식
                  </label>
                  <select
                    id="revised-export-format"
                    value={revisedExportFormat}
                    onChange={(e) => setRevisedExportFormat(e.target.value as ExportFormat)}
                    disabled={!revisedImageAsset}
                    className="rounded-full border border-[rgba(0,0,0,0.1)] bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium focus:border-[#FF7F66] focus:outline-none focus:ring-2 focus:ring-[#FF7F66]/20 disabled:opacity-50"
                  >
                    <option value="png">PNG</option>
                    <option value="pdf">PDF</option>
                    <option value="jpeg">JPEG</option>
                  </select>
                  {revisedImageAsset ? (
                    <button
                      type="button"
                      onClick={() =>
                        downloadRevisedImageInFormat(revisedImageAsset.dataUrl, revisedExportFormat)
                      }
                      className="brand-btn-primary inline-flex h-10 items-center gap-2 px-5"
                    >
                      <Download className="h-4 w-4" />
                      수정본 다운로드
                    </button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      disabled
                      className="h-10 rounded-full border-[rgba(0,0,0,0.12)] font-semibold"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      수정본 다운로드
                    </Button>
                  )}
                </div>
              </div>
              {revisionNote && !revisedImageAsset && (
                <p className="mb-4 rounded-[14px] border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm text-amber-900">
                  {revisionNote}
                </p>
              )}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <p className="mb-3 text-sm font-bold text-[#1A1A1A]">검수 대상 (원본)</p>
                  <div className="overflow-hidden rounded-[16px] border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8]">
                    <img src={designPreview} alt="검수 대상 원본" className="w-full" />
                  </div>
                </div>
                <div>
                  <p className="mb-3 text-sm font-bold text-[#1A1A1A]">AI 수정본</p>
                  <div className="relative overflow-hidden rounded-[16px] border border-[rgba(0,0,0,0.06)] bg-[#F3F1EC]">
                    {revisedImageAsset ? (
                      <>
                        <img src={revisedImageAsset.dataUrl} alt="AI 수정본" className="w-full" />
                        <div className="absolute right-2 top-2">
                          <span className="inline-flex items-center rounded-full bg-black px-2.5 py-1 text-[11px] font-bold text-white shadow-md">
                            AI 생성
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex min-h-[200px] items-center justify-center p-6 text-center text-sm text-[#6B6B6B]">
                        {revisionNote ?? "수정 이미지를 생성하지 못했습니다. API 키·이미지 모델 설정을 확인하세요."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
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
            aria-labelledby="guideline-detail-title"
            className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[22px] border border-[rgba(0,0,0,0.08)] bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 id="guideline-detail-title" className="text-sm font-semibold text-gray-900">
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
                        className="shrink-0 rounded-full border border-[rgba(0,0,0,0.12)]"
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
              ) : (
                <p className="text-amber-800">
                  아직 서버에 가이드 파일이 없습니다. 위에서 PDF/이미지를 올리면 저장·요약됩니다.
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
    </div>
  );
}
