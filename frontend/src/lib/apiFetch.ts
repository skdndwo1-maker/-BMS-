import { getSupabaseClient } from "@/lib/supabaseClient";
import { apiUrl } from "@/lib/apiUrl";

export class ApiHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

async function readAccessToken(): Promise<string | null> {
  try {
    const sb = getSupabaseClient();
    const { data } = await sb.auth.getSession();
    return data.session?.access_token?.trim() || null;
  } catch {
    return null;
  }
}

function messageForStatus(status: number, fallback: string): string {
  if (status === 401) return "로그인이 필요합니다";
  if (status === 403) return "권한이 없습니다";
  return fallback;
}

/**
 * Express /api 호출용 fetch — Authorization: Bearer 자동 첨부.
 * path는 `/api/...` 또는 `api/...` 형태.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await readAccessToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // FormData일 때 Content-Type을 수동 설정하면 boundary가 깨지므로 건드리지 않음
  const r = await fetch(apiUrl(path), { ...init, headers });
  if (r.status === 401 || r.status === 403) {
    const body = (await r.clone().json().catch(() => ({}))) as { error?: string; message?: string };
    const raw = body.message || body.error || `요청 실패 (${r.status})`;
    throw new ApiHttpError(r.status, messageForStatus(r.status, raw));
  }
  return r;
}
