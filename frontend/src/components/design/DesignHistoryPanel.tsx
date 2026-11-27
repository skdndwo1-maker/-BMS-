import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatHistoryTime,
  type DesignHistoryEntry,
} from "@/design/designContentHistory";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: DesignHistoryEntry[];
  currentIdx: number;
  onJump: (idx: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

/**
 * 세션 메모리 작업 기록 — 새로고침/재로그인 시 사라짐.
 * Photoshop History처럼 목록에서 이전 상태로 점프.
 */
export function DesignHistoryPanel({
  open,
  onOpenChange,
  entries,
  currentIdx,
  onJump,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  const rows = entries
    .map((e, idx) => ({ e, idx }))
    .slice()
    .reverse();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(80vh,560px)] w-[min(92vw,380px)] flex-col gap-0 overflow-hidden p-0 sm:!max-w-[380px]"
        style={{ backgroundColor: "#f8f8f8" }}
      >
        <DialogHeader className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <History className="h-4 w-4 text-[#FF7F66]" />
            작업 기록
          </DialogTitle>
          <DialogDescription className="text-[11px] text-gray-500">
            이 세션에서만 보관됩니다. 새로고침·재로그인 시 사라집니다.
          </DialogDescription>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 flex-1 text-[11px]"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              실행 취소
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 flex-1 text-[11px]"
              disabled={!canRedo}
              onClick={onRedo}
            >
              다시 실행
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-gray-400">기록이 없습니다.</p>
          ) : (
            <ul className="space-y-0.5">
              {rows.map(({ e, idx }) => {
                const isCurrent = idx === currentIdx;
                const isFuture = idx > currentIdx;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onJump(idx)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                        isCurrent
                          ? "bg-[#FF7F66]/15 ring-1 ring-[#FF7F66]/40"
                          : isFuture
                            ? "opacity-45 hover:bg-white/80 hover:opacity-80"
                            : "hover:bg-white"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          isCurrent ? "bg-[#FF7F66]" : isFuture ? "bg-gray-300" : "bg-gray-400"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium text-gray-800">
                          {e.label}
                          {isCurrent ? " · 현재" : ""}
                        </span>
                        <span className="block text-[10px] text-gray-500">
                          {formatHistoryTime(e.at)}
                          {isFuture ? " · 이후 단계" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-gray-400">
                        #{idx + 1}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
