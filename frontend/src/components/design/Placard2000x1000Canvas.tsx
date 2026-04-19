/**
 * Placard2000x1000Canvas.tsx
 * LG U+ Brand Design Guideline – 현수막 2000×1000mm
 *
 * Spec : 2000 × 1000 mm  |  Aspect ratio = 2.0 : 1
 * Layout: Placard1000x600Canvas와 완전 동일한 구조/비율
 *   LEFT  (~28%) : 로고 (top-left) + 날짜|장소 (bottom-left)
 *   RIGHT (~72%) : 메인타이틀 + 강조(magenta) + 서브타이틀 — 라운드 프레임
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { DesignContent, CanvasSize } from '@/design/types';

import { defaultCI, defaultBI, defaultSLOGAN } from "@/design/defaultLogos";
import { VI_COLORS, VI_FONT_STACK, VI_RIGHT_PANEL_BG, getViGridStepPx } from "@/design/viCanvasConstants";
import { ViAlignmentGrid } from "./ViAlignmentGrid";

const ASPECT = 2000 / 1000;

interface Props {
  content: DesignContent;
  canvasSize: CanvasSize;
  zoom: number;
  showViGrid?: boolean;
}

function AdminLogo({ option, height, customSrc }: {
  option: 'CI' | 'BI' | 'SLOGAN';
  height: number;
  customSrc: string | null;
}) {
  if (option === 'CI') return <img src={customSrc ?? defaultCI} alt="LG U+ CI" style={{ height: `${height}px`, width: 'auto', objectFit: 'contain', display: 'block' }} />;
  if (option === 'BI') return <img src={defaultBI} alt="LG U+ BI" style={{ height: `${height}px`, width: 'auto', objectFit: 'contain', display: 'block' }} />;
  return <img src={defaultSLOGAN} alt="LG U+ Slogan" style={{ height: `${height}px`, width: 'auto', objectFit: 'contain', display: 'block' }} />;
}

export function Placard2000x1000Canvas({ content, zoom, showViGrid }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [baseW, setBaseW] = useState(900);
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (content.logo instanceof File) {
      const url = URL.createObjectURL(content.logo);
      setCustomLogoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setCustomLogoUrl(typeof content.logo === 'string' ? content.logo : null);
  }, [content.logo]);

  const measure = useCallback(() => {
    if (!outerRef.current) return;
    setBaseW(Math.max(outerRef.current.clientWidth - 80, 300));
  }, []);
  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const displayW = baseW * zoom;
  const displayH = displayW / ASPECT;

  const X  = displayH / 12;
  const FS = displayW / 12;

  const logoMargin = X * 1.1;
  const logoH      = X * 0.6;
  const logoTop    = logoMargin;
  const logoLeft   = logoMargin;

  const leftW        = displayW * 0.28;
  const infoFontSize = FS * 0.20;
  const infoLeft     = X * 1.1;

  const bgInsetT = X * 1.0;
  const bgInsetB = X * 1.2;
  const bgInsetL = X * 0.26;
  const bgInsetR = X * 1.2;

  const bgLeft   = leftW + bgInsetL;
  const bgTop    = bgInsetT;
  const bgW      = displayW - bgLeft - bgInsetR;
  const bgH      = displayH - bgTop - bgInsetB;
  const bgRadius = X * 1.40;

  const titleFontSz   = FS * 0.80;
  const subFontSz     = FS * 0.38;
  const titleToSubGap = FS * 0.16;

  const bgKey      = content.rightPanelBg ?? 'white';
  const logoOption = content.logoOption   ?? 'CI';
  const rightBg    = VI_RIGHT_PANEL_BG[bgKey] ?? VI_RIGHT_PANEL_BG.white;

  const mainTitle = content.title           || 'LG유플러스 AI경영시스템';
  const emphTitle = content.emphasizedTitle || '국제인증 획득';
  const subTitle  = content.bodyText        || 'IEC 42001 인증 수여식';
  const dateText  = content.date            || '2025.07.02(수)';
  const venueText = content.venue           || 'LG유플러스 울산 컨버전스 홀';

  return (
    <div
      ref={outerRef}
      style={{
        width: '100%', height: '100%', minHeight: '100%',
        overflowX: zoom > 1 ? 'auto' : 'hidden',
        overflowY: 'auto',
        background: VI_COLORS.outerChrome,
        display: 'flex',
        alignItems: zoom > 1 ? 'flex-start' : 'center',
        justifyContent: zoom > 1 ? 'flex-start' : 'center',
        padding: '40px', boxSizing: 'border-box',
      }}
    >
      <div
        id="design-canvas"
        style={{
          position: 'relative',
          width: `${displayW}px`, height: `${displayH}px`,
          background: VI_COLORS.canvasBg,
          border: `1.5px solid ${VI_COLORS.border}`,
          borderRadius: `${X * 0.1}px`,
          overflow: 'hidden', flexShrink: 0,
          boxShadow: '0 4px 28px rgba(0,0,0,0.12)',
          fontFamily: VI_FONT_STACK,
        }}
      >
        {showViGrid && <ViAlignmentGrid width={displayW} height={displayH} step={getViGridStepPx(X)} />}
        {/* Right panel bg */}
        <div style={{
          position: 'absolute',
          left: `${bgLeft}px`, top: `${bgTop}px`,
          width: `${bgW}px`, height: `${bgH}px`,
          background: rightBg,
          borderRadius: `${bgRadius}px`,
          boxShadow: 'none',
          zIndex: 1,
        }} />

        {/* Logo */}
        <div style={{ position: 'absolute', top: `${logoTop}px`, left: `${logoLeft}px`, zIndex: 5 }}>
          <AdminLogo option={logoOption} height={logoH} customSrc={customLogoUrl} />
        </div>

        {/* Date | Venue */}
        <div style={{
          position: 'absolute',
          bottom: `${X * 0.8}px`,
          left: `${infoLeft}px`,
          width: `${leftW - infoLeft}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: `${infoFontSize * 0.3}px`,
          color: VI_COLORS.textSecondary,
          fontSize: `${infoFontSize}px`,
          fontWeight: 600,
          lineHeight: 1.3,
          zIndex: 5,
        }}>
          {dateText && <span style={{ whiteSpace: 'nowrap' }}>{dateText}</span>}
          {venueText && <span style={{ whiteSpace: 'normal', wordBreak: 'keep-all' }}>{venueText}</span>}
        </div>

        {/* Right panel content */}
        <div style={{
          position: 'absolute',
          top: `${bgTop}px`, left: `${bgLeft}px`,
          width: `${bgW}px`, height: `${bgH}px`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center',
          padding: `0 ${FS * 0.25}px`,
          zIndex: 5,
        }}>
          <div style={{ lineHeight: 1.2, textAlign: 'center', marginBottom: `${titleToSubGap}px`, wordBreak: 'keep-all' }}>
            {mainTitle && (
              <span style={{ fontSize: `${X * 1.2}px`, fontWeight: 600, color: VI_COLORS.textPrimary, letterSpacing: '-0.02em' }}>
                {mainTitle}
              </span>
            )}
            {mainTitle && emphTitle && (
              <span style={{ fontSize: `${X * 1.15}px`, fontWeight: 600, color: VI_COLORS.textPrimary }}>{' '}</span>
            )}
            {emphTitle && (
              <span style={{ fontSize: `${titleFontSz}px`, fontWeight: 700, color: VI_COLORS.brandMagenta, letterSpacing: '-0.02em' }}>
                {emphTitle}
              </span>
            )}
          </div>
          {subTitle && (
            <div style={{
              fontSize: `${subFontSz}px`, fontWeight: 400,
              color: VI_COLORS.textSecondary, lineHeight: 2,
              textAlign: 'center', letterSpacing: '0.01em',
            }}>
              {subTitle}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
