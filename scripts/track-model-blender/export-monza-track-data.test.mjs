import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { exportMonzaTrackData } from "./export-monza-track-data.mjs";

const projectRoot = path.resolve(import.meta.dirname, "../..");

test("Monza lap distances start at the real start-finish line", async () => {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "raceside-monza-export-"));

  try {
    const payload = await exportMonzaTrackData({
      outputPath: path.join(outputDirectory, "monza.json"),
      sourceDirectory: path.join(projectRoot, ".track-model-build/monza-source"),
    });

    assert.ok(
      Math.abs(payload.model.sourceStartFinishOffsetMeters - 5_722.384) < 1,
      `unexpected Monza start-finish offset: ${payload.model.sourceStartFinishOffsetMeters}`,
    );
    assert.deepEqual(
      payload.model.turns.map(({ distanceMeters }) => distanceMeters),
      [934, 969, 1_420, 2_152, 2_196, 2_523, 2_891, 3_960, 4_086, 4_150, 5_139],
    );
    assert.deepEqual(
      payload.model.turns.find(({ number }) => number === 11),
      {
        anchorDistanceMeters: 5_240,
        anchorHeightMeters: 5,
        anchorOffsetMeters: 16,
        curbEndMeters: 5_550,
        curbStartMeters: 5_120,
        distanceMeters: 5_139,
        name: "Curva Alboreto",
        number: 11,
      },
    );
  } finally {
    await rm(outputDirectory, { force: true, recursive: true });
  }
});
