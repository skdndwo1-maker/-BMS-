/**
 * Vercel Serverless: 기존 Express(`server/app.ts`) 전체를 단일 함수로 마운트.
 * 로컬 개발은 `npm run server` / `npm run dev:full` (포트 3001) 그대로 사용.
 *
 * pdf-parse는 요청 시에만 동적 import(server/gemini.ts). 최상단에서 로드하면
 * pdfjs-dist 때문에 cold start에서 500이 날 수 있음.
 */
import serverless from "serverless-http";
import "../server/load-env.js";
import { app } from "../server/app.js";

const handler = serverless(app, {
  binary: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]
});

export default handler;
