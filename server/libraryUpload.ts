import type { Request, Response } from "express";
import { requireAdmin } from "./adminAuth.js";
import { getSupabaseServiceClient } from "./supabase.js";

const LIBRARY_BUCKET = "brand-library";

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

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()가-힣]/g, "_");
}

function buildLibraryFilePath(category: string, fileName: string): string {
  const safe = sanitizeFileName(fileName);
  const id = crypto.randomUUID();
  return `${category}/${id}-${safe}`;
}

function extractExtensionLabel(filePath: string, mimeType?: string | null): string {
  const last = filePath.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  if (dot >= 0 && dot < last.length - 1) {
    const ext = last.slice(dot + 1).toUpperCase();
    if (ext.length <= 6) return ext;
  }
  if (mimeType) {
    const slash = mimeType.lastIndexOf("/");
    if (slash >= 0) return mimeType.slice(slash + 1).toUpperCase();
  }
  return "FILE";
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((t) => t.trim()).filter(Boolean);
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String).map((t) => t.trim()).filter(Boolean);
  } catch {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

export async function handleLibraryUpload(req: Request, res: Response): Promise<void> {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    const message =
      auth.error === "not_logged_in"
        ? "로그인 후 업로드할 수 있습니다."
        : "업로드 권한이 없습니다. Supabase admin_users 테이블에 본인 user_id를 등록해 주세요.";
    res.status(auth.status).json({ ok: false, error: auth.error, message });
    return;
  }

  const file = req.file;
  if (!file?.buffer?.length) {
    res.status(400).json({ ok: false, error: "missing_file", message: "업로드할 파일이 없습니다." });
    return;
  }

  const category = typeof req.body?.category === "string" ? req.body.category.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const tags = parseTags(req.body?.tags);

  if (!LIBRARY_CATEGORIES.has(category)) {
    res.status(400).json({ ok: false, error: "invalid_category", message: "유효하지 않은 카테고리입니다." });
    return;
  }
  if (!name) {
    res.status(400).json({ ok: false, error: "missing_name", message: "에셋 이름을 입력해 주세요." });
    return;
  }

  const filePath = buildLibraryFilePath(category, file.originalname || "file");
  const mimeType = file.mimetype || "application/octet-stream";

  try {
    const sb = getSupabaseServiceClient();

    const { error: upErr } = await sb.storage.from(LIBRARY_BUCKET).upload(filePath, file.buffer, {
      upsert: false,
      contentType: mimeType,
    });
    if (upErr) throw new Error(upErr.message);

    const thumbnailPath = mimeType.startsWith("image/") ? filePath : "";
    const formats = [extractExtensionLabel(filePath, mimeType)];

    const { data, error: dbErr } = await sb
      .from("library_assets")
      .insert({
        category,
        name,
        description,
        tags,
        formats,
        file_path: filePath,
        file_name: file.originalname || name,
        file_size: file.size,
        mime_type: mimeType,
        thumbnail_path: thumbnailPath,
        is_favorite: false,
      })
      .select("*")
      .single();

    if (dbErr) {
      await sb.storage.from(LIBRARY_BUCKET).remove([filePath]);
      throw new Error(dbErr.message);
    }

    res.json({ ok: true, asset: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: "upload_failed", message: msg });
  }
}
