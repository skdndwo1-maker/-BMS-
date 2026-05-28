import { GoogleGenerativeAI } from "@google/generative-ai";
import { existsSync, readFileSync } from "node:fs";

import type { GuidelineRecord } from "../store.js";
import { resolveStoredPath } from "../store.js";
import {
  getKey,
  parsePdfBufferToText,
  rethrowIfInvalidApiKey,
  shouldTryNextTextModel,
  textModelCandidates,
} from "./shared.js";

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
