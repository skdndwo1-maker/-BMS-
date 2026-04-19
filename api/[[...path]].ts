/**
 * Vercel Serverless: 기존 Express(`server/app.ts`) 전체를 단일 함수로 마운트.
 * 로컬 개발은 `npm run server` / `npm run dev:full` (포트 3001) 그대로 사용.
 *
 * `/api/health`는 `api/health.ts`에서 처리(경량). 여기서는 나머지 `/api/*`만 옴.
 *
 * pdf-parse는 요청 시에만 동적 import(server/gemini.ts). 최상단에서 로드하면
 * pdfjs-dist 때문에 cold start에서 500이 날 수 있음.
 *
 * Runtime Logs에서 콜드 스타트 구간별 소요(ms) 확인용.
 */
const loadStart = Date.now();
await import("../server/load-env.js");
console.log(`[vercel-api] load-env ${Date.now() - loadStart}ms`);

const { default: serverless } = await import("serverless-http");
console.log(`[vercel-api] serverless-http ${Date.now() - loadStart}ms`);

const { app } = await import("../server/app.js");
console.log(`[vercel-api] app (express+gemini 등) ${Date.now() - loadStart}ms`);

const handler = serverless(app, {
  binary: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]
});

export default handler;
