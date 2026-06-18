import type { CSSProperties } from "react";
import type { DesignContent } from "./types";
import type { CanvasTextAlign } from "./types";
import { SUBTITLE_DEFAULT_FONT_WEIGHT, TITLE_DEFAULT_FONT_WEIGHT } from "./viCanvasConstants";

export type CanvasTextEditTarget =
  | { kind: "title" }
  | { kind: "footer" }
  | { kind: "body"; id: string }
  | { kind: "subtitle"; id: string }
  | { kind: "badge"; id: string };

/** 텍스트 옵션에서 선택 가능한 서체 — 한글 Pretendard, 영문 Geist만 허용 */
export const FONT_FAMILY_PRETENDARD = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
export const FONT_FAMILY_GEIST = 'Geist, system-ui, sans-serif';

export const CANVAS_FONT_OPTIONS: { value: string; label: string }[] = [
  { value: FONT_FAMILY_PRETENDARD, label: "Pretendard (한글)" },
  { value: FONT_FAMILY_GEIST, label: "Geist (영문)" },
];

export function resolveFontFamily(family: string | undefined): string {
  const f = family?.trim() ?? "";
  if (!f) return FONT_FAMILY_PRETENDARD;
  const lower = f.toLowerCase();
  if (f === FONT_FAMILY_GEIST || lower.includes("geist")) return FONT_FAMILY_GEIST;
  if (
    f === FONT_FAMILY_PRETENDARD ||
    lower.includes("pretendard") ||
    lower.includes("noto sans") ||
    lower.includes("apple sd gothic") ||
    lower.includes("serif") ||
    lower.includes("monospace") ||
    lower.includes("ui-monospace")
  ) {
    return FONT_FAMILY_PRETENDARD;
  }
  return FONT_FAMILY_PRETENDARD;
}

export function flexAlignFromCanvasAlign(align: CanvasTextAlign): {
  justifyContent: "flex-start" | "center" | "flex-end";
  textAlign: "left" | "center" | "right" | "justify";
} {
  if (align === "center") return { justifyContent: "center", textAlign: "center" };
  if (align === "right") return { justifyContent: "flex-end", textAlign: "right" };
  if (align === "justify") return { justifyContent: "flex-start", textAlign: "justify" };
  return { justifyContent: "flex-start", textAlign: "left" };
}

export function getSubtitleAlign(c: DesignContent, id: string): CanvasTextAlign {
  return c.posterSubtitleAlign?.[id] ?? c.posterTitleAlign ?? "left";
}

const LIGHT_GRAY = "#B0B0B0";

export function titleTextStyle(c: DesignContent, titleFontSizePx: number, titleColor: string): CSSProperties {
  const t = c.posterTitleTypography ?? {};
  return {
    fontFamily: resolveFontFamily(t.fontFamily),
    fontSize: `${titleFontSizePx}px`,
    fontWeight: t.fontWeight ?? TITLE_DEFAULT_FONT_WEIGHT,
    fontStyle: t.fontStyle ?? "normal",
    textDecoration: t.textDecoration ?? "none",
    textTransform: (t.textTransform ?? "none") as CSSProperties["textTransform"],
    letterSpacing: `${t.letterSpacingEm ?? -0.025}em`,
    lineHeight: t.lineHeight ?? 1.15,
    color: titleColor,
    wordBreak: "keep-all",
    /** keep-all만으로는 공백 없는 한글 한 줄이 박스보다 길 때 줄바꿈이 안 되어 잘릴 수 있음 */
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    margin: 0,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  };
}

export function subtitleTextStyle(
  c: DesignContent,
  id: string,
  subtitleFontSizePx: number,
  color: string
): CSSProperties {
  const t = c.posterSubtitleTypography?.[id] ?? {};
  return {
    fontFamily: resolveFontFamily(t.fontFamily),
    fontSize: `${subtitleFontSizePx}px`,
    fontWeight: t.fontWeight ?? SUBTITLE_DEFAULT_FONT_WEIGHT,
    fontStyle: t.fontStyle ?? "normal",
    textDecoration: t.textDecoration ?? "none",
    textTransform: (t.textTransform ?? "none") as CSSProperties["textTransform"],
    letterSpacing: `${t.letterSpacingEm ?? -0.02}em`,
    lineHeight: t.lineHeight ?? 1.35,
    color,
    wordBreak: "keep-all",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    margin: 0,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  };
}

export function bodyTextStyle(c: DesignContent, id: string, bodyFontSizePx: number, bodyColor: string): CSSProperties {
  const t = c.posterBodyTypography?.[id] ?? {};
  return {
    fontFamily: resolveFontFamily(t.fontFamily),
    fontSize: `${bodyFontSizePx}px`,
    fontWeight: t.fontWeight ?? 400,
    fontStyle: t.fontStyle ?? "normal",
    textDecoration: t.textDecoration ?? "none",
    textTransform: (t.textTransform ?? "none") as CSSProperties["textTransform"],
    letterSpacing: `${t.letterSpacingEm ?? 0}em`,
    lineHeight: t.lineHeight ?? 1.75,
    color: bodyColor,
    whiteSpace: "pre-wrap",
    wordBreak: "keep-all",
    overflowWrap: "anywhere",
    margin: 0,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  };
}

export function footerTextStyle(c: DesignContent, disclaimerSizePx: number): CSSProperties {
  const t = c.posterFooterTypography ?? {};
  const color = c.posterFooterColor ?? LIGHT_GRAY;
  return {
    fontFamily: resolveFontFamily(t.fontFamily),
    fontSize: `${disclaimerSizePx}px`,
    fontWeight: t.fontWeight ?? 400,
    fontStyle: t.fontStyle ?? "normal",
    textDecoration: t.textDecoration ?? "none",
    textTransform: (t.textTransform ?? "none") as CSSProperties["textTransform"],
    letterSpacing: `${t.letterSpacingEm ?? 0}em`,
    lineHeight: t.lineHeight ?? 1.6,
    color,
    whiteSpace: "pre-wrap",
  };
}
