#!/usr/bin/env python3
"""Prepare Monaco government orthophoto and Terrarium elevation for Blender."""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


GRID_WIDTH = 121
GRID_HEIGHT = 153
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

    def sample(self, lon, lat):
        global_x, global_y = self.global_pixel(lon, lat)
        tile_x = math.floor(global_x / self.tile_size)
        tile_y = math.floor(global_y / self.tile_size)
        image = self.images[(tile_x, tile_y)]
        local_x = min(max(int(global_x - tile_x * self.tile_size), 0), image.width - 1)
        local_y = min(max(int(global_y - tile_y * self.tile_size), 0), image.height - 1)
        return image.getpixel((local_x, local_y))

    def crop(self, bounds):
        west, north = self.global_pixel(bounds["west"], bounds["north"])
        east, south = self.global_pixel(bounds["east"], bounds["south"])
        min_tile_x = min(x for x, _ in self.images)
        min_tile_y = min(y for _, y in self.images)
        max_tile_x = max(x for x, _ in self.images)
        max_tile_y = max(y for _, y in self.images)
        mosaic = Image.new(
            "RGB",
            (
                (max_tile_x - min_tile_x + 1) * self.tile_size,
                (max_tile_y - min_tile_y + 1) * self.tile_size,
            ),
        )
        for (tile_x, tile_y), image in self.images.items():
            mosaic.paste(
                image,
                ((tile_x - min_tile_x) * self.tile_size, (tile_y - min_tile_y) * self.tile_size),
            )
        origin_x = min_tile_x * self.tile_size
        origin_y = min_tile_y * self.tile_size
        return mosaic.crop((
            round(west - origin_x),
            round(north - origin_y),
            round(east - origin_x),
            round(south - origin_y),
        ))


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


def terrarium_elevation(rgb):
    red, green, blue = rgb
    return red * 256 + green + blue / 256 - 32_768


def write_grid(path, values):
    with path.open("wb") as handle:
        for value in values:
            handle.write(struct.pack("<f", value))


def prepare_orthophoto(image):
    maximum_dimension = 1_920
    scale = min(1.0, maximum_dimension / max(image.size))
    if scale < 1:
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)),
            Image.Resampling.LANCZOS,
        )
    image = ImageEnhance.Color(image).enhance(0.88)
    image = ImageEnhance.Contrast(image).enhance(1.06)
    image = ImageEnhance.Brightness(image).enhance(0.94)
    return image.filter(ImageFilter.UnsharpMask(radius=1.0, percent=45, threshold=3))


def main():
    args = parse_args()
    source_directory = Path(args.source).resolve()
    output_directory = Path(args.output).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    tile_manifest = load_json(source_directory / "terrain-tile-manifest.json")
    source_manifest = load_json(source_directory / "source-manifest.json")
    bounds = source_manifest["bounds"]
    elevation_tiles = TileSet(source_directory, tile_manifest["elevation"])
    orthophoto_tiles = TileSet(source_directory, tile_manifest["orthophoto"])

    values = []
    for row in range(GRID_HEIGHT):
        y = bounds["maxY"] - (bounds["maxY"] - bounds["minY"]) * row / (GRID_HEIGHT - 1)
        for column in range(GRID_WIDTH):
            x = bounds["minX"] + (bounds["maxX"] - bounds["minX"]) * column / (GRID_WIDTH - 1)
            lat, lon = wgs84_from_utm32n(x, y)
            values.append(terrarium_elevation(elevation_tiles.sample(lon, lat)))

    write_grid(output_directory / "monaco-dtm.f32le", values)
    write_grid(output_directory / "monaco-dsm.f32le", values)
    orthophoto = prepare_orthophoto(orthophoto_tiles.crop(tile_manifest["boundsWgs84"]))
    orthophoto.save(
        output_directory / GROUND_TEXTURE_NAME,
        format="JPEG",
        quality=90,
        optimize=True,
        progressive=True,
    )

    raster = {
        "height": GRID_HEIGHT,
        "maximum": max(values),
        "mean": sum(values) / len(values),
        "minimum": min(values),
        "sourceResolutionMeters": 19.0,
        "verticalDatum": "Terrarium source DEM metres",
        "width": GRID_WIDTH,
    }
    metadata = {
        "bounds": bounds,
        "coordinateReferenceSystem": "EPSG:32632",
        "orthophoto": {
            "attribution": "DPUM, Gouvernement Princier de Monaco",
            "height": orthophoto.height,
            "source": "official SIGM Orthophoto 2020 WGS84 tiled service",
            "width": orthophoto.width,
        },
        "rasters": {"dsm": raster, "dtm": raster},
        "schemaVersion": 1,
        "terrainSurface": {
            "detailSource": "official Monaco government orthophoto",
            "sourceResolutionMetersPerPixel": 0.60,
            "textureHeight": orthophoto.height,
            "textureWidth": orthophoto.width,
        },
        "verticalDatum": "source DEM metres; no vertical exaggeration",
    }
    (output_directory / "raster-metadata.json").write_text(
        f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8"
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
