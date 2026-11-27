/**
 * 2026 U+ 전사 브랜드 가이드라인 슬롯 PDF AI 요약 생성
 * 사용: npx tsx scripts/analyze-company-brand-2026.ts
 */
import "../server/load-env.ts";
import { existsSync } from "node:fs";

import { ensureFixedGuidelineSlotAsync } from "../server/fixedGuidelines.ts";
import { summarizeGuidelineFile } from "../server/gemini.ts";
import { getGuideline, resolveStoredPath, setGuideline } from "../server/store.ts";

const id = "uplus-company-brand-2026";

async function main() {
  await ensureFixedGuidelineSlotAsync(id);
  const rec = getGuideline(id);
  if (!rec) {
    console.error(`[analyze] guidelines-meta.json에 "${id}" 레코드가 없습니다.`);
    process.exit(1);
  }
  const abs = resolveStoredPath(rec.storedRelativePath);
  if (!existsSync(abs)) {
    console.error(`[analyze] 파일 없음: ${abs}`);
    process.exit(1);
  }
  console.error(`[analyze] 파일: ${abs} (purpose=naming)`);
  const { summary, model } = await summarizeGuidelineFile(abs, rec.mimeType, { purpose: "naming" });
  if (!summary?.trim()) {
    console.error("[analyze] 요약이 비어 있습니다.");
    process.exit(1);
  }
  setGuideline({
    ...rec,
    aiSummary: summary,
    aiAnalyzedAt: new Date().toISOString(),
  });
  console.error(`[analyze] 완료 model=${model ?? "-"} chars=${summary.length}`);
  console.log(summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
