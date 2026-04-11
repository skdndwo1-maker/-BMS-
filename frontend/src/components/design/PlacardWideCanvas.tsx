/**
 * PlacardWideCanvas.tsx
 * LG U+ Brand Design Guideline – 현수막 대형(가로)
 *
 * Spec : 4700 × 700 mm  |  Aspect ratio ≈ 6.714 : 1
 * Grid : 1X = displayHeight ÷ 12
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { DesignContent, CanvasSize } from '@/design/types';

import { defaultCI, defaultBI, defaultSLOGAN } from "@/design/defaultLogos";

const ASPECT     = 4700 / 700;
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

function AdminLogo({
  option,
  height,
  customSrc,
}: {
  option: 'CI' | 'BI' | 'SLOGAN';
  height: number;
  customSrc: string | null;
}) {
  if (option === 'CI') {
    return (
      <img
        src={customSrc ?? defaultCI}
        alt="LG U+ CI"
        style={{ height: `${height}px`, width: 'auto', objectFit: 'contain', display: 'block' }}
      />
    );
  }

  if (option === 'BI') {
    if (defaultBI) {
      return (
        <img
          src={defaultBI}
          alt="LG U+ BI"
          style={{ height: `${height}px`, width: 'auto', objectFit: 'contain', display: 'block' }}
        />
      );
    }
    return (
      <div style={{ height: `${height}px`, display: 'flex', alignItems: 'center', gap: `${height * 0.18}px` }}>
        <div
          style={{
            width: `${height * 0.88}px`,
            height: `${height * 0.88}px`,
            borderRadius: '50%',
            background: '#E30613',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#fff', fontSize: `${height * 0.38}px`, fontWeight: 900, lineHeight: 1 }}>U+</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${height * 0.05}px` }}>
          <span style={{ fontSize: `${height * 0.3}px`, fontWeight: 700, color: DARK, lineHeight: 1 }}>LG U+</span>
          <span style={{ fontSize: `${height * 0.19}px`, fontWeight: 400, color: GRAY_TEXT, lineHeight: 1, letterSpacing: '0.06em' }}>
            BI LOGO
          </span>
        </div>
      </div>
    );
  }

  if (defaultSLOGAN) {
    return (
      <img
        src={defaultSLOGAN}
        alt="LG U+ Slogan"
        style={{ height: `${height}px`, width: 'auto', objectFit: 'contain', display: 'block' }}
      />
    );
  }
  return (
    <div style={{ height: `${height}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: `${height * 0.07}px` }}>
      <span style={{ fontSize: `${height * 0.27}px`, fontWeight: 800, color: MAGENTA, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
        새로운 세상을
      </span>
      <span style={{ fontSize: `${height * 0.27}px`, fontWeight: 800, color: MAGENTA, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
        열어갑니다
      </span>
      <span style={{ fontSize: `${height * 0.17}px`, fontWeight: 400, color: GRAY_TEXT, lineHeight: 1, marginTop: `${height * 0.04}px`, letterSpacing: '0.1em' }}>
        SLOGAN
      </span>
    </div>
  );
}

export function PlacardWideCanvas({ content, zoom }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [baseW, setBaseW] = useState(1100);
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

  // ── Display dimensions ────────────────────────────────────────────
  const displayW = baseW * zoom;
  const displayH = displayW / ASPECT;
  const X = displayH / 12;

  // ── Logo ──────────────────────────────────────────────────────────
  const logoMargin = X * 1.1;
  const logoH      = X * 1.8;
  const logoTop    = logoMargin;
  const logoLeft   = logoMargin;

  // ── Left panel ────────────────────────────────────────────────────
  const leftW        = displayW * 0.235;
  const infoFontSize = X * 0.8;
  const infoLeft     = X * 1.2;

  // ── Right panel bg ────────────────────────────────────────────────
  const bgInsetT = X * 1.0;
  const bgInsetB = X * 1.2;
  const bgInsetL = X * 0.26;
  const bgInsetR = X * 1.2;

  const bgLeft   = leftW + bgInsetL;
  const bgTop    = bgInsetT;
  const bgW      = displayW - bgLeft - bgInsetR;
  const bgH      = displayH - bgTop - bgInsetB;
  const bgRadius = X * 1.40;

  // ── Typography ────────────────────────────────────────────────────
  const titleFontSz   = X * 2.8;
  const subFontSz     = X * 1.5;
  const titleToSubGap = X * 0.57;

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
        width:          '100%',
        height:         '100%',
        minHeight:      '100%',
        overflowX:      zoom > 1 ? 'auto' : 'hidden',
        overflowY:      'auto',
        background:     '#E8E8E8',
        display:        'flex',
        alignItems:     zoom > 1 ? 'flex-start' : 'center',
        justifyContent: zoom > 1 ? 'flex-start' : 'center',
        padding:        '40px',
        boxSizing:      'border-box',
      }}
    >
      <div
        id="placard-wide-canvas"
        style={{
          position:     'relative',
          width:        `${displayW}px`,
          height:       `${displayH}px`,
          background:   '#FFFFFF',
          border:       `1.5px solid ${BORDER_COL}`,
          borderRadius: `${X * 0.1}px`,
          overflow:     'hidden',
          flexShrink:   0,
          boxShadow:    '0 4px 28px rgba(0,0,0,0.12)',
          fontFamily:   '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
        }}
      >

        {/* ── Right panel bg ──────────────────────────────────────── */}
        <div
          style={{
            position:     'absolute',
            left:         `${bgLeft}px`,
            top:          `${bgTop}px`,
            width:        `${bgW}px`,
            height:       `${bgH}px`,
            background:   rightBg,
            borderRadius: `${bgRadius}px`,
            boxShadow:    'none',
            zIndex:       1,
          }}
        />

        {/* ── Logo ────────────────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            top:      `${logoTop}px`,
            left:     `${logoLeft}px`,
            zIndex:   5,
          }}
        >
          <AdminLogo option={logoOption} height={logoH} customSrc={customLogoUrl} />
        </div>

        {/* ── Date | Venue ─────────────────────────────────────────── */}
        {/* overflow 제거, width 확장으로 venue 잘림 수정 */}
        <div
          style={{
            position:   'absolute',
            bottom:     `${X * 0.6}px`,
            left:       `${infoLeft}px`,
            width:      `${leftW - infoLeft + X * 0.5}px`,  // ← 수정: 잘림 방지
            display:    'flex',
            alignItems: 'center',
            gap:        `${X * 0.28}px`,
            color:      GRAY_TEXT,
            fontSize:   `${infoFontSize}px`,
            fontWeight: 600,
            lineHeight: 1,
            // overflow: 'hidden' 제거 ← 잘림 원인이었음
            zIndex:     5,
          }}
        >
          {dateText && (
            <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{dateText}</span>
          )}
          {dateText && venueText && (
            <span
              style={{
                display:    'inline-block',
                width:      '1px',
                height:     `${infoFontSize * 0.8}px`,
                background: '#C0C0C0',
                flexShrink: 0,
              }}
            />
          )}
          {venueText && (
            <span style={{ whiteSpace: 'normal', wordBreak: 'keep-all', minWidth: 0 }}>
              {venueText}
            </span>
          )}
        </div>

        {/* ── Right panel content ──────────────────────────────────── */}
        <div
          style={{
            position:       'absolute',
            top:            `${bgTop}px`,
            left:           `${bgLeft}px`,
            width:          `${bgW}px`,
            height:         `${bgH}px`,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            textAlign:      'center',
            padding:        `0 ${X * 0.55}px`,
            zIndex:         5,
          }}
        >
          <div
            style={{
              lineHeight:   1.18,
              textAlign:    'center',
              marginBottom: `${titleToSubGap}px`,
            }}
          >
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

          {subTitle && (
            <div
              style={{
                fontSize:      `${subFontSz}px`,
                fontWeight:    400,
                color:         GRAY_TEXT,
                lineHeight:    1.45,
                textAlign:     'center',
                letterSpacing: '0.01em',
              }}
            >
              {subTitle}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
