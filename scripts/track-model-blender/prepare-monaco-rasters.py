#!/usr/bin/env python3
"""Reproject Monaco's orthophoto and prepare measured IGN69 LiDAR rasters."""

from __future__ import annotations

import argparse
import json
import math
import struct
from array import array
from pathlib import Path

from PIL import Image
import importlib.util


GROUND_TEXTURE_NAME = "monaco-government-orthophoto.jpg"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


class TileSet:
    def __init__(self, source_directory, metadata):
        self.source_directory = source_directory
        self.zoom = int(metadata["zoom"])
        self.tile_size = int(metadata["tileSize"])
        self.images = {}
        for member in metadata["members"]:
            self.images[(int(member["x"]), int(member["y"]))] = Image.open(
                source_directory / member["file"]
            ).convert("RGB")

    def global_pixel(self, lon, lat):
        scale = 2**self.zoom * self.tile_size
        x = (lon + 180.0) / 360.0 * scale
        latitude = math.radians(lat)
        y = (1.0 - math.asinh(math.tan(latitude)) / math.pi) / 2.0 * scale
        return x, y

    def reproject(self, bounds, maximum_dimension=3_072):
        """Inverse-map UTM pixel centres into Web Mercator, never stretch a bbox.

        Pillow's mesh uses sub-pixel quadrilateral interpolation within 32px
        cells. The UTM projection is evaluated at every cell corner.
        """
        min_x = min(x for x, _ in self.images) * self.tile_size
        min_y = min(y for _, y in self.images) * self.tile_size
        mosaic = Image.new("RGB", (
            (max(x for x, _ in self.images) + 1) * self.tile_size - min_x,
            (max(y for _, y in self.images) + 1) * self.tile_size - min_y,
        ))
        for (x, y), image in self.images.items():
            mosaic.paste(image, (x * self.tile_size - min_x, y * self.tile_size - min_y))
        width_m = bounds["maxX"] - bounds["minX"]
        height_m = bounds["maxY"] - bounds["minY"]
        scale = maximum_dimension / max(width_m, height_m)
        size = (round(width_m * scale), round(height_m * scale))

        def source_pixel(x, y):
            lat, lon = wgs84_from_utm32n(
                bounds["minX"] + x / size[0] * width_m,
                bounds["maxY"] - y / size[1] * height_m,
            )
            px, py = self.global_pixel(lon, lat)
            if not (0 <= px - min_x <= mosaic.width and 0 <= py - min_y <= mosaic.height):
                raise ValueError("Orthophoto tile coverage does not contain the UTM scene")
            return px - min_x, py - min_y

        mesh = []
        for y in range(0, size[1], 32):
            for x in range(0, size[0], 32):
                x1, y1 = min(x + 32, size[0]), min(y + 32, size[1])
                quad = [coordinate for point in ((x, y), (x, y1), (x1, y1), (x1, y))
                        for coordinate in source_pixel(*point)]
                mesh.append(((x, y, x1, y1), quad))
        return mosaic.transform(size, Image.Transform.MESH, mesh, Image.Resampling.BICUBIC)


def wgs84_from_utm32n(easting, northing):
    semi_major = 6_378_137.0
    flattening = 1 / 298.257223563
    scale = 0.9996
    eccentricity_squared = flattening * (2 - flattening)
    secondary_eccentricity_squared = eccentricity_squared / (1 - eccentricity_squared)
    x = easting - 500_000.0
    meridional_arc = northing / scale
    mu = meridional_arc / (
        semi_major
        * (1 - eccentricity_squared / 4 - 3 * eccentricity_squared**2 / 64 - 5 * eccentricity_squared**3 / 256)
    )
    e1 = (1 - math.sqrt(1 - eccentricity_squared)) / (1 + math.sqrt(1 - eccentricity_squared))
    footprint = (
        mu
        + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
        + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
        + (151 * e1**3 / 96) * math.sin(6 * mu)
        + (1097 * e1**4 / 512) * math.sin(8 * mu)
    )
    sine = math.sin(footprint)
    cosine = math.cos(footprint)
    tangent = math.tan(footprint)
    c1 = secondary_eccentricity_squared * cosine**2
    t1 = tangent**2
    n1 = semi_major / math.sqrt(1 - eccentricity_squared * sine**2)
    r1 = semi_major * (1 - eccentricity_squared) / (1 - eccentricity_squared * sine**2) ** 1.5
    d = x / (n1 * scale)
    latitude = footprint - (n1 * tangent / r1) * (
        d**2 / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * secondary_eccentricity_squared) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * secondary_eccentricity_squared - 3 * c1**2) * d**6 / 720
    )
    longitude = math.radians(9) + (
        d
        - (1 + 2 * t1 + c1) * d**3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * secondary_eccentricity_squared + 24 * t1**2) * d**5 / 120
    ) / cosine
    return math.degrees(latitude), math.degrees(longitude)


def write_grid(path, values):
    with path.open("wb") as handle:
        for value in values:
            handle.write(struct.pack("<f", value))


def prepare_lidar(source, destination, bounds):
    image = Image.open(source)
    if image.mode != "F":
        raise ValueError(f"Expected floating-point elevation GeoTIFF: {source}")
    values = array("f", image.getdata())
    missing = sum(not math.isfinite(v) or v < -10 for v in values)
    # No-data at the offshore tile edge is blended by WMS into values down to -947 m.
    # This coastal scene has no ground below -10 m; retain invalid cells as NaN.
    values = array("f", (v if math.isfinite(v) and v >= -10 else math.nan for v in values))
    write_grid(destination, values)
    valid = [v for v in values if math.isfinite(v)]
    return {
        "height": image.height, "width": image.width,
        "minimum": min(valid), "maximum": max(valid), "mean": sum(valid) / len(valid),
        "noDataSamples": missing, "noDataThresholdMeters": -10, "sourceResolutionMeters": 0.5, "exportResolutionMeters": 1,
        "verticalDatum": "IGN69 (EPSG:5720)",
        "sampleBounds": {"minX": bounds["minX"] + 0.5, "maxX": bounds["maxX"] - 0.5,
                         "minY": bounds["minY"] + 0.5, "maxY": bounds["maxY"] - 0.5},
    }


def main():
    args = parse_args()
    source_directory = Path(args.source).resolve()
    output_directory = Path(args.output).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    spec = importlib.util.spec_from_file_location("monaco_facades", Path(__file__).with_name("prepare-monaco-facades.py"))
    facades = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(facades)
    facades.prepare_facades(output_directory)
    tile_manifest = load_json(source_directory / "terrain-tile-manifest.json")
    source_manifest = load_json(source_directory / "source-manifest.json")
    bounds = source_manifest["bounds"]
    orthophoto_tiles = TileSet(source_directory, tile_manifest["orthophoto"])
    rasters = {
        key: prepare_lidar(source_directory / file, output_directory / f"monaco-{key}.f32le", bounds)
        for key, file in (("dtm", "ign-mnt-1m.tif"), ("dsm", "ign-mns-1m.tif"))
    }
    orthophoto = orthophoto_tiles.reproject(bounds)
    orthophoto.save(
        output_directory / GROUND_TEXTURE_NAME,
        format="JPEG",
        quality=80,
        optimize=True,
        progressive=True,
    )

    metadata = {
        "bounds": bounds,
        "coordinateReferenceSystem": "EPSG:32632",
        "orthophoto": {
            "attribution": "DPUM, Gouvernement Princier de Monaco",
            "height": orthophoto.height,
            "source": "official SIGM Orthophoto 2020 WGS84 tiled service",
            "projection": "inverse UTM32N to Web Mercator mesh; 32 pixel cells",
            "bounds": bounds,
            "width": orthophoto.width,
        },
        "rasters": rasters,
        "schemaVersion": 2,
        "terrainSurface": {
            "detailSource": "official Monaco government orthophoto",
            "sourceResolutionMetersPerPixel": 0.60,
            "textureHeight": orthophoto.height,
            "textureWidth": orthophoto.width,
        },
        "verticalDatum": "IGN69 (EPSG:5720); no vertical exaggeration",
    }
    (output_directory / "raster-metadata.json").write_text(
        f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8"
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
