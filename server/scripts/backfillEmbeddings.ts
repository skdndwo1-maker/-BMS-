import "../load-env.js";
import { backfillMissingEmbeddings } from "../rag.js";
import { embedTextWithGemini } from "../geminiEmbeddings.js";

async function main() {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.error("GEMINI_API_KEY missing — cannot embed.");
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.");
    process.exit(1);
  }
  console.log("[backfill] starting…");
  const result = await backfillMissingEmbeddings({
    embed: (text: string) => embedTextWithGemini(text),
    embeddingModel: "gemini-embedding-001",
    expectedVectorDimensions: 768,
    limit: 1000,
  });
  console.log("[backfill] result:", result);
}

main().catch((e) => {
  console.error("[backfill] error:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
