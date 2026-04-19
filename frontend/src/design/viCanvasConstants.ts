/**
 * LG U+ VI 캔버스 원칙 — 여백·간격·타이포·컬러를 단일 출처로 고정합니다.
 * 플래카드/포스터 렌더러는 이 상수를 기준으로 배치합니다.
 */

export const VI_COLORS = {
  brandMagenta: "#F43182",
  textPrimary: "#1A1A1A",
  textSecondary: "#5A5A5A",
  border: "#C8C8C8",
  canvasBg: "#FFFFFF",
  outerChrome: "#E8E8E8",
} as const;

/** U+ Simple 톤에 맞춘 기본 서체 스택 (캔버스 fontFamily와 동일) */
export const VI_FONT_STACK =
  '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';

/** 12분할 그리드 — 표시 높이(displayH) 기준 1X = H/12 (가로형 플래카드 공통) */
export function getPlacardGridUnitFromHeight(displayHeight: number): number {
  return displayHeight / 12;
}

/**
 * VI 그리드 2배 세분화(한 칸 = 기본 1X / 2).
 * 포스터 캔버스 스냅·격자선에 동일 값 사용.
 */
export function getViGridStepPx(baseUnitFrom12: number): number {
  return baseUnitFrom12 / 2;
}

/** 뱃지 최소 크기(그리드 기준 ‘칸’ 수) — VI 세분 격자 한 칸 = getViGridStepPx(H/12) px */
export const BADGE_MIN_GRID_CELLS = 3;

/** 12분할 그리드 — 표시 너비(displayW) 기준 (세로형 플래카드 등) */
export function getPlacardGridUnitFromWidth(displayWidth: number): number {
  return displayWidth / 12;
}

export const VI_RIGHT_PANEL_BG: Record<string, string> = {
  white: "#FFFFFF",
  "light-grey": "#F2F2F2",
  ivory: "#FDFAF0",
  "light-pink": "#FFF0F5",
};

/**
 * 현수막 대형(가로) 4700×700mm — 화면 픽셀 레이아웃 (기존 PlacardWideCanvas 수식 고정)
 */
export function computePlacardWideLayout(displayW: number, displayH: number) {
  const X = getPlacardGridUnitFromHeight(displayH);
  const logoMargin = X * 1.1;
  const logoH = X * 1.8;
  const logoTop = logoMargin;
  const logoLeft = logoMargin;
  const leftW = displayW * 0.235;
  const infoFontSize = X * 0.8;
  const infoLeft = X * 1.2;
  const bgInsetT = X * 1.0;
  const bgInsetB = X * 1.2;
  const bgInsetL = X * 0.26;
  const bgInsetR = X * 1.2;
  const bgLeft = leftW + bgInsetL;
  const bgTop = bgInsetT;
  const bgW = displayW - bgLeft - bgInsetR;
  const bgH = displayH - bgTop - bgInsetB;
  const bgRadius = X * 1.4;
  const titleFontSz = X * 2.8;
  const subFontSz = X * 1.5;
  const titleToSubGap = X * 0.57;
  return {
    gridUnit: X,
    logoMargin,
    logoH,
    logoTop,
    logoLeft,
    leftW,
    infoFontSize,
    infoLeft,
    bgLeft,
    bgTop,
    bgW,
    bgH,
    bgRadius,
    titleFontSz,
    subFontSz,
    titleToSubGap,
    canvasBorderRadius: X * 0.1,
  };
}
