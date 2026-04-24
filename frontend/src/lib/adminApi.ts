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
  const sessionRes = sb ? await sb.auth.getSession() : { data: { session: null as any } };
  const token = sessionRes.data.session?.access_token as string | undefined;

  if (!token && !adminKey.trim()) {
    throw new Error("not_logged_in");
  }
  const r = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : { "X-Admin-Key": adminKey.trim() }),
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await r.json().catch(() => ({}))) as any;
  if (!r.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `요청 실패 (${r.status})`);
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

