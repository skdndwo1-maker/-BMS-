import type { SupabaseClient } from "@supabase/supabase-js";

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
