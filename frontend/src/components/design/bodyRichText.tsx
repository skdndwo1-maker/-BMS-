import type { CSSProperties, ReactNode } from "react";
import type { BoldRange } from "@/design/bodyBoldRanges";
import type { CharRange } from "@/design/charStyleRanges";

/**
 * plain 텍스트 + 굵게 구간(문자 오프셋)으로 렌더 (입력란에 ** 없음)
 */
export function renderPlainWithBoldRanges(
  plain: string,
  ranges: BoldRange[] | undefined,
  baseStyle: CSSProperties
): ReactNode {
  const r = [...(ranges ?? [])].sort((a, b) => a.start - b.start);
  if (r.length === 0) {
    return <span style={baseStyle}>{plain}</span>;
  }
  const nodes: ReactNode[] = [];
  let i = 0;
  let k = 0;
  for (const br of r) {
    if (br.start > i) {
      nodes.push(<span key={`t-${k++}`}>{plain.slice(i, br.start)}</span>);
    }
    if (br.end > br.start) {
      nodes.push(
        <span key={`b-${k++}`} style={{ ...baseStyle, fontWeight: 700 }}>
          {plain.slice(br.start, br.end)}
        </span>
      );
    }
    i = Math.max(i, br.end);
  }
  if (i < plain.length) {
    nodes.push(<span key={`t-${k++}`}>{plain.slice(i)}</span>);
  }
  return <span style={baseStyle}>{nodes}</span>;
}

/**
 * 본문 텍스트에서 `**굵게**` 구간을 굵게 렌더합니다. (줄바꿈은 whiteSpace: pre-wrap 유지)
 * @deprecated 레거시 마이그레이션용 — 신규는 renderPlainWithBoldRanges
 */
/** 굵게·기울임·밑줄 구간을 겹쳐서 렌더 (부분 스타일) */
export function renderPlainWithTriStyleRanges(
  plain: string,
  bold: CharRange[] | undefined,
  italic: CharRange[] | undefined,
  underline: CharRange[] | undefined,
  baseStyle: CSSProperties,
  opts?: { defaultWeight?: number; strongWeight?: number }
): ReactNode {
  const dw =
    opts?.defaultWeight ??
    (typeof baseStyle.fontWeight === "number"
      ? baseStyle.fontWeight
      : Number(baseStyle.fontWeight) || 400);
  const sw = opts?.strongWeight ?? 700;
  const pts = new Set<number>([0, plain.length]);
  const pushPts = (rs: CharRange[] | undefined) => {
    for (const r of rs ?? []) {
      pts.add(Math.max(0, Math.min(plain.length, r.start)));
      pts.add(Math.max(0, Math.min(plain.length, r.end)));
    }
  };
  pushPts(bold);
  pushPts(italic);
  pushPts(underline);
  const arr = [...pts].sort((a, b) => a - b);
  const nodes: ReactNode[] = [];
  let k = 0;
  for (let i = 0; i < arr.length - 1; i++) {
    const s = arr[i];
    const e = arr[i + 1];
    if (s >= e) continue;
    const mid = s;
    const isB = bold?.some((r) => mid >= r.start && mid < r.end) ?? false;
    const isI = italic?.some((r) => mid >= r.start && mid < r.end) ?? false;
    const isU = underline?.some((r) => mid >= r.start && mid < r.end) ?? false;
    const style: CSSProperties = { ...baseStyle };
    style.fontWeight = isB ? Math.max(dw, sw) : dw;
    style.fontStyle = isI ? "italic" : baseStyle.fontStyle ?? "normal";
    style.textDecoration = isU ? "underline" : baseStyle.textDecoration ?? "none";
    nodes.push(
      <span key={k++} style={style}>
        {plain.slice(s, e)}
      </span>
    );
  }
  return <>{nodes}</>;
}

export function renderBodyWithBold(text: string, baseStyle: CSSProperties): ReactNode {
  const nodes: ReactNode[] = [];
  const re = /\*\*([\s\S]+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={`t-${k++}`}>{text.slice(last, m.index)}</span>);
    }
    nodes.push(
      <strong key={`b-${k++}`} style={{ fontWeight: 700 }}>
        {m[1]}
      </strong>
    );
    last = re.lastIndex;
  }
  if (last < text.length) {
    nodes.push(<span key={`t-${k++}`}>{text.slice(last)}</span>);
  }
  if (nodes.length === 0) {
    return <span style={baseStyle}>{text}</span>;
  }
  return <span style={baseStyle}>{nodes}</span>;
}
