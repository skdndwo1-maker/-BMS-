import type { Request } from "express";
import { authenticateRequest } from "./middleware/requireAuth.js";
import { getSupabaseServiceClient } from "./supabase.js";

type AdminOk = { ok: true; userId?: string };
type AdminFail = { ok: false; status: number; error: string };

async function isAdminUserId(userId: string, email?: string | null): Promise<boolean> {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.user_id) return true;
  const mail = email?.trim().toLowerCase();
  if (!mail) return false;
  const byEmail = await sb.from("admin_users").select("user_id").ilike("email", mail).maybeSingle();
  return !byEmail.error && Boolean(byEmail.data?.user_id);
}

/**
 * 인증 → admin_users 확인.
 * - Bearer: requireAuth와 동일 검증 후 admin_users
 * - legacy X-Admin-Key: 유지 + 경고 로그 (authenticateRequest에서 이미 warn)
 */
export async function requireAdmin(req: Request): Promise<AdminOk | AdminFail> {
  // 미들웨어에서 이미 인증된 경우 재사용
  if (req.authViaAdminKey) {
    return { ok: true };
  }
  if (req.user?.id) {
    try {
      const ok = await isAdminUserId(req.user.id, req.user.email);
      if (!ok) return { ok: false, status: 403, error: "forbidden" };
      return { ok: true, userId: req.user.id };
    } catch (e) {
      return { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // 미들웨어 없이 직접 호출되는 경우 (또는 키만 있는 경우)
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    if (auth.status === 401) return { ok: false, status: 401, error: "not_logged_in" };
    return { ok: false, status: auth.status, error: auth.error };
  }
  if (req.authViaAdminKey) {
    return { ok: true };
  }
  if (!auth.userId) {
    return { ok: false, status: 401, error: "not_logged_in" };
  }
  try {
    const ok = await isAdminUserId(auth.userId, auth.email);
    if (!ok) return { ok: false, status: 403, error: "forbidden" };
    return { ok: true, userId: auth.userId };
  } catch (e) {
    return { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) };
  }
}
