import { Loader2, Trash2 } from "lucide-react";
import type { AssetType } from "@/design/types";
import type { UserGeneratedAsset } from "@/lib/userGeneratedAssetsApi";

type Props = {
  assetType: AssetType;
  items: UserGeneratedAsset[];
  loading?: boolean;
  loggedIn: boolean;
  onUse: (item: UserGeneratedAsset) => void;
  onDelete: (id: string) => void;
};

export function MyGeneratedAssetsPanel({
  assetType,
  items,
  loading,
  loggedIn,
  onUse,
  onDelete,
}: Props) {
  const typeLabel = assetType === "pictogram" ? "픽토그램" : "일러스트";

  return (
    <div className="rounded-lg border border-[#FF7F66]/20 bg-[#FF7F66]/5 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-gray-700">내가 생성한 Asset</p>
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" /> : null}
      </div>

      {!loggedIn ? (
        <p className="text-[10px] text-gray-500 leading-relaxed">
          로그인하면 AI로 만든 {typeLabel}가 계정에 저장되어 다음에도 재사용할 수 있습니다.
        </p>
      ) : items.length === 0 ? (
        <p className="text-[10px] text-gray-500 leading-relaxed">
          AI 생성 후 선택한 {typeLabel}가 여기에 저장됩니다.
        </p>
      ) : (
        <div className="grid max-h-40 grid-cols-3 gap-1.5 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white p-1.5"
            >
              <button
                type="button"
                onClick={() => onUse(item)}
                className="flex w-full flex-col items-center gap-1 rounded-md hover:bg-[#FF7F66]/5"
                title={`${item.name} — 캔버스에 추가`}
              >
                <span className="flex h-12 w-full items-center justify-center rounded-md bg-gray-50">
                  <img src={item.src} alt={item.name} className="h-9 w-full object-contain" />
                </span>
                <span className="w-full truncate px-0.5 text-[9px] font-medium text-gray-600 group-hover:text-[#FF7F66]">
                  {item.name}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="absolute right-1 top-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
                title="저장 목록에서 삭제"
              >
                <Trash2 className="w-3 h-3 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
