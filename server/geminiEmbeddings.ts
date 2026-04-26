import { request } from "undici";

export async function embedTextWithGemini(text: string, opts?: { model?: string }): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY?.trim() || "";
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = (opts?.model ?? "text-embedding-004").trim();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(
    key
  )}`;

  const body = JSON.stringify({
    content: { parts: [{ text }] },
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
  const data = JSON.parse(raw) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values;
  if (!Array.isArray(values) || values.length < 16) {
    throw new Error("embedContent returned invalid embedding");
  }
  return values;
}

