/**
 * PlacardWideCanvas.tsx
 * LG U+ Brand Design Guideline – 현수막 대형(가로)
 *
 * Spec : 4700 × 700 mm  |  Aspect ratio ≈ 6.714 : 1
 * Grid : 1X = displayHeight ÷ 12 (viCanvasConstants)
 */

import { useRef, useEffect, useState, useCallback } from "react";
import type { DesignContent, CanvasSize } from "@/design/types";

import { defaultCI, defaultBI, defaultSLOGAN } from "@/design/defaultLogos";
import {
  VI_COLORS,
  VI_FONT_STACK,
  VI_RIGHT_PANEL_BG,
  computePlacardWideLayout,
  getViGridStepPx,
} from "@/design/viCanvasConstants";
import { ViAlignmentGrid } from "./ViAlignmentGrid";

const ASPECT = 4700 / 700;

interface Props {
  content: DesignContent;
  canvasSize: CanvasSize;
  zoom: number;
  /** VI 12-column 그리드 표시 (정렬·여백 참고) */
  showViGrid?: boolean;
}

function AdminLogo({
  option,
  height,
  customSrc,
}: {
  option: "CI" | "BI" | "SLOGAN";
  height: number;
  customSrc: string | null;
}) {
  if (option === "CI") {
    return (
      <img
        src={customSrc ?? defaultCI}
        alt="LG U+ CI"
        style={{ height: `${height}px`, width: "auto", objectFit: "contain", display: "block" }}
      />
    );
  }

  if (option === "BI") {
    if (defaultBI) {
      return (
        <img
          src={defaultBI}
          alt="LG U+ BI"
          style={{ height: `${height}px`, width: "auto", objectFit: "contain", display: "block" }}
        />
      );
    }
    return (
      <div style={{ height: `${height}px`, display: "flex", alignItems: "center", gap: `${height * 0.18}px` }}>
        <div
          style={{
            width: `${height * 0.88}px`,
            height: `${height * 0.88}px`,
            borderRadius: "50%",
            background: "#E30613",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#fff", fontSize: `${height * 0.38}px`, fontWeight: 900, lineHeight: 1 }}>U+</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: `${height * 0.05}px` }}>
          <span style={{ fontSize: `${height * 0.3}px`, fontWeight: 700, color: VI_COLORS.textPrimary, lineHeight: 1 }}>LG U+</span>
          <span
            style={{
              fontSize: `${height * 0.19}px`,
              fontWeight: 400,
              color: VI_COLORS.textSecondary,
              lineHeight: 1,
              letterSpacing: "0.06em",
            }}
          >
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
        style={{ height: `${height}px`, width: "auto", objectFit: "contain", display: "block" }}
      />
    );
  }
  return (
    <div
      style={{
        height: `${height}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: `${height * 0.07}px`,
      }}
    >
      <span
        style={{
          fontSize: `${height * 0.27}px`,
          fontWeight: 800,
          color: VI_COLORS.brandMagenta,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
        }}
      >
        새로운 세상을
      </span>
      <span
        style={{
          fontSize: `${height * 0.27}px`,
          fontWeight: 800,
          color: VI_COLORS.brandMagenta,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
        }}
      >
        열어갑니다
      </span>
      <span
        style={{
          fontSize: `${height * 0.17}px`,
          fontWeight: 400,
          color: VI_COLORS.textSecondary,
          lineHeight: 1,
          marginTop: `${height * 0.04}px`,
          letterSpacing: "0.1em",
        }}
      >
        SLOGAN
      </span>
    </div>
  );
}

export function PlacardWideCanvas({ content, zoom, showViGrid }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [baseW, setBaseW] = useState(1100);
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (content.logo instanceof File) {
      const url = URL.createObjectURL(content.logo);
      setCustomLogoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setCustomLogoUrl(typeof content.logo === "string" ? content.logo : null);
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
  const L = computePlacardWideLayout(displayW, displayH);
  const X = L.gridUnit;

  const bgKey = content.rightPanelBg ?? "white";
  const logoOption = content.logoOption ?? "CI";
  const rightBg = VI_RIGHT_PANEL_BG[bgKey] ?? VI_RIGHT_PANEL_BG.white;

  const mainTitle = content.title || "LG유플러스 AI경영시스템";
  const emphTitle = content.emphasizedTitle || "국제인증 획득";
  const subTitle = content.bodyText || "IEC 42001 인증 수여식";
  const dateText = content.date || "2025.07.02(수)";
  const venueText = content.venue || "LG유플러스 울산 컨버전스 홀";

  return (
    <div
      ref={outerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "100%",
        overflowX: zoom > 1 ? "auto" : "hidden",
        overflowY: "auto",
        background: VI_COLORS.outerChrome,
        display: "flex",
        alignItems: zoom > 1 ? "flex-start" : "center",
        justifyContent: zoom > 1 ? "flex-start" : "center",
        padding: "40px",
        boxSizing: "border-box",
      }}
    >
      <div
        id="design-canvas"
        style={{
          position: "relative",
          width: `${displayW}px`,
          height: `${displayH}px`,
          background: VI_COLORS.canvasBg,
          border: `1.5px solid ${VI_COLORS.border}`,
          borderRadius: `${L.canvasBorderRadius}px`,
          overflow: "hidden",
          flexShrink: 0,
          boxShadow: "0 4px 28px rgba(0,0,0,0.12)",
          fontFamily: VI_FONT_STACK,
        }}
      >
        {showViGrid && (
          <ViAlignmentGrid width={displayW} height={displayH} step={getViGridStepPx(X)} />
        )}

        <div
          style={{
            position: "absolute",
            left: `${L.bgLeft}px`,
            top: `${L.bgTop}px`,
            width: `${L.bgW}px`,
            height: `${L.bgH}px`,
            background: rightBg,
            borderRadius: `${L.bgRadius}px`,
            boxShadow: "none",
            zIndex: 1,
          }}
        />

        <div
          style={{
            position: "absolute",
            top: `${L.logoTop}px`,
            left: `${L.logoLeft}px`,
            zIndex: 5,
          }}
        >
          <AdminLogo option={logoOption} height={L.logoH} customSrc={customLogoUrl} />
        </div>

        <div
          style={{
            position: "absolute",
            bottom: `${X * 0.6}px`,
            left: `${L.infoLeft}px`,
            width: `${L.leftW - L.infoLeft + X * 0.5}px`,
            display: "flex",
            alignItems: "center",
            gap: `${X * 0.28}px`,
            color: VI_COLORS.textSecondary,
            fontSize: `${L.infoFontSize}px`,
            fontWeight: 600,
            lineHeight: 1,
            zIndex: 5,
          }}
        >
          {dateText && <span style={{ flexShrink: 0, whiteSpace: "nowrap" }}>{dateText}</span>}
          {dateText && venueText && (
            <span
              style={{
                display: "inline-block",
                width: "1px",
                height: `${L.infoFontSize * 0.8}px`,
                background: "#C0C0C0",
                flexShrink: 0,
              }}
            />
          )}
          {venueText && (
            <span style={{ whiteSpace: "normal", wordBreak: "keep-all", minWidth: 0 }}>{venueText}</span>
          )}
        </div>

        <div
          style={{
            position: "absolute",
            top: `${L.bgTop}px`,
            left: `${L.bgLeft}px`,
            width: `${L.bgW}px`,
            height: `${L.bgH}px`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: `0 ${X * 0.55}px`,
            zIndex: 5,
          }}
        >
          <div
            style={{
              lineHeight: 1.18,
              textAlign: "center",
              marginBottom: `${L.titleToSubGap}px`,
            }}
          >
            {mainTitle && (
              <span
                style={{
                  fontSize: `${L.titleFontSz}px`,
                  fontWeight: 600,
                  color: VI_COLORS.textPrimary,
                  letterSpacing: "-0.02em",
                }}
              >
                {mainTitle}
              </span>
            )}
            {mainTitle && emphTitle && (
              <span style={{ fontSize: `${L.titleFontSz}px`, fontWeight: 600, color: VI_COLORS.textPrimary }}> </span>
            )}
            {emphTitle && (
              <span
                style={{
                  fontSize: `${L.titleFontSz}px`,
                  fontWeight: 700,
                  color: VI_COLORS.brandMagenta,
                  letterSpacing: "-0.02em",
                }}
              >
                {emphTitle}
              </span>
            )}
          </div>

          {subTitle && (
            <div
              style={{
                fontSize: `${L.subFontSz}px`,
                fontWeight: 400,
                color: VI_COLORS.textSecondary,
                lineHeight: 1.45,
                textAlign: "center",
                letterSpacing: "0.01em",
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
