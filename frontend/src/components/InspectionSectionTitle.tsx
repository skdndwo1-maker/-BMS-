import type { ReactNode } from "react";

type MarkerVariant = "section" | "compact";

export function CoralTitleMarker({
  variant = "section",
  className = "",
}: {
  variant?: MarkerVariant;
  className?: string;
}) {
  const size =
    variant === "compact"
      ? "h-1.5 w-1.5 shadow-[0_0_0_2px_rgba(255,127,102,0.22)]"
      : "h-2 w-2 shadow-[0_0_0_3px_rgba(255,127,102,0.22)]";
  return (
    <span
      className={`inline-block shrink-0 rounded-full bg-[#FF7F66] ${size} ${className}`.trim()}
      aria-hidden
    />
  );
}

export function InspectionSectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`flex items-center gap-2.5 text-[17px] font-bold tracking-tight text-[#1A1A1A] ${className}`.trim()}
    >
      <CoralTitleMarker variant="section" />
      {children}
    </h2>
  );
}
