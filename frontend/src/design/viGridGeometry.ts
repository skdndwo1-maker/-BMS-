/**
 * VI 정렬 격자 — 캔버스 중앙 기준 좌우·상하 대칭 분할.
 * step 간격으로 중앙에서 ±방향으로 선을 배치하고 0·size 경계를 포함합니다.
 */

function roundPx(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 중앙 대칭 격자선 위치(px). 좌우(또는 상하) 여백이 항상 동일합니다. */
export function buildSymmetricAxisStops(size: number, step: number): number[] {
  const S = Math.max(size, 0);
  const st = Math.max(step, 0.25);
  if (S <= 0) return [0];

  const center = S / 2;
  const stops = new Set<number>([0, S, roundPx(center)]);

  let offset = st;
  while (offset < center - 1e-4) {
    stops.add(roundPx(center - offset));
    stops.add(roundPx(center + offset));
    offset += st;
  }

  return [...stops].sort((a, b) => a - b);
}

/** 대칭 격자선에 맞춰 좌표 스냅 (캔버스 중앙 기준) */
export function snapPxToSymmetricGrid(px: number, axisSize: number, step: number): number {
  if (step <= 0 || axisSize <= 0) return px;
  const center = axisSize / 2;
  const snapped = center + Math.round((px - center) / step) * step;
  return Math.max(0, Math.min(axisSize, roundPx(snapped)));
}

/** 대칭 격자에 맞춘 박스 크기(최소 step 배수, 중앙 정렬 분할과 동일 간격) */
export function snapSizeToSymmetricGrid(sizePx: number, step: number, minPx: number): number {
  if (step <= 0) return Math.max(minPx, sizePx);
  const snapped = Math.max(step, Math.round(sizePx / step) * step);
  return Math.max(minPx, snapped);
}
