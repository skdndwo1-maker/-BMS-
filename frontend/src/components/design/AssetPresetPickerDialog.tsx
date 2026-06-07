import { useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Loader2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AssetPresetItem } from "@/design/assetPresets";
import type { UserGeneratedAsset } from "@/lib/userGeneratedAssetsApi";

type Layout = "picto" | "illu";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  presets: AssetPresetItem[];
  /** 2D 일러스트와 분리된 3D 클레이모피즘 프리셋 */
  presets3d?: AssetPresetItem[];
  filterPresets: (items: AssetPresetItem[], query: string) => AssetPresetItem[];
  onPick: (item: AssetPresetItem) => void;
  onDropFiles: (files: File[]) => void;
  layout: Layout;
  myGeneratedItems?: UserGeneratedAsset[];
  myGeneratedLoading?: boolean;
  loggedIn?: boolean;
  saveError?: string | null;
  onDeleteMyGenerated?: (id: string) => void;
};

/**
 * 픽토그램·일러스트 선택 — 예전과 동일한 고정 오버레이 카드 UI.
 * 드롭존은 열릴 때만 마운트(noKeyboard)해 검색 입력과 충돌하지 않습니다.
 */
export function AssetPresetPickerDialog(props: Props) {
  if (!props.open) return null;
  return <AssetPresetPickerDialogOpen {...props} />;
}

function AssetPresetPickerDialogOpen({
  onOpenChange,
  title,
  presets,
  presets3d,
  filterPresets,
  onPick,
  onDropFiles,
  layout,
  myGeneratedItems = [],
  myGeneratedLoading,
  loggedIn,
  saveError,
  onDeleteMyGenerated,
}: Props) {
  const [q, setQ] = useState("");
  const [illuDimension, setIlluDimension] = useState<"2d" | "3d" | "mine">("2d");
  const [illuGroup, setIlluGroup] = useState<"기능" | "감정">("기능");
  const [pictoCategory, setPictoCategory] = useState<"preset" | "mine">("preset");
  const has3d = layout === "illu" && (presets3d?.length ?? 0) > 0;

  const isMineView = layout === "illu" ? illuDimension === "mine" : pictoCategory === "mine";

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => {
      if (accepted.length) onDropFiles(accepted);
    },
    accept: { "image/*": [".png", ".svg", ".jpg", ".jpeg", ".webp"] },
    multiple: true,
    noKeyboard: true,
    noDragEventsBubbling: true,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  const activePresets = has3d && illuDimension === "3d" ? (presets3d ?? []) : presets;
  const filtered = filterPresets(activePresets, q);
  const filteredByGroup =
    layout === "illu" && illuDimension === "2d"
      ? filtered.filter((p) => {
          const isEmotion = p.keywords.includes("감정");
          return illuGroup === "감정" ? isEmotion : !isEmotion;
        })
      : filtered;

  const filteredMine = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return myGeneratedItems;
    return myGeneratedItems.filter(
      (item) =>
        item.name.toLowerCase().includes(qq) ||
        item.generationDirection.toLowerCase().includes(qq),
    );
  }, [myGeneratedItems, q]);

  const gridClass =
    layout === "picto"
      ? "grid max-h-[min(60vh,420px)] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-6"
      : "grid max-h-[min(60vh,420px)] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-5";

  const pickMine = (item: UserGeneratedAsset) => {
    onPick({ name: item.name, src: item.src, keywords: ["내가생성"] });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        role="presentation"
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </div>
        <div className="p-4">
          {layout === "illu" ? (
            <div className="mb-3 space-y-2">
              <div className="flex items-center gap-1.5 rounded-xl bg-gray-100 p-1">
                {(has3d ? (["2d", "3d", "mine"] as const) : (["2d", "mine"] as const)).map((k) => {
                  const active = illuDimension === k;
                  const label =
                    k === "2d" ? "2D 일러스트" : k === "3d" ? "3D 일러스트" : "내가 생성한 에셋";
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setIlluDimension(k)}
                      className={`flex-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors ${
                        active ? "bg-white text-[#FF7F66] shadow-sm" : "text-gray-600 hover:bg-white/60"
                      }`}
                    >
                      {label}
                      {k === "mine" && myGeneratedItems.length > 0 ? (
                        <span className="ml-0.5 text-[10px] font-normal text-gray-400">
                          ({myGeneratedItems.length})
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {illuDimension === "2d" ? (
                <div className="flex items-center gap-1.5 rounded-xl bg-gray-100 p-1">
                  {(["기능", "감정"] as const).map((k) => {
                    const active = illuGroup === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setIlluGroup(k)}
                        className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors ${
                          active ? "bg-white text-[#FF7F66] shadow-sm" : "text-gray-600 hover:bg-white/60"
                        }`}
                      >
                        {k}
                      </button>
                    );
                  })}
                </div>
              ) : illuDimension === "3d" ? (
                <p className="text-[11px] text-gray-500 px-1">
                  RCS 가안 스타일의 3D 클레이모피즘 오브젝트입니다.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mb-3 flex items-center gap-1.5 rounded-xl bg-gray-100 p-1">
              {(["preset", "mine"] as const).map((k) => {
                const active = pictoCategory === k;
                const label = k === "preset" ? "프리셋" : "내가 생성한 에셋";
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPictoCategory(k)}
                    className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors ${
                      active ? "bg-white text-[#FF7F66] shadow-sm" : "text-gray-600 hover:bg-white/60"
                    }`}
                  >
                    {label}
                    {k === "mine" && myGeneratedItems.length > 0 ? (
                      <span className="ml-0.5 text-[10px] font-normal text-gray-400">
                        ({myGeneratedItems.length})
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          {isMineView && !loggedIn ? (
            <p className="mb-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
              로그인 후 AI 생성 → 대안 선택 시 이 목록에 저장됩니다.
            </p>
          ) : null}

          {isMineView && saveError ? (
            <p className="mb-3 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
              {saveError}
            </p>
          ) : null}

          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                isMineView
                  ? "저장된 에셋 검색"
                  : layout === "picto"
                    ? "검색어 입력 (예: AI, 보안, 고객)"
                    : "검색어 입력 (예: 웨이브, 링, 패턴)"
              }
              className="flex-1"
              autoComplete="off"
            />
            <div
              {...getRootProps()}
              className={`shrink-0 cursor-pointer rounded-lg border-2 border-dashed px-4 py-2 text-center text-xs transition-colors ${
                isDragActive ? "border-[#FF7F66] bg-[#FF7F66]/5" : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <input {...getInputProps()} />
              업로드
            </div>
          </div>

          {isMineView && myGeneratedLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              불러오는 중…
            </div>
          ) : isMineView ? (
            filteredMine.length === 0 ? (
              <p className="text-center text-[11px] text-gray-500 py-10">
                {loggedIn
                  ? "저장된 AI 에셋이 없습니다. 패널에서 AI 생성 후 대안을 선택하면 여기에 쌓입니다."
                  : "로그인 후 이용할 수 있습니다."}
              </p>
            ) : (
              <div className={gridClass}>
                {filteredMine.map((item) => (
                  <div
                    key={item.id}
                    className="group relative flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-2 hover:border-[#FF7F66]"
                  >
                    <button
                      type="button"
                      onClick={() => pickMine(item)}
                      className="flex w-full flex-col items-center gap-1 hover:bg-[#FF7F66]/5 rounded-md"
                      title={item.name}
                    >
                      <span
                        className={`flex items-center justify-center rounded-md bg-gray-50 ${layout === "picto" ? "h-10 w-10" : "h-16 w-full"}`}
                      >
                        <img
                          src={item.src}
                          alt={item.name}
                          className={layout === "picto" ? "h-7 w-7 object-contain" : "h-12 w-full object-contain"}
                        />
                      </span>
                      <span className="w-full truncate text-[10px] font-medium text-gray-600 group-hover:text-[#FF7F66]">
                        {item.name}
                      </span>
                    </button>
                    {onDeleteMyGenerated ? (
                      <button
                        type="button"
                        onClick={() => onDeleteMyGenerated(item.id)}
                        className="absolute right-1 top-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
                        title="저장 목록에서 삭제"
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className={gridClass}>
              {filteredByGroup.map((p, idx) => (
                <button
                  key={`${layout}-${p.name}-${idx}`}
                  type="button"
                  onClick={() => onPick(p)}
                  className="group flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-2 hover:border-[#FF7F66] hover:bg-[#FF7F66]/5"
                  title={p.name}
                >
                  <span
                    className={`flex items-center justify-center rounded-md bg-gray-50 ${layout === "picto" ? "h-10 w-10" : "h-16 w-full"}`}
                  >
                    <img
                      src={p.src}
                      alt={p.name}
                      className={layout === "picto" ? "h-7 w-7 object-contain" : "h-12 w-full object-contain"}
                    />
                  </span>
                  <span className="w-full truncate text-[10px] font-medium text-gray-600 group-hover:text-[#FF7F66]">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
