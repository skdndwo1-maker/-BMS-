import type { Request } from "express";
import { getSupabaseServiceClient } from "./supabase.js";

type AdminOk = { ok: true; userId?: string };
type AdminFail = { ok: false; status: number; error: string };

function getBearerToken(req: Request): string {
  const h = req.headers.authorization;
  if (!h) return "";
  const s = Array.isArray(h) ? h[0] : h;
  const m = /^Bearer\s+(.+)$/i.exec(s.trim());
  return (m?.[1] ?? "").trim();
}

async function isAdminUserId(userId: string): Promise<boolean> {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.user_id);
}

/**
 * Admin auth (A안):
 * - Prefer Supabase 로그인 사용자(JWT bearer) 기반 admin_users 체크
 * - Backward-compatible: legacy x-admin-key도 계속 허용
 */
export async function requireAdmin(req: Request): Promise<AdminOk | AdminFail> {
  // 1) A안: bearer token -> supabase user -> admin_users
  const token = getBearerToken(req);
  if (token) {
    try {
      // service role로 JWT 검증 — SUPABASE_ANON_KEY 불일치(publishable key 등)에도 동작
      const sb = getSupabaseServiceClient();
      const { data, error } = await sb.auth.getUser(token);
      if (error) return { ok: false, status: 401, error: "not_logged_in" };
      const uid = data.user?.id;
      if (!uid) return { ok: false, status: 401, error: "not_logged_in" };
      const ok = await isAdminUserId(uid);
      if (!ok) return { ok: false, status: 403, error: "forbidden" };
      return { ok: true, userId: uid };
    } catch (e) {
      return { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // 2) Legacy: x-admin-key (existing behavior)
  const expected = process.env.ADMIN_API_KEY?.trim() || "";
  const got = typeof req.headers["x-admin-key"] === "string" ? req.headers["x-admin-key"].trim() : "";
  if (!expected) return { ok: false, status: 503, error: "ADMIN_API_KEY is not set" };
  if (!got || got !== expected) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true };
}