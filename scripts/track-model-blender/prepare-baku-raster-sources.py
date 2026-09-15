#!/usr/bin/env python3
"""Prepare licensed Baku surface imagery and audit, without certifying terrain.

Build-only packages: rasterio 1.4.4, opencv-python-headless 4.13.0.92,
numpy, Pillow. They are deliberately not dependencies of the website.
"""

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import transform
from rasterio.windows import from_bounds as window_from_bounds


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / ".track-model-build/baku-source"
OUTPUT = ROOT / ".track-model-build/baku-prepared"
BOUNDS = (400500, 4468580, 402970, 4470180)
GEDTM_URL = "https://s3.opengeohub.org/global/edtm/gedtm_rf_m_30m_s_20060101_20151231_go_epsg.4326.3855_v20250611.tif"
SKYSAT_URL = "https://upload.wikimedia.org/wikipedia/commons/6/6d/Baku_City_Circuit%2C_April_9%2C_2018_SkySat.jpg"
SKYSAT_PAGE = "https://commons.wikimedia.org/wiki/File:Baku_City_Circuit,_April_9,_2018_SkySat.jpg"


def read_json(path):
    return json.loads(path.read_text())


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def record(path, **metadata):
    data = path.read_bytes()
    return {"file": str(path.relative_to(ROOT)), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), **metadata}


def extract_terrain(offline):
    target = SOURCE / "gedtm30-baku-native.tif"
    if target.exists():
        return target
    if offline:
        raise FileNotFoundError(target)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="40",
                      CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with rasterio.open(GEDTM_URL) as source:
            window = window_from_bounds(49.824, 40.354, 49.864, 40.380, source.transform)
            window = window.round_offsets().round_lengths()
            data = source.read(1, window=window)
            profile = source.profile.copy()
            profile.update(width=data.shape[1], height=data.shape[0], tiled=False,
                           transform=source.window_transform(window), compress="deflate")
            profile.pop("blockxsize", None)
            profile.pop("blockysize", None)
            with rasterio.open(target, "w", **profile) as destination:
                destination.write(data, 1)
                destination.scales = source.scales
                destination.offsets = source.offsets
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    OUTPUT.mkdir(exist_ok=True)
    pinned = ROOT / "docs/track-model-baku-raster-source-manifest.json"
    if pinned.exists():
        for item in read_json(pinned)["sources"]:
            path = ROOT / item["file"]
            if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
                raise ValueError(f"Pinned source changed; review before rebuilding: {path}")
    source_path = SOURCE / "planet-skysat-2018-04-09.jpg"
    reference_path = SOURCE / "worldview-reference-manifest.json"
    registration_path = ROOT / "docs/track-model-baku-skysat-registration.json"
    # The reviewed fit is pinned rather than silently recomputed on dependency updates.
    registration = read_json(registration_path)
    reference = read_json(reference_path)
    geometry = read_json(ROOT / "docs/track-model-baku-geometry-audit.json")
    matrix = np.asarray(registration["sourcePixelToReferencePixelAffine"], dtype=np.float64)
    spacing = reference["tileGridSpacingMeters"]
    extent = reference["extent"]
    source = cv2.imread(str(source_path))
    if source is None:
        raise FileNotFoundError(source_path)
    inverse = cv2.invertAffineTransform(matrix)
    points = np.asarray([[(x-extent["minX"])/spacing, (extent["maxY"]-y)/spacing]
                         for x, y in geometry["centerline"]], dtype=np.float64)
    source_points = cv2.transform(points[:, None, :], inverse)[:, 0, :]
    covered = ((source_points[:, 0] >= 0) & (source_points[:, 0] < source.shape[1])
               & (source_points[:, 1] >= 0) & (source_points[:, 1] < source.shape[0]))
    if not covered.all():
        raise ValueError("The licensed image does not cover the complete circuit")
    minx, miny, maxx, maxy = BOUNDS
    width, height = 2470, 1600  # one-metre output grid; no additional source detail implied
    mapping = matrix.copy()
    mapping[0] *= spacing
    mapping[0, 2] += extent["minX"]-minx
    mapping[1] *= spacing
    mapping[1, 2] += maxy-extent["maxY"]
    prepared = cv2.warpAffine(source, mapping, (width, height), flags=cv2.INTER_CUBIC)
    mask = cv2.warpAffine(np.full(source.shape[:2], 255, dtype=np.uint8), mapping,
                          (width, height), flags=cv2.INTER_NEAREST)
    if np.any(mask == 0):
        raise ValueError("Scene bounds extend beyond the licensed image")
    texture_path = OUTPUT / "baku-skysat-ground.jpg"
    cv2.imwrite(str(texture_path), prepared, [cv2.IMWRITE_JPEG_QUALITY, 82])
    geotiff_path = OUTPUT / "baku-skysat-ground.tif"
    with rasterio.open(geotiff_path, "w", driver="GTiff", width=width, height=height,
                       count=3, dtype="uint8", crs="EPSG:32639",
                       transform=from_bounds(*BOUNDS, width, height), compress="deflate") as dest:
        dest.write(np.moveaxis(prepared[:, :, ::-1], 2, 0))
    terrain_path = extract_terrain(args.offline)
    xs, ys = zip(*geometry["centerline"])
    with rasterio.open(terrain_path) as terrain:
        lon, lat = transform("EPSG:32639", terrain.crs, xs, ys)
        raw = np.asarray([sample[0] for sample in terrain.sample(zip(lon, lat))])
        if terrain.nodata is not None and np.any(raw == terrain.nodata):
            raise ValueError("Terrain has no-data values on the circuit")
        values = raw*terrain.scales[0]+terrain.offsets[0]
        terrain_report = {"source": "GEDTM30 v1.1", "verticalDatum": "EGM2008 EPSG:3855",
                          "rawScale": terrain.scales[0], "sourceResolutionDegrees": terrain.res,
                          "minMeters": float(values.min()), "maxMeters": float(values.max()),
                          "rangeMeters": float(values.max()-values.min()),
                          "referenceRangeMeters": 26.8,
                          "referenceUrl": "https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc.7I9JEcBw3R2AqXbnJ6hyvc",
                          "sampling": "nearest cell at each source centreline vertex; diagnostic only",
                          "acceptedAsRoadProfile": False}
    report = {
        "modelId": "baku", "crs": "EPSG:32639", "bounds": BOUNDS,
        "surface": {"allCenterlineVerticesCovered": bool(covered.all()),
                    "allOutputPixelsCovered": True, "sourceDate": "2018-04-09",
                    "sourcePixelGroundSpacingMeters": float(np.hypot(matrix[0, 0], matrix[0, 1])*spacing),
                    "registrationInliers": registration["inlierCount"],
                    "registrationRmsMeters": registration["inlierRmsPixels"]*spacing,
                    "registrationNote": "Internal fit residual, not independently surveyed absolute accuracy.",
                    "changes": "Similarity georegistration, crop, cubic resampling to 1 m grid, JPEG conversion.",
                    "attribution": "©2018 Planet Labs, Inc. / SkySat, CC BY-SA 4.0",
                    "licence": "https://creativecommons.org/licenses/by-sa/4.0/"},
        "terrain": terrain_report,
        "publicationReady": False,
        "remainingWork": ["Validate a road elevation profile against independent ground control",
                          "Georeference and verify current event infrastructure",
                          "Build Blender scene, integrate viewer and complete visual acceptance"],
    }
    write_json(OUTPUT / "source-readiness.json", report)
    manifest = {"schemaVersion": 1, "modelId": "baku", "sources": [
        record(source_path, url=SKYSAT_URL, referenceUrl=SKYSAT_PAGE,
               license="CC BY-SA 4.0", role="licensed surface-colour source", date="2018-04-09"),
        record(reference_path, role="UTM 39N registration reference tile manifest",
               license="Reference only; public texture redistribution not established"),
        record(registration_path, role="reviewed image registration with 53 matching points"),
        record(terrain_path, url=GEDTM_URL, role="diagnostic terrain subset; not accepted road profile",
               license="CC BY 4.0", verticalDatum="EGM2008 EPSG:3855", rawScale=0.1),
    ], "derived": [record(texture_path, license="CC BY-SA 4.0"),
                   record(geotiff_path, license="CC BY-SA 4.0")]}
    write_json(OUTPUT / "raster-source-manifest.json", manifest)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
