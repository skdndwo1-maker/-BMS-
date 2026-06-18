/**
 * 현수막(placard) — 메인·본문·유의사항 텍스트 박스 배치.
 * 라운드 박스(고정 우측 분할 영역 또는 `panelBgRect` 연핑크 레이어)의
 * 수직 중심선에 텍스트 열을 맞추고, 세 블록+간격 묶음을 박스 안에서 세로 중앙 정렬한다.
 */

import type { CanvasTextAlign } from "@/design/types";
import type { NormalizedRect } from "@/design/designCanvasAlign";

/** 현수막 본문 — 항상 중앙 정렬(고정) */
export const PLACARD_BODY_TEXT_ALIGN: CanvasTextAlign = "center";

export const PLACARD_IDS = [
  "placard-wide-landscape",
  "placard-1000x600",
  "placard-2000x1000",
  "placard-600x1800",
  "placard-vertical",
] as const;

export function isPlacardTemplateId(templateId?: string): boolean {
  const id = (templateId ?? "").trim();
  return PLACARD_IDS.includes(id as (typeof PLACARD_IDS)[number]);
}

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

/** DesignCanvas 현수막 우측 분할 배경 블록 (캔버스 렌더링과 동일 기준) */
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
 * - 가로: 박스 너비의 4% 좌·우 패딩, 박스 수직 중심선 기준 대칭 중앙 정렬
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
  const gapPx = X * 0.57;

  // 텍스트 열: 박스 수직 중심선 기준, 좌·우 4% 패딩 대칭
  const hPadPx = box.width * 0.04;
  const innerWPx = Math.max(40, box.width - hPadPx * 2);
  // 박스 중심 = box.left + box.width/2 → 열 좌단 = 중심 - innerW/2
  const rectXPx = box.left + box.width / 2 - innerWPx / 2;
  const rectX = Math.max(0, rectXPx / displayW);
  const rectW = Math.max(0.05, innerWPx / displayW);

  const titleHPx = Math.max(X * 2.4, box.height * 0.22);
  const bodyHPx = Math.max(X * 1.6, box.height * 0.16);
  const footerHPx = Math.max(X * 1.3, box.height * 0.12);
  const totalHPx = titleHPx + gapPx + bodyHPx + gapPx + footerHPx;
  // 세로: 박스 높이 기준 중앙 정렬
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
  // 유의사항: 글자 1개 높이만큼 아래로 오프셋
  const footerCharOffsetPx = Math.min(displayW * 0.018, displayH * 0.10);
  const footerRect = clampNormRect({
    x: rectX,
    y: (startYPx + titleHPx + gapPx + bodyHPx + gapPx + footerCharOffsetPx) / displayH,
    width: rectW,
    height: Math.min(0.6, footerHPx / displayH),
  });

  return { titleRect, bodyRect, footerRect };
}
