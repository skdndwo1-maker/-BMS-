/**
 * DraggableAsset.tsx
 * 캔버스 위에서 자유롭게 이동/리사이즈 가능한 에셋 컴포넌트
 *
 * - 위치/크기는 캔버스 대비 % (0~1) 로 저장 → 캔버스 크기 변해도 비율 유지
 * - 나중에 브랜드 라이브러리 연동 시 src를 서버 URL로 교체하면 됨
 */

import { useRef, useCallback } from "react";
import type { AssetLayer } from "@/design/types";
import { Lock, Unlock, Trash2 } from "lucide-react";

interface Props {
  asset: AssetLayer;
  canvasW: number;   // 캔버스 실제 표시 너비 (px)
  canvasH: number;   // 캔버스 실제 표시 높이 (px)
  /** VI 격자 스냅(px) */
  snapStepPx?: number;
  isSelected: boolean;
  onSelect: (id: string, opts?: { additive?: boolean }) => void;
  onUpdate: (id: string, patch: Partial<AssetLayer>) => void;
  onDelete: (id: string) => void;
}

// 리사이즈 핸들 방향
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLE_SIZE = 8;

export function DraggableAsset({
  asset, canvasW, canvasH, snapStepPx, isSelected, onSelect, onUpdate, onDelete,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);

  // % → px 변환
  const px = {
    x:      asset.x      * canvasW,
    y:      asset.y      * canvasH,
    width:  asset.width  * canvasW,
    height: asset.height * canvasH,
  };

  // ── 드래그 이동 ──────────────────────────────────────────────────
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  const onMouseDownMove = useCallback((e: React.MouseEvent) => {
    if (asset.locked) return;
    e.stopPropagation();
    onSelect(asset.id, { additive: e.shiftKey });
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: px.x, oy: px.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = ev.clientX - dragStart.current.mx;
      const dy = ev.clientY - dragStart.current.my;
      const fine = snapStepPx ?? 1;
      const snap = ev.shiftKey ? 10 : fine;
      const sx = Math.round((dragStart.current.ox + dx) / snap) * snap;
      const sy = Math.round((dragStart.current.oy + dy) / snap) * snap;
      const newX = Math.max(0, Math.min(canvasW - px.width, sx));
      const newY = Math.max(0, Math.min(canvasH - px.height, sy));
      onUpdate(asset.id, { x: newX / canvasW, y: newY / canvasH });
    };
    const onUp = () => {
      dragStart.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [asset, px, canvasW, canvasH, onSelect, onUpdate, snapStepPx]);

  // ── 리사이즈 ─────────────────────────────────────────────────────
  const resizeStart = useRef<{
    mx: number; my: number;
    ox: number; oy: number; ow: number; oh: number;
    handle: ResizeHandle;
  } | null>(null);

  const onMouseDownResize = useCallback((e: React.MouseEvent, handle: ResizeHandle) => {
    if (asset.locked) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(asset.id, { additive: e.shiftKey });
    resizeStart.current = {
      mx: e.clientX, my: e.clientY,
      ox: px.x, oy: px.y, ow: px.width, oh: px.height,
      handle,
    };

    const onMove = (ev: MouseEvent) => {
      if (!resizeStart.current) return;
      const { mx, my, ox, oy, ow, oh, handle } = resizeStart.current;
      const dx = ev.clientX - mx;
      const dy = ev.clientY - my;
      const MIN = 20;
      const fine = snapStepPx ?? 1;
      const snap = ev.shiftKey ? 10 : fine;

      let nx = ox, ny = oy, nw = ow, nh = oh;

      if (handle.includes('e')) nw = Math.max(MIN, ow + dx);
      if (handle.includes('s')) nh = Math.max(MIN, oh + dy);
      if (handle.includes('w')) { nw = Math.max(MIN, ow - dx); nx = ox + ow - nw; }
      if (handle.includes('n')) { nh = Math.max(MIN, oh - dy); ny = oy + oh - nh; }

      // Shift: 코너 리사이즈는 비율 유지
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

      onUpdate(asset.id, {
        x: nx / canvasW, y: ny / canvasH,
        width: nw / canvasW, height: nh / canvasH,
      });
    };
    const onUp = () => {
      resizeStart.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [asset, px, canvasW, canvasH, onUpdate, snapStepPx]);

  // ── 리사이즈 핸들 위치 ──────────────────────────────────────────
  const handles: { key: ResizeHandle; style: React.CSSProperties }[] = [
    { key: 'nw', style: { top: -HANDLE_SIZE/2, left: -HANDLE_SIZE/2, cursor: 'nw-resize' } },
    { key: 'n',  style: { top: -HANDLE_SIZE/2, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' } },
    { key: 'ne', style: { top: -HANDLE_SIZE/2, right: -HANDLE_SIZE/2, cursor: 'ne-resize' } },
    { key: 'e',  style: { top: '50%', right: -HANDLE_SIZE/2, transform: 'translateY(-50%)', cursor: 'e-resize' } },
    { key: 'se', style: { bottom: -HANDLE_SIZE/2, right: -HANDLE_SIZE/2, cursor: 'se-resize' } },
    { key: 's',  style: { bottom: -HANDLE_SIZE/2, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' } },
    { key: 'sw', style: { bottom: -HANDLE_SIZE/2, left: -HANDLE_SIZE/2, cursor: 'sw-resize' } },
    { key: 'w',  style: { top: '50%', left: -HANDLE_SIZE/2, transform: 'translateY(-50%)', cursor: 'w-resize' } },
  ];

  if (!asset.visible) return null;

  return (
    <div
      ref={elRef}
      style={{
        position:  'absolute',
        left:      `${px.x}px`,
        top:       `${px.y}px`,
        width:     `${px.width}px`,
        height:    `${px.height}px`,
        opacity:   asset.opacity,
        transform: `rotate(${asset.rotation}deg)`,
        cursor:    asset.locked ? 'default' : 'move',
        outline:   isSelected ? '2px solid #F43182' : '2px solid transparent',
        outlineOffset: '1px',
        userSelect: 'none',
        zIndex:    isSelected ? 100 : 10,
        boxSizing: 'border-box',
      }}
      onMouseDown={onMouseDownMove}
      onClick={(e) => { e.stopPropagation(); onSelect(asset.id, { additive: e.shiftKey }); }}
    >
      {/* 에셋 이미지 */}
      <img
        src={asset.src}
        alt={asset.name || asset.type}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
        draggable={false}
      />

      {/* 선택됐을 때만 핸들 + 툴바 표시 */}
      {isSelected && !asset.locked && (
        <>
          {/* 리사이즈 핸들 8개 */}
          {handles.map((h) => (
            <div
              key={h.key}
              style={{
                position:  'absolute',
                width:     `${HANDLE_SIZE}px`,
                height:    `${HANDLE_SIZE}px`,
                background: '#F43182',
                border:    '1.5px solid #fff',
                borderRadius: '2px',
                ...h.style,
                zIndex: 101,
              }}
              onMouseDown={(e) => onMouseDownResize(e, h.key)}
            />
          ))}

          {/* 상단 툴바 */}
          <div
            style={{
              position: 'absolute',
              top: '-32px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              background: '#1A1A1A',
              borderRadius: '6px',
              padding: '3px 5px',
              zIndex: 102,
              whiteSpace: 'nowrap',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* 잠금 토글 */}
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate(asset.id, { locked: !asset.locked }); }}
              style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex' }}
              title={asset.locked ? '잠금 해제' : '잠금'}
            >
              {asset.locked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>

            {/* 투명도 */}
            <input
              type="range" min={10} max={100} value={Math.round(asset.opacity * 100)}
              onChange={(e) => onUpdate(asset.id, { opacity: Number(e.target.value) / 100 })}
              style={{ width: '50px', accentColor: '#F43182', cursor: 'pointer' }}
              onClick={(e) => e.stopPropagation()}
              title="투명도"
            />

            {/* 삭제 */}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
              style={{ color: '#ff6b6b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex' }}
              title="삭제"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </>
      )}

      {/* 잠금 표시 */}
      {isSelected && asset.locked && (
        <div
          style={{
            position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)',
            background: '#1A1A1A', borderRadius: '6px', padding: '3px 8px',
            display: 'flex', alignItems: 'center', gap: '4px', zIndex: 102,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Lock size={10} color="#F43182" />
          <span style={{ color: '#fff', fontSize: '10px' }}>잠김</span>
          <button
            onClick={(e) => { e.stopPropagation(); onUpdate(asset.id, { locked: false }); }}
            style={{ color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', padding: '0 2px' }}
          >해제</button>
        </div>
      )}
    </div>
  );
}
