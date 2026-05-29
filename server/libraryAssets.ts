import type { Request, Response } from "express";
import { getSupabaseServiceClient } from "./supabase.js";

const LIBRARY_CATEGORIES = new Set([
  "logo",
  "slogan",
  "icon",
  "pictogram",
  "image",
  "template",
  "font",
  "guide",
]);

/** library_assets 테이블 조회 — service role (RLS 우회). 누구나 목록·다운로드 가능. */
export async function handleLibraryList(req: Request, res: Response): Promise<void> {
  try {
    const categoryRaw = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const sb = getSupabaseServiceClient();
    let query = sb.from("library_assets").select("*").order("created_at", { ascending: false });

    if (categoryRaw && LIBRARY_CATEGORIES.has(categoryRaw)) {
      query = query.eq("category", categoryRaw);
    }

    if (q) {
      const escaped = q.replace(/[%_\\]/g, (m) => `\\${m}`);
      const pattern = `%${escaped}%`;
      query = query.or(
        `name.ilike.${pattern},description.ilike.${pattern},file_name.ilike.${pattern}`,
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    res.json({ ok: true, assets: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: "list_failed", message: msg });
  }
}
