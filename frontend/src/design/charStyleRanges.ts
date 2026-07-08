/**
 * 문자 구간 스타일(굵게/기울임/밑줄) — plain 텍스트 기준 [start,end)
 */

export type CharRange = { start: number; end: number };

/** 부분 색상 — 같은 [start,end) 범위에 색상값을 함께 보관 */
export type ColorRange = { start: number; end: number; color: string };

/** 부분 굵기 — plain 텍스트 기준 [start,end) + fontWeight */
export type WeightRange = { start: number; end: number; weight: number };

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

/** 색상 구간 정리 — 텍스트 길이로 클램프, 시작이 끝보다 큰 항목 제거 */
export function sanitizeColorRanges(len: number, ranges: ColorRange[] | undefined): ColorRange[] {
  if (!ranges?.length) return [];
  return ranges
    .map((r) => ({
      start: Math.max(0, Math.min(len, Math.min(r.start, r.end))),
      end: Math.max(0, Math.min(len, Math.max(r.start, r.end))),
      color: r.color,
    }))
    .filter((r) => r.end > r.start && typeof r.color === "string" && r.color.length > 0);
}

/**
 * 선택 구간 [a,b)에 색상을 적용. 기존 색상 구간이 부분 겹치면 잘라낸 뒤 새 색을 덮어씌운다.
 * (같은 색이 이어지면 자연스럽게 합쳐지도록 머지)
 */
export function applyColorOnSelection(
  plain: string,
  ranges: ColorRange[] | undefined,
  selStart: number,
  selEnd: number,
  color: string
): ColorRange[] {
  const len = plain.length;
  const a = Math.max(0, Math.min(len, Math.min(selStart, selEnd)));
  const b = Math.max(0, Math.min(len, Math.max(selStart, selEnd)));
  if (a === b) return sanitizeColorRanges(len, ranges);
  const cur = sanitizeColorRanges(len, ranges);
  const out: ColorRange[] = [];
  for (const r of cur) {
    if (r.end <= a || r.start >= b) {
      out.push(r);
      continue;
    }
    if (r.start < a) out.push({ start: r.start, end: a, color: r.color });
    if (r.end > b) out.push({ start: b, end: r.end, color: r.color });
  }
  out.push({ start: a, end: b, color });
  out.sort((x, y) => x.start - y.start);
  const merged: ColorRange[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && last.end === r.start && last.color === r.color) last.end = r.end;
    else merged.push({ ...r });
  }
  return merged;
}

export function sanitizeWeightRanges(len: number, ranges: WeightRange[] | undefined): WeightRange[] {
  if (!ranges?.length) return [];
  return ranges
    .map((r) => ({
      start: Math.max(0, Math.min(len, Math.min(r.start, r.end))),
      end: Math.max(0, Math.min(len, Math.max(r.start, r.end))),
      weight: Math.min(900, Math.max(100, Math.round(Number(r.weight) || 400))),
    }))
    .filter((r) => r.end > r.start);
}

/** 선택 구간 [a,b)에 굵기를 적용 */
export function applyWeightOnSelection(
  plain: string,
  ranges: WeightRange[] | undefined,
  selStart: number,
  selEnd: number,
  weight: number
): WeightRange[] {
  const len = plain.length;
  const a = Math.max(0, Math.min(len, Math.min(selStart, selEnd)));
  const b = Math.max(0, Math.min(len, Math.max(selStart, selEnd)));
  const w = Math.min(900, Math.max(100, Math.round(weight)));
  if (a === b) return sanitizeWeightRanges(len, ranges);
  const cur = sanitizeWeightRanges(len, ranges);
  const out: WeightRange[] = [];
  for (const r of cur) {
    if (r.end <= a || r.start >= b) {
      out.push(r);
      continue;
    }
    if (r.start < a) out.push({ start: r.start, end: a, weight: r.weight });
    if (r.end > b) out.push({ start: b, end: r.end, weight: r.weight });
  }
  out.push({ start: a, end: b, weight: w });
  out.sort((x, y) => x.start - y.start);
  const merged: WeightRange[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && last.end === r.start && last.weight === r.weight) last.end = r.end;
    else merged.push({ ...r });
  }
  return merged;
}
