import type { LogoPosition, TemplateCategory } from "./types";

/** 캔버스 외곽 여백 — 짧은 변의 4.5% */
export const CANVAS_LOGO_EDGE_MARGIN_RATIO = 0.045;

/** 로고 표시 높이 — 짧은 변의 4.5% (세로 길이 비례 금지) */
export const CANVAS_LOGO_HEIGHT_RATIO = 0.045;

/** 로고와 메인 타이틀 사이 최소 간격 — 짧은 변의 4% */
export const CANVAS_LOGO_TITLE_GAP_RATIO = 0.04;

/** RCS 제외 일반 템플릿 기본 로고 위치 */
export const CANVAS_LOGO_DEFAULT_POSITION: LogoPosition = "bottom-right";

/** 현수막 — 짧은 변 12등분 그리드 (1X = shortSide / 12) */
export const PLACARD_GRID_DIVISIONS = 12;
/** 상단 여백 */
export const PLACARD_LOGO_TOP_MARGIN_X = 1;
/** 로고 영역 높이 */
export const PLACARD_LOGO_AREA_HEIGHT_X = 1.5;
/** 좌측 여백 */
export const PLACARD_LOGO_LEFT_MARGIN_X = 1;
/** 좌측 로고·서브텍스트 밴드 (캔버스 너비 대비) */
export const PLACARD_LEFT_BAND_WIDTH_RATIO = 0.235;

/** Hero Banner 로고 — 공통 대비 2배 */
export const HERO_BANNER_LOGO_SCALE = 2;

const FACEBOOK_COVER_LOGO_SCALE = 1.5;

export function computePlacardGridUnitPx(displayW: number, displayH: number): number {
  return getCanvasShortSide(displayW, displayH) / PLACARD_GRID_DIVISIONS;
}

export type PlacardLogoLayout = {
  heightPx: number;
  positionStyle: CanvasLogoPositionStyle;
  maxWidthPx: number;
};

/**
 * 현수막 로고 — 가이드: 상단 1X · 좌측 1X · 로고 영역 1.5X 높이, 영역 내 세로 중앙
 */
export function computePlacardLogoLayout(displayW: number, displayH: number): PlacardLogoLayout {
  const X = computePlacardGridUnitPx(displayW, displayH);
  const marginLeft = X * PLACARD_LOGO_LEFT_MARGIN_X;
  const marginTop = X * PLACARD_LOGO_TOP_MARGIN_X;
  const logoAreaHeight = X * PLACARD_LOGO_AREA_HEIGHT_X;
  const logoHeightPx = Math.max(12, logoAreaHeight * 0.92);
  const logoTop = marginTop + (logoAreaHeight - logoHeightPx) / 2;
  const leftBandW = displayW * PLACARD_LEFT_BAND_WIDTH_RATIO;
  const maxWidthPx = Math.max(24, leftBandW - marginLeft - X * 0.25);

  return {
    heightPx: logoHeightPx,
    positionStyle: {
      top: `${logoTop}px`,
      left: `${marginLeft}px`,
    },
    maxWidthPx,
  };
}

/** @deprecated computePlacardLogoLayout 사용 */
export function computePlacardLogoHeightPx(displayW: number, displayH: number): number {
  return computePlacardLogoLayout(displayW, displayH).heightPx;
}

export function isPlacardTemplate(
  templateId?: string,
  templateCategory?: TemplateCategory
): boolean {
  const id = (templateId ?? "").trim();
  return id.startsWith("placard-") || id === "placard-wide-landscape" || templateCategory === "placard";
}

export function resolveTemplateLogoScale(
  templateId?: string,
  templateCategory?: TemplateCategory
): number {
  if (isPlacardTemplate(templateId, templateCategory)) return 1;
  const id = (templateId ?? "").trim();
  if (id === "marketing-hero") return HERO_BANNER_LOGO_SCALE;
  if (id === "marketing-facebook-cover") return FACEBOOK_COVER_LOGO_SCALE;
  return 1;
}

/** 템플릿별 기본 로고 위치 (RCS는 호출 측에서 제외) */
export function resolveTemplateDefaultLogoPosition(
  templateId?: string,
  templateCategory?: TemplateCategory
): LogoPosition {
  const id = (templateId ?? "").trim();
  if (id === "safety-caution-maintenance" || templateCategory === "safety-caution") {
    return "top-center";
  }
  if (id.startsWith("placard-") || templateCategory === "placard") {
    return "top-left";
  }
  return CANVAS_LOGO_DEFAULT_POSITION;
}

export function getCanvasShortSide(width: number, height: number): number {
  return Math.max(1, Math.min(width, height));
}

export function computeCanvasLogoHeightPx(
  displayW: number,
  displayH: number,
  scale = 1
): number {
  const short = getCanvasShortSide(displayW, displayH);
  return Math.max(12, short * CANVAS_LOGO_HEIGHT_RATIO * scale);
}

export function computeCanvasLogoMarginPx(
  displayW: number,
  displayH: number,
  marginRatio = CANVAS_LOGO_EDGE_MARGIN_RATIO
): number {
  return getCanvasShortSide(displayW, displayH) * marginRatio;
}

export function computeCanvasLogoTitleGapPx(displayW: number, displayH: number): number {
  return getCanvasShortSide(displayW, displayH) * CANVAS_LOGO_TITLE_GAP_RATIO;
}

export type CanvasLogoPositionStyle = {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  transform?: string;
};

export type CanvasLogoPositionStyleOpts = {
  edgeMarginRatio?: number;
  /** top-left / top-center / top-right 상단 여백 (미지정 시 edgeMarginRatio) */
  topMarginRatio?: number;
};

/** BI / CI / Slogan 공통 — 코너 프리셋별 절대 위치(px) */
export function computeCanvasLogoPositionStyle(
  position: LogoPosition,
  displayW: number,
  displayH: number,
  opts?: CanvasLogoPositionStyleOpts
): CanvasLogoPositionStyle {
  const edgeRatio = opts?.edgeMarginRatio ?? CANVAS_LOGO_EDGE_MARGIN_RATIO;
  const topRatio = opts?.topMarginRatio ?? edgeRatio;
  const padSide = `${computeCanvasLogoMarginPx(displayW, displayH, edgeRatio)}px`;
  const padTop = `${computeCanvasLogoMarginPx(displayW, displayH, topRatio)}px`;
  switch (position) {
    case "top-right":
      return { top: padTop, right: padSide };
    case "top-center":
      return { top: padTop, left: "50%", transform: "translateX(-50%)" };
    case "top-left":
      return { top: padTop, left: padSide };
    case "bottom-right":
      return { bottom: padSide, right: padSide };
    case "bottom-center":
      return { bottom: padSide, left: "50%", transform: "translateX(-50%)" };
    case "bottom-left":
    default:
      return { bottom: padSide, left: padSide };
  }
}

export function normalizeCanvasLogoPosition(pos: string | undefined): LogoPosition {
  const allowed: LogoPosition[] = [
    "top-left",
    "top-center",
    "top-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ];
  if (pos && allowed.includes(pos as LogoPosition)) return pos as LogoPosition;
  return CANVAS_LOGO_DEFAULT_POSITION;
}

export type NormalizedLogoRect = { x: number; y: number; width: number; height: number };

function clampNormRect(r: NormalizedLogoRect): NormalizedLogoRect {
  const x = Math.max(0, Math.min(1 - r.width, r.x));
  const y = Math.max(0, Math.min(1 - r.height, r.y));
  return { ...r, x, y, width: Math.max(0.01, Math.min(1 - x, r.width)), height: Math.max(0.01, Math.min(1 - y, r.height)) };
}

/** 직접 업로드 로고 초기 rect — 짧은 변 기준 여백·높이 */
export function computeDefaultCustomUploadedLogoRect(args: {
  displayW: number;
  displayH: number;
  logoPosition: LogoPosition;
  logoHeightPx: number;
  /** 미지정 시 높이×2.2 (가로형 BI 대략 비율) */
  logoWidthPx?: number;
}): NormalizedLogoRect {
  const { displayW, displayH, logoPosition, logoHeightPx, logoWidthPx } = args;
  const pad = computeCanvasLogoMarginPx(displayW, displayH);
  const wPx = logoWidthPx ?? logoHeightPx * 2.2;
  const wN = wPx / displayW;
  const hN = logoHeightPx / displayH;
  let xN: number;
  let yN: number;

  switch (logoPosition) {
    case "top-right":
      xN = (displayW - pad - wPx) / displayW;
      yN = pad / displayH;
      break;
    case "top-center":
      xN = (displayW / 2 - wPx / 2) / displayW;
      yN = pad / displayH;
      break;
    case "bottom-right":
      xN = (displayW - pad - wPx) / displayW;
      yN = (displayH - pad - logoHeightPx) / displayH;
      break;
    case "bottom-center":
      xN = (displayW / 2 - wPx / 2) / displayW;
      yN = (displayH - pad - logoHeightPx) / displayH;
      break;
    case "top-left":
      xN = pad / displayW;
      yN = pad / displayH;
      break;
    case "bottom-left":
    default:
      xN = pad / displayW;
      yN = (displayH - pad - logoHeightPx) / displayH;
      break;
  }

  return clampNormRect({ x: xN, y: yN, width: wN, height: hN });
}

/** 메인 타이틀 rect가 로고와 겹치지 않도록 최소 간격 보정 (좌측 열 레이아웃) */
export function insetTitleRectFromLogo(args: {
  titleRect: NormalizedLogoRect;
  displayW: number;
  displayH: number;
  logoPosition: LogoPosition;
  logoHeightPx: number;
}): NormalizedLogoRect {
  const { titleRect, displayW, displayH, logoPosition, logoHeightPx } = args;
  const gap = computeCanvasLogoTitleGapPx(displayW, displayH);
  const margin = computeCanvasLogoMarginPx(displayW, displayH);
  const logoBottomNorm = (displayH - margin) / displayH;
  const logoTopNorm = (displayH - margin - logoHeightPx) / displayH;
  const logoRightNorm = (margin + logoHeightPx * 2.2) / displayW;

  if (logoPosition === "bottom-left" && titleRect.x < logoRightNorm * 0.5) {
    const maxTitleBottom = logoTopNorm - gap / displayH;
    if (titleRect.y + titleRect.height > maxTitleBottom) {
      const newH = Math.max(0.04, maxTitleBottom - titleRect.y);
      return { ...titleRect, height: newH };
    }
  }

  if (logoPosition === "top-left" && titleRect.x < logoRightNorm * 0.5) {
    const minTitleTop = logoBottomNorm + gap / displayH;
    if (titleRect.y < minTitleTop) {
      const delta = minTitleTop - titleRect.y;
      return {
        ...titleRect,
        y: minTitleTop,
        height: Math.max(0.04, titleRect.height - delta),
      };
    }
  }

  return titleRect;
}
