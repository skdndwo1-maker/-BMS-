import { CheckCircle2, ScanSearch, Scale, ShieldCheck } from "lucide-react";

import type { NamingAuditMajor, NamingOverviewFields, NamingOverviewKey, AuditStep } from "./types";

export const AUDIT_STEPS = [
  { id: "analyzing", label: "분석", icon: ScanSearch },
  { id: "checking", label: "검토", icon: Scale },
  { id: "verifying", label: "검증", icon: ShieldCheck },
  { id: "complete", label: "완료", icon: CheckCircle2 },
] as const;

export const STEP_ORDER: AuditStep[] = ["idle", "analyzing", "checking", "verifying", "complete"];

/** 본문 섹션 타이틀: TemplateGallery / brandPages 정렬 */
export const SECTION_TITLE = "brand-section-title";

/** 검수 — 작명의도 행과 동일 높이(검수명+작명의도 부모 189px·gap-8 기준 flex-[120] 행) */
export const NAMING_AUDIT_INTENT_ROW_H_PX = Math.round(((189 - 8) * 120) / 200);
/** 대카테고리만 선택된 상태(서브 미표시): 탭 한 줄만 들어갈 최소 높이 */
export const NAMING_AUDIT_CATEGORY_COMPACT_H_PX = 52;

export const NAMING_AUDIT_SUBS: Record<NamingAuditMajor, readonly string[]> = {
  Personal: ["모바일", "인터넷", "IPTV", "스마트홈", "멤버십", "구독", "채널"],
  Enterprise: ["Infra", "Works", "AX"],
  AI: ["Service", "Feature", "Tech"],
  "etc.": [],
};

export const categoryTabBase =
  "inline-flex items-center justify-center rounded-full border px-3 py-2 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20";
export const categoryTabIdle =
  "border-[rgba(0,0,0,0.08)] bg-white text-[#6B6B6B] hover:border-[rgba(0,0,0,0.12)]";
export const categoryTabActive =
  "border-black bg-black text-white shadow-[0_4px_14px_-4px_rgba(0,0,0,0.22)] hover:bg-black/90";

/** 생성 모드 — 생성 방식(일반/단계별): 검수 세부 유형과 동일 코랄 액센트 */
export const generateStyleTabIdle =
  "h-7 rounded-full border-[rgba(255,127,102,0.4)] bg-white px-2.5 text-[11px] font-medium text-[#5C5C5C] hover:bg-[#FFF7F5] hover:border-[rgba(255,127,102,0.55)]";
export const generateStyleTabActive =
  "h-7 rounded-full border-[#FF7F66] bg-[#FF7F66] px-2.5 text-[11px] font-medium text-white shadow-[0_4px_12px_-4px_rgba(255,127,102,0.35)] hover:bg-[#FF7F66]/90";

/** 생성 모드 — 네이밍 언어(국문/영문/제한없음): 레드 브라운 액센트 */
export const generateLanguageTabIdle =
  "h-7 rounded-full border-[rgba(122,107,75,0.45)] bg-white px-2.5 text-[11px] font-medium text-[#5C5C5C] hover:bg-[#F7F4F0] hover:border-[rgba(122,107,75,0.65)]";
export const generateLanguageTabActive =
  "h-7 rounded-full border-[#7A6B4B] bg-[#7A6B4B] px-2.5 text-[11px] font-medium text-white shadow-[0_4px_12px_-4px_rgba(122,107,75,0.35)] hover:bg-[#7A6B4B]/90";

/** 하위 카테고리(Personal 등 아래 모바일·인터넷…): 디자인 검수 세부 유형과 동일 코랄 */
export const namingMinorTabIdle =
  "border-[rgba(255,127,102,0.4)] bg-white text-[#5C5C5C] hover:bg-[#FFF7F5] hover:border-[rgba(255,127,102,0.55)]";
export const namingMinorTabActive =
  "border-[#FF7F66] bg-[#FF7F66] text-white shadow-[0_4px_14px_-4px_rgba(255,127,102,0.45)] hover:bg-[#FF7F66]/90";

export const SECTION_ICON = "h-[26px] w-[26px] shrink-0";

export const ETC_TOOLTIP_TEXT = [
  "브랜드 위계체계에 포함되지 않는 내부 사용,",
  "프로모션용 서비스, 사업, AI와 무관한",
  "작명 업무 시 사용",
].join("\n");

export const NAMING_OVERVIEW_FIELDS: Array<{
  key: NamingOverviewKey;
  label: string;
  placeholder?: string;
}> = [
  { key: "targetUser", label: "사용대상", placeholder: "예) 개인/기업, 연령대, 내부 구성원 등" },
  { key: "planningIntent", label: "기획의도", placeholder: "예) 런칭 목적, 해결 과제, 핵심 메시지" },
  { key: "primaryUse", label: "주요용도", placeholder: "예) 프로모션/기능명/캠페인/패키지 등" },
  { key: "namingDirection", label: "작명방향", placeholder: "예) 톤&매너, 키워드, 금지어/선호어" },
  { key: "alternatives", label: "후보대안", placeholder: "예) 이미 생각한 후보/레퍼런스" },
  { key: "misc", label: "기타사항", placeholder: "예) 일정, 사용 채널, 표기 제약 등" },
];

export const EMPTY_NAMING_OVERVIEW: NamingOverviewFields = {
  targetUser: "",
  planningIntent: "",
  primaryUse: "",
  namingDirection: "",
  alternatives: "",
  misc: "",
};

/** 검수 결과 상단 점수 서클 (r·scoreSize 기준 동기 확대) */
export const NAMING_AUDIT_GAUGE_R = 84;

/** 단계별 생성: 기본 단계 라벨(요금제·가격대 라인업) */
export const DEFAULT_TIER_LABELS = ["최고가", "고가", "중가", "저가", "최저가", "라이트"];

/** PASS: 카키 배경 + 흰 글씨 / FAIL: 검붉은 글씨 (UI 공통) */
export const NAMING_PASS_BADGE_SM =
  "inline-flex items-center justify-center rounded-md bg-[#7A6B4B] px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm sm:text-[10px]";
export const NAMING_FAIL_TEXT_SM = "text-[9px] font-bold text-[#7A1A1A] sm:text-[10px]";
export const NAMING_PASS_BADGE_MD =
  "inline-flex items-center rounded-md bg-[#7A6B4B] px-2 py-0.5 text-[11px] font-bold text-white shadow-sm sm:text-[12px]";
export const NAMING_FAIL_TEXT_MD = "text-[12px] font-bold text-[#7A1A1A]";

/** 생성 모드 평가 점수 바 — 대안 1~4 카드 공통: 고정 높이, 트랙·채움 색 통일 */
export const NAMING_EVAL_PROGRESS_HEIGHT_PX = 8;

export const NAMING_NAV_DRAFT_KEY = "brandAxis:namingNavDraft";

export const NAMING_TIER_LEGAL_TRACK = "bg-[#92b8b1]/14";
export const NAMING_TIER_LEGAL_FILL = "bg-[#92b8b1]";
