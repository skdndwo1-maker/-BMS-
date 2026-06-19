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
import type { DesignContent, CanvasSize, AssetLayer, TemplateCategory } from "@/design/types";
import { DraggableAsset } from "./DraggableAsset";
import { DraggableCanvasOverlay } from "./DraggableCanvasOverlay";

import { defaultCI, defaultBI, defaultSLOGAN } from "@/design/defaultLogos";
import {
  computeCanvasLogoHeightPx,
  computeCanvasLogoPositionStyle,
  computeDefaultCustomUploadedLogoRect,
  computePlacardLogoLayout,
  normalizeCanvasLogoPosition,
  resolveTemplateLogoScale,
} from "@/design/canvasLogoLayout";
import {
  isSafetyCautionTemplate,
  layoutSafetyCautionTextBundle,
  SAFETY_CAUTION_BODY_FONT_SCALE,
  SAFETY_CAUTION_LOGO_POSITION,
  SAFETY_CAUTION_LOGO_TOP_MARGIN_RATIO,
  SAFETY_CAUTION_TITLE_FONT_SCALE,
} from "@/design/safetyCautionPreset";
import {
  computeAxisLayoutRectsForSize,
} from "@/design/axisLayoutGuide";
import {
  resolvePosterImageRect,
  resolvePosterImageZIndex,
  getPosterImagePlacementMode,
  FULL_BACKGROUND_IMAGE_RECT,
} from "@/design/posterImagePlacement";
import {
  DEFAULT_POSTER_BG_RECT,
  DEFAULT_POSTER_BADGE_RECT,
  DEFAULT_POSTER_TITLE_RECT,
  DEFAULT_POSTER_BODY_RECT,
  DEFAULT_POSTER_FOOTER_RECT,
  DEFAULT_POSTER_SUBTITLE_RECT,
  DEFAULT_POSTER_SUBTITLE_OFFSET_Y,
} from "@/design/posterDefaults";
import { DESIGN_CANVAS_BASE_VIEW_SCALE } from "@/design/canvasViewConstants";
import {
  buildPosterImageCssFilter,
  resolvePosterImageOpacity,
} from "@/design/imageAdjust";
import {
  computePlacardTextStackNormRects,
  getPlacardSplitBackdropBoxPx,
  PLACARD_BODY_TEXT_ALIGN,
  type PlacardContentBoxPx,
} from "@/design/placardCanvasLayout";
import { VI_COLORS, VI_FONT_STACK, TITLE_DEFAULT_FONT_WEIGHT, getViGridStepPx } from "@/design/viCanvasConstants";
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
  TEXT_CANVAS_MARGIN_N,
  clampPosterRectForKey,
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
  getPosterBodyBlockTypography,
  getPosterBodyFontScale,
  getPosterBodyAlign,
  getPosterBodyColor,
} from "@/design/posterBodyDisplay";
import { ViAlignmentGrid } from "./ViAlignmentGrid";
import {
  bodyTextStyle,
  BODY_DEFAULT_LINE_HEIGHT,
  SAFETY_BODY_DEFAULT_LINE_HEIGHT,
  flexAlignFromCanvasAlign,
  footerTextStyle,
  getSubtitleAlign,
  resolveFontFamily,
  subtitleTextStyle,
  titleTextStyle,
  type CanvasTextEditTarget,
} from "@/design/canvasTextTypography";
import { measureAutoTextBox } from "@/design/measureCanvasText";

/** 캔버스 빈 타이틀 플레이스홀더 — 높이 자동 계산·표시 문구와 동일해야 함 */
const TITLE_PLACEHOLDER_TEXT = "메인 타이틀을 입력하세요";
/** 캔버스 빈 유의사항 플레이스홀더 — 높이 자동 계산·표시 문구와 동일해야 함 */
const FOOTER_PLACEHOLDER_TEXT = "유의사항을 입력하세요";

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
  const restScales = { ...(c.posterBodyFontScales ?? {}) };
  const restAligns = { ...(c.posterBodyAligns ?? {}) };
  const restColors = { ...(c.posterBodyColors ?? {}) };
  for (const id of ids) {
    delete restRects[id];
    delete restBold[id];
    delete restItal[id];
    delete restUnd[id];
    delete restColor[id];
    delete restTypo[id];
    delete restLocked[id];
    delete restScales[id];
    delete restAligns[id];
    delete restColors[id];
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
    posterBodyFontScales: restScales,
    posterBodyAligns: restAligns,
    posterBodyColors: restColors,
    bodyText: nextBt,
    posterBodyRect: pr,
  };
}

function selectedKeyToFormatTarget(
  key: string | undefined,
  content: DesignContent
): CanvasTextEditTarget | null {
  if (!key) return null;
  if (key === "title") return { kind: "title" };
  if (key === "footer") return { kind: "footer" };
  if (key === "body") {
    const blocks = resolvePosterBodyBlocksForRender(content);
    return { kind: "body", id: blocks[0]?.id ?? "body-1" };
  }
  if (key.startsWith("body:")) return { kind: "body", id: key.slice(5) };
  if (key.startsWith("subtitle:")) return { kind: "subtitle", id: key.slice(9) };
  if (key.startsWith("badge:")) return { kind: "badge", id: key.slice(6) };
  return null;
}

export type DesignFocusTarget =
  | "image"
  | "panelBg"
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
  templateCategory?: TemplateCategory;
  canvasSize: CanvasSize;
  zoom: number;
  onContentChange?: (content: DesignContent) => void;
  onFocusChange?: (t: DesignFocusTarget) => void;
  /** VI 12분할 그리드 (캔버스 높이 기준) */
  showViGrid?: boolean;
  /** 요소 이동·리사이즈 시 VI 격자 스냅 (끄면 1px 단위) */
  layoutSnapEnabled?: boolean;
  /** 히스토리 없이 내용만 갱신 (인라인 편집·자동 박스 크기 등) */
  onContentDraftChange?: (content: DesignContent | ((prev: DesignContent) => DesignContent)) => void;
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
    templateCategory,
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
  const isSafetyCaution = isSafetyCautionTemplate(templateId);
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
  /** 웹폰트 로드 후 텍스트 박스 자동 크기 재계산 */
  const [fontReadyTick, setFontReadyTick] = useState(0);
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.ready) return;
    void document.fonts.ready.then(() => setFontReadyTick((n) => n + 1));
  }, []);
  const formatTarget = useMemo((): CanvasTextEditTarget | null => {
    if (selectedKeys.length !== 1) return null;
    return selectedKeyToFormatTarget(selectedKeys[0], content);
  }, [selectedKeys, content.posterBodies, content.bodyText]);
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

  /** 캔버스 주변 회색 여백 — 값이 클수록 화면에 맞춤 시 캔버스가 작아져 위·아래 빈 띠가 커짐 */
  const OUTER_GUTTER_CSS_PX = 16;
  const OUTER_GUTTER_TOTAL = OUTER_GUTTER_CSS_PX * 2;
  const availW = Math.max(1, containerW - OUTER_GUTTER_TOTAL);
  const availH = Math.max(1, containerH - OUTER_GUTTER_TOTAL);
  let baseW = availW;
  let baseH = baseW / realAspect;
  if (baseH > availH) {
    baseH = availH;
    baseW = baseH * realAspect;
  }
  const displayW = baseW * zoom * DESIGN_CANVAS_BASE_VIEW_SCALE;
  const displayH = displayW / realAspect;
  /** 텍스트 박스 캔버스 안쪽 여백(px) — DraggableCanvasOverlay 경계 제한용 */
  const textCanvasInsetPx = Math.max(1, Math.round(displayW * TEXT_CANVAS_MARGIN_N));
  /** 기본 뷰 배율로 인해 ‘맞춤’보다 커질 수 있음 — 줌 100%에서도 스크롤 허용 */
  const overflowZoom = zoom * DESIGN_CANVAS_BASE_VIEW_SCALE;

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

  const logoPosition = isSafetyCaution
    ? SAFETY_CAUTION_LOGO_POSITION
    : isPlacard
      ? "top-left"
      : normalizeCanvasLogoPosition(content.logoPosition);

  const placardLogoLayout = isPlacard
    ? computePlacardLogoLayout(displayW, displayH)
    : null;

  const logoScale = resolveTemplateLogoScale(templateId, templateCategory);
  const logoHeightPx =
    placardLogoLayout?.heightPx ?? computeCanvasLogoHeightPx(displayW, displayH, logoScale);
  const logoPositionStyle = isSafetyCaution
    ? computeCanvasLogoPositionStyle(logoPosition, displayW, displayH, {
        topMarginRatio: SAFETY_CAUTION_LOGO_TOP_MARGIN_RATIO,
      })
    : placardLogoLayout
      ? placardLogoLayout.positionStyle
      : computeCanvasLogoPositionStyle(logoPosition, displayW, displayH);

  const brandLogoSrc = getBrandLogo();

  const titleScale =
    (isSafetyCaution ? SAFETY_CAUTION_TITLE_FONT_SCALE : (content.posterTitleFontScale ?? 100)) / 100;
  const footerScale = (content.posterFooterFontScale ?? 100) / 100;
  // 폰트 크기: 템플릿 너비 비례 + 높이 상한(오버플로우 방지)
  // - 메인타이틀: 너비의 약 8%
  // - 본문: 너비의 약 4%
  // - 유의사항: 너비의 약 1.5~2%(기본 1.8%)
  const titleFontSize = Math.max(10, Math.min(W * 0.08, displayH * 0.22)) * titleScale;
  const bodyFontSizeBase = Math.max(8, Math.min(W * 0.04, displayH * 0.16));
  const computeBodyFontSize = (blockId: string) =>
    bodyFontSizeBase *
    ((isSafetyCaution ? SAFETY_CAUTION_BODY_FONT_SCALE : getPosterBodyFontScale(content, blockId)) /
      100);
  const disclaimerSize = Math.max(7, Math.min(W * 0.018, displayH * 0.10)) * footerScale;
  /** 부제 크기는 메인 타이틀 배율과 독립(캔버스 너비·posterSubtitleFontScale만 사용)
   * - autofit 효과에서도 참조해야 하므로 본문/타이틀과 같은 위치에서 선언 */
  const subtitleFontSize = W * 0.045 * ((content.posterSubtitleFontScale ?? 100) / 100);

  const hasUploadedLogo = Boolean(content.logo) && !isSafetyCaution;
  const fallbackCustomLogoRect = useMemo(
    () =>
      hasUploadedLogo
        ? computeDefaultCustomUploadedLogoRect({
            displayW,
            displayH,
            logoPosition,
            logoHeightPx,
          })
        : null,
    [hasUploadedLogo, displayW, displayH, logoPosition, logoHeightPx]
  );
  const uploadedLogoRect = hasUploadedLogo ? (content.customUploadedLogoRect ?? fallbackCustomLogoRect) : null;

  useLayoutEffect(() => {
    if (!onContentChange) return;
    const c = contentRef.current;
    if (!c.logo || c.customUploadedLogoRect) return;
    const r = computeDefaultCustomUploadedLogoRect({
      displayW,
      displayH,
      logoPosition,
      logoHeightPx,
    });
    onContentChange({ ...c, customUploadedLogoRect: r });
  }, [
    onContentChange,
    content.logo,
    content.customUploadedLogoRect,
    displayW,
    displayH,
    logoPosition,
    logoHeightPx,
  ]);

  const computeDefaultTextRects = () => {
    const layout = computeAxisLayoutRectsForSize(
      { width: realSize.width, height: realSize.height },
      templateCategory,
      templateId
    );
    return {
      titleRect: layout.titleRect,
      bodyRect: layout.bodyRect,
      footerRect: layout.footerRect,
      badgeRect: layout.badgeRect,
      subtitleRect: layout.subtitleRect,
      imageRect: layout.imageRect,
    };
  };

  // 현수막(placard)에서는 메인/본문/유의사항 위치를 고정값으로 강제하고, 드래그/리사이즈를 막는다.
  useLayoutEffect(() => {
    if (!onContentChange) return;
    if (!isPlacard) return;
    if (contentRef.current.posterBodyAlign === PLACARD_BODY_TEXT_ALIGN) return;
    onContentChange({ ...contentRef.current, posterBodyAlign: PLACARD_BODY_TEXT_ALIGN });
  }, [isPlacard, onContentChange]);

  // 라운드 박스가 캔버스에 있으면 그 rect 기준, 없으면 우측 분할 고정 박스 기준으로 가로중앙·블록 세로중앙 정렬.
  useLayoutEffect(() => {
    if (!onContentChange) return;
    if (!isPlacard) return;

    const c = contentRef.current;
    let boxPx: PlacardContentBoxPx;
    const r = c.panelBgRect;
    if (c.panelBgOnCanvas && r && r.width > 0 && r.height > 0) {
      boxPx = {
        left: r.x * displayW,
        top: r.y * displayH,
        width: r.width * displayW,
        height: r.height * displayH,
      };
    } else {
      boxPx = getPlacardSplitBackdropBoxPx(displayW, displayH);
    }

    const { titleRect: titleRectFixed, bodyRect: bodyRectFixed, footerRect: footerRectFixed } =
      computePlacardTextStackNormRects(displayW, displayH, boxPx);

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
      ...(c.posterFooterUserDismissed ? {} : { posterFooterOnCanvas: true }),
      posterTitleRect: titleRectFixed,
      posterTitleRectLocked: true,
      posterBodyRect: bodyRectFixed,
      posterBodyRects: { ...(c.posterBodyRects ?? {}), "body-1": bodyRectFixed },
      posterBodyRectLocked: { ...(c.posterBodyRectLocked ?? {}), "body-1": true },
      posterFooterRect: footerRectFixed,
      posterFooterRectLocked: true,
    });
  }, [
    displayW,
    displayH,
    isPlacard,
    onContentChange,
    content.panelBgOnCanvas,
    content.panelBgRect?.x,
    content.panelBgRect?.y,
    content.panelBgRect?.width,
    content.panelBgRect?.height,
    // 저장된 디자인 불러오기 시 잘못된 위치를 보정하기 위해 현재 rect x 감시
    content.posterTitleRect?.x,
  ]);

  // 텍스트가 생겼는데 rect가 없을 때만: 템플릿 비율 기반으로 초기 rect 자동 계산
  useLayoutEffect(() => {
    if (!onContentChange) return;
    if (isPlacard) return;
    const patch: Partial<DesignContent> = {};

    const showTitle = content.posterTitleOnCanvas !== false;
    const showBody = content.posterBodyOnCanvas !== false;
    const showFooter = content.posterFooterOnCanvas !== false;

    const { titleRect, bodyRect, footerRect, badgeRect, subtitleRect, imageRect } = computeDefaultTextRects();

    if (showTitle && content.title?.trim() && !content.posterTitleRect) patch.posterTitleRect = titleRect;
    if (showBody && (content.bodyText?.trim() || content.posterBodies?.some((b) => b.text?.trim())) && !content.posterBodyRect)
      patch.posterBodyRect = bodyRect;
    if (showFooter && !content.posterFooterRect) {
      patch.posterFooterRect = footerRect;
      if (content.posterFooterAlign == null) patch.posterFooterAlign = "left";
    }
    if (content.subtitle?.trim() && !content.posterBadgeRect) patch.posterBadgeRect = badgeRect;
    if (content.subtitle?.trim() && !content.posterSubtitleRects?.["subtitle-1"]) {
      patch.posterSubtitleRects = { ...(content.posterSubtitleRects ?? {}), "subtitle-1": subtitleRect };
    }
    if (!content.posterBackgroundImageRect) {
      patch.posterBackgroundImageRect =
        getPosterImagePlacementMode(content) === "full-background"
          ? FULL_BACKGROUND_IMAGE_RECT
          : imageRect;
    }

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
    if (contentRef.current.posterImageLocked) setImageInnerPosAdjust(false);
  }, [selectedKeys, content.posterImageLocked]);

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


  /** 레거시: posterFooterOnCanvas=false·거의 0 높이 rect 등으로 숨겨진 유의사항 복구 */
  useLayoutEffect(() => {
    if (!onContentChange || isSafetyCaution) return;
    const c = contentRef.current;
    if (c.posterFooterUserDismissed) return;

    const needsShow = c.posterFooterOnCanvas === false;
    const fr = c.posterFooterRect;
    const needsRect =
      !isPlacard && !c.posterFooterRectLocked && (!fr || fr.height < 0.012 || fr.width < 0.02);

    if (!needsShow && !needsRect) return;

    const { footerRect } = computeDefaultTextRects();
    onContentChange({
      ...c,
      ...(needsShow
        ? {
            posterFooterOnCanvas: true,
            posterFooterAlign: c.posterFooterAlign ?? (isPlacard ? "center" : "left"),
          }
        : {}),
      ...(needsRect ? { posterFooterRect: footerRect } : {}),
    });
  }, [
    content.posterFooterOnCanvas,
    content.posterFooterRect,
    content.posterFooterRectLocked,
    content.posterFooterUserDismissed,
    onContentChange,
    isSafetyCaution,
    isPlacard,
    W,
    displayH,
    realAspect,
    templateCategory,
    templateId,
  ]);

  const removeFooterFromCanvas = useCallback(() => {
    if (!onContentChange) return;
    onContentChange({
      ...contentRef.current,
      posterFooterOnCanvas: false,
      posterFooterUserDismissed: true,
    });
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
      posterImageBrightness: undefined,
      posterImageContrast: undefined,
      posterImageSaturation: undefined,
      posterImageLocked: undefined,
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
      const assetIds = new Set<string>();
      for (const k of keys) {
        if (!k.startsWith("asset:")) continue;
        const id = k.slice(6);
        const a = (c0.assetLayers ?? []).find((x) => x.id === id);
        if (a && !a.locked) assetIds.add(id);
      }
      if (
        !removeTitle &&
        !removeFooter &&
        !removeImage &&
        !removeUploadedLogoKey &&
        bodyIds.size === 0 &&
        assetIds.size === 0
      )
        return;
      e.preventDefault();
      if (removeImage) imagePanSessionRef.current = null;
      const c = contentRef.current;
      let next: DesignContent = { ...c };
      if (removeTitle) next.posterTitleOnCanvas = false;
      if (removeFooter) {
        next.posterFooterOnCanvas = false;
        next.posterFooterUserDismissed = true;
      }
      if (removeImage) {
        next.image = undefined;
        next.posterBackgroundImageRect = undefined;
        next.posterImageOpacity = 0;
        next.posterImagePosX = undefined;
        next.posterImagePosY = undefined;
        next.posterImageBrightness = undefined;
        next.posterImageContrast = undefined;
        next.posterImageSaturation = undefined;
        next.posterImageLocked = undefined;
      }
      if (removeUploadedLogoKey) {
        next.logo = undefined;
        next.customUploadedLogoRect = undefined;
      }
      if (bodyIds.size > 0) next = applyRemoveBodyBlockIds(next, bodyIds);
      if (assetIds.size > 0) {
        next.assetLayers = (next.assetLayers ?? []).filter((a) => !assetIds.has(a.id));
      }
      const removedKeys: string[] = [];
      if (removeTitle) removedKeys.push("title");
      if (removeFooter) removedKeys.push("footer");
      if (removeImage) removedKeys.push("image");
      if (removeUploadedLogoKey) removedKeys.push("uploadedLogo");
      for (const id of bodyIds) removedKeys.push(id === "body-1" ? "body" : `body:${id}`);
      for (const id of assetIds) removedKeys.push(`asset:${id}`);
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
          if (k.startsWith("asset:")) return !assetIds.has(k.slice(6));
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
    const focusInline = (el: HTMLTextAreaElement | null | undefined) => {
      if (!el) return;
      el.focus({ preventScroll: true });
      el.select();
    };
    if (inlineEditTarget?.kind === "title") {
      focusInline(titleEditRef.current);
    } else if (inlineEditTarget?.kind === "footer") {
      focusInline(footerEditRef.current);
    } else if (inlineEditTarget?.kind === "body") {
      focusInline(bodyEditRefs.current[inlineEditTarget.id]);
    } else if (inlineEditTarget?.kind === "subtitle") {
      focusInline(subtitleEditRefs.current[inlineEditTarget.id]);
    } else if (inlineEditTarget?.kind === "badge") {
      focusInline(badgeEditRefs.current[inlineEditTarget.id]);
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

  const imageRect = resolvePosterImageRect(content, content.posterBackgroundImageRect ?? DEFAULT_POSTER_BG_RECT);
  const imageZIndex = resolvePosterImageZIndex(content);
  const isFullBackgroundImage = getPosterImagePlacementMode(content) === "full-background";
  const layoutScale = displayH / Math.max(1, realSize.height);
  const brandImageCornerRadiusPx =
    content.axisLayoutImageCornerRadiusPx != null && !isFullBackgroundImage
      ? content.axisLayoutImageCornerRadiusPx * layoutScale
      : undefined;
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
      if (getPosterImagePlacementMode(c) === "full-background") return;
      const prev = c.posterBackgroundImageRect ?? DEFAULT_POSTER_BG_RECT;
      const keys = expandKeysForRectOps(c, selectedKeysRef.current);
      if (next.width !== prev.width || next.height !== prev.height) {
        if (keys.length >= 2 && keys.includes("image")) {
          const merged = applyGroupRectLeaderResize(c, keys, "image", prev, next);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
        const u = { ...c, posterBackgroundImageRect: next, posterRoundBoxImageRect: next };
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
      const u = { ...c, posterBackgroundImageRect: next, posterRoundBoxImageRect: next };
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
      const key = `badge:${id}`;
      next = clampPosterRectForKey(key, next);
      const c = contentRef.current;
      const prev = c.posterBadgeRects?.[id] ?? DEFAULT_POSTER_BADGE_RECT;
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
      next = clampPosterRectForKey("title", next);
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
      const key = `body:${id}`;
      next = clampPosterRectForKey(key, next);
      const c = contentRef.current;
      const prev =
        c.posterBodyRects?.[id] ?? (id === "body-1" ? c.posterBodyRect : undefined) ?? DEFAULT_POSTER_BODY_RECT;
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
      const key = `subtitle:${id}`;
      next = clampPosterRectForKey(key, next);
      const c = contentRef.current;
      const prev = c.posterSubtitleRects?.[id] ?? DEFAULT_POSTER_SUBTITLE_RECT;
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
      next = clampPosterRectForKey("footer", next);
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
      const ny = prev.y;
      return clampNormRect(
        { x: nx, y: ny, width: nw, height: nh },
        { margin: TEXT_CANVAS_MARGIN_N }
      );
    },
    [displayW, displayH]
  );

  useLayoutEffect(() => {
    const draft = onContentDraftChange;
    if (!draft) return;
    if (content.posterTitleOnCanvas === false) return;
    if (content.posterTitleRectLocked && !isSafetyCaution) return;
    const tr = content.posterTitleRect ?? DEFAULT_POSTER_TITLE_RECT;
    const raw = content.title?.trim() ? content.title : TITLE_PLACEHOLDER_TEXT;
    const t = content.posterTitleTypography ?? {};
    const padX = titleFontSize * (isSafetyCaution ? 0.28 : 0.22);
    const padY = titleFontSize * (isSafetyCaution ? 0.55 : 0.45);
    const maxWPx = displayW * 0.96;
    const m = measureAutoTextBox({
      text: raw,
      fontPx: titleFontSize,
      fontWeight: t.fontWeight ?? TITLE_DEFAULT_FONT_WEIGHT,
      fontFamily: resolveFontFamily(t.fontFamily),
      fontStyle: t.fontStyle ?? "normal",
      letterSpacingEm: t.letterSpacingEm ?? -0.025,
      lineHeight: t.lineHeight ?? 1.15,
      padXPx: padX,
      padYPx: padY,
      maxBoxWidthPx: maxWPx,
    });
    const dotExtraPx =
      isSafetyCaution && raw.endsWith(".") ? titleFontSize * 0.32 : 0;
    const align = content.posterTitleAlign ?? "left";
    const next = fitNormalizedRect(
      tr,
      m.boxWidthPx + dotExtraPx,
      m.boxHeightPx,
      align === "center" ? "center" : align === "right" ? "right" : "left",
      {
        minWPx: Math.max(40, titleFontSize * 1.4),
        maxWPx: displayW * 0.96,
        minHPx: Math.max(24, titleFontSize * 1.05),
        maxHPx: displayH * (isSafetyCaution ? 0.22 : 0.5),
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
    fontReadyTick,
    isSafetyCaution,
  ]);

  useLayoutEffect(() => {
    const draft = onContentDraftChange;
    if (!draft) return;
    if (content.posterFooterOnCanvas === false) return;
    if (content.posterFooterRectLocked) return;
    const fr = content.posterFooterRect ?? DEFAULT_POSTER_FOOTER_RECT;
    const raw = content.emphasizedTitle?.trim() ? content.emphasizedTitle : FOOTER_PLACEHOLDER_TEXT;
    const t = content.posterFooterTypography ?? {};
    const padX = disclaimerSize * 0.4;
    const padY = disclaimerSize * 0.35;
    const maxWPx = displayW * 0.96;
    const m = measureAutoTextBox({
      text: raw,
      fontPx: disclaimerSize,
      fontWeight: t.fontWeight ?? 400,
      fontFamily: resolveFontFamily(t.fontFamily),
      fontStyle: t.fontStyle ?? "normal",
      letterSpacingEm: t.letterSpacingEm ?? 0,
      lineHeight: t.lineHeight ?? 1.6,
      padXPx: padX,
      padYPx: padY,
      maxBoxWidthPx: maxWPx,
    });
    const align = content.posterFooterAlign ?? "left";
    const next = fitNormalizedRect(
      fr,
      m.boxWidthPx,
      m.boxHeightPx,
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
    fontReadyTick,
  ]);

  useLayoutEffect(() => {
    const draft = onContentDraftChange;
    if (!draft) return;
    draft((prev) => {
      if (prev.posterBodyOnCanvas === false) return prev;
      const bodies = resolvePosterBodyBlocksForRender(prev);
      let next = prev;
      let touched = false;
      for (const b of bodies) {
        if (!b.text?.trim()) continue;
        if (prev.posterBodyRectLocked?.[b.id] && !isSafetyCaution) continue;
        const br =
          next.posterBodyRects?.[b.id] ??
          (b.id === "body-1" ? next.posterBodyRect : undefined) ??
          DEFAULT_POSTER_BODY_RECT;
        const t = getPosterBodyBlockTypography(next, b.id);
        const blockFontSize = computeBodyFontSize(b.id);
        const padX = blockFontSize * (isSafetyCaution ? 0.38 : 0.32);
        const padY = blockFontSize * (isSafetyCaution ? 0.36 : 0.28);
        const maxWPx = displayW * 0.96;
        const lineHeight =
          t.lineHeight ?? (isSafetyCaution ? SAFETY_BODY_DEFAULT_LINE_HEIGHT : BODY_DEFAULT_LINE_HEIGHT);
        const m = measureAutoTextBox({
          text: b.text,
          fontPx: blockFontSize,
          fontWeight: t.fontWeight ?? 400,
          fontFamily: resolveFontFamily(t.fontFamily),
          fontStyle: t.fontStyle ?? "normal",
          letterSpacingEm: t.letterSpacingEm ?? 0,
          lineHeight,
          padXPx: padX,
          padYPx: padY,
          maxBoxWidthPx: maxWPx,
        });
        const align = isPlacard
          ? PLACARD_BODY_TEXT_ALIGN
          : getPosterBodyAlign(next, b.id);
        const fitted = fitNormalizedRect(
          br,
          m.boxWidthPx,
          m.boxHeightPx,
          align === "center" ? "center" : align === "right" ? "right" : "left",
          {
            minWPx: Math.max(40, blockFontSize * 4),
            maxWPx: displayW * 0.96,
            minHPx: Math.max(16, blockFontSize * (isSafetyCaution ? 1.35 : 1.2)),
            maxHPx: displayH * (isSafetyCaution ? 0.34 : 0.7),
          }
        );
        const heightDeltaPx = Math.abs(fitted.height - br.height) * displayH;
        const widthDeltaPx = Math.abs(fitted.width - br.width) * displayW;
        if (
          widthDeltaPx < 0.5 &&
          heightDeltaPx < 0.5 &&
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
      return touched ? next : prev;
    });
  }, [
    content.posterBodyOnCanvas,
    content.bodyText,
    content.posterBodies,
    content.posterBodyRects,
    content.posterBodyRect,
    content.posterBodyRectLocked,
    content.posterBodyAlign,
    content.posterBodyTypography,
    content.posterBodyFontScales,
    content.posterBodyFontScale,
    content.posterBodyAligns,
    content.posterBodyAlign,
    displayW,
    displayH,
    onContentDraftChange,
    fitNormalizedRect,
    fontReadyTick,
    isSafetyCaution,
    isPlacard,
  ]);

  /** 안전&주의: 타이틀+본문 묶음을 캔버스 수평 중앙(및 밴드 세로 중앙)에 정렬 */
  useLayoutEffect(() => {
    const draft = onContentDraftChange;
    if (!draft || !isSafetyCaution) return;
    if (content.posterTitleOnCanvas === false || content.posterBodyOnCanvas === false) return;
    const patch = layoutSafetyCautionTextBundle(content);
    if (!patch) return;
    draft({ ...content, ...patch });
  }, [
    content,
    content.posterTitleRect,
    content.posterBodyRect,
    content.posterBodyRects,
    content.title,
    content.bodyText,
    content.posterBodies,
    isSafetyCaution,
    onContentDraftChange,
    fontReadyTick,
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
      const padX = subtitleFontSize * 0.3;
      const padY = subtitleFontSize * 0.28;
      const maxWPx = displayW * 0.96;
      const m = measureAutoTextBox({
        text: s.text,
        fontPx: subtitleFontSize,
        fontWeight: t.fontWeight ?? 680,
        fontFamily: resolveFontFamily(t.fontFamily),
        fontStyle: t.fontStyle ?? "normal",
        letterSpacingEm: t.letterSpacingEm ?? -0.02,
        lineHeight: t.lineHeight ?? 1.35,
        padXPx: padX,
        padYPx: padY,
        maxBoxWidthPx: maxWPx,
      });
      const align = getSubtitleAlign(next, s.id);
      const fitted = fitNormalizedRect(
        sr,
        m.boxWidthPx,
        m.boxHeightPx,
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
    fontReadyTick,
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
        alignItems: overflowZoom > 1 ? "flex-start" : "center",
        justifyContent: "center",
        overflow: overflowZoom > 1 ? "auto" : "hidden",
        /**
         * zoom ≤ 1: 산식 OUTER_GUTTER_TOTAL 과 동일한 CSS 패딩.
         * zoom > 1: 패딩 0 → 스크롤 높이 = 캔버스와 일치.
         */
        padding: overflowZoom > 1 ? "0px" : `${OUTER_GUTTER_CSS_PX}px`,
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
              className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:border-[#FF7F66] hover:text-[#FF7F66]"
              onClick={() => runAlign(mode)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:border-[#FF7F66] hover:text-[#FF7F66]"
            onClick={() => setSelectedKeys([])}
          >
            모두 해제
          </button>
          <button
            type="button"
            disabled={!canGroupSelection(contentRef.current, selectedKeys)}
            className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:border-[#FF7F66] hover:text-[#FF7F66] disabled:opacity-40"
            onClick={groupSelection}
          >
            그룹
          </button>
          <button
            type="button"
            disabled={!canUngroupSelection(contentRef.current, selectedKeys)}
            className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:border-[#FF7F66] hover:text-[#FF7F66] disabled:opacity-40"
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
              onFocusChange?.("panelBg");
            }}
            zIndex={2}
            label="배경 박스"
            locked={Boolean(content.panelBgLocked)}
            onToggleLock={
              onContentChange
                ? () =>
                    onContentChange({
                      ...contentRef.current,
                      panelBgLocked: !contentRef.current.panelBgLocked,
                    })
                : undefined
            }
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
            zIndex={imageZIndex}
            label={imageInnerPosAdjust ? "이미지 · 안쪽 위치 조절" : isFullBackgroundImage ? "배경 이미지" : "이미지"}
            locked={Boolean(content.posterImageLocked)}
            onToggleLock={
              onContentChange
                ? () =>
                    onContentChange({
                      ...contentRef.current,
                      posterImageLocked: !contentRef.current.posterImageLocked,
                    })
                : undefined
            }
            snapStepPx={snapPx}
            panDragInsteadOfMove={imageInnerPosAdjust && !content.posterImageLocked}
            onOverlayDoubleClick={() => {
              if (contentRef.current.posterImageLocked) return;
              setImageInnerPosAdjust(true);
              pickKey("image", false);
              onFocusChange?.("image");
            }}
            onPan={(d, ev) => {
              if (!onContentChange || contentRef.current.posterImageLocked) return;
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
            borderRadiusMode={isFullBackgroundImage ? "square" : "auto"}
            cornerRadiusPx={brandImageCornerRadiusPx}
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
                  Math.max(0, resolvePosterImageOpacity(content) / 100)
                ),
                filter: buildPosterImageCssFilter(content),
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
            canvasInsetPx={textCanvasInsetPx}
            locked={isPlacard}
            clipContent={!isSafetyCaution}
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
              <div
                style={{
                  width: "100%",
                  minWidth: 0,
                  ...(isSafetyCaution ? {} : { maxHeight: "100%" }),
                }}
              >
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
                            defaultWeight: TITLE_DEFAULT_FONT_WEIGHT,
                            strongWeight: 800,
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
              canvasInsetPx={textCanvasInsetPx}
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
          const blockBodyFontSize = computeBodyFontSize(b.id);
          const blockBodyColor = getPosterBodyColor(content, b.id);
          const blockBodyFlex = flexAlignFromCanvasAlign(
            isPlacard ? PLACARD_BODY_TEXT_ALIGN : getPosterBodyAlign(content, b.id)
          );
          const bStyle = bodyTextStyle(content, b.id, blockBodyFontSize, blockBodyColor, {
            safetyCaution: isSafetyCaution,
          });
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
              canvasInsetPx={textCanvasInsetPx}
              locked={isPlacard}
              clipContent={!isSafetyCaution}
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
                  minWidth: 0,
                  minHeight: 0,
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: blockBodyFlex.justifyContent,
                  textAlign: blockBodyFlex.textAlign,
                  opacity:
                    inlineEditTarget?.kind === "body" && inlineEditTarget.id === b.id ? 0 : 1,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    minWidth: 0,
                    ...(isSafetyCaution ? {} : { maxHeight: "100%" }),
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
            canvasInsetPx={textCanvasInsetPx}
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
                    <span style={{ ...ft, color: "#C4C4C4" }}>{FOOTER_PLACEHOLDER_TEXT}</span>
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
            data-canvas-selection-chrome
            style={{
              position: "absolute",
              ...logoPositionStyle,
              zIndex: 12,
              pointerEvents: "auto",
              cursor: isSafetyCaution ? "default" : "pointer",
              outline:
                !isSafetyCaution && selectedKeys.includes("logo") ? "2px solid #FF7F66" : undefined,
              outlineOffset: !isSafetyCaution && selectedKeys.includes("logo") ? "2px" : undefined,
              borderRadius: !isSafetyCaution && selectedKeys.includes("logo") ? "4px" : undefined,
              isolation: "isolate",
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              if (isSafetyCaution) {
                onFocusChange?.("logo");
                return;
              }
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
                height: `${logoHeightPx}px`,
                width: "auto",
                maxWidth: placardLogoLayout
                  ? `${placardLogoLayout.maxWidthPx}px`
                  : isPlacard
                    ? `${displayW * 0.22}px`
                    : `${displayW * 0.45}px`,
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
                  const fill = (b.color ?? "magenta") === "black" ? "#000000" : VI_COLORS.brandMagenta;
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
                      canvasInsetPx={textCanvasInsetPx}
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
              outline: "2px solid #FF7F66",
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
              outline: "2px solid #FF7F66",
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
            const editBodyFontSize = computeBodyFontSize(b.id);
            const editBodyColor = getPosterBodyColor(content, b.id);
            const editBodyFlex = flexAlignFromCanvasAlign(
              isPlacard ? PLACARD_BODY_TEXT_ALIGN : getPosterBodyAlign(content, b.id)
            );
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
                  outline: "2px solid #FF7F66",
                  boxSizing: "border-box",
                  background: "rgba(255,255,255,0.92)",
                  ...bodyTextStyle(content, b.id, editBodyFontSize, editBodyColor, {
                    safetyCaution: isSafetyCaution,
                  }),
                  textAlign: editBodyFlex.textAlign,
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
                  outline: "2px solid #FF7F66",
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
                  outline: "2px solid #FF7F66",
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
