/**
 * 본문 굵게: `**` 마크다운 대신 plain 텍스트 + 문자 구간 범위로 저장 (입력란에 ** 미표시)
 */

export type BoldRange = { start: number; end: number };

/** 레거시 `**굵게**` 문자열 → plain + 범위 */
export function migrateBoldMarkdownToRanges(text: string): { plain: string; ranges: BoldRange[] } {
  const ranges: BoldRange[] = [];
  let plain = "";
  let i = 0;
  const re = /\*\*([\s\S]*?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    plain += text.slice(i, m.index);
    const inner = m[1];
    const start = plain.length;
    plain += inner;
    ranges.push({ start, end: plain.length });
    i = re.lastIndex;
  }
  plain += text.slice(i);
  return { plain, ranges };
}

/** 범위가 유효하도록 클램프·정렬 */
export function sanitizeBoldRanges(plainLength: number, ranges: BoldRange[] | undefined): BoldRange[] {
  if (!ranges?.length) return [];
  return ranges
    .map((r) => ({
      start: Math.max(0, Math.min(plainLength, Math.min(r.start, r.end))),
      end: Math.max(0, Math.min(plainLength, Math.max(r.start, r.end))),
    }))
    .filter((r) => r.end > r.start);
}

export function applyBoldToSelection(
  plain: string,
  ranges: BoldRange[],
  selStart: number,
  selEnd: number
): { plain: string; ranges: BoldRange[] } {
  if (selStart === selEnd) return { plain, ranges: sanitizeBoldRanges(plain.length, ranges) };
  const a = Math.min(selStart, selEnd);
  const b = Math.max(selStart, selEnd);
  const next = [...sanitizeBoldRanges(plain.length, ranges)];
  next.push({ start: a, end: b });
  return mergeOverlappingBoldRanges(plain, next);
}

function mergeOverlappingBoldRanges(plain: string, ranges: BoldRange[]): { plain: string; ranges: BoldRange[] } {
  const sorted = [...ranges].sort((x, y) => x.start - y.start);
  const merged: BoldRange[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (!last || r.start > last.end) merged.push({ ...r });
    else last.end = Math.max(last.end, r.end);
  }
  return { plain, ranges: sanitizeBoldRanges(plain.length, merged) };
}

/** 텍스트 편집 후 범위 보정 (삽입/삭제 단순 모델: 커서 이후 범위 이동) */
export function shiftBoldRangesOnEdit(
  ranges: BoldRange[],
  changePos: number,
  delta: number
): BoldRange[] {
  if (delta === 0) return ranges;
  return ranges
    .map((r) => {
      if (changePos >= r.end) return r;
      if (changePos <= r.start) return { start: r.start + delta, end: r.end + delta };
      if (changePos < r.end) {
        return { start: r.start, end: Math.max(r.start, r.end + delta) };
      }
      return r;
    })
    .filter((r) => r.end > r.start);
}

/** 한 번에 바뀐 plain 문자열에 맞춰 굵게 범위 보정 */
export function adjustBoldRangesOnPlainReplace(
  oldPlain: string,
  newPlain: string,
  ranges: BoldRange[]
): BoldRange[] {
  let start = 0;
  const minLen = Math.min(oldPlain.length, newPlain.length);
  while (start < minLen && oldPlain[start] === newPlain[start]) start++;
  let o = oldPlain.length;
  let n = newPlain.length;
  while (o > start && n > start && oldPlain[o - 1] === newPlain[n - 1]) {
    o--;
    n--;
  }
  const delta = n - o;
  return sanitizeBoldRanges(newPlain.length, shiftBoldRangesOnEdit(ranges, start, delta));
}
