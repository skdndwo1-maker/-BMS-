import { embedTextWithGemini } from "./geminiEmbeddings.js";
import { normalizeRunForRag } from "./ragNormalize.js";
import {
  insertChunksWithEmbeddings,
  isSupabaseRagEnabled,
  splitIntoChunks,
  upsertRunQaSource,
} from "./rag.js";
import { getSupabaseServiceClient } from "./supabase.js";

export type OutboxEventRow = {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown> | null;
  attempts: number;
  next_run_at: string;
  processed_at: string | null;
  dead_at: string | null;
  last_error: string | null;
};

const MAX_ATTEMPTS = 5;
const POLL_MS = 5_000;
const CLAIM_LIMIT = 5;

/** 지수 백오프: attempts=1 → 10s, 2 → 20s, 3 → 40s, 4 → 80s */
export function outboxBackoffSeconds(attemptsAfterFail: number): number {
  return Math.pow(2, Math.max(1, attemptsAfterFail)) * 5;
}

async function markProcessed(eventId: string): Promise<void> {
  const sb = getSupabaseServiceClient();
  const { error } = await sb
    .from("outbox_events")
    .update({
      processed_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);
  if (error) throw new Error(`outbox markProcessed failed: ${error.message}`);
}

async function markFailure(event: OutboxEventRow, errMsg: string): Promise<void> {
  const sb = getSupabaseServiceClient();
  const nextAttempts = (event.attempts ?? 0) + 1;
  const now = Date.now();
  const patch: Record<string, unknown> = {
    attempts: nextAttempts,
    last_error: errMsg.slice(0, 2000),
    updated_at: new Date().toISOString(),
  };
  if (nextAttempts >= MAX_ATTEMPTS) {
    patch.dead_at = new Date(now).toISOString();
    console.error(
      `[outbox] dead-letter event=${event.id.slice(0, 8)} type=${event.event_type} attempts=${nextAttempts}: ${errMsg}`
    );
  } else {
    const delaySec = outboxBackoffSeconds(nextAttempts);
    patch.next_run_at = new Date(now + delaySec * 1000).toISOString();
    console.warn(
      `[outbox] retry event=${event.id.slice(0, 8)} attempts=${nextAttempts}/${MAX_ATTEMPTS} next_in=${delaySec}s: ${errMsg}`
    );
  }
  const { error } = await sb.from("outbox_events").update(patch).eq("id", event.id);
  if (error) console.error(`[outbox] markFailure update failed:`, error.message);
}

async function indexApprovedRun(runId: string): Promise<void> {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY unset — cannot embed");
  }
  if (!isSupabaseRagEnabled()) {
    throw new Error("Supabase RAG env missing (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)");
  }

  const sb = getSupabaseServiceClient();
  const { data: run, error: runErr } = await sb
    .from("runs")
    .select("id,type,guideline_id,input_text,output_text,input_json,output_json,status")
    .eq("id", runId)
    .single();
  if (runErr) throw new Error(runErr.message);
  if (!run) throw new Error("run_not_found");
  if (String(run.status) !== "approved") {
    throw new Error(`run_not_approved status=${String(run.status)}`);
  }

  const title = `Approved ${String(run.type)} — ${runId.slice(0, 8)}`;
  const src = await upsertRunQaSource({
    runId,
    title,
    guidelineId: run.guideline_id ?? null,
  });
  if (!src?.sourceId) throw new Error("upsertRunQaSource returned no sourceId");

  const normalized = normalizeRunForRag({
    type: String(run.type ?? ""),
    guidelineId: run.guideline_id ?? null,
    outputJson: run.output_json,
    outputText: run.output_text,
    inputJson: run.input_json,
    inputText: run.input_text,
  });
  const normalizedTrim = normalized.trim();
  const fallbackText = String(run.output_text ?? "").trim();
  const fallbackJson = JSON.stringify(run.output_json ?? {});
  const corpus = normalizedTrim || fallbackText || fallbackJson;
  const chunks = splitIntoChunks(corpus, { chunkChars: 1000, overlapChars: 140 });

  console.log(
    `[outbox] RAG index run=${runId.slice(0, 8)} type=${String(run.type)} chars=${corpus.length} chunks=${chunks.length}`
  );

  const result = await insertChunksWithEmbeddings({
    sourceId: src.sourceId,
    chunks,
    embeddingModel: "gemini-embedding-001",
    embed: (t) => embedTextWithGemini(t, { model: "gemini-embedding-001" }),
  });
  if (!result) throw new Error("insertChunksWithEmbeddings returned null");
  if (chunks.length > 0 && result.embedded === 0) {
    throw new Error(`no embeddings persisted (failed=${result.failed})`);
  }
  console.log(
    `[outbox] RAG persisted run=${runId.slice(0, 8)} inserted=${result.inserted} embedded=${result.embedded} failed=${result.failed}`
  );
}

export async function processOutboxEvent(event: OutboxEventRow): Promise<void> {
  if (event.event_type === "run_approved_rag_index") {
    const fromPayload =
      typeof event.payload?.run_id === "string" ? event.payload.run_id.trim() : "";
    const runId = fromPayload || event.aggregate_id;
    if (!runId) throw new Error("run_id missing on outbox event");
    await indexApprovedRun(runId);
    return;
  }
  throw new Error(`unknown_event_type:${event.event_type}`);
}

export async function claimAndProcessOutboxBatch(limit = CLAIM_LIMIT): Promise<number> {
  if (!isSupabaseRagEnabled()) return 0;
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb.rpc("claim_outbox_events", { p_limit: limit });
  if (error) {
    console.error("[outbox] claim_outbox_events failed:", error.message);
    return 0;
  }
  const events = (data ?? []) as OutboxEventRow[];
  for (const event of events) {
    try {
      await processOutboxEvent(event);
      await markProcessed(event.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markFailure(event, msg);
    }
  }
  return events.length;
}

let relayTimer: ReturnType<typeof setInterval> | null = null;
let relayBusy = false;

export function startOutboxRelay(opts?: { intervalMs?: number }): void {
  if (relayTimer) return;
  if (process.env.OUTBOX_RELAY_DISABLED === "1") {
    console.log("[outbox] relay disabled (OUTBOX_RELAY_DISABLED=1)");
    return;
  }
  if (!isSupabaseRagEnabled()) {
    console.warn("[outbox] relay not started — Supabase RAG env missing");
    return;
  }

  const intervalMs = opts?.intervalMs ?? POLL_MS;
  const tick = async () => {
    if (relayBusy) return;
    relayBusy = true;
    try {
      await claimAndProcessOutboxBatch(CLAIM_LIMIT);
    } catch (e) {
      console.error("[outbox] relay tick failed:", e instanceof Error ? e.message : String(e));
    } finally {
      relayBusy = false;
    }
  };

  console.log(`[outbox] relay started (poll every ${intervalMs}ms)`);
  void tick();
  relayTimer = setInterval(() => {
    void tick();
  }, intervalMs);
}

export function stopOutboxRelay(): void {
  if (!relayTimer) return;
  clearInterval(relayTimer);
  relayTimer = null;
}
