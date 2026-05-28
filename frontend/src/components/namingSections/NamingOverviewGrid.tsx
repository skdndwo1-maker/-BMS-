import { NAMING_OVERVIEW_FIELDS } from "./constants";
import type { NamingOverviewFields } from "./types";

/** 작명 개요 6필드 그리드 입력(사용대상·기획의도·주요용도·작명방향·후보대안·기타사항) */
export function NamingOverviewGrid({
  value,
  onChange,
}: {
  value: NamingOverviewFields;
  onChange: (next: NamingOverviewFields) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {NAMING_OVERVIEW_FIELDS.map((f) => {
        const v = value[f.key] ?? "";
        return (
          <div key={f.key} className="brand-naming-section p-3">
            <div className="mb-2">
              <span className="brand-pill--accent">{f.label}</span>
            </div>
            <textarea
              value={v}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              rows={3}
              className="h-[72px] min-h-[72px] w-full resize-none rounded-[10px] border border-gray-200 px-3 py-2 text-[14px] font-normal leading-relaxed outline-none transition-all placeholder:text-gray-300 focus:border-[#FF7F66] focus:ring-2 focus:ring-[#FF7F66]/20"
            />
          </div>
        );
      })}
    </div>
  );
}
