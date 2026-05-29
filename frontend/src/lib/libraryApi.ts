import type { SupabaseClient } from "@supabase/supabase-js";
import { apiUrl } from "@/lib/apiUrl";

export const LIBRARY_BUCKET = "brand-library";

export type LibraryCategory =
  | "logo"
  | "slogan"
  | "icon"
  | "pictogram"
  | "image"
  | "template"
  | "font"
  | "guide";

export type LibraryFilterCategory = "all" | LibraryCategory;

export const LIBRARY_CATEGORIES: LibraryCategory[] = [
  "logo",
  "slogan",
  "icon",
  "pictogram",
  "image",
  "template",
  "font",
  "guide",
];

/**
 * 카테고리 화면 라벨 — Supabase Storage 폴더명을 그대로 1차 노출.
 * (한글 표기는 추후 별칭으로 확장 가능)
 */
export const LIBRARY_CATEGORY_LABELS: Record<LibraryCategory, string> = {
  logo: "Logo",
  slogan: "Slogan",
  icon: "Icon",
  pictogram: "Pictogram",
  image: "Image",
  template: "Template",
  font: "Font",
  guide: "Guide",
};

export type LibraryAssetRow = {
  id: string;
  category: LibraryCategory;
  name: string;
  description: string | null;
  tags: string[] | null;
  formats: string[] | null;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  thumbnail_path: string | null;
  downloads: number;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
};

/** UI·훅에서 사용하는 camelCase 에셋 타입 */
export type LibraryAsset = {
  id: string;
  category: LibraryCategory;
  name: string;
  description: string;
  tags: string[];
  formats: string[];
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  thumbnailPath: string;
  downloads: number;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UploadLibraryAssetMetadata = {
  category: LibraryCategory;
  name: string;
  description?: string;
  tags?: string[];
};

export function rowToLibraryAsset(row: LibraryAssetRow): LibraryAsset {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const formatsRaw = Array.isArray(row.formats) ? row.formats : [];
  const formats = formatsRaw.length
    ? formatsRaw.map((f) => f.toUpperCase())
    : [extractExtensionLabel(row.file_path, row.mime_type)];
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    description: row.description ?? "",
    tags,
    formats,
    filePath: row.file_path,
    fileName: row.file_name || row.file_path.split("/").pop() || row.name,
    fileSize: row.file_size ?? 0,
    mimeType: row.mime_type ?? "",
    thumbnailPath: row.thumbnail_path ?? "",
    downloads: row.downloads ?? 0,
    isFavorite: Boolean(row.is_favorite),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()가-힣]/g, "_");
}

export function buildLibraryFilePath(category: LibraryCategory, fileName: string): string {
  const safe = sanitizeFileName(fileName);
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${category}/${id}-${safe}`;
}

export async function listLibraryAssets(
  sb: SupabaseClient,
  args?: { category?: LibraryCategory }
): Promise<LibraryAssetRow[]> {
  let q = sb
    .from("library_assets")
    .select("*")
    .order("created_at", { ascending: false });
  if (args?.category) q = q.eq("category", args.category);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as LibraryAssetRow[];
}

export async function searchLibraryAssets(
  sb: SupabaseClient,
  query: string,
  args?: { category?: LibraryCategory }
): Promise<LibraryAssetRow[]> {
  const q = query.trim();
  if (!q) return listLibraryAssets(sb, args);

  const escaped = q.replace(/[%_\\]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;
  let req = sb
    .from("library_assets")
    .select("*")
    .or(`name.ilike.${pattern},description.ilike.${pattern}`)
    .order("created_at", { ascending: false });
  if (args?.category) req = req.eq("category", args.category);
  const { data, error } = await req;
  if (error) throw error;
  return (data ?? []) as LibraryAssetRow[];
}

export async function uploadLibraryAsset(
  sb: SupabaseClient,
  file: File,
  metadata: UploadLibraryAssetMetadata,
  onProgress?: (pct: number) => void,
): Promise<LibraryAssetRow> {
  const apiResult = await tryUploadLibraryAssetViaApi(sb, file, metadata, onProgress);
  if (apiResult !== "fallback") return apiResult;
  return uploadLibraryAssetDirect(sb, file, metadata, onProgress);
}

async function tryUploadLibraryAssetViaApi(
  sb: SupabaseClient,
  file: File,
  metadata: UploadLibraryAssetMetadata,
  onProgress?: (pct: number) => void,
): Promise<LibraryAssetRow | "fallback"> {
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("로그인 후 업로드할 수 있습니다.");
  }

  onProgress?.(5);
  const form = new FormData();
  form.append("file", file);
  form.append("category", metadata.category);
  form.append("name", metadata.name.trim());
  if (metadata.description?.trim()) form.append("description", metadata.description.trim());
  if (metadata.tags?.length) form.append("tags", JSON.stringify(metadata.tags));

  try {
    onProgress?.(15);
    const r = await fetch(apiUrl("/api/library/upload"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const out = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      asset?: LibraryAssetRow;
      message?: string;
      error?: string;
    };

    if (r.ok && out.ok && out.asset) {
      onProgress?.(100);
      return out.asset;
    }

    const msg =
      out.message ||
      (out.error === "forbidden"
        ? await getLibraryAdminHint(sb)
        : out.error === "not_logged_in"
          ? "로그인 후 업로드할 수 있습니다."
          : `업로드 실패 (${r.status})`);

    if (r.status === 404 || r.status === 502 || r.status === 503) {
      return "fallback";
    }

    throw new Error(msg);
  } catch (e) {
    if (e instanceof Error && (e.message.startsWith("업로드") || e.message.includes("admin_users"))) {
      throw e;
    }
    if (e instanceof Error && e.message.includes("로그인")) throw e;
    if (e instanceof TypeError || (e instanceof Error && /fetch|network/i.test(e.message))) {
      return "fallback";
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}

async function uploadLibraryAssetDirect(
  sb: SupabaseClient,
  file: File,
  metadata: UploadLibraryAssetMetadata,
  onProgress?: (pct: number) => void,
): Promise<LibraryAssetRow> {
  const filePath = buildLibraryFilePath(metadata.category, file.name);
  onProgress?.(10);

  const { error: upErr } = await sb.storage.from(LIBRARY_BUCKET).upload(filePath, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (upErr) {
    throw new Error(formatLibraryStorageError(upErr.message));
  }
  onProgress?.(65);

  const thumbnailPath = file.type.startsWith("image/") ? filePath : "";
  const formats = [extractExtensionLabel(filePath, file.type)];

  const { data, error: dbErr } = await sb
    .from("library_assets")
    .insert({
      category: metadata.category,
      name: metadata.name.trim(),
      description: metadata.description?.trim() ?? "",
      tags: metadata.tags ?? [],
      formats,
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "",
      thumbnail_path: thumbnailPath,
      is_favorite: false,
    })
    .select("*")
    .single();

  if (dbErr) {
    await sb.storage.from(LIBRARY_BUCKET).remove([filePath]);
    throw new Error(formatLibraryStorageError(dbErr.message));
  }

  onProgress?.(100);
  return data as LibraryAssetRow;
}

export function getLibraryPublicUrl(sb: SupabaseClient, filePath: string): string {
  return sb.storage.from(LIBRARY_BUCKET).getPublicUrl(filePath).data.publicUrl;
}

export async function getLibraryDownloadUrl(
  sb: SupabaseClient,
  filePath: string,
  expiresIn = 3600
): Promise<string> {
  const { data, error } = await sb.storage
    .from(LIBRARY_BUCKET)
    .createSignedUrl(filePath, expiresIn, { download: true });
  if (error) {
    return getLibraryPublicUrl(sb, filePath);
  }
  return data.signedUrl;
}

export async function incrementLibraryDownload(
  sb: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await sb.rpc("library_increment_downloads", { p_id: id });
  if (error) {
    console.warn("library_increment_downloads:", error.message);
  }
}

export async function isCurrentUserAdmin(sb: SupabaseClient): Promise<boolean> {
  try {
    const { data: u, error } = await sb.auth.getUser();
    if (error || !u.user?.id) return false;

    const { data: rpcData, error: rpcErr } = await sb.rpc("is_current_user_admin");
    if (!rpcErr && typeof rpcData === "boolean") return rpcData;

    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      try {
        const r = await fetch(apiUrl("/api/admin/me"), {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const out = (await r.json().catch(() => ({}))) as { isAdmin?: boolean };
        if (r.ok && typeof out.isAdmin === "boolean") return out.isAdmin;
      } catch {
        /* fallback below */
      }
    }

    const { data, error: e2 } = await sb
      .from("admin_users")
      .select("user_id")
      .eq("user_id", u.user.id)
      .maybeSingle();
    if (e2) return false;
    return Boolean(data?.user_id);
  } catch {
    return false;
  }
}

export async function getLibraryAdminHint(sb: SupabaseClient): Promise<string> {
  const { data: u } = await sb.auth.getUser();
  const uid = u.user?.id ?? "알 수 없음";
  const email = u.user?.email ? `, ${u.user.email}` : "";
  return `업로드 권한이 없습니다. Supabase SQL Editor에서 admin_users에 등록해 주세요. (user_id: ${uid}${email})`;
}

function formatLibraryStorageError(message: string): string {
  if (/policy|permission|denied|403|not authorized|row-level security/i.test(message)) {
    return `Storage/DB 권한 오류: admin_users 등록 및 brand-library 버킷·RLS 마이그레이션을 확인해 주세요. (${message})`;
  }
  return message;
}

export function formatLibraryUploadError(e: unknown, sb?: SupabaseClient | null): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/admin_users|forbidden|관리자|permission|policy|row-level security/i.test(msg)) {
    return msg.includes("user_id:") ? msg : "업로드 권한이 없습니다. Supabase admin_users 테이블에 본인 계정을 등록해 주세요.";
  }
  if (/not_logged_in|로그인/.test(msg)) return "로그인 후 업로드할 수 있습니다.";
  if (sb && /Storage\/DB 권한/.test(msg)) return msg;
  return msg;
}

export async function deleteLibraryAsset(
  sb: SupabaseClient,
  args: { id: string; filePath: string }
): Promise<void> {
  const { error: rmErr } = await sb.storage.from(LIBRARY_BUCKET).remove([args.filePath]);
  if (rmErr && !/not\s*found/i.test(rmErr.message)) {
    throw rmErr;
  }
  const { error: dbErr } = await sb.from("library_assets").delete().eq("id", args.id);
  if (dbErr) throw dbErr;
}

export function humanFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function extractExtensionLabel(filePath: string, mimeType?: string | null): string {
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
