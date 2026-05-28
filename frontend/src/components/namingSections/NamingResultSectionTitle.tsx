import type { ReactNode } from "react";

/** 평가·결과 블록 제목 (레퍼런스: Overview ●) */
export function NamingResultSectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-2.5">
      <span className="h-2 w-2 shrink-0 rounded-full bg-[#FF7F66]" aria-hidden />
      <h2 className="text-[19px] font-bold leading-tight tracking-tight text-[#1a1a1a]">
        {children}
      </h2>
    </div>
  );
}
