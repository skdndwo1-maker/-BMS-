import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetLayer, CanvasSize, DesignContent } from "@/design/types";

const DARK = "#1A1A1A";
const MAGENTA = "#F43182";

type RcsCategory = "benefit" | "signup" | "cancellation" | "termination";

interface RCSCanvasProps {
  content: DesignContent;
  canvasSize: CanvasSize;
  zoom: number;
}

function getRcsCategory(content: DesignContent): RcsCategory {
  const v = (content as any).rcsCategory as string | undefined;
  if (v === "benefit" || v === "signup" || v === "cancellation" || v === "termination") return v;
  return "benefit";
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

  const category = getRcsCategory(content);
  const rcsStyle =
    category === "signup"
      ? { bgColor: "#FFE5F0", accentColor: "#F43182" }
      : category === "benefit"
        ? { bgColor: "#E8D9F5", accentColor: "#9B6DD6" }
        : { bgColor: "#F5F3ED", accentColor: "#F5F3ED" };

  // 우측 패널의 배경색 선택이 RCS 캔버스에 즉시 반영되도록 연결
  const canvasBg = (content.backgroundColor || "").trim() || rcsStyle.bgColor;

  const baseTitleFontSize = W * 0.078;
  const baseBodyFontSize = W * 0.028;
  const titleFontSize = baseTitleFontSize * ((content.titleSize || 100) / 100);
  const bodyFontSize = baseBodyFontSize * ((content.bodySize || 100) / 100);

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
          }}
        >
          {title ? renderTitle() : null}
          {body ? renderBody() : null}
        </div>

        {rcsAsset?.src ? (
          <div
            style={{
              position: "absolute",
              right: `${W * 0.08}px`,
              bottom: `${marginLeft}px`,
              width: `${W * 0.35}px`,
              height: `${W * 0.35}px`,
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

