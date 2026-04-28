import { APP_DISPLAY_NAME } from "@/constants/appBranding";

const wordmark = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

type AxisBrandTitleProps = {
  /** Option / TemplateGallery와 동일: AXIS(대문자·자간) + 부제 (예: Brand Contents Manager, 브랜드 그래픽 제작) */
  subtitle: string;
  className?: string;
  /** 툴바 등 좁은 영역: 글자 크기만 약간 축소(표기 방식은 동일) */
  compact?: boolean;
};

/**
 * 이미지 로고 없이, 옵션·그래픽 제작 페이지와 동일한 AXIS 텍스트 표기.
 */
export function AxisBrandTitle({ subtitle, className = "", compact = false }: AxisBrandTitleProps) {
  const titleCls = compact
    ? "whitespace-nowrap text-[15px] font-semibold uppercase tracking-[0.12em] text-[#6B7280] leading-tight"
    : "whitespace-nowrap text-[22px] font-semibold uppercase tracking-[0.14em] text-[#6B7280] leading-tight";
  const subCls = compact
    ? "min-w-0 text-[12px] font-normal leading-snug text-[#6B7280]"
    : "min-w-0 text-[13.5px] font-normal leading-[1.35] text-[#6B7280]";

  return (
    <div
      className={`flex min-w-0 flex-row flex-wrap items-center [column-gap:14px] [row-gap:4px] ${className}`.trim()}
    >
      <span className={titleCls} style={{ fontFamily: wordmark }}>
        {APP_DISPLAY_NAME}
      </span>
      <span className={subCls} style={{ fontFamily: wordmark }}>
        {subtitle}
      </span>
    </div>
  );
}
