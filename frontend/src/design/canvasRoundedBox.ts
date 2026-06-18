/** 이미지·라운드 배경 박스 공통 모서리 R — max 32px, 박스 높이의 5% */
export const CANVAS_ROUNDED_BOX_RADIUS_MAX_PX = 32;
export const CANVAS_ROUNDED_BOX_RADIUS_HEIGHT_RATIO = 0.05;

/** 네 모서리 동일 border-radius(px). 높이 5%와 32px 중 작은 값 사용 */
export function computeCanvasRoundedBoxRadiusPx(_boxWidthPx: number, boxHeightPx: number): number {
  const h = Math.max(1, boxHeightPx);
  return Math.min(
    CANVAS_ROUNDED_BOX_RADIUS_MAX_PX,
    h * CANVAS_ROUNDED_BOX_RADIUS_HEIGHT_RATIO
  );
}
