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

function getProjectUrl(): string {
  const urlRaw = process.env.SUPABASE_URL?.trim() || "";
  if (!urlRaw) throw new Error("SUPABASE_URL is not set");
  return normalizeSupabaseProjectUrl(urlRaw);
}

export function getSupabaseServiceClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const projectUrl = getProjectUrl();
  return createClient(projectUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabaseAnonClient(): SupabaseClient {
  const key = process.env.SUPABASE_ANON_KEY?.trim() || "";
  if (!key) throw new Error("SUPABASE_ANON_KEY is not set");
  const projectUrl = getProjectUrl();
  return createClient(projectUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isSupabaseInvalidApiKeyError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return msg.toLowerCase().includes("invalid api key");
}

