/**
 * 문자 구간 스타일(굵게/기울임/밑줄) — plain 텍스트 기준 [start,end)
 */

export type CharRange = { start: number; end: number };

export function sanitizeCharRanges(len: number, ranges: CharRange[] | undefined): CharRange[] {
  if (!ranges?.length) return [];
  return ranges
    .map((r) => ({
      start: Math.max(0, Math.min(len, Math.min(r.start, r.end))),
      end: Math.max(0, Math.min(len, Math.max(r.start, r.end))),
    }))
    .filter((r) => r.end > r.start);
}

function mergeOverlapping(ranges: CharRange[]): CharRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: CharRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (!last || r.start > last.end) out.push({ ...r });
    else last.end = Math.max(last.end, r.end);
  }
  return out;
}

/** 구간 [a,b)가 ranges 합집합으로 덮이는지(문자 단위) */
export function isFullyCovered(ranges: CharRange[], a: number, b: number): boolean {
  if (a >= b) return true;
  const merged = mergeOverlapping(sanitizeCharRanges(1e9, ranges));
  let p = a;
  for (const r of merged) {
    if (r.end <= p) continue;
    if (r.start > p) return false;
    p = Math.max(p, r.end);
    if (p >= b) return true;
  }
  return p >= b;
}

function subtractRange(ranges: CharRange[], a: number, b: number): CharRange[] {
  const A = Math.min(a, b);
  const B = Math.max(a, b);
  const out: CharRange[] = [];
  for (const r of mergeOverlapping(sanitizeCharRanges(1e9, ranges))) {
    if (r.end <= A || r.start >= B) {
      out.push(r);
      continue;
    }
    if (r.start < A) out.push({ start: r.start, end: A });
    if (r.end > B) out.push({ start: B, end: r.end });
  }
  return mergeOverlapping(out);
}

export function toggleCharRangesOnSelection(
  plain: string,
  ranges: CharRange[] | undefined,
  selStart: number,
  selEnd: number
): CharRange[] {
  const len = plain.length;
  const a = Math.max(0, Math.min(len, Math.min(selStart, selEnd)));
  const b = Math.max(0, Math.min(len, Math.max(selStart, selEnd)));
  const cur = sanitizeCharRanges(len, ranges);
  if (a === b) return cur;
  if (isFullyCovered(cur, a, b)) return subtractRange(cur, a, b);
  const next = [...cur, { start: a, end: b }];
  return sanitizeCharRanges(len, mergeOverlapping(next));
}
