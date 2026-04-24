import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
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
import { RCSCanvas } from "./RCSCanvas";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Download,
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  Eye,
  Grid3x3,
  Magnet,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { buildDesignCanvasCaptureOptions } from "@/lib/html2canvasDesignCapture";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  createDesign,
  getDesignById,
  listDesignsForUser,
  requireAuthedUserId,
  updateDesign,
  type DesignListItem,
} from "@/lib/designsApi";
interface DesignEditorProps {
  templateId?: string;
}

function getInitialZoom(): number {
  return 1.0;
}

export function DesignEditor({ templateId }: DesignEditorProps) {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const actualTemplateId = templateId || params.templateId;

  const template = templates.find(t => t.id === actualTemplateId);
  const sb = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const [designId, setDesignId] = useState<string | null>(null);
  const [designName, setDesignName] = useState<string>("");

  const [activeDialog, setActiveDialog] = useState<"none" | "save" | "load">( "none");
  const [saveName, setSaveName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const [loadBusy, setLoadBusy] = useState(false);
  const [loadItems, setLoadItems] = useState<DesignListItem[]>([]);

  const [bootBusy, setBootBusy] = useState(false);


  function formatDefaultDesignName(): string {
    const base = template?.name?.trim() || (actualTemplateId ?? "디자인");
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${base} ${yyyy}-${mm}-${dd}`;
  }
  const defaultLogoPosition: DesignContent["logoPosition"] =
    // 가로형 템플릿(예: LinkedIn Post, 16:9 슬라이드 등)은 타이틀과 로고가 겹치기 쉬워 기본값을 우하단으로 둠
    template?.size?.width && template?.size?.height && template.size.width / template.size.height >= 1.7
      ? "bottom-right"
      : "top-left";

  const [content, setContent] = useState<DesignContent>(() => ({
    title: "",
    subtitle: "",
    bodyText: "",
    style: "basic",
    emphasizedTitle: "",
    date: "",
    venue: "",
    rightPanelBg: "white",
    logoOption: "CI",
    // 가로형(높이 낮은) 템플릿은 로고/타이틀 겹침이 잦아 기본값을 우하단으로 둠
    logoPosition: defaultLogoPosition,
  }));
  const [focusTarget, setFocusTarget] = useState<DesignFocusTarget>(null);

  const isPlacardTemplate =
    actualTemplateId === "placard-wide-landscape" ||
    actualTemplateId === "placard-1000x600" ||
    actualTemplateId === "placard-2000x1000" ||
    actualTemplateId === "placard-600x1800" ||
    actualTemplateId === "placard-vertical";
  const isXBannerTemplate = actualTemplateId === "xbanner";

  // 현수막(placard) 템플릿 전용 기본 텍스트 옵션/로고 위치 제한값
  useEffect(() => {
    if (!isPlacardTemplate) return;
    setContent((prev) => {
      const next: DesignContent = { ...prev };

      // 정렬: 메인/본문/유의사항 모두 중앙정렬 (현수막에서만)
      if (!next.posterTitleAlign) next.posterTitleAlign = "center";
      if (!next.posterBodyAlign) next.posterBodyAlign = "center";
      if (!next.posterFooterAlign) next.posterFooterAlign = "center";

      // 기본 글자 크기 스케일
      if (next.posterTitleFontScale == null) next.posterTitleFontScale = 90;
      if (next.posterBodyFontScale == null) next.posterBodyFontScale = 58;
      if (next.posterFooterFontScale == null) next.posterFooterFontScale = 85;

      // 현수막에서 우측 로고 배치 옵션은 제거되므로, 기존 값이 우측이면 좌측 상단으로 정규화
      next.logoPosition = "top-left";

      // 현수막 좌하단 "장소 및 날짜" 기본 텍스트
      if (!next.placardEventInfo?.trim()) {
        next.placardEventInfo = "2026.00.00 ㅣ 엘지유플러스 상암사옥 1층";
      }

      return next;
    });
  }, [isPlacardTemplate]);

  // X배너(xbanner) 템플릿 전용 기본 텍스트 스케일
  useEffect(() => {
    if (!isXBannerTemplate) return;
    setContent((prev) => {
      const next: DesignContent = { ...prev };
      if (next.posterTitleFontScale == null) next.posterTitleFontScale = 190;
      if (next.posterBodyFontScale == null) next.posterBodyFontScale = 180;
      if (next.posterFooterFontScale == null) next.posterFooterFontScale = 230;
      return next;
    });
  }, [isXBannerTemplate]);

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
  const prevShowViGridRef = useRef<boolean>(true);
  /** VI 격자에 맞춘 요소 스냅 (끄면 1px 단위 이동) */
  const [layoutSnapEnabled, setLayoutSnapEnabled] = useState(true);

  const designCanvasRef = useRef<DesignCanvasHandle>(null);
  const [textFormatTarget, setTextFormatTarget] = useState<CanvasTextEditTarget | null>(null);
  const [textOptionsPanelOpen, setTextOptionsPanelOpen] = useState(false);
  const [textFormatSelectionTick, setTextFormatSelectionTick] = useState(0);
  useEffect(() => {
    if (textFormatTarget) setTextOptionsPanelOpen(true);
  }, [textFormatTarget]);

  // 저장/불러오기 다이얼로그가 열리면 캔버스 VI 그리드를 숨겨 "후면 그리드 패턴"이 비치지 않게 함
  useEffect(() => {
    const dialogOpen = activeDialog !== "none";
    if (dialogOpen) {
      prevShowViGridRef.current = showViGrid;
      if (showViGrid) setShowViGrid(false);
      return;
    }
    // 다이얼로그가 닫히면 이전 상태 복원
    if (prevShowViGridRef.current !== showViGrid) {
      setShowViGrid(prevShowViGridRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDialog]);

  // designId로 진입 시 Supabase에서 자동 복원
  useEffect(() => {
    const id = searchParams.get("designId")?.trim() || "";
    if (!id) return;
    if (!sb) return;
    let cancelled = false;
    (async () => {
      setBootBusy(true);
      try {
        const userId = await requireAuthedUserId(sb);
        const row = await getDesignById(sb, { userId, id });
        if (!row) {
          toast.error("저장된 디자인을 찾을 수 없습니다.");
          return;
        }
        // 다른 템플릿이면 해당 템플릿 편집으로 이동
        if (row.template_id && row.template_id !== actualTemplateId) {
          navigate(`/create/${row.template_id}?designId=${encodeURIComponent(row.id)}`, { replace: true });
          return;
        }
        if (cancelled) return;
        setDesignId(row.id);
        setDesignName(row.name || "");
        setContentWithHistory(() => row.canvas_data as DesignContent);
        toast.success("불러오기 완료");
      } catch (e) {
        console.error(e);
        const msg =
          e instanceof Error && e.message === "not_logged_in"
            ? "로그인이 필요합니다."
            : e instanceof Error
              ? e.message
              : "불러오기에 실패했습니다.";
        toast.error(msg);
        if (msg.includes("로그인")) navigate("/", { replace: false });
      } finally {
        if (!cancelled) setBootBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, actualTemplateId, searchParams]);

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

  const captureThumbnailDataUrl = async (): Promise<string | null> => {
    try {
      const el = document.getElementById("design-canvas");
      if (!el) return null;
      const canvas = await html2canvas(
        el,
        buildDesignCanvasCaptureOptions({
          scale: 1,
          logging: false,
          useCORS: true,
          backgroundColor: "#ffffff",
        }) as Parameters<typeof html2canvas>[1]
      );
      // 너무 큰 dataUrl이 되는 것을 방지(간단 썸네일 용도)
      return canvas.toDataURL("image/jpeg", 0.72);
    } catch (e) {
      console.warn("thumbnail_capture_failed", e);
      return null;
    }
  };

  const ensureUserId = async (): Promise<string> => {
    if (!sb) throw new Error("supabase_not_configured");
    return await requireAuthedUserId(sb);
  };

  const openSave = () => {
    setActiveDialog("save");
    setSaveName(designName?.trim() || formatDefaultDesignName());
  };

  const openLoad = async () => {
    if (!sb) {
      toast.error("Supabase 설정이 필요합니다. (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
      return;
    }
    setActiveDialog("load");
    setLoadBusy(true);
    try {
      const userId = await ensureUserId();
      const items = await listDesignsForUser(sb, { userId, templateId: actualTemplateId ?? undefined });
      setLoadItems(items);
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error && e.message === "not_logged_in"
          ? "로그인이 필요합니다."
          : e instanceof Error
            ? e.message
            : "불러오기 목록 조회에 실패했습니다.";
      toast.error(msg);
      if (msg.includes("로그인")) navigate("/", { replace: false });
      setActiveDialog("none");
    } finally {
      setLoadBusy(false);
    }
  };

  const doSaveNew = async (name: string) => {
    if (!sb) throw new Error("supabase_not_configured");
    setSaveBusy(true);
    try {
      const userId = await ensureUserId();
      const thumbnailUrl = await captureThumbnailDataUrl();
      const row = await createDesign(sb, {
        userId,
        templateId: actualTemplateId ?? "",
        name,
        content,
        thumbnailUrl,
      });
      setDesignId(row.id);
      setDesignName(row.name || name);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("designId", row.id);
        return next;
      });
      toast.success("저장 완료");
    } finally {
      setSaveBusy(false);
    }
  };

  const doSaveOverwrite = async (name: string) => {
    if (!sb) throw new Error("supabase_not_configured");
    if (!designId) throw new Error("design_id_missing");
    setSaveBusy(true);
    try {
      const userId = await ensureUserId();
      const thumbnailUrl = await captureThumbnailDataUrl();
      const row = await updateDesign(sb, {
        userId,
        id: designId,
        templateId: actualTemplateId ?? "",
        name,
        content,
        thumbnailUrl,
      });
      setDesignName(row.name || name);
      toast.success("덮어쓰기 완료");
    } finally {
      setSaveBusy(false);
    }
  };

  const isRcsTemplate = actualTemplateId === "rcs-568x368";

  // RCS 기본 텍스트 스케일: 130% (직접 수정 시 유지)
  useEffect(() => {
    if (!isRcsTemplate) return;
    setContent((prev) => {
      const next: DesignContent = { ...prev };
      if (next.titleSize == null) next.titleSize = 130;
      if (next.bodySize == null) next.bodySize = 130;
      return next;
    });
  }, [isRcsTemplate]);

  // ── Canvas ─────────────────────────────────────────────────────
  const renderCanvas = () =>
    isRcsTemplate ? (
      <RCSCanvas content={content} canvasSize={template.size} zoom={zoom} />
    ) : (
      <DesignCanvas
        ref={designCanvasRef}
        content={content}
        templateId={actualTemplateId}
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
      <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F5F5F5]">

        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="flex-shrink-0 bg-white border-b border-gray-200">
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

              <Button type="button" variant="outline" size="sm" onClick={openSave} disabled={saveBusy || bootBusy}>
                {saveBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                저장
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={openLoad} disabled={loadBusy || bootBusy}>
                {loadBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                불러오기
              </Button>

              <Button size="sm" onClick={() => setShowExportDialog(true)}>
                <Download className="w-4 h-4 mr-2" />
                내보내기
              </Button>
            </div>
          </div>
        </header>

        {/* ── Main Editor ─────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Left Panel */}
          {!showPreview && (
            <div className="flex w-64 min-h-0 flex-shrink-0 flex-col bg-white border-r border-gray-200">
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
                  isRcsTemplate ? (
                    <div className="border border-gray-200 bg-white shadow-md rounded-lg overflow-hidden flex flex-col max-h-[min(70vh,520px)]">
                      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0">
                        <span className="text-[11px] font-semibold text-gray-800">문자 옵션 (RCS)</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setTextOptionsPanelOpen(false)}
                        >
                          닫기
                        </Button>
                      </div>
                      <div className="p-2 overflow-y-auto flex flex-col gap-3 text-left">
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-semibold text-gray-700">메인 타이틀 크기</span>
                          <input
                            type="range"
                            min={70}
                            max={140}
                            step={5}
                            value={content.titleSize ?? 100}
                            onChange={(e) => setContentWithHistory((prev) => ({ ...prev, titleSize: Number(e.target.value) }))}
                            className="h-2 w-full cursor-pointer accent-[#F43182]"
                          />
                          <div className="text-[10px] text-gray-500 font-mono tabular-nums">{content.titleSize ?? 100}%</div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[11px] font-semibold text-gray-700">본문 크기</span>
                          <input
                            type="range"
                            min={70}
                            max={140}
                            step={5}
                            value={content.bodySize ?? 100}
                            onChange={(e) => setContentWithHistory((prev) => ({ ...prev, bodySize: Number(e.target.value) }))}
                            className="h-2 w-full cursor-pointer accent-[#F43182]"
                          />
                          <div className="text-[10px] text-gray-500 font-mono tabular-nums">{content.bodySize ?? 100}%</div>
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-semibold text-gray-700">굵기 · Title</span>
                            <div className="grid grid-cols-4 gap-1.5">
                              {(["light", "standard", "semi-bold", "bold"] as const).map((w) => {
                                const active = (content as any).titleWeight === w;
                                return (
                                  <button
                                    key={`title-${w}`}
                                    type="button"
                                    onClick={() => setContentWithHistory((prev) => ({ ...(prev as any), titleWeight: w }))}
                                    className={`rounded-md border px-1.5 py-1 text-[10px] font-semibold ${
                                      active
                                        ? "border-[#F43182] bg-[#F43182]/10 text-[#F43182]"
                                        : "border-gray-200 bg-white text-gray-700"
                                    }`}
                                  >
                                    {w.replace("-", " ")}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <span className="text-[11px] font-semibold text-gray-700">굵기 · 본문</span>
                            <div className="grid grid-cols-4 gap-1.5">
                              {(["light", "standard", "semi-bold", "bold"] as const).map((w) => {
                                const active = (content as any).bodyWeight === w;
                                return (
                                  <button
                                    key={`body-${w}`}
                                    type="button"
                                    onClick={() => setContentWithHistory((prev) => ({ ...(prev as any), bodyWeight: w }))}
                                    className={`rounded-md border px-1.5 py-1 text-[10px] font-semibold ${
                                      active
                                        ? "border-[#F43182] bg-[#F43182]/10 text-[#F43182]"
                                        : "border-gray-200 bg-white text-gray-700"
                                    }`}
                                  >
                                    {w.replace("-", " ")}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <p className="text-[10px] text-gray-500 leading-snug">
                            RCS는 크기/굵기 옵션으로 조절합니다.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <CanvasTextFormatPanel
                      target={textFormatTarget}
                      content={content}
                      onDraft={setContentWithHistory}
                      selectionRenderTick={textFormatSelectionTick}
                      getSelection={() => designCanvasRef.current?.getInlineTextSelection() ?? null}
                      onTogglePartialStyle={(w) => designCanvasRef.current?.handleTogglePartialStyle(w)}
                      onClose={() => setTextOptionsPanelOpen(false)}
                    />
                  )
                ) : null}
                <p className="text-[9px] text-gray-500 leading-snug px-0.5">
                  Shift+클릭으로 여러 요소를 추가·해제해 함께 이동·정렬할 수 있습니다. 빈 배경을 클릭하면 선택이 해제됩니다.
                </p>

                {null}
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

          {/* Right Panel — 전체 높이 고정, 패널만 독립 스크롤 */}
          {!showPreview && (
            <div className="flex w-96 min-h-0 flex-shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
                <ContentPanel
                  content={content}
                  onContentChange={setContentWithHistory}
                  onShowQuickStart={() => setShowQuickStartDialog(true)}
                  templateId={actualTemplateId}
                  focusTarget={focusTarget}
                />
                <div className="border-t border-gray-200 bg-gradient-to-br from-purple-50 to-blue-50">
                  <div className="space-y-3 p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#F43182] to-purple-600">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
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
            </div>
          )}
        </div>

        {/* ── Save ─────────────────────────────────────────────────── */}
        <Dialog open={activeDialog === "save"} onOpenChange={(o) => (saveBusy ? null : setActiveDialog(o ? "save" : "none"))}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>저장하기</DialogTitle>
              <DialogDescription>디자인 이름을 입력하고 저장 방식을 선택하세요.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="design-save-name">이름</Label>
              <Input
                id="design-save-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={formatDefaultDesignName()}
                disabled={saveBusy}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveDialog("none")}
                disabled={saveBusy}
              >
                취소
              </Button>
              {designId ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const name = saveName.trim() || formatDefaultDesignName();
                    setSaveName(name);
                    void (async () => {
                      try {
                        await doSaveNew(name);
                        setActiveDialog("none");
                      } catch (e) {
                        console.error(e);
                        const msg =
                          e instanceof Error && e.message === "not_logged_in"
                            ? "로그인이 필요합니다."
                            : e instanceof Error
                              ? e.message
                              : "저장에 실패했습니다.";
                        toast.error(msg);
                        if (msg.includes("로그인")) navigate("/", { replace: false });
                      }
                    })();
                  }}
                  disabled={saveBusy}
                >
                  {saveBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  새로 저장
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() => {
                  const name = saveName.trim() || formatDefaultDesignName();
                  setSaveName(name);
                  if (!sb) {
                    toast.error("Supabase 설정이 필요합니다. (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
                    return;
                  }
                  void (async () => {
                    try {
                      if (designId) await doSaveOverwrite(name);
                      else await doSaveNew(name);
                      setActiveDialog("none");
                    } catch (e) {
                      console.error(e);
                      const msg =
                        e instanceof Error && e.message === "not_logged_in"
                          ? "로그인이 필요합니다."
                          : e instanceof Error
                            ? e.message
                            : "저장에 실패했습니다.";
                      toast.error(msg);
                      if (msg.includes("로그인")) navigate("/", { replace: false });
                    }
                  })();
                }}
                disabled={saveBusy}
              >
                {saveBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {designId ? "덮어쓰기" : "저장"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Load ─────────────────────────────────────────────────── */}
        <Dialog open={activeDialog === "load"} onOpenChange={(o) => (loadBusy ? null : setActiveDialog(o ? "load" : "none"))}>
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>불러오기</DialogTitle>
              <DialogDescription>저장된 디자인을 선택해 현재 캔버스에 복원합니다.</DialogDescription>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              {loadBusy ? (
                <div className="flex items-center justify-center py-10 text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  불러오는 중…
                </div>
              ) : loadItems.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">저장된 항목이 없습니다.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {loadItems.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      className="group flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm hover:border-[#F43182] hover:shadow-md transition"
                      onClick={() => {
                        if (!sb) return;
                        void (async () => {
                          setLoadBusy(true);
                          try {
                            const userId = await ensureUserId();
                            const row = await getDesignById(sb, { userId, id: it.id });
                            if (!row) {
                              toast.error("저장된 디자인을 찾을 수 없습니다.");
                              return;
                            }
                            setDesignId(row.id);
                            setDesignName(row.name || "");
                            setSearchParams((prev) => {
                              const next = new URLSearchParams(prev);
                              next.set("designId", row.id);
                              return next;
                            });
                            setContentWithHistory(() => row.canvas_data as DesignContent);
                            toast.success("불러오기 완료");
                            setActiveDialog("none");
                          } catch (e) {
                            console.error(e);
                            const msg =
                              e instanceof Error && e.message === "not_logged_in"
                                ? "로그인이 필요합니다."
                                : e instanceof Error
                                  ? e.message
                                  : "불러오기에 실패했습니다.";
                            toast.error(msg);
                            if (msg.includes("로그인")) navigate("/", { replace: false });
                          } finally {
                            setLoadBusy(false);
                          }
                        })();
                      }}
                    >
                      <div className="aspect-[4/3] w-full bg-gray-50">
                        {it.thumbnail_url ? (
                          <img src={it.thumbnail_url} alt={it.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">NO THUMB</div>
                        )}
                      </div>
                      <div className="w-full p-3">
                        <div className="truncate text-sm font-semibold text-gray-900">{it.name}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {new Date(it.updated_at || it.created_at).toLocaleString()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setActiveDialog("none")} disabled={loadBusy}>
                닫기
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
        <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-200 bg-white px-4 py-2 text-xs text-gray-500">
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
