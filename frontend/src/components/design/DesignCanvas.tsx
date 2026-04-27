import {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
  type MouseEvent,
  type FocusEvent,
} from "react";
import type { DesignContent, CanvasSize, AssetLayer } from "@/design/types";
import { DraggableAsset } from "./DraggableAsset";
import { DraggableCanvasOverlay } from "./DraggableCanvasOverlay";

import { defaultCI, defaultBI, defaultSLOGAN } from "@/design/defaultLogos";
import type { LogoPosition } from "@/design/types";
import {
  DEFAULT_POSTER_BG_RECT,
  DEFAULT_POSTER_BADGE_RECT,
  DEFAULT_POSTER_TITLE_RECT,
  DEFAULT_POSTER_BODY_RECT,
  DEFAULT_POSTER_FOOTER_RECT,
  DEFAULT_POSTER_SUBTITLE_RECT,
  DEFAULT_POSTER_SUBTITLE_OFFSET_Y,
} from "@/design/posterDefaults";
import { VI_COLORS, VI_FONT_STACK, getViGridStepPx } from "@/design/viCanvasConstants";
import {
  renderPlainWithBoldRanges,
  renderPlainWithTriStyleRanges,
  renderBodyWithBold,
} from "./bodyRichText";
import {
  applyColorOnSelection,
  sanitizeCharRanges,
  sanitizeColorRanges,
  toggleCharRangesOnSelection,
  type CharRange,
} from "@/design/charStyleRanges";
import {
  applyGroupRectDelta,
  applyGroupRectLeaderResize,
  applyMultiAlign,
  clampNormRect,
  selectedKeysIncludeBody,
  type AlignMode,
} from "@/design/designCanvasAlign";
import {
  addCanvasGroup,
  canGroupSelection,
  canUngroupSelection,
  expandKeysForRectOps,
  findGroupContainingKey,
  isGroupSelectionKey,
  removeGroupsTouchingKeys,
} from "@/design/canvasGroups";
import { migrateBoldMarkdownToRanges, sanitizeBoldRanges } from "@/design/bodyBoldRanges";
import {
  resolvePosterBodyBlocksForRender,
  applyBodyBlockTextEdit,
} from "@/design/posterBodyDisplay";
import { ViAlignmentGrid } from "./ViAlignmentGrid";
import {
  bodyTextStyle,
  flexAlignFromCanvasAlign,
  footerTextStyle,
  getSubtitleAlign,
  resolveFontFamily,
  subtitleTextStyle,
  titleTextStyle,
  type CanvasTextEditTarget,
} from "@/design/canvasTextTypography";
import { measureTextBlock } from "@/design/measureCanvasText";

/** 캔버스 빈 타이틀 플레이스홀더 — 높이 자동 계산·표시 문구와 동일해야 함 */
const TITLE_PLACEHOLDER_TEXT = "메인 타이틀을 입력하세요";

/** 선택한 본문 블록 id들을 제거한 콘텐츠(마지막 블록이면 본문 영역 전체 숨김) */
function applyRemoveBodyBlockIds(c: DesignContent, ids: Set<string>): DesignContent {
  if (ids.size === 0) return c;
  const blocksSource = c.posterBodies?.length
    ? [...c.posterBodies]
    : [{ id: "body-1", text: c.bodyText ?? "" }];
  const nextBlocks = blocksSource.filter((b) => !ids.has(b.id));
  if (nextBlocks.length === 0) {
    return { ...c, posterBodyOnCanvas: false };
  }
  const restRects = { ...(c.posterBodyRects ?? {}) };
  const restBold = { ...(c.posterBodyBoldRanges ?? {}) };
  const restItal = { ...(c.posterBodyItalicRanges ?? {}) };
  const restUnd = { ...(c.posterBodyUnderlineRanges ?? {}) };
  const restColor = { ...(c.posterBodyColorRanges ?? {}) };
  const restTypo = { ...(c.posterBodyTypography ?? {}) };
  const restLocked = { ...(c.posterBodyRectLocked ?? {}) };
  for (const id of ids) {
    delete restRects[id];
    delete restBold[id];
    delete restItal[id];
    delete restUnd[id];
    delete restColor[id];
    delete restTypo[id];
    delete restLocked[id];
  }
  const first = nextBlocks[0];
  const nextBt = first?.id === "body-1" ? (first.text ?? "") : c.bodyText;
  const pr = first?.id === "body-1" ? restRects["body-1"] ?? c.posterBodyRect : c.posterBodyRect;
  return {
    ...c,
    posterBodies: nextBlocks,
    posterBodyRects: restRects,
    posterBodyBoldRanges: restBold,
    posterBodyItalicRanges: restItal,
    posterBodyUnderlineRanges: restUnd,
    posterBodyColorRanges: restColor,
    posterBodyTypography: restTypo,
    posterBodyRectLocked: restLocked,
    bodyText: nextBt,
    posterBodyRect: pr,
  };
}

function normalizeLogoPosition(pos: string | undefined): LogoPosition {
  const allowed: LogoPosition[] = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];
  if (pos && allowed.includes(pos as LogoPosition)) return pos as LogoPosition;
  return "top-left";
}

/** 직접 업로드 로고: 코너 프리셋과 동일한 기준으로 초기 정규화 rect (한 번만 저장) */
function computeDefaultCustomUploadedLogoRect(args: {
  displayW: number;
  displayH: number;
  W: number;
  logoPosition: LogoPosition;
  isXBanner: boolean;
  realAspect: number;
  effectiveLogoWidth: number;
}): { x: number; y: number; width: number; height: number } {
  const { displayW, displayH, W, logoPosition, isXBanner, realAspect, effectiveLogoWidth } = args;
  const basePadRatio = realAspect >= 3 ? 0.02 : 0.04;
  const padRatio = isXBanner ? basePadRatio * 2 : basePadRatio;
  const pad = W * padRatio;
  const approxLogoH = Math.min(displayH * 0.18, Math.max(18, effectiveLogoWidth * 0.3));
  const wN = effectiveLogoWidth / displayW;
  const hN = approxLogoH / displayH;
  let xN: number;
  let yN: number;
  switch (logoPosition) {
    case "top-right":
      xN = (displayW - pad - effectiveLogoWidth) / displayW;
      yN = pad / displayH;
      break;
    case "top-center":
      xN = (displayW / 2 - effectiveLogoWidth / 2) / displayW;
      yN = pad / displayH;
      break;
    case "bottom-left":
      xN = pad / displayW;
      yN = (displayH - pad - approxLogoH) / displayH;
      break;
    case "bottom-right":
      xN = (displayW - pad - effectiveLogoWidth) / displayW;
      yN = (displayH - pad - approxLogoH) / displayH;
      break;
    case "bottom-center":
      xN = (displayW / 2 - effectiveLogoWidth / 2) / displayW;
      yN = (displayH - pad - approxLogoH) / displayH;
      break;
    case "top-left":
    default:
      xN = pad / displayW;
      yN = pad / displayH;
      break;
  }
  return clampNormRect({ x: xN, y: yN, width: wN, height: hN });
}

/** 단일 선택 시 문자 툴바 대상 (클릭 한 번으로 표시) */
function selectedKeyToFormatTarget(key: string | undefined): CanvasTextEditTarget | null {
  if (!key) return null;
  if (key === "title") return { kind: "title" };
  if (key === "footer") return { kind: "footer" };
  if (key === "body") return { kind: "body", id: "body-1" };
  if (key.startsWith("body:")) return { kind: "body", id: key.slice(5) };
  if (key.startsWith("subtitle:")) return { kind: "subtitle", id: key.slice(9) };
  if (key.startsWith("badge:")) return { kind: "badge", id: key.slice(6) };
  return null;
}

export type DesignFocusTarget =
  | "image"
  | "badge"
  | "title"
  | "body"
  | "footer"
  | "logo"
  | `subtitle:${string}`
  | `body:${string}`
  | { assetId: string }
  | null;

interface DesignCanvasProps {
  content: DesignContent;
  templateId?: string;
  canvasSize: CanvasSize;
  zoom: number;
  onContentChange?: (content: DesignContent) => void;
  onFocusChange?: (t: DesignFocusTarget) => void;
  /** VI 12분할 그리드 (캔버스 높이 기준) */
  showViGrid?: boolean;
  /** 요소 이동·리사이즈 시 VI 격자 스냅 (끄면 1px 단위) */
  layoutSnapEnabled?: boolean;
  /** 히스토리 없이 내용만 갱신 (인라인 편집·자동 박스 크기 등) */
  onContentDraftChange?: (content: DesignContent) => void;
  /** 캔버스 텍스트 인라인 편집 시작 직전(현재 상태를 undo 스택에 넣기 위해) */
  onBeginCanvasTextEdit?: () => void;
  /** 좌측 문자 옵션 패널 동기화 */
  onTextFormatTargetChange?: (t: CanvasTextEditTarget | null) => void;
  /** 인라인 편집(더블클릭) 활성 여부 — 좌측 패널 B/I/U 연동 */
  onInlineEditChange?: (active: boolean) => void;
  /** 캔버스에서 텍스트 구간 선택이 바뀔 때(고스트 textarea) — 패널 B/I/U 활성 표시 갱신 */
  onCanvasTextSelectionChanged?: () => void;
}

export type DesignCanvasHandle = {
  getInlineTextSelection: () => [number, number] | null;
  handleTogglePartialStyle: (which: "bold" | "italic" | "underline") => void;
  /** 인라인 편집 중 선택된 글자 구간에만 색상을 적용 */
  handleApplyPartialColor: (hex: string) => void;
  getInlineEditActive: () => boolean;
};

export const DesignCanvas = forwardRef<DesignCanvasHandle, DesignCanvasProps>(function DesignCanvas(
  {
    content,
    templateId,
    canvasSize,
    zoom,
    onContentChange,
    onFocusChange,
    showViGrid,
    layoutSnapEnabled = true,
    onContentDraftChange,
    onBeginCanvasTextEdit,
    onTextFormatTargetChange,
    onInlineEditChange,
    onCanvasTextSelectionChanged,
  },
  ref
) {
  const isXBanner = (templateId ?? "").trim() === "xbanner";
  const isPlacard = useMemo(() => {
    const id = (templateId ?? "").trim();
    return (
      id === "placard-wide-landscape" ||
      id === "placard-1000x600" ||
      id === "placard-2000x1000" ||
      id === "placard-600x1800" ||
      id === "placard-vertical"
    );
  }, [templateId]);
  const RIGHT_BG: Record<NonNullable<DesignContent["rightPanelBg"]>, string> = useMemo(
    () => ({
      white: "#FFFFFF",
      "light-grey": "#F2F2F2",
      ivory: "#FDFAF0",
      "light-pink": "#FFF0F5",
    }),
    []
  );

  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  /** Alt+드래그로 이미지 object-position 조정 시 드래그 시작 시점의 % 기준 */
  const imagePanSessionRef = useRef<{ startX: number; startY: number } | null>(null);
  const [containerW, setContainerW] = useState(800);
  const [containerH, setContainerH] = useState(600);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  /** image | badge | title | body | footer | logo | asset:<id> — ⌘/Ctrl/Shift+클릭으로 복수 선택 */
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const selectedKeysRef = useRef<string[]>([]);
  selectedKeysRef.current = selectedKeys;
  /** 이미지 박스 더블클릭 후: 드래그 = 박스 이동이 아니라 안쪽 이미지 위치(object-position) */
  const [imageInnerPosAdjust, setImageInnerPosAdjust] = useState(false);

  /** 더블클릭 시에만 텍스트 내용 편집(textarea) */
  const [inlineEditTarget, setInlineEditTarget] = useState<CanvasTextEditTarget | null>(null);
  const formatTarget = useMemo((): CanvasTextEditTarget | null => {
    if (selectedKeys.length !== 1) return null;
    return selectedKeyToFormatTarget(selectedKeys[0]);
  }, [selectedKeys]);
  const activeTextTarget = inlineEditTarget ?? formatTarget;
  const titleEditRef = useRef<HTMLTextAreaElement>(null);
  const footerEditRef = useRef<HTMLTextAreaElement>(null);
  const bodyEditRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const subtitleEditRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const badgeEditRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const measure = useCallback(() => {
    if (!outerRef.current) return;
    setContainerW(outerRef.current.clientWidth);
    setContainerH(outerRef.current.clientHeight);
  }, []);
  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    if (content.image instanceof File) {
      const url = URL.createObjectURL(content.image);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setImageUrl(typeof content.image === "string" ? content.image : null);
  }, [content.image]);

  useEffect(() => {
    if (content.logo instanceof File) {
      const url = URL.createObjectURL(content.logo);
      setLogoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setLogoUrl(typeof content.logo === "string" ? content.logo : null);
  }, [content.logo]);

  /** 본문 블록 배열 마이그레이션 (기존 bodyText / posterBodyRect → posterBodies) */
  useEffect(() => {
    if (!onContentChange) return;
    if (content.posterBodies && content.posterBodies.length > 0) return;
    onContentChange({
      ...content,
      posterBodies: [{ id: "body-1", text: content.bodyText ?? "" }],
      posterBodyRects: { ...(content.posterBodyRects ?? {}) },
      posterBodyRect: content.posterBodyRect,
    });
  }, [content, onContentChange, content.posterBodies, content.bodyText, content.posterBodyRect, content.posterBodyRects]);

  /** 레거시 `**굵게**` 본문 → plain + 굵게 범위 */
  useEffect(() => {
    if (!onContentChange) return;
    const bodies = content.posterBodies;
    if (!bodies?.length) return;
    let patchBodies = [...bodies];
    const ranges = { ...content.posterBodyBoldRanges };
    let bodyText = content.bodyText;
    let changed = false;
    for (let i = 0; i < patchBodies.length; i++) {
      const b = patchBodies[i];
      if (!b.text.includes("**")) continue;
      if (ranges[b.id]?.length) continue;
      const { plain, ranges: rs } = migrateBoldMarkdownToRanges(b.text);
      patchBodies[i] = { ...b, text: plain };
      ranges[b.id] = rs;
      if (b.id === "body-1") bodyText = plain;
      changed = true;
    }
    if (!changed) return;
    onContentChange({
      ...content,
      posterBodies: patchBodies,
      posterBodyBoldRanges: ranges,
      bodyText,
    });
  }, [content, onContentChange, content.posterBodies, content.posterBodyBoldRanges, content.bodyText]);

  const getRealSize = () => {
    const dpi = 96;
    switch (canvasSize.unit) {
      case "mm":
        return { width: (canvasSize.width / 25.4) * dpi, height: (canvasSize.height / 25.4) * dpi };
      case "in":
        return { width: canvasSize.width * dpi, height: canvasSize.height * dpi };
      default:
        return { width: canvasSize.width, height: canvasSize.height };
    }
  };

  const realSize = getRealSize();
  const realAspect = realSize.width / realSize.height;

  const padding = 80;
  const availW = containerW - padding;
  const availH = containerH - padding;
  let baseW = availW;
  let baseH = baseW / realAspect;
  if (baseH > availH) {
    baseH = availH;
    baseW = baseH * realAspect;
  }
  const displayW = baseW * zoom;
  const displayH = displayW / realAspect;

  const W = displayW;
  /** VI 12분할 대비 약 1.8배 더 촘촘한 간격 — 정렬 그리드 표시/스냅 공용
   *  현수막(placard)은 그리드 단위를 추가로 키움
   */
  const viBaseStep = Math.max(1, getViGridStepPx(displayH / 22));
  const viDesired =
    isPlacard
      ? viBaseStep * 2 * 1.8
      : viBaseStep;
  const viGridStepPx = viDesired;
  const snapPx = layoutSnapEnabled ? viGridStepPx : 1;
  /** 위 격자 단위를 기준으로 한 셀 높이 — 뱃지 최소 크기용 */
  const gridCellH = displayH / 22;

  const bgColor = content.backgroundColor || "#FFFFFF";
  const titleColor = content.titleColor || VI_COLORS.textPrimary;
  const bodyColor = content.bodyColor || VI_COLORS.textSecondary;
  const subtitleColor = content.subtitleColor ?? titleColor;

  const getBrandLogo = () => {
    switch (content.logoOption) {
      case "BI":
        return defaultBI;
      case "SLOGAN":
        return defaultSLOGAN;
      default:
        return defaultCI;
    }
  };

  const logoPosition = isPlacard ? "top-left" : normalizeLogoPosition(content.logoPosition);

  const getLogoPositionStyle = () => {
    // 로고 여백: 기존의 약 50% 수준으로 축소
    const basePadRatio = realAspect >= 3 ? 0.02 : 0.04;
    // X배너: 로고 여백을 지금의 2배로 확대
    const padRatio = isXBanner ? basePadRatio * 2 : basePadRatio;
    const pad = W * padRatio;
    switch (logoPosition) {
      case "top-right":
        return { top: `${pad}px`, right: `${pad}px` };
      case "top-center":
        return { top: `${pad}px`, left: "50%", transform: "translateX(-50%)" };
      case "top-left":
        return { top: `${pad}px`, left: `${pad}px` };
      case "bottom-left":
        return { bottom: `${pad}px`, left: `${pad}px` };
      case "bottom-right":
        return { bottom: `${pad}px`, right: `${pad}px` };
      case "bottom-center":
        return { bottom: `${pad}px`, left: "50%", transform: "translateX(-50%)" };
      default:
        return { top: `${pad}px`, left: `${pad}px` };
    }
  };

  const brandLogoSrc = getBrandLogo();
  const logoPositionStyle = getLogoPositionStyle();

  const titleScale = (content.posterTitleFontScale ?? 100) / 100;
  const bodyScale = (content.posterBodyFontScale ?? 100) / 100;
  const footerScale = (content.posterFooterFontScale ?? 100) / 100;
  // 폰트 크기: 템플릿 너비 비례 + 높이 상한(오버플로우 방지)
  // - 메인타이틀: 너비의 약 8%
  // - 본문: 너비의 약 4%
  // - 유의사항: 너비의 약 1.5~2%(기본 1.8%)
  const titleFontSize = Math.max(10, Math.min(W * 0.08, displayH * 0.22)) * titleScale;
  const bodyFontSize = Math.max(8, Math.min(W * 0.04, displayH * 0.16)) * bodyScale;
  const disclaimerSize = Math.max(7, Math.min(W * 0.018, displayH * 0.10)) * footerScale;
  /** 부제 크기는 메인 타이틀 배율과 독립(캔버스 너비·posterSubtitleFontScale만 사용)
   * - autofit 효과에서도 참조해야 하므로 본문/타이틀과 같은 위치에서 선언 */
  const subtitleFontSize = W * 0.045 * ((content.posterSubtitleFontScale ?? 100) / 100);

  // 로고: 너비의 15~20%(기본 18%). 가로형(>=3:1)일 때 40% 축소
  const logoBase = W * 0.18;
  const logoWidthBase = Math.max(W * 0.15, Math.min(W * 0.20, realAspect >= 3 ? logoBase * 0.6 : logoBase));
  // BI 시각 보정(기본)
  // 로고 옵션별 크기:
  // - 현수막(placard): CI -10%, BI -60%, SLOGAN 유지
  // - 현수막 제외: BI -60%, 그 외 유지
  const logoOptionScale = isPlacard
    ? content.logoOption === "CI"
      ? 0.9 * 0.8
      : content.logoOption === "BI"
        ? 0.4 * 0.8
        : 1.0 * 0.8
    : content.logoOption === "BI"
      ? 0.4
      : 1.0;
  const logoWidth = Math.max(24, logoWidthBase * logoOptionScale);
  // X배너: 로고 기본 2배, 단 CI는 20% 축소
  const xbannerCiScale = isXBanner && content.logoOption === "CI" ? 0.8 : 1.0;
  const effectiveLogoWidth = isXBanner ? logoWidth * 2 * xbannerCiScale : logoWidth;

  const hasUploadedLogo = Boolean(content.logo);
  const fallbackCustomLogoRect = useMemo(
    () =>
      hasUploadedLogo
        ? computeDefaultCustomUploadedLogoRect({
            displayW,
            displayH,
            W,
            logoPosition,
            isXBanner,
            realAspect,
            effectiveLogoWidth,
          })
        : null,
    [hasUploadedLogo, displayW, displayH, W, logoPosition, isXBanner, realAspect, effectiveLogoWidth]
  );
  const uploadedLogoRect = hasUploadedLogo ? (content.customUploadedLogoRect ?? fallbackCustomLogoRect) : null;

  useLayoutEffect(() => {
    if (!onContentChange) return;
    const c = contentRef.current;
    if (!c.logo || c.customUploadedLogoRect) return;
    const r = computeDefaultCustomUploadedLogoRect({
      displayW,
      displayH,
      W,
      logoPosition,
      isXBanner,
      realAspect,
      effectiveLogoWidth,
    });
    onContentChange({ ...c, customUploadedLogoRect: r });
  }, [
    onContentChange,
    content.logo,
    content.customUploadedLogoRect,
    displayW,
    displayH,
    W,
    logoPosition,
    isXBanner,
    realAspect,
    effectiveLogoWidth,
  ]);

  // 로고/텍스트 여백을 기존의 약 50% 수준으로 축소
  const padRatio = realAspect >= 3 ? 0.02 : 0.04;
  const marginX = padRatio;
  const marginTop = padRatio;
  const gapPx = realAspect >= 3 ? Math.max(8, Math.min(18, displayH * 0.06)) : displayH * 0.035;

  const computeDefaultTextRects = (titleTextRaw: string) => {
    // Compute in px then normalize (0~1). DraggableCanvasOverlay expects normalized rect.
    const xPx = W * marginX;
    const wPx = Math.max(40, W * (1 - marginX * 2));

    // 로고 높이는 실제 이미지 비율을 모르므로 안전한 근사치로 배치(너비 기준, 상한 적용)
    const approxLogoH = Math.min(displayH * 0.18, Math.max(18, effectiveLogoWidth * 0.3));
    const logoY = displayH * marginTop;

    const titleYPx = logoY + approxLogoH + gapPx;
    const titleLineH = Math.max(12, titleFontSize * 1.15);
    const titleCharsPerLine = Math.max(6, Math.floor(wPx / Math.max(10, titleFontSize * 0.9)));
    const titleLen = titleTextRaw.trim().length;
    const computedTitleLines = titleLen ? Math.ceil(titleLen / titleCharsPerLine) : 2;
    const titleLines = Math.min(3, Math.max(2, computedTitleLines));
    const titleH = titleLineH * titleLines + titleLineH * 0.15;

    const bodyYPx = titleYPx + titleH + gapPx;
    const bodyLineH = Math.max(11, bodyFontSize * 1.35);
    const bodyH = Math.min(displayH * 0.42, Math.max(bodyLineH * 4, displayH * 0.18));

    const footerYPx = bodyYPx + bodyH + gapPx;
    const footerLineH = Math.max(10, disclaimerSize * 1.35);
    const footerH = Math.min(displayH * 0.22, Math.max(footerLineH * 2, displayH * 0.10));

    const bottomLimit = displayH * (1 - marginTop);
    let overflow = footerYPx + footerH - bottomLimit;
    let shrinkBodyH = bodyH;
    let shrinkFooterH = footerH;
    let shrinkTitleH = titleH;
    if (overflow > 0) {
      const minFooterH = footerLineH * 1.6;
      const minBodyH = bodyLineH * 2.4;
      const minTitleH = titleLineH * 1.8;

      const bodyRoom = Math.max(0, shrinkBodyH - minBodyH);
      const takeFromBody = Math.min(bodyRoom, overflow);
      shrinkBodyH -= takeFromBody;
      overflow -= takeFromBody;

      const titleRoom = Math.max(0, shrinkTitleH - minTitleH);
      const takeFromTitle = Math.min(titleRoom, overflow);
      shrinkTitleH -= takeFromTitle;
      overflow -= takeFromTitle;

      const footerRoom = Math.max(0, shrinkFooterH - minFooterH);
      const takeFromFooter = Math.min(footerRoom, overflow);
      shrinkFooterH -= takeFromFooter;
      overflow -= takeFromFooter;
    }

    return {
      titleRect: clampNormRect({ x: xPx / W, y: titleYPx / displayH, width: wPx / W, height: shrinkTitleH / displayH }),
      bodyRect: clampNormRect({ x: xPx / W, y: bodyYPx / displayH, width: wPx / W, height: shrinkBodyH / displayH }),
      footerRect: clampNormRect({ x: xPx / W, y: footerYPx / displayH, width: wPx / W, height: shrinkFooterH / displayH }),
      badgeRect: clampNormRect({
        x: xPx / W,
        y: Math.max(displayH * marginTop, titleYPx - gapPx - displayH * 0.06) / displayH,
        width: (W * 0.3) / W,
        height: (displayH * 0.06) / displayH,
      }),
    };
  };

  // 현수막(placard)에서는 메인/본문/유의사항 위치를 고정값으로 강제하고, 드래그/리사이즈를 막는다.
  useLayoutEffect(() => {
    if (!onContentChange) return;
    if (!isPlacard) return;

    const shortSide = Math.min(displayW, displayH);
    const X = shortSide / 12;
    const leftW = displayW * 0.235;
    const bgInsetT = X * 1.0;
    const bgInsetB = X * 1.2;
    const bgInsetL = X * 0.26;
    const bgInsetR = X * 1.2;
    const bgLeftPx = leftW + bgInsetL;
    const bgTopPx = bgInsetT;
    const bgWPx = Math.max(10, displayW - bgLeftPx - bgInsetR);
    const bgHPx = Math.max(10, displayH - bgTopPx - bgInsetB);

    const padPx = X * 0.55;
    const gapPx = X * 0.57;

    const rectX = (bgLeftPx + padPx) / displayW;
    const rectW = Math.max(0.05, (bgWPx - padPx * 2) / displayW);

    const titleHPx = Math.max(X * 2.4, bgHPx * 0.22);
    const bodyHPx = Math.max(X * 1.6, bgHPx * 0.16);
    const footerHPx = Math.max(X * 1.3, bgHPx * 0.12);
    const totalHPx = titleHPx + gapPx + bodyHPx + gapPx + footerHPx;
    const startYPx = bgTopPx + Math.max(0, (bgHPx - totalHPx) / 2);

    const titleRectFixed = {
      x: rectX,
      y: startYPx / displayH,
      width: rectW,
      height: Math.min(0.6, titleHPx / displayH),
    };
    const bodyRectFixed = {
      x: rectX,
      y: (startYPx + titleHPx + gapPx) / displayH,
      width: rectW,
      height: Math.min(0.6, bodyHPx / displayH),
    };
    const footerRectFixed = {
      x: rectX,
      y: (startYPx + titleHPx + gapPx + bodyHPx + gapPx) / displayH,
      width: rectW,
      height: Math.min(0.6, footerHPx / displayH),
    };

    // 유의사항 위치: 현재 텍스트 높이의 0.85x 만큼 하단으로 이동
    const footerDeltaY = footerRectFixed.height * 0.85;
    const maxFooterY = (bgTopPx + bgHPx - padPx - footerHPx) / displayH;
    footerRectFixed.y = Math.max(
      0,
      Math.min(maxFooterY, footerRectFixed.y + footerDeltaY)
    );

    const eq = (
      a?: { x: number; y: number; width: number; height: number },
      b?: { x: number; y: number; width: number; height: number }
    ) =>
      !!a &&
      !!b &&
      Math.abs(a.x - b.x) < 1e-4 &&
      Math.abs(a.y - b.y) < 1e-4 &&
      Math.abs(a.width - b.width) < 1e-4 &&
      Math.abs(a.height - b.height) < 1e-4;

    const c = contentRef.current;
    if (
      eq(c.posterTitleRect, titleRectFixed) &&
      eq(c.posterBodyRect, bodyRectFixed) &&
      eq(c.posterFooterRect, footerRectFixed) &&
      c.posterTitleRectLocked === true &&
      c.posterFooterRectLocked === true &&
      c.posterBodyRectLocked?.["body-1"] === true
    ) {
      return;
    }

    onContentChange({
      ...c,
      posterTitleRect: titleRectFixed,
      posterTitleRectLocked: true,
      posterBodyRect: bodyRectFixed,
      posterBodyRects: { ...(c.posterBodyRects ?? {}), "body-1": bodyRectFixed },
      posterBodyRectLocked: { ...(c.posterBodyRectLocked ?? {}), "body-1": true },
      posterFooterRect: footerRectFixed,
      posterFooterRectLocked: true,
    });
  }, [displayW, displayH, isPlacard, onContentChange]);

  // 텍스트가 생겼는데 rect가 없을 때만: 템플릿 비율 기반으로 초기 rect 자동 계산
  useLayoutEffect(() => {
    if (!onContentChange) return;
    if (isPlacard) return;
    const patch: Partial<DesignContent> = {};

    const showTitle = content.posterTitleOnCanvas !== false;
    const showBody = content.posterBodyOnCanvas !== false;
    const showFooter = content.posterFooterOnCanvas !== false;

    const titleTextRaw = typeof content.title === "string" ? content.title : "";
    const { titleRect, bodyRect, footerRect, badgeRect } = computeDefaultTextRects(titleTextRaw);

    if (showTitle && content.title?.trim() && !content.posterTitleRect) patch.posterTitleRect = titleRect;
    if (showBody && (content.bodyText?.trim() || content.posterBodies?.some((b) => b.text?.trim())) && !content.posterBodyRect)
      patch.posterBodyRect = bodyRect;
    if (showFooter && content.emphasizedTitle?.trim() && !content.posterFooterRect) patch.posterFooterRect = footerRect;
    if (content.subtitle?.trim() && !content.posterBadgeRect) patch.posterBadgeRect = badgeRect;

    if (Object.keys(patch).length === 0) return;
    const next = { ...content, ...patch };
    // 본문 배열이 존재하는 경우, body-1의 rect가 비어있으면 기본 rect를 함께 채움
    if (next.posterBodies?.length && !(next.posterBodyRects?.["body-1"]) && next.posterBodyRect) {
      next.posterBodyRects = { ...(next.posterBodyRects ?? {}), "body-1": next.posterBodyRect };
    }
    onContentChange(next);
  }, [
    W,
    displayH,
    realAspect,
    effectiveLogoWidth,
    titleFontSize,
    bodyFontSize,
    disclaimerSize,
    gapPx,
    marginX,
    marginTop,
    content,
    onContentChange,
  ]);

  const assetLayers = content.assetLayers ?? [];

  /** 다중 선택 시: Shift 없이 클릭 → 단일 선택. Shift+클릭 → 목록에 추가·제거(토글). 같은 요소를 다시 눌러 드래그할 때는 선택 유지 */
  const pickKey = useCallback((key: string, additive: boolean) => {
    setSelectedKeys((prev) => {
      const c = contentRef.current;
      const g = findGroupContainingKey(c.canvasGroups, key);
      if (additive) {
        if (g) {
          const gk = `group:${g.id}`;
          if (prev.includes(gk)) return prev.filter((k) => k !== gk);
          return [...prev, gk];
        }
        if (prev.includes(key)) return prev.filter((k) => k !== key);
        return [...prev, key];
      }
      if (prev.length > 1 && prev.includes(key)) return prev;
      if (g) return [`group:${g.id}`];
      return [key];
    });
  }, []);

  useEffect(() => {
    const keys = expandKeysForRectOps(contentRef.current, selectedKeys);
    if (!keys.includes("image")) setImageInnerPosAdjust(false);
  }, [selectedKeys]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      const ae = document.activeElement;
      if (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) return;
      if ((ae as HTMLElement | null)?.isContentEditable) return;
      setImageInnerPosAdjust(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleAssetUpdate = useCallback(
    (id: string, patch: Partial<AssetLayer>) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const keys = expandKeysForRectOps(c, selectedKeysRef.current);
      const k = `asset:${id}`;
      if (
        keys.length >= 2 &&
        keys.includes(k) &&
        patch.x != null &&
        patch.y != null &&
        patch.width == null &&
        patch.height == null
      ) {
        const a = (c.assetLayers ?? []).find((x) => x.id === id);
        if (a) {
          const dx = patch.x - a.x;
          const dy = patch.y - a.y;
          if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
            const merged = applyGroupRectDelta(c, keys, dx, dy);
            contentRef.current = merged;
            onContentChange(merged);
            return;
          }
        }
      }
      const updated = (c.assetLayers ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x));
      const u = { ...c, assetLayers: updated };
      contentRef.current = u;
      onContentChange(u);
    },
    [onContentChange]
  );

  const handleAssetDelete = useCallback(
    (id: string) => {
      if (!onContentChange) return;
      onContentChange({ ...content, assetLayers: assetLayers.filter((a) => a.id !== id) });
      setSelectedKeys((prev) => prev.filter((x) => x !== `asset:${id}`));
    },
    [content, assetLayers, onContentChange]
  );

  const handleCanvasClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const el = e.target as HTMLElement;
      if (el.closest("[data-canvas-inline-edit]")) return;
      setSelectedKeys([]);
      setInlineEditTarget(null);
      setImageInnerPosAdjust(false);
      onFocusChange?.(null);
    },
    [onFocusChange]
  );

  const lastFormatTargetSigRef = useRef<string | null>(null);

  const endTextEditIfBlurOutside = useCallback((e: FocusEvent<HTMLTextAreaElement>) => {
    const r = e.relatedTarget as HTMLElement | null;
    if (r?.closest("[data-canvas-text-format-panel]")) return;
    if (r?.closest("[data-design-content-panel]")) return;
    setInlineEditTarget(null);
  }, []);

  const bumpTextSelection = useCallback(() => {
    onCanvasTextSelectionChanged?.();
  }, [onCanvasTextSelectionChanged]);

  const removeTitleFromCanvas = useCallback(() => {
    if (!onContentChange) return;
    onContentChange({ ...contentRef.current, posterTitleOnCanvas: false });
    setSelectedKeys((prev) => prev.filter((k) => k !== "title"));
    setInlineEditTarget((cur) => (cur?.kind === "title" ? null : cur));
  }, [onContentChange]);

  const removeOneBodyBlockFromCanvas = useCallback(
    (id: string) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const next = applyRemoveBodyBlockIds(c, new Set([id]));
      onContentChange(next);
      setSelectedKeys((prev) =>
        prev.filter((k) => {
          if (k === "body" && id === "body-1") return false;
          if (k === `body:${id}`) return false;
          return true;
        })
      );
      setInlineEditTarget((cur) => (cur?.kind === "body" && cur.id === id ? null : cur));
    },
    [onContentChange]
  );

  const removeFooterFromCanvas = useCallback(() => {
    if (!onContentChange) return;
    onContentChange({ ...contentRef.current, posterFooterOnCanvas: false });
    setSelectedKeys((prev) => prev.filter((k) => k !== "footer"));
    setInlineEditTarget((cur) => (cur?.kind === "footer" ? null : cur));
  }, [onContentChange]);

  const removeImageFromCanvas = useCallback(() => {
    if (!onContentChange) return;
    const c = contentRef.current;
    imagePanSessionRef.current = null;
    setImageInnerPosAdjust(false);
    onContentChange({
      ...c,
      image: undefined,
      posterBackgroundImageRect: undefined,
      posterImageOpacity: 0,
      posterImagePosX: undefined,
      posterImagePosY: undefined,
    });
    setSelectedKeys((prev) => prev.filter((k) => k !== "image"));
  }, [onContentChange]);

  const removeUploadedLogo = useCallback(() => {
    if (!onContentChange) return;
    const c = contentRef.current;
    onContentChange({
      ...c,
      logo: undefined,
      customUploadedLogoRect: undefined,
    });
    setSelectedKeys((prev) => prev.filter((k) => k !== "uploadedLogo"));
  }, [onContentChange]);

  useEffect(() => {
    if (!onContentChange) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const ae = document.activeElement;
      if (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) return;
      if ((ae as HTMLElement | null)?.isContentEditable) return;
      const c0 = contentRef.current;
      const keys = expandKeysForRectOps(c0, selectedKeysRef.current);
      const removeTitle = keys.includes("title");
      const removeFooter = keys.includes("footer");
      const removeImage = keys.includes("image");
      const removeUploadedLogoKey = keys.includes("uploadedLogo") && Boolean(c0.logo);
      const bodyIds = new Set<string>();
      for (const k of keys) {
        if (k === "body") bodyIds.add("body-1");
        else if (k.startsWith("body:")) bodyIds.add(k.slice(5));
      }
      if (!removeTitle && !removeFooter && !removeImage && !removeUploadedLogoKey && bodyIds.size === 0) return;
      e.preventDefault();
      if (removeImage) imagePanSessionRef.current = null;
      const c = contentRef.current;
      let next: DesignContent = { ...c };
      if (removeTitle) next.posterTitleOnCanvas = false;
      if (removeFooter) next.posterFooterOnCanvas = false;
      if (removeImage) {
        next.image = undefined;
        next.posterBackgroundImageRect = undefined;
        next.posterImageOpacity = 0;
        next.posterImagePosX = undefined;
        next.posterImagePosY = undefined;
      }
      if (removeUploadedLogoKey) {
        next.logo = undefined;
        next.customUploadedLogoRect = undefined;
      }
      if (bodyIds.size > 0) next = applyRemoveBodyBlockIds(next, bodyIds);
      const removedKeys: string[] = [];
      if (removeTitle) removedKeys.push("title");
      if (removeFooter) removedKeys.push("footer");
      if (removeImage) removedKeys.push("image");
      if (removeUploadedLogoKey) removedKeys.push("uploadedLogo");
      for (const id of bodyIds) removedKeys.push(id === "body-1" ? "body" : `body:${id}`);
      next = removeGroupsTouchingKeys(next, [...removedKeys, ...selectedKeysRef.current.filter(isGroupSelectionKey)]);
      onContentChange(next);
      setSelectedKeys((prev) =>
        prev.filter((k) => {
          if (removeTitle && k === "title") return false;
          if (removeFooter && k === "footer") return false;
          if (removeImage && k === "image") return false;
          if (removeUploadedLogoKey && k === "uploadedLogo") return false;
          if (k === "body" || k.startsWith("body:")) {
            const id = k === "body" ? "body-1" : k.slice(5);
            return !bodyIds.has(id);
          }
          return true;
        })
      );
      setInlineEditTarget((cur) => {
        if (!cur) return null;
        if (removeTitle && cur.kind === "title") return null;
        if (removeFooter && cur.kind === "footer") return null;
        if (cur.kind === "body" && bodyIds.has(cur.id)) return null;
        return cur;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onContentChange]);

  useEffect(() => {
    if (inlineEditTarget?.kind === "title") {
      titleEditRef.current?.focus();
      titleEditRef.current?.select();
    } else if (inlineEditTarget?.kind === "footer") {
      footerEditRef.current?.focus();
      footerEditRef.current?.select();
    } else if (inlineEditTarget?.kind === "body") {
      const el = bodyEditRefs.current[inlineEditTarget.id];
      el?.focus();
      el?.select();
    } else if (inlineEditTarget?.kind === "subtitle") {
      const el = subtitleEditRefs.current[inlineEditTarget.id];
      el?.focus();
      el?.select();
    } else if (inlineEditTarget?.kind === "badge") {
      const el = badgeEditRefs.current[inlineEditTarget.id];
      el?.focus();
      el?.select();
    }
  }, [inlineEditTarget]);

  useEffect(() => {
    if (!inlineEditTarget) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setInlineEditTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inlineEditTarget]);

  const getInlineTextSelection = useCallback((): [number, number] | null => {
    if (!inlineEditTarget) return null;
    let el: HTMLTextAreaElement | null = null;
    if (inlineEditTarget.kind === "title") el = titleEditRef.current;
    else if (inlineEditTarget.kind === "footer") el = footerEditRef.current;
    else if (inlineEditTarget.kind === "body") el = bodyEditRefs.current[inlineEditTarget.id];
    else if (inlineEditTarget.kind === "subtitle") el = subtitleEditRefs.current[inlineEditTarget.id];
    else el = badgeEditRefs.current[inlineEditTarget.id];
    if (el && el.selectionStart !== el.selectionEnd) return [el.selectionStart, el.selectionEnd];
    return null;
  }, [inlineEditTarget]);

  const handleTogglePartialStyle = useCallback(
    (which: "bold" | "italic" | "underline") => {
      if (!onContentDraftChange || !inlineEditTarget) return;
      const t = inlineEditTarget;
      const sel = getInlineTextSelection();
      if (!sel) return;
      const [a, b] = sel;
      const c = contentRef.current;
      const applyArr = (plain: string, prev: CharRange[] | undefined) =>
        sanitizeCharRanges(plain.length, toggleCharRangesOnSelection(plain, prev, a, b));
      if (t.kind === "title") {
        const plain = c.title ?? "";
        if (which === "bold")
          onContentDraftChange({ ...c, posterTitleBoldRanges: applyArr(plain, c.posterTitleBoldRanges) });
        else if (which === "italic")
          onContentDraftChange({ ...c, posterTitleItalicRanges: applyArr(plain, c.posterTitleItalicRanges) });
        else onContentDraftChange({ ...c, posterTitleUnderlineRanges: applyArr(plain, c.posterTitleUnderlineRanges) });
        return;
      }
      if (t.kind === "footer") {
        const plain = c.emphasizedTitle ?? "";
        if (which === "bold")
          onContentDraftChange({ ...c, posterFooterBoldRanges: applyArr(plain, c.posterFooterBoldRanges) });
        else if (which === "italic")
          onContentDraftChange({ ...c, posterFooterItalicRanges: applyArr(plain, c.posterFooterItalicRanges) });
        else onContentDraftChange({ ...c, posterFooterUnderlineRanges: applyArr(plain, c.posterFooterUnderlineRanges) });
        return;
      }
      if (t.kind === "body") {
        const id = t.id;
        const block = c.posterBodies?.find((x) => x.id === id);
        const plain = block?.text ?? "";
        const patch = (key: "posterBodyBoldRanges" | "posterBodyItalicRanges" | "posterBodyUnderlineRanges") => {
          const map = { ...(c[key] ?? {}) };
          map[id] = applyArr(plain, map[id]);
          return { ...c, [key]: map };
        };
        if (which === "bold") onContentDraftChange(patch("posterBodyBoldRanges"));
        else if (which === "italic") onContentDraftChange(patch("posterBodyItalicRanges"));
        else onContentDraftChange(patch("posterBodyUnderlineRanges"));
        return;
      }
      if (t.kind === "subtitle") {
        const id = t.id;
        const sub = c.posterSubtitles?.find((x) => x.id === id);
        const plain = sub?.text ?? "";
        const patch = (key: "posterSubtitleBoldRanges" | "posterSubtitleItalicRanges" | "posterSubtitleUnderlineRanges") => {
          const map = { ...(c[key] ?? {}) };
          map[id] = applyArr(plain, map[id]);
          return { ...c, [key]: map };
        };
        if (which === "bold") onContentDraftChange(patch("posterSubtitleBoldRanges"));
        else if (which === "italic") onContentDraftChange(patch("posterSubtitleItalicRanges"));
        else onContentDraftChange(patch("posterSubtitleUnderlineRanges"));
      }
    },
    [inlineEditTarget, onContentDraftChange, getInlineTextSelection]
  );

  /**
   * 인라인 편집 중 선택된 글자 구간에 색상을 적용.
   * 선택이 없거나 편집이 활성화되지 않았으면 호출자(좌측 패널)가 전체 색상으로 폴백 처리.
   */
  const handleApplyPartialColor = useCallback(
    (hex: string) => {
      if (!onContentDraftChange || !inlineEditTarget) return;
      const sel = getInlineTextSelection();
      if (!sel) return;
      const [a, b] = sel;
      const c = contentRef.current;
      const t = inlineEditTarget;
      if (t.kind === "title") {
        const plain = c.title ?? "";
        const next = applyColorOnSelection(plain, c.posterTitleColorRanges, a, b, hex);
        onContentDraftChange({ ...c, posterTitleColorRanges: next });
        return;
      }
      if (t.kind === "footer") {
        const plain = c.emphasizedTitle ?? "";
        const next = applyColorOnSelection(plain, c.posterFooterColorRanges, a, b, hex);
        onContentDraftChange({ ...c, posterFooterColorRanges: next });
        return;
      }
      if (t.kind === "body") {
        const id = t.id;
        const block = c.posterBodies?.find((x) => x.id === id);
        const plain = block?.text ?? "";
        const map = { ...(c.posterBodyColorRanges ?? {}) };
        map[id] = applyColorOnSelection(plain, map[id], a, b, hex);
        onContentDraftChange({ ...c, posterBodyColorRanges: map });
        return;
      }
      if (t.kind === "subtitle") {
        const id = t.id;
        const sub = c.posterSubtitles?.find((x) => x.id === id);
        const plain = sub?.text ?? "";
        const map = { ...(c.posterSubtitleColorRanges ?? {}) };
        map[id] = applyColorOnSelection(plain, map[id], a, b, hex);
        onContentDraftChange({ ...c, posterSubtitleColorRanges: map });
      }
    },
    [inlineEditTarget, onContentDraftChange, getInlineTextSelection]
  );

  useImperativeHandle(
    ref,
    () => ({
      getInlineTextSelection,
      handleTogglePartialStyle,
      handleApplyPartialColor,
      getInlineEditActive: () => inlineEditTarget !== null,
    }),
    [getInlineTextSelection, handleTogglePartialStyle, handleApplyPartialColor, inlineEditTarget]
  );

  useEffect(() => {
    const t = activeTextTarget;
    const sig = !t
      ? ""
      : t.kind === "title"
        ? "title"
        : t.kind === "footer"
          ? "footer"
          : t.kind === "body"
            ? `body:${t.id}`
            : `subtitle:${t.id}`;
    if (lastFormatTargetSigRef.current === sig) return;
    lastFormatTargetSigRef.current = sig;
    onTextFormatTargetChange?.(t);
  }, [activeTextTarget, onTextFormatTargetChange]);

  useEffect(() => {
    onInlineEditChange?.(inlineEditTarget !== null);
  }, [inlineEditTarget, onInlineEditChange]);

  const runAlign = useCallback(
    (mode: AlignMode) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const keys = expandKeysForRectOps(c, selectedKeysRef.current);
      const merged = applyMultiAlign(c, keys, mode);
      contentRef.current = merged;
      onContentChange(merged);
    },
    [onContentChange]
  );

  const groupSelection = useCallback(() => {
    if (!onContentChange) return;
    const c = contentRef.current;
    const res = addCanvasGroup(c, expandKeysForRectOps(c, selectedKeysRef.current));
    if (!res) return;
    contentRef.current = res.content;
    onContentChange(res.content);
    setSelectedKeys([`group:${res.groupId}`]);
  }, [onContentChange]);

  const ungroupSelection = useCallback(() => {
    if (!onContentChange) return;
    const c = contentRef.current;
    const sel = selectedKeysRef.current;
    const touch = [...expandKeysForRectOps(c, sel), ...sel.filter(isGroupSelectionKey)];
    const nextKeys = expandKeysForRectOps(c, sel);
    const next = removeGroupsTouchingKeys(c, touch);
    contentRef.current = next;
    onContentChange(next);
    setSelectedKeys(nextKeys);
  }, [onContentChange]);

  const imageRect = content.posterBackgroundImageRect ?? DEFAULT_POSTER_BG_RECT;
  const badgeRect = content.posterBadgeRect ?? DEFAULT_POSTER_BADGE_RECT;
  const titleRect = content.posterTitleRect ?? DEFAULT_POSTER_TITLE_RECT;
  const footerRect = content.posterFooterRect ?? DEFAULT_POSTER_FOOTER_RECT;

  const posterBodiesSafe = useMemo(
    () => resolvePosterBodyBlocksForRender(content),
    [content.posterBodies, content.bodyText]
  );

  const normBodyRect = (id: string) =>
    content.posterBodyRects?.[id] ??
    (id === "body-1" ? (content.posterBodyRect ?? DEFAULT_POSTER_BODY_RECT) : DEFAULT_POSTER_BODY_RECT);

  const posterSubtitlesSafe = content.posterSubtitles ?? [];

  const updateImageRect = useCallback(
    (next: typeof imageRect) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const prev = c.posterBackgroundImageRect ?? DEFAULT_POSTER_BG_RECT;
      const keys = expandKeysForRectOps(c, selectedKeysRef.current);
      if (next.width !== prev.width || next.height !== prev.height) {
        if (keys.length >= 2 && keys.includes("image")) {
          const merged = applyGroupRectLeaderResize(c, keys, "image", prev, next);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
        const u = { ...c, posterBackgroundImageRect: next };
        contentRef.current = u;
        onContentChange(u);
        return;
      }
      if (keys.length >= 2 && keys.includes("image")) {
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
          const merged = applyGroupRectDelta(c, keys, dx, dy);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
      }
      const u = { ...c, posterBackgroundImageRect: next };
      contentRef.current = u;
      onContentChange(u);
    },
    [onContentChange]
  );

  const updatePanelBgRect = useCallback(
    (next: { x: number; y: number; width: number; height: number }) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const u = { ...c, panelBgRect: next, panelBgOnCanvas: true };
      contentRef.current = u;
      onContentChange(u);
    },
    [onContentChange]
  );

  const updateBadgeItemRect = useCallback(
    (id: string, next: { x: number; y: number; width: number; height: number }) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const prev = c.posterBadgeRects?.[id] ?? DEFAULT_POSTER_BADGE_RECT;
      const key = `badge:${id}`;
      const keys = expandKeysForRectOps(c, selectedKeysRef.current);
      if (next.width !== prev.width || next.height !== prev.height) {
        if (keys.length >= 2 && keys.includes(key)) {
          const merged = applyGroupRectLeaderResize(c, keys, key, prev, next);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
        const u = { ...c, posterBadgeRects: { ...(c.posterBadgeRects ?? {}), [id]: next } };
        contentRef.current = u;
        onContentChange(u);
        return;
      }
      if (keys.length >= 2 && keys.includes(key)) {
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
          const merged = applyGroupRectDelta(c, keys, dx, dy);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
      }
      const u = { ...c, posterBadgeRects: { ...(c.posterBadgeRects ?? {}), [id]: next } };
      contentRef.current = u;
      onContentChange(u);
    },
    [onContentChange]
  );

  const updateTitleRect = useCallback(
    (next: typeof titleRect) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const prev = c.posterTitleRect ?? DEFAULT_POSTER_TITLE_RECT;
      const keys = expandKeysForRectOps(c, selectedKeysRef.current);
      if (next.width !== prev.width || next.height !== prev.height) {
        if (keys.length >= 2 && keys.includes("title")) {
          const merged = applyGroupRectLeaderResize(c, keys, "title", prev, next);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
        const u = { ...c, posterTitleRect: next, posterTitleRectLocked: true };
        contentRef.current = u;
        onContentChange(u);
        return;
      }
      if (keys.length >= 2 && keys.includes("title")) {
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
          const merged = applyGroupRectDelta(c, keys, dx, dy);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
      }
      const u = { ...c, posterTitleRect: next };
      contentRef.current = u;
      onContentChange(u);
    },
    [onContentChange]
  );

  const updateBodyBlockRect = useCallback(
    (id: string, next: { x: number; y: number; width: number; height: number }) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const prev =
        c.posterBodyRects?.[id] ?? (id === "body-1" ? c.posterBodyRect : undefined) ?? DEFAULT_POSTER_BODY_RECT;
      const key = `body:${id}`;
      const keys = expandKeysForRectOps(c, selectedKeysRef.current);
      if (next.width !== prev.width || next.height !== prev.height) {
        if (keys.length >= 2 && selectedKeysIncludeBody(keys, id)) {
          const merged = applyGroupRectLeaderResize(c, keys, key, prev, next);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
        const rects = { ...(c.posterBodyRects ?? {}), [id]: next };
        const lockedMap = { ...(c.posterBodyRectLocked ?? {}), [id]: true };
        const u = {
          ...c,
          posterBodyRects: rects,
          posterBodyRectLocked: lockedMap,
          ...(id === "body-1" ? { posterBodyRect: next } : {}),
        };
        contentRef.current = u;
        onContentChange(u);
        return;
      }
      if (keys.length >= 2 && selectedKeysIncludeBody(keys, id)) {
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
          const merged = applyGroupRectDelta(c, keys, dx, dy);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
      }
      const rects = { ...(c.posterBodyRects ?? {}), [id]: next };
      const u = { ...c, posterBodyRects: rects, ...(id === "body-1" ? { posterBodyRect: next } : {}) };
      contentRef.current = u;
      onContentChange(u);
    },
    [onContentChange]
  );

  const updateSubtitleRect = useCallback(
    (id: string, next: { x: number; y: number; width: number; height: number }) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const prev = c.posterSubtitleRects?.[id] ?? DEFAULT_POSTER_SUBTITLE_RECT;
      const key = `subtitle:${id}`;
      const keys = expandKeysForRectOps(c, selectedKeysRef.current);
      if (next.width !== prev.width || next.height !== prev.height) {
        if (keys.length >= 2 && keys.includes(key)) {
          const merged = applyGroupRectLeaderResize(c, keys, key, prev, next);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
        const u = {
          ...c,
          posterSubtitleRects: { ...(c.posterSubtitleRects ?? {}), [id]: next },
          posterSubtitleRectLocked: { ...(c.posterSubtitleRectLocked ?? {}), [id]: true },
        };
        contentRef.current = u;
        onContentChange(u);
        return;
      }
      if (keys.length >= 2 && keys.includes(key)) {
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
          const merged = applyGroupRectDelta(c, keys, dx, dy);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
      }
      const u = { ...c, posterSubtitleRects: { ...(c.posterSubtitleRects ?? {}), [id]: next } };
      contentRef.current = u;
      onContentChange(u);
    },
    [onContentChange]
  );

  const updateFooterRect = useCallback(
    (next: typeof footerRect) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const prev = c.posterFooterRect ?? DEFAULT_POSTER_FOOTER_RECT;
      const keys = expandKeysForRectOps(c, selectedKeysRef.current);
      if (next.width !== prev.width || next.height !== prev.height) {
        if (keys.length >= 2 && keys.includes("footer")) {
          const merged = applyGroupRectLeaderResize(c, keys, "footer", prev, next);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
        const u = { ...c, posterFooterRect: next, posterFooterRectLocked: true };
        contentRef.current = u;
        onContentChange(u);
        return;
      }
      if (keys.length >= 2 && keys.includes("footer")) {
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
          const merged = applyGroupRectDelta(c, keys, dx, dy);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
      }
      const u = { ...c, posterFooterRect: next };
      contentRef.current = u;
      onContentChange(u);
    },
    [onContentChange]
  );

  /**
   * 텍스트 박스 자동 크기 (Auto-fit)
   * - 정책: 박스가 텍스트보다 넓지 않도록 가장 긴 줄의 측정 너비를 그대로 반영.
   *   글자 추가/줄바꿈 시 자라고, 줄어들면 함께 축소.
   * - 정렬에 따라 앵커를 다르게 두어 박스 좌우 위치가 시각적으로 유지되도록 함.
   * - `*Locked` 플래그가 true면(템플릿 레이아웃 또는 사용자가 수동 리사이즈한 직후)
   *   적용을 건너뛰고, 텍스트가 다시 편집되면 호출부에서 lock이 해제되어 다음 렌더에 맞춤.
   */
  const fitNormalizedRect = useCallback(
    (
      prev: { x: number; y: number; width: number; height: number },
      wantWPx: number,
      wantHPx: number,
      anchor: "left" | "center" | "right",
      bounds: { minWPx: number; maxWPx: number; minHPx: number; maxHPx: number }
    ): { x: number; y: number; width: number; height: number } => {
      const wPx = Math.max(bounds.minWPx, Math.min(bounds.maxWPx, wantWPx));
      const hPx = Math.max(bounds.minHPx, Math.min(bounds.maxHPx, wantHPx));
      const nw = wPx / displayW;
      const nh = hPx / displayH;
      const prevCenter = prev.x + prev.width / 2;
      const prevRight = prev.x + prev.width;
      let nx = prev.x;
      if (anchor === "center") nx = prevCenter - nw / 2;
      else if (anchor === "right") nx = prevRight - nw;
      let ny = prev.y;
      if (nx + nw > 1) nx = 1 - nw;
      if (nx < 0) nx = 0;
      if (ny + nh > 1) ny = 1 - nh;
      if (ny < 0) ny = 0;
      return { x: nx, y: ny, width: nw, height: nh };
    },
    [displayW, displayH]
  );

  useLayoutEffect(() => {
    const draft = onContentDraftChange;
    if (!draft) return;
    if (content.posterTitleOnCanvas === false) return;
    if (content.posterTitleRectLocked) return;
    const tr = content.posterTitleRect ?? DEFAULT_POSTER_TITLE_RECT;
    const raw = content.title?.trim() ? content.title : TITLE_PLACEHOLDER_TEXT;
    const t = content.posterTitleTypography ?? {};
    const m = measureTextBlock({
      text: raw,
      fontPx: titleFontSize,
      fontWeight: t.fontWeight ?? 800,
      fontFamily: resolveFontFamily(t.fontFamily),
      fontStyle: t.fontStyle ?? "normal",
      letterSpacingEm: t.letterSpacingEm ?? -0.025,
      lineHeight: t.lineHeight ?? 1.15,
    });
    /** 박스 외곽선과 글자 사이 약간의 여유: 가장자리에서 글자가 잘리지 않도록 */
    const padX = titleFontSize * 0.18;
    const padY = titleFontSize * 0.4;
    const align = content.posterTitleAlign ?? "left";
    const next = fitNormalizedRect(
      tr,
      m.widthPx + padX,
      m.heightPx + padY,
      align === "center" ? "center" : align === "right" ? "right" : "left",
      {
        minWPx: Math.max(40, titleFontSize * 1.4),
        maxWPx: displayW * 0.96,
        minHPx: Math.max(24, titleFontSize * 0.9),
        maxHPx: displayH * 0.5,
      }
    );
    if (
      Math.abs(next.width - tr.width) < 0.003 &&
      Math.abs(next.height - tr.height) < 0.003 &&
      Math.abs(next.x - tr.x) < 0.003 &&
      Math.abs(next.y - tr.y) < 0.003
    )
      return;
    draft({ ...content, posterTitleRect: next });
  }, [
    content,
    content.title,
    content.posterTitleRect,
    content.posterTitleRectLocked,
    content.posterTitleAlign,
    content.posterTitleTypography,
    titleFontSize,
    displayW,
    displayH,
    onContentDraftChange,
    fitNormalizedRect,
  ]);

  useLayoutEffect(() => {
    const draft = onContentDraftChange;
    if (!draft) return;
    if (content.posterFooterOnCanvas === false) return;
    if (content.posterFooterRectLocked) return;
    if (!content.emphasizedTitle?.trim()) return;
    const fr = content.posterFooterRect ?? DEFAULT_POSTER_FOOTER_RECT;
    const t = content.posterFooterTypography ?? {};
    const m = measureTextBlock({
      text: content.emphasizedTitle,
      fontPx: disclaimerSize,
      fontWeight: t.fontWeight ?? 400,
      fontFamily: resolveFontFamily(t.fontFamily),
      fontStyle: t.fontStyle ?? "normal",
      letterSpacingEm: t.letterSpacingEm ?? 0,
      lineHeight: t.lineHeight ?? 1.6,
    });
    const padX = disclaimerSize * 0.4;
    const padY = disclaimerSize * 0.3;
    const align = content.posterFooterAlign ?? "left";
    const next = fitNormalizedRect(
      fr,
      m.widthPx + padX,
      m.heightPx + padY,
      align === "center" ? "center" : align === "right" ? "right" : "left",
      {
        minWPx: Math.max(40, disclaimerSize * 4),
        maxWPx: displayW * 0.96,
        minHPx: Math.max(16, disclaimerSize * 1.2),
        maxHPx: displayH * 0.22,
      }
    );
    if (
      Math.abs(next.width - fr.width) < 0.003 &&
      Math.abs(next.height - fr.height) < 0.003 &&
      Math.abs(next.x - fr.x) < 0.003 &&
      Math.abs(next.y - fr.y) < 0.003
    )
      return;
    draft({ ...content, posterFooterRect: next });
  }, [
    content,
    content.emphasizedTitle,
    content.posterFooterRect,
    content.posterFooterRectLocked,
    content.posterFooterAlign,
    content.posterFooterTypography,
    disclaimerSize,
    displayW,
    displayH,
    onContentDraftChange,
    fitNormalizedRect,
  ]);

  useLayoutEffect(() => {
    const draft = onContentDraftChange;
    if (!draft) return;
    if (content.posterBodyOnCanvas === false) return;
    const bodies = resolvePosterBodyBlocksForRender(content);
    let next = content;
    let touched = false;
    for (const b of bodies) {
      if (!b.text?.trim()) continue;
      if (content.posterBodyRectLocked?.[b.id]) continue;
      const br =
        next.posterBodyRects?.[b.id] ??
        (b.id === "body-1" ? next.posterBodyRect : undefined) ??
        DEFAULT_POSTER_BODY_RECT;
      const t = next.posterBodyTypography?.[b.id] ?? {};
      const m = measureTextBlock({
        text: b.text,
        fontPx: bodyFontSize,
        fontWeight: t.fontWeight ?? 400,
        fontFamily: resolveFontFamily(t.fontFamily),
        fontStyle: t.fontStyle ?? "normal",
        letterSpacingEm: t.letterSpacingEm ?? 0,
        lineHeight: t.lineHeight ?? 1.75,
      });
      const padX = bodyFontSize * 0.32;
      const padY = bodyFontSize * 0.2;
      const align = next.posterBodyAlign ?? "left";
      const fitted = fitNormalizedRect(
        br,
        m.widthPx + padX,
        m.heightPx + padY,
        align === "center" ? "center" : align === "right" ? "right" : "left",
        {
          minWPx: Math.max(40, bodyFontSize * 4),
          maxWPx: displayW * 0.96,
          minHPx: Math.max(16, bodyFontSize * 1.2),
          maxHPx: displayH * 0.7,
        }
      );
      if (
        Math.abs(fitted.width - br.width) < 0.004 &&
        Math.abs(fitted.height - br.height) < 0.004 &&
        Math.abs(fitted.x - br.x) < 0.004 &&
        Math.abs(fitted.y - br.y) < 0.004
      )
        continue;
      const rects = { ...(next.posterBodyRects ?? {}), [b.id]: fitted };
      next = {
        ...next,
        posterBodyRects: rects,
        ...(b.id === "body-1" ? { posterBodyRect: fitted } : {}),
      };
      touched = true;
    }
    if (touched) draft(next);
  }, [
    content,
    content.bodyText,
    content.posterBodies,
    content.posterBodyRects,
    content.posterBodyRect,
    content.posterBodyRectLocked,
    content.posterBodyAlign,
    content.posterBodyTypography,
    bodyFontSize,
    displayW,
    displayH,
    onContentDraftChange,
    fitNormalizedRect,
  ]);

  useLayoutEffect(() => {
    const draft = onContentDraftChange;
    if (!draft) return;
    const subs = content.posterSubtitles ?? [];
    if (subs.length === 0) return;
    let next = content;
    let touched = false;
    for (let idx = 0; idx < subs.length; idx++) {
      const s = subs[idx]!;
      if (!s.text?.trim()) continue;
      if (content.posterSubtitleRectLocked?.[s.id]) continue;
      const sr =
        next.posterSubtitleRects?.[s.id] ?? {
          ...DEFAULT_POSTER_SUBTITLE_RECT,
          y: Math.min(
            0.78,
            DEFAULT_POSTER_SUBTITLE_RECT.y + idx * DEFAULT_POSTER_SUBTITLE_OFFSET_Y
          ),
        };
      const t = next.posterSubtitleTypography?.[s.id] ?? {};
      const m = measureTextBlock({
        text: s.text,
        fontPx: subtitleFontSize,
        fontWeight: t.fontWeight ?? 680,
        fontFamily: resolveFontFamily(t.fontFamily),
        fontStyle: t.fontStyle ?? "normal",
        letterSpacingEm: t.letterSpacingEm ?? -0.02,
        lineHeight: t.lineHeight ?? 1.35,
      });
      const padX = subtitleFontSize * 0.3;
      const padY = subtitleFontSize * 0.25;
      const align = getSubtitleAlign(next, s.id);
      const fitted = fitNormalizedRect(
        sr,
        m.widthPx + padX,
        m.heightPx + padY,
        align === "center" ? "center" : align === "right" ? "right" : "left",
        {
          minWPx: Math.max(40, subtitleFontSize * 3),
          maxWPx: displayW * 0.96,
          minHPx: Math.max(16, subtitleFontSize * 1.2),
          maxHPx: displayH * 0.4,
        }
      );
      if (
        Math.abs(fitted.width - sr.width) < 0.004 &&
        Math.abs(fitted.height - sr.height) < 0.004 &&
        Math.abs(fitted.x - sr.x) < 0.004 &&
        Math.abs(fitted.y - sr.y) < 0.004
      )
        continue;
      next = {
        ...next,
        posterSubtitleRects: { ...(next.posterSubtitleRects ?? {}), [s.id]: fitted },
      };
      touched = true;
    }
    if (touched) draft(next);
  }, [
    content,
    content.posterSubtitles,
    content.posterSubtitleRects,
    content.posterSubtitleRectLocked,
    content.posterSubtitleAlign,
    content.posterSubtitleTypography,
    content.posterTitleAlign,
    subtitleFontSize,
    displayW,
    displayH,
    onContentDraftChange,
    fitNormalizedRect,
  ]);

  /** VI 1칸 높이의 30%까지 축소 허용(높이·폭 동일 기준의 최소 단계) */
  const minBadgeHGrid = gridCellH * 0.3;
  const badgeCharsOptimal = 4;
  const computeBadgeAutoText = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      const pxH = rect.height * displayH;
      const pxW = rect.width * displayW;
      const minDimPx = Math.max(4, minBadgeHGrid);
      /** 가로 축소 시 현재 높이(px) 이하로는 못 줄임(원형까지) */
      const minWidthPx = Math.max(4, pxH);
      const padXB = Math.max(1, Math.min(pxW * 0.035, pxH * 0.12, pxW * 0.08));
      const fontPx = Math.max(
        2.5,
        Math.min(pxH * 0.44, (Math.max(0, pxW - padXB * 2) / badgeCharsOptimal) * 1.88)
      );
      const paddingY = Math.max(0, pxH * 0.06);
      const paddingX = Math.max(0, pxW * 0.00175);
      return { pxH, pxW, minDimPx, minWidthPx, fontPx, paddingX, paddingY };
    },
    [badgeCharsOptimal, displayH, displayW, minBadgeHGrid]
  );
  const expandedSelKeys = useMemo(
    () => expandKeysForRectOps(content, selectedKeys),
    [content.canvasGroups, selectedKeys]
  );
  const multiSel = expandedSelKeys.length >= 2;

  const titleFlex = flexAlignFromCanvasAlign(content.posterTitleAlign ?? "left");
  const bodyFlex = flexAlignFromCanvasAlign(content.posterBodyAlign ?? "left");
  const footerFlex = flexAlignFromCanvasAlign(content.posterFooterAlign ?? "left");

  const showTitleOnCanvas = content.posterTitleOnCanvas !== false;
  const showBodyOnCanvas = content.posterBodyOnCanvas !== false;
  const showFooterOnCanvas = content.posterFooterOnCanvas !== false;

  return (
    <div
      ref={outerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#F0F0F0",
        display: "flex",
        alignItems: zoom > 1 ? "flex-start" : "center",
        justifyContent: "center",
        overflow: zoom > 1 ? "auto" : "hidden",
        padding: "40px",
        boxSizing: "border-box",
      }}
    >
      {multiSel && (
        <div
          className="pointer-events-auto absolute top-2 left-1/2 z-[120] flex -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white/95 px-2 py-1.5 shadow-md"
          style={{ maxWidth: "calc(100% - 24px)" }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="mr-1 text-[10px] font-medium text-gray-600">{expandedSelKeys.length}개 선택</span>
          {(
            [
              ["left", "좌"],
              ["right", "우"],
              ["centerH", "수평중앙"],
              ["top", "상단"],
              ["bottom", "하단"],
              ["centerV", "수직중앙"],
              ["distributeH", "가로간격"],
              ["distributeV", "세로간격"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:border-[#F43182] hover:text-[#F43182]"
              onClick={() => runAlign(mode)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:border-[#F43182] hover:text-[#F43182]"
            onClick={() => setSelectedKeys([])}
          >
            모두 해제
          </button>
          <button
            type="button"
            disabled={!canGroupSelection(contentRef.current, selectedKeys)}
            className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:border-[#F43182] hover:text-[#F43182] disabled:opacity-40"
            onClick={groupSelection}
          >
            그룹
          </button>
          <button
            type="button"
            disabled={!canUngroupSelection(contentRef.current, selectedKeys)}
            className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:border-[#F43182] hover:text-[#F43182] disabled:opacity-40"
            onClick={ungroupSelection}
          >
            그룹 해제
          </button>
          <span className="text-[9px] text-gray-400">Shift+클릭으로 추가·해제</span>
        </div>
      )}
      <div
        ref={canvasRef}
        id="design-canvas"
        style={{
          position: "relative",
          width: `${displayW}px`,
          height: `${displayH}px`,
          background: bgColor,
          overflow: "hidden",
          flexShrink: 0,
          fontFamily: VI_FONT_STACK,
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        }}
        onClick={handleCanvasClick}
      >
        {/* 현수막(placard): 우측 분할영역 배경 */}
        {isPlacard ? (() => {
          const shortSide = Math.min(displayW, displayH);
          const X = shortSide / 12;
          const leftW = displayW * 0.235;
          const bgInsetT = X * 1.0;
          const bgInsetB = X * 1.2;
          const bgInsetL = X * 0.26;
          const bgInsetR = X * 1.2;
          const bgLeft = leftW + bgInsetL;
          const bgTop = bgInsetT;
          const bgW = Math.max(10, displayW - bgLeft - bgInsetR);
          const bgH = Math.max(10, displayH - bgTop - bgInsetB);
          const bgRadius = X * 1.4;
          const key = (content.rightPanelBg ?? "white") as NonNullable<DesignContent["rightPanelBg"]>;
          const fill = RIGHT_BG[key] ?? RIGHT_BG.white;
          return (
            <div
              style={{
                position: "absolute",
                left: `${bgLeft}px`,
                top: `${bgTop}px`,
                width: `${bgW}px`,
                height: `${bgH}px`,
                background: fill,
                borderRadius: `${bgRadius}px`,
                zIndex: 1,
                pointerEvents: "none",
              }}
            />
          );
        })() : null}

        {showViGrid && (
          <ViAlignmentGrid width={displayW} height={displayH} step={viGridStepPx} />
        )}

        {/* 모든 템플릿: 뒤쪽 라운드 배경 박스 (자유 조정, 항상 맨 뒤) */}
        {content.panelBgOnCanvas && content.panelBgRect ? (
          <DraggableCanvasOverlay
            rect={content.panelBgRect}
            canvasW={displayW}
            canvasH={displayH}
            onRectChange={updatePanelBgRect}
            isSelected={expandedSelKeys.includes("panelBg")}
            onSelect={(opts) => {
              pickKey("panelBg", !!opts?.additive);
            }}
            zIndex={2}
            label="배경 박스"
            borderRadiusMode="auto"
            borderRadiusScale={1.2}
            snapStepPx={snapPx}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background:
                  RIGHT_BG[(content.rightPanelBg ?? "white") as NonNullable<DesignContent["rightPanelBg"]>] ??
                  RIGHT_BG.white,
              }}
            />
          </DraggableCanvasOverlay>
        ) : null}
        {/* 이미지: 드래그·리사이즈, 모서리 라운드 */}
        {imageUrl && (
          <DraggableCanvasOverlay
            rect={imageRect}
            canvasW={displayW}
            canvasH={displayH}
            onRectChange={updateImageRect}
            isSelected={expandedSelKeys.includes("image")}
            onSelect={(opts) => {
              pickKey("image", !!opts?.additive);
              onFocusChange?.("image");
            }}
            zIndex={4}
            label={imageInnerPosAdjust ? "이미지 · 안쪽 위치 조절" : "이미지"}
            borderRadiusScale={2.5}
            snapStepPx={snapPx}
            panDragInsteadOfMove={imageInnerPosAdjust}
            onOverlayDoubleClick={() => {
              setImageInnerPosAdjust(true);
              pickKey("image", false);
              onFocusChange?.("image");
            }}
            onPan={(d, ev) => {
              if (!onContentChange) return;
              const wPx = Math.max(1, imageRect.width * displayW);
              const hPx = Math.max(1, imageRect.height * displayH);
              if (!imagePanSessionRef.current) {
                const c0 = contentRef.current;
                imagePanSessionRef.current = {
                  startX: Number(c0.posterImagePosX ?? 50),
                  startY: Number(c0.posterImagePosY ?? 50),
                };
              }
              const { startX, startY } = imagePanSessionRef.current;
              // 드래그 방향 = 이미지가 따라오도록(마우스 위로 → 위쪽으로, 아래로 → 아래로)
              const nextX = Math.max(0, Math.min(100, startX - (d.dx / wPx) * 100));
              const nextY = Math.max(0, Math.min(100, startY - (d.dy / hPx) * 100));
              onContentChange({
                ...contentRef.current,
                posterImagePosX: nextX,
                posterImagePosY: nextY,
              });
              ev.stopPropagation?.();
            }}
            onPanEnd={() => {
              imagePanSessionRef.current = null;
            }}
            onRequestDelete={onContentChange ? removeImageFromCanvas : undefined}
          >
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: `${content.posterImagePosX ?? 50}% ${content.posterImagePosY ?? 50}%`,
                opacity: Math.min(
                  1,
                  Math.max(0, Number(content.posterImageOpacity ?? 100) / 100)
                ),
                display: "block",
                userSelect: "none",
              }}
            />
          </DraggableCanvasOverlay>
        )}

        {/* 메인 타이틀 / 본문 / 유의사항: 각각 드래그·리사이즈 + 정렬 */}
        {showTitleOnCanvas ? (
          <DraggableCanvasOverlay
            rect={titleRect}
            canvasW={displayW}
            canvasH={displayH}
            onRectChange={updateTitleRect}
            isSelected={expandedSelKeys.includes("title")}
            onSelect={(opts) => {
              pickKey("title", !!opts?.additive);
              onFocusChange?.("title");
            }}
            zIndex={10}
            label="메인 타이틀"
            borderRadiusMode="square"
            snapStepPx={snapPx}
            locked={isPlacard}
            onOverlayDoubleClick={() => {
              onBeginCanvasTextEdit?.();
              setInlineEditTarget({ kind: "title" });
            }}
            onRequestDelete={onContentChange ? removeTitleFromCanvas : undefined}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                minWidth: 0,
                minHeight: 0,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: titleFlex.justifyContent,
                textAlign: titleFlex.textAlign,
              }}
            >
              <div style={{ width: "100%", minWidth: 0, maxHeight: "100%" }}>
                <h1
                  style={{
                    ...titleTextStyle(content, titleFontSize, titleColor),
                    textShadow:
                      "0.45px 0 0 currentColor, -0.45px 0 0 currentColor, 0 0.45px 0 currentColor, 0 -0.45px 0 currentColor",
                    opacity: inlineEditTarget?.kind === "title" ? 0 : 1,
                  }}
                >
                  {(() => {
                    const tw = titleTextStyle(content, titleFontSize, titleColor);
                    const br = content.posterTitleBoldRanges;
                    const ir = content.posterTitleItalicRanges;
                    const ur = content.posterTitleUnderlineRanges;
                    const cr = sanitizeColorRanges(
                      (content.title ?? "").length,
                      content.posterTitleColorRanges
                    );
                    const hasTri =
                      Boolean(br?.length || ir?.length || ur?.length) || cr.length > 0;
                    if (!content.title?.trim() && !hasTri) {
                      return (
                        <span style={{ ...tw, color: "#C4C4C4", textShadow: "none" }}>
                          {TITLE_PLACEHOLDER_TEXT}
                        </span>
                      );
                    }
                    const endsDot = content.title.endsWith(".");
                    const mainText = endsDot ? content.title.slice(0, -1) : content.title;
                    if (hasTri) {
                      const adjColors = endsDot
                        ? cr
                            .map((r) => ({
                              start: Math.min(r.start, mainText.length),
                              end: Math.min(r.end, mainText.length),
                              color: r.color,
                            }))
                            .filter((r) => r.end > r.start)
                        : cr;
                      return (
                        <>
                          {renderPlainWithTriStyleRanges(mainText, br, ir, ur, tw, {
                            defaultWeight: 800,
                            strongWeight: 900,
                            colors: adjColors,
                          })}
                          {endsDot ? (
                            <span
                              style={{
                                display: "inline-block",
                                width: `${titleFontSize * 0.2}px`,
                                height: `${titleFontSize * 0.2}px`,
                                borderRadius: "50%",
                                background: VI_COLORS.brandMagenta,
                                marginLeft: `${titleFontSize * 0.1}px`,
                                verticalAlign: "baseline",
                              }}
                            />
                          ) : null}
                        </>
                      );
                    }
                    return endsDot ? (
                      <>
                        {content.title.slice(0, -1)}
                        <span
                          style={{
                            display: "inline-block",
                            width: `${titleFontSize * 0.2}px`,
                            height: `${titleFontSize * 0.2}px`,
                            borderRadius: "50%",
                            background: VI_COLORS.brandMagenta,
                            marginLeft: `${titleFontSize * 0.1}px`,
                            verticalAlign: "baseline",
                          }}
                        />
                      </>
                    ) : (
                      content.title
                    );
                  })()}
                </h1>
              </div>
            </div>
          </DraggableCanvasOverlay>
        ) : null}

        {posterSubtitlesSafe.map((s, idx) => {
          if (!s.text?.trim()) return null;
          const sr =
            content.posterSubtitleRects?.[s.id] ?? {
              ...DEFAULT_POSTER_SUBTITLE_RECT,
              y: Math.min(
                0.78,
                DEFAULT_POSTER_SUBTITLE_RECT.y + idx * DEFAULT_POSTER_SUBTITLE_OFFSET_Y
              ),
            };
          const subAlign = getSubtitleAlign(content, s.id);
          const subFlex = flexAlignFromCanvasAlign(subAlign);
          return (
            <DraggableCanvasOverlay
              key={s.id}
              rect={sr}
              canvasW={displayW}
              canvasH={displayH}
              onRectChange={(next) => updateSubtitleRect(s.id, next)}
              isSelected={expandedSelKeys.includes(`subtitle:${s.id}`)}
              onSelect={(opts) => {
                pickKey(`subtitle:${s.id}`, !!opts?.additive);
                onFocusChange?.(`subtitle:${s.id}`);
              }}
              zIndex={9}
              label="부제"
              borderRadiusMode="square"
              snapStepPx={snapPx}
              onOverlayDoubleClick={() => {
                onBeginCanvasTextEdit?.();
                setInlineEditTarget({ kind: "subtitle", id: s.id });
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: subFlex.justifyContent,
                  textAlign: subFlex.textAlign,
                }}
              >
                <p
                  style={{
                    ...subtitleTextStyle(content, s.id, subtitleFontSize, subtitleColor),
                    margin: 0,
                    width: "100%",
                    opacity:
                      inlineEditTarget?.kind === "subtitle" && inlineEditTarget.id === s.id ? 0 : 1,
                  }}
                >
                  {(() => {
                    const subColors = sanitizeColorRanges(
                      s.text.length,
                      content.posterSubtitleColorRanges?.[s.id]
                    );
                    const hasSubTri =
                      Boolean(content.posterSubtitleBoldRanges?.[s.id]?.length) ||
                      Boolean(content.posterSubtitleItalicRanges?.[s.id]?.length) ||
                      Boolean(content.posterSubtitleUnderlineRanges?.[s.id]?.length) ||
                      subColors.length > 0;
                    if (!hasSubTri) return s.text;
                    return renderPlainWithTriStyleRanges(
                      s.text,
                      content.posterSubtitleBoldRanges?.[s.id],
                      content.posterSubtitleItalicRanges?.[s.id],
                      content.posterSubtitleUnderlineRanges?.[s.id],
                      subtitleTextStyle(content, s.id, subtitleFontSize, subtitleColor),
                      { defaultWeight: 680, strongWeight: 800, colors: subColors }
                    );
                  })()}
                </p>
              </div>
            </DraggableCanvasOverlay>
          );
        })}

        {showBodyOnCanvas
          ? posterBodiesSafe.map((b, bi) => {
          const br = normBodyRect(b.id);
          const bodyKey = `body:${b.id}`;
          const bStyle = bodyTextStyle(content, b.id, bodyFontSize, bodyColor);
          const bColorRanges = sanitizeColorRanges(
            b.text.length,
            content.posterBodyColorRanges?.[b.id]
          );
          const hasTri =
            Boolean(content.posterBodyBoldRanges?.[b.id]?.length) ||
            Boolean(content.posterBodyItalicRanges?.[b.id]?.length) ||
            Boolean(content.posterBodyUnderlineRanges?.[b.id]?.length) ||
            bColorRanges.length > 0;
          return (
            <DraggableCanvasOverlay
              key={b.id}
              rect={br}
              canvasW={displayW}
              canvasH={displayH}
              onRectChange={(next) => updateBodyBlockRect(b.id, next)}
              isSelected={expandedSelKeys.includes(bodyKey) || (b.id === "body-1" && expandedSelKeys.includes("body"))}
              onSelect={(opts) => {
                pickKey(bodyKey, !!opts?.additive);
                const ft: DesignFocusTarget =
                  b.id === "body-1" ? "body" : (`body:${b.id}` as `body:${string}`);
                onFocusChange?.(ft);
              }}
              zIndex={10}
              label={posterBodiesSafe.length > 1 ? `본문 (${bi + 1})` : "본문"}
              borderRadiusMode="square"
              snapStepPx={snapPx}
              locked={isPlacard}
              onOverlayDoubleClick={() => {
                onBeginCanvasTextEdit?.();
                setInlineEditTarget({ kind: "body", id: b.id });
              }}
              onRequestDelete={onContentChange ? () => removeOneBodyBlockFromCanvas(b.id) : undefined}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  textAlign: bodyFlex.textAlign,
                  opacity:
                    inlineEditTarget?.kind === "body" && inlineEditTarget.id === b.id ? 0 : 1,
                }}
              >
                {!b.text?.trim() && !hasTri ? (
                  <span style={{ ...bStyle, color: "#C4C4C4" }}>본문을 입력하세요</span>
                ) : hasTri ? (
                  renderPlainWithTriStyleRanges(
                    b.text,
                    content.posterBodyBoldRanges?.[b.id],
                    content.posterBodyItalicRanges?.[b.id],
                    content.posterBodyUnderlineRanges?.[b.id],
                    bStyle,
                    { defaultWeight: 400, strongWeight: 700, colors: bColorRanges }
                  )
                ) : content.posterBodyBoldRanges?.[b.id]?.length ? (
                  renderPlainWithBoldRanges(b.text, content.posterBodyBoldRanges[b.id], bStyle)
                ) : (
                  renderBodyWithBold(b.text, bStyle)
                )}
              </div>
            </DraggableCanvasOverlay>
          );
        })
          : null}

        {showFooterOnCanvas ? (
          <DraggableCanvasOverlay
            rect={footerRect}
            canvasW={displayW}
            canvasH={displayH}
            onRectChange={updateFooterRect}
            isSelected={expandedSelKeys.includes("footer")}
            onSelect={(opts) => {
              pickKey("footer", !!opts?.additive);
              onFocusChange?.("footer");
            }}
            zIndex={10}
            label="유의사항"
            borderRadiusMode="square"
            snapStepPx={snapPx}
            locked={isPlacard}
            onOverlayDoubleClick={() => {
              onBeginCanvasTextEdit?.();
              setInlineEditTarget({ kind: "footer" });
            }}
            onRequestDelete={onContentChange ? removeFooterFromCanvas : undefined}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                whiteSpace: "pre-wrap",
                textAlign: footerFlex.textAlign,
                ...footerTextStyle(content, disclaimerSize),
                opacity: inlineEditTarget?.kind === "footer" ? 0 : 1,
              }}
            >
              {(() => {
                const ft = footerTextStyle(content, disclaimerSize);
                const fColorRanges = sanitizeColorRanges(
                  (content.emphasizedTitle ?? "").length,
                  content.posterFooterColorRanges
                );
                const hasTriF =
                  Boolean(content.posterFooterBoldRanges?.length) ||
                  Boolean(content.posterFooterItalicRanges?.length) ||
                  Boolean(content.posterFooterUnderlineRanges?.length) ||
                  fColorRanges.length > 0;
                if (!content.emphasizedTitle?.trim() && !hasTriF) {
                  return (
                    <span style={{ ...ft, color: "#C4C4C4" }}>유의사항을 입력하세요</span>
                  );
                }
                return hasTriF ? (
                  renderPlainWithTriStyleRanges(
                    content.emphasizedTitle ?? "",
                    content.posterFooterBoldRanges,
                    content.posterFooterItalicRanges,
                    content.posterFooterUnderlineRanges,
                    footerTextStyle(content, disclaimerSize),
                    { defaultWeight: 400, strongWeight: 700, colors: fColorRanges }
                  )
                ) : (
                  content.emphasizedTitle
                );
              })()}
            </div>
          </DraggableCanvasOverlay>
        ) : null}

        {hasUploadedLogo && uploadedLogoRect && logoUrl ? (
          <DraggableCanvasOverlay
            rect={uploadedLogoRect}
            canvasW={displayW}
            canvasH={displayH}
            onRectChange={(next) => {
              if (!onContentChange) return;
              onContentChange({
                ...contentRef.current,
                customUploadedLogoRect: clampNormRect(next),
              });
            }}
            isSelected={expandedSelKeys.includes("uploadedLogo")}
            onSelect={(opts) => {
              pickKey("uploadedLogo", !!opts?.additive);
              onFocusChange?.("logo");
            }}
            zIndex={15}
            label="업로드 로고"
            borderRadiusMode="square"
            snapStepPx={snapPx}
            onRequestDelete={onContentChange ? removeUploadedLogo : undefined}
          >
            <img
              src={logoUrl}
              alt="업로드 로고"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          </DraggableCanvasOverlay>
        ) : null}

        {content.logoOption ? (
          <div
            style={{
              position: "absolute",
              ...logoPositionStyle,
              zIndex: 12,
              pointerEvents: "auto",
              cursor: "pointer",
              outline: selectedKeys.includes("logo") ? "2px solid #F43182" : undefined,
              outlineOffset: selectedKeys.includes("logo") ? "2px" : undefined,
              borderRadius: selectedKeys.includes("logo") ? "4px" : undefined,
              isolation: "isolate",
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              pickKey("logo", e.shiftKey);
              onFocusChange?.("logo");
            }}
          >
            <img
              src={brandLogoSrc}
              alt="Brand Logo"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              style={{
                width: `${effectiveLogoWidth}px`,
                height: "auto",
                objectFit: "contain",
                display: "block",
                userSelect: "none",
              }}
            />
          </div>
        ) : null}

        {/* 뱃지: 현수막 제외, 최대 3개 */}
        {!isPlacard
          ? (() => {
              const legacyOne =
                content.subtitle?.trim() && content.posterBadgeRect
                  ? [{ id: "legacy-1", text: content.subtitle, color: content.posterBadgeColor ?? "magenta" } as const]
                  : [];
              const badges = (content.posterBadges?.length ? content.posterBadges : legacyOne) as Array<{
                id: string;
                text: string;
                color?: "magenta" | "black";
              }>;
              const rects = content.posterBadgeRects ?? {};
              return badges
                .filter((b) => b.text?.trim())
                .slice(0, 3)
                .map((b, idx) => {
                  const rect = rects[b.id] ?? (idx === 0 ? badgeRect : { ...badgeRect, y: Math.min(0.92, badgeRect.y + idx * 0.07) });
                  const m = computeBadgeAutoText(rect);
                  const fill = (b.color ?? "magenta") === "black" ? "#000000" : "#F43182";
                  return (
                    <DraggableCanvasOverlay
                      key={b.id}
                      rect={rect}
                      canvasW={displayW}
                      canvasH={displayH}
                      onRectChange={(next) => updateBadgeItemRect(b.id, next)}
                      isSelected={expandedSelKeys.includes(`badge:${b.id}`) || (b.id === "legacy-1" && expandedSelKeys.includes("badge"))}
                      onSelect={(opts) => {
                        pickKey(`badge:${b.id}`, !!opts?.additive);
                        onFocusChange?.("badge");
                      }}
                      zIndex={16}
                      label="뱃지"
                      borderRadiusMode="pill"
                      snapStepPx={1}
                      minWidthPx={m.minWidthPx}
                      minHeightPx={m.minDimPx}
                      onOverlayDoubleClick={() => {
                        onBeginCanvasTextEdit?.();
                        setInlineEditTarget({ kind: "badge", id: b.id });
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: fill,
                          color: "#FFFFFF",
                          fontSize: `${m.fontPx}px`,
                          fontWeight: 600,
                          lineHeight: 1.2,
                          padding: `${m.paddingY}px ${m.paddingX}px`,
                          boxSizing: "border-box",
                          textAlign: "center",
                          wordBreak: "keep-all",
                          opacity:
                            inlineEditTarget?.kind === "badge" && inlineEditTarget.id === b.id ? 0 : 1,
                        }}
                      >
                        {b.text}
                      </div>
                    </DraggableCanvasOverlay>
                  );
                });
            })()
          : null}

        {assetLayers.map((asset) => (
          <DraggableAsset
            key={asset.id}
            asset={asset}
            canvasW={displayW}
            canvasH={displayH}
            snapStepPx={snapPx}
            isSelected={expandedSelKeys.includes(`asset:${asset.id}`)}
            onSelect={(id, opts) => {
              pickKey(`asset:${id}`, !!opts?.additive);
              onFocusChange?.({ assetId: id });
            }}
            onUpdate={handleAssetUpdate}
            onDelete={handleAssetDelete}
          />
        ))}

        {/* 현수막(placard): 좌하단 "장소 및 날짜" (유의사항과 동일 크기, 좌정렬) */}
        {isPlacard && (content.placardEventInfo ?? "").trim().length > 0 ? (() => {
          const shortSide = Math.min(displayW, displayH);
          const X = shortSide / 12;
          // 좌/하 여백: 기존 대비 30% 증가
          const infoLeft = X * 1.2 * 1.3;
          const infoBottom = X * 0.6 * 1.3;
          return (
            <div
              style={{
                position: "absolute",
                left: `${infoLeft}px`,
                bottom: `${infoBottom}px`,
                zIndex: 14,
                maxWidth: `${Math.max(10, displayW * 0.235 - infoLeft + X * 0.5)}px`,
                ...footerTextStyle(content, disclaimerSize),
                textAlign: "left",
                fontWeight: 600,
                // 기본 색상: 다크 그레이
                color: "#4A4A4A",
                // 농도: 30% opacity
                opacity: 0.3,
                // 크기: 유의사항 대비 10% 축소
                fontSize: `${disclaimerSize * 0.9}px`,
                lineHeight: 1,
                whiteSpace: "pre-wrap",
                wordBreak: "keep-all",
                pointerEvents: "none",
              }}
            >
              {content.placardEventInfo}
            </div>
          );
        })() : null}

        {inlineEditTarget?.kind === "title" && onContentDraftChange && showTitleOnCanvas && (
          <textarea
            data-canvas-inline-edit
            ref={titleEditRef}
            value={content.title}
            onChange={(e) =>
              onContentDraftChange({
                ...content,
                title: e.target.value,
                posterTitleRectLocked: false,
              })
            }
            onBlur={endTextEditIfBlurOutside}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onSelect={bumpTextSelection}
            onMouseUp={bumpTextSelection}
            style={{
              position: "absolute",
              left: titleRect.x * displayW,
              top: titleRect.y * displayH,
              width: titleRect.width * displayW,
              height: titleRect.height * displayH,
              zIndex: 200,
              resize: "none",
              padding: 4,
              border: "none",
              outline: "2px solid #F43182",
              boxSizing: "border-box",
              background: "rgba(255,255,255,0.92)",
              ...titleTextStyle(content, titleFontSize, titleColor),
              textAlign: titleFlex.textAlign,
            }}
          />
        )}

        {inlineEditTarget?.kind === "footer" && onContentDraftChange && showFooterOnCanvas && (
          <textarea
            data-canvas-inline-edit
            ref={footerEditRef}
            value={content.emphasizedTitle ?? ""}
            onChange={(e) =>
              onContentDraftChange({
                ...content,
                emphasizedTitle: e.target.value,
                posterFooterRectLocked: false,
              })
            }
            onBlur={endTextEditIfBlurOutside}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onSelect={bumpTextSelection}
            onMouseUp={bumpTextSelection}
            style={{
              position: "absolute",
              left: footerRect.x * displayW,
              top: footerRect.y * displayH,
              width: footerRect.width * displayW,
              height: footerRect.height * displayH,
              zIndex: 200,
              resize: "none",
              padding: 4,
              border: "none",
              outline: "2px solid #F43182",
              boxSizing: "border-box",
              background: "rgba(255,255,255,0.92)",
              ...footerTextStyle(content, disclaimerSize),
              textAlign: footerFlex.textAlign,
            }}
          />
        )}

        {inlineEditTarget?.kind === "body" &&
          onContentDraftChange &&
          showBodyOnCanvas &&
          (() => {
            const b = posterBodiesSafe.find((x) => x.id === inlineEditTarget.id);
            if (!b) return null;
            const br = normBodyRect(b.id);
            return (
              <textarea
                key={inlineEditTarget.id}
                data-canvas-inline-edit
                ref={(el) => {
                  bodyEditRefs.current[inlineEditTarget.id] = el;
                }}
                value={b.text}
                onChange={(e) => {
                  const text = e.target.value;
                  const ranges = sanitizeBoldRanges(text.length, content.posterBodyBoldRanges?.[b.id]);
                  const merged = applyBodyBlockTextEdit(content, b.id, text);
                  onContentDraftChange({
                    ...merged,
                    posterBodyBoldRanges: { ...content.posterBodyBoldRanges, [b.id]: ranges },
                  });
                }}
                onBlur={endTextEditIfBlurOutside}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onSelect={bumpTextSelection}
                onMouseUp={bumpTextSelection}
                style={{
                  position: "absolute",
                  left: br.x * displayW,
                  top: br.y * displayH,
                  width: br.width * displayW,
                  height: br.height * displayH,
                  zIndex: 200,
                  resize: "none",
                  padding: 4,
                  border: "none",
                  outline: "2px solid #F43182",
                  boxSizing: "border-box",
                  background: "rgba(255,255,255,0.92)",
                  ...bodyTextStyle(content, b.id, bodyFontSize, bodyColor),
                  textAlign: bodyFlex.textAlign,
                }}
              />
            );
          })()}

        {inlineEditTarget?.kind === "subtitle" &&
          onContentDraftChange &&
          (() => {
            const s = posterSubtitlesSafe.find((x) => x.id === inlineEditTarget.id);
            if (!s) return null;
            const idx = posterSubtitlesSafe.findIndex((x) => x.id === s.id);
            const sr =
              content.posterSubtitleRects?.[s.id] ?? {
                ...DEFAULT_POSTER_SUBTITLE_RECT,
                y: Math.min(
                  0.78,
                  DEFAULT_POSTER_SUBTITLE_RECT.y + idx * DEFAULT_POSTER_SUBTITLE_OFFSET_Y
                ),
              };
            const subF = flexAlignFromCanvasAlign(getSubtitleAlign(content, s.id));
            return (
              <textarea
                key={s.id}
                data-canvas-inline-edit
                ref={(el) => {
                  subtitleEditRefs.current[s.id] = el;
                }}
                value={s.text}
                onChange={(e) => {
                  const v = e.target.value;
                  onContentDraftChange({
                    ...content,
                    posterSubtitles: (content.posterSubtitles ?? []).map((x) =>
                      x.id === s.id ? { ...x, text: v } : x
                    ),
                    posterSubtitleRectLocked: {
                      ...(content.posterSubtitleRectLocked ?? {}),
                      [s.id]: false,
                    },
                  });
                }}
                onBlur={endTextEditIfBlurOutside}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onSelect={bumpTextSelection}
                onMouseUp={bumpTextSelection}
                style={{
                  position: "absolute",
                  left: sr.x * displayW,
                  top: sr.y * displayH,
                  width: sr.width * displayW,
                  height: sr.height * displayH,
                  zIndex: 200,
                  resize: "none",
                  padding: 4,
                  border: "none",
                  outline: "2px solid #F43182",
                  boxSizing: "border-box",
                  background: "rgba(255,255,255,0.92)",
                  ...subtitleTextStyle(content, s.id, subtitleFontSize, subtitleColor),
                  textAlign: subF.textAlign,
                }}
              />
            );
          })()}

        {inlineEditTarget?.kind === "badge" &&
          onContentDraftChange &&
          !isPlacard &&
          (() => {
            const id = inlineEditTarget.id;
            const badges = content.posterBadges ?? [];
            const b = badges.find((x) => x.id === id);
            if (!b) return null;
            const rect =
              content.posterBadgeRects?.[id] ??
              content.posterBadgeRect ??
              DEFAULT_POSTER_BADGE_RECT;
            const m = computeBadgeAutoText(rect);
            return (
              <textarea
                key={id}
                data-canvas-inline-edit
                ref={(el) => {
                  badgeEditRefs.current[id] = el;
                }}
                value={b.text}
                onChange={(e) => {
                  const v = e.target.value;
                  onContentDraftChange({
                    ...content,
                    posterBadges: badges.map((x) => (x.id === id ? { ...x, text: v } : x)),
                  });
                }}
                onBlur={endTextEditIfBlurOutside}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onSelect={bumpTextSelection}
                onMouseUp={bumpTextSelection}
                style={{
                  position: "absolute",
                  left: rect.x * displayW,
                  top: rect.y * displayH,
                  width: rect.width * displayW,
                  height: rect.height * displayH,
                  zIndex: 200,
                  resize: "none",
                  padding: 4,
                  border: "none",
                  outline: "2px solid #F43182",
                  boxSizing: "border-box",
                  background: "rgba(255,255,255,0.92)",
                  fontFamily: VI_FONT_STACK,
                  fontSize: `${m.fontPx}px`,
                  fontWeight: 600,
                  lineHeight: 1.2,
                  color: "#111",
                  textAlign: "center",
                  whiteSpace: "pre-wrap",
                }}
              />
            );
          })()}
      </div>
    </div>
  );
});
