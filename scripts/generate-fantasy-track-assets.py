#!/usr/bin/env python3
"""Build lightweight Fantasy League visuals from licensed real-track photos.

The source list is reviewed and pinned in ``fantasy-track-photo-sources.json``.
The script only crops, resizes and lightly grades real photographs. It never
uses a generative model, circuit map, satellite tile, game capture or 3D render.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_MANIFEST = PROJECT_ROOT / "scripts/fantasy-track-photo-sources.json"
SEASON_MANIFEST = PROJECT_ROOT / "public/f1/circuits/2026/manifest.json"
OUTPUT_DIRECTORY = PROJECT_ROOT / "public/f1/tracks/fantasy/2026"
CACHE_DIRECTORY = PROJECT_ROOT / ".codex-tmp/fantasy-track-photo-sources"
CREDITS_MANIFEST = PROJECT_ROOT / "src/data/fantasy-track-photo-credits.json"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "RaceSide/1.0 (Fantasy League licensed asset pipeline; product@raceside.ru)"

VARIANTS = {
    "hero": {"size": (1280, 960), "quality": 78, "hardMax": 220_000},
    "card": {"size": (768, 576), "quality": 76, "hardMax": 100_000},
    "thumb": {"size": (384, 288), "quality": 74, "hardMax": 45_000},
}

ALLOWED_LICENSES = {
    "CC0",
    "CC BY 2.0",
    "CC BY 3.0",
    "CC BY 4.0",
    "CC BY-SA 2.0",
    "CC BY-SA 2.5",
    "CC BY-SA 3.0",
    "CC BY-SA 4.0",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def strip_html(value: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", value)).split())


def metadata_value(metadata: dict[str, Any], key: str) -> str:
    value = metadata.get(key, {})
    return str(value.get("value", "")) if isinstance(value, dict) else ""


def fetch_bytes(url: str, attempts: int = 7) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == attempts - 1:
                raise
            time.sleep(8 * (attempt + 1))
        except urllib.error.URLError:
            if attempt == attempts - 1:
                raise
            time.sleep(4 * (attempt + 1))
    raise RuntimeError(f"Could not download {url}")


def fetch_commons_metadata(sources: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    query = urllib.parse.urlencode(
        {
            "action": "query",
            "titles": "|".join(source["commonsTitle"] for source in sources),
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|size|mime",
            "iiurlwidth": 1920,
            "formatversion": 2,
            "format": "json",
        }
    )
    payload = json.loads(fetch_bytes(f"{COMMONS_API}?{query}"))
    pages = payload.get("query", {}).get("pages", [])
    result = {}
    for page in pages:
        title = page.get("title")
        info = (page.get("imageinfo") or [None])[0]
        if title and info:
            result[title] = info
    return result


def validate_source_list(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    expected = int(manifest["expectedRaces"])
    sources = manifest.get("sources", [])
    failures = []
    if len(sources) != expected:
        failures.append(f"expected {expected} photo sources, found {len(sources)}")
    rounds = [int(source.get("round", 0)) for source in sources]
    if rounds != list(range(1, expected + 1)):
        failures.append(f"rounds must be consecutive 1..{expected}: {rounds}")
    if len({source.get("layoutSlug") for source in sources}) != len(sources):
        failures.append("layoutSlug values must be unique")

    required = {
        "author",
        "circuitId",
        "commonsTitle",
        "focus",
        "layoutSlug",
        "license",
        "licenseUrl",
        "raceName",
        "reviewStatus",
        "sourcePageUrl",
        "visibleSegment",
    }
    for source in sources:
        missing = sorted(required - source.keys())
        if missing:
            failures.append(f"round {source.get('round')}: missing {', '.join(missing)}")
        if source.get("license") not in ALLOWED_LICENSES:
            failures.append(f"round {source.get('round')}: unsupported license {source.get('license')}")
        if not str(source.get("sourcePageUrl", "")).startswith("https://commons.wikimedia.org/wiki/File:"):
            failures.append(f"round {source.get('round')}: source page must be a Wikimedia Commons file page")

    if failures:
        raise RuntimeError("Invalid fantasy photo source list:\n- " + "\n- ".join(failures))
    return sources


def validate_live_metadata(source: dict[str, Any], info: dict[str, Any]) -> dict[str, str]:
    metadata = info.get("extmetadata", {})
    live_author = strip_html(metadata_value(metadata, "Artist"))
    live_license = metadata_value(metadata, "LicenseShortName")
    live_license_url = metadata_value(metadata, "LicenseUrl")
    live_source_page = str(info.get("descriptionurl", ""))
    failures = []

    for label, expected, actual in (
        ("author", source["author"], live_author),
        ("license", source["license"], live_license),
        ("license URL", source["licenseUrl"], live_license_url),
    ):
        if str(expected).rstrip("/") != str(actual).rstrip("/"):
            failures.append(f"{label} changed: expected {expected!r}, received {actual!r}")
    if live_license not in ALLOWED_LICENSES:
        failures.append(f"live license {live_license!r} is not permitted")
    if live_source_page.rstrip("/") != source["sourcePageUrl"].rstrip("/"):
        failures.append(
            f"source page changed: expected {source['sourcePageUrl']!r}, received {live_source_page!r}"
        )
    if failures:
        raise RuntimeError(
            f"Rights verification failed for round {source['round']} ({source['commonsTitle']}):\n- "
            + "\n- ".join(failures)
        )

    return {
        "author": live_author,
        "license": live_license,
        "licenseUrl": live_license_url,
        "sourcePageUrl": live_source_page,
        "capturedAt": metadata_value(metadata, "DateTimeOriginal")
        or metadata_value(metadata, "DateTime"),
    }


def source_cache_path(source: dict[str, Any]) -> Path:
    return CACHE_DIRECTORY / f"{int(source['round']):02d}-{source['layoutSlug']}.source.jpg"


def load_source_photo(source: dict[str, Any], info: dict[str, Any], refresh: bool) -> tuple[Image.Image, Path]:
    CACHE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    path = source_cache_path(source)
    if refresh or not path.exists():
        url = str(info.get("thumburl") or info.get("url") or "").split("?")[0]
        if not url:
            raise RuntimeError(f"No downloadable image URL for {source['commonsTitle']}")
        path.write_bytes(fetch_bytes(url))
        time.sleep(1.25)

    image = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    if image.width < 960 or image.height < 720:
        raise RuntimeError(
            f"Source for round {source['round']} is too small: {image.width}x{image.height}"
        )
    return image, path


def crop_to_ratio(image: Image.Image, focus: dict[str, Any]) -> Image.Image:
    target_ratio = 4 / 3
    zoom = max(1.0, float(focus.get("zoom", 1.0)))
    if image.width / image.height >= target_ratio:
        crop_height = image.height / zoom
        crop_width = crop_height * target_ratio
    else:
        crop_width = image.width / zoom
        crop_height = crop_width / target_ratio

    center_x = image.width * float(focus.get("x", 0.5))
    center_y = image.height * float(focus.get("y", 0.5))
    left = min(max(0.0, center_x - crop_width / 2), image.width - crop_width)
    top = min(max(0.0, center_y - crop_height / 2), image.height - crop_height)
    box = (
        round(left),
        round(top),
        round(left + crop_width),
        round(top + crop_height),
    )
    return image.crop(box)


def grade_photo(image: Image.Image) -> Image.Image:
    image = ImageOps.autocontrast(image, cutoff=0.35)
    image = ImageEnhance.Color(image).enhance(0.9)
    image = ImageEnhance.Contrast(image).enhance(1.045)
    image = ImageEnhance.Brightness(image).enhance(0.96)
    return image


def save_with_budget(image: Image.Image, path: Path, quality: int, hard_max: int) -> int:
    for current_quality in range(quality, 39, -3):
        image.save(path, "WEBP", quality=current_quality, method=6)
        size = path.stat().st_size
        if size <= hard_max:
            return size
    raise RuntimeError(f"{path.name} exceeds {hard_max} bytes at minimum quality")


def build_contact_sheet(entries: list[dict[str, Any]], path: Path) -> None:
    cell_width, image_height, label_height = 384, 288, 58
    columns = 4
    rows = math.ceil(len(entries) / columns)
    board = Image.new("RGB", (columns * cell_width, rows * (image_height + label_height)), "#101419")
    draw = ImageDraw.Draw(board)
    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
        note_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 13)
    except OSError:
        title_font = ImageFont.load_default()
        note_font = ImageFont.load_default()

    for index, entry in enumerate(entries):
        variant_path = PROJECT_ROOT / "public" / entry["variants"]["thumb"]["file"].lstrip("/")
        image = Image.open(variant_path).convert("RGB")
        x = (index % columns) * cell_width
        y = (index // columns) * (image_height + label_height)
        board.paste(image, (x, y))
        draw.text((x + 12, y + image_height + 8), f"{entry['round']:02d} · {entry['raceName']}", font=title_font, fill="#F5F6F7")
        draw.text((x + 12, y + image_height + 33), entry["visibleSegment"][:48], font=note_font, fill="#A9B0B8")

    path.parent.mkdir(parents=True, exist_ok=True)
    board.save(path, "JPEG", quality=88, optimize=True)


def write_attribution(entries: list[dict[str, Any]]) -> None:
    lines = [
        "# Fantasy League track photographs — 2026",
        "",
        "All published files are cropped, resized, metadata-free WebP derivatives of the photographs listed below. No generative editing, geometry editing or object removal was used.",
        "",
    ]
    for entry in entries:
        status = "контекстный кадр" if entry["reviewStatus"] == "context-only" else entry["visibleSegment"]
        lines.extend(
            [
                f"## {entry['round']:02d}. {entry['raceName']}",
                "",
                f"- Photo: [{entry['commonsTitle'].removeprefix('File:')}]({entry['sourcePageUrl']})",
                f"- Author: {entry['author']}",
                f"- License: [{entry['license']}]({entry['licenseUrl']})",
                f"- View: {status}",
                "- Changes: 4:3 crop, resize, light colour/contrast adjustment, metadata removal.",
                "",
            ]
        )
    (OUTPUT_DIRECTORY / "ATTRIBUTION.md").write_text("\n".join(lines), encoding="utf-8")


def build(refresh: bool, contact_sheet: Optional[Path]) -> None:
    source_manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    sources = validate_source_list(source_manifest)
    live_metadata = fetch_commons_metadata(sources)
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    output_sources = []

    for source in sources:
        info = live_metadata.get(source["commonsTitle"])
        if not info:
            raise RuntimeError(f"Wikimedia Commons did not return {source['commonsTitle']}")
        rights = validate_live_metadata(source, info)
        original, cached_path = load_source_photo(source, info, refresh=refresh)
        base = grade_photo(crop_to_ratio(original, source["focus"]))
        output_variants = {}

        for name, definition in VARIANTS.items():
            variant = base.resize(definition["size"], Image.Resampling.LANCZOS)
            file_name = f"{int(source['round']):02d}-{source['layoutSlug']}.{name}.webp"
            output_path = OUTPUT_DIRECTORY / file_name
            byte_size = save_with_budget(
                variant,
                output_path,
                int(definition["quality"]),
                int(definition["hardMax"]),
            )
            output_variants[name] = {
                "file": f"/f1/tracks/fantasy/2026/{file_name}",
                "width": definition["size"][0],
                "height": definition["size"][1],
                "bytes": byte_size,
                "sha256": sha256(output_path),
            }

        output_sources.append(
            {
                "season": 2026,
                "round": int(source["round"]),
                "raceName": source["raceName"],
                "circuitId": source["circuitId"],
                "layoutSlug": source["layoutSlug"],
                "sourceKind": "real-venue-context" if source["reviewStatus"] == "context-only" else "real-track-photo",
                "commonsTitle": source["commonsTitle"],
                "visibleSegment": source["visibleSegment"],
                "author": rights["author"],
                "license": rights["license"],
                "licenseUrl": rights["licenseUrl"],
                "sourcePageUrl": rights["sourcePageUrl"],
                "capturedAt": rights["capturedAt"] or None,
                "acquiredAt": utc_now(),
                "sourceSha256": sha256(cached_path),
                "sourcePixelSize": {"width": original.width, "height": original.height},
                "focus": source["focus"],
                "reviewStatus": source["reviewStatus"],
                "reviewNote": source.get("reviewNote"),
                "changes": "4:3 crop, resize, light colour/contrast adjustment, metadata removal",
                "variants": output_variants,
            }
        )

    output_manifest = {
        "season": 2026,
        "expectedRaces": int(source_manifest["expectedRaces"]),
        "complete": len(output_sources) == int(source_manifest["expectedRaces"]),
        "releaseReady": all(entry["reviewStatus"] == "approved" for entry in output_sources),
        "generatedAt": utc_now(),
        "generator": "scripts/generate-fantasy-track-assets.py",
        "imagePolicy": "licensed real photographs only; no satellite imagery, maps, 3D, game captures or generative AI",
        "sources": output_sources,
    }
    (OUTPUT_DIRECTORY / "manifest.json").write_text(
        json.dumps(output_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    CREDITS_MANIFEST.write_text(
        json.dumps(
            {
                "season": 2026,
                "tracks": [
                    {
                        "round": entry["round"],
                        "layoutSlug": entry["layoutSlug"],
                        "author": entry["author"],
                        "license": entry["license"],
                        "sourcePageUrl": entry["sourcePageUrl"],
                        "visibleSegment": entry["visibleSegment"],
                        "reviewStatus": entry["reviewStatus"],
                    }
                    for entry in output_sources
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    write_attribution(output_sources)
    validate_output(require_release_ready=False)
    if contact_sheet:
        build_contact_sheet(output_sources, contact_sheet)


def validate_output(require_release_ready: bool) -> None:
    manifest_path = OUTPUT_DIRECTORY / "manifest.json"
    if not manifest_path.exists():
        raise RuntimeError(f"Missing {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    failures = []
    sources = manifest.get("sources", [])
    if len(sources) != int(manifest.get("expectedRaces", 0)):
        failures.append("asset manifest does not cover every race")
    season = json.loads(SEASON_MANIFEST.read_text(encoding="utf-8"))
    expected_layouts = [
        (int(source["round"]), source["layoutSlug"])
        for source in season.get("sources", [])
    ]
    actual_layouts = [
        (int(source["round"]), source["layoutSlug"])
        for source in sources
    ]
    if actual_layouts != expected_layouts:
        failures.append("fantasy asset coverage does not match the published season manifest")
    if require_release_ready and not manifest.get("releaseReady"):
        failures.append("asset manifest contains a context-only or unapproved source")

    total_bytes = 0
    for source in sources:
        if source.get("sourceKind") not in {"real-track-photo", "real-venue-context"}:
            failures.append(f"round {source.get('round')}: invalid sourceKind")
        for field in ("author", "license", "licenseUrl", "sourcePageUrl", "sourceSha256"):
            if not source.get(field):
                failures.append(f"round {source.get('round')}: missing {field}")
        for name, definition in VARIANTS.items():
            variant = source.get("variants", {}).get(name)
            if not variant:
                failures.append(f"round {source.get('round')}: missing {name} variant")
                continue
            path = PROJECT_ROOT / "public" / str(variant["file"]).lstrip("/")
            if not path.exists():
                failures.append(f"round {source.get('round')}: missing {path.name}")
                continue
            actual_bytes = path.stat().st_size
            total_bytes += actual_bytes
            with Image.open(path) as image:
                if image.size != definition["size"]:
                    failures.append(f"{path.name}: expected {definition['size']}, got {image.size}")
                if image.getexif():
                    failures.append(f"{path.name}: EXIF metadata was not removed")
            if actual_bytes > int(definition["hardMax"]):
                failures.append(f"{path.name}: {actual_bytes} bytes exceeds {definition['hardMax']}")
            if variant.get("sha256") != sha256(path):
                failures.append(f"{path.name}: checksum mismatch")
    if total_bytes > 8_400_000:
        failures.append(f"all fantasy images total {total_bytes} bytes; budget is 8,400,000")
    if failures:
        raise RuntimeError("Fantasy track asset validation failed:\n- " + "\n- ".join(failures))
    print(
        json.dumps(
            {
                "sources": len(sources),
                "variants": len(sources) * len(VARIANTS),
                "totalBytes": total_bytes,
                "releaseReady": bool(manifest.get("releaseReady")),
            },
            ensure_ascii=False,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="redownload every pinned Commons source")
    parser.add_argument("--validate-only", action="store_true", help="validate checked-in output without network access")
    parser.add_argument("--require-release-ready", action="store_true", help="fail if any source is context-only")
    parser.add_argument("--contact-sheet", type=Path, help="write a review contact sheet after building")
    args = parser.parse_args()
    if args.validate_only:
        validate_output(require_release_ready=args.require_release_ready)
        return
    build(refresh=args.refresh, contact_sheet=args.contact_sheet)
    if args.require_release_ready:
        validate_output(require_release_ready=True)


if __name__ == "__main__":
    main()
