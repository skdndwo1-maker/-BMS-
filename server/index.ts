import "./load-env.js";
import { app } from "./app.js";
import { startOutboxRelay } from "./outboxRelay.js";
import { getPublicApiBaseUrl } from "./publicApiUrl.js";

/**
 * Railway·Render 등 PaaS는 실행 시 `PORT`를 지정(예: 8080)합니다. 반드시 그 값에 바인딩하세요.
 * 로컬에서만 `PORT` 미설정 시 3001.
 */
function resolveListenPort(): number {
  const raw = process.env.PORT?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 65535) {
      return Math.trunc(n);
    }
  }
  return 3001;
}

const port = resolveListenPort();
const portRaw = process.env.PORT?.trim();

app.listen(port, () => {
  const detail = portRaw
    ? `from PORT=${JSON.stringify(portRaw)}`
    : "PORT unset — using local default 3001";
  const publicBase = getPublicApiBaseUrl();
  console.error(`[guideline-api] listening on port ${port} (${detail}); public API base: ${publicBase}`);
  // Railway 단일 서비스에서도 승인 아웃박스 RAG 색인이 돌아가도록 기본 기동.
  // 전용 워커만 쓰려면 OUTBOX_RELAY_DISABLED=1 후 `npm run worker:outbox`.
  startOutboxRelay({ intervalMs: 5_000 });
});
