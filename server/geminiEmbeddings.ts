import { request } from "undici";

/** DB `rag_embeddings.embedding` is `vector(768)` — 반드시 768차원으로 맞춤 */
const EMBEDDING_DIM = 768;

/**
 * `text-embedding-004` 등 구 ID는 최신 Generative Language API에서 embedContent 404가 나는 경우가 많음.
 * `GEMINI_EMBEDDING_MODEL`로 덮어쓸 수 있으며, 실패 시 후보를 순서대로 시도합니다.
 */
const EMBEDDING_MODEL_FALLBACKS = ["gemini-embedding-001", "gemini-embedding-2"] as const;

export async function embedTextWithGemini(text: string, opts?: { model?: string }): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY?.trim() || "";
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const fromEnv = process.env.GEMINI_EMBEDDING_MODEL?.trim();
  const fromOpts = opts?.model?.trim();
  const candidates = [...new Set([fromOpts, fromEnv, ...EMBEDDING_MODEL_FALLBACKS].filter(Boolean) as string[])];

  let lastErr = "";
  for (const model of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(
      key
    )}`;

    const body = JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIM,
    });

    const r = await request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const raw = await r.body.text();
    if (r.statusCode < 200 || r.statusCode >= 300) {
      lastErr = `embedContent ${model} failed (${r.statusCode}): ${raw.slice(0, 300)}`;
      if (r.statusCode === 404 || /not found|not supported for embedContent/i.test(raw)) continue;
      throw new Error(lastErr);
    }
    const data = JSON.parse(raw) as { embedding?: { values?: number[] } };
    const values = data.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
      lastErr = `embedContent ${model} returned invalid embedding (len=${values?.length ?? 0}, expected ${EMBEDDING_DIM})`;
      continue;
    }
    return values;
  }
  throw new Error(lastErr || "embedContent: all embedding model candidates failed");
}

