/**
 * 포스터 캔버스용: 정규화 rect(0~1) 기준 드래그·리사이즈, 네 모서리 동일 r값
 */

import { useRef, useCallback, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export type NormalizedRect = { x: number; y: number; width: number; height: number };

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** 모서리 4 + 변 중앙 4 = 8방향 리사이즈 (박스 바깥으로 살짝 돌출) */
const HANDLE = 10;

interface Props {
  rect: NormalizedRect;
  canvasW: number;
  canvasH: number;
  onRectChange: (next: NormalizedRect) => void;
  isSelected: boolean;
  onSelect: (opts?: { additive?: boolean }) => void;
  zIndex: number;
  children: ReactNode;
  /** true면 이동/리사이즈 비활성(선택/더블클릭 편집은 유지) */
  locked?: boolean;
  /** 선택 시 외곽선 (편집 가능 표시) */
  label?: string;
  /** 모서리 라운드 모드 */
  borderRadiusMode?: "auto" | "pill" | "square";
  /** auto 라운드 배율 */
  borderRadiusScale?: number;
  /** Alt+드래그로 내부 패닝 */
  onPan?: (deltaPx: { dx: number; dy: number }, ev: MouseEvent) => void;
  /** true면 Alt 없이 드래그 = 박스 이동 대신 내부 패닝(이미지 object-position 등) */
  panDragInsteadOfMove?: boolean;
  /** Alt+패닝 드래그 종료(세션 초기화용) */
  onPanEnd?: () => void;
  /** VI 격자 스냅(px). 미지정 시 1px */
  snapStepPx?: number;
  /** 리사이즈 최소 너비(px). 미지정 시 24 */
  minWidthPx?: number;
  /** 리사이즈 최소 높이(px). 미지정 시 24 */
  minHeightPx?: number;
  onOverlayDoubleClick?: (e: React.MouseEvent) => void;
  /** 선택 시 라벨 옆에 표시 — 캔버스에서 해당 박스 제거 */
  onRequestDelete?: () => void;
}

export function DraggableCanvasOverlay({
  rect,
  canvasW,
  canvasH,
  onRectChange,
  isSelected,
  onSelect,
  zIndex,
  children,
  locked = false,
  label,
  borderRadiusMode = "auto",
  borderRadiusScale = 1,
  onPan,
  snapStepPx,
  minWidthPx,
  minHeightPx,
  onOverlayDoubleClick,
  onRequestDelete,
  onPanEnd,
  panDragInsteadOfMove = false,
}: Props) {
  const [hover, setHover] = useState(false);
  const minW = minWidthPx ?? 24;
  const minH = minHeightPx ?? 24;
  const px = {
    x: rect.x * canvasW,
    y: rect.y * canvasH,
    width: rect.width * canvasW,
    height: rect.height * canvasH,
  };

  const rPx =
    borderRadiusMode === "square"
      ? 0
      : borderRadiusMode === "pill"
        ? Math.max(1, px.height / 2)
        : Math.max(10, Math.min(px.width, px.height) * 0.06 * Math.max(0.2, borderRadiusScale));

  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  const onMouseDownMove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect({ additive: e.shiftKey || (e as unknown as { metaKey?: boolean; ctrlKey?: boolean }).metaKey || (e as unknown as { ctrlKey?: boolean }).ctrlKey });
      if (locked) return;
      dragStart.current = { mx: e.clientX, my: e.clientY, ox: px.x, oy: px.y };
      let didInnerPan = false;
      const onMove = (ev: MouseEvent) => {
        if (!dragStart.current) return;
        const dx = ev.clientX - dragStart.current.mx;
        const dy = ev.clientY - dragStart.current.my;
        if (onPan && (ev.altKey || panDragInsteadOfMove)) {
          didInnerPan = true;
          onPan({ dx, dy }, ev);
          return;
        }
        const fine = snapStepPx ?? 1;
        const snap = ev.shiftKey ? 10 : fine;
        const sx = Math.round((dragStart.current.ox + dx) / snap) * snap;
        const sy = Math.round((dragStart.current.oy + dy) / snap) * snap;
        const newX = Math.max(0, Math.min(canvasW - Math.max(minW, px.width), sx));
        const newY = Math.max(0, Math.min(canvasH - Math.max(minH, px.height), sy));
        onRectChange({
          x: newX / canvasW,
          y: newY / canvasH,
          width: rect.width,
          height: rect.height,
        });
      };
      const onUp = () => {
        if (didInnerPan) onPanEnd?.();
        dragStart.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [rect, px, canvasW, canvasH, onRectChange, onSelect, snapStepPx, onPan, onPanEnd, panDragInsteadOfMove, minW, minH, locked]
  );

  const resizeStart = useRef<{
    mx: number;
    my: number;
    ox: number;
    oy: number;
    ow: number;
    oh: number;
    handle: ResizeHandle;
  } | null>(null);

  const onMouseDownResize = useCallback(
    (e: React.MouseEvent, handle: ResizeHandle) => {
      e.stopPropagation();
      e.preventDefault();
      onSelect({ additive: e.shiftKey || (e as unknown as { metaKey?: boolean; ctrlKey?: boolean }).metaKey || (e as unknown as { ctrlKey?: boolean }).ctrlKey });
      if (locked) return;
      resizeStart.current = {
        mx: e.clientX,
        my: e.clientY,
        ox: px.x,
        oy: px.y,
        ow: px.width,
        oh: px.height,
        handle,
      };
      const onMove = (ev: MouseEvent) => {
        if (!resizeStart.current) return;
        const { mx, my, ox, oy, ow, oh, handle } = resizeStart.current;
        const dx = ev.clientX - mx;
        const dy = ev.clientY - my;
        let nx = ox,
          ny = oy,
          nw = ow,
          nh = oh;
        const fine = snapStepPx ?? 1;
        const snap = ev.shiftKey ? 10 : fine;
        if (handle.includes("e")) nw = Math.max(minW, ow + dx);
        if (handle.includes("s")) nh = Math.max(minH, oh + dy);
        if (handle.includes("w")) {
          nw = Math.max(minW, ow - dx);
          nx = ox + ow - nw;
        }
        if (handle.includes("n")) {
          nh = Math.max(minH, oh - dy);
          ny = oy + oh - nh;
        }

        // Shift: 코너 리사이즈는 비율 유지 + 스냅
        if (ev.shiftKey && (handle === "nw" || handle === "ne" || handle === "se" || handle === "sw")) {
          const ratio = ow / Math.max(1, oh);
          if (nw / Math.max(1, nh) > ratio) nh = Math.max(minH, nw / ratio);
          else nw = Math.max(minW, nh * ratio);
          if (handle.includes("w")) nx = ox + ow - nw;
          if (handle.includes("n")) ny = oy + oh - nh;
        }

        // 스냅
        nw = Math.max(minW, Math.round(nw / snap) * snap);
        nh = Math.max(minH, Math.round(nh / snap) * snap);
        nx = Math.round(nx / snap) * snap;
        ny = Math.round(ny / snap) * snap;

        nx = Math.max(0, Math.min(canvasW - nw, nx));
        ny = Math.max(0, Math.min(canvasH - nh, ny));
        onRectChange({
          x: nx / canvasW,
          y: ny / canvasH,
          width: nw / canvasW,
          height: nh / canvasH,
        });
      };
      const onUp = () => {
        resizeStart.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [rect, px, canvasW, canvasH, onRectChange, onSelect, snapStepPx, minW, minH, locked]
  );

  const handles: { key: ResizeHandle; style: React.CSSProperties }[] = [
    { key: "nw", style: { top: -HANDLE / 2, left: -HANDLE / 2, cursor: "nw-resize" } },
    { key: "n", style: { top: -HANDLE / 2, left: "50%", transform: "translateX(-50%)", cursor: "n-resize" } },
    { key: "ne", style: { top: -HANDLE / 2, right: -HANDLE / 2, cursor: "ne-resize" } },
    { key: "e", style: { top: "50%", right: -HANDLE / 2, transform: "translateY(-50%)", cursor: "e-resize" } },
    { key: "se", style: { bottom: -HANDLE / 2, right: -HANDLE / 2, cursor: "se-resize" } },
    { key: "s", style: { bottom: -HANDLE / 2, left: "50%", transform: "translateX(-50%)", cursor: "s-resize" } },
    { key: "sw", style: { bottom: -HANDLE / 2, left: -HANDLE / 2, cursor: "sw-resize" } },
    { key: "w", style: { top: "50%", left: -HANDLE / 2, transform: "translateY(-50%)", cursor: "w-resize" } },
  ];

  return (
    <div
      style={{
        position: "absolute",
        left: `${px.x}px`,
        top: `${px.y}px`,
        width: `${px.width}px`,
        height: `${px.height}px`,
        borderRadius: `${rPx}px`,
        overflow: "visible",
        zIndex,
        outline: isSelected ? "2px solid #F43182" : "2px solid transparent",
        outlineOffset: "1px",
        boxSizing: "border-box",
        cursor: locked ? "default" : (panDragInsteadOfMove ? "grab" : "move"),
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragStart={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDownMove(e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOverlayDoubleClick?.(e);
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: `${rPx}px`,
          overflow: "hidden",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {children}
      </div>
      {isSelected && !locked &&
        handles.map((h) => (
          <div
            key={h.key}
            style={{
              position: "absolute",
              width: `${HANDLE}px`,
              height: `${HANDLE}px`,
              background: "#F43182",
              border: "1.5px solid #fff",
              borderRadius: "2px",
              ...h.style,
              zIndex: zIndex + 1,
              pointerEvents: "auto",
            }}
            onMouseDown={(e) => onMouseDownResize(e, h.key)}
          />
        ))}
      {(isSelected || hover) && (label || onRequestDelete) ? (
        <div
          style={{
            position: "absolute",
            top: "-28px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: zIndex + 2,
            display: "flex",
            alignItems: "center",
            gap: "4px",
            pointerEvents: "auto",
          }}
        >
          {label ? (
            <div
              style={{
                background: "#1A1A1A",
                color: "#fff",
                fontSize: "10px",
                padding: "2px 8px",
                borderRadius: "4px",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              {label}
            </div>
          ) : null}
          {onRequestDelete && !locked ? (
            <button
              type="button"
              aria-label="캔버스에서 제거"
              title="캔버스에서 제거"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white bg-[#1A1A1A] text-white shadow hover:bg-[#F43182]"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onRequestDelete();
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
