import { Fragment, useCallback, useState, type ChangeEvent } from "react";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";
import { GlobalBrandNav } from "@/components/GlobalBrandNav";
import { postSimplyHeartStep, type SimplyHeartImagePart } from "@/lib/simplyHeartApi";
import { downloadPlainKoreanTextAsPdf } from "@/lib/inspectionExport";
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

const STEP_META = [
  { n: 1 as const, title: "1단계. 요청내용 분석 (Diagnosis)", subtitle: "타겟·목적·부담 진단" },
  { n: 2 as const, title: "2단계. Simply Pain Point (Empathy)", subtitle: "고객 불편·결정장애 탐지" },
  { n: 3 as const, title: "3단계. Do & Don't (Guideline)", subtitle: "가이드라인 기준 구분" },
  { n: 4 as const, title: "4단계. Simply U+ 솔루션 (Delivery)", subtitle: "정제 메시지·단 하나의 행동" },
];

const cardBase =
  "rounded-[22px] border border-[rgba(0,0,0,0.06)] bg-white p-6 shadow-[0_4px_28px_-10px_rgba(0,0,0,0.08),0_2px_12px_-6px_rgba(0,0,0,0.04)]";

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

function buildSimplyHeartPromptText(topic: string, detail: string): string {
  const t = topic.trim();
  const d = detail.trim();
  const parts: string[] = [];
  if (t) parts.push(`[확인 분야]\n${t}`);
  if (d) parts.push(`[상세 내용]\n${d}`);
  return parts.join("\n\n");
}

export function SimplyHeart() {
  const [fieldTopic, setFieldTopic] = useState("");
  const [fieldDetail, setFieldDetail] = useState("");
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [images, setImages] = useState<ImageSlot[]>([]);
  const [results, setResults] = useState<Partial<Record<1 | 2 | 3 | 4, string>>>({});
  const [loadingStep, setLoadingStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [pdfExporting, setPdfExporting] = useState(false);

  const promptText = buildSimplyHeartPromptText(fieldTopic, fieldDetail);
  const canRun = promptText.length > 0 || Boolean(pdfDataUrl) || images.length > 0;

  const clearAll = useCallback(() => {
    setFieldTopic("");
    setFieldDetail("");
    setPdfDataUrl(null);
    setPdfName(null);
    setImages([]);
    setResults({});
    setRunError(null);
    setLoadingStep(0);
  }, []);

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
    if (!canRun || loadingStep !== 0) return;
    setRunError(null);
    setResults({});
    const imageParts: SimplyHeartImagePart[] = images.map((im) => ({
      mimeType: mimeFromDataUrl(im.dataUrl),
      data: dataUrlToBareBase64(im.dataUrl),
    }));
    const pdfBase64 = pdfDataUrl ? dataUrlToBareBase64(pdfDataUrl) : undefined;

    const prior: Partial<Record<"1" | "2" | "3", string>> = {};

    try {
      for (const step of [1, 2, 3, 4] as const) {
        setLoadingStep(step);
        const { text: out } = await postSimplyHeartStep({
          step,
          text: promptText.trim() || "(이미지·PDF만 제공)",
          pdfBase64,
          images: imageParts.length ? imageParts : undefined,
          prior: { ...prior },
        });
        if (step <= 3) prior[String(step) as "1" | "2" | "3"] = out;
        setResults((r) => ({ ...r, [step]: out }));
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingStep(0);
    }
  };

  const buildReportPlain = (): string => {
    const lines: string[] = [
      "심플리하게 · 4단계 리포트",
      "",
      ...STEP_META.map((s) => {
        const body = (results[s.n] ?? "").trim();
        return [`## ${s.title}`, s.subtitle, "", body || "(없음)", ""].join("\n");
      }),
    ];
    return lines.join("\n").trim();
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
            <AxisBrandTitle subtitle="심플리하게 — 고객 부담을 줄이는 메시지 진단" />
          </div>
        </div>
        <GlobalBrandNav className="bg-white" innerClassName="max-w-7xl px-4 sm:px-6" />
      </header>

      <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
        <div
          className="mb-6 flex gap-3 rounded-2xl border border-[rgba(255,127,102,0.28)] bg-[#FF7F66]/[0.08] px-4 py-3.5 sm:px-5"
          role="status"
        >
          <FileCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#C14D38]" aria-hidden />
          <div className="min-w-0 text-[13px] leading-relaxed text-[#2A2A2A]">
            <p className="font-semibold text-[#1A1A1A]">분석 시 고정 참조 (서버 등록 PDF)</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[#4B4B4B]">
              <li>
                <strong>Simply U+ 가이드라인</strong> — «2604_Simply.U+설명자료_실천과제» 원문(
                <code className="rounded bg-white/80 px-1 text-[12px]">Simply U+ 가이드라인.pdf</code>)을
                기준으로 분석합니다.
              </li>
              <li>U+ 브랜드 가이드라인 · U+ VI 가이드라인 — Simply U+에 어긋나지 않는 범위에서만 보조 참고합니다.</li>
            </ul>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-[#1A1A1A]">입력</h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6B6B6B]">
              텍스트를 주 입력으로 하고, 시안·배너 이미지(PNG/JPG) 또는 기획 PDF를 함께 올리면 멀티모달로 분석합니다. Gemini가
              이미지 내 문구·구조를 읽고 동일한 4단계로 정리합니다.
            </p>
          </div>
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={clearAll}>
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
            초기화
          </Button>
        </div>

        <div className={cn(cardBase, "mb-8")}>
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#FF7F66]" />
            <h2 className="text-[15px] font-bold text-[#1A1A1A]">텍스트 (주요)</h2>
          </div>

          <div className="mb-4">
            <label htmlFor="simply-field-topic" className="mb-1.5 block text-[13px] font-semibold text-[#1A1A1A]">
              1. 확인 분야
            </label>
            <input
              id="simply-field-topic"
              type="text"
              value={fieldTopic}
              onChange={(e) => setFieldTopic(e.target.value)}
              placeholder="예) 요금 안내 카피, 사내 공지, 배너 문구 등"
              className="h-11 w-full rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 text-[14px] leading-normal text-[#1A1A1A] outline-none ring-[#FF7F66]/20 placeholder:text-[#9A9A9A] focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="simply-field-detail" className="mb-1.5 block text-[13px] font-semibold text-[#1A1A1A]">
              2. 상세 내용
            </label>
            <textarea
              id="simply-field-detail"
              value={fieldDetail}
              onChange={(e) => setFieldDetail(e.target.value)}
              rows={7}
              placeholder="요금제명, 메시지, 기획안, 카피, 공지사항 등 자유 입력…"
              className="min-h-[162px] w-full resize-y rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-3 text-[14px] leading-relaxed text-[#1A1A1A] outline-none ring-[#FF7F66]/20 placeholder:text-[#9A9A9A] focus:ring-2"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3 border-t border-[rgba(0,0,0,0.06)] pt-6">
            <div className="min-w-[200px] flex-1">
              <div className="mb-2 flex items-center gap-2">
                <ImagePlus className="h-4 w-4 text-[#FF7F66]" />
                <span className="text-[13px] font-semibold text-[#1A1A1A]">이미지 (보조)</span>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2 text-[12px] font-semibold text-[#2A2A2A] shadow-sm transition-colors hover:border-[rgba(0,0,0,0.14)]">
                <Upload className="h-3.5 w-3.5" aria-hidden />
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
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[#6B6B6B]">{im.name}</span>
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
                <FileText className="h-4 w-4 text-[#FF7F66]" />
                <span className="text-[13px] font-semibold text-[#1A1A1A]">PDF (보조 · 텍스트 추출)</span>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2 text-[12px] font-semibold text-[#2A2A2A] shadow-sm transition-colors hover:border-[rgba(0,0,0,0.14)]">
                <Upload className="h-3.5 w-3.5" aria-hidden />
                PDF 업로드
                <input type="file" accept="application/pdf" className="hidden" onChange={onPickPdf} />
              </label>
              {pdfName ? (
                <p className="mt-2 flex items-center gap-2 text-[11px] text-[#6B6B6B]">
                  <span className="truncate">{pdfName}</span>
                  <button
                    type="button"
                    className="shrink-0 text-[#C14D38] underline"
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
              disabled={!canRun || loadingStep !== 0}
              className="brand-btn-primary h-14 w-full text-[17px] font-semibold disabled:pointer-events-none disabled:opacity-45"
              onClick={() => void runPipeline()}
            >
              {loadingStep !== 0 ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                  {loadingStep}단계 실행 중…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" aria-hidden />
                  4단계 분석 실행
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

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold tracking-tight text-[#1A1A1A]">결과</h2>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-[rgba(0,0,0,0.12)]"
            disabled={!results[4] || pdfExporting}
            onClick={() => void downloadPdf()}
          >
            {pdfExporting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            PDF 리포트
          </Button>
        </div>

        <div className="flex flex-col gap-5">
          {STEP_META.map((meta, idx) => {
            const content = results[meta.n];
            const isLoading = loadingStep === meta.n;
            const isFinal = meta.n === 4;
            return (
              <Fragment key={meta.n}>
                <section
                  className={cn(
                    cardBase,
                    "transition-all duration-500",
                    isFinal && content
                      ? "border-[#FF7F66] shadow-[0_8px_32px_-12px_rgba(255,127,102,0.35)]"
                      : null,
                    content && "animate-in fade-in slide-in-from-bottom-2 duration-500",
                  )}
                  style={
                    content
                      ? { animationDelay: `${idx * 90}ms`, animationFillMode: "forwards" as const }
                      : undefined
                  }
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[15px] font-bold text-[#1A1A1A]">{meta.title}</h3>
                      <p className="text-[12px] text-[#6B6B6B]">{meta.subtitle}</p>
                    </div>
                    {isLoading ? (
                      <div className="flex items-center gap-2 text-[12px] text-[#6B6B6B]">
                        <Loader2 className="h-4 w-4 animate-spin text-[#FF7F66]" aria-hidden />
                        생성 중…
                      </div>
                    ) : null}
                  </div>
                  {meta.n === 3 ? (
                    <p className="mb-3 rounded-xl bg-[#FAF8F6] px-3 py-2 text-[11px] leading-relaxed text-[#6B6B6B]">
                      <span className="font-semibold text-[#1A1A1A]">Do / Don&apos;t</span> 를 명확히 구분해 표시합니다. (
                      마크다운 헤딩·목록 형식)
                    </p>
                  ) : null}
                  {content ? (
                    <div
                      className={cn(
                        "whitespace-pre-wrap text-[13px] leading-relaxed text-[#2A2A2A]",
                        isFinal && "rounded-xl bg-[#FF7F66]/08 px-4 py-3 font-medium text-[#1A1A1A]",
                      )}
                    >
                      {content}
                    </div>
                  ) : !isLoading ? (
                    <p className="text-[12px] text-[#9A9A9A]">분석 실행 후 이 단계 결과가 표시됩니다.</p>
                  ) : null}
                </section>
              </Fragment>
            );
          })}
        </div>
      </main>
    </div>
  );
}
