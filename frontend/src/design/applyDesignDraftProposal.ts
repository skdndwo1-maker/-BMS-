import type { AssetLayer, DesignContent } from "./types";
import { applyViTypographyToContent } from "./applyViPatch";
import type { DesignEditorDraftProposal } from "@/lib/designEditorApi";

const AI_DRAFT_ASSET_PREFIX = "asset-ai-draft-";

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function stripPreviousDraftAssets(content: DesignContent): DesignContent {
  const layers = (content.assetLayers ?? []).filter((a) => !a.id.startsWith(AI_DRAFT_ASSET_PREFIX));
  return { ...content, assetLayers: layers.length > 0 ? layers : undefined };
}

export function applyDesignDraftProposal(
  content: DesignContent,
  proposal: DesignEditorDraftProposal,
  generated?: {
    image?: { mimeType: string; base64: string } | null;
    asset?: { name: string; svg: string } | null;
  }
): DesignContent {
  let next = stripPreviousDraftAssets({ ...content });

  next.title = proposal.title;
  next.emphasizedTitle = proposal.footer;
  next.logoOption = proposal.logoOption === "none" ? null : proposal.logoOption;
  next.logoPosition = proposal.logoPosition;

  if (proposal.backgroundColor) next.backgroundColor = proposal.backgroundColor;
  if (proposal.titleColor) next.titleColor = proposal.titleColor;
  if (proposal.bodyColor) next.bodyColor = proposal.bodyColor;
  if (proposal.footerColor) next.posterFooterColor = proposal.footerColor;

  next.posterTitleAlign = proposal.posterTitleAlign;
  next.posterBodyAlign = proposal.posterBodyAlign;
  next.posterFooterAlign = proposal.posterFooterAlign;

  next.posterTitleRect = proposal.titleRect;
  next.posterFooterRect = proposal.footerRect;
  next.posterTitleOnCanvas = true;
  next.posterFooterOnCanvas = true;
  next.posterTitleRectLocked = false;
  next.posterFooterRectLocked = false;

  const subtitles = proposal.subtitles.slice(0, 3);
  if (subtitles.length > 0) {
    const posterSubtitles = subtitles.map((text, i) => ({
      id: `sub-ai-${i + 1}`,
      text,
    }));
    const posterSubtitleRects: Record<string, { x: number; y: number; width: number; height: number }> =
      {};
    posterSubtitles.forEach((s, i) => {
      posterSubtitleRects[s.id] = proposal.subtitleRects[i] ?? proposal.subtitleRects[0];
    });
    next.posterSubtitles = posterSubtitles;
    next.posterSubtitleRects = posterSubtitleRects;
  } else {
    next.posterSubtitles = undefined;
    next.posterSubtitleRects = undefined;
  }

  const bodies = proposal.bodyBlocks.slice(0, 3);
  const posterBodies = bodies.map((text, i) => ({
    id: i === 0 ? "body-1" : `body-ai-${i + 1}`,
    text,
  }));
  const posterBodyRects: Record<string, { x: number; y: number; width: number; height: number }> = {};
  posterBodies.forEach((b, i) => {
    posterBodyRects[b.id] = proposal.bodyRects[i] ?? proposal.bodyRects[0];
  });
  next.posterBodies = posterBodies;
  next.posterBodyRects = posterBodyRects;
  next.bodyText = bodies[0] ?? "";
  next.posterBodyRect = proposal.bodyRects[0];
  next.posterBodyOnCanvas = true;
  next.posterBodyRectLocked = {};

  if (proposal.image.include && generated?.image) {
    const { mimeType, base64 } = generated.image;
    next.image = `data:${mimeType};base64,${base64}`;
    next.posterBackgroundImageRect = proposal.image.rect ?? { x: 0.55, y: 0.12, width: 0.38, height: 0.42 };
    next.posterImageOpacity = proposal.image.opacity ?? 100;
    next.posterImagePosX = 50;
    next.posterImagePosY = 50;
  }

  if (proposal.asset.include && generated?.asset) {
    const rect = proposal.asset.rect ?? { x: 0.62, y: 0.48, width: 0.28, height: 0.28 };
    const layer: AssetLayer = {
      id: `${AI_DRAFT_ASSET_PREFIX}${Date.now()}`,
      type: proposal.asset.kind,
      src: svgToDataUrl(generated.asset.svg),
      name: generated.asset.name,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
    };
    next.assetLayers = [...(next.assetLayers ?? []), layer];
  }

  return applyViTypographyToContent(next);
}
