#!/usr/bin/env python3
"""Cache Baku's public reference imagery without treating it as licensed texture.

The ArcGIS cache is in native UTM 39N, not Web Mercator. Its level spacing
describes the tile grid, not a certified sensor ground sampling distance.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import urllib.request

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SERVICE = "https://tiles.arcgis.com/tiles/3DsRB1ZZo4DBTnH4/arcgis/rest/services/Baku_WorldView_2018_Ortho_Left/MapServer"
BOUNDS = (400200, 4467850, 403100, 4470500)


def fetch(url, target, offline):
    if not target.exists():
        if offline:
            raise FileNotFoundError(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(url, headers={"User-Agent": "RaceSide-track-source-audit/1.0"})
        with urllib.request.urlopen(request, timeout=45) as response:
            data = response.read()
        target.write_bytes(data)
    data = target.read_bytes()
    return {"file": str(target.relative_to(ROOT)), "url": url,
            "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    directory = ROOT / ".track-model-build/baku-source"
    metadata_path = directory / "search/worldview-service.json"
    metadata_source = fetch(SERVICE + "?f=pjson", metadata_path, args.offline)
    metadata = json.loads(metadata_path.read_text())
    tile = metadata["tileInfo"]
    assert tile["spatialReference"]["wkid"] == 32639
    level = 6
    resolution = next(lod["resolution"] for lod in tile["lods"] if lod["level"] == level)
    size = tile["cols"]
    span = resolution * size
    ox, oy = tile["origin"]["x"], tile["origin"]["y"]
    minx, miny, maxx, maxy = BOUNDS
    col0, col1 = math.floor((minx-ox)/span), math.floor((maxx-ox)/span)
    row0, row1 = math.floor((oy-maxy)/span), math.floor((oy-miny)/span)
    coordinates = [(r, c) for r in range(row0, row1+1) for c in range(col0, col1+1)]

    def download(pair):
        row, col = pair
        file = directory / "worldview-reference" / f"{level}-{row}-{col}.png"
        result = fetch(f"{SERVICE}/tile/{level}/{row}/{col}", file, args.offline)
        return row, col, file, result

    mosaic = Image.new("RGB", ((col1-col0+1)*size, (row1-row0+1)*size))
    sources = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for row, col, file, source in pool.map(download, coordinates):
            with Image.open(file) as image:
                if image.size != (size, size):
                    raise ValueError(f"Unexpected tile size: {file}")
                mosaic.paste(image.convert("RGB"), ((col-col0)*size, (row-row0)*size))
            sources.append(source)
    mosaic.save(directory / "worldview-reference-mosaic.jpg", quality=94)
    report = {
        "title": "Baku WorldView 2018 orthophoto reference",
        "sourceYear": 2018, "crs": "EPSG:32639", "level": level,
        "tileGridSpacingMeters": resolution,
        "extent": {"minX": ox+col0*span, "maxY": oy-row0*span,
                   "maxX": ox+(col1+1)*span, "minY": oy-(row1+1)*span},
        "rights": "Public ArcGIS reference; no redistribution licence supplied by publisher. Do not embed as a public texture on that basis alone.",
        "metadata": metadata_source, "tiles": sources,
    }
    manifest_path = directory / "worldview-reference-manifest.json"
    if manifest_path.exists():
        old = json.loads(manifest_path.read_text())
        if old != report:
            raise ValueError("Reference cache changed: review source hashes before accepting it")
    manifest_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    fetch("https://upload.wikimedia.org/wikipedia/commons/6/6d/Baku_City_Circuit%2C_April_9%2C_2018_SkySat.jpg",
          directory / "planet-skysat-2018-04-09.jpg", args.offline)
    print(json.dumps({"tiles": len(sources), "pixels": mosaic.size,
                      "tileGridSpacingMeters": resolution}))


if __name__ == "__main__":
    main()
