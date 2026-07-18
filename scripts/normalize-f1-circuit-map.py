#!/usr/bin/env python3
"""Normalize an official Formula1 circuit map to the RaceMate WebP canvas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops


OUTPUT_SIZE = (1252, 704)


def parse_crop(value: str) -> tuple[float, float, float, float]:
    try:
        crop = tuple(float(part) for part in value.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError("crop must contain four decimal values") from error
    if len(crop) != 4 or not (0 <= crop[0] < crop[2] <= 1) or not (0 <= crop[1] < crop[3] <= 1):
        raise argparse.ArgumentTypeError("crop must be normalized left,top,right,bottom values")
    return crop


def make_white_transparent(image: Image.Image) -> Image.Image:
    red, green, blue, original_alpha = image.split()
    darkest_channel = ImageChops.darker(red, ImageChops.darker(green, blue))
    distance_from_white = darkest_channel.point(
        lambda value: max(0, min(255, (242 - value) * 32))
    )
    alpha = ImageChops.darker(original_alpha, distance_from_white)
    image.putalpha(alpha)
    return image


def normalize(
    source_path: Path,
    output_path: Path,
    crop: tuple[float, float, float, float] | None,
    white_to_transparent: bool,
) -> None:
    with Image.open(source_path) as source:
        image = source.convert("RGBA")

    if crop:
        image = image.crop(
            (
                round(image.width * crop[0]),
                round(image.height * crop[1]),
                round(image.width * crop[2]),
                round(image.height * crop[3]),
            )
        )
    if white_to_transparent:
        image = make_white_transparent(image)

    scale = min(OUTPUT_SIZE[0] / image.width, OUTPUT_SIZE[1] / image.height)
    resized_size = (round(image.width * scale), round(image.height * scale))
    image = image.resize(resized_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", OUTPUT_SIZE, (0, 0, 0, 0))
    offset = (
        (OUTPUT_SIZE[0] - image.width) // 2,
        (OUTPUT_SIZE[1] - image.height) // 2,
    )
    canvas.alpha_composite(image, offset)

    alpha = canvas.getchannel("A")
    if alpha.getextrema()[0] == 255:
        raise RuntimeError("Formula1 circuit map must have a transparent background")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, "WEBP", quality=95, method=6, exact=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--crop", type=parse_crop)
    parser.add_argument("--white-to-transparent", action="store_true")
    args = parser.parse_args()
    normalize(args.source, args.output, args.crop, args.white_to_transparent)


if __name__ == "__main__":
    main()
