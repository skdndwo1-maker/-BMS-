import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { templates } from "@/design/templates";
import type { DesignContent } from "@/design/types";
import { DesignCanvas, type DesignCanvasHandle, type DesignFocusTarget } from './DesignCanvas';
import type { CanvasTextEditTarget } from '@/design/canvasTextTypography';
import { CanvasTextFormatPanel } from './CanvasTextFormatPanel';
import { ContentPanel }           from './ContentPanel';
import { LayersPanel }            from './LayersPanel';
import { QuickStartDialog }       from './QuickStartDialog';
import { DesignAssistantChat }    from './DesignAssistantChat';
import { RCSCanvas } from "./RCSCanvas";
import { RCSPhoneMmsPreview } from "./RCSPhoneMmsPreview";
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
  X,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { captureDesignCanvas } from "@/lib/designCanvasCapture";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  createDesign,
  getDesignById,
  listDesignsForUser,
  requireAuthedUserId,
  updateDesign,
  type DesignListItem,
} from "@/lib/designsApi";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";

const ExportDialog = lazy(() => import("./ExportDialog").then((m) => ({ default: m.ExportDialog })));

/** RCS 카드·우측 목업(높이 동기화) 기준 표시 — 10% 축소 시 0.9 */
const RCS_WORKSPACE_DISPLAY_SCALE = 0.9;
/** RCS 메인 타이틀 크기 슬라이더 상한(%). 기존 대비 +20%, step 5 정렬 */
const RCS_TITLE_SIZE_MAX = 170;
const RCS_TITLE_SIZE_MAX_BENEFIT = 220;
/** 워크스페이스 한 변당 여백 ≈ 화면(컨테이너)의 1/15 — 좌·우·상·하 대칭 */
const RCS_WORKSPACE_EDGE_FRACTION = 1 / 15;

/** `public/rcs-galaxy-mockup.png` (189×390) 흰 화면 영역 — 실제 픽셀에 맞춘 비율 */
const RCS_GALAXY_SCREEN_INSET = {
  top: "10.8%",
  left: "6.3%",
  right: "6.3%",
  bottom: "11.2%",
} as const;

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
  /**
   * URL designId 자동 복원이 "방금 저장/불러오기"로 들어온 변경 때문에 다시 돌지 않도록 추적.
   * 저장 직후 setSearchParams로 designId를 갱신하면 useEffect가 다시 트리거되어
   * 이미 캔버스에 있는 동일 데이터를 서버에서 또 받아와 "불러오기 완료" 토스트가 뜨는 것을 막는다.
   */
  const lastLoadedIdRef = useRef<string | null>(null);


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

  /** AI 디자인 교정: 캔버스에 덮지 않고 옆 패널에 표시할 참조 이미지(data URL) */
  const [correctionReferenceUrl, setCorrectionReferenceUrl] = useState<string | null>(null);
  /** #design-canvas 의 화면상 크기 — 참조 패널을 동일 픽셀 크기로 맞춤 */
  const [correctionRefBox, setCorrectionRefBox] = useState<{ w: number; h: number } | null>(null);
  /** RCS: 메인 카드 높이와 갤럭시 목업 표시 높이 동기화(원본 종횡비 유지) */
  const [rcsFrameHeightPx, setRcsFrameHeightPx] = useState<number | null>(null);

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

  /**
   * Undo (Cmd/Ctrl+Z) — 모든 content 변경을 자동으로 스냅샷.
   *
   * 핵심 설계:
   *  - 어떤 경로(setContentWithHistory, raw setContent, 자식 컴포넌트의 onContentChange 등)로
   *    content가 바뀌든 단일 useEffect가 변경 직전 값을 undo 스택에 push.
   *  - 드래그/리사이즈/슬라이더처럼 짧은 시간 안에 수십~수백 회 변경이 일어나는 경우는
   *    burst의 "시작 직전 상태" 하나만 기록(coalescing)되도록 함 → 1회 Cmd+Z로 직전 상태 복원.
   *  - undo 적용 자체로 발생하는 setContent는 isApplyingUndoRef 플래그로 스택에 들어가지 않게 함.
   */
  const UNDO_LIMIT = 200;
  const COALESCE_MS = 250;
  const undoRef = useRef<{ stack: DesignContent[]; idx: number }>({ stack: [], idx: -1 });
  const lastSnapshotAtRef = useRef<number>(0);
  const isApplyingUndoRef = useRef<boolean>(false);
  const prevContentRef = useRef<DesignContent | null>(null);
  /** 텍스트 입력처럼 매 글자 push가 부담스러운 경우, 같은 키 안에서는 burst로만 합쳐 1회 push 보장 */
  const lastBurstKeyRef = useRef<string | null>(null);

  /** 내부 helper: content 변화를 history에 반영 */
  const pushHistorySnapshot = useCallback((prev: DesignContent) => {
    const u = undoRef.current;
    const trimmed = u.stack.slice(0, u.idx + 1);
    trimmed.push(prev);
    while (trimmed.length > UNDO_LIMIT) trimmed.shift();
    undoRef.current = { stack: trimmed, idx: trimmed.length - 1 };
  }, []);

  // content 자동 추적: 모든 변경 경로를 일관되게 기록
  useEffect(() => {
    if (prevContentRef.current === null) {
      prevContentRef.current = content;
      return;
    }
    if (prevContentRef.current === content) return;

    if (isApplyingUndoRef.current) {
      prevContentRef.current = content;
      isApplyingUndoRef.current = false;
      return;
    }

    const now = Date.now();
    const inBurst =
      lastBurstKeyRef.current !== null ||
      now - lastSnapshotAtRef.current < COALESCE_MS;
    if (!inBurst) {
      pushHistorySnapshot(prevContentRef.current);
    }
    lastSnapshotAtRef.current = now;
    prevContentRef.current = content;
  }, [content, pushHistorySnapshot]);

  /** 기존 호환을 위한 별칭. 이제 일반 setContent와 같다 — 스냅샷은 useEffect가 처리 */
  const setContentWithHistory = setContent;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod || key !== "z") return;
      const ae = document.activeElement;
      const inEditable =
        ae instanceof HTMLInputElement ||
        ae instanceof HTMLTextAreaElement ||
        (ae as HTMLElement | null)?.isContentEditable;
      if (inEditable) {
        // 텍스트 입력 자체의 undo는 브라우저에 위임
        return;
      }
      e.preventDefault();
      const u = undoRef.current;
      if (u.idx < 0) return;
      const prev = u.stack[u.idx];
      undoRef.current = { stack: u.stack.slice(0, u.idx), idx: u.idx - 1 };
      isApplyingUndoRef.current = true;
      lastBurstKeyRef.current = null;
      lastSnapshotAtRef.current = 0;
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
    if (!id) {
      lastLoadedIdRef.current = null;
      return;
    }
    if (!sb) return;
    if (id === lastLoadedIdRef.current) {
      // 동일 디자인은 이미 캔버스에 반영되어 있으므로 재로딩하지 않는다 (저장 직후 트리거 방지)
      return;
    }
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
        lastLoadedIdRef.current = row.id;
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

  /**
   * 자동 history 도입 이후에는 별도 호출이 불필요. (호환을 위해 noop으로 유지)
   * 텍스트 인라인 편집 시작 시점 등 "burst 시작" 신호로만 사용 가능.
   */
  const pushUndoSnapshot = () => {
    // useEffect가 다음 변경 시 직전 상태를 자동 push 한다.
    lastBurstKeyRef.current = null;
    lastSnapshotAtRef.current = 0;
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
      const canvas = await captureDesignCanvas(el, { scale: 1, backgroundColor: "#ffffff" });
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
      // 저장한 결과를 URL에 반영하되, 자동 복원 useEffect가 다시 돌지 않게 가드.
      lastLoadedIdRef.current = row.id;
      setDesignId(row.id);
      setDesignName(row.name || name);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("designId", row.id);
          return next;
        },
        { replace: true }
      );
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
  const rcsMessageType = (content as any)?.rcsMessageType as string | undefined;
  const effectiveCanvasSize = useMemo(() => {
    if (!isRcsTemplate) return template.size;
    const isBenefitInfo = rcsMessageType === "혜택안내";
    return {
      ...template.size,
      height: isBenefitInfo ? 528 : 338,
      name: `568x${isBenefitInfo ? 528 : 338}`,
    };
  }, [isRcsTemplate, rcsMessageType, template.size]);

  // RCS 기본 텍스트 스케일: 130% (직접 수정 시 유지)
  useEffect(() => {
    if (!isRcsTemplate) return;
    setContent((prev) => {
      const next: DesignContent = { ...prev };
      if (next.titleSize == null) next.titleSize = 130;
      if (next.bodySize == null) next.bodySize = 130;
      if ((next as any).titleWeight == null) (next as any).titleWeight = "bold";
      if ((next as any).bodyWeight == null) (next as any).bodyWeight = "standard";
      return next;
    });
  }, [isRcsTemplate]);

  // ── Canvas ─────────────────────────────────────────────────────
  /** RCS: 워크스페이스 가운데 정렬 + 우측 갤럭시 목업(높이=RCS 카드). compact는 교정 패널 시 목업 생략 */
  const renderCanvas = (opts?: { rcsWorkspace?: "full" | "compact" }) => {
    if (!isRcsTemplate) {
      return (
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
    }

    const rcsWorkspace = opts?.rcsWorkspace ?? "full";
    const rcsCanvas = (
      <RCSCanvas
        content={content}
        canvasSize={effectiveCanvasSize}
        zoom={zoom}
        workspaceDisplayScale={RCS_WORKSPACE_DISPLAY_SCALE}
        workspaceAlign="center"
        workspaceEdgeFraction={RCS_WORKSPACE_EDGE_FRACTION}
      />
    );

    if (rcsWorkspace === "compact") {
      return (
        <div className="flex h-full min-h-0 w-full items-center justify-center overflow-auto bg-[#EEEFF1] px-3">
          {rcsCanvas}
        </div>
      );
    }

    const mockH = rcsFrameHeightPx && rcsFrameHeightPx > 0 ? rcsFrameHeightPx : undefined;

    return (
      <div className="flex h-full min-h-0 w-full items-stretch overflow-hidden bg-[#EEEFF1]">
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto py-2 px-2 sm:px-3">
          {rcsCanvas}
        </div>
        <div className="flex h-full min-h-0 w-[min(420px,40vw)] min-w-[280px] shrink-0 flex-col border-l border-gray-200 bg-gradient-to-b from-[#E6E7EB] to-[#DDDEE3]">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-2 py-2 sm:px-3">
            <div className="relative inline-block max-w-full leading-none">
              <img
                src="/rcs-galaxy-mockup.png"
                alt="RCS 모바일 미리보기 Galaxy 프레임"
                width={189}
                height={390}
                className="pointer-events-none mx-auto block h-auto w-auto max-h-[min(92vh,760px)] max-w-[min(360px,calc(40vw-1.5rem))] select-none object-contain drop-shadow-xl"
                style={
                  mockH
                    ? { height: mockH, width: "auto", maxHeight: mockH }
                    : undefined
                }
              />
              <div
                className="absolute overflow-hidden rounded-[9px]"
                style={{
                  top: RCS_GALAXY_SCREEN_INSET.top,
                  left: RCS_GALAXY_SCREEN_INSET.left,
                  right: RCS_GALAXY_SCREEN_INSET.right,
                  bottom: RCS_GALAXY_SCREEN_INSET.bottom,
                }}
              >
                <RCSPhoneMmsPreview
                  content={content}
                  canvasSize={effectiveCanvasSize}
                  inDeviceFrame
                  className="h-full min-h-0 w-full"
                />
              </div>
            </div>
          </div>
          <p className="shrink-0 px-2 pb-2 text-center text-[10px] leading-snug text-gray-500">
            MMS 수신 미리보기 · 편집 내용이 카드에 실시간으로 반영됩니다
          </p>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!isRcsTemplate) {
      setRcsFrameHeightPx(null);
      return;
    }
    let cancelled = false;
    const sync = () => {
      if (cancelled) return;
      const el = document.getElementById("design-canvas");
      if (!el) return;
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) setRcsFrameHeightPx(h);
    };
    sync();
    const raf = requestAnimationFrame(sync);
    const el = document.getElementById("design-canvas");
    if (!el) {
      cancelAnimationFrame(raf);
      return () => {
        cancelled = true;
      };
    }
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [isRcsTemplate, showPreview, zoom, content, effectiveCanvasSize.height, effectiveCanvasSize.width, rcsMessageType]);

  useEffect(() => {
    if (!correctionReferenceUrl || showPreview) {
      setCorrectionRefBox(null);
      return;
    }
    const sync = () => {
      const el = document.getElementById("design-canvas");
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setCorrectionRefBox({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    sync();
    const el = document.getElementById("design-canvas");
    if (!el) return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [correctionReferenceUrl, showPreview, zoom, content, effectiveCanvasSize.width, effectiveCanvasSize.height, isRcsTemplate]);

  const renderStatusBar = () => {
    const { width: sw, height: sh, unit } = effectiveCanvasSize;
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
        <span className="text-[#FF7F66]">Brand Guideline</span>
      </>
    );
  };

  return (
    <TooltipProvider>
      <div className="fixed inset-0 z-0 flex min-h-0 flex-col overflow-hidden bg-[#F5F5F5]">

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
                <AxisBrandTitle subtitle="브랜드 그래픽 제작" compact />
                <p className="mt-1 text-sm font-semibold text-gray-900">{template.name}</p>
                <p className="text-xs text-gray-500">
                  {effectiveCanvasSize.width} × {effectiveCanvasSize.height} {effectiveCanvasSize.unit}
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
                            max={rcsMessageType === "혜택안내" ? RCS_TITLE_SIZE_MAX_BENEFIT : RCS_TITLE_SIZE_MAX}
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
                      onApplyPartialColor={(hex) => designCanvasRef.current?.handleApplyPartialColor(hex)}
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
            {correctionReferenceUrl && !showPreview ? (
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <div className="flex min-h-0 min-w-0 flex-1 items-stretch justify-stretch overflow-auto">
                  {renderCanvas(isRcsTemplate ? { rcsWorkspace: "compact" } : undefined)}
                </div>
                <aside className="flex max-h-full shrink-0 flex-col gap-2 border-l border-gray-200 bg-white/95 py-2 pl-3 pr-2 shadow-sm">
                  <div className="flex max-w-[min(92vw,420px)] items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-800">VI 교정 참조</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0 text-gray-500 hover:text-gray-800"
                      title="참조 닫기"
                      onClick={() => setCorrectionReferenceUrl(null)}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  <p className="max-w-[min(92vw,420px)] text-[10px] leading-snug text-gray-500">
                    왼쪽 작업 캔버스와 같은 표시 크기·비율입니다. 참고하며 따라 그리듯 편집할 수 있습니다.
                  </p>
                  {correctionRefBox && correctionRefBox.w > 0 && correctionRefBox.h > 0 ? (
                    <div
                      className="shrink-0 rounded-lg border border-gray-200 bg-gray-50"
                      style={{ width: correctionRefBox.w, height: correctionRefBox.h }}
                    >
                      <img
                        src={correctionReferenceUrl}
                        alt="VI 교정 참조"
                        className="h-full w-full bg-white object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-[10px] text-gray-400">
                      크기 맞추는 중…
                    </div>
                  )}
                </aside>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-hidden">{renderCanvas()}</div>
            )}
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
                <div
                  className={[
                    "relative border-t border-violet-200/45",
                    "bg-gradient-to-br from-[#FFF5F0] via-[#EDE9FE] to-[#DBEAFE]",
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_-12px_40px_-14px_rgba(109,40,217,0.16)]",
                    "before:pointer-events-none before:absolute before:inset-0 before:content-[''] before:bg-gradient-to-t before:from-transparent before:via-transparent before:to-white/25",
                  ].join(" ")}
                >
                  <div className="relative space-y-3 p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#FF7F66] via-[#A855F7] to-[#6366F1] shadow-sm ring-2 ring-white/80">
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
                      onCorrectionReference={setCorrectionReferenceUrl}
                      templateId={actualTemplateId ?? ""}
                      /* RCS(568×338)만 제외 — 그 외 온라인/오프라인은 우측 패널 부제·본문 슬롯과 동일 규칙 */
                      panelSyncedTextSuggest={!isRcsTemplate}
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
                      className="group flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm hover:border-[#FF7F66] hover:shadow-md transition"
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
                            lastLoadedIdRef.current = row.id;
                            setDesignId(row.id);
                            setDesignName(row.name || "");
                            setSearchParams(
                              (prev) => {
                                const next = new URLSearchParams(prev);
                                next.set("designId", row.id);
                                return next;
                              },
                              { replace: true }
                            );
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
                      <div className="flex aspect-[4/3] w-full min-h-0 items-center justify-center overflow-hidden bg-gray-100">
                        {it.thumbnail_url ? (
                          <img
                            src={it.thumbnail_url}
                            alt={it.name}
                            className="block max-h-full min-h-0 w-full max-w-full object-contain object-center"
                          />
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

        {showExportDialog ? (
          <Suspense fallback={null}>
            <ExportDialog
              open={showExportDialog}
              onOpenChange={setShowExportDialog}
              templateName={template.name}
              canvasSize={effectiveCanvasSize}
            />
          </Suspense>
        ) : null}
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
