import { useCallback, useState, type ChangeEvent } from "react";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";
import { GlobalBrandNav } from "@/components/GlobalBrandNav";
import { SimplyHeartResultView } from "@/components/SimplyHeartResultView";
import { postSimplyHeartStep, type SimplyHeartImagePart } from "@/lib/simplyHeartApi";
import { downloadPlainKoreanTextAsPdf } from "@/lib/inspectionExport";
import { stripSimplyHeartDisplayAsterisks } from "@/lib/simplyHeartReportParser";
import { cn } from "@/components/ui/utils";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileText,
  FileCheck,
  ImagePlus,
  Sparkles,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";

const cardBase =
  "rounded-[22px] border border-[rgba(0,0,0,0.06)] bg-white p-6 shadow-[0_4px_28px_-10px_rgba(0,0,0,0.08),0_2px_12px_-6px_rgba(0,0,0,0.04)]";

const SIMPLY_UPLUS_DEPARTMENT_OPTIONS: readonly string[] = [
  "브랜드·커뮤니케이션",
  "마케팅·광고",
  "고객센터·CX",
  "상품·서비스기획",
  "채널·영업",
  "앱·디지털 채널",
  "UX·UI·디자인",
  "사내커뮤니케이션",
  "준법·보안·개인정보",
  "데이터·분석",
  "B2B·기업사업",
  "IR·대외협력",
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    r.readAsDataURL(file);
  });
}

function dataUrlToBareBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

function mimeFromDataUrl(dataUrl: string): string {
  const m = /^data:([^;,]+)/.exec(dataUrl);
  return (m?.[1] ?? "image/png").split(";")[0].toLowerCase().replace("image/jpg", "image/jpeg");
}

type ImageSlot = { id: string; name: string; dataUrl: string };

type SimplyGuideMode = "generate" | "audit";

type SimplyHeartResultContext = {
  category: string;
  target: string;
  topic: string;
  detail: string;
};

function buildSimplyHeartPromptText(
  department: string,
  target: string,
  topic: string,
  detail: string,
  mode: SimplyGuideMode,
): string {
  const dept = department.trim();
  const tgt = target.trim();
  const t = topic.trim();
  const d = detail.trim();
  const parts: string[] = [];

  parts.push(
    "[사용자 입력 — 추론 필수]",
    "아래 항목을 **모두** 읽고, 결과(진단·솔루션·반영 항목)에 구체적으로 반영하세요. (미입력 항목은 임의로 채우지 말 것)",
  );

  if (mode === "audit") {
    parts.push("[작업 유형]\n검수 — 배포·확정 전 문구를 Simply U+·브랜드 관점에서 점검해 주세요.");
    parts.push(`[카테고리 선택]\n${dept || "(미입력)"}`);
    parts.push(`[확인 분야]\n${t || "(미입력)"}`);
    parts.push(`[검수 내용]\n${d || "(미입력)"}`);
  } else {
    parts.push(
      "[작업 유형]\n생성 — 아래 정보를 바탕으로 Simply U+ 가이드에 맞는 고객 메시지를 새로 작성해 주세요. (문제 진단·Do & Don't 출력 금지)",
    );
    parts.push(`[카테고리 선택]\n${dept || "(미입력)"}`);
    parts.push(`[타겟]\n${tgt || "(미입력)"}`);
    parts.push(`[목적]\n${t || "(미입력)"}`);
    parts.push(`[생성 개요]\n${d || "(미입력)"}`);
  }

  return parts.join("\n\n");
}

export function SimplyHeart() {
  const [department, setDepartment] = useState("");
  const [fieldTarget, setFieldTarget] = useState("");
  const [fieldTopic, setFieldTopic] = useState("");
  const [guideMode, setGuideMode] = useState<SimplyGuideMode>("audit");
  const [fieldDetail, setFieldDetail] = useState("");
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [images, setImages] = useState<ImageSlot[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [resultMode, setResultMode] = useState<SimplyGuideMode>("audit");
  const [resultContext, setResultContext] = useState<SimplyHeartResultContext | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [pdfExporting, setPdfExporting] = useState(false);

  const promptText = buildSimplyHeartPromptText(department, fieldTarget, fieldTopic, fieldDetail, guideMode);
  const canRun = promptText.length > 0 || Boolean(pdfDataUrl) || images.length > 0;

  const clearAll = useCallback(() => {
    setDepartment("");
    setFieldTarget("");
    setFieldTopic("");
    setGuideMode("audit");
    setFieldDetail("");
    setPdfDataUrl(null);
    setPdfName(null);
    setImages([]);
    setReport(null);
    setResultMode("audit");
    setResultContext(null);
    setRunError(null);
    setAnalyzing(false);
  }, []);

  const switchGuideMode = (mode: SimplyGuideMode) => {
    setGuideMode(mode);
    setReport(null);
    setResultMode(mode);
    setResultContext(null);
    setRunError(null);
  };

  const onPickPdf = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      setRunError("PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    try {
      const url = await readFileAsDataUrl(file);
      setPdfDataUrl(url);
      setPdfName(file.name);
      setRunError(null);
    } catch {
      setRunError("PDF를 읽지 못했습니다.");
    }
  };

  const onPickImages = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    const next: ImageSlot[] = [];
    for (const file of files.slice(0, 6)) {
      const okType =
        file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp";
      if (!okType) continue;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        next.push({ id: `${Date.now()}-${file.name}-${Math.random()}`, name: file.name, dataUrl });
      } catch {
        /* skip */
      }
    }
    if (next.length) {
      setImages((prev) => [...prev, ...next].slice(0, 6));
      setRunError(null);
    }
  };

  const runPipeline = async () => {
    if (!canRun || analyzing) return;
    setRunError(null);
    setReport(null);
    const imageParts: SimplyHeartImagePart[] = images.map((im) => ({
      mimeType: mimeFromDataUrl(im.dataUrl),
      data: dataUrlToBareBase64(im.dataUrl),
    }));
    const pdfBase64 = pdfDataUrl ? dataUrlToBareBase64(pdfDataUrl) : undefined;

    try {
      setAnalyzing(true);
      const { text: out } = await postSimplyHeartStep({
        text: promptText.trim() || "(이미지·PDF만 제공)",
        pdfBase64,
        images: imageParts.length ? imageParts : undefined,
        mode: guideMode,
      });
      setReport(out);
      setResultMode(guideMode);
      setResultContext({
        category: department,
        target: fieldTarget,
        topic: fieldTopic,
        detail: fieldDetail,
      });
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const buildReportPlain = (): string => {
    const body = stripSimplyHeartDisplayAsterisks((report ?? "").trim());
    return ["심플리 가이드 · 통합 분석 리포트", "", body || "(없음)"].join("\n").trim();
  };

  const downloadPdf = async () => {
    if (pdfExporting) return;
    setPdfExporting(true);
    try {
      await downloadPlainKoreanTextAsPdf(buildReportPlain(), "simply-heart-report");
    } finally {
      setPdfExporting(false);
    }
  };

  return (
    <div className="min-h-screen brand-app-shell bg-[#F5F3F0]">
      <header className="sticky top-0 z-10 border-b border-[rgba(0,0,0,0.06)] bg-white shadow-[0_4px_24px_-6px_rgba(0,0,0,0.08),0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <AxisBrandTitle subtitle="심플리 가이드 — 고객 부담을 줄이는 메시지 진단" />
          </div>
        </div>
        <GlobalBrandNav className="bg-white" innerClassName="max-w-7xl px-4 sm:px-6" />
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-10">
        <div
          className="mb-6 flex gap-3 rounded-2xl border border-[rgba(255,127,102,0.28)] bg-[#FF7F66]/[0.08] px-4 py-3.5 sm:px-5"
          role="status"
        >
          <FileCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#C14D38]" aria-hidden />
          <div className="min-w-0 text-[13px] leading-relaxed text-[#2A2A2A]">
            <p className="font-semibold text-[#1A1A1A]">분석 시 참조 자료 (Simply U+ 자료 2종)</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[#4B4B4B]">
              <li>
                <strong>Simply U+ 설명자료·실천과제 V2 (18개 분류·학습용)</strong> —{" "}
                <code className="rounded bg-white/80 px-1 text-[12px]">Simply U+ 가이드라인.pdf</code>
              </li>
              <li>
                <strong>직무별 Simply U+ 실행 가이드 v1 (학습용)</strong> —{" "}
                <code className="rounded bg-white/80 px-1 text-[12px]">
                  직무별 Simply. U+ 실행 가이드_v1_학습용.pdf
                </code>
              </li>
            </ul>
            <p className="mt-2 text-[12px] text-[#5C5C5C]">
              위 두 PDF 원문만 근거로 하며, 브랜드·VI 가이드는 이 페이지 분석에서 사용하지 않습니다.
            </p>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-[#1A1A1A]">입력</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-[#6B6B6B]">
              {guideMode === "audit"
                ? "검수할 문구·시안을 입력하면 요청 진단, Do & Don't, Simply U+ 솔루션을 확인할 수 있습니다."
                : "타겟·목적·생성 개요를 입력하면 Simply U+ 가이드에 맞는 완성 메시지를 생성합니다."}
            </p>
          </div>
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={clearAll}>
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
            초기화
          </Button>
        </div>

        <div className={cn(cardBase, "mb-8")}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-6 w-6 shrink-0 text-[#FF7F66]" />
              <h2 className="text-[20px] font-bold text-[#1A1A1A]">심플리 가이드</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={
                  guideMode === "generate"
                    ? "h-8 rounded-full border-transparent bg-black px-4 text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.25)] hover:bg-black/90"
                    : "h-8 rounded-full border-[rgba(0,0,0,0.1)] bg-white text-[#6B6B6B]"
                }
                onClick={() => switchGuideMode("generate")}
              >
                생성
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={
                  guideMode === "audit"
                    ? "h-8 rounded-full border-transparent bg-black px-4 text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.25)] hover:bg-black/90"
                    : "h-8 rounded-full border-[rgba(0,0,0,0.1)] bg-white text-[#6B6B6B]"
                }
                onClick={() => switchGuideMode("audit")}
              >
                검수
              </Button>
            </div>
          </div>

          <div className="mb-4">
            <p className="mb-1.5 text-[18px] font-semibold text-[#1A1A1A]">1. 카테고리 선택</p>
            <p className="mb-3 text-[13px] leading-relaxed text-[#6B6B6B]">
              Simply U+ 가이드 기준 카테고리(추진·협력 주체)를 선택합니다. 분석·생성 맥락에 포함됩니다.
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="카테고리 선택">
              {SIMPLY_UPLUS_DEPARTMENT_OPTIONS.map((label) => {
                const selected = department === label;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "max-w-full rounded-full border px-3.5 py-2 text-left text-[13px] font-semibold leading-snug transition-colors sm:px-4 sm:text-[14px]",
                      selected
                        ? "border-[#FF7F66] bg-[rgba(255,127,102,0.14)] text-[#1A1A1A] shadow-[0_0_0_1px_rgba(255,127,102,0.25)]"
                        : "border-[rgba(0,0,0,0.1)] bg-white text-[#2A2A2A] hover:border-[rgba(0,0,0,0.18)]",
                    )}
                    onClick={() => {
                      setDepartment(label);
                      setRunError(null);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {guideMode === "generate" ? (
            <div className="mb-4">
              <label htmlFor="simply-field-target" className="mb-1.5 block text-[18px] font-semibold text-[#1A1A1A]">
                2. 타겟
              </label>
              <p className="mb-3 text-[13px] leading-relaxed text-[#6B6B6B]">
                이 메시지를 어떤 대상에게 보여줄지 입력해 주세요. (예: 기존 멤버십 회원, 신규 가입 고객, 사내 임직원)
              </p>
              <input
                id="simply-field-target"
                type="text"
                value={fieldTarget}
                onChange={(e) => setFieldTarget(e.target.value)}
                placeholder="예) U+ 멤버십 기존 회원 및 신규 가입 대상 고객"
                className="h-12 w-full rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 text-[15px] leading-normal text-[#1A1A1A] outline-none ring-[#FF7F66]/20 placeholder:text-[15px] placeholder:text-[#9A9A9A] focus:ring-2"
              />
            </div>
          ) : null}

          <div className="mb-4">
            <label htmlFor="simply-field-topic" className="mb-1.5 block text-[18px] font-semibold text-[#1A1A1A]">
              {guideMode === "generate" ? "3. 목적" : "2. 확인 분야"}
            </label>
            <p className="mb-3 text-[13px] leading-relaxed text-[#6B6B6B]">
              {guideMode === "generate"
                ? "이 메시지로 달성하고자 하는 목적을 한 줄로 적어 주세요. (예: 멤버십 참여 유도, 혜택 안내, 이벤트 참여 독려)"
                : "점검할 업무·채널·자료 유형을 한 줄로 적어 주세요. (예: 요금 문자, 사내 공지, 배너 카피)"}
            </p>
            <input
              id="simply-field-topic"
              type="text"
              value={fieldTopic}
              onChange={(e) => setFieldTopic(e.target.value)}
              placeholder={
                guideMode === "generate"
                  ? "예) 멤버십 개편 소식 안내 및 혜택 활용 유도"
                  : "예) 대고객 MMS 요금 안내, 인트라넷 점검 공지, 앱 결제 오류 토스트"
              }
              className="h-12 w-full rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 text-[15px] leading-normal text-[#1A1A1A] outline-none ring-[#FF7F66]/20 placeholder:text-[15px] placeholder:text-[#9A9A9A] focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="simply-field-detail" className="mb-1.5 block text-[18px] font-semibold text-[#1A1A1A]">
              {guideMode === "audit" ? "3. 검수 내용" : "4. 생성 개요"}
            </label>
            {guideMode === "generate" ? (
              <p className="mb-3 text-[13px] leading-relaxed text-[#6B6B6B]">
                완성 문구가 아닌, 만들고 싶은 메시지의 방향과 포함할 핵심 정보를 간략히 적어 주세요.
              </p>
            ) : null}
            {guideMode === "generate" ? (
              <div className="relative overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8]">
                {!fieldDetail.trim() ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 z-[1] px-4 py-3 text-[15px] leading-[1.75] text-[#B0B0B0]"
                    aria-hidden
                  >
                    <p>생성하고자 하는 내용의 대략적인 방향을 서술해 주세요.</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#C4C4C4]">
                      예) 6월 멤버십 개편 안내 · 기존·신규 회원 대상 · 쿠폰·추첨 이벤트를 짧고 명료하게
                    </p>
                  </div>
                ) : null}
                <textarea
                  id="simply-field-detail"
                  value={fieldDetail}
                  onChange={(e) => setFieldDetail(e.target.value)}
                  rows={7}
                  className="relative z-[2] min-h-[162px] w-full resize-y border-0 bg-transparent px-4 py-3 text-[15px] leading-relaxed text-[#1A1A1A] outline-none ring-[#FF7F66]/20 focus:ring-2 focus:ring-inset"
                />
              </div>
            ) : (
              <textarea
                id="simply-field-detail"
                value={fieldDetail}
                onChange={(e) => setFieldDetail(e.target.value)}
                rows={7}
                placeholder="검수할 카피, 공지, 문자·앱 문구, 기획안 텍스트 등을 붙여 넣어 주세요…"
                className="min-h-[162px] w-full resize-y rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-3 text-[15px] leading-relaxed text-[#1A1A1A] outline-none ring-[#FF7F66]/20 placeholder:text-[15px] placeholder:text-[#9A9A9A] focus:ring-2"
              />
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3 border-t border-[rgba(0,0,0,0.06)] pt-6">
            <div className="min-w-[200px] flex-1">
              <div className="mb-2 flex items-center gap-2">
                <ImagePlus className="h-[18px] w-[18px] shrink-0 text-[#FF7F66]" />
                <span className="text-[15px] font-semibold text-[#1A1A1A]">이미지 (보조)</span>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2.5 text-[15px] font-semibold text-[#2A2A2A] shadow-sm transition-colors hover:border-[rgba(0,0,0,0.14)]">
                <Upload className="h-4 w-4 shrink-0" aria-hidden />
                PNG / JPG 추가 (최대 6장)
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={onPickImages} />
              </label>
              {images.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {images.map((im) => (
                    <li
                      key={im.id}
                      className="flex items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-2 py-1.5 pr-2"
                    >
                      <img src={im.dataUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      <span className="min-w-0 flex-1 truncate text-[15px] text-[#6B6B6B]">{im.name}</span>
                      <button
                        type="button"
                        className="rounded-full p-1 text-[#9A9A9A] hover:bg-white hover:text-[#1A1A1A]"
                        aria-label="이미지 제거"
                        onClick={() => setImages((prev) => prev.filter((x) => x.id !== im.id))}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="min-w-[200px] flex-1">
              <div className="mb-2 flex items-center gap-2">
                <FileText className="h-[18px] w-[18px] shrink-0 text-[#FF7F66]" />
                <span className="text-[15px] font-semibold text-[#1A1A1A]">PDF (보조 · 텍스트 추출)</span>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2.5 text-[15px] font-semibold text-[#2A2A2A] shadow-sm transition-colors hover:border-[rgba(0,0,0,0.14)]">
                <Upload className="h-4 w-4 shrink-0" aria-hidden />
                PDF 업로드
                <input type="file" accept="application/pdf" className="hidden" onChange={onPickPdf} />
              </label>
              {pdfName ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-[15px] text-[#6B6B6B]">
                  <span className="min-w-0 truncate">{pdfName}</span>
                  <button
                    type="button"
                    className="shrink-0 text-[15px] font-semibold text-[#C14D38] underline"
                    onClick={() => {
                      setPdfDataUrl(null);
                      setPdfName(null);
                    }}
                  >
                    제거
                  </button>
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-6 border-t border-[rgba(0,0,0,0.06)] pt-6">
            <Button
              type="button"
              disabled={!canRun || analyzing}
              className="brand-btn-primary brand-btn-simply-guide-analyze h-14 w-full font-semibold disabled:pointer-events-none disabled:opacity-45"
              onClick={() => void runPipeline()}
            >
              {analyzing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                  {guideMode === "generate" ? "생성 중…" : "통합 분석 중…"}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" aria-hidden />
                  {guideMode === "generate" ? "생성 실행" : "분석 실행"}
                </>
              )}
            </Button>
          </div>

          {runError ? (
            <p className="mt-4 text-[13px] text-red-600" role="alert">
              {runError}
            </p>
          ) : null}
        </div>

        <section
          className={cn(
            "overflow-hidden rounded-[22px] border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_4px_28px_-10px_rgba(0,0,0,0.08)]",
            report ? "border-[rgba(255,127,102,0.22)] shadow-[0_8px_40px_-12px_rgba(255,127,102,0.15)]" : null,
          )}
        >
          <div className="h-[3px] w-full bg-[#FF7F66]" aria-hidden />
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[rgba(0,0,0,0.06)] px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <h2 className="text-[22px] font-bold tracking-tight text-[#1A1A1A]">
                {resultMode === "generate" ? "생성 결과" : "분석 결과"}
              </h2>
              <p className="mt-1 text-[12px] text-[#9A9A9A]">
                {resultMode === "generate"
                  ? "Simply U+ 솔루션 → 반영 항목 상세"
                  : "요청내용 분석 → Do & Don&apos;t → Simply U+ 솔루션"}
              </p>
            </div>
            <button
              type="button"
              disabled={!report || pdfExporting}
              onClick={() => void downloadPdf()}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-4 py-2 text-[12px] font-medium text-[#505050] transition-colors hover:bg-[#FAFAF8] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pdfExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden />
              )}
              PDF 리포트 다운로드
            </button>
          </div>

          {analyzing ? (
            <div className="flex items-center justify-center gap-3 px-6 py-16">
              <Loader2 className="h-6 w-6 shrink-0 animate-spin text-[#FF7F66]" aria-hidden />
              <p className="text-[15px] text-[#6B6B6B]">
                {guideMode === "generate" ? "AI 메시지 생성 중입니다…" : "AI 통합 분석 중입니다…"}
              </p>
            </div>
          ) : report ? (
            <div className="px-5 py-8 sm:px-6 sm:py-10">
              <SimplyHeartResultView
                text={report}
                mode={resultMode}
                category={resultContext?.category ?? department}
                userTarget={resultContext?.target ?? fieldTarget}
                fieldTopic={resultContext?.topic ?? fieldTopic}
                fieldDetail={resultContext?.detail ?? fieldDetail}
              />
            </div>
          ) : (
            <div className="px-6 py-14 text-center">
              <p className="text-[14px] text-[#C0C0C0]">분석 실행 후 결과가 이 영역에 표시됩니다.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
