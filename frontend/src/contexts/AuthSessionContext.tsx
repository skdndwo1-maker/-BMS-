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

    const { data: sub } = sb.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
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
