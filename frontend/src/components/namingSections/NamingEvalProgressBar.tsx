import {
  NAMING_EVAL_PROGRESS_HEIGHT_PX,
  NAMING_TIER_LEGAL_FILL,
  NAMING_TIER_LEGAL_TRACK,
} from "./constants";

/** 생성·검수 평가 카드 공통 진행 바. variant="tierLegality"는 카키계 트랙·채움 */
export function NamingEvalProgressBar({
  percent,
  variant = "coral",
}: {
  percent: number;
  variant?: "coral" | "tierLegality";
}) {
  const v = Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : 0;
  const track = variant === "tierLegality" ? NAMING_TIER_LEGAL_TRACK : "bg-[#FF7F66]/12";
  const fill = variant === "tierLegality" ? NAMING_TIER_LEGAL_FILL : "bg-[#FF7F66]";
  return (
    <div
      className={`naming-eval-progress w-full min-w-0 shrink-0 overflow-hidden rounded-full ${track}`}
      style={{ height: NAMING_EVAL_PROGRESS_HEIGHT_PX }}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full min-h-0 rounded-full transition-[width] duration-150 ease-out ${fill}`}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
