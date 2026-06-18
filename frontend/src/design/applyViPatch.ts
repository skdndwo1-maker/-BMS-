import type { DesignContent } from "./types";
import { VI_COLORS, VI_FONT_STACK } from "./viCanvasConstants";
import { applyAxisLayoutGuide } from "./axisLayoutGuide";
import type { DesignEditorViolation } from "@/lib/designEditorApi";

/** AI·VI 기준으로 텍스트 스타일 필드를 가이드 값으로 맞춥니다. */
export function applyViTypographyToContent(content: DesignContent): DesignContent {
  return {
    ...content,
    titleFont: VI_FONT_STACK,
    subtitleFont: VI_FONT_STACK,
    bodyFont: VI_FONT_STACK,
    titleColor: VI_COLORS.textPrimary,
    subtitleColor: VI_COLORS.textSecondary,
    bodyColor: VI_COLORS.textSecondary,
  };
}

function mergeTextFromViolation(content: DesignContent, v: DesignEditorViolation): DesignContent {
  const next = { ...content };
  const set = (field: keyof DesignContent, val: string | undefined) => {
    if (val !== undefined && val.trim() !== "") Object.assign(next, { [field]: val });
  };
  set("title", v.proposedTitle);
  set("subtitle", v.proposedSubtitle);
  set("bodyText", v.proposedBodyText);
  set("emphasizedTitle", v.proposedEmphasizedTitle);
  set("date", v.proposedDate);
  set("venue", v.proposedVenue);
  if (v.proposedBodyText !== undefined && v.proposedBodyText.trim() !== "") {
    const blocks = next.posterBodies?.length
      ? [...next.posterBodies]
      : [{ id: "body-1", text: next.bodyText ?? "" }];
    if (blocks[0]) blocks[0] = { ...blocks[0], text: v.proposedBodyText };
    next.posterBodies = blocks;
  }
  return next;
}

export function applyLayoutReset(content: DesignContent, layoutReset: DesignEditorViolation["layoutReset"]): DesignContent {
  if (!layoutReset || layoutReset === "none") return content;
  let next = { ...content };
  if (layoutReset === "poster_defaults") {
    const category = next.axisLayoutCategory ?? "basic";
    const refSize =
      category === "square"
        ? { width: 260, height: 260 }
        : category === "wide" || category === "wide-event"
          ? { width: 1440, height: 300 }
          : category === "live"
            ? { width: 320, height: 568 }
            : category === "sns"
              ? { width: 1080, height: 1080 }
              : category === "xbanner"
                ? { width: 600, height: 1800 }
                : category === "placard-wide"
                  ? { width: 4700, height: 700 }
                  : { width: 466, height: 262 };
    next = applyAxisLayoutGuide(next, refSize, {
      force: true,
      templateCategory: next.axisLayoutProfile?.startsWith("web-") ? "marketing-banner" : undefined,
    });
  }
  if (layoutReset === "clear_text_overrides") {
    const { titleSize: _ts, subtitleSize: _ss, bodySize: _bs, titleFont: _tf, ...rest } = next;
    next = { ...rest } as DesignContent;
  }
  return next;
}

export function applyDesignEditorViolation(
  content: DesignContent,
  v: DesignEditorViolation
): DesignContent {
  let next = { ...content };
  if (v.fixKind === "text") {
    next = mergeTextFromViolation(next, v);
    next = applyViTypographyToContent(next);
  }
  if (v.fixKind === "layout") {
    next = applyLayoutReset(next, v.layoutReset ?? "none");
    next = applyViTypographyToContent(next);
  }
  return next;
}

export function applyImageDataUrl(
  content: DesignContent,
  dataUrl: string,
  targetAssetLayerId?: string | null
): DesignContent {
  if (targetAssetLayerId && content.assetLayers?.length) {
    return {
      ...content,
      assetLayers: content.assetLayers.map((a) =>
        a.id === targetAssetLayerId ? { ...a, src: dataUrl } : a
      ),
    };
  }
  return {
    ...content,
    image: dataUrl,
    posterImageOpacity: 100,
    posterImagePosX: 50,
    posterImagePosY: 50,
  };
}
