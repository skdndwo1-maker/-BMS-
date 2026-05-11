import { useCallback, useState, type ChangeEvent, type ReactNode } from "react";
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


const STEP_STYLES: Record<1 | 2 | 3, { accent: string; accentLight: string }> = {
  1: { accent: "#2563EB", accentLight: "rgba(37,99,235,0.07)" },
  2: { accent: "#7C3AED", accentLight: "rgba(124,58,237,0.07)" },
  3: { accent: "#059669", accentLight: "rgba(5,150,105,0.07)" },
};

/** 번호 목록 뱃지 — 메인 오렌지 */
const NUM_BADGE_BG = "#E8593A";
const NUM_BADGE_TEXT = "#FFFFFF";

function displaySimplySolutionH3(text: string): string {
  const t = text.trim();
  if (/^교정안$/i.test(t)) return "Simply U+ 솔루션";
  return t;
}

const cardBase =
  "rounded-[22px] border border-[rgba(0,0,0,0.06)] bg-white p-6 shadow-[0_4px_28px_-10px_rgba(0,0,0,0.08),0_2px_12px_-6px_rgba(0,0,0,0.04)]";

/**
 * Simply U+ 가이드라인(실천과제·설명자료)에서 다루는 주체별·협력 부서 구분에 맞춘 선택지.
 * (PDF에 명시된 역할/조직 맥락을 반영; 상세 명칭은 사내 조직 개편 시 조정 가능)
 */
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

function stripSimplyHeartDisplayAsterisks(s: string): string {
  let t = String(s)
    .replace(/\u200b|\uFEFF/g, "")
    .replace(/\u00A0/g, " ");
  // 마크다운 강조 * 및 전각 ※ 대체에 가까운 U+FF0A 별표
  t = t.replace(/[\*\uFF0A]/g, "");
  // 줄마다 공백 압축 + 양끝 트림 → * 제거로 남는 빈 칸·들쭉날쭉 정렬 완화
  t = t
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/** "짧은 레이블: 상세 내용" 패턴을 감지해 굵기 차이로 주/부 내용을 구분 렌더 */
function renderWithLeadDetail(text: string): ReactNode {
  const colonIdx = text.indexOf(": ");
  if (colonIdx > 0 && colonIdx <= 45 && !text.startsWith("http")) {
    const lead = text.slice(0, colonIdx);
    const detail = text.slice(colonIdx + 2);
    return (
      <>
        <span className="font-semibold text-[#0F0F0F]">{lead}</span>
        <span className="text-[#505050]">: {detail}</span>
      </>
    );
  }
  return <>{text}</>;
}


function isBlankLine(line: string): boolean {
  return !line.trim();
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
  const t = line.trim();
  return (
    /^([1-9]\d{0,2})[.\uFF0E]\s*\S/.test(t) ||
    /^([1-9]\d{0,2})\)\s*\S/.test(t)
  );
}

function stripBulletItem(line: string): string {
  const t = line.trim();
  if (/^-\s+/.test(t)) return t.slice(2).trim();
  if (/^•\s*/.test(t)) return t.replace(/^•\s*/, "").trim();
  if (/^\*\s+/.test(t)) return t.replace(/^\*\s+/, "").trim();
  return t;
}

function stripOrderedItem(line: string): string {
  return line
    .trim()
    .replace(/^([1-9]\d{0,2})[.\uFF0E]\s*/, "")
    .replace(/^([1-9]\d{0,2})\)\s*/, "")
    .trim();
}

function tryExplodeParagraphToOrderedList(text: string): { kind: "ol"; items: string[] } | null {
  const raw = text.replace(/\r/g, "").trim();
  if (!raw.includes("\n")) return null;
  const lines = raw.split("\n");
  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  if (trimmed.length < 2) return null;
  if (!trimmed.every((l) => isNumberedLine(l))) return null;
  return { kind: "ol", items: trimmed.map(stripOrderedItem) };
}

/** 연속된 단일 줄 `1. …` 문단 / 인접 ol 을 하나의 번호 목록으로 합침 (부담진단·공감포인트 등) */
function mergeSingleLineNumberedParagraphs(blocks: EarlyStepBlock[]): EarlyStepBlock[] {
  const out: EarlyStepBlock[] = [];
  let acc: string[] | null = null;

  const flushAcc = () => {
    if (acc?.length) {
      out.push({ kind: "ol", items: acc });
    }
    acc = null;
  };

  const addItems = (items: string[]) => {
    if (!acc) acc = [];
    acc.push(...items);
  };

  for (const b of blocks) {
    if (b.kind === "h2" || b.kind === "h3" || b.kind === "quote" || b.kind === "ul") {
      flushAcc();
      out.push(b);
      continue;
    }
    if (b.kind === "p") {
      const parts = b.text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (parts.length === 1 && isNumberedLine(parts[0]!)) {
        addItems([stripOrderedItem(parts[0]!)]);
        continue;
      }
      if (parts.length >= 2 && parts.every((l) => isNumberedLine(l))) {
        flushAcc();
        addItems(parts.map(stripOrderedItem));
        flushAcc();
        continue;
      }
      flushAcc();
      out.push(b);
      continue;
    }
    if (b.kind === "ol") {
      addItems(b.items);
      continue;
    }
    flushAcc();
    out.push(b);
  }
  flushAcc();
  return out;
}

function mergeConsecutiveOlBlocks(blocks: EarlyStepBlock[]): EarlyStepBlock[] {
  const out: EarlyStepBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "ol" && out.length > 0 && out[out.length - 1]!.kind === "ol") {
      const prev = out[out.length - 1] as { kind: "ol"; items: string[] };
      prev.items.push(...b.items);
    } else {
      out.push(b);
    }
  }
  return out;
}

/** 번호 목록 사이에 끼인 짧은 문단(구획용)을 건너뛰고 항목을 한 목록으로 합침 */
function isTrivialSeparatorParagraph(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length > 22) return false;
  if (/^[예※·∙\-\s]*$/.test(t)) return true;
  if (/^(?:예|참고|※|Note)\s*[:：]?\s*$/i.test(t)) return true;
  return t.length <= 14;
}

function mergeOlAcrossTrivialParagraphs(blocks: EarlyStepBlock[]): EarlyStepBlock[] {
  const out: EarlyStepBlock[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!;
    if (b.kind === "ol" && b.items.length > 0) {
      const mergedItems = [...b.items];
      let j = i + 1;
      while (j < blocks.length) {
        const mid = blocks[j]!;
        if (mid.kind === "p" && isTrivialSeparatorParagraph(mid.text)) {
          j++;
          continue;
        }
        if (mid.kind === "ol" && mid.items.length > 0) {
          mergedItems.push(...mid.items);
          j++;
          continue;
        }
        break;
      }
      if (j > i + 1) {
        out.push({ kind: "ol", items: mergedItems });
        i = j;
        continue;
      }
    }
    out.push(b);
    i++;
  }
  return out;
}

function finalizeEarlyStepBlocks(blocks: EarlyStepBlock[]): EarlyStepBlock[] {
  let b = mergeSingleLineNumberedParagraphs(blocks);
  b = mergeOlAcrossTrivialParagraphs(b);
  b = mergeConsecutiveOlBlocks(b);
  b = mergeUlAcrossTrivialParagraphs(b);
  b = mergeConsecutiveUlBlocks(b);
  return b;
}

function mergeConsecutiveUlBlocks(blocks: EarlyStepBlock[]): EarlyStepBlock[] {
  const out: EarlyStepBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "ul" && out.length > 0 && out[out.length - 1]!.kind === "ul") {
      const prev = out[out.length - 1] as { kind: "ul"; items: string[] };
      prev.items.push(...b.items);
    } else {
      out.push(b);
    }
  }
  return out;
}

function mergeUlAcrossTrivialParagraphs(blocks: EarlyStepBlock[]): EarlyStepBlock[] {
  const out: EarlyStepBlock[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!;
    if (b.kind === "ul" && b.items.length > 0) {
      const mergedItems = [...b.items];
      let j = i + 1;
      while (j < blocks.length) {
        const mid = blocks[j]!;
        if (mid.kind === "p" && isTrivialSeparatorParagraph(mid.text)) {
          j++;
          continue;
        }
        if (mid.kind === "ul" && mid.items.length > 0) {
          mergedItems.push(...mid.items);
          j++;
          continue;
        }
        break;
      }
      if (j > i + 1) {
        out.push({ kind: "ul", items: mergedItems });
        i = j;
        continue;
      }
    }
    out.push(b);
    i++;
  }
  return out;
}

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
      while (i < lines.length) {
        const cur = lines[i]!;
        const trimmed = cur.trim();
        if (!trimmed) {
          let j = i + 1;
          while (j < lines.length && isBlankLine(lines[j]!)) j++;
          if (j >= lines.length) break;
          if (isNumberedLine(lines[j]!)) {
            i = j;
            continue;
          }
          break;
        }
        if (!isNumberedLine(cur)) break;
        items.push(stripOrderedItem(cur));
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
    if (para) {
      const exploded = tryExplodeParagraphToOrderedList(para);
      if (exploded) blocks.push(exploded);
      else blocks.push({ kind: "p", text: para });
    }
  }

  return finalizeEarlyStepBlocks(blocks);
}

/** 모델이 항목마다 `1.`로 리셋하거나 인용/빈 줄로 목록이 끊기면 ol이 항목 1개 블록 여러 개로 쪼개짐 → 뱃지는 본문 전체 기준 1,2,3…으로 유지 */
function buildEarlyStepEnumBadgeIndices(blocks: EarlyStepBlock[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi]!;
    if (b.kind === "ol" || b.kind === "ul") {
      for (let ii = 0; ii < b.items.length; ii++) {
        n += 1;
        map.set(`${bi}:${ii}`, n);
      }
    }
  }
  return map;
}

type Step12SectionKind = "target_purpose" | "list_aggregate" | "other";

function lastHeadingIndexBefore(blocks: EarlyStepBlock[], bi: number): number {
  for (let i = bi - 1; i >= 0; i--) {
    if (blocks[i]!.kind === "h2" || blocks[i]!.kind === "h3") return i;
  }
  return -1;
}

/** 1·2단계: 마지막 ### / ## 기준 본문 구역 (타겟·목적 vs 부담·공감) */
function earlyStep12SectionKind(blocks: EarlyStepBlock[], blockIndex: number, stepN: number): Step12SectionKind {
  if (stepN !== 1 && stepN !== 2) return "other";
  let lastH = "";
  for (let i = 0; i < blockIndex; i++) {
    const bb = blocks[i]!;
    if (bb.kind === "h2") lastH = "";
    else if (bb.kind === "h3") lastH = bb.text;
  }
  const h = lastH.trim();
  if (stepN === 1) {
    if (/부담|진단/i.test(h)) return "list_aggregate";
    if (/타겟|세그|seg|목적|요청/i.test(h)) return "target_purpose";
    return "other";
  }
  /* 2단계 카드는 공감·Pain 분석만 — 헤딩 표기가 달라도 목록은 항상 소주제·상세 카드 경로 */
  if (stepN === 2) return "list_aggregate";
  return "other";
}

/** 같은 ### 구역 안에서만 ol/ul 항목 순번 (타겟·목적 아래 목록 1,2 / 부담은 별도 구역에서 다시 1…) */
function listItemBadgeInSection(blocks: EarlyStepBlock[], bi: number, ii: number): number {
  const start = lastHeadingIndexBefore(blocks, bi);
  let n = 0;
  for (let j = start + 1; j <= bi; j++) {
    const bj = blocks[j]!;
    if (bj.kind === "ol" || bj.kind === "ul") {
      if (j < bi) n += bj.items.length;
      else n += ii + 1;
    }
  }
  return Math.max(1, n);
}

type Step3Zone = "do" | "dont" | "neutral";

function classifyStep3H3Zone(heading: string): Step3Zone {
  const t = heading.trim();
  const isDo = /^do(\b|\s|$|\()/i.test(t) && !/don'?t/i.test(t);
  if (isDo) return "do";
  if (/don'?t/i.test(t) || /하지\s*말/i.test(t)) return "dont";
  return "neutral";
}

function step3ZoneBeforeBlock(blocks: EarlyStepBlock[], index: number): Step3Zone {
  let z: Step3Zone = "neutral";
  for (let i = 0; i < index; i++) {
    const b = blocks[i]!;
    if (b.kind === "h3") z = classifyStep3H3Zone(b.text);
  }
  return z;
}

/** 소제목: 본문 또는 첫 줄 소제목 / 이후 본문 */
function splitStep3TitleBody(text: string): { title: string; body: string } | null {
  const t = text.trim();
  if (!t) return null;
  const colonMatch = /^(.{2,56}?)\s*[:：]\s*([\s\S]+)$/.exec(t);
  if (colonMatch) {
    const title = colonMatch[1]!.trim();
    const body = colonMatch[2]!.trim();
    if (title.length >= 2 && body.length > 0) return { title, body };
  }
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const first = lines[0]!;
  if (first.length > 58) return null;
  if (/[.!?。．？！]$/.test(first) && first.length > 36) return null;
  return { title: first, body: lines.slice(1).join("\n").trim() };
}

/** 리스트 마커 제거 후 본문만 (3단계 Do/Don't 항목) */
function stripStep3ListItemMarkers(text: string): string {
  return text
    .trim()
    .replace(/^(\d{1,3})[.)\uFF0E]\s+/, "")
    .replace(/^[•\-*]\s+/, "")
    .trim();
}

/**
 * 3단계 전용: 엄격 분리 실패 시에도 소주제·상세를 최대한 나눔 (Do/Don't 공통).
 * — / – / - 구분, 긴 콜론 제목, 첫 줄 분리, **제목** 패턴 등.
 */
function splitStep3TitleBodyLoose(text: string): { title?: string; body: string } {
  const raw = text.trim();
  if (!raw) return { body: "" };

  const stripped = stripStep3ListItemMarkers(raw);
  const base = stripped.length > 0 ? stripped : raw;

  const strict = splitStep3TitleBody(base);
  if (strict) return { title: strict.title, body: strict.body };

  const boldLine = /^\*\*([^*]+)\*\*\s*\n+([\s\S]+)$/.exec(base);
  if (boldLine) {
    const title = boldLine[1]!.trim();
    const body = boldLine[2]!.trim();
    if (title.length >= 2 && body.length > 0) return { title, body };
  }

  const boldInline = /^\*\*([^*]+)\*\*\s+(.+)$/.exec(base);
  if (boldInline) {
    const title = boldInline[1]!.trim();
    const body = boldInline[2]!.trim();
    if (title.length >= 2 && body.length > 0) return { title, body };
  }

  const longColon = /^(.{2,120}?)\s*[:：]\s+([\s\S]+)$/.exec(base);
  if (longColon) {
    const title = longColon[1]!.trim();
    const body = longColon[2]!.trim();
    if (title.length >= 2 && body.length > 0 && !/^https?$/i.test(title)) return { title, body };
  }

  const dashSplit = /^(.{2,90}?)\s*(?:[–—]|\s-\s)\s+([\s\S]+)$/.exec(base);
  if (dashSplit) {
    const title = dashSplit[1]!.trim();
    const body = dashSplit[2]!.trim();
    if (title.length >= 2 && body.length > 0) return { title, body };
  }

  const lines = base.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const first = lines[0]!;
    if (first.length >= 2 && first.length <= 120) {
      const rest = lines.slice(1).join("\n").trim();
      if (rest.length > 0) return { title: first, body: rest };
    }
  }

  const ci = base.indexOf(":");
  if (ci > 0 && ci <= 90 && !base.startsWith("http")) {
    const maybeTitle = base.slice(0, ci).trim();
    const maybeBody = base.slice(ci + 1).trim();
    if (maybeTitle.length >= 2 && maybeBody.length > 0 && !maybeTitle.includes("/")) {
      return { title: maybeTitle, body: maybeBody };
    }
  }

  return { body: base };
}

function step3ItemToTitleBody(item: string): { title?: string; body: string } {
  const t = item.trim();
  if (!t) return { body: "" };
  const normalized = stripStep3ListItemMarkers(t);
  const working = normalized.length > 0 ? normalized : t;
  const strict = splitStep3TitleBody(working);
  if (strict) return { title: strict.title, body: strict.body };
  return splitStep3TitleBodyLoose(working);
}

function isShortTopicLineForStep12(s: string): boolean {
  const t = s.trim();
  if (t.length < 6 || t.length > 100) return false;
  if (t.includes("\n")) return false;
  if (/[.!?。]$/u.test(t) && t.length > 42) return false;
  return true;
}

function looksLikeTopicBodyContinuation(s: string): boolean {
  const t = s.trim();
  if (t.length > 110) return true;
  return /^(?:진단|또한|이를|이는|예를|예시|구체|특히|따라|즉|달리|한편|또는)/.test(t);
}

/** 부담 진단·공감 포인트: 평면 번호 목록을 소주제+상세 묶음으로 병합 */
function groupStep12ListItems(items: string[]): { title?: string; body: string }[] {
  const out: { title?: string; body: string }[] = [];
  for (const item of items) {
    const t = item.trim();
    if (!t) continue;
    const parsed = step3ItemToTitleBody(item);
    if (parsed.title) {
      out.push({ title: parsed.title, body: parsed.body });
      continue;
    }
    const body = (parsed.body || item).trim();
    if (out.length > 0) {
      const prev = out[out.length - 1]!;
      if (prev.title != null) {
        if (looksLikeTopicBodyContinuation(body) || !isShortTopicLineForStep12(body)) {
          prev.body = `${prev.body.trim()}\n\n${body}`;
          continue;
        }
      } else if (!isShortTopicLineForStep12(body)) {
        prev.body = `${prev.body.trim()}\n\n${body}`;
        continue;
      }
    }
    out.push({ body });
  }
  return out;
}

function splitStep3ParagraphChunks(text: string): { title?: string; body: string }[] {
  const chunks = text
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return chunks.map((part) => step3ItemToTitleBody(part));
}

function step3ZoneAccent(zone: Step3Zone): string {
  if (zone === "do") return "#059669";
  if (zone === "dont") return "#DC2626";
  return "#57534E";
}

/** 3단계 서브카드와 동일 레이아웃 — 좌측 색 띠 + 소제목(accent) + 본문 */
function SimplyHeartDetailCard({
  accent,
  title,
  body,
  quote,
  bodyContent,
}: {
  accent: string;
  title?: string;
  body: string;
  quote?: boolean;
  bodyContent?: ReactNode;
}): ReactNode {
  const b = body.trim();
  const t = title?.trim();

  if (bodyContent != null) {
    return (
      <div className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_1px_6px_-3px_rgba(0,0,0,0.06)]">
        <div className="w-[3px] shrink-0 self-stretch" style={{ backgroundColor: accent }} aria-hidden />
        <div className="min-w-0 flex-1 px-4 py-3 text-left">
          {t ? (
            <p className="text-left text-[14px] font-bold leading-snug" style={{ color: accent }}>
              {t}
            </p>
          ) : null}
          <div
            className={cn(
              "min-w-0 text-left text-[15px] leading-[1.75] text-[#2A2A2A]",
              t ? "mt-2" : null,
              quote ? "italic" : null,
            )}
          >
            {bodyContent}
          </div>
        </div>
      </div>
    );
  }

  if (!b && !t) return null;
  if (!b && t) {
    return (
      <div className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_1px_6px_-3px_rgba(0,0,0,0.06)]">
        <div className="w-[3px] shrink-0 self-stretch" style={{ backgroundColor: accent }} aria-hidden />
        <div className="min-w-0 flex-1 px-4 py-3 text-left">
          <p className="text-left text-[14px] font-bold leading-snug" style={{ color: accent }}>
            {t}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_1px_6px_-3px_rgba(0,0,0,0.06)]">
      <div className="w-[3px] shrink-0 self-stretch" style={{ backgroundColor: accent }} aria-hidden />
      <div className="min-w-0 flex-1 px-4 py-3 text-left">
        {t ? (
          <p className="text-left text-[14px] font-bold leading-snug" style={{ color: accent }}>
            {t}
          </p>
        ) : null}
        <p
          className={cn(
            "whitespace-pre-wrap text-left text-[15px] leading-[1.75] text-[#2A2A2A]",
            t ? "mt-2" : null,
            quote ? "italic" : null,
          )}
        >
          {b}
        </p>
      </div>
    </div>
  );
}

/** Do / Don't 등: 항목마다 카드 대신 한 박스 안에서 소제목·본문만 구분 */
function Step3ZoneUnifiedCard(props: {
  zone: Step3Zone;
  items?: string[];
  rows?: { title?: string; body: string }[];
}): ReactNode {
  const accent = step3ZoneAccent(props.zone);
  const resolved: { title?: string; body: string }[] = [];
  if (props.rows) {
    for (const r of props.rows) {
      const t = r.title?.trim();
      const b = r.body.trim();
      if (!b && !t) continue;
      resolved.push({ title: t, body: b });
    }
  } else {
    for (const raw of props.items ?? []) {
      const tb = step3ItemToTitleBody(raw);
      if (!tb.body.trim() && !tb.title?.trim()) continue;
      resolved.push({ title: tb.title, body: tb.body });
    }
  }
  if (resolved.length === 0) return null;
  return (
    <div className="flex min-w-0 w-full overflow-hidden rounded-xl border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_1px_6px_-3px_rgba(0,0,0,0.06)]">
      <div className="w-[3px] shrink-0 self-stretch" style={{ backgroundColor: accent }} aria-hidden />
      <div className="min-w-0 flex-1 space-y-4 px-4 py-4 text-left">
        {resolved.map((row, gi) => (
          <div key={gi} className={gi > 0 ? "border-t border-[rgba(0,0,0,0.08)] pt-4" : undefined}>
            {row.title ? (
              <p className="text-[14px] font-bold leading-snug" style={{ color: accent }}>
                {row.title}
              </p>
            ) : null}
            <p
              className={cn(
                "whitespace-pre-wrap text-[15px] leading-[1.75] text-[#2A2A2A]",
                row.title ? "mt-2" : null,
              )}
            >
              {row.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 1·2단계 본문 — 3단계와 동일 카드 시스템 (단계 악센트) */
function Step12DetailCard(props: {
  step: 1 | 2;
  title?: string;
  body: string;
  quote?: boolean;
  bodyContent?: ReactNode;
}): ReactNode {
  const accent = STEP_STYLES[props.step].accent;
  return (
    <SimplyHeartDetailCard
      accent={accent}
      title={props.title}
      body={props.body}
      quote={props.quote}
      bodyContent={props.bodyContent}
    />
  );
}

/** 제목 파싱 실패 시 첫 줄만 소제목 후보로 분리 (2단계·부담 목록 가독성) */
function step12FallbackTitleFromBody(raw: string): { title?: string; body: string } {
  const t = raw.trim();
  if (!t) return { body: "" };
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { body: t };
  const head = lines[0]!;
  if (head.length < 2 || head.length > 120) return { body: t };
  if (/[.!?。]$/u.test(head) && head.length > 48) return { body: t };
  const rest = lines.slice(1).join("\n").trim();
  if (!rest) return { body: t };
  return { title: head, body: rest };
}

/** 부담·공감 목록 항목 — 3단계와 동일 DetailCard (단계 색 띠) */
function Step12TopicCard({ step, title, body }: { step: 1 | 2; title?: string; body: string }): ReactNode {
  let displayTitle = title?.trim();
  let displayBody = body.trim();
  if (!displayTitle && displayBody) {
    const fb = step12FallbackTitleFromBody(displayBody);
    if (fb.title && fb.body.trim()) {
      displayTitle = fb.title;
      displayBody = fb.body.trim();
    }
  }
  if (!displayBody && !displayTitle) return null;
  return <Step12DetailCard step={step} title={displayTitle} body={displayBody} />;
}

/** 1단계 문제 진단: 소제목·본문 구조 유지, 항목들은 한 카드 안에 구역만 나눔 */
function Step12DiagnosisUnifiedCard({ groups }: { groups: { title?: string; body: string }[] }): ReactNode {
  const st = STEP_STYLES[1];
  const rows: { displayTitle?: string; displayBody: string }[] = [];
  for (const g of groups) {
    let displayTitle = g.title?.trim();
    let displayBody = g.body.trim();
    if (!displayTitle && displayBody) {
      const fb = step12FallbackTitleFromBody(displayBody);
      if (fb.title && fb.body.trim()) {
        displayTitle = fb.title;
        displayBody = fb.body.trim();
      }
    }
    if (!displayBody && !displayTitle) continue;
    rows.push({ displayTitle, displayBody });
  }
  if (rows.length === 0) return null;
  return (
    <div className="flex min-w-0 w-full overflow-hidden rounded-xl border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_1px_6px_-3px_rgba(0,0,0,0.06)]">
      <div className="w-[3px] shrink-0 self-stretch" style={{ backgroundColor: st.accent }} aria-hidden />
      <div className="min-w-0 flex-1 space-y-4 px-4 py-4 text-left">
        {rows.map((row, gi) => (
          <div key={gi} className={gi > 0 ? "border-t border-[rgba(0,0,0,0.08)] pt-4" : undefined}>
            {row.displayTitle ? (
              <p className="text-[14px] font-bold leading-snug" style={{ color: st.accent }}>
                {row.displayTitle}
              </p>
            ) : null}
            <p
              className={cn(
                "whitespace-pre-wrap text-[15px] leading-[1.75] text-[#2A2A2A]",
                row.displayTitle ? "mt-2" : null,
              )}
            >
              {row.displayBody}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimplyHeartEarlyStepsStructured({
  text,
  step,
  variant = "default",
}: {
  text: string;
  step?: 1 | 2 | 3;
  variant?: "default" | "solution";
}): ReactNode {
  const blocks = parseSimplyHeartEarlyStepBlocks(text);
  const stepN = step == null ? NaN : Number(step);
  /** 3단계만 숫자 뱃지 숨김. 1·2단계는 구역별 번호를 따로 계산 */
  const showEnumBadges = stepN !== 3;
  const enumBadge =
    showEnumBadges && stepN !== 1 && stepN !== 2 ? buildEarlyStepEnumBadgeIndices(blocks) : new Map<string, number>();
  const badgeFor = (bi: number, ii: number) => enumBadge.get(`${bi}:${ii}`) ?? ii + 1;

  const enumBadgeSpan = (n: number) => (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-black tabular-nums shadow-[0_2px_8px_-2px_rgba(232,89,58,0.45)]"
      style={{ backgroundColor: NUM_BADGE_BG, color: NUM_BADGE_TEXT }}
    >
      {n}
    </span>
  );

  const nodes = blocks.map((b, bi) => {
        /* ── 대제목 (##) ── */
        if (b.kind === "h2") {
          if (stepN === 1 || stepN === 2) {
            const st = STEP_STYLES[stepN];
            return (
              <div
                key={bi}
                className="mt-8 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left first:mt-0"
                style={{ backgroundColor: st.accentLight }}
              >
                <div className="h-6 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: st.accent }} aria-hidden />
                <h4 className="text-[17px] font-bold tracking-tight text-[#0F0F0F]">{b.text}</h4>
              </div>
            );
          }
          return (
            <div
              key={bi}
              className="mt-8 flex w-full items-center gap-3 rounded-xl bg-[#F2F2F0] px-4 py-3 text-left first:mt-0"
            >
              <div className="h-6 w-[3px] shrink-0 rounded-full bg-[#E8593A]" aria-hidden />
              <h4 className="text-[17px] font-bold tracking-tight text-[#0F0F0F]">{b.text}</h4>
            </div>
          );
        }
        /* ── 소제목 (###) — 1·2단계는 단계 악센트 / 3단계는 Do·Don't ── */
        if (b.kind === "h3") {
          if (stepN === 1 || stepN === 2) {
            const st = STEP_STYLES[stepN];
            return (
              <div
                key={bi}
                className="mt-6 flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left first:mt-0"
                style={{ backgroundColor: st.accentLight }}
              >
                <div className="h-5 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: st.accent }} aria-hidden />
                <h4 className="text-[15px] font-bold tracking-tight text-[#0F0F0F]">{b.text}</h4>
              </div>
            );
          }
          const h3Label = variant === "solution" ? displaySimplySolutionH3(b.text) : b.text;
          if (variant === "solution" && /^simply\s*u\+\s*솔루션$/i.test(h3Label.trim())) {
            return null;
          }
          const zone = classifyStep3H3Zone(b.text);
          const barColor = zone === "do" ? "#059669" : zone === "dont" ? "#DC2626" : "#E8593A";
          const wrapBg =
            zone === "do"
              ? "rgba(5,150,105,0.06)"
              : zone === "dont"
                ? "rgba(220,38,38,0.06)"
                : "rgba(232,89,58,0.05)";
          const textColor = zone === "do" ? "#065F46" : zone === "dont" ? "#991B1B" : "#1A1A1A";
          return (
            <div
              key={bi}
              className="mt-6 flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left first:mt-0"
              style={{ backgroundColor: wrapBg }}
            >
              <div
                className="h-5 w-[3px] shrink-0 rounded-full"
                style={{ backgroundColor: barColor }}
                aria-hidden
              />
              <h4 className="text-[15px] font-bold tracking-tight" style={{ color: textColor }}>
                {h3Label}
              </h4>
            </div>
          );
        }
        /* ── 인용 블록 ── */
        if (b.kind === "quote") {
          if (
            stepN === 2 ||
            ((stepN === 1 || stepN === 2) &&
              earlyStep12SectionKind(blocks, bi, stepN) === "target_purpose")
          ) {
            return (
              <Step12DetailCard
                key={bi}
                step={stepN as 1 | 2}
                body=""
                quote
                bodyContent={<p className="whitespace-pre-wrap leading-[1.85]">{b.text}</p>}
              />
            );
          }
          if (variant === "solution") {
            return (
              <div
                key={bi}
                className="w-full rounded-xl border-2 border-[rgba(232,89,58,0.4)] bg-white px-6 py-5 text-left shadow-[0_6px_28px_-12px_rgba(232,89,58,0.35)]"
              >
                <p className="whitespace-pre-wrap text-[18px] font-semibold leading-[1.75] tracking-tight text-[#141414]">
                  {b.text}
                </p>
              </div>
            );
          }
          return (
            <div
              key={bi}
              className="w-full rounded-r-xl border-l-4 border-[#E8593A] bg-[#FFF5F3] px-5 py-4 text-left"
            >
              <p className="whitespace-pre-wrap text-[15px] italic leading-[1.85] text-[#2A2A2A]">
                {b.text}
              </p>
            </div>
          );
        }
        /* ── 불릿 목록 ── */
        if (b.kind === "ul") {
          const z3 = stepN === 3 ? step3ZoneBeforeBlock(blocks, bi) : null;
          if (z3) {
            return (
              <div key={bi} className="w-full text-left">
                <Step3ZoneUnifiedCard zone={z3} items={b.items} />
              </div>
            );
          }
          if (stepN === 1 || stepN === 2) {
            const sec = earlyStep12SectionKind(blocks, bi, stepN);
            if (sec === "list_aggregate") {
              const groups = groupStep12ListItems(b.items).filter((g) => g.body.trim());
              if (groups.length === 0) return null;
              if (stepN === 1) {
                return (
                  <div key={bi} className="w-full text-left">
                    <Step12DiagnosisUnifiedCard groups={groups} />
                  </div>
                );
              }
              return (
                <div key={bi} className="w-full space-y-2 text-left">
                  {groups.map((g, gi) => (
                    <div key={gi} className="w-full text-left">
                      <Step12TopicCard step={stepN} title={g.title} body={g.body} />
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div key={bi} className="w-full space-y-1.5 text-left">
                {b.items.map((item, ii) => (
                  <div key={ii} className="flex w-full items-start gap-3">
                    {enumBadgeSpan(listItemBadgeInSection(blocks, bi, ii))}
                    <Step12DetailCard
                      step={stepN as 1 | 2}
                      body=""
                      bodyContent={
                        <span className="whitespace-pre-wrap text-[15px] leading-[1.75] text-[#2A2A2A]">
                          {renderWithLeadDetail(item)}
                        </span>
                      }
                    />
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div key={bi} className="w-full space-y-1.5 text-left">
              {b.items.map((item, ii) => (
                <div
                  key={ii}
                  className="flex w-full items-start gap-3 rounded-xl border border-[rgba(0,0,0,0.05)] bg-white px-4 py-3 shadow-[0_1px_6px_-3px_rgba(0,0,0,0.07)]"
                >
                  {showEnumBadges ? (
                    enumBadgeSpan(badgeFor(bi, ii))
                  ) : (
                    <div
                      className="mt-[9px] h-2 w-2 shrink-0 rounded-full bg-[#E8593A]"
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      "min-w-0 flex-1 whitespace-pre-wrap leading-[1.75]",
                      variant === "solution"
                        ? "text-[16px] font-medium text-[#1A1A1A]"
                        : "text-[15px] text-[#2A2A2A]",
                    )}
                  >
                    {renderWithLeadDetail(item)}
                  </span>
                </div>
              ))}
            </div>
          );
        }
        /* ── 번호 목록 ── */
        if (b.kind === "ol") {
          const z3 = stepN === 3 ? step3ZoneBeforeBlock(blocks, bi) : null;
          if (z3) {
            return (
              <div key={bi} className="w-full text-left">
                <Step3ZoneUnifiedCard zone={z3} items={b.items} />
              </div>
            );
          }
          if (stepN === 1 || stepN === 2) {
            const sec = earlyStep12SectionKind(blocks, bi, stepN);
            if (sec === "list_aggregate") {
              const groups = groupStep12ListItems(b.items).filter((g) => g.body.trim());
              if (groups.length === 0) return null;
              if (stepN === 1) {
                return (
                  <div key={bi} className="w-full text-left">
                    <Step12DiagnosisUnifiedCard groups={groups} />
                  </div>
                );
              }
              return (
                <div key={bi} className="w-full space-y-2 text-left">
                  {groups.map((g, gi) => (
                    <div key={gi} className="w-full text-left">
                      <Step12TopicCard step={stepN} title={g.title} body={g.body} />
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div key={bi} className="w-full space-y-1.5 text-left">
                {b.items.map((item, ii) => (
                  <div
                    key={ii}
                    className="flex w-full items-start gap-3 rounded-xl border border-[rgba(0,0,0,0.05)] bg-white px-4 py-3 shadow-[0_1px_6px_-3px_rgba(0,0,0,0.07)]"
                  >
                    {enumBadgeSpan(listItemBadgeInSection(blocks, bi, ii))}
                    <span className="min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-[1.75] text-[#2A2A2A]">
                      {renderWithLeadDetail(item)}
                    </span>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div key={bi} className="w-full space-y-1.5 text-left">
              {b.items.map((item, ii) => (
                <div
                  key={ii}
                  className="flex w-full items-start gap-3 rounded-xl border border-[rgba(0,0,0,0.05)] bg-white px-4 py-3 shadow-[0_1px_6px_-3px_rgba(0,0,0,0.07)]"
                >
                  {showEnumBadges ? (
                    enumBadgeSpan(badgeFor(bi, ii))
                  ) : (
                    <div
                      className="mt-[9px] h-2 w-2 shrink-0 rounded-full bg-[#E8593A]"
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      "min-w-0 flex-1 whitespace-pre-wrap leading-[1.75]",
                      variant === "solution"
                        ? "text-[16px] font-medium text-[#1A1A1A]"
                        : "text-[15px] text-[#2A2A2A]",
                    )}
                  >
                    {renderWithLeadDetail(item)}
                  </span>
                </div>
              ))}
            </div>
          );
        }
        /* ── 일반 단락 ── */
        if (b.kind === "p") {
          if (stepN === 3) {
            const z3 = step3ZoneBeforeBlock(blocks, bi);
            const chunks = splitStep3ParagraphChunks(b.text);
            if (chunks.length > 1 || chunks.some((c) => c.title)) {
              const filled = chunks.filter((c) => c.body.trim());
              if (filled.length > 0) {
                return (
                  <div key={bi} className="w-full text-left">
                    <Step3ZoneUnifiedCard zone={z3} rows={filled} />
                  </div>
                );
              }
            }
            const one = chunks[0];
            if (one?.body.trim()) {
              return (
                <div key={bi} className="w-full text-left">
                  <Step3ZoneUnifiedCard zone={z3} rows={[{ title: one.title, body: one.body }]} />
                </div>
              );
            }
          }
          if (
            stepN === 2 ||
            (stepN === 1 && earlyStep12SectionKind(blocks, bi, stepN) === "target_purpose")
          ) {
            return <Step12DetailCard key={bi} step={stepN as 1 | 2} body={b.text} />;
          }
          if (variant === "solution") {
            return (
              <div
                key={bi}
                className="w-full rounded-xl border-2 border-[rgba(232,89,58,0.35)] bg-white px-6 py-5 text-left shadow-[0_6px_28px_-12px_rgba(232,89,58,0.3)]"
              >
                <p className="whitespace-pre-wrap text-[18px] font-semibold leading-[1.75] text-[#141414]">{b.text}</p>
              </div>
            );
          }
          return (
            <p key={bi} className="w-full whitespace-pre-wrap text-left text-[15px] leading-[1.85] text-[#2A2A2A]">
              {b.text}
            </p>
          );
        }
        return null;
      });

  if (variant === "solution") {
    return (
      <div className="w-full rounded-2xl border-2 border-[rgba(232,89,58,0.38)] bg-gradient-to-br from-[#FFF9F6] via-[#FFF5F0] to-[#FFEEE8] px-5 py-6 shadow-[0_8px_32px_-14px_rgba(232,89,58,0.28)] sm:px-7 sm:py-7">
        <div className="w-full space-y-4 text-left sm:space-y-5">{nodes}</div>
      </div>
    );
  }

  return <div className="w-full space-y-3 text-left">{nodes}</div>;
}

function stripLeadingH2Block(s: string): string {
  return s.replace(/^##\s+[^\n]+\n?/m, "").trim();
}

/** 서버 응답의 `##` 대제목 3구역 분할 실패 시 null → 통째 렌더 */
function partitionUnifiedReport(raw: string): { diagnosis: string; doDont: string; solutions: string } | null {
  const norm = raw.replace(/\r\n/g, "\n").trim();
  if (!norm) return null;
  const parts = norm.split(/\n(?=## )/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const diagnosis: string[] = [];
  const doDont: string[] = [];
  const solutions: string[] = [];
  const other: string[] = [];
  for (const p of parts) {
    const head = (p.split("\n")[0] ?? "").trim();
    if (/요청내용\s*분석|문제\s*진단/i.test(head)) diagnosis.push(p);
    else if (/Do\s*&\s*Don'?t|Do\s*\/\s*Don'?t/i.test(head)) doDont.push(p);
    else if (/Simply\s*U\+|솔루션/i.test(head)) solutions.push(p);
    else other.push(p);
  }
  for (const o of other) {
    if (!diagnosis.length) diagnosis.push(o);
    else if (!doDont.length) doDont.push(o);
    else solutions.push(o);
  }
  const d = diagnosis.join("\n\n").trim();
  const dd = doDont.join("\n\n").trim();
  const sol = solutions.join("\n\n").trim();
  if (!d || !dd || !sol) return null;
  return { diagnosis: d, doDont: dd, solutions: sol };
}

function SimplyHeartUnifiedResult({ text }: { text: string }): ReactNode {
  const display = stripSimplyHeartDisplayAsterisks(text);
  const parted = partitionUnifiedReport(display);
  if (!parted) {
    return <SimplyHeartEarlyStepsStructured text={display} />;
  }
  return (
    <div className="space-y-8">
      <div>
        <p className="mb-3 text-[12px] font-bold uppercase tracking-widest text-[#2563EB]">
          요청내용 분석 · 문제 진단
        </p>
        <SimplyHeartEarlyStepsStructured text={stripLeadingH2Block(parted.diagnosis)} step={1} />
      </div>
      <div className="border-t border-[rgba(0,0,0,0.08)] pt-8">
        <p className="mb-3 text-[12px] font-bold uppercase tracking-widest text-[#059669]">{"Do & Don't"}</p>
        <SimplyHeartEarlyStepsStructured text={stripLeadingH2Block(parted.doDont)} step={3} />
      </div>
      <div className="border-t border-[rgba(0,0,0,0.08)] pt-8">
        <p className="mb-3 text-[12px] font-bold uppercase tracking-widest text-[#E8593A]">Simply U+ 솔루션</p>
        <SimplyHeartEarlyStepsStructured text={stripLeadingH2Block(parted.solutions)} variant="solution" />
      </div>
    </div>
  );
}

type ImageSlot = { id: string; name: string; dataUrl: string };

type SimplyGuideMode = "generate" | "audit";

function buildSimplyHeartPromptText(
  department: string,
  topic: string,
  detail: string,
  mode: SimplyGuideMode,
): string {
  const dept = department.trim();
  const t = topic.trim();
  const d = detail.trim();
  const parts: string[] = [];
  if (mode === "audit") {
    parts.push("[작업 유형]\n검수 — 배포·확정 전 문구를 Simply U+·브랜드 관점에서 점검해 주세요.");
  } else {
    parts.push("[작업 유형]\n생성·초안 — 아래 내용을 바탕으로 가이드에 맞게 진단해 주세요.");
  }
  if (dept) parts.push(`[소속 부서]\n${dept}`);
  if (t) parts.push(`[확인 분야]\n${t}`);
  const detailKey = mode === "audit" ? "검수 내용" : "생성 내용";
  if (d) parts.push(`[${detailKey}]\n${d}`);
  return parts.join("\n\n");
}

export function SimplyHeart() {
  const [department, setDepartment] = useState("");
  const [fieldTopic, setFieldTopic] = useState("");
  const [guideMode, setGuideMode] = useState<SimplyGuideMode>("generate");
  const [fieldDetail, setFieldDetail] = useState("");
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [images, setImages] = useState<ImageSlot[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [pdfExporting, setPdfExporting] = useState(false);

  const promptText = buildSimplyHeartPromptText(department, fieldTopic, fieldDetail, guideMode);
  const canRun = promptText.length > 0 || Boolean(pdfDataUrl) || images.length > 0;

  const clearAll = useCallback(() => {
    setDepartment("");
    setFieldTopic("");
    setGuideMode("generate");
    setFieldDetail("");
    setPdfDataUrl(null);
    setPdfName(null);
    setImages([]);
    setReport(null);
    setRunError(null);
    setAnalyzing(false);
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
      });
      setReport(out);
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

      <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
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
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6B6B6B]">
              텍스트를 주 입력으로 하고, 시안·배너 이미지(PNG/JPG) 또는 기획 PDF를 함께 올리면 멀티모달로 분석합니다. 한 번에 요청 진단, Do &amp; Don&apos;t,{" "}
              <strong className="font-semibold text-[#2A2A2A]">Simply U+ 솔루션</strong>을 확인할 수 있습니다.
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
                onClick={() => {
                  setGuideMode("generate");
                  setRunError(null);
                }}
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
                onClick={() => {
                  setGuideMode("audit");
                  setRunError(null);
                }}
              >
                검수
              </Button>
            </div>
          </div>

          <div className="mb-4">
            <p className="mb-1.5 text-[18px] font-semibold text-[#1A1A1A]">1. 소속 부서</p>
            <p className="mb-3 text-[13px] leading-relaxed text-[#6B6B6B]">
              Simply U+ 가이드 기준 부서(추진·협력 주체)를 선택합니다. 분석 맥락에 포함됩니다.
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="소속 부서">
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

          <div className="mb-4">
            <label htmlFor="simply-field-topic" className="mb-1.5 block text-[18px] font-semibold text-[#1A1A1A]">
              2. 확인 분야
            </label>
            <p className="mb-3 text-[13px] leading-relaxed text-[#6B6B6B]">
              점검할 업무·채널·자료 유형을 한 줄로 적어 주세요. (예: 요금 문자, 사내 공지, 배너 카피)
            </p>
            <input
              id="simply-field-topic"
              type="text"
              value={fieldTopic}
              onChange={(e) => setFieldTopic(e.target.value)}
              placeholder="예) 대고객 MMS 요금 안내, 인트라넷 점검 공지, 앱 결제 오류 토스트"
              className="h-12 w-full rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 text-[15px] leading-normal text-[#1A1A1A] outline-none ring-[#FF7F66]/20 placeholder:text-[15px] placeholder:text-[#9A9A9A] focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="simply-field-detail" className="mb-1.5 block text-[18px] font-semibold text-[#1A1A1A]">
              {guideMode === "audit" ? "3. 검수 내용" : "3. 생성 내용"}
            </label>
            <textarea
              id="simply-field-detail"
              value={fieldDetail}
              onChange={(e) => setFieldDetail(e.target.value)}
              rows={7}
              placeholder={
                guideMode === "audit"
                  ? "검수할 카피, 공지, 문자·앱 문구, 기획안 텍스트 등을 붙여 넣어 주세요…"
                  : "작성 중인 요금 안내, 카피, 공지, 기획 초안 등을 자유롭게 입력…"
              }
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
              disabled={!canRun || analyzing}
              className="brand-btn-primary brand-btn-simply-guide-analyze h-14 w-full font-semibold disabled:pointer-events-none disabled:opacity-45"
              onClick={() => void runPipeline()}
            >
              {analyzing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                  통합 분석 중…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" aria-hidden />
                  분석 실행
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
            cardBase,
            "overflow-hidden",
            report ? "border-[rgba(232,89,58,0.22)] shadow-[0_8px_40px_-12px_rgba(232,89,58,0.15)]" : null,
          )}
        >
          <div className="h-[3px] w-full bg-[#FF7F66]" aria-hidden />
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[rgba(0,0,0,0.06)] px-6 py-5">
            <div className="min-w-0">
              <h2 className="text-[19px] font-bold tracking-tight text-[#0F0F0F]">분석 결과</h2>
              <p className="mt-1 text-[13px] text-[#6B6B6B]">
                요청내용 분석 → Do &amp; Don&apos;t → Simply U+ 솔루션
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full border-[rgba(0,0,0,0.12)] text-[14px]"
              disabled={!report || pdfExporting}
              onClick={() => void downloadPdf()}
            >
              {pdfExporting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="mr-1.5 h-4 w-4" aria-hidden />
              )}
              PDF 리포트 다운로드
            </Button>
          </div>
          {analyzing ? (
            <div className="flex items-center justify-center gap-3 px-6 py-16">
              <Loader2 className="h-6 w-6 shrink-0 animate-spin text-[#6B6B6B]" aria-hidden />
              <p className="text-[15px] text-[#6B6B6B]">AI 통합 분석 중입니다…</p>
            </div>
          ) : report ? (
            <div className="px-6 py-6">
              <SimplyHeartUnifiedResult text={report} />
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
