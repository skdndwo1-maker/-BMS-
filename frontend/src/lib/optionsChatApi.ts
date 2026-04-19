import { apiUrl } from "./apiUrl";

export type OptionsChatMessage = { role: "user" | "assistant"; content: string };

export async function postOptionsChat(messages: OptionsChatMessage[]): Promise<string> {
  const r = await fetch(apiUrl("/api/options/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages })
  });
  const data = (await r.json()) as { ok?: boolean; text?: string; error?: string };
  if (!r.ok || !data.ok) {
    throw new Error(data.error ?? `요청 실패 (${r.status})`);
  }
  if (typeof data.text !== "string") {
    throw new Error("응답 형식이 올바르지 않습니다.");
  }
  return data.text;
}
