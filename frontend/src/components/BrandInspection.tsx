import { Fragment, useState, useRef, useEffect, useMemo, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  analyzeGuideline,
  fetchGuideline,
  fetchHealth,
  runInspection,
  runAdditionalRevisionImage,
  syncGuidelineFromFixed,
  type GuidelineInfo,
} from "@/lib/guidelineApi";
import { GUIDELINE_REFERENCE_OPTIONS } from "@/constants/guidelineReferences";
import {
  downloadInspectionReport,
  downloadRevisedImageInFormat,
  type ExportFormat,
} from "@/lib/inspectionExport";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  ArrowLeft,
  Download,
  Loader2,
  FileCheck,
  ScanSearch,
  ChevronDown,
  X,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type InspectionStep = "idle" | "uploading" | "analyzing" | "reviewing" | "complete";

interface Violation {
  category: string;
  issue: string;
  severity: "high" | "medium" | "low";
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
  /** AI 수정 이미지 버전 순서 (0: 최초 생성, 이후 추가 수정마다 append) */
  const [revisionHistory, setRevisionHistory] = useState<{ mimeType: string; dataUrl: string }[]>([]);
  const [revisionViewIndex, setRevisionViewIndex] = useState(0);
  const [revisionNote, setRevisionNote] = useState<string | null>(null);

  const latestRevision =
    revisionHistory.length > 0 ? revisionHistory[revisionHistory.length - 1]! : null;
  const displayedRevision = useMemo(() => {
    if (revisionHistory.length === 0) return null;
    const i = Math.min(Math.max(0, revisionViewIndex), revisionHistory.length - 1);
    return revisionHistory[i] ?? null;
  }, [revisionHistory, revisionViewIndex]);
  const [guidelineDetailOpen, setGuidelineDetailOpen] = useState(false);
  const [additionalRevisionBusy, setAdditionalRevisionBusy] = useState(false);
  const [additionalRevisionError, setAdditionalRevisionError] = useState<string | null>(null);
  const [reportExportFormat, setReportExportFormat] = useState<ExportFormat>("png");
  const [revisedExportFormat, setRevisedExportFormat] = useState<ExportFormat>("png");

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
    setAdditionalRevisionBusy(false);
    setCurrentStep("idle");
    setShowResults(false);
    setBrandScore(null);
    setInspectionError(null);
    setViolations([]);
    setInspectionOverallSummary(null);
    setRevisionHistory([]);
    setRevisionViewIndex(0);
    setRevisionNote(null);
    setAdditionalRevisionError(null);
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
    setAdditionalRevisionError(null);
    setRevisionHistory([]);
    setRevisionViewIndex(0);
    setCurrentStep("analyzing");

    void (async () => {
      try {
        const res = await runInspection({
          design: designFile,
          guidelineId: selectedGuidelineLibrary,
          additionalNotes: guidelineText,
          supplementaryReference: guidelineFile ?? undefined,
        });
        if (epoch !== inspectionEpochRef.current) return;
        setBrandScore(res.score);
        setInspectionOverallSummary(res.overallSummary?.trim() && res.overallSummary.trim().length > 0 ? res.overallSummary.trim() : null);
        if (res.revisedImage?.data && res.revisedImage.mimeType) {
          const asset = {
            mimeType: res.revisedImage.mimeType,
            dataUrl: `data:${res.revisedImage.mimeType};base64,${res.revisedImage.data}`,
          };
          setRevisionHistory([asset]);
          setRevisionViewIndex(0);
        } else {
          setRevisionHistory([]);
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
      setRevisionHistory([]);
      setRevisionViewIndex(0);
      setRevisionNote(null);
      setAdditionalRevisionError(null);
      return;
    }
    handleRunAudit();
  };

  const handleAdditionalRevision = async () => {
    if (!designFile || !designFile.type.startsWith("image/") || additionalRevisionBusy) return;

    setAdditionalRevisionBusy(true);
    setAdditionalRevisionError(null);
    try {
      const res = await runAdditionalRevisionImage({
        guidelineId: selectedGuidelineLibrary,
        designFile,
        revisionDataUrl: latestRevision?.dataUrl ?? null,
        overallSummary: inspectionOverallSummary ?? "",
        violations: violations.map((v) => ({
          category: v.category,
          issue: v.issue,
          severity: v.severity,
        })),
        additionalNotes: guidelineText,
        supplementaryFile: guidelineFile,
      });
      if (res.imageUpdated && res.revisedImage?.data) {
        const asset = {
          mimeType: res.revisedImage.mimeType,
          dataUrl: `data:${res.revisedImage.mimeType};base64,${res.revisedImage.data}`,
        };
        setRevisionHistory((prev) => {
          const next = [...prev, asset];
          setRevisionViewIndex(next.length - 1);
          return next;
        });
        setRevisionNote(null);
      } else {
        setAdditionalRevisionError(
          res.revisionNote?.trim() ||
            "추가 수정 이미지를 생성하지 못했습니다. API 키·이미지 모델 설정을 확인하세요."
        );
      }
    } catch (err) {
      setAdditionalRevisionError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdditionalRevisionBusy(false);
    }
  };

  const getStepIndex = (step: InspectionStep) => {
    const stepOrder: InspectionStep[] = ["idle", "uploading", "analyzing", "reviewing", "complete"];
    return stepOrder.indexOf(step);
  };

  const currentStepIndex = getStepIndex(currentStep);

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
                  <p className="text-xs text-gray-500">브랜드 디자인 검수 Brand Design Inspection</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {currentStep !== "idle" && (
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-4">
            {/* 스텝 고정 폭 + 구간 연결선만 flex-1로 등간격 분배 */}
            <div className="flex w-full items-center">
              {steps.map((step, index) => {
                const StepIcon = step.icon;
                const isActive = index <= currentStepIndex - 1;
                const isCurrent = index === currentStepIndex - 1;

                return (
                  <Fragment key={step.id}>
                    <div className="flex w-[72px] shrink-0 flex-col items-center gap-2 sm:w-[88px]">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                          isActive || isCurrent ? "bg-[#F43182] text-white" : "bg-gray-100 text-gray-400"
                        } ${isCurrent ? "ring-4 ring-[#F43182]/20" : ""}`}
                      >
                        {isCurrent && currentStep !== "complete" ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <StepIcon className="h-5 w-5" />
                        )}
                      </div>
                      <span
                        className={`text-center text-xs font-medium ${isActive || isCurrent ? "text-gray-900" : "text-gray-400"}`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {index < steps.length - 1 ? (
                      <div
                        className={`mx-1 h-0.5 min-w-[8px] flex-1 transition-all sm:mx-2 ${index <= currentStepIndex - 1 ? "bg-[#F43182]" : "bg-gray-200"}`}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
            <div className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white p-4 lg:self-start">
              <div className="mb-2 flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-[#F43182]" />
                <h2 className="font-semibold text-gray-900">검수할 디자인 업로드</h2>
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
                className="flex h-[320px] w-full shrink-0 cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-dashed border-gray-300 text-center transition-all hover:border-[#F43182] hover:bg-[#F43182]/5"
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
                            className="h-[22px] min-h-0 shrink-0 px-2 py-0 text-[10px] leading-none"
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
                            className="h-[22px] min-h-0 shrink-0 px-2 py-0 text-[10px] leading-none text-gray-600"
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
                    <div className="mx-auto flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-100">
                      <Upload className="h-8 w-8 text-gray-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-900">클릭하여 파일 업로드</p>
                      <p className="text-xs text-gray-500">PNG, JPEG, PDF 지원 (최대 10MB)</p>
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

            <div className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-violet-500" />
                  <h2 className="font-semibold text-gray-900">검수 참조 파일 업로드</h2>
                </div>
                <p className="text-xs leading-snug text-gray-500">
                  아래 <span className="font-medium text-gray-700">참조 가이드라인</span> 옵션에 연동된 문서를{" "}
                  <span className="font-medium text-gray-700">우선</span>으로 검수합니다. 여기에 올린 파일은 고정
                  자료를 바꾸지 않으며, 검수 실행 시{" "}
                  <span className="font-medium text-violet-800">추가 보완 자료</span>로만 함께 반영됩니다.
                </p>
              </div>

              <div className="flex min-h-[220px] flex-1 flex-col gap-2">
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
                  className="flex min-h-0 flex-1 basis-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-white py-3 text-center shadow-sm transition-all hover:border-violet-400 hover:bg-violet-50/50"
                >
                    {guidelineFile ? (
                      <div className="flex w-full max-w-full flex-col items-center justify-center gap-1.5 px-3 py-1">
                        <FileText className="mx-auto h-7 w-7 shrink-0 text-violet-500" strokeWidth={1.75} />
                        <p className="line-clamp-2 max-w-full break-all text-[11px] leading-snug text-gray-600">
                          {guidelineFile.name}
                        </p>
                        <div className="mt-0.5 flex flex-row flex-wrap items-center justify-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            className="h-[22px] min-h-0 shrink-0 px-2 py-0 text-[10px] leading-none"
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
                            className="h-[22px] min-h-0 shrink-0 px-2 py-0 text-[10px] leading-none text-gray-600"
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
                        <div className="mx-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100">
                          <Upload className="h-4 w-4 text-violet-500" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-gray-900">추가 참조 (선택)</p>
                          <p className="text-[11px] text-gray-500">PDF, PNG, JPEG · 검수 시 보완 맥락</p>
                        </div>
                      </div>
                    )}
                </div>

                <div className="flex min-h-0 flex-1 basis-0 flex-col justify-center gap-1.5 overflow-y-auto rounded-xl border border-violet-200 bg-violet-50/50 px-2.5 py-[3px] shadow-sm">
                  <label className="text-xs font-medium text-violet-900" htmlFor="reference-guideline">
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
                      className="w-full appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-2.5 pr-9 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
                    >
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
                          serverGuideline?.hasFile
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-200 text-gray-600"
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
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-violet-500" />
              <h2 className="font-semibold text-gray-900">검수 사항 직접 입력</h2>
            </div>
            <textarea
              value={guidelineText}
              onChange={(e) => setGuidelineText(e.target.value)}
              placeholder={
                "브랜드 가이드라인을 직접 입력하세요...\n\n예시:\n• 로고는 항상 15mm 이상 크기로 사용\n• 브랜드 컬러는 #F43182 (LG U+ Magenta)\n• 공식 폰트는 LG Smart UI 사용\n• 로고 주변 최소 10mm 여백 확보\n• 그리드 시스템: 12컬럼 레이아웃"
              }
              className="h-40 w-full resize-none overflow-y-auto rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
            />
          </div>

          {inspectionError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{inspectionError}</div>
          )}

          <div className="space-y-2">
            <Button
              type="button"
              onClick={handlePrimaryCta}
              disabled={!designFile || isBusy}
              className="h-14 w-full bg-[#F43182] text-base font-semibold text-white shadow-lg hover:bg-[#d41f6e] disabled:opacity-50"
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
            </Button>
            {isBusy && (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full border-gray-300 text-sm text-gray-800 hover:bg-gray-50"
                onClick={handleStopAndResetFromProgress}
              >
                <RotateCcw className="mr-2 h-4 w-4 shrink-0" />
                중지하고 처음부터
              </Button>
            )}
          </div>

          {showResults && brandScore !== null && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-md">
              <div className="flex flex-col gap-6 md:flex-row md:items-stretch md:gap-0">
                <div className="flex w-full shrink-0 flex-col border-b border-gray-200 pb-6 md:w-72 md:max-w-[300px] md:border-b-0 md:border-r md:pb-0 md:pr-6">
                  <h2 className="mb-3 text-center text-sm font-semibold text-gray-900 md:text-left">
                    적정성 평가 <span className="text-[#F43182]">{brandScore}%</span>
                  </h2>
                  <div className="flex flex-1 items-center justify-center py-2">
                    <div className="relative h-40 w-40 shrink-0">
                      <svg className="h-full w-full -rotate-90 transform">
                        <circle cx="80" cy="80" r="70" stroke="#E5E7EB" strokeWidth="12" fill="none" />
                        <circle
                          cx="80"
                          cy="80"
                          r="70"
                          stroke="#F43182"
                          strokeWidth="12"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 70}`}
                          strokeDashoffset={`${2 * Math.PI * 70 * (1 - brandScore / 100)}`}
                          strokeLinecap="round"
                          className="transition-all duration-1000"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-bold text-gray-900">{brandScore}</span>
                        <span className="text-sm text-gray-500">/ 100</span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-center text-sm text-gray-600 md:text-left">
                    {brandScore >= 80
                      ? "우수: 브랜드 가이드라인을 잘 준수하고 있습니다."
                      : brandScore >= 60
                        ? "보통: 일부 개선이 필요합니다."
                        : "미흡: 여러 가이드라인 위반 사항이 있습니다."}
                  </p>
                </div>

                <div className="flex min-w-0 flex-1 flex-col md:pl-6">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <h2 className="shrink-0 font-semibold text-gray-900">검수 내용</h2>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <label htmlFor="report-export-format" className="sr-only">
                        리포트 파일 형식
                      </label>
                      <select
                        id="report-export-format"
                        value={reportExportFormat}
                        onChange={(e) => setReportExportFormat(e.target.value as ExportFormat)}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 focus:border-[#F43182] focus:ring-2 focus:ring-[#F43182]/20"
                      >
                        <option value="png">PNG</option>
                        <option value="pdf">PDF</option>
                        <option value="jpeg">JPEG</option>
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
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
                        <Download className="mr-2 h-4 w-4" />
                        리포트 다운로드
                      </Button>
                    </div>
                  </div>

                  {inspectionOverallSummary && (
                    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-xs leading-relaxed text-gray-800">
                      <span className="mb-1 block font-medium text-gray-900">AI 종합 평가</span>
                      {inspectionOverallSummary}
                    </div>
                  )}

                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto md:max-h-[min(400px,50vh)]">
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <h3 className="text-sm font-medium text-gray-900">위반 사항</h3>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">{violations.length}</span>
                      </div>
                      <div className="space-y-2">
                        {violations.map((violation, index) => (
                          <div key={index} className="flex gap-2 rounded-lg border border-red-100 bg-red-50 p-2.5">
                            <div className="mt-0.5 shrink-0">
                              <div
                                className={`h-2 w-2 rounded-full ${
                                  violation.severity === "high"
                                    ? "bg-red-500"
                                    : violation.severity === "medium"
                                      ? "bg-orange-500"
                                      : "bg-yellow-500"
                                }`}
                              />
                            </div>
                            <div className="flex-1">
                              <p className="mb-0.5 text-xs font-medium text-gray-700">{violation.category}</p>
                              <p className="text-xs text-gray-900">{violation.issue}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {suggestions.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-orange-500" />
                          <h3 className="text-sm font-medium text-gray-900">개선 제안</h3>
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-600">
                            {suggestions.length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {suggestions.map((suggestion, index) => (
                            <div key={index} className="flex gap-2 rounded-lg border border-orange-100 bg-orange-50 p-2.5">
                              <div className="mt-0.5 shrink-0">
                                <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                              </div>
                              <div className="flex-1">
                                <p className="mb-0.5 text-xs font-medium text-gray-700">{suggestion.category}</p>
                                <p className="text-xs text-gray-900">{suggestion.recommendation}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {passedCriteria.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <h3 className="text-sm font-medium text-gray-900">준수 항목</h3>
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
                            {passedCriteria.length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {passedCriteria.map((criteria, index) => (
                            <div key={index} className="flex gap-2 rounded-lg border border-green-100 bg-green-50 p-2.5">
                              <div className="mt-0.5 shrink-0">
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              </div>
                              <div className="flex-1">
                                <p className="mb-0.5 text-xs font-medium text-gray-700">{criteria.category}</p>
                                <p className="text-xs text-gray-900">{criteria.description}</p>
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
          )}

          {showResults && designPreview && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">AI 수정본 (Gemini 이미지)</h2>
                  <p className="text-xs text-gray-500">
                    참조 가이드라인·검수 결과·검수 사항 직접 입력을 반영해 생성합니다. (PNG/JPEG 검수 대상만)
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
                    disabled={!displayedRevision}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 focus:border-[#F43182] focus:ring-2 focus:ring-[#F43182]/20 disabled:opacity-50"
                  >
                    <option value="png">PNG</option>
                    <option value="pdf">PDF</option>
                    <option value="jpeg">JPEG</option>
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={!displayedRevision}
                    onClick={() =>
                      displayedRevision &&
                      downloadRevisedImageInFormat(displayedRevision.dataUrl, revisedExportFormat)
                    }
                  >
                    <Download className="mr-2 h-4 w-4" />
                    수정본 다운로드
                  </Button>
                </div>
              </div>
              {revisionNote && !displayedRevision && (
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {revisionNote}
                </p>
              )}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <p className="mb-3 text-sm font-medium text-gray-700">검수 대상 (원본)</p>
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <img src={designPreview} alt="검수 대상 원본" className="w-full" />
                  </div>
                </div>
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-700">AI 수정 버전</p>
                    {revisionHistory.length >= 2 && (
                      <div
                        className="flex shrink-0 items-center justify-end gap-1.5"
                        role="group"
                        aria-label="수정 버전 선택"
                      >
                        {revisionHistory.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setRevisionViewIndex(i)}
                            title={`${i + 1}차 수정본 보기`}
                            className={`rounded border px-2 py-0.5 text-sm font-medium transition-colors ${
                              revisionViewIndex === i
                                ? "border-[#F43182] bg-[#F43182]/10 text-[#F43182]"
                                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            ver {i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                    {displayedRevision ? (
                      <>
                        <img src={displayedRevision.dataUrl} alt="AI 수정본" className="w-full" />
                        <div className="absolute right-2 top-2">
                          <span className="rounded-full bg-[#F43182] px-2 py-1 text-xs text-white">AI 생성</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex min-h-[200px] items-center justify-center p-6 text-center text-sm text-gray-500">
                        {revisionNote ?? "수정 이미지를 생성하지 못했습니다. API 키·이미지 모델 설정을 확인하세요."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {designFile?.type.startsWith("image/") && (
                <div className="mt-6 space-y-2">
                  <Button
                    type="button"
                    onClick={handleAdditionalRevision}
                    disabled={additionalRevisionBusy}
                    className="h-14 w-full bg-[#F43182] text-base font-semibold text-white shadow-lg hover:bg-[#d41f6e] disabled:opacity-50"
                  >
                    {additionalRevisionBusy ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        추가 수정 생성 중…
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-5 w-5" />
                        추가 수정
                      </>
                    )}
                  </Button>
                  {additionalRevisionError && (
                    <p className="text-center text-xs text-red-600">{additionalRevisionError}</p>
                  )}
                </div>
              )}
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
            className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
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
