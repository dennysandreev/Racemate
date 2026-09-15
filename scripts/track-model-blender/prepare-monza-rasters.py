#!/usr/bin/env python3
"""Prepare the Monza PCN orthophoto and Terrarium elevation for Blender."""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

GRID_WIDTH = 106
GRID_HEIGHT = 119


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


class TileSet:
    def __init__(self, source_directory, metadata):
        self.zoom = int(metadata["zoom"])
        self.tile_size = int(metadata["tileSize"])
        self.images = {
            (int(member["x"]), int(member["y"])): Image.open(source_directory / member["file"]).convert("RGB")
            for member in metadata["members"]
        }

    def sample(self, lon, lat):
        scale = 2**self.zoom * self.tile_size
        global_x = (lon + 180.0) / 360.0 * scale
        latitude = math.radians(lat)
        global_y = (1.0 - math.asinh(math.tan(latitude)) / math.pi) / 2.0 * scale
        tile_x, tile_y = math.floor(global_x / self.tile_size), math.floor(global_y / self.tile_size)
        image = self.images[(tile_x, tile_y)]
        local_x = min(max(int(global_x - tile_x * self.tile_size), 0), image.width - 1)
        local_y = min(max(int(global_y - tile_y * self.tile_size), 0), image.height - 1)
        return image.getpixel((local_x, local_y))


def wgs84_from_utm32n(easting, northing):
    semi_major = 6_378_137.0
    flattening = 1 / 298.257223563
    scale = 0.9996
    e2 = flattening * (2 - flattening)
    ep2 = e2 / (1 - e2)
    x, y = easting - 500_000.0, northing
    mu = y / scale / (semi_major * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    footprint = mu + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu) + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu) + (151 * e1**3 / 96) * math.sin(6 * mu) + (1097 * e1**4 / 512) * math.sin(8 * mu)
    sine, cosine, tangent = math.sin(footprint), math.cos(footprint), math.tan(footprint)
    c1, t1 = ep2 * cosine**2, tangent**2
    n1 = semi_major / math.sqrt(1 - e2 * sine**2)
    r1 = semi_major * (1 - e2) / (1 - e2 * sine**2) ** 1.5
    d = x / (n1 * scale)
    latitude = footprint - (n1 * tangent / r1) * (d**2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * ep2) * d**4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * ep2 - 3 * c1**2) * d**6 / 720)
    longitude = math.radians(9) + (d - (1 + 2 * t1 + c1) * d**3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * ep2 + 24 * t1**2) * d**5 / 120) / cosine
    return math.degrees(latitude), math.degrees(longitude)


def terrarium_elevation(rgb):
    red, green, blue = rgb
    return red * 256 + green + blue / 256 - 32_768


def write_grid(path, values):
    with path.open("wb") as handle:
        for value in values:
            handle.write(struct.pack("<f", value))


def main():
    args = parse_args()
    source_directory = Path(args.source).resolve()
    output_directory = Path(args.output).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    source_manifest = json.loads((source_directory / "source-manifest.json").read_text(encoding="utf-8"))
    tile_manifest = json.loads((source_directory / "terrain-tile-manifest.json").read_text(encoding="utf-8"))
    bounds = source_manifest["bounds"]
    tiles = TileSet(source_directory, tile_manifest["elevation"])
    values = []
    for row in range(GRID_HEIGHT):
        y = bounds["maxY"] - (bounds["maxY"] - bounds["minY"]) * row / (GRID_HEIGHT - 1)
        for column in range(GRID_WIDTH):
            x = bounds["minX"] + (bounds["maxX"] - bounds["minX"]) * column / (GRID_WIDTH - 1)
            lat, lon = wgs84_from_utm32n(x, y)
            values.append(terrarium_elevation(tiles.sample(lon, lat)))
    write_grid(output_directory / "monza-dtm.f32le", values)
    write_grid(output_directory / "monza-dsm.f32le", values)

    orthophoto = Image.open(source_directory / "pcn-orthophoto-2012.jpg").convert("RGB")
    orthophoto = ImageEnhance.Contrast(orthophoto).enhance(1.025)
    orthophoto = ImageEnhance.Color(orthophoto).enhance(0.93)
    orthophoto = orthophoto.filter(ImageFilter.UnsharpMask(radius=0.9, percent=35, threshold=3))
    orthophoto.save(output_directory / "monza-orthophoto-2012.jpg", format="JPEG", quality=91, optimize=True, progressive=True)
    raster = {"height": GRID_HEIGHT, "maximum": max(values), "mean": sum(values) / len(values), "minimum": min(values), "sourceResolutionMeters": 19.0, "verticalDatum": "Terrarium DEM metres", "width": GRID_WIDTH}
    metadata = {
        "bounds": bounds,
        "coordinateReferenceSystem": "EPSG:32632",
        "orthophoto": {"exportResolutionMetersPerPixel": max((bounds["maxX"] - bounds["minX"]) / orthophoto.width, (bounds["maxY"] - bounds["minY"]) / orthophoto.height), "height": orthophoto.height, "source": "Italian National Geoportal PCN colour orthophoto 2012", "sourceResolutionMeters": 0.5, "width": orthophoto.width},
        "rasters": {"dsm": raster, "dtm": raster},
        "schemaVersion": 1,
        "terrainSurface": {"detailSource": "PCN orthophoto pixels without synthetic ground overlays", "textureHeight": orthophoto.height, "textureWidth": orthophoto.width},
        "verticalDatum": "Terrarium DEM metres; no vertical exaggeration",
    }
    (output_directory / "raster-metadata.json").write_text(f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
