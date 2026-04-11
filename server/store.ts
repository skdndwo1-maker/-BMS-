import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** 프로젝트 루트 (server/의 상위) */
export const PROJECT_ROOT = join(__dirname, "..");
export const DATA_DIR = join(PROJECT_ROOT, "data");
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

export function resolveStoredPath(storedRelativePath: string): string {
  return join(PROJECT_ROOT, storedRelativePath);
}
