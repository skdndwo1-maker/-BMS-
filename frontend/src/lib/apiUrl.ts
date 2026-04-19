/**
 * 절대 URL이면 그대로 붙이고, 비어 있으면 상대 경로(로컬 Vite 프록시 `/api` → Express).
 * 프로덕션: `frontend/.env.production` 또는 빌드 환경의 `VITE_API_URL`(예: Railway HTTPS 베이스, 끝 `/` 없음).
 */
export function apiUrl(path: string): string {
  const b = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, "") ?? "";
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!b) return p;
  if (b.endsWith("/api") && p.startsWith("/api")) {
    return `${b}${p.slice(4)}`;
  }
  return `${b}${p}`;
}
