import { GoogleGenerativeAI } from "@google/generative-ai";
import { existsSync, readFileSync } from "node:fs";

import type { GuidelineRecord } from "../store.js";
import { resolveStoredPath } from "../store.js";
import {
  getKey,
  parsePdfBufferToText,
  rethrowIfInvalidApiKey,
  shouldTryNextTextModel,
} from "./shared.js";
import { logLlmCall, modelCandidates } from "../llm/router.js";

/** 요약 프롬프트 문구를 바꾸면 버전을 올려 캐시가 자동 무효화됨. */
export const GUIDELINE_SUMMARY_PROMPT_VERSION = "v1";
export const GUIDELINE_SUMMARY_PROMPT_VERSION_NAMING = "naming-v1";

export type GuidelineSummaryPurpose = "design" | "naming";

const GUIDELINE_SUMMARY_INSTRUCTION = `다음은 브랜드/ VI 가이드라인 문서에서 추출한 텍스트입니다.
디자인 검수에 쓸 수 있도록 핵심 규칙(로고, 색상, 타이포, 여백, 금지 사항 등)을 한국어로 구조화해 요약하세요.
불릿과 짧은 문장으로, 800자 이내로 작성하세요.

--- 문서 본문 ---
`;

const GUIDELINE_SUMMARY_INSTRUCTION_NAMING = `다음은 U+ 전사 브랜드 가이드라인 문서에서 추출한 텍스트입니다.
**브랜드 네이밍 생성·검수**에 바로 쓸 수 있도록 핵심 규칙을 한국어로 구조화해 요약하세요.
반드시 포함할 것:
- 브랜드 계층(Personal/Enterprise/AI 등)과 마스터·서브 브랜드 관계
- U+ / LG U+ / ixi 등 접두·표기·결합·독립 작명 허용·금지 룰
- 서비스·상품·캠페인 네이밍 시 지켜야 할 규정과 NO-GO
- 협업·제휴 표기 규칙(있을 경우)
색상·타이포·여백 등 조형 규칙은 네이밍과 직접 관련된 것만 간단히 언급하세요.
불릿과 짧은 문장으로, 1500자 이내로 작성하세요.

--- 문서 본문 ---
`;

/** 프롬프트에 실제로 넣는 원문 상한 (기존 summarizeGuidelineFile과 동일). */
export const GUIDELINE_SUMMARY_SOURCE_CHAR_LIMIT = 60_000;

export type GuidelineSummarySource =
  | { kind: "text"; sourceText: string; extractFull: string }
  | { kind: "image"; base64: string; mimeType: string }
  | { kind: "empty" };

/** 요약 LLM에 들어가는 원문(텍스트) 또는 이미지 페이로드를 추출. */
export async function extractGuidelineSummarySource(
  filePath: string,
  mimeType: string
): Promise<GuidelineSummarySource> {
  if (mimeType === "application/pdf") {
    const buf = readFileSync(filePath);
    const extractFull = (await parsePdfBufferToText(buf)).slice(0, 120_000);
    const sourceText = extractFull.slice(0, GUIDELINE_SUMMARY_SOURCE_CHAR_LIMIT);
    if (!sourceText.trim()) return { kind: "empty" };
    return { kind: "text", sourceText, extractFull };
  }
  if (mimeType.startsWith("text/")) {
    const extractFull = readFileSync(filePath, "utf8").slice(0, 120_000);
    const sourceText = extractFull.slice(0, GUIDELINE_SUMMARY_SOURCE_CHAR_LIMIT);
    if (!sourceText.trim()) return { kind: "empty" };
    return { kind: "text", sourceText, extractFull };
  }
  if (mimeType === "image/png" || mimeType === "image/jpeg") {
    const buf = readFileSync(filePath);
    return { kind: "image", base64: buf.toString("base64"), mimeType };
  }
  return { kind: "empty" };
}

export function buildGuidelineSummaryPrompt(
  sourceText: string,
  purpose: GuidelineSummaryPurpose = "design"
): string {
  const instruction =
    purpose === "naming" ? GUIDELINE_SUMMARY_INSTRUCTION_NAMING : GUIDELINE_SUMMARY_INSTRUCTION;
  return `${instruction}${sourceText}`;
}

export function guidelineSummaryPromptVersion(purpose: GuidelineSummaryPurpose = "design"): string {
  return purpose === "naming" ? GUIDELINE_SUMMARY_PROMPT_VERSION_NAMING : GUIDELINE_SUMMARY_PROMPT_VERSION;
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

/** PDF·텍스트 가이드를 AI로 요약, 이미지 가이드는 이미지 멀티모달로 요약 */
export async function summarizeGuidelineFile(
  filePath: string,
  mimeType: string,
  opts?: { purpose?: GuidelineSummaryPurpose }
): Promise<{ summary: string; excerpt: string; model: string | null }> {
  const purpose = opts?.purpose ?? "design";
  const key = getKey();
  const source = await extractGuidelineSummarySource(filePath, mimeType);

  if (source.kind === "image") {
    return summarizeImageWithGemini(source.base64, source.mimeType, purpose);
  }

  if (source.kind === "empty") {
    return {
      summary: "이 파일 형식에서는 텍스트를 추출하지 못했습니다. PDF 또는 텍스트 형식을 권장합니다.",
      excerpt: "",
      model: null,
    };
  }

  const text = source.extractFull;

  if (!key) {
    const excerpt = text.slice(0, 2000);
    return {
      summary:
        "[GEMINI_API_KEY 없음] 가이드 텍스트 일부만 저장되었습니다. .env에 GEMINI_API_KEY를 설정하면 AI 요약이 생성됩니다.",
      excerpt,
      model: null,
    };
  }

  const genAI = new GoogleGenerativeAI(key);
  const prompt = buildGuidelineSummaryPrompt(source.sourceText, purpose);

  let lastErr: unknown;
  for (const mid of modelCandidates("guideline_summarize")) {
    const tLlm = Date.now();
    try {
      const model = genAI.getGenerativeModel({ model: mid });
      const result = await model.generateContent(prompt);
      logLlmCall({
        task: "guideline_summarize",
        model: mid,
        startedAt: tLlm,
        usage: result.response.usageMetadata,
      });
      const summary = result.response.text();
      return { summary, excerpt: text.slice(0, 2000), model: mid };
    } catch (e) {
      logLlmCall({ task: "guideline_summarize", model: mid, startedAt: tLlm });
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
  mimeType: string,
  purpose: GuidelineSummaryPurpose = "design"
): Promise<{ summary: string; excerpt: string; model: string | null }> {
  const key = getKey();
  if (!key) {
    return {
      summary:
        "[GEMINI_API_KEY 없음] 이미지 가이드는 API 키 설정 후 분석됩니다.",
      excerpt: "",
      model: null,
    };
  }
  const genAI = new GoogleGenerativeAI(key);
  const prompt =
    purpose === "naming"
      ? "이 이미지는 U+ 전사 브랜드 가이드라인입니다. 네이밍 생성·검수용으로 계층·접두·독립 작명·금지 규정을 한국어로 요약하세요 (1500자 이내)."
      : "이 이미지는 브랜드 가이드라인 문서의 일부입니다. 디자인 검수에 필요한 핵심 규칙을 한국어로 요약하세요 (800자 이내).";
  let lastErr: unknown;
  for (const mid of modelCandidates("guideline_summarize")) {
    const tLlm = Date.now();
    try {
      const model = genAI.getGenerativeModel({ model: mid });
      const result = await model.generateContent([
        prompt,
        { inlineData: { mimeType, data: base64 } }
      ]);
      logLlmCall({
        task: "guideline_summarize",
        model: mid,
        startedAt: tLlm,
        usage: result.response.usageMetadata,
      });
      const summary = result.response.text();
      return { summary, excerpt: "", model: mid };
    } catch (e) {
      logLlmCall({ task: "guideline_summarize", model: mid, startedAt: tLlm });
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
