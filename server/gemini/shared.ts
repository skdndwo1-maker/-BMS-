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

/**
 * 텍스트/멀티모달 분석용 모델 후보 (앞에서부터 시도).
 * - 기본: gemini-3.1-pro-preview (고성능). 404·쿼터 시 아래 순으로 폴백.
 * - gemini-2.0-flash 등 구형 ID는 신규 키에서 404가 나는 경우가 많아 기본 후보에서 제외.
 */
export function textModelCandidates(): string[] {
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
  return process.env.GEMINI_API_KEY?.trim();
}

/** 브랜드 네이밍 등 Gemini 연동 가능 여부(루트 .env의 GEMINI_API_KEY) */
export function hasGeminiApiKey(): boolean {
  return Boolean(getKey());
}
