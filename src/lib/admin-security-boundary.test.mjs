import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminPageSources = [
  "page.tsx",
  "news/page.tsx",
  "social/page.tsx",
  "reports/page.tsx",
  "sport/page.tsx",
  "community/page.tsx",
  "users/page.tsx",
  "notifications/page.tsx",
  "jobs/page.tsx",
  "ai/page.tsx",
  "audit/page.tsx",
  "schedules/page.tsx",
  "systems/page.tsx",
  "findings/page.tsx",
].map((path) => ({
  path,
  source: readFileSync(new URL(`../app/admin/${path}`, import.meta.url), "utf8"),
}));
const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const repositorySource = readFileSync(new URL("../data/racemate-repository.ts", import.meta.url), "utf8");
const aiPromptMigrationSource = readFileSync(
  new URL("../../supabase/migrations/20260724120000_admin_ai_prompt_versions.sql", import.meta.url),
  "utf8",
);
const schedulesMigrationSource = readFileSync(
  new URL("../../supabase/migrations/20260724130000_admin_ai_models_budgets_schedules.sql", import.meta.url),
  "utf8",
);
const adminGrantMigrationSource = readFileSync(
  new URL("../../supabase/migrations/20260724131000_harden_admin_runtime_table_grants.sql", import.meta.url),
  "utf8",
);

test("every admin page verifies the role before creating a privileged client", () => {
  for (const page of adminPageSources) {
    const guardIndex = page.source.indexOf("await requireAdmin()");
    const clientIndex = page.source.indexOf("createSupabaseAdminClient()");

    assert.ok(guardIndex >= 0, `${page.path} must call requireAdmin()`);
    assert.ok(clientIndex >= 0, `${page.path} must create its explicit admin client`);
    assert.ok(guardIndex < clientIndex, `${page.path} must guard before privileged access`);
  }
});

test("proxy treats admin routes as authenticated routes", () => {
  assert.match(proxySource, /protectedRoutes\s*:\s*string\[\]\s*=\s*\[[^\]]*["']\/admin["']/s);
});

test("privileged social loaders require an explicit admin client", () => {
  for (const [functionName, nextFunctionName] of [
    ["getAdminSocialSources", "getAdminSocialPosts"],
    ["getAdminSocialPosts", "getAdminGrandPrixReports"],
  ]) {
    const start = repositorySource.indexOf(`export async function ${functionName}`);
    const end = repositorySource.indexOf(`export async function ${nextFunctionName}`, start + 1);
    const functionSource = repositorySource.slice(start, end);

    assert.ok(start >= 0 && end > start, `${functionName} must exist`);
    assert.doesNotMatch(
      functionSource,
      /createSupabaseAdminClient\(\)/,
      `${functionName} must not create privileged credentials internally`,
    );
  }
});

test("AI prompt versions are admin-readable and service-role writable only", () => {
  assert.match(
    aiPromptMigrationSource,
    /alter table public\.ai_prompt_versions enable row level security/i,
  );
  assert.match(
    aiPromptMigrationSource,
    /using \(public\.is_admin\(\)\)/i,
  );
  assert.match(
    aiPromptMigrationSource,
    /revoke insert, update, delete, truncate on public\.ai_prompt_versions from anon, authenticated/i,
  );
  assert.match(
    aiPromptMigrationSource,
    /grant execute on function public\.save_admin_ai_prompt_version[\s\S]+to service_role/i,
  );
});

test("AI prompt publishing is atomic and allows only one published version", () => {
  assert.match(
    aiPromptMigrationSource,
    /create unique index[\s\S]+where status = 'published'/i,
  );
  assert.match(
    aiPromptMigrationSource,
    /pg_advisory_xact_lock\(hashtextextended\(p_prompt_key, 0\)\)/i,
  );
  assert.match(
    aiPromptMigrationSource,
    /set status = 'archived'[\s\S]+status = 'published'/i,
  );
});

test("job schedules are admin-readable and service-role writable only", () => {
  assert.match(
    schedulesMigrationSource,
    /alter table public\.admin_job_schedules enable row level security/i,
  );
  assert.match(
    schedulesMigrationSource,
    /revoke insert, update, delete, truncate\s+on public\.admin_job_schedules\s+from anon, authenticated/i,
  );
  assert.match(
    schedulesMigrationSource,
    /grant execute on function public\.enqueue_due_admin_schedules\(integer\)\s+to service_role/i,
  );
  assert.match(schedulesMigrationSource, /for update skip locked/i);
});

test("anonymous Data API grants are removed from every admin runtime table", () => {
  for (const table of [
    "admin_job_schedules",
    "ai_prompt_versions",
    "admin_ai_budgets",
    "admin_audit_log",
  ]) {
    assert.match(
      adminGrantMigrationSource,
      new RegExp(`revoke all on table public\\.${table} from anon`, "i"),
    );
  }
});
