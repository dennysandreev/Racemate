#!/usr/bin/env python3
"""Prepare a small atlas from photographs of the actual Baku landmarks."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]


def prepare_window_bay(output):
    """One repeatable architectural bay, tinted by each building's vertex colour.

    This is an approximate diagram of a window, not an invented photograph.
    Padding at the tile edges keeps corners and floor joins free of cut windows.
    """
    tile = Image.new("RGB", (128, 128), (255, 255, 255))
    draw = ImageDraw.Draw(tile)
    draw.rectangle((0, 6, 127, 10), fill=(209, 207, 199))
    draw.rectangle((0, 11, 127, 14), fill=(250, 250, 247))
    draw.rectangle((37, 28, 94, 105), fill=(167, 158, 143))
    draw.rectangle((34, 24, 91, 102), fill=(247, 242, 227))
    draw.rectangle((39, 29, 86, 97), fill=(56, 75, 87))
    draw.polygon(((41, 31), (61, 31), (41, 72)), fill=(87, 106, 114))
    draw.polygon(((66, 54), (84, 35), (84, 82), (66, 97)), fill=(67, 88, 100))
    draw.rectangle((61, 28, 65, 99), fill=(224, 222, 210))
    draw.rectangle((39, 52, 87, 55), fill=(224, 222, 210))
    draw.rectangle((32, 100, 93, 104), fill=(250, 246, 232))
    tile.save(output, optimize=True)
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
    atlas.save(output, quality=82, optimize=True)
    window_output = output.with_name("baku-window-bay.png")
    prepare_window_bay(window_output)
    manifest = {"sources": SOURCES, "license": "https://creativecommons.org/licenses/by-sa/4.0/",
                "atlasSize": list(atlas.size), "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                "windowBay": {"file": window_output.name, "sha256": hashlib.sha256(window_output.read_bytes()).hexdigest(),
                              "accuracy": "Procedural window frames, glazing, sill and floor cornice; not a surveyed or photographed facade."},
                "limits": "Two actual photographed landmarks; other facades use approximate window bays and stone colours. Roofs use the georegistered Planet image."}
    manifest_path.write_text(json.dumps(manifest, indent=2)+"\n")
    print(json.dumps({"atlasBytes": output.stat().st_size, "landmarks": len(SOURCES)}))


if __name__ == "__main__": main()
