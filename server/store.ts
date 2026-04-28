import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 저장소 루트. Vercel 빌드에서는 `process.cwd()`가 리포지토리 루트(고정 PDF 등 읽기).
 * 로컬 `tsx server/...`에서는 `server/` 기준 상위.
 */
function resolveProjectRoot(): string {
  if (process.env.VERCEL === "1") {
    return process.cwd();
  }
  return join(__dirname, "..");
}

export const PROJECT_ROOT = resolveProjectRoot();

/**
 * 업로드·메타 JSON 등 **쓰기 가능**한 데이터 디렉터리.
 * - 로컬: `<repo>/data`
 * - Vercel 서버리스: `/tmp/...` (배포 번들은 읽기 전용)
 */
function resolveDataDir(): string {
  if (process.env.VERCEL === "1") {
    return join(tmpdir(), "axis-app-data");
  }
  return join(PROJECT_ROOT, "data");
}

export const DATA_DIR = resolveDataDir();
export const GUIDELINES_DIR = join(DATA_DIR, "guidelines");
const META_PATH = join(DATA_DIR, "guidelines-meta.json");

export type GuidelineRecord = {
  id: string;
  displayName: string;
  originalName: string;
  /** 프로젝트 루트 기준 상대 경로, 예: data/guidelines/uplus-brand-guideline-....pdf */
  storedRelativePath: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  aiSummary: string | null;
  aiAnalyzedAt: string | null;
};

export type GuidelineMetaFile = {
  guidelines: Record<string, GuidelineRecord>;
};

function defaultMeta(): GuidelineMetaFile {
  return { guidelines: {} };
}

export function ensureDataDirs(): void {
  mkdirSync(GUIDELINES_DIR, { recursive: true });
}

export function loadMeta(): GuidelineMetaFile {
  ensureDataDirs();
  if (!existsSync(META_PATH)) return defaultMeta();
  try {
    const raw = readFileSync(META_PATH, "utf8");
    return JSON.parse(raw) as GuidelineMetaFile;
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(meta: GuidelineMetaFile): void {
  ensureDataDirs();
  writeFileSync(META_PATH, JSON.stringify(meta, null, 2), "utf8");
}

export function getGuideline(id: string): GuidelineRecord | undefined {
  return loadMeta().guidelines[id];
}

export function setGuideline(record: GuidelineRecord): void {
  const meta = loadMeta();
  meta.guidelines[record.id] = record;
  saveMeta(meta);
}

/** `data/guidelines/...` 형태는 DATA_DIR 기준으로 해석 (Vercel에서 /tmp로 매핑) */
export function resolveStoredPath(storedRelativePath: string): string {
  const norm = storedRelativePath.replace(/\\/g, "/");
  if (norm.startsWith("data/")) {
    return join(DATA_DIR, norm.slice("data/".length));
  }
  return join(PROJECT_ROOT, norm);
}
