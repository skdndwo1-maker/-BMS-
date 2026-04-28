import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, ImageIcon, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import {
  captureDesignCanvas,
  getDesignCanvasLogicalPixelSize,
} from "@/lib/designCanvasCapture";
import type { CanvasSize } from "@/design/types";

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to create image blob"));
      },
      type,
      quality
    );
  });
}

/** 화질 슬라이더 0~100 → 템플릿 논리 픽셀 대비 해상도 배율 (최저 1× ~ 최고 4×) */
function qualityToResolutionMultiplier(quality0to100: number): number {
  const t = Math.min(100, Math.max(0, quality0to100)) / 100;
  return 1 + t * 3;
}

function jpegQualityFromSlider(quality0to100: number): number {
  const t = Math.min(100, Math.max(0, quality0to100)) / 100;
  return 0.55 + t * 0.43;
}

function formatSpecLine(canvasSize: CanvasSize): string {
  const u = canvasSize.unit === "px" ? "px" : canvasSize.unit;
  return `${canvasSize.width} × ${canvasSize.height} ${u}`;
}

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName: string;
  /** 편집 중인 캔버스 규격 (RCS 등 가변 높이는 effective 크기 전달) */
  canvasSize: CanvasSize;
}

export function ExportDialog({ open, onOpenChange, templateName, canvasSize }: ExportDialogProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<"png" | "jpeg" | "pdf" | null>(null);
  const [quality, setQuality] = useState(50);

  const logical = useMemo(() => getDesignCanvasLogicalPixelSize(canvasSize), [canvasSize]);
  const resMul = useMemo(() => qualityToResolutionMultiplier(quality), [quality]);
  const outW = Math.max(1, Math.round(logical.width * resMul));
  const outH = Math.max(1, Math.round(logical.height * resMul));

  const runCapture = async (backgroundColor: string | null) => {
    const el = document.getElementById("design-canvas");
    if (!el) throw new Error("Canvas not found");
    const r = el.getBoundingClientRect();
    const dw = r.width;
    const dh = r.height;
    if (dw <= 0 || dh <= 0) throw new Error("Canvas has no size");
    const sx = outW / dw;
    const sy = outH / dh;
    const scale = Math.min(sx, sy);
    return captureDesignCanvas(el as HTMLElement, {
      scale,
      backgroundColor,
      excludeViGrid: true,
    });
  };

  const handleExportPNG = async () => {
    setIsExporting(true);
    setExportType("png");

    try {
      const exportCanvas = await runCapture(null);
      const blob = await canvasToBlob(exportCanvas, "image/png");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${templateName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      toast.success("PNG로 저장했습니다.");
      setIsExporting(false);
      setTimeout(() => onOpenChange(false), 800);
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("PNG 내보내기에 실패했습니다.");
      setIsExporting(false);
      setExportType(null);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    setExportType("pdf");

    try {
      const exportCanvas = await runCapture("#ffffff");
      const imgData = exportCanvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: exportCanvas.width > exportCanvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [exportCanvas.width, exportCanvas.height],
      });

      pdf.addImage(imgData, "PNG", 0, 0, exportCanvas.width, exportCanvas.height);
      pdf.save(`${templateName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.pdf`);

      toast.success("PDF로 저장했습니다.");
      setIsExporting(false);
      setTimeout(() => onOpenChange(false), 800);
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("PDF 내보내기에 실패했습니다.");
      setIsExporting(false);
      setExportType(null);
    }
  };

  const handleExportJPEG = async () => {
    setIsExporting(true);
    setExportType("jpeg");

    try {
      const exportCanvas = await runCapture("#ffffff");
      const q = jpegQualityFromSlider(quality);
      const blob = await canvasToBlob(exportCanvas, "image/jpeg", q);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${templateName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.jpeg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      toast.success("JPEG로 저장했습니다.");
      setIsExporting(false);
      setTimeout(() => onOpenChange(false), 800);
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("JPEG 내보내기에 실패했습니다.");
      setIsExporting(false);
      setExportType(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>디자인 내보내기</DialogTitle>
          <DialogDescription>
            작업 중인 템플릿 비율·규격을 유지한 채 해상도만 조절합니다. VI 그리드는 파일에 포함되지 않습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-xs text-gray-600">
            <div>
              <span className="font-medium text-gray-800">작업 규격</span> · {formatSpecLine(canvasSize)}
            </div>
            <div className="mt-1 font-mono text-[11px] text-gray-700">
              출력 픽셀: {outW} × {outH} px
              <span className="ml-1.5 text-gray-500">(배율 {resMul.toFixed(2)}×)</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-medium text-gray-900">
              <span>화질</span>
              <span className="text-xs font-normal text-gray-500">슬라이더로 조절</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-7 shrink-0 text-center text-[11px] font-medium text-gray-500">최저</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={quality}
                disabled={isExporting}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="h-2 w-full flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-[#F43182] disabled:opacity-50"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={quality}
                aria-label="내보내기 화질, 최저에서 최고까지"
              />
              <span className="w-7 shrink-0 text-center text-[11px] font-medium text-gray-500">최상</span>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <button
              type="button"
              onClick={handleExportPNG}
              disabled={isExporting}
              className="group flex w-full items-center gap-4 rounded-lg border border-gray-200 p-4 transition-all hover:border-blue-500 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 group-hover:bg-blue-200">
                {isExporting && exportType === "png" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-blue-600" />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-gray-900">PNG</div>
                <div className="text-sm text-gray-500">투명 배경 가능 · 디지털용</div>
              </div>
              <Download className="h-5 w-5 text-gray-400" />
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isExporting}
              className="group flex w-full items-center gap-4 rounded-lg border border-gray-200 p-4 transition-all hover:border-blue-500 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 group-hover:bg-red-200">
                {isExporting && exportType === "pdf" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-red-600" />
                ) : (
                  <FileText className="h-5 w-5 text-red-600" />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-gray-900">PDF</div>
                <div className="text-sm text-gray-500">흰 배경 · 인쇄·공유용</div>
              </div>
              <Download className="h-5 w-5 text-gray-400" />
            </button>

            <button
              type="button"
              onClick={handleExportJPEG}
              disabled={isExporting}
              className="group flex w-full items-center gap-4 rounded-lg border border-gray-200 p-4 transition-all hover:border-blue-500 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 group-hover:bg-amber-200">
                {isExporting && exportType === "jpeg" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-amber-700" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-amber-700" />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-gray-900">JPEG</div>
                <div className="text-sm text-gray-500">압축 이미지 · 슬라이더에 맞춰 품질도 조절</div>
              </div>
              <Download className="h-5 w-5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="flex gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting} className="flex-1">
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
