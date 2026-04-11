import { useRef, useEffect, useState, useCallback } from 'react';
import type { DesignContent, CanvasSize, AssetLayer } from "@/design/types";
import { DraggableAsset } from './DraggableAsset';

import { defaultCI, defaultBI, defaultSLOGAN } from "@/design/defaultLogos";

const MAGENTA    = '#F43182';
const DARK       = '#1A1A1A';
const GRAY       = '#5A5A5A';
const LIGHT_GRAY = '#B0B0B0';

interface DesignCanvasProps {
  content: DesignContent;
  canvasSize: CanvasSize;
  zoom: number;
  // 에셋 레이어 변경을 부모(DesignEditor)로 전달
  onContentChange?: (content: DesignContent) => void;
}

export function DesignCanvas({ content, canvasSize, zoom, onContentChange }: DesignCanvasProps) {
  const outerRef  = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);
  const [containerH, setContainerH] = useState(600);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [logoUrl,  setLogoUrl]  = useState<string | null>(null);

  // ── 선택된 에셋 id ───────────────────────────────────────────────
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // ── 컨테이너 크기 측정 ───────────────────────────────────────────
  const measure = useCallback(() => {
    if (!outerRef.current) return;
    setContainerW(outerRef.current.clientWidth);
    setContainerH(outerRef.current.clientHeight);
  }, []);
  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    if (content.image instanceof File) {
      const url = URL.createObjectURL(content.image);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setImageUrl(typeof content.image === 'string' ? content.image : null);
  }, [content.image]);

  useEffect(() => {
    if (content.logo instanceof File) {
      const url = URL.createObjectURL(content.logo);
      setLogoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setLogoUrl(typeof content.logo === 'string' ? content.logo : null);
  }, [content.logo]);

  // ── canvasSize → 실제 픽셀 ───────────────────────────────────────
  const getRealSize = () => {
    const dpi = 96;
    switch (canvasSize.unit) {
      case 'mm': return { width: (canvasSize.width / 25.4) * dpi, height: (canvasSize.height / 25.4) * dpi };
      case 'in': return { width: canvasSize.width * dpi, height: canvasSize.height * dpi };
      default:   return { width: canvasSize.width, height: canvasSize.height };
    }
  };

  const realSize   = getRealSize();
  const realAspect = realSize.width / realSize.height;

  // ── 컨테이너에 맞는 표시 크기 ────────────────────────────────────
  const padding = 80;
  const availW  = containerW - padding;
  const availH  = containerH - padding;
  let baseW = availW;
  let baseH = baseW / realAspect;
  if (baseH > availH) { baseH = availH; baseW = baseH * realAspect; }
  const displayW = baseW * zoom;
  const displayH = displayW / realAspect;

  // ── 레이아웃 변수 ────────────────────────────────────────────────
  const W       = displayW;
  const MARGIN  = W * 0.08;
  const INNER_W = W - MARGIN * 2;

  const bgColor    = content.backgroundColor || '#FFFFFF';
  const titleColor = content.titleColor      || DARK;
  const bodyColor  = content.bodyColor       || GRAY;

  const getBrandLogo = () => {
    switch (content.logoOption) {
      case 'BI':     return defaultBI;
      case 'SLOGAN': return defaultSLOGAN;
      default:       return defaultCI;
    }
  };

  const getLogoPositionStyle = () => {
    const pad = W * 0.08;
    switch (content.logoPosition) {
      case 'top-right':     return { top: `${pad}px`,    right: `${pad}px` };
      case 'top-left':      return { top: `${pad}px`,    left:  `${pad}px` };
      case 'bottom-left':   return { bottom: `${pad}px`, left:  `${pad}px` };
      case 'center-top':    return { top: `${pad}px`,    left: '50%', transform: 'translateX(-50%)' };
      case 'center-bottom': return { bottom: `${pad}px`, left: '50%', transform: 'translateX(-50%)' };
      case 'bottom-right':  return { bottom: `${pad}px`, right: `${pad}px` };
      default:              return { top: `${pad}px`,    left:  `${pad}px` };
    }
  };

  const brandLogoSrc      = getBrandLogo();
  const logoPositionStyle = getLogoPositionStyle();

  const titleFontSize  = W * 0.16;
  const bodyFontSize   = W * 0.04;
  const disclaimerSize = W * 0.018;
  const badgeFontSize  = W * 0.035;
  const logoHeight     = W * 0.05;
  const logoPad        = W * 0.08;

  const isLogoTop = ['top-left', 'top-right', 'center-top'].includes(content.logoPosition ?? '');
  const contentTopOffset = isLogoTop && content.logoOption
    ? logoPad + logoHeight + W * 0.04
    : MARGIN;

  // ── 에셋 레이어 핸들러 ───────────────────────────────────────────
  const assetLayers = content.assetLayers ?? [];

  const handleAssetUpdate = useCallback((id: string, patch: Partial<AssetLayer>) => {
    if (!onContentChange) return;
    const updated = assetLayers.map(a => a.id === id ? { ...a, ...patch } : a);
    onContentChange({ ...content, assetLayers: updated });
  }, [content, assetLayers, onContentChange]);

  const handleAssetDelete = useCallback((id: string) => {
    if (!onContentChange) return;
    onContentChange({ ...content, assetLayers: assetLayers.filter(a => a.id !== id) });
    setSelectedAssetId(null);
  }, [content, assetLayers, onContentChange]);

  // 캔버스 빈 곳 클릭 → 선택 해제
  const handleCanvasClick = useCallback(() => {
    setSelectedAssetId(null);
  }, []);

  return (
    <div
      ref={outerRef}
      style={{
        width: '100%', height: '100%',
        background: '#F0F0F0',
        display: 'flex',
        alignItems: zoom > 1 ? 'flex-start' : 'center',
        justifyContent: 'center',
        overflow: zoom > 1 ? 'auto' : 'hidden',
        padding: '40px', boxSizing: 'border-box',
      }}
    >
      <div
        ref={canvasRef}
        id="design-canvas"
        style={{
          position: 'relative',
          width: `${displayW}px`, height: `${displayH}px`,
          background: bgColor,
          overflow: 'hidden', flexShrink: 0,
          fontFamily: '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}
        onClick={handleCanvasClick}
      >

        {/* ── 배경 이미지 ─────────────────────────────────────── */}
        {imageUrl && (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.15, zIndex: 0 }} />
        )}

        {/* ── 메인 콘텐츠 레이어 (zIndex: 1~5) ────────────────── */}
        <div style={{ position: 'absolute', top: `${contentTopOffset}px`, left: `${MARGIN}px`, width: `${INNER_W}px`, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', zIndex: 2 }}>

          {/* 뱃지 */}
          {content.subtitle && (
            <div style={{ display: 'inline-block', background: MAGENTA, color: '#FFFFFF', fontSize: `${badgeFontSize}px`, fontWeight: 700, lineHeight: 1, padding: `${W * 0.02}px ${W * 0.035}px`, borderRadius: '999px', marginBottom: `${W * 0.025}px`, letterSpacing: '0.01em' }}>
              {content.subtitle}
            </div>
          )}

          {/* 메인 타이틀 */}
          {content.title && (
            <h1 style={{ fontSize: `${titleFontSize}px`, fontWeight: 800, color: titleColor, lineHeight: 1.15, letterSpacing: '-0.025em', marginBottom: `${W * 0.05}px`, wordBreak: 'keep-all', width: '100%' }}>
              {content.title.endsWith('.') ? (
                <>{content.title.slice(0, -1)}<span style={{ display: 'inline-block', width: `${titleFontSize * 0.2}px`, height: `${titleFontSize * 0.2}px`, borderRadius: '50%', background: MAGENTA, marginLeft: `${titleFontSize * 0.1}px`, verticalAlign: 'baseline' }} /></>
              ) : content.title}
            </h1>
          )}

          {/* 본문 */}
          {content.bodyText && (
            <div style={{ fontSize: `${bodyFontSize}px`, fontWeight: 400, color: bodyColor, lineHeight: 1.75, width: '100%', paddingLeft: `${W * 0.02}px` }}>
              {content.bodyText.split('\n').map((line, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: `${W * 0.018}px`, marginBottom: `${W * 0.008}px` }}>
                  <span style={{ display: 'inline-block', width: `${bodyFontSize * 0.38}px`, height: `${bodyFontSize * 0.38}px`, borderRadius: '50%', background: MAGENTA, flexShrink: 0, marginTop: `${bodyFontSize * 0.60}px` }} />
                  <span>{line}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 유의사항 */}
        {content.emphasizedTitle && (
          <div style={{ position: 'absolute', bottom: `${MARGIN}px`, left: `${MARGIN}px`, width: `${INNER_W * 0.75}px`, fontSize: `${disclaimerSize}px`, fontWeight: 400, color: LIGHT_GRAY, lineHeight: 1.6, zIndex: 2 }}>
            {content.emphasizedTitle}
          </div>
        )}

        {/* 브랜드 로고 */}
        {content.logoOption && (
          <div style={{ position: 'absolute', ...logoPositionStyle, zIndex: 3 }}>
            <img src={logoUrl || brandLogoSrc} alt="Brand Logo" style={{ height: `${logoHeight}px`, width: 'auto', objectFit: 'contain', display: 'block' }} />
          </div>
        )}

        {/* ── 드래그 에셋 오버레이 레이어 (zIndex: 10~) ───────── */}
        {assetLayers.map((asset) => (
          <DraggableAsset
            key={asset.id}
            asset={asset}
            canvasW={displayW}
            canvasH={displayH}
            isSelected={selectedAssetId === asset.id}
            onSelect={setSelectedAssetId}
            onUpdate={handleAssetUpdate}
            onDelete={handleAssetDelete}
          />
        ))}

      </div>
    </div>
  );
}
