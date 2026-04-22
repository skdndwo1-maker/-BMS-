import { apiUrl } from "./apiUrl";

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
  const r = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
      ...(init?.headers ?? {}),
    },
  });
  const data = (await r.json().catch(() => ({}))) as any;
  if (!r.ok || data?.ok === false) {
    throw new Error(data?.error ?? `요청 실패 (${r.status})`);
  }
  return data;
}

export async function listRuns(adminKey: string, status = "pending_review", limit = 50): Promise<AdminRunRow[]> {
  const data = await adminFetch(adminKey, `/api/admin/runs?status=${encodeURIComponent(status)}&limit=${limit}`, {
    method: "GET",
  });
  return (data?.runs ?? []) as AdminRunRow[];
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

