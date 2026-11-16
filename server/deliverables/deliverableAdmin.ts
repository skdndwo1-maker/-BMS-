import { getSupabaseServiceClient } from "../supabase.js";
import { hashGuideContent, validateGuideContent, type DeliverableGuideContent } from "./guideSchema.js";

const KEY_RE = /^[a-z0-9_]+$/;
const CHANNELS = new Set(["office", "online", "offline", "custom"]);
const STATUSES = new Set(["active", "archived"]);

export type DeliverableRow = {
  id: string;
  key: string;
  name: string;
  channel: string;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DeliverableOverview = DeliverableRow & {
  template_ids: string[];
  active_guide: {
    id: string;
    version: number;
    rule_count: number;
    published_at: string | null;
  } | null;
};

export type GuideRow = {
  id: string;
  deliverable_id: string | null;
  version: number;
  status: string;
  content: DeliverableGuideContent;
  content_hash: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
};

function sb() {
  return getSupabaseServiceClient();
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function ruleCount(content: unknown): number {
  if (!content || typeof content !== "object") return 0;
  const rules = (content as { rules?: unknown }).rules;
  return Array.isArray(rules) ? rules.length : 0;
}

export function parseDeliverableRef(idOrCommon: string): { kind: "common" } | { kind: "id"; id: string } {
  if (idOrCommon === "common") return { kind: "common" };
  if (!isUuid(idOrCommon)) throw new Error("invalid_deliverable_id");
  return { kind: "id", id: idOrCommon };
}

export async function listDeliverables(): Promise<DeliverableOverview[]> {
  const client = sb();
  const { data: rows, error } = await client
    .from("deliverables")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`deliverables: ${error.message}`);

  const list = (rows ?? []) as DeliverableRow[];
  if (list.length === 0) return [];

  const ids = list.map((r) => r.id);
  const { data: links, error: lErr } = await client
    .from("deliverable_templates")
    .select("deliverable_id, template_id")
    .in("deliverable_id", ids);
  if (lErr) throw new Error(`deliverable_templates: ${lErr.message}`);

  const { data: guides, error: gErr } = await client
    .from("deliverable_guides")
    .select("id, deliverable_id, version, status, content, published_at")
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

  const activeBy = new Map<string, { id: string; version: number; rule_count: number; published_at: string | null }>();
  for (const g of guides ?? []) {
    const did = g.deliverable_id as string;
    activeBy.set(did, {
      id: g.id as string,
      version: g.version as number,
      rule_count: ruleCount(g.content),
      published_at: (g.published_at as string | null) ?? null,
    });
  }

  return list.map((d) => ({
    ...d,
    template_ids: templatesBy.get(d.id) ?? [],
    active_guide: activeBy.get(d.id) ?? null,
  }));
}

export async function createDeliverable(input: {
  key: string;
  name: string;
  channel: string;
  sort_order?: number;
  template_ids?: string[];
}): Promise<DeliverableOverview> {
  const key = input.key.trim();
  const name = input.name.trim();
  const channel = input.channel.trim();
  if (!KEY_RE.test(key)) throw new Error("invalid_key");
  if (!name) throw new Error("name_required");
  if (!CHANNELS.has(channel)) throw new Error("invalid_channel");

  const client = sb();
  const { data, error } = await client
    .from("deliverables")
    .insert({
      key,
      name,
      channel,
      status: "active",
      sort_order: typeof input.sort_order === "number" ? input.sort_order : 0,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("key_conflict");
    throw new Error(`deliverables: ${error.message}`);
  }

  const row = data as DeliverableRow;
  const templateIds = (input.template_ids ?? []).map((t) => t.trim()).filter(Boolean);
  if (templateIds.length > 0) {
    const { error: tErr } = await client.from("deliverable_templates").insert(
      templateIds.map((template_id) => ({ deliverable_id: row.id, template_id }))
    );
    if (tErr) throw new Error(`deliverable_templates: ${tErr.message}`);
  }

  const list = await listDeliverables();
  const found = list.find((d) => d.id === row.id);
  if (!found) throw new Error("deliverable_create_failed");
  return found;
}

export async function updateDeliverable(
  id: string,
  patch: {
    name?: string;
    channel?: string;
    status?: string;
    sort_order?: number;
    template_ids?: string[];
  }
): Promise<DeliverableOverview> {
  if (!isUuid(id)) throw new Error("invalid_deliverable_id");
  const client = sb();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.name === "string") {
    const name = patch.name.trim();
    if (!name) throw new Error("name_required");
    updates.name = name;
  }
  if (typeof patch.channel === "string") {
    if (!CHANNELS.has(patch.channel)) throw new Error("invalid_channel");
    updates.channel = patch.channel;
  }
  if (typeof patch.status === "string") {
    if (!STATUSES.has(patch.status)) throw new Error("invalid_status");
    updates.status = patch.status;
  }
  if (typeof patch.sort_order === "number") updates.sort_order = patch.sort_order;

  const { data, error } = await client.from("deliverables").update(updates).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(`deliverables: ${error.message}`);
  if (!data) throw new Error("deliverable_not_found");

  if (Array.isArray(patch.template_ids)) {
    const templateIds = patch.template_ids.map((t) => t.trim()).filter(Boolean);
    const { error: delErr } = await client.from("deliverable_templates").delete().eq("deliverable_id", id);
    if (delErr) throw new Error(`deliverable_templates: ${delErr.message}`);
    if (templateIds.length > 0) {
      const { error: insErr } = await client
        .from("deliverable_templates")
        .insert(templateIds.map((template_id) => ({ deliverable_id: id, template_id })));
      if (insErr) throw new Error(`deliverable_templates: ${insErr.message}`);
    }
  }

  const list = await listDeliverables();
  const found = list.find((d) => d.id === id);
  if (!found) throw new Error("deliverable_not_found");
  return found;
}

export async function listGuidesForDeliverable(ref: string): Promise<GuideRow[]> {
  const parsed = parseDeliverableRef(ref);
  const client = sb();
  let q = client
    .from("deliverable_guides")
    .select("*")
    .order("version", { ascending: false });
  if (parsed.kind === "common") q = q.is("deliverable_id", null);
  else q = q.eq("deliverable_id", parsed.id);

  const { data, error } = await q;
  if (error) throw new Error(`deliverable_guides: ${error.message}`);
  return (data ?? []) as GuideRow[];
}

export async function getGuide(guideId: string): Promise<GuideRow> {
  if (!isUuid(guideId)) throw new Error("invalid_guide_id");
  const { data, error } = await sb().from("deliverable_guides").select("*").eq("id", guideId).maybeSingle();
  if (error) throw new Error(`deliverable_guides: ${error.message}`);
  if (!data) throw new Error("guide_not_found");
  return data as GuideRow;
}

async function nextVersion(deliverableId: string | null): Promise<number> {
  const client = sb();
  let q = client.from("deliverable_guides").select("version");
  q = deliverableId === null ? q.is("deliverable_id", null) : q.eq("deliverable_id", deliverableId);
  const { data, error } = await q.order("version", { ascending: false }).limit(1);
  if (error) throw new Error(`deliverable_guides: ${error.message}`);
  const max = data?.[0]?.version;
  return typeof max === "number" ? max + 1 : 1;
}

export async function createGuideDraft(input: {
  deliverableRef: string;
  content: unknown;
  note?: string | null;
  createdBy?: string | null;
}): Promise<GuideRow> {
  const parsed = parseDeliverableRef(input.deliverableRef);
  let deliverableId: string | null = null;
  if (parsed.kind === "id") {
    const { data, error } = await sb().from("deliverables").select("id").eq("id", parsed.id).maybeSingle();
    if (error) throw new Error(`deliverables: ${error.message}`);
    if (!data) throw new Error("deliverable_not_found");
    deliverableId = parsed.id;
  }

  const validated = validateGuideContent(input.content);
  if (!validated.ok) {
    const err = new Error("guide_schema_invalid");
    (err as Error & { details?: string[] }).details = validated.errors;
    throw err;
  }

  const version = await nextVersion(deliverableId);
  const contentHash = hashGuideContent(validated.content);
  const { data, error } = await sb()
    .from("deliverable_guides")
    .insert({
      deliverable_id: deliverableId,
      version,
      status: "draft",
      content: validated.content,
      content_hash: contentHash,
      note: input.note?.trim() || null,
      created_by: input.createdBy && isUuid(input.createdBy) ? input.createdBy : null,
      published_at: null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`deliverable_guides: ${error.message}`);
  return data as GuideRow;
}

export async function updateGuideDraft(
  guideId: string,
  input: { content: unknown; note?: string | null }
): Promise<GuideRow> {
  const existing = await getGuide(guideId);
  if (existing.status !== "draft") throw new Error("guide_not_draft");

  const validated = validateGuideContent(input.content);
  if (!validated.ok) {
    const err = new Error("guide_schema_invalid");
    (err as Error & { details?: string[] }).details = validated.errors;
    throw err;
  }

  const updates: Record<string, unknown> = {
    content: validated.content,
    content_hash: hashGuideContent(validated.content),
  };
  if (input.note !== undefined) updates.note = input.note?.trim() || null;

  const { data, error } = await sb()
    .from("deliverable_guides")
    .update(updates)
    .eq("id", guideId)
    .eq("status", "draft")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`deliverable_guides: ${error.message}`);
  if (!data) throw new Error("guide_not_draft");
  return data as GuideRow;
}

export async function publishGuide(guideId: string): Promise<unknown> {
  if (!isUuid(guideId)) throw new Error("invalid_guide_id");
  const { data, error } = await sb().rpc("publish_deliverable_guide", { p_guide_id: guideId });
  if (error) {
    const msg = error.message || "";
    if (msg.includes("guide_not_found")) throw new Error("guide_not_found");
    if (msg.includes("guide_not_draft")) throw new Error("guide_not_draft");
    throw new Error(`publish_deliverable_guide: ${msg}`);
  }
  return data;
}

export async function rollbackGuide(input: {
  guideId: string;
  createdBy?: string | null;
  note?: string | null;
}): Promise<unknown> {
  if (!isUuid(input.guideId)) throw new Error("invalid_guide_id");
  const { data, error } = await sb().rpc("rollback_deliverable_guide", {
    p_guide_id: input.guideId,
    p_created_by: input.createdBy && isUuid(input.createdBy) ? input.createdBy : null,
    p_note: input.note?.trim() || null,
  });
  if (error) {
    const msg = error.message || "";
    if (msg.includes("guide_not_found")) throw new Error("guide_not_found");
    throw new Error(`rollback_deliverable_guide: ${msg}`);
  }
  return data;
}
