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
    if (!r.ok) throw new Error(text.slice(0, 400) || `요청 실패 (HTTP ${r.status})`);
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
  const r = await fetch("/api/design-editor/inspect", {
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
  const r = await fetch("/api/design-editor/suggest-text", {
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
  const r = await fetch("/api/design-editor/correct-canvas", {
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
  const r = await fetch("/api/design-editor/replace-image", {
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
