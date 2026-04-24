import type { SupabaseClient } from "@supabase/supabase-js";
import type { DesignContent } from "@/design/types";

export type DesignRow = {
  id: string;
  user_id: string;
  template_id: string;
  name: string;
  canvas_data: unknown;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
};

export type DesignListItem = Pick<
  DesignRow,
  "id" | "template_id" | "name" | "thumbnail_url" | "created_at" | "updated_at"
>;

export async function requireAuthedUserId(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.auth.getUser();
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("not_logged_in");
  return uid;
}

export async function listDesignsForUser(
  sb: SupabaseClient,
  args: { userId: string; templateId?: string }
): Promise<DesignListItem[]> {
  let q = sb
    .from("designs")
    .select("id, template_id, name, thumbnail_url, created_at, updated_at")
    .eq("user_id", args.userId)
    .order("updated_at", { ascending: false });
  if (args.templateId) q = q.eq("template_id", args.templateId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DesignListItem[];
}

export async function getDesignById(
  sb: SupabaseClient,
  args: { userId: string; id: string }
): Promise<DesignRow | null> {
  const { data, error } = await sb
    .from("designs")
    .select("*")
    .eq("user_id", args.userId)
    .eq("id", args.id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as DesignRow | null;
}

export async function createDesign(
  sb: SupabaseClient,
  args: {
    userId: string;
    templateId: string;
    name: string;
    content: DesignContent;
    thumbnailUrl?: string | null;
  }
): Promise<DesignRow> {
  const payload = {
    user_id: args.userId,
    template_id: args.templateId,
    name: args.name,
    canvas_data: args.content as unknown,
    thumbnail_url: args.thumbnailUrl ?? null,
  };
  const { data, error } = await sb.from("designs").insert(payload).select("*").single();
  if (error) throw error;
  return data as DesignRow;
}

export async function updateDesign(
  sb: SupabaseClient,
  args: {
    userId: string;
    id: string;
    templateId: string;
    name: string;
    content: DesignContent;
    thumbnailUrl?: string | null;
  }
): Promise<DesignRow> {
  const payload = {
    template_id: args.templateId,
    name: args.name,
    canvas_data: args.content as unknown,
    thumbnail_url: args.thumbnailUrl ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from("designs")
    .update(payload)
    .eq("user_id", args.userId)
    .eq("id", args.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as DesignRow;
}

export async function deleteDesign(
  sb: SupabaseClient,
  args: { userId: string; id: string }
): Promise<void> {
  const { error } = await sb.from("designs").delete().eq("user_id", args.userId).eq("id", args.id);
  if (error) throw error;
}

