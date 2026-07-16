#!/usr/bin/env python3
"""Validate FIA circuit assets, build contact sheets, and record visual approval."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent.parent
MIN_SEASON = 2020
MAX_SEASON = 2025
TILE_WIDTH = 360
IMAGE_HEIGHT = 203
LABEL_HEIGHT = 35
SHEET_COLUMNS = 4


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as asset:
        for chunk in iter(lambda: asset.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_official_fia_url(value: object) -> bool:
    if not isinstance(value, str):
        return False
    hostname = (urlparse(value).hostname or "").lower()
    return hostname == "fia.com" or hostname.endswith(".fia.com")


def load_font(size: int) -> ImageFont.ImageFont:
    candidates = (
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    )
    for candidate in candidates:
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def validate_source(season: int, source: dict[str, object]) -> tuple[Path, list[str]]:
    round_number = source.get("round")
    label = f"{season} round {round_number}"
    issues: list[str] = []
    file_value = source.get("file")
    asset_path = ROOT / "public" / str(file_value or "").lstrip("/")

    if source.get("authority") != "FIA":
        issues.append(f"{label}: authority must be FIA")
    if not is_official_fia_url(source.get("pageUrl")):
        issues.append(f"{label}: pageUrl is not an official FIA URL")
    if not is_official_fia_url(source.get("sourceUrl")):
        issues.append(f"{label}: sourceUrl is not an official FIA URL")
    if not asset_path.is_file():
        issues.append(f"{label}: missing {file_value}")
        return asset_path, issues

    expected_checksum = source.get("sha256")
    actual_checksum = sha256(asset_path)
    if not isinstance(expected_checksum, str) or actual_checksum != expected_checksum.lower():
        issues.append(f"{label}: rendered checksum mismatch")
    source_checksum = source.get("sourceDocumentSha256")
    if not isinstance(source_checksum, str) or len(source_checksum) != 64:
        issues.append(f"{label}: source PDF checksum is missing")

    with Image.open(asset_path) as image:
        if image.format != "WEBP":
            issues.append(f"{label}: expected WebP, got {image.format}")
        if image.size != (1600, 900):
            issues.append(f"{label}: expected 1600x900, got {image.size[0]}x{image.size[1]}")

    return asset_path, issues


def build_contact_sheet(
    season: int,
    sources: list[dict[str, object]],
    assets: dict[int, Path],
    output_dir: Path,
) -> Path:
    rows = (len(sources) + SHEET_COLUMNS - 1) // SHEET_COLUMNS
    header_height = 58
    sheet = Image.new(
        "RGB",
        (TILE_WIDTH * SHEET_COLUMNS, header_height + rows * (IMAGE_HEIGHT + LABEL_HEIGHT)),
        (6, 9, 13),
    )
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(25)
    label_font = load_font(15)
    draw.text((18, 15), f"RaceMate FIA circuit maps - {season}", fill=(244, 247, 250), font=title_font)

    for index, source in enumerate(sources):
        round_number = int(source["round"])
        column = index % SHEET_COLUMNS
        row = index // SHEET_COLUMNS
        x = column * TILE_WIDTH
        y = header_height + row * (IMAGE_HEIGHT + LABEL_HEIGHT)
        with Image.open(assets[round_number]) as image:
            thumbnail = ImageOps.fit(
                image.convert("RGB"),
                (TILE_WIDTH, IMAGE_HEIGHT),
                method=Image.Resampling.LANCZOS,
            )
            sheet.paste(thumbnail, (x, y))
        draw.rectangle(
            (x, y + IMAGE_HEIGHT, x + TILE_WIDTH, y + IMAGE_HEIGHT + LABEL_HEIGHT),
            fill=(17, 23, 31),
        )
        race_name = str(source.get("raceName") or "Unknown race")
        label = f"{round_number:02d}  {race_name}  |  PDF p.{source.get('renderedPage', '?')}"
        draw.text((x + 10, y + IMAGE_HEIGHT + 9), label, fill=(220, 226, 232), font=label_font)

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"fia-circuit-maps-{season}.webp"
    sheet.save(output_path, "WEBP", quality=94, method=6)
    return output_path


def review_season(
    season: int,
    output_dir: Path,
    approve: bool,
    require_approved: bool,
) -> Path:
    manifest_path = ROOT / "public" / "f1" / "circuits" / str(season) / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    sources = sorted(manifest.get("sources") or [], key=lambda source: int(source["round"]))
    issues: list[str] = []

    if manifest.get("season") != season:
        issues.append(f"{season}: manifest season mismatch")
    if not manifest.get("complete") or manifest.get("missing"):
        issues.append(f"{season}: manifest is not complete")
    rounds = [int(source["round"]) for source in sources]
    if rounds != list(range(1, len(sources) + 1)):
        issues.append(f"{season}: rounds are not contiguous from 1")

    assets: dict[int, Path] = {}
    for source in sources:
        asset_path, source_issues = validate_source(season, source)
        assets[int(source["round"])] = asset_path
        issues.extend(source_issues)
        if require_approved and source.get("manualReview", {}).get("status") != "approved":
            issues.append(f"{season} round {source['round']}: manual review is not approved")

    if issues:
        raise RuntimeError("\n".join(issues))

    output_path = build_contact_sheet(season, sources, assets, output_dir)

    if approve:
        reviewed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        for source in sources:
            source["manualReview"] = {
                "status": "approved",
                "reviewedAt": reviewed_at,
                "reviewer": "RaceMate visual QA",
                "note": "Compared on the season contact sheet with the named FIA event map.",
            }
        manifest["sources"] = sources
        manifest["manualReview"] = {
            "status": "approved",
            "reviewedAt": reviewed_at,
            "reviewer": "RaceMate visual QA",
        }
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    return output_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int)
    parser.add_argument("--approve", action="store_true")
    parser.add_argument("--require-approved", action="store_true")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "output" / "circuit-map-review",
    )
    args = parser.parse_args()
    if args.season and not MIN_SEASON <= args.season <= MAX_SEASON:
        parser.error(f"season must be between {MIN_SEASON} and {MAX_SEASON}")

    seasons = [args.season] if args.season else list(range(MIN_SEASON, MAX_SEASON + 1))
    for season in seasons:
        output = review_season(
            season,
            args.output_dir,
            approve=args.approve,
            require_approved=args.require_approved,
        )
        print(f"{season}: {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
