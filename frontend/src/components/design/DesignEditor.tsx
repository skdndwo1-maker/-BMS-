import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import { templates } from "@/design/templates";
import type { DesignContent } from "@/design/types";
import { DesignCanvas, type DesignCanvasHandle, type DesignFocusTarget } from './DesignCanvas';
import type { CanvasTextEditTarget } from '@/design/canvasTextTypography';
import { CanvasTextFormatPanel } from './CanvasTextFormatPanel';
import { ContentPanel }           from './ContentPanel';
import { LayersPanel }            from './LayersPanel';
import { ExportDialog }           from './ExportDialog';
import { QuickStartDialog }       from './QuickStartDialog';
import { DesignAssistantChat }    from './DesignAssistantChat';
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
  Grid3x3,
  Magnet,
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
  const [focusTarget, setFocusTarget] = useState<DesignFocusTarget>(null);

  // Undo stack (Ctrl/Cmd+Z)
  const undoRef = useRef<{ stack: DesignContent[]; idx: number }>({ stack: [], idx: -1 });

  const setContentWithHistory = (next: DesignContent | ((prev: DesignContent) => DesignContent)) => {
    setContent((prev) => {
      const resolved = typeof next === "function" ? (next as (p: DesignContent) => DesignContent)(prev) : next;
      // push prev into undo stack
      const u = undoRef.current;
      const trimmed = u.stack.slice(0, u.idx + 1);
      trimmed.push(prev);
      undoRef.current = { stack: trimmed, idx: trimmed.length - 1 };
      return resolved;
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z";
      if (!isUndo) return;
      e.preventDefault();
      const u = undoRef.current;
      if (u.idx < 0) return;
      const prev = u.stack[u.idx];
      undoRef.current = { stack: u.stack, idx: u.idx - 1 };
      setContent(prev);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const [showQuickStartDialog, setShowQuickStartDialog] = useState(false);
  const [showExportDialog,     setShowExportDialog]     = useState(false);
  const [showPreview,          setShowPreview]           = useState(false);
  const [zoom,                 setZoom]                  = useState(getInitialZoom());
  /** VI 12분할 정렬 그리드 (캔버스 위 오버레이) */
  const [showViGrid, setShowViGrid] = useState(true);
  /** VI 격자에 맞춘 요소 스냅 (끄면 1px 단위 이동) */
  const [layoutSnapEnabled, setLayoutSnapEnabled] = useState(true);

  const designCanvasRef = useRef<DesignCanvasHandle>(null);
  const [textFormatTarget, setTextFormatTarget] = useState<CanvasTextEditTarget | null>(null);
  const [textOptionsPanelOpen, setTextOptionsPanelOpen] = useState(false);
  const [textFormatSelectionTick, setTextFormatSelectionTick] = useState(0);
  useEffect(() => {
    if (textFormatTarget) setTextOptionsPanelOpen(true);
  }, [textFormatTarget]);

  const pushUndoSnapshot = () => {
    setContent((prev) => {
      const u = undoRef.current;
      const trimmed = u.stack.slice(0, u.idx + 1);
      trimmed.push(prev);
      undoRef.current = { stack: trimmed, idx: trimmed.length - 1 };
      return prev;
    });
  };

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
    setContentWithHistory(() => demoContent);
  };

  // ── Canvas: 모든 템플릿에 동일 에디터(정규화 좌표 0~1 · 프레임 비율은 template.size로 반영) ──
  const renderCanvas = () => (
    <DesignCanvas
      ref={designCanvasRef}
      content={content}
      canvasSize={template.size}
      zoom={zoom}
      onContentChange={setContentWithHistory}
      onContentDraftChange={setContent}
      onBeginCanvasTextEdit={pushUndoSnapshot}
      onFocusChange={setFocusTarget}
      showViGrid={showViGrid}
      layoutSnapEnabled={layoutSnapEnabled}
      onTextFormatTargetChange={setTextFormatTarget}
      onCanvasTextSelectionChanged={() => setTextFormatSelectionTick((n) => n + 1)}
    />
  );

  const renderStatusBar = () => {
    const { width: sw, height: sh, unit } = template.size;
    const shortSide = Math.min(sw, sh);
    const oneX =
      unit === "mm"
        ? `1X ≈ ${Math.round(shortSide / 12)}mm`
        : unit === "in"
          ? `1X ≈ ${(shortSide / 12).toFixed(2)}in`
          : `1X ≈ ${Math.round(shortSide / 12)}px`;
    return (
      <>
        <span>{oneX}</span>
        <Separator orientation="vertical" className="h-3" />
        <span>
          {sw} × {sh} {unit} · {template.name}
        </span>
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
                <h1 className="font-semibold text-gray-900 text-sm">U+ AI 브랜드 Agent - {template.name}</h1>
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
            <div className="w-64 flex-shrink-0 flex flex-col min-h-0 bg-white border-r border-gray-200">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <LayersPanel content={content} />
              </div>
              <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 p-2 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full h-9 text-xs font-medium"
                  onClick={() => setTextOptionsPanelOpen((o) => !o)}
                >
                  텍스트 옵션
                </Button>
                {textOptionsPanelOpen ? (
                  <CanvasTextFormatPanel
                    target={textFormatTarget}
                    content={content}
                    onDraft={setContent}
                    selectionRenderTick={textFormatSelectionTick}
                    getSelection={() => designCanvasRef.current?.getInlineTextSelection() ?? null}
                    onTogglePartialStyle={(w) => designCanvasRef.current?.handleTogglePartialStyle(w)}
                    onClose={() => setTextOptionsPanelOpen(false)}
                  />
                ) : null}
                <p className="text-[9px] text-gray-500 leading-snug px-0.5">
                  Shift+클릭으로 여러 요소를 추가·해제해 함께 이동·정렬할 수 있습니다. 빈 배경을 클릭하면 선택이 해제됩니다.
                </p>
              </div>
            </div>
          )}

          {/* Center - Canvas + VI 그리드 토글 */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 bg-white/95">
              <span className="text-xs text-gray-500">캔버스 보기</span>
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showViGrid ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setShowViGrid((v) => !v)}
                      className="gap-1.5 h-8"
                    >
                      <Grid3x3 className="w-4 h-4" />
                      VI 그리드 {showViGrid ? "켜짐" : "꺼짐"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>12분할 기준 격자를 캔버스 위에 표시합니다</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={layoutSnapEnabled ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setLayoutSnapEnabled((v) => !v)}
                      className="gap-1.5 h-8"
                    >
                      <Magnet className="w-4 h-4" />
                      스냅 {layoutSnapEnabled ? "켜짐" : "꺼짐"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>켜면 요소 이동·크기 조절이 VI 격자에 맞춰집니다</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">{renderCanvas()}</div>
          </div>

          {/* Right Panel */}
          {!showPreview && (
            <div className="w-96 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">

              <div className="flex-1 overflow-y-auto">
                <ContentPanel
                  content={content}
                  onContentChange={setContentWithHistory}
                  onShowQuickStart={() => setShowQuickStartDialog(true)}
                  templateId={actualTemplateId}
                  focusTarget={focusTarget}
                />
              </div>

              <div className="flex-shrink-0 border-t border-gray-200 bg-gradient-to-br from-purple-50 to-blue-50">
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-[#F43182] to-purple-600 rounded-full flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-gray-900">AI 디자인 어시스턴트</h3>
                      <p className="text-xs text-gray-500">텍스트 제안 · VI 검수 · 시각 교정</p>
                    </div>
                  </div>
                  <DesignAssistantChat
                    content={content}
                    onApplyContent={setContentWithHistory}
                    templateId={actualTemplateId ?? ""}
                  />
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
