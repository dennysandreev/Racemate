import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdaptiveReportCheckPlan,
  getAdaptiveReportRefreshPlan,
  getAdaptiveResultPlan,
  getAdaptiveStartingGridPlan,
  getLatestStartedRound,
  isStoredResultComplete,
} from "./adaptive-job-schedule.mjs";

const NOW = Date.parse("2026-07-24T18:00:00.000Z");

test("keeps result checks daily when there is no relevant session", () => {
  const plan = getAdaptiveResultPlan({
    nowMs: NOW,
    provider: "openf1",
    sessions: [],
  });

  assert.equal(plan.mode, "daily");
  assert.equal(plan.nextRunAt, "2026-07-25T18:00:00.000Z");
});

test("checks the starting grid hourly only between qualifying and the race", () => {
  const active = getAdaptiveStartingGridPlan({
    nowMs: NOW,
    weekends: [{
      qualifyingEndAt: "2026-07-24T16:00:00.000Z",
      raceStartAt: "2026-07-25T14:00:00.000Z",
    }],
  });
  const afterRace = getAdaptiveStartingGridPlan({
    nowMs: NOW,
    weekends: [{
      qualifyingEndAt: "2026-07-23T16:00:00.000Z",
      raceStartAt: "2026-07-24T17:00:00.000Z",
    }],
  });

  assert.equal(active.mode, "grid_updates");
  assert.equal(active.intervalMinutes, 60);
  assert.equal(afterRace.mode, "daily");
});

test("stops grid polling when the next hourly check would be after lights out", () => {
  const plan = getAdaptiveStartingGridPlan({
    nowMs: NOW,
    weekends: [{
      qualifyingEndAt: "2026-07-24T16:00:00.000Z",
      raceStartAt: "2026-07-24T18:30:00.000Z",
    }],
  });

  assert.equal(plan.mode, "daily");
});

test("opens the OpenF1 fast window after the provider delay", () => {
  const waiting = getAdaptiveResultPlan({
    hasLiveAccess: false,
    nowMs: NOW,
    provider: "openf1",
    sessions: [{
      endAt: "2026-07-24T18:10:00.000Z",
      isComplete: false,
      sessionType: "fp2",
    }],
  });
  const active = getAdaptiveResultPlan({
    hasLiveAccess: false,
    nowMs: NOW,
    provider: "openf1",
    sessions: [{
      endAt: "2026-07-24T17:00:00.000Z",
      isComplete: false,
      sessionType: "fp2",
    }],
  });

  assert.equal(waiting.mode, "waiting_for_session");
  assert.equal(waiting.nextRunAt, "2026-07-24T18:41:00.000Z");
  assert.equal(active.mode, "active");
  assert.equal(active.intervalMinutes, 5);
  assert.equal(active.nextRunAt, "2026-07-24T18:05:00.000Z");
});

test("stops fast polling as soon as the classification is complete", () => {
  const plan = getAdaptiveResultPlan({
    nowMs: NOW,
    provider: "jolpica",
    sessions: [{
      endAt: "2026-07-24T17:30:00.000Z",
      isComplete: true,
      sessionType: "qualifying",
    }],
  });

  assert.equal(plan.mode, "daily");
  assert.equal(plan.nextRunAt, "2026-07-25T18:00:00.000Z");
});

test("Jolpica checks only official result session types", () => {
  const plan = getAdaptiveResultPlan({
    nowMs: NOW,
    provider: "jolpica",
    sessions: [
      {
        endAt: "2026-07-24T17:30:00.000Z",
        isComplete: false,
        sessionType: "fp2",
      },
      {
        endAt: "2026-07-24T17:30:00.000Z",
        isComplete: false,
        sessionType: "qualifying",
      },
    ],
  });

  assert.equal(plan.mode, "active");
  assert.equal(plan.intervalMinutes, 15);
});

test("report check activates after a race and sleeps after completion", () => {
  const active = getAdaptiveReportCheckPlan({
    nowMs: NOW,
    races: [{
      endAt: "2026-07-24T17:30:00.000Z",
      reportComplete: false,
    }],
  });
  const complete = getAdaptiveReportCheckPlan({
    nowMs: NOW,
    races: [{
      endAt: "2026-07-24T17:30:00.000Z",
      reportComplete: true,
    }],
  });

  assert.equal(active.mode, "active");
  assert.equal(active.intervalMinutes, 15);
  assert.equal(complete.mode, "daily");
});

test("report refresh follows the earliest persisted refresh timestamp", () => {
  const plan = getAdaptiveReportRefreshPlan({
    nowMs: NOW,
    nextRefreshAt: "2026-07-24T18:30:00.000Z",
  });

  assert.equal(plan.mode, "report_refresh");
  assert.equal(plan.nextRunAt, "2026-07-24T18:30:00.000Z");
});

test("scheduled Jolpica sync targets only the latest started round", () => {
  assert.equal(getLatestStartedRound([
    { round: 10, startAt: "2026-07-05T13:00:00.000Z" },
    { round: 11, startAt: "2026-07-24T15:00:00.000Z" },
    { round: 12, startAt: "2026-08-02T13:00:00.000Z" },
  ], NOW), 11);
});

test("Jolpica race stays incomplete until the starting grid is available", () => {
  const base = {
    minimumRows: 20,
    provider: "jolpica",
    sessionType: "race",
  };

  assert.equal(isStoredResultComplete({
    ...base,
    counts: { jolpica: 22, jolpicaGrid: 0, openf1: 0 },
  }), false);
  assert.equal(isStoredResultComplete({
    ...base,
    counts: { jolpica: 22, jolpicaGrid: 22, openf1: 0 },
  }), true);
  assert.equal(isStoredResultComplete({
    ...base,
    sessionType: "qualifying",
    counts: { jolpica: 22, jolpicaGrid: 0, openf1: 0 },
  }), true);
});

test("OpenF1 race stays incomplete until championship points are persisted", () => {
  const base = {
    minimumRows: 20,
    provider: "openf1",
    sessionType: "race",
  };

  assert.equal(isStoredResultComplete({
    ...base,
    counts: { jolpica: 0, jolpicaGrid: 0, openf1: 22, openf1WithPoints: 0 },
  }), false);
  assert.equal(isStoredResultComplete({
    ...base,
    counts: { jolpica: 0, jolpicaGrid: 0, openf1: 22, openf1WithPoints: 22 },
  }), true);
  assert.equal(isStoredResultComplete({
    ...base,
    sessionType: "qualifying",
    counts: { jolpica: 0, jolpicaGrid: 0, openf1: 22, openf1WithPoints: 0 },
  }), true);
});
