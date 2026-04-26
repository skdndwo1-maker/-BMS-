import type { CharRange } from "./charStyleRanges";

export type ColorRange = CharRange & { hex: string };

function normHex(hex: string): string {
  const h = (hex ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h.toUpperCase();
  return "#1A1A1A";
}

export function sanitizeColorRanges(len: number, ranges: ColorRange[] | undefined): ColorRange[] {
  if (!ranges?.length) return [];
  const safe = ranges
    .map((r) => ({
      start: Math.max(0, Math.min(len, Math.min(r.start, r.end))),
      end: Math.max(0, Math.min(len, Math.max(r.start, r.end))),
      hex: normHex(r.hex),
    }))
    .filter((r) => r.end > r.start);
  safe.sort((a, b) => a.start - b.start || a.end - b.end);

  // merge adjacent with same color, and keep later ranges overriding overlaps
  const out: ColorRange[] = [];
  for (const r of safe) {
    if (out.length === 0) {
      out.push({ ...r });
      continue;
    }
    const last = out[out.length - 1]!;
    if (r.start >= last.end) {
      if (last.hex === r.hex && r.start === last.end) last.end = r.end;
      else out.push({ ...r });
      continue;
    }
    // overlap: trim last, then add r, then re-merge if needed
    if (r.start > last.start) last.end = r.start;
    else out.pop();
    out.push({ ...r });
  }
  return out;
}

/** 선택 구간 [a,b)에 단색을 덮어쓴다(기존 색상 구간은 해당 부분 제거). */
export function applyColorOnSelection(
  plain: string,
  ranges: ColorRange[] | undefined,
  selStart: number,
  selEnd: number,
  hex: string
): ColorRange[] {
  const len = plain.length;
  const a = Math.max(0, Math.min(len, Math.min(selStart, selEnd)));
  const b = Math.max(0, Math.min(len, Math.max(selStart, selEnd)));
  if (a === b) return sanitizeColorRanges(len, ranges);
  const c = sanitizeColorRanges(len, ranges);
  const kept: ColorRange[] = [];
  for (const r of c) {
    if (r.end <= a || r.start >= b) kept.push(r);
    else {
      if (r.start < a) kept.push({ ...r, end: a });
      if (r.end > b) kept.push({ ...r, start: b });
    }
  }
  kept.push({ start: a, end: b, hex: normHex(hex) });
  return sanitizeColorRanges(len, kept);
}

