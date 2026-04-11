import { jsPDF } from "jspdf";
import { normalizeNamingProposal, type BrandNamingRunResult } from "./guidelineApi";

export type ExportFormat = "pdf" | "png" | "jpeg";

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

function buildReportPlainText(opts: {
  brandScore: number;
  overallSummary: string | null;
  violations: Array<{ category: string; issue: string; severity: string }>;
}): string {
  const lines: string[] = [
    "U+ Layer — 브랜드 디자인 검수 리포트",
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

export function downloadInspectionReport(
  opts: {
    brandScore: number;
    overallSummary: string | null;
    violations: Array<{ category: string; issue: string; severity: string }>;
  },
  format: ExportFormat
): void {
  const plain = buildReportPlainText(opts);
  const stamp = Date.now();

  if (format === "pdf") {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 48;
    const maxW = pageW - margin * 2;
    const lines = plain.split("\n").flatMap((para) => doc.splitTextToSize(para, maxW));
    let y = 56;
    const lh = 14;
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - 48) {
        doc.addPage();
        y = 56;
      }
      doc.text(line, margin, y);
      y += lh;
    }
    doc.save(`uplus-brand-inspection-report-${stamp}.pdf`);
    return;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const padding = 40;
  const maxTextW = 720;
  const fontSize = 13;
  const lineHeight = Math.round(fontSize * 1.45);
  ctx.font = `${fontSize}px system-ui, sans-serif`;

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
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  let y = padding + fontSize;
  for (const line of allLines) {
    ctx.fillText(line, padding, y);
    y += lineHeight;
  }

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

function appendBrandNamingAnalysisTail(lines: string[], r: BrandNamingRunResult): void {
  lines.push("■ 브랜드 계층 정렬", `상태: ${r.hierarchy.status}`, r.hierarchy.message, r.hierarchy.details);
  r.hierarchy.checklist.forEach((t) => lines.push(`· ${t}`));
  lines.push("", "■ 독창성·상표 관점", `위험도: ${r.trademark.risk}`, r.trademark.recommendation);
  r.trademark.conflicts.forEach((c) => lines.push(`· ${c.name} (${c.class}) — 유사도 ${c.similarity}%`));
  lines.push("", "■ 저작권·적법성 보조", `독창성(참고): ${r.copyright.originality}%`, r.copyright.verdict);
  r.copyright.risks.forEach((x) => lines.push(`· [${x.severity}] ${x.type}: ${x.description}`));
  const dl = r.detailLogic;
  if (dl) {
    lines.push(
      "",
      "■ 상세 논리 (항목별)",
      "[계층]",
      dl.hierarchy || "(없음)",
      "",
      "[독창성]",
      dl.originality || "(없음)",
      "",
      "[발음·언어]",
      dl.pronunciationLanguage || "(없음)",
      "",
      "[적법성]",
      dl.legality || "(없음)"
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
      ? "U+ Layer — 브랜드 네이밍 생성 리포트"
      : "U+ Layer — 브랜드 네이밍 검수 리포트";
  lines.push(title, `생성 시각: ${new Date().toLocaleString("ko-KR")}`, "", "■ 요청 내용", opts.requestText.trim() || "(없음)", "");
  const ref = opts.referenceText.trim();
  if (ref) {
    lines.push("■ 참고 자료", ref, "");
  }

  if (opts.mode === "generate") {
    lines.push("■ AI 네이밍 제안 (4안)");
    const props = opts.result.namingProposals ?? [];
    if (props.length > 0) {
      props.forEach((raw, i) => {
        const p = normalizeNamingProposal(raw);
        lines.push(`--- 대안 ${i + 1}: ${p.name} ---`);
        lines.push(p.rationale.trim() || "(근거 없음)");
        lines.push(
          `점수(각 100점, 검수와 동일 축) — 계층 ${p.hierarchyScore} · 독창 ${p.originalityDimensionScore} · 발음·언어 ${p.pronunciationScore} · 적법 ${p.legalityScore}`,
          ""
        );
        const pd = p.proposalDetailLogic;
        if (pd) {
          lines.push(
            "[계층 근거]",
            pd.hierarchy || "(없음)",
            "",
            "[독창성 근거]",
            pd.originality || "(없음)",
            "",
            "[발음·언어 근거]",
            pd.pronunciationLanguage || "(없음)",
            "",
            "[적법성 근거]",
            pd.legality || "(없음)",
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

  const r = opts.result;
  if (opts.mode === "audit") {
    lines.push("■ 종합 적합성 점수 (가중합)");
    lines.push(`종합: ${r.overallScore} / 100`);
    const o = r.originalityDimensionScore ?? r.trademarkScore;
    const p = r.pronunciationScore ?? r.pronunciationLanguageScore ?? 0;
    const l = r.legalityScore ?? r.copyrightScore;
    lines.push(
      `세부(각 100점) — 계층(40%) ${r.hierarchyScore} · 독창(30%) ${o} · 발음·언어(20%) ${p} · 적법(10%) ${l}`,
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

export function downloadBrandNamingReport(
  opts: {
    mode: "generate" | "audit";
    result: BrandNamingRunResult;
    requestText: string;
    referenceText: string;
  },
  format: ExportFormat
): void {
  const plain = buildBrandNamingPlainText(opts);
  const stamp = Date.now();
  const slug = opts.mode === "generate" ? "naming-generate" : "naming-audit";

  if (format === "pdf") {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 48;
    const maxW = pageW - margin * 2;
    const textLines = plain.split("\n").flatMap((para) => doc.splitTextToSize(para, maxW));
    let y = 56;
    const lh = 14;
    for (const line of textLines) {
      if (y > doc.internal.pageSize.getHeight() - 48) {
        doc.addPage();
        y = 56;
      }
      doc.text(line, margin, y);
      y += lh;
    }
    doc.save(`uplus-brand-${slug}-${stamp}.pdf`);
    return;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const padding = 40;
  const maxTextW = 720;
  const fontSize = 13;
  const lineHeight = Math.round(fontSize * 1.45);
  ctx.font = `${fontSize}px system-ui, sans-serif`;

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
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  let y = padding + fontSize;
  for (const line of allLines) {
    ctx.fillText(line, padding, y);
    y += lineHeight;
  }

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
