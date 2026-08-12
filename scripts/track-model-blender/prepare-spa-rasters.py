#!/usr/bin/env python3
"""Prepare deterministic float grids for the Spa Blender digital twin."""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def prepare_grid(source_path, output_path):
    payload = load_json(source_path)
    values = [float(value) for value in payload["values"]]
    expected = int(payload["width"]) * int(payload["height"])
    if len(values) != expected:
        raise ValueError(f"{source_path.name}: expected {expected} samples, got {len(values)}")
    if not all(math.isfinite(value) for value in values):
        raise ValueError(f"{source_path.name}: non-finite elevation sample")
    with output_path.open("wb") as handle:
        for value in values:
            handle.write(struct.pack("<f", value))
    return {
        "height": int(payload["height"]),
        "maximum": max(values),
        "mean": sum(values) / len(values),
        "minimum": min(values),
        "sourceResolutionMeters": float(payload["sourceResolutionMeters"]),
        "verticalDatum": payload["verticalDatum"],
        "width": int(payload["width"]),
    }


def main():
    args = parse_args()
    source_directory = Path(args.source).resolve()
    output_directory = Path(args.output).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)

    metadata = {
        "bounds": load_json(source_directory / "wallonia-dtm-samples.json")["bounds"],
        "coordinateReferenceSystem": "EPSG:3812",
        "rasters": {
            "dsm": prepare_grid(
                source_directory / "wallonia-dsm-samples.json",
                output_directory / "wallonia-dsm.f32le",
            ),
            "dtm": prepare_grid(
                source_directory / "wallonia-dtm-samples.json",
                output_directory / "wallonia-dtm.f32le",
            ),
        },
        "schemaVersion": 1,
        "verticalDatum": "DNG / EPSG:5710",
    }
    (output_directory / "raster-metadata.json").write_text(
        f"{json.dumps(metadata, indent=2)}\n",
        encoding="utf-8",
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
