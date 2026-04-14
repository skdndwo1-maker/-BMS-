/**
 * 포스터 캔버스용: 정규화 rect(0~1) 기준 드래그·리사이즈, 네 모서리 동일 r값
 */

import { useRef, useCallback, type ReactNode } from "react";

export type NormalizedRect = { x: number; y: number; width: number; height: number };

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLE = 8;

interface Props {
  rect: NormalizedRect;
  canvasW: number;
  canvasH: number;
  onRectChange: (next: NormalizedRect) => void;
  isSelected: boolean;
  onSelect: (opts?: { toggle?: boolean }) => void;
  zIndex: number;
  children: ReactNode;
  /** 선택 시 외곽선 (편집 가능 표시) */
  label?: string;
  /** 모서리 라운드 모드 */
  borderRadiusMode?: "auto" | "pill";
  /** auto 라운드 배율 */
  borderRadiusScale?: number;
  /** Alt+드래그로 내부 패닝 */
  onPan?: (deltaPx: { dx: number; dy: number }, ev: MouseEvent) => void;
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
  label,
  borderRadiusMode = "auto",
  borderRadiusScale = 1,
  onPan,
}: Props) {
  const px = {
    x: rect.x * canvasW,
    y: rect.y * canvasH,
    width: rect.width * canvasW,
    height: rect.height * canvasH,
  };

  const rPx =
    borderRadiusMode === "pill"
      ? Math.max(1, px.height / 2)
      : Math.max(10, Math.min(px.width, px.height) * 0.06 * Math.max(0.2, borderRadiusScale));

  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  const onMouseDownMove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect({ toggle: e.shiftKey });
      dragStart.current = { mx: e.clientX, my: e.clientY, ox: px.x, oy: px.y };
      const onMove = (ev: MouseEvent) => {
        if (!dragStart.current) return;
        const dx = ev.clientX - dragStart.current.mx;
        const dy = ev.clientY - dragStart.current.my;
        if (ev.altKey && onPan) {
          onPan({ dx, dy }, ev);
          return;
        }
        const snap = ev.shiftKey ? 10 : 1;
        const sx = Math.round((dragStart.current.ox + dx) / snap) * snap;
        const sy = Math.round((dragStart.current.oy + dy) / snap) * snap;
        const newX = Math.max(0, Math.min(canvasW - px.width, sx));
        const newY = Math.max(0, Math.min(canvasH - px.height, sy));
        onRectChange({
          x: newX / canvasW,
          y: newY / canvasH,
          width: rect.width,
          height: rect.height,
        });
      };
      const onUp = () => {
        dragStart.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [rect, px, canvasW, canvasH, onRectChange, onSelect]
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
      onSelect({ toggle: e.shiftKey });
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
        const MIN = 24;
        let nx = ox,
          ny = oy,
          nw = ow,
          nh = oh;
        const snap = ev.shiftKey ? 10 : 1;
        if (handle.includes("e")) nw = Math.max(MIN, ow + dx);
        if (handle.includes("s")) nh = Math.max(MIN, oh + dy);
        if (handle.includes("w")) {
          nw = Math.max(MIN, ow - dx);
          nx = ox + ow - nw;
        }
        if (handle.includes("n")) {
          nh = Math.max(MIN, oh - dy);
          ny = oy + oh - nh;
        }

        // Shift: 코너 리사이즈는 비율 유지 + 스냅
        if (ev.shiftKey && (handle === "nw" || handle === "ne" || handle === "se" || handle === "sw")) {
          const ratio = ow / Math.max(1, oh);
          if (nw / Math.max(1, nh) > ratio) nh = Math.max(MIN, nw / ratio);
          else nw = Math.max(MIN, nh * ratio);
          if (handle.includes("w")) nx = ox + ow - nw;
          if (handle.includes("n")) ny = oy + oh - nh;
        }

        // 스냅
        nw = Math.max(MIN, Math.round(nw / snap) * snap);
        nh = Math.max(MIN, Math.round(nh / snap) * snap);
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
    [rect, px, canvasW, canvasH, onRectChange, onSelect]
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
        overflow: "hidden",
        zIndex,
        outline: isSelected ? "2px solid #F43182" : "2px solid transparent",
        outlineOffset: "1px",
        boxSizing: "border-box",
        cursor: "move",
        userSelect: "none",
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDownMove(e);
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: `${rPx}px`,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        {children}
      </div>
      {isSelected && (
        <>
          {handles.map((h) => (
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
          {label ? (
            <div
              style={{
                position: "absolute",
                top: "-26px",
                left: "50%",
                transform: "translateX(-50%)",
                background: "#1A1A1A",
                color: "#fff",
                fontSize: "10px",
                padding: "2px 8px",
                borderRadius: "4px",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                zIndex: zIndex + 2,
              }}
            >
              {label}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
