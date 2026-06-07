import { useEffect } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserGeneratedAsset } from "@/lib/userGeneratedAssetsApi";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: UserGeneratedAsset[];
  loading?: boolean;
  loggedIn?: boolean;
  saveError?: string | null;
  onPick: (item: UserGeneratedAsset) => void;
  onDelete?: (id: string) => void;
};

export function MyGeneratedImagePickerDialog({
  open,
  onOpenChange,
  items,
  loading,
  loggedIn,
  saveError,
  onPick,
  onDelete,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div role="presentation" className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">내 AI 이미지</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">저장된 AI 이미지를 선택해 캔버스에 적용하세요</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </div>
        <div className="p-4 space-y-3">
          {!loggedIn ? (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
              로그인 후 AI 생성 → 대안 선택 시 이 목록에 저장됩니다.
            </p>
          ) : null}
          {saveError ? (
            <p className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
              {saveError}
            </p>
          ) : null}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              불러오는 중…
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-[11px] text-gray-500 py-10">
              {loggedIn
                ? "저장된 AI 이미지가 없습니다. AI 생성 후 대안을 선택하면 여기에 쌓입니다."
                : "로그인 후 이용할 수 있습니다."}
            </p>
          ) : (
            <div className="grid max-h-[min(50vh,360px)] grid-cols-2 gap-2 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group relative rounded-lg border border-gray-200 bg-white p-1.5 hover:border-[#FF7F66]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onPick(item);
                      onOpenChange(false);
                    }}
                    className="flex w-full flex-col items-center gap-1 rounded-md hover:bg-[#FF7F66]/5"
                  >
                    <span className="flex h-24 w-full items-center justify-center overflow-hidden rounded-md bg-gray-50">
                      <img src={item.src} alt={item.name} className="h-full w-full object-cover" />
                    </span>
                    <span className="w-full truncate text-[10px] font-medium text-gray-700">{item.name}</span>
                  </button>
                  {onDelete ? (
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="absolute right-1 top-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
                      title="저장 목록에서 삭제"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
