import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { flushGlobalNavPersistence } from "@/lib/globalNavPersistence";
import { cn } from "@/components/ui/utils";

const navItems = [
  {
    key: "graphics",
    label: "그래픽 제작",
    to: "/brand-graphics",
    match: (p: string) => p === "/options" || p === "/brand-graphics" || p.startsWith("/create"),
  },
  { key: "inspection", label: "디자인 검수", to: "/inspection", match: (p: string) => p === "/inspection" },
  { key: "naming", label: "네이밍 검토", to: "/naming", match: (p: string) => p === "/naming" },
  { key: "library", label: "라이브러리", to: "/library", match: (p: string) => p === "/library" },
] as const;

type GlobalBrandNavProps = {
  className?: string;
  /** inner flex container max-width (Tailwind class), e.g. max-w-7xl */
  innerClassName?: string;
  /** `/options`에서는 기본으로 숨김 */
  showOptionsBack?: boolean;
};

export function GlobalBrandNav({
  className = "",
  innerClassName = "max-w-7xl",
  showOptionsBack,
}: GlobalBrandNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const go = useCallback(
    async (to: string) => {
      await flushGlobalNavPersistence();
      navigate(to, { replace: false });
    },
    [navigate],
  );

  const optionsBackVisible = showOptionsBack ?? pathname !== "/options";

  return (
    <nav
      className={cn("border-t border-[rgba(0,0,0,0.06)] bg-white/90", className)}
      aria-label="주요 업무 메뉴"
    >
      <div className={cn("mx-auto flex w-full flex-wrap items-center gap-2 px-4 py-2 sm:px-6", innerClassName)}>
        {optionsBackVisible ? (
          <>
            <button
              type="button"
              onClick={() => void go("/options")}
              className="mr-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-transparent px-2 py-1.5 text-[12px] font-medium text-[#6B6B6B] transition-colors hover:border-[rgba(0,0,0,0.08)] hover:bg-[#F8F7F4] hover:text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7F66]/35 focus-visible:ring-offset-1"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
              옵션으로
            </button>
            <span className="hidden h-4 w-px shrink-0 bg-[rgba(0,0,0,0.08)] sm:block" aria-hidden />
          </>
        ) : null}
        {navItems.map((item) => {
          const active = item.match(pathname);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => void go(item.to)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7F66]/35 focus-visible:ring-offset-1",
                active
                  ? "border border-[#FF7F66] bg-[#FF7F66]/12 text-[#C14D38] shadow-[0_2px_8px_-2px_rgba(255,127,102,0.35)]"
                  : "border border-[rgba(0,0,0,0.08)] bg-white text-[#6B6B6B] hover:border-[rgba(0,0,0,0.12)] hover:bg-[#F8F7F4] hover:text-[#1A1A1A]",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
