import type { DesignContent } from "@/design/types";
import type { CanvasTextEditTarget } from "@/design/canvasTextTypography";
import { CanvasTextFormatControls } from "./canvasTextFormatShared";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  target: CanvasTextEditTarget | null;
  content: DesignContent;
  onDraft: (next: DesignContent) => void;
  /** 캔버스 텍스트 선택 변경 시 증가 — B/I/U 활성 표시 갱신 */
  selectionRenderTick?: number;
  getSelection?: () => [number, number] | null;
  onTogglePartialStyle?: (which: "bold" | "italic" | "underline") => void;
  onClose: () => void;
};

function targetLabel(t: CanvasTextEditTarget): string {
  if (t.kind === "title") return "메인 타이틀";
  if (t.kind === "footer") return "하단 유의사항";
  if (t.kind === "body") return "본문";
  return "부제";
}

export function CanvasTextFormatPanel({
  target,
  content,
  onDraft,
  selectionRenderTick = 0,
  getSelection,
  onTogglePartialStyle,
  onClose,
}: Props) {
  return (
    <div
      className="border border-gray-200 bg-white shadow-md rounded-lg overflow-hidden flex flex-col max-h-[min(70vh,520px)]"
      data-canvas-text-format-panel
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0">
        <span className="text-[11px] font-semibold text-gray-800">문자 옵션</span>
        {target ? (
          <span className="text-[10px] text-[#F43182] font-medium truncate">{targetLabel(target)}</span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          aria-label="닫기"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="p-2 overflow-y-auto flex flex-col gap-2 text-left">
        {!target ? (
          <p className="text-[11px] text-gray-500 leading-snug">
            캔버스에서 텍스트 상자를 한 번 클릭해 선택한 뒤, 여기서 서식을 조절할 수 있습니다. (내용 편집은 더블클릭)
          </p>
        ) : (
          <CanvasTextFormatControls
            target={target}
            content={content}
            onDraft={onDraft}
            selectionRenderTick={selectionRenderTick}
            getSelection={getSelection}
            onTogglePartialStyle={onTogglePartialStyle}
          />
        )}
      </div>
    </div>
  );
}
