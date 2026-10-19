import { useEffect, useState } from "react";
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
import type { CanvasSize, Template, TemplateCategoryDef } from "@/design/types";

const SIZE_PRESETS: { label: string; size: CanvasSize }[] = [
  { label: "1080×1080 (정사각)", size: { width: 1080, height: 1080, unit: "px", name: "1:1" } },
  { label: "1080×1350 (4:5)", size: { width: 1080, height: 1350, unit: "px", name: "4:5" } },
  { label: "1920×1080 (16:9)", size: { width: 1920, height: 1080, unit: "px", name: "16:9" } },
  { label: "1200×628", size: { width: 1200, height: 628, unit: "px", name: "1200x628" } },
  { label: "A4 세로", size: { width: 210, height: 297, unit: "mm", name: "A4" } },
  { label: "A4 가로", size: { width: 297, height: 210, unit: "mm", name: "A4 가로" } },
  { label: "A1", size: { width: 594, height: 841, unit: "mm", name: "A1" } },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: Pick<Template, "name" | "description" | "category" | "mediaType" | "size">;
  categories: TemplateCategoryDef[];
  onSubmit: (next: Pick<Template, "name" | "description" | "category" | "mediaType" | "size">) => void;
};

export function TemplateMetaDialog({ open, onOpenChange, title, initial, categories, onSubmit }: Props) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState(initial.category);
  const [mediaType, setMediaType] = useState<"online" | "offline">(initial.mediaType);
  const [size, setSize] = useState<CanvasSize>(initial.size);

  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setDescription(initial.description);
    setCategory(initial.category);
    setMediaType(initial.mediaType);
    setSize(initial.size);
  }, [open, initial]);

  const canSave = name.trim().length > 0 && size.width > 0 && size.height > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>템플릿 기본 정보와 캔버스 크기를 설정합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">이름</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="템플릿 이름" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-desc">설명</Label>
            <Input
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="짧은 설명"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-cat">제작물 유형</Label>
              <select
                id="tpl-cat"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-media">미디어</Label>
              <select
                id="tpl-media"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as "online" | "offline")}
              >
                <option value="online">온라인</option>
                <option value="offline">오프라인</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-preset">크기 프리셋</Label>
            <select
              id="tpl-preset"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value=""
              onChange={(e) => {
                const p = SIZE_PRESETS.find((x) => x.label === e.target.value);
                if (p) setSize({ ...p.size });
              }}
            >
              <option value="">직접 입력 / 프리셋 선택…</option>
              {SIZE_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1.5 col-span-1">
              <Label>너비</Label>
              <Input
                type="number"
                min={1}
                value={size.width}
                onChange={(e) => setSize((s) => ({ ...s, width: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1.5 col-span-1">
              <Label>높이</Label>
              <Input
                type="number"
                min={1}
                value={size.height}
                onChange={(e) => setSize((s) => ({ ...s, height: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1.5 col-span-1">
              <Label>단위</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={size.unit}
                onChange={(e) => setSize((s) => ({ ...s, unit: e.target.value as CanvasSize["unit"] }))}
              >
                <option value="px">px</option>
                <option value="mm">mm</option>
                <option value="in">in</option>
              </select>
            </div>
            <div className="space-y-1.5 col-span-1">
              <Label>표기</Label>
              <Input
                value={size.name}
                onChange={(e) => setSize((s) => ({ ...s, name: e.target.value }))}
                placeholder="A4"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => {
              onSubmit({
                name: name.trim(),
                description: description.trim(),
                category,
                mediaType,
                size: {
                  ...size,
                  name: size.name.trim() || `${size.width}x${size.height}`,
                },
              });
              onOpenChange(false);
            }}
          >
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
