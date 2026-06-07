import { apiUrl } from "@/lib/apiUrl";

export type SimplyHeartImagePart = { mimeType: string; data: string };

/** 심플리 가이드 통합 분석 (서버 step=0) */
export async function postSimplyHeartStep(args: {
  text: string;
  pdfBase64?: string;
  images?: SimplyHeartImagePart[];
  mode?: "audit" | "generate";
}): Promise<{ text: string; model?: string }> {
  const r = await fetch(apiUrl("/api/simply-heart/step"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      step: 0,
      text: args.text,
      pdfBase64: args.pdfBase64,
      images: args.images,
      mode: args.mode ?? "audit",
    }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; text?: string; model?: string };
  if (!r.ok || !j?.ok) {
    throw new Error(j?.error || `Simply Heart API 오류 (${r.status})`);
  }
  return { text: String(j.text ?? ""), model: j.model };
}
