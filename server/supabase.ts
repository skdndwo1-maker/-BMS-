import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function normalizeSupabaseProjectUrl(raw: string): string {
  const s = raw.trim().replace(/\/+$/, "");
  // Accept either:
  // - https://xxxx.supabase.co
  // - https://xxxx.supabase.co/rest/v1
  // - https://xxxx.supabase.co/rest/v1/
  if (s.endsWith("/rest/v1")) return s.slice(0, -"/rest/v1".length);
  return s;
}

export function getSupabaseServiceClient(): SupabaseClient {
  const urlRaw = process.env.SUPABASE_URL?.trim() || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!urlRaw) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const projectUrl = normalizeSupabaseProjectUrl(urlRaw);
  return createClient(projectUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

