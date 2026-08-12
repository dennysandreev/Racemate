#!/usr/bin/env python3
"""Prepare Environment Agency 1 m LIDAR and current Silverstone ground colour."""

from __future__ import annotations

import importlib.util
import io
import json
import math
import struct
import zipfile
from pathlib import Path

from PIL import Image, ImageOps


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
BASE_PATH = SCRIPT_DIRECTORY / "prepare-hungaroring-rasters.py"
BASE_SPEC = importlib.util.spec_from_file_location("track_raster_base", BASE_PATH)
base = importlib.util.module_from_spec(BASE_SPEC)
BASE_SPEC.loader.exec_module(base)

GRID_WIDTH = 121
GRID_HEIGHT = 147
GROUND_TEXTURE_NAME = "silverstone-hybrid-ground-2026.jpg"


def wgs84_from_utm30n(easting, northing):
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
    longitude = math.radians(-3) + (
        d
        - (1 + 2 * t1 + c1) * d**3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * secondary_eccentricity_squared + 24 * t1**2) * d**5 / 120
    ) / cosine
    return math.degrees(latitude), math.degrees(longitude)


def utm30n_from_wgs84(lat, lon):
    semi_major = 6_378_137.0
    flattening = 1 / 298.257223563
    scale = 0.9996
    eccentricity_squared = flattening * (2 - flattening)
    secondary_eccentricity_squared = eccentricity_squared / (1 - eccentricity_squared)
    latitude = math.radians(lat)
    longitude_delta = math.radians(lon + 3)
    sine = math.sin(latitude)
    cosine = math.cos(latitude)
    tangent = math.tan(latitude)
    radius = semi_major / math.sqrt(1 - eccentricity_squared * sine**2)
    t = tangent**2
    c = secondary_eccentricity_squared * cosine**2
    a = cosine * longitude_delta
    meridional_arc = semi_major * (
        (1 - eccentricity_squared / 4 - 3 * eccentricity_squared**2 / 64 - 5 * eccentricity_squared**3 / 256) * latitude
        - (3 * eccentricity_squared / 8 + 3 * eccentricity_squared**2 / 32 + 45 * eccentricity_squared**3 / 1024) * math.sin(2 * latitude)
        + (15 * eccentricity_squared**2 / 256 + 45 * eccentricity_squared**3 / 1024) * math.sin(4 * latitude)
        - 35 * eccentricity_squared**3 / 3072 * math.sin(6 * latitude)
    )
    return (
        500_000 + scale * radius * (a + (1 - t + c) * a**3 / 6 + (5 - 18 * t + t**2 + 72 * c - 58 * secondary_eccentricity_squared) * a**5 / 120),
        scale * (meridional_arc + radius * tangent * (a**2 / 2 + (5 - t + 9 * c + 4 * c**2) * a**4 / 24 + (61 - 58 * t + t**2 + 600 * c - 330 * secondary_eccentricity_squared) * a**6 / 720)),
    )


def cartesian_from_geodetic(lat, lon, semi_major, semi_minor):
    eccentricity_squared = 1 - semi_minor**2 / semi_major**2
    latitude = math.radians(lat)
    longitude = math.radians(lon)
    radius = semi_major / math.sqrt(1 - eccentricity_squared * math.sin(latitude) ** 2)
    return (
        radius * math.cos(latitude) * math.cos(longitude),
        radius * math.cos(latitude) * math.sin(longitude),
        (1 - eccentricity_squared) * radius * math.sin(latitude),
    )


def geodetic_from_cartesian(x, y, z, semi_major, semi_minor):
    eccentricity_squared = 1 - semi_minor**2 / semi_major**2
    longitude = math.atan2(y, x)
    p = math.hypot(x, y)
    latitude = math.atan2(z, p * (1 - eccentricity_squared))
    for _ in range(12):
        radius = semi_major / math.sqrt(1 - eccentricity_squared * math.sin(latitude) ** 2)
        following = math.atan2(z + eccentricity_squared * radius * math.sin(latitude), p)
        if abs(following - latitude) < 1e-12:
            latitude = following
            break
        latitude = following
    return math.degrees(latitude), math.degrees(longitude)


def british_national_grid_from_wgs84(lat, lon):
    x, y, z = cartesian_from_geodetic(lat, lon, 6_378_137.0, 6_356_752.3141)
    seconds = math.pi / (180 * 3_600)
    rx, ry, rz = (-0.1502 * seconds, -0.2470 * seconds, -0.8421 * seconds)
    scale = 1 + 20.4894e-6
    transformed = (
        -446.448 + scale * x - rz * y + ry * z,
        125.157 + rz * x + scale * y - rx * z,
        -542.060 - ry * x + rx * y + scale * z,
    )
    latitude_deg, longitude_deg = geodetic_from_cartesian(
        *transformed, 6_377_563.396, 6_356_256.909
    )
    latitude = math.radians(latitude_deg)
    longitude = math.radians(longitude_deg)
    semi_major = 6_377_563.396
    semi_minor = 6_356_256.909
    scale_factor = 0.9996012717
    latitude_origin = math.radians(49)
    longitude_origin = math.radians(-2)
    eccentricity_squared = 1 - semi_minor**2 / semi_major**2
    n = (semi_major - semi_minor) / (semi_major + semi_minor)
    sine = math.sin(latitude)
    cosine = math.cos(latitude)
    tangent = math.tan(latitude)
    radius_transverse = semi_major * scale_factor / math.sqrt(1 - eccentricity_squared * sine**2)
    radius_meridian = semi_major * scale_factor * (1 - eccentricity_squared) / (1 - eccentricity_squared * sine**2) ** 1.5
    eta_squared = radius_transverse / radius_meridian - 1
    delta_latitude = latitude - latitude_origin
    sum_latitude = latitude + latitude_origin
    meridional_arc = semi_minor * scale_factor * (
        (1 + n + 5 / 4 * n**2 + 5 / 4 * n**3) * delta_latitude
        - (3 * n + 3 * n**2 + 21 / 8 * n**3) * math.sin(delta_latitude) * math.cos(sum_latitude)
        + (15 / 8 * n**2 + 15 / 8 * n**3) * math.sin(2 * delta_latitude) * math.cos(2 * sum_latitude)
        - 35 / 24 * n**3 * math.sin(3 * delta_latitude) * math.cos(3 * sum_latitude)
    )
    delta_longitude = longitude - longitude_origin
    northing = (
        -100_000 + meridional_arc
        + radius_transverse / 2 * sine * cosine * delta_longitude**2
        + radius_transverse / 24 * sine * cosine**3 * (5 - tangent**2 + 9 * eta_squared) * delta_longitude**4
        + radius_transverse / 720 * sine * cosine**5 * (61 - 58 * tangent**2 + tangent**4) * delta_longitude**6
    )
    easting = (
        400_000 + radius_transverse * cosine * delta_longitude
        + radius_transverse / 6 * cosine**3 * (radius_transverse / radius_meridian - tangent**2) * delta_longitude**3
        + radius_transverse / 120 * cosine**5 * (5 - 18 * tangent**2 + tangent**4 + 14 * eta_squared - 58 * tangent**2 * eta_squared) * delta_longitude**5
    )
    return easting, northing


class LidarSampler:
    def __init__(self, path):
        self.image = Image.open(path)
        if self.image.mode != "F":
            self.image = self.image.convert("F")
        transform = self.image.tag_v2.get(34264)
        if not transform:
            raise RuntimeError("Environment Agency GeoTIFF is missing its model transform")
        self.pixel_width = float(transform[0])
        self.pixel_height = float(transform[5])
        self.origin_lon = float(transform[3])
        self.origin_lat = float(transform[7])
        self.pixels = self.image.load()

    def sample(self, lon, lat):
        x = (lon - self.origin_lon) / self.pixel_width
        y = (lat - self.origin_lat) / self.pixel_height
        x = min(max(x, 0.0), self.image.width - 1.001)
        y = min(max(y, 0.0), self.image.height - 1.001)
        x0 = int(math.floor(x))
        y0 = int(math.floor(y))
        x1 = min(x0 + 1, self.image.width - 1)
        y1 = min(y0 + 1, self.image.height - 1)
        samples = [
            (self.pixels[x0, y0], (1 - (x - x0)) * (1 - (y - y0))),
            (self.pixels[x1, y0], (x - x0) * (1 - (y - y0))),
            (self.pixels[x0, y1], (1 - (x - x0)) * (y - y0)),
            (self.pixels[x1, y1], (x - x0) * (y - y0)),
        ]
        valid = [
            (float(value), weight)
            for value, weight in samples
            if float(value) > 50 and weight > 1e-9
        ]
        if valid:
            weight = sum(item[1] for item in valid)
            return sum(value * item_weight for value, item_weight in valid) / max(weight, 1e-9)
        for radius in range(1, 9):
            for candidate_y in range(max(0, y0 - radius), min(self.image.height, y0 + radius + 1)):
                for candidate_x in range(max(0, x0 - radius), min(self.image.width, x0 + radius + 1)):
                    value = float(self.pixels[candidate_x, candidate_y])
                    if value > 50:
                        return value
        return None


class BritishGridRasterSampler:
    def __init__(self, zip_path):
        with zipfile.ZipFile(zip_path) as archive:
            tif_name = next(name for name in archive.namelist() if name.lower().endswith(".tif"))
            source_image = Image.open(io.BytesIO(archive.read(tif_name)))
            tiepoint = source_image.tag_v2.get(33922)
            scale = source_image.tag_v2.get(33550)
            self.image = source_image.convert("F")
        if not tiepoint or not scale:
            raise RuntimeError(f"British National Grid GeoTIFF in {zip_path.name} has no georeference")
        self.origin_easting = float(tiepoint[3])
        self.origin_northing = float(tiepoint[4])
        self.pixel_width = float(scale[0])
        self.pixel_height = float(scale[1])
        self.pixels = self.image.load()

    def sample_bng(self, easting, northing):
        x = (easting - self.origin_easting) / self.pixel_width
        y = (self.origin_northing - northing) / self.pixel_height
        if x < 0 or y < 0 or x >= self.image.width - 1 or y >= self.image.height - 1:
            return None
        x0, y0 = int(math.floor(x)), int(math.floor(y))
        tx, ty = x - x0, y - y0
        samples = (
            (float(self.pixels[x0, y0]), (1 - tx) * (1 - ty)),
            (float(self.pixels[x0 + 1, y0]), tx * (1 - ty)),
            (float(self.pixels[x0, y0 + 1]), (1 - tx) * ty),
            (float(self.pixels[x0 + 1, y0 + 1]), tx * ty),
        )
        valid = [(value, weight) for value, weight in samples if value > -10_000]
        if not valid:
            return None
        total_weight = sum(weight for _, weight in valid)
        return sum(value * weight for value, weight in valid) / max(total_weight, 1e-9)

    def sample_wgs84(self, lat, lon):
        return self.sample_bng(*british_national_grid_from_wgs84(lat, lon))


class ProjectedTextureCanvas:
    def __init__(self, texture_size, terrain_bounds):
        self.width, self.height = texture_size
        self.bounds = terrain_bounds

    def pixel_in_crop(self, lon, lat, _bounds):
        x, y = utm30n_from_wgs84(lat, lon)
        return (
            (x - self.bounds["minX"]) / (self.bounds["maxX"] - self.bounds["minX"]) * self.width,
            (self.bounds["maxY"] - y) / (self.bounds["maxY"] - self.bounds["minY"]) * self.height,
        )


def intensity_texture(raster, terrain_bounds, size=(1_200, 1_460)):
    sample_width, sample_height = 481, 585
    values = []
    for row in range(sample_height):
        y = terrain_bounds["maxY"] - (terrain_bounds["maxY"] - terrain_bounds["minY"]) * row / (sample_height - 1)
        for column in range(sample_width):
            x = terrain_bounds["minX"] + (terrain_bounds["maxX"] - terrain_bounds["minX"]) * column / (sample_width - 1)
            lat, lon = wgs84_from_utm30n(x, y)
            values.append(raster.sample_wgs84(lat, lon))
    valid = sorted(value for value in values if value is not None)
    low = valid[round(len(valid) * 0.02)]
    high = valid[round(len(valid) * 0.98)]
    span = max(1.0, high - low)
    normalized = [
        18 if value is None else round(28 + min(1, max(0, (value - low) / span)) * 207)
        for value in values
    ]
    image = Image.new("L", (sample_width, sample_height))
    image.putdata(normalized)
    image = image.resize(size, Image.Resampling.BICUBIC)
    image = ImageOps.colorize(image, black=(45, 51, 45), white=(151, 145, 119))
    return image, {"intensityMaximum": high, "intensityMinimum": low}


def write_grid(path, values):
    with path.open("wb") as handle:
        for value in values:
            handle.write(struct.pack("<f", value))


def fill_missing_grid(values):
    valid = [value for value in values if value is not None]
    fallback = sum(valid) / len(valid)
    result = list(values)
    for index, value in enumerate(result):
        if value is not None:
            continue
        row, column = divmod(index, GRID_WIDTH)
        neighbours = []
        for radius in range(1, 8):
            for yy in range(max(0, row - radius), min(GRID_HEIGHT, row + radius + 1)):
                for xx in range(max(0, column - radius), min(GRID_WIDTH, column + radius + 1)):
                    candidate = result[yy * GRID_WIDTH + xx]
                    if candidate is not None:
                        neighbours.append(candidate)
            if neighbours:
                break
        result[index] = sum(neighbours) / len(neighbours) if neighbours else fallback
    return result


def main():
    args = base.parse_args()
    source_directory = Path(args.source).resolve()
    output_directory = Path(args.output).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    source_manifest = base.load_json(source_directory / "source-manifest.json")
    ground_data = base.load_json(source_directory / "openstreetmap-ground.json")
    bounds = source_manifest["bounds"]
    lidar = LidarSampler(source_directory / "environment-agency-lidar-dtm-1m.tif")
    dsm_source = BritishGridRasterSampler(
        source_directory / "environment-agency-lidar-first-return-dsm-1m.zip"
    )
    intensity_source = BritishGridRasterSampler(
        source_directory / "environment-agency-lidar-intensity-1m.zip"
    )

    values = []
    dsm_values = []
    for row in range(GRID_HEIGHT):
        y = bounds["maxY"] - (bounds["maxY"] - bounds["minY"]) * row / (GRID_HEIGHT - 1)
        for column in range(GRID_WIDTH):
            x = bounds["minX"] + (bounds["maxX"] - bounds["minX"]) * column / (GRID_WIDTH - 1)
            lat, lon = wgs84_from_utm30n(x, y)
            dtm_value = lidar.sample(lon, lat)
            values.append(dtm_value)
            dsm_value = dsm_source.sample_wgs84(lat, lon)
            dsm_values.append(dsm_value if dsm_value is not None else dtm_value)
    values = fill_missing_grid(values)
    dsm_values = fill_missing_grid(dsm_values)

    write_grid(output_directory / "silverstone-dtm.f32le", values)
    write_grid(output_directory / "silverstone-dsm.f32le", dsm_values)
    reflectance, intensity_quality = intensity_texture(intensity_source, bounds)
    base.GRID_WIDTH = GRID_WIDTH
    base.GRID_HEIGHT = GRID_HEIGHT
    surface_texture, terrain_surface = base.compose_current_ground(
        reflectance,
        ground_data,
        ProjectedTextureCanvas(reflectance.size, bounds),
        None,
        bounds,
        values,
    )
    terrain_surface.update(intensity_quality)
    terrain_surface["macroColorSource"] = "Environment Agency National LIDAR Programme intensity 1 m"
    terrain_surface["elevationSource"] = "Environment Agency LIDAR Composite DTM 1 m"
    terrain_surface["structureHeightSource"] = "Environment Agency LIDAR Composite first-return DSM 1 m"
    surface_texture.save(
        output_directory / GROUND_TEXTURE_NAME,
        format="JPEG",
        quality=91,
        optimize=True,
        progressive=True,
    )

    raster = {
        "height": GRID_HEIGHT,
        "maximum": max(values),
        "mean": sum(values) / len(values),
        "minimum": min(values),
        "sourceResolutionMeters": 1.0,
        "verticalDatum": "Ordnance Datum Newlyn (ODN)",
        "width": GRID_WIDTH,
    }
    metadata = {
        "bounds": bounds,
        "coordinateReferenceSystem": "EPSG:32630",
        "surfaceTexture": {
            "height": surface_texture.height,
            "source": "measured 1 m LIDAR intensity with current OSM surface detail",
            "width": surface_texture.width,
        },
        "rasters": {
            "dsm": {
                **raster,
                "maximum": max(dsm_values),
                "mean": sum(dsm_values) / len(dsm_values),
                "minimum": min(dsm_values),
            },
            "dtm": raster,
        },
        "schemaVersion": 1,
        "terrainSurface": terrain_surface,
        "verticalDatum": "Ordnance Datum Newlyn (ODN); no vertical exaggeration",
    }
    (output_directory / "raster-metadata.json").write_text(
        f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8"
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
