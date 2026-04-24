import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetLayer, CanvasSize, DesignContent } from "@/design/types";

const DARK = "#1A1A1A";
const MAGENTA = "#F43182";

/** RCS: 메시지 유형별 고정 배경 (우측 패널/저장용 backgroundColor과 동기화) */
const RCS_BG_BY_MESSAGE: Record<string, string> = {
  가입안내: "#FFF0F5", // Pink
  혜택안내: "#E8D9F5", // Light Purple
  해지안내: "#FDFAF0", // Ivory
  "서비스 종료안내": "#FDFAF0", // Ivory
};

const RCS_BG_DEFAULT = "#FFF0F5";

/** 우측 패널·내보내기와 동일한 색 (메시지 유형 미선택 시 기본 Pink) */
export function resolveRcsMessageBackground(messageType: string | null | undefined): string {
  if (!messageType) return RCS_BG_DEFAULT;
  return RCS_BG_BY_MESSAGE[messageType] ?? RCS_BG_DEFAULT;
}

function getRcsCanvasBackground(content: DesignContent): string {
  const t = (content as { rcsMessageType?: string }).rcsMessageType;
  return resolveRcsMessageBackground(t ?? null);
}

interface RCSCanvasProps {
  content: DesignContent;
  canvasSize: CanvasSize;
  zoom: number;
}

function getFontWeight(weight?: string): number {
  switch (weight) {
    case "light":
      return 300;
    case "standard":
      return 400;
    case "semi-bold":
      return 600;
    case "bold":
      return 800;
    default:
      return 800;
  }
}

export function RCSCanvas({ content, canvasSize, zoom }: RCSCanvasProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);
  const [containerH, setContainerH] = useState(600);

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

  const rcsAsset = useMemo((): AssetLayer | null => {
    const layers = content.assetLayers ?? [];
    // RCS: illustration만 사용 (pictogram은 패널에서 제거됨)
    const ill = [...layers].reverse().find((l) => l.type === "illustration" && !!l.src);
    if (ill) return ill;
    return null;
  }, [content.assetLayers]);

  const realAspect = canvasSize.width / canvasSize.height;

  const padding = 80;
  const availW = containerW - padding;
  const availH = containerH - padding;
  let baseW = availW;
  let baseH = baseW / realAspect;
  if (baseH > availH) {
    baseH = availH;
    baseW = baseH * realAspect;
  }
  const displayW = baseW * zoom;
  const displayH = displayW / realAspect;

  const W = displayW;
  const marginLeft = W * 0.06;
  const marginTop = W * 0.08;
  const canvasBg = getRcsCanvasBackground(content);
  /** 일러스트: 우·하단 여백을 20% 축소(코너 쪽으로), 박스 크기는 +10% */
  const assetRight = W * 0.08 * 0.6;
  const assetBottom = marginLeft * 0.6;
  const assetBox = W * 0.35 * 1.1;

  const baseTitleFontSize = W * 0.078;
  const baseBodyFontSize = W * 0.028;
  const titleFontSize = baseTitleFontSize * ((content.titleSize || 100) / 100);
  const bodyFontSize = baseBodyFontSize * ((content.bodySize || 100) / 100);
  const bodyIndent = Math.max(W * 0.008, titleFontSize * 0.05);

  const titleWeight = getFontWeight((content as any).titleWeight);
  const bodyWeight = getFontWeight((content as any).bodyWeight);

  const emphasizedText = (content.emphasizedTitle || "").trim();
  const title = content.title || "";
  const body = content.bodyText || "";
  const titleToBodyGap = W * 0.01 * 2.5;

  const renderTitle = () => {
    if (!emphasizedText || !title.includes(emphasizedText)) {
      return (
        <div style={{ marginBottom: `${titleToBodyGap}px` }}>
          {title.split("\n").map((line, idx) => (
            <div key={idx}>
              <span
                style={{
                  fontSize: `${titleFontSize}px`,
                  fontWeight: titleWeight,
                  color: DARK,
                  lineHeight: 1.15,
                  display: "inline",
                }}
              >
                {line}
              </span>
            </div>
          ))}
        </div>
      );
    }

    const parts = title.split(emphasizedText);
    return (
      <div style={{ marginBottom: `${titleToBodyGap}px` }}>
        {parts.map((part, idx) => (
          <span key={idx}>
            {part.split("\n").map((line, lineIdx) => (
              <span key={lineIdx}>
                {lineIdx > 0 && <br />}
                <span
                  style={{
                    fontSize: `${titleFontSize}px`,
                    fontWeight: titleWeight,
                    color: DARK,
                    lineHeight: 1.15,
                    display: "inline",
                  }}
                >
                  {line}
                </span>
              </span>
            ))}
            {idx < parts.length - 1 ? (
              <span
                style={{
                  fontSize: `${titleFontSize}px`,
                  fontWeight: titleWeight,
                  color: MAGENTA,
                  lineHeight: 1.15,
                  display: "inline",
                }}
              >
                {emphasizedText}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    );
  };

  const renderBody = () => (
    <div>
      {body.split("\n").map((line, idx) => (
        <div key={idx}>
          <span
            style={{
              fontSize: `${bodyFontSize}px`,
              fontWeight: bodyWeight,
              color: DARK,
              lineHeight: 1.5,
              display: "inline",
            }}
          >
            {line}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div ref={outerRef} className="w-full h-full flex items-center justify-center overflow-auto bg-[#F5F5F5]">
      <div
        style={{
          width: `${displayW}px`,
          height: `${displayH}px`,
          position: "relative",
          backgroundColor: canvasBg,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: `${marginTop}px`,
            left: `${marginLeft}px`,
            maxWidth: `${W * 0.55}px`,
            zIndex: 5,
            textAlign: "left",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            boxSizing: "border-box",
          }}
        >
          {title ? renderTitle() : null}
          {body ? (
            <div
              style={{
                width: "100%",
                textAlign: "left",
                alignSelf: "stretch",
                paddingLeft: `${bodyIndent}px`,
                boxSizing: "border-box",
              }}
            >
              {renderBody()}
            </div>
          ) : null}
        </div>

        {rcsAsset?.src ? (
          <div
            style={{
              position: "absolute",
              right: `${assetRight}px`,
              bottom: `${assetBottom}px`,
              width: `${assetBox}px`,
              height: `${assetBox}px`,
              zIndex: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={rcsAsset.src}
              alt={rcsAsset.name || "Asset"}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

