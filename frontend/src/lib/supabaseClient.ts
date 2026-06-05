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

/** localStorage 세션만 읽음. 수동 refreshSession()은 토큰 회전으로 세션을 끊을 수 있어 사용하지 않음. */
export async function readAuthedUserId(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function readAccessToken(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Supabase auth storage 복원(INITIAL_SESSION)까지 대기 */
export async function waitForAuthSession(
  sb: SupabaseClient,
): Promise<{ userId: string | null; accessToken: string | null }> {
  const { data: cached } = await sb.auth.getSession();
  if (cached.session?.user?.id) {
    return {
      userId: cached.session.user.id,
      accessToken: cached.session.access_token ?? null,
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (session: { user?: { id: string }; access_token?: string } | null) => {
      if (settled) return;
      settled = true;
      resolve({
        userId: session?.user?.id ?? null,
        accessToken: session?.access_token ?? null,
      });
    };

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT") {
        sub.subscription.unsubscribe();
        finish(session);
      }
    });

    window.setTimeout(() => {
      if (settled) return;
      sub.subscription.unsubscribe();
      void sb.auth.getSession().then(({ data }) => finish(data.session));
    }, 4000);
  });
}

