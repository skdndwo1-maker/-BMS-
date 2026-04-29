/**
 * 현수막(placard) — 메인·본문·유의사항 텍스트 박스 배치.
 * 라운드 박스(고정 우측 분할 영역 또는 `panelBgRect` 연핑크 레이어)의
 * 가로 중심축에 열을 맞추고, 같은 세 높이·간격 블록을 박스 안에서 세로 중앙 정렬한다.
 */

import type { NormalizedRect } from "@/design/designCanvasAlign";

function clampNormRect(r: NormalizedRect): NormalizedRect {
  const x = Math.max(0, Math.min(1 - r.width, r.x));
  const y = Math.max(0, Math.min(1 - r.height, r.y));
  return { ...r, x, y };
}

export type PlacardContentBoxPx = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** DesignCanvas 현수막 우측 분할 배경 블록 (라이트 그레이/연핑크 등과 동일한 기준) */
export function getPlacardSplitBackdropBoxPx(displayW: number, displayH: number): PlacardContentBoxPx {
  const shortSide = Math.min(displayW, displayH);
  const X = shortSide / 12;
  const leftW = displayW * 0.235;
  const bgInsetT = X * 1.0;
  const bgInsetB = X * 1.2;
  const bgInsetL = X * 0.26;
  const bgInsetR = X * 1.2;
  const left = leftW + bgInsetL;
  const top = bgInsetT;
  const width = Math.max(10, displayW - left - bgInsetR);
  const height = Math.max(10, displayH - top - bgInsetB);
  return { left, top, width, height };
}

/**
 * 라운드 박스(px) 안에 메인·본문·유의사항 블록을 배치한다.
 * - 가로: 박스 수직 중심선 == 텍스트 열의 세로 축 (열 너비는 패딩 제외 후 대칭, 박스 가로중앙)
 * - 세로: 세 블록+간격 묶음을 박스 세로방향 한가운데
 * 박스 위치·크기는 변경하지 않는다.
 */
export function computePlacardTextStackNormRects(displayW: number, displayH: number, box: PlacardContentBoxPx): {
  titleRect: NormalizedRect;
  bodyRect: NormalizedRect;
  footerRect: NormalizedRect;
} {
  const shortSide = Math.min(displayW, displayH);
  const X = shortSide / 12;
  const padPx = X * 0.55;
  const gapPx = X * 0.57;

  const innerWPx = Math.max(40, box.width - padPx * 2);
  /** 박스 가로 중앙 정렬된 열 (좌·우 패딩 대칭) */
  const rectXPx = box.left + (box.width - innerWPx) / 2;
  const rectX = rectXPx / displayW;
  const rectW = Math.max(0.05, innerWPx / displayW);

  const titleHPx = Math.max(X * 2.4, box.height * 0.22);
  const bodyHPx = Math.max(X * 1.6, box.height * 0.16);
  const footerHPx = Math.max(X * 1.3, box.height * 0.12);
  const totalHPx = titleHPx + gapPx + bodyHPx + gapPx + footerHPx;
  const startYPx = box.top + Math.max(0, (box.height - totalHPx) / 2);

  const titleRect = clampNormRect({
    x: rectX,
    y: startYPx / displayH,
    width: rectW,
    height: Math.min(0.6, titleHPx / displayH),
  });
  const bodyRect = clampNormRect({
    x: rectX,
    y: (startYPx + titleHPx + gapPx) / displayH,
    width: rectW,
    height: Math.min(0.6, bodyHPx / displayH),
  });
  const footerRect = clampNormRect({
    x: rectX,
    y: (startYPx + titleHPx + gapPx + bodyHPx + gapPx) / displayH,
    width: rectW,
    height: Math.min(0.6, footerHPx / displayH),
  });

  return { titleRect, bodyRect, footerRect };
}
