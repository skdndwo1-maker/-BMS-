import { buildSymmetricAxisStops } from "@/design/viGridGeometry";

/**
 * VI 그리드 — 캔버스 픽셀(width×height)에 맞춰 끝선이 정확히 맞도록 그립니다.
 * step: 인접 격자선 간격(px). 캔버스 중앙 기준 좌우·상하 대칭.
 */
export function ViAlignmentGrid({
  width,
  height,
  step,
}: {
  width: number;
  height: number;
  /** 격자 간격 (px). 보통 baseUnit/2 */
  step: number;
}) {
  const W = Math.round(width);
  const H = Math.round(height);
  if (W <= 0 || H <= 0 || step <= 0) return null;

  const xs = buildSymmetricAxisStops(W, step);
  const ys = buildSymmetricAxisStops(H, step);
  const stroke = "rgba(0, 102, 255, 0.16)";

  return (
    <svg
      data-vi-grid="true"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        display: "block",
        pointerEvents: "none",
        zIndex: 100,
      }}
      aria-hidden
    >
      {xs.map((x, i) => (
        <line
          key={`v-${i}-${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={H}
          stroke={stroke}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {ys.map((y, j) => (
        <line
          key={`h-${j}-${y}`}
          x1={0}
          y1={y}
          x2={W}
          y2={y}
          stroke={stroke}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
