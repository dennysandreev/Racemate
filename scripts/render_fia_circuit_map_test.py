from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest

from reportlab.pdfgen import canvas


SCRIPT_PATH = Path(__file__).with_name("render-fia-circuit-map.py")
SPEC = importlib.util.spec_from_file_location("render_fia_circuit_map", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ChooseFiaCircuitMapPageTest(unittest.TestCase):
    def test_first_attachment_wins_when_cover_names_circuit_map(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            pdf_path = Path(directory) / "event-notes.pdf"
            document = canvas.Canvas(str(pdf_path))
            document.drawString(72, 740, "FROM FIA RACE DIRECTOR TO ALL TEAMS")
            document.drawString(72, 720, "DOCUMENT 2 DATE 01 JUNE TITLE EVENT NOTES - CIRCUIT MAP, PIT LANE AND RED ZONE")
            document.showPage()
            document.drawString(72, 720, "Outlined circuit graphic without extractable DRS labels")
            document.showPage()
            document.drawString(72, 720, "PIT LANE CONTROL LINE")
            document.save()

            self.assertEqual(MODULE.choose_page(pdf_path), 2)

    def test_explicit_circuit_map_wins_when_pit_lane_is_first_attachment(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            pdf_path = Path(directory) / "event-notes-pit-first.pdf"
            document = canvas.Canvas(str(pdf_path))
            document.drawString(72, 740, "FROM FIA RACE DIRECTOR TO ALL TEAMS")
            document.drawString(72, 720, "DOCUMENT 5 DATE 12 JUNE TITLE EVENT NOTES - CIRCUIT MAP, PIT LANE AND RED ZONES")
            document.showPage()
            document.drawString(72, 720, "2025 CANADA GRAND PRIX PIT LANE DRAWING")
            document.showPage()
            document.drawString(72, 720, "CIRCUIT MAP DRS DETECTION DRS ACTIVATION")
            document.showPage()
            document.drawString(72, 720, "RED ZONES")
            document.save()

            self.assertEqual(MODULE.choose_page(pdf_path), 3)


if __name__ == "__main__":
    unittest.main()
