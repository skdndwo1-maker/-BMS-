/**
 * 클라이언트가 호출할 공개 API 베이스 URL (스킴+호스트[+포트], `/api` 접미사 없음).
 * 로그·헬스 응답용. 바인딩 포트는 `PORT`와 별개입니다.
 *
 * 우선순위: `API_URL` → `PUBLIC_API_URL` → Railway `RAILWAY_PUBLIC_DOMAIN` → 로컬 `http://127.0.0.1:<PORT|3001>`
 */
export function getPublicApiBaseUrl(): string {
  const explicit = process.env.API_URL?.trim() || process.env.PUBLIC_API_URL?.trim();
  if (explicit) {
    let s = explicit.replace(/\/$/, "");
    if (s.toLowerCase().endsWith("/api")) {
      s = s.slice(0, -4);
    }
    return s;
  }

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) {
    const host = railwayDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }

  const port = process.env.PORT?.trim() || "3001";
  return `http://127.0.0.1:${port}`;
}
