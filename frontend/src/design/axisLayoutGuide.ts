import type { CanvasSize, DesignContent, TemplateCategory } from "./types";
import { FONT_FAMILY_PRETENDARD } from "./canvasTextTypography";
import {
  insetTitleRectFromLogo,
  computeCanvasLogoHeightPx,
  resolveTemplateDefaultLogoPosition,
  resolveTemplateLogoScale,
} from "./canvasLogoLayout";
import {
  BADGE_DEFAULT_FONT_WEIGHT,
  SUBTITLE_DEFAULT_FONT_WEIGHT,
} from "./viCanvasConstants";

export type AxisLayoutCategory =
  | "wide"
  | "basic"
  | "square"
  | "live"
  | "wide-event"
  | "sns"
  | "poster-window"
  | "poster-full"
  | "xbanner"
  | "placard-wide";

export type BrandLayoutProfile =
  | "web-wide"
  | "web-basic-model-b"
  | "web-basic-image"
  | "web-square"
  | "web-live"
  | "web-wide-event"
  | "sns-grid"
  | "poster-window"
  | "poster-full-image"
  | "xbanner-stack"
  | "placard-wide";

export type NormalizedRect = { x: number; y: number; width: number; height: number };

export interface AxisLayoutRects {
  category: AxisLayoutCategory;
  profile: BrandLayoutProfile;
  titleRect: NormalizedRect;
  subtitleRect: NormalizedRect;
  bodyRect: NormalizedRect;
  badgeRect: NormalizedRect;
  imageRect: NormalizedRect;
  footerRect: NormalizedRect;
  /** 이미지 모서리 R(px) — 캔버스 짧은 변 기준 스케일 */
  imageCornerRadiusPx?: number;
}

/** LG U+ 가이드: 1X = 짧은 변 ÷ N */
export function getShortSide(size: Pick<CanvasSize, "width" | "height">): number {
  return Math.max(1, Math.min(size.width, size.height));
}

export function computeGridUnit(size: Pick<CanvasSize, "width" | "height">, gridDivisions: number): number {
  return getShortSide(size) / Math.max(1, gridDivisions);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function rect(x: number, y: number, width: number, height: number): NormalizedRect {
  return { x: clamp01(x), y: clamp01(y), width: clamp01(width), height: clamp01(height) };
}

/** 짧은 변 대비 비율 → 정규 X (0~1) */
function normX(ratioOfShort: number, size: Pick<CanvasSize, "width" | "height">): number {
  return (ratioOfShort * getShortSide(size)) / Math.max(1, size.width);
}

/** 짧은 변 대비 비율 → 정규 Y (0~1) */
function normY(ratioOfShort: number, size: Pick<CanvasSize, "width" | "height">): number {
  return (ratioOfShort * getShortSide(size)) / Math.max(1, size.height);
}

/** 가로 길이 대비 비율 → 정규 X */
function normXOfWidth(ratioOfWidth: number): number {
  return clamp01(ratioOfWidth);
}

/** px(기준 캔버스) → 짧은 변 대비 비율 */
function pxToShortRatio(px: number, refShortSide: number): number {
  return px / Math.max(1, refShortSide);
}

/** 기준 px R값을 현재 캔버스 짧은 변에 맞게 스케일 */
export function scaleBrandCornerRadiusPx(refPx: number, refShortSide: number, size: Pick<CanvasSize, "width" | "height">): number {
  return pxToShortRatio(refPx, refShortSide) * getShortSide(size);
}

const IMAGE_RADIUS = {
  wide: { px: 24, refShort: 300 },
  basic: { px: 12, refShort: 262 },
  square: { px: 12, refShort: 260 },
  live: { px: 15, refShort: 320 },
  wideEvent: { px: 26, refShort: 300 },
} as const;

/** 캔버스 가로÷세로 비율로 Wide / Basic / Square / Live / Wide-Event 분류 */
export function detectAxisLayoutCategory(aspectRatio: number): AxisLayoutCategory {
  if (aspectRatio >= 0.92 && aspectRatio <= 1.08) return "square";
  if (aspectRatio >= 4.5) return "wide-event";
  if (aspectRatio >= 2.0) return "wide";
  if (aspectRatio < 0.65) return "live";
  return "basic";
}

export function detectAxisLayoutCategoryFromSize(size: Pick<CanvasSize, "width" | "height">): AxisLayoutCategory {
  const h = Math.max(1, size.height);
  return detectAxisLayoutCategory(size.width / h);
}

export function resolveBrandLayoutProfile(
  templateCategory: TemplateCategory | undefined,
  templateId: string | undefined,
  size: Pick<CanvasSize, "width" | "height">
): BrandLayoutProfile {
  const id = (templateId ?? "").trim();
  const ar = size.width / Math.max(1, size.height);

  if (id === "xbanner" || templateCategory === "xbanner") return "xbanner-stack";
  if (templateCategory === "social-media") return "sns-grid";
  if (templateCategory === "poster") {
    return size.height >= size.width ? "poster-window" : "poster-full-image";
  }
  if (templateCategory === "placard" || id.startsWith("placard-")) {
    if (ar >= 6) return "placard-wide";
  }

  const ratioClass = detectAxisLayoutCategoryFromSize(size);
  if (ratioClass === "wide-event") return "web-wide-event";
  if (ratioClass === "live") return "web-live";
  if (ratioClass === "square") return "web-square";
  if (ratioClass === "wide") return "web-wide";

  // Basic — Image/Illustration 마진(기본), Model B는 marketing-hero 등 히어로형에서 사용
  if (id === "marketing-hero" || id === "marketing-web-2") return "web-basic-model-b";
  return "web-basic-image";
}

function computeWebWideLayout(size: Pick<CanvasSize, "width" | "height">): AxisLayoutRects {
  const marginLeft = normXOfWidth(0.0235);
  const marginRight = normXOfWidth(0.0235);
  const contentX = marginLeft;
  const contentW = 1 - marginLeft - marginRight;
  const textW = contentW * 0.42;
  const imageW = contentW - textW;
  const imageX = contentX + textW;

  const marginTop = normY(0.075, size);
  const titleSubGap = normY(0.047, size);
  const subBadgeGap = normY(0.169, size);
  const badgeH = normY(0.1, size);
  const marginBottom = normY(0.115, size);

  const titleH = normY(0.14, size);
  const subtitleH = normY(0.055, size);
  const titleY = marginTop;
  const subtitleY = titleY + titleH + titleSubGap;
  const bodyY = subtitleY + subtitleH;
  const badgeY = 1 - marginBottom - badgeH;
  const bodyH = Math.max(subBadgeGap, badgeY - bodyY);
  const imageY = marginTop;
  const imageH = badgeY + badgeH - marginTop;

  return {
    category: "wide",
    profile: "web-wide",
    titleRect: rect(contentX, titleY, textW, titleH),
    subtitleRect: rect(contentX, subtitleY, textW, subtitleH),
    bodyRect: rect(contentX, bodyY, textW, bodyH),
    badgeRect: rect(contentX, badgeY, textW, badgeH),
    imageRect: rect(imageX, imageY, imageW, imageH),
    footerRect: rect(
      contentX,
      1 - marginBottom - normY(0.035, size),
      textW,
      normY(0.035, size)
    ),
    imageCornerRadiusPx: scaleBrandCornerRadiusPx(IMAGE_RADIUS.wide.px, IMAGE_RADIUS.wide.refShort, size),
  };
}

function computeWebBasicLayout(
  size: Pick<CanvasSize, "width" | "height">,
  variant: "model-b" | "image"
): AxisLayoutRects {
  const isModelB = variant === "model-b";
  const marginLeft = normX(isModelB ? 0.034 : 0.064, size);
  const marginRight = normX(0.056, size);
  const marginTop = normY(isModelB ? 0.061 : 0.134, size);
  const titleSubGap = normY(0.076, size);
  const subBadgeGap = normY(isModelB ? 0.153 : 0.252, size);
  const badgeH = normY(isModelB ? 0.107 : 0.107, size);
  const marginBottom = normY(isModelB ? 0.13 : 0.179, size);

  const contentX = marginLeft;
  const contentW = 1 - marginLeft - marginRight;
  const textW = contentW * 0.5;
  const imageW = contentW - textW;
  const imageX = contentX + textW;

  const titleH = normY(isModelB ? 0.115 : 0.115, size);
  const subtitleH = normY(0.062, size);
  const titleY = marginTop;
  const subtitleY = titleY + titleH + titleSubGap;
  const bodyY = subtitleY + subtitleH;
  const badgeY = 1 - marginBottom - badgeH;
  const bodyH = subBadgeGap;
  const imageY = marginTop;
  const imageH = badgeY + badgeH - marginTop;

  return {
    category: "basic",
    profile: isModelB ? "web-basic-model-b" : "web-basic-image",
    titleRect: rect(contentX, titleY, textW, titleH),
    subtitleRect: rect(contentX, subtitleY, textW, subtitleH),
    bodyRect: rect(contentX, bodyY, textW, bodyH),
    badgeRect: rect(contentX, badgeY, textW, badgeH),
    imageRect: rect(imageX, imageY, imageW, imageH),
    footerRect: rect(
      contentX,
      1 - marginBottom - normY(0.04, size),
      textW,
      normY(0.04, size)
    ),
    imageCornerRadiusPx: scaleBrandCornerRadiusPx(IMAGE_RADIUS.basic.px, IMAGE_RADIUS.basic.refShort, size),
  };
}

function computeWebSquareLayout(size: Pick<CanvasSize, "width" | "height">): AxisLayoutRects {
  const m = normX(0.062, size);
  const innerW = 1 - m * 2;
  const badgeH = normY(0.062, size);
  const imageH = normY(0.646, size);
  const badgeY = m;
  const imageY = m + badgeH;
  const titleY = imageY + imageH;
  const titleH = Math.max(normY(0.1, size), 1 - m - titleY);
  const footerH = normY(0.04, size);
  const footerY = 1 - m - footerH;

  return {
    category: "square",
    profile: "web-square",
    titleRect: rect(m, titleY, innerW, titleH),
    subtitleRect: rect(m, titleY, innerW, 0.001),
    bodyRect: rect(m, titleY, innerW, 0.001),
    badgeRect: rect(m + innerW * 0.22, badgeY, innerW * 0.56, badgeH),
    imageRect: rect(m, imageY, innerW, imageH),
    footerRect: rect(m, footerY, innerW, footerH),
    imageCornerRadiusPx: scaleBrandCornerRadiusPx(IMAGE_RADIUS.square.px, IMAGE_RADIUS.square.refShort, size),
  };
}

function computeWebLiveLayout(size: Pick<CanvasSize, "width" | "height">): AxisLayoutRects {
  const marginH = normX(0.094, size);
  const marginTop = normY(0.053, size);
  const marginBottom = normY(0.039, size);
  const titleSubGap = normY(0.039, size);
  const innerW = 1 - marginH * 2;

  const titleH = normY(0.08, size);
  const subtitleH = normY(0.05, size);
  const textBlockH = marginTop + titleH + titleSubGap + subtitleH;
  const imageY = textBlockH;
  const imageH = 1 - imageY - marginBottom;

  return {
    category: "live",
    profile: "web-live",
    titleRect: rect(marginH, marginTop, innerW, titleH),
    subtitleRect: rect(marginH, marginTop + titleH + titleSubGap, innerW, subtitleH),
    bodyRect: rect(marginH, marginTop + titleH + titleSubGap + subtitleH, innerW, normY(0.04, size)),
    badgeRect: rect(marginH + innerW * 0.04, imageY + imageH - normY(0.05, size), innerW * 0.35, normY(0.04, size)),
    imageRect: rect(marginH, imageY, innerW, imageH),
    footerRect: rect(marginH, 1 - marginBottom, innerW, marginBottom),
    imageCornerRadiusPx: scaleBrandCornerRadiusPx(IMAGE_RADIUS.live.px, IMAGE_RADIUS.live.refShort, size),
  };
}

function computeWebWideEventLayout(size: Pick<CanvasSize, "width" | "height">): AxisLayoutRects {
  const outerMargin = normY(0.08, size);
  const innerMargin = normY(0.107, size);
  const cardMarginLeft = normX(0.017, size);
  const cardW = 0.38;
  const imageX = cardMarginLeft + cardW + normX(0.02, size);
  const imageW = 1 - imageX - normX(0.017, size);

  const titleH = normY(0.22, size);
  const subtitleH = normY(0.1, size);
  const titleY = innerMargin;
  const subtitleY = titleY + titleH + normY(0.04, size);
  const cardH = 1 - outerMargin * 2;

  return {
    category: "wide-event",
    profile: "web-wide-event",
    titleRect: rect(cardMarginLeft + normX(0.022, size), titleY, cardW - normX(0.044, size), titleH),
    subtitleRect: rect(cardMarginLeft + normX(0.022, size), subtitleY, cardW - normX(0.044, size), subtitleH),
    bodyRect: rect(cardMarginLeft, innerMargin, cardW, cardH * 0.5),
    badgeRect: rect(cardMarginLeft + normX(0.022, size), subtitleY + subtitleH + normY(0.03, size), cardW * 0.4, normY(0.06, size)),
    imageRect: rect(imageX, outerMargin, imageW, cardH),
    footerRect: rect(cardMarginLeft, 1 - outerMargin - normY(0.05, size), cardW, normY(0.05, size)),
    imageCornerRadiusPx: scaleBrandCornerRadiusPx(IMAGE_RADIUS.wideEvent.px, IMAGE_RADIUS.wideEvent.refShort, size),
  };
}

function computeSnsGridLayout(size: Pick<CanvasSize, "width" | "height">): AxisLayoutRects {
  const oneXRatio = 1 / 18;
  const marginX = normX(oneXRatio, size);
  const marginY = normY(oneXRatio, size);
  const innerW = 1 - marginX * 2;
  const innerH = 1 - marginY * 2;

  const titleH = innerH * 0.28;
  const subtitleH = innerH * 0.12;
  const imageH = innerH * 0.42;

  return {
    category: "sns",
    profile: "sns-grid",
    titleRect: rect(marginX, marginY, innerW * 0.85, titleH),
    subtitleRect: rect(marginX, marginY + innerH - subtitleH, innerW * 0.85, subtitleH),
    bodyRect: rect(marginX, marginY + titleH + normY(oneXRatio, size), innerW, innerH * 0.15),
    badgeRect: rect(marginX, marginY + innerH - subtitleH - normY(oneXRatio * 2, size), innerW * 0.45, normY(oneXRatio * 1.5, size)),
    imageRect: rect(marginX + innerW * 0.1, marginY + titleH + normY(oneXRatio * 2, size), innerW * 0.8, imageH),
    footerRect: rect(marginX, 1 - marginY - normY(oneXRatio, size), innerW, normY(oneXRatio, size)),
  };
}

/** 포스터 Window — 짧은 변 20등분 */
function computePosterWindowLayout(size: Pick<CanvasSize, "width" | "height">): AxisLayoutRects {
  const n = 20;
  const oneXRatio = 1 / n;
  const margin = normX(oneXRatio, size);
  const topTitle = normY(oneXRatio * 1.3, size);
  const innerW = 1 - margin * 2;

  const titleH = normY(oneXRatio * 4, size);
  const subtitleH = normY(oneXRatio * 2, size);
  const imageLeft = normX(oneXRatio * 1.3, size);
  const imageY = topTitle + titleH + normY(oneXRatio * 1.3, size);
  const imageH = 1 - imageY - margin;

  return {
    category: "poster-window",
    profile: "poster-window",
    titleRect: rect(margin, topTitle, innerW * 0.75, titleH),
    subtitleRect: rect(margin, topTitle + titleH + normY(oneXRatio * 0.8, size), innerW * 0.75, subtitleH),
    bodyRect: rect(margin, topTitle + titleH, innerW, normY(oneXRatio * 2, size)),
    badgeRect: rect(margin, topTitle - normY(oneXRatio * 0.5, size), innerW * 0.35, normY(oneXRatio * 1.2, size)),
    imageRect: rect(imageLeft, imageY, 1 - imageLeft - margin, imageH),
    footerRect: rect(margin, 1 - margin - normY(oneXRatio * 1.5, size), innerW, normY(oneXRatio * 1.5, size)),
    imageCornerRadiusPx: scaleBrandCornerRadiusPx(12, getShortSide(size), size),
  };
}

/** 포스터 Full Image — 20등분 그리드, 이미지 전면 + 키워드 좌상단 */
function computePosterFullImageLayout(size: Pick<CanvasSize, "width" | "height">): AxisLayoutRects {
  const n = 20;
  const oneXRatio = 1 / n;
  const margin = normX(oneXRatio, size);

  return {
    category: "poster-full",
    profile: "poster-full-image",
    titleRect: rect(margin, normY(oneXRatio * 1.3, size), 0.55, normY(oneXRatio * 5, size)),
    subtitleRect: rect(margin, 1 - normY(oneXRatio * 3.5, size), 0.6, normY(oneXRatio * 2, size)),
    bodyRect: rect(margin, normY(oneXRatio * 8, size), 0.5, normY(oneXRatio * 4, size)),
    badgeRect: rect(margin, normY(oneXRatio * 1.3, size), 0.35, normY(oneXRatio * 1.5, size)),
    imageRect: rect(0, 0, 1, 1),
    footerRect: rect(
      margin,
      1 - normY(oneXRatio * 2.5, size),
      1 - margin * 2,
      normY(oneXRatio * 2, size)
    ),
    imageCornerRadiusPx: 0,
  };
}

/** X-배너 — 짧은 변 12등분, 수직 스택 + 최소 간격 1X/2X */
function computeXbannerStackLayout(size: Pick<CanvasSize, "width" | "height">): AxisLayoutRects {
  const n = 12;
  const xUnit = normY(1 / n, size);
  const marginX = normX(1 / n, size);
  const innerW = 1 - marginX * 2;

  const topAreaH = xUnit * 1.5;
  const gap1 = xUnit;
  const mainH = xUnit * 2.5;
  const gap2 = xUnit * 2;
  const bottomAreaH = xUnit * 1.5;
  const gap3 = xUnit;

  const topY = xUnit;
  const mainY = topY + topAreaH + gap1;
  const contentsY = mainY + mainH + gap2;
  const contentsH = Math.max(xUnit * 3, 1 - contentsY - gap3 - bottomAreaH - xUnit);
  const bottomY = contentsY + contentsH + gap3;

  return {
    category: "xbanner",
    profile: "xbanner-stack",
    titleRect: rect(marginX, mainY, innerW, mainH),
    subtitleRect: rect(marginX, topY, innerW, topAreaH * 0.6),
    bodyRect: rect(marginX, contentsY, innerW, contentsH),
    badgeRect: rect(marginX, bottomY, innerW * 0.5, bottomAreaH * 0.5),
    imageRect: rect(marginX, contentsY, innerW, contentsH),
    footerRect: rect(marginX, bottomY + bottomAreaH * 0.5, innerW, bottomAreaH * 0.45),
  };
}

/** 현수막 Wide — 짧은 변(세로) 12등분, 좌 Logo/Sub · 우 Main+Sub */
function computePlacardWideLayout(size: Pick<CanvasSize, "width" | "height">): AxisLayoutRects {
  const xUnit = computeGridUnit(size, 12);
  const normXUnit = xUnit / Math.max(1, size.width);
  const normYUnit = xUnit / Math.max(1, size.height);

  const leftW = 0.235;
  const bgInsetT = normYUnit;
  const bgInsetB = normYUnit * 1.2;
  const bgInsetL = normXUnit * 0.26;
  const bgInsetR = normXUnit * 1.2;
  const bgLeft = leftW + bgInsetL;
  const bgTop = bgInsetT;
  const bgW = Math.max(0.1, 1 - bgLeft - bgInsetR);
  const bgH = Math.max(0.1, 1 - bgTop - bgInsetB);

  return {
    category: "placard-wide",
    profile: "placard-wide",
    titleRect: rect(bgLeft + bgW * 0.08, bgTop + bgH * 0.22, bgW * 0.84, bgH * 0.28),
    subtitleRect: rect(bgLeft + bgW * 0.08, bgTop + bgH * 0.52, bgW * 0.84, bgH * 0.14),
    bodyRect: rect(0.04, bgTop + bgH * 0.55, leftW * 0.85, bgH * 0.2),
    badgeRect: rect(bgLeft + bgW * 0.08, bgTop + bgH * 0.68, bgW * 0.4, bgH * 0.1),
    imageRect: rect(0, 0, 1, 1),
    footerRect: rect(0.04, 1 - normYUnit * 2, leftW * 0.9, normYUnit * 1.5),
    imageCornerRadiusPx: xUnit,
  };
}

export function computeBrandLayoutRects(
  profile: BrandLayoutProfile,
  size: Pick<CanvasSize, "width" | "height">
): AxisLayoutRects {
  switch (profile) {
    case "web-wide":
      return computeWebWideLayout(size);
    case "web-basic-model-b":
      return computeWebBasicLayout(size, "model-b");
    case "web-basic-image":
      return computeWebBasicLayout(size, "image");
    case "web-square":
      return computeWebSquareLayout(size);
    case "web-live":
      return computeWebLiveLayout(size);
    case "web-wide-event":
      return computeWebWideEventLayout(size);
    case "sns-grid":
      return computeSnsGridLayout(size);
    case "poster-window":
      return computePosterWindowLayout(size);
    case "poster-full-image":
      return computePosterFullImageLayout(size);
    case "xbanner-stack":
      return computeXbannerStackLayout(size);
    case "placard-wide":
      return computePlacardWideLayout(size);
    default:
      return computeWebBasicLayout(size, "image");
  }
}

export function computeBrandLayoutRectsForTemplate(
  templateCategory: TemplateCategory | undefined,
  templateId: string | undefined,
  size: Pick<CanvasSize, "width" | "height">
): AxisLayoutRects {
  const profile = resolveBrandLayoutProfile(templateCategory, templateId, size);
  return computeBrandLayoutRects(profile, size);
}

/** @deprecated — 템플릿 정보 없이 비율만으로 계산 (폴백용) */
export function computeAxisLayoutRects(category: AxisLayoutCategory): AxisLayoutRects {
  const refSize =
    category === "square"
      ? { width: 260, height: 260 }
      : category === "wide" || category === "wide-event"
        ? { width: 1440, height: 300 }
        : category === "live"
          ? { width: 320, height: 568 }
          : { width: 466, height: 262 };
  const profileMap: Record<AxisLayoutCategory, BrandLayoutProfile> = {
    wide: "web-wide",
    basic: "web-basic-image",
    square: "web-square",
    live: "web-live",
    "wide-event": "web-wide-event",
    sns: "sns-grid",
    "poster-window": "poster-window",
    "poster-full": "poster-full-image",
    xbanner: "xbanner-stack",
    "placard-wide": "placard-wide",
  };
  return computeBrandLayoutRects(profileMap[category], refSize);
}

export function computeAxisLayoutRectsForSize(
  size: Pick<CanvasSize, "width" | "height">,
  templateCategory?: TemplateCategory,
  templateId?: string
): AxisLayoutRects {
  if (templateCategory || templateId) {
    return computeBrandLayoutRectsForTemplate(templateCategory, templateId, size);
  }
  const category = detectAxisLayoutCategoryFromSize(size);
  return computeAxisLayoutRects(category);
}

/** 가이드 pt → 캔버스 짧은 변 대비 비율 (기준 캔버스 short side) */
const TYPO_REF: Record<
  BrandLayoutProfile,
  { mainPt: number; subPt: number; tagPt: number; refShort: number }
> = {
  "web-wide": { mainPt: 44, subPt: 20, tagPt: 14, refShort: 300 },
  "web-basic-model-b": { mainPt: 25, subPt: 15, tagPt: 11, refShort: 262 },
  "web-basic-image": { mainPt: 25, subPt: 13, tagPt: 11, refShort: 262 },
  "web-square": { mainPt: 21, subPt: 10, tagPt: 10, refShort: 260 },
  "web-live": { mainPt: 27, subPt: 15, tagPt: 12, refShort: 320 },
  "web-wide-event": { mainPt: 42, subPt: 24, tagPt: 14, refShort: 300 },
  "sns-grid": { mainPt: 32, subPt: 18, tagPt: 14, refShort: 1080 },
  "poster-window": { mainPt: 48, subPt: 24, tagPt: 16, refShort: 594 },
  "poster-full-image": { mainPt: 48, subPt: 24, tagPt: 16, refShort: 594 },
  "xbanner-stack": { mainPt: 36, subPt: 20, tagPt: 14, refShort: 600 },
  "placard-wide": { mainPt: 40, subPt: 18, tagPt: 14, refShort: 700 },
};

function computeFontScalePercent(targetPx: number, defaultFormulaPx: number): number {
  if (defaultFormulaPx <= 0) return 100;
  return Math.round(Math.max(50, Math.min(200, (targetPx / defaultFormulaPx) * 100)));
}

export function brandLayoutTypographyScales(
  profile: BrandLayoutProfile,
  size: Pick<CanvasSize, "width" | "height">
): { title: number; subtitle: number; badge: number } {
  const ref = TYPO_REF[profile];
  const short = getShortSide(size);
  const mainPx = (ref.mainPt / ref.refShort) * short;
  const subPx = (ref.subPt / ref.refShort) * short;
  const tagPx = (ref.tagPt / ref.refShort) * short;

  const defaultTitlePx = Math.max(10, Math.min(size.width * 0.08, size.height * 0.22));
  const defaultSubPx = size.width * 0.045;

  return {
    title: computeFontScalePercent(mainPx, defaultTitlePx),
    subtitle: computeFontScalePercent(subPx, defaultSubPx),
    badge: computeFontScalePercent(tagPx, defaultSubPx * 0.85),
  };
}

export function axisLayoutTypographyPatch(
  profile?: BrandLayoutProfile,
  size?: Pick<CanvasSize, "width" | "height">
): Pick<
  DesignContent,
  | "posterTitleTypography"
  | "posterSubtitleTypography"
  | "titleFont"
  | "subtitleFont"
  | "bodyFont"
  | "posterTitleFontScale"
  | "posterSubtitleFontScale"
> {
  const scales =
    profile && size ? brandLayoutTypographyScales(profile, size) : { title: 100, subtitle: 100, badge: 100 };

  return {
    titleFont: FONT_FAMILY_PRETENDARD,
    subtitleFont: FONT_FAMILY_PRETENDARD,
    bodyFont: FONT_FAMILY_PRETENDARD,
    posterTitleFontScale: scales.title,
    posterSubtitleFontScale: scales.subtitle,
    posterTitleTypography: {
      fontFamily: FONT_FAMILY_PRETENDARD,
      fontWeight: 700,
      lineHeight: 1.15,
      letterSpacingEm: -0.025,
    },
    posterSubtitleTypography: {
      "subtitle-1": {
        fontFamily: FONT_FAMILY_PRETENDARD,
        fontWeight: SUBTITLE_DEFAULT_FONT_WEIGHT,
        lineHeight: 1.35,
        letterSpacingEm: -0.02,
      },
    },
  };
}

export function computeBrandImageCornerRadiusPx(
  layout: Pick<AxisLayoutRects, "imageCornerRadiusPx" | "profile">,
  _boxWidthPx: number,
  boxHeightPx: number
): number {
  if (layout.imageCornerRadiusPx != null && layout.imageCornerRadiusPx >= 0) {
    return layout.imageCornerRadiusPx;
  }
  if (layout.profile === "poster-full-image") return 0;
  const h = Math.max(1, boxHeightPx);
  return Math.min(32, h * 0.05);
}

/** LG U+ 공식 브랜드 가이드 기본 배치·타이포 적용 */
export function applyAxisLayoutGuide(
  content: DesignContent,
  canvasSize: Pick<CanvasSize, "width" | "height">,
  opts?: { force?: boolean; templateCategory?: TemplateCategory; templateId?: string }
): DesignContent {
  if (content.axisLayoutApplied && !opts?.force) return content;

  const layout = computeBrandLayoutRectsForTemplate(
    opts?.templateCategory,
    opts?.templateId,
    canvasSize
  );
  const typo = axisLayoutTypographyPatch(layout.profile, canvasSize);

  const subtitleText = content.subtitle?.trim() ?? content.posterSubtitles?.[0]?.text ?? "";
  const badgeText = content.posterBadges?.[0]?.text ?? subtitleText;

  const isSquareLike = layout.category === "square";
  const isFullImagePoster = layout.profile === "poster-full-image";

  const posterSubtitles =
    isSquareLike && !content.posterSubtitles?.length
      ? content.posterSubtitles ?? []
      : content.posterSubtitles?.length
        ? content.posterSubtitles
        : [{ id: "subtitle-1", text: subtitleText }];

  const logoPosition =
    content.logoPosition ??
    resolveTemplateDefaultLogoPosition(opts?.templateId, opts?.templateCategory);
  const logoHeightPx =
    computeCanvasLogoHeightPx(
      canvasSize.width,
      canvasSize.height,
      resolveTemplateLogoScale(opts?.templateId, opts?.templateCategory)
    );
  const titleRect = insetTitleRectFromLogo({
    titleRect: layout.titleRect,
    displayW: canvasSize.width,
    displayH: canvasSize.height,
    logoPosition,
    logoHeightPx,
    logoOption: content.logoOption,
  });

  return {
    ...content,
    ...typo,
    axisLayoutApplied: true,
    axisLayoutCategory: layout.category,
    axisLayoutProfile: layout.profile,
    axisLayoutImageCornerRadiusPx: layout.imageCornerRadiusPx,
    posterTitleRect: titleRect,
    posterTitleAlign:
      layout.category === "square" || layout.category === "sns"
        ? "left"
        : layout.category === "placard-wide"
          ? "center"
          : "left",
    posterBodyRect: layout.bodyRect,
    posterBodyRects: { ...(content.posterBodyRects ?? {}), "body-1": layout.bodyRect },
    posterBodyAlign:
      layout.category === "placard-wide" ? "center" : "left",
    posterFooterRect: layout.footerRect,
    posterFooterOnCanvas:
      content.posterFooterOnCanvas ?? (content.posterFooterUserDismissed ? false : true),
    posterFooterAlign: content.posterFooterAlign ?? "left",
    posterBackgroundImageRect: layout.imageRect,
    posterImagePlacementMode: isFullImagePoster ? "full-background" : content.posterImagePlacementMode ?? "round-box",
    posterBadgeRect: layout.badgeRect,
    posterBadgeRects: { ...(content.posterBadgeRects ?? {}), "badge-1": layout.badgeRect },
    posterBadgeColor: content.posterBadgeColor ?? "magenta",
    posterBadges: content.posterBadges?.length
      ? content.posterBadges
      : [{ id: "badge-1", text: badgeText, color: "magenta" as const }],
    posterSubtitleRects: { ...(content.posterSubtitleRects ?? {}), "subtitle-1": layout.subtitleRect },
    posterSubtitles,
    logoPosition,
  };
}

export function shouldApplyAxisLayoutGuide(
  templateId: string | undefined,
  content: DesignContent,
  templateCategory?: TemplateCategory
): boolean {
  if (content.axisLayoutApplied) return false;
  const id = (templateId ?? "").trim();
  if (id === "rcs-568x368") return false;
  if (id === "safety-caution-maintenance") return false;
  if (content.posterTitleRect && content.posterBackgroundImageRect) return false;

  if (templateCategory === "rcs" || templateCategory === "safety-caution") return false;

  // 세로형 현수막 등 비와이드 placard는 기존 고정 레이아웃 유지
  if (id === "placard-vertical" || id === "placard-600x1800") return false;

  return true;
}

const MIN_VISIBLE_FOOTER_NORM_H = 0.012;

function isPlacardManagedFooterTemplate(
  templateId?: string,
  templateCategory?: TemplateCategory
): boolean {
  const id = (templateId ?? "").trim();
  return (
    templateCategory === "placard" ||
    id === "placard-wide-landscape" ||
    id === "placard-1000x600" ||
    id === "placard-2000x1000" ||
    id === "placard-600x1800" ||
    id === "placard-vertical"
  );
}

function isDegenerateFooterRect(r?: NormalizedRect): boolean {
  if (!r) return true;
  return r.height < MIN_VISIBLE_FOOTER_NORM_H || r.width < 0.02;
}

/**
 * 레거시 저장값 복구: posterFooterOnCanvas=false·거의 0 높이 rect 등으로
 * 유의사항이 안 보이던 디자인을 템플릿 기준 하단 좌측 영역으로 되돌린다.
 */
export function migratePosterFooterForTemplate(
  content: DesignContent,
  opts: {
    templateId?: string;
    templateCategory?: TemplateCategory;
    canvasSize: Pick<CanvasSize, "width" | "height">;
  }
): DesignContent {
  const id = (opts.templateId ?? "").trim();
  if (id === "rcs-568x368" || id === "safety-caution-maintenance") return content;
  if (opts.templateCategory === "rcs" || opts.templateCategory === "safety-caution") return content;
  if (content.posterFooterUserDismissed) return content;

  const placardManaged = isPlacardManagedFooterTemplate(id, opts.templateCategory);
  const layout = placardManaged
    ? null
    : computeBrandLayoutRectsForTemplate(opts.templateCategory, opts.templateId, opts.canvasSize);

  let next = content;
  let touched = false;

  if (content.posterFooterOnCanvas === false) {
    next = { ...next, posterFooterOnCanvas: true };
    if (layout && !next.posterFooterRectLocked) {
      next = { ...next, posterFooterRect: layout.footerRect };
    }
    touched = true;
  }

  const defaultAlign =
    placardManaged || layout?.category === "placard-wide" ? "center" : "left";

  if (next.posterFooterAlign == null) {
    next = { ...next, posterFooterAlign: defaultAlign };
    touched = true;
  }

  if (
    layout &&
    !next.posterFooterRectLocked &&
    isDegenerateFooterRect(next.posterFooterRect)
  ) {
    next = { ...next, posterFooterRect: layout.footerRect };
    touched = true;
  }

  return touched ? next : content;
}

export { SUBTITLE_DEFAULT_FONT_WEIGHT, BADGE_DEFAULT_FONT_WEIGHT };
