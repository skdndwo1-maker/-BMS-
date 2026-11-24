import type { DesignContent } from "@/design/types";
import type { CanvasTextEditTarget } from "@/design/canvasTextTypography";
import { resolvePosterBodyBlocksForRender } from "@/design/posterBodyDisplay";
import { CanvasTextFormatControls } from "./canvasTextFormatShared";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  targets: CanvasTextEditTarget[];
  content: DesignContent;
  onDraft: (next: DesignContent | ((prev: DesignContent) => DesignContent)) => void;
  templateId?: string;
  /** 캔버스 텍스트 선택 변경 시 증가 — B/I/U 활성 표시 갱신 */
  selectionRenderTick?: number;
  getSelection?: () => [number, number] | null;
  onTogglePartialStyle?: (which: "bold" | "italic" | "underline") => void;
  onApplyPartialColor?: (hex: string) => void;
  onApplyPartialWeight?: (weight: number) => void;
  onApplyPartialFontFamily?: (fontFamily: string) => void;
  onApplyPartialFontScale?: (scale: number) => void;
  onClose: () => void;
};

function targetLabel(t: CanvasTextEditTarget, content: DesignContent): string {
  if (t.kind === "title") return "메인 타이틀";
  if (t.kind === "footer") return "하단 유의사항";
  if (t.kind === "body") {
    const blocks = resolvePosterBodyBlocksForRender(content);
    const idx = blocks.findIndex((b) => b.id === t.id);
    return idx >= 0 ? `본문 ${idx + 1}` : "본문";
  }
  if (t.kind === "subtitle") {
    const subs = content.posterSubtitles ?? [];
    const idx = subs.findIndex((s) => s.id === t.id);
    return idx >= 0 ? `부제 ${idx + 1}` : "부제";
  }
  return "텍스트";
}

export function CanvasTextFormatPanel({
  targets,
  content,
  onDraft,
  templateId,
  selectionRenderTick = 0,
  getSelection,
  onTogglePartialStyle,
  onApplyPartialColor,
  onApplyPartialWeight,
  onApplyPartialFontFamily,
  onApplyPartialFontScale,
  onClose,
}: Props) {
  const label =
    targets.length === 0
      ? null
      : targets.length === 1
        ? targetLabel(targets[0], content)
        : `${targets.length}개 텍스트`;

  return (
    <div
      className="border border-gray-200 bg-white shadow-md rounded-lg overflow-hidden flex flex-col max-h-[min(70vh,520px)]"
      data-canvas-text-format-panel
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0">
        <span className="text-[11px] font-semibold text-gray-800">문자 옵션</span>
        {label ? (
          <span className="text-[10px] text-[#F43182] font-medium truncate">{label}</span>
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
        {targets.length === 0 ? (
          <p className="text-[11px] text-gray-500 leading-snug">
            캔버스에서 텍스트를 클릭해 선택하세요. Shift+클릭으로 여러 개를 잡은 뒤 함께 서식을 바꿀 수 있습니다.
            더블클릭 후 글자를 드래그하면 일부만 색·글꼴·크기를 바꿀 수 있습니다.
          </p>
        ) : (
          <>
            {targets.length > 1 ? (
              <p className="text-[10px] text-gray-500 leading-snug">
                선택한 {targets.length}개 텍스트에 동일 옵션이 적용됩니다.
              </p>
            ) : null}
            <CanvasTextFormatControls
              targets={targets}
              content={content}
              onDraft={onDraft}
              templateId={templateId}
              selectionRenderTick={selectionRenderTick}
              getSelection={getSelection}
              onTogglePartialStyle={onTogglePartialStyle}
              onApplyPartialColor={onApplyPartialColor}
              onApplyPartialWeight={onApplyPartialWeight}
              onApplyPartialFontFamily={onApplyPartialFontFamily}
              onApplyPartialFontScale={onApplyPartialFontScale}
            />
          </>
        )}
      </div>
    </div>
  );
}
