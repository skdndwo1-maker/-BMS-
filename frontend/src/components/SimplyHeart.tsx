import { Fragment, useCallback, useState, type ChangeEvent, type ReactNode } from "react";
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

/** Gemini 등이 붙이는 마크다운 강조(*) — 화면·PDF 표시에서 제거 */
function stripSimplyHeartDisplayAsterisks(s: string): string {
  return s.replace(/\*/g, "");
}

/** ### 소제목 — 4단계와 공통 */
const RESULT_SECTION_H3_CLASS =
  "mt-8 border-b border-[rgba(0,0,0,0.08)] pb-2 text-[16px] font-bold tracking-tight text-[#1A1A1A] first:mt-0";

/** 본문 카드 — 4단계 제안 카드와 동족 톤 */
const RESULT_BODY_CARD_CLASS =
  "rounded-2xl border border-[rgba(255,127,102,0.22)] bg-white p-4 shadow-[0_2px_14px_-6px_rgba(0,0,0,0.06)]";

type Step4Block =
  | { kind: "h3"; text: string }
  | { kind: "tier2"; text: string }
  | { kind: "proposal"; tag: string; summary: string; quote: string }
  | { kind: "p"; text: string };

function isBlankLine(line: string): boolean {
  return !line.trim();
}

function looksLikeStep4Tier2Line(t: string): boolean {
  if (t.length > 160) return false;
  if (/^\d+\.\s/.test(t)) return false;
  if (t.startsWith("- ") || t.startsWith("•") || t.startsWith("*")) return false;
  if (/^(\[\d+\s*안\]|###)/.test(t)) return false;
  return (
    /^정제된 메시지/.test(t) ||
    /^One Action/i.test(t) ||
    /솔루션 메시지/.test(t) ||
    (/\([^)]+\)/.test(t) && /제안|목적|행동|CTA|맥락/.test(t))
  );
}

/** 4단계 본문을 섹션 / [N안] 요약 / 인용 세부 로 구분해 파싱 */
function parseSimplyHeartStep4Blocks(raw: string): Step4Block[] {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks: Step4Block[] = [];
  let i = 0;

  while (i < lines.length) {
    while (i < lines.length && isBlankLine(lines[i])) i++;
    if (i >= lines.length) break;

    const t = lines[i].trim();

    if (t.startsWith("### ")) {
      blocks.push({ kind: "h3", text: t.slice(4).trim() });
      i++;
      continue;
    }

    const proposalMatch = t.match(/^(\[\d+\s*안\])\s*(.*)$/);
    if (proposalMatch) {
      const tag = proposalMatch[1];
      const summary = proposalMatch[2].trim();
      i++;
      const bodyLines: string[] = [];
      while (i < lines.length) {
        const Lt = lines[i].trim();
        if (!Lt) {
          let j = i + 1;
          while (j < lines.length && isBlankLine(lines[j])) j++;
          if (j >= lines.length) {
            i = j;
            break;
          }
          const next = lines[j]!.trim();
          if (next.startsWith("### ") || /^\[\d+\s*안\]/.test(next)) {
            i = j;
            break;
          }
          bodyLines.push(lines[i]!);
          i++;
          continue;
        }
        if (Lt.startsWith("### ") || /^\[\d+\s*안\]/.test(Lt)) break;
        bodyLines.push(lines[i]!);
        i++;
      }
      blocks.push({ kind: "proposal", tag, summary, quote: bodyLines.join("\n").trim() });
      continue;
    }

    if (looksLikeStep4Tier2Line(t)) {
      blocks.push({ kind: "tier2", text: t });
      i++;
      continue;
    }

    const start = i;
    i++;
    while (i < lines.length) {
      const Lt = lines[i]!.trim();
      if (!Lt) break;
      if (Lt.startsWith("### ") || /^\[\d+\s*안\]/.test(Lt)) break;
      if (looksLikeStep4Tier2Line(Lt)) break;
      i++;
    }
    const para = lines.slice(start, i).join("\n").trim();
    if (para) blocks.push({ kind: "p", text: para });
  }

  return blocks;
}

function normalizeStep4Quote(s: string): string {
  let x = s.trim();
  if ((x.startsWith('"') && x.endsWith('"')) || (x.startsWith("\u201C") && x.endsWith("\u201D"))) {
    x = x.slice(1, -1).trim();
  }
  if (x.startsWith("「") && x.endsWith("」")) x = x.slice(1, -1).trim();
  return x;
}

function SimplyHeartStep4Structured({ text }: { text: string }): ReactNode {
  const blocks = parseSimplyHeartStep4Blocks(text);
  return (
    <div className="space-y-5">
      {blocks.map((b, bi) => {
        if (b.kind === "h3") {
          return (
            <h4
              key={bi}
              className={RESULT_SECTION_H3_CLASS}
            >
              {b.text}
            </h4>
          );
        }
        if (b.kind === "tier2") {
          return (
            <p key={bi} className="text-[14px] font-semibold tracking-tight text-[#333]">
              {b.text}
            </p>
          );
        }
        if (b.kind === "p") {
          return (
            <p key={bi} className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#2A2A2A]">
              {b.text}
            </p>
          );
        }
        const q = normalizeStep4Quote(b.quote);
        return (
          <div
            key={bi}
            className={cn("space-y-3", RESULT_BODY_CARD_CLASS)}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <span className="inline-flex shrink-0 items-center rounded-lg bg-[#FF7F66]/14 px-2.5 py-1 text-[13px] font-bold tabular-nums text-[#B54A32]">
                {b.tag}
              </span>
              {b.summary ? (
                <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-[#1A1A1A]">{b.summary}</p>
              ) : null}
            </div>
            {q ? (
              <div className="rounded-r-xl border-l-[3px] border-[#FF7F66] bg-[#FAFAF8] py-3 pl-4 pr-3">
                <p className="whitespace-pre-wrap text-[15px] leading-[1.65] text-[#2A2A2A]">{q}</p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type EarlyStepBlock =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "p"; text: string };

function isBulletLine(line: string): boolean {
  const t = line.trim();
  return /^[-•]\s/.test(t) || (/^\*\s/.test(t) && !/^\*\*\s/.test(t));
}

function isNumberedLine(line: string): boolean {
  return /^([1-9]\d{0,2})\.\s+/.test(line.trim());
}

function stripBulletItem(line: string): string {
  const t = line.trim();
  if (/^-\s+/.test(t)) return t.slice(2).trim();
  if (/^•\s*/.test(t)) return t.replace(/^•\s*/, "").trim();
  if (/^\*\s+/.test(t)) return t.replace(/^\*\s+/, "").trim();
  return t;
}

function stripOrderedItem(line: string): string {
  return line.trim().replace(/^([1-9]\d{0,2})\.\s+/, "").trim();
}

/** 1~3단계: ##/### · 목록 · 인용 단락 파싱 (4단계와 시각 톤 정렬) */
function parseSimplyHeartEarlyStepBlocks(raw: string): EarlyStepBlock[] {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks: EarlyStepBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    while (i < lines.length && isBlankLine(lines[i]!)) i++;
    if (i >= lines.length) break;

    const rawLine = lines[i]!;
    const t = rawLine.trim();

    if (t.startsWith("### ")) {
      blocks.push({ kind: "h3", text: t.slice(4).trim() });
      i++;
      continue;
    }
    if (t.startsWith("## ")) {
      blocks.push({ kind: "h2", text: t.slice(3).trim() });
      i++;
      continue;
    }
    if (t.startsWith("> ")) {
      const quoteLines: string[] = [t.slice(2).trim()];
      i++;
      while (i < lines.length && lines[i]!.trim().startsWith("> ")) {
        quoteLines.push(lines[i]!.trim().slice(2).trim());
        i++;
      }
      blocks.push({ kind: "quote", text: quoteLines.join("\n") });
      continue;
    }

    if (isBulletLine(rawLine)) {
      const items: string[] = [];
      while (i < lines.length && isBulletLine(lines[i]!)) {
        items.push(stripBulletItem(lines[i]!));
        i++;
      }
      if (items.length) blocks.push({ kind: "ul", items });
      continue;
    }

    if (isNumberedLine(rawLine)) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.trim() && isNumberedLine(lines[i]!)) {
        items.push(stripOrderedItem(lines[i]!));
        i++;
      }
      if (items.length) blocks.push({ kind: "ol", items });
      continue;
    }

    const start = i;
    i++;
    while (i < lines.length) {
      const Lt = lines[i]!.trim();
      if (!Lt) break;
      if (Lt.startsWith("### ") || Lt.startsWith("## ")) break;
      if (Lt.startsWith("> ")) break;
      if (isBulletLine(lines[i]!) || isNumberedLine(lines[i]!)) break;
      i++;
    }
    const para = lines.slice(start, i).join("\n").trim();
    if (para) blocks.push({ kind: "p", text: para });
  }

  return blocks;
}

function SimplyHeartEarlyStepsStructured({ text }: { text: string }): ReactNode {
  const blocks = parseSimplyHeartEarlyStepBlocks(text);
  return (
    <div className="space-y-5">
      {blocks.map((b, bi) => {
        if (b.kind === "h2") {
          return (
            <h4
              key={bi}
              className="mt-7 border-b border-[rgba(0,0,0,0.08)] pb-2 text-[17px] font-bold tracking-tight text-[#1A1A1A] first:mt-0"
            >
              {b.text}
            </h4>
          );
        }
        if (b.kind === "h3") {
          return (
            <h4 key={bi} className={RESULT_SECTION_H3_CLASS}>
              {b.text}
            </h4>
          );
        }
        if (b.kind === "quote") {
          return (
            <div
              key={bi}
              className="rounded-r-xl border-l-[3px] border-[#FF7F66] bg-[#FAFAF8] py-3 pl-4 pr-3"
            >
              <p className="whitespace-pre-wrap text-[15px] leading-[1.65] text-[#2A2A2A]">{b.text}</p>
            </div>
          );
        }
        if (b.kind === "ul") {
          return (
            <div key={bi} className={RESULT_BODY_CARD_CLASS}>
              <ul className="space-y-2.5">
                {b.items.map((item, ii) => (
                  <li key={ii} className="flex gap-3">
                    <span
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF7F66]"
                      aria-hidden
                    />
                    <span className="min-w-0 whitespace-pre-wrap text-[15px] leading-relaxed text-[#2A2A2A]">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        if (b.kind === "ol") {
          return (
            <div key={bi} className={RESULT_BODY_CARD_CLASS}>
              <ol className="list-none space-y-3">
                {b.items.map((item, ii) => (
                  <li key={ii} className="flex gap-3">
                    <span className="flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-lg bg-[#FF7F66]/14 px-2 text-[13px] font-bold tabular-nums text-[#B54A32]">
                      {ii + 1}
                    </span>
                    <span className="min-w-0 whitespace-pre-wrap text-[15px] leading-relaxed text-[#2A2A2A]">
                      {item}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#2A2A2A]">
            {b.text}
          </p>
        );
      })}
    </div>
  );
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
        const body = stripSimplyHeartDisplayAsterisks((results[s.n] ?? "").trim());
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
            <FileText className="h-6 w-6 shrink-0 text-[#FF7F66]" />
            <h2 className="text-[20px] font-bold text-[#1A1A1A]">텍스트 (주요)</h2>
          </div>

          <div className="mb-4">
            <label htmlFor="simply-field-topic" className="mb-1.5 block text-[18px] font-semibold text-[#1A1A1A]">
              1. 확인 분야
            </label>
            <input
              id="simply-field-topic"
              type="text"
              value={fieldTopic}
              onChange={(e) => setFieldTopic(e.target.value)}
              placeholder="예) 요금 안내 카피, 사내 공지, 배너 문구 등"
              className="h-12 w-full rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 text-[15px] leading-normal text-[#1A1A1A] outline-none ring-[#FF7F66]/20 placeholder:text-[15px] placeholder:text-[#9A9A9A] focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="simply-field-detail" className="mb-1.5 block text-[18px] font-semibold text-[#1A1A1A]">
              2. 상세 내용
            </label>
            <textarea
              id="simply-field-detail"
              value={fieldDetail}
              onChange={(e) => setFieldDetail(e.target.value)}
              rows={7}
              placeholder="요금제명, 메시지, 기획안, 카피, 공지사항 등 자유 입력…"
              className="min-h-[162px] w-full resize-y rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-3 text-[15px] leading-relaxed text-[#1A1A1A] outline-none ring-[#FF7F66]/20 placeholder:text-[15px] placeholder:text-[#9A9A9A] focus:ring-2"
            />
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
            const displayContent = content ? stripSimplyHeartDisplayAsterisks(content) : "";
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
                      <h3 className="text-[18px] font-bold text-[#1A1A1A]">{meta.title}</h3>
                      <p className="text-[13px] text-[#6B6B6B]">{meta.subtitle}</p>
                    </div>
                    {isLoading ? (
                      <div className="flex items-center gap-2 text-[12px] text-[#6B6B6B]">
                        <Loader2 className="h-4 w-4 animate-spin text-[#FF7F66]" aria-hidden />
                        생성 중…
                      </div>
                    ) : null}
                  </div>
                  {meta.n === 3 ? (
                    <p className="mb-3 rounded-xl border border-[rgba(255,127,102,0.15)] bg-white/80 px-3 py-2 text-[12px] leading-relaxed text-[#6B6B6B] shadow-[0_1px_8px_-4px_rgba(0,0,0,0.06)]">
                      <span className="font-semibold text-[#1A1A1A]">Do / Don&apos;t</span> 는 아래 목록에서 번호·불릿으로 구분됩니다.
                    </p>
                  ) : null}
                  {displayContent ? (
                    <div className="rounded-xl bg-[#FF7F66]/08 px-4 py-4">
                      {isFinal ? (
                        <SimplyHeartStep4Structured text={displayContent} />
                      ) : (
                        <SimplyHeartEarlyStepsStructured text={displayContent} />
                      )}
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
