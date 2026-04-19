/**
 * Vercel 전용: `/api/health`만 처리 (Express·gemini 미로드).
 * `api/[[...path]].ts`는 전체 앱을 불러와 콜드 스타트가 길어 504가 날 수 있음.
 */
import "../server/load-env.js";
import type { IncomingMessage, ServerResponse } from "node:http";

function resolveLawApiOc(): string {
  return (
    process.env.LAW_API_OC?.trim() ||
    process.env.LAW_GO_OC?.trim() ||
    ""
  );
}

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.end();
    return;
  }
  const body = JSON.stringify({
    ok: true,
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    law: Boolean(resolveLawApiOc())
  });
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(body);
}
