import type {
  AssetLayer,
  CanvasShape,
  DesignContent,
  TemplateLayout,
  TemplateLayoutElement,
  TemplateLayoutElementKind,
} from "./types";

export const TEMPLATE_LAYOUT_LIMITS: Partial<Record<TemplateLayoutElementKind, number>> = {
  title: 1,
  subtitle: 3,
  body: 4,
  footer: 1,
  image: 1,
};

export const TEMPLATE_ELEMENT_LABELS: Record<TemplateLayoutElementKind, string> = {
  title: "메인 타이틀",
  subtitle: "부제",
  body: "본문",
  footer: "유의사항",
  colorBox: "컬러 박스",
  image: "이미지 영역",
  asset: "에셋",
};

/** 빌더 미리보기용 기본 글자 크기 — 캔버스 짧은 변 대비 */
export const TEMPLATE_TEXT_BASE_RATIO: Partial<Record<TemplateLayoutElementKind, number>> = {
  title: 0.075,
  subtitle: 0.045,
  body: 0.034,
  footer: 0.022,
};

export function newLayoutElementId(): string {
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultTemplateLayout(): TemplateLayout {
  return {
    version: 1,
    backgroundColor: "#FFFFFF",
    grid: { visible: true, columns: 12, rows: 12, marginPct: 6, gutterPct: 1.5, snap: true },
    logo: { option: "CI", position: "top-left", locked: false },
    elements: [
      createLayoutElement("title", { x: 0.08, y: 0.18, width: 0.84, height: 0.14 }),
      createLayoutElement("body", { x: 0.08, y: 0.36, width: 0.84, height: 0.16 }),
      createLayoutElement("footer", { x: 0.08, y: 0.9, width: 0.6, height: 0.05 }),
    ],
  };
}

export function createLayoutElement(
  kind: TemplateLayoutElementKind,
  rect?: Partial<Pick<TemplateLayoutElement, "x" | "y" | "width" | "height">>,
): TemplateLayoutElement {
  const base: TemplateLayoutElement = {
    id: newLayoutElementId(),
    kind,
    x: 0.1,
    y: 0.1,
    width: 0.5,
    height: 0.12,
    locked: false,
  };
  switch (kind) {
    case "title":
      Object.assign(base, { width: 0.8, height: 0.14, text: "메인 타이틀을 입력하세요", color: "#1A1A1A", fontScale: 100, align: "left" });
      break;
    case "subtitle":
      Object.assign(base, { width: 0.7, height: 0.08, text: "부제", color: "#1A1A1A", fontScale: 100, align: "left" });
      break;
    case "body":
      Object.assign(base, { width: 0.8, height: 0.14, text: "본문 내용을 입력하세요", color: "#4B4B4B", fontScale: 100, align: "left" });
      break;
    case "footer":
      Object.assign(base, { width: 0.6, height: 0.05, text: "※ 유의사항", color: "#9A9A9A", fontScale: 100, align: "left" });
      break;
    case "colorBox":
      Object.assign(base, { x: 0.1, y: 0.55, width: 0.4, height: 0.25, color: "#FFF0F5", radiusPct: 8, opacity: 1 });
      break;
    case "image":
      Object.assign(base, { x: 0.5, y: 0.45, width: 0.42, height: 0.4, radiusPct: 8 });
      break;
    case "asset":
      Object.assign(base, { x: 0.65, y: 0.6, width: 0.2, height: 0.2, opacity: 1, assetType: "illustration" });
      break;
  }
  return { ...base, ...rect };
}

export function countLayoutElements(layout: TemplateLayout, kind: TemplateLayoutElementKind): number {
  return layout.elements.filter((e) => e.kind === kind).length;
}

export function canAddLayoutElement(layout: TemplateLayout, kind: TemplateLayoutElementKind): boolean {
  const max = TEMPLATE_LAYOUT_LIMITS[kind];
  return max == null || countLayoutElements(layout, kind) < max;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

export function clampElementRect<T extends Pick<TemplateLayoutElement, "x" | "y" | "width" | "height">>(el: T): T {
  const width = Math.min(1, Math.max(0.01, el.width));
  const height = Math.min(1, Math.max(0.01, el.height));
  return {
    ...el,
    width,
    height,
    x: Math.min(1 - width, clamp01(el.x)),
    y: Math.min(1 - height, clamp01(el.y)),
  };
}

function rectOf(el: TemplateLayoutElement) {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

/** 색 박스를 사용자 캔버스 에셋 레이어 대신 전용 도형으로 변환 */
function toCanvasShape(el: TemplateLayoutElement): CanvasShape {
  return {
    id: el.id,
    ...rectOf(el),
    color: el.color ?? "#FFF0F5",
    radiusPct: el.radiusPct ?? 0,
    opacity: el.opacity ?? 1,
    locked: el.locked,
  };
}

function toAssetLayer(el: TemplateLayoutElement): AssetLayer | null {
  if (!el.src) return null;
  return {
    id: el.id,
    type: el.assetType ?? "illustration",
    src: el.src,
    name: el.name,
    ...rectOf(el),
    visible: true,
    locked: el.locked,
    opacity: el.opacity ?? 1,
    rotation: 0,
  };
}

/**
 * 관리자 템플릿 레이아웃 → 디자인 에디터 초기 content.
 * 텍스트·이미지·도형·에셋 rect와 잠금, 로고 기본값을 채운다.
 */
export function applyTemplateLayoutToContent(
  prev: DesignContent,
  layout: TemplateLayout,
  templateId: string,
): DesignContent {
  const els = layout.elements;
  const title = els.find((e) => e.kind === "title");
  const footer = els.find((e) => e.kind === "footer");
  const image = els.find((e) => e.kind === "image");
  const subtitles = els.filter((e) => e.kind === "subtitle").slice(0, 3);
  const bodies = els.filter((e) => e.kind === "body").slice(0, 4);

  const lockedKeys: string[] = [];
  const next: DesignContent = {
    ...prev,
    templateLayoutApplied: templateId,
    axisLayoutApplied: true,
    backgroundColor: layout.backgroundColor,
    logoOption: layout.logo.option,
    logoPosition: layout.logo.position,
    templateLogoLocked: layout.logo.locked,
  };

  if (title) {
    next.title = title.text ?? "";
    next.posterTitleRect = rectOf(title);
    next.posterTitleOnCanvas = true;
    next.posterTitleRectLocked = true;
    if (title.color) next.titleColor = title.color;
    if (title.align) next.posterTitleAlign = title.align;
    if (title.fontScale) next.posterTitleFontScale = title.fontScale;
    if (title.locked) lockedKeys.push("title");
  } else {
    next.posterTitleOnCanvas = false;
  }

  next.posterSubtitles = subtitles.map((s, i) => ({ id: `subtitle-${i + 1}`, text: s.text ?? "" }));
  next.posterSubtitleRects = {};
  next.posterSubtitleColors = {};
  next.posterSubtitleAlign = {};
  next.posterSubtitleFontScales = {};
  next.posterSubtitleRectLocked = {};
  subtitles.forEach((s, i) => {
    const id = `subtitle-${i + 1}`;
    next.posterSubtitleRects![id] = rectOf(s);
    next.posterSubtitleRectLocked![id] = true;
    if (s.color) next.posterSubtitleColors![id] = s.color;
    if (s.align) next.posterSubtitleAlign![id] = s.align;
    if (s.fontScale) next.posterSubtitleFontScales![id] = s.fontScale;
    if (s.locked) lockedKeys.push(`subtitle:${id}`);
  });

  if (bodies.length > 0) {
    next.posterBodies = bodies.map((b, i) => ({ id: `body-${i + 1}`, text: b.text ?? "" }));
    next.bodyText = bodies[0].text ?? "";
    next.posterBodyOnCanvas = true;
    next.posterBodyRects = {};
    next.posterBodyColors = {};
    next.posterBodyAligns = {};
    next.posterBodyFontScales = {};
    next.posterBodyRectLocked = {};
    bodies.forEach((b, i) => {
      const id = `body-${i + 1}`;
      next.posterBodyRects![id] = rectOf(b);
      next.posterBodyRectLocked![id] = true;
      if (b.color) next.posterBodyColors![id] = b.color;
      if (b.align) next.posterBodyAligns![id] = b.align;
      if (b.fontScale) next.posterBodyFontScales![id] = b.fontScale;
      if (b.locked) lockedKeys.push(`body:${id}`);
    });
    next.posterBodyRect = rectOf(bodies[0]);
  } else {
    next.posterBodies = [];
    next.bodyText = "";
    next.posterBodyOnCanvas = false;
  }

  if (footer) {
    next.emphasizedTitle = footer.text ?? "";
    next.posterFooterRect = rectOf(footer);
    next.posterFooterOnCanvas = true;
    next.posterFooterRectLocked = true;
    next.posterFooterUserDismissed = false;
    if (footer.color) next.posterFooterColor = footer.color;
    if (footer.align) next.posterFooterAlign = footer.align;
    if (footer.fontScale) next.posterFooterFontScale = footer.fontScale;
    if (footer.locked) lockedKeys.push("footer");
  } else {
    next.posterFooterOnCanvas = false;
    next.posterFooterUserDismissed = true;
  }

  if (image) {
    next.posterImagePlacementMode = "round-box";
    next.posterBackgroundImageRect = rectOf(image);
    next.posterRoundBoxImageRect = rectOf(image);
    next.posterImageLocked = image.locked;
    next.templateImagePlaceholder = true;
    if (image.locked) lockedKeys.push("image");
  } else {
    next.templateImagePlaceholder = false;
  }

  next.canvasShapes = els.filter((e) => e.kind === "colorBox").map(toCanvasShape);
  next.assetLayers = els
    .filter((e) => e.kind === "asset")
    .map(toAssetLayer)
    .filter((a): a is AssetLayer => a != null);
  for (const a of next.assetLayers) if (a.locked) lockedKeys.push(`asset:${a.id}`);
  next.templateLockedKeys = lockedKeys;
  return next;
}

/** 캔버스 선택 키가 템플릿에 의해 잠겼는지 — "body"는 body-1의 별칭 */
export function isTemplateLockedKey(content: DesignContent, key: string): boolean {
  const keys = content.templateLockedKeys;
  if (!keys?.length) return false;
  const canonical = key === "body" ? "body:body-1" : key;
  return keys.includes(canonical);
}
