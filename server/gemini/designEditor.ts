import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";

import {
  getKey,
  rethrowIfInvalidApiKey,
  shouldTryNextTextModel,
  textModelCandidates,
} from "./shared.js";
import { generateRevisedBrandingImage } from "./inspection.js";

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

  const viPdfFirst = `[VI 가이드라인 PDF — 절대 우선]
프롬프트의 [참조 가이드라인 및 검수 맥락] 블록은 PDF에서 추출한 필수 근거입니다. 색상·로고·타이포·여백·톤·금지 사항 등은 PDF와 아래 규칙이 충돌할 경우 **항상 PDF를 따르세요**.`;

  const typographyRules = `[디자인 에디터 텍스트 교정 규칙 — PDF 다음 우선순위]
첨부 캔버스 이미지의 한국어 카피를 손볼 때(문구·줄 수·상대 크기), VI PDF 요구를 만족하는 범위에서 반드시:
1) **메인 타이틀**: 상대 글자 크기를 **150% 스케일(기준 대비 1.5배 느낌)**로 잡고, **줄 수는 2줄을 절대 넘기지 않음**. 장황한 표현은 줄이고 간결한 문구로 교정.
2) **부제1(첫 번째 부제)**: **현재와 비슷한 글자 크기 관계**를 유지하되, **1줄을 넘기지 않음**(자동 줄바꿈 없이 한 줄). 길면 의미를 유지하며 축약.
3) **본문(주 본문 블록)**: **기본형(100%) 대비 약 60% 크기**로 작고 단정하게 보이게 하고, **줄 수는 2줄을 넘기지 않음**. 핵심만 남기도록 다듬음.

레이아웃·비율·이미지 구도는 원본 의도를 해치지 않되, 위 텍스트 규칙과 VI PDF를 동시에 만족하는 **단일 교정 이미지**를 출력하세요.`;

  const modeNotes =
    opts.mode === "holistic"
      ? `[디자인 교정 모드 — 전체]\n캔버스 전체를 브랜드 VI에 맞게 시각적으로 다듬은 단일 이미지를 생성하세요.`
      : `[디자인 교정 모드 — 검수 반영]\n아래 검수 지적을 우선 반영하여 수정 이미지를 생성하세요.`;

  const notes = `${viPdfFirst}\n\n${typographyRules}\n\n${topicBlock}${modeNotes}`;

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
  const prompt = `역할: LG U+ 브랜드 디자인 에디터용 SVG 아티스트.

작업: 아래 [생성방향]에 맞는 ${opts.assetKind === "pictogram" ? "픽토그램" : "일러스트"} SVG **대안 3개**를 설계하세요.
각 대안은 같은 주제지만 구도·오브젝트 조합·포인트 색 배치가 서로 달라야 합니다.
${styleBlock}

규칙:
1) alternatives 배열에 정확히 3개 항목. 각 svg는 xmlns="http://www.w3.org/2000/svg" 포함 완전한 <svg>...</svg> 한 개.
2) id 충돌 방지를 위해 gradient/filter id는 대안마다 다른 짧은 접두 사용.
3) name은 2~12자 한국어(3D면 3D- 접두 가능)로 대안별 요약.
4) JSON만 출력: { "alternatives": [ { "name": "...", "svg": "..." }, ... ] }

템플릿: ${opts.templateLabel ?? "template"}
${opts.creativeTopic?.trim() ? `\n[제작 주제]\n${opts.creativeTopic.trim()}\n` : ""}
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
