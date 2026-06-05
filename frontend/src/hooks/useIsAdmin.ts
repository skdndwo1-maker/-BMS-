import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthSession } from "@/contexts/AuthSessionContext";
import { isCurrentUserAdmin } from "@/lib/libraryApi";

export type UseIsAdminResult = {
  isAdmin: boolean;
  /** false = 아직 확인 중 */
  isReady: boolean;
  refresh: () => Promise<void>;
};

/**
 * Supabase 로그인 + admin_users 등록 여부.
 * AuthSessionProvider의 세션을 사용해 타이밍 이슈를 방지한다.
 */
export function useIsAdmin(): UseIsAdminResult {
  const { sb, session, user, isAuthReady } = useAuthSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const reqIdRef = useRef(0);

  const checkAdmin = useCallback(async () => {
    const reqId = ++reqIdRef.current;

    if (!isAuthReady) {
      setIsReady(false);
      return;
    }

    if (!sb || !user?.id) {
      if (reqId === reqIdRef.current) {
        setIsAdmin(false);
        setIsReady(true);
      }
      return;
    }

    setIsReady(false);
    const admin = await isCurrentUserAdmin(sb, {
      userId: user.id,
      accessToken: session?.access_token ?? null,
      email: user.email ?? null,
    });

    if (reqId !== reqIdRef.current) return;
    setIsAdmin(admin);
    setIsReady(true);
  }, [sb, session?.access_token, user?.id, user?.email, isAuthReady]);

  useEffect(() => {
    void checkAdmin();
  }, [checkAdmin]);

  const refresh = useCallback(async () => {
    await checkAdmin();
  }, [checkAdmin]);

  return { isAdmin, isReady, refresh };
}
