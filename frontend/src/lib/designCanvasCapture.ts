import { domToCanvas } from "modern-screenshot";
import { toCanvas } from "html-to-image";
import type { CanvasSize } from "@/design/types";

/**
 * 디자인 캔버스 스크린샷.
 * - Tailwind v4의 oklch()/color-mix()는 브라우저는 지원하지만 html2canvas는 파싱 실패함.
 * - modern-screenshot·html-to-image는 SVG foreignObject 경로로 브라우저 렌더 결과를 캔버스에 옮김.
 */
export interface DesignCanvasCaptureOptions {
  scale?: number;
  backgroundColor?: string | null;
  cacheBust?: boolean;
  /** 기본 true. false면 VI 정렬 그리드(data-vi-grid)도 캡처에 포함 */
  excludeViGrid?: boolean;
  /** 기본 true. 편집용 크롬(핸들·라벨·인라인 편집 UI 등) 제외 */
  excludeCanvasChrome?: boolean;
  /** 추가 노드 필터. false를 반환하면 해당 노드와 자식은 제외 */
  filter?: (node: Node) => boolean;
}

const DEFAULTS: Required<Omit<DesignCanvasCaptureOptions, "backgroundColor" | "filter">> & {
  backgroundColor: string | null;
  filter?: (node: Node) => boolean;
} = {
  scale: 2,
  backgroundColor: "#ffffff",
  cacheBust: true,
  excludeViGrid: true,
  excludeCanvasChrome: true,
};

/** 보내기·캡처 직전 #design-canvas에 붙여 편집용 외곽선·그림자를 숨깁니다 */
export const DESIGN_CANVAS_EXPORT_CAPTURE_ATTR = "data-export-capture";

export function isCanvasExportExcludedElement(el: Element): boolean {
  if (el.getAttribute("data-vi-grid") === "true") return true;
  if (el.getAttribute("data-canvas-export-exclude") === "true") return true;
  return false;
}

/** 템플릿 작업 규격을 96dpi 기준 CSS 픽셀 크기로 환산 (보내기 목표 해상도 계산용) */
export function getDesignCanvasLogicalPixelSize(canvasSize: CanvasSize): { width: number; height: number } {
  const dpi = 96;
  switch (canvasSize.unit) {
    case "mm":
      return {
        width: Math.max(1, Math.round((canvasSize.width / 25.4) * dpi)),
        height: Math.max(1, Math.round((canvasSize.height / 25.4) * dpi)),
      };
    case "in":
      return {
        width: Math.max(1, Math.round(canvasSize.width * dpi)),
        height: Math.max(1, Math.round(canvasSize.height * dpi)),
      };
    default:
      return {
        width: Math.max(1, Math.round(canvasSize.width)),
        height: Math.max(1, Math.round(canvasSize.height)),
      };
  }
}

function buildCombinedFilter(opts: DesignCanvasCaptureOptions): ((node: Node) => boolean) | null {
  const excludeVi = opts.excludeViGrid !== false;
  const excludeChrome = opts.excludeCanvasChrome !== false;
  const user = opts.filter;
  if (!excludeVi && !excludeChrome && !user) return null;

  return (node: Node) => {
    if (node instanceof Element) {
      if (excludeVi && node.getAttribute("data-vi-grid") === "true") return false;
      if (excludeChrome && node.getAttribute("data-canvas-export-exclude") === "true") return false;
      // 조상 중 export-exclude / vi-grid가 있으면 제외(핸들·라벨 누락 대비)
      if (
        excludeChrome &&
        typeof node.closest === "function" &&
        node.closest("[data-canvas-export-exclude='true']")
      ) {
        return false;
      }
      if (
        excludeVi &&
        typeof node.closest === "function" &&
        node.closest("[data-vi-grid='true']")
      ) {
        return false;
      }
    }
    if (user && !user(node)) return false;
    return true;
  };
}

/** 캡처 전 Pretendard/Geist weight가 실제로 로드됐는지 확인 (Medium→Regular 폴백 완화) */
export async function ensureDesignCanvasFontsReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.ready;
    const samples = [
      "400 16px Pretendard",
      "500 16px Pretendard",
      "600 16px Pretendard",
      "700 16px Pretendard",
      "400 16px Geist",
      "500 16px Geist",
      "600 16px Geist",
      "700 16px Geist",
    ];
    await Promise.all(samples.map((f) => document.fonts.load(f).catch(() => undefined)));
  } catch {
    /* ignore */
  }
}

function waitNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function captureDesignCanvas(
  el: HTMLElement,
  opts: DesignCanvasCaptureOptions = {}
): Promise<HTMLCanvasElement> {
  const scale = opts.scale ?? DEFAULTS.scale;
  const backgroundColor =
    opts.backgroundColor !== undefined ? opts.backgroundColor : DEFAULTS.backgroundColor;
  const combinedFilter = buildCombinedFilter(opts);
  const hadExportAttr = el.hasAttribute(DESIGN_CANVAS_EXPORT_CAPTURE_ATTR);
  if (!hadExportAttr) {
    el.setAttribute(DESIGN_CANVAS_EXPORT_CAPTURE_ATTR, "true");
  }

  try {
    await ensureDesignCanvasFontsReady();
    // data-export-capture CSS(outline/grid 숨김)가 적용된 뒤 한 프레임 대기
    await waitNextPaint();

    try {
      return await domToCanvas(el, {
        scale,
        backgroundColor,
        type: "image/png",
        ...(combinedFilter ? { filter: combinedFilter } : {}),
      });
    } catch (e) {
      console.warn("[design-capture] modern-screenshot failed, trying html-to-image", e);
      return await toCanvas(el, {
        pixelRatio: scale,
        backgroundColor: backgroundColor ?? undefined,
        cacheBust: opts.cacheBust ?? DEFAULTS.cacheBust,
        fetchRequestInit: { cache: "no-cache" },
        skipAutoScale: true,
        filter: combinedFilter
          ? (domNode: HTMLElement) => {
              return combinedFilter(domNode);
            }
          : undefined,
      });
    }
  } finally {
    if (!hadExportAttr) {
      el.removeAttribute(DESIGN_CANVAS_EXPORT_CAPTURE_ATTR);
    }
  }
}

export async function captureDesignCanvasDataUrl(
  el: HTMLElement,
  opts: DesignCanvasCaptureOptions = {}
): Promise<string> {
  const canvas = await captureDesignCanvas(el, opts);
  return canvas.toDataURL("image/png");
}
