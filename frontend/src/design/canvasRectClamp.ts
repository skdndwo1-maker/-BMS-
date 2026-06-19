/** 드래그·리사이즈 시 픽셀 rect를 캔버스 안으로 강제 */

export const CANVAS_DRAG_THRESHOLD_PX = 4;

export function clampPxRectInCanvas(
  x: number,
  y: number,
  width: number,
  height: number,
  canvasW: number,
  canvasH: number,
  minW: number,
  minH: number,
  insetPx = 0
): { x: number; y: number; width: number; height: number } {
  const inset = Math.max(0, insetPx);
  const maxW = Math.max(minW, canvasW - inset * 2);
  const maxH = Math.max(minH, canvasH - inset * 2);
  const w = Math.max(minW, Math.min(maxW, width));
  const h = Math.max(minH, Math.min(maxH, height));
  const nx = Math.max(inset, Math.min(canvasW - inset - w, x));
  const ny = Math.max(inset, Math.min(canvasH - inset - h, y));
  return { x: nx, y: ny, width: w, height: h };
}
