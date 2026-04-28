/**
 * Option / Login / TemplateGallery와 정렬 — Soft UI, 코랄 액센트, 검은 1차 CTA
 * 레이블·스코어·상태 뱃지는 이 토큰에 맞춤.
 */
export const BRAND = {
  bg: "#F5F3F0",
  card: "#FFFFFF",
  borderSubtle: "rgba(0,0,0,0.06)",
  ink: "#1A1A1A",
  inkSoft: "#2A2A2A",
  muted: "#6B6B6B",
  mutedSoft: "#9A9A9A",
  /** 코랄 액센트 (기존 마젠타 #F43182 대체) */
  coral: "#FF7F66",
  coralSoft: "rgba(255, 127, 102, 0.14)",
  coralSoftStrong: "rgba(255, 127, 102, 0.22)",
  coralDark: "#E55A3E",
  coralInk: "#C14D38",
  black: "#000000",
  inputBg: "#E5E5E5",
  /** 참조 대시보드: Active / 성공 뱃지 */
  successBg: "rgba(200, 217, 200, 0.55)",
  successBgSolid: "#C8D9C4",
  successInk: "#2F4A38",
  /** 부정/경고 스코어·라벨 (음수, inactive) */
  negativeBg: "rgba(220, 100, 100, 0.12)",
  negativeInk: "#B91C1C",
  ringCoral: "rgba(255, 127, 102, 0.35)",
  shadowCard: "0 4px 24px -6px rgba(0,0,0,0.08), 0 2px 10px -4px rgba(0,0,0,0.04)",
} as const;

/** Tailwind arbitrary 색 (클래스 문자열) */
export const BT = {
  pageBg: "bg-[#F5F3F0]",
  card: "bg-white",
  border: "border-[rgba(0,0,0,0.06)]",
  coral: "text-[#FF7F66]",
  bgCoral: "bg-[#FF7F66]",
  bgCoralSoft: "bg-[rgba(255,127,102,0.14)]",
  borderCoral: "border-[#FF7F66]",
} as const;
