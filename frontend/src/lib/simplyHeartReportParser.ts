/** AI 통합 분석 마크다운 → 결과 화면 구조 데이터 */

export type SimplyHeartProblemColor = "orange" | "teal" | "purple" | "magenta";

export type SimplyHeartProblem = {
  title: string;
  body: string;
  color: SimplyHeartProblemColor;
};

export type SimplyHeartSolutionBlock = {
  title: string;
  items: { label: string; value: string }[];
};

export type SimplyHeartReflection = {
  tag: string;
  desc: string;
  color: string;
};

export type SimplyHeartReport = {
  target: string;
  purpose: string;
  problems: SimplyHeartProblem[];
  dos: string[];
  donts: string[];
  solutionCopyText: string;
  solutionBlocks: SimplyHeartSolutionBlock[];
  reflections: SimplyHeartReflection[];
};

const PROBLEM_COLORS: SimplyHeartProblemColor[] = ["orange", "teal", "purple", "magenta"];

const REFLECTION_TAG_COLORS: Record<string, string> = {
  blue: "bg-[rgba(37,99,235,0.12)] text-[#1D4ED8]",
  indigo: "bg-[rgba(79,70,229,0.12)] text-[#4338CA]",
  orange: "bg-[rgba(232,89,58,0.12)] text-[#C14D38]",
  teal: "bg-[rgba(20,184,166,0.12)] text-[#0F766E]",
  purple: "bg-[rgba(124,58,237,0.12)] text-[#6D28D9]",
  green: "bg-[rgba(5,150,105,0.12)] text-[#047857]",
  magenta: "bg-[rgba(255,127,102,0.16)] text-[#C14D38]",
};

export function stripSimplyHeartDisplayAsterisks(s: string): string {
  let t = String(s)
    .replace(/\u200b|\uFEFF/g, "")
    .replace(/\u00A0/g, " ");
  t = t.replace(/[\*\uFF0A]/g, "");
  t = t
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

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
  const d = stripLeadingH2(diagnosis.join("\n\n"));
  const dd = stripLeadingH2(doDont.join("\n\n"));
  const sol = stripLeadingH2(solutions.join("\n\n"));
  if (!d && !dd && !sol) return null;
  return { diagnosis: d, doDont: dd, solutions: sol };
}

function stripLeadingH2(s: string): string {
  return s.replace(/^##\s+[^\n]+\n?/m, "").trim();
}

function extractH3Section(text: string, headingRe: RegExp, excludeRe?: RegExp): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let capturing = false;
  const buf: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^##\s/.test(t)) {
      if (capturing) break;
      continue;
    }
    if (/^###\s/.test(t)) {
      const h = t.slice(4).trim();
      if (excludeRe?.test(h)) {
        if (capturing) break;
        continue;
      }
      if (headingRe.test(h)) {
        capturing = true;
        continue;
      }
      if (capturing) break;
      continue;
    }
    if (capturing) buf.push(line);
  }
  return buf.join("\n").trim();
}

function parseBulletItems(text: string): string[] {
  const items: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const m = /^[-•*]\s+(.+)$/.exec(t);
    if (m) items.push(m[1]!.trim());
    else if (items.length === 0 && !/^###\s/.test(t)) items.push(t);
  }
  return items.filter(Boolean);
}

function parseNumberedProblems(text: string): SimplyHeartProblem[] {
  const problems: SimplyHeartProblem[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = /^([1-9]\d{0,2})[.)]\s*(.+)$/.exec(line);
    if (!m) continue;
    const rest = m[2]!.trim();
    const colonIdx = rest.search(/[:：]/);
    let title = rest;
    let body = "";
    if (colonIdx > 0 && colonIdx <= 80) {
      title = rest.slice(0, colonIdx).trim();
      body = rest.slice(colonIdx + 1).trim();
    }
    problems.push({
      title,
      body: body || rest,
      color: PROBLEM_COLORS[problems.length % PROBLEM_COLORS.length]!,
    });
  }
  if (problems.length === 0 && text.trim()) {
    for (const item of parseBulletItems(text)) {
      const colonIdx = item.search(/[:：]/);
      if (colonIdx > 0 && colonIdx <= 80) {
        problems.push({
          title: item.slice(0, colonIdx).trim(),
          body: item.slice(colonIdx + 1).trim(),
          color: PROBLEM_COLORS[problems.length % PROBLEM_COLORS.length]!,
        });
      } else {
        problems.push({
          title: `진단 ${problems.length + 1}`,
          body: item,
          color: PROBLEM_COLORS[problems.length % PROBLEM_COLORS.length]!,
        });
      }
    }
  }
  return problems;
}

function parseDoDontSection(text: string): { dos: string[]; donts: string[] } {
  const doText = extractH3Section(text, /^do(\b|\s|$|\()/i, /don'?t/i);
  const dontText = extractH3Section(text, /don'?t|하지\s*말/i);
  return {
    dos: parseBulletItems(doText),
    donts: parseBulletItems(dontText),
  };
}

function stripMarkdownInline(s: string): string {
  return s
    .replace(/^>\s+/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\*\*([^*]+)\*\*/gm, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function parseSolutionBlocks(text: string): SimplyHeartSolutionBlock[] {
  const blocks: SimplyHeartSolutionBlock[] = [];
  const chunks = text.split(/\n(?=###\s)/).map((c) => c.trim()).filter(Boolean);
  const sources = chunks.length > 1 ? chunks : [text];

  for (const chunk of sources) {
    const lines = chunk.split("\n");
    let title = "";
    const items: { label: string; value: string }[] = [];
    const bodyLines: string[] = [];

    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (/^###\s/.test(t)) {
        title = t.slice(4).trim();
        if (/^simply\s*u\+\s*솔루션$/i.test(title)) title = "";
        continue;
      }
      const kv = /^([^:：]{1,24})[:：]\s*(.+)$/.exec(t);
      if (kv) {
        items.push({ label: kv[1]!.trim(), value: kv[2]!.trim() });
      } else if (/^[-•*]\s+/.test(t)) {
        bodyLines.push(t.replace(/^[-•*]\s+/, "").trim());
      } else {
        bodyLines.push(t);
      }
    }

    if (title || items.length > 0) {
      blocks.push({ title: title || "Simply U+ 솔루션", items });
    } else if (bodyLines.length > 0) {
      blocks.push({ title: bodyLines[0] ?? "", items: [], });
    }
  }

  return blocks.filter((b) => b.title || b.items.length > 0);
}

function looksLikeAnalysisMetaLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  const body = t.replace(/^[-•*]\s+/, "").trim();
  if (/^[-•*]\s*\[/.test(t)) return true;
  if (/^[-•*]\s*(?:입력|선택|반영|적용|가이드|분석|도출|구성|녹였|반영하여|반영해|맞게\s*작성)/i.test(t)) return true;
  if (/^(?:\[)?(?:카테고리|타겟|목적|생성\s*개요|확인\s*분야)\s*반영/i.test(body)) return true;
  if (/반영했습니다|적용했습니다|구성했습니다|도출했습니다|맞게\s*작성/i.test(body) && body.length < 120) return true;
  return false;
}

/** 생성 모드: ### Simply U+ 솔루션 구역에서 모범 답안(완성 문구)만 추출 */
function extractGenerateModelAnswer(solutionSection: string): string {
  let body =
    extractH3Section(solutionSection, /^simply\s*u\+|솔루션|완성|모범/i, /반영\s*항목|작문\s*근거|반영\s*상세/i) ||
    solutionSection.replace(/###\s*반영[\s\S]*/i, "").trim();
  body = body.replace(/^##\s+[^\n]+\n?/m, "").replace(/^###\s+Simply\s*U\+[^\n]*\n?/im, "").trim();

  const quoteLines = body
    .split("\n")
    .filter((l) => /^>\s?/.test(l.trim()))
    .map((l) => l.trim().replace(/^>\s?/, ""));
  const quoted = quoteLines.join("\n").trim();
  if (quoted.length >= 20) return stripMarkdownInline(quoted);

  const kept: string[] = [];
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t) {
      if (kept.length > 0 && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }
    if (/^#{1,6}\s/.test(t)) break;
    if (looksLikeAnalysisMetaLine(t)) continue;
    kept.push(t.replace(/^[-•*]\s+/, ""));
  }

  let out = stripMarkdownInline(
    kept
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );

  if (out.length < 20) {
    const fallback = stripMarkdownInline(body.replace(/^[-•*]\s+\[[^\]]+\][:：]\s*.+$/gm, "").trim());
    if (fallback.length > out.length) out = fallback;
  }

  return out;
}

function buildSolutionCopyText(text: string, blocks: SimplyHeartSolutionBlock[]): string {
  if (blocks.length > 0) {
    return blocks
      .map((b) => {
        const parts: string[] = [];
        if (b.title) parts.push(b.title);
        for (const it of b.items) parts.push(`${it.label}: ${it.value}`);
        return parts.join("\n");
      })
      .join("\n\n")
      .trim();
  }
  return stripMarkdownInline(text);
}

function parseReflections(text: string): SimplyHeartReflection[] {
  const section = extractH3Section(text, /반영\s*항목|작문\s*근거|반영\s*상세/i);
  if (!section.trim()) return [];

  const items: SimplyHeartReflection[] = [];
  const chunks = section.split(/\n(?=[-•*]\s+)/).map((c) => c.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const first = lines[0]!.replace(/^[-•*]\s+/, "");
    const tagMatch = /^\[?([^\]:：]+)\]?[:：]?\s*(.*)$/.exec(first);
    if (tagMatch) {
      const tag = tagMatch[1]!.trim();
      const rest = [tagMatch[2]!.trim(), ...lines.slice(1)].filter(Boolean).join(" ");
      const colorKey = /카테고리/i.test(tag)
        ? "magenta"
        : /타겟/i.test(tag)
        ? "blue"
        : /목적/i.test(tag)
          ? "indigo"
          : /개요/i.test(tag)
            ? "teal"
            : /수식/i.test(tag)
              ? "orange"
              : /조건|투명/i.test(tag)
                ? "teal"
                : /책임|강압/i.test(tag)
                  ? "purple"
                  : /do/i.test(tag)
                    ? "green"
                    : "magenta";
      items.push({ tag, desc: rest, color: colorKey });
    }
  }
  return items;
}

function inferReflections(
  report: Omit<SimplyHeartReport, "reflections">,
  ctx: SimplyHeartParseContext,
): SimplyHeartReflection[] {
  const out: SimplyHeartReflection[] = [];
  if (ctx.category?.trim()) {
    out.push({
      tag: "카테고리 반영",
      desc: `선택하신 카테고리(${ctx.category.trim()}) 관점에 맞는 톤과 가이드 기준을 적용했습니다.`,
      color: "magenta",
    });
  }
  if (ctx.fieldTopic?.trim() && !report.purpose.trim()) {
    out.push({
      tag: "확인 분야 반영",
      desc: `입력하신 확인 분야(${ctx.fieldTopic.trim()}) 맥락에 맞게 분석·솔루션을 구성했습니다.`,
      color: "indigo",
    });
  }
  if (report.target.trim()) {
    out.push({
      tag: "예상 타겟 반영",
      desc: "분석된 타겟 맥락에 맞는 안내 어조와 메시지 톤을 적용했습니다.",
      color: "blue",
    });
  }
  if (report.purpose.trim()) {
    out.push({
      tag: "목적 반영",
      desc: "고객 행동 유도와 혜택 전달 목적에 맞게 핵심 정보를 구조화했습니다.",
      color: "indigo",
    });
  }
  for (let i = 0; i < Math.min(report.problems.length, 3); i++) {
    const p = report.problems[i]!;
    out.push({
      tag: `문제 진단 반영 — ${p.title}`,
      desc: p.body,
      color: p.color === "magenta" ? "magenta" : p.color,
    });
  }
  if (report.dos.length > 0) {
    out.push({
      tag: "DO 원칙 반영",
      desc: report.dos[0]!,
      color: "green",
    });
  }
  return out;
}

function inferGenerateReflections(ctx: SimplyHeartParseContext): SimplyHeartReflection[] {
  const out: SimplyHeartReflection[] = [];
  if (ctx.category?.trim()) {
    out.push({
      tag: "카테고리 반영",
      desc: `선택하신 카테고리(${ctx.category.trim()})에 맞는 채널·조직 맥락과 가이드 기준을 반영했습니다.`,
      color: "magenta",
    });
  }
  if (ctx.userTarget?.trim()) {
    out.push({
      tag: "타겟 반영",
      desc: `입력하신 타겟(${ctx.userTarget.trim()})에 맞는 어조와 정보 구조를 적용했습니다.`,
      color: "blue",
    });
  }
  if (ctx.fieldTopic?.trim()) {
    out.push({
      tag: "목적 반영",
      desc: `입력하신 목적(${ctx.fieldTopic.trim()})에 맞게 메시지 구조와 핵심 포인트를 구성했습니다.`,
      color: "indigo",
    });
  }
  if (ctx.fieldDetail?.trim()) {
    out.push({
      tag: "생성 개요 반영",
      desc: `입력하신 생성 개요(${ctx.fieldDetail.trim()})의 방향과 핵심 정보를 솔루션에 담았습니다.`,
      color: "teal",
    });
  }
  out.push({
    tag: "가이드 원칙 반영",
    desc: "Simply U+ 가이드의 심플·고객 중심 원칙에 맞게 핵심만 전달하도록 작성했습니다.",
    color: "green",
  });
  return out;
}

export type SimplyHeartParseContext = {
  mode?: "audit" | "generate";
  category?: string;
  userTarget?: string;
  fieldTopic?: string;
  fieldDetail?: string;
};

export function parseSimplyHeartReport(raw: string, ctx: SimplyHeartParseContext = {}): SimplyHeartReport {
  const mode = ctx.mode ?? "audit";
  const display = stripSimplyHeartDisplayAsterisks(raw);
  const parted = partitionUnifiedReport(display);

  const diagnosis = parted?.diagnosis ?? (mode === "generate" ? "" : display);
  const doDont = parted?.doDont ?? "";
  const solutions = parted?.solutions ?? (mode === "generate" ? display : "");

  const target = extractH3Section(diagnosis, /예상\s*타겟|타겟|세그/i) || extractH3Section(diagnosis, /target/i);
  const purpose = extractH3Section(diagnosis, /목적|purpose/i);
  const problemText =
    extractH3Section(diagnosis, /문제\s*진단|부담\s*진단|진단/) ||
    diagnosis.replace(/###\s*[^\n]+\n/g, "").trim();

  const { dos, donts } = doDont ? parseDoDontSection(doDont) : { dos: [] as string[], donts: [] as string[] };

  const solutionSection = solutions || extractH3Section(display, /simply\s*u\+|솔루션|교정/i);

  let solutionCopyText: string;
  let solutionBlocks: SimplyHeartSolutionBlock[];

  if (mode === "generate") {
    solutionCopyText = extractGenerateModelAnswer(solutionSection || display);
    solutionBlocks = [];
  } else {
    const solutionBody =
      extractH3Section(solutionSection, /^simply\s*u\+|솔루션|교정/i, /반영\s*항목|작문\s*근거|반영\s*상세/i) ||
      solutionSection.replace(/###\s*반영[\s\S]*/i, "").trim();
    solutionBlocks = parseSolutionBlocks(solutionBody);
    solutionCopyText = buildSolutionCopyText(solutionBody, solutionBlocks) || stripMarkdownInline(solutionBody);
  }

  const base = {
    target: stripMarkdownInline(target),
    purpose: stripMarkdownInline(purpose),
    problems: mode === "generate" ? [] : parseNumberedProblems(problemText),
    dos: mode === "generate" ? [] : dos,
    donts: mode === "generate" ? [] : donts,
    solutionCopyText,
    solutionBlocks,
    reflections: [] as SimplyHeartReflection[],
  };

  const parsedReflections = parseReflections(solutionSection || display);
  if (parsedReflections.length > 0) {
    base.reflections = parsedReflections;
  } else if (mode === "generate") {
    base.reflections = inferGenerateReflections(ctx);
  } else {
    base.reflections = inferReflections(base, ctx);
  }

  return base;
}

export function reflectionTagClass(color: string): string {
  return REFLECTION_TAG_COLORS[color] ?? REFLECTION_TAG_COLORS.magenta!;
}

export const PROBLEM_COLOR_STYLES: Record<
  SimplyHeartProblemColor,
  { bg: string; border: string; title: string }
> = {
  orange: {
    bg: "bg-[rgba(232,89,58,0.06)]",
    border: "border-[rgba(232,89,58,0.22)]",
    title: "text-[#C14D38]",
  },
  teal: {
    bg: "bg-[rgba(20,184,166,0.06)]",
    border: "border-[rgba(20,184,166,0.22)]",
    title: "text-[#0F766E]",
  },
  purple: {
    bg: "bg-[rgba(124,58,237,0.06)]",
    border: "border-[rgba(124,58,237,0.22)]",
    title: "text-[#6D28D9]",
  },
  magenta: {
    bg: "bg-[rgba(255,127,102,0.08)]",
    border: "border-[rgba(255,127,102,0.28)]",
    title: "text-[#C14D38]",
  },
};
