import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/admin/review", label: "승인 / 거절" },
  { to: "/admin/guidelines", label: "가이드 관리" },
  { to: "/admin/deliverables", label: "제작물 가이드" },
  { to: "/admin/ai-generation", label: "AI 생성 설정" },
] as const;

/** 관리자 페이지 상단 시트 전환 */
export function AdminSectionTabs() {
  return (
    <nav className="flex gap-2" aria-label="관리자 메뉴">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `inline-flex items-center rounded-full border px-4 py-2 text-[13px] font-semibold transition ${
              isActive
                ? "border-black bg-black text-white"
                : "border-[rgba(0,0,0,0.1)] bg-white text-[#5C5C5C] hover:bg-[#EBE9E1]"
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
