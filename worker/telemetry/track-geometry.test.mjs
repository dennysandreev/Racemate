import test from "node:test";
import assert from "node:assert/strict";
import tracks from "./tracks.json" with { type: "json" };

test("telemetry maps use the model horizontal plane, never elevation", async () => {
  for (const track of tracks) {
    const modelExports = await import(
      new URL(`../../${track.source.split(": ")[1]}`, import.meta.url)
    );
    const model = Object.values(modelExports).find(
      (value) => value.points && value.lapLengthKm,
    );
    assert.equal(track.points.length, model.points.length, track.id);
    for (let i = 0; i < model.points.length; i++) {
      const [progress, x, y] = model.points[i];
      assert.deepEqual(
        track.points[i],
        { distance: progress * track.length, x, y: -y },
        `${track.id} point ${i}`,
      );
    }
  }
});
test("Monza retains a closed two-dimensional circuit with all eleven corners", () => {
  const track = tracks.find((t) => t.id === "monza");
  const xs = track.points.map((p) => p.x),
    ys = track.points.map((p) => p.y);
  const aspect =
    (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
  assert.ok(aspect > 0.3 && aspect < 0.9, `Monza aspect ${aspect}`);
  assert.equal(track.corners.length, 11);
  assert.equal(track.length, 5793);
  assert.ok(
    Math.hypot(
      track.points[0].x - track.points.at(-1).x,
      track.points[0].y - track.points.at(-1).y,
    ) < 1,
  );
});
