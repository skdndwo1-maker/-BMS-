import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Request, Response } from "express";
import { requireAdmin } from "./adminAuth.js";
import { DATA_DIR } from "./store.js";
import { getSupabaseServiceClient } from "./supabase.js";

const SETTINGS_BUCKET = "brand-library";
const SETTINGS_PATH = "_system/ai-generation-settings.json";
const LOCAL_FILE = join(DATA_DIR, "ai-generation-settings.json");

/** Admin 기본값 — 최초/빈 설정일 때 사용 */
export const DEFAULT_AI_IMAGE_BASE_PROMPT = [
  "cinematic, realistic, hyper real, nano lens,",
  "텍스트 절대 제외, 장식적요소제외(인물과 배경만 사실적으로 표현)",
].join("\n");

export type AiGenerationSettings = {
  version: 1;
  /** 제작물 이미지 AI 생성 시 사용자 프롬프트 앞에 붙는 기본 지침 */
  imageBasePrompt: string;
  updatedAt?: string;
};

function hasSupabaseStorage(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

function normalize(raw: unknown): AiGenerationSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const prompt =
    typeof r.imageBasePrompt === "string" && r.imageBasePrompt.trim()
      ? r.imageBasePrompt
      : DEFAULT_AI_IMAGE_BASE_PROMPT;
  return {
    version: 1,
    imageBasePrompt: prompt,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
  };
}

function readLocal(): AiGenerationSettings {
  if (!existsSync(LOCAL_FILE)) return normalize(null);
  try {
    return normalize(JSON.parse(readFileSync(LOCAL_FILE, "utf8")));
  } catch {
    return normalize(null);
  }
}

function writeLocal(settings: AiGenerationSettings): void {
  mkdirSync(dirname(LOCAL_FILE), { recursive: true });
  writeFileSync(LOCAL_FILE, JSON.stringify(settings, null, 2), "utf8");
}

async function readStorage(): Promise<AiGenerationSettings> {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb.storage.from(SETTINGS_BUCKET).download(SETTINGS_PATH);
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("not found") || msg.includes("object not found") || msg.includes("{}")) {
      return normalize(null);
    }
    throw new Error(error.message);
  }
  return normalize(JSON.parse(await data.text()));
}

async function writeStorage(settings: AiGenerationSettings): Promise<void> {
  const sb = getSupabaseServiceClient();
  const json = JSON.stringify(settings, null, 2);
  const { error } = await sb.storage.from(SETTINGS_BUCKET).upload(SETTINGS_PATH, Buffer.from(json, "utf8"), {
    upsert: true,
    contentType: "application/json",
    cacheControl: "0",
  });
  if (error) throw new Error(error.message);
}

export async function loadAiGenerationSettings(): Promise<AiGenerationSettings> {
  if (hasSupabaseStorage()) {
    try {
      return await readStorage();
    } catch (e) {
      console.warn("[ai-generation-settings] storage read failed, fallback local:", e);
      return readLocal();
    }
  }
  return readLocal();
}

export async function saveAiGenerationSettings(
  patch: { imageBasePrompt?: string }
): Promise<AiGenerationSettings> {
  const current = await loadAiGenerationSettings();
  const next: AiGenerationSettings = {
    version: 1,
    imageBasePrompt:
      typeof patch.imageBasePrompt === "string" && patch.imageBasePrompt.trim()
        ? patch.imageBasePrompt
        : current.imageBasePrompt || DEFAULT_AI_IMAGE_BASE_PROMPT,
    updatedAt: new Date().toISOString(),
  };
  if (hasSupabaseStorage()) {
    try {
      await writeStorage(next);
    } catch (e) {
      console.warn("[ai-generation-settings] storage write failed, fallback local:", e);
      writeLocal(next);
    }
  } else {
    writeLocal(next);
  }
  return next;
}

/** Admin 기본 지침 + 사용자 요청을 합친 최종 direction */
export function composeImageDirection(basePrompt: string, userDirection: string): string {
  const base = basePrompt.trim();
  const user = userDirection.trim();
  if (!base) return user;
  if (!user) return base;
  return `[기본 생성 지침]\n${base}\n\n[사용자 요청]\n${user}`;
}

export async function handleAiGenerationSettingsGet(_req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  try {
    const auth = await requireAdmin(_req);
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error });
      return;
    }
    const settings = await loadAiGenerationSettings();
    res.json({ ok: true, settings });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}

export async function handleAiGenerationSettingsPut(req: Request, res: Response): Promise<void> {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error, message: "관리자 권한이 필요합니다." });
      return;
    }
    const imageBasePrompt =
      typeof req.body?.imageBasePrompt === "string"
        ? req.body.imageBasePrompt
        : typeof req.body?.settings?.imageBasePrompt === "string"
          ? req.body.settings.imageBasePrompt
          : "";
    if (!imageBasePrompt.trim()) {
      res.status(400).json({ ok: false, error: "image_base_prompt_required", message: "기본 프롬프트를 입력해 주세요." });
      return;
    }
    const settings = await saveAiGenerationSettings({ imageBasePrompt });
    res.json({ ok: true, settings });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
