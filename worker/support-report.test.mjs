import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDailySupportReport,
  getPreviousMoscowDayWindow,
} from "./support-report.mjs";

test("daily support report uses the previous Moscow calendar day", () => {
  const window = getPreviousMoscowDayWindow(new Date("2026-08-20T07:00:00.000Z"));

  assert.deepEqual(window, {
    dateKey: "2026-08-19",
    start: "2026-08-18T21:00:00.000Z",
    end: "2026-08-19T21:00:00.000Z",
  });
});

test("daily support report includes current health, operations, and both API costs", () => {
  const window = getPreviousMoscowDayWindow(new Date("2026-08-20T07:00:00.000Z"));
  const text = buildDailySupportReport({
    currentStatus: "attention",
    currentProblems: ["Планировщик не подтверждает работу"],
    jobs: { succeeded: 17, failed: 2, queued: 1, running: 0 },
    content: { newsPublished: 12, socialPublished: 8, digestsPublished: 1 },
    notifications: { sent: 31, failed: 1 },
    costs: { ai: 0.1234, aiRequests: 14, aiTokens: 9_876, x: 0.075, xPosts: 15 },
    reports: { newCount: 3, resolvedCount: 1 },
    findings: { active: 4, urgent: 1 },
  }, { now: new Date("2026-08-20T07:00:00.000Z"), window });

  assert.match(text, /есть компоненты, которые требуют внимания/);
  assert.match(text, /Планировщик не подтверждает работу/);
  assert.match(text, /AI API: \$0\.1234/);
  assert.match(text, /X API: \$0\.0750 \(15 постов\)/);
  assert.match(text, /Новых сообщений об ошибках: 3/);
});
