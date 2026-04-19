import "./load-env.js";
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { existsSync, readFileSync } from "node:fs";

import type { GuidelineRecord } from "./store.js";
import { loadMeta, resolveStoredPath } from "./store.js";
import {
  buildAuditCategoryGeminiPromptSection,
  buildTierStorylineToneBlock
} from "./namingCategoryGeminiDirectives.js";
import {
  buildAdditionalNamingSuggestionBlockFromAuditRaw,
  buildNamingGenerationRuleBlockFromAuditRaw
} from "../shared/categoryNamingRules.js";

/** pdf-parse → pdfjs-dist 로딩이 무겁고 Vercel Serverless cold start에서 실패할 수 있어, PDF 처리 시에만 동적 import */
type PDFParseInstance = {
  getText: () => Promise<{ text: string }>;
  destroy: () => Promise<void>;
};
type PDFParseCtor = new (opts: { data: Buffer }) => PDFParseInstance;

let pdfParseCtorPromise: Promise<PDFParseCtor> | null = null;
async function getPDFParseCtor(): Promise<PDFParseCtor> {
  if (!pdfParseCtorPromise) {
    pdfParseCtorPromise = import("pdf-parse").then((m) => m.PDFParse as PDFParseCtor);
  }
  return pdfParseCtorPromise;
}

async function parsePdfBufferToText(buf: Buffer): Promise<string> {
  const PDFParse = await getPDFParseCtor();
  const parser = new PDFParse({ data: buf });
  try {
    const r = await parser.getText();
    return r.text ?? "";
  } finally {
    await parser.destroy();
  }
}

/**
 * 텍스트/멀티모달 분석용 모델 후보 (앞에서부터 시도).
 * - 기본: gemini-3.1-pro-preview (고성능). 404·쿼터 시 아래 순으로 폴백.
 * - gemini-2.0-flash 등 구형 ID는 신규 키에서 404가 나는 경우가 많아 기본 후보에서 제외.
 */
function textModelCandidates(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-pro-preview";
  const pool = [
    primary,
    "gemini-3.1-pro-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
  ].filter((x): x is string => Boolean(x));
  return [...new Set(pool)];
}

/** 이미지 생성·편집 REST 호출 시 모델 후보 (앞에서부터 시도). GEMINI_IMAGE_MODEL이 있으면 최우선. */
const GEMINI_IMAGE_MODEL_FALLBACKS = [
  "gemini-3.1-flash-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation",
] as const;

/** 429 / 쿼터 또는 모델 미제공(404) — 다음 후보 모델로 재시도 */
function shouldTryNextTextModel(e: unknown): boolean {
  if (isInvalidOrExpiredApiKeyError(e)) return false;
  if (e && typeof e === "object" && "status" in e) {
    const s = (e as { status?: number }).status;
    if (s === 429 || s === 503 || s === 404) return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /429|Too Many Requests|quota|RESOURCE_EXHAUSTED|overloaded|rate limit/i.test(msg) ||
    /404|NOT_FOUND|no longer available|not found for API version|is not supported/i.test(msg)
  );
}

/** 400 + API_KEY_INVALID / 만료 — 모델을 바꿔도 동일 키로는 해결 안 됨 */
function isInvalidOrExpiredApiKeyError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (/API[_ ]KEY[_ ]INVALID|API key expired|renew the API key|invalid API key/i.test(msg)) return true;
  if (e && typeof e === "object" && "status" in e) {
    const s = (e as { status?: number }).status;
    if (s === 400 && /API key|API_KEY_INVALID|expired/i.test(msg)) return true;
  }
  return false;
}

function rethrowIfInvalidApiKey(e: unknown): void {
  if (isInvalidOrExpiredApiKeyError(e)) {
    throw new Error(
      "[Gemini API 키] 만료되었거나 잘못되었습니다. https://aistudio.google.com/apikey 에서 새 키를 발급하고, 프로젝트 루트 .env의 GEMINI_API_KEY를 교체한 뒤 서버를 재시작하세요."
    );
  }
}

function getKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim();
}

/** 브랜드 네이밍 등 Gemini 연동 가능 여부(루트 .env의 GEMINI_API_KEY) */
export function hasGeminiApiKey(): boolean {
  return Boolean(getKey());
}

/** 검수 API 키 없을 때도 PDF에서 규칙 맥락을 주기 위한 발췌 */
export async function excerptGuidelineForInspection(g: GuidelineRecord): Promise<string> {
  const abs = resolveStoredPath(g.storedRelativePath);
  if (!existsSync(abs)) {
    return "가이드 파일을 찾을 수 없습니다.";
  }
  if (g.mimeType === "application/pdf") {
    const buf = readFileSync(abs);
    const t = (await parsePdfBufferToText(buf)).trim();
    if (!t) return "PDF에서 텍스트를 추출하지 못했습니다.";
    return `[브랜드 가이드라인 PDF 발췌 — AI 요약 없음, 아래 원문을 기준으로 판단하세요]\n${t.slice(0, 55_000)}`;
  }
  if (g.mimeType.startsWith("text/")) {
    return readFileSync(abs, "utf8").slice(0, 55_000);
  }
  if (g.mimeType === "image/png" || g.mimeType === "image/jpeg") {
    return "가이드가 이미지로만 등록되어 있습니다. GEMINI_API_KEY로 가이드 분석(analyze)을 실행해 요약을 만든 뒤 검수 정확도가 올라갑니다.";
  }
  return "지원하지 않는 가이드 형식입니다.";
}

const inspectionResponseSchema = {
  type: SchemaType.OBJECT,
  description: "브랜드 가이드 준수 검수 결과",
  properties: {
    score: {
      type: SchemaType.NUMBER,
      description: "0~100. 가이드라인 준수 및 브랜드 일관성 종합 점수"
    },
    overallSummary: {
      type: SchemaType.STRING,
      description: "검수 대상에 대한 한국어 종합 평가 2~4문장"
    },
    violations: {
      type: SchemaType.ARRAY,
      description: "위반·개선이 필요한 항목. 문제 없으면 빈 배열",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          category: {
            type: SchemaType.STRING,
            description: "예: 로고, 컬러, 타이포그래피, 여백/그리드, 이미지/톤, 기타"
          },
          issue: { type: SchemaType.STRING, description: "구체적 설명 (한국어)" },
          severity: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["high", "medium", "low"] as string[],
            description: "심각도"
          }
        },
        required: ["category", "issue", "severity"]
      }
    }
  },
  required: ["score", "overallSummary", "violations"]
} as Schema;

/** 브랜드 제작(디자인 에디터) 캔버스 — 위반 항목별 수정 힌트 포함 */
const designEditorInspectionSchema = {
  type: SchemaType.OBJECT,
  description: "VI 가이드 대비 디자인 에디터 캔버스 검수",
  properties: {
    score: {
      type: SchemaType.NUMBER,
      description: "0~100"
    },
    overallSummary: {
      type: SchemaType.STRING,
      description: "한국어 종합 평가 2~4문장"
    },
    violations: {
      type: SchemaType.ARRAY,
      description: "개선 항목. 각 항목은 수정 유형(fixKind)과 제안 필드를 포함",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          category: { type: SchemaType.STRING },
          issue: { type: SchemaType.STRING },
          severity: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["high", "medium", "low"] as string[]
          },
          fixKind: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["text", "image", "layout"] as string[],
            description: "text=문안·타이포, image=이미지 교체, layout=배치/그리드"
          },
          proposedTitle: { type: SchemaType.STRING, description: "U+ Simple 톤 문안. 미변경이면 빈 문자열" },
          proposedSubtitle: { type: SchemaType.STRING },
          proposedBodyText: { type: SchemaType.STRING },
          proposedEmphasizedTitle: { type: SchemaType.STRING },
          proposedDate: { type: SchemaType.STRING },
          proposedVenue: { type: SchemaType.STRING },
          imageReplacementBrief: {
            type: SchemaType.STRING,
            description: "fixKind=image일 때 대체 이미지 생성 지시(한국어)"
          },
          targetAssetLayerId: { type: SchemaType.STRING, description: "에셋 레이어 id, 없으면 빈 문자열" },
          layoutReset: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["none", "poster_defaults", "clear_text_overrides"] as string[]
          }
        },
        required: ["category", "issue", "severity", "fixKind"]
      }
    }
  },
  required: ["score", "overallSummary", "violations"]
} as Schema;

export type DesignEditorViolationRow = {
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

function normalizeDesignEditorViolation(raw: Record<string, unknown>): DesignEditorViolationRow {
  const fk = String(raw.fixKind ?? "text");
  const fixKind: DesignEditorViolationRow["fixKind"] =
    fk === "image" || fk === "layout" ? fk : "text";
  const lr = String(raw.layoutReset ?? "none");
  const layoutReset: DesignEditorViolationRow["layoutReset"] =
    lr === "poster_defaults" || lr === "clear_text_overrides" ? lr : "none";
  const empty = (s: unknown) => (typeof s === "string" && s.trim() !== "" ? s.trim() : undefined);
  return {
    category: String(raw.category ?? ""),
    issue: String(raw.issue ?? ""),
    severity: String(raw.severity ?? "medium"),
    fixKind,
    proposedTitle: empty(raw.proposedTitle),
    proposedSubtitle: empty(raw.proposedSubtitle),
    proposedBodyText: empty(raw.proposedBodyText),
    proposedEmphasizedTitle: empty(raw.proposedEmphasizedTitle),
    proposedDate: empty(raw.proposedDate),
    proposedVenue: empty(raw.proposedVenue),
    imageReplacementBrief: empty(raw.imageReplacementBrief),
    targetAssetLayerId: empty(raw.targetAssetLayerId),
    layoutReset
  };
}

function parseDesignEditorInspectionPayload(raw: string): {
  score: number;
  overallSummary: string;
  violations: DesignEditorViolationRow[];
} | null {
  try {
    const parsed = JSON.parse(raw) as {
      score: number;
      overallSummary?: string;
      violations?: Array<Record<string, unknown>>;
    };
    const violations = Array.isArray(parsed.violations)
      ? parsed.violations.map((v) => normalizeDesignEditorViolation(v))
      : [];
    return {
      score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
      overallSummary: typeof parsed.overallSummary === "string" ? parsed.overallSummary : "",
      violations
    };
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        score: number;
        overallSummary?: string;
        violations?: Array<Record<string, unknown>>;
      };
      const violations = Array.isArray(parsed.violations)
        ? parsed.violations.map((v) => normalizeDesignEditorViolation(v))
        : [];
      return {
        score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
        overallSummary: typeof parsed.overallSummary === "string" ? parsed.overallSummary : "",
        violations
      };
    } catch {
      return null;
    }
  }
}

/**
 * 디자인 에디터 캔버스 PNG + JSON 상태를 VI 가이드와 대조해 항목별 수정 힌트를 반환합니다.
 */
export async function runDesignEditorCanvasInspection(opts: {
  designBase64: string;
  designMime: string;
  guidelineSummary: string;
  designContentJson: string;
  templateLabel: string;
  /** 제작물 주제·목적 (창작자 입력) */
  creativeTopic?: string;
}): Promise<{
  score: number;
  overallSummary: string;
  violations: DesignEditorViolationRow[];
}> {
  const key = getKey();
  if (!key) {
    return {
      score: 65,
      overallSummary:
        "GEMINI_API_KEY가 없어 실제 AI 검수를 수행하지 못했습니다. .env에 키를 설정한 뒤 서버를 재시작하세요.",
      violations: [
        {
          category: "설정",
          issue: "API 키가 없어 모의 결과만 표시됩니다.",
          severity: "low",
          fixKind: "text",
          proposedTitle: undefined
        }
      ]
    };
  }

  if (!opts.designMime.startsWith("image/")) {
    return {
      score: 0,
      overallSummary: "검수 대상은 이미지(PNG/JPEG)만 지원합니다.",
      violations: []
    };
  }

  const genAI = new GoogleGenerativeAI(key);
  const guideBlock = opts.guidelineSummary.slice(0, 72_000);
  const contentBlock = opts.designContentJson.slice(0, 24_000);

  const basePrompt = `역할: LG U+ VI·브랜드 가이드라인을 준수하는 시니어 디자인 QA입니다.

작업:
1) 첨부 이미지는 브랜드 제작 에디터의 캔버스 화면 캡처입니다.
2) 아래 [캔버스 텍스트/설정 JSON]과 이미지가 일치한다고 가정하고, VI(로고·컬러·타이포·여백·톤)를 평가하세요.
3) 텍스트 수정이 필요하면 U+ Simple 톤(간결·고객 친화·불필요한 수식어 배제)으로 proposed* 필드에 한국어 문안을 제안하세요. 변경이 필요 없으면 해당 필드는 빈 문자열("")입니다.
4) 이미지/일러스트가 부적절하면 fixKind=image, imageReplacementBrief에 교체 방향을 구체적으로 적으세요.
5) 배치·그리드·여백 문제는 fixKind=layout, layoutReset을 poster_defaults(포스터형 템플릿) 또는 clear_text_overrides(사용자 임의 폰트크기 초기화) 등으로 제안하세요.
6) violations는 실제 개선점만 나열하고, fixKind를 반드시 채우세요.

템플릿: ${opts.templateLabel}
${opts.creativeTopic?.trim() ? `\n[제작 주제·의도]\n${opts.creativeTopic.trim()}\n` : ""}
[참조 가이드라인]
${guideBlock}

[캔버스 텍스트/설정 JSON]
${contentBlock}`;

  const jsonOnlySuffix = `
출력: JSON 한 개만. 키: score, overallSummary, violations (항목별 fixKind·제안 필드 포함).`;

  let lastErr: unknown;
  for (const modelId of textModelCandidates()) {
    const modelStructured = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: designEditorInspectionSchema
      }
    });
    const modelPlain = genAI.getGenerativeModel({ model: modelId });

    async function runOnce(useStructured: boolean) {
      const model = useStructured ? modelStructured : modelPlain;
      const prompt = `${basePrompt}${useStructured ? "" : jsonOnlySuffix}`;
      return model.generateContent([
        prompt,
        { inlineData: { mimeType: opts.designMime, data: opts.designBase64 } }
      ]);
    }

    try {
      let raw: string;
      try {
        const result = await runOnce(true);
        raw = result.response.text();
      } catch {
        const result = await runOnce(false);
        raw = result.response.text();
      }

      let parsed = parseDesignEditorInspectionPayload(raw);
      if (!parsed) {
        try {
          const result = await runOnce(false);
          raw = result.response.text();
          parsed = parseDesignEditorInspectionPayload(raw);
        } catch {
          parsed = null;
        }
      }
      if (parsed) return parsed;
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(
          `[gemini] design-editor inspection model=${modelId} → 다음 모델 시도`,
          e instanceof Error ? e.message : e
        );
        continue;
      }
      throw e;
    }
  }

  const msg =
    lastErr instanceof Error
      ? lastErr.message
      : "모든 후보 모델에서 호출에 실패했습니다.";
  return {
    score: 55,
    overallSummary: `Gemini 호출 실패: ${msg.slice(0, 400)}`,
    violations: [
      {
        category: "API",
        issue: msg.slice(0, 500),
        severity: "medium",
        fixKind: "text"
      }
    ]
  };
}

/** 디자인 에디터: 단일 이미지 교체용 (브리프 기반 수정본 생성) */
export async function generateDesignEditorReplacementImage(opts: {
  designBase64: string;
  designMime: string;
  guidelineContext: string;
  imageBrief: string;
  creativeTopic?: string;
}): Promise<{ mimeType: string; base64: string; caption: string } | null> {
  const topicBlock = opts.creativeTopic?.trim()
    ? `\n[제작 주제]\n${opts.creativeTopic.trim()}\n`
    : "";
  const r = await generateRevisedBrandingImage({
    designBase64: opts.designBase64,
    designMime: opts.designMime,
    guidelineContext: opts.guidelineContext,
    overallSummary: "디자인 에디터에서 선택한 이미지 요소를 VI에 맞게 교체합니다.",
    violations: [
      {
        category: "이미지",
        issue: opts.imageBrief,
        severity: "medium"
      }
    ],
    userNotes: `${topicBlock}[이미지 교체 우선]\n${opts.imageBrief}`
  });
  if (!r) return null;
  return { mimeType: r.mimeType, base64: r.base64, caption: r.caption };
}

const textSuggestionSchema = {
  type: SchemaType.OBJECT,
  description: "U+ Simple 톤의 문안 제안 (요청된 슬롯만 채우고 나머지는 빈 문자열)",
  properties: {
    mainTitle: { type: SchemaType.STRING, description: "메인 타이틀" },
    subtitleLine: { type: SchemaType.STRING, description: "부제 1 (메인·본문 사이 첫 부제 블록)" },
    subtitleLine2: { type: SchemaType.STRING, description: "부제 2" },
    subtitleLine3: { type: SchemaType.STRING, description: "부제 3" },
    bodyText: { type: SchemaType.STRING, description: "본문 1" },
    bodyText2: { type: SchemaType.STRING, description: "본문 2" },
    bodyText3: { type: SchemaType.STRING, description: "본문 3" },
    emphasizedTitle: { type: SchemaType.STRING, description: "하단 유의사항·법적 고지" }
  },
  required: [
    "mainTitle",
    "subtitleLine",
    "subtitleLine2",
    "subtitleLine3",
    "bodyText",
    "bodyText2",
    "bodyText3",
    "emphasizedTitle"
  ]
} as Schema;

/**
 * 디자인 에디터: 전체 문맥·VI 가이드를 반영한 문구 제안 (메인/본문/유의 중 선택)
 */
export type DesignEditorTextSuggestionTarget =
  | "mainTitle"
  | "subtitle"
  | "subtitle2"
  | "subtitle3"
  | "body"
  | "body2"
  | "body3"
  | "footer";

export async function runDesignEditorTextSuggestion(opts: {
  guidelineSummary: string;
  contentJson: string;
  targets: DesignEditorTextSuggestionTarget[];
  templateLabel: string;
  creativeTopic?: string;
}): Promise<{
  mainTitle: string;
  subtitleLine: string;
  subtitleLine2: string;
  subtitleLine3: string;
  bodyText: string;
  bodyText2: string;
  bodyText3: string;
  emphasizedTitle: string;
}> {
  const key = getKey();
  const empty = {
    mainTitle: "",
    subtitleLine: "",
    subtitleLine2: "",
    subtitleLine3: "",
    bodyText: "",
    bodyText2: "",
    bodyText3: "",
    emphasizedTitle: ""
  };
  if (!key) {
    return empty;
  }

  const targetStr = opts.targets.join(", ");
  const genAI = new GoogleGenerativeAI(key);
  const guide = opts.guidelineSummary.slice(0, 72_000);
  const ctx = opts.contentJson.slice(0, 28_000);

  const slotHelp = `
슬롯 매핑 (요청된 것만 작성, 미요청은 ""):
- mainTitle → 메인 타이틀
- subtitleLine → 부제 1 (메인과 본문 사이 첫 부제)
- subtitleLine2, subtitleLine3 → 부제 2·3
- bodyText → 본문 1
- bodyText2, bodyText3 → 본문 2·3
- emphasizedTitle → 하단 유의사항
요청된 슬롯: ${targetStr}
[제작 주제]에 「부제2만」「본문2만」「부제1·본문1만」「전체」처럼 원하는 슬롯만 지정할 수 있습니다. 지정이 없으면 요청된 슬롯 전부에 맞춥니다.`;

  const prompt = `역할: LG U+ 브랜드 카피라이터. U+ Simple 톤(간결·명료·고객 중심·불필요한 수식어 배제)을 따릅니다.

작업:
1) 아래 [캔버스 JSON]의 목적·톤·메시지 방향을 파악하세요.
2) [참조 VI 가이드라인]의 표현·금지·톤 가이드를 반영하세요.
3) 요청된 슬롯만 채우고, 요청되지 않은 필드는 반드시 빈 문자열 "" 입니다.
${slotHelp}
4) JSON만 출력합니다.

템플릿: ${opts.templateLabel}
${opts.creativeTopic?.trim() ? `\n[제작 주제·의도]\n${opts.creativeTopic.trim()}\n` : ""}
[참조 VI 가이드라인]
${guide}

[캔버스 JSON]
${ctx}`;

  let lastErr: unknown;
  for (const modelId of textModelCandidates()) {
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: textSuggestionSchema
      }
    });
    try {
      const raw = (await model.generateContent(prompt)).response.text();
      const parsed = JSON.parse(raw) as {
        mainTitle?: string;
        subtitleLine?: string;
        subtitleLine2?: string;
        subtitleLine3?: string;
        bodyText?: string;
        bodyText2?: string;
        bodyText3?: string;
        emphasizedTitle?: string;
      };
      const s = (x: unknown) => (typeof x === "string" ? x : "");
      return {
        mainTitle: s(parsed.mainTitle),
        subtitleLine: s(parsed.subtitleLine),
        subtitleLine2: s(parsed.subtitleLine2),
        subtitleLine3: s(parsed.subtitleLine3),
        bodyText: s(parsed.bodyText),
        bodyText2: s(parsed.bodyText2),
        bodyText3: s(parsed.bodyText3),
        emphasizedTitle: s(parsed.emphasizedTitle)
      };
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) continue;
      throw e;
    }
  }
  console.warn("[gemini] text suggestion failed", lastErr);
  return empty;
}

/**
 * 캔버스 전체 시각 교정 (이미지 생성). 검수 위반 목록이 있으면 반영, 없으면 VI 전반 교정.
 */
export async function runDesignEditorCanvasVisualCorrection(opts: {
  designBase64: string;
  designMime: string;
  guidelineContext: string;
  overallSummary?: string;
  violations?: Array<{ category: string; issue: string; severity: string }>;
  mode: "inspection_followup" | "holistic";
  creativeTopic?: string;
}): Promise<{ mimeType: string; base64: string; caption: string } | null> {
  const viols =
    opts.violations && opts.violations.length > 0
      ? opts.violations
      : [
          {
            category: "전체 교정",
            issue:
              "VI 가이드에 맞게 뱃지·메인 타이틀·본문·하단 유의사항·첨부 이미지·픽토그램·일러스트의 배치·크기·여백·대비·타이포를 일관되게 정리합니다.",
            severity: "high"
          }
        ];

  const topicBlock = opts.creativeTopic?.trim()
    ? `[제작 주제]\n${opts.creativeTopic.trim()}\n\n`
    : "";
  const notes =
    opts.mode === "holistic"
      ? `${topicBlock}[디자인 교정 모드 — 전체]\n캔버스 전체를 브랜드 VI에 맞게 시각적으로 다듬은 단일 이미지를 생성하세요. 텍스트는 가독성 있게 유지·보완합니다.`
      : `${topicBlock}[디자인 교정 모드 — 검수 반영]\n아래 검수 지적을 우선 반영하여 수정 이미지를 생성하세요.`;

  return generateRevisedBrandingImage({
    designBase64: opts.designBase64,
    designMime: opts.designMime,
    guidelineContext: opts.guidelineContext,
    overallSummary: opts.overallSummary ?? "디자인 에디터 교정 요청",
    violations: viols,
    userNotes: notes
  });
}

function parseInspectionPayload(raw: string): {
  score: number;
  overallSummary: string;
  violations: Array<{ category: string; issue: string; severity: string }>;
} | null {
  try {
    const parsed = JSON.parse(raw) as {
      score: number;
      overallSummary?: string;
      violations: Array<{ category: string; issue: string; severity: string }>;
    };
    return {
      score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
      overallSummary: typeof parsed.overallSummary === "string" ? parsed.overallSummary : "",
      violations: Array.isArray(parsed.violations) ? parsed.violations : []
    };
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        score: number;
        overallSummary?: string;
        violations: Array<{ category: string; issue: string; severity: string }>;
      };
      return {
        score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
        overallSummary: typeof parsed.overallSummary === "string" ? parsed.overallSummary : "",
        violations: Array.isArray(parsed.violations) ? parsed.violations : []
      };
    } catch {
      return null;
    }
  }
}

export async function summarizeGuidelineFile(
  filePath: string,
  mimeType: string
): Promise<{ summary: string; excerpt: string }> {
  const key = getKey();
  let text = "";

  if (mimeType === "application/pdf") {
    const buf = readFileSync(filePath);
    text = (await parsePdfBufferToText(buf)).slice(0, 120_000);
  } else if (mimeType.startsWith("text/")) {
    text = readFileSync(filePath, "utf8").slice(0, 120_000);
  } else if (mimeType === "image/png" || mimeType === "image/jpeg") {
    const buf = readFileSync(filePath);
    const b64 = buf.toString("base64");
    return summarizeImageWithGemini(b64, mimeType);
  }

  if (!key) {
    const excerpt = text.slice(0, 2000);
    return {
      summary:
        "[GEMINI_API_KEY 없음] 가이드 텍스트 일부만 저장되었습니다. .env에 GEMINI_API_KEY를 설정하면 AI 요약이 생성됩니다.",
      excerpt
    };
  }

  if (!text.trim()) {
    return {
      summary: "이 파일 형식에서는 텍스트를 추출하지 못했습니다. PDF 또는 텍스트 형식을 권장합니다.",
      excerpt: ""
    };
  }

  const genAI = new GoogleGenerativeAI(key);
  const prompt = `다음은 브랜드/ VI 가이드라인 문서에서 추출한 텍스트입니다.
디자인 검수에 쓸 수 있도록 핵심 규칙(로고, 색상, 타이포, 여백, 금지 사항 등)을 한국어로 구조화해 요약하세요.
불릿과 짧은 문장으로, 800자 이내로 작성하세요.

--- 문서 본문 ---
${text.slice(0, 60_000)}
`;

  let lastErr: unknown;
  for (const mid of textModelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({ model: mid });
      const result = await model.generateContent(prompt);
      const summary = result.response.text();
      return { summary, excerpt: text.slice(0, 2000) };
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(`[gemini] summarize guideline model=${mid} → 다음 모델 시도`, e instanceof Error ? e.message : e);
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function summarizeImageWithGemini(
  base64: string,
  mimeType: string
): Promise<{ summary: string; excerpt: string }> {
  const key = getKey();
  if (!key) {
    return {
      summary:
        "[GEMINI_API_KEY 없음] 이미지 가이드는 API 키 설정 후 분석됩니다.",
      excerpt: ""
    };
  }
  const genAI = new GoogleGenerativeAI(key);
  const prompt =
    "이 이미지는 브랜드 가이드라인 문서의 일부입니다. 디자인 검수에 필요한 핵심 규칙을 한국어로 요약하세요 (800자 이내).";
  let lastErr: unknown;
  for (const mid of textModelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({ model: mid });
      const result = await model.generateContent([
        prompt,
        { inlineData: { mimeType, data: base64 } }
      ]);
      const summary = result.response.text();
      return { summary, excerpt: "" };
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(`[gemini] summarize image model=${mid} → 다음 모델 시도`, e instanceof Error ? e.message : e);
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function runInspectionWithGemini(opts: {
  designBase64: string;
  designMime: string;
  guidelineSummary: string;
}): Promise<{
  score: number;
  overallSummary: string;
  violations: Array<{ category: string; issue: string; severity: string }>;
}> {
  const key = getKey();
  if (!key) {
    return {
      score: 67,
      overallSummary:
        "GEMINI_API_KEY가 설정되어 있지 않아 실제 AI 추론을 수행하지 못했습니다. 루트 .env에 키를 넣고 서버를 재시작하세요.",
      violations: [
        { category: "설정", issue: "GEMINI_API_KEY가 없어 모의 검수 결과를 표시합니다.", severity: "low" }
      ]
    };
  }

  const genAI = new GoogleGenerativeAI(key);

  const guideBlock = opts.guidelineSummary.slice(0, 80_000);
  const basePrompt = `역할: 당신은 LG U+ 등 기업의 브랜드·VI 가이드라인을 숙지한 시니어 디자인 QA입니다.

작업:
1) 아래 [참조 가이드라인]의 규칙(로고, 컬러, 타이포, 여백, 금지 사항 등)을 기준으로 검수하세요.
2) 검수 대상은 사용자가 업로드한 파일입니다. 이미지/PNG/JPEG인 경우 픽셀 단위로 보이는 요소를 근거로 판단하세요. PDF인 경우 추출된 텍스트를 바탕으로 판단하되, 시각적 규칙은 텍스트에 없으면 보수적으로 평가하세요.
3) 가이드에 명시되지 않은 항목은 "가이드 미기재"로 단정하지 말고, 일반적인 브랜드 디자인 원칙으로만 보완적으로 언급하세요.
4) 점수(score)는 가이드 준수도·브랜드 일관성·실수 가능성을 종합한 0~100 정수입니다.
5) violations는 실제로 의심되거나 개선이 필요한 항목만 넣고, 근거를 한국어로 구체적으로 쓰세요. 문제가 없으면 빈 배열입니다.
6) overallSummary에는 종합 평가를 한국어 2~4문장으로 작성하세요.
7) [참조 가이드라인] 안에 "사용자 직접 입력 검수 사항" 블록이 있으면 그 내용을 **반드시** 반영해 평가하고, 위반 항목에도 필요하면 언급하세요.

[참조 가이드라인]
${guideBlock}`;

  const jsonOnlySuffix = `
출력: JSON 한 개만 (다른 문장 없이). 키: score, overallSummary, violations.`;

  let lastErr: unknown;
  for (const modelId of textModelCandidates()) {
    const modelStructured = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: inspectionResponseSchema
      }
    });
    const modelPlain = genAI.getGenerativeModel({ model: modelId });

    async function runOnce(useStructured: boolean) {
      const model = useStructured ? modelStructured : modelPlain;
      if (opts.designMime === "application/pdf") {
        const buf = Buffer.from(opts.designBase64, "base64");
        const designExcerpt = (await parsePdfBufferToText(buf)).slice(0, 16_000);
        const prompt = `${basePrompt}

[검수 대상 PDF에서 추출한 텍스트]
${designExcerpt || "(텍스트 추출 없음 — 가능한 경우 시각적 규칙은 가이드와 대조)"}${useStructured ? "" : jsonOnlySuffix}`;
        return model.generateContent(prompt);
      }
      const prompt = `${basePrompt}

[검수 대상]
첨부 이미지를 브랜드 디자인 시안/산출물로 간주하고 위 기준으로 평가하세요.${useStructured ? "" : jsonOnlySuffix}`;
      return model.generateContent([
        prompt,
        { inlineData: { mimeType: opts.designMime, data: opts.designBase64 } }
      ]);
    }

    try {
      let raw: string;
      try {
        const result = await runOnce(true);
        raw = result.response.text();
      } catch {
        const result = await runOnce(false);
        raw = result.response.text();
      }

      let parsed = parseInspectionPayload(raw);
      if (!parsed) {
        try {
          const result = await runOnce(false);
          raw = result.response.text();
          parsed = parseInspectionPayload(raw);
        } catch {
          parsed = null;
        }
      }
      if (parsed) return parsed;
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(
          `[gemini] inspection model=${modelId} → 다음 모델 시도`,
          e instanceof Error ? e.message : e
        );
        continue;
      }
      throw e;
    }
  }

  const msg =
    lastErr instanceof Error
      ? lastErr.message
      : "모든 후보 모델에서 호출에 실패했습니다. Google AI Studio에서 쿼터·결제를 확인하세요.";
  return {
    score: 60,
    overallSummary: `Gemini API 한도(429) 또는 오류: ${msg.slice(0, 500)}`,
    violations: [
      {
        category: "API",
        issue:
          "무료 한도 소진·모델별 쿼터 0일 수 있습니다. ai.google.dev에서 할당량 확인, 유료 플랜·다른 모델(GEMINI_MODEL) 시도, 잠시 후 재시도하세요.",
        severity: "medium"
      }
    ]
  };
}

type GeminiContentPart = {
  text?: string;
  inlineData?: { mimeType?: string; mime_type?: string; data?: string };
  inline_data?: { mimeType?: string; mime_type?: string; data?: string };
};

function extractTextAndImageFromGeminiResponse(data: unknown): {
  text: string;
  mimeType: string;
  base64: string;
} | null {
  const root = data as {
    candidates?: Array<{ content?: { parts?: GeminiContentPart[] } }>;
  };
  const parts = root?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  let text = "";
  let mimeType = "";
  let base64 = "";
  for (const p of parts) {
    if (typeof p.text === "string") text += p.text;
    const inline = p.inlineData ?? p.inline_data;
    if (inline && typeof inline === "object") {
      const m = (inline.mimeType ?? inline.mime_type) as string | undefined;
      const d = inline.data as string | undefined;
      if (m && d) {
        mimeType = m;
        base64 = d;
      }
    }
  }
  if (!base64 || !mimeType) return null;
  return { text: text.trim(), mimeType, base64 };
}

/**
 * 브랜드 가이드·검수 결과·사용자 직접 입력을 반영한 수정 이미지 생성 (PNG/JPEG 검수 대상만).
 * Gemini 이미지 모델 REST 호출 (responseModalities TEXT+IMAGE).
 */
export async function generateRevisedBrandingImage(opts: {
  designBase64: string;
  designMime: string;
  guidelineContext: string;
  overallSummary: string;
  violations: Array<{ category: string; issue: string; severity: string }>;
  userNotes?: string;
}): Promise<{ mimeType: string; base64: string; caption: string } | null> {
  const key = getKey();
  if (!key) return null;
  if (!opts.designMime.startsWith("image/")) return null;

  const violationLines = opts.violations
    .map((v) => `- [${v.severity}] ${v.category}: ${v.issue}`)
    .join("\n");

  const userBlock = opts.userNotes?.trim()
    ? opts.userNotes.trim()
    : "(사용자 직접 입력 없음)";

  const prompt = `당신은 브랜드 디자인 수정 전문가입니다.

첨부 이미지는 검수 대상 디자인입니다. 아래 [참조 가이드라인·검수 요약·위반 목록·사용자 요청]을 모두 반영하여 **브랜드에 맞게 보완한 새 이미지**를 생성하세요.

규칙:
- 원본의 메시지·구성 의도는 유지하되, 가이드 위반·개선점을 시각적으로 반영합니다.
- [사용자 직접 입력 검수 사항]에 적힌 요구는 **최우선**으로 반영합니다.
- 로고·컬러·타이포·여백 등 가이드가 요구하는 바를 최대한 따릅니다.
- 한국어 텍스트가 있으면 가독성 있게 유지합니다.
- 먼저 1~3문장으로 어떤 점을 어떻게 수정했는지 설명한 뒤, 수정된 이미지를 출력하세요.

[참조 가이드라인 및 검수 맥락]
${opts.guidelineContext.slice(0, 28_000)}

[검수 요약]
${opts.overallSummary}

[위반·개선 항목]
${violationLines || "(없음)"}

[사용자 직접 입력 검수 사항]
${userBlock}`;

  const bodies: object[] = [
    {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: opts.designMime,
                data: opts.designBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    },
    {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: opts.designMime,
                data: opts.designBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    }
  ];

  const models = [
    process.env.GEMINI_IMAGE_MODEL?.trim(),
    ...GEMINI_IMAGE_MODEL_FALLBACKS,
  ].filter((m): m is string => Boolean(m));

  for (const model of models) {
    for (const body of bodies) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(key)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const errBody = await res.text();
          console.error(`[gemini image] ${model} HTTP ${res.status}`, errBody.slice(0, 400));
          if (res.status === 400 && /API_KEY_INVALID|API key expired/i.test(errBody)) {
            return null;
          }
          continue;
        }
        const json = (await res.json()) as unknown;
        const extracted = extractTextAndImageFromGeminiResponse(json);
        if (extracted) {
          return {
            mimeType: extracted.mimeType,
            base64: extracted.base64,
            caption: extracted.text || "수정 이미지가 생성되었습니다."
          };
        }
      } catch (e) {
        console.error(`[gemini image] ${model}`, e);
      }
    }
  }
  return null;
}

function runGeminiImageGenerateWithParts(
  prompt: string,
  imageMime: string,
  imageBase64: string
): Promise<unknown> {
  const key = getKey();
  if (!key) return Promise.reject(new Error("no_gemini_key"));

  const bodies: object[] = [
    {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: imageMime, data: imageBase64 } }
          ]
        }
      ],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
    },
    {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: imageMime, data: imageBase64 } }
          ]
        }
      ],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
    }
  ];

  const models = [
    process.env.GEMINI_IMAGE_MODEL?.trim(),
    ...GEMINI_IMAGE_MODEL_FALLBACKS,
  ].filter((m): m is string => Boolean(m));

  return (async () => {
    for (const model of models) {
      for (const body of bodies) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent?key=${encodeURIComponent(key)}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          if (!res.ok) {
            const errBody = await res.text();
            console.error(`[gemini image followup] ${model} HTTP ${res.status}`, errBody.slice(0, 400));
            if (res.status === 400 && /API_KEY_INVALID|API key expired/i.test(errBody)) {
              return null;
            }
            continue;
          }
          return (await res.json()) as unknown;
        } catch (e) {
          console.error(`[gemini image followup] ${model}`, e);
        }
      }
    }
    return null;
  })();
}

type GeminiImageUserPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function geminiImagePartsToSnake(
  parts: GeminiImageUserPart[]
): Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> {
  return parts.map((p) => {
    if ("text" in p) return { text: p.text };
    return {
      inline_data: {
        mime_type: p.inlineData.mimeType,
        data: p.inlineData.data
      }
    };
  });
}

/**
 * 텍스트 + 이미지 1장 이상(참조 추가 등)을 한 요청으로 넘겨 이미지 생성 모델을 호출합니다.
 */
function runGeminiImageGenerateWithMultiParts(parts: GeminiImageUserPart[]): Promise<unknown | null> {
  const key = getKey();
  if (!key) return Promise.resolve(null);
  if (parts.length === 0) return Promise.resolve(null);

  const bodies: object[] = [
    {
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
    },
    {
      contents: [{ role: "user", parts: geminiImagePartsToSnake(parts) }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
    }
  ];

  const models = [
    process.env.GEMINI_IMAGE_MODEL?.trim(),
    ...GEMINI_IMAGE_MODEL_FALLBACKS,
  ].filter((m): m is string => Boolean(m));

  return (async () => {
    for (const model of models) {
      for (const body of bodies) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent?key=${encodeURIComponent(key)}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          if (!res.ok) {
            const errBody = await res.text();
            console.error(`[gemini image multi] ${model} HTTP ${res.status}`, errBody.slice(0, 400));
            if (res.status === 400 && /API_KEY_INVALID|API key expired/i.test(errBody)) {
              return null;
            }
            continue;
          }
          return (await res.json()) as unknown;
        } catch (e) {
          console.error(`[gemini image multi] ${model}`, e);
        }
      }
    }
    return null;
  })();
}

function sanitizeRevisionDirectiveText(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```[\w]*\s*\n?/m, "").replace(/\n?```\s*$/m, "");
  return s.slice(0, 4500).trim();
}

function buildFallbackRevisionDirective(
  violations: Array<{ category: string; issue: string; severity: string }>,
  extraFromContext: string
): string {
  const violationLines = violations
    .map((v) => `- [${v.severity}] ${v.category}: ${v.issue}`)
    .join("\n");
  const tail = extraFromContext.trim().slice(0, 2000);
  return sanitizeRevisionDirectiveText(
    `아래 위반·개선 항목을 모두 반영하고 브랜드 가이드라인에 맞게 시각적으로 수정하세요.\n${violationLines}${
      tail ? `\n\n[맥락에서 추출한 보조 요청]\n${tail}` : ""
    }`
  );
}

async function planAdditionalRevisionDirective(opts: {
  guidelineContext: string;
  overallSummary: string;
  violations: Array<{ category: string; issue: string; severity: string }>;
  designMime: string;
  designBase64: string;
  revisionMime?: string;
  revisionBase64?: string;
  supplementaryImage?: { mimeType: string; base64: string } | null;
}): Promise<string> {
  const key = getKey();
  if (!key) return "";

  const violationLines = opts.violations
    .map((v) => `- [${v.severity}] ${v.category}: ${v.issue}`)
    .join("\n");

  const attachmentLines: string[] = ["(1) 검수 대상 **원본** 디자인"];
  const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [
    { inlineData: { mimeType: opts.designMime, data: opts.designBase64 } }
  ];

  if (opts.revisionBase64 && opts.revisionMime?.startsWith("image/")) {
    attachmentLines.push("(2) 현재 **AI 수정 버전**(이전 생성 결과)");
    imageParts.push({
      inlineData: { mimeType: opts.revisionMime, data: opts.revisionBase64 }
    });
  }
  if (opts.supplementaryImage?.base64 && opts.supplementaryImage.mimeType.startsWith("image/")) {
    attachmentLines.push(`(${imageParts.length + 1}) 사용자가 추가 업로드한 **참조 이미지**(스타일·무드 참고)`);
    imageParts.push({
      inlineData: {
        mimeType: opts.supplementaryImage.mimeType,
        data: opts.supplementaryImage.base64
      }
    });
  }

  const textBlock = `역할: 브랜드 VI·검수 맥락을 바탕으로 **이미지 생성 모델에 그대로 전달할 수정 지시문**만 작성하는 기획자입니다.

규칙:
- [참조 가이드라인]·[검수 요약]·[위반 목록]을 모두 반영해 구체적인 시각적 수정 방향을 적습니다.
- 출력은 **수정 지시문만** 한국어로. 서두·제목·인사말·JSON·코드펜스 없이, 불릿이나 짧은 문단으로 **1500자 이내**.
- 색·로고·타이포·여백·문구·구도 등 실행 가능한 지시로 씁니다.

[참조 가이드라인 및 보조 텍스트]
${opts.guidelineContext.slice(0, 62_000)}

[검수 요약]
${opts.overallSummary.slice(0, 12_000)}

[위반·개선 항목]
${violationLines || "(없음)"}

[첨부 이미지 안내]
${attachmentLines.join("\n")}`;

  const genAI = new GoogleGenerativeAI(key);
  const contentParts: Array<string | { inlineData: { mimeType: string; data: string } }> = [
    textBlock,
    ...imageParts
  ];

  for (const mid of textModelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({ model: mid });
      const result = await model.generateContent(contentParts);
      const t = result.response.text()?.trim();
      if (t) return sanitizeRevisionDirectiveText(t);
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      if (shouldTryNextTextModel(e)) {
        console.warn(
          `[gemini] plan additional revision model=${mid} → 다음 모델 시도`,
          e instanceof Error ? e.message : e
        );
        continue;
      }
    }
  }
  return "";
}

/**
 * "추가 수정": 텍스트 모델로 수정 지시를 만든 뒤, 동일 이미지 API로 실제 수정본을 생성합니다.
 */
export async function additionalRevisionImagePipeline(opts: {
  guidelineContext: string;
  overallSummary: string;
  violations: Array<{ category: string; issue: string; severity: string }>;
  designMime: string;
  designBase64: string;
  revisionMime?: string;
  revisionBase64?: string;
  supplementaryImage?: { mimeType: string; base64: string } | null;
}): Promise<{ mimeType: string; base64: string } | null> {
  if (!getKey()) return null;
  if (!opts.designMime.startsWith("image/")) return null;

  const baseIsRevision = Boolean(
    opts.revisionBase64 && opts.revisionMime?.startsWith("image/")
  );
  const baseMime = baseIsRevision && opts.revisionMime ? opts.revisionMime : opts.designMime;
  const base64 = baseIsRevision && opts.revisionBase64 ? opts.revisionBase64 : opts.designBase64;

  let directive = await planAdditionalRevisionDirective({
    guidelineContext: opts.guidelineContext,
    overallSummary: opts.overallSummary,
    violations: opts.violations,
    designMime: opts.designMime,
    designBase64: opts.designBase64,
    revisionMime: opts.revisionMime,
    revisionBase64: opts.revisionBase64,
    supplementaryImage: opts.supplementaryImage ?? null
  });

  if (!directive) {
    directive = buildFallbackRevisionDirective(opts.violations, opts.guidelineContext);
  }

  const violationLines = opts.violations
    .map((v) => `- [${v.severity}] ${v.category}: ${v.issue}`)
    .join("\n");

  const baseDesc = baseIsRevision
    ? "첫 번째 첨부 이미지는 **현재 AI 수정본**입니다. 아래 [수정 지시]를 반영해 브랜드 가이드에 맞게 **한 번 더 보완한 최종 이미지 한 장**만 출력하세요."
    : "첫 번째 첨부 이미지는 **검수 대상 원본**입니다. 아래 [수정 지시]를 반영해 브랜드에 맞게 보완한 **최종 이미지 한 장**만 출력하세요.";

  const refNote = opts.supplementaryImage?.mimeType?.startsWith("image/")
    ? "\n- 두 번째 이후에 참조 이미지가 있으면 스타일·무드만 참고하고, 원본·수정본의 정보·구도 의도는 유지합니다."
    : "";

  const prompt = `당신은 브랜드 디자인 수정 전문가입니다.

${baseDesc}
${refNote}

규칙:
- 아래 [수정 지시]를 **최우선**으로 반영합니다.
- [참조 가이드라인]·[검수 요약]·[위반 목록]과 충돌하지 않게 조정합니다.
- 한국어 텍스트가 있으면 가독성 있게 유지합니다.
- **설명 문구 없이 수정된 이미지만** 출력합니다. (텍스트 응답은 최소화)

[참조 가이드라인 및 보조 텍스트]
${opts.guidelineContext.slice(0, 28_000)}

[검수 요약]
${opts.overallSummary.slice(0, 12_000)}

[위반·개선 항목]
${violationLines || "(없음)"}

[수정 지시 — 기획 단계]
${directive}`;

  const imageParts: GeminiImageUserPart[] = [{ text: prompt }, { inlineData: { mimeType: baseMime, data: base64 } }];
  if (opts.supplementaryImage?.base64 && opts.supplementaryImage.mimeType.startsWith("image/")) {
    imageParts.push({
      text: "다음 이미지는 사용자가 업로드한 참조 이미지입니다. 스타일·무드·톤만 참고하세요."
    });
    imageParts.push({
      inlineData: {
        mimeType: opts.supplementaryImage.mimeType,
        data: opts.supplementaryImage.base64
      }
    });
  }

  try {
    const json = await runGeminiImageGenerateWithMultiParts(imageParts);
    if (!json) return null;
    const extracted = extractTextAndImageFromGeminiResponse(json);
    if (!extracted) return null;
    return { mimeType: extracted.mimeType, base64: extracted.base64 };
  } catch {
    return null;
  }
}

/**
 * 검수 후 채팅으로 요청한 내용을 반영해 수정 이미지를 한 번 더 생성합니다.
 * base가 이전 AI 수정본이면 true로 두어 프롬프트를 구분합니다.
 */
export async function generateRevisedBrandingImageFollowup(opts: {
  baseImageBase64: string;
  baseImageMime: string;
  guidelineContext: string;
  overallSummary: string;
  violations: Array<{ category: string; issue: string; severity: string }>;
  chatInstruction: string;
  baseIsRevision: boolean;
}): Promise<{ mimeType: string; base64: string; caption: string } | null> {
  const key = getKey();
  if (!key) return null;
  if (!opts.baseImageMime.startsWith("image/")) return null;

  const violationLines = opts.violations
    .map((v) => `- [${v.severity}] ${v.category}: ${v.issue}`)
    .join("\n");

  const baseDesc = opts.baseIsRevision
    ? "첨부 이미지는 **이전 단계에서 브랜드 가이드에 맞춰 생성된 AI 수정본**입니다. 아래 [사용자 추가 요청]을 반영해 **한 번 더** 보완한 새 이미지를 출력하세요."
    : "첨부 이미지는 **검수 대상 원본**입니다. 아래 [사용자 추가 요청]을 반영해 브랜드에 맞게 보완한 새 이미지를 출력하세요.";

  const prompt = `당신은 브랜드 디자인 수정 전문가입니다.

${baseDesc}

규칙:
- [사용자 추가 요청]의 내용을 **최우선**으로 반영합니다.
- [참조 가이드라인·검수 요약·위반 목록]과 충돌하지 않게 조정합니다.
- 원본/이전 수정의 메시지·구성 의도는 유지합니다.
- 한국어 텍스트가 있으면 가독성 있게 유지합니다.
- 먼저 1~3문장으로 무엇을 어떻게 수정했는지 설명한 뒤, 수정된 이미지를 출력하세요.

[참조 가이드라인 및 검수 맥락]
${opts.guidelineContext.slice(0, 28_000)}

[검수 요약]
${opts.overallSummary}

[위반·개선 항목]
${violationLines || "(없음)"}

[사용자 추가 요청]
${opts.chatInstruction.trim()}`;

  try {
    const json = await runGeminiImageGenerateWithParts(
      prompt,
      opts.baseImageMime,
      opts.baseImageBase64
    );
    if (!json) return null;
    const extracted = extractTextAndImageFromGeminiResponse(json);
    if (!extracted) return null;
    return {
      mimeType: extracted.mimeType,
      base64: extracted.base64,
      caption: extracted.text || "요청을 반영해 이미지를 갱신했습니다."
    };
  } catch {
    return null;
  }
}

/** 이미지 재생성 없이 검수 맥락·가이드 기준으로 질문에 답합니다 (PDF 검수 대상 등). */
export async function answerInspectionAgentChat(opts: {
  guidelineContext: string;
  overallSummary: string;
  violations: Array<{ category: string; issue: string; severity: string }>;
  userMessage: string;
  designMime: string;
  designBase64: string;
  additionalNotes?: string;
}): Promise<string> {
  const key = getKey();
  if (!key) {
    return "GEMINI_API_KEY가 설정되어 있지 않아 답변을 생성할 수 없습니다. 루트 .env에 키를 넣고 서버를 재시작하세요.";
  }

  const violationLines = opts.violations
    .map((v) => `- [${v.severity}] ${v.category}: ${v.issue}`)
    .join("\n");

  let designAppendix = "";
  if (opts.designMime === "application/pdf") {
    const buf = Buffer.from(opts.designBase64, "base64");
    const excerpt = (await parsePdfBufferToText(buf)).slice(0, 14_000);
    designAppendix = `\n\n[검수 대상 PDF에서 추출한 텍스트 일부]\n${excerpt || "(추출 없음)"}`;
  } else if (opts.designMime.startsWith("image/")) {
    designAppendix =
      "\n\n(검수 대상은 이미지였습니다. 아래에 검수 대상 이미지를 함께 첨부했으니, 질문에 시각적 근거가 필요하면 참고하세요.)";
  }

  const notes = opts.additionalNotes?.trim() ? opts.additionalNotes.trim() : "(없음)";

  const systemBlock = `역할: LG U+ 브랜드·VI 가이드라인에 정통한 디자인 QA 어시스턴트입니다.
아래 [참조 가이드라인]·[검수 요약]·[위반 목록]·[사용자 직접 입력 검수 사항]을 바탕으로 사용자 질문에 **한국어**로 구체적으로 답하세요.
가이드에 없는 내용은 추측이라고 밝히고 일반 원칙만 언급하세요.

[참조 가이드라인]
${opts.guidelineContext.slice(0, 70_000)}

[검수 요약]
${opts.overallSummary}

[위반·개선 항목]
${violationLines || "(없음)"}

[사용자 직접 입력 검수 사항]
${notes}
${designAppendix}

[사용자 질문]
${opts.userMessage.trim()}`;

  const genAI = new GoogleGenerativeAI(key);
  let lastErr: unknown;
  for (const mid of textModelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({ model: mid });
      if (opts.designMime.startsWith("image/")) {
        const result = await model.generateContent([
          systemBlock,
          { inlineData: { mimeType: opts.designMime, data: opts.designBase64 } }
        ]);
        return result.response.text();
      }
      const result = await model.generateContent(systemBlock);
      return result.response.text();
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(
          `[gemini] agent chat model=${mid} → 다음 모델 시도`,
          e instanceof Error ? e.message : e
        );
        continue;
      }
      throw e;
    }
  }
  return `답변 생성에 실패했습니다: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`;
}

/** 옵션 페이지 하단 채팅 — 등록된 가이드라인 요약·발췌를 맥락으로 사용 (토큰 상한 내) */
async function buildOptionsChatGuidelineContext(): Promise<string> {
  const { guidelines } = loadMeta();
  const list = Object.values(guidelines);
  if (list.length === 0) {
    return "(등록된 브랜드 가이드라인 파일이 없습니다. 일반 지식으로 답하되, 브랜드 전용 판단은 가이드 등록 후 정확해집니다.)";
  }
  const parts: string[] = [];
  let budget = 72_000;
  for (const g of list) {
    if (budget <= 0) break;
    let block: string;
    if (g.aiSummary?.trim()) {
      block = `[${g.displayName} — 요약]\n${g.aiSummary.trim()}`;
    } else {
      block = `[${g.displayName} — 발췌]\n${(await excerptGuidelineForInspection(g)).trim()}`;
    }
    if (block.length > budget) block = `${block.slice(0, budget)}\n…(이하 생략)`;
    parts.push(block);
    budget -= block.length;
  }
  return parts.join("\n\n---\n\n");
}

/**
 * 옵션 페이지 멀티턴 채팅. `messages`의 마지막은 반드시 user.
 * 브랜드 관련 질문은 시스템 프롬프트로 주입한 가이드라인 맥락을 우선 참조.
 */
export async function runOptionsPageChat(opts: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const key = getKey();
  if (!key) {
    throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다.");
  }

  const trimmed = opts.messages
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content.length > 0);
  if (trimmed.length === 0) {
    throw new Error("메시지가 비어 있습니다.");
  }
  const last = trimmed[trimmed.length - 1];
  if (last.role !== "user") {
    throw new Error("마지막 메시지는 사용자 질문이어야 합니다.");
  }

  const guidelineContext = (await buildOptionsChatGuidelineContext()).slice(0, 120_000);

  const systemInstruction = `당신은 LG U+ 브랜드·VI·디자인 업무를 돕는 AI 어시스턴트입니다.

[응답 언어]
- 기본 응답 언어는 한국어입니다.

[브랜드 가이드라인]
- 일반적인 질문(인사, 설명 요청 등)에도 답할 수 있습니다.
- LG U+·자사 브랜드·VI·로고·컬러·타이포·톤앤매너·슬로건 등 **브랜드·디자인 관련 질문**이면 아래 [참고 자료]를 **우선** 참고하세요.
- 참고 자료에 없는 내용은 추측임을 분명히 밝히고, 일반 원칙만 짧게 언급하세요.

[참고 자료 — 서버에 등록된 브랜드 가이드라인]
${guidelineContext}`;

  const history = trimmed.slice(0, -1).map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }]
  }));

  const lastUserText = last.content;
  const genAI = new GoogleGenerativeAI(key);
  let lastErr: unknown;

  for (const mid of textModelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({
        model: mid,
        systemInstruction
      });
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(lastUserText);
      const text = result.response.text();
      if (text?.trim()) return text;
      return "(빈 응답이 반환되었습니다. 다시 시도해 주세요.)";
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(
          `[gemini] options chat model=${mid} → 다음 모델 시도`,
          e instanceof Error ? e.message : e
        );
        continue;
      }
      throw e;
    }
  }
  return `답변 생성에 실패했습니다: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`;
}

const brandNamingResponseSchema = {
  type: SchemaType.OBJECT,
  description: "브랜드 네이밍 생성 또는 검수 결과",
  properties: {
    overallScore: {
      type: SchemaType.NUMBER,
      description:
        "0~100 종합. 검수 시 서버에서 창의성·직관성 50%+50%로 재계산되므로, 모델은 네 항목 점수와 논리적으로 맞게 채점",
    },
    hierarchyScore: {
      type: SchemaType.NUMBER,
      description: "브랜드 계층 정렬 0~100 (검수: 종합 가중합에는 미포함, 70 미만이면 Pass/Fail상 Fail·NO-GO 요건)",
    },
    originalityDimensionScore: {
      type: SchemaType.NUMBER,
      description: "창의성 0~100 (검수: 종합 점수의 50% 가중). 가이드·요청·참고 정보만으로 Gemini 추론",
    },
    pronunciationScore: {
      type: SchemaType.INTEGER,
      description:
        "발음·언어 전용 점수 0~100. 검수: 검수 대상 네이밍·슬로건에 대해 (1) 한국어·영어로 읽을 때 발음의 자연스러움·호명 용이성 (2) 주요 외국어에서 불쾌·비하·부정 연상·금기 의미 여부. 생성: 제시한 4개 후보 네임 전체를 반영한 종합 점수. 녹음·IPA 불요",
    },
    pronunciationLanguageScore: {
      type: SchemaType.NUMBER,
      description:
        "직관성(발음·언어) 0~100 (검수: 종합 점수의 50% 가중). **pronunciationScore와 동일한 정수 값**으로 맞출 것",
    },
    legalityScore: {
      type: SchemaType.NUMBER,
      description: "적법성 0~100 (검수: 종합 가중합에는 미포함, 70 미만이면 Pass/Fail상 Fail·NO-GO 요건). 국가법령정보 요약이 있으면 반영",
    },
    trademarkScore: { type: SchemaType.NUMBER, description: "레거시: 상표 관점. 검수에서는 originalityDimensionScore와 유사 목적으로 채울 수 있음" },
    copyrightScore: { type: SchemaType.NUMBER, description: "레거시: 저작권. 검수에서는 legalityScore 보조로 채울 수 있음" },
    hierarchyStatus: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["aligned", "misaligned", "warning"] as string[],
      description: "브랜드 계층 정렬 상태"
    },
    hierarchyMessage: { type: SchemaType.STRING, description: "계층 정렬 한 줄 요약 (한국어)" },
    hierarchyDetails: { type: SchemaType.STRING, description: "계층 정렬 상세 (한국어)" },
    hierarchyChecklist: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "확인된 체크 항목 한국어 짧은 문장 2~5개"
    },
    trademarkRisk: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["low", "medium", "high"] as string[],
      description: "상표 충돌 위험"
    },
    trademarkConflicts: {
      type: SchemaType.ARRAY,
      description: "유사 상표 후보 (실제 등록 여부와 무관, 분석용)",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          class: { type: SchemaType.STRING, description: "예: 35류 - 광고업" },
          similarity: { type: SchemaType.NUMBER, description: "0~100 유사도" }
        },
        required: ["name", "class", "similarity"]
      }
    },
    trademarkRecommendation: { type: SchemaType.STRING, description: "상표 관점 권고 (한국어)" },
    copyrightOriginality: { type: SchemaType.NUMBER, description: "0~100 독창성" },
    copyrightVerdict: { type: SchemaType.STRING, description: "저작권 관점 한 줄 평가" },
    copyrightRisks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING },
          severity: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["low", "medium", "high"] as string[]
          },
          description: { type: SchemaType.STRING }
        },
        required: ["type", "severity", "description"]
      }
    },
    detailLogicHierarchy: {
      type: SchemaType.STRING,
      description:
        "검수: 브랜드 계층 정렬 항목 상세 논리(한국어). 가이드라인·업로드·직접입력만 근거로 서술. 생성: 짧은 요약 가능"
    },
    detailLogicOriginality: {
      type: SchemaType.STRING,
      description:
        "검수: 창의성 항목 상세 논리. 가이드·요청·참고 정보만으로 Gemini 추론(외부 상표 DB 연동·출처 언급 금지). 생성: 짧은 요약"
    },
    detailLogicPronunciation: {
      type: SchemaType.STRING,
      description:
        "검수 전용(최소 120자 권장): 직관성(발음·언어) 상세 논리(한국어). 검수 요청의 네이밍·슬로건을 **문자만으로** 분석. (1) 일반 사용자가 읽고 부를 때 **발음하기 쉽고 자연스러운지** (음절·모음·자음 배열, 길이, 외래어 혼용). (2) **언어적으로 긍정적이고 건강한지** — 부정·혐오·불쾌·유해한 연상, 과장·허위 느낌이 없는지. (3) 브랜드 톤과 맞는지. 실제 발음 녹음·발음기호 출력 요구 아님. **비우지 말 것.** 생성 모드: 짧은 요약",
    },
    detailLogicLegality: {
      type: SchemaType.STRING,
      description:
        "검수: 적법성 항목 상세 논리. 국가법령정보 API 요약이 있으면 발췌·출처(국가법령정보센터 등) 명시. 상표법·저작권법 관점. 생성: 짧은 요약"
    },
    finalSummary: {
      type: SchemaType.STRING,
      description: "최종 GO/NO-GO 근거 요약 2~4문장 (한국어)"
    },
    goRecommendation: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["go", "no-go"] as string[],
      description: "70점 이상이면 보통 go"
    },
    suggestedNames: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description:
        "생성: names·namingProposals의 name과 동일 순서·개수(일반 4 또는 단계별 **대안 4**). 검수: []"
    },
    /**
     * 생성 모드 권장: 고정 응답 형식. namingProposals와 동일 구조이나 설명 키는 `description`.
     * 파서는 names가 있으면 우선 사용.
     */
    names: {
      type: SchemaType.ARRAY,
      description:
        "생성 모드: **일반 4개** 또는 **단계별(요금제) 시 대안 패키지 요약 4개**(상세 N단계는 tierNamingAlternatives). 검수: []",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, description: "제안 네이밍" },
          description: {
            type: SchemaType.STRING,
            description: "네이밍 설명·창작 근거(한국어)"
          },
          hierarchyScore: { type: SchemaType.INTEGER, description: "브랜드 계층 정렬 0~100" },
          hierarchyDetail: {
            type: SchemaType.STRING,
            description: "브랜드 계층 평가 상세 서술 (한국어, 3줄 이상)"
          },
          uniquenessScore: { type: SchemaType.INTEGER, description: "독창성 0~100" },
          uniquenessDetail: {
            type: SchemaType.STRING,
            description: "독창성 평가 상세 서술 (한국어, 3줄 이상)"
          },
          pronunciationScore: { type: SchemaType.INTEGER, description: "발음·언어 0~100" },
          pronunciationDetail: {
            type: SchemaType.STRING,
            description: "발음·언어 평가 상세 서술 (한국어, 3줄 이상)"
          },
          legalScore: { type: SchemaType.INTEGER, description: "적법성 0~100" },
          legalDetail: {
            type: SchemaType.STRING,
            description: "적법성 평가 상세 서술 (한국어, 3줄 이상)"
          }
        },
        required: [
          "name",
          "description",
          "hierarchyScore",
          "hierarchyDetail",
          "uniquenessScore",
          "uniquenessDetail",
          "pronunciationScore",
          "pronunciationDetail",
          "legalScore",
          "legalDetail"
        ]
      }
    },
    namingProposals: {
      type: SchemaType.ARRAY,
      description:
        "생성 모드: names와 동일 개수·동일 내용. 단계별(요금제)일 때는 **4개=대안 패키지 요약** tierNamingAlternatives와 1:1. 검수: []",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, description: "제안 네이밍" },
          description: {
            type: SchemaType.STRING,
            description: "네이밍 설명(한국어). rationale 대신 사용 가능"
          },
          rationale: {
            type: SchemaType.STRING,
            description: "레거시: description과 동일 의미로 채우거나 description을 우선"
          },
          hierarchyScore: { type: SchemaType.INTEGER, description: "브랜드 계층 정렬 0~100" },
          hierarchyDetail: {
            type: SchemaType.STRING,
            description: "브랜드 계층 평가 상세 서술 (한국어, 3줄 이상)"
          },
          uniquenessScore: { type: SchemaType.INTEGER, description: "독창성 0~100" },
          uniquenessDetail: {
            type: SchemaType.STRING,
            description: "독창성 평가 상세 서술 (한국어, 3줄 이상)"
          },
          pronunciationScore: { type: SchemaType.INTEGER, description: "발음·언어 0~100" },
          pronunciationDetail: {
            type: SchemaType.STRING,
            description: "발음·언어 평가 상세 서술 (한국어, 3줄 이상)"
          },
          legalScore: { type: SchemaType.INTEGER, description: "적법성 0~100" },
          legalDetail: {
            type: SchemaType.STRING,
            description: "적법성 평가 상세 서술 (한국어, 3줄 이상)"
          }
        },
        required: [
          "name",
          "description",
          "hierarchyScore",
          "hierarchyDetail",
          "uniquenessScore",
          "uniquenessDetail",
          "pronunciationScore",
          "pronunciationDetail",
          "legalScore",
          "legalDetail"
        ]
      }
    },
    tierNamingAlternatives: {
      type: SchemaType.ARRAY,
      description:
        "**단계별 생성 시 필수: 정확히 4개**. 각 원소 = **대안 1개** = 한 패키지(요청한 N단계 전부 + 세계관 + 패키지 단위 4대 평가). 일반 생성(단일 네이밍 4안)에서는 빈 배열 []",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          storyline: {
            type: SchemaType.STRING,
            description:
              "이 대안 패키지 전체가 공유하는 세계관·스토리라인(한국어 3~6문장). Personal이면 커머셜·일상 B2C 맥락, Enterprise이면 진중·신뢰·B2B 무게감. N단계 네이밍이 하나의 서사에서 파생되도록 서술"
          },
          tierSteps: {
            type: SchemaType.ARRAY,
            description: "단계 수 = 요청한 N. 순서는 요청 단계 라벨과 동일",
            items: {
              type: SchemaType.OBJECT,
              properties: {
                tierLabel: { type: SchemaType.STRING, description: "예: 최고가, 고가…" },
                name: { type: SchemaType.STRING, description: "해당 단계 상품·요금제 네이밍" },
                rationale: { type: SchemaType.STRING, description: "해당 단계 이름의 짧은 창작 근거" }
              },
              required: ["tierLabel", "name", "rationale"]
            }
          },
          tierPackageEvaluation: {
            type: SchemaType.OBJECT,
            description: "이 패키지(N단계 전체)에 대한 통합 4대 평가. 창의성 근거에는 storyline 반영 필수",
            properties: {
              hierarchyScore: { type: SchemaType.INTEGER },
              legalityScore: { type: SchemaType.INTEGER },
              originalityDimensionScore: { type: SchemaType.INTEGER },
              pronunciationScore: { type: SchemaType.INTEGER },
              hierarchyDetail: { type: SchemaType.STRING },
              legalityDetail: { type: SchemaType.STRING },
              originalityDetail: {
                type: SchemaType.STRING,
                description: "창의성: 반드시 storyline과 각 단계 네이밍의 연결을 구체적으로 서술"
              },
              pronunciationDetail: { type: SchemaType.STRING }
            },
            required: [
              "hierarchyScore",
              "legalityScore",
              "originalityDimensionScore",
              "pronunciationScore",
              "hierarchyDetail",
              "legalityDetail",
              "originalityDetail",
              "pronunciationDetail"
            ]
          }
        },
        required: ["storyline", "tierSteps", "tierPackageEvaluation"]
      }
    },
    tierPackageEvaluation: {
      type: SchemaType.OBJECT,
      description:
        "**레거시·단일 패키지용**. 단계별 4대안 모드에서는 **tierNamingAlternatives**만 사용하고 여기는 생략. 일반 생성(4안)에서는 생략",
      properties: {
        hierarchyScore: { type: SchemaType.INTEGER, description: "패키지 기준 브랜드 계층 정렬 0~100" },
        legalityScore: { type: SchemaType.INTEGER, description: "패키지 기준 적법성 0~100" },
        originalityDimensionScore: { type: SchemaType.INTEGER, description: "패키지 기준 창의성 0~100" },
        pronunciationScore: { type: SchemaType.INTEGER, description: "패키지 기준 직관성(발음·언어) 0~100" },
        hierarchyDetail: {
          type: SchemaType.STRING,
          description: "패키지 전체에 대한 브랜드 계층 정렬 근거 한국어 3줄 이상"
        },
        legalityDetail: { type: SchemaType.STRING, description: "패키지 기준 적법성 근거 3줄 이상" },
        originalityDetail: { type: SchemaType.STRING, description: "패키지 기준 창의성 근거 3줄 이상" },
        pronunciationDetail: { type: SchemaType.STRING, description: "패키지 기준 직관성 근거 3줄 이상" }
      }
    },
    additionalNamingSuggestions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description:
        "검수 필수: 평가 맥락을 반영한 **대안 네이밍 정확히 3개**만 배열로. 검수명·슬로건과 겹치지 않는 실제 후보명(한글·영문 등). 안내 문장·주석·※ 접두어 금지. 생성 모드: 반드시 빈 배열 []"
    }
  },
  required: [
    "overallScore",
    "hierarchyScore",
    "originalityDimensionScore",
    "pronunciationScore",
    "pronunciationLanguageScore",
    "legalityScore",
    "trademarkScore",
    "copyrightScore",
    "hierarchyStatus",
    "hierarchyMessage",
    "hierarchyDetails",
    "hierarchyChecklist",
    "trademarkRisk",
    "trademarkConflicts",
    "trademarkRecommendation",
    "copyrightOriginality",
    "copyrightVerdict",
    "copyrightRisks",
    "detailLogicHierarchy",
    "detailLogicOriginality",
    "detailLogicPronunciation",
    "detailLogicLegality",
    "finalSummary",
    "goRecommendation",
    "suggestedNames",
    "names",
    "namingProposals",
    "additionalNamingSuggestions"
  ]
} as Schema;

/** 검수 NO-GO인데 additionalNamingSuggestions가 비었을 때만 쓰는 보조 응답 스키마 */
const auditAlternateNamesSchema = {
  type: SchemaType.OBJECT,
  properties: {
    names: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description:
        "검수 대상과 다른 실제 브랜드·서비스 명칭 후보 정확히 3개. 안내 문구·주석·※ 접두어 금지."
    }
  },
  required: ["names"]
} as Schema;

function parseAlternateNamesPayload(raw: string): string[] | null {
  try {
    const p = JSON.parse(raw) as { names?: unknown };
    if (!Array.isArray(p.names)) return null;
    return (p.names as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const p = JSON.parse(m[0]) as { names?: unknown };
      if (!Array.isArray(p.names)) return null;
      return (p.names as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
    } catch {
      return null;
    }
  }
}

function filterPlausibleAlternateNames(names: string[]): string[] {
  const bad = (s: string) =>
    s.length < 2 ||
    s.length > 48 ||
    /^[※•·\-–—*]/.test(s) ||
    /^(안내|참고|주의|예시|※)/i.test(s) ||
    /안내|참고하세요|다음과\s*같/i.test(s);
  return names.filter((s) => !bad(s));
}

/** Gemini 보조 호출 실패 시에도 NO-GO 검수에 최소 한 세트는 채움 */
function fallbackAlternateNamesForAudit(requestText: string): string[] {
  const seed = requestText.replace(/\s+/g, " ").trim().slice(0, 80);
  const suffix = seed ? seed.split(/\s+/).slice(0, 2).join("") : "브랜드";
  const a = suffix.length >= 2 ? `${suffix.slice(0, 6)}엣지` : "큐브엣지";
  const b = suffix.length >= 2 ? `${suffix.slice(0, 4)}라이트` : "루프라이트";
  return filterPlausibleAlternateNames([a, b, "스텔라포인트"]).slice(0, 4);
}

async function generateAlternateNamesForAuditNoGo(
  genAI: InstanceType<typeof GoogleGenerativeAI>,
  ctx: {
    requestText: string;
    guidelineBlock: string;
    referenceNotes: string;
    auditCategoryRaw?: string;
  }
): Promise<string[]> {
  const req = ctx.requestText.trim();
  const guide = ctx.guidelineBlock.slice(0, 40_000);
  const notes = ctx.referenceNotes.trim() || "(없음)";
  const suggestionConditions = buildAdditionalNamingSuggestionBlockFromAuditRaw(ctx.auditCategoryRaw ?? "");
  const prompt = `역할: 브랜드 네이밍 전문가.
검수 결과가 **NO-GO**였고, 사용자에게 제시할 **대체 네이밍 후보**가 비어 있어 보완합니다.

${suggestionConditions ? `${suggestionConditions}\n\n` : ""}규칙:
- [요청 내용]의 서비스·브랜드 맥락을 유지하되, 검수에 올린 **기존 명칭·슬로건과 동일하거나 거의 같은 표기는 넣지 마세요.**
- 실제로 쓸 수 있는 **브랜드·서비스 이름**을 **정확히 3개**, **names** 배열에 넣으세요.
- 한글·영문·혼합 가능. 설명 문장·안내·※·주석 금지.

[U+ 브랜드 가이드라인 및 참고 문맥]
${guide}

[참고 정보]
${notes}

[요청 내용]
${req}

출력: JSON 한 개만. 키는 names 하나.
반드시 JSON 형식으로만 응답하고 다른 텍스트는 포함하지 마세요.`;

  let lastErr: unknown;
  for (const modelId of textModelCandidates()) {
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: auditAlternateNamesSchema
      }
    });
    try {
      const result = await model.generateContent(prompt);
      const raw = result.response.text();
      const parsed = parseAlternateNamesPayload(raw);
      const cleaned = filterPlausibleAlternateNames(parsed ?? []);
      if (cleaned.length >= 3) return cleaned.slice(0, 3);
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(`[gemini] audit alternate names model=${modelId} → 다음 모델`, e instanceof Error ? e.message : e);
        continue;
      }
      throw e;
    }
    try {
      const modelPlain = genAI.getGenerativeModel({ model: modelId });
      const result = await modelPlain.generateContent(
        `${prompt}\n\n반드시 JSON 형식으로만 응답하고 다른 텍스트는 포함하지 마세요.\n\n응답: {"names":["…"]} 형태의 JSON만 출력하세요.`
      );
      const parsed = parseAlternateNamesPayload(result.response.text());
      const cleaned = filterPlausibleAlternateNames(parsed ?? []);
      if (cleaned.length >= 3) return cleaned.slice(0, 3);
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) continue;
      throw e;
    }
  }
  console.warn("[gemini] audit alternate names: 모든 모델 실패, 폴백 사용", lastErr);
  return [];
}

async function ensureAuditNoGoHasAdditionalSuggestions(
  r: BrandNamingGeminiResult,
  genAI: InstanceType<typeof GoogleGenerativeAI>,
  ctx: {
    requestText: string;
    guidelineBlock: string;
    referenceNotes: string;
    auditCategoryRaw?: string;
  }
): Promise<BrandNamingGeminiResult> {
  if (r.goRecommendation !== "no-go") return r;
  const cur = Array.isArray(r.additionalNamingSuggestions)
    ? r.additionalNamingSuggestions.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (cur.length > 0) return { ...r, additionalNamingSuggestions: cur.slice(0, 3) };

  let next = await generateAlternateNamesForAuditNoGo(genAI, ctx);
  next = filterPlausibleAlternateNames(next);
  if (next.length < 3) {
    next = fallbackAlternateNamesForAudit(ctx.requestText);
  }
  return { ...r, additionalNamingSuggestions: next.slice(0, 3) };
}

export type ProposalDetailLogicGemini = {
  hierarchy: string;
  originality: string;
  pronunciationLanguage: string;
  legality: string;
};

export type BrandNamingProposalGemini = {
  name: string;
  rationale: string;
  hierarchyScore: number;
  originalityDimensionScore: number;
  pronunciationScore: number;
  legalityScore: number;
  proposalDetailLogic: ProposalDetailLogicGemini;
};

export type BrandNamingGeminiResult = {
  overallScore: number;
  hierarchyScore: number;
  originalityDimensionScore: number;
  /** 발음·언어 단일 점수(0~100). pronunciationLanguageScore와 동기화 */
  pronunciationScore: number;
  pronunciationLanguageScore: number;
  legalityScore: number;
  trademarkScore: number;
  copyrightScore: number;
  detailLogic: {
    hierarchy: string;
    originality: string;
    pronunciationLanguage: string;
    legality: string;
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
  suggestedNames: string[];
  namingProposals: BrandNamingProposalGemini[];
  /** 검수: 입력 외 추가 제안 네이밍 */
  additionalNamingSuggestions: string[];
  /** 단계별 생성(구): 단일 패키지 — tierNamingAlternatives 사용 시 무시 */
  tierPackageEvaluation?: TierPackageEvaluationGemini;
  /** 단계별 생성: 대안 4개 × (N단계 패키지 + 세계관 + 통합 평가) */
  tierNamingAlternatives?: TierNamingAlternativeGemini[];
};

export type TierPackageEvaluationGemini = {
  hierarchyScore: number;
  legalityScore: number;
  originalityDimensionScore: number;
  pronunciationScore: number;
  proposalDetailLogic: ProposalDetailLogicGemini;
};

export type TierNamingAlternativeGemini = {
  storyline: string;
  tierSteps: Array<{ tierLabel: string; name: string; rationale: string }>;
  tierPackageEvaluation: TierPackageEvaluationGemini;
};

function parseTierPackageEvaluationObj(raw: unknown): TierPackageEvaluationGemini | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return parseTierPackageEvaluation({ tierPackageEvaluation: raw });
}

function parseTierNamingAlternatives(p: Record<string, unknown>): TierNamingAlternativeGemini[] | undefined {
  const raw = p.tierNamingAlternatives;
  if (!Array.isArray(raw)) return undefined;
  const out: TierNamingAlternativeGemini[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const stepsRaw = Array.isArray(row.tierSteps) ? row.tierSteps : [];
    const tierSteps = stepsRaw
      .map((s) => {
        if (!s || typeof s !== "object" || Array.isArray(s)) return null;
        const t = s as Record<string, unknown>;
        return {
          tierLabel: String(t.tierLabel ?? "").trim(),
          name: String(t.name ?? "").trim(),
          rationale: String(t.rationale ?? "").trim()
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const pkg = parseTierPackageEvaluationObj(row.tierPackageEvaluation);
    if (!pkg) continue;
    const storyline = String(row.storyline ?? "").trim() || "(스토리라인 없음)";
    out.push({ storyline, tierSteps, tierPackageEvaluation: pkg });
  }
  return out.length ? out : undefined;
}

function parseTierPackageEvaluation(p: Record<string, unknown>): TierPackageEvaluationGemini | undefined {
  const raw = p.tierPackageEvaluation;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const t = raw as Record<string, unknown>;
  const clamp = (v: unknown) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
  const firstStr = (...args: unknown[]) => {
    for (const x of args) {
      const s = String(x ?? "").trim();
      if (s) return s;
    }
    return "";
  };
  const hs = clamp(t.hierarchyScore ?? 0);
  const ls = clamp(t.legalityScore ?? t.legalScore ?? 0);
  const os = clamp(t.originalityDimensionScore ?? t.uniquenessScore ?? 0);
  const ps = clamp(t.pronunciationScore ?? 0);
  if (hs + ls + os + ps === 0) return undefined;
  const detail: ProposalDetailLogicGemini = {
    hierarchy:
      firstStr(t.hierarchyDetail, t.detailHierarchy, (t as { proposalDetailLogic?: { hierarchy?: string } }).proposalDetailLogic?.hierarchy) ||
      "(상세 근거 문단 없음)",
    originality:
      firstStr(
        t.originalityDetail,
        t.uniquenessDetail,
        (t as { proposalDetailLogic?: { originality?: string } }).proposalDetailLogic?.originality
      ) || "(상세 근거 문단 없음)",
    pronunciationLanguage:
      firstStr(
        t.pronunciationDetail,
        (t as { proposalDetailLogic?: { pronunciationLanguage?: string } }).proposalDetailLogic?.pronunciationLanguage
      ) || "(상세 근거 문단 없음)",
    legality:
      firstStr(t.legalityDetail, t.legalDetail, (t as { proposalDetailLogic?: { legality?: string } }).proposalDetailLogic?.legality) ||
      "(상세 근거 문단 없음)"
  };
  return {
    hierarchyScore: hs,
    legalityScore: ls,
    originalityDimensionScore: os,
    pronunciationScore: ps,
    proposalDetailLogic: detail
  };
}

function weightedTierPackageOverall(tp: TierPackageEvaluationGemini): number {
  return Math.min(
    100,
    Math.max(0, Math.round(tp.originalityDimensionScore * 0.5 + tp.pronunciationScore * 0.5))
  );
}

function synthesizeTierAlternativePlaceholder(
  altIdx: number,
  nSteps: number,
  labels: string[]
): TierNamingAlternativeGemini {
  const L = labels.slice(0, nSteps);
  const tierSteps = L.map((lb, i) => ({
    tierLabel: lb,
    name: `보완 ${altIdx}-${i + 1}`,
    rationale: "응답이 불완전하여 자동 보완했습니다. 동일 요청으로 재생성해 주세요."
  }));
  return {
    storyline: `【자동 보완】대안 ${altIdx}번 패키지(스토리라인·평가)가 비었습니다. tierNamingAlternatives를 정확히 4개 채워 재시도해 주세요.`,
    tierSteps,
    tierPackageEvaluation: {
      hierarchyScore: 50,
      legalityScore: 50,
      originalityDimensionScore: 50,
      pronunciationScore: 50,
      proposalDetailLogic: {
        hierarchy: "자동 보완입니다.",
        originality: "자동 보완입니다. 세계관·스토리라인과 단계 네이밍의 연계는 재생성 시 모델 응답에 포함됩니다.",
        pronunciationLanguage: "자동 보완입니다.",
        legality: "자동 보완입니다."
      }
    }
  };
}

function normalizeTierAlternativeShape(
  alt: TierNamingAlternativeGemini,
  nSteps: number,
  labels: string[],
  altIdx: number
): TierNamingAlternativeGemini {
  const L = labels.slice(0, nSteps);
  const cur = [...alt.tierSteps];
  while (cur.length < nSteps) {
    const i = cur.length;
    cur.push({ tierLabel: L[i] ?? `단계 ${i + 1}`, name: "", rationale: "" });
  }
  const tierSteps = cur.slice(0, nSteps).map((s, i) => ({
    tierLabel: (s.tierLabel || L[i] || `단계 ${i + 1}`).trim(),
    name: (s.name || `보완 ${altIdx}-${i + 1}`).trim(),
    rationale: (s.rationale || "").trim() || "—"
  }));
  let tierPackageEvaluation = alt.tierPackageEvaluation;
  const sumScores =
    (tierPackageEvaluation?.hierarchyScore ?? 0) +
    (tierPackageEvaluation?.legalityScore ?? 0) +
    (tierPackageEvaluation?.originalityDimensionScore ?? 0) +
    (tierPackageEvaluation?.pronunciationScore ?? 0);
  if (!tierPackageEvaluation || sumScores === 0) {
    tierPackageEvaluation = {
      hierarchyScore: 50,
      legalityScore: 50,
      originalityDimensionScore: 50,
      pronunciationScore: 50,
      proposalDetailLogic: {
        hierarchy: "(자동 보완)",
        originality: "(자동 보완) 스토리라인·단계 네이밍 연계 평가가 비었습니다.",
        pronunciationLanguage: "(자동 보완)",
        legality: "(자동 보완)"
      }
    };
  }
  const storyline = (alt.storyline || "").trim() || `【자동 보완】대안 ${altIdx} 스토리라인 없음`;
  return { storyline, tierSteps, tierPackageEvaluation };
}

function synthesizeTierPackageFromProposals(proposals: BrandNamingProposalGemini[]): TierPackageEvaluationGemini {
  const n = Math.max(1, proposals.length);
  const avg = (get: (p: BrandNamingProposalGemini) => number) =>
    Math.round(proposals.reduce((s, p) => s + get(p), 0) / n);
  return {
    hierarchyScore: avg((p) => p.hierarchyScore),
    legalityScore: avg((p) => p.legalityScore),
    originalityDimensionScore: avg((p) => p.originalityDimensionScore),
    pronunciationScore: avg((p) => p.pronunciationScore),
    proposalDetailLogic: {
      hierarchy:
        "모델이 패키지 통합 평가 객체를 내보내지 않아, 단계별 후보 점수의 산술 평균으로 대체했습니다. 동일 요청으로 재생성하면 통합 근거 문단이 채워질 수 있습니다.",
      originality: "—",
      pronunciationLanguage: "—",
      legality: "—"
    }
  };
}

function parseBrandNamingPayload(raw: string): BrandNamingGeminiResult | null {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    return normalizeBrandNamingResult(p);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const p = JSON.parse(m[0]) as Record<string, unknown>;
      return normalizeBrandNamingResult(p);
    } catch {
      return null;
    }
  }
}

function weightedAuditOverall(_h: number, o: number, pr: number, _l: number): number {
  // 가중합: 창의성(=originalityDimensionScore) 50% + 직관성(=pronunciationScore) 50%
  return Math.min(100, Math.max(0, Math.round(o * 0.5 + pr * 0.5)));
}

/** 검수: 발음·언어 상세가 너무 짧거나 비어 있으면 기본 안내 문구 보강 */
const AUDIT_PRONUNCIATION_MIN_CHARS = 90;

function ensureAuditPronunciationDetail(raw: string, requestText: string): string {
  const t = raw.trim();
  if (t.length >= AUDIT_PRONUNCIATION_MIN_CHARS) return t;
  const snippet = requestText.replace(/\s+/g, " ").trim().slice(0, 200);
  const auto =
    "【자동 보완】모델 응답이 짧거나 비어 있어 안내 문구를 덧붙입니다. 검수 요청 네이밍·슬로건을 문자만으로 보고, (1) 읽고 부르기 쉬운지·발음이 자연스러운지, (2) 언어적으로 긍정적이고 건강한 어감인지(부정·유해 연상 없음), (3) 브랜드 맥락에 맞는지를 검토하십시오.";
  const ctx = snippet ? ` 검수 요청 발췌: 「${snippet}」` : "";
  return t.length > 0 ? `${t}\n\n${auto}${ctx}` : `${auto}${ctx}`;
}

function normalizeBrandNamingResult(p: Record<string, unknown>): BrandNamingGeminiResult | null {
  const finite = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
  };
  const hsNum = finite(p.hierarchyScore) ?? 0;
  const origNum =
    finite(p.originalityDimensionScore) ?? finite(p.trademarkScore) ?? finite(p.overallScore) ?? 0;
  const pronNum =
    finite(p.pronunciationScore) ?? finite(p.pronunciationLanguageScore) ?? finite(p.overallScore) ?? 70;
  const legNum = finite(p.legalityScore) ?? finite(p.copyrightScore) ?? finite(p.overallScore) ?? 0;
  const tmLegacy = finite(p.trademarkScore) ?? origNum;
  const crLegacy = finite(p.copyrightScore) ?? legNum;
  const overallScore = finite(p.overallScore) ?? weightedAuditOverall(hsNum, origNum, pronNum, legNum);
  const hs = ["aligned", "misaligned", "warning"].includes(String(p.hierarchyStatus))
    ? (String(p.hierarchyStatus) as "aligned" | "misaligned" | "warning")
    : "warning";
  const tr = ["low", "medium", "high"].includes(String(p.trademarkRisk))
    ? (String(p.trademarkRisk) as "low" | "medium" | "high")
    : "medium";
  // Pass/Fail: 브랜드 계층 정렬, 적법성은 가중합에서 제외하고, fail이면 무조건 사용 불가
  const passHierarchy = hsNum >= 70;
  const passLegality = legNum >= 70;
  const gr =
    !passHierarchy || !passLegality || p.goRecommendation === "no-go"
      ? "no-go"
      : "go";
  const conflicts = Array.isArray(p.trademarkConflicts)
    ? (p.trademarkConflicts as Array<{ name?: string; class?: string; similarity?: number }>).map((c) => ({
        name: String(c?.name ?? ""),
        class: String(c?.class ?? ""),
        similarity: Math.min(100, Math.max(0, Number(c?.similarity) || 0))
      }))
    : [];
  const risks = Array.isArray(p.copyrightRisks)
    ? (p.copyrightRisks as Array<{ type?: string; severity?: string; description?: string }>).map((r) => ({
        type: String(r?.type ?? ""),
        severity: (["low", "medium", "high"].includes(String(r?.severity))
          ? r?.severity
          : "low") as "low" | "medium" | "high",
        description: String(r?.description ?? "")
      }))
    : [];
  const checklist = Array.isArray(p.hierarchyChecklist)
    ? (p.hierarchyChecklist as unknown[]).map((x) => String(x))
    : [];
  const suggested = Array.isArray(p.suggestedNames)
    ? (p.suggestedNames as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];
  const additionalNamingSuggestions = Array.isArray(p.additionalNamingSuggestions)
    ? (p.additionalNamingSuggestions as unknown[]).map((x) => String(x)).filter(Boolean).slice(0, 3)
    : [];

  const clampScore = (n: unknown) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));

  const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
    for (const k of keys) {
      if (!(k in row)) continue;
      const v = row[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  };

  const mapProposalRow = (row: Record<string, unknown>): BrandNamingProposalGemini => {
    const h = clampScore(
      pick(row, ["hierarchyScore", "hierarchy_score", "brandHierarchyScore", "logicScore", "logic_score"])
    );
    const o = clampScore(
      pick(row, [
        "uniquenessScore",
        "uniqueness_score",
        "originalityDimensionScore",
        "originality_dimension_score",
        "originalityScore",
        "creativityScore",
        "creativity_score",
      ])
    );
    const pr = clampScore(
      pick(row, [
        "pronunciationScore",
        "pronunciation_score",
        "pronunciationLanguageScore",
        "pronunciation_language_score",
        "metaphorScore",
      ])
    );
    const leg = clampScore(pick(row, ["legalScore", "legal_score", "legalityScore", "legality_score"]));
    const nested =
      row.proposalDetailLogic && typeof row.proposalDetailLogic === "object" && !Array.isArray(row.proposalDetailLogic)
        ? (row.proposalDetailLogic as Record<string, unknown>)
        : {};
    const firstStr = (...args: unknown[]) => {
      for (const x of args) {
        const t = String(x ?? "").trim();
        if (t) return t;
      }
      return "";
    };
    const detail: ProposalDetailLogicGemini = {
      hierarchy: firstStr(
        row.hierarchyDetail,
        row.detailHierarchy,
        row.detail_hierarchy,
        row.detailLogicHierarchy,
        nested.hierarchy,
        nested.detailHierarchy
      ),
      originality: firstStr(
        row.uniquenessDetail,
        row.detailOriginality,
        row.detail_originality,
        row.detailLogicOriginality,
        nested.originality,
        nested.detailOriginality
      ),
      pronunciationLanguage: firstStr(
        row.pronunciationDetail,
        row.detailPronunciationLanguage,
        row.detail_pronunciation_language,
        row.detailLogicPronunciation,
        nested.pronunciationLanguage,
        nested.detailPronunciationLanguage
      ),
      legality: firstStr(
        row.legalDetail,
        row.detailLegality,
        row.detail_legality,
        row.detailLogicLegality,
        nested.legality,
        nested.detailLegality
      ),
    };
    return {
      name: String(row?.name ?? "").trim(),
      rationale: firstStr(row?.rationale, row?.description),
      hierarchyScore: h,
      originalityDimensionScore: o,
      pronunciationScore: pr,
      legalityScore: leg,
      proposalDetailLogic: detail
    };
  };

  const fromNames = Array.isArray(p.names) ? (p.names as Array<Record<string, unknown>>) : [];
  const fromNp = Array.isArray(p.namingProposals) ? (p.namingProposals as Array<Record<string, unknown>>) : [];
  const proposalSource = fromNames.length > 0 ? fromNames : fromNp;
  const namingProposalsRaw = proposalSource.map((row) => mapProposalRow(row));

  return {
    overallScore,
    hierarchyScore: hsNum,
    originalityDimensionScore: origNum,
    pronunciationScore: pronNum,
    pronunciationLanguageScore: pronNum,
    legalityScore: legNum,
    trademarkScore: tmLegacy,
    copyrightScore: crLegacy,
    detailLogic: {
      hierarchy: String(p.detailLogicHierarchy ?? ""),
      originality: String(p.detailLogicOriginality ?? ""),
      pronunciationLanguage: String(p.detailLogicPronunciation ?? ""),
      legality: String(p.detailLogicLegality ?? "")
    },
    hierarchy: {
      status: hs,
      message: String(p.hierarchyMessage ?? ""),
      details: String(p.hierarchyDetails ?? ""),
      checklist: checklist.length ? checklist : ["가이드라인 기준으로 검토됨"]
    },
    trademark: {
      risk: tr,
      conflicts,
      recommendation: String(p.trademarkRecommendation ?? "")
    },
    copyright: {
      originality: Math.min(100, Math.max(0, Number(p.copyrightOriginality) || 0)),
      risks,
      verdict: String(p.copyrightVerdict ?? "")
    },
    finalSummary: String(p.finalSummary ?? ""),
    goRecommendation: gr,
    suggestedNames: suggested,
    namingProposals: namingProposalsRaw,
    additionalNamingSuggestions,
    tierPackageEvaluation: parseTierPackageEvaluation(p),
    tierNamingAlternatives: parseTierNamingAlternatives(p)
  };
}

function mockBrandNamingNoKey(
  mode: "generate" | "audit",
  tierPlan?: { stepCount: number; labels: string[] } | null
): BrandNamingGeminiResult {
  const genProposal = (i: number): BrandNamingProposalGemini => ({
    name: `예시 네이밍 ${i}`,
    rationale:
      "GEMINI_API_KEY가 없어 실제 추론 대신 자리 표시입니다. 키를 설정하면 가이드라인·요청·참고자료를 반영한 근거가 채워집니다.",
    hierarchyScore: 65,
    originalityDimensionScore: 60,
    pronunciationScore: 70,
    legalityScore: 68,
    proposalDetailLogic: {
      hierarchy: "API 키 미설정 자리 표시입니다.",
      originality: "API 키 미설정 자리 표시입니다.",
      pronunciationLanguage: "API 키 미설정 자리 표시입니다.",
      legality: "API 키 미설정 자리 표시입니다."
    }
  });

  if (mode === "generate" && tierPlan) {
    const n = Math.min(6, Math.max(1, tierPlan.stepCount || 3));
    const labels: string[] = [];
    for (let i = 0; i < n; i++) {
      labels.push((tierPlan.labels[i] ?? "").trim() || `단계 ${i + 1}`);
    }
    const tierNamingAlternatives: TierNamingAlternativeGemini[] = [1, 2, 3, 4].map((alt) => {
      const tierSteps = labels.map((lb, ti) => ({
        tierLabel: lb,
        name: `예시${alt}·${ti + 1}단계`,
        rationale: "GEMINI_API_KEY 미설정 자리 표시입니다."
      }));
      return {
        storyline: `예시 세계관·스토리라인 ${alt}(API 키 없음). ${n}단계 네이밍은 이 서사에서 파생된다고 가정합니다.`,
        tierSteps,
        tierPackageEvaluation: {
          hierarchyScore: 65,
          legalityScore: 64,
          originalityDimensionScore: 60,
          pronunciationScore: 70,
          proposalDetailLogic: {
            hierarchy: "API 키 미설정 자리 표시입니다.",
            originality:
              "창의성(예시): 위 스토리라인과 각 단계 네이밍의 연결을 설명하는 자리입니다. 실제 생성 시 본문에 반영됩니다.",
            pronunciationLanguage: "API 키 미설정 자리 표시입니다.",
            legality: "API 키 미설정 자리 표시입니다."
          }
        }
      };
    });
    const namingProposals = tierNamingAlternatives.map((a, i) => ({
      name: `[대안 ${i + 1}] ${a.tierSteps.map((t) => t.name).join(" → ")}`,
      rationale: a.storyline,
      hierarchyScore: a.tierPackageEvaluation.hierarchyScore,
      legalityScore: a.tierPackageEvaluation.legalityScore,
      originalityDimensionScore: a.tierPackageEvaluation.originalityDimensionScore,
      pronunciationScore: a.tierPackageEvaluation.pronunciationScore,
      proposalDetailLogic: { ...a.tierPackageEvaluation.proposalDetailLogic }
    }));
    return {
      overallScore: 62,
      hierarchyScore: 65,
      originalityDimensionScore: 58,
      pronunciationScore: 72,
      pronunciationLanguageScore: 72,
      legalityScore: 64,
      trademarkScore: 58,
      copyrightScore: 64,
      detailLogic: {
        hierarchy: "GEMINI_API_KEY가 없어 상세 논리는 자리 표시입니다.",
        originality: "API 키 설정 후 창의성 추론 근거가 채워집니다.",
        pronunciationLanguage: "API 키 설정 후 발음·언어 분석이 채워집니다.",
        legality: "API 키 설정 후 법령 연동 분석이 채워집니다."
      },
      hierarchy: {
        status: "warning",
        message: "GEMINI_API_KEY 없음",
        details:
          "루트 .env에 GEMINI_API_KEY를 설정하고 서버를 재시작하면 U+ 브랜드 가이드라인 PDF와 업로드·입력 자료를 반영한 분석이 실행됩니다.",
        checklist: ["API 키 설정 필요", "가이드 PDF: data/guidelines/U+ 브랜드 가이드라인"]
      },
      trademark: {
        risk: "medium",
        conflicts: [],
        recommendation: "API 키 설정 후 상표 유사도 분석이 가능합니다."
      },
      copyright: {
        originality: 60,
        risks: [{ type: "설정", severity: "low", description: "API 키 미설정으로 모의 결과입니다." }],
        verdict: "실제 분석을 위해 GEMINI_API_KEY가 필요합니다."
      },
      finalSummary:
        "API 키가 없어 네이밍 후보를 생성하지 못했습니다. 키를 설정한 뒤 다시 시도하세요.",
      goRecommendation: "no-go",
      suggestedNames: namingProposals.map((p) => p.name),
      namingProposals,
      tierNamingAlternatives,
      additionalNamingSuggestions: []
    };
  }

  return {
    overallScore: 62,
    hierarchyScore: 65,
    originalityDimensionScore: 58,
    pronunciationScore: 72,
    pronunciationLanguageScore: 72,
    legalityScore: 64,
    trademarkScore: 58,
    copyrightScore: 64,
    detailLogic: {
      hierarchy: "GEMINI_API_KEY가 없어 상세 논리는 자리 표시입니다.",
      originality: "API 키 설정 후 창의성 추론 근거가 채워집니다.",
      pronunciationLanguage: "API 키 설정 후 발음·언어 분석이 채워집니다.",
      legality: "API 키 설정 후 법령 연동 분석이 채워집니다."
    },
    hierarchy: {
      status: "warning",
      message: "GEMINI_API_KEY 없음",
      details:
        "루트 .env에 GEMINI_API_KEY를 설정하고 서버를 재시작하면 U+ 브랜드 가이드라인 PDF와 업로드·입력 자료를 반영한 분석이 실행됩니다.",
      checklist: ["API 키 설정 필요", "가이드 PDF: data/guidelines/U+ 브랜드 가이드라인"]
    },
    trademark: {
      risk: "medium",
      conflicts: [],
      recommendation: "API 키 설정 후 상표 유사도 분석이 가능합니다."
    },
    copyright: {
      originality: 60,
      risks: [{ type: "설정", severity: "low", description: "API 키 미설정으로 모의 결과입니다." }],
      verdict: "실제 분석을 위해 GEMINI_API_KEY가 필요합니다."
    },
    finalSummary:
      mode === "generate"
        ? "API 키가 없어 네이밍 후보를 생성하지 못했습니다. 키를 설정한 뒤 다시 시도하세요."
        : "API 키가 없어 검수를 수행하지 못했습니다.",
    goRecommendation: "no-go",
    suggestedNames: mode === "generate" ? [1, 2, 3, 4].map((n) => `예시 네이밍 ${n}`) : [],
    namingProposals: mode === "generate" ? [1, 2, 3, 4].map((i) => genProposal(i)) : [],
    /** 검수 NO-GO 시에도 UI·연동 일관성을 위해 대체안 예시(키 설정 시에는 실제 보조 생성으로 대체됨) */
    additionalNamingSuggestions:
      mode === "audit" ? ["루미넌트", "에버그레인", "넥스트웨이브"] : []
  };
}

function finalizeNamingResult(
  mode: "generate" | "audit",
  r: BrandNamingGeminiResult,
  opts?: {
    requestText?: string;
    generateProposalCount?: number;
    tieredPackage?: boolean;
    tierStepCount?: number;
    tierLabels?: string[];
  }
): BrandNamingGeminiResult {
  const reqCtx = (opts?.requestText ?? "").trim();
  if (mode === "audit") {
    const overallScore = weightedAuditOverall(
      r.hierarchyScore,
      r.originalityDimensionScore,
      r.pronunciationLanguageScore,
      r.legalityScore
    );
    const additionalNamingSuggestions = Array.isArray(r.additionalNamingSuggestions)
      ? r.additionalNamingSuggestions.map((x) => String(x).trim()).filter(Boolean).slice(0, 3)
      : [];
    const pronunciationLanguage = ensureAuditPronunciationDetail(r.detailLogic.pronunciationLanguage, reqCtx);
    return {
      ...r,
      overallScore,
      namingProposals: [],
      suggestedNames: [],
      additionalNamingSuggestions,
      detailLogic: {
        ...r.detailLogic,
        pronunciationLanguage
      }
    };
  }

  /** 생성 전용: 상위 응답에 포함된 검수형 필드는 UI·워크스페이스 혼동을 막기 위해 비움(후보별 proposal만 유효) */
  const emptyHierarchy = {
    status: "aligned" as const,
    message: "",
    details: "",
    checklist: [] as string[]
  };

  /** 단계별(요금제): 대안 4개 × (N단계 + 세계관 + 패키지 4축) */
  if (opts?.tieredPackage) {
    const nSteps = Math.min(6, Math.max(1, opts.tierStepCount ?? 3));
    const labels: string[] = [];
    const fromOpt = opts.tierLabels ?? [];
    for (let i = 0; i < nSteps; i++) {
      labels.push((fromOpt[i] ?? "").trim() || `단계 ${i + 1}`);
    }

    let alts: TierNamingAlternativeGemini[] = Array.isArray(r.tierNamingAlternatives)
      ? [...r.tierNamingAlternatives]
      : [];

    const rawProps = (r.namingProposals ?? []).filter((p) => p.name.trim().length > 0);
    if (alts.length === 0 && r.tierPackageEvaluation && rawProps.length === nSteps) {
      alts = [
        {
          storyline:
            "(이전 단일 패키지 응답 형식이었습니다. 네 가지 서로 다른 세계관·대안을 얻으려면 재생성해 주세요.)",
          tierSteps: rawProps.map((p, i) => ({
            tierLabel: labels[i] ?? `단계 ${i + 1}`,
            name: p.name,
            rationale: p.rationale || ""
          })),
          tierPackageEvaluation: r.tierPackageEvaluation
        }
      ];
    }

    while (alts.length < 4) {
      alts.push(synthesizeTierAlternativePlaceholder(alts.length + 1, nSteps, labels));
    }
    alts = alts
      .slice(0, 4)
      .map((alt, i) => normalizeTierAlternativeShape(alt, nSteps, labels, i + 1));

    const proposals = alts.map((alt, i) => ({
      name: `[대안 ${i + 1}] ${alt.tierSteps.map((t) => t.name).join(" → ")}`,
      rationale: alt.storyline,
      hierarchyScore: alt.tierPackageEvaluation.hierarchyScore,
      legalityScore: alt.tierPackageEvaluation.legalityScore,
      originalityDimensionScore: alt.tierPackageEvaluation.originalityDimensionScore,
      pronunciationScore: alt.tierPackageEvaluation.pronunciationScore,
      proposalDetailLogic: { ...alt.tierPackageEvaluation.proposalDetailLogic }
    }));

    const overallScore = Math.round(
      alts.reduce((s, a) => s + weightedTierPackageOverall(a.tierPackageEvaluation), 0) / 4
    );

    return {
      ...r,
      overallScore,
      hierarchyScore: 0,
      originalityDimensionScore: 0,
      pronunciationScore: 0,
      pronunciationLanguageScore: 0,
      legalityScore: 0,
      trademarkScore: 0,
      copyrightScore: 0,
      detailLogic: {
        hierarchy: "",
        originality: "",
        pronunciationLanguage: "",
        legality: ""
      },
      hierarchy: emptyHierarchy,
      trademark: { risk: "low" as const, conflicts: [], recommendation: "" },
      copyright: { originality: 0, risks: [], verdict: "" },
      finalSummary: "",
      goRecommendation: "go",
      namingProposals: proposals,
      suggestedNames: proposals.map((p) => p.name),
      additionalNamingSuggestions: [],
      tierNamingAlternatives: alts,
      tierPackageEvaluation: undefined
    };
  }

  const expected =
    typeof opts?.generateProposalCount === "number" && opts.generateProposalCount >= 1
      ? Math.min(6, Math.max(1, Math.floor(opts.generateProposalCount)))
      : 4;
  let proposals = (r.namingProposals ?? []).filter((p) => p.name.trim().length > 0);
  const filler = (idx: number): BrandNamingProposalGemini => ({
    name: `보완 후보 ${idx}`,
    rationale:
      "모델 응답에서 항목 수가 부족해 자리를 채웠습니다. 동일 요청으로 다시 생성해 보세요.",
    hierarchyScore: 50,
    originalityDimensionScore: 50,
    pronunciationScore: 50,
    legalityScore: 50,
    proposalDetailLogic: {
      hierarchy: "자동 보완 항목입니다.",
      originality: "자동 보완 항목입니다.",
      pronunciationLanguage: "자동 보완 항목입니다.",
      legality: "자동 보완 항목입니다."
    }
  });
  while (proposals.length < expected) {
    proposals.push(filler(proposals.length + 1));
  }
  proposals = proposals.slice(0, expected);
  const names = proposals.map((p) => p.name);

  return {
    ...r,
    overallScore: 0,
    hierarchyScore: 0,
    originalityDimensionScore: 0,
    pronunciationScore: 0,
    pronunciationLanguageScore: 0,
    legalityScore: 0,
    trademarkScore: 0,
    copyrightScore: 0,
    detailLogic: {
      hierarchy: "",
      originality: "",
      pronunciationLanguage: "",
      legality: ""
    },
    hierarchy: emptyHierarchy,
    trademark: { risk: "low" as const, conflicts: [], recommendation: "" },
    copyright: { originality: 0, risks: [], verdict: "" },
    finalSummary: "",
    goRecommendation: "go",
    namingProposals: proposals,
    suggestedNames: names,
    additionalNamingSuggestions: [],
    tierPackageEvaluation: undefined,
    tierNamingAlternatives: undefined
  };
}

export async function runBrandNamingWithGemini(opts: {
  mode: "generate" | "audit";
  requestText: string;
  referenceNotes: string;
  guidelineBlock: string;
  /** 검수: 클라이언트가 보낸 auditCategory 전문 — Gemini 전용 지시(`namingCategoryGeminiDirectives`)와 결합 */
  auditCategoryRaw?: string;
  /** 생성: 일반(4안) vs 단계별 요금제 N안(1~6) */
  generatePlan?: { kind: "general" } | { kind: "tiered"; stepCount: number; labels: string[] };
}): Promise<BrandNamingGeminiResult> {
  const req = opts.requestText.trim();
  const tierPlan = opts.generatePlan?.kind === "tiered" ? opts.generatePlan : null;
  const stepCountForTier = tierPlan ? Math.min(6, Math.max(1, tierPlan.stepCount || 3)) : 0;
  /** 생성: names/namingProposals 길이 — 일반 4안 / 단계별은 대안 패키지 요약 4개 */
  const genCount = opts.mode === "generate" ? 4 : 4;
  const genProposalFinalizeCount = opts.mode === "generate" ? 4 : undefined;
  const finalizeOpts = {
    requestText: req,
    generateProposalCount: genProposalFinalizeCount,
    tieredPackage: Boolean(tierPlan),
    tierStepCount: tierPlan?.stepCount,
    tierLabels: tierPlan?.labels
  };

  const key = getKey();
  if (!key) {
    return finalizeNamingResult(opts.mode, mockBrandNamingNoKey(opts.mode, tierPlan), finalizeOpts);
  }

  const genAI = new GoogleGenerativeAI(key);
  const guide = opts.guidelineBlock.slice(0, 75_000);
  const notes = opts.referenceNotes.trim() || "(없음)";

  const auditCategoryPromptSection = opts.auditCategoryRaw?.trim()
    ? buildAuditCategoryGeminiPromptSection(opts.auditCategoryRaw.trim())
    : "";

  /** 단계별 생성: Personal·Enterprise 등에 따른 스토리라인 톤 전용 지시 */
  const tierStorylineToneBlock =
    opts.mode === "generate" && tierPlan ? buildTierStorylineToneBlock(opts.auditCategoryRaw?.trim() ?? "") : "";

  const finishWithAuditNoGoFill = async (base: BrandNamingGeminiResult): Promise<BrandNamingGeminiResult> => {
    const r = finalizeNamingResult(opts.mode, base, finalizeOpts);
    if (opts.mode === "audit") {
      return ensureAuditNoGoHasAdditionalSuggestions(r, genAI, {
        requestText: opts.requestText,
        guidelineBlock: opts.guidelineBlock,
        referenceNotes: opts.referenceNotes,
        auditCategoryRaw: opts.auditCategoryRaw
      });
    }
    return r;
  };

  const modeIntro =
    opts.mode === "generate"
      ? tierPlan
        ? `작업 유형: **생성 (단계별·요금제 라인업)**.
- **필수 — tierNamingAlternatives**: 배열 길이 **정확히 4**. 각 원소 = **서로 다른 대안 패키지 1개**(서로 다른 세계관·스토리라인).
  - **storyline**: 이 대안에서 ${stepCountForTier}개 단계 네이밍이 **공유하는 하나의 세계관·스토리라인**(한국어 3~6문장). 모든 단계 이름이 이 서사에서 **일관되게 파생**되도록 서술(기본 전제). 아래 **【세계관·스토리라인 톤】** 블록을 **반드시** 따를 것.
${tierStorylineToneBlock ? `\n${tierStorylineToneBlock}\n` : ""}
  - **tierSteps**: 길이 **정확히 ${stepCountForTier}**, 순서는 [요청 내용] **[단계별 생성]** 단계 라벨과 동일. 각 원소: tierLabel, name, rationale.
  - **tierPackageEvaluation**: 이 대안 패키지 전체에 대한 통합 4축(0~100) 및 hierarchyDetail·legalityDetail·originalityDetail·pronunciationDetail(각 한국어 3줄 이상). **창의성(originalityDetail)**에는 반드시 **storyline과 각 단계 name의 연결**을 구체적으로 서술. Enterprise 선택 시 스토리라인의 **진중함·무게감**이 평가 근거에도 반영되도록 서술하고, Personal 선택 시 **커머셜·일상 맥락**과의 연결을 드러낼 것.
- **names**·**namingProposals**·**suggestedNames**: 각각 **정확히 4**. i번째 항목은 **tierNamingAlternatives[i]의 요약 행**(name은 대안 식별 제목, description/rationale은 storyline 요약 또는 동일 복제). 후보별 점수·Detail은 **tierNamingAlternatives[i].tierPackageEvaluation**과 **일치**시킬 것.
- 루트 **tierPackageEvaluation**은 **쓰지 말 것**(레거시 단일 패키지용). 일반 생성과 혼동 금지.
- **additionalNamingSuggestions**: [].
- **적법성·발음** 등은 각 대안의 **tierPackageEvaluation**에 반영. [참고 정보]에 국가법령정보가 있으면 적법성 근거에 인용.
- 아래 [종합 검토 필드]는 생성 맥락 요약으로 채웁니다.${
            auditCategoryPromptSection
              ? `\n- **브랜드 계층 컨텍스트**: 아래 **[브랜드 계층 컨텍스트]** 블록이 있으면 4개 대안 패키지를 만들 때 **반드시** 그 계층·접두·독립 작명 룰을 따를 것.`
              : ""
          }`
        : `작업 유형: **생성 (일반 4안)**.
- **고정 응답 형식(반드시 준수)**: 루트에 **names** 배열과 **namingProposals** 배열을 **각각 정확히 ${genCount}개**로 채웁니다. 두 배열의 ${genCount}개 항목은 **동일한 네이밍·동일 순서**이며, 각 원소는 아래 키를 **모두** 채웁니다(빈 문자열·생략 금지):
  \`name\`, \`description\` (네이밍 설명·창작 근거, 한국어 3문장 이상),
  \`hierarchyScore\`, \`hierarchyDetail\` (브랜드 계층 평가 상세, **한국어 3줄 이상**),
  \`uniquenessScore\`, \`uniquenessDetail\` (창의성 상세, **3줄 이상** — 가이드·요청·참고 정보만으로 유사·식별력 관점을 **Gemini 추론**으로 서술. 외부 상표 DB·연동 여부는 **언급하지 말 것**),
  \`pronunciationScore\`, \`pronunciationDetail\` (발음·언어 상세, **3줄 이상**),
  \`legalScore\`, \`legalDetail\` (적법성 상세, **3줄 이상**).
- **namingProposals**의 각 원소에도 위와 동일한 값을 넣되, 스키마상 **description** 필드는 **반드시** 채우고, **rationale**이 있으면 **description과 동일 문자열**로 맞추어도 됩니다.
- **tierNamingAlternatives**는 일반 생성에서 **빈 배열 []**.
- **적법성(legalScore·legalDetail)**: [참고 정보]에 **국가법령정보센터 법령 검색** 결과가 있으면 **반드시 인용·요약**하고, 상표법·표시광고법 위반 가능성·일반명칭·저작권 이슈를 기준으로 **반드시** 평가합니다. **0점은 정보가 없어 평가 자체가 불가능할 때만** 사용합니다. **평가가 가능하면 반드시 10점 이상** 부여하고, 그 근거를 **legalDetail**에 3줄 이상 서술합니다.
- 네 점수의 가중 해석은 검수와 동일(계층 40%·독창 30%·발음·언어 20%·적법 10%)입니다. 루트 **pronunciationLanguageScore**는 **pronunciationScore와 동일 정수**로 맞출 것.
- **발음·언어**: ${genCount}개 후보 각각에 대해 한국어·영어 호명 용이성·외국어 부정 연상 등을 반영해 후보별 점수·Detail을 채웁니다.
- **suggestedNames**는 **names** 또는 **namingProposals**의 **name**과 같은 순서·같은 ${genCount}개 문자열 배열.
- **additionalNamingSuggestions**는 생성 모드에서 **반드시 빈 배열 []**.
- 아래 [종합 검토 필드](overallScore, hierarchy, trademark, copyright 등)는 생성 맥락 요약으로 채웁니다.${
            auditCategoryPromptSection
              ? `\n- **브랜드 계층 컨텍스트**: 아래 **[브랜드 계층 컨텍스트]** 블록이 있으면 ${genCount}개 네이밍 제안을 만들 때 **반드시** 그 계층·접두·독립 작명 룰을 따를 것. 룰과 충돌하는 상위 브랜드 접두를 임의로 붙이지 말 것.`
              : ""
          }`
      : `작업 유형: **검수**. [요청 내용]의 네이밍·슬로건을 아래 **4개 항목**으로 채점합니다. 각 항목은 0~100점입니다. **종합 overallScore는 서버에서 창의성(originalityDimensionScore)·직관성(pronunciationScore)만 각 50%로 재계산**합니다. **브랜드 계층 정렬·적법성 점수는 종합 가중합에 들어가지 않으며**, 70점 미만이면 해당 항목은 Fail로 간주되어 NO-GO 조건에 쓰입니다.
- **(1) hierarchyScore 브랜드 계층 정렬** — 오직 [U+ 브랜드 가이드라인 및 참고 문맥] 안의 **가이드라인 PDF 요약** + [참고 정보]의 **업로드 파일 요약** + **참고 정보 직접 입력**만 근거로 분석·채점. 법령 검색 블록은 이 항목에 **넣지 마세요**. (종합 %에 미포함, Pass/Fail 판정용)
- **(2) originalityDimensionScore 창의성** — **오직 Gemini 추론**으로 가이드·요청·참고 정보를 바탕으로 유사·식별력 관점에서 채점. **외부 데이터베이스 연동·조회 여부는 결과에 절대 언급하지 말 것.** trademarkConflicts는 분석 보조용 추론 결과로만 채움. (**종합의 50%**)
- **(3) pronunciationScore / pronunciationLanguageScore 직관성(발음·언어)** — 검수 대상 네이밍·슬로건에 대해 (가) 한국어·영어로 읽을 때 **발음의 자연스러움·호명 용이성** (나) 주요 외국어에서 **부정·비하·불쾌·금기 의미** 연상 여부를 평가하세요. **pronunciationLanguageScore**는 **pronunciationScore와 동일한 정수**로 맞추세요. **detailLogicPronunciation**에는 위 근거·보완·유의사항을 최소 수백 자 한국어로 서술. 녹음·발음기호 출력 불요. (**종합의 50%**)
- **(4) legalityScore 적법성** — 참고 정보에 **국가법령정보·법령 검색** 요약이 있으면 인용·출처를 밝히고 상표법·저작권법 관점 적법성·이슈 자유도를 채점. 없으면 일반론으로 보완. (종합 %에 미포함, Pass/Fail 판정용)
- **names**·**namingProposals**·**suggestedNames**는 모두 빈 배열 [].
- **additionalNamingSuggestions** (검수 필수): 위 평가 맥락(가이드·작명 의도·검토 결과)을 반영한 **대안 네이밍을 정확히 3개**, 배열로만 제시하세요. 검수명·슬로건과 **다른** 실제 후보명(한글·영문 등). 안내 문구·주석·※ 같은 비이름 문자열 금지. 빈 배열 금지.
- **detailLogicHierarchy** ~ **detailLogicLegality**: 각 항목에 대해 **상세 논리**를 한국어로 길게 서술. **detailLogicHierarchy**에는 외부 상표 DB·연동 출처를 **넣지 말 것**(가이드·업로드·직접입력만). **detailLogicOriginality**에는 외부 API 연동·조회 성공/실패를 **절대 넣지 말 것.** 적법성에서 국가법령정보 요약을 썼다면 **출처를 문장 안에 명시**할 수 있음. trademark·copyright 하위 필드는 요약·충돌 목록용으로 유지.${
        auditCategoryPromptSection
          ? "\n- **브랜드 계층 컨텍스트 우선**: 아래 **[브랜드 계층 컨텍스트]** 블록이 있으면 계층 정렬·마스터브랜드(U+) 해석에 그 룰을 가이드 PDF 요약과 함께 적용하고, 룰·마지막 불릿이 허용하는 독립 네이밍은 **U+ 미포함만으로** 위반·감점·NO-GO로 연결하지 말 것."
          : ""
      }`;

  const generateExtraRule =
    opts.mode === "generate"
      ? tierPlan
        ? `\n5) **tierNamingAlternatives** 길이는 반드시 **4**입니다.\n6) 각 대안의 **tierSteps** 길이는 **${stepCountForTier}**입니다.\n7) 각 **tierPackageEvaluation**의 네 Detail은 **한국어 3줄 이상**.\n8) **names·namingProposals·suggestedNames** 길이는 각각 **4**(대안 패키지 요약).\n9) **additionalNamingSuggestions**는 [].\n10) 루트 **tierPackageEvaluation**은 출력하지 마세요.`
        : `\n5) **names**·**namingProposals** 길이는 각각 반드시 ${genCount}입니다.\n6) 각 후보의 hierarchyDetail·uniquenessDetail·pronunciationDetail·legalDetail은 **한국어 3줄 이상**으로 반드시 채웁니다.\n7) **additionalNamingSuggestions**는 반드시 빈 배열 [].\n8) **tierNamingAlternatives**는 빈 배열 [].`
      : "";

  const jsonOnlyFooter = "\n\n반드시 JSON 형식으로만 응답하고 다른 텍스트는 포함하지 마세요.";

  const namingGenerationRuleSection =
    opts.mode === "generate"
      ? buildNamingGenerationRuleBlockFromAuditRaw(opts.auditCategoryRaw?.trim() ?? "")
      : "";

  const prompt = `역할: 브랜드 네이밍 전략가이자 지식재산 검토 보조입니다.
${modeIntro}${
    namingGenerationRuleSection
      ? `\n\n【네이밍 생성 규칙 — 선택 카테고리】\n${namingGenerationRuleSection}\n`
      : ""
  }

[U+ 브랜드 가이드라인 및 참고 문맥]
${guide}

${auditCategoryPromptSection ? `${auditCategoryPromptSection}\n\n` : ""}[사용자가 추가로 입력한 참고 정보·업로드 요약 등]
${notes}

[요청 내용 — 반드시 이 텍스트를 분석의 중심에 둘 것]
${req}

규칙:
1) 점수는 0~100 정수. 검수 시 **hierarchyScore, originalityDimensionScore, pronunciationScore, pronunciationLanguageScore(=pronunciationScore와 동일), legalityScore**를 채우고, trademarkScore·copyrightScore는 레거시 호환용으로 네 점수와 맞게 채웁니다.
2) 상표법·저작권은 **참고 수준**이며 법률 자문이 아님.
3) 국가법령정보 블록이 있으면 **적법성** 항목 서술에 반영할 수 있습니다. **창의성**은 국가법령정보와 무관하게 가이드·요청·Gemini 추론만으로 서술합니다. 창의성 보완은 trademarkConflicts 등 **추론 결과**로만 합니다.
4) 출력은 JSON 한 개만. 스키마 키 이름을 정확히 맞추세요.${generateExtraRule}${jsonOnlyFooter}`;

  let lastErr: unknown;
  for (const modelId of textModelCandidates()) {
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: brandNamingResponseSchema
      }
    });
    try {
      const result = await model.generateContent(prompt);
      const raw = result.response.text();
      console.log("[gemini] brand naming raw response:", raw);
      const parsed = parseBrandNamingPayload(raw);
      if (parsed) return finishWithAuditNoGoFill(parsed);
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(`[gemini] brand naming model=${modelId} → 다음 모델 시도`, e instanceof Error ? e.message : e);
        continue;
      }
      throw e;
    }
    try {
      const modelPlain = genAI.getGenerativeModel({ model: modelId });
      const result = await modelPlain.generateContent(
        `${prompt}\n\n응답: 위 필드를 모두 포함한 JSON만 출력하세요.`
      );
      const rawPlain = result.response.text();
      console.log("[gemini] brand naming raw response (plain):", rawPlain);
      const parsed = parseBrandNamingPayload(rawPlain);
      if (parsed) return finishWithAuditNoGoFill(parsed);
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) continue;
      throw e;
    }
  }

  const errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  const failBase = mockBrandNamingNoKey(opts.mode, tierPlan);
  return finishWithAuditNoGoFill({
    ...failBase,
    overallScore: 55,
    hierarchy: {
      ...failBase.hierarchy,
      message: "분석 실패",
      details: errMsg.slice(0, 800)
    },
    finalSummary: `Gemini 호출 실패: ${errMsg.slice(0, 400)}`
  });
}
