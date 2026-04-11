/**
 * Placard600x1800Canvas.tsx
 * LG U+ Brand Design Guideline – 현수막 600×1800mm (세로형)
 *
 * Spec : 600 × 1800 mm  |  Aspect ratio = 1 : 3
 *
 * Layout (세로형 — PlacardWideCanvas 구조를 세로로 전환):
 *   TOP    (~18%) : 로고 (좌측 상단)
 *   MIDDLE (~67%) : 메인타이틀 + 강조(magenta) + 서브타이틀 — 라운드 프레임
 *   BOTTOM (~15%) : 날짜 | 장소 (좌측 하단)
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { DesignContent, CanvasSize } from '@/design/types';

import { defaultCI, defaultBI, defaultSLOGAN } from "@/design/defaultLogos";

const ASPECT     = 600 / 1800; // 세로형: 0.333
const MAGENTA    = '#F43182';
const DARK       = '#1A1A1A';
const GRAY_TEXT  = '#5A5A5A';
const BORDER_COL = '#C8C8C8';

const RIGHT_BG: Record<string, string> = {
  'white':      '#FFFFFF',
  'light-grey': '#F2F2F2',
  'ivory':      '#FDFAF0',
  'light-pink': '#FFF0F5',
};

interface Props {
  content: DesignContent;
  canvasSize: CanvasSize;
  zoom: number;
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

export function Placard600x1800Canvas({ content, zoom }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [baseH, setBaseH] = useState(700);
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (content.logo instanceof File) {
      const url = URL.createObjectURL(content.logo);
      setCustomLogoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setCustomLogoUrl(typeof content.logo === 'string' ? content.logo : null);
  }, [content.logo]);

  // 세로형: 컨테이너 높이 기준으로 측정
  const measure = useCallback(() => {
    if (!outerRef.current) return;
    setBaseH(Math.max(outerRef.current.clientHeight - 80, 400));
  }, []);
  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const displayH = baseH * zoom;
  const displayW = displayH * ASPECT;

  // ── Grid: 세로형은 W 기준 ─────────────────────────────────────────
  const X  = displayW / 12;   // 위치/여백 기준
  const FS = displayW / 12;   // 폰트 기준 (동일)

  // ── Logo (좌측 상단) ──────────────────────────────────────────────
  const logoMargin = X * 1.1;
  const logoH      = X * 0.8;
  const logoTop    = logoMargin;
  const logoLeft   = logoMargin;

  // ── 중앙 콘텐츠 라운드 프레임 ────────────────────────────────────
  const bgInsetX = X * 1.0;         // 좌우 여백
  const bgTop    = displayH * 0.18; // 상단 18% 이후
  const bgBottom = displayH * 0.15; // 하단 15% 이전
  const bgLeft   = bgInsetX;
  const bgW      = displayW - bgInsetX * 2;
  const bgH      = displayH - bgTop - bgBottom;
  const bgRadius = X * 1.40;

  // ── Typography ────────────────────────────────────────────────────
  const titleFontSz   = FS * 1.40;
  const subFontSz     = FS * 0.65;
  const titleToSubGap = FS * 0.40;
  const infoFontSize  = FS * 0.55;

  const bgKey      = content.rightPanelBg ?? 'white';
  const logoOption = content.logoOption   ?? 'CI';
  const rightBg    = RIGHT_BG[bgKey];

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
        overflowX: 'auto',
        overflowY: zoom > 1 ? 'auto' : 'hidden',
        background: '#E8E8E8',
        display: 'flex',
        alignItems: zoom > 1 ? 'flex-start' : 'center',
        justifyContent: 'center',
        padding: '40px', boxSizing: 'border-box',
      }}
    >
      <div
        id="placard-600x1800-canvas"
        style={{
          position: 'relative',
          width: `${displayW}px`, height: `${displayH}px`,
          background: '#FFFFFF',
          border: `1.5px solid ${BORDER_COL}`,
          borderRadius: `${X * 0.1}px`,
          overflow: 'hidden', flexShrink: 0,
          boxShadow: '0 4px 28px rgba(0,0,0,0.12)',
          fontFamily: '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
        }}
      >
        {/* ── 중앙 콘텐츠 라운드 프레임 ────────────────────────── */}
        <div style={{
          position: 'absolute',
          left: `${bgLeft}px`, top: `${bgTop}px`,
          width: `${bgW}px`, height: `${bgH}px`,
          background: rightBg,
          borderRadius: `${bgRadius}px`,
          boxShadow: 'none',
          zIndex: 1,
        }} />

        {/* ── Logo (좌측 상단) ──────────────────────────────────── */}
        <div style={{ position: 'absolute', top: `${logoTop}px`, left: `${logoLeft}px`, zIndex: 5 }}>
          <AdminLogo option={logoOption} height={logoH} customSrc={customLogoUrl} />
        </div>

        {/* ── 중앙 콘텐츠 (라운드 프레임 안, 세로 중앙) ─────────── */}
        <div style={{
          position: 'absolute',
          top: `${bgTop}px`, left: `${bgLeft}px`,
          width: `${bgW}px`, height: `${bgH}px`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center',
          padding: `${X * 0.5}px ${X * 0.6}px`,
          zIndex: 5,
        }}>
          {/* 메인타이틀 + 강조 */}
          <div style={{ lineHeight: 1.25, textAlign: 'center', marginBottom: `${titleToSubGap}px`, wordBreak: 'keep-all' }}>
            {mainTitle && (
              <span style={{ fontSize: `${titleFontSz}px`, fontWeight: 700, color: DARK, letterSpacing: '-0.02em' }}>
                {mainTitle}
              </span>
            )}
            {mainTitle && emphTitle && (
              <span style={{ fontSize: `${titleFontSz}px`, fontWeight: 700, color: DARK }}>{' '}</span>
            )}
            {emphTitle && (
              <span style={{ fontSize: `${titleFontSz}px`, fontWeight: 800, color: MAGENTA, letterSpacing: '-0.02em' }}>
                {emphTitle}
              </span>
            )}
          </div>

          {/* 서브타이틀 */}
          {subTitle && (
            <div style={{
              fontSize: `${subFontSz}px`, fontWeight: 400,
              color: GRAY_TEXT, lineHeight: 1.5,
              textAlign: 'center', letterSpacing: '0.01em',
            }}>
              {subTitle}
            </div>
          )}
        </div>

        {/* ── Date | Venue (좌측 하단) ──────────────────────────── */}
        <div style={{
          position: 'absolute',
          bottom: `${X * 1.0}px`,
          left: `${logoLeft}px`,
          width: `${displayW - logoLeft * 2}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: `${infoFontSize * 0.4}px`,
          color: GRAY_TEXT,
          fontSize: `${infoFontSize}px`,
          fontWeight: 600,
          lineHeight: 1.4,
          zIndex: 5,
        }}>
          {dateText && <span style={{ whiteSpace: 'nowrap' }}>{dateText}</span>}
          {venueText && <span style={{ whiteSpace: 'normal', wordBreak: 'keep-all' }}>{venueText}</span>}
        </div>

      </div>
    </div>
  );
}
