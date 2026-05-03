import { apiUrl } from "@/lib/apiUrl";

export type SimplyHeartStep = 1 | 2 | 3 | 4;

export type SimplyHeartImagePart = { mimeType: string; data: string };

export async function postSimplyHeartStep(args: {
  step: SimplyHeartStep;
  text: string;
  pdfBase64?: string;
  images?: SimplyHeartImagePart[];
  prior?: Partial<Record<"1" | "2" | "3", string>>;
}): Promise<{ text: string; model?: string }> {
  const r = await fetch(apiUrl("/api/simply-heart/step"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; text?: string; model?: string };
  if (!r.ok || !j?.ok) {
    throw new Error(j?.error || `Simply Heart API 오류 (${r.status})`);
  }
  return { text: String(j.text ?? ""), model: j.model };
}
