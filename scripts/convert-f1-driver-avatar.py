#!/usr/bin/env python3
"""Convert a square transparent source image to RaceMate's WebP avatar format."""

from __future__ import annotations

import argparse
import os
import tempfile
from pathlib import Path

from PIL import Image, features


MIN_DIMENSION = 512
MAX_DIMENSION = 2048


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--quality", type=int, default=92)
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not features.check("webp"):
        raise SystemExit("Pillow was built without WebP support.")
    if not 1 <= args.quality <= 100:
        raise SystemExit("--quality must be between 1 and 100.")

    with Image.open(args.source) as source:
        image = source.convert("RGBA")

    width, height = image.size
    if width != height:
        raise SystemExit(f"Avatar must be square, got {width}x{height}: {args.source}")
    if not MIN_DIMENSION <= width <= MAX_DIMENSION:
        raise SystemExit(
            f"Avatar side must be {MIN_DIMENSION}-{MAX_DIMENSION}px, got {width}px: {args.source}"
        )

    alpha_min, alpha_max = image.getchannel("A").getextrema()
    if alpha_min == 255:
        raise SystemExit(f"Avatar has no transparent pixels: {args.source}")
    if alpha_max == 0:
        raise SystemExit(f"Avatar is fully transparent: {args.source}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None

    try:
        with tempfile.NamedTemporaryFile(
            prefix=f".{args.output.stem}-",
            suffix=".webp",
            dir=args.output.parent,
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)

        image.save(
            temporary_path,
            "WEBP",
            quality=args.quality,
            method=6,
            exact=True,
        )

        with Image.open(temporary_path) as converted:
            converted_rgba = converted.convert("RGBA")
            converted_alpha_min, converted_alpha_max = converted_rgba.getchannel("A").getextrema()
            if converted.size != image.size:
                raise SystemExit(f"Converted avatar dimensions changed: {args.source}")
            if converted_alpha_min == 255 or converted_alpha_max == 0:
                raise SystemExit(f"Converted avatar lost its transparent cutout: {args.source}")

        os.replace(temporary_path, args.output)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
