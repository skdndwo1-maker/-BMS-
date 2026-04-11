/**
 * 등록된 U+ VI 가이드라인 슬롯 PDF에 대해 Gemini로 요약 생성 (루트 .env의 GEMINI_API_KEY 필요)
 * 사용: npm run analyze:guideline
 */
import { existsSync } from "node:fs";

import { summarizeGuidelineFile } from "../server/gemini.ts";
import { getGuideline, resolveStoredPath, setGuideline } from "../server/store.ts";

const id = "uplus-vi-guideline";

async function main() {
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
  console.error(`[analyze] 파일: ${abs}`);
  const { summary } = await summarizeGuidelineFile(abs, rec.mimeType);
  rec.aiSummary = summary;
  rec.aiAnalyzedAt = new Date().toISOString();
  setGuideline(rec);
  console.log(summary);
  console.error("[analyze] guidelines-meta.json 업데이트 완료");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
