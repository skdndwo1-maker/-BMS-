import type { Request } from "express";
import { getSupabaseServiceClient } from "./supabase.js";

export type RunType =
  | "inspection"
  | "inspection_followup"
  | "inspection_additional_revision"
  | "naming_generate"
  | "naming_audit"
  | "design_editor_inspection"
  | "design_editor_text_suggestion"
  | "design_editor_visual_correction"
  | "design_editor_draft_proposal"
  | "design_editor_asset_generation"
  | "simply_heart";

export async function persistRun(args: {
  req: Request;
  type: RunType;
  status?: "pending_review" | "approved" | "rejected";
  guidelineId?: string | null;
  templateId?: string | null;
  mediaType?: "online" | "offline" | null;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  inputText?: string | null;
  outputText?: string | null;
  score?: number | null;
  model?: string | null;
  latencyMs?: number | null;
}): Promise<{ runId: string } | null> {
  // Allow running without Supabase in local/dev by leaving env unset.
  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return null;
  }

  const sb = getSupabaseServiceClient();
  const ip =
    (typeof args.req.headers["x-forwarded-for"] === "string" && args.req.headers["x-forwarded-for"].split(",")[0]) ||
    args.req.ip ||
    null;
  const ua = typeof args.req.headers["user-agent"] === "string" ? args.req.headers["user-agent"] : null;
  const sessionId = typeof args.req.headers["x-session-id"] === "string" ? args.req.headers["x-session-id"] : null;
  const startedAt = Date.now();
  const { data, error } = await sb
    .from("runs")
    .insert({
      source: "server",
      ip,
      user_agent: ua,
      session_id: sessionId,
      type: args.type,
      status: args.status ?? "pending_review",
      guideline_id: args.guidelineId ?? null,
      template_id: args.templateId ?? null,
      media_type: args.mediaType ?? null,
      input_json: args.inputJson ?? {},
      output_json: args.outputJson ?? {},
      input_text: args.inputText ?? null,
      output_text: args.outputText ?? null,
      score: args.score ?? null,
      model: args.model ?? null,
      latency_ms: args.latencyMs ?? null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // Don't break the main API flow if persistence fails.
    console.error("[supabase] persistRun failed:", error.message);
    return null;
  }
  const spent = Date.now() - startedAt;
  if (spent > 1500) console.warn(`[supabase] persistRun slow: ${spent}ms`);
  return { runId: data.id as string };
}

export async function persistRunArtifact(args: {
  runId: string;
  kind: string;
  url?: string | null;
  mimeType?: string | null;
  dataJson?: Record<string, unknown>;
}): Promise<void> {
  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;
  const sb = getSupabaseServiceClient();
  const { error } = await sb.from("run_artifacts").insert({
    run_id: args.runId,
    kind: args.kind,
    url: args.url ?? null,
    mime_type: args.mimeType ?? null,
    data_json: args.dataJson ?? {},
  });
  if (error) console.error("[supabase] persistRunArtifact failed:", error.message);
}

