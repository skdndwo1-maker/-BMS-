import type { CanvasTextAlign, DesignContent, PosterElementTypography } from "@/design/types";
import type { CanvasTextEditTarget } from "@/design/canvasTextTypography";
import {
  getPosterBodyBlockTypography,
  resolvePosterBodyTypographyBlockId,
} from "@/design/posterBodyDisplay";

function patchTypo(
  base: PosterElementTypography | undefined,
  patch: Partial<PosterElementTypography>
): PosterElementTypography {
  return { ...base, ...patch };
}

export function applyTypoToTargets(
  prev: DesignContent,
  targets: CanvasTextEditTarget[],
  patch: Partial<PosterElementTypography>
): DesignContent {
  let next = prev;
  for (const target of targets) {
    if (target.kind === "badge") continue;
    if (target.kind === "title") {
      next = { ...next, posterTitleTypography: patchTypo(next.posterTitleTypography, patch) };
    } else if (target.kind === "footer") {
      next = { ...next, posterFooterTypography: patchTypo(next.posterFooterTypography, patch) };
    } else if (target.kind === "body") {
      const resolvedId = resolvePosterBodyTypographyBlockId(next, target.id);
      next = {
        ...next,
        posterBodyTypography: {
          ...(next.posterBodyTypography ?? {}),
          [resolvedId]: patchTypo(getPosterBodyBlockTypography(next, resolvedId), patch),
        },
      };
    } else if (target.kind === "subtitle") {
      next = {
        ...next,
        posterSubtitleTypography: {
          ...(next.posterSubtitleTypography ?? {}),
          [target.id]: patchTypo(next.posterSubtitleTypography?.[target.id], patch),
        },
      };
    }
  }
  return next;
}

export function applyScaleToTargets(
  prev: DesignContent,
  targets: CanvasTextEditTarget[],
  scale: number
): DesignContent {
  let next = prev;
  for (const target of targets) {
    if (target.kind === "badge") continue;
    if (target.kind === "title") next = { ...next, posterTitleFontScale: scale };
    else if (target.kind === "footer") next = { ...next, posterFooterFontScale: scale };
    else if (target.kind === "body") {
      const resolvedId = resolvePosterBodyTypographyBlockId(next, target.id);
      next = {
        ...next,
        posterBodyFontScales: { ...(next.posterBodyFontScales ?? {}), [resolvedId]: scale },
      };
    } else if (target.kind === "subtitle") {
      next = {
        ...next,
        posterSubtitleFontScales: { ...(next.posterSubtitleFontScales ?? {}), [target.id]: scale },
      };
    }
  }
  return next;
}

export function applyAlignToTargets(
  prev: DesignContent,
  targets: CanvasTextEditTarget[],
  align: CanvasTextAlign
): DesignContent {
  let next = prev;
  for (const target of targets) {
    if (target.kind === "badge") continue;
    if (target.kind === "title") next = { ...next, posterTitleAlign: align };
    else if (target.kind === "footer") next = { ...next, posterFooterAlign: align };
    else if (target.kind === "body") {
      const resolvedId = resolvePosterBodyTypographyBlockId(next, target.id);
      next = {
        ...next,
        posterBodyAligns: { ...(next.posterBodyAligns ?? {}), [resolvedId]: align },
      };
    } else if (target.kind === "subtitle") {
      next = {
        ...next,
        posterSubtitleAlign: { ...(next.posterSubtitleAlign ?? {}), [target.id]: align },
      };
    }
  }
  return next;
}

export function applyColorToTargets(
  prev: DesignContent,
  targets: CanvasTextEditTarget[],
  hex: string
): DesignContent {
  let next = prev;
  for (const target of targets) {
    if (target.kind === "badge") continue;
    if (target.kind === "title") next = { ...next, titleColor: hex };
    else if (target.kind === "footer") next = { ...next, posterFooterColor: hex };
    else if (target.kind === "body") {
      const resolvedId = resolvePosterBodyTypographyBlockId(next, target.id);
      const colors = { ...(next.posterBodyColors ?? {}), [resolvedId]: hex };
      const first = resolvePosterBodyTypographyBlockId(next, "body-1");
      next = {
        ...next,
        posterBodyColors: colors,
        ...(resolvedId === first ? { bodyColor: hex } : {}),
      };
    } else if (target.kind === "subtitle") {
      next = {
        ...next,
        posterSubtitleColors: { ...(next.posterSubtitleColors ?? {}), [target.id]: hex },
        ...(target.id === (next.posterSubtitles?.[0]?.id ?? "subtitle-1")
          ? { subtitleColor: hex }
          : {}),
      };
    }
  }
  return next;
}
