"""Source preflight tests; run with python3, without Blender or network."""

import importlib.util
import math
from pathlib import Path
import tempfile
import unittest


SPEC = importlib.util.spec_from_file_location(
    "baku_sources", Path(__file__).with_name("prepare-baku-sources.py"))
baku = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(baku)


class BakuSourceTests(unittest.TestCase):
    def test_projection_uses_baku_zone(self):
        east, north = baku.utm39n(0, 51)
        self.assertAlmostEqual(east, 500000, places=6)
        self.assertAlmostEqual(north, 0, places=6)
        east, north = baku.utm39n(40.3721915, 49.8517072)
        self.assertTrue(400000 < east < 404000)
        self.assertTrue(4460000 < north < 4480000)

    def test_projection_preserves_metric_distance(self):
        a, b = baku.utm39n(40.37, 49.85), baku.utm39n(40.371, 49.85)
        self.assertTrue(110 < math.dist(a, b) < 112)

    def test_line_projection_uses_segment_not_nearest_vertex(self):
        separation, distance, point, index = baku.project_to_line(
            [[0, 0], [100, 0], [100, 100]], [45, 3])
        self.assertEqual((separation, distance, point, index), (3, 45, [45, 0], 1))

    def test_projection_handles_duplicate_vertices(self):
        result = baku.project_to_line([[0, 0], [0, 0], [100, 0]], [30, 4])
        self.assertEqual(result[:3], (4, 30, [30, 0]))

    def test_missing_relation_is_an_error(self):
        with self.assertRaisesRegex(ValueError, "relation is missing"):
            baku.extract_geometry(b"<osm/>")

    def test_offline_mode_never_downloads_missing_sources(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "Missing cached source"):
                baku.prepare(Path(folder), offline=True)

    def test_real_snapshot_is_closed_and_correctly_oriented(self):
        source = baku.ROOT / ".track-model-build/baku-source/openstreetmap-map.osm"
        if not source.exists():
            self.skipTest("Download the pinned Baku source snapshot for integration audit")
        report = baku.extract_geometry(source.read_bytes())
        points = report["centerline"]
        self.assertEqual(points[0], points[-1])
        self.assertTrue(all(math.dist(a, b) > 1e-6 for a, b in zip(points, points[1:])))
        self.assertGreater(points[1][0], points[0][0])
        self.assertLess(report["lengthErrorPercent"], 0.5)
        self.assertGreater(report["raceStartDistanceFromControlLineMeters"], 100)
        self.assertLess(report["raceStartDistanceFromControlLineMeters"], 125)
        self.assertGreater(report["pitLaneLengthMeters"], 500)
        self.assertFalse(report["publicationReady"])
        self.assertIsNone(report["verticalDatum"])


if __name__ == "__main__":
    unittest.main()
