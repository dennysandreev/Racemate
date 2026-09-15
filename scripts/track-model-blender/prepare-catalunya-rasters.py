#!/usr/bin/env python3
"""Prepare official ICGC Barcelona-Catalunya rasters for Blender."""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


GROUND_TEXTURE_NAME = "catalunya-orthophoto-2025.jpg"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def parse_arc_grid(path):
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    header = {}
    for line in lines[:6]:
        key, value = line.split(maxsplit=1)
        header[key.lower()] = float(value)
    width = int(header["ncols"])
    height = int(header["nrows"])
    values = [float(value) for line in lines[6:] for value in line.split()]
    if len(values) != width * height:
        raise ValueError(f"ArcGrid contains {len(values)} values, expected {width * height}")
    nodata = header.get("nodata_value", -9999)
    valid = [value for value in values if math.isfinite(value) and value != nodata]
    fallback = sum(valid) / len(valid)
    values = [fallback if value == nodata or not math.isfinite(value) else value for value in values]
    return header, values


def sample_grid(values, width, height, bounds, x, y):
    column = min(max(round((x - bounds["minX"]) / (bounds["maxX"] - bounds["minX"]) * (width - 1)), 0), width - 1)
    row = min(max(round((bounds["maxY"] - y) / (bounds["maxY"] - bounds["minY"]) * (height - 1)), 0), height - 1)
    return values[row * width + column]


def paint_surface_samples(dtm, width, height, bounds, samples):
    dsm = list(dtm)
    painted = 0
    for sample in samples:
        surface = sample.get("surfaceElevationMeters")
        footprint = sample.get("bounds")
        if not isinstance(surface, (int, float)) or not footprint:
            continue
        minimum_column = max(0, math.floor((footprint["minX"] - bounds["minX"]) / (bounds["maxX"] - bounds["minX"]) * width) - 1)
        maximum_column = min(width - 1, math.ceil((footprint["maxX"] - bounds["minX"]) / (bounds["maxX"] - bounds["minX"]) * width) + 1)
        minimum_row = max(0, math.floor((bounds["maxY"] - footprint["maxY"]) / (bounds["maxY"] - bounds["minY"]) * height) - 1)
        maximum_row = min(height - 1, math.ceil((bounds["maxY"] - footprint["minY"]) / (bounds["maxY"] - bounds["minY"]) * height) + 1)
        ground = sample_grid(dtm, width, height, bounds, sample["x"], sample["y"])
        if 2.5 <= surface - ground <= 40:
            for row in range(minimum_row, maximum_row + 1):
                for column in range(minimum_column, maximum_column + 1):
                    dsm[row * width + column] = max(dsm[row * width + column], surface)
            painted += 1
    return dsm, painted


def write_grid(path, values):
    with path.open("wb") as handle:
        for value in values:
            handle.write(struct.pack("<f", float(value)))


def raster_metrics(values, width, height, source_resolution, datum):
    return {
        "height": height,
        "maximum": max(values),
        "mean": sum(values) / len(values),
        "minimum": min(values),
        "sourceResolutionMeters": source_resolution,
        "verticalDatum": datum,
        "width": width,
    }


def prepare_orthophoto(source_path, output_path):
    image = Image.open(source_path).convert("RGB")
    image = ImageEnhance.Contrast(image).enhance(1.035)
    image = ImageEnhance.Color(image).enhance(0.92)
    image = image.filter(ImageFilter.UnsharpMask(radius=0.9, percent=38, threshold=3))
    image.save(output_path, format="JPEG", quality=91, optimize=True, progressive=True)
    return {"height": image.height, "width": image.width}


def main():
    args = parse_args()
    source_directory = Path(args.source).resolve()
    output_directory = Path(args.output).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    source_manifest = json.loads((source_directory / "source-manifest.json").read_text(encoding="utf-8"))
    surface_source = json.loads((source_directory / "icgc-building-surface-samples.json").read_text(encoding="utf-8"))
    header, dtm = parse_arc_grid(source_directory / "icgc-dtm-15m.asc")
    width = int(header["ncols"])
    height = int(header["nrows"])
    dsm, painted_samples = paint_surface_samples(
        dtm,
        width,
        height,
        source_manifest["bounds"],
        surface_source["elements"],
    )
    write_grid(output_directory / "catalunya-dtm.f32le", dtm)
    write_grid(output_directory / "catalunya-dsm.f32le", dsm)
    orthophoto = prepare_orthophoto(
        source_directory / "icgc-orthophoto-2025.jpg",
        output_directory / GROUND_TEXTURE_NAME,
    )
    datum = "ICGC source elevation metres"
    metadata = {
        "bounds": source_manifest["bounds"],
        "coordinateReferenceSystem": "EPSG:25831",
        "orthophoto": {
            **orthophoto,
            "source": "ICGC territorial RGB orthophoto 2025",
            "sourceResolutionMeters": 0.25,
        },
        "rasters": {
            "dsm": raster_metrics(dsm, width, height, 1.0, datum),
            "dtm": raster_metrics(dtm, width, height, float(header["cellsize"]), datum),
        },
        "schemaVersion": 1,
        "terrainSurface": {
            "buildingSurfaceSamples": painted_samples,
            "detailSource": "ICGC territorial orthophoto 2025",
            "macroColorSource": "ICGC territorial orthophoto 2025",
            "textureHeight": orthophoto["height"],
            "textureWidth": orthophoto["width"],
        },
        "verticalDatum": "ICGC source elevation metres; no vertical exaggeration",
    }
    (output_directory / "raster-metadata.json").write_text(
        f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8"
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
