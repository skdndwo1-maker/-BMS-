import { jsPDF } from "jspdf";
import { normalizeNamingProposal, type BrandNamingRunResult, type BrandNamingProposal } from "./guidelineApi";

export type ExportFormat = "pdf" | "png" | "jpeg";

/** 리포트 캔버스·jsPDF 텍스트 렌더링용 (브라우저 TTF 임베딩 없이 한글 표시) */
const REPORT_FONT_CSS = `"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif`;

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function ensureKoreanReportFontsLoaded(fontSize: number): Promise<void> {
  try {
    await document.fonts.load(`400 ${fontSize}px "Noto Sans KR"`);
  } catch {
    /* ignore */
  }
  await document.fonts.ready;
}

/** 한 줄씩 글자 단위로 줄바꿈 (한글·영문 혼합) */
function wrapTextCanvas(ctx: CanvasRenderingContext2D, paragraph: string, maxWidth: number): string[] {
  if (!paragraph.trim()) return [""];
  const lines: string[] = [];
  let current = "";
  for (const ch of paragraph) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * jsPDF 기본 폰트는 한글 미지원 → 리포트 본문은 캔버스에 한글 폰트로 그린 뒤 이미지로 페이지에 넣습니다.
 */
async function buildPlainTextReportCanvas(plain: string): Promise<HTMLCanvasElement> {
  const fontSize = 13;
  await ensureKoreanReportFontsLoaded(fontSize);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_2d_unavailable");

  const padding = 40;
  const maxTextW = 720;
  const lineHeight = Math.round(fontSize * 1.45);
  ctx.font = `${fontSize}px ${REPORT_FONT_CSS}`;

  const allLines: string[] = [];
  for (const para of plain.split("\n")) {
    if (para === "") {
      allLines.push("");
      continue;
    }
    allLines.push(...wrapTextCanvas(ctx, para, maxTextW));
  }
  const textH = allLines.length * lineHeight + padding * 2;
  canvas.width = maxTextW + padding * 2;
  canvas.height = Math.max(400, textH);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111827";
  ctx.font = `${fontSize}px ${REPORT_FONT_CSS}`;
  let y = padding + fontSize;
  for (const line of allLines) {
    ctx.fillText(line, padding, y);
    y += lineHeight;
  }
  return canvas;
}

/** 긴 캔버스를 A4 높이에 맞춰 여러 페이지로 나눕니다. */
function addCanvasToPdfPages(doc: jsPDF, canvas: HTMLCanvasElement, margin: number): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;
  const scale = contentW / canvas.width;
  const totalHpt = canvas.height * scale;

  if (totalHpt <= contentH + 0.5) {
    const img = canvas.toDataURL("image/png");
    doc.addImage(img, "PNG", margin, margin, contentW, totalHpt);
    return;
  }

  let srcY = 0;
  let first = true;
  const slicePxTarget = contentH / scale;

  while (srcY < canvas.height) {
    const slicePx = Math.min(canvas.height - srcY, slicePxTarget);
    const sub = document.createElement("canvas");
    sub.width = canvas.width;
    sub.height = Math.max(1, Math.ceil(slicePx));
    const sx = sub.getContext("2d");
    if (!sx) return;
    sx.drawImage(canvas, 0, srcY, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
    const hPt = slicePx * scale;
    if (!first) doc.addPage();
    doc.addImage(sub.toDataURL("image/png"), "PNG", margin, margin, contentW, hPt);
    srcY += slicePx;
    first = false;
  }
}

function buildReportPlainText(opts: {
  brandScore: number;
  overallSummary: string | null;
  violations: Array<{ category: string; issue: string; severity: string }>;
}): string {
  const lines: string[] = [
    "U+ AI 브랜드 Agent — 브랜드 디자인 검수 리포트",
    `생성 시각: ${new Date().toLocaleString("ko-KR")}`,
    "",
    `브랜드 적합성 점수: ${opts.brandScore} / 100`,
    "",
    "■ AI 종합 평가",
    opts.overallSummary?.trim() || "(없음)",
    "",
    "■ 위반 사항",
  ];
  if (opts.violations.length === 0) {
    lines.push("(위반 없음)");
  } else {
    opts.violations.forEach((v, i) => {
      lines.push(`${i + 1}. [${v.severity}] ${v.category}: ${v.issue}`);
    });
  }
  return lines.join("\n");
}

export async function downloadInspectionReport(
  opts: {
    brandScore: number;
    overallSummary: string | null;
    violations: Array<{ category: string; issue: string; severity: string }>;
  },
  format: ExportFormat
): Promise<void> {
  const plain = buildReportPlainText(opts);
  const stamp = Date.now();

  if (format === "pdf") {
    const canvas = await buildPlainTextReportCanvas(plain);
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    addCanvasToPdfPages(doc, canvas, margin);
    doc.save(`uplus-brand-inspection-report-${stamp}.pdf`);
    return;
  }

  const canvas = await buildPlainTextReportCanvas(plain);

  if (format === "jpeg") {
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        triggerBlobDownload(blob, `uplus-brand-inspection-report-${stamp}.jpg`);
      },
      "image/jpeg",
      0.92
    );
  } else {
    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerBlobDownload(blob, `uplus-brand-inspection-report-${stamp}.png`);
    }, "image/png");
  }
}

export function downloadRevisedImageInFormat(dataUrl: string, format: ExportFormat): void {
  const stamp = Date.now();
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);

    if (format === "png") {
      canvas.toBlob((blob) => blob && triggerBlobDownload(blob, `uplus-brand-revised-${stamp}.png`), "image/png");
      return;
    }
    if (format === "jpeg") {
      canvas.toBlob(
        (blob) => blob && triggerBlobDownload(blob, `uplus-brand-revised-${stamp}.jpg`),
        "image/jpeg",
        0.92
      );
      return;
    }

    const orientation = w >= h ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgData = canvas.toDataURL("image/png");
    const ratio = Math.min(pageW / w, pageH / h) * 0.92;
    const dw = w * ratio;
    const dh = h * ratio;
    const ox = (pageW - dw) / 2;
    const oy = (pageH - dh) / 2;
    pdf.addImage(imgData, "PNG", ox, oy, dw, dh);
    pdf.save(`uplus-brand-revised-${stamp}.pdf`);
  };
  img.onerror = () => {
    /* ignore */
  };
  img.src = dataUrl;
}

/** UI와 동일: 70점 이상 PASS */
function passFailFromScore(score: number): "PASS" | "FAIL" {
  const v = Number.isFinite(score) ? score : 0;
  return v >= 70 ? "PASS" : "FAIL";
}

function weightedOverallFromProposal(p: BrandNamingProposal): number {
  const c = (n: unknown) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
  const sum =
    c(p.hierarchyScore) +
    c(p.legalityScore) +
    c(p.originalityDimensionScore) +
    c(p.pronunciationScore) +
    c(p.publicAppealScore) +
    c(p.scalabilityScore);
  return Math.min(100, Math.max(0, Math.round(sum / 6)));
}

function appendBrandNamingAnalysisTail(lines: string[], r: BrandNamingRunResult): void {
  lines.push("■ 브랜드 계층 정렬", `상태: ${r.hierarchy.status}`, r.hierarchy.message, r.hierarchy.details);
  r.hierarchy.checklist.forEach((t) => lines.push(`· ${t}`));
  lines.push("", "■ 적법성·저작권 보조", `참고 점수: ${r.copyright.originality}%`, r.copyright.verdict);
  r.copyright.risks.forEach((x) => lines.push(`· [${x.severity}] ${x.type}: ${x.description}`));
  lines.push("", "■ 창의성 (Gemini 추론)", `위험도: ${r.trademark.risk}`, r.trademark.recommendation);
  r.trademark.conflicts.forEach((c) => lines.push(`· ${c.name} (${c.class}) — 유사도 ${c.similarity}%`));
  const dl = r.detailLogic;
  if (dl) {
    lines.push(
      "",
      "■ 상세 논리 (항목별)",
      "[브랜드 계층 정렬]",
      dl.hierarchy || "(없음)",
      "",
      "[적법성]",
      dl.legality || "(없음)",
      "",
      "[창의성]",
      dl.originality || "(없음)",
      "",
      "[직관성]",
      dl.pronunciationLanguage || "(없음)",
      "",
      "[대중성]",
      dl.publicAppeal || "(없음)",
      "",
      "[확장성]",
      dl.scalability || "(없음)"
    );
  }
  lines.push("", "■ 최종 요약", r.finalSummary, "", `권고: ${r.goRecommendation === "go" ? "GO" : "NO-GO"}`);
}

function buildBrandNamingPlainText(opts: {
  mode: "generate" | "audit";
  result: BrandNamingRunResult;
  requestText: string;
  referenceText: string;
}): string {
  const lines: string[] = [];
  const title =
    opts.mode === "generate"
      ? "U+ AI 브랜드 Agent — 브랜드 네이밍 생성 리포트"
      : "U+ AI 브랜드 Agent — 브랜드 네이밍 검수 리포트";
  lines.push(title, `생성 시각: ${new Date().toLocaleString("ko-KR")}`, "", "■ 요청 내용", opts.requestText.trim() || "(없음)", "");
  const ref = opts.referenceText.trim();
  if (ref) {
    lines.push("■ 참고 자료", ref, "");
  }

  if (opts.mode === "generate") {
    const gm = opts.result.generateMeta;
    const propN = (opts.result.namingProposals ?? []).length;
    const tierAlts = opts.result.tierNamingAlternatives;
    const stepCount =
      gm?.tierStepCount ?? (tierAlts?.[0]?.tierSteps?.length ? tierAlts[0].tierSteps.length : propN);

    if (gm?.style === "tiered" && tierAlts && tierAlts.length > 0) {
      lines.push(
        `■ AI 네이밍 제안 (단계별 ${stepCount}단계 × 대안 4패키지)`,
        "한 번의 생성마다 서로 다른 세계관·스토리라인을 가진 패키지 대안이 네 가지 제시됩니다. 각 대안마다 아래에 스토리라인, 단계별 네이밍, 패키지 통합 6대 평가가 포함됩니다. 창의성 근거에는 스토리라인과 각 단계 네이밍의 연결이 서술됩니다.",
        ""
      );
      tierAlts.forEach((alt, i) => {
        const tp = alt.tierPackageEvaluation;
        const tpd = tp.proposalDetailLogic;
        const pkgAsProposal = normalizeNamingProposal({
          name: `대안 ${i + 1}`,
          rationale: alt.storyline,
          hierarchyScore: tp.hierarchyScore,
          originalityDimensionScore: tp.originalityDimensionScore,
          pronunciationScore: tp.pronunciationScore,
          legalityScore: tp.legalityScore,
          publicAppealScore: tp.publicAppealScore,
          scalabilityScore: tp.scalabilityScore,
          proposalDetailLogic: tpd
        });
        const pkgOverall = weightedOverallFromProposal(pkgAsProposal);
        lines.push(
          `═══ 대안 패키지 ${i + 1} / 4 ═══`,
          "[세계관·스토리라인]",
          alt.storyline || "(없음)",
          "",
          "[단계별 네이밍]"
        );
        alt.tierSteps.forEach((row, j) => {
          const userLb = gm?.tierLabels?.[j]?.trim();
          const labelPart = userLb || row.tierLabel || `단계 ${j + 1}`;
          lines.push(`· ${labelPart}: ${row.name}`, `  근거: ${row.rationale.trim() || "(없음)"}`, "");
        });
        lines.push(
          "【패키지 통합 평가】",
          `종합 점수: ${pkgOverall} / 100 (브랜드계층·적법·창의·직관·대중·확장 6항목 각 1/6 평균)`,
          `① 브랜드 계층 정렬 — Pass/Fail: ${passFailFromScore(tp.hierarchyScore)} (점수 ${tp.hierarchyScore}/100 · 종합 1/6 · 70↓ NO-GO)`,
          `② 적법성 — Pass/Fail: ${passFailFromScore(tp.legalityScore)} (점수 ${tp.legalityScore}/100 · 종합 1/6 · 70↓ NO-GO)`,
          `③ 창의성 — ${tp.originalityDimensionScore} / 100 (종합 1/6 · 스토리라인·단계명 연계는 아래 창의성 근거)`,
          `④ 직관성 — ${tp.pronunciationScore} / 100 (종합 1/6)`,
          `⑤ 대중성 — ${tp.publicAppealScore ?? "—"} / 100 (종합 1/6)`,
          `⑥ 확장성 — ${tp.scalabilityScore ?? "—"} / 100 (종합 1/6)`,
          "",
          "[브랜드 계층 정렬 근거 — 패키지]",
          tpd.hierarchy || "(없음)",
          "",
          "[적법성 근거 — 패키지]",
          tpd.legality || "(없음)",
          "",
          "[창의성 근거 — 패키지 · 스토리라인·단계 네이밍 연계]",
          tpd.originality || "(없음)",
          "",
          "[직관성 근거 — 패키지]",
          tpd.pronunciationLanguage || "(없음)",
          "",
          "[대중성 근거 — 패키지]",
          tpd.publicAppeal || "(없음)",
          "",
          "[확장성 근거 — 패키지]",
          tpd.scalability || "(없음)",
          ""
        );
      });
    } else {
      const genHead =
        gm?.style === "tiered"
          ? `■ AI 네이밍 제안 (단계별 ${gm.tierStepCount ?? propN}단계 라인업)`
          : "■ AI 네이밍 제안 (4안)";
      lines.push(genHead);
      const props = opts.result.namingProposals ?? [];
      const tp = opts.result.tierPackageEvaluation;
      const tieredPack = gm?.style === "tiered" && tp;

      if (props.length > 0 && tieredPack) {
        const pkg = normalizeNamingProposal({
          name: "(단계별 패키지)",
          rationale: "",
          hierarchyScore: tp.hierarchyScore,
          originalityDimensionScore: tp.originalityDimensionScore,
          pronunciationScore: tp.pronunciationScore,
          legalityScore: tp.legalityScore,
          publicAppealScore: tp.publicAppealScore,
          scalabilityScore: tp.scalabilityScore,
          proposalDetailLogic: tp.proposalDetailLogic
        });
        const pkgOverall = weightedOverallFromProposal(pkg);
        lines.push(
          "【패키지 통합 평가 — 전 단계 네이밍을 한 세트로 평가】",
          `종합 점수: ${pkgOverall} / 100 (6항목 각 1/6 평균)`,
          `① 브랜드 계층 정렬 — Pass/Fail: ${passFailFromScore(tp.hierarchyScore)} (점수 ${tp.hierarchyScore}/100 · 종합 1/6 · 70↓ NO-GO)`,
          `② 적법성 — Pass/Fail: ${passFailFromScore(tp.legalityScore)} (점수 ${tp.legalityScore}/100 · 종합 1/6 · 70↓ NO-GO)`,
          `③ 창의성 — ${tp.originalityDimensionScore} / 100 (종합 1/6)`,
          `④ 직관성 — ${tp.pronunciationScore} / 100 (종합 1/6)`,
          `⑤ 대중성 — ${tp.publicAppealScore ?? "—"} / 100 (종합 1/6)`,
          `⑥ 확장성 — ${tp.scalabilityScore ?? "—"} / 100 (종합 1/6)`,
          ""
        );
        const tpd = tp.proposalDetailLogic;
        lines.push(
          "[브랜드 계층 정렬 근거 — 패키지]",
          tpd.hierarchy || "(없음)",
          "",
          "[적법성 근거 — 패키지]",
          tpd.legality || "(없음)",
          "",
          "[창의성 근거 — 패키지]",
          tpd.originality || "(없음)",
          "",
          "[직관성 근거 — 패키지]",
          tpd.pronunciationLanguage || "(없음)",
          "",
          "[대중성 근거 — 패키지]",
          tpd.publicAppeal || "(없음)",
          "",
          "[확장성 근거 — 패키지]",
          tpd.scalability || "(없음)",
          ""
        );
      }

      if (props.length > 0) {
        props.forEach((raw, i) => {
          const p = normalizeNamingProposal(raw);
          const tierLb =
            gm?.style === "tiered" && gm.tierLabels?.[i]?.trim()
              ? `[${gm.tierLabels[i]!.trim()}] `
              : "";

          if (tieredPack) {
            lines.push(`--- ${tierLb}단계 ${i + 1}: ${p.name} ---`);
            lines.push(p.rationale.trim() || "(근거 없음)", "");
            return;
          }

          const overall = weightedOverallFromProposal(p);
          const hPf = passFailFromScore(p.hierarchyScore);
          const lPf = passFailFromScore(p.legalityScore);
          lines.push(`--- ${tierLb}대안 ${i + 1}: ${p.name} ---`);
          lines.push(p.rationale.trim() || "(근거 없음)");
          lines.push(
            `종합 점수: ${overall} / 100 (6항목 각 1/6 평균)`,
            `① 브랜드 계층 정렬 — Pass/Fail: ${hPf} (점수 ${p.hierarchyScore}/100 · 종합 1/6 · 70↓ NO-GO)`,
            `② 적법성 — Pass/Fail: ${lPf} (점수 ${p.legalityScore}/100 · 종합 1/6 · 70↓ NO-GO)`,
            `③ 창의성 — ${p.originalityDimensionScore} / 100 (종합 1/6)`,
            `④ 직관성 — ${p.pronunciationScore} / 100 (종합 1/6)`,
            `⑤ 대중성 — ${p.publicAppealScore} / 100 (종합 1/6)`,
            `⑥ 확장성 — ${p.scalabilityScore} / 100 (종합 1/6)`,
            ""
          );
          const pd = p.proposalDetailLogic;
          if (pd) {
            lines.push(
              "[브랜드 계층 정렬 근거]",
              pd.hierarchy || "(없음)",
              "",
              "[적법성 근거]",
              pd.legality || "(없음)",
              "",
              "[창의성 근거]",
              pd.originality || "(없음)",
              "",
              "[직관성 근거]",
              pd.pronunciationLanguage || "(없음)",
              "",
              "[대중성 근거]",
              pd.publicAppeal || "(없음)",
              "",
              "[확장성 근거]",
              pd.scalability || "(없음)",
              ""
            );
          }
        });
      } else if (opts.result.suggestedNames.length > 0) {
        opts.result.suggestedNames.forEach((n, i) => {
          lines.push(`대안 ${i + 1}: ${n}`);
        });
        lines.push("");
      } else {
        lines.push("(제안 없음)", "");
      }
    }
  }

  const r = opts.result;
  if (opts.mode === "audit") {
    const o = r.originalityDimensionScore ?? r.trademarkScore;
    const pr = r.pronunciationScore ?? r.pronunciationLanguageScore ?? 0;
    const l = r.legalityScore ?? r.copyrightScore;
    const pa = r.publicAppealScore ?? 50;
    const sc = r.scalabilityScore ?? 50;
    const hPf = passFailFromScore(r.hierarchyScore);
    const lPf = passFailFromScore(l);
    lines.push("■ 종합 적합성 점수");
    lines.push(`종합: ${r.overallScore} / 100 (브랜드계층·적법·창의·직관·대중·확장 6항목 각 1/6 평균)`);
    lines.push(
      `① 브랜드 계층 정렬 — Pass/Fail: ${hPf} (점수 ${r.hierarchyScore}/100 · 종합 1/6 · 70↓ NO-GO)`,
      `② 적법성 — Pass/Fail: ${lPf} (점수 ${l}/100 · 종합 1/6 · 70↓ NO-GO)`,
      `③ 창의성 — ${o} / 100 (종합 1/6)`,
      `④ 직관성 — ${pr} / 100 (종합 1/6)`,
      `⑤ 대중성 — ${pa} / 100 (종합 1/6)`,
      `⑥ 확장성 — ${sc} / 100 (종합 1/6)`,
      ""
    );
    appendBrandNamingAnalysisTail(lines, r);
  } else {
    lines.push(
      "",
      "■ 참고",
      "생성 모드 제안은 후보별 점수·상세만 참고용이며, 별도 검수 워크스페이스의 결과와 자동 연동되지 않습니다.",
      ""
    );
  }
  return lines.join("\n");
}

export async function downloadBrandNamingReport(
  opts: {
    mode: "generate" | "audit";
    result: BrandNamingRunResult;
    requestText: string;
    referenceText: string;
  },
  format: ExportFormat
): Promise<void> {
  const plain = buildBrandNamingPlainText(opts);
  const stamp = Date.now();
  const slug = opts.mode === "generate" ? "naming-generate" : "naming-audit";

  if (format === "pdf") {
    const canvas = await buildPlainTextReportCanvas(plain);
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    addCanvasToPdfPages(doc, canvas, margin);
    doc.save(`uplus-brand-${slug}-${stamp}.pdf`);
    return;
  }

  const canvas = await buildPlainTextReportCanvas(plain);

  if (format === "jpeg") {
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        triggerBlobDownload(blob, `uplus-brand-${slug}-${stamp}.jpg`);
      },
      "image/jpeg",
      0.92
    );
  } else {
    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerBlobDownload(blob, `uplus-brand-${slug}-${stamp}.png`);
    }, "image/png");
  }
}
