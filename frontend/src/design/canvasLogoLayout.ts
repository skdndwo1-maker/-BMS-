import { clampNormRect as clampTextNormRect, TEXT_CANVAS_MARGIN_N } from "./designCanvasAlign";
import type { DesignContent, LogoPosition, TemplateCategory } from "./types";

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

export function estimateBrandLogoWidthPx(args: {
  logoHeightPx: number;
  logoOption?: DesignContent["logoOption"];
  displayW: number;
  isPlacard?: boolean;
  placardMaxWidthPx?: number;
}): number {
  const { logoHeightPx, logoOption, displayW, isPlacard, placardMaxWidthPx } = args;
  const maxCap = placardMaxWidthPx ?? displayW * (isPlacard ? 0.22 : 0.45);
  const aspect =
    logoOption === "CI" ? 1.15 : logoOption === "SLOGAN" ? 3.4 : 2.2;
  return Math.min(maxCap, Math.max(logoHeightPx * 0.8, logoHeightPx * aspect));
}

/** BI/CI/Slogan 또는 업로드 로고의 정규화 bounding box */
export function computeLogoBoundingBoxNorm(args: {
  displayW: number;
  displayH: number;
  logoPosition: LogoPosition;
  logoHeightPx: number;
  logoOption?: DesignContent["logoOption"];
  customUploadedLogoRect?: NormalizedLogoRect | null;
  isPlacard?: boolean;
  placardMaxWidthPx?: number;
}): NormalizedLogoRect | null {
  if (args.customUploadedLogoRect) return args.customUploadedLogoRect;
  if (!args.logoOption) return null;
  const logoWidthPx = estimateBrandLogoWidthPx({
    logoHeightPx: args.logoHeightPx,
    logoOption: args.logoOption,
    displayW: args.displayW,
    isPlacard: args.isPlacard,
    placardMaxWidthPx: args.placardMaxWidthPx,
  });
  return computeDefaultCustomUploadedLogoRect({
    displayW: args.displayW,
    displayH: args.displayH,
    logoPosition: args.logoPosition,
    logoHeightPx: args.logoHeightPx,
    logoWidthPx,
  });
}

function rectsOverlap(a: NormalizedLogoRect, b: NormalizedLogoRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function expandNormRect(
  r: NormalizedLogoRect,
  padX: number,
  padY: number
): NormalizedLogoRect {
  return {
    x: r.x - padX,
    y: r.y - padY,
    width: r.width + padX * 2,
    height: r.height + padY * 2,
  };
}

function rectNearlyEqual(a: NormalizedLogoRect, b: NormalizedLogoRect, eps = 0.003): boolean {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps
  );
}

function unionNormRects(rects: NormalizedLogoRect[]): NormalizedLogoRect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxR = Math.max(maxR, r.x + r.width);
    maxB = Math.max(maxB, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxR - minX, height: maxB - minY };
}

type TextBlockGroupMember = {
  kind: "title" | "subtitle" | "body";
  id?: string;
  rect: NormalizedLogoRect;
};

function collectTextBlockGroupMembers(content: DesignContent): TextBlockGroupMember[] {
  const members: TextBlockGroupMember[] = [];

  if (
    content.posterTitleOnCanvas !== false &&
    content.posterTitleRect &&
    !content.posterTitleRectLocked
  ) {
    members.push({ kind: "title", rect: content.posterTitleRect });
  }

  for (const s of content.posterSubtitles ?? []) {
    if (!s.text?.trim()) continue;
    if (content.posterSubtitleRectLocked?.[s.id]) continue;
    const r = content.posterSubtitleRects?.[s.id];
    if (r) members.push({ kind: "subtitle", id: s.id, rect: r });
  }

  if (content.posterBodyOnCanvas !== false) {
    const bodies = content.posterBodies?.length
      ? content.posterBodies
      : content.bodyText?.trim()
        ? [{ id: "body-1", text: content.bodyText }]
        : [];
    for (const b of bodies) {
      if (!b.text?.trim()) continue;
      if (content.posterBodyRectLocked?.[b.id]) continue;
      const r =
        content.posterBodyRects?.[b.id] ??
        (b.id === "body-1" ? content.posterBodyRect : undefined);
      if (r) members.push({ kind: "body", id: b.id, rect: r });
    }
  }

  return members;
}

/** 우상단·중앙 로고: 그룹 내 좌측 요소 폭 축소(세로 간격 유지) */
function shrinkGroupMembersForTopLogo(
  members: TextBlockGroupMember[],
  zone: NormalizedLogoRect,
  gapXN: number,
  logoPosition: LogoPosition
): TextBlockGroupMember[] {
  if (logoPosition !== "top-right" && logoPosition !== "top-center") return members;
  return members.map((m) => {
    const el = { ...m.rect };
    if (el.x + el.width > zone.x + gapXN && el.x < zone.x) {
      const maxRight = zone.x - gapXN;
      if (maxRight > el.x + MIN_AVOID_W) {
        el.width = maxRight - el.x;
      }
    }
    return { ...m, rect: el };
  });
}

/** 그룹 bbox 기준 로고 회피 — 반환 deltaY(정규화) */
function computeTextBlockGroupDeltaY(args: {
  members: TextBlockGroupMember[];
  logo: NormalizedLogoRect;
  logoPosition: LogoPosition;
  gapPx: number;
  displayW: number;
  displayH: number;
}): { deltaY: number; members: TextBlockGroupMember[] } {
  const { logo, logoPosition, gapPx, displayW, displayH } = args;
  const gapXN = gapPx / displayW;
  const gapYN = gapPx / displayH;
  const zone = expandNormRect(logo, gapXN, gapYN);

  let members = shrinkGroupMembersForTopLogo(args.members, zone, gapXN, logoPosition);
  const group = unionNormRects(members.map((m) => m.rect));
  if (!group || !rectsOverlap(group, zone)) {
    return { deltaY: 0, members };
  }

  let deltaY = 0;
  if (logoPosition.startsWith("top")) {
    const floorY = zone.y + zone.height;
    if (group.y < floorY) {
      deltaY = floorY - group.y;
    }
  } else if (logoPosition.startsWith("bottom")) {
    const ceilingY = zone.y;
    const groupBottom = group.y + group.height;
    if (groupBottom > ceilingY) {
      deltaY = ceilingY - groupBottom;
    }
  }

  if (Math.abs(deltaY) < 1e-9) {
    return { deltaY: 0, members };
  }

  const margin = TEXT_CANVAS_MARGIN_N;
  if (deltaY > 0) {
    const maxBottom = Math.max(...members.map((m) => m.rect.y + m.rect.height));
    deltaY = Math.min(deltaY, Math.max(0, 1 - margin - maxBottom));
  } else {
    const minTop = Math.min(...members.map((m) => m.rect.y));
    deltaY = Math.max(deltaY, margin - minTop);
  }

  return { deltaY, members };
}

function applyTextBlockGroupAdjustment(
  content: DesignContent,
  originals: TextBlockGroupMember[],
  adjusted: TextBlockGroupMember[],
  deltaY: number
): DesignContent | null {
  let next = content;
  let touched = false;
  for (let i = 0; i < adjusted.length; i++) {
    const orig = originals[i]!.rect;
    const m = adjusted[i]!;
    const r = clampTextNormRect({ ...m.rect, y: m.rect.y + deltaY }, CLAMP_OPTS);
    if (rectNearlyEqual(orig, r)) continue;
    touched = true;
    if (m.kind === "title") {
      next = { ...next, posterTitleRect: r };
    } else if (m.kind === "subtitle" && m.id) {
      next = {
        ...next,
        posterSubtitleRects: { ...(next.posterSubtitleRects ?? {}), [m.id]: r },
      };
    } else if (m.kind === "body" && m.id) {
      next = {
        ...next,
        posterBodyRects: { ...(next.posterBodyRects ?? {}), [m.id]: r },
        ...(m.id === "body-1" ? { posterBodyRect: r } : {}),
      };
    }
  }
  return touched ? next : null;
}

const CLAMP_OPTS = { margin: TEXT_CANVAS_MARGIN_N };
const MIN_AVOID_H = 0.03;
const MIN_AVOID_W = 0.04;

/** 독립 요소(배지·유의사항)용 — 개별 rect 회피 */
export function avoidElementRectFromLogo(args: {
  element: NormalizedLogoRect;
  logo: NormalizedLogoRect;
  logoPosition: LogoPosition;
  gapPx: number;
  displayW: number;
  displayH: number;
}): NormalizedLogoRect {
  const { element, logo, logoPosition, gapPx, displayW, displayH } = args;
  const gapXN = gapPx / displayW;
  const gapYN = gapPx / displayH;
  const zone = expandNormRect(logo, gapXN, gapYN);
  if (!rectsOverlap(element, zone)) return element;

  let el = { ...element };

  if (logoPosition.startsWith("top")) {
    const floorY = zone.y + zone.height;
    if (
      (logoPosition === "top-right" || logoPosition === "top-center") &&
      el.x + el.width > zone.x + gapXN &&
      el.x < zone.x
    ) {
      const maxRight = zone.x - gapXN;
      if (maxRight > el.x + MIN_AVOID_W) {
        el.width = maxRight - el.x;
      }
    }
    if (rectsOverlap(el, zone) && el.y < floorY) {
      el.y = floorY;
    }
  } else if (logoPosition.startsWith("bottom")) {
    const ceilingY = zone.y;
    if (rectsOverlap(el, zone) && el.y + el.height > ceilingY) {
      const overflow = el.y + el.height - ceilingY;
      el.y = Math.max(TEXT_CANVAS_MARGIN_N, el.y - overflow);
      if (el.y + el.height > ceilingY) {
        el.height = Math.max(MIN_AVOID_H, ceilingY - el.y);
      }
    }
  }

  return clampTextNormRect(el, CLAMP_OPTS);
}

/** 메인 타이틀 rect가 로고와 겹치지 않도록 보정 */
export function insetTitleRectFromLogo(args: {
  titleRect: NormalizedLogoRect;
  displayW: number;
  displayH: number;
  logoPosition: LogoPosition;
  logoHeightPx: number;
  logoOption?: DesignContent["logoOption"];
}): NormalizedLogoRect {
  const logo =
    computeLogoBoundingBoxNorm({
      displayW: args.displayW,
      displayH: args.displayH,
      logoPosition: args.logoPosition,
      logoHeightPx: args.logoHeightPx,
      logoOption: args.logoOption,
    }) ??
    computeDefaultCustomUploadedLogoRect({
      displayW: args.displayW,
      displayH: args.displayH,
      logoPosition: args.logoPosition,
      logoHeightPx: args.logoHeightPx,
    });
  return avoidElementRectFromLogo({
    element: args.titleRect,
    logo,
    logoPosition: args.logoPosition,
    gapPx: computeCanvasLogoTitleGapPx(args.displayW, args.displayH),
    displayW: args.displayW,
    displayH: args.displayH,
  });
}

export type LogoCollisionAvoidanceInput = {
  content: DesignContent;
  displayW: number;
  displayH: number;
  logoPosition: LogoPosition;
  logoHeightPx: number;
  customUploadedLogoRect?: NormalizedLogoRect | null;
  isPlacard?: boolean;
  placardMaxWidthPx?: number;
};

/** 로고와 겹치는 자동 배치 요소만 보정. 변경 없으면 null */
export function applyLogoCollisionAvoidance(input: LogoCollisionAvoidanceInput): DesignContent | null {
  const { content, displayW, displayH, logoPosition, logoHeightPx } = input;
  const logoBox = computeLogoBoundingBoxNorm({
    displayW,
    displayH,
    logoPosition,
    logoHeightPx,
    logoOption: content.logoOption,
    customUploadedLogoRect: input.customUploadedLogoRect,
    isPlacard: input.isPlacard,
    placardMaxWidthPx: input.placardMaxWidthPx,
  });
  if (!logoBox) return null;

  const gapPx = computeCanvasLogoTitleGapPx(displayW, displayH);
  const avoidArgs = {
    logo: logoBox,
    logoPosition,
    gapPx,
    displayW,
    displayH,
  };

  let next = content;
  let touched = false;

  const patchIndependentRect = (
    prev: NormalizedLogoRect | undefined,
    locked: boolean | undefined,
    apply: (c: DesignContent, r: NormalizedLogoRect) => DesignContent
  ) => {
    if (!prev || locked) return;
    const adjusted = avoidElementRectFromLogo({ element: prev, ...avoidArgs });
    if (rectNearlyEqual(adjusted, prev)) return;
    next = apply(next, adjusted);
    touched = true;
  };

  const groupMembers = collectTextBlockGroupMembers(content);
  if (groupMembers.length > 0) {
    const { deltaY, members } = computeTextBlockGroupDeltaY({
      members: groupMembers,
      logo: logoBox,
      logoPosition,
      gapPx,
      displayW,
      displayH,
    });
    const groupPatch = applyTextBlockGroupAdjustment(content, groupMembers, members, deltaY);
    if (groupPatch) {
      next = groupPatch;
      touched = true;
    }
  }

  if (next.posterFooterOnCanvas !== false) {
    patchIndependentRect(next.posterFooterRect, next.posterFooterRectLocked, (c, r) => ({
      ...c,
      posterFooterRect: r,
    }));
  }

  const badges = content.posterBadges?.length
    ? content.posterBadges
    : content.subtitle?.trim() && content.posterBadgeRect
      ? [{ id: "legacy-1", text: content.subtitle, color: content.posterBadgeColor ?? ("magenta" as const) }]
      : [];
  for (const b of badges) {
    if (!b.text?.trim()) continue;
    const idx = badges.indexOf(b);
    const br =
      next.posterBadgeRects?.[b.id] ??
      (idx === 0 ? next.posterBadgeRect : undefined);
    patchIndependentRect(br, next.posterBadgeRectLocked?.[b.id], (c, r) => ({
      ...c,
      posterBadgeRects: { ...(c.posterBadgeRects ?? {}), [b.id]: r },
      ...(idx === 0 ? { posterBadgeRect: r } : {}),
    }));
  }

  return touched ? next : null;
}
