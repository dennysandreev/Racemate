import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  adminJobCatalog,
  makeAdminJobRequestKey,
  validateAdminJobRequest,
} from "./admin-job-catalog.ts";
import { sanitizeAdminAuditPayload } from "./admin-audit.ts";
import {
  SPORT_ADMIN_EDITABLE_TABLES,
  buildNewsEditorialUpdate,
  canReplacePollOptions,
  canTransitionAdminStatus,
} from "./admin-policies.ts";
import {
  toWorkerArguments,
  validateQueuedJob,
} from "../../worker/admin-job-queue.mjs";

test("admin job catalog contains unique allowlisted commands", () => {
  const names = adminJobCatalog.map((job) => job.name);
  const worker = readFileSync(new URL("../../worker/index.mjs", import.meta.url), "utf8");

  assert.equal(new Set(names).size, names.length);
  assert.ok(!names.includes("jobs.consume_queued"));
  assert.ok(!names.includes("jobs.enqueue_schedules"));
  assert.ok(names.includes("jolpica.publish_history"));
  for (const name of names) {
    assert.match(worker, new RegExp(`\\["${name.replaceAll(".", "\\.")}",`));
  }
});

test("production image includes the admin job catalog for the queue worker", () => {
  const dockerfile = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");

  assert.match(
    dockerfile,
    /COPY --from=builder \/app\/src\/config\/admin-jobs\.json \.\/src\/config\/admin-jobs\.json/,
  );
});

test("job validation rejects unknown commands and arbitrary parameters", () => {
  assert.equal(validateAdminJobRequest("shell.exec", {}).ok, false);
  assert.equal(
    validateAdminJobRequest("rss.fetch_all", { command: "rm" }).ok,
    false,
  );
  assert.equal(
    validateAdminJobRequest("reports.generate", { season: 2026, round: 31 }).ok,
    false,
  );
});

test("web and worker validators accept the same safe arguments", () => {
  const web = validateAdminJobRequest("reports.generate", {
    season: "2026",
    round: "4",
    force: "true",
  });

  assert.equal(web.ok, true);
  if (!web.ok) return;
  const worker = validateQueuedJob({
    job_name: "reports.generate",
    metadata: { args: web.args },
  });
  assert.equal(worker.ok, true);
  if (!worker.ok) return;
  assert.deepEqual(
    toWorkerArguments(worker.definition, worker.args),
    ["--season", "2026", "--round", "4", "--force"],
  );
});

test("request keys are stable inside one idempotency bucket", () => {
  const input = {
    requestedBy: "53ffb865-23b7-4bad-8b95-08844949896a",
    jobName: "rss.fetch_all",
    args: {},
    now: 10_001,
  };

  assert.equal(makeAdminJobRequestKey(input), makeAdminJobRequestKey({ ...input, now: 14_999 }));
  assert.notEqual(makeAdminJobRequestKey(input), makeAdminJobRequestKey({ ...input, nonce: "manual-retry" }));
});

test("audit sanitizer removes secrets, Telegram IDs, raw payloads, and masks email", () => {
  const sanitized = sanitizeAdminAuditPayload({
    email: "driver@example.com",
    token: "secret",
    chat_id: 123,
    raw_payload: { private: true },
    nested: { service_role_key: "secret", safe: "ok" },
  });
  const text = JSON.stringify(sanitized);

  assert.doesNotMatch(text, /secret|chat_id|raw_payload|driver@example\.com/);
  assert.match(text, /dr\*\*\*@example\.com/);
  assert.match(text, /safe/);
});

test("news slug stays stable across editorial updates", () => {
  const result = buildNewsEditorialUpdate({
    actorUserId: "53ffb865-23b7-4bad-8b95-08844949896a",
    body: "Текст",
    currentPublishedAt: "2026-07-01T10:00:00.000Z",
    currentSlug: "stable-news-slug",
    nextStatus: "draft",
    now: "2026-07-23T10:00:00.000Z",
    summary: "Лид",
    title: "Новый заголовок",
  });

  assert.equal(result.stableSlug, "stable-news-slug");
  assert.ok(!("slug" in result.update));
  assert.equal(result.update.published_at, "2026-07-01T10:00:00.000Z");
});

test("poll options lock after the first vote and closed polls do not reopen", () => {
  assert.equal(canReplacePollOptions(0), true);
  assert.equal(canReplacePollOptions(1), false);
  assert.equal(canTransitionAdminStatus("poll", "published", "closed"), true);
  assert.equal(canTransitionAdminStatus("poll", "closed", "published"), false);
});

test("sport policy excludes classifications and standings from manual writes", () => {
  assert.equal(SPORT_ADMIN_EDITABLE_TABLES.has("session_results"), false);
  assert.equal(SPORT_ADMIN_EDITABLE_TABLES.has("driver_standings"), false);
  assert.equal(SPORT_ADMIN_EDITABLE_TABLES.has("constructor_standings"), false);

  const operations = readFileSync(new URL("../app/admin/operations.ts", import.meta.url), "utf8");
  assert.doesNotMatch(operations, /\.from\(["']session_results["']\)\s*\.update/s);
  assert.doesNotMatch(operations, /\.from\(["']driver_standings["']\)\s*\.update/s);
});

test("migration protects audit and queue concurrency", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260723120000_operational_admin.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /alter table public\.admin_audit_log enable row level security/i);
  assert.match(migration, /revoke insert, update, delete, truncate on public\.admin_audit_log from anon, authenticated/i);
  assert.match(migration, /grant all on public\.admin_audit_log to service_role/i);
  assert.match(migration, /grant all on public\.admin_ai_budgets to service_role/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /create unique index if not exists idx_job_runs_active_request_key/i);
  assert.match(migration, /queue_version = 1/i);
});

test("editable schedules enqueue only allowlisted jobs through the durable queue", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260724130000_admin_ai_models_budgets_schedules.sql", import.meta.url),
    "utf8",
  );
  const compose = readFileSync(
    new URL("../../docker-compose.yml", import.meta.url),
    "utf8",
  );
  const scheduledJobs = [
    ...migration.matchAll(/\('[a-z0-9_]+', '([a-z0-9_.]+)', '(?:interval|daily)'/g),
  ].map((match) => match[1]);
  const allowlisted = new Set(adminJobCatalog.map((job) => job.name));

  assert.ok(scheduledJobs.length >= 15);
  assert.ok(scheduledJobs.every((jobName) => allowlisted.has(jobName)));
  assert.match(migration, /jsonb_build_object\([\s\S]*'args', v_schedule\.args/i);
  assert.match(compose, /jobs\.enqueue_schedules --limit 20/);
  assert.doesNotMatch(compose, /node worker\/index\.mjs social\.fetch_all/);
});

test("scheduled jobs do not pile up behind an active run", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260724144500_optimize_admin_job_schedules.sql", import.meta.url),
    "utf8",
  );

  assert.match(
    migration,
    /if not exists \([\s\S]*job_name = v_schedule\.job_name[\s\S]*status in \('queued', 'running'\)/i,
  );
  assert.match(
    migration,
    /where schedule_key in \([\s\S]*'circuit_stats_sync_all'[\s\S]*'notifications_dispatch'/i,
  );
  assert.match(migration, /where schedule_key = 'news_retry_dedup'/i);
});

test("results and reports use adaptive schedules with a daily fallback", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260724153000_adaptive_session_schedules.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /schedule_kind in \('interval', 'daily', 'adaptive'\)/i);
  assert.match(
    migration,
    /where job_name in \([\s\S]*'openf1\.sync_results'[\s\S]*'jolpica\.sync_results'[\s\S]*'reports\.check_latest'[\s\S]*'reports\.refresh_due'/i,
  );
  assert.match(migration, /schedule_kind = 'adaptive'[\s\S]*interval_minutes = 1440/i);
});

test("AI budgets include an enforceable X parsing sublimit", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260724130000_admin_ai_models_budgets_schedules.sql", import.meta.url),
    "utf8",
  );
  const worker = readFileSync(
    new URL("../../worker/index.mjs", import.meta.url),
    "utf8",
  );

  assert.match(migration, /scope in \('default', 'social_x'\)/i);
  assert.match(migration, /p_purpose = 'social\.x'/i);
  assert.match(worker, /await ensureAiBudgetAvailable\(purpose\)/);
  assert.match(worker, /post\.platform === "x"[\s\S]{0,100}"social\.x"/);
});

test("AI usage summary is aggregated in the database without a row cap", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260723213000_fix_ai_usage_accounting.sql", import.meta.url),
    "utf8",
  );
  const repository = readFileSync(
    new URL("../data/admin-repository.ts", import.meta.url),
    "utf8",
  );

  assert.match(migration, /sum\(input_tokens\)/i);
  assert.match(migration, /sum\(output_tokens\)/i);
  assert.match(migration, /sum\(estimated_cost_usd\)/i);
  assert.match(migration, /estimated_cost_usd type numeric\(18,\s*12\)/i);
  assert.match(migration, /grant execute on function public\.get_admin_ai_usage_summary\(timestamptz\)\s+to service_role/i);
  assert.match(repository, /rpc\("get_admin_ai_usage_summary"/);
  assert.doesNotMatch(repository, /ai_usage_logs"\)[\s\S]{0,220}\.limit\(2_000\)/);
});

test("historical publication remains behind the full readiness gate", () => {
  const worker = readFileSync(new URL("../../worker/index.mjs", import.meta.url), "utf8");
  const start = worker.indexOf("async function publishHistoricalSeasons()");
  const end = worker.indexOf("async function rebuildSeasonProfiles", start);
  const source = worker.slice(start, end);

  assert.match(source, /validateSeasonReadiness\(season\)/);
  assert.match(source, /if \(blocked\.length\)/);
  assert.ok(source.indexOf("if (blocked.length)") < source.indexOf('.update({ is_published: true'));
});
