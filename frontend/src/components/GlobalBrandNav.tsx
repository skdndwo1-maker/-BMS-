import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { flushGlobalNavPersistence } from "@/lib/globalNavPersistence";
import { cn } from "@/components/ui/utils";

const navItems = [
  {
    key: "graphics",
    label: "브랜드 디자인",
    to: "/brand-graphics",
    match: (p: string) =>
      p === "/options" || p === "/brand-graphics" || p.startsWith("/create") || p === "/inspection",
  },
  { key: "naming", label: "브랜드 네이밍", to: "/naming", match: (p: string) => p === "/naming" },
  { key: "library", label: "브랜드 라이브러리", to: "/library", match: (p: string) => p === "/library" },
  {
    key: "simplyHeart",
    label: "심플리 가이드",
    to: "/simply-heart",
    match: (p: string) => p === "/simply-heart",
  },
] as const;

const SCROLL_BTN_BASE =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-[0_2px_8px_-4px_rgba(0,0,0,0.08)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7F66]/35 focus-visible:ring-offset-1";
const SCROLL_BTN_ON =
  "cursor-pointer border border-[rgba(0,0,0,0.08)] bg-white text-[#6B6B6B] hover:border-[rgba(0,0,0,0.12)] hover:bg-[#F8F7F4] hover:text-[#1A1A1A]";
const SCROLL_BTN_OFF =
  "cursor-default border border-[rgba(0,0,0,0.06)] bg-[#EBE9E4] text-[#A8A8A8] pointer-events-none";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ canLeft: false, canRight: false, overflow: false });

  const go = useCallback(
    async (to: string) => {
      await flushGlobalNavPersistence();
      navigate(to, { replace: false });
    },
    [navigate],
  );

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 1;
    setScrollState({
      overflow,
      canLeft: overflow && scrollLeft > 2,
      canRight: overflow && scrollLeft < scrollWidth - clientWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    el.addEventListener("scroll", updateScrollState, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateScrollState);
    };
  }, [updateScrollState]);

  /** 폰트·레이아웃 직후 scrollWidth 측정 보정 */
  useLayoutEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (!cancelled) updateScrollState();
    };
    const r1 = requestAnimationFrame(() => {
      requestAnimationFrame(tick);
    });
    const t = window.setTimeout(tick, 120);
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
      window.clearTimeout(t);
    };
  }, [pathname, updateScrollState]);

  /** 활성 메뉴가 가려져 있으면 가로 스크롤로 맞춤 */
  useLayoutEffect(() => {
    const wrap = scrollRef.current;
    if (!wrap) return;
    const activeEl = wrap.querySelector<HTMLElement>("[data-global-nav-active='true']");
    if (!activeEl) return;
    activeEl.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    requestAnimationFrame(updateScrollState);
  }, [pathname, updateScrollState]);

  const scrollByDir = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(280, el.clientWidth * 0.85), behavior: "smooth" });
  };

  const optionsBackVisible = showOptionsBack ?? pathname !== "/options";

  return (
    <nav
      className={cn("border-t border-[rgba(0,0,0,0.06)] bg-white/90", className)}
      aria-label="주요 업무 메뉴"
    >
      <div
        className={cn(
          "mx-auto flex w-full min-w-0 flex-nowrap items-center gap-1 px-4 py-2 sm:gap-2 sm:px-6",
          innerClassName,
        )}
      >
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

        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            className={cn(SCROLL_BTN_BASE, scrollState.overflow && scrollState.canLeft ? SCROLL_BTN_ON : SCROLL_BTN_OFF)}
            aria-label="이전 메뉴"
            aria-disabled={!(scrollState.overflow && scrollState.canLeft)}
            onClick={() => {
              if (scrollState.overflow && scrollState.canLeft) scrollByDir(-1);
            }}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>

          <div
            ref={scrollRef}
            className={cn(
              "min-h-[40px] min-w-0 flex-1 touch-pan-x overscroll-x-contain scroll-smooth",
              "overflow-x-auto overflow-y-hidden",
              "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            )}
          >
            <div className="flex w-max flex-nowrap items-center gap-2 py-0.5">
              {navItems.map((item) => {
                const active = item.match(pathname);
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-global-nav-active={active ? "true" : undefined}
                    onClick={() => void go(item.to)}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7F66]/35 focus-visible:ring-offset-1",
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
          </div>

          <button
            type="button"
            className={cn(SCROLL_BTN_BASE, scrollState.overflow && scrollState.canRight ? SCROLL_BTN_ON : SCROLL_BTN_OFF)}
            aria-label="다음 메뉴"
            aria-disabled={!(scrollState.overflow && scrollState.canRight)}
            onClick={() => {
              if (scrollState.overflow && scrollState.canRight) scrollByDir(1);
            }}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </nav>
  );
}
