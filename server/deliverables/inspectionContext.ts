import { embedTextWithGemini } from "../geminiEmbeddings.js";
import { matchRagChunks } from "../rag.js";
import { getSupabaseServiceClient } from "../supabase.js";
import type { DeliverableGuideContent } from "./guideSchema.js";

export type LoadedGuide = {
  id: string;
  version: number;
  deliverableId: string | null;
  content: DeliverableGuideContent;
};

export type ResolvedDeliverable = {
  id: string;
  key: string;
  name: string;
  channel: string;
};

export type InspectionGuidePack = {
  deliverable: ResolvedDeliverable | null;
  commonGuide: LoadedGuide | null;
  deliverableGuide: LoadedGuide | null;
  /** Prompt block: checklist + direction first */
  rulesBlock: string;
  /** Query text built from rule statements/sources for narrow RAG */
  ragQueryFromRules: string;
  ruleCount: number;
};

function asContent(raw: unknown): DeliverableGuideContent {
  if (!raw || typeof raw !== "object") return { rules: [] };
  const o = raw as DeliverableGuideContent;
  return {
    summary: typeof o.summary === "string" ? o.summary : "",
    rules: Array.isArray(o.rules) ? o.rules : [],
    direction: o.direction,
    examples: Array.isArray(o.examples) ? o.examples : [],
  };
}

function formatOneGuide(label: string, guide: LoadedGuide): string {
  const c = guide.content;
  const lines: string[] = [];
  lines.push(`[${label} — v${guide.version}]`);
  if (c.summary?.trim()) lines.push(`요약: ${c.summary.trim()}`);
  const d = c.direction;
  if (d) {
    if (d.strictness) lines.push(`검수 강도: ${d.strictness}`);
    if (d.focus?.length) lines.push(`focus: ${d.focus.join(", ")}`);
    if (d.ignore?.length) lines.push(`ignore: ${d.ignore.join(", ")}`);
    if (d.instructions?.trim()) lines.push(`instructions:\n${d.instructions.trim()}`);
    if (d.feedback_style?.trim()) lines.push(`feedback_style: ${d.feedback_style.trim()}`);
  }
  if (c.rules.length === 0) {
    lines.push("(등록된 규칙 없음)");
  } else {
    lines.push("규칙 체크리스트 (항목별로 pass/fail/na 판단):");
    c.rules.forEach((r, i) => {
      lines.push(
        `${i + 1}. [${r.id}] (${r.severity}/${r.element}/${r.check}) ${r.statement}${
          r.source?.trim() ? ` ← ${r.source.trim()}` : ""
        }`
      );
    });
  }
  if (c.examples?.length) {
    lines.push("예시:");
    for (const ex of c.examples) {
      lines.push(`- (${ex.verdict}) ${ex.description}`);
    }
  }
  return lines.join("\n");
}

export function buildRagQueryFromGuides(guides: LoadedGuide[]): string {
  const parts: string[] = [];
  for (const g of guides) {
    for (const r of g.content.rules) {
      const bit = [r.statement, r.source, r.element].filter((x) => typeof x === "string" && x.trim()).join(" ");
      if (bit.trim()) parts.push(bit.trim());
    }
    const focus = g.content.direction?.focus;
    if (focus?.length) parts.push(focus.join(" "));
    if (g.content.summary?.trim()) parts.push(g.content.summary.trim());
  }
  return parts.join("\n").slice(0, 6000);
}

export async function resolveDeliverable(opts: {
  deliverableId?: string | null;
  deliverableKey?: string | null;
  templateId?: string | null;
}): Promise<ResolvedDeliverable | null> {
  const sb = getSupabaseServiceClient();
  const id = opts.deliverableId?.trim() || "";
  const key = opts.deliverableKey?.trim() || "";
  const templateId = opts.templateId?.trim() || "";

  if (id) {
    const { data, error } = await sb
      .from("deliverables")
      .select("id, key, name, channel, status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`deliverables: ${error.message}`);
    if (data && data.status === "active") {
      return { id: data.id, key: data.key, name: data.name, channel: data.channel };
    }
  }

  if (key) {
    const { data, error } = await sb
      .from("deliverables")
      .select("id, key, name, channel, status")
      .eq("key", key)
      .maybeSingle();
    if (error) throw new Error(`deliverables: ${error.message}`);
    if (data && data.status === "active") {
      return { id: data.id, key: data.key, name: data.name, channel: data.channel };
    }
  }

  if (templateId) {
    const { data: link, error: lErr } = await sb
      .from("deliverable_templates")
      .select("deliverable_id")
      .eq("template_id", templateId)
      .limit(1)
      .maybeSingle();
    if (lErr) throw new Error(`deliverable_templates: ${lErr.message}`);
    if (link?.deliverable_id) {
      return resolveDeliverable({ deliverableId: link.deliverable_id as string });
    }
  }

  return null;
}

async function loadActiveGuide(deliverableId: string | null): Promise<LoadedGuide | null> {
  const sb = getSupabaseServiceClient();
  let q = sb
    .from("deliverable_guides")
    .select("id, version, deliverable_id, content, status")
    .eq("status", "active")
    .limit(1);
  q = deliverableId === null ? q.is("deliverable_id", null) : q.eq("deliverable_id", deliverableId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`deliverable_guides: ${error.message}`);
  if (!data?.id) return null;
  return {
    id: data.id as string,
    version: data.version as number,
    deliverableId: (data.deliverable_id as string | null) ?? null,
    content: asContent(data.content),
  };
}

/**
 * Load common + deliverable active guides and format rule-first inspection context.
 * templateIds: resolve each template → deliverable (dedupe), merge published rules.
 * ruleCount === 0 → caller should fall back to broad VI summary/RAG.
 */
export async function loadInspectionGuidePack(opts: {
  deliverableId?: string | null;
  deliverableKey?: string | null;
  templateId?: string | null;
  templateIds?: string[] | null;
}): Promise<InspectionGuidePack> {
  const commonGuide = await loadActiveGuide(null);
  const deliverables: ResolvedDeliverable[] = [];
  const seen = new Set<string>();

  const add = (d: ResolvedDeliverable | null) => {
    if (!d || seen.has(d.id)) return;
    seen.add(d.id);
    deliverables.push(d);
  };

  const templateIds = [
    ...(opts.templateIds ?? []).map((t) => t.trim()).filter(Boolean),
    ...(opts.templateId?.trim() ? [opts.templateId.trim()] : []),
  ];
  for (const tid of templateIds) {
    add(await resolveDeliverable({ templateId: tid }));
  }
  if (opts.deliverableId || opts.deliverableKey) {
    add(
      await resolveDeliverable({
        deliverableId: opts.deliverableId,
        deliverableKey: opts.deliverableKey,
      })
    );
  }

  const deliverableGuides: LoadedGuide[] = [];
  for (const d of deliverables) {
    const g = await loadActiveGuide(d.id);
    if (g) deliverableGuides.push(g);
  }

  const primaryDeliverable = deliverables[0] ?? null;
  const primaryDeliverableGuide = deliverableGuides[0] ?? null;
  const guides = [commonGuide, ...deliverableGuides].filter((g): g is LoadedGuide => Boolean(g));
  const ruleCount = guides.reduce((n, g) => n + g.content.rules.length, 0);

  const parts: string[] = [];
  if (deliverables.length > 0) {
    parts.push(
      `[제작물] ${deliverables.map((d) => `${d.name} (${d.key})`).join(", ")}`
    );
  }
  if (templateIds.length > 0) {
    parts.push(`[선택 템플릿] ${templateIds.join(", ")}`);
  }

  if (ruleCount > 0) {
    parts.push(
      "아래 제작물 가이드 규칙이 이번 검수의 **1순위 기준**입니다. 각 규칙을 항목별로 판정하세요. VI PDF·RAG 발췌는 규칙을 보강하는 근거로만 사용하세요."
    );
  } else {
    parts.push(
      "선택 제작물에 게시된 규칙이 아직 없습니다. 공통 VI 가이드 요약·RAG로 광역 검수합니다. (규칙은 관리자 → 제작물 가이드에서 추가·게시)"
    );
  }

  if (commonGuide) parts.push(formatOneGuide("공통 가이드", commonGuide));
  for (const g of deliverableGuides) {
    const label =
      deliverables.find((d) => d.id === g.deliverableId)?.name ?? g.deliverableId ?? "deliverable";
    parts.push(formatOneGuide(`제작물 가이드 (${label})`, g));
  }
  if (!commonGuide && deliverableGuides.length === 0) {
    parts.push("(게시된 제작물/공통 가이드가 없습니다. VI 요약·RAG만으로 검수합니다.)");
  }

  return {
    deliverable: primaryDeliverable,
    commonGuide,
    deliverableGuide: primaryDeliverableGuide,
    rulesBlock: parts.join("\n\n"),
    ragQueryFromRules: buildRagQueryFromGuides(guides),
    ruleCount,
  };
}

/**
 * Narrow RAG: embed rule-seeded query against one guideline slot.
 */
export async function retrieveRuleSeededRag(args: {
  guidelineId: string;
  queryText: string;
  topK?: number;
}): Promise<{ block: string; picked: number }> {
  if (!args.queryText.trim() || !process.env.GEMINI_API_KEY?.trim() || !process.env.SUPABASE_URL?.trim()) {
    return { block: "", picked: 0 };
  }
  try {
    const qEmb = await embedTextWithGemini(args.queryText.trim().slice(0, 6000), {
      model: "gemini-embedding-001",
    });
    const matches = await matchRagChunks({
      queryEmbedding: qEmb,
      guidelineId: args.guidelineId,
      sourceType: "guideline",
      topK: args.topK ?? 8,
    });
    const picked = matches.filter((m) => typeof m.similarity === "number" && m.similarity >= 0.2).slice(0, 6);
    if (picked.length === 0) return { block: "", picked: 0 };
    const lines = picked.map(
      (m, i) =>
        `(${i + 1}) [${m.source_title}] (sim=${m.similarity.toFixed(3)})\n${String(m.content).trim()}`
    );
    return {
      block: `\n\n[규칙 연계 VI 근거 — RAG]\n${lines.join("\n\n---\n")}`,
      picked: picked.length,
    };
  } catch (e) {
    console.error(
      "[rag] rule-seeded retrieval failed:",
      e instanceof Error ? e.message : String(e)
    );
    return { block: "", picked: 0 };
  }
}

/** Compact VI summary for secondary context when rules are primary. */
export function wrapSecondaryViSummary(displayName: string, summaryOrExcerpt: string): string {
  const body = summaryOrExcerpt.trim().slice(0, 6000);
  if (!body) return "";
  return `\n\n[보조 — VI 요약 (${displayName})]\n(규칙은 위 체크리스트 우선. 아래는 보조 참고.)\n${body}`;
}

export async function listActiveDeliverablesPublic(): Promise<
  Array<{
    id: string;
    key: string;
    name: string;
    channel: string;
    sort_order: number;
    template_ids: string[];
    has_active_guide: boolean;
    active_rule_count: number;
  }>
> {
  const sb = getSupabaseServiceClient();
  const { data: rows, error } = await sb
    .from("deliverables")
    .select("id, key, name, channel, sort_order, status")
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`deliverables: ${error.message}`);
  const list = rows ?? [];
  if (list.length === 0) return [];

  const ids = list.map((r) => r.id as string);
  const { data: links, error: lErr } = await sb
    .from("deliverable_templates")
    .select("deliverable_id, template_id")
    .in("deliverable_id", ids);
  if (lErr) throw new Error(`deliverable_templates: ${lErr.message}`);

  const { data: guides, error: gErr } = await sb
    .from("deliverable_guides")
    .select("id, deliverable_id, content")
    .eq("status", "active")
    .in("deliverable_id", ids);
  if (gErr) throw new Error(`deliverable_guides: ${gErr.message}`);

  const templatesBy = new Map<string, string[]>();
  for (const l of links ?? []) {
    const did = l.deliverable_id as string;
    const arr = templatesBy.get(did) ?? [];
    arr.push(l.template_id as string);
    templatesBy.set(did, arr);
  }
  const guideBy = new Map<string, { ruleCount: number }>();
  for (const g of guides ?? []) {
    const c = asContent(g.content);
    guideBy.set(g.deliverable_id as string, { ruleCount: c.rules.length });
  }

  return list.map((d) => {
    const id = d.id as string;
    const g = guideBy.get(id);
    return {
      id,
      key: d.key as string,
      name: d.name as string,
      channel: d.channel as string,
      sort_order: d.sort_order as number,
      template_ids: templatesBy.get(id) ?? [],
      has_active_guide: Boolean(g),
      active_rule_count: g?.ruleCount ?? 0,
    };
  });
}
