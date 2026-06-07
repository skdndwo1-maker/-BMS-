import type { AssetLayer, DesignContent } from "@/design/types";
import { FONT_FAMILY_PRETENDARD } from "@/design/canvasTextTypography";
import { BRAND } from "@/constants/brandDesignSystem";
import { SAFETY_WARNING_PICTOGRAM_SRC } from "@/design/assetPresets";

/** 오프라인 「안전&주의」— 수리중_기본형 템플릿 ID */
export const SAFETY_CAUTION_TEMPLATE_ID = "safety-caution-maintenance";

/** AXIS 브랜드 페이지·캔버스 라이트 그레이 (#F5F3F0) */
export const SAFETY_CAUTION_BG = BRAND.bg;

/** 안전&주의 템플릿 BI/CI/SLOGAN 고정 위치 (상단 중앙) */
export const SAFETY_CAUTION_LOGO_POSITION = "top-center" as const;

/** 첨부 레퍼런스 — 타이틀·본문 앵커 (autofit 후 캔버스 중심부 배치) */
export const SAFETY_CAUTION_TITLE_RECT = { x: 0.1, y: 0.34, width: 0.8, height: 0.14 };
export const SAFETY_CAUTION_BODY_RECT = { x: 0.1, y: 0.48, width: 0.8, height: 0.22 };
/** 하단 중앙 주의 픽토 (이전 대비 +20%) */
export const SAFETY_CAUTION_WARNING_RECT = { x: 0.4493, y: 0.7746, width: 0.1014, height: 0.1404 };

/** 타이틀·본문 글자 크기(%) — 템플릿 고정값 */
export const SAFETY_CAUTION_TITLE_FONT_SCALE = 140;
export const SAFETY_CAUTION_BODY_FONT_SCALE = 80;

/** 타이틀·본문 묶음 — 세로 간격 / 캔버스 세로 중심(0.47) */
const TEXT_BUNDLE_GAP_Y = 0.014;
const TEXT_BUNDLE_CENTER_Y = 0.47;

/** BI·CI·SLOGAN 동일 표시 높이 (캔버스 높이 대비) */
export const SAFETY_CAUTION_LOGO_HEIGHT_RATIO = 0.055;

/** 이전 프리셋 위치 — 마이그레이션 시 새 기본값으로 교체 */
const PRESET_TITLE_RECTS: Array<{ x: number; y: number; width: number; height: number }> = [
  { x: 0.1, y: 0.487, width: 0.8, height: 0.14 },
  { x: 0.1, y: 0.32, width: 0.8, height: 0.14 },
  { x: 0.06, y: 0.17, width: 0.88, height: 0.14 },
  { x: 0.06, y: 0.3, width: 0.88, height: 0.16 },
  { x: 0.06, y: 0.14, width: 0.88, height: 0.12 },
  { x: 0.06, y: 0.22, width: 0.58, height: 0.2 },
];
const PRESET_BODY_RECTS: Array<{ x: number; y: number; width: number; height: number }> = [
  { x: 0.1, y: 0.627, width: 0.8, height: 0.22 },
  { x: 0.1, y: 0.46, width: 0.8, height: 0.22 },
  { x: 0.06, y: 0.38, width: 0.88, height: 0.22 },
  { x: 0.1, y: 0.48, width: 0.8, height: 0.2 },
  { x: 0.08, y: 0.28, width: 0.84, height: 0.16 },
  { x: 0.07, y: 0.52, width: 0.5, height: 0.3 },
];
const PRESET_WARNING_RECTS: Array<{ x: number; y: number; width: number; height: number }> = [
  { x: 0.45775, y: 0.798, width: 0.0845, height: 0.117 },
  { x: 0.855, y: 0.68, width: 0.09, height: 0.22 },
  { x: 0.46, y: 0.76, width: 0.08, height: 0.14 },
  { x: 0.46, y: 0.76, width: 0.065, height: 0.095 },
  { x: 0.4675, y: 0.815, width: 0.065, height: 0.095 },
  { x: 0.4675, y: 0.825, width: 0.065, height: 0.09 },
];

export function isSafetyCautionTemplate(templateId: string | undefined | null): boolean {
  return (templateId ?? "").trim() === SAFETY_CAUTION_TEMPLATE_ID;
}

const BODY_TEXT =
  "불편을 드려 죄송합니다.\n빠른 시일 내에 조치하겠습니다.\n양해 부탁드립니다.";

/** 이전 기본 본문 — 드래프트 마이그레이션 시 새 문구로 교체 */
const LEGACY_BODY_TEXTS = new Set([
  "불편을 드려 죄송합니다.\n빠른 시일 내에 제공될 수 있도록 조치 중입니다.\n양해 부탁드립니다.",
  "불편을 드려 죄송합니다.\n빠른 시일내에 제공될 수 있도록 조치중입니다.\n양해 부탁드립니다.",
]);

function isLegacySafetyBodyText(text: string | undefined): boolean {
  const t = text?.trim();
  return Boolean(t && LEGACY_BODY_TEXTS.has(t));
}

function rectsNear(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  eps = 0.025,
): boolean {
  return (
    Math.abs(a.x - b.x) <= eps &&
    Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.width - b.width) <= eps &&
    Math.abs(a.height - b.height) <= eps
  );
}

function createWarningAssetLayer(): AssetLayer {
  return {
    id: "asset-safety-warning",
    type: "pictogram",
    src: SAFETY_WARNING_PICTOGRAM_SRC,
    name: "주의",
    libraryId: "preset:주의",
    x: SAFETY_CAUTION_WARNING_RECT.x,
    y: SAFETY_CAUTION_WARNING_RECT.y,
    width: SAFETY_CAUTION_WARNING_RECT.width,
    height: SAFETY_CAUTION_WARNING_RECT.height,
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
  };
}

function centerRectX(rect: { x: number; y: number; width: number; height: number }) {
  const nx = 0.5 - rect.width / 2;
  return Math.max(0, Math.min(1 - rect.width, nx));
}

/** 타이틀+본문을 한 묶음으로 캔버스 수평·세로 중심부에 배치 */
export function layoutSafetyCautionTextBundle(content: DesignContent): Partial<DesignContent> | null {
  const tr = content.posterTitleRect;
  const br = content.posterBodyRects?.["body-1"] ?? content.posterBodyRect;
  if (!tr || !br) return null;

  const title = { ...tr, x: centerRectX(tr) };
  const bodyBase = { ...br, x: centerRectX(br), y: title.y + title.height + TEXT_BUNDLE_GAP_Y };
  const bundleTop = title.y;
  const bundleBottom = bodyBase.y + bodyBase.height;
  const bundleCenter = (bundleTop + bundleBottom) / 2;
  const shiftY = TEXT_BUNDLE_CENTER_Y - bundleCenter;
  const nextTitle = { ...title, y: title.y + shiftY };
  const nextBody = { ...bodyBase, y: bodyBase.y + shiftY };

  if (rectsNear(nextTitle, tr, 0.004) && rectsNear(nextBody, br, 0.004)) {
    if (
      content.posterTitleFontScale === SAFETY_CAUTION_TITLE_FONT_SCALE &&
      content.posterBodyFontScale === SAFETY_CAUTION_BODY_FONT_SCALE
    ) {
      return null;
    }
  }

  return {
    posterTitleRect: nextTitle,
    posterBodyRect: nextBody,
    posterBodyRects: { ...(content.posterBodyRects ?? {}), "body-1": nextBody },
    posterTitleFontScale: SAFETY_CAUTION_TITLE_FONT_SCALE,
    posterBodyFontScale: SAFETY_CAUTION_BODY_FONT_SCALE,
  };
}

/** LG U+ 「수리 중」 A4 가로(297×210mm) — 중앙 정렬 안내 서식 */
export function createSafetyCautionMaintenanceContent(): DesignContent {
  return {
    title: "수리 중입니다.",
    subtitle: "",
    bodyText: BODY_TEXT,
    style: "basic",
    emphasizedTitle: "",
    posterCategory: "safety-caution",
    backgroundColor: SAFETY_CAUTION_BG,
    titleColor: "#1A1A1A",
    bodyColor: "#1A1A1A",
    titleFont: FONT_FAMILY_PRETENDARD,
    bodyFont: FONT_FAMILY_PRETENDARD,
    logoOption: "BI",
    logoPosition: SAFETY_CAUTION_LOGO_POSITION,
    posterTitleAlign: "center",
    posterBodyAlign: "center",
    posterTitleRect: { ...SAFETY_CAUTION_TITLE_RECT },
    posterBodyRect: { ...SAFETY_CAUTION_BODY_RECT },
    posterTitleFontScale: SAFETY_CAUTION_TITLE_FONT_SCALE,
    posterBodyFontScale: SAFETY_CAUTION_BODY_FONT_SCALE,
    posterTitleTypography: {
      fontFamily: FONT_FAMILY_PRETENDARD,
      fontWeight: 800,
      lineHeight: 1.12,
      letterSpacingEm: -0.02,
    },
    posterBodyTypography: {
      "body-1": {
        fontFamily: FONT_FAMILY_PRETENDARD,
        fontWeight: 400,
        lineHeight: 1.45,
      },
    },
    posterBodies: [{ id: "body-1", text: BODY_TEXT }],
    posterTitleOnCanvas: true,
    posterBodyOnCanvas: true,
    posterFooterOnCanvas: false,
    posterTitleRectLocked: false,
    posterBodyRectLocked: { "body-1": false },
    posterBodyRects: { "body-1": { ...SAFETY_CAUTION_BODY_RECT } },
    assetLayers: [createWarningAssetLayer()],
  };
}

/** 구버전(좌측 정렬·잠금·옛 좌표) 레이아웃 여부 */
function isLegacySafetyLayout(content: DesignContent): boolean {
  if (content.posterTitleAlign !== "center" || content.posterBodyAlign !== "center") return true;
  if (content.posterTitleRectLocked || content.posterBodyRectLocked?.["body-1"]) return true;
  const tr = content.posterTitleRect;
  if (tr && PRESET_TITLE_RECTS.some((legacy) => rectsNear(tr, legacy))) return true;
  const br = content.posterBodyRect;
  if (br && PRESET_BODY_RECTS.some((legacy) => rectsNear(br, legacy))) return true;
  return false;
}

/** 세션 드래프트·구버전 데이터가 서식을 덮어쓴 경우 재적용 여부 */
export function shouldApplySafetyCautionPreset(content: DesignContent): boolean {
  if (content.posterCategory !== "safety-caution") return true;
  if (content.backgroundColor !== SAFETY_CAUTION_BG) return true;
  if (content.logoPosition !== SAFETY_CAUTION_LOGO_POSITION) return true;
  if (!content.logoOption) return true;
  if (!content.posterTitleOnCanvas || !content.posterBodyOnCanvas) return true;
  if (content.titleFont !== FONT_FAMILY_PRETENDARD || content.bodyFont !== FONT_FAMILY_PRETENDARD) return true;
  if (content.posterTitleFontScale !== SAFETY_CAUTION_TITLE_FONT_SCALE) return true;
  if (content.posterBodyFontScale !== SAFETY_CAUTION_BODY_FONT_SCALE) return true;
  if (isLegacySafetyBodyText(content.bodyText)) return true;
  if ((content.posterBodies ?? []).some((b) => isLegacySafetyBodyText(b.text))) return true;
  const hasWarning = (content.assetLayers ?? []).some(
    (a) => a.id === "asset-safety-warning" || a.libraryId === "preset:주의",
  );
  if (!hasWarning) return true;
  if (!content.posterTitleRect || !content.posterBodyRect) return true;
  if (isLegacySafetyLayout(content)) return true;
  const warning = (content.assetLayers ?? []).find(
    (a) => a.id === "asset-safety-warning" || a.libraryId === "preset:주의",
  );
  if (
    warning &&
    PRESET_WARNING_RECTS.some((legacy) =>
      rectsNear(
        { x: warning.x, y: warning.y, width: warning.width, height: warning.height },
        legacy,
      ),
    )
  ) {
    return true;
  }
  return false;
}

function preserveSafetyWarningAsset(existing: DesignContent): AssetLayer[] {
  const defaultLayer = createWarningAssetLayer();
  const prev = (existing.assetLayers ?? []).find(
    (a) => a.id === "asset-safety-warning" || a.libraryId === "preset:주의",
  );
  if (!prev) return [defaultLayer];

  const atPresetDefault = PRESET_WARNING_RECTS.some((legacy) =>
    rectsNear({ x: prev.x, y: prev.y, width: prev.width, height: prev.height }, legacy),
  );
  const warning: AssetLayer = atPresetDefault
    ? defaultLayer
    : { ...defaultLayer, ...prev, locked: false };

  const rest = (existing.assetLayers ?? []).filter(
    (a) => a.id !== "asset-safety-warning" && a.libraryId !== "preset:주의",
  );
  return [...rest, warning];
}

/** 구버전 잠금(locked) 상태의 주의 픽토그램을 이동 가능하게 해제 */
export function unlockSafetyWarningAsset(content: DesignContent): DesignContent {
  const layers = content.assetLayers ?? [];
  const idx = layers.findIndex(
    (a) => a.id === "asset-safety-warning" || a.libraryId === "preset:주의",
  );
  if (idx < 0 || !layers[idx].locked) return content;
  const next = [...layers];
  next[idx] = { ...next[idx], locked: false };
  return { ...content, assetLayers: next };
}

/** 사용자가 편집한 타이틀·본문은 유지하고 레이아웃·에셋·서체는 템플릿 기본값으로 맞춤 */
export function applySafetyCautionMaintenanceContent(existing: DesignContent): DesignContent {
  const base = createSafetyCautionMaintenanceContent();
  const assetLayers = preserveSafetyWarningAsset(existing);
  const hasUserText = Boolean(existing.title?.trim() || existing.bodyText?.trim());
  if (!hasUserText) return { ...base, assetLayers };

  const logoOption =
    existing.logoOption === "CI" || existing.logoOption === "BI" || existing.logoOption === "SLOGAN"
      ? existing.logoOption
      : base.logoOption;

  const useDefaultBody = !existing.bodyText?.trim() || isLegacySafetyBodyText(existing.bodyText);
  const bodyText = useDefaultBody ? base.bodyText : existing.bodyText;
  const posterBodies =
    !existing.posterBodies?.length ||
    existing.posterBodies.every((b) => isLegacySafetyBodyText(b.text))
      ? base.posterBodies
      : existing.posterBodies.map((b) =>
          isLegacySafetyBodyText(b.text) ? { ...b, text: base.bodyText } : b,
        );

  return {
    ...base,
    title: existing.title?.trim() ? existing.title : base.title,
    bodyText,
    posterBodies,
    logoOption,
    assetLayers,
    posterTitleFontScale: SAFETY_CAUTION_TITLE_FONT_SCALE,
    posterBodyFontScale: SAFETY_CAUTION_BODY_FONT_SCALE,
  };
}

export const SAFETY_CAUTION_POSTER_PRESET: Partial<DesignContent> = {
  posterCategory: "safety-caution",
  backgroundColor: SAFETY_CAUTION_BG,
  titleColor: "#1A1A1A",
  bodyColor: "#1A1A1A",
  title: "수리 중입니다.",
  subtitle: "",
  bodyText: BODY_TEXT,
  emphasizedTitle: "",
  posterBodies: [{ id: "body-1", text: BODY_TEXT }],
  posterTitleAlign: "center",
  posterBodyAlign: "center",
  logoOption: "BI",
  logoPosition: SAFETY_CAUTION_LOGO_POSITION,
  titleFont: FONT_FAMILY_PRETENDARD,
  bodyFont: FONT_FAMILY_PRETENDARD,
  posterTitleTypography: {
    fontFamily: FONT_FAMILY_PRETENDARD,
    fontWeight: 800,
  },
  posterBodyTypography: {
    "body-1": {
      fontFamily: FONT_FAMILY_PRETENDARD,
      fontWeight: 400,
      lineHeight: 1.45,
    },
  },
};
