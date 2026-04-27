import { apiUrl } from "./apiUrl.ts";

export type GuidelineInfo = {
  id: string;
  displayName: string;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  uploadedAt: string | null;
  aiSummary: string | null;
  aiAnalyzedAt: string | null;
  hasFile: boolean;
};

export type InspectionRunResult = {
  ok: boolean;
  score: number;
  /** Gemini 종합 평가 문단 */
  overallSummary?: string;
  violations: Array<{ category: string; issue: string; severity: string }>;
  guidelineId: string;
  usedGuidelineSummary: boolean;
  /** AI가 생성한 브랜드 보완 이미지 */
  revisedImage: { mimeType: string; data: string } | null;
  /** 수정 이미지와 함께 나온 짧은 설명 */
  revisionCaption: string | null;
  /** 이미지 미생성 시 안내 */
  revisionNote: string | null;
};

/** 번들에 포함된 고정 PDF로 해당 슬롯을 덮어쓰고 AI 요약까지 시도 */
export async function syncGuidelineFromFixed(id: string): Promise<{ guideline: GuidelineInfo }> {
  const r = await fetch(apiUrl(`/api/guidelines/${encodeURIComponent(id)}/sync-fixed`), {
    method: "POST"
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `sync-fixed ${r.status}`);
  }
  return (await r.json()) as { guideline: GuidelineInfo };
}

export async function fetchGuideline(id: string): Promise<GuidelineInfo | null> {
  const r = await fetch(apiUrl(`/api/guidelines/${encodeURIComponent(id)}`));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`guideline: ${r.status}`);
  return (await r.json()) as GuidelineInfo;
}

export async function uploadGuideline(
  id: string,
  file: File,
  displayName?: string
): Promise<{ guideline: Partial<GuidelineInfo> }> {
  const fd = new FormData();
  fd.append("file", file);
  if (displayName) fd.append("displayName", displayName);
  const r = await fetch(apiUrl(`/api/guidelines/${encodeURIComponent(id)}/upload`), {
    method: "POST",
    body: fd
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `upload ${r.status}`);
  }
  return (await r.json()) as { guideline: Partial<GuidelineInfo> };
}

export async function runInspection(opts: {
  design: File;
  guidelineId: string;
  additionalNotes?: string;
  /** 고정 참조 옵션 외 보완용 — 검수 시에만 서버로 전달(슬롯을 덮어쓰지 않음) */
  supplementaryReference?: File | null;
  businessCategory?: string;
  designGroup?: "online" | "offline";
  designType?: string;
}): Promise<InspectionRunResult> {
  const fd = new FormData();
  fd.append("design", opts.design);
  fd.append("guidelineId", opts.guidelineId);
  if (opts.additionalNotes?.trim()) {
    fd.append("additionalNotes", opts.additionalNotes.trim());
  }
  if (opts.businessCategory?.trim()) {
    fd.append("businessCategory", opts.businessCategory.trim());
  }
  if (opts.designGroup) {
    fd.append("designGroup", opts.designGroup);
  }
  if (opts.designType?.trim()) {
    fd.append("designType", opts.designType.trim());
  }
  if (opts.supplementaryReference) {
    fd.append("supplementaryReference", opts.supplementaryReference);
  }
  const r = await fetch(apiUrl("/api/inspection/run"), {
    method: "POST",
    body: fd
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `inspection ${r.status}`);
  }
  return (await r.json()) as InspectionRunResult;
}

export type InspectionFollowupResult = {
  ok: boolean;
  replyText: string;
  revisedImage: { mimeType: string; data: string } | null;
  imageUpdated: boolean;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** 검수 후 에이전트 채팅: 가이드·검수 맥락 반영, 이미지면 수정본 추가 생성 가능 */
export async function inspectionAgentFollowup(opts: {
  guidelineId: string;
  message: string;
  designFile: File;
  revisionDataUrl?: string | null;
  overallSummary: string;
  violations: Array<{ category: string; issue: string; severity: string }>;
  additionalNotes?: string;
}): Promise<InspectionFollowupResult> {
  const designBase64 = await readFileAsBase64(opts.designFile);
  let revisionBase64: string | undefined;
  let revisionMime: string | undefined;
  if (opts.revisionDataUrl?.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/s.exec(opts.revisionDataUrl);
    if (m) {
      revisionMime = m[1];
      revisionBase64 = m[2];
    }
  }
  const r = await fetch(apiUrl("/api/inspection/followup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guidelineId: opts.guidelineId,
      message: opts.message,
      designMime: opts.designFile.type || "application/octet-stream",
      designBase64,
      revisionBase64: revisionBase64 ?? "",
      revisionMime: revisionMime ?? "",
      overallSummary: opts.overallSummary,
      violations: opts.violations,
      additionalNotes: opts.additionalNotes?.trim() ?? ""
    })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `followup ${r.status}`);
  }
  return (await r.json()) as InspectionFollowupResult;
}

export type AdditionalRevisionResult = {
  ok: boolean;
  revisedImage: { mimeType: string; data: string } | null;
  imageUpdated: boolean;
  revisionNote?: string;
};

/** 검수 결과 화면의 "추가 수정": 기획 프롬프트 후 이미지 생성만 수행 */
export async function runAdditionalRevisionImage(opts: {
  guidelineId: string;
  designFile: File;
  revisionDataUrl?: string | null;
  overallSummary: string;
  violations: Array<{ category: string; issue: string; severity: string }>;
  additionalNotes?: string;
  supplementaryFile?: File | null;
}): Promise<AdditionalRevisionResult> {
  const designBase64 = await readFileAsBase64(opts.designFile);
  let revisionBase64 = "";
  let revisionMime = "";
  if (opts.revisionDataUrl?.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/s.exec(opts.revisionDataUrl);
    if (m) {
      revisionMime = m[1];
      revisionBase64 = m[2];
    }
  }
  let supplementaryBase64 = "";
  let supplementaryMime = "";
  if (opts.supplementaryFile && opts.supplementaryFile.size > 0) {
    supplementaryMime = opts.supplementaryFile.type || "application/octet-stream";
    supplementaryBase64 = await readFileAsBase64(opts.supplementaryFile);
  }
  const r = await fetch(apiUrl("/api/inspection/additional-revision"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guidelineId: opts.guidelineId,
      designMime: opts.designFile.type || "application/octet-stream",
      designBase64,
      revisionBase64,
      revisionMime,
      overallSummary: opts.overallSummary,
      violations: opts.violations,
      additionalNotes: opts.additionalNotes?.trim() ?? "",
      supplementaryMime,
      supplementaryBase64
    })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `additional-revision ${r.status}`);
  }
  return (await r.json()) as AdditionalRevisionResult;
}

export type BrandNamingMode = "generate" | "audit";

/** 생성 모드: 네이밍 대안 1건 — 검수와 동일 6축(각 0~100) + 항목별 상세 근거 */
export type BrandNamingProposal = {
  name: string;
  rationale: string;
  hierarchyScore: number;
  originalityDimensionScore: number;
  pronunciationScore: number;
  legalityScore: number;
  publicAppealScore: number;
  scalabilityScore: number;
  proposalDetailLogic: {
    hierarchy: string;
    originality: string;
    pronunciationLanguage: string;
    legality: string;
    publicAppeal: string;
    scalability: string;
  };
};

function pickFirstDefined(r: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (!(k in r)) continue;
    const v = r[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function clampNamingScore(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(100, Math.max(0, Math.round(x)));
}

function firstNonEmptyString(...candidates: unknown[]): string {
  for (const c of candidates) {
    const t = String(c ?? "").trim();
    if (t) return t;
  }
  return "";
}

/**
 * API·모델이 키 이름을 달리 넘겨도 UI 6축 점수·상세에 맞춤.
 */
export function normalizeNamingProposal(raw: unknown): BrandNamingProposal {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const nestedRaw = r.proposalDetailLogic;
  const nested =
    nestedRaw && typeof nestedRaw === "object" && !Array.isArray(nestedRaw)
      ? (nestedRaw as Record<string, unknown>)
      : {};

  const hierarchyScore = clampNamingScore(
    pickFirstDefined(r, [
      "hierarchyScore",
      "hierarchy_score",
      "brandHierarchyScore",
      "logicScore",
      "logic_score",
    ])
  );
  const originalityDimensionScore = clampNamingScore(
    pickFirstDefined(r, [
      "uniquenessScore",
      "uniqueness_score",
      "originalityDimensionScore",
      "originality_dimension_score",
      "originalityScore",
      "creativityScore",
      "creativity_score",
    ])
  );
  const pronunciationScore = clampNamingScore(
    pickFirstDefined(r, [
      "pronunciationScore",
      "pronunciation_score",
      "pronunciationLanguageScore",
      "pronunciation_language_score",
      "metaphorScore",
    ])
  );
  const legalityScore = clampNamingScore(
    pickFirstDefined(r, ["legalScore", "legal_score", "legalityScore", "legality_score"])
  );
  const publicAppealRaw = pickFirstDefined(r, [
    "publicAppealScore",
    "public_appeal_score",
    "massAppealScore",
    "popularityScore",
  ]);
  const scalabilityRaw = pickFirstDefined(r, ["scalabilityScore", "scalability_score", "extensionScore"]);
  const overallHint = pickFirstDefined(r, ["overallScore"]);
  const publicAppealScore =
    publicAppealRaw !== undefined
      ? clampNamingScore(publicAppealRaw)
      : overallHint !== undefined
        ? clampNamingScore(overallHint)
        : 50;
  const scalabilityScore =
    scalabilityRaw !== undefined
      ? clampNamingScore(scalabilityRaw)
      : overallHint !== undefined
        ? clampNamingScore(overallHint)
        : 50;

  const proposalDetailLogic = {
    hierarchy: firstNonEmptyString(
      r.hierarchyDetail,
      r.detailHierarchy,
      r.detail_hierarchy,
      r.detailLogicHierarchy,
      nested.hierarchy,
      nested.detailHierarchy
    ),
    originality: firstNonEmptyString(
      r.uniquenessDetail,
      r.detailOriginality,
      r.detail_originality,
      r.detailLogicOriginality,
      nested.originality,
      nested.detailOriginality
    ),
    pronunciationLanguage: firstNonEmptyString(
      r.pronunciationDetail,
      r.detailPronunciationLanguage,
      r.detail_pronunciation_language,
      r.detailLogicPronunciation,
      nested.pronunciationLanguage,
      nested.detailPronunciationLanguage
    ),
    legality: firstNonEmptyString(
      r.legalDetail,
      r.detailLegality,
      r.detail_legality,
      r.detailLogicLegality,
      nested.legality,
      nested.detailLegality
    ),
    publicAppeal: firstNonEmptyString(
      r.publicAppealDetail,
      r.detailPublicAppeal,
      r.detailLogicPublicAppeal,
      nested.publicAppeal,
      nested.detailPublicAppeal
    ),
    scalability: firstNonEmptyString(
      r.scalabilityDetail,
      r.detailScalability,
      r.detailLogicScalability,
      nested.scalability,
      nested.detailScalability
    ),
  };

  return {
    name: String(r.name ?? "").trim(),
    rationale: firstNonEmptyString(r.rationale, r.description),
    hierarchyScore,
    originalityDimensionScore,
    pronunciationScore,
    legalityScore,
    publicAppealScore,
    scalabilityScore,
    proposalDetailLogic,
  };
}

/** 단계별 생성: N개 네이밍을 하나의 패키지로 본 6대 평가(통합) */
export type TierPackageEvaluation = {
  hierarchyScore: number;
  legalityScore: number;
  originalityDimensionScore: number;
  pronunciationScore: number;
  publicAppealScore: number;
  scalabilityScore: number;
  proposalDetailLogic: BrandNamingProposal["proposalDetailLogic"];
};

export type TierStepRow = {
  tierLabel: string;
  name: string;
  rationale: string;
};

/** 단계별 생성: 대안 1개 = N단계 전체 + 세계관 + 패키지 6축 평가 */
export type TierNamingAlternative = {
  storyline: string;
  tierSteps: TierStepRow[];
  tierPackageEvaluation: TierPackageEvaluation;
};

export type BrandNamingRunResult = {
  ok: boolean;
  mode: BrandNamingMode;
  guidelineId: string | null;
  /** 서버에 GEMINI_API_KEY가 있으면 true — 추가 제안 네이밍은 이게 true일 때만 Gemini 출력 */
  namingGeminiConfigured?: boolean;
  overallScore: number;
  hierarchyScore: number;
  /** 검수: 창의성(종합 30%) */
  originalityDimensionScore?: number;
  /** 검수: 직관성 단일 점수(0~100), pronunciationLanguageScore와 동일 */
  pronunciationScore?: number;
  /** 검수: 직관성(종합 20%) */
  pronunciationLanguageScore?: number;
  /** 검수: 적법성(Pass/Fail·종합 미포함) */
  legalityScore?: number;
  /** 검수·생성: 대중성(종합 30%) */
  publicAppealScore?: number;
  /** 검수·생성: 확장성(종합 20%) */
  scalabilityScore?: number;
  trademarkScore: number;
  copyrightScore: number;
  /** 검수: 항목별 상세 논리(상세 보기·확대) */
  detailLogic?: {
    hierarchy: string;
    originality: string;
    pronunciationLanguage: string;
    legality: string;
    /** 구버전 응답에는 없을 수 있음 */
    publicAppeal?: string;
    scalability?: string;
  };
  hierarchy: {
    status: "aligned" | "misaligned" | "warning";
    message: string;
    details: string;
    checklist: string[];
  };
  trademark: {
    risk: "low" | "medium" | "high";
    conflicts: Array<{ name: string; class: string; similarity: number }>;
    recommendation: string;
  };
  copyright: {
    originality: number;
    risks: Array<{ type: string; severity: "low" | "medium" | "high"; description: string }>;
    verdict: string;
  };
  finalSummary: string;
  goRecommendation: "go" | "no-go";
  /** 검수: 입력 외 AI 추가 제안 네이밍 */
  additionalNamingSuggestions?: string[];
  /** 하위 호환: 생성 후보 이름만 */
  suggestedNames: string[];
  /** 생성 모드: 일반 4건 또는 단계별 1~6건(서버 보장). 검수 모드는 빈 배열 */
  namingProposals?: BrandNamingProposal[];
  /** 생성 모드만: 일반 vs 단계별(요금제 티어) 메타 */
  generateMeta?: {
    style: "general" | "tiered";
    tierStepCount?: number;
    tierLabels?: string[];
  };
  /** 레거시: 단일 패키지 통합 평가(구 응답). 신규 단계별는 tierNamingAlternatives 사용 */
  tierPackageEvaluation?: TierPackageEvaluation;
  /** 단계별 생성: 대안 4개 × (스토리라인 + N단계 + 패키지 평가) */
  tierNamingAlternatives?: TierNamingAlternative[];
};

/** 고정 PDF 슬롯 + 참고 입력·업로드를 반영해 네이밍 생성 또는 검수 */
export async function runBrandNaming(opts: {
  mode: BrandNamingMode;
  /** 생성 모드에서 사용. 검수 모드에서는 서버가 auditName·namingIntent로 조합할 수 있음 */
  requestText: string;
  /** 검수 모드: 위쪽 입력(검수명) */
  auditName?: string;
  /** 검수 모드: 아래쪽 입력(작명의도) */
  namingIntent?: string;
  /** 대·소카테고리 브랜드 계층 컨텍스트 — 검수·생성 공통, Gemini 요청에 포함 */
  auditCategory?: string;
  referenceText: string;
  supplementaryReference?: File | null;
  useGuidelineLibrary?: boolean;
  /** useGuidelineLibrary가 true일 때 필수 — `FIXED_GUIDELINE_SOURCES` 키 */
  guidelineId?: string;
  /** 생성 모드: 일반(4안) vs 단계별(1~6단계, 요금제 라인업) */
  generateStyle?: "general" | "tiered";
  /** 단계별 생성 시 단계 수 1~6 */
  tierStepCount?: number;
  /** 단계별 라벨(길이는 tierStepCount와 동일 권장) */
  tierLabels?: string[];
}): Promise<BrandNamingRunResult> {
  const fd = new FormData();
  fd.append("mode", opts.mode);
  if (opts.mode === "audit") {
    fd.append("auditName", (opts.auditName ?? "").trim());
    fd.append("namingIntent", (opts.namingIntent ?? "").trim());
    fd.append("requestText", opts.requestText.trim());
  } else {
    fd.append("requestText", opts.requestText.trim());
    const gs = opts.generateStyle === "tiered" ? "tiered" : "general";
    fd.append("generateStyle", gs);
    if (gs === "tiered") {
      const n = Math.min(6, Math.max(1, Number(opts.tierStepCount) || 3));
      fd.append("tierStepCount", String(n));
      const labels = Array.isArray(opts.tierLabels) ? opts.tierLabels.slice(0, n) : [];
      while (labels.length < n) {
        labels.push(`단계 ${labels.length + 1}`);
      }
      fd.append("tierLabelsJson", JSON.stringify(labels));
    }
  }
  const auditCategory = (opts.auditCategory ?? "").trim();
  if (auditCategory) {
    fd.append("auditCategory", auditCategory);
  }
  fd.append("referenceText", opts.referenceText.trim());
  fd.append("useGuidelineLibrary", opts.useGuidelineLibrary === false ? "false" : "true");
  if (opts.guidelineId?.trim()) {
    fd.append("guidelineId", opts.guidelineId.trim());
  }
  if (opts.supplementaryReference) {
    fd.append("supplementaryReference", opts.supplementaryReference);
  }
  const r = await fetch(apiUrl("/api/naming/run"), {
    method: "POST",
    body: fd
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const serverMsg = (err as { error?: string }).error;
    if (r.status === 404) {
      throw new Error(
        serverMsg ??
          "네이밍 API를 찾을 수 없습니다. 프로젝트 루트에서 백엔드를 실행했는지 확인하세요 (예: npm run server, 기본 포트 3001). 개발 시에는 Vite와 함께 /api 프록시가 동작해야 합니다."
      );
    }
    throw new Error(serverMsg ?? `naming ${r.status}`);
  }
  return (await r.json()) as BrandNamingRunResult;
}

export async function fetchHealth(): Promise<{ ok: boolean; gemini: boolean; law?: boolean }> {
  const r = await fetch(apiUrl("/api/health"));
  if (!r.ok) throw new Error("health");
  return (await r.json()) as { ok: boolean; gemini: boolean; law?: boolean };
}

/** 서버에 저장된 가이드 파일로 AI 요약 재생성 (GEMINI_API_KEY 필요) */
export async function analyzeGuideline(id: string): Promise<{ aiSummary: string; aiAnalyzedAt: string }> {
  const r = await fetch(apiUrl(`/api/guidelines/${encodeURIComponent(id)}/analyze`), {
    method: "POST"
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `analyze ${r.status}`);
  }
  return (await r.json()) as { aiSummary: string; aiAnalyzedAt: string };
}
