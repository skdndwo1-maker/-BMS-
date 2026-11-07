import { apiUrl } from "./apiUrl";
import { getSupabaseClient, readAccessToken } from "@/lib/supabaseClient";

export type AdminRunRow = {
  id: string;
  created_at: string;
  type: string;
  status: string;
  guideline_id: string | null;
  /** PostgREST embed (single-id runs only; comma-separated guideline_id → null) */
  guidelines: { title: string; type: string } | null;
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
  const token = sb ? await readAccessToken(sb) : null;

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
    [key: string]: unknown;
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

/* ── 가이드 관리 (/admin/guidelines) ─────────────────────────────── */

export type AdminGuidelineSlotOverview = {
  slotId: string;
  title: string;
  extract: { charCount: number; fileChecksum: string | null; createdAt: string | null } | null;
  summary: { charCount: number; createdAt: string | null; editedAt: string | null } | null;
  pdfAuto: { sourceId: string; checksum: string | null; chunkCount: number; updatedAt: string | null } | null;
  supplementCount: number;
};

export type AdminGuidelineSummaryRow = {
  id: string;
  checksum: string;
  summary: string;
  model: string | null;
  promptVersion: string;
  createdAt: string;
  editedAt: string | null;
  editedBy: string | null;
};

export type AdminGuidelineSupplement = {
  sourceId: string;
  title: string;
  body: string;
  status: string;
  chunkCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminGuidelineDetail = {
  slotId: string;
  title: string;
  extract: { text: string; charCount: number; fileChecksum: string | null; createdAt: string | null } | null;
  localSummary: string | null;
  summaries: AdminGuidelineSummaryRow[];
  pdfAuto: {
    sourceId: string;
    checksum: string | null;
    updatedAt: string | null;
    chunks: { chunkIndex: number; content: string }[];
  } | null;
  supplements: AdminGuidelineSupplement[];
};

export type AdminGuidelineEmbedResult = { sourceId: string; chunkCount: number; embedded: number; failed: number };

export type AdminGuidelineReindexResult = {
  slotId: string;
  ok: boolean;
  skipped: boolean;
  skipReason: string | null;
  chunkCount: number;
  embedded: number;
  failed: number;
  error: string | null;
};

export async function listAdminGuidelines(): Promise<AdminGuidelineSlotOverview[]> {
  const payload = await adminFetch("", "/api/admin/guidelines", { method: "GET" });
  return (payload.slots ?? []) as AdminGuidelineSlotOverview[];
}

export async function getAdminGuidelineDetail(slotId: string): Promise<AdminGuidelineDetail> {
  const payload = await adminFetch("", `/api/admin/guidelines/${encodeURIComponent(slotId)}`, { method: "GET" });
  return payload.detail as AdminGuidelineDetail;
}

export async function saveAdminGuidelineSummary(slotId: string, summary: string): Promise<void> {
  await adminFetch("", `/api/admin/guidelines/${encodeURIComponent(slotId)}/summary`, {
    method: "PUT",
    body: JSON.stringify({ summary }),
  });
}

export async function createAdminGuidelineSupplement(
  slotId: string,
  title: string,
  body: string
): Promise<AdminGuidelineEmbedResult> {
  const payload = await adminFetch("", `/api/admin/guidelines/${encodeURIComponent(slotId)}/supplements`, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
  return payload as unknown as AdminGuidelineEmbedResult;
}

export async function updateAdminGuidelineSupplement(
  sourceId: string,
  title: string,
  body: string
): Promise<AdminGuidelineEmbedResult> {
  const payload = await adminFetch("", `/api/admin/guidelines/supplements/${encodeURIComponent(sourceId)}`, {
    method: "PUT",
    body: JSON.stringify({ title, body }),
  });
  return payload as unknown as AdminGuidelineEmbedResult;
}

export async function archiveAdminGuidelineSupplement(sourceId: string): Promise<void> {
  await adminFetch("", `/api/admin/guidelines/supplements/${encodeURIComponent(sourceId)}/archive`, {
    method: "POST",
  });
}

export async function reindexAdminGuideline(slotId: string, force: boolean): Promise<AdminGuidelineReindexResult> {
  const payload = await adminFetch("", `/api/admin/guidelines/${encodeURIComponent(slotId)}/reindex`, {
    method: "POST",
    body: JSON.stringify({ force }),
  });
  return payload.result as AdminGuidelineReindexResult;
}

