import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function normalizeSupabaseProjectUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // 허용: https://xxx.supabase.co 혹은 https://xxx.supabase.co/rest/v1/ 형태
  return trimmed.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
}

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const urlRaw = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

  const url = normalizeSupabaseProjectUrl(urlRaw ?? "");
  if (!url) {
    throw new Error("VITE_SUPABASE_URL is not set");
  }
  if (!anonKey?.trim()) {
    throw new Error("VITE_SUPABASE_ANON_KEY is not set");
  }

  cached = createClient(url, anonKey.trim(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}

