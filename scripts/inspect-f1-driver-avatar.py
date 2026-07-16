#!/usr/bin/env python3
"""Return machine-readable dimensions and alpha information for avatar files."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image


def inspect(file_path: Path) -> dict[str, object]:
    try:
        with Image.open(file_path) as image:
            rgba = image.convert("RGBA")
            alpha_min, alpha_max = rgba.getchannel("A").getextrema()
            return {
                "path": str(file_path),
                "format": image.format,
                "sourceMode": image.mode,
                "mode": rgba.mode,
                "width": image.width,
                "height": image.height,
                "alphaMin": alpha_min,
                "alphaMax": alpha_max,
                "error": None,
            }
    except Exception as error:  # pragma: no cover - surfaced to the Node validator
        return {
            "path": str(file_path),
            "error": str(error),
        }


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Pass at least one image path.")
    print(json.dumps([inspect(Path(value)) for value in sys.argv[1:]]))


if __name__ == "__main__":
    main()
