/** 점수 게이지 (큰 버전). scoreSize: 중앙 점수 숫자(px), 기본 48 */
export function ScoreGauge({
  score,
  r = 85,
  scoreSize = 48,
}: {
  score: number;
  r?: number;
  scoreSize?: number;
}) {
  const size = (r + 16) * 2;
  const circ = 2 * Math.PI * r;
  const subSize = Math.round(scoreSize * 0.33);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${r * 2 + 32} ${r * 2 + 32}`}>
        <circle cx={r + 16} cy={r + 16} r={r} stroke="#E8E4DF" strokeWidth="16" fill="none" />
        <circle
          cx={r + 16}
          cy={r + 16}
          r={r}
          stroke="#FF7F66"
          strokeWidth="16"
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - score / 100)}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="leading-none font-bold text-black" style={{ fontSize: scoreSize }}>
          {score}
        </span>
        <span className="text-gray-500" style={{ fontSize: subSize }}>
          / 100
        </span>
      </div>
    </div>
  );
}
