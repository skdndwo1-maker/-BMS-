import { apiUrl } from "./apiUrl";
import { getSupabaseClient } from "@/lib/supabaseClient";

export type AdminRunRow = {
  id: string;
  created_at: string;
  type: string;
  status: string;
  guideline_id: string | null;
  template_id: string | null;
  score: number | null;
  model: string | null;
  input_text: string | null;
  output_text: string | null;
  input_json: unknown;
  output_json: unknown;
};

async function adminFetch(adminKey: string, path: string, init?: RequestInit) {
  const sb = (() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  })();
  await sb?.auth.refreshSession().catch(() => {});
  const sessionRes = sb ? await sb.auth.getSession() : { data: { session: null as any } };
  const token = sessionRes.data.session?.access_token as string | undefined;

  if (!token && !adminKey.trim()) {
    throw new Error("로그인 후 관리자 기능을 사용할 수 있습니다.");
  }
  const r = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : { "X-Admin-Key": adminKey.trim() }),
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    message?: string;
    runs?: AdminRunRow[];
  };
  if (!r.ok || payload?.ok === false) {
    if (r.status === 403 || payload?.error === "forbidden") {
      throw new Error("관리자 권한이 없습니다. admin_users에 본인 계정을 등록해 주세요.");
    }
    if (r.status === 401 || payload?.error === "not_logged_in") {
      throw new Error("로그인 후 관리자 기능을 사용할 수 있습니다.");
    }
    throw new Error(payload?.message || payload?.error || `요청 실패 (${r.status})`);
  }
  return payload;
}

export async function listRuns(adminKey: string, status = "pending_review", limit = 50): Promise<AdminRunRow[]> {
  const payload = await adminFetch(adminKey, `/api/admin/runs?status=${encodeURIComponent(status)}&limit=${limit}`, {
    method: "GET",
  });
  return (payload?.runs ?? []) as AdminRunRow[];
}

export async function approveRun(adminKey: string, runId: string, reviewer?: string): Promise<void> {
  await adminFetch(adminKey, `/api/admin/runs/${encodeURIComponent(runId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ reviewer: reviewer ?? "" }),
  });
}

export async function rejectRun(adminKey: string, runId: string, reason: string, reviewer?: string): Promise<void> {
  await adminFetch(adminKey, `/api/admin/runs/${encodeURIComponent(runId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason, reviewer: reviewer ?? "" }),
  });
}

