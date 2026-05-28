import { Fragment } from "react";
import { Loader2 } from "lucide-react";

import { AUDIT_STEPS, STEP_ORDER } from "./constants";
import type { AuditStep } from "./types";

/** 스텝 바 — 스텝은 고정 폭, 연결선만 flex-1로 동일 분배(검증~완료 간만 넓어지는 현상 방지) */
export function StepBar({ currentStep }: { currentStep: AuditStep }) {
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  return (
    <div className="border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAF8]">
      <div className="max-w-[1280px] mx-auto px-[24px] py-[16px]">
        <div className="flex w-full items-center">
          {AUDIT_STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = index <= currentIdx - 1;
            const isCurrent = index === currentIdx - 1;
            return (
              <Fragment key={step.id}>
                <div className="flex w-[72px] shrink-0 flex-col items-center gap-[8px] sm:w-[88px]">
                  <div
                    className={`flex h-[40px] w-[40px] items-center justify-center rounded-full transition-all
                    ${isActive || isCurrent ? "bg-[#FF7F66] text-white" : "bg-gray-100 text-gray-400"}
                    ${isCurrent ? "ring-4 ring-[#FF7F66]/20" : ""}`}
                  >
                    {isCurrent && currentStep !== "complete" ? (
                      <Loader2 className="h-[20px] w-[20px] animate-spin" />
                    ) : (
                      <StepIcon className="h-[20px] w-[20px]" />
                    )}
                  </div>
                  <span
                    className={`text-center text-[12px] font-medium ${isActive || isCurrent ? "text-gray-900" : "text-gray-400"}`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < AUDIT_STEPS.length - 1 ? (
                  <div
                    className={`mx-1 h-[2px] min-w-[8px] flex-1 transition-all sm:mx-2 ${index <= currentIdx - 1 ? "bg-[#FF7F66]" : "bg-gray-200"}`}
                  />
                ) : null}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
