import assert from "node:assert/strict";
import test from "node:test";

import { selectTelemetryDemoCandidates } from "./demo-selection.ts";

const meeting = (id, start) => ({ id, start });

test("telemetry demo selects the Grand Prix completed two stages ago", () => {
  const candidates = selectTelemetryDemoCandidates([
    {
      year: 2026,
      meetings: [
        meeting("round-1", "2026-03-01T12:00:00Z"),
        meeting("round-2", "2026-03-15T12:00:00Z"),
        meeting("round-3", "2026-03-29T12:00:00Z"),
        meeting("round-4", "2026-04-12T12:00:00Z"),
      ],
    },
  ], Date.parse("2026-04-20T12:00:00Z"));

  assert.equal(candidates[0]?.id, "round-2");
});

test("telemetry demo falls back to the latest completed round of the previous season", () => {
  const candidates = selectTelemetryDemoCandidates([
    { year: 2026, meetings: [meeting("current-1", "2026-03-01T12:00:00Z")] },
    {
      year: 2025,
      meetings: [
        meeting("previous-1", "2025-11-01T12:00:00Z"),
        meeting("previous-2", "2025-12-01T12:00:00Z"),
      ],
    },
  ], Date.parse("2026-03-05T12:00:00Z"));

  assert.equal(candidates[0]?.id, "previous-2");
});
