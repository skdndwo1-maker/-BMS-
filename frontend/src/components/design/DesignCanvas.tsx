import { useRef, useEffect, useState, useCallback } from "react";
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
} from "@/design/posterDefaults";

function normalizeLogoPosition(pos: string | undefined): LogoPosition {
  const allowed: LogoPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
  if (pos && allowed.includes(pos as LogoPosition)) return pos as LogoPosition;
  return "top-left";
}

const MAGENTA = "#F43182";
const DARK = "#1A1A1A";
const GRAY = "#5A5A5A";
const LIGHT_GRAY = "#B0B0B0";

type CanvasOverlay = "image" | "badge" | "title" | "body" | "footer" | null;

export type DesignFocusTarget =
  | "image"
  | "badge"
  | "title"
  | "body"
  | "footer"
  | "logo"
  | { assetId: string }
  | null;

interface DesignCanvasProps {
  content: DesignContent;
  canvasSize: CanvasSize;
  zoom: number;
  onContentChange?: (content: DesignContent) => void;
  onFocusChange?: (t: DesignFocusTarget) => void;
}

export function DesignCanvas({ content, canvasSize, zoom, onContentChange, onFocusChange }: DesignCanvasProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);
  const [containerH, setContainerH] = useState(600);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<CanvasOverlay>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

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
    if (content.title?.trim() && !content.posterTitleRect) patch.posterTitleRect = DEFAULT_POSTER_TITLE_RECT;
    if (content.bodyText?.trim() && !content.posterBodyRect) patch.posterBodyRect = DEFAULT_POSTER_BODY_RECT;
    if (content.emphasizedTitle?.trim() && !content.posterFooterRect) patch.posterFooterRect = DEFAULT_POSTER_FOOTER_RECT;
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

  const bgColor = content.backgroundColor || "#FFFFFF";
  const titleColor = content.titleColor || DARK;
  const bodyColor = content.bodyColor || GRAY;

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

  const handleAssetUpdate = useCallback(
    (id: string, patch: Partial<AssetLayer>) => {
      if (!onContentChange) return;
      const updated = assetLayers.map((a) => (a.id === id ? { ...a, ...patch } : a));
      onContentChange({ ...content, assetLayers: updated });
    },
    [content, assetLayers, onContentChange]
  );

  const handleAssetDelete = useCallback(
    (id: string) => {
      if (!onContentChange) return;
      onContentChange({ ...content, assetLayers: assetLayers.filter((a) => a.id !== id) });
      setSelectedAssetIds((prev) => prev.filter((x) => x !== id));
    },
    [content, assetLayers, onContentChange]
  );

  const handleCanvasClick = useCallback(() => {
    setSelectedAssetIds([]);
    setSelectedOverlay(null);
    onFocusChange?.(null);
  }, []);

  const imageRect = content.posterBackgroundImageRect ?? DEFAULT_POSTER_BG_RECT;
  const badgeRect = content.posterBadgeRect ?? DEFAULT_POSTER_BADGE_RECT;
  const titleRect = content.posterTitleRect ?? DEFAULT_POSTER_TITLE_RECT;
  const bodyRect = content.posterBodyRect ?? DEFAULT_POSTER_BODY_RECT;
  const footerRect = content.posterFooterRect ?? DEFAULT_POSTER_FOOTER_RECT;

  const updateImageRect = useCallback(
    (next: typeof imageRect) => {
      if (!onContentChange) return;
      onContentChange({ ...content, posterBackgroundImageRect: next });
    },
    [content, onContentChange]
  );

  const updateBadgeRect = useCallback(
    (next: typeof badgeRect) => {
      if (!onContentChange) return;
      onContentChange({ ...content, posterBadgeRect: next });
    },
    [content, onContentChange]
  );

  const updateTitleRect = useCallback(
    (next: typeof titleRect) => {
      if (!onContentChange) return;
      onContentChange({ ...content, posterTitleRect: next });
    },
    [content, onContentChange]
  );

  const updateBodyRect = useCallback(
    (next: typeof bodyRect) => {
      if (!onContentChange) return;
      onContentChange({ ...content, posterBodyRect: next });
    },
    [content, onContentChange]
  );

  const updateFooterRect = useCallback(
    (next: typeof footerRect) => {
      if (!onContentChange) return;
      onContentChange({ ...content, posterFooterRect: next });
    },
    [content, onContentChange]
  );

  const badgePxH = badgeRect.height * displayH;
  const badgeFontPx = Math.max(10, Math.min(badgePxH * 0.45, (badgeRect.width * displayW) * 0.08));

  return (
    <div
      ref={outerRef}
      style={{
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
          fontFamily: '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        }}
        onClick={handleCanvasClick}
      >
        {/* 이미지: 드래그·리사이즈, 모서리 라운드 */}
        {imageUrl && (
          <DraggableCanvasOverlay
            rect={imageRect}
            canvasW={displayW}
            canvasH={displayH}
            onRectChange={updateImageRect}
            isSelected={selectedOverlay === "image"}
            onSelect={(opts) => {
              setSelectedOverlay("image");
              setSelectedAssetIds([]);
              onFocusChange?.("image");
              if (opts?.toggle) return;
            }}
            zIndex={4}
            label="이미지"
            borderRadiusScale={2.5}
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
        {content.title && (
          <DraggableCanvasOverlay
            rect={titleRect}
            canvasW={displayW}
            canvasH={displayH}
            onRectChange={updateTitleRect}
            isSelected={selectedOverlay === "title"}
            onSelect={() => {
              setSelectedOverlay("title");
              setSelectedAssetIds([]);
              onFocusChange?.("title");
            }}
            zIndex={10}
            label="메인 타이틀"
            borderRadiusMode="auto"
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "flex-start",
                justifyContent:
                  (content.posterTitleAlign ?? "left") === "center"
                    ? "center"
                    : (content.posterTitleAlign ?? "left") === "right"
                      ? "flex-end"
                      : "flex-start",
                textAlign: content.posterTitleAlign ?? "left",
              }}
            >
              <div style={{ width: "100%" }}>
                <h1
                  style={{
                    fontSize: `${titleFontSize}px`,
                    fontWeight: 900, // Extra-Bold+ (요청: 기존 대비 더 굵게)
                    // 900 이상을 직접 지정하기 어려워, 미세 그림자로 체감 굵기(≈+20%)를 보정
                    textShadow:
                      "0.6px 0 0 currentColor, -0.6px 0 0 currentColor, 0 0.6px 0 currentColor, 0 -0.6px 0 currentColor",
                    color: titleColor,
                    lineHeight: 1.15,
                    letterSpacing: "-0.025em",
                    wordBreak: "keep-all",
                    width: "100%",
                    margin: 0,
                  }}
                >
                  {content.title.endsWith(".") ? (
                    <>
                      {content.title.slice(0, -1)}
                      <span
                        style={{
                          display: "inline-block",
                          width: `${titleFontSize * 0.2}px`,
                          height: `${titleFontSize * 0.2}px`,
                          borderRadius: "50%",
                          background: MAGENTA,
                          marginLeft: `${titleFontSize * 0.1}px`,
                          verticalAlign: "baseline",
                        }}
                      />
                    </>
                  ) : (
                    content.title
                  )}
                </h1>
              </div>
            </div>
          </DraggableCanvasOverlay>
        )}

        {content.bodyText && (
          <DraggableCanvasOverlay
            rect={bodyRect}
            canvasW={displayW}
            canvasH={displayH}
            onRectChange={updateBodyRect}
            isSelected={selectedOverlay === "body"}
            onSelect={() => {
              setSelectedOverlay("body");
              setSelectedAssetIds([]);
              onFocusChange?.("body");
            }}
            zIndex={10}
            label="본문"
            borderRadiusMode="auto"
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                fontSize: `${bodyFontSize}px`,
                fontWeight: 400,
                color: bodyColor,
                lineHeight: 1.75,
                whiteSpace: "pre-wrap",
                textAlign: content.posterBodyAlign ?? "left",
              }}
            >
              {content.bodyText}
            </div>
          </DraggableCanvasOverlay>
        )}

        {content.emphasizedTitle && (
          <DraggableCanvasOverlay
            rect={footerRect}
            canvasW={displayW}
            canvasH={displayH}
            onRectChange={updateFooterRect}
            isSelected={selectedOverlay === "footer"}
            onSelect={() => {
              setSelectedOverlay("footer");
              setSelectedAssetIds([]);
              onFocusChange?.("footer");
            }}
            zIndex={10}
            label="유의사항"
            borderRadiusMode="auto"
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                fontSize: `${disclaimerSize}px`,
                fontWeight: 400,
                color: LIGHT_GRAY,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                textAlign: content.posterFooterAlign ?? "left",
              }}
            >
              {content.emphasizedTitle}
            </div>
          </DraggableCanvasOverlay>
        )}

        {content.logoOption && (
          <div
            style={{ position: "absolute", ...logoPositionStyle, zIndex: 12, pointerEvents: "auto", cursor: "pointer" }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setSelectedOverlay("logo");
              setSelectedAssetIds([]);
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
                // CI 에셋이 (알파가 없는) 블랙 배경으로 들어오는 경우가 있어,
                // 밝은 캔버스 배경에서는 screen 블렌드로 블랙을 최대한 제거
                mixBlendMode: !logoUrl && content.logoOption === "CI" ? ("screen" as const) : ("normal" as const),
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
            isSelected={selectedOverlay === "badge"}
            onSelect={() => {
              setSelectedOverlay("badge");
              setSelectedAssetIds([]);
              onFocusChange?.("badge");
            }}
            zIndex={16}
            label="뱃지"
            borderRadiusMode="pill"
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: MAGENTA,
                color: "#FFFFFF",
                fontSize: `${badgeFontPx}px`,
                fontWeight: 700,
                lineHeight: 1.2,
                padding: `${badgePxH * 0.06}px ${badgeRect.width * displayW * 0.0035}px`,
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
            isSelected={selectedAssetIds.includes(asset.id)}
            onSelect={(id, opts) => {
              setSelectedOverlay(null);
              onFocusChange?.({ assetId: id });
              setSelectedAssetIds((prev) => {
                if (opts?.toggle) return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
                return [id];
              });
            }}
            onUpdate={handleAssetUpdate}
            onDelete={handleAssetDelete}
          />
        ))}
      </div>
    </div>
  );
}
