/**
 * 캔버스 텍스트 박스의 자동 크기 산정용: HTMLCanvasElement.measureText 기반.
 *
 * - `whiteSpace: pre-wrap` + `overflowWrap: anywhere` 렌더와 맞추기 위해
 *   `\n` 단락 구분 + maxWidth 초과 시 글자 단위 줄바꿈을 시뮬레이션한다.
 */

let _ctx: CanvasRenderingContext2D | null | undefined;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_ctx !== undefined) return _ctx;
  if (typeof document === "undefined") {
    _ctx = null;
    return _ctx;
  }
  try {
    const canvas = document.createElement("canvas");
    _ctx = canvas.getContext("2d");
  } catch {
    _ctx = null;
  }
  return _ctx ?? null;
}

export interface MeasureTextOptions {
  text: string;
  fontPx: number;
  fontWeight?: number | string;
  fontFamily?: string;
  fontStyle?: string;
  letterSpacingEm?: number;
  lineHeight?: number;
}

export interface MeasureTextInBoxOptions extends MeasureTextOptions {
  /** 콘텐츠 영역 최대 너비(px). 초과 시 anywhere 줄바꿈 시뮬레이션 */
  maxWidthPx?: number;
}

export interface MeasureTextResult {
  widthPx: number;
  heightPx: number;
  lineCount: number;
}

export interface MeasureAutoTextBoxOptions extends MeasureTextOptions {
  padXPx: number;
  padYPx: number;
  maxBoxWidthPx: number;
}

export interface MeasureAutoTextBoxResult {
  contentWidthPx: number;
  contentHeightPx: number;
  boxWidthPx: number;
  boxHeightPx: number;
  lineCount: number;
}

function setupFont(
  ctx: CanvasRenderingContext2D,
  opts: MeasureTextOptions
): { lsPx: number } {
  const weight =
    typeof opts.fontWeight === "number" ? String(opts.fontWeight) : (opts.fontWeight ?? "400");
  ctx.font = `${opts.fontStyle ?? "normal"} ${weight} ${opts.fontPx}px ${opts.fontFamily ?? "system-ui, sans-serif"}`;
  return { lsPx: (opts.letterSpacingEm ?? 0) * opts.fontPx };
}

function measureLineWidth(
  ctx: CanvasRenderingContext2D | null,
  line: string,
  opts: MeasureTextOptions
): number {
  const sample = line.length === 0 ? " " : line;
  if (!ctx) {
    return Math.max(1, sample.length) * opts.fontPx * 0.55;
  }
  const { lsPx } = setupFont(ctx, opts);
  return ctx.measureText(sample).width + Math.max(0, sample.length - 1) * lsPx;
}

/** overflowWrap:anywhere — maxWidthPx 초과 시 글자 단위로 줄 분할 */
function wrapLineGreedy(line: string, maxWidthPx: number, opts: MeasureTextOptions): string[] {
  if (maxWidthPx <= 0) return [line];
  if (line.length === 0) return [""];

  const ctx = getMeasureCtx();
  if (measureLineWidth(ctx, line, opts) <= maxWidthPx) return [line];

  const out: string[] = [];
  let start = 0;
  while (start < line.length) {
    let end = start + 1;
    while (end <= line.length) {
      const chunk = line.slice(start, end);
      const w = measureLineWidth(ctx, chunk, opts);
      if (w > maxWidthPx && end > start + 1) {
        out.push(line.slice(start, end - 1));
        start = end - 1;
        break;
      }
      if (end === line.length) {
        out.push(line.slice(start));
        start = line.length;
        break;
      }
      end += 1;
    }
  }
  return out.length > 0 ? out : [""];
}

function expandLines(text: string, maxWidthPx: number | undefined, opts: MeasureTextOptions): string[] {
  const paragraphs = text.length === 0 ? [""] : text.split("\n");
  const out: string[] = [];
  for (const para of paragraphs) {
    if (maxWidthPx != null && maxWidthPx > 0) {
      out.push(...wrapLineGreedy(para, maxWidthPx, opts));
    } else {
      out.push(para);
    }
  }
  return out.length > 0 ? out : [""];
}

function resultFromLines(lines: string[], opts: MeasureTextOptions): MeasureTextResult {
  const ctx = getMeasureCtx();
  let maxW = 0;
  for (const line of lines) {
    const w = measureLineWidth(ctx, line, opts);
    if (w > maxW) maxW = w;
  }
  const lh = opts.lineHeight ?? 1.2;
  const heightPx = Math.max(1, lines.length) * opts.fontPx * lh;
  return { widthPx: Math.max(0, maxW), heightPx, lineCount: lines.length };
}

/**
 * `\n` + (선택) maxWidth 줄바꿈을 반영한 텍스트 블록 크기.
 */
export function measureTextBlockInBox(opts: MeasureTextInBoxOptions): MeasureTextResult {
  const lines = expandLines(opts.text, opts.maxWidthPx, opts);
  return resultFromLines(lines, opts);
}

/**
 * 가장 긴 줄 기준 자연 너비 (줄바꿈 없음).
 */
export function measureTextBlock(opts: MeasureTextOptions): MeasureTextResult {
  return measureTextBlockInBox(opts);
}

/**
 * 자동 텍스트 박스: 짧으면 콘텐츠 너비, 길면 maxBoxWidthPx에서 wrap 후 높이 산정.
 */
export function measureAutoTextBox(opts: MeasureAutoTextBoxOptions): MeasureAutoTextBoxResult {
  const natural = measureTextBlock(opts);
  const naturalBoxW = natural.widthPx + opts.padXPx;
  const maxBoxW = opts.maxBoxWidthPx;

  if (naturalBoxW <= maxBoxW) {
    return {
      contentWidthPx: natural.widthPx,
      contentHeightPx: natural.heightPx,
      boxWidthPx: naturalBoxW,
      boxHeightPx: natural.heightPx + opts.padYPx,
      lineCount: natural.lineCount,
    };
  }

  const contentMaxW = Math.max(8, maxBoxW - opts.padXPx);
  const wrapped = measureTextBlockInBox({ ...opts, maxWidthPx: contentMaxW });
  return {
    contentWidthPx: contentMaxW,
    contentHeightPx: wrapped.heightPx,
    boxWidthPx: maxBoxW,
    boxHeightPx: wrapped.heightPx + opts.padYPx,
    lineCount: wrapped.lineCount,
  };
}
