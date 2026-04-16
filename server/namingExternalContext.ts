/**
 * 브랜드 네이밍 시 Gemini 맥락 보강.
 * - 국가법령정보: https://open.law.go.kr/ — `server/lawApi.ts` (`LAW_API_OC` / `LAW_GO_OC`)
 *
 * 창의성 평가는 외부 상표 API와 연동하지 않으며, Gemini 추론만 사용합니다.
 * 적법성 맥락 보강에만 국가법령정보 API를 선택적으로 호출합니다.
 */

import { fetchLawsForBrandNamingLegality } from "./lawApi.js";

export async function buildExternalNamingReferences(opts: {
  mode: "generate" | "audit";
  auditName: string;
  namingIntent: string;
  requestText: string;
}): Promise<string> {
  const lawBlock = await fetchLawsForBrandNamingLegality({
    mode: opts.mode,
    auditName: opts.auditName,
    namingIntent: opts.namingIntent,
    requestText: opts.requestText
  });
  return lawBlock.trim() ? lawBlock : "";
}
