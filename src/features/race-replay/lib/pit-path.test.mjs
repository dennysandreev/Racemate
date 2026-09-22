import assert from "node:assert/strict";
import test from "node:test";
import { alignPitTrackProgress, connectModelPitLane } from "./pit-path.ts";

test("3D progress matches model pit endpoints without reversing across start/finish", () => {
  const source = {entry: 0.97, exit: 0.05};
  const target = {entry: 0.9, exit: 0.13};
  assert.ok(Math.abs(alignPitTrackProgress(source.entry, source, target) - target.entry) < 1e-8);
  assert.ok(Math.abs(alignPitTrackProgress(source.exit, source, target) - target.exit) < 1e-8);
  let previous = alignPitTrackProgress(0, source, target);
  for (let i = 1; i <= 1000; i++) {
    const current = alignPitTrackProgress(i / 1000, source, target);
    assert.ok((current - previous + 1) % 1 < 0.004);
    previous = current;
  }
});

test("pit lane joins the circuit in XY, not elevation, and retains height", () => {
  const track = [[0,0,0,100], [.25,100,0,100], [.5,100,100,100], [.75,0,100,100], [1,0,0,100]];
  const pit = [[0,98,1,101], [.5,90,50,101], [1,98,99,101]];
  const joined = connectModelPitLane(track, pit);
  assert.deepEqual(joined.anchors, {entry: .25, exit: .5});
  assert.deepEqual(joined.points[0], [0,100,0,100]);
  assert.deepEqual(joined.points.at(-1), [1,100,100,100]);
});
