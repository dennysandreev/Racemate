#!/usr/bin/env python3
"""Prepare the cached Hungaroring Terrarium and orthophoto tiles for Blender."""

from __future__ import annotations

import argparse
import json
import math
import random
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps


GRID_WIDTH = 101
GRID_HEIGHT = 103
GROUND_TEXTURE_NAME = "hungary-hybrid-ground-2026.jpg"

POLYGON_STYLES = {
    "farmland": (137, 126, 78, 146),
    "forest": (28, 64, 43, 184),
    "grass": (91, 126, 73, 154),
    "grassland": (89, 119, 72, 148),
    "industrial": (116, 115, 107, 138),
    "parking": (91, 96, 94, 202),
    "pitch": (78, 125, 75, 176),
    "residential": (126, 119, 105, 128),
    "scrub": (64, 91, 61, 168),
    "shingle": (146, 130, 102, 164),
    "sports_centre": (91, 113, 82, 152),
    "track": (89, 116, 76, 148),
    "water": (54, 93, 103, 188),
    "water_park": (68, 106, 109, 158),
    "wood": (30, 67, 45, 184),
}

ROAD_WIDTH_METERS = {
    "footway": 1.5,
    "path": 1.35,
    "residential": 5.5,
    "service": 4.2,
    "steps": 1.8,
    "tertiary": 6.5,
    "tertiary_link": 5.5,
    "track": 3.0,
    "unclassified": 5.0,
}


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

    def pixel_in_crop(self, lon, lat, bounds):
        west, north = self.global_pixel(bounds["west"], bounds["north"])
        x, y = self.global_pixel(lon, lat)
        return x - west, y - north


def wgs84_from_utm34n(easting, northing):
    semi_major = 6_378_137.0
    flattening = 1 / 298.257223563
    scale = 0.9996
    eccentricity_squared = flattening * (2 - flattening)
    secondary_eccentricity_squared = eccentricity_squared / (1 - eccentricity_squared)
    x = easting - 500_000.0
    y = northing
    meridional_arc = y / scale
    mu = meridional_arc / (
        semi_major
        * (
            1
            - eccentricity_squared / 4
            - 3 * eccentricity_squared**2 / 64
            - 5 * eccentricity_squared**3 / 256
        )
    )
    e1 = (1 - math.sqrt(1 - eccentricity_squared)) / (
        1 + math.sqrt(1 - eccentricity_squared)
    )
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
    r1 = semi_major * (1 - eccentricity_squared) / (
        1 - eccentricity_squared * sine**2
    ) ** 1.5
    d = x / (n1 * scale)
    latitude = footprint - (n1 * tangent / r1) * (
        d**2 / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * secondary_eccentricity_squared)
        * d**4
        / 24
        + (
            61
            + 90 * t1
            + 298 * c1
            + 45 * t1**2
            - 252 * secondary_eccentricity_squared
            - 3 * c1**2
        )
        * d**6
        / 720
    )
    longitude = math.radians(21) + (
        d
        - (1 + 2 * t1 + c1) * d**3 / 6
        + (
            5
            - 2 * c1
            + 28 * t1
            - 3 * c1**2
            + 8 * secondary_eccentricity_squared
            + 24 * t1**2
        )
        * d**5
        / 120
    ) / cosine
    return math.degrees(latitude), math.degrees(longitude)


def terrarium_elevation(rgb):
    red, green, blue = rgb
    return red * 256 + green + blue / 256 - 32_768


def write_grid(path, values):
    with path.open("wb") as handle:
        for value in values:
            handle.write(struct.pack("<f", value))


def polygon_kind(tags):
    if tags.get("amenity") == "parking":
        return "parking"
    for key in ("landuse", "natural", "leisure"):
        value = tags.get(key)
        if value in POLYGON_STYLES:
            return value
    return None


def is_closed(geometry):
    return (
        len(geometry) >= 4
        and geometry[0]["lat"] == geometry[-1]["lat"]
        and geometry[0]["lon"] == geometry[-1]["lon"]
    )


def draw_surface_pattern(image, mask, kind, seed):
    pattern = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(pattern)
    width, height = image.size
    rng = random.Random(seed)

    if kind in {"forest", "scrub", "wood"}:
        count = max(1_800, round(width * height / 1_900))
        for _ in range(count):
            x = rng.randrange(width)
            y = rng.randrange(height)
            radius = rng.choice((1, 1, 2, 2, 3, 4))
            tone = rng.choice(((14, 38, 25, 34), (91, 118, 71, 28), (33, 74, 45, 42)))
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=tone)
    elif kind in {"farmland", "grass", "grassland", "pitch", "sports_centre", "track"}:
        spacing = 18 if kind == "farmland" else 13
        color = (208, 213, 172, 26) if kind == "farmland" else (195, 220, 174, 22)
        for offset in range(-height, width + height, spacing):
            draw.line((offset, 0, offset - height, height), fill=color, width=1)
    elif kind == "water":
        for y in range(8, height, 18):
            draw.line((0, y, width, y), fill=(146, 190, 191, 24), width=1)

    clipped = Image.composite(pattern, Image.new("RGBA", image.size, (0, 0, 0, 0)), mask)
    return Image.alpha_composite(image, clipped)


def hillshade_texture(values, target_size):
    pixels = []
    for row in range(GRID_HEIGHT):
        for column in range(GRID_WIDTH):
            left = values[row * GRID_WIDTH + max(0, column - 1)]
            right = values[row * GRID_WIDTH + min(GRID_WIDTH - 1, column + 1)]
            upper = values[max(0, row - 1) * GRID_WIDTH + column]
            lower = values[min(GRID_HEIGHT - 1, row + 1) * GRID_WIDTH + column]
            shade = round(128 + (left - right) * 4.2 + (lower - upper) * 3.4)
            pixels.append(min(188, max(68, shade)))
    hillshade = Image.new("L", (GRID_WIDTH, GRID_HEIGHT))
    hillshade.putdata(pixels)
    hillshade = hillshade.resize(target_size, Image.Resampling.BICUBIC)
    return hillshade.filter(ImageFilter.GaussianBlur(radius=5))


def elevation_texture(values, target_size):
    minimum = min(values)
    maximum = max(values)
    span = max(1.0, maximum - minimum)
    normalized = [round((value - minimum) / span * 255) for value in values]
    elevation = Image.new("L", (GRID_WIDTH, GRID_HEIGHT))
    elevation.putdata(normalized)
    return elevation.resize(target_size, Image.Resampling.BICUBIC)


def compose_current_ground(orthophoto, ground_data, tiles, bounds, terrain_bounds, elevations):
    # The free 2022 overview is not detailed enough for a photographic ground texture.
    # Keep only a faint, truthful macro-colour tint and let DEM + current vectors carry
    # the readable detail. This intentionally looks like a digital twin, not an
    # over-zoomed satellite image.
    macro_colour = orthophoto.filter(ImageFilter.GaussianBlur(radius=22))
    macro_colour = ImageEnhance.Color(macro_colour).enhance(0.55)
    base = Image.blend(Image.new("RGB", orthophoto.size, (77, 86, 71)), macro_colour, 0.075)

    elevation = ImageOps.colorize(
        elevation_texture(elevations, base.size),
        black=(59, 70, 61),
        white=(111, 111, 83),
    )
    base = Image.blend(base, elevation, 0.22)

    rng = random.Random(2_026_081_099)
    noise = Image.new("L", (1_024, 1_024))
    noise.putdata([rng.randrange(88, 168) for _ in range(1_024 * 1_024)])
    noise = noise.resize(base.size, Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(radius=0.45))
    texture = ImageOps.colorize(noise, black=(48, 58, 47), white=(152, 151, 121))
    base = Image.blend(base, texture, 0.105)
    hillshade = ImageOps.colorize(
        hillshade_texture(elevations, base.size),
        black=(39, 47, 42),
        white=(188, 187, 163),
    )
    base = Image.blend(base, hillshade, 0.21).convert("RGBA")

    polygon_masks = {}
    polygon_count = 0
    line_features = []

    for feature in ground_data["elements"]:
        geometry = feature.get("geometry", [])
        if len(geometry) < 2:
            continue
        tags = feature.get("tags", {})
        points = [
            tiles.pixel_in_crop(point["lon"], point["lat"], bounds)
            for point in geometry
        ]
        kind = polygon_kind(tags) if is_closed(geometry) else None
        if kind:
            mask = polygon_masks.setdefault(kind, Image.new("L", orthophoto.size, 0))
            ImageDraw.Draw(mask).polygon(points, fill=255)
            polygon_count += 1
        elif tags.get("highway") in ROAD_WIDTH_METERS or tags.get("natural") == "tree_row":
            line_features.append((feature, points))

    overlay = Image.new("RGBA", orthophoto.size, (0, 0, 0, 0))
    for kind, mask in polygon_masks.items():
        red, green, blue, alpha = POLYGON_STYLES[kind]
        fill = Image.new("RGBA", orthophoto.size, (red, green, blue, min(232, alpha + 34)))
        overlay = Image.alpha_composite(
            overlay,
            Image.composite(fill, Image.new("RGBA", orthophoto.size, (0, 0, 0, 0)), mask),
        )
        boundary = Image.new("RGBA", orthophoto.size, (0, 0, 0, 0))
        boundary_draw = ImageDraw.Draw(boundary)
        # A slight mask edge keeps land-cover boundaries crisp without map-like outlines.
        boundary_draw.bitmap((0, 0), mask.filter(ImageFilter.FIND_EDGES), fill=(210, 220, 205, 24))
        overlay = Image.alpha_composite(overlay, boundary)
    base = Image.alpha_composite(base, overlay)

    for index, (kind, mask) in enumerate(sorted(polygon_masks.items())):
        base = draw_surface_pattern(base, mask, kind, 2_026_081_100 + index)

    road_overlay = Image.new("RGBA", orthophoto.size, (0, 0, 0, 0))
    road_draw = ImageDraw.Draw(road_overlay)
    pixels_per_meter = orthophoto.width / (terrain_bounds["maxX"] - terrain_bounds["minX"])
    for feature, points in line_features:
        tags = feature.get("tags", {})
        if tags.get("natural") == "tree_row":
            road_draw.line(points, fill=(19, 53, 31, 150), width=max(2, round(1.2 * pixels_per_meter)))
            continue
        highway = tags["highway"]
        width_pixels = max(2, round(ROAD_WIDTH_METERS[highway] * pixels_per_meter))
        if tags.get("surface") in {"dirt", "fine_gravel", "gravel", "ground", "unpaved"}:
            inner = (143, 128, 99, 204)
        elif highway in {"footway", "path", "steps", "track"}:
            inner = (164, 158, 138, 192)
        else:
            inner = (105, 110, 107, 212)
        road_draw.line(points, fill=(43, 49, 48, 82), width=width_pixels + max(2, round(pixels_per_meter)))
        road_draw.line(points, fill=inner, width=width_pixels)
    base = Image.alpha_composite(base, road_overlay)

    grain = Image.new("RGBA", orthophoto.size, (0, 0, 0, 0))
    grain_draw = ImageDraw.Draw(grain)
    rng = random.Random(2_026_081_101)
    for _ in range(round(orthophoto.width * orthophoto.height / 150)):
        x = rng.randrange(orthophoto.width)
        y = rng.randrange(orthophoto.height)
        value = rng.choice((18, 24, 232, 238))
        grain_draw.point((x, y), fill=(value, value, value, 18))
    base = Image.alpha_composite(base, grain)
    return base.convert("RGB"), {
        "currentGroundLines": len(line_features),
        "currentGroundPolygons": polygon_count,
        "detailSource": "current OpenStreetMap ground geometry",
        "macroColorSource": "2022 orthophoto overview",
        "textureHeight": orthophoto.height,
        "textureWidth": orthophoto.width,
    }


def main():
    args = parse_args()
    source_directory = Path(args.source).resolve()
    output_directory = Path(args.output).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    tile_manifest = load_json(source_directory / "terrain-tile-manifest.json")
    source_manifest = load_json(source_directory / "source-manifest.json")
    ground_data = load_json(source_directory / "openstreetmap-ground.json")
    bounds = source_manifest["bounds"]
    elevation_tiles = TileSet(source_directory, tile_manifest["elevation"])
    orthophoto_tiles = TileSet(source_directory, tile_manifest["orthophoto"])

    values = []
    for row in range(GRID_HEIGHT):
        y = bounds["maxY"] - (bounds["maxY"] - bounds["minY"]) * row / (GRID_HEIGHT - 1)
        for column in range(GRID_WIDTH):
            x = bounds["minX"] + (bounds["maxX"] - bounds["minX"]) * column / (GRID_WIDTH - 1)
            lat, lon = wgs84_from_utm34n(x, y)
            values.append(terrarium_elevation(elevation_tiles.sample(lon, lat)))

    write_grid(output_directory / "hungary-dtm.f32le", values)
    write_grid(output_directory / "hungary-dsm.f32le", values)
    orthophoto_overview = orthophoto_tiles.crop(tile_manifest["boundsWgs84"])
    orthophoto, terrain_surface = compose_current_ground(
        orthophoto_overview,
        ground_data,
        orthophoto_tiles,
        tile_manifest["boundsWgs84"],
        bounds,
        values,
    )
    orthophoto.save(
        output_directory / GROUND_TEXTURE_NAME,
        format="JPEG",
        quality=92,
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
        "coordinateReferenceSystem": "EPSG:32634",
        "orthophoto": {
            "height": orthophoto.height,
            "source": "2022 overview macro-colour with current OSM ground detail",
            "width": orthophoto.width,
        },
        "rasters": {"dsm": raster, "dtm": raster},
        "schemaVersion": 1,
        "terrainSurface": terrain_surface,
        "verticalDatum": "source DEM metres; no vertical exaggeration",
    }
    (output_directory / "raster-metadata.json").write_text(
        f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8"
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
