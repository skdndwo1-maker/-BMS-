import { useEffect, useMemo, useSyncExternalStore } from "react";
import { apiUrl } from "@/lib/apiUrl";
import { templateCategories as builtinCategories, templates as builtinTemplates } from "./templates";
import type { Template, TemplateCategoryDef } from "./types";

/**
 * 관리자가 편집한 템플릿 카탈로그.
 * 기본 템플릿(코드)은 그대로 두고, 수정·추가·삭제분만 저장해 병합한다.
 */
export type TemplateCatalog = {
  version: 1;
  /** null이면 기본 제작물 유형 사용 */
  categories: TemplateCategoryDef[] | null;
  /** 기본 템플릿과 같은 id = 덮어쓰기, 새 id = 신규 템플릿 */
  templates: Template[];
  deletedTemplateIds: string[];
  updatedAt?: string;
};

type CatalogState = {
  catalog: TemplateCatalog;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

const CACHE_KEY = "brandAxis:templateCatalog:v1";
const BUILTIN_IDS = new Set(builtinTemplates.map((t) => t.id));

export function emptyTemplateCatalog(): TemplateCatalog {
  return { version: 1, categories: null, templates: [], deletedTemplateIds: [] };
}

function normalizeCatalog(raw: unknown): TemplateCatalog {
  if (!raw || typeof raw !== "object") return emptyTemplateCatalog();
  const r = raw as Partial<TemplateCatalog>;
  return {
    version: 1,
    categories: Array.isArray(r.categories) ? r.categories : null,
    templates: Array.isArray(r.templates) ? r.templates : [],
    deletedTemplateIds: Array.isArray(r.deletedTemplateIds) ? r.deletedTemplateIds.map(String) : [],
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
  };
}

function readCache(): TemplateCatalog | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalizeCatalog(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCache(catalog: TemplateCatalog): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(catalog));
  } catch {
    /* 용량 초과 시 캐시 생략 */
  }
}

let state: CatalogState = {
  catalog: readCache() ?? emptyTemplateCatalog(),
  status: "idle",
  error: null,
};
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function setState(patch: Partial<CatalogState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): CatalogState {
  return state;
}

export function loadTemplateCatalog(): Promise<void> {
  if (inflight) return inflight;
  setState({ status: "loading" });
  inflight = (async () => {
    try {
      const r = await fetch(apiUrl("/api/templates/catalog"), { cache: "no-store" });
      const out = (await r.json().catch(() => ({}))) as { catalog?: unknown; error?: string };
      if (!r.ok) throw new Error(out.error ?? `catalog ${r.status}`);
      const catalog = out.catalog ? normalizeCatalog(out.catalog) : emptyTemplateCatalog();
      writeCache(catalog);
      setState({ catalog, status: "ready", error: null });
    } catch (e) {
      setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function saveTemplateCatalog(next: TemplateCatalog, accessToken: string | null): Promise<TemplateCatalog> {
  if (!accessToken) throw new Error("관리자 계정으로 로그인해야 저장할 수 있습니다.");
  const r = await fetch(apiUrl("/api/templates/catalog"), {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ catalog: next }),
  });
  const out = (await r.json().catch(() => ({}))) as { catalog?: unknown; error?: string; message?: string };
  if (!r.ok) {
    if (r.status === 401) throw new Error("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
    if (r.status === 403) throw new Error("관리자 권한이 없습니다.");
    throw new Error(out.message ?? out.error ?? `저장 실패 (${r.status})`);
  }
  const saved = normalizeCatalog(out.catalog ?? next);
  writeCache(saved);
  setState({ catalog: saved, status: "ready", error: null });
  return saved;
}

export function mergeTemplates(catalog: TemplateCatalog): Template[] {
  const deleted = new Set(catalog.deletedTemplateIds);
  const overrides = new Map(catalog.templates.map((t) => [t.id, t]));
  const merged = builtinTemplates
    .filter((t) => !deleted.has(t.id))
    .map((t) => {
      const o = overrides.get(t.id);
      return o ? { ...t, ...o, id: t.id, isCustom: false } : t;
    });
  for (const t of catalog.templates) {
    if (BUILTIN_IDS.has(t.id) || deleted.has(t.id)) continue;
    merged.push({ ...t, isCustom: true });
  }
  return merged;
}

export function mergeCategories(catalog: TemplateCatalog): TemplateCategoryDef[] {
  return catalog.categories ?? builtinCategories;
}

export function upsertCatalogTemplate(catalog: TemplateCatalog, template: Template): TemplateCatalog {
  const rest = catalog.templates.filter((t) => t.id !== template.id);
  return {
    ...catalog,
    templates: [...rest, template],
    deletedTemplateIds: catalog.deletedTemplateIds.filter((id) => id !== template.id),
  };
}

export function removeCatalogTemplate(catalog: TemplateCatalog, templateId: string): TemplateCatalog {
  const templates = catalog.templates.filter((t) => t.id !== templateId);
  const deletedTemplateIds = BUILTIN_IDS.has(templateId)
    ? Array.from(new Set([...catalog.deletedTemplateIds, templateId]))
    : catalog.deletedTemplateIds;
  return { ...catalog, templates, deletedTemplateIds };
}

export function setCatalogCategories(catalog: TemplateCatalog, categories: TemplateCategoryDef[]): TemplateCatalog {
  return { ...catalog, categories };
}

export function isBuiltinTemplateId(id: string): boolean {
  return BUILTIN_IDS.has(id);
}

export function newCustomTemplateId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function newCustomCategoryId(): string {
  return `cat-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function useTemplateCatalog() {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    if (snap.status === "idle") void loadTemplateCatalog();
  }, [snap.status]);
  return useMemo(
    () => ({
      catalog: snap.catalog,
      templates: mergeTemplates(snap.catalog),
      categories: mergeCategories(snap.catalog),
      /** 서버 응답을 받았거나(성공/실패) 확인을 마쳤는지 */
      loaded: snap.status === "ready" || snap.status === "error",
      error: snap.error,
      reload: loadTemplateCatalog,
    }),
    [snap],
  );
}
