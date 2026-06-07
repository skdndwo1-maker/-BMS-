export type DesignGroup = "online" | "offline";

export type DesignType = "사내공지" | "프로모션" | "신제품 홍보" | "매장 제작물" | "안전&주의";

export const DESIGN_GROUPS: ReadonlyArray<{ id: DesignGroup; label: string }> = [
  { id: "online", label: "온라인" },
  { id: "offline", label: "오프라인" },
];

export const DESIGN_TYPES: readonly DesignType[] = [
  "사내공지",
  "프로모션",
  "신제품 홍보",
  "매장 제작물",
  "안전&주의",
];

/** 저장된 드래프트·API 값 호환 (구 「안전」 → 「안전&주의」) */
export function normalizeDesignType(value: string | null | undefined): DesignType | null {
  if (!value) return null;
  if (value === "안전") return "안전&주의";
  if ((DESIGN_TYPES as readonly string[]).includes(value)) return value as DesignType;
  return null;
}
