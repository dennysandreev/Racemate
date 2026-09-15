#!/usr/bin/env python3
"""Prepare official Canadian HRDEM rasters and CMM orthophoto for Blender."""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


GRID_WIDTH = 84
GRID_HEIGHT = 162
GROUND_TEXTURE_NAME = "cmm-orthophoto-2019.jpg"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def read_float_geotiff(source_path):
    source = Image.open(source_path)
    if source.mode != "F":
        source = source.convert("F")
    raw = source.tobytes()
    byte_order = ">" if source_path.read_bytes()[:2] == b"MM" else "<"
    values = list(struct.unpack(f"{byte_order}{len(raw) // 4}f", raw))
    valid = [value for value in values if math.isfinite(value) and value > -30_000]
    if not valid:
        raise ValueError(f"No valid elevation samples in {source_path}")
    fallback = sum(valid) / len(valid)
    normalized = [
        value if math.isfinite(value) and value > -30_000 else fallback
        for value in values
    ]
    image = Image.new("F", source.size)
    image.putdata(normalized)
    return image, source.size


def prepare_height_raster(source_path, output_path):
    source, source_size = read_float_geotiff(source_path)
    prepared = source.resize((GRID_WIDTH, GRID_HEIGHT), Image.Resampling.BILINEAR)
    values = [float(value) for value in prepared.getdata() if math.isfinite(float(value))]
    with output_path.open("wb") as handle:
        for value in prepared.getdata():
            handle.write(struct.pack("<f", float(value)))
    return {
        "height": GRID_HEIGHT,
        "maximum": max(values),
        "mean": sum(values) / len(values),
        "minimum": min(values),
        "sourceHeight": source_size[1],
        "sourceResolutionMeters": 2.0,
        "sourceWidth": source_size[0],
        "verticalDatum": "Canadian Geodetic Vertical Datum of 2013 (CGVD2013)",
        "width": GRID_WIDTH,
    }


def prepare_orthophoto(source_path, output_path):
    image = Image.open(source_path).convert("RGB")
    image = ImageEnhance.Contrast(image).enhance(1.035)
    image = ImageEnhance.Color(image).enhance(0.90)
    image = image.filter(ImageFilter.UnsharpMask(radius=1.0, percent=40, threshold=3))
    image.save(output_path, format="JPEG", quality=91, optimize=True, progressive=True)
    return {"height": image.height, "width": image.width}


def main():
    args = parse_args()
    source_directory = Path(args.source).resolve()
    output_directory = Path(args.output).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    source_manifest = json.loads(
        (source_directory / "source-manifest.json").read_text(encoding="utf-8")
    )
    dtm = prepare_height_raster(
        source_directory / "canada-hrdem-dtm-2m.tif",
        output_directory / "montreal-dtm.f32le",
    )
    dsm = prepare_height_raster(
        source_directory / "canada-hrdem-dsm-2m.tif",
        output_directory / "montreal-dsm.f32le",
    )
    orthophoto = prepare_orthophoto(
        source_directory / "cmm-orthophoto-2019.jpg",
        output_directory / GROUND_TEXTURE_NAME,
    )
    metadata = {
        "bounds": source_manifest["bounds"],
        "coordinateReferenceSystem": "EPSG:32188",
        "orthophoto": {
            **orthophoto,
            "exportResolutionMetersPerPixel": 0.659,
            "source": "Communauté métropolitaine de Montréal colour orthophoto 2019",
            "sourceResolutionMeters": 0.25,
        },
        "rasters": {"dsm": dsm, "dtm": dtm},
        "schemaVersion": 1,
        "verticalDatum": "CGVD2013; no vertical exaggeration",
    }
    (output_directory / "raster-metadata.json").write_text(
        f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8"
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
