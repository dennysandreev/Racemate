"""Source preflight tests; run with python3, without Blender or network."""

import importlib.util
import math
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET


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

    def test_finish_straight_building_preserves_both_courtyards(self):
        path = baku.ROOT / ".track-model-build/baku-source/openstreetmap-map.osm"
        if not path.exists():
            self.skipTest("Download the pinned Baku source snapshot")
        element = baku.extract_building_relation(ET.parse(path).getroot(), 2249851)
        self.assertEqual(element["type"], "relation")
        self.assertEqual(element["tags"]["building:levels"], "5")
        self.assertEqual(len(element["innerRings"]), 2)
        for ring in [element["geometry"], *element["innerRings"]]:
            self.assertEqual(ring[0], ring[-1])
            self.assertEqual(len(ring), 5)
        outer = element["geometry"]
        for hole in element["innerRings"]:
            for point in hole:
                self.assertTrue(min(p["lon"] for p in outer) < point["lon"] < max(p["lon"] for p in outer))
                self.assertTrue(min(p["lat"] for p in outer) < point["lat"] < max(p["lat"] for p in outer))

    def test_incomplete_courtyard_is_not_silently_filled(self):
        root = ET.fromstring('<osm><relation id="42"><member type="way" ref="999" role="inner"/></relation></osm>')
        with self.assertRaisesRegex(ValueError, "Incomplete building relation"):
            baku.extract_building_relation(root, 42)


if __name__ == "__main__":
    unittest.main()
