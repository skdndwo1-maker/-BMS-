import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";

import {
  getKey,
  rethrowIfInvalidApiKey,
  shouldTryNextTextModel,
  textModelCandidates,
} from "./shared.js";
import { generateImageFromTextPrompt, generateRevisedBrandingImage, generateImageDevelopFromReference } from "./inspection.js";

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

/** 영역 1: VI 가이드 기반 이미지·에셋 생성 — 역할·CoT (프롬프트 텍스트 전용) */
const VI_VISUAL_ROLE_INTRO = `당신은 LG U+의 UX/UI 디자이저이자 시각디자인 교수입니다.
브랜드 VI 원칙을 정확히 이해하고 있습니다.`;

const VI_VISUAL_COT_BLOCK = `[생성 절차 — Chain-of-Thought]
1) 아래 [참조 샘플·스타일 가이드]와 [참조 VI 가이드라인]을 보고, 샘플들이 공통으로 따르는 조형 원칙(라인 두께, 여백, 기하학적 단순화 정도, 2D/3D 표현 방식 등)을 **먼저 언어로 요약**하라.
2) 그 원칙이 VI 가이드라인(2D/3D, 아이콘, 픽토그램 각각의 규정)과 **일치하는지 확인**하라.
3) 위 분석을 바탕으로 요청받은 새 에셋을 생성하라.`;

/** 영역 2: Simply Guide 기반 카피 — 역할·CoT (프롬프트 텍스트 전용) */
const SIMPLY_COPY_ROLE_INTRO = `당신은 LG U+의 카피라이터이자 브랜드 커뮤니케이션 전문가입니다.
Simply Guide의 어법과 톤앤매너를 정확히 이해하고 있습니다.`;

const SIMPLY_COPY_COT_BLOCK = `[작성 절차 — Chain-of-Thought]
1) 작성 대상 슬롯이 **타이틀(메인·부제) / 본문 / 유의사항(하단 고지)** 중 어디에 해당하는지 확인하라.
2) 해당 카테고리의 **Simply Guide 어법·톤 규칙**을 [참조 가이드라인]과 [Simply Guide 문구 예시]에서 확인하라.
3) 그 규칙에 맞춰 문구를 제안하라.`;

const SIMPLY_FEW_SHOT_INSTRUCTION = `[Few-shot — Simply Guide 문구 예시]
[참조 가이드라인] 안의 Simply U+ 발췌·RAG 구절에서 타이틀·본문·유의사항에 해당하는 **실제 예시 문구**를 카테고리별로 골라 참고하라. 예시가 부족하면 Simply Guide의 간결·고객 중심·명료한 어법만 적용하라.`;

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

  const basePrompt = `역할: LG U+ B2C Brand Guidelines(Jason)를 준수하는 시니어 디자인 QA입니다.

작업:
1) 첨부 이미지는 브랜드 제작 에디터의 캔버스 화면 캡처입니다.
2) 아래 [캔버스 텍스트/설정 JSON]과 이미지가 일치한다고 가정하고, **Jason B2C Brand Guidelines PDF** 기준으로 로고·컬러·타이포·여백·톤·레이아웃을 평가하세요.
3) 텍스트 수정이 필요하면 간결·고객 친화 톤으로 proposed* 필드에 한국어 문안을 제안하세요. 변경이 필요 없으면 해당 필드는 빈 문자열("")입니다.
4) 이미지/일러스트가 부적절하면 fixKind=image, imageReplacementBrief에 교체 방향을 구체적으로 적으세요.
5) 배치·그리드·여백 문제는 fixKind=layout, layoutReset을 poster_defaults(포스터형 템플릿) 또는 clear_text_overrides(사용자 임의 폰트크기 초기화) 등으로 제안하세요.
6) violations는 실제 개선점만 나열하고, fixKind를 반드시 채우세요.

템플릿: ${opts.templateLabel}
${opts.creativeTopic?.trim() ? `\n[제작 주제·의도]\n${opts.creativeTopic.trim()}\n` : ""}
[참조 가이드라인 — Jason B2C Brand Guidelines PDF]
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
  const viNotes = `${VI_VISUAL_ROLE_INTRO}

${VI_VISUAL_COT_BLOCK}

${topicBlock}[이미지 교체 우선]
${opts.imageBrief}`;
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
    userNotes: viNotes
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

  const prompt = `${SIMPLY_COPY_ROLE_INTRO}

${SIMPLY_COPY_COT_BLOCK}

${SIMPLY_FEW_SHOT_INSTRUCTION}

작업:
1) 아래 [캔버스 JSON]의 목적·톤·메시지 방향을 파악하세요.
2) **카피·어법·톤**은 Simply Guide를 최우선으로, B2C Brand Guidelines(Jason)는 브랜드 금지·표기 등 보조 규정으로만 참고하세요.
3) 요청된 슬롯만 채우고, 요청되지 않은 필드는 반드시 빈 문자열 "" 입니다.
${slotHelp}
4) JSON만 출력합니다.

템플릿: ${opts.templateLabel}
${opts.creativeTopic?.trim() ? `\n[제작 주제·의도]\n${opts.creativeTopic.trim()}\n` : ""}
[참조 가이드라인 — Simply U+ (주) + Jason B2C (보조)]
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

  const viPdfFirst = `[B2C Brand Guidelines PDF (Jason) — 절대 우선]
프롬프트의 [참조 가이드라인 및 검수 맥락] 블록은 Jason For Parsing PDF에서 추출한 필수 근거입니다. 색상·로고·타이포·여백·톤·금지 사항 등은 PDF와 아래 규칙이 충돌할 경우 **항상 PDF를 따르세요**.`;

  const typographyRules = `[디자인 에디터 텍스트 교정 규칙 — PDF 다음 우선순위]
첨부 캔버스 이미지의 한국어 카피를 손볼 때(문구·줄 수·상대 크기), Jason B2C PDF 요구를 만족하는 범위에서 반드시:
1) **메인 타이틀**: 상대 글자 크기를 **150% 스케일(기준 대비 1.5배 느낌)**로 잡고, **줄 수는 2줄을 절대 넘기지 않음**. 장황한 표현은 줄이고 간결한 문구로 교정.
2) **부제1(첫 번째 부제)**: **현재와 비슷한 글자 크기 관계**를 유지하되, **1줄을 넘기지 않음**(자동 줄바꿈 없이 한 줄). 길면 의미를 유지하며 축약.
3) **본문(주 본문 블록)**: **기본형(100%) 대비 약 60% 크기**로 작고 단정하게 보이게 하고, **줄 수는 2줄을 넘기지 않음**. 핵심만 남기도록 다듬음.

레이아웃·비율·이미지 구도는 원본 의도를 해치지 않되, 위 텍스트 규칙과 Jason B2C PDF를 동시에 만족하는 **단일 교정 이미지**를 출력하세요.`;

  const modeNotes =
    opts.mode === "holistic"
      ? `[디자인 교정 모드 — 전체]\n캔버스 전체를 Jason B2C Brand Guidelines에 맞게 시각적으로 다듬은 단일 이미지를 생성하세요.`
      : `[디자인 교정 모드 — 검수 반영]\n아래 검수 지적을 우선 반영하여 수정 이미지를 생성하세요.`;

  const notes = `${VI_VISUAL_ROLE_INTRO}

${VI_VISUAL_COT_BLOCK}

${viPdfFirst}

${typographyRules}

${topicBlock}${modeNotes}`;

  return generateRevisedBrandingImage({
    designBase64: opts.designBase64,
    designMime: opts.designMime,
    guidelineContext: opts.guidelineContext,
    overallSummary: opts.overallSummary ?? "디자인 에디터 교정 요청",
    violations: viols,
    userNotes: notes,
    viGuidelineTakesPrecedence: true
  });
}

const assetGenerationSchema = {
  type: SchemaType.OBJECT,
  description: "브랜드 에디터용 SVG 일러스트/픽토그램 3종 대안",
  properties: {
    alternatives: {
      type: SchemaType.ARRAY,
      description: "서로 다른 구도·오브젝트의 대안 3개",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, description: "짧은 한국어 이름" },
          svg: { type: SchemaType.STRING, description: "단일 루트 svg 요소 전체 문자열" },
        },
        required: ["name", "svg"],
      },
    },
  },
  required: ["alternatives"],
} as Schema;

function parseAssetAlternatives(raw: unknown): Array<{ name: string; svg: string }> {
  if (!raw || typeof raw !== "object") return [];
  const alts = (raw as { alternatives?: unknown }).alternatives;
  if (!Array.isArray(alts)) return [];
  const out: Array<{ name: string; svg: string }> = [];
  for (const item of alts) {
    if (!item || typeof item !== "object") continue;
    const name = typeof (item as { name?: unknown }).name === "string"
      ? (item as { name: string }).name.trim().slice(0, 40)
      : "";
    const svgRaw = typeof (item as { svg?: unknown }).svg === "string" ? (item as { svg: string }).svg : "";
    const svg = normalizeGeneratedSvg(svgRaw);
    if (name && svg) out.push({ name, svg });
  }
  return out;
}

function normalizeGeneratedSvg(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/<svg[\s\S]*<\/svg>/i);
  if (!match) return null;
  return match[0].replace(/\n/g, " ").trim();
}

export type DesignEditorAssetKind = "pictogram" | "illustration";
export type DesignEditorIllustrationStyle = "2d" | "3d";

/**
 * 디자인 에디터: 사용자 생성방향에 맞는 SVG 픽토그램·일러스트 생성
 */
export async function runDesignEditorAssetGeneration(opts: {
  assetKind: DesignEditorAssetKind;
  illustrationStyle?: DesignEditorIllustrationStyle;
  direction: string;
  templateLabel?: string;
  creativeTopic?: string;
  guidelineContext?: string;
}): Promise<{ alternatives: Array<{ name: string; svg: string }> } | null> {
  const key = getKey();
  const direction = opts.direction.trim();
  if (!key || !direction) return null;

  const styleBlock =
    opts.assetKind === "pictogram"
      ? `[픽토그램 스타일]
- viewBox="0 0 64 64"
- 단색 라인 아이콘, stroke-width 3~4, stroke-linecap round
- 주색 #1A1A1A, 포인트 #F43182
- 배경 없음, 텍스트·글자 금지, 단일 아이콘`
      : opts.illustrationStyle === "3d"
        ? `[3D 일러스트 스타일 — RCS 클레이모피즘]
- viewBox="0 0 240 240"
- 부드러운 3D 오브젝트(둥근 모서리, 매트 질감)
- 파스텔 흰/회/핑크(#F43182, #FF79B6), 필요 시 버건디 포인트
- 하단에 옅은 타원 그림자(opacity .06~.08)
- 텍스트·글자 금지`
        : `[2D 일러스트 스타일 — RCS 플랫]
- viewBox="0 0 240 240"
- 부드러운 파스텔(#FFF0F5, #FAD7E8, #E8D9F5) + 마젠타 포인트 #F43182
- 하단 옅은 타원 그림자, 단순 도형 조합
- 텍스트·글자 금지`;

  const genAI = new GoogleGenerativeAI(key);
  const prompt = `${VI_VISUAL_ROLE_INTRO}

${VI_VISUAL_COT_BLOCK}

[참조 샘플·스타일 가이드 — Few-shot]
아래 스타일 블록은 RCS·VI 기준 **참조 샘플**입니다. 생성 전에 이 샘플들의 공통 조형 원칙을 요약·검증한 뒤 적용하세요.
${styleBlock}

작업: 아래 [생성방향]에 맞는 ${opts.assetKind === "pictogram" ? "픽토그램" : "일러스트"} SVG **대안 3개**를 설계하세요.
각 대안은 같은 주제지만 구도·오브젝트 조합·포인트 색 배치가 서로 달라야 합니다.

규칙:
1) alternatives 배열에 정확히 3개 항목. 각 svg는 xmlns="http://www.w3.org/2000/svg" 포함 완전한 <svg>...</svg> 한 개.
2) id 충돌 방지를 위해 gradient/filter id는 대안마다 다른 짧은 접두 사용.
3) name은 2~12자 한국어(3D면 3D- 접두 가능)로 대안별 요약.
4) JSON만 출력: { "alternatives": [ { "name": "...", "svg": "..." }, ... ] }

템플릿: ${opts.templateLabel ?? "template"}
${opts.creativeTopic?.trim() ? `\n[제작 주제]\n${opts.creativeTopic.trim()}\n` : ""}
${opts.guidelineContext?.trim() ? `\n[참조 VI 가이드라인 — 색·스타일·톤 우선]\n${opts.guidelineContext.trim().slice(0, 10_000)}\n` : ""}
[생성방향]
${direction}`;

  let lastErr: unknown;
  for (const modelId of textModelCandidates()) {
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: assetGenerationSchema
      }
    });
    try {
      const raw = (await model.generateContent(prompt)).response.text();
      const parsed = JSON.parse(raw) as unknown;
      const alternatives = parseAssetAlternatives(parsed);
      if (alternatives.length >= 1) {
        return { alternatives: alternatives.slice(0, 3) };
      }
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) continue;
      throw e;
    }
  }
  console.warn("[gemini] asset generation failed", lastErr);
  return null;
}

const IMAGE_VARIANT_HINTS = [
  "와이드 구도, 넓은 여백, 주 피사체 좌측·중앙 배치",
  "클로즈업 구도, 선명한 포커스, 중앙 배치",
  "대각선·역동적 구도, 그라데이션·소프트 배경",
] as const;

const VALID_IMAGE_ASPECT_IDS = new Set(["4:3", "3:4", "16:9", "9:16", "5:5", "20:8"]);

/** 클라이언트 비율 ID → Gemini imageConfig.aspectRatio */
export function resolveGeminiImageAspectRatio(aspectRatioId: string | undefined): {
  geminiAspectRatio: string;
  promptLabel: string;
} {
  const id = aspectRatioId?.trim() ?? "16:9";
  switch (id) {
    case "4:3":
      return { geminiAspectRatio: "4:3", promptLabel: "4:3 (가로)" };
    case "3:4":
      return { geminiAspectRatio: "3:4", promptLabel: "3:4 (세로)" };
    case "16:9":
      return { geminiAspectRatio: "16:9", promptLabel: "16:9 (와이드)" };
    case "9:16":
      return { geminiAspectRatio: "9:16", promptLabel: "9:16 (세로 와이드)" };
    case "5:5":
      return { geminiAspectRatio: "1:1", promptLabel: "5:5 (정사각형)" };
    case "20:8":
      return { geminiAspectRatio: "21:9", promptLabel: "20:8 (울트라 와이드)" };
    default:
      return { geminiAspectRatio: "16:9", promptLabel: "16:9 (와이드)" };
  }
}

export function normalizeImageAspectRatioId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const id = raw.trim();
  return VALID_IMAGE_ASPECT_IDS.has(id) ? id : undefined;
}

/**
 * 디자인 에디터: 사용자 생성방향에 맞는 브랜드 마케팅 이미지 생성 (PNG/JPEG)
 */
export async function runDesignEditorImageGeneration(opts: {
  direction: string;
  templateLabel?: string;
  creativeTopic?: string;
  guidelineContext?: string;
  imageAspectRatio?: string;
}): Promise<{ alternatives: Array<{ name: string; mimeType: string; base64: string }> } | null> {
  const direction = opts.direction.trim();
  if (!direction || !getKey()) return null;

  const { geminiAspectRatio, promptLabel } = resolveGeminiImageAspectRatio(opts.imageAspectRatio);
  const alternatives: Array<{ name: string; mimeType: string; base64: string }> = [];

  for (let i = 0; i < IMAGE_VARIANT_HINTS.length; i++) {
    const variantHint = IMAGE_VARIANT_HINTS[i];
    const prompt = `${VI_VISUAL_ROLE_INTRO}

${VI_VISUAL_COT_BLOCK}

작업: 아래 [생성방향]에 맞는 **마케팅 이미지 1장**을 생성하세요. (대안 ${i + 1}/3 — ${variantHint})

[출력 비율 — 필수]
- 반드시 **${promptLabel}** 비율로 생성하세요. 다른 비율·크롭·여백 금지.

[브랜드 스타일]
- LG U+ 마젠타 포인트 #F43182, 파스텔 핑크·보라 보조
- 깔끔하고 현대적인 한국 통신·IT 브랜드 톤
- 과도한 텍스트·워터마크·로고 삽입 금지 (이미지는 비주얼만)
- 실사·일러스트 혼합 가능, 캠페인 배너·포스터에 어울리는 품질

템플릿: ${opts.templateLabel ?? "template"}
${opts.creativeTopic?.trim() ? `\n[제작 주제]\n${opts.creativeTopic.trim()}\n` : ""}
${opts.guidelineContext?.trim() ? `\n[참조 VI 가이드라인 — 색·구도·톤 우선]\n${opts.guidelineContext.trim().slice(0, 10_000)}\n` : ""}
[생성방향]
${direction}

[구도 가이드]
${variantHint}`;

    try {
      const result = await generateImageFromTextPrompt(prompt, { aspectRatio: geminiAspectRatio });
      if (result) {
        alternatives.push({
          name: `대안${i + 1}`,
          mimeType: result.mimeType,
          base64: result.base64,
        });
      }
    } catch (e) {
      console.warn(`[gemini] image generation variant ${i + 1} failed`, e);
    }
  }

  if (alternatives.length >= 1) {
    return { alternatives: alternatives.slice(0, 3) };
  }
  return null;
}

/** 디자인 에디터: 선택 이미지 + 추가 프롬프트로 디벨롭 */
export async function runDesignEditorImageDevelop(opts: {
  imageBase64: string;
  imageMime: string;
  developPrompt: string;
  templateLabel?: string;
  creativeTopic?: string;
}): Promise<{ mimeType: string; base64: string; caption: string } | null> {
  const developPrompt = `${VI_VISUAL_ROLE_INTRO}

${VI_VISUAL_COT_BLOCK}

[추가 디벨롭 요청]
${opts.developPrompt.trim()}`;
  return generateImageDevelopFromReference({ ...opts, developPrompt });
}

const normRectSchema = {
  type: SchemaType.OBJECT,
  description: "캔버스 대비 정규화 좌표 0~1",
  properties: {
    x: { type: SchemaType.NUMBER },
    y: { type: SchemaType.NUMBER },
    width: { type: SchemaType.NUMBER },
    height: { type: SchemaType.NUMBER },
  },
  required: ["x", "y", "width", "height"],
} as Schema;

const designDraftProposalSchema = {
  type: SchemaType.OBJECT,
  description: "디자인 에디터 캔버스 초안 제안",
  properties: {
    summary: { type: SchemaType.STRING, description: "한국어 2~4문장, 레이아웃·카피 의도" },
    logoOption: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["CI", "BI", "SLOGAN", "none"] as string[],
    },
    logoPosition: {
      type: SchemaType.STRING,
      format: "enum",
      enum: [
        "top-left",
        "top-center",
        "top-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ] as string[],
    },
    title: { type: SchemaType.STRING },
    subtitles: {
      type: SchemaType.ARRAY,
      description: "부제 0~3개",
      items: { type: SchemaType.STRING },
    },
    bodyBlocks: {
      type: SchemaType.ARRAY,
      description: "본문 1~3개",
      items: { type: SchemaType.STRING },
    },
    footer: { type: SchemaType.STRING, description: "하단 유의사항" },
    backgroundColor: { type: SchemaType.STRING, description: "hex 예 #FFFFFF" },
    titleColor: { type: SchemaType.STRING },
    bodyColor: { type: SchemaType.STRING },
    footerColor: { type: SchemaType.STRING },
    posterTitleAlign: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["left", "center", "right"] as string[],
    },
    posterBodyAlign: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["left", "center", "right"] as string[],
    },
    posterFooterAlign: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["left", "center", "right"] as string[],
    },
    titleRect: normRectSchema,
    subtitleRects: { type: SchemaType.ARRAY, items: normRectSchema },
    bodyRects: { type: SchemaType.ARRAY, items: normRectSchema },
    footerRect: normRectSchema,
    image: {
      type: SchemaType.OBJECT,
      properties: {
        include: { type: SchemaType.BOOLEAN },
        brief: { type: SchemaType.STRING, description: "이미지 생성 지시(한국어)" },
        rect: normRectSchema,
        opacity: { type: SchemaType.NUMBER, description: "0~100" },
      },
      required: ["include", "brief"],
    },
    asset: {
      type: SchemaType.OBJECT,
      properties: {
        include: { type: SchemaType.BOOLEAN },
        kind: {
          type: SchemaType.STRING,
          format: "enum",
          enum: ["pictogram", "illustration"] as string[],
        },
        illustrationStyle: {
          type: SchemaType.STRING,
          format: "enum",
          enum: ["2d", "3d"] as string[],
        },
        brief: { type: SchemaType.STRING },
        rect: normRectSchema,
      },
      required: ["include", "kind", "brief"],
    },
  },
  required: [
    "summary",
    "logoOption",
    "logoPosition",
    "title",
    "bodyBlocks",
    "footer",
    "posterTitleAlign",
    "posterBodyAlign",
    "posterFooterAlign",
    "titleRect",
    "footerRect",
    "image",
    "asset",
  ],
} as Schema;

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
    kind: DesignEditorAssetKind;
    illustrationStyle?: DesignEditorIllustrationStyle;
    brief: string;
    rect?: { x: number; y: number; width: number; height: number };
  };
};

function clampNorm(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

function parseNormRect(
  raw: unknown,
  fallback: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  return {
    x: clampNorm(r.x, fallback.x),
    y: clampNorm(r.y, fallback.y),
    width: Math.max(0.05, clampNorm(r.width, fallback.width)),
    height: Math.max(0.03, clampNorm(r.height, fallback.height)),
  };
}

function parseAlign(raw: unknown, fallback: "left" | "center" | "right"): "left" | "center" | "right" {
  const s = String(raw ?? fallback);
  return s === "center" || s === "right" ? s : "left";
}

function parseLogoOption(raw: unknown): DesignEditorDraftProposal["logoOption"] {
  const s = String(raw ?? "BI");
  if (s === "CI" || s === "SLOGAN" || s === "none") return s;
  return "BI";
}

function parseLogoPosition(raw: unknown): DesignEditorDraftProposal["logoPosition"] {
  const allowed = new Set([
    "top-left",
    "top-center",
    "top-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ]);
  const s = String(raw ?? "top-center");
  return allowed.has(s) ? (s as DesignEditorDraftProposal["logoPosition"]) : "top-center";
}

function parseDraftProposalPayload(raw: unknown): DesignEditorDraftProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string).trim() : "");
  const strArr = (k: string, max: number) => {
    const arr = p[k];
    if (!Array.isArray(arr)) return [] as string[];
    return arr
      .filter((x): x is string => typeof x === "string" && x.trim() !== "")
      .map((x) => x.trim())
      .slice(0, max);
  };

  const bodyBlocks = strArr("bodyBlocks", 3);
  if (!str("title") || bodyBlocks.length === 0) return null;

  const defaultTitle = { x: 0.08, y: 0.2, width: 0.84, height: 0.22 };
  const defaultBody = { x: 0.08, y: 0.44, width: 0.84, height: 0.34 };
  const defaultFooter = { x: 0.08, y: 0.86, width: 0.72, height: 0.07 };
  const defaultSub = { x: 0.08, y: 0.43, width: 0.84, height: 0.055 };
  const defaultImg = { x: 0.55, y: 0.12, width: 0.38, height: 0.42 };
  const defaultAsset = { x: 0.62, y: 0.48, width: 0.28, height: 0.28 };

  const subtitles = strArr("subtitles", 3);
  const subtitleRectsRaw = Array.isArray(p.subtitleRects) ? p.subtitleRects : [];
  const bodyRectsRaw = Array.isArray(p.bodyRects) ? p.bodyRects : [];

  const imageRaw = p.image && typeof p.image === "object" ? (p.image as Record<string, unknown>) : {};
  const assetRaw = p.asset && typeof p.asset === "object" ? (p.asset as Record<string, unknown>) : {};

  const assetKindRaw = String(assetRaw.kind ?? "pictogram");
  const assetKind: DesignEditorAssetKind =
    assetKindRaw === "illustration" ? "illustration" : "pictogram";
  const illStyleRaw = String(assetRaw.illustrationStyle ?? "2d");
  const illustrationStyle: DesignEditorIllustrationStyle = illStyleRaw === "3d" ? "3d" : "2d";

  return {
    summary: str("summary") || "주제에 맞는 디자인 초안을 제안합니다.",
    logoOption: parseLogoOption(p.logoOption),
    logoPosition: parseLogoPosition(p.logoPosition),
    title: str("title"),
    subtitles,
    bodyBlocks,
    footer: str("footer"),
    backgroundColor: str("backgroundColor") || undefined,
    titleColor: str("titleColor") || undefined,
    bodyColor: str("bodyColor") || undefined,
    footerColor: str("footerColor") || undefined,
    posterTitleAlign: parseAlign(p.posterTitleAlign, "center"),
    posterBodyAlign: parseAlign(p.posterBodyAlign, "left"),
    posterFooterAlign: parseAlign(p.posterFooterAlign, "left"),
    titleRect: parseNormRect(p.titleRect, defaultTitle),
    subtitleRects: subtitles.map((_, i) =>
      parseNormRect(subtitleRectsRaw[i], {
        ...defaultSub,
        y: Math.min(0.78, defaultSub.y + i * 0.065),
      })
    ),
    bodyRects: bodyBlocks.map((_, i) =>
      parseNormRect(bodyRectsRaw[i], i === 0 ? defaultBody : { ...defaultBody, y: 0.62 + i * 0.14 })
    ),
    footerRect: parseNormRect(p.footerRect, defaultFooter),
    image: {
      include: Boolean(imageRaw.include),
      brief: typeof imageRaw.brief === "string" ? imageRaw.brief.trim() : "",
      rect: parseNormRect(imageRaw.rect, defaultImg),
      opacity: Math.max(0, Math.min(100, Number(imageRaw.opacity) || 100)),
    },
    asset: {
      include: Boolean(assetRaw.include),
      kind: assetKind,
      illustrationStyle: assetKind === "illustration" ? illustrationStyle : undefined,
      brief: typeof assetRaw.brief === "string" ? assetRaw.brief.trim() : "",
      rect: parseNormRect(assetRaw.rect, defaultAsset),
    },
  };
}

/**
 * 디자인 에디터: 주제·캔버스 규격·유형에 맞는 전체 초안(JSON) 제안
 */
export async function runDesignEditorDraftProposal(opts: {
  guidelineSummary: string;
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
  creativeTopic: string;
}): Promise<DesignEditorDraftProposal | null> {
  const key = getKey();
  const topic = opts.creativeTopic.trim();
  if (!key || !topic) return null;

  const meta = opts.templateMeta ?? {};
  const sizeLine =
    meta.width && meta.height
      ? `${meta.width}×${meta.height}${meta.unit ?? "px"}`
      : "알 수 없음";

  const genAI = new GoogleGenerativeAI(key);
  const guide = opts.guidelineSummary.slice(0, 72_000);
  const ctx = opts.contentJson.slice(0, 28_000);

  const prompt = `${SIMPLY_COPY_ROLE_INTRO}

${SIMPLY_COPY_COT_BLOCK}

${SIMPLY_FEW_SHOT_INSTRUCTION}

작업: [제작 주제]와 [캔버스 정보]에 맞는 **완성형 디자인 초안**을 JSON으로 설계하세요.
**타이틀·부제·본문·유의사항(footer) 카피**는 Simply Guide 어법을 최우선으로 작성하고, 레이아웃·로고·색·이미지/에셋 배치는 Jason B2C VI를 따르세요. 캔버스 비율 안에서 겹치지 않게 합니다.

[캔버스 정보]
- 템플릿 ID: ${opts.templateLabel}
- 이름: ${meta.name ?? opts.templateLabel}
- 유형/카테고리: ${meta.category ?? "poster"}${meta.posterCategory ? ` / ${meta.posterCategory}` : ""}
- 규격: ${sizeLine}
- 매체: ${meta.mediaType ?? "online"}

[레이아웃 규칙]
1) 모든 rect는 캔버스 대비 정규화 좌표(0~1). x,y=좌상단, width/height=비율.
2) 메인 타이틀: 2줄 이내, 상대적으로 크게(보통 y 0.15~0.35).
3) 본문: 핵심만 1~3블록, 각 2~3줄 분량.
4) 유의사항(footer): 하단(y≥0.82) 작은 글씨 톤.
5) logoOption: CI|BI|SLOGAN|none. logoPosition은 6방향 중 하나.
6) image.include=true면 brief에 이미지 생성 지시(한국어). rect는 히어로/배경 영역.
7) asset.include=true면 kind=pictogram|illustration, brief에 아이콘/일러스트 지시. pictogram은 경고·안내, illustration은 캠페인 비주얼.
8) [현재 캔버스 JSON]이 비어있지 않으면 사용자 편집을 존중하되, 주제에 맞게 **개선·재구성**합니다.
9) summary에 한국어로 2~4문장 레이아웃 의도를 설명합니다.
10) JSON만 출력.

[제작 주제]
${topic}

[참조 가이드라인 — Jason B2C + Simply U+ (텍스트·레이아웃)]
${guide}

[현재 캔버스 JSON]
${ctx || "{}"}`;

  let lastErr: unknown;
  for (const modelId of textModelCandidates()) {
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: designDraftProposalSchema,
      },
    });
    try {
      const raw = (await model.generateContent(prompt)).response.text();
      const parsed = JSON.parse(raw) as unknown;
      const proposal = parseDraftProposalPayload(parsed);
      if (proposal) return proposal;
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) continue;
      throw e;
    }
  }
  console.warn("[gemini] draft proposal failed", lastErr);
  return null;
}
