#!/usr/bin/env python3
"""Pin and audit Baku's mapped geometry before building the digital twin.

This preflight deliberately produces no publishable model without the missing
terrain, surface and event-infrastructure inputs listed in its report.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
BOUNDS_WGS84 = [49.826, 40.357, 49.860, 40.377]
BOUNDS_UTM = {"minX": 400200, "minY": 4467850, "maxX": 403100, "maxY": 4470500}
RELATION_ID = 11266687
OFFICIAL_LENGTH = 6003
SOURCES = [
    ("openstreetmap-map.osm",
     "https://api.openstreetmap.org/api/0.6/map?bbox=49.826,40.357,49.860,40.377",
     "OpenStreetMap contributors, ODbL 1.0", "circuit, pit lane, buildings and mapped infrastructure",
     "original vector nodes, EPSG:4326"),
    ("fia-2025-event-notes.pdf",
     "https://www.fia.com/system/files/decision-document/2025_azerbaijan_grand_prix_-_event_notes_-_circuit_map_pit_lane_quarantine_zone_and_red_zone.pdf",
     "FIA / Formula One; reference only, not a texture redistribution licence",
     "2025 layout, separate start/control lines, sectors, speed trap and pit drawing",
     "vector PDF, document reference, issued 2025-09-18"),
    ("official-tickets-2026.html", "https://www.bakucitycircuit.com/buy-now",
     "Baku City Circuit; reference only", "2026 grandstand inventory and location images",
     "HTML, schematic location references"),
]
BLOCKERS = [
    "GEDTM30 and SRTM were found, but their sampled road relief fails the independent elevation check.",
    "Licensed SkySat surface imagery was found and georegistered; verify changes since its 2018 acquisition.",
    "Building footprints are available, but surveyed roof geometry and heights are incomplete.",
    "2026 grandstand, pit-building and paddock footprints/heights require source verification.",
    "2026 FIA control points and pit allocation require verification when event notes are published.",
]


def utm39n(lat, lon):
    """WGS84 / UTM 39N, EPSG:32639; same series as existing track exporters."""
    major, flattening, scale = 6378137.0, 1 / 298.257223563, 0.9996
    e = flattening * (2 - flattening)
    ep = e / (1 - e)
    phi = math.radians(lat)
    sin, cos, tan = math.sin(phi), math.cos(phi), math.tan(phi)
    n = major / math.sqrt(1 - e * sin**2)
    t, c, a = tan**2, ep * cos**2, cos * math.radians(lon - 51)
    m = major * ((1 - e/4 - 3*e**2/64 - 5*e**3/256)*phi
                 - (3*e/8 + 3*e**2/32 + 45*e**3/1024)*math.sin(2*phi)
                 + (15*e**2/256 + 45*e**3/1024)*math.sin(4*phi)
                 - 35*e**3/3072*math.sin(6*phi))
    return [500000 + scale*n*(a + (1-t+c)*a**3/6
                             + (5-18*t+t*t+72*c-58*ep)*a**5/120),
            scale*(m + n*tan*(a*a/2 + (5-t+9*c+4*c*c)*a**4/24
                             + (61-58*t+t*t+600*c-330*ep)*a**6/720))]


def length(points):
    return sum(math.dist(a, b) for a, b in zip(points, points[1:]))


def project_to_line(points, target):
    best = (float("inf"), 0, None, 0)
    distance = 0
    for i, (a, b) in enumerate(zip(points, points[1:])):
        dx, dy = b[0]-a[0], b[1]-a[1]
        segment = math.hypot(dx, dy)
        if segment == 0:
            continue
        t = max(0, min(1, ((target[0]-a[0])*dx + (target[1]-a[1])*dy)/segment**2))
        p = [a[0]+t*dx, a[1]+t*dy]
        candidate = (math.dist(p, target), distance+t*segment, p, i+1)
        if candidate[0] < best[0]:
            best = candidate
        distance += segment
    return best


def extract_building_relation(root, relation_id):
    """Resolve one verified courtyard landmark without flattening its holes."""
    relation = next((e for e in root.findall("relation") if int(e.attrib["id"]) == relation_id), None)
    if relation is None:
        raise ValueError(f"Building relation {relation_id} is missing")
    nodes = {n.attrib["id"]: n for n in root.findall("node")}
    ways = {w.attrib["id"]: w for w in root.findall("way")}
    rings = {"outer": [], "inner": []}
    for member in relation.findall("member"):
        role = member.attrib.get("role", "outer") or "outer"
        if member.attrib["type"] != "way" or role not in rings:
            continue
        way = ways.get(member.attrib["ref"])
        if way is None:
            raise ValueError(f"Incomplete building relation {relation_id}")
        ids = [n.attrib["ref"] for n in way.findall("nd")]
        if len(ids) < 4 or ids[0] != ids[-1] or any(i not in nodes for i in ids):
            raise ValueError(f"Unclosed or incomplete building ring in relation {relation_id}")
        rings[role].append([{"lat": float(nodes[i].attrib["lat"]), "lon": float(nodes[i].attrib["lon"])} for i in ids])
    if len(rings["outer"]) != 1:
        raise ValueError(f"Expected one outer ring for building relation {relation_id}")
    return {"type": "relation", "id": relation_id,
            "tags": {t.attrib["k"]: t.attrib["v"] for t in relation.findall("tag")},
            "geometry": rings["outer"][0], "innerRings": rings["inner"]}


def extract_geometry(xml):
    root = ET.fromstring(xml)
    nodes = {int(e.attrib["id"]): e for e in root.findall("node")}
    ways = {int(e.attrib["id"]): e for e in root.findall("way")}
    relation = next((e for e in root.findall("relation") if int(e.attrib["id"]) == RELATION_ID), None)
    if relation is None:
        raise ValueError("Baku circuit relation is missing")
    node_ids, way_ids, markers, pit_ids = [], [], {}, []
    for member in relation.findall("member"):
        kind, reference, role = member.attrib["type"], int(member.attrib["ref"]), member.attrib["role"]
        if kind == "node" and role in ("start", "finish"):
            markers[role] = reference
        if kind != "way":
            continue
        if role == "pit_lane":
            pit_ids.append(reference)
            continue
        if role:
            raise ValueError(f"Unexpected circuit member role: {role}")
        ids = [int(n.attrib["ref"]) for n in ways[reference].findall("nd")]
        if node_ids and node_ids[-1] == ids[-1]:
            ids.reverse()
        if node_ids and node_ids[-1] != ids[0]:
            raise ValueError(f"Unresolved circuit gap before OSM way {reference}")
        node_ids.extend(ids[1:] if node_ids else ids)
        way_ids.append(reference)
    if not node_ids or node_ids[0] != node_ids[-1]:
        raise ValueError("The OSM circuit is not closed; never silently bridge a gap")
    if set(markers) != {"start", "finish"} or len(pit_ids) != 1:
        raise ValueError("Expected separate start/finish nodes and one mapped pit way")

    def coordinate(node_id):
        node = nodes[node_id]
        return utm39n(float(node.attrib["lat"]), float(node.attrib["lon"]))

    points = [coordinate(i) for i in node_ids]
    # FIA top view: the main straight runs east towards T1. The relation order
    # currently follows the opposite direction; infer direction from the tangent.
    finish = coordinate(markers["finish"])
    _, _, _, next_index = project_to_line(points, finish)
    if points[next_index][0] < points[next_index-1][0]:
        points.reverse()
        node_ids.reverse()
    separation, _, projected, split = project_to_line(points, finish)
    if separation > 15:
        raise ValueError(f"Finish marker is {separation:.2f} m from circuit")
    rotated = [projected, *points[split:-1], *points[:split], projected]
    # A control line can coincide exactly with an existing OSM vertex.
    # Keep closure, but remove consecutive zero-length edges before meshing.
    points = [rotated[0]]
    for point in rotated[1:]:
        if math.dist(point, points[-1]) > 1e-6:
            points.append(point)
    lap_length = length(points)
    error = abs(lap_length-OFFICIAL_LENGTH)/OFFICIAL_LENGTH*100
    if error > 0.5:
        raise ValueError(f"Centreline length deviation {error:.4f}% exceeds 0.5%")
    pit_way = ways[pit_ids[0]]
    pit = [coordinate(int(n.attrib["ref"])) for n in pit_way.findall("nd")]
    # The pit lane follows the same eastward travel direction as the main straight.
    if pit[-1][0] < pit[0][0]:
        pit.reverse()
    building_count = height_count = 0
    for way in ways.values():
        tags = {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")}
        if tags.get("building"):
            building_count += 1
            height_count += int("height" in tags or "building:levels" in tags)
    start = project_to_line(points, coordinate(markers["start"]))
    return {
        "coordinateReferenceSystem": "EPSG:32639", "verticalDatum": None,
        "units": "metres", "verticalExaggeration": 1,
        "bounds": BOUNDS_UTM,
        "center": {"x": (BOUNDS_UTM["minX"]+BOUNDS_UTM["maxX"])/2,
                   "y": (BOUNDS_UTM["minY"]+BOUNDS_UTM["maxY"])/2},
        "centerline": points, "pitLane": pit,
        "sourceRelationId": RELATION_ID, "sourceWayIds": way_ids,
        "sourcePitWayIds": pit_ids, "sourceMarkerNodeIds": markers,
        "officialLapLengthMeters": OFFICIAL_LENGTH,
        "measuredLapLengthMeters": lap_length, "lengthErrorPercent": error,
        "finishProjectionDistanceMeters": separation,
        "raceStartDistanceFromControlLineMeters": start[1],
        "startProjectionDistanceMeters": start[0],
        "pitLaneLengthMeters": length(pit),
        "closed": points[0] == points[-1], "directionAtControlLine": "eastbound",
        "sourceBuildingCount": building_count,
        "sourceBuildingsWithHeightOrLevels": height_count,
        "officialControls2025": {
            "sector2Start": {"beforeTurn": 5, "distanceMeters": 46},
            "sector3Start": {"beforeTurn": 16, "distanceMeters": 56},
            "speedTrap": {"afterTurn": 20, "distanceMeters": 210},
        },
        "publicationReady": False, "missingInputs": BLOCKERS,
    }


def prepare(directory, refresh=False, offline=False):
    directory.mkdir(parents=True, exist_ok=True)
    manifest_path = directory / "source-manifest.json"
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else None
    records = []
    for filename, url, license_text, role, resolution in SOURCES:
        destination = directory / filename
        if refresh or not destination.exists():
            if offline:
                raise ValueError(f"Missing cached source: {filename}")
            request = urllib.request.Request(url, headers={"User-Agent": "RaceSide Baku source preflight/1.0"})
            with urllib.request.urlopen(request, timeout=60) as response:
                content = response.read()
            destination.write_bytes(content)
        content = destination.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        if old and not refresh:
            previous = next((s for s in old["sources"] if s["file"] == filename), None)
            if previous is None or previous["sha256"] != digest:
                raise ValueError(f"Pinned source changed: {filename}; inspect before --refresh")
        records.append({"file": filename, "url": url, "license": license_text, "role": role,
                        "resolution": resolution, "bytes": len(content), "sha256": digest,
                        "bboxWgs84": BOUNDS_WGS84, "verticalDatum": None})
    geometry = extract_geometry((directory / "openstreetmap-map.osm").read_bytes())
    manifest = {"schemaVersion": 1, "modelId": "baku", "sources": records,
                "coordinateReferenceSystem": "EPSG:32639", "bboxWgs84": BOUNDS_WGS84}
    for name, value in [("source-manifest.json", manifest), ("geometry-audit.json", geometry)]:
        (directory / name).write_text(json.dumps(value, indent=2, ensure_ascii=False)+"\n")
    return geometry


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / ".track-model-build/baku-source")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    if args.refresh and args.offline:
        parser.error("--refresh cannot be combined with --offline")
    report = prepare(args.source, args.refresh, args.offline)
    print(json.dumps({key: report[key] for key in [
        "measuredLapLengthMeters", "lengthErrorPercent", "pitLaneLengthMeters", "closed",
        "raceStartDistanceFromControlLineMeters", "publicationReady", "missingInputs",
    ]}, indent=2))
