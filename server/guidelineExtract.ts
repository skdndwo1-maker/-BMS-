import { readFileSync } from "node:fs";

export async function extractGuidelineText(absPath: string, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    // Keep this import dynamic to avoid cold start issues.
    const pdfParseMod = (await import("pdf-parse")) as unknown as { default: (buf: Buffer) => Promise<{ text: string }> };
    const buf = readFileSync(absPath);
    const out = await pdfParseMod.default(buf);
    return String(out.text ?? "").trim();
  }
  // For images etc, we don't OCR here. Fall back to empty (summary is still stored in store.ts).
  return "";
}

