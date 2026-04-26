import { request } from "undici";

/** Must match `public.rag_embeddings.embedding` — `vector(768)` in migrations. */
export const GEMINI_RAG_EMBEDDING_DIM = 768;

function parseEmbeddingValues(raw: string): number[] {
  const data = JSON.parse(raw) as Record<string, unknown>;
  const tryValues = (v: unknown): number[] | null => {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "number") return v as number[];
    return null;
  };
  const emb = data.embedding as Record<string, unknown> | undefined;
  if (emb) {
    const a = tryValues(emb.values);
    if (a) return a;
    const b = tryValues(emb.value);
    if (b) return b;
  }
  const embs = data.embeddings as Array<{ values?: number[]; value?: number[] }> | undefined;
  if (Array.isArray(embs) && embs[0]) {
    const a = tryValues(embs[0].values);
    if (a) return a;
    const b = tryValues(embs[0].value);
    if (b) return b;
  }
  throw new Error("embedContent: no embedding values in response (expected embedding.values or embeddings[0].values)");
}

/** DB stores vector(768). If model returns longer (e.g. 3072), keep first 768 (Matryoshka truncation). */
function normalizeToDim(values: number[], dim: number): number[] {
  if (values.length === dim) return values;
  if (values.length > dim) {
    console.warn(
      `[embed] truncating embedding from ${values.length} to ${dim} (DB vector(${dim})); send outputDimensionality=${dim} to avoid this`
    );
    return values.slice(0, dim);
  }
  throw new Error(
    `embedContent: embedding too short: got ${values.length} dims, need at least ${dim} (change model or outputDimensionality)`
  );
}

export async function embedTextWithGemini(
  text: string,
  opts?: { model?: string; outputDimensionality?: number }
): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY?.trim() || "";
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = (opts?.model ?? "gemini-embedding-001").trim();
  const outDim = opts?.outputDimensionality ?? GEMINI_RAG_EMBEDDING_DIM;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(
    key
  )}`;

  const body = JSON.stringify({
    content: { parts: [{ text }] },
    outputDimensionality: outDim,
  });

  const r = await request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const raw = await r.body.text();
  if (r.statusCode < 200 || r.statusCode >= 300) {
    throw new Error(`embedContent failed (${r.statusCode}): ${raw.slice(0, 300)}`);
  }
  const values = parseEmbeddingValues(raw);
  if (values.length < 16) {
    throw new Error(`embedContent returned invalid embedding (length ${values.length})`);
  }
  return normalizeToDim(values, outDim);
}
