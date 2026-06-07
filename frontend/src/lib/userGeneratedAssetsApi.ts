import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetType } from "@/design/types";
import { requireAuthedUserId } from "@/lib/designsApi";

export type UserGeneratedAssetRow = {
  id: string;
  user_id: string;
  asset_type: AssetType;
  name: string;
  generation_direction: string;
  illustration_style: "2d" | "3d" | null;
  svg_content: string;
  created_at: string;
  updated_at: string;
};

export type UserGeneratedAsset = {
  id: string;
  assetType: AssetType;
  name: string;
  generationDirection: string;
  illustrationStyle: "2d" | "3d" | null;
  svgContent: string;
  src: string;
  createdAt: string;
};

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\n/g, "").trim())}`;
}

export function rowToUserGeneratedAsset(row: UserGeneratedAssetRow): UserGeneratedAsset {
  return {
    id: row.id,
    assetType: row.asset_type,
    name: row.name,
    generationDirection: row.generation_direction ?? "",
    illustrationStyle: row.illustration_style,
    svgContent: row.svg_content,
    src: svgToDataUri(row.svg_content),
    createdAt: row.created_at,
  };
}

export async function listUserGeneratedAssets(
  sb: SupabaseClient,
  args: { userId: string; assetType?: AssetType; limit?: number },
): Promise<UserGeneratedAsset[]> {
  let q = sb
    .from("user_generated_assets")
    .select("*")
    .eq("user_id", args.userId)
    .order("created_at", { ascending: false });
  if (args.assetType) q = q.eq("asset_type", args.assetType);
  if (args.limit) q = q.limit(args.limit);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as UserGeneratedAssetRow[]).map(rowToUserGeneratedAsset);
}

export async function saveUserGeneratedAsset(
  sb: SupabaseClient,
  args: {
    userId: string;
    assetType: AssetType;
    name: string;
    svgContent: string;
    generationDirection?: string;
    illustrationStyle?: "2d" | "3d" | null;
  },
): Promise<UserGeneratedAsset> {
  const payload = {
    user_id: args.userId,
    asset_type: args.assetType,
    name: args.name.trim().slice(0, 80) || "AI 에셋",
    generation_direction: (args.generationDirection ?? "").trim().slice(0, 500),
    illustration_style:
      args.assetType === "illustration" ? (args.illustrationStyle ?? null) : null,
    svg_content: args.svgContent,
  };
  const { data, error } = await sb
    .from("user_generated_assets")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return rowToUserGeneratedAsset(data as UserGeneratedAssetRow);
}

export async function deleteUserGeneratedAsset(
  sb: SupabaseClient,
  args: { userId: string; id: string },
): Promise<void> {
  const { error } = await sb
    .from("user_generated_assets")
    .delete()
    .eq("user_id", args.userId)
    .eq("id", args.id);
  if (error) throw error;
}

export async function saveUserGeneratedAssetForCurrentUser(
  sb: SupabaseClient,
  args: Omit<Parameters<typeof saveUserGeneratedAsset>[1], "userId">,
): Promise<UserGeneratedAsset> {
  const userId = await requireAuthedUserId(sb);
  return saveUserGeneratedAsset(sb, { ...args, userId });
}
