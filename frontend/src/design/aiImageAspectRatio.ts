import type { DesignContent } from "./types";
import { DEFAULT_POSTER_BG_RECT } from "./posterDefaults";
import { resolvePosterImageRect } from "./posterImagePlacement";

/** UI·API 공통 이미지 생성 비율 ID */
export type AiImageAspectRatioId = "4:3" | "3:4" | "16:9" | "9:16" | "5:5" | "20:8";

export type AiImageAspectRatioOption = {
  id: AiImageAspectRatioId;
  label: string;
  /** 가로÷세로 */
  ratio: number;
};

export const AI_IMAGE_ASPECT_RATIO_OPTIONS: readonly AiImageAspectRatioOption[] = [
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "5:5", label: "5:5", ratio: 1 },
  { id: "20:8", label: "20:8", ratio: 20 / 8 },
] as const;

export function isAiImageAspectRatioId(v: string): v is AiImageAspectRatioId {
  return AI_IMAGE_ASPECT_RATIO_OPTIONS.some((o) => o.id === v);
}

/** 캔버스·배치 rect 기준 이미지 영역 가로÷세로 */
export function computePosterImageAreaAspectRatio(
  content: DesignContent,
  canvasWidth: number,
  canvasHeight: number
): number {
  const rect = resolvePosterImageRect(content, DEFAULT_POSTER_BG_RECT);
  const cw = Math.max(1, canvasWidth);
  const ch = Math.max(1, canvasHeight);
  const w = Math.max(0.001, rect.width * cw);
  const h = Math.max(0.001, rect.height * ch);
  return w / h;
}

/** target 비율에 가장 가까운 옵션 ID */
export function detectClosestAiImageAspectRatio(targetAspect: number): AiImageAspectRatioId {
  const t = Math.max(0.01, targetAspect);
  let best = AI_IMAGE_ASPECT_RATIO_OPTIONS[0];
  let bestDiff = Infinity;
  for (const opt of AI_IMAGE_ASPECT_RATIO_OPTIONS) {
    const diff = Math.abs(Math.log(opt.ratio) - Math.log(t));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = opt;
    }
  }
  return best.id;
}

export function getAiImageAspectRatioLabel(id: AiImageAspectRatioId): string {
  return AI_IMAGE_ASPECT_RATIO_OPTIONS.find((o) => o.id === id)?.label ?? id;
}
