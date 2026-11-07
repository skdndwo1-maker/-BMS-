import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthedUserId } from "@/lib/designsApi";

/** 저장 테이블: 네이밍(생성·검수) / 브랜드 디자인 검수. RLS로 본인 행만 접근됩니다. */
export type SavedResultKind = "naming" | "inspection";

const TABLE: Record<SavedResultKind, "saved_namings" | "saved_inspections"> = {
  naming: "saved_namings",
  inspection: "saved_inspections",
};

export type SavedResultListItem = {
  id: string;
  name: string;
  summary: string | null;
  /** naming: generate | audit */
  mode: string | null;
  /** inspection: brand score */
  score: number | null;
  created_at: string;
  updated_at: string;
};

export type SavedNamingRow = {
  id: string;
  name: string;
  mode: "generate" | "audit";
  summary: string | null;
  input: unknown;
  result: unknown;
  updated_at: string;
};

export type SavedInspectionRow = {
  id: string;
  name: string;
  score: number | null;
  summary: string | null;
  input: unknown;
  result: unknown;
  design_image: string | null;
  revised_image: string | null;
  updated_at: string;
};

export type SavedNamingPayload = {
  name: string;
  mode: "generate" | "audit";
  summary: string | null;
  input: unknown;
  result: unknown;
};

export type SavedInspectionPayload = {
  name: string;
  score: number | null;
  summary: string | null;
  input: unknown;
  result: unknown;
  design_image: string | null;
  revised_image: string | null;
};

export async function listSavedResults(sb: SupabaseClient, kind: SavedResultKind): Promise<SavedResultListItem[]> {
  const userId = await requireAuthedUserId(sb);
  const cols =
    kind === "naming"
      ? "id, name, summary, mode, created_at, updated_at"
      : "id, name, summary, score, created_at, updated_at";
  const { data, error } = await sb
    .from(TABLE[kind])
    .select(cols)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as unknown as Partial<SavedResultListItem>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    summary: r.summary ?? null,
    mode: r.mode ?? null,
    score: typeof r.score === "number" ? r.score : null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

export async function getSavedNaming(sb: SupabaseClient, id: string): Promise<SavedNamingRow | null> {
  const userId = await requireAuthedUserId(sb);
  const { data, error } = await sb
    .from("saved_namings")
    .select("id, name, mode, summary, input, result, updated_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as SavedNamingRow | null;
}

export async function getSavedInspection(sb: SupabaseClient, id: string): Promise<SavedInspectionRow | null> {
  const userId = await requireAuthedUserId(sb);
  const { data, error } = await sb
    .from("saved_inspections")
    .select("id, name, score, summary, input, result, design_image, revised_image, updated_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as SavedInspectionRow | null;
}

/** id가 있으면 덮어쓰기, 없으면 새로 저장. 저장된 행 id를 반환합니다. */
export async function saveNamingResult(
  sb: SupabaseClient,
  payload: SavedNamingPayload,
  id?: string | null
): Promise<string> {
  const userId = await requireAuthedUserId(sb);
  if (id) {
    const { data, error } = await sb
      .from("saved_namings")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
    return String(data.id);
  }
  const { data, error } = await sb
    .from("saved_namings")
    .insert({ ...payload, user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function saveInspectionResult(
  sb: SupabaseClient,
  payload: SavedInspectionPayload,
  id?: string | null
): Promise<string> {
  const userId = await requireAuthedUserId(sb);
  if (id) {
    const { data, error } = await sb
      .from("saved_inspections")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
    return String(data.id);
  }
  const { data, error } = await sb
    .from("saved_inspections")
    .insert({ ...payload, user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function deleteSavedResult(sb: SupabaseClient, kind: SavedResultKind, id: string): Promise<void> {
  const userId = await requireAuthedUserId(sb);
  const { error } = await sb.from(TABLE[kind]).delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

/** 큰 이미지를 DB에 그대로 넣지 않도록 긴 변 기준으로 줄여 JPEG data URL로 변환합니다. */
export async function downscaleDataUrl(dataUrl: string, maxSide = 1600, quality = 0.85): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image_decode_failed"));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [head, b64 = ""] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], fileName, { type: mime });
}
