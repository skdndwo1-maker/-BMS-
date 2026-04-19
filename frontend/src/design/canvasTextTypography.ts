import type { CSSProperties } from "react";
import type { DesignContent } from "./types";
import type { CanvasTextAlign } from "./types";
import { VI_FONT_STACK } from "./viCanvasConstants";

export type CanvasTextEditTarget =
  | { kind: "title" }
  | { kind: "footer" }
  | { kind: "body"; id: string }
  | { kind: "subtitle"; id: string };

export const CANVAS_FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "VI 기본" },
  { value: '"Pretendard Variable", Pretendard, sans-serif', label: "Pretendard" },
  { value: '"Noto Sans KR", sans-serif', label: "Noto Sans KR" },
  { value: 'Georgia, "Times New Roman", serif', label: "Serif" },
  { value: "ui-monospace, monospace", label: "Monospace" },
];

export function resolveFontFamily(family: string | undefined): string {
  if (!family?.trim()) return VI_FONT_STACK;
  return family;
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
    fontWeight: t.fontWeight ?? 800,
    fontStyle: t.fontStyle ?? "normal",
    textDecoration: t.textDecoration ?? "none",
    textTransform: (t.textTransform ?? "none") as CSSProperties["textTransform"],
    letterSpacing: `${t.letterSpacingEm ?? -0.025}em`,
    lineHeight: t.lineHeight ?? 1.15,
    color: titleColor,
    wordBreak: "keep-all",
    margin: 0,
    width: "100%",
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
    fontWeight: t.fontWeight ?? 680,
    fontStyle: t.fontStyle ?? "normal",
    textDecoration: t.textDecoration ?? "none",
    textTransform: (t.textTransform ?? "none") as CSSProperties["textTransform"],
    letterSpacing: `${t.letterSpacingEm ?? -0.02}em`,
    lineHeight: t.lineHeight ?? 1.35,
    color,
    wordBreak: "keep-all",
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
