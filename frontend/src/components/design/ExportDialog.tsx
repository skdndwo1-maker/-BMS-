import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, ImageIcon, Loader2 } from "lucide-react";
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create image blob'));
      },
      type,
      quality
    );
  });
}

const html2canvasOpts = {
  scale: 2,
  logging: false,
  useCORS: true,
} as const;

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName: string;
}

export function ExportDialog({ open, onOpenChange, templateName }: ExportDialogProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<"png" | "jpeg" | "pdf" | null>(null);

  const handleExportPNG = async () => {
    setIsExporting(true);
    setExportType('png');

    try {
      const canvas = document.getElementById('design-canvas');
      if (!canvas) {
        throw new Error('Canvas not found');
      }

      const exportCanvas = await html2canvas(canvas, {
        ...html2canvasOpts,
        backgroundColor: null,
      });

      const blob = await canvasToBlob(exportCanvas, 'image/png');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${templateName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('PNG exported successfully!');
      setIsExporting(false);
      setTimeout(() => onOpenChange(false), 1000);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export PNG');
      setIsExporting(false);
      setExportType(null);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    setExportType('pdf');

    try {
      const canvas = document.getElementById('design-canvas');
      if (!canvas) {
        throw new Error('Canvas not found');
      }

      const exportCanvas = await html2canvas(canvas, {
        ...html2canvasOpts,
        backgroundColor: '#ffffff',
      });

      const imgData = exportCanvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: exportCanvas.width > exportCanvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [exportCanvas.width, exportCanvas.height],
      });

      pdf.addImage(imgData, 'PNG', 0, 0, exportCanvas.width, exportCanvas.height);
      pdf.save(`${templateName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`);
      
      toast.success('PDF exported successfully!');
      setIsExporting(false);
      setTimeout(() => onOpenChange(false), 1000);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export PDF');
      setIsExporting(false);
      setExportType(null);
    }
  };

  const handleExportJPEG = async () => {
    setIsExporting(true);
    setExportType("jpeg");

    try {
      const canvas = document.getElementById("design-canvas");
      if (!canvas) throw new Error("Canvas not found");

      const exportCanvas = await html2canvas(canvas, {
        ...html2canvasOpts,
        backgroundColor: "#ffffff",
      });

      const blob = await canvasToBlob(exportCanvas, "image/jpeg", 0.92);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${templateName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.jpeg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      toast.success("JPEG exported successfully!");
      setIsExporting(false);
      setTimeout(() => onOpenChange(false), 1000);
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export JPEG");
      setIsExporting(false);
      setExportType(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Design</DialogTitle>
          <DialogDescription>
            Choose your preferred export format
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {/* PNG Export */}
          <button
            onClick={handleExportPNG}
            disabled={isExporting}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              {isExporting && exportType === 'png' ? (
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              ) : (
                <ImageIcon className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div className="flex-1 text-left">
              <div className="font-medium text-gray-900">Export as PNG</div>
              <div className="text-sm text-gray-500">High-quality raster image for digital use</div>
            </div>
            <Download className="w-5 h-5 text-gray-400" />
          </button>

          {/* PDF Export */}
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center group-hover:bg-red-200 transition-colors">
              {isExporting && exportType === 'pdf' ? (
                <Loader2 className="w-5 h-5 text-red-600 animate-spin" />
              ) : (
                <FileText className="w-5 h-5 text-red-600" />
              )}
            </div>
            <div className="flex-1 text-left">
              <div className="font-medium text-gray-900">Export as PDF</div>
              <div className="text-sm text-gray-500">Print-ready document format</div>
            </div>
            <Download className="w-5 h-5 text-gray-400" />
          </button>

          {/* JPEG Export */}
          <button
            onClick={handleExportJPEG}
            disabled={isExporting}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center group-hover:bg-amber-200 transition-colors">
              {isExporting && exportType === "jpeg" ? (
                <Loader2 className="w-5 h-5 text-amber-700 animate-spin" />
              ) : (
                <ImageIcon className="w-5 h-5 text-amber-700" />
              )}
            </div>
            <div className="flex-1 text-left">
              <div className="font-medium text-gray-900">Export as JPEG</div>
              <div className="text-sm text-gray-500">Compressed raster image (white background)</div>
            </div>
            <Download className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
