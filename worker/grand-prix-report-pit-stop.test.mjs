import assert from "node:assert/strict";
import test from "node:test";

import { getReplayPitStopDuration } from "./index.mjs";

test("uses OpenF1 stop_duration instead of pit-lane duration", () => {
  assert.equal(getReplayPitStopDuration({
    lane_duration: 22.159,
    pit_duration: 22.159,
    stop_duration: 2.1,
  }), 2.1);
});

test("never treats deprecated pit_duration as stationary time", () => {
  assert.equal(getReplayPitStopDuration({ pit_duration: 22.159 }), null);
  assert.equal(getReplayPitStopDuration({ lane_duration: 22.159 }), null);
  assert.equal(getReplayPitStopDuration({ lane_duration: 22.159, stop_duration: 0 }), null);
  assert.equal(getReplayPitStopDuration({ lane_duration: 22.159, stop_duration: 12 }), null);
});
