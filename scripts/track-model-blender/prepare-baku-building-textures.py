#!/usr/bin/env python3
"""Prepare a small atlas from photographs of the actual Baku landmarks."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCES = [
    {"id": "ismailiyya", "file": "ismailiyya.jpg", "author": "Sefer azeri", "date": "2015-09-17",
     "page": "https://commons.wikimedia.org/wiki/File:Ismailiyye_palace_main_fa%C3%A7ade,_Baku,_2015.jpg",
     "url": "https://upload.wikimedia.org/wikipedia/commons/b/b1/Ismailiyye_palace_main_fa%C3%A7ade%2C_Baku%2C_2015.jpg",
     "license": "CC BY-SA 4.0", "osmWayId": 153876715,
     "cropPixels": [142, 760, 2254, 1770], "atlasPixels": [0, 0, 1536, 768],
     "use": "photographed north facade below the decorative skyline; planar projection"},
    {"id": "maiden-tower", "file": "maiden-tower.jpg", "author": "Ludvig14", "date": "2019-04-19",
     "page": "https://commons.wikimedia.org/wiki/File:Baku_Maiden_Tower_004_7736.jpg",
     "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Baku_Maiden_Tower_004_7736.jpg/1280px-Baku_Maiden_Tower_004_7736.jpg",
     "license": "CC BY-SA 4.0", "osmWayId": 299418016,
     "cropPixels": [225, 340, 305, 740], "atlasPixels": [1536, 0, 1792, 768],
     "use": "masonry detail sampled from the tower itself; repeated around its mapped footprint"},
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    directory = ROOT / ".track-model-build/baku-source/facades"
    directory.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGB", (1792, 768))
    manifest_path = ROOT / "docs/track-model-baku-building-textures.json"
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else None
    for source in SOURCES:
        destination = directory / source["file"]
        if not destination.exists():
            if args.offline: raise FileNotFoundError(destination)
            request = urllib.request.Request(source["url"], headers={"User-Agent": "RaceSide-Track-Builder/1.0"})
            with urllib.request.urlopen(request, timeout=90) as response:
                destination.write_bytes(response.read())
        source["sha256"] = hashlib.sha256(destination.read_bytes()).hexdigest()
        if previous:
            expected = next(s["sha256"] for s in previous["sources"] if s["id"] == source["id"])
            if source["sha256"] != expected: raise ValueError(f"Changed source: {source['id']}")
        x0,y0,x1,y1 = source["atlasPixels"]
        image = Image.open(destination).convert("RGB").crop(source["cropPixels"])
        atlas.paste(image.resize((x1-x0,y1-y0), Image.Resampling.LANCZOS), (x0,y0))
    output = ROOT / ".track-model-build/baku-prepared/baku-landmark-facades.jpg"
    atlas.save(output, quality=87, optimize=True)
    manifest = {"sources": SOURCES, "license": "https://creativecommons.org/licenses/by-sa/4.0/",
                "atlasSize": list(atlas.size), "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                "limits": "Two actual photographed landmarks; other facades use approximate stone colours. Roofs use the georegistered Planet image."}
    manifest_path.write_text(json.dumps(manifest, indent=2)+"\n")
    print(json.dumps({"atlasBytes": output.stat().st_size, "landmarks": len(SOURCES)}))


if __name__ == "__main__": main()
