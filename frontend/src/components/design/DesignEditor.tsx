import { useState } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import { templates } from "@/design/templates";
import type { DesignContent } from "@/design/types";
import { DesignCanvas }           from './DesignCanvas';
import { PlacardWideCanvas }      from './PlacardWideCanvas';
import { Placard1000x600Canvas }  from './Placard1000x600Canvas';
import { Placard2000x1000Canvas } from './Placard2000x1000Canvas';
import { Placard600x1800Canvas }  from './Placard600x1800Canvas';
import { ContentPanel }           from './ContentPanel';
import { LayersPanel }            from './LayersPanel';
import { BrandCompliancePanel }   from './BrandCompliancePanel';
import { ExportDialog }           from './ExportDialog';
import { QuickStartDialog }       from './QuickStartDialog';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DesignEditorProps {
  templateId?: string;
}

function getInitialZoom(): number {
  return 1.0;
}

export function DesignEditor({ templateId }: DesignEditorProps) {
  const navigate = useNavigate();
  const params = useParams();
  const actualTemplateId = templateId || params.templateId;

  const template = templates.find(t => t.id === actualTemplateId);

  const [content, setContent] = useState<DesignContent>({
    title:          '',
    subtitle:       '',
    bodyText:       '',
    style:          'basic',
    emphasizedTitle: '',
    date:           '',
    venue:          '',
    rightPanelBg:   'white',
    logoOption:     'CI',
    logoPosition:   'top-left',  // ← 기본값 좌상단
  });
  const [showQuickStartDialog, setShowQuickStartDialog] = useState(false);
  const [showExportDialog,     setShowExportDialog]     = useState(false);
  const [showPreview,          setShowPreview]           = useState(false);
  const [zoom,                 setZoom]                  = useState(getInitialZoom());
  const [showBrandCompliance,  setShowBrandCompliance]   = useState(false);

  // ── Template type flags ──────────────────────────────────────────────
  const isPlacardWide      = actualTemplateId === 'placard-wide-landscape';
  const isPlacard1000x600  = actualTemplateId === 'placard-1000x600';
  const isPlacard2000x1000 = actualTemplateId === 'placard-2000x1000';
  const isPlacard600x1800  = actualTemplateId === 'placard-600x1800';

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold text-gray-900">템플릿을 찾을 수 없습니다</h2>
          <Button type="button" onClick={() => navigate("/brand-graphics")}>
            템플릿 갤러리로
          </Button>
        </div>
      </div>
    );
  }

  // ── Zoom handlers ────────────────────────────────────────────────────
  const ZOOM_STEP = 0.1;
  const ZOOM_MIN  = 0.25;
  const ZOOM_MAX  = 4.0;

  const handleZoomIn  = () => setZoom(prev => Math.min(prev + ZOOM_STEP, ZOOM_MAX));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - ZOOM_STEP, ZOOM_MIN));
  const handleZoomFit = () => setZoom(1.0);

  const handleLoadDemo = (demoContent: DesignContent) => {
    setContent(demoContent);
  };

  // ── Canvas renderer ──────────────────────────────────────────────────
  const renderCanvas = () => {
    if (isPlacardWide)      return <PlacardWideCanvas     content={content} canvasSize={template.size} zoom={zoom} />;
    if (isPlacard1000x600)  return <Placard1000x600Canvas  content={content} canvasSize={template.size} zoom={zoom} />;
    if (isPlacard2000x1000) return <Placard2000x1000Canvas content={content} canvasSize={template.size} zoom={zoom} />;
    if (isPlacard600x1800)  return <Placard600x1800Canvas  content={content} canvasSize={template.size} zoom={zoom} />;
    return <DesignCanvas content={content} canvasSize={template.size} zoom={zoom} onContentChange={setContent} />;
  };

  // ── Status bar text ──────────────────────────────────────────────────
  const renderStatusBar = () => {
    if (isPlacardWide) return (
      <>
        <span>1X = {Math.round(700 / 12)}mm</span>
        <Separator orientation="vertical" className="h-3" />
        <span>현수막 대형(가로) · 4700×700mm</span>
        <Separator orientation="vertical" className="h-3" />
        <span className="text-[#F43182]">LG U+ Brand Guideline</span>
      </>
    );
    if (isPlacard1000x600) return (
      <>
        <span>1X = {Math.round(600 / 12)}mm</span>
        <Separator orientation="vertical" className="h-3" />
        <span>현수막 · 1000×600mm</span>
        <Separator orientation="vertical" className="h-3" />
        <span className="text-[#F43182]">LG U+ Brand Guideline</span>
      </>
    );
    if (isPlacard2000x1000) return (
      <>
        <span>1X = {Math.round(1000 / 12)}mm</span>
        <Separator orientation="vertical" className="h-3" />
        <span>현수막 · 2000×1000mm</span>
        <Separator orientation="vertical" className="h-3" />
        <span className="text-[#F43182]">LG U+ Brand Guideline</span>
      </>
    );
    if (isPlacard600x1800) return (
      <>
        <span>1X = {Math.round(600 / 12)}mm</span>
        <Separator orientation="vertical" className="h-3" />
        <span>현수막 세로 · 600×1800mm</span>
        <Separator orientation="vertical" className="h-3" />
        <span className="text-[#F43182]">LG U+ Brand Guideline</span>
      </>
    );
    return (
      <>
        <span>{template.size.width} × {template.size.height} {template.size.unit}</span>
        <Separator orientation="vertical" className="h-3" />
        <span>Template: {template.category}</span>
        <Separator orientation="vertical" className="h-3" />
        <span className="text-[#F43182]">LG U+ Brand Guideline</span>
      </>
    );
  };

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-[#F5F5F5]">

        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                뒤로가기
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div>
                <h1 className="font-semibold text-gray-900 text-sm">U+ Layer - {template.name}</h1>
                <p className="text-xs text-gray-500">
                  {template.size.width} × {template.size.height} {template.size.unit}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleZoomOut} className="h-8 w-8 p-0">
                      <ZoomOut className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>축소</TooltipContent>
                </Tooltip>

                <span className="text-xs font-medium text-gray-700 min-w-[3rem] text-center">
                  {Math.round(zoom * 100)}%
                </span>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleZoomIn} className="h-8 w-8 p-0">
                      <ZoomIn className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>확대</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleZoomFit} className="h-8 w-8 p-0">
                      <Maximize2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>화면 맞춤 (100%)</TooltipContent>
                </Tooltip>
              </div>

              <Separator orientation="vertical" className="h-6" />

              <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
                <Eye className="w-4 h-4 mr-2" />
                {showPreview ? '편집' : '미리보기'}
              </Button>

              <Button size="sm" onClick={() => setShowExportDialog(true)}>
                <Download className="w-4 h-4 mr-2" />
                내보내기
              </Button>
            </div>
          </div>
        </header>

        {/* ── Main Editor ─────────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">

          {/* Left Panel */}
          {!showPreview && (
            <div className="w-64 flex-shrink-0 bg-white">
              <LayersPanel content={content} />
            </div>
          )}

          {/* Center - Canvas */}
          <div className="flex-1 overflow-hidden">
            {renderCanvas()}
          </div>

          {/* Right Panel */}
          {!showPreview && (
            <div className="w-96 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">

              <div className="flex-1 overflow-y-auto">
                <ContentPanel
                  content={content}
                  onContentChange={setContent}
                  onShowQuickStart={() => setShowQuickStartDialog(true)}
                  templateId={actualTemplateId}
                />
              </div>

              <div className="flex-shrink-0 border-t border-gray-200">
                <button
                  onClick={() => setShowBrandCompliance(!showBrandCompliance)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#F43182]" />
                    <h3 className="text-sm font-semibold text-gray-900">브랜드 검수</h3>
                  </div>
                  {showBrandCompliance
                    ? <ChevronUp   className="w-4 h-4 text-gray-500" />
                    : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
                {showBrandCompliance && (
                  <div className="h-64 overflow-y-auto border-t border-gray-100">
                    <div className="p-4">
                      <BrandCompliancePanel content={content} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-shrink-0 border-t border-gray-200 bg-gradient-to-br from-purple-50 to-blue-50">
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-[#F43182] to-purple-600 rounded-full flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-gray-900">AI 디자인 어시스턴트</h3>
                      <p className="text-xs text-gray-500">추가 솔루션 검색</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="예: 색상 조합 추천해줘"
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F43182] focus:border-transparent"
                    />
                    <button className="px-4 py-2 bg-gradient-to-r from-[#F43182] to-purple-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
                      전송
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['폰트 추천', '레이아웃 개선', '색상 대비', '사이즈 최적화'].map(tag => (
                      <button
                        key={tag}
                        className="px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-full hover:border-[#F43182] hover:text-[#F43182] transition-colors"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          templateName={template.name}
        />
        <QuickStartDialog
          open={showQuickStartDialog}
          onOpenChange={setShowQuickStartDialog}
          onLoadDemo={handleLoadDemo}
        />

        {/* ── Status Bar ──────────────────────────────────────────── */}
        <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-between text-xs text-gray-500 flex-shrink-0">
          <div className="flex items-center gap-4">
            {renderStatusBar()}
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-blue-500" />
            <span>Auto-layout active</span>
          </div>
        </div>

      </div>
    </TooltipProvider>
  );
}
