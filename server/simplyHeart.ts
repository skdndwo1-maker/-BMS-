/**
 * Simply Heart — 4단계 Gemini 분석 (텍스트 + 이미지 멀티모달, PDF는 텍스트 추출 후 텍스트로 병합)
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GuidelineRecord } from "./store.js";
import { loadMeta } from "./store.js";
import { excerptGuidelineForInspection } from "./gemini.js";

const CORE_GUIDES: readonly { id: string; title: string; cap?: number }[] = [
  {
    id: "simply-uplus-guideline",
    title: "Simply U+ 가이드라인 — 실천과제·설명자료 (모든 입력·첨부보다 최우선)",
    cap: 52_000,
  },
  { id: "uplus-brand-guideline", title: "U+ 브랜드 가이드라인 (보조)", cap: 28_000 },
  { id: "uplus-vi-guideline", title: "U+ VI 가이드라인 (보조)", cap: 28_000 },
] as const;

function getKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim();
}

function textModelCandidates(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-pro-preview";
  const pool = [primary, "gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-2.5-flash"].filter((x): x is string =>
    Boolean(x)
  );
  return [...new Set(pool)];
}

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
      "[Gemini API 키] 만료되었거나 잘못되었습니다. https://aistudio.google.com/apikey 에서 새 키를 발급하고 .env의 GEMINI_API_KEY를 교체한 뒤 서버를 재시작하세요."
    );
  }
}

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

export async function extractPdfTextFromBase64(base64: string): Promise<string> {
  const buf = Buffer.from(base64, "base64");
  const pdfParseMod = (await import("pdf-parse")) as unknown as {
    default: (b: Buffer) => Promise<{ text: string }>;
  };
  const out = await pdfParseMod.default(buf);
  const t = String(out.text ?? "").trim();
  return t.slice(0, 85_000);
}

async function buildGuidelineContext(): Promise<string> {
  const meta = loadMeta();
  const parts: string[] = [];
  const defaultCap = 34_000;

  for (const entry of CORE_GUIDES) {
    const { id, title } = entry;
    const perCap = entry.cap ?? defaultCap;
    const g: GuidelineRecord | undefined = meta.guidelines[id];
    if (!g) {
      parts.push(
        `[${title}]\n(슬롯 미등록: 고정 PDF를 sync-fixed로 복사하거나 업로드하면 이 맥락이 채워집니다.)`
      );
      continue;
    }
    try {
      let body: string;
      if (g.aiSummary?.trim()) body = g.aiSummary.trim();
      else body = (await excerptGuidelineForInspection(g)).trim();
      if (body.length > perCap) body = `${body.slice(0, perCap)}\n…(발췌 생략)`;
      parts.push(`[${title} — ${g.displayName}]\n${body}`);
    } catch {
      parts.push(`[${title}]\n(본문 로드 실패)`);
    }
  }
  return parts.join("\n\n==========\n\n");
}

function sharedRules(): string {
  return `
[추론 원칙 — 심플리하게 전용]
- **Simply U+ 가이드라인(실천과제·설명자료)** 는 사용자가 업로드한 텍스트·이미지·PDF·기타 문서보다도 **항상 우선**합니다. 판단·권고·Do/Don't의 **기본 축**은 오직 이 가이드입니다.
- U+ 브랜드 가이드라인·VI 가이드라인은 **Simply U+에 어긋나지 않는 범위에서만** 보조로 참고합니다. 브랜드·VI와 Simply U+가 충돌하면 **Simply U+를 따르고**, 브랜드·VI 측 내용은 «보조 참고만 가능, 적용 불가»로 짧게 적습니다.
- 사용자 첨부만으로 Simply U+와 모순되는 제안을 하지 마세요. 추론·결론은 **위 첫 번째 가이드 블록**에 명시된 원칙과 우선순위를 따릅니다.
- 근거가 없는 부분은 추측임을 명시하세요.
- 응답은 한국어 마크다운으로 작성하세요.
`.trim();
}

function stepInstruction(step: 1 | 2 | 3 | 4): string {
  if (step === 1) {
    return `
당신은 LG U+ **Simply Heart** 워크플로의 **1단계: 요청 내용 분석 (Diagnosis)** 담당입니다.

출력에 반드시 포함:
1. **타겟(Seg) 추정** — 누가 이 메시지의 주 수혜자인지
2. **요청/메시지의 목적** — 무엇을 달성하려 하는지
3. **부담 진단** — 이 요청/카피/안내가 고객에게 불필요한 **공부**나 **선택의 짐**을 **덜어주고 있는지**, 그렇지 않다면 구체적으로 무엇이 부담인지

## 형식 (마크다운)
### 타겟(Seg) 및 목적
### 부담 진단
`.trim();
  }
  if (step === 2) {
    return `
당신은 **2단계: Simply Pain Point (Empathy)** 담당입니다. 공급자 시각에서 놓치기 쉬운 고객 불편을 짚습니다.

출력에 반드시 포함:
1. 고객이 느낄 수 있는 **인지 부하**·**결정 피로**
2. 복잡한 옵션 나열·전문용어 남발 등으로 **결정 장애**를 유발하는지
3. **Don't 사례** (이렇게 쓰면 안 되는 이유를 구체적으로)

## 형식 (마크다운)
### 공감 포인트 (Pain)
### Don't 사례
`.trim();
  }
  if (step === 3) {
    return `
당신은 **3단계: Do & Don't (Guideline)** 담당입니다.

출력에 반드시 포함:
1. [참고 가이드라인]에 근거한 **Do** 목록 (실천 가능한 문장)
2. **Don't** 목록 (지양 사항, 반드시 가이드·VI와 연결해 설명)
3. 전문용어·혜택 직관성·「보이지 않는 기술로 처리 가능한 영역」인지 여부에 대한 평가

## 형식 (마크다운)
### Do
### Don't
### 가이드 정합성 메모
`.trim();
  }
  return `
당신은 **4단계: Simply U+ 솔루션 (Delivery)** 담당입니다.

출력에 반드시 포함:
1. **정제된 메시지** 제안 (1~2안)
2. **심플해진 네이밍/표현** 제안 (해당 시)
3. **간소화된 프로세스** 제안 (단계를 줄인 고객 여정)
4. **고객이 해야 할 단 하나의 행동 (One Action)** — 명확한 CTA 한 줄

## 형식 (마크다운)
### 솔루션 메시지
### One Action (단 하나의 행동)
`.trim();
}

function buildUserPayload(opts: {
  userText: string;
  extractedPdfText?: string;
  prior: Partial<Record<"1" | "2" | "3", string>>;
  step: 1 | 2 | 3 | 4;
}): string {
  const chunks: string[] = [`[사용자 입력 — 텍스트]\n${opts.userText || "(없음)"}`];
  if (opts.extractedPdfText?.trim()) {
    chunks.push(`[사용자 첨부 PDF에서 추출한 텍스트]\n${opts.extractedPdfText.trim()}`);
  }
  if (opts.prior["1"]) chunks.push(`[1단계 결과 요약·전문]\n${opts.prior["1"]}`);
  if (opts.prior["2"]) chunks.push(`[2단계 결과 요약·전문]\n${opts.prior["2"]}`);
  if (opts.prior["3"]) chunks.push(`[3단계 결과 요약·전문]\n${opts.prior["3"]}`);
  chunks.push(`\n---\n${stepInstruction(opts.step)}`);
  return chunks.join("\n\n");
}

export type SimplyHeartImagePart = { mimeType: string; data: string };

export async function runSimplyHeartStep(opts: {
  step: 1 | 2 | 3 | 4;
  userText: string;
  extractedPdfText?: string;
  imageParts?: SimplyHeartImagePart[];
  prior: Partial<Record<"1" | "2" | "3", string>>;
}): Promise<{ text: string; model: string }> {
  const key = getKey();
  if (!key) throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다.");

  const guidelineContext = (await buildGuidelineContext()).slice(0, 100_000);
  const systemInstruction = `${sharedRules()}

[참고 가이드라인 — 서버 등록 본문]
${guidelineContext}`;

  const userTextBlock = buildUserPayload(opts);
  const hasVision =
    (opts.imageParts?.length ?? 0) > 0 &&
    opts.imageParts!.some((p) => /^image\/(png|jpeg|jpg|webp)$/i.test(p.mimeType));

  const genAI = new GoogleGenerativeAI(key);
  let lastErr: unknown;

  const preamble =
    hasVision && opts.imageParts?.length
      ? "첨부 이미지(시안·배너 등)의 **가독성·메시지 계층·브랜드 정합성**을 텍스트와 함께 분석하세요. 이미지에서 읽은 텍스트를 인용할 때는 따옴표로 구분하세요.\n\n"
      : "";

  for (const mid of textModelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({
        model: mid,
        systemInstruction,
      });

      const parts: Array<
        { text: string; inlineData?: never } | { text?: never; inlineData: { mimeType: string; data: string } }
      > = [{ text: `${preamble}${userTextBlock}` }];
      for (const im of opts.imageParts ?? []) {
        if (!/^image\/(png|jpeg|jpg|webp)$/i.test(im.mimeType)) continue;
        const data = im.data.replace(/^data:image\/\w+;base64,/, "");
        parts.push({ inlineData: { mimeType: im.mimeType.split(";")[0], data } });
      }

      const result = await model.generateContent(parts);
      const text = result.response.text();
      if (text?.trim()) return { text: text.trim(), model: mid };
      return { text: "(빈 응답)", model: mid };
    } catch (e) {
      rethrowIfInvalidApiKey(e);
      lastErr = e;
      if (shouldTryNextTextModel(e)) {
        console.warn(`[simply-heart] model=${mid} retry`, e instanceof Error ? e.message : e);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Simply Heart 단계 ${opts.step} 실패: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}
