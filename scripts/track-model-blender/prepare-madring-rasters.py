#!/usr/bin/env python3
"""Prepare Madrid's measured vectors, LoD2 roofs and classified June 2026 LiDAR.

Build-only requirements: Pillow, numpy, laspy==2.6.1 and lazrs==0.8.0.
Raw, unmodified archives remain alongside the checksummed source manifest.
"""
import argparse
import json
import math
import struct
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

import laspy
import numpy as np
from PIL import Image


def shape_records(archive):
    """Read the municipal PolyLineZ shapefile without dropping record IDs or CRS."""
    with zipfile.ZipFile(archive) as z:
        dbf = z.read("CIRCUITO_F1_MADRING.dbf")
        count, header, length = struct.unpack_from("<IHH", dbf, 4)
        shp = z.read("CIRCUITO_F1_MADRING.shp")
    records, offset = [], 100
    while offset < len(shp):
        record_id, words = struct.unpack_from(">ii", shp, offset)
        body = shp[offset + 8:offset + 8 + words * 2]
        shape_type = struct.unpack_from("<i", body)[0]
        if shape_type != 13:
            raise ValueError(f"Expected municipal PolyLineZ, got {shape_type}")
        parts, points = struct.unpack_from("<ii", body, 36)
        starts = list(struct.unpack_from(f"<{parts}i", body, 44)) + [points]
        xy_offset = 44 + parts * 4
        coordinates = [list(struct.unpack_from("<dd", body, xy_offset + index * 16)) for index in range(points)]
        z_min, z_max = struct.unpack_from("<dd", body, xy_offset + points * 16)
        # The municipality's CAD Z values are all zero: they are not elevations.
        records.append({"id": record_id, "category": dbf[header + (record_id - 1) * length + 1:header + record_id * length].decode("utf8").strip(), "paths": [coordinates[starts[i]:starts[i + 1]] for i in range(parts)], "sourceZRange": [z_min, z_max]})
        offset += 8 + words * 2
    if len(records) != count:
        raise ValueError("Shapefile and DBF record counts disagree")
    return records


def bilinear(values, x, y, bounds):
    height, width = values.shape
    fx = np.clip((x - bounds["minX"]) / (bounds["maxX"] - bounds["minX"]) * (width - 1), 0, width - 1)
    fy = np.clip((bounds["maxY"] - y) / (bounds["maxY"] - bounds["minY"]) * (height - 1), 0, height - 1)
    x0, y0 = fx.astype(int), fy.astype(int)
    x1, y1 = np.minimum(x0 + 1, width - 1), np.minimum(y0 + 1, height - 1)
    u, v = fx - x0, fy - y0
    return values[y0, x0] * (1-u)*(1-v) + values[y0, x1]*u*(1-v) + values[y1, x0]*(1-u)*v + values[y1, x1]*u*v


def prepare_lidar(source, output, bounds):
    # Grid nodes, including both bbox edges, agree with the shared Blender sampler.
    step = 2.0
    width = round((bounds["maxX"] - bounds["minX"]) / step) + 1
    height = round((bounds["maxY"] - bounds["minY"]) / step) + 1
    counts = np.zeros(width * height, dtype=np.int64)
    sums = np.zeros(width * height, dtype=np.float64)
    surface = np.full(width * height, -np.inf)
    classifications, tile_counts = {}, {}
    for archive in sorted(source.glob("lidar-*.zip")):
        with zipfile.ZipFile(archive) as z:
            member = next(name for name in z.namelist() if name.endswith(".laz"))
            laz_path = output / member
            if not laz_path.exists():
                # Stream to disk; the LAZ reader needs random access, a ZipExtFile does not.
                import shutil
                with z.open(member) as incoming, laz_path.open("wb") as destination:
                    shutil.copyfileobj(incoming, destination)
        tile_counts[archive.name] = 0
        with laspy.open(laz_path) as reader:
            for chunk in reader.chunk_iterator(1_000_000):
                xs, ys, zs = np.asarray(chunk.x), np.asarray(chunk.y), np.asarray(chunk.z)
                classes = np.asarray(chunk.classification)
                valid = (xs >= bounds["minX"]) & (xs <= bounds["maxX"]) & (ys >= bounds["minY"]) & (ys <= bounds["maxY"])
                xs, ys, zs, classes = xs[valid], ys[valid], zs[valid], classes[valid]
                indices = np.rint((bounds["maxY"]-ys)/step).astype(int)*width + np.rint((xs-bounds["minX"])/step).astype(int)
                ground = classes == 2
                np.add.at(sums, indices[ground], zs[ground])
                np.add.at(counts, indices[ground], 1)
                np.maximum.at(surface, indices, zs)
                tile_counts[archive.name] += len(zs)
                keys, quantities = np.unique(classes, return_counts=True)
                for key, quantity in zip(keys, quantities):
                    classifications[str(key)] = classifications.get(str(key), 0) + int(quantity)
        print(f"LiDAR: {archive.name}: {tile_counts[archive.name]:,} points in scene", flush=True)
    xx, yy = np.meshgrid(np.linspace(bounds["minX"], bounds["maxX"], width), np.linspace(bounds["maxY"], bounds["minY"], height))
    rasters, report = {}, {"classifications": classifications, "tilePointCounts": tile_counts, "gridStepMeters": step, "groundCells": int(np.count_nonzero(counts))}
    for kind in ["dtm", "dsm"]:
        image = Image.open(source / f"ign-{kind}.tif")
        scale, tie = image.tag_v2[33550], image.tag_v2[33922]
        fallback_bounds = {"minX": tie[3]+scale[0]/2, "maxX": tie[3]+scale[0]*(image.width-0.5), "maxY": tie[4]-scale[1]/2, "minY": tie[4]-scale[1]*(image.height-0.5)}
        fallback = bilinear(np.asarray(image, dtype=float), xx, yy, fallback_bounds).ravel()
        measured = counts > 0 if kind == "dtm" else np.isfinite(surface)
        values = fallback.copy()
        values[measured] = sums[measured]/counts[measured] if kind == "dtm" else surface[measured]
        if not np.all(np.isfinite(values)) or values.min() < 500 or values.max() > 800:
            raise ValueError(f"Invalid {kind} elevations")
        values.astype("<f4").tofile(output / f"madring-{kind}.f32le")
        rasters[kind] = {"width": width, "height": height, "minimum": float(values.min()), "maximum": float(values.max()), "mean": float(values.mean()), "sourceResolutionMeters": step, "nationalFallbackCells": int(np.count_nonzero(~measured))}
    return rasters, report


def prepare_buildings(source, output, bounds, image):
    buildings, seen = [], set()
    for archive in sorted(source.glob("madrid-lod2-*.zip")):
        with zipfile.ZipFile(archive) as z:
            for member in z.namelist():
                if not member.endswith(".obj") or member in seen:
                    continue
                text = z.read(member).decode("utf8", errors="strict")
                first = next((line for line in text.splitlines() if line.startswith("v ")), None)
                if not first:
                    continue
                x, y, _ = map(float, first.split()[1:4])
                if not (bounds["minX"]-250 <= x <= bounds["maxX"]+250 and bounds["minY"]-250 <= y <= bounds["maxY"]+250):
                    continue
                vertices = [list(map(float, line.split()[1:4])) for line in text.splitlines() if line.startswith("v ")]
                cx = sum(p[0] for p in vertices)/len(vertices)
                cy = sum(p[1] for p in vertices)/len(vertices)
                if not (bounds["minX"] <= cx <= bounds["maxX"] and bounds["minY"] <= cy <= bounds["maxY"]):
                    continue
                faces = [[int(part.split("/")[0])-1 for part in line.split()[1:]] for line in text.splitlines() if line.startswith("f ")]
                px = min(image.width-1, max(0, round((cx-bounds["minX"])/(bounds["maxX"]-bounds["minX"])*image.width)))
                py = min(image.height-1, max(0, round((bounds["maxY"]-cy)/(bounds["maxY"]-bounds["minY"])*image.height)))
                colors = [image.getpixel((min(image.width-1, max(0, px+dx)), min(image.height-1, max(0, py+dy)))) for dx in [-2, 0, 2] for dy in [-2, 0, 2]]
                color = [float(np.median([c[k] for c in colors]))/255 for k in range(3)]
                buildings.append({"id": member.removesuffix(".obj"), "archive": archive.name, "center": [cx, cy], "vertices": vertices, "faces": faces, "roofColorSrgb": color})
                seen.add(member)
    (output / "madring-lod2.json").write_text(json.dumps(buildings), encoding="utf8")
    return len(buildings)


def prepare_osm(source, output):
    root = ET.parse(source / "osm-map.xml").getroot()
    nodes = {node.get("id"): node for node in root.findall("node")}
    elements = []
    for element in [*root.findall("node"), *root.findall("way")]:
        tags = {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
        item = {"id": int(element.get("id")), "type": element.tag, "tags": tags}
        if element.tag == "node":
            if not tags:
                continue
            item.update(lat=float(element.get("lat")), lon=float(element.get("lon")))
        else:
            item["geometry"] = [{"lat": float(nodes[n.get("ref")].get("lat")), "lon": float(nodes[n.get("ref")].get("lon"))} for n in element.findall("nd") if n.get("ref") in nodes]
        elements.append(item)
    (output / "osm.json").write_text(json.dumps({"elements": elements}), encoding="utf8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    source, output = Path(args.source), Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((source / "source-manifest.json").read_text())
    bounds = manifest["bounds"]
    geometries = shape_records(source / "madrid-circuit.zip")
    (output / "madring-geometries.json").write_text(json.dumps(geometries), encoding="utf8")
    image = Image.open(source / "madrid-orthophoto-2026.png").convert("RGB")
    image.save(output / "madring-orthophoto-2026.jpg", quality=82, optimize=True)
    buildings = prepare_buildings(source, output, bounds, image)
    prepare_osm(source, output)
    rasters, lidar = prepare_lidar(source, output, bounds)
    metadata = {"bounds": bounds, "coordinateReferenceSystem": "EPSG:25830", "verticalDatum": manifest["verticalDatum"], "rasters": rasters, "lidar": lidar, "lod2Candidates": buildings, "terrainSurface": {"source": "Ayuntamiento de Madrid true orthophoto, flight 2026-06-13", "nativeResolutionMeters": 0.07, "textureWidth": image.width, "textureHeight": image.height, "exportResolutionMeters": 0.78125}, "schemaVersion": 1}
    (output / "raster-metadata.json").write_text(json.dumps(metadata, indent=2)+"\n", encoding="utf8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
