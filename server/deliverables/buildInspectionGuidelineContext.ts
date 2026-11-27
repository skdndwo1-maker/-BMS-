/**
 * Shared rule-first guideline context for:
 * - POST /api/inspection/run
 * - POST /api/design-editor/inspect
 * - POST /api/design-editor/correct-canvas
 *
 * Priority: deliverable/common checklist → rule-seeded VI RAG → secondary VI summary.
 * When no published rules: caller-supplied fallback (primary summary block or PDF extract).
 */

import type { InspectionGuidePack } from "./inspectionContext.js";
import {
  loadInspectionGuidePack,
  retrieveRuleSeededRag,
  wrapSecondaryViSummary,
} from "./inspectionContext.js";

export type InspectionGuidelineContextOk = {
  ok: true;
  guidelineSummary: string;
  guidePack: InspectionGuidePack | null;
  ragPicked: number;
  mode: "rule-first" | "fallback";
};

export type InspectionGuidelineContextErr = {
  ok: false;
  error: string;
  status: number;
};

export type InspectionGuidelineContextResult =
  | InspectionGuidelineContextOk
  | InspectionGuidelineContextErr;

export type BuildInspectionGuidelineContextArgs = {
  guidelineId: string;
  templateIds?: string[];
  templateId?: string | null;
  deliverableId?: string | null;
  deliverableKey?: string | null;
  businessCategory?: string;
  designGroup?: string;
  designType?: string;
  /** Extra seeds for fallback RAG / category (creativeTopic, overallSummary, …) */
  queryExtras?: string[];
  /**
   * Load VI secondary text when rules are primary (aiSummary or excerpt).
   */
  loadViSecondary: (guidelineId: string) => Promise<{ displayName: string; text: string }>;
  /**
   * Fallback when no published rules.
   * Return ok:false to abort (e.g. design-editor requires PDF extract).
   */
  buildFallback: (args: {
    guidelineId: string;
    ragQuerySeed: string;
    guidePack: InspectionGuidePack | null;
  }) => Promise<
    | { ok: true; block: string; ragPicked: number }
    | { ok: false; error: string; status: number }
  >;
  logTag?: string;
};

export async function buildInspectionGuidelineContext(
  args: BuildInspectionGuidelineContextArgs
): Promise<InspectionGuidelineContextResult> {
  const logTag = args.logTag ?? "inspection-context";
  const templateIds =
    args.templateIds && args.templateIds.length > 0
      ? args.templateIds
      : args.templateId?.trim()
        ? [args.templateId.trim()]
        : [];

  let guidePack: InspectionGuidePack | null = null;
  try {
    guidePack = await loadInspectionGuidePack({
      deliverableId: args.deliverableId || null,
      deliverableKey: args.deliverableKey || null,
      templateIds: templateIds.length ? templateIds : undefined,
      templateId: args.templateId || null,
    });
  } catch (e) {
    console.error(
      `[${logTag}] guide pack failed:`,
      e instanceof Error ? e.message : String(e)
    );
  }

  let guidelineSummary = "";
  let ragPicked = 0;
  let mode: "rule-first" | "fallback" = "fallback";
  const t0 = Date.now();

  if (guidePack && guidePack.ruleCount > 0) {
    mode = "rule-first";
    guidelineSummary = guidePack.rulesBlock;
    const seeded = await retrieveRuleSeededRag({
      guidelineId: args.guidelineId,
      queryText: guidePack.ragQueryFromRules,
    });
    ragPicked = seeded.picked;
    guidelineSummary += seeded.block;

    const secondary = await args.loadViSecondary(args.guidelineId);
    guidelineSummary += wrapSecondaryViSummary(secondary.displayName, secondary.text);
    console.log(
      `[${logTag}][rule-first] deliverable=${guidePack.deliverable?.key ?? "-"} rules=${guidePack.ruleCount} rag=${ragPicked} ms=${Date.now() - t0}`
    );
  } else {
    const ragQuerySeed = [
      guidePack?.ragQueryFromRules || "",
      templateIds.length ? `템플릿: ${templateIds.join(", ")}` : "",
      guidePack?.deliverable ? `제작물: ${guidePack.deliverable.name}` : "",
      args.businessCategory ? `사업 영역: ${args.businessCategory}` : "",
      args.designGroup ? `디자인 그룹: ${args.designGroup}` : "",
      args.designType ? `디자인 유형: ${args.designType}` : "",
      ...(args.queryExtras ?? []).filter(Boolean),
    ]
      .filter(Boolean)
      .join("\n");

    const fallback = await args.buildFallback({
      guidelineId: args.guidelineId,
      ragQuerySeed,
      guidePack,
    });
    if (!fallback.ok) return fallback;

    guidelineSummary =
      (guidePack?.rulesBlock ? `${guidePack.rulesBlock}\n\n` : "") + fallback.block;
    ragPicked = fallback.ragPicked;
    console.log(
      `[${logTag}][fallback] ms=${Date.now() - t0} rag=${ragPicked}`
    );
  }

  const categoryLines: string[] = [];
  if (args.businessCategory) categoryLines.push(`- 사업 영역: ${args.businessCategory}`);
  if (args.designGroup) {
    categoryLines.push(
      `- 디자인 그룹: ${args.designGroup === "online" ? "온라인" : args.designGroup === "offline" ? "오프라인" : args.designGroup}`
    );
  }
  if (args.designType) categoryLines.push(`- 디자인 유형: ${args.designType}`);
  if (guidePack?.deliverable) {
    categoryLines.push(
      `- 제작물 가이드: ${guidePack.deliverable.name} (${guidePack.deliverable.key})`
    );
  }
  if (categoryLines.length > 0) {
    guidelineSummary = `${guidelineSummary}\n\n[검수 카테고리]\n${categoryLines.join("\n")}`;
  }

  return {
    ok: true,
    guidelineSummary,
    guidePack,
    ragPicked,
    mode,
  };
}
