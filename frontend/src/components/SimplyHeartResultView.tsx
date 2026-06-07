import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/components/ui/utils";
import {
  parseSimplyHeartReport,
  PROBLEM_COLOR_STYLES,
  reflectionTagClass,
  type SimplyHeartReport,
} from "@/lib/simplyHeartReportParser";

const SECTION_BADGE = "#FF7F66";

export type SimplyGuideResultMode = "audit" | "generate";

function SectionCard({
  number,
  title,
  headerTint,
  children,
}: {
  number: number;
  title: string;
  headerTint?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_2px_16px_-8px_rgba(0,0,0,0.08)]">
      <div
        className={cn(
          "flex items-center gap-3 border-b border-[rgba(0,0,0,0.06)] px-5 py-3.5 sm:px-6 sm:py-4",
          headerTint ?? "bg-[#FAFAF8]",
        )}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ backgroundColor: SECTION_BADGE }}
        >
          {number}
        </span>
        <h3 className="text-[15px] font-semibold text-[#1A1A1A]">{title}</h3>
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(255,127,102,0.35)] bg-white px-3 py-1 text-[12px] font-semibold text-[#C14D38] transition-colors hover:bg-[rgba(255,127,102,0.1)]"
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? "복사됨" : "복사"}
    </button>
  );
}

function SolutionCopyBox({ report, variant = "audit" }: { report: SimplyHeartReport; variant?: "audit" | "generate" }) {
  const { solutionCopyText, solutionBlocks } = report;
  const headerLabel =
    variant === "generate"
      ? "완성본 — 모범 답안 (복사·붙여넣기용)"
      : "Simply U+ 솔루션 — 바로 복사·붙여넣기용";

  return (
    <div className="overflow-hidden rounded-xl border-2 border-[rgba(255,127,102,0.28)] bg-[rgba(255,127,102,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,127,102,0.22)] bg-[rgba(255,127,102,0.12)] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="text-[#FF7F66]" aria-hidden>
            ✦
          </span>
          <span className="text-[12px] font-semibold text-[#C14D38]">{headerLabel}</span>
        </div>
        <CopyButton text={solutionCopyText} />
      </div>
      <div className="space-y-5 px-4 py-5 text-[14px] leading-relaxed text-[#2A2A2A] sm:px-6">
        {variant === "generate" || solutionBlocks.length === 0 ? (
          <p className="whitespace-pre-wrap text-[15px] font-medium leading-[1.85] text-[#1A1A1A]">
            {solutionCopyText || "—"}
          </p>
        ) : (
          solutionBlocks.map((block, i) => (
            <div key={i} className={i > 0 ? "border-t border-[rgba(255,127,102,0.15)] pt-5" : undefined}>
              {block.title ? <p className="font-semibold text-[#1A1A1A]">{block.title}</p> : null}
              {block.items.length > 0 ? (
                <div className={cn("space-y-1", block.title ? "mt-2" : undefined)}>
                  {block.items.map((it, j) => (
                    <p key={j} className="text-[13px] text-[#505050]">
                      <span className="font-medium text-[#3A3A3A]">{it.label}</span>: {it.value}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ReflectionDetails({ reflections }: { reflections: SimplyHeartReport["reflections"] }) {
  if (reflections.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)]">
      <div className="border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-4 py-3 sm:px-5">
        <span className="text-[12px] font-semibold text-[#505050]">반영 항목 상세</span>
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        {reflections.map((item, i) => (
          <div key={i} className="space-y-1.5">
            <span
              className={cn(
                "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                reflectionTagClass(item.color),
              )}
            >
              {item.tag}
            </span>
            <p className="text-[14px] leading-relaxed text-[#505050]">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditResultView({ report }: { report: SimplyHeartReport }) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-[rgba(255,127,102,0.14)] px-3 py-1 text-[11px] font-semibold text-[#C14D38]">
          요청내용 분석 · 문제 진단
        </span>
      </div>

      <SectionCard number={1} title="예상 타겟">
        <p className="text-[14px] leading-relaxed text-[#2A2A2A]">
          {report.target || "분석 결과에 예상 타겟 정보가 없습니다."}
        </p>
      </SectionCard>

      <SectionCard number={2} title="목적">
        <p className="text-[14px] leading-relaxed text-[#2A2A2A]">
          {report.purpose || "분석 결과에 목적 정보가 없습니다."}
        </p>
      </SectionCard>

      <SectionCard number={3} title="문제 진단">
        {report.problems.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {report.problems.map((p, i) => {
              const c = PROBLEM_COLOR_STYLES[p.color];
              return (
                <div key={i} className={cn("rounded-lg border px-4 py-3.5 sm:px-5 sm:py-4", c.bg, c.border)}>
                  <p className={cn("mb-1.5 text-[13px] font-semibold", c.title)}>{p.title}</p>
                  <p className="text-[14px] leading-relaxed text-[#2A2A2A]">{p.body}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[14px] text-[#6B6B6B]">진단 항목이 없습니다.</p>
        )}
      </SectionCard>

      <SectionCard number={4} title="DO & DON'T">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-[rgba(5,150,105,0.22)] bg-[rgba(5,150,105,0.06)] px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#059669] text-[11px] text-white">
                ✓
              </span>
              <span className="text-[14px] font-semibold text-[#047857]">Do</span>
            </div>
            <ul className="space-y-3">
              {(report.dos.length > 0 ? report.dos : ["—"]).map((d, i) => (
                <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-[#2A2A2A]">
                  <span className="mt-0.5 shrink-0 text-[#34D399]">·</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.05)] px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#DC2626] text-[11px] text-white">
                <X className="h-3 w-3" aria-hidden />
              </span>
              <span className="text-[14px] font-semibold text-[#B91C1C]">Don&apos;t</span>
            </div>
            <ul className="space-y-3">
              {(report.donts.length > 0 ? report.donts : ["—"]).map((d, i) => (
                <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-[#2A2A2A]">
                  <span className="mt-0.5 shrink-0 text-[#FCA5A5]">·</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SectionCard>

      <SectionCard number={5} title="Simply U+ 솔루션" headerTint="bg-[rgba(255,127,102,0.08)]">
        <div className="space-y-6">
          <SolutionCopyBox report={report} />
          <ReflectionDetails reflections={report.reflections} />
        </div>
      </SectionCard>
    </div>
  );
}

function GenerateResultView({ report }: { report: SimplyHeartReport }) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-[rgba(255,127,102,0.14)] px-3 py-1 text-[11px] font-semibold text-[#C14D38]">
          Simply U+ 솔루션 생성
        </span>
      </div>
      <SolutionCopyBox report={report} variant="generate" />
      <ReflectionDetails reflections={report.reflections} />
    </div>
  );
}

export function SimplyHeartResultView({
  text,
  mode = "audit",
  category,
  userTarget,
  fieldTopic,
  fieldDetail,
}: {
  text: string;
  mode?: SimplyGuideResultMode;
  category?: string;
  userTarget?: string;
  fieldTopic?: string;
  fieldDetail?: string;
}) {
  const report = useMemo(
    () => parseSimplyHeartReport(text, { mode, category, userTarget, fieldTopic, fieldDetail }),
    [text, mode, category, userTarget, fieldTopic, fieldDetail],
  );

  if (mode === "generate") {
    return <GenerateResultView report={report} />;
  }
  return <AuditResultView report={report} />;
}
