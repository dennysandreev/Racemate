#!/usr/bin/env python3
"""Render the circuit-map page from an official FIA event PDF as a dark WebP."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageOps
from pypdf import PdfReader


def find_binary(name: str) -> str:
    configured = os.environ.get(name.upper())
    candidates = [
        configured,
        shutil.which(name),
        str(
            Path.home()
            / ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override"
            / name
        ),
        f"/opt/homebrew/bin/{name}",
        f"/usr/local/bin/{name}",
    ]

    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate

    raise RuntimeError(f"{name} is required to render FIA circuit maps")


def score_page(text: str) -> int:
    value = text.upper()
    score = 0
    score += value.count("DRS") * 8
    score += value.count("CIRCUIT MAP") * 12
    score += value.count("DRS ACTIVATION") * 10
    score += value.count("DRS DETECTION") * 10
    score += value.count("CONTROL LINE") * 5
    score += value.count("SECTOR 1") * 3
    score += value.count("SECTOR 2") * 3
    score += value.count("CIRCUIT CENTRELINE") * 8
    return score


def choose_page(pdf_path: Path) -> int:
    reader = PdfReader(str(pdf_path))
    texts = [page.extract_text() or "" for page in reader.pages]
    scores = [score_page(text) for text in texts]

    if not scores:
        raise RuntimeError(f"PDF has no pages: {pdf_path}")

    cover = " ".join(texts[0].upper().split())
    cover_markers = ("FROM", "TO", "DOCUMENT", "DATE", "TITLE")
    is_event_notes_cover = (
        len(scores) > 1
        and all(marker in cover for marker in cover_markers)
        and "CIRCUIT" in cover
        and "MAP" in cover
        and "DRS ACTIVATION" not in cover
    )
    if is_event_notes_cover:
        # Most FIA bundles put the circuit map directly after the memo, and
        # older outlined drawings can have no extractable text at all. Some
        # 2025 bundles put the pit-lane drawing first, though. Prefer an
        # explicitly labelled circuit-map attachment when page two clearly
        # identifies itself as another drawing; otherwise keep the reliable
        # first-attachment fallback.
        first_attachment = " ".join(texts[1].upper().split())
        first_is_other_drawing = any(
            marker in first_attachment
            for marker in ("PIT LANE DRAWING", "RED ZONES", "QUARANTINE ZONE")
        ) and "CIRCUIT MAP" not in first_attachment
        if first_is_other_drawing:
            for index, text in enumerate(texts[2:], start=2):
                normalized = " ".join(text.upper().split())
                if "CIRCUIT MAP" in normalized or (
                    "DRS DETECTION" in normalized and "DRS ACTIVATION" in normalized
                ):
                    return index + 1
        return 2

    best_index = max(range(len(scores)), key=scores.__getitem__)
    if scores[best_index] == 0:
        # Standalone FIA circuit-map PDFs are often one page with outlined text
        # that cannot be extracted. The final page is the safest fallback for a
        # memo + attachment document.
        best_index = len(scores) - 1

    return best_index + 1


def content_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    distance_from_white = 255 - rgb.min(axis=2)
    mask = Image.fromarray(np.where(distance_from_white > 12, 255, 0).astype(np.uint8))
    bbox = mask.getbbox()
    return bbox or (0, 0, image.width, image.height)


def darken_document(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    maximum = rgb.max(axis=2)
    minimum = rgb.min(axis=2)
    saturation = maximum - minimum
    distance_from_white = 255 - minimum
    neutral = saturation < 24
    paper = neutral & (maximum > 238)
    ink = neutral & ~paper

    output = np.empty_like(rgb)
    output[:, :, 0] = 11
    output[:, :, 1] = 15
    output[:, :, 2] = 21

    # Neutral document ink becomes a readable cool white on the dark RaceMate
    # surface. Mid-gray antialiasing stays smooth instead of turning binary.
    neutral_strength = np.clip((248 - maximum) / 190, 0, 1)
    light_ink = 116 + neutral_strength * 132
    for channel, tint in enumerate((0.96, 0.98, 1.0)):
        output[:, :, channel] = np.where(ink, light_ink * tint, output[:, :, channel])

    # FIA uses color for DRS, sector, pit-lane, and safety annotations. Preserve
    # those hues and lift dark colors enough to remain legible on obsidian.
    colored = ~neutral
    lifted = np.clip(rgb * 1.08 + 12, 0, 255)
    too_dark = colored & (maximum < 92)
    lifted[too_dark] = np.clip(lifted[too_dark] + 72, 0, 255)
    output[colored] = lifted[colored]
    output[paper] = (11, 15, 21)

    return Image.fromarray(np.clip(output, 0, 255).astype(np.uint8), mode="RGB")


def render(pdf_path: Path, output_path: Path) -> int:
    page = choose_page(pdf_path)
    pdftoppm = find_binary("pdftoppm")

    with tempfile.TemporaryDirectory(prefix="racemate-fia-map-") as temporary:
        prefix = Path(temporary) / "map"
        subprocess.run(
            [
                pdftoppm,
                "-f",
                str(page),
                "-l",
                str(page),
                "-singlefile",
                "-png",
                "-r",
                "180",
                str(pdf_path),
                str(prefix),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        rendered = Image.open(prefix.with_suffix(".png")).convert("RGB")

    left, top, right, bottom = content_bbox(rendered)
    padding_x = max(24, int((right - left) * 0.025))
    padding_y = max(24, int((bottom - top) * 0.035))
    cropped = rendered.crop(
        (
            max(0, left - padding_x),
            max(0, top - padding_y),
            min(rendered.width, right + padding_x),
            min(rendered.height, bottom + padding_y),
        )
    )
    styled = darken_document(cropped)
    fitted = ImageOps.contain(styled, (1520, 820), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (1600, 900), (11, 15, 21))
    canvas.paste(fitted, ((1600 - fitted.width) // 2, (900 - fitted.height) // 2))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, "WEBP", quality=92, method=6)
    return page


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    selected_page = render(args.pdf, args.output)
    print(selected_page)


if __name__ == "__main__":
    main()
