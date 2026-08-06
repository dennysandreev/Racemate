import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260806104229_autonomous_admin_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);

const operationalTables = [
  "ops_service_heartbeats",
  "admin_agent_runs",
  "admin_findings",
  "admin_finding_events",
  "admin_action_requests",
];

test("autonomous administration tables use RLS and deny anonymous access", () => {
  for (const table of operationalTables) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    );
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from public, anon`, "i"),
    );
  }
});

test("operational tables are available only through the privileged backend", () => {
  for (const table of operationalTables) {
    assert.match(
      migration,
      new RegExp(`revoke select on table public\\.${table} from authenticated`, "i"),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke insert, update, delete, truncate, references, trigger[\\s\\S]*on table public\\.${table}[\\s\\S]*from authenticated`,
        "i",
      ),
    );
  }
});

test("finding history is append-only and active findings are deduplicated", () => {
  assert.match(
    migration,
    /grant select, insert on table public\.admin_finding_events to service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /grant select, insert, update, delete on table public\.admin_finding_events to service_role/i,
  );
  assert.match(
    migration,
    /create unique index if not exists idx_admin_findings_active_fingerprint[\s\S]*where status not in \('resolved', 'ignored'\)/i,
  );
});

test("high-risk action requests require a human approver", () => {
  assert.match(
    migration,
    /risk_class in \('R1', 'R2'\)[\s\S]*or status = 'proposed'[\s\S]*or approved_by_user_id is not null/i,
  );
});
