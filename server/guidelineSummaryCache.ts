import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

import {
  extractGuidelineSummarySource,
  guidelineSummaryPromptVersion,
  summarizeGuidelineFile,
  type GuidelineSummaryPurpose,
} from "./gemini/guideline.js";
import { getSupabaseServiceClient } from "./supabase.js";
import type { GuidelineRecord } from "./store.js";
import { resolveStoredPath, setGuideline } from "./store.js";

export type GuidelineSummaryCacheResult = {
  summary: string;
  cache: "hit" | "miss" | "skip";
  model: string | null;
};

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** checksum = sha256(요약 원문 + prompt_version). 이미지면 sha256("image:" + base64 + version). */
export function checksumForGuidelineSummarySource(
  source:
    | { kind: "text"; sourceText: string }
    | { kind: "image"; base64: string },
  promptVersion: string = guidelineSummaryPromptVersion("design")
): string {
  const payload =
    source.kind === "text"
      ? `${source.sourceText}${promptVersion}`
      : `image:${source.base64}${promptVersion}`;
  return sha256Hex(payload);
}

async function lookupCachedSummary(
  sourceKey: string,
  checksum: string
): Promise<{ summary: string; model: string | null } | null> {
  try {
    if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return null;
    }
    const sb = getSupabaseServiceClient();
    const { data, error } = await sb
      .from("guideline_summaries")
      .select("summary, model")
      .eq("source_key", sourceKey)
      .eq("checksum", checksum)
      .maybeSingle();
    if (error) {
      console.warn("[guideline_summary] lookup failed:", error.message);
      return null;
    }
    if (!data?.summary?.trim()) return null;
    return {
      summary: data.summary,
      model: typeof data.model === "string" ? data.model : null,
    };
  } catch (e) {
    console.warn(
      "[guideline_summary] lookup error:",
      e instanceof Error ? e.message : String(e)
    );
    return null;
  }
}

async function upsertCachedSummary(row: {
  source_key: string;
  checksum: string;
  summary: string;
  model: string | null;
  prompt_version: string;
}): Promise<void> {
  try {
    if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return;
    }
    const sb = getSupabaseServiceClient();
    const { error } = await sb.from("guideline_summaries").upsert(row, {
      onConflict: "source_key,checksum",
      ignoreDuplicates: true,
    });
    if (error) {
      console.warn("[guideline_summary] upsert failed:", error.message);
    }
  } catch (e) {
    console.warn(
      "[guideline_summary] upsert error:",
      e instanceof Error ? e.message : String(e)
    );
  }
}

/**
 * 검수용 가이드라인 AI 요약: DB 캐시 hit면 재사용, miss면 Gemini 요약 후 upsert.
 * DB 실패 시에도 요약 생성으로 진행 (fail-open).
 */
export async function getOrCreateGuidelineSummary(opts: {
  sourceKey: string;
  filePath: string;
  mimeType: string;
  purpose?: GuidelineSummaryPurpose;
}): Promise<GuidelineSummaryCacheResult> {
  const purpose = opts.purpose ?? "design";
  const promptVersion = guidelineSummaryPromptVersion(purpose);
  const source = await extractGuidelineSummarySource(opts.filePath, opts.mimeType);
  if (source.kind === "empty") {
    const generated = await summarizeGuidelineFile(opts.filePath, opts.mimeType, { purpose });
    return { summary: generated.summary, cache: "skip", model: generated.model };
  }

  const checksum = checksumForGuidelineSummarySource(
    source.kind === "text"
      ? { kind: "text", sourceText: source.sourceText }
      : { kind: "image", base64: source.base64 },
    promptVersion
  );

  const hit = await lookupCachedSummary(opts.sourceKey, checksum);
  if (hit) {
    return { summary: hit.summary, cache: "hit", model: hit.model };
  }

  const generated = await summarizeGuidelineFile(opts.filePath, opts.mimeType, { purpose });
  if (generated.summary.trim() && !generated.summary.startsWith("[GEMINI_API_KEY 없음]")) {
    await upsertCachedSummary({
      source_key: opts.sourceKey,
      checksum,
      summary: generated.summary,
      model: generated.model,
      prompt_version: promptVersion,
    });
  }
  return { summary: generated.summary, cache: "miss", model: generated.model };
}

/** 슬롯에 aiSummary가 없으면 캐시/생성 후 로컬 meta에 반영. */
export async function ensureGuidelineAiSummary(
  g: GuidelineRecord,
  opts?: { purpose?: GuidelineSummaryPurpose; force?: boolean }
): Promise<{ record: GuidelineRecord; cache: "hit" | "miss" | "skip" | "local" }> {
  if (g.aiSummary?.trim() && !opts?.force) {
    return { record: g, cache: "local" };
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return { record: g, cache: "skip" };
  }
  const abs = resolveStoredPath(g.storedRelativePath);
  if (!existsSync(abs)) {
    return { record: g, cache: "skip" };
  }

  const result = await getOrCreateGuidelineSummary({
    sourceKey: g.id,
    filePath: abs,
    mimeType: g.mimeType,
    purpose: opts?.purpose ?? "design",
  });

  const next: GuidelineRecord = {
    ...g,
    aiSummary: result.summary,
    aiAnalyzedAt: new Date().toISOString(),
  };
  setGuideline(next);
  return { record: next, cache: result.cache };
}
