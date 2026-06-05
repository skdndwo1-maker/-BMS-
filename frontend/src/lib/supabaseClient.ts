import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
} from "@supabase/supabase-js";

function normalizeSupabaseProjectUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // 허용: https://xxx.supabase.co 혹은 https://xxx.supabase.co/rest/v1/ 형태
  return trimmed.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
}

/** URL에서 프로젝트 ref를 뽑아 세션 storageKey로 사용 (도메인이 바뀌어도 동일 키 유지) */
function projectRefFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname; // xxxx.supabase.co
    const ref = host.split(".")[0];
    return ref || "default";
  } catch {
    return "default";
  }
}

/**
 * localStorage가 실제로 쓰기 가능한지 검사하고, 불가하면 메모리 저장소로 폴백한다.
 * (시크릿 모드·서드파티 저장소 차단·확장 프로그램 등으로 localStorage가 막히면
 *  세션이 디스크에 저장되지 않아 새로고침 시 INITIAL_SESSION no-session 이 된다.)
 */
function createSafeAuthStorage(): SupportedStorage {
  if (typeof window !== "undefined") {
    try {
      const probe = "__sb_auth_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (e) {
      console.error(
        "[auth] localStorage를 사용할 수 없어 세션이 새로고침 후 사라집니다. " +
          "브라우저의 사이트 데이터/쿠키 차단, 시크릿 모드, 확장 프로그램을 확인하세요.",
        e,
      );
    }
  }
  // 메모리 폴백 (탭이 유지되는 동안만 세션 보존)
  const mem = new Map<string, string>();
  return {
    getItem: (k) => (mem.has(k) ? (mem.get(k) as string) : null),
    setItem: (k, v) => {
      mem.set(k, v);
    },
    removeItem: (k) => {
      mem.delete(k);
    },
  };
}

let cached: SupabaseClient | null = null;
let activeStorageKey = "";

export function getAuthStorageKey(): string {
  return activeStorageKey;
}

/**
 * 설정된 storageKey가 localStorage에 실제로 존재하는지 확인한다.
 * getSession()은 메모리 세션도 반환하므로, "디스크에 저장됐는지"를 별도로 검증할 때 사용.
 */
export function isSessionPersistedToDisk(): boolean {
  if (typeof window === "undefined" || !activeStorageKey) return false;
  try {
    return window.localStorage.getItem(activeStorageKey) != null;
  } catch {
    return false;
  }
}

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

  activeStorageKey = `sb-${projectRefFromUrl(url)}-auth-token`;
  cached = createClient(url, anonKey.trim(), {
    auth: {
      // 세션을 localStorage(가능 시)에 명시적으로 저장. storageKey를 프로젝트 ref로 고정해
      // 도메인(localhost/Vercel)·포트가 달라도 동일 키를 쓰도록 한다.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: createSafeAuthStorage(),
      storageKey: activeStorageKey,
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

