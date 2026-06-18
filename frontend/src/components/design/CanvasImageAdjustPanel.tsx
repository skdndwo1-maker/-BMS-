import type { DesignContent } from "@/design/types";
import {
  IMAGE_ADJUST_MAX,
  IMAGE_ADJUST_MIN,
  IMAGE_BRIGHTNESS_DEFAULT,
  IMAGE_CONTRAST_DEFAULT,
  IMAGE_OPACITY_DEFAULT,
  IMAGE_SATURATION_DEFAULT,
  resolvePosterImageBrightness,
  resolvePosterImageContrast,
  resolvePosterImageOpacity,
  resolvePosterImageSaturation,
} from "@/design/imageAdjust";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type Props = {
  content: DesignContent;
  onDraft: (next: DesignContent) => void;
  onClose: () => void;
};

function AdjustSlider({
  label,
  value,
  defaultValue,
  min = IMAGE_ADJUST_MIN,
  max = IMAGE_ADJUST_MAX,
  onChange,
}: {
  label: string;
  value: number;
  defaultValue: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-gray-700">{label}</span>
        <span className="text-[10px] text-gray-500 font-mono tabular-nums">{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-[#F43182]"
      />
      <p className="text-[9px] text-gray-400">기본 {defaultValue}%</p>
    </div>
  );
}

export function CanvasImageAdjustPanel({ content, onDraft, onClose }: Props) {
  const patch = (p: Partial<DesignContent>) => onDraft({ ...content, ...p });

  const resetAdjustments = () => {
    patch({
      posterImageBrightness: IMAGE_BRIGHTNESS_DEFAULT,
      posterImageContrast: IMAGE_CONTRAST_DEFAULT,
      posterImageSaturation: IMAGE_SATURATION_DEFAULT,
      posterImageOpacity: IMAGE_OPACITY_DEFAULT,
    });
  };

  return (
    <div
      className="border border-gray-200 bg-white shadow-md rounded-lg overflow-hidden flex flex-col max-h-[min(70vh,520px)]"
      data-canvas-image-adjust-panel
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0">
        <span className="text-[11px] font-semibold text-gray-800">이미지 보정</span>
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
      <div className="p-2 overflow-y-auto flex flex-col gap-3 text-left">
        <AdjustSlider
          label="밝기 (Brightness)"
          value={resolvePosterImageBrightness(content)}
          defaultValue={IMAGE_BRIGHTNESS_DEFAULT}
          onChange={(v) => patch({ posterImageBrightness: v })}
        />
        <AdjustSlider
          label="대비 (Contrast)"
          value={resolvePosterImageContrast(content)}
          defaultValue={IMAGE_CONTRAST_DEFAULT}
          onChange={(v) => patch({ posterImageContrast: v })}
        />
        <AdjustSlider
          label="채도 (Saturation)"
          value={resolvePosterImageSaturation(content)}
          defaultValue={IMAGE_SATURATION_DEFAULT}
          onChange={(v) => patch({ posterImageSaturation: v })}
        />
        <AdjustSlider
          label="투명도 (Opacity)"
          value={resolvePosterImageOpacity(content)}
          defaultValue={IMAGE_OPACITY_DEFAULT}
          min={0}
          max={100}
          onChange={(v) => patch({ posterImageOpacity: v })}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full text-[11px]"
          onClick={resetAdjustments}
        >
          보정값 초기화
        </Button>
      </div>
    </div>
  );
}
