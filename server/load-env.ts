/**
 * 프로젝트 루트의 .env / .env.local을 로드 (실행 cwd와 무관).
 * 반드시 다른 server 모듈보다 먼저 import 되어야 함.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT_ENV = join(serverDir, "..");

const envPath = join(PROJECT_ROOT_ENV, ".env");
const localPath = join(PROJECT_ROOT_ENV, ".env.local");
/** `npm run server` 실행 위치와 무관하게, 서버 폴더 전용 키(예: LAW_API_OC)도 읽음 — 기존 변수는 덮어쓰지 않음 */
const serverEnvPath = join(serverDir, ".env");

try {
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
  if (existsSync(localPath)) {
    config({ path: localPath, override: true });
  }
  if (existsSync(serverEnvPath)) {
    config({ path: serverEnvPath, override: false });
  }
} catch {
  /* Vercel 등 .env 없음·경로 이슈 시에도 프로세스 env로 계속 */
}
