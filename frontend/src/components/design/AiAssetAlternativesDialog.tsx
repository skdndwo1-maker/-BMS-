import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { AssetType } from "@/design/types";

export type AiAssetAlternative = { name: string; src: string; svg: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  assetType: AssetType;
  alternatives: AiAssetAlternative[];
  onPick: (item: AiAssetAlternative) => void;
  onPickAll?: () => void;
};

export function AiAssetAlternativesDialog({
  open,
  onOpenChange,
  title,
  assetType,
  alternatives,
  onPick,
  onPickAll,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open || alternatives.length === 0) return null;

  const typeLabel = assetType === "pictogram" ? "픽토그램" : "일러스트";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        role="presentation"
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">AI가 제안한 {typeLabel} 대안 3개 중 선택하세요</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {alternatives.map((item, idx) => (
              <button
                key={`${item.name}-${idx}`}
                type="button"
                onClick={() => {
                  onPick(item);
                  onOpenChange(false);
                }}
                className="group flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 hover:border-[#FF7F66] hover:bg-[#FF7F66]/5 transition-colors"
              >
                <span className="flex h-20 w-full items-center justify-center rounded-lg bg-gray-50">
                  <img src={item.src} alt={item.name} className="h-14 w-full object-contain" />
                </span>
                <span className="w-full truncate text-[11px] font-semibold text-gray-700 group-hover:text-[#FF7F66]">
                  대안 {idx + 1} · {item.name}
                </span>
              </button>
            ))}
          </div>
          {onPickAll ? (
            <Button type="button" variant="outline" className="w-full text-xs" onClick={onPickAll}>
              3개 모두 캔버스에 추가
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
