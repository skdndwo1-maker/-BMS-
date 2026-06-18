import type { DesignContent } from "./types";

/** 이미지 보정 슬라이더 기본값 (100 = CSS filter 기본) */
export const IMAGE_BRIGHTNESS_DEFAULT = 100;
export const IMAGE_CONTRAST_DEFAULT = 100;
export const IMAGE_SATURATION_DEFAULT = 100;
export const IMAGE_OPACITY_DEFAULT = 100;

export const IMAGE_ADJUST_MIN = 0;
export const IMAGE_ADJUST_MAX = 200;

export function resolvePosterImageBrightness(content: DesignContent): number {
  return content.posterImageBrightness ?? IMAGE_BRIGHTNESS_DEFAULT;
}

export function resolvePosterImageContrast(content: DesignContent): number {
  return content.posterImageContrast ?? IMAGE_CONTRAST_DEFAULT;
}

export function resolvePosterImageSaturation(content: DesignContent): number {
  return content.posterImageSaturation ?? IMAGE_SATURATION_DEFAULT;
}

export function resolvePosterImageOpacity(content: DesignContent): number {
  return content.posterImageOpacity ?? IMAGE_OPACITY_DEFAULT;
}

export function buildPosterImageCssFilter(content: DesignContent): string | undefined {
  const b = resolvePosterImageBrightness(content);
  const c = resolvePosterImageContrast(content);
  const s = resolvePosterImageSaturation(content);
  if (b === IMAGE_BRIGHTNESS_DEFAULT && c === IMAGE_CONTRAST_DEFAULT && s === IMAGE_SATURATION_DEFAULT) {
    return undefined;
  }
  return `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
}
