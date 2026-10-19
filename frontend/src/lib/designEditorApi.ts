import { apiUrl } from "./apiUrl.ts";

export type DesignEditorViolation = {
  category: string;
  issue: string;
  severity: string;
  fixKind: "text" | "image" | "layout";
  proposedTitle?: string;
  proposedSubtitle?: string;
  proposedBodyText?: string;
  proposedEmphasizedTitle?: string;
  proposedDate?: string;
  proposedVenue?: string;
  imageReplacementBrief?: string;
  targetAssetLayerId?: string;
  layoutReset?: "none" | "poster_defaults" | "clear_text_overrides";
};

export type DesignEditorInspectResponse = {
  score: number;
  overallSummary: string;
  violations: DesignEditorViolation[];
};

async function readJsonBody(r: Response): Promise<Record<string, unknown>> {
  const text = await r.text();
  if (!text) {
    if (!r.ok) throw new Error(`요청 실패 (HTTP ${r.status})`);
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (!r.ok) {
      if (text.includes("Cannot POST") || text.includes("<!DOCTYPE html>")) {
        throw new Error(
          `API 경로를 찾을 수 없습니다 (HTTP ${r.status}). 백엔드 서버를 최신 코드로 재시작·배포했는지 확인해 주세요.`
        );
      }
      throw new Error(text.slice(0, 400) || `요청 실패 (HTTP ${r.status})`);
    }
    throw new Error("서버 응답을 해석할 수 없습니다.");
  }
}

export async function inspectDesignCanvas(body: {
  imageBase64: string;
  imageMime: string;
  designContent: unknown;
  templateId: string;
  guidelineId?: string;
  creativeTopic?: string;
}): Promise<DesignEditorInspectResponse> {
  const r = await fetch(apiUrl("/api/design-editor/inspect"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJsonBody(r);
  if (!r.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `inspect_failed_${r.status}`);
  }
  return data as unknown as DesignEditorInspectResponse;
}

export type DesignEditorTextSuggestionTarget =
  | "mainTitle"
  | "subtitle"
  | "subtitle2"
  | "subtitle3"
  | "body"
  | "body2"
  | "body3"
  | "footer";

export type DesignEditorTextSuggestionResult = {
  mainTitle: string;
  subtitleLine: string;
  subtitleLine2: string;
  subtitleLine3: string;
  bodyText: string;
  bodyText2: string;
  bodyText3: string;
  emphasizedTitle: string;
};

export async function suggestDesignText(body: {
  contentJson: string;
  templateLabel: string;
  targets: DesignEditorTextSuggestionTarget[];
  guidelineId?: string;
  creativeTopic?: string;
}): Promise<DesignEditorTextSuggestionResult> {
  const r = await fetch(apiUrl("/api/design-editor/suggest-text"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJsonBody(r);
  if (!r.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "suggest_text_failed");
  }
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");
  return {
    mainTitle: s("mainTitle"),
    subtitleLine: s("subtitleLine"),
    subtitleLine2: s("subtitleLine2"),
    subtitleLine3: s("subtitleLine3"),
    bodyText: s("bodyText"),
    bodyText2: s("bodyText2"),
    bodyText3: s("bodyText3"),
    emphasizedTitle: s("emphasizedTitle"),
  };
}

export async function correctDesignCanvas(body: {
  designBase64: string;
  designMime: string;
  guidelineId?: string;
  mode: "inspection_followup" | "holistic";
  overallSummary?: string;
  violations?: Array<{ category: string; issue: string; severity: string }>;
  creativeTopic?: string;
}): Promise<{ mimeType: string; data: string; caption: string }> {
  const r = await fetch(apiUrl("/api/design-editor/correct-canvas"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJsonBody(r);
  if (!r.ok || typeof data.data !== "string" || typeof data.mimeType !== "string") {
    throw new Error(typeof data.error === "string" ? data.error : "correct_canvas_failed");
  }
  return {
    mimeType: data.mimeType,
    data: data.data,
    caption: typeof data.caption === "string" ? data.caption : "",
  };
}

export async function replaceDesignImage(body: {
  designBase64: string;
  designMime: string;
  imageBrief: string;
  guidelineId?: string;
  creativeTopic?: string;
}): Promise<{ mimeType: string; data: string }> {
  const r = await fetch(apiUrl("/api/design-editor/replace-image"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJsonBody(r);
  if (!r.ok || typeof data.data !== "string" || typeof data.mimeType !== "string") {
    throw new Error(typeof data.error === "string" ? data.error : "replace_image_failed");
  }
  return { mimeType: data.mimeType, data: data.data };
}

export type GeneratedDesignSvgAlternative = { name: string; svg: string };
export type GeneratedDesignImageAlternative = { name: string; mimeType: string; base64: string };
export type GeneratedDesignAssetAlternative = GeneratedDesignSvgAlternative | GeneratedDesignImageAlternative;

function isSvgAlternative(item: GeneratedDesignAssetAlternative): item is GeneratedDesignSvgAlternative {
  return "svg" in item && typeof item.svg === "string";
}

export async function generateDesignAsset(body: {
  assetKind: "pictogram" | "illustration" | "image";
  illustrationStyle?: "2d" | "3d";
  direction: string;
  templateLabel?: string;
  creativeTopic?: string;
  imageAspectRatio?: string;
}): Promise<{ alternatives: GeneratedDesignAssetAlternative[] }> {
  const r = await fetch(apiUrl("/api/design-editor/generate-asset"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJsonBody(r);
  if (!r.ok || !Array.isArray(data.alternatives)) {
    throw new Error(typeof data.error === "string" ? data.error : "generate_asset_failed");
  }
  const alternatives = (data.alternatives as unknown[])
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = typeof (item as { name?: unknown }).name === "string" ? (item as { name: string }).name : "";
      if (!name.trim()) return null;
      const svg = typeof (item as { svg?: unknown }).svg === "string" ? (item as { svg: string }).svg : "";
      if (svg.trim()) return { name: name.trim(), svg: svg.trim() } satisfies GeneratedDesignSvgAlternative;
      const mimeType =
        typeof (item as { mimeType?: unknown }).mimeType === "string"
          ? (item as { mimeType: string }).mimeType
          : "";
      const base64 =
        typeof (item as { base64?: unknown }).base64 === "string" ? (item as { base64: string }).base64 : "";
      if (mimeType.trim() && base64.trim()) {
        return {
          name: name.trim(),
          mimeType: mimeType.trim(),
          base64: base64.trim(),
        } satisfies GeneratedDesignImageAlternative;
      }
      return null;
    })
    .filter((x): x is GeneratedDesignAssetAlternative => x != null);
  if (alternatives.length === 0) {
    throw new Error(typeof data.error === "string" ? data.error : "generate_asset_failed");
  }
  return { alternatives };
}

export async function developDesignImage(body: {
  imageBase64: string;
  imageMime: string;
  developPrompt: string;
  templateLabel?: string;
  creativeTopic?: string;
}): Promise<{ mimeType: string; base64: string; caption: string }> {
  const r = await fetch(apiUrl("/api/design-editor/develop-image"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJsonBody(r);
  if (!r.ok || typeof data.base64 !== "string" || typeof data.mimeType !== "string") {
    throw new Error(typeof data.error === "string" ? data.error : "develop_image_failed");
  }
  return {
    mimeType: data.mimeType,
    base64: data.base64,
    caption: typeof data.caption === "string" ? data.caption : "",
  };
}

export { isSvgAlternative };

export type DesignEditorDraftProposal = {
  summary: string;
  logoOption: "CI" | "BI" | "SLOGAN" | "none";
  logoPosition:
    | "top-left"
    | "top-center"
    | "top-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";
  title: string;
  subtitles: string[];
  bodyBlocks: string[];
  footer: string;
  backgroundColor?: string;
  titleColor?: string;
  bodyColor?: string;
  footerColor?: string;
  posterTitleAlign: "left" | "center" | "right";
  posterBodyAlign: "left" | "center" | "right";
  posterFooterAlign: "left" | "center" | "right";
  titleRect: { x: number; y: number; width: number; height: number };
  subtitleRects: Array<{ x: number; y: number; width: number; height: number }>;
  bodyRects: Array<{ x: number; y: number; width: number; height: number }>;
  footerRect: { x: number; y: number; width: number; height: number };
  image: {
    include: boolean;
    brief: string;
    rect?: { x: number; y: number; width: number; height: number };
    opacity?: number;
  };
  asset: {
    include: boolean;
    kind: "pictogram" | "illustration";
    illustrationStyle?: "2d" | "3d";
    brief: string;
    rect?: { x: number; y: number; width: number; height: number };
  };
};

export type DesignEditorDraftProposalResponse = {
  proposal: DesignEditorDraftProposal;
  generatedImage: { mimeType: string; base64: string; name: string } | null;
  generatedAsset: { name: string; svg: string } | null;
};

export async function proposeDesignDraft(body: {
  contentJson: string;
  templateLabel: string;
  templateMeta?: {
    name?: string;
    category?: string;
    width?: number;
    height?: number;
    unit?: string;
    mediaType?: string;
    posterCategory?: string;
  };
  guidelineId?: string;
  creativeTopic: string;
}): Promise<DesignEditorDraftProposalResponse> {
  const r = await fetch(apiUrl("/api/design-editor/propose-draft"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJsonBody(r);
  if (!r.ok || !data.proposal || typeof data.proposal !== "object") {
    throw new Error(typeof data.error === "string" ? data.error : "propose_draft_failed");
  }
  return {
    proposal: data.proposal as DesignEditorDraftProposal,
    generatedImage:
      data.generatedImage && typeof data.generatedImage === "object"
        ? (data.generatedImage as { mimeType: string; base64: string; name: string })
        : null,
    generatedAsset:
      data.generatedAsset && typeof data.generatedAsset === "object"
        ? (data.generatedAsset as { name: string; svg: string })
        : null,
  };
}
