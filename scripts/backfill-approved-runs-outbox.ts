/**
 * 이미 approved인데 outbox에 RAG 색인 이벤트가 없는 run에 대해
 * run_approved_rag_index 이벤트를 enqueue합니다. (기존 데이터 삭제 없음)
 *
 * Usage:
 *   npm run backfill:approved-outbox -- --dry-run
 *   npm run backfill:approved-outbox -- --apply
 *
 * --dry-run: 대상 건수만 출력하고 종료
 * --apply: 실제로 outbox_events insert
 */
import "../server/load-env.js";
import { getSupabaseServiceClient } from "../server/supabase.js";

const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");

type RunRow = { id: string; type: string | null; created_at: string };

async function main() {
  if (!dryRun && !apply) {
    console.error("Specify --dry-run or --apply");
    process.exit(1);
  }
  if (dryRun && apply) {
    console.error("Use only one of --dry-run or --apply");
    process.exit(1);
  }

  const sb = getSupabaseServiceClient();

  // approved runs
  const { data: runs, error: runsErr } = await sb
    .from("runs")
    .select("id,type,created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  if (runsErr) throw new Error(runsErr.message);
  const allApproved = (runs ?? []) as RunRow[];

  // existing outbox events for this event type (any state)
  const { data: existing, error: exErr } = await sb
    .from("outbox_events")
    .select("aggregate_id")
    .eq("event_type", "run_approved_rag_index")
    .eq("aggregate_type", "run");
  if (exErr) throw new Error(exErr.message);

  const hasEvent = new Set((existing ?? []).map((r) => String((r as { aggregate_id: string }).aggregate_id)));
  const targets = allApproved.filter((r) => !hasEvent.has(r.id));

  console.log("[backfill] approved_runs=", allApproved.length);
  console.log("[backfill] already_have_outbox=", hasEvent.size);
  console.log("[backfill] targets_to_enqueue=", targets.length);

  if (dryRun) {
    console.log("[backfill] dry-run — no writes");
    if (targets.length > 0) {
      console.log(
        "[backfill] sample ids:",
        targets
          .slice(0, 5)
          .map((t) => t.id)
          .join(", ")
      );
    }
    return;
  }

  let inserted = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();
  for (const run of targets) {
    const { error } = await sb.from("outbox_events").insert({
      event_type: "run_approved_rag_index",
      aggregate_type: "run",
      aggregate_id: run.id,
      payload: { run_id: run.id, backfill: true },
      attempts: 0,
      next_run_at: nowIso,
    });
    if (error) {
      failed += 1;
      console.error(`[backfill] insert failed run=${run.id.slice(0, 8)}:`, error.message);
    } else {
      inserted += 1;
    }
  }

  console.log("[backfill] apply done inserted=", inserted, "failed=", failed);
}

main().catch((e) => {
  console.error("[backfill] fatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
