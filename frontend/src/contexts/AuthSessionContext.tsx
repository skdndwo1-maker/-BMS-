import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";

type AuthSessionState = {
  sb: SupabaseClient | null;
  session: Session | null;
  user: User | null;
  /** Supabase INITIAL_SESSION 수신 후 true */
  isAuthReady: boolean;
};

const AuthSessionContext = createContext<AuthSessionState>({
  sb: null,
  session: null,
  user: null,
  isAuthReady: false,
});

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const sb = useMemo<SupabaseClient | null>(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (!sb) {
      setSession(null);
      setIsAuthReady(true);
      return;
    }

    let mounted = true;

    const { data: sub } = sb.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      // 진단용: 세션 복원/로그인/로그아웃 시점과 사용자 식별자를 콘솔에 남긴다.
      // (Auth session missing 류 문제를 추적할 때 브라우저 콘솔에서 바로 확인 가능)
      console.info(
        "[auth]",
        event,
        nextSession?.user?.email ?? nextSession?.user?.id ?? "no-session",
      );
      setSession(nextSession);
      setIsAuthReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  const value = useMemo<AuthSessionState>(
    () => ({
      sb,
      session,
      user: session?.user ?? null,
      isAuthReady,
    }),
    [sb, session, isAuthReady],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionState {
  return useContext(AuthSessionContext);
}
