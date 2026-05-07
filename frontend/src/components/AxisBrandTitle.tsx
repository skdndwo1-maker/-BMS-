import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { APP_DISPLAY_NAME } from "@/constants/appBranding";

const wordmark = "var(--font-family-base)";

type AxisBrandTitleProps = {
  /** Option / TemplateGallery와 동일: AXIS(대문자·자간) + 부제 (예: Brand Contents Manager, 브랜드 디자인) */
  subtitle: string;
  className?: string;
  /** 툴바 등 좁은 영역: 글자 크기만 약간 축소(표기 방식은 동일) */
  compact?: boolean;
};

const titleBtnReset =
  "m-0 cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B7280]/35 focus-visible:ring-offset-2 rounded-sm";

/**
 * 이미지 로고 없이, 옵션·그래픽 제작 페이지와 동일한 AXIS 텍스트 표기.
 * 메인 워드마크 클릭 시 /options 옵션 선택 화면으로 이동.
 */
export function AxisBrandTitle({ subtitle, className = "", compact = false }: AxisBrandTitleProps) {
  const navigate = useNavigate();
  const goOptions = useCallback(() => {
    navigate("/options", { replace: false });
  }, [navigate]);

  /* A–X: gapTight; X–I: gapMid; I–S: gapTight × 1.5 */
  const gapMid = compact ? "0.06em" : "0.07em";
  const gapTight = compact ? "0.03em" : "0.035em";
  const gapIs = compact ? "0.045em" : "0.0525em";
  const lm = APP_DISPLAY_NAME.toUpperCase();
  const letters = lm.split("");
  const axisTightWordmark = lm === "AXIS" && letters.length === 4;

  const titleCls = compact
    ? "inline-flex whitespace-nowrap text-[15px] font-semibold uppercase text-[#6B7280] leading-tight"
    : "inline-flex whitespace-nowrap text-[22px] font-semibold uppercase text-[#6B7280] leading-tight";
  const titleClsUniform = compact
    ? "whitespace-nowrap text-[15px] font-semibold uppercase tracking-[0.12em] text-[#6B7280] leading-tight"
    : "whitespace-nowrap text-[22px] font-semibold uppercase tracking-[0.14em] text-[#6B7280] leading-tight";
  const subCls = compact
    ? "min-w-0 text-[12px] font-normal leading-snug text-[#6B7280]"
    : "min-w-0 text-[13.5px] font-normal leading-[1.35] text-[#6B7280]";

  return (
    <div
      className={`flex min-w-0 flex-row flex-wrap items-center [column-gap:14px] [row-gap:4px] ${className}`.trim()}
    >
      <button
        type="button"
        onClick={goOptions}
        aria-label={`${APP_DISPLAY_NAME} — 처음 옵션 화면으로 이동`}
        className={`${titleBtnReset} ${axisTightWordmark ? titleCls : titleClsUniform}`.trim()}
        style={{ fontFamily: wordmark }}
      >
        {axisTightWordmark ? (
          letters.map((ch, i) => (
            <span
              key={`${ch}-${i}`}
              style={{
                marginLeft: i === 0 ? 0 : i === 1 ? gapTight : i === 2 ? gapMid : gapIs,
              }}
            >
              {ch}
            </span>
          ))
        ) : (
          APP_DISPLAY_NAME
        )}
      </button>
      <span className={subCls} style={{ fontFamily: wordmark }}>
        {subtitle}
      </span>
    </div>
  );
}
