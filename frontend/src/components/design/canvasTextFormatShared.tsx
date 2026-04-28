import type { DesignContent } from "@/design/types";
import type { CanvasTextAlign, PosterElementTypography, PosterTextCase } from "@/design/types";
import {
  CANVAS_FONT_OPTIONS,
  FONT_FAMILY_GEIST,
  FONT_FAMILY_PRETENDARD,
  resolveFontFamily,
  type CanvasTextEditTarget,
} from "@/design/canvasTextTypography";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  CaseSensitive,
  CaseUpper,
  CaseLower,
  WholeWord,
  Minus,
  Plus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { VI_COLORS } from "@/design/viCanvasConstants";

export const SCALE_MIN = 25;
export const SCALE_MAX = 300;
export const SCALE_PRESETS = [50, 60, 75, 80, 90, 100, 110, 125, 150, 200, 250] as const;
const LS_MIN = -0.08;
const LS_MAX = 0.35;
const LH_MIN = 1;
const LH_MAX = 2.6;

/** 문자 색 빠른 선택 + 커스텀 컬러 */
export const TEXT_COLOR_PRESETS: { hex: string; label: string }[] = [
  { hex: "#1A1A1A", label: "블랙" },
  { hex: VI_COLORS.brandMagenta, label: "마젠타" },
  { hex: "#404040", label: "다크그레이" },
  { hex: "#B0B0B0", label: "라이트그레이" },
  { hex: "#FFFFFF", label: "화이트" },
];

export function patchTypo(
  base: PosterElementTypography | undefined,
  patch: Partial<PosterElementTypography>
): PosterElementTypography {
  return { ...base, ...patch };
}

type SharedProps = {
  target: CanvasTextEditTarget;
  content: DesignContent;
  onDraft: (next: DesignContent) => void;
  selectionRenderTick?: number;
  getSelection?: () => [number, number] | null;
  onTogglePartialStyle?: (which: "bold" | "italic" | "underline") => void;
  /** 캔버스 인라인 편집 중 텍스트 일부만 색상 적용 */
  onApplyPartialColor?: (hex: string) => void;
};

export function CanvasTextFormatControls({
  target,
  content,
  onDraft,
  selectionRenderTick = 0,
  getSelection,
  onTogglePartialStyle,
  onApplyPartialColor,
}: SharedProps) {
  void selectionRenderTick;
  const kind = target.kind;

  const typoTitle = content.posterTitleTypography;
  const typoFooter = content.posterFooterTypography;
  const typoBody = kind === "body" ? content.posterBodyTypography?.[target.id] : undefined;
  const typoSub = kind === "subtitle" ? content.posterSubtitleTypography?.[target.id] : undefined;

  const fontValue =
    kind === "title"
      ? typoTitle?.fontFamily ?? ""
      : kind === "footer"
        ? typoFooter?.fontFamily ?? ""
        : kind === "body"
          ? typoBody?.fontFamily ?? ""
          : typoSub?.fontFamily ?? "";

  const scale =
    kind === "title"
      ? content.posterTitleFontScale ?? 100
      : kind === "footer"
        ? content.posterFooterFontScale ?? 100
        : kind === "body"
          ? content.posterBodyFontScale ?? 100
          : content.posterSubtitleFontScale ?? 100;

  const align: CanvasTextAlign =
    kind === "title"
      ? content.posterTitleAlign ?? "left"
      : kind === "footer"
        ? content.posterFooterAlign ?? "left"
        : kind === "body"
          ? content.posterBodyAlign ?? "left"
          : content.posterSubtitleAlign?.[target.id] ?? content.posterTitleAlign ?? "left";

  const letterEm =
    kind === "title"
      ? typoTitle?.letterSpacingEm ?? -0.025
      : kind === "footer"
        ? typoFooter?.letterSpacingEm ?? 0
        : kind === "body"
          ? typoBody?.letterSpacingEm ?? 0
          : typoSub?.letterSpacingEm ?? -0.02;

  const lineH =
    kind === "title"
      ? typoTitle?.lineHeight ?? 1.15
      : kind === "footer"
        ? typoFooter?.lineHeight ?? 1.6
        : kind === "body"
          ? typoBody?.lineHeight ?? 1.75
          : typoSub?.lineHeight ?? 1.35;

  const fw =
    kind === "title"
      ? typoTitle?.fontWeight ?? 800
      : kind === "footer"
        ? typoFooter?.fontWeight ?? 400
        : kind === "body"
          ? typoBody?.fontWeight ?? 400
          : typoSub?.fontWeight ?? 680;

  const fs =
    kind === "title"
      ? typoTitle?.fontStyle
      : kind === "footer"
        ? typoFooter?.fontStyle
        : kind === "body"
          ? typoBody?.fontStyle
          : typoSub?.fontStyle;
  const td =
    kind === "title"
      ? typoTitle?.textDecoration
      : kind === "footer"
        ? typoFooter?.textDecoration
        : kind === "body"
          ? typoBody?.textDecoration
          : typoSub?.textDecoration;
  const tt =
    kind === "title"
      ? typoTitle?.textTransform
      : kind === "footer"
        ? typoFooter?.textTransform
        : kind === "body"
          ? typoBody?.textTransform
          : typoSub?.textTransform;

  const color =
    kind === "title"
      ? content.titleColor ?? "#1A1A1A"
      : kind === "footer"
        ? content.posterFooterColor ?? "#B0B0B0"
        : kind === "body"
          ? content.bodyColor ?? "#5A5A5A"
          : content.subtitleColor ?? content.titleColor ?? "#1A1A1A";

  const boldThreshold = kind === "body" || kind === "footer" ? 600 : 650;

  const setScale = (n: number) => {
    const v = Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)));
    if (kind === "title") onDraft({ ...content, posterTitleFontScale: v });
    else if (kind === "footer") onDraft({ ...content, posterFooterFontScale: v });
    else if (kind === "body") onDraft({ ...content, posterBodyFontScale: v });
    else onDraft({ ...content, posterSubtitleFontScale: v });
  };

  const setAlign = (a: CanvasTextAlign) => {
    if (kind === "title") onDraft({ ...content, posterTitleAlign: a });
    else if (kind === "footer") onDraft({ ...content, posterFooterAlign: a });
    else if (kind === "body") onDraft({ ...content, posterBodyAlign: a });
    else
      onDraft({
        ...content,
        posterSubtitleAlign: { ...(content.posterSubtitleAlign ?? {}), [target.id]: a },
      });
  };

  /**
   * 글자색 적용
   * - 캔버스 인라인 편집 중 텍스트 일부를 선택했다면 → 해당 구간에만 색상 적용(부분)
   * - 그 외(요소만 선택된 상태) → 전체 색상 적용
   */
  const setColor = (hex: string) => {
    const sel = getSelection?.();
    if (sel && sel[0] !== sel[1] && onApplyPartialColor) {
      onApplyPartialColor(hex);
      return;
    }
    if (kind === "title") onDraft({ ...content, titleColor: hex });
    else if (kind === "footer") onDraft({ ...content, posterFooterColor: hex });
    else if (kind === "body") onDraft({ ...content, bodyColor: hex });
    else onDraft({ ...content, subtitleColor: hex });
  };

  const applyTypo = (patch: Partial<PosterElementTypography>) => {
    if (kind === "title")
      onDraft({ ...content, posterTitleTypography: patchTypo(content.posterTitleTypography, patch) });
    else if (kind === "footer")
      onDraft({ ...content, posterFooterTypography: patchTypo(content.posterFooterTypography, patch) });
    else if (kind === "body")
      onDraft({
        ...content,
        posterBodyTypography: {
          ...(content.posterBodyTypography ?? {}),
          [target.id]: patchTypo(content.posterBodyTypography?.[target.id], patch),
        },
      });
    else
      onDraft({
        ...content,
        posterSubtitleTypography: {
          ...(content.posterSubtitleTypography ?? {}),
          [target.id]: patchTypo(content.posterSubtitleTypography?.[target.id], patch),
        },
      });
  };

  const partialRange = getSelection?.();
  const hasPartialRange = Boolean(
    partialRange && partialRange[0] !== partialRange[1] && onTogglePartialStyle
  );

  /**
   * 굵기·기울임·밑줄 버튼:
   * - 인라인 편집 중 글자 범위가 선택돼 있으면 → 해당 구간만 토글(부분 스타일)
   * - 그 외(요소만 선택돼 있는 상태)에는 → 요소 전체 타이포그래피 토글
   *   · 굵게: fontWeight 600~800 (off=400)
   *   · 기울임: fontStyle italic / normal
   *   · 밑줄: textDecoration underline / none
   */
  const onWeightForKind =
    kind === "title" ? 800 : kind === "subtitle" ? 700 : 600;

  const tryPartial = (which: "bold" | "italic" | "underline") => {
    const sel = getSelection?.();
    if (sel && sel[0] !== sel[1] && onTogglePartialStyle) {
      onTogglePartialStyle(which);
      return;
    }
    if (which === "bold") {
      const isBold = fw >= boldThreshold;
      applyTypo({ fontWeight: isBold ? 400 : onWeightForKind });
    } else if (which === "italic") {
      applyTypo({ fontStyle: fs === "italic" ? "normal" : "italic" });
    } else {
      applyTypo({ textDecoration: td === "underline" ? "none" : "underline" });
    }
  };

  const setFont = (fam: string) => {
    applyTypo({ fontFamily: fam.trim() ? fam : undefined });
  };

  const fontSelectValue =
    resolveFontFamily(fontValue) === FONT_FAMILY_GEIST ? FONT_FAMILY_GEIST : FONT_FAMILY_PRETENDARD;

  const setCase = (c: PosterTextCase) => applyTypo({ textTransform: c });

  const iconBtn =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 shadow-sm hover:border-[#F43182] hover:text-[#F43182] disabled:opacity-40";
  const iconActive = "border-[#F43182] bg-[#F43182]/10 text-[#F43182]";

  const safeColor = color.length === 7 ? color : "#1A1A1A";

  return (
    <>
      <select
        className="h-8 w-full max-w-full rounded-md border border-gray-200 bg-white px-1 text-[11px] text-gray-800"
        value={fontSelectValue}
        onChange={(e) => setFont(e.target.value)}
        title="글꼴 (Pretendard · Geist만 선택)"
      >
        {CANVAS_FONT_OPTIONS.map((o) => (
          <option key={o.label + o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap items-center gap-0.5">
        <button type="button" className={iconBtn} title="크기 감소" onClick={() => setScale(scale - 5)}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <Input
          className="h-8 w-12 border-gray-200 px-1 text-center text-[11px] tabular-nums"
          type="number"
          min={SCALE_MIN}
          max={SCALE_MAX}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value) || SCALE_MIN)}
        />
        <button type="button" className={iconBtn} title="크기 증가" onClick={() => setScale(scale + 5)}>
          <Plus className="h-3.5 w-3.5" />
        </button>
        <span className="text-[10px] text-gray-400">%</span>
        <select
          className="h-8 max-w-[88px] rounded-md border border-gray-200 bg-white px-1 text-[10px] text-gray-800"
          aria-label="크기 프리셋"
          value={SCALE_PRESETS.includes(scale as (typeof SCALE_PRESETS)[number]) ? scale : ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v)) return;
            setScale(v);
          }}
        >
          <option value="">프리셋</option>
          {SCALE_PRESETS.map((p) => (
            <option key={p} value={p}>
              {p}%
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5 w-full">
        <span className="text-[9px] text-gray-500 w-7 shrink-0">작게</span>
        <input
          type="range"
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={1}
          value={Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale))}
          onChange={(e) => setScale(Number(e.target.value))}
          className="flex-1 min-w-0 h-2 accent-[#F43182] cursor-pointer"
          aria-label="글자 크기 슬라이더"
        />
        <span className="text-[9px] text-gray-500 w-7 shrink-0 text-right">크게</span>
      </div>

      <div className="flex flex-wrap gap-0.5">
        <button
          type="button"
          className={`${iconBtn} ${fw >= boldThreshold ? iconActive : ""}`}
          title={hasPartialRange ? "선택 구간 굵게" : "전체 굵게 토글"}
          onMouseDown={(e) => {
            e.preventDefault();
            tryPartial("bold");
          }}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={`${iconBtn} ${fs === "italic" ? iconActive : ""}`}
          title={hasPartialRange ? "선택 구간 기울임" : "전체 기울임 토글"}
          onMouseDown={(e) => {
            e.preventDefault();
            tryPartial("italic");
          }}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={`${iconBtn} ${td === "underline" ? iconActive : ""}`}
          title={hasPartialRange ? "선택 구간 밑줄" : "전체 밑줄 토글"}
          onMouseDown={(e) => {
            e.preventDefault();
            tryPartial("underline");
          }}
        >
          <Underline className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] font-medium text-gray-600">글자 색</span>
        <div className="flex flex-wrap gap-1">
          {TEXT_COLOR_PRESETS.map((p) => (
            <button
              key={p.hex}
              type="button"
              title={p.label}
              onClick={() => setColor(p.hex)}
              className={`h-7 w-7 shrink-0 rounded-md border-2 transition-all ${
                safeColor.toUpperCase() === p.hex.toUpperCase()
                  ? "border-[#F43182] ring-1 ring-[#F43182]/30"
                  : "border-gray-200 hover:border-gray-400"
              }`}
              style={{
                background: p.hex,
                boxShadow: p.hex === "#FFFFFF" ? "inset 0 0 0 1px #E5E5E5" : undefined,
              }}
            />
          ))}
        </div>
        <label className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">직접 지정</span>
          <input
            type="color"
            value={safeColor}
            className="h-8 w-10 cursor-pointer rounded border border-gray-200 p-0"
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-0.5">
        {(["left", "center", "right", "justify"] as const).map((a) => (
          <button
            key={a}
            type="button"
            className={`${iconBtn} ${align === a ? iconActive : ""}`}
            title={a === "left" ? "왼쪽" : a === "center" ? "가운데" : a === "right" ? "오른쪽" : "양쪽"}
            onClick={() => setAlign(a)}
          >
            {a === "left" ? <AlignLeft className="h-3.5 w-3.5" /> : null}
            {a === "center" ? <AlignCenter className="h-3.5 w-3.5" /> : null}
            {a === "right" ? <AlignRight className="h-3.5 w-3.5" /> : null}
            {a === "justify" ? <AlignJustify className="h-3.5 w-3.5" /> : null}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-0.5">
        <span className="text-[9px] text-gray-400">자간</span>
        <button
          type="button"
          className={iconBtn}
          title="자간 줄임"
          onClick={() => applyTypo({ letterSpacingEm: Math.max(LS_MIN, letterEm - 0.005) })}
        >
          <Minus className="h-3 w-3" />
        </button>
        <Input
          className="h-8 w-14 border-gray-200 px-1 text-[10px] tabular-nums"
          type="number"
          step={0.005}
          value={Number(letterEm.toFixed(4))}
          onChange={(e) =>
            applyTypo({
              letterSpacingEm: Math.min(LS_MAX, Math.max(LS_MIN, Number(e.target.value) || 0)),
            })
          }
        />
        <button
          type="button"
          className={iconBtn}
          title="자간 늘림"
          onClick={() => applyTypo({ letterSpacingEm: Math.min(LS_MAX, letterEm + 0.005) })}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-0.5">
        <span className="text-[9px] text-gray-400">행간</span>
        <button
          type="button"
          className={iconBtn}
          title="행간 줄임"
          onClick={() => applyTypo({ lineHeight: Math.max(LH_MIN, Math.round((lineH - 0.05) * 100) / 100) })}
        >
          <Minus className="h-3 w-3" />
        </button>
        <Input
          className="h-8 w-12 border-gray-200 px-1 text-[10px] tabular-nums"
          type="number"
          step={0.05}
          min={LH_MIN}
          max={LH_MAX}
          value={lineH}
          onChange={(e) =>
            applyTypo({
              lineHeight: Math.min(LH_MAX, Math.max(LH_MIN, Number(e.target.value) || LH_MIN)),
            })
          }
        />
        <button
          type="button"
          className={iconBtn}
          title="행간 늘림"
          onClick={() => applyTypo({ lineHeight: Math.min(LH_MAX, Math.round((lineH + 0.05) * 100) / 100) })}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <div className="flex flex-wrap gap-0.5">
        {(
          [
            ["none", CaseSensitive, "기본"],
            ["uppercase", CaseUpper, "대문자"],
            ["lowercase", CaseLower, "소문자"],
            ["capitalize", WholeWord, "첫글자"],
          ] as const
        ).map(([c, Icon, hint]) => (
          <button
            key={c}
            type="button"
            className={`${iconBtn} ${(tt ?? "none") === c ? iconActive : ""}`}
            title={hint}
            onClick={() => setCase(c)}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </>
  );
}
