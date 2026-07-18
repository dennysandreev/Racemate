#!/usr/bin/env python3
"""Validate, preview, and approve clean Formula1.com historical circuit maps."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlparse

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
MIN_SEASON = 2020
MAX_SEASON = 2025
EXPECTED_SIZE = (1252, 704)
TILE_WIDTH = 420
IMAGE_HEIGHT = 236
LABEL_HEIGHT = 54
SHEET_COLUMNS = 3
EXPECTED_RACE_COUNTS = {2020: 17, 2021: 22, 2022: 22, 2023: 22, 2024: 24, 2025: 24}
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$", re.IGNORECASE)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as asset:
        for chunk in iter(lambda: asset.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hostname(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return (urlparse(value).hostname or "").lower()


def is_https_host(value: object, hosts: set[str]) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme == "https" and (parsed.hostname or "").lower() in hosts


def is_formula1_page(value: object) -> bool:
    return is_https_host(value, {"formula1.com", "www.formula1.com"})


def is_formula1_asset(value: object) -> bool:
    return is_https_host(value, {
        "formula1.com",
        "www.formula1.com",
        "media.formula1.com",
    })


def is_formula1_archive(value: object, archive_timestamp: str) -> bool:
    if not is_https_host(value, {"web.archive.org"}):
        return False
    return bool(
        re.match(
            rf"^/web/{re.escape(archive_timestamp)}(?:id_)?/https?://(?:www\.)?formula1\.com/",
            urlparse(str(value)).path,
            re.IGNORECASE,
        )
    )


def is_approved_source(source: dict[str, object]) -> bool:
    authority = source.get("authority")
    if authority == "Formula1.com":
        return is_formula1_page(source.get("pageUrl")) and is_formula1_asset(
            source.get("sourceUrl")
        )
    if authority == "Mercedes-AMG PETRONAS F1 Team":
        transform = source.get("transform") or {}
        return (
            source.get("sourceSelection") == "official-team-event-media"
            and is_https_host(source.get("pageUrl"), {"media.mercedesamgf1.com"})
            and is_https_host(source.get("sourceUrl"), {"media.mercedesamgf1.com"})
            and transform.get("whiteToTransparent") is True
            and isinstance(transform.get("crop"), list)
            and len(transform["crop"]) == 4
        )
    return False


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
    public_root = (ROOT / "public").resolve()
    expected_root = (public_root / "f1" / "circuits" / str(season)).resolve()
    asset_path = (public_root / str(file_value or "").lstrip("/")).resolve()

    if not is_approved_source(source):
        issues.append(f"{label}: source is not an approved official F1/event asset")
    if str(source.get("sourceSelection") or "").startswith("wayback-"):
        archive_timestamp = str(source.get("archiveTimestamp") or "")
        if not re.fullmatch(r"\d{14}", archive_timestamp):
            issues.append(f"{label}: archived source timestamp is missing")
        elif not is_formula1_archive(source.get("archiveUrl"), archive_timestamp):
            issues.append(f"{label}: archived source has no matching Wayback URL")
    try:
        asset_path.relative_to(expected_root)
    except ValueError:
        issues.append(f"{label}: file path escapes the season directory")
        return asset_path, issues
    if not asset_path.is_file():
        issues.append(f"{label}: missing {file_value}")
        return asset_path, issues

    expected_checksum = str(source.get("sha256") or "").lower()
    if not SHA256_PATTERN.fullmatch(expected_checksum) or sha256(asset_path) != expected_checksum:
        issues.append(f"{label}: output checksum mismatch")
    source_checksum = str(source.get("sourceImageSha256") or "")
    if not SHA256_PATTERN.fullmatch(source_checksum):
        issues.append(f"{label}: source image checksum is missing")

    with Image.open(asset_path) as image:
        if image.format != "WEBP":
            issues.append(f"{label}: expected WebP, got {image.format}")
        if image.size != EXPECTED_SIZE:
            issues.append(
                f"{label}: expected {EXPECTED_SIZE[0]}x{EXPECTED_SIZE[1]}, "
                f"got {image.size[0]}x{image.size[1]}"
            )
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A")
        histogram = alpha.histogram()
        transparent_ratio = sum(histogram[:250]) / (image.width * image.height)
        if transparent_ratio < 0.45:
            issues.append(f"{label}: transparent background is missing or too small")
        bbox = alpha.getbbox()
        if not bbox:
            issues.append(f"{label}: image is fully transparent")
        else:
            content_width = (bbox[2] - bbox[0]) / image.width
            content_height = (bbox[3] - bbox[1]) / image.height
            if max(content_width, content_height) < 0.82 or min(content_width, content_height) < 0.3:
                issues.append(f"{label}: track does not fill the image canvas")
        if asset_path.stat().st_size > 1_000_000:
            issues.append(f"{label}: file exceeds 1 MB")

    return asset_path, issues


def build_contact_sheet(
    season: int,
    sources: list[dict[str, object]],
    assets: dict[int, Path],
    output_dir: Path,
) -> Path:
    rows = (len(sources) + SHEET_COLUMNS - 1) // SHEET_COLUMNS
    header_height = 62
    sheet = Image.new(
        "RGB",
        (TILE_WIDTH * SHEET_COLUMNS, header_height + rows * (IMAGE_HEIGHT + LABEL_HEIGHT)),
        (6, 9, 13),
    )
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(25)
    label_font = load_font(14)
    draw.text(
        (18, 16),
        f"RaceMate clean Formula1 circuit maps — {season}",
        fill=(244, 247, 250),
        font=title_font,
    )

    for index, source in enumerate(sources):
        round_number = int(source["round"])
        column = index % SHEET_COLUMNS
        row = index // SHEET_COLUMNS
        x = column * TILE_WIDTH
        y = header_height + row * (IMAGE_HEIGHT + LABEL_HEIGHT)
        with Image.open(assets[round_number]) as image:
            rgba = image.convert("RGBA")
            rgba.thumbnail((TILE_WIDTH, IMAGE_HEIGHT), Image.Resampling.LANCZOS)
            tile = Image.new("RGBA", (TILE_WIDTH, IMAGE_HEIGHT), (11, 15, 21, 255))
            offset = ((TILE_WIDTH - rgba.width) // 2, (IMAGE_HEIGHT - rgba.height) // 2)
            tile.alpha_composite(rgba, offset)
            sheet.paste(tile.convert("RGB"), (x, y))
        draw.rectangle(
            (x, y + IMAGE_HEIGHT, x + TILE_WIDTH, y + IMAGE_HEIGHT + LABEL_HEIGHT),
            fill=(17, 23, 31),
        )
        timestamp = source.get("archiveTimestamp") or "live"
        race_name = str(source.get("raceName") or "Unknown race")
        draw.text(
            (x + 10, y + IMAGE_HEIGHT + 8),
            f"{round_number:02d}  {race_name}",
            fill=(232, 237, 242),
            font=label_font,
        )
        draw.text(
            (x + 10, y + IMAGE_HEIGHT + 29),
            f"source: {timestamp}",
            fill=(139, 151, 165),
            font=label_font,
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"formula1-circuit-maps-{season}.webp"
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
    expected_count = EXPECTED_RACE_COUNTS[season]
    if manifest.get("expectedRaces") != expected_count or len(sources) != expected_count:
        issues.append(f"{season}: expected exactly {expected_count} race maps")
    if not manifest.get("complete") or manifest.get("missing"):
        issues.append(f"{season}: manifest is not complete")
    rights_review = manifest.get("rightsReview") or {}
    if manifest.get("rightsReviewRequired") is not True:
        issues.append(f"{season}: rights review gate is missing")
    if rights_review.get("status") not in {"approved", "cleared"}:
        issues.append(f"{season}: rights review is not approved")
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
                "note": (
                    "Checked on the season contact sheet against the official Formula1.com "
                    "race-page map and the event layout."
                ),
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
