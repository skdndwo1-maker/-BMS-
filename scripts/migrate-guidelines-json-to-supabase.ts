/**
 * Import `data/guidelines-meta.json` (via server/store) into public.guidelines.
 *
 * Usage:
 *   npm run migrate:guidelines
 *   npm run migrate:guidelines -- --dry-run
 */
import { existsSync } from "node:fs";

import "../server/load-env.js";
import { fileSha256Hex } from "../server/rag.js";
import { loadMeta, resolveStoredPath } from "../server/store.js";
import { getSupabaseServiceClient } from "../server/supabase.js";

/** Slot id → guidelines.type (vi | naming | simply) */
const GUIDELINE_TYPE_BY_ID: Record<string, "vi" | "naming" | "simply"> = {
  "uplus-brand-guideline": "vi",
  "uplus-vi-guideline": "vi",
  "design-editor-brand-guideline": "vi",
  "simply-uplus-guideline": "simply",
  "simply-uplus-job-guide": "simply",
};

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const meta = loadMeta();
  const sb = getSupabaseServiceClient();
  const rows = Object.values(meta.guidelines);

  if (rows.length === 0) {
    console.log("[migrate] no guidelines in meta JSON");
    return;
  }

  for (const rec of rows) {
    const type = GUIDELINE_TYPE_BY_ID[rec.id];
    if (!type) {
      console.warn(`[migrate] skip unknown id (add to GUIDELINE_TYPE_BY_ID): ${rec.id}`);
      continue;
    }

    const abs = resolveStoredPath(rec.storedRelativePath);
    const checksum = existsSync(abs) ? fileSha256Hex(abs) : null;
    if (!checksum) {
      console.warn(`[migrate] missing PDF for ${rec.id}: ${abs}`);
    }

    const payload = {
      id: rec.id,
      type,
      title: rec.displayName,
      pdf_path: rec.storedRelativePath,
      checksum,
      version: 1,
      created_at: rec.uploadedAt,
      updated_at: rec.aiAnalyzedAt ?? rec.uploadedAt,
    };

    console.log("[migrate] upsert", rec.id, type, checksum?.slice(0, 12) ?? "no-checksum");

    if (dryRun) continue;

    const { error } = await sb.from("guidelines").upsert(payload, { onConflict: "id" });
    if (error) throw new Error(`${rec.id}: ${error.message}`);

    const { error: histErr } = await sb.from("guidelines_history").upsert(
      {
        guideline_id: rec.id,
        version: 1,
        change_reason: "Initial import from data/guidelines-meta.json",
        changed_at: rec.uploadedAt,
      },
      { onConflict: "guideline_id,version", ignoreDuplicates: true }
    );
    if (histErr) throw new Error(`${rec.id} history: ${histErr.message}`);
  }

  console.log("[migrate] done", dryRun ? "(dry-run)" : "");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
