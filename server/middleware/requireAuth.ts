import type { NextFunction, Request, Response } from "express";
import { getSupabaseServiceClient } from "../supabase.js";

export type AuthOk = { ok: true; userId: string; email: string | null };
export type AuthFail = { ok: false; status: number; error: string };

export function getBearerToken(req: Request): string {
  const h = req.headers.authorization;
  if (!h) return "";
  const s = Array.isArray(h) ? h[0] : h;
  const m = /^Bearer\s+(.+)$/i.exec(s.trim());
  return (m?.[1] ?? "").trim();
}

function readAdminKey(req: Request): string {
  return typeof req.headers["x-admin-key"] === "string" ? req.headers["x-admin-key"].trim() : "";
}

function isValidAdminKey(got: string): boolean {
  const expected = process.env.ADMIN_API_KEY?.trim() || "";
  return Boolean(expected && got && got === expected);
}

/**
 * JWT 검증. 성공 시 req.user 설정.
 * legacy X-Admin-Key 만 있는 경우: 통과시키되 경고 로그 (다음 단계에서 제거).
 */
export async function authenticateRequest(req: Request): Promise<AuthOk | AuthFail> {
  const token = getBearerToken(req);
  if (token) {
    try {
      const sb = getSupabaseServiceClient();
      const { data, error } = await sb.auth.getUser(token);
      if (error || !data.user?.id) {
        return { ok: false, status: 401, error: "unauthorized" };
      }
      req.user = { id: data.user.id, email: data.user.email ?? null };
      req.authViaAdminKey = false;
      return { ok: true, userId: data.user.id, email: data.user.email ?? null };
    } catch (e) {
      return { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const adminKey = readAdminKey(req);
  if (isValidAdminKey(adminKey)) {
    console.warn(
      "[auth] legacy X-Admin-Key used — deprecated; migrate clients to Bearer JWT (will be removed)"
    );
    req.user = undefined;
    req.authViaAdminKey = true;
    return { ok: true, userId: "", email: null };
  }

  if (adminKey && !process.env.ADMIN_API_KEY?.trim()) {
    return { ok: false, status: 503, error: "unauthorized" };
  }

  return { ok: false, status: 401, error: "unauthorized" };
}

/** Express 미들웨어 — /api 기본 차단 (health 제외는 app.ts에서 라우트 순서로 처리) */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const result = await authenticateRequest(req);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  next();
}
