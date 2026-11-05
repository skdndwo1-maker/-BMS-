import { readFileSync } from "node:fs";
import { parsePdfBufferToText } from "./gemini/shared.js";

export async function extractGuidelineText(absPath: string, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const buf = readFileSync(absPath);
    return (await parsePdfBufferToText(buf)).trim();
  }
  // For images etc, we don't OCR here. Fall back to empty (summary is still stored in store.ts).
  return "";
}

