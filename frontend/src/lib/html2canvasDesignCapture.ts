const COLOR_PROPS = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "caret-color",
  "column-rule-color",
  "text-decoration-color",
  "fill",
  "stroke",
] as const;

function resolveColorForCapture(prop: string, raw: string): string | null {
  const v = raw.trim();
  if (!v || v === "none" || v === "transparent") return null;
  if (!v.includes("oklch") && !v.includes("color-mix(")) return v;
  try {
    const probe = document.createElement("div");
    probe.style.setProperty(prop, v);
    probe.style.position = "fixed";
    probe.style.left = "-9999px";
    probe.style.top = "0";
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).getPropertyValue(prop).trim();
    document.body.removeChild(probe);
    if (resolved && !resolved.includes("oklch") && !resolved.includes("color-mix(")) return resolved;
  } catch {
    /* ignore */
  }
  return prop.includes("background") ? "#ffffff" : "#1a1a1a";
}

/**
 * html2canvas는 oklch() 등 최신 CSS 색 함수를 파싱하지 못해 토스트 오류가 납니다.
 * 클론 노드에 브라우저가 정규화한 rgb 색을 인라인으로 넣어 파싱기가 읽게 합니다.
 */
function syncComputedColorsToClone(origRoot: HTMLElement, cloneRoot: HTMLElement): void {
  const oWalker = document.createTreeWalker(origRoot, NodeFilter.SHOW_ELEMENT);
  const cWalker = cloneRoot.ownerDocument!.createTreeWalker(cloneRoot, NodeFilter.SHOW_ELEMENT);

  let oNode: Node | null = oWalker.nextNode();
  let cNode: Node | null = cWalker.nextNode();

  while (oNode && cNode) {
    if (oNode instanceof HTMLElement && cNode instanceof HTMLElement) {
      const cs = window.getComputedStyle(oNode);
      for (const p of COLOR_PROPS) {
        const raw = cs.getPropertyValue(p);
        const resolved = resolveColorForCapture(p, raw);
        if (resolved) cNode.style.setProperty(p, resolved);
      }
    }
    oNode = oWalker.nextNode();
    cNode = cWalker.nextNode();
  }
}

export function buildDesignCanvasCaptureOptions(
  base: Record<string, unknown> & { onclone?: (doc: Document, el: HTMLElement) => void }
): Record<string, unknown> {
  const prevOnClone = base.onclone;
  return {
    ...base,
    onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
      const orig = document.getElementById("design-canvas");
      if (orig && clonedElement instanceof HTMLElement) {
        syncComputedColorsToClone(orig, clonedElement);
      }
      prevOnClone?.(clonedDoc, clonedElement);
    },
  };
}
