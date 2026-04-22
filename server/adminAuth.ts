import type { Request } from "express";

export function requireAdmin(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.ADMIN_API_KEY?.trim() || "";
  if (!expected) {
    return { ok: false, status: 503, error: "ADMIN_API_KEY is not set" };
  }
  const got = typeof req.headers["x-admin-key"] === "string" ? req.headers["x-admin-key"].trim() : "";
  if (!got || got !== expected) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true };
}

