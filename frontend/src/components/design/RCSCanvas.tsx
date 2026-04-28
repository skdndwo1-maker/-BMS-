import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DESIGN_CANVAS_BASE_VIEW_SCALE } from "@/design/canvasViewConstants";
import type { AssetLayer, CanvasSize, DesignContent } from "@/design/types";

const DARK = "#1A1A1A";
const MAGENTA = "#FF7F66";

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
  /** 워크스페이스 표시 배율(1=가용 영역에 맞춤). 1 미만이면 전체 축소. */
  workspaceDisplayScale?: number;
  /** 캔버스 블록 정렬 — center면 워크스페이스 가운데 */
  workspaceAlign?: "center" | "start";
  /** 내보내기/AI용 메인 캔버스 id. 미리보기 등은 다른 id로 두어 중복을 피함 */
  canvasElementId?: string;
  /** true면 패딩·배경을 줄여 MMS 카드 슬롯 등에 끼워 넣기 좋게 함 */
  embed?: boolean;
  /** 워크스페이스(embed 아님)에서 측정 영역 바깥 여백(px). workspaceEdgeFraction이 있으면 무시 */
  workspaceGutterPx?: number;
  /**
   * 워크스페이스 한 변(좌·우 또는 상·하)당 여백 비율. 예: 1/15 → 좌우 각 containerW/15, 상하 각 containerH/15
   */
  workspaceEdgeFraction?: number;
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

export function RCSCanvas({
  content,
  canvasSize,
  zoom,
  workspaceDisplayScale = 1,
  workspaceAlign = "center",
  canvasElementId = "design-canvas",
  embed = false,
  workspaceGutterPx,
  workspaceEdgeFraction,
}: RCSCanvasProps) {
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

  let availW: number;
  let availH: number;
  if (embed) {
    const p = Math.max(6, Math.min(20, Math.round(containerW * 0.06)));
    availW = Math.max(1, containerW - p);
    availH = Math.max(1, containerH - p);
  } else if (workspaceEdgeFraction != null && workspaceEdgeFraction > 0) {
    const f = Math.min(0.45, workspaceEdgeFraction);
    const padX = Math.round(containerW * f);
    const padY = Math.round(containerH * f);
    availW = Math.max(1, containerW - 2 * padX);
    availH = Math.max(1, containerH - 2 * padY);
  } else {
    const padding = Math.max(24, workspaceGutterPx ?? 80);
    availW = Math.max(1, containerW - padding);
    availH = Math.max(1, containerH - padding);
  }
  let baseW = availW;
  let baseH = baseW / realAspect;
  if (baseH > availH) {
    baseH = availH;
    baseW = baseH * realAspect;
  }
  const scale = Math.max(0.25, Math.min(1.5, workspaceDisplayScale));
  /** 메인 워크스페이스만 기본 뷰 배율 적용 — MMS 슬롯(embed)은 물리 크기 유지 */
  const baseView = embed ? 1 : DESIGN_CANVAS_BASE_VIEW_SCALE;
  const displayW = baseW * zoom * scale * baseView;
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

  const justify = workspaceAlign === "start" ? "justify-start" : "justify-center";
  const outerClass = embed
    ? `w-full h-full min-h-0 flex items-center overflow-hidden bg-transparent ${justify}`
    : `w-full h-full flex items-center overflow-auto bg-[#F5F5F5] ${justify}`;

  return (
    <div ref={outerRef} className={outerClass}>
      <div
        id={canvasElementId}
        style={{
          width: `${displayW}px`,
          height: `${displayH}px`,
          position: "relative",
          backgroundColor: canvasBg,
          boxShadow: embed ? "0 1px 4px rgba(0,0,0,0.06)" : "0 4px 24px rgba(0,0,0,0.08)",
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

