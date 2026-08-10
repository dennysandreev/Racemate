#!/usr/bin/env python3
"""Convert AHN GeoTIFFs to deterministic little-endian float rasters for Blender."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import struct
from array import array
from pathlib import Path

from PIL import Image


NO_DATA_THRESHOLD = 1_000.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def convert_raster(source_path: Path, output_path: Path) -> dict[str, float | int]:
    with Image.open(source_path) as image:
        raster = image.convert("F")
        width, height = raster.size
        values = array("f")
        minimum = math.inf
        maximum = -math.inf
        total = 0.0
        valid_count = 0

        for value in raster.getdata():
            value = float(value)
            if not math.isfinite(value) or abs(value) >= NO_DATA_THRESHOLD:
                values.append(math.nan)
                continue
            values.append(value)
            minimum = min(minimum, value)
            maximum = max(maximum, value)
            total += value
            valid_count += 1

    if valid_count == 0:
        raise RuntimeError(f"Raster contains no valid values: {source_path}")

    if struct.pack("=I", 1)[0] != 1:
        values.byteswap()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as handle:
        values.tofile(handle)

    return {
        "height": height,
        "maximum": maximum,
        "mean": total / valid_count,
        "minimum": minimum,
        "validCount": valid_count,
        "width": width,
    }


def geometry_center(geometry: dict | None) -> tuple[float, float] | None:
    if not geometry:
        return None
    if geometry.get("type") == "Polygon":
        polygons = [geometry.get("coordinates", [])]
    elif geometry.get("type") == "MultiPolygon":
        polygons = geometry.get("coordinates", [])
    else:
        return None
    rings = polygons[0] if polygons else []
    ring = rings[0] if rings else []
    coordinates = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    if not coordinates:
        return None
    return (
        sum(point[0] for point in coordinates) / len(coordinates),
        sum(point[1] for point in coordinates) / len(coordinates),
    )


def sample_aerial_color(aerial, bounds: dict, x: float, y: float) -> list[float]:
    pixel_x = round(
        (x - bounds["minX"])
        / (bounds["maxX"] - bounds["minX"])
        * (aerial.width - 1)
    )
    pixel_y = round(
        (bounds["maxY"] - y)
        / (bounds["maxY"] - bounds["minY"])
        * (aerial.height - 1)
    )
    samples = []
    for offset_y in range(-3, 4):
        for offset_x in range(-3, 4):
            sample_x = min(max(pixel_x + offset_x, 0), aerial.width - 1)
            sample_y = min(max(pixel_y + offset_y, 0), aerial.height - 1)
            samples.append(aerial.getpixel((sample_x, sample_y)))
    return [
        round(statistics.median(sample[channel] for sample in samples) / 255, 4)
        for channel in range(3)
    ]


def main() -> None:
    args = parse_args()
    source_directory = Path(args.source).resolve()
    output_directory = Path(args.output).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    metadata = {
        "orientation": "rows run north-to-south; columns run west-to-east",
        "sampleType": "float32 little-endian; NaN is no-data",
        "rasters": {},
    }

    for kind in ("dtm", "dsm"):
        source_path = source_directory / f"ahn4-{kind}_05m.tif"
        output_path = output_directory / f"ahn4-{kind}.f32le"
        metadata["rasters"][kind] = {
            **convert_raster(source_path, output_path),
            "file": output_path.name,
        }

    manifest = json.loads((source_directory / "source-manifest.json").read_text(encoding="utf-8"))
    building_data = json.loads(
        (source_directory / "3dbag-buildings.city.json").read_text(encoding="utf-8")
    )
    bounds = manifest["bbox"]
    transform = building_data["metadata"]["transform"]
    building_colors: dict[str, list[float]] = {}
    with Image.open(source_directory / "pdok-2026-orthohr.jpg") as source_aerial:
        aerial = source_aerial.convert("RGB")
        for feature in building_data["features"]:
            if not feature.get("vertices"):
                continue
            xs = [
                vertex[0] * transform["scale"][0] + transform["translate"][0]
                for vertex in feature["vertices"]
            ]
            ys = [
                vertex[1] * transform["scale"][1] + transform["translate"][1]
                for vertex in feature["vertices"]
            ]
            x = sum(xs) / len(xs)
            y = sum(ys) / len(ys)
            building_colors[feature["id"]] = sample_aerial_color(aerial, bounds, x, y)

        for source_name, key_prefix in (("pand", "BGT.Pand"), ("overigbouwwerk", "BGT.Other")):
            feature_collection = json.loads(
                (source_directory / f"bgt/{source_name}.geojson").read_text(encoding="utf-8")
            )
            for feature in feature_collection["features"]:
                center = geometry_center(feature.get("geometry"))
                if center is None:
                    continue
                building_colors[f"{key_prefix}.{feature.get('id')}"] = sample_aerial_color(
                    aerial, bounds, center[0], center[1]
                )

    (output_directory / "building-colors.json").write_text(
        f"{json.dumps(building_colors, separators=(',', ':'))}\n",
        encoding="utf-8",
    )

    metadata_path = output_directory / "raster-metadata.json"
    metadata_path.write_text(f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
