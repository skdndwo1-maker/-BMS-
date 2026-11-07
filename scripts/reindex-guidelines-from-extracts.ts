/**
 * Re-index guideline RAG from guideline_extracts (or local PDF → extract → index).
 *
 * Usage:
 *   npm run reindex:guidelines -- --dry-run
 *   npm run reindex:guidelines
 *   npm run reindex:guidelines -- --force   # ignore same-checksum skip
 */
import "../server/load-env.js";
import {
  GUIDELINE_RAG_SLOT_IDS,
  formatEstDuration,
  indexGuidelineFromExtract,
  planGuidelineRagIndex,
} from "../server/guidelineRagIndex.js";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

async function main() {
  console.log(
    `[reindex] mode=${dryRun ? "dry-run" : "apply"} force=${force} slots=${GUIDELINE_RAG_SLOT_IDS.length}`
  );

  if (dryRun) {
    let totalChunks = 0;
    let totalEmbeds = 0;
    let totalMs = 0;
    for (const slotId of GUIDELINE_RAG_SLOT_IDS) {
      const plan = await planGuidelineRagIndex(slotId);
      totalChunks += plan.chunkCount;
      totalEmbeds += plan.embedCalls;
      totalMs += plan.estMs;
      console.log(
        [
          `[dry-run] ${slotId}`,
          `title=${JSON.stringify(plan.title)}`,
          `chars=${plan.charCount}`,
          `checksum=${plan.checksum ? plan.checksum.slice(0, 8) : "null"}`,
          `chunks=${plan.chunkCount}`,
          `embed_calls=${plan.embedCalls}`,
          `est=${formatEstDuration(plan.estMs)}`,
          plan.skipReason ? `skip=${plan.skipReason}` : "action=index",
        ].join(" | ")
      );
    }
    console.log(
      `[dry-run] TOTAL chunks=${totalChunks} embed_calls=${totalEmbeds} est=${formatEstDuration(totalMs)}`
    );
    console.log("[dry-run] DB unchanged. Remove --dry-run to apply.");
    return;
  }

  for (const slotId of GUIDELINE_RAG_SLOT_IDS) {
    const result = await indexGuidelineFromExtract(slotId, { force });
    if (result.skipped) {
      console.log(
        `[reindex] SKIP ${slotId} reason=${result.skipReason ?? "unknown"} chunks=${result.chunkCount} embeddings=${result.embedded}`
      );
      continue;
    }
    if (!result.ok) {
      console.error(
        `[reindex] FAIL ${slotId} error=${result.error ?? "unknown"} source=${result.sourceId ?? "none"}`
      );
      continue;
    }
    console.log(
      `[reindex] OK ${slotId} source=${result.sourceId?.slice(0, 8) ?? "?"} chunks=${result.chunkCount} embeddings=${result.embedded} inserted=${result.inserted} failed=${result.failed}`
    );
  }
  console.log("[reindex] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
