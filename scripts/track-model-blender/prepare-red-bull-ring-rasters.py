#!/usr/bin/env python3
"""Prepare official Styria 1 m rasters and 2024 orthophoto for Blender."""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


GRID_WIDTH = 126
GRID_HEIGHT = 108
GROUND_TEXTURE_NAME = "styria-orthophoto-2024.jpg"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def finite_values(image):
    return [float(value) for value in image.getdata() if math.isfinite(float(value))]


def prepare_height_raster(source_path, output_path):
    source = Image.open(source_path).convert("F")
    prepared = source.resize((GRID_WIDTH, GRID_HEIGHT), Image.Resampling.BILINEAR)
    values = finite_values(prepared)
    with output_path.open("wb") as handle:
        for value in prepared.getdata():
            handle.write(struct.pack("<f", float(value)))
    return {
        "height": GRID_HEIGHT,
        "maximum": max(values),
        "mean": sum(values) / len(values),
        "minimum": min(values),
        "sourceResolutionMeters": 1.0,
        "verticalDatum": "official Styria ALS source orthometric metres",
        "width": GRID_WIDTH,
    }


def prepare_orthophoto(source_path, output_path):
    image = Image.open(source_path).convert("RGB")
    image = ImageEnhance.Contrast(image).enhance(1.04)
    image = ImageEnhance.Color(image).enhance(0.90)
    image = image.filter(ImageFilter.UnsharpMask(radius=1.0, percent=42, threshold=3))
    image.save(output_path, format="JPEG", quality=91, optimize=True, progressive=True)
    return {"height": image.height, "width": image.width}


def main():
    args = parse_args()
    source_directory = Path(args.source).resolve()
    output_directory = Path(args.output).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    source_manifest = json.loads((source_directory / "source-manifest.json").read_text(encoding="utf-8"))
    dtm = prepare_height_raster(
        source_directory / "styria-dtm-1m.tif",
        output_directory / "styria-dtm.f32le",
    )
    dsm = prepare_height_raster(
        source_directory / "styria-dsm-1m.tif",
        output_directory / "styria-dsm.f32le",
    )
    orthophoto = prepare_orthophoto(
        source_directory / "styria-orthophoto-2024.jpg",
        output_directory / GROUND_TEXTURE_NAME,
    )
    metadata = {
        "bounds": source_manifest["bounds"],
        "coordinateReferenceSystem": "EPSG:32633",
        "orthophoto": {
            **orthophoto,
            "source": "Land Steiermark/GIS Steiermark current RGB orthophoto, state 2024-04-26",
            "sourceResolutionMeters": 0.2,
        },
        "rasters": {"dsm": dsm, "dtm": dtm},
        "schemaVersion": 1,
        "verticalDatum": "official source orthometric metres; no vertical exaggeration",
    }
    (output_directory / "raster-metadata.json").write_text(
        f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8"
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
