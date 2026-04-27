import { domToCanvas } from "modern-screenshot";
import { toCanvas } from "html-to-image";

/**
 * 디자인 캔버스 스크린샷.
 * - Tailwind v4의 oklch()/color-mix()는 브라우저는 지원하지만 html2canvas는 파싱 실패함.
 * - modern-screenshot·html-to-image는 SVG foreignObject 경로로 브라우저 렌더 결과를 캔버스에 옮김.
 */
export interface DesignCanvasCaptureOptions {
  scale?: number;
  backgroundColor?: string | null;
  cacheBust?: boolean;
}

const DEFAULTS: Required<Omit<DesignCanvasCaptureOptions, "backgroundColor">> & {
  backgroundColor: string | null;
} = {
  scale: 2,
  backgroundColor: "#ffffff",
  cacheBust: true,
};

export async function captureDesignCanvas(
  el: HTMLElement,
  opts: DesignCanvasCaptureOptions = {}
): Promise<HTMLCanvasElement> {
  const scale = opts.scale ?? DEFAULTS.scale;
  const backgroundColor =
    opts.backgroundColor !== undefined ? opts.backgroundColor : DEFAULTS.backgroundColor;

  try {
    return await domToCanvas(el, {
      scale,
      backgroundColor,
      type: "image/png",
    });
  } catch (e) {
    console.warn("[design-capture] modern-screenshot failed, trying html-to-image", e);
    return await toCanvas(el, {
      pixelRatio: scale,
      backgroundColor: backgroundColor ?? undefined,
      cacheBust: opts.cacheBust ?? DEFAULTS.cacheBust,
      fetchRequestInit: { cache: "no-cache" },
      skipAutoScale: true,
    });
  }
}

export async function captureDesignCanvasDataUrl(
  el: HTMLElement,
  opts: DesignCanvasCaptureOptions = {}
): Promise<string> {
  const canvas = await captureDesignCanvas(el, opts);
  return canvas.toDataURL("image/png");
}
