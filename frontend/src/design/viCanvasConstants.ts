/**
 * Axis / 브랜드 VI 캔버스 원칙 — 여백·간격·타이포·컬러를 단일 출처로 고정합니다.
 * 플래카드/포스터 렌더러는 이 상수를 기준으로 배치합니다.
 */

export const VI_COLORS = {
  brandMagenta: "#FF7F66",
  textPrimary: "#1A1A1A",
  textSecondary: "#5A5A5A",
  border: "#C8C8C8",
  canvasBg: "#FFFFFF",
  outerChrome: "#E8E8E8",
} as const;

/** 캔버스 루트 기본 서체 — 텍스트 옵션은 Pretendard / Geist만 선택 (canvasTextTypography) */
export const VI_FONT_STACK = '"Pretendard Variable", Pretendard, system-ui, sans-serif';

/**
 * VI 그리드 2배 세분화(한 칸 = 기본 1X / 2).
 * 포스터 캔버스 스냅·격자선에 동일 값 사용.
 */
export function getViGridStepPx(baseUnitFrom12: number): number {
  return baseUnitFrom12 / 2;
}

/** 뱃지 최소 크기(그리드 기준 ‘칸’ 수) — VI 세분 격자 한 칸 = getViGridStepPx(H/12) px */
export const BADGE_MIN_GRID_CELLS = 3;
