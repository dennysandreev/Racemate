#!/usr/bin/env python3
"""Prepare Baku's own metric geometry, mapped objects and DEM for Blender."""
import importlib.util
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

import cv2
import numpy as np
import rasterio
from rasterio.warp import transform

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("baku_sources", SCRIPTS / "prepare-baku-sources.py")
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


def main():
    directory = ROOT / ".track-model-build/baku-source"
    prepared = ROOT / ".track-model-build/baku-prepared"
    prepared.mkdir(exist_ok=True)
    audit = source.extract_geometry((directory / "openstreetmap-map.osm").read_bytes())
    bounds = dict(zip(("minX", "minY", "maxX", "maxY"), (400500, 4468580, 402970, 4470180)))
    center = {"x": (bounds["minX"]+bounds["maxX"])/2, "y": (bounds["minY"]+bounds["maxY"])/2}
    line = audit["centerline"]
    cumulative = [0]
    for a, b in zip(line, line[1:]):
        cumulative.append(cumulative[-1]+math.dist(a, b))
    # Apex vertices identified against FIA circuit map and registered SkySat.
    indices = [4, 21, 39, 47, 63, 69, 85, 94, 100, 105, 115, 121, 144, 155, 165, 176, 185, 188, 198, 210]
    turns = [{"number": i+1, "name": f"Turn {i+1}", "distanceMeters": round(cumulative[v], 3),
              "sourceVertex": v, "anchorSide": -1 if i in (6, 7, 9, 11, 13) else 1,
              "anchorOffsetMeters": 14 if i in range(7, 12) else 20,
              "anchorHeightMeters": 8} for i, v in enumerate(indices)]
    root = ET.parse(directory / "openstreetmap-map.osm").getroot()
    nodes = {int(n.attrib["id"]): n for n in root.findall("node")}
    elements = []
    for way in root.findall("way"):
        ids = [int(n.attrib["ref"]) for n in way.findall("nd")]
        if not all(i in nodes for i in ids):
            continue
        tags = {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")}
        if not any(k in tags for k in ("building", "building:part", "barrier", "historic", "highway", "natural")) and int(way.attrib["id"]) not in audit["sourceWayIds"]+audit["sourcePitWayIds"]:
            continue
        elements.append({"type": "way", "id": int(way.attrib["id"]), "tags": tags,
                         "geometry": [{"lat": float(nodes[i].attrib["lat"]), "lon": float(nodes[i].attrib["lon"])} for i in ids]})
    for node in nodes.values():
        tags = {t.attrib["k"]: t.attrib["v"] for t in node.findall("tag")}
        if tags.get("natural") == "tree":
            elements.append({"type": "node", "id": int(node.attrib["id"]), "tags": tags,
                             "lat": float(node.attrib["lat"]), "lon": float(node.attrib["lon"])})
    (directory / "baku-mapped-objects.json").write_text(json.dumps({"elements": elements}))
    # Event catalogue locations, refined against permanent streets in the ortho.
    # Dimensions below are photo-derived modelling estimates, not survey claims.
    stands = []
    def stand(name, start, end, side, offset, depth=12, height=7, rows=12):
        stands.append(dict(name=name, start=start, end=end, side=side, offset=offset,
                           depth=depth, height=height, rows=rows))
    for i, name in enumerate("ABCDE"):
        stand("Absheron "+name, 5920+i*61, 5978+i*61, "right", 23, 18, 10, 18)
    stand("Champions", 5785, 5870, "right", 21)
    stand("Zafar", 5640, 5730, "right", 23)
    stand("Khazar", 5300, 5370, "left", 26, 10)
    stand("Sahil", 1870, 1950, "left", 24, 10)
    stand("Bulvar", 5385, 5480, "right", 24)
    stand("City", 2340, 2420, "left", 25, 9, 6, 10)
    stand("Mugham", 4875, 4970, "right", 22)
    stand("Icheri Sheher", 2980, 3050, "left", 20, 10, 6, 10)
    stand("Giz Galasi", 4670, 4705, "right", 26, 10, 6, 10)
    stand("Filarmoniya", 3810, 3890, "right", 25, 10, 6, 10)
    stand("PASHA Real Estate Azneft A", 4050, 4120, "right", 27, 15, 9, 16)
    stand("PASHA Real Estate Azneft B", 4195, 4250, "right", 25, 12, 8, 14)
    stand("Marine", 4465, 4535, "right", 23, 10, 6, 10)
    width, height = 166, 109
    xs, ys = np.meshgrid(np.linspace(bounds["minX"], bounds["maxX"], width), np.linspace(bounds["maxY"], bounds["minY"], height))
    with rasterio.open(directory / "gedtm30-baku-native.tif") as dem:
        lon, lat = transform("EPSG:32639", dem.crs, xs.ravel(), ys.ravel())
        # Bilinear sample at grid nodes, respecting GeoTIFF's decimetre scale.
        source_grid = dem.read(1).astype(np.float32)*dem.scales[0]+dem.offsets[0]
        col = (np.asarray(lon)-dem.transform.c)/dem.transform.a-.5
        row = (np.asarray(lat)-dem.transform.f)/dem.transform.e-.5
        values = cv2.remap(source_grid, col.reshape(height, width).astype(np.float32), row.reshape(height, width).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    # Suppress cell-scale discontinuities; amplitudes are not rescaled to F1's figure.
    values = cv2.GaussianBlur(values, (5, 5), 1.0)
    values.astype('<f4').tofile(prepared / "baku-dtm.f32le")
    raster = {"width": width, "height": height, "minimum": float(values.min()), "maximum": float(values.max()), "mean": float(values.mean())}
    (prepared / "raster-metadata.json").write_text(json.dumps({"rasters": {"dtm": raster}, "verticalDatum": "EGM2008 EPSG:3855", "sourceResolutionMeters": 30, "verticalExaggeration": 1}, indent=2))
    config = {
        "model": {"id": "baku", "bounds": bounds, "center": center, "trackWidthMeters": 12,
                  "lapLengthMeters": 6003, "pitBoxes": 44, "turns": turns,
                  "startFinishDistanceMeters": 0, "raceStartDistanceMeters": audit["raceStartDistanceFromControlLineMeters"]},
        "centerline": line, "pitLane": audit["pitLane"], "grandstands": stands,
        "sourceDirectory": str(directory),
        "officialControlPoints": {"drs": [], "sourceYear": 2025,
            "sectorBoundaries": [{"sector": 2, "absoluteDistanceMeters": turns[4]["distanceMeters"]-46},
                                 {"sector": 3, "absoluteDistanceMeters": turns[15]["distanceMeters"]-56}],
            "speedTrap": {"turn": 20, "afterTurnMeters": 210}},
        "sourceManifest": json.loads((ROOT / "docs/track-model-baku-raster-source-manifest.json").read_text()),
        "accuracy": {"terrain": "Global DEM, approximately 30 m cells; road elevations are approximate. The source is not rescaled to the published 26.8 m relief.",
                     "buildings": "OSM footprints and tagged heights/levels; untagged heights estimated by building type.",
                     "eventInfrastructure": "2026 names/locations; photo-derived dimensions and 2025 garage drawing.",
                     "imagery": "Planet SkySat 2018-04-09, CC BY-SA 4.0; registration RMS 2.21 m."},
    }
    (ROOT / ".track-model-build/baku.json").write_text(json.dumps(config, indent=2))
    print(json.dumps({"turnDistances": [t["distanceMeters"] for t in turns], "mappedObjects": len(elements), "grandstands": len(stands)}))


if __name__ == "__main__":
    main()
