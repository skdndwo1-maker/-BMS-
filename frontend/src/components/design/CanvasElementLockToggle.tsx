import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  locked: boolean;
  onToggle: () => void;
  label?: string;
};

/** 우측 패널 — 이미지·라운드 박스 잠금 토글 */
export function CanvasElementLockToggle({ locked, onToggle, label = "위치·크기 잠금" }: Props) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
        locked ? "border-amber-300 bg-amber-50/80" : "border-gray-200 bg-gray-50/80"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {locked ? (
          <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        ) : (
          <Unlock className="h-3.5 w-3.5 shrink-0 text-gray-500" />
        )}
        <span className={`text-xs font-medium truncate ${locked ? "text-amber-800" : "text-gray-700"}`}>
          {label}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`h-7 shrink-0 text-[11px] ${
          locked ? "border-amber-400 text-amber-800 hover:bg-amber-100" : ""
        }`}
        onClick={onToggle}
      >
        {locked ? "잠금 해제" : "잠금"}
      </Button>
    </div>
  );
}
