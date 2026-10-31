import { Navigate, useLocation } from "react-router-dom";
import { useAuthSession } from "@/contexts/AuthSessionContext";

/** 세션이 없으면 로그인 화면으로 보냄. Auth 준비 전에는 빈 화면. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, isAuthReady, sb } = useAuthSession();
  const location = useLocation();

  if (!isAuthReady) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        인증 확인 중…
      </div>
    );
  }

  // Supabase 미설정 시에도 로컬 개발이 막히지 않도록 — 클라이언트 없으면 통과
  if (!sb) {
    return <>{children}</>;
  }

  if (!session?.user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
