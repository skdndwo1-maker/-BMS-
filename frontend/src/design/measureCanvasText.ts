/**
 * 캔버스 텍스트 박스의 자동 크기 산정용: HTMLCanvasElement.measureText 기반으로
 * 가장 긴 줄의 폭과 줄 수를 픽셀 단위로 계산.
 *
 * - 우리 캔버스 텍스트는 `wordBreak: keep-all` + `overflowWrap: anywhere` 또는
 *   `whitespace: pre-wrap`으로 그려지므로, 줄바꿈은 사용자의 `\n`만 줄로 친다.
 * - 박스가 측정값과 정확히 같으면 가장자리에서 글자가 잘릴 수 있어 약간의 패딩을
 *   호출부에서 더해 사용한다.
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
  /** CSS font-weight (숫자/문자열 모두 허용) */
  fontWeight?: number | string;
  /** font-family. 미지정 시 system-ui 사용 */
  fontFamily?: string;
  /** italic 등 */
  fontStyle?: string;
  /** em 단위 letter-spacing. measureText는 자간을 무시하므로 길이에 더해 보정 */
  letterSpacingEm?: number;
  /** 줄간격 배수 (line-height) */
  lineHeight?: number;
}

export interface MeasureTextResult {
  /** 가장 긴 줄의 폭(px) */
  widthPx: number;
  /** 모든 줄을 합산한 높이(px) = 줄 수 × lineHeight × fontPx */
  heightPx: number;
  /** 줄 수(빈 텍스트는 1로 취급) */
  lineCount: number;
}

/**
 * 가장 긴 줄의 너비(px)와 전체 줄 수 기반 높이(px)를 반환.
 * `\n`로만 줄을 분리하며 박스 너비에 의한 자동 줄바꿈은 고려하지 않는다.
 */
export function measureTextBlock({
  text,
  fontPx,
  fontWeight = 400,
  fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontStyle = "normal",
  letterSpacingEm = 0,
  lineHeight = 1.2,
}: MeasureTextOptions): MeasureTextResult {
  const lines = text.length === 0 ? [""] : text.split("\n");
  const ctx = getMeasureCtx();
  let maxW = 0;
  if (!ctx) {
    /** 폴백: 영문/한글 평균 0.55em으로 추정. SSR 등 측정 불가 환경 대비 */
    for (const line of lines) {
      const len = Math.max(1, line.length);
      const w = len * fontPx * 0.55;
      if (w > maxW) maxW = w;
    }
  } else {
    /** weight + size + family를 한 번에 셋업해 letter-spacing 영향만 추가 보정 */
    const weight = typeof fontWeight === "number" ? String(fontWeight) : fontWeight;
    ctx.font = `${fontStyle} ${weight} ${fontPx}px ${fontFamily}`;
    const lsPx = (letterSpacingEm || 0) * fontPx;
    for (const line of lines) {
      const text = line.length === 0 ? " " : line;
      const measured = ctx.measureText(text).width;
      const adjusted = measured + Math.max(0, text.length - 1) * lsPx;
      if (adjusted > maxW) maxW = adjusted;
    }
  }
  const heightPx = Math.max(1, lines.length) * fontPx * (lineHeight || 1);
  return { widthPx: Math.max(0, maxW), heightPx, lineCount: lines.length };
}
