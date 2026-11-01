import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    user?: { id: string; email: string | null };
    /** legacy X-Admin-Key 로 인증된 요청 (다음 단계에서 제거 예정) */
    authViaAdminKey?: boolean;
  }
}
