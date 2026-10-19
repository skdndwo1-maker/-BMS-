import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  FileImage,
  LayoutTemplate,
  Plus,
  Presentation,
  RectangleHorizontal,
  Share2,
  Signpost,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { newCustomCategoryId } from "@/design/templateCatalog";
import { templateCategories as builtinCategories } from "@/design/templates";
import type { Template, TemplateCategoryDef } from "@/design/types";

const ICON_OPTIONS = [
  "LayoutTemplate",
  "FileImage",
  "Share2",
  "Bell",
  "Signpost",
  "Presentation",
  "RectangleHorizontal",
] as const;

const iconPreview: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutTemplate,
  FileImage,
  Share2,
  Bell,
  Signpost,
  Presentation,
  RectangleHorizontal,
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TemplateCategoryDef[];
  templates: Template[];
  onSave: (categories: TemplateCategoryDef[]) => void;
  onResetCatalog: () => void;
};

export function TemplateCategoryManagerDialog({
  open,
  onOpenChange,
  categories,
  templates,
  onSave,
  onResetCatalog,
}: Props) {
  const [draft, setDraft] = useState<TemplateCategoryDef[]>(categories);

  useEffect(() => {
    if (open) setDraft(categories.map((c) => ({ ...c })));
  }, [open, categories]);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...draft];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setDraft(next);
  };

  const usedIds = new Set(templates.map((t) => t.category));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>제작물 유형 관리</DialogTitle>
          <DialogDescription>
            유형 이름·아이콘·순서를 바꾸고, 사용 중이지 않은 유형은 삭제할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {draft.map((cat, i) => {
            const Icon = iconPreview[cat.icon] ?? LayoutTemplate;
            const inUse = usedIds.has(cat.id);
            return (
              <div
                key={cat.id}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-gray-50/80 p-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white border">
                  <Icon className="h-4 w-4 text-[#FF7F66]" />
                </div>
                <div className="min-w-[140px] flex-1 space-y-1">
                  <Label className="text-xs text-gray-500">이름</Label>
                  <Input
                    value={cat.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      setDraft((prev) => prev.map((c, idx) => (idx === i ? { ...c, label } : c)));
                    }}
                  />
                </div>
                <div className="w-[150px] space-y-1">
                  <Label className="text-xs text-gray-500">아이콘</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={cat.icon}
                    onChange={(e) => {
                      const icon = e.target.value;
                      setDraft((prev) => prev.map((c, idx) => (idx === i ? { ...c, icon } : c)));
                    }}
                  >
                    {ICON_OPTIONS.map((ic) => (
                      <option key={ic} value={ic}>
                        {ic}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-1">
                  <Button type="button" size="icon" variant="outline" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => move(i, 1)}
                    disabled={i === draft.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={inUse}
                    title={inUse ? "사용 중인 유형은 삭제할 수 없습니다" : "삭제"}
                    onClick={() => setDraft((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
                <p className="w-full text-[11px] text-gray-400">id: {cat.id}{inUse ? " · 사용 중" : ""}</p>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() =>
              setDraft((prev) => [
                ...prev,
                { id: newCustomCategoryId(), label: "새 유형", icon: "LayoutTemplate" },
              ])
            }
          >
            <Plus className="mr-1 h-4 w-4" /> 유형 추가
          </Button>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-red-600"
            onClick={() => {
              if (window.confirm("템플릿 카탈로그 전체를 초기화할까요? (커스텀 템플릿·수정이 모두 삭제됩니다)")) {
                onResetCatalog();
                onOpenChange(false);
              }
            }}
          >
            카탈로그 초기화
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraft(builtinCategories.map((c) => ({ ...c })));
              }}
            >
              기본 유형으로
            </Button>
            <Button
              type="button"
              onClick={() => {
                onSave(draft.filter((c) => c.label.trim()));
                onOpenChange(false);
              }}
            >
              저장
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
