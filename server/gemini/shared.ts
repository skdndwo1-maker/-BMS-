import "../load-env.js";

/**
 * Gemini 모듈 공통 유틸리티.
 * - API 키 조회·유효성 판단
 * - 모델 후보 우선순위·재시도 정책
 * - PDF 텍스트 추출(동적 import — Vercel cold start 회피)
 */

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

export async function parsePdfBufferToText(buf: Buffer): Promise<string> {
  const PDFParse = await getPDFParseCtor();
  const parser = new PDFParse({ data: buf });
  try {
    const r = await parser.getText();
    return r.text ?? "";
  } finally {
    await parser.destroy();
  }
}

function isDeprecatedTextModel(id: string): boolean {
  return /^gemini-1\.[05]/i.test(id);
}

/**
 * 텍스트/멀티모달 분석용 모델 후보 (앞에서부터 시도).
 * - 기본: gemini-3.1-pro-preview (고성능). 404·쿼터 시 아래 순으로 폴백.
 * - gemini-1.5-flash 등 구형 ID는 무시(404·과금 이슈 다발).
 */
export function textModelCandidates(): string[] {
  const rawPrimary = process.env.GEMINI_MODEL?.trim();
  const primary =
    rawPrimary && !isDeprecatedTextModel(rawPrimary) ? rawPrimary : "gemini-3.1-pro-preview";
  const pool = [
    primary,
    "gemini-3.1-pro-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
  ].filter((x): x is string => Boolean(x) && !isDeprecatedTextModel(x));
  return [...new Set(pool)];
}

/** 주 키 + (선택) GEMINI_API_KEY_FALLBACK — 선불 크레딧 소진 시 백업 키로 재시도 */
export function geminiApiKeyCandidates(): string[] {
  const keys = [
    process.env.GEMINI_API_KEY?.trim(),
    process.env.GEMINI_API_KEY_FALLBACK?.trim(),
  ].filter((x): x is string => Boolean(x));
  return [...new Set(keys)];
}

/** 이미지 생성·편집 REST 호출 시 모델 후보 (앞에서부터 시도). GEMINI_IMAGE_MODEL이 있으면 최우선. */
export const GEMINI_IMAGE_MODEL_FALLBACKS = [
  "gemini-3.1-flash-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation",
] as const;

/** 429 / 쿼터 또는 모델 미제공(404) — 다음 후보 모델로 재시도 */
export function shouldTryNextTextModel(e: unknown): boolean {
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
export function isInvalidOrExpiredApiKeyError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (/API[_ ]KEY[_ ]INVALID|API key expired|renew the API key|invalid API key/i.test(msg)) return true;
  if (e && typeof e === "object" && "status" in e) {
    const s = (e as { status?: number }).status;
    if (s === 400 && /API key|API_KEY_INVALID|expired/i.test(msg)) return true;
  }
  return false;
}

export function rethrowIfInvalidApiKey(e: unknown): void {
  if (isInvalidOrExpiredApiKeyError(e)) {
    throw new Error(
      "[Gemini API 키] 만료되었거나 잘못되었습니다. https://aistudio.google.com/apikey 에서 새 키를 발급하고, 프로젝트 루트 .env의 GEMINI_API_KEY를 교체한 뒤 서버를 재시작하세요."
    );
  }
}

export function getKey(): string | undefined {
  return geminiApiKeyCandidates()[0];
}

/** 브랜드 네이밍 등 Gemini 연동 가능 여부(루트 .env의 GEMINI_API_KEY) */
export function hasGeminiApiKey(): boolean {
  return geminiApiKeyCandidates().length > 0;
}

export function isPrepaymentCreditsDepletedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /prepayment credits are depleted|billing.*depleted|크레딧.*소진/i.test(msg);
}

/** 사용자-facing Gemini 실패 메시지 (한국어) */
export function formatGeminiFailureMessage(e: unknown): string {
  if (isPrepaymentCreditsDepletedError(e)) {
    return (
      "Gemini API 선불 크레딧이 소진되었습니다. " +
      "https://aistudio.google.com/apikey 에서 결제·크레딧을 충전하거나 새 API 키를 발급해 " +
      ".env의 GEMINI_API_KEY(또는 GEMINI_API_KEY_FALLBACK)에 넣은 뒤 서버를 재시작해 주세요."
    );
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/429|Too Many Requests|quota|RESOURCE_EXHAUSTED|rate limit/i.test(msg)) {
    return (
      "Gemini API 사용 한도에 도달했습니다. 잠시 후 다시 시도하거나 " +
      "AI Studio에서 할당량·결제 상태를 확인해 주세요."
    );
  }
  return msg;
}
