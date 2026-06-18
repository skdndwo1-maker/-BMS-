import type { DesignContent } from "./types";
import { DEFAULT_POSTER_BG_RECT } from "./posterDefaults";

export type PosterImagePlacementMode = "round-box" | "full-background";

export type NormalizedRect = { x: number; y: number; width: number; height: number };

export const FULL_BACKGROUND_IMAGE_RECT: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

export function getPosterImagePlacementMode(content: DesignContent): PosterImagePlacementMode {
  return content.posterImagePlacementMode ?? "round-box";
}

export function isFullBackgroundImageRect(rect: NormalizedRect): boolean {
  return rect.x < 0.001 && rect.y < 0.001 && rect.width > 0.99 && rect.height > 0.99;
}

export function resolvePosterImageRect(
  content: DesignContent,
  fallbackRoundBoxRect: NormalizedRect = DEFAULT_POSTER_BG_RECT
): NormalizedRect {
  if (getPosterImagePlacementMode(content) === "full-background") {
    return FULL_BACKGROUND_IMAGE_RECT;
  }
  return content.posterBackgroundImageRect ?? fallbackRoundBoxRect;
}

export function resolvePosterImageZIndex(content: DesignContent): number {
  return getPosterImagePlacementMode(content) === "full-background" ? 1 : 4;
}

/** 업로드·AI 생성 시 이미지 + 배치 방식 적용 */
export function applyPosterImageToContent(
  prev: DesignContent,
  dataUri: string,
  mode: PosterImagePlacementMode = getPosterImagePlacementMode(prev)
): DesignContent {
  const roundRect = prev.posterRoundBoxImageRect ?? prev.posterBackgroundImageRect ?? DEFAULT_POSTER_BG_RECT;
  const rect = mode === "full-background" ? FULL_BACKGROUND_IMAGE_RECT : roundRect;

  return {
    ...prev,
    image: dataUri,
    posterImagePlacementMode: mode,
    posterBackgroundImageRect: rect,
    posterRoundBoxImageRect:
      mode === "round-box"
        ? rect
        : isFullBackgroundImageRect(roundRect)
          ? prev.posterRoundBoxImageRect ?? DEFAULT_POSTER_BG_RECT
          : roundRect,
    posterImageOpacity: 100,
    posterImagePosX: 50,
    posterImagePosY: 50,
  };
}

/** 배치 방식 전환 — 라운드 박스 rect 보존 */
export function setPosterImagePlacementMode(
  prev: DesignContent,
  mode: PosterImagePlacementMode
): DesignContent {
  if (getPosterImagePlacementMode(prev) === mode) return prev;

  const currentRect = prev.posterBackgroundImageRect ?? DEFAULT_POSTER_BG_RECT;
  const savedRound =
    prev.posterRoundBoxImageRect ??
    (isFullBackgroundImageRect(currentRect) ? DEFAULT_POSTER_BG_RECT : currentRect);

  if (mode === "full-background") {
    return {
      ...prev,
      posterImagePlacementMode: mode,
      posterRoundBoxImageRect: isFullBackgroundImageRect(currentRect) ? savedRound : currentRect,
      posterBackgroundImageRect: FULL_BACKGROUND_IMAGE_RECT,
    };
  }

  return {
    ...prev,
    posterImagePlacementMode: mode,
    posterRoundBoxImageRect: savedRound,
    posterBackgroundImageRect: savedRound,
  };
}
