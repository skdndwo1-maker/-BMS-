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

if (existsSync(envPath)) {
  config({ path: envPath });
}
if (existsSync(localPath)) {
  config({ path: localPath, override: true });
}
