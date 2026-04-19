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
  sanitizeCharRanges,
  toggleCharRangesOnSelection,
  type CharRange,
} from "@/design/charStyleRanges";
import {
  applyGroupRectDelta,
  applyGroupRectLeaderResize,
  applyMultiAlign,
  selectedKeysIncludeBody,
  type AlignMode,
} from "@/design/designCanvasAlign";
import { migrateBoldMarkdownToRanges, sanitizeBoldRanges } from "@/design/bodyBoldRanges";
import { ViAlignmentGrid } from "./ViAlignmentGrid";
import {
  bodyTextStyle,
  flexAlignFromCanvasAlign,
  footerTextStyle,
  getSubtitleAlign,
  subtitleTextStyle,
  titleTextStyle,
  type CanvasTextEditTarget,
} from "@/design/canvasTextTypography";

function normalizeLogoPosition(pos: string | undefined): LogoPosition {
  const allowed: LogoPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
  if (pos && allowed.includes(pos as LogoPosition)) return pos as LogoPosition;
  return "top-left";
}

/** 단일 선택 시 문자 툴바 대상 (클릭 한 번으로 표시) */
function selectedKeyToFormatTarget(key: string | undefined): CanvasTextEditTarget | null {
  if (!key) return null;
  if (key === "title") return { kind: "title" };
  if (key === "footer") return { kind: "footer" };
  if (key === "body") return { kind: "body", id: "body-1" };
  if (key.startsWith("body:")) return { kind: "body", id: key.slice(5) };
  if (key.startsWith("subtitle:")) return { kind: "subtitle", id: key.slice(9) };
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
  getInlineEditActive: () => boolean;
};

export const DesignCanvas = forwardRef<DesignCanvasHandle, DesignCanvasProps>(function DesignCanvas(
  {
    content,
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
  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const [containerW, setContainerW] = useState(800);
  const [containerH, setContainerH] = useState(600);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  /** image | badge | title | body | footer | logo | asset:<id> — ⌘/Ctrl/Shift+클릭으로 복수 선택 */
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const selectedKeysRef = useRef<string[]>([]);
  selectedKeysRef.current = selectedKeys;

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

  // 포스터 오버레이 기본 rect 초기화 (텍스트가 생겼는데 rect가 없을 때만)
  useEffect(() => {
    if (!onContentChange) return;
    const patch: Partial<DesignContent> = {};
    if (content.posterTitleOnCanvas !== false && content.title?.trim() && !content.posterTitleRect)
      patch.posterTitleRect = DEFAULT_POSTER_TITLE_RECT;
    if (content.posterBodyOnCanvas !== false && content.bodyText?.trim() && !content.posterBodyRect)
      patch.posterBodyRect = DEFAULT_POSTER_BODY_RECT;
    if (content.posterFooterOnCanvas !== false && content.emphasizedTitle?.trim() && !content.posterFooterRect)
      patch.posterFooterRect = DEFAULT_POSTER_FOOTER_RECT;
    if (content.subtitle?.trim() && !content.posterBadgeRect) patch.posterBadgeRect = DEFAULT_POSTER_BADGE_RECT;
    if (Object.keys(patch).length === 0) return;
    onContentChange({ ...content, ...patch });
  }, [
    content,
    onContentChange,
    content.title,
    content.bodyText,
    content.emphasizedTitle,
    content.subtitle,
    content.posterTitleRect,
    content.posterBodyRect,
    content.posterFooterRect,
    content.posterBadgeRect,
  ]);

  /** 본문 블록 배열 마이그레이션 (기존 bodyText / posterBodyRect → posterBodies) */
  useEffect(() => {
    if (!onContentChange) return;
    if (content.posterBodies && content.posterBodies.length > 0) return;
    const r0 = content.posterBodyRect ?? DEFAULT_POSTER_BODY_RECT;
    onContentChange({
      ...content,
      posterBodies: [{ id: "body-1", text: content.bodyText ?? "" }],
      posterBodyRects: { ...(content.posterBodyRects ?? {}), "body-1": content.posterBodyRects?.["body-1"] ?? r0 },
      posterBodyRect: r0,
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
  /** VI 12분할의 1/2 간격 — 정렬 그리드 표시용 (드래그 스냅에는 사용하지 않음) */
  const viGridStepPx = Math.max(1, getViGridStepPx(displayH / 12));
  const snapPx = layoutSnapEnabled ? viGridStepPx : 1;
  /** 12분할 1칸(높이·너비 각각) — 뱃지 최소 크기용 */
  const gridCellH = displayH / 12;

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

  const logoPosition = normalizeLogoPosition(content.logoPosition);

  const getLogoPositionStyle = () => {
    const pad = W * 0.08;
    switch (logoPosition) {
      case "top-right":
        return { top: `${pad}px`, right: `${pad}px` };
      case "top-left":
        return { top: `${pad}px`, left: `${pad}px` };
      case "bottom-left":
        return { bottom: `${pad}px`, left: `${pad}px` };
      case "bottom-right":
        return { bottom: `${pad}px`, right: `${pad}px` };
      default:
        return { top: `${pad}px`, left: `${pad}px` };
    }
  };

  const brandLogoSrc = getBrandLogo();
  const logoPositionStyle = getLogoPositionStyle();

  const titleScale = (content.posterTitleFontScale ?? 100) / 100;
  const bodyScale = (content.posterBodyFontScale ?? 100) / 100;
  const footerScale = (content.posterFooterFontScale ?? 100) / 100;
  const titleFontSize = W * 0.16 * titleScale;
  const bodyFontSize = W * 0.04 * bodyScale;
  const disclaimerSize = W * 0.018 * footerScale;
  const logoHeight = W * 0.05;

  const assetLayers = content.assetLayers ?? [];

  /** 다중 선택 시: Shift 없이 클릭 → 단일 선택. Shift+클릭 → 목록에 추가·제거(토글). 같은 요소를 다시 눌러 드래그할 때는 선택 유지 */
  const pickKey = useCallback((key: string, additive: boolean) => {
    setSelectedKeys((prev) => {
      if (additive) {
        if (prev.includes(key)) return prev.filter((k) => k !== key);
        return [...prev, key];
      }
      if (prev.length > 1 && prev.includes(key)) return prev;
      return [key];
    });
  }, []);

  const handleAssetUpdate = useCallback(
    (id: string, patch: Partial<AssetLayer>) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const keys = selectedKeysRef.current;
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

  const removeBodyBlocksFromCanvas = useCallback(() => {
    if (!onContentChange) return;
    onContentChange({ ...contentRef.current, posterBodyOnCanvas: false });
    setSelectedKeys((prev) => prev.filter((k) => k !== "body" && !k.startsWith("body:")));
    setInlineEditTarget((cur) => (cur?.kind === "body" ? null : cur));
  }, [onContentChange]);

  const removeFooterFromCanvas = useCallback(() => {
    if (!onContentChange) return;
    onContentChange({ ...contentRef.current, posterFooterOnCanvas: false });
    setSelectedKeys((prev) => prev.filter((k) => k !== "footer"));
    setInlineEditTarget((cur) => (cur?.kind === "footer" ? null : cur));
  }, [onContentChange]);

  useEffect(() => {
    if (!onContentChange) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const ae = document.activeElement;
      if (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) return;
      if ((ae as HTMLElement | null)?.isContentEditable) return;
      const keys = selectedKeysRef.current;
      const removeTitle = keys.includes("title");
      const removeFooter = keys.includes("footer");
      const removeBody = keys.some((k) => k === "body" || k.startsWith("body:"));
      if (!removeTitle && !removeFooter && !removeBody) return;
      e.preventDefault();
      const c = contentRef.current;
      const next: DesignContent = { ...c };
      if (removeTitle) next.posterTitleOnCanvas = false;
      if (removeFooter) next.posterFooterOnCanvas = false;
      if (removeBody) next.posterBodyOnCanvas = false;
      onContentChange(next);
      setSelectedKeys((prev) =>
        prev.filter((k) => {
          if (removeTitle && k === "title") return false;
          if (removeFooter && k === "footer") return false;
          if (removeBody && (k === "body" || k.startsWith("body:"))) return false;
          return true;
        })
      );
      setInlineEditTarget((cur) => {
        if (!cur) return null;
        if (removeTitle && cur.kind === "title") return null;
        if (removeFooter && cur.kind === "footer") return null;
        if (removeBody && cur.kind === "body") return null;
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
    else el = subtitleEditRefs.current[inlineEditTarget.id];
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

  useImperativeHandle(
    ref,
    () => ({
      getInlineTextSelection,
      handleTogglePartialStyle,
      getInlineEditActive: () => inlineEditTarget !== null,
    }),
    [getInlineTextSelection, handleTogglePartialStyle, inlineEditTarget]
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
      const keys = selectedKeysRef.current;
      const merged = applyMultiAlign(c, keys, mode);
      contentRef.current = merged;
      onContentChange(merged);
    },
    [onContentChange]
  );

  const imageRect = content.posterBackgroundImageRect ?? DEFAULT_POSTER_BG_RECT;
  const badgeRect = content.posterBadgeRect ?? DEFAULT_POSTER_BADGE_RECT;
  const titleRect = content.posterTitleRect ?? DEFAULT_POSTER_TITLE_RECT;
  const footerRect = content.posterFooterRect ?? DEFAULT_POSTER_FOOTER_RECT;

  const posterBodiesSafe =
    content.posterBodies && content.posterBodies.length > 0
      ? content.posterBodies
      : [{ id: "body-1", text: content.bodyText ?? "" }];

  const normBodyRect = (id: string) =>
    content.posterBodyRects?.[id] ??
    (id === "body-1" ? (content.posterBodyRect ?? DEFAULT_POSTER_BODY_RECT) : DEFAULT_POSTER_BODY_RECT);

  const posterSubtitlesSafe = content.posterSubtitles ?? [];

  const updateImageRect = useCallback(
    (next: typeof imageRect) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const prev = c.posterBackgroundImageRect ?? DEFAULT_POSTER_BG_RECT;
      if (next.width !== prev.width || next.height !== prev.height) {
        const u = { ...c, posterBackgroundImageRect: next };
        contentRef.current = u;
        onContentChange(u);
        return;
      }
      const keys = selectedKeysRef.current;
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

  const updateBadgeRect = useCallback(
    (next: typeof badgeRect) => {
      if (!onContentChange) return;
      const c = contentRef.current;
      const prev = c.posterBadgeRect ?? DEFAULT_POSTER_BADGE_RECT;
      if (next.width !== prev.width || next.height !== prev.height) {
        const u = { ...c, posterBadgeRect: next };
        contentRef.current = u;
        onContentChange(u);
        return;
      }
      const keys = selectedKeysRef.current;
      if (keys.length >= 2 && keys.includes("badge")) {
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
          const merged = applyGroupRectDelta(c, keys, dx, dy);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
      }
      const u = { ...c, posterBadgeRect: next };
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
      const keys = selectedKeysRef.current;
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
      const keys = selectedKeysRef.current;
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
      const keys = selectedKeysRef.current;
      if (next.width !== prev.width || next.height !== prev.height) {
        if (keys.length >= 2 && keys.includes(key)) {
          const merged = applyGroupRectLeaderResize(c, keys, key, prev, next);
          contentRef.current = merged;
          onContentChange(merged);
          return;
        }
        const u = { ...c, posterSubtitleRects: { ...(c.posterSubtitleRects ?? {}), [id]: next } };
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
      const keys = selectedKeysRef.current;
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

  useLayoutEffect(() => {
    const draft = onContentDraftChange;
    if (!draft) return;
    if (content.posterTitleOnCanvas === false) return;
    if (content.posterTitleRectLocked) return;
    if (!content.title?.trim()) return;
    const tr = content.posterTitleRect ?? DEFAULT_POSTER_TITLE_RECT;
    const wPx = tr.width * displayW;
    const charW = titleFontSize * 0.52;
    const charsPerLine = Math.max(4, wPx / Math.max(1, charW));
    const lines = content.title.split("\n").reduce(
      (acc, line) => acc + Math.max(1, Math.ceil(line.length / charsPerLine)),
      0
    );
    const wantH = (lines * titleFontSize * 1.15 + titleFontSize * 0.4) / displayH;
    const nh = Math.min(0.5, Math.max(0.12, wantH));
    if (Math.abs(nh - tr.height) < 0.003) return;
    draft({ ...content, posterTitleRect: { ...tr, height: nh } });
  }, [
    content,
    content.title,
    content.posterTitleRect,
    content.posterTitleRectLocked,
    titleFontSize,
    displayW,
    displayH,
    onContentDraftChange,
  ]);

  useLayoutEffect(() => {
    const draft = onContentDraftChange;
    if (!draft) return;
    if (content.posterFooterOnCanvas === false) return;
    if (content.posterFooterRectLocked) return;
    if (!content.emphasizedTitle?.trim()) return;
    const fr = content.posterFooterRect ?? DEFAULT_POSTER_FOOTER_RECT;
    const wPx = fr.width * displayW;
    const charW = disclaimerSize * 0.5;
    const charsPerLine = Math.max(4, wPx / Math.max(1, charW));
    const lines = content.emphasizedTitle.split("\n").reduce(
      (acc, line) => acc + Math.max(1, Math.ceil(line.length / charsPerLine)),
      0
    );
    const wantH = (lines * disclaimerSize * 1.6 + disclaimerSize * 0.3) / displayH;
    const nh = Math.min(0.22, Math.max(0.045, wantH));
    if (Math.abs(nh - fr.height) < 0.003) return;
    draft({ ...content, posterFooterRect: { ...fr, height: nh } });
  }, [
    content.emphasizedTitle,
    content.posterFooterRect,
    content.posterFooterRectLocked,
    disclaimerSize,
    displayW,
    displayH,
    onContentDraftChange,
  ]);

  useLayoutEffect(() => {
    const draft = onContentDraftChange;
    if (!draft) return;
    if (content.posterBodyOnCanvas === false) return;
    const bodies =
      content.posterBodies && content.posterBodies.length > 0
        ? content.posterBodies
        : [{ id: "body-1", text: content.bodyText ?? "" }];
    let next = content;
    let touched = false;
    for (const b of bodies) {
      if (!b.text?.trim()) continue;
      if (content.posterBodyRectLocked?.[b.id]) continue;
      const br =
        next.posterBodyRects?.[b.id] ??
        (b.id === "body-1" ? next.posterBodyRect : undefined) ??
        DEFAULT_POSTER_BODY_RECT;
      const wPx = br.width * displayW;
      const charW = bodyFontSize * 0.48;
      const charsPerLine = Math.max(6, wPx / Math.max(1, charW));
      const lines = b.text.split("\n").reduce(
        (acc, line) => acc + Math.max(1, Math.ceil(line.length / charsPerLine)),
        0
      );
      const wantH = (lines * bodyFontSize * 1.75 + bodyFontSize * 0.15) / displayH;
      const nh = Math.min(0.7, Math.max(0.06, wantH));
      if (Math.abs(nh - br.height) < 0.004) continue;
      const rects = { ...(next.posterBodyRects ?? {}), [b.id]: { ...br, height: nh } };
      next = {
        ...next,
        posterBodyRects: rects,
        ...(b.id === "body-1" ? { posterBodyRect: { ...br, height: nh } } : {}),
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
    bodyFontSize,
    displayW,
    displayH,
    onContentDraftChange,
  ]);

  const badgePxH = badgeRect.height * displayH;
  const badgePxW = badgeRect.width * displayW;
  /** VI 1칸 높이의 30%까지 축소 허용(높이·폭 동일 기준의 최소 단계) */
  const minBadgeHGrid = gridCellH * 0.3;
  const badgeMinDimPx = Math.max(4, minBadgeHGrid);
  /** 가로 축소 시 현재 높이(px) 이하로는 못 줄임(원형까지) */
  const badgeMinWidthPx = Math.max(4, badgePxH);
  const padXB = Math.max(1, Math.min(badgePxW * 0.035, badgePxH * 0.12, badgePxW * 0.08));
  const badgeCharsOptimal = 4;
  const badgeFontPx = Math.max(
    2.5,
    Math.min(
      badgePxH * 0.44,
      (Math.max(0, badgePxW - padXB * 2) / badgeCharsOptimal) * 1.88
    )
  );
  const badgeFill =
    content.posterBadgeColor === "black" ? "#000000" : VI_COLORS.brandMagenta;
  /** 부제 크기는 메인 타이틀 배율과 독립(캔버스 너비·posterSubtitleFontScale만 사용) */
  const subtitleFontSize = W * 0.045 * ((content.posterSubtitleFontScale ?? 100) / 100);

  const multiSel = selectedKeys.length >= 2;

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
          <span className="mr-1 text-[10px] font-medium text-gray-600">{selectedKeys.length}개 선택</span>
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
        {showViGrid && (
          <ViAlignmentGrid width={displayW} height={displayH} step={viGridStepPx} />
        )}
        {/* 이미지: 드래그·리사이즈, 모서리 라운드 */}
        {imageUrl && (
          <DraggableCanvasOverlay
            rect={imageRect}
            canvasW={displayW}
            canvasH={displayH}
            onRectChange={updateImageRect}
            isSelected={selectedKeys.includes("image")}
            onSelect={(opts) => {
              pickKey("image", !!opts?.additive);
              onFocusChange?.("image");
            }}
            zIndex={4}
            label="이미지"
            borderRadiusScale={2.5}
            snapStepPx={snapPx}
            onPan={(d, ev) => {
              if (!onContentChange) return;
              // Alt+드래그: 이미지 내부 위치 조정 (object-position)
              const curX = Number(content.posterImagePosX ?? 50);
              const curY = Number(content.posterImagePosY ?? 50);
              const nextX = Math.max(0, Math.min(100, curX + (d.dx / Math.max(1, imageRect.width * displayW)) * 50));
              const nextY = Math.max(0, Math.min(100, curY + (d.dy / Math.max(1, imageRect.height * displayH)) * 50));
              onContentChange({ ...content, posterImagePosX: nextX, posterImagePosY: nextY });
              // reset start to make panning incremental
              ev.stopPropagation?.();
            }}
          >
            <img
              src={imageUrl}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: `${content.posterImagePosX ?? 50}% ${content.posterImagePosY ?? 50}%`,
                opacity: Math.min(1, Math.max(0, Number(content.posterImageOpacity ?? 0) / 100)),
                display: "block",
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
            isSelected={selectedKeys.includes("title")}
            onSelect={(opts) => {
              pickKey("title", !!opts?.additive);
              onFocusChange?.("title");
            }}
            zIndex={10}
            label="메인 타이틀"
            borderRadiusMode="auto"
            snapStepPx={snapPx}
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
                display: "flex",
                alignItems: "flex-start",
                justifyContent: titleFlex.justifyContent,
                textAlign: titleFlex.textAlign,
              }}
            >
              <div style={{ width: "100%" }}>
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
                    const hasTri = Boolean(br?.length || ir?.length || ur?.length);
                    if (!content.title?.trim() && !hasTri) {
                      return (
                        <span style={{ ...tw, color: "#C4C4C4", textShadow: "none" }}>
                          메인 타이틀을 입력하세요
                        </span>
                      );
                    }
                    const endsDot = content.title.endsWith(".");
                    const mainText = endsDot ? content.title.slice(0, -1) : content.title;
                    if (hasTri) {
                      return (
                        <>
                          {renderPlainWithTriStyleRanges(mainText, br, ir, ur, tw, {
                            defaultWeight: 800,
                            strongWeight: 900,
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
              isSelected={selectedKeys.includes(`subtitle:${s.id}`)}
              onSelect={(opts) => {
                pickKey(`subtitle:${s.id}`, !!opts?.additive);
                onFocusChange?.(`subtitle:${s.id}`);
              }}
              zIndex={9}
              label="부제"
              borderRadiusMode="auto"
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
                  {content.posterSubtitleBoldRanges?.[s.id]?.length ||
                  content.posterSubtitleItalicRanges?.[s.id]?.length ||
                  content.posterSubtitleUnderlineRanges?.[s.id]?.length ? (
                    renderPlainWithTriStyleRanges(
                      s.text,
                      content.posterSubtitleBoldRanges?.[s.id],
                      content.posterSubtitleItalicRanges?.[s.id],
                      content.posterSubtitleUnderlineRanges?.[s.id],
                      subtitleTextStyle(content, s.id, subtitleFontSize, subtitleColor),
                      { defaultWeight: 680, strongWeight: 800 }
                    )
                  ) : (
                    s.text
                  )}
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
          const hasTri =
            Boolean(content.posterBodyBoldRanges?.[b.id]?.length) ||
            Boolean(content.posterBodyItalicRanges?.[b.id]?.length) ||
            Boolean(content.posterBodyUnderlineRanges?.[b.id]?.length);
          return (
            <DraggableCanvasOverlay
              key={b.id}
              rect={br}
              canvasW={displayW}
              canvasH={displayH}
              onRectChange={(next) => updateBodyBlockRect(b.id, next)}
              isSelected={selectedKeys.includes(bodyKey) || (b.id === "body-1" && selectedKeys.includes("body"))}
              onSelect={(opts) => {
                pickKey(bodyKey, !!opts?.additive);
                const ft: DesignFocusTarget =
                  b.id === "body-1" ? "body" : (`body:${b.id}` as `body:${string}`);
                onFocusChange?.(ft);
              }}
              zIndex={10}
              label={posterBodiesSafe.length > 1 ? `본문 (${bi + 1})` : "본문"}
              borderRadiusMode="auto"
              snapStepPx={snapPx}
              onOverlayDoubleClick={() => {
                onBeginCanvasTextEdit?.();
                setInlineEditTarget({ kind: "body", id: b.id });
              }}
              onRequestDelete={onContentChange ? removeBodyBlocksFromCanvas : undefined}
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
                    { defaultWeight: 400, strongWeight: 700 }
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
            isSelected={selectedKeys.includes("footer")}
            onSelect={(opts) => {
              pickKey("footer", !!opts?.additive);
              onFocusChange?.("footer");
            }}
            zIndex={10}
            label="유의사항"
            borderRadiusMode="auto"
            snapStepPx={snapPx}
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
                const hasTriF =
                  Boolean(content.posterFooterBoldRanges?.length) ||
                  Boolean(content.posterFooterItalicRanges?.length) ||
                  Boolean(content.posterFooterUnderlineRanges?.length);
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
                    { defaultWeight: 400, strongWeight: 700 }
                  )
                ) : (
                  content.emphasizedTitle
                );
              })()}
            </div>
          </DraggableCanvasOverlay>
        ) : null}

        {content.logoOption && (
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
              src={logoUrl || brandLogoSrc}
              alt="Brand Logo"
              style={{
                height: `${logoHeight}px`,
                width: "auto",
                objectFit: "contain",
                display: "block",
              }}
            />
          </div>
        )}

        {content.subtitle?.trim() && content.posterBadgeRect && (
          <DraggableCanvasOverlay
            rect={badgeRect}
            canvasW={displayW}
            canvasH={displayH}
            onRectChange={updateBadgeRect}
            isSelected={selectedKeys.includes("badge")}
            onSelect={(opts) => {
              pickKey("badge", !!opts?.additive);
              onFocusChange?.("badge");
            }}
            zIndex={16}
            label="뱃지"
            borderRadiusMode="pill"
            snapStepPx={1}
            minWidthPx={badgeMinWidthPx}
            minHeightPx={badgeMinDimPx}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: badgeFill,
                color: "#FFFFFF",
                fontSize: `${badgeFontPx}px`,
                fontWeight: 600,
                lineHeight: 1.2,
                padding: `${Math.max(0, badgePxH * 0.06)}px ${Math.max(0, badgePxW * 0.00175)}px`,
                boxSizing: "border-box",
                textAlign: "center",
                wordBreak: "keep-all",
              }}
            >
              {content.subtitle}
            </div>
          </DraggableCanvasOverlay>
        )}

        {assetLayers.map((asset) => (
          <DraggableAsset
            key={asset.id}
            asset={asset}
            canvasW={displayW}
            canvasH={displayH}
            snapStepPx={snapPx}
            isSelected={selectedKeys.includes(`asset:${asset.id}`)}
            onSelect={(id, opts) => {
              pickKey(`asset:${id}`, !!opts?.additive);
              onFocusChange?.({ assetId: id });
            }}
            onUpdate={handleAssetUpdate}
            onDelete={handleAssetDelete}
          />
        ))}

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
                  const lockedMap = { ...(content.posterBodyRectLocked ?? {}), [b.id]: false };
                  const baseBodies =
                    content.posterBodies && content.posterBodies.length > 0
                      ? [...content.posterBodies]
                      : [{ id: "body-1" as const, text: content.bodyText ?? "" }];
                  const nextBodies = baseBodies.map((bb) =>
                    bb.id === b.id ? { ...bb, text } : bb
                  );
                  onContentDraftChange({
                    ...content,
                    posterBodies: nextBodies,
                    bodyText: b.id === "body-1" ? text : content.bodyText,
                    posterBodyBoldRanges: { ...content.posterBodyBoldRanges, [b.id]: ranges },
                    posterBodyRectLocked: lockedMap,
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
      </div>
    </div>
  );
});
