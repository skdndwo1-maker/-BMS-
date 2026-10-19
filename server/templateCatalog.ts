import type { Request, Response } from "express";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requireAdmin } from "./adminAuth.js";
import { DATA_DIR } from "./store.js";
import { getSupabaseServiceClient } from "./supabase.js";

const CATALOG_BUCKET = "brand-library";
const CATALOG_PATH = "_system/template-catalog.json";
const LOCAL_CATALOG_FILE = join(DATA_DIR, "template-catalog.json");
const MAX_CATALOG_BYTES = 20 * 1024 * 1024;

type TemplateCatalogPayload = {
  version: 1;
  categories: unknown[] | null;
  templates: unknown[];
  deletedTemplateIds: string[];
  updatedAt: string;
};

function hasSupabaseStorage(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

function parseCatalog(raw: unknown): TemplateCatalogPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.templates)) return null;
  if (r.categories != null && !Array.isArray(r.categories)) return null;
  return {
    version: 1,
    categories: Array.isArray(r.categories) ? r.categories : null,
    templates: r.templates,
    deletedTemplateIds: Array.isArray(r.deletedTemplateIds) ? r.deletedTemplateIds.map(String) : [],
    updatedAt: new Date().toISOString(),
  };
}

function readLocalCatalog(): unknown | null {
  if (!existsSync(LOCAL_CATALOG_FILE)) return null;
  return JSON.parse(readFileSync(LOCAL_CATALOG_FILE, "utf8")) as unknown;
}

function writeLocalCatalog(catalog: TemplateCatalogPayload): void {
  mkdirSync(dirname(LOCAL_CATALOG_FILE), { recursive: true });
  writeFileSync(LOCAL_CATALOG_FILE, JSON.stringify(catalog), "utf8");
}

async function readStorageCatalog(): Promise<unknown | null> {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb.storage.from(CATALOG_BUCKET).download(CATALOG_PATH);
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("not found") || msg.includes("object not found") || msg.includes("{}")) return null;
    throw new Error(error.message);
  }
  return JSON.parse(await data.text()) as unknown;
}

export async function handleTemplateCatalogGet(_req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  try {
    const catalog = hasSupabaseStorage() ? await readStorageCatalog() : readLocalCatalog();
    res.json({ ok: true, catalog });
  } catch (e) {
    res.status(502).json({ ok: false, error: `template_catalog_read_failed: ${String(e)}` });
  }
}

export async function handleTemplateCatalogPut(req: Request, res: Response): Promise<void> {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error, message: "관리자 권한이 필요합니다." });
    return;
  }

  const catalog = parseCatalog(req.body?.catalog);
  if (!catalog) {
    res.status(400).json({ ok: false, error: "invalid_catalog", message: "카탈로그 형식이 올바르지 않습니다." });
    return;
  }
  const json = JSON.stringify(catalog);
  if (Buffer.byteLength(json, "utf8") > MAX_CATALOG_BYTES) {
    res.status(413).json({
      ok: false,
      error: "catalog_too_large",
      message: "템플릿 데이터가 너무 큽니다. 큰 이미지 에셋을 줄여 주세요.",
    });
    return;
  }

  if (!hasSupabaseStorage()) {
    writeLocalCatalog(catalog);
    res.json({ ok: true, catalog, storage: "local" });
    return;
  }

  try {
    const sb = getSupabaseServiceClient();
    const { error } = await sb.storage.from(CATALOG_BUCKET).upload(CATALOG_PATH, Buffer.from(json, "utf8"), {
      upsert: true,
      contentType: "application/json",
      cacheControl: "0",
    });
    if (error) throw new Error(error.message);
    res.json({ ok: true, catalog, storage: "supabase" });
  } catch (e) {
    res.status(500).json({ ok: false, error: "storage_failed", message: `템플릿 저장 실패: ${String(e)}` });
  }
}
