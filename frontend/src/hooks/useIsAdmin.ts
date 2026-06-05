import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { isCurrentUserAdmin } from "@/lib/libraryApi";

export type UseIsAdminResult = {
  isAdmin: boolean;
  /** null = 아직 확인 중 */
  isReady: boolean;
  refresh: () => Promise<void>;
};

/**
 * Supabase 로그인 + admin_users 등록 여부.
 * RPC → /api/admin/me → admin_users SELECT 순으로 확인.
 */
export function useIsAdmin(): UseIsAdminResult {
  const sb = useMemo<SupabaseClient | null>(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const [isAdmin, setIsAdmin] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!sb) {
      setIsAdmin(false);
      setIsReady(true);
      return;
    }
    await sb.auth.refreshSession().catch(() => {});
    const admin = await isCurrentUserAdmin(sb);
    setIsAdmin(admin);
    setIsReady(true);
  }, [sb]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!sb) {
        if (!cancelled) {
          setIsAdmin(false);
          setIsReady(true);
        }
        return;
      }
      await refresh();
    })();

    if (!sb) return;
    const { data: sub } = sb.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [sb, refresh]);

  return { isAdmin, isReady, refresh };
}
