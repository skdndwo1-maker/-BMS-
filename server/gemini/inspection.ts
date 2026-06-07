import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";

import {
  GEMINI_IMAGE_MODEL_FALLBACKS,
  getKey,
  parsePdfBufferToText,
  rethrowIfInvalidApiKey,
  shouldTryNextTextModel,
  textModelCandidates,
} from "./shared.js";

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
  /** true면 VI PDF(참조 가이드라인)가 [사용자 직접 입력]보다 우선 — 디자인 에디터 교정용 */
  viGuidelineTakesPrecedence?: boolean;
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

  const precedenceRules = opts.viGuidelineTakesPrecedence
    ? `- **[참조 가이드라인 및 검수 맥락](VI 가이드라인 PDF)** 의 규정이 색·로고·타이포·여백·톤 판단에서 **최우선**입니다.\n- [사용자 직접 입력 검수 사항]의 타이포·줄 수 등 추가 규칙은 **PDF와 충돌하지 않을 때만** 적용합니다.`
    : `- [사용자 직접 입력 검수 사항]에 적힌 요구는 **최우선**으로 반영합니다.\n- 로고·컬러·타이포·여백 등 가이드가 요구하는 바를 최대한 따릅니다.`;

  const prompt = `당신은 브랜드 디자인 수정 전문가입니다.

첨부 이미지는 검수 대상 디자인입니다. 아래 [참조 가이드라인·검수 요약·위반 목록·사용자 요청]을 모두 반영하여 **브랜드에 맞게 보완한 새 이미지**를 생성하세요.

규칙:
- 원본의 메시지·구성 의도는 유지하되, 가이드 위반·개선점을 시각적으로 반영합니다.
${precedenceRules}
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

/** 텍스트 프롬프트만으로 브랜드용 이미지 1장 생성 */
export async function generateImageFromTextPrompt(
  prompt: string
): Promise<{ mimeType: string; base64: string; caption: string } | null> {
  const json = await runGeminiImageGenerateWithMultiParts([{ text: prompt }]);
  if (!json) return null;
  const extracted = extractTextAndImageFromGeminiResponse(json);
  if (!extracted) return null;
  return {
    mimeType: extracted.mimeType,
    base64: extracted.base64,
    caption: extracted.text || "이미지가 생성되었습니다.",
  };
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
