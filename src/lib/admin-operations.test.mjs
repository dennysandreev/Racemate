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
  isNewsRemovedFromFeed,
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
  assert.ok(names.includes("ops.watch"));
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

test("only a previously published draft is marked as removed from the feed", () => {
  assert.equal(isNewsRemovedFromFeed("draft", "2026-08-20T10:00:00.000Z"), true);
  assert.equal(isNewsRemovedFromFeed("draft", null), false);
  assert.equal(isNewsRemovedFromFeed("published", "2026-08-20T10:00:00.000Z"), false);
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

test("editorial multi-step writes are atomic and backend-only", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260914115411_harden_admin_operations.sql", import.meta.url),
    "utf8",
  );

  for (const functionName of [
    "admin_save_news_article",
    "admin_moderate_social_post",
    "admin_save_poll",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${functionName}[\\s\\S]+from public, anon, authenticated`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}[\\s\\S]+to service_role`, "i"));
  }
  assert.match(migration, /set search_path = ''/i);
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
  assert.match(compose, /jobs\.enqueue_schedules[\s\S]*--limit[\s\S]*["']20["']/);
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

test("X API reads have independent cost accounting and limits", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260820070413_admin_external_costs_support_reports.sql", import.meta.url),
    "utf8",
  );
  const worker = readFileSync(
    new URL("../../worker/index.mjs", import.meta.url),
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.external_api_usage_events/i);
  assert.match(migration, /unique \(provider, resource_type, resource_id, billing_date\)/i);
  assert.match(migration, /values \('x', 'post_read', 0\.005, 5, 50\)/i);
  assert.match(migration, /create or replace function public\.get_x_api_budget_guard\(\)/i);
  assert.match(worker, /await ensureXApiBudgetAvailable\(\)/);
  assert.match(worker, /await recordXApiPostReads\(source, payload, budget\.unitCostUsd\)/);
});

test("daily digest returns the model that was actually used", () => {
  const worker = readFileSync(new URL("../../worker/index.mjs", import.meta.url), "utf8");

  assert.match(worker, /metadata: \{ dateKey, model: usedModel, windowStart \}/);
  assert.doesNotMatch(worker, /metadata: \{ dateKey, model, windowStart \}/);
});

test("public error reports are rate limited and cannot write directly to the table", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260820070413_admin_external_costs_support_reports.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /alter table public\.user_error_reports enable row level security/i);
  assert.match(migration, /revoke all on table public\.user_error_reports[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /report_rate_limited/i);
  assert.match(migration, /grant execute on function public\.submit_news_error_report[\s\S]*to anon, authenticated, service_role/i);

  const deliveryMigration = readFileSync(
    new URL("../../supabase/migrations/20260820073500_secure_error_report_delivery.sql", import.meta.url),
    "utf8",
  );
  const publicAction = readFileSync(new URL("../app/news/actions.ts", import.meta.url), "utf8");
  assert.match(deliveryMigration, /telegram_status = 'pending'/i);
  assert.match(deliveryMigration, /created_at >= now\(\) - interval '10 minutes'/i);
  assert.doesNotMatch(publicAction, /createSupabaseAdminClient/);
});

test("feed removal is reversible and does not delete content", () => {
  const operations = readFileSync(new URL("../app/admin/operations.ts", import.meta.url), "utf8");
  const newsStart = operations.indexOf("export async function hideNewsArticleAction");
  const newsEnd = operations.indexOf("export async function reprocessNewsArticleAction", newsStart);
  const socialStart = operations.indexOf("export async function hideSocialPostAction");
  const socialEnd = operations.indexOf("export async function saveSocialSourceAction", socialStart);
  const newsAction = operations.slice(newsStart, newsEnd);
  const socialAction = operations.slice(socialStart, socialEnd);

  assert.match(newsAction, /publication_status: "draft"/);
  assert.match(newsAction, /\.select\("id"\)\s*\.maybeSingle\(\)/);
  assert.doesNotMatch(newsAction, /\.delete\(\)/);
  assert.match(socialAction, /status: "rejected"/);
  assert.doesNotMatch(socialAction, /\.delete\(\)/);
});

test("duplicate news can be published only through a guarded manual override", () => {
  const operations = readFileSync(new URL("../app/admin/operations.ts", import.meta.url), "utf8");
  const start = operations.indexOf("export async function publishDuplicateNewsAction");
  const end = operations.indexOf("export async function reprocessNewsArticleAction", start);
  const action = operations.slice(start, end);

  assert.match(action, /before\.publication_status !== "duplicate"/);
  assert.match(action, /\.eq\("publication_status", "duplicate"\)/);
  assert.match(action, /publication_status: "published"/);
  assert.match(action, /duplicate_of: null/);
  assert.match(action, /decision_source: "manual_override"/);
  assert.match(action, /action: "news\.duplicate\.publish"/);
});

test("confirmed actions keep the dialog mounted until the server action finishes", () => {
  const component = readFileSync(
    new URL("../components/admin/admin-confirmed-action.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(component, /AlertDialogAction/);
  assert.match(component, /if \(result\.ok\) setOpen\(false\)/);
  assert.match(component, /<Button disabled=\{pending\} type="submit">/);
});

test("news admin keeps stable row positions and hides the generic AI failure", () => {
  const repository = readFileSync(
    new URL("../data/admin-repository.ts", import.meta.url),
    "utf8",
  );
  const start = repository.indexOf("export async function loadAdminNews");
  const end = repository.indexOf("export async function loadAdminSocial", start);
  const newsLoader = repository.slice(start, end);

  assert.match(newsLoader, /\.order\("ingested_at", \{ ascending: false \}\)/);
  assert.doesNotMatch(newsLoader, /\.order\("updated_at", \{ ascending: false \}\)/);
  assert.doesNotMatch(newsLoader, /AI не вернул готовый русский текст/);
});

test("removed news has one clear state and pagination keeps its counter on one line", () => {
  const page = readFileSync(new URL("../app/admin/news/page.tsx", import.meta.url), "utf8");
  const adminUi = readFileSync(new URL("../components/admin/admin-ui.tsx", import.meta.url), "utf8");

  assert.match(page, /<AdminStatusBadge status="removed_from_feed" \/>/);
  assert.doesNotMatch(page, /<Badge variant="outline">Снято с ленты<\/Badge>/);
  assert.match(adminUi, /removed_from_feed: "Снято с ленты"/);
  assert.match(adminUi, /className="min-w-28 whitespace-nowrap px-4"/);
  assert.match(adminUi, /<PaginationLink[\s\S]*?size="default"/);
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
