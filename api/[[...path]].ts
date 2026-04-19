/**
 * Vercel Serverless: 기존 Express(`server/app.ts`) 전체를 단일 함수로 마운트.
 * 로컬 개발은 `npm run server` / `npm run dev:full` (포트 3001) 그대로 사용.
 */
import serverless from "serverless-http";
import "../server/load-env.js";
import { app } from "../server/app.js";

const handler = serverless(app, {
  binary: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]
});

export default handler;
