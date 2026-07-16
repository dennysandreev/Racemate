import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeTelegramHtml,
  getFantasyDeadlineReminders,
  getSessionNotificationKey,
  getSessionNotificationSetting,
  hasSessionStartChanged,
  isRacePredictionComplete,
  isReminderDue,
  isNotificationFreshForConnection,
} from "./notification-rules.mjs";

test("maps every supported session to a preference group", () => {
  assert.equal(getSessionNotificationKey("fp1"), "practice");
  assert.equal(getSessionNotificationKey("sprint_qualifying"), "sprint_qualifying");
  assert.equal(getSessionNotificationKey("qualifying"), "qualifying");
  assert.equal(getSessionNotificationKey("sprint"), "sprint");
  assert.equal(getSessionNotificationKey("race"), "race");
});

test("uses the per-session reminder and spoiler settings", () => {
  const setting = getSessionNotificationSetting({
    session_notifications: {
      qualifying: {
        enabled: true,
        reminder_24h: true,
        reminder_1h: false,
        reminder_15m: true,
        spoiler_free: false,
      },
    },
  }, "qualifying");

  assert.deepEqual(setting, {
    enabled: true,
    reminder_24h: true,
    reminder_1h: false,
    reminder_15m: true,
    spoiler_free: false,
  });
});

test("keeps legacy preferences working during migration", () => {
  const setting = getSessionNotificationSetting({
    race_reminders: true,
    race_results: false,
    reminder_24h: false,
    reminder_1h: true,
    reminder_15m: false,
  }, "race");

  assert.equal(setting.enabled, true);
  assert.equal(setting.reminder_1h, true);
  assert.equal(setting.reminder_15m, false);
  assert.equal(setting.spoiler_free, true);
});

test("matches reminder only inside its delivery window", () => {
  const fourHours = 4 * 60 * 60 * 1_000;
  assert.equal(isReminderDue(fourHours, fourHours), true);
  assert.equal(isReminderDue(fourHours - 9 * 60 * 1_000, fourHours), true);
  assert.equal(isReminderDue(fourHours - 11 * 60 * 1_000, fourHours), false);
  assert.equal(isReminderDue(fourHours + 1, fourHours), false);
});

test("does not treat equivalent ISO timestamps as a schedule change", () => {
  assert.equal(
    hasSessionStartChanged("2026-12-06T13:00:00+00:00", "2026-12-06T13:00:00Z"),
    false,
  );
  assert.equal(
    hasSessionStartChanged("2026-12-06T13:00:00Z", "2026-12-06T13:15:00Z"),
    true,
  );
});

test("rejects queued events created before Telegram was connected", () => {
  assert.equal(
    isNotificationFreshForConnection("2026-07-13T14:20:00Z", "2026-07-13T14:25:00Z"),
    false,
  );
  assert.equal(
    isNotificationFreshForConnection("2026-07-13T14:25:00Z", "2026-07-13T14:25:00Z"),
    true,
  );
  assert.equal(isNotificationFreshForConnection("2026-07-13T14:25:00Z", null), true);
});

test("uses independent fantasy deadline reminder settings", () => {
  assert.deepEqual(
    getFantasyDeadlineReminders({
      fantasy_reminder_4h: false,
      fantasy_reminder_15m: true,
    }).map(({ enabled, key }) => ({ enabled, key })),
    [
      { enabled: false, key: "4h" },
      { enabled: true, key: "15m" },
    ],
  );
});

test("race deadline does not require a qualification pick", () => {
  const prediction = {
    pole_driver_id: null,
    fastest_lap_driver_id: "driver-1",
    dnf_pick_kind: "none",
    dnf_driver_id: null,
    top_scoring_team_id: "team-1",
    fastest_pit_stop_team_id: "team-2",
    top10_driver_ids: Array.from({ length: 10 }, (_, index) => `driver-${index}`),
  };

  assert.equal(isRacePredictionComplete(prediction), true);
  prediction.top10_driver_ids[9] = "driver-1";
  assert.equal(isRacePredictionComplete(prediction), false);
});

test("escapes Telegram HTML", () => {
  assert.equal(escapeTelegramHtml("A & B < C"), "A &amp; B &lt; C");
});
