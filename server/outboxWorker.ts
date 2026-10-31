/**
 * Standalone outbox relay for Railway (or local).
 * Usage: npm run worker:outbox
 *
 * Polls outbox_events every 5s, embeds/indexes approved runs with upsert + backoff.
 */
import "./load-env.js";
import { startOutboxRelay, stopOutboxRelay } from "./outboxRelay.js";

startOutboxRelay({ intervalMs: 5_000 });

const shutdown = (signal: string) => {
  console.log(`[outbox-worker] ${signal} — stopping`);
  stopOutboxRelay();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
