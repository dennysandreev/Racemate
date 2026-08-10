"""Build a deterministic RaceSide track diorama and export it as GLB.

Run through build-track.mjs. Blender owns all mesh generation so the production
asset can be rebuilt without a hand-authored .blend file.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Sequence

import bpy
from mathutils import Vector


SCENE_HALF_SPAN = 5.0
TRACK_SAMPLES = 480
TERRAIN_COLUMNS = 49
TERRAIN_ROWS = 37
TRACK_HALF_WIDTH = 0.0145
PIT_LANE_FULL_OFFSET = -0.027
PIT_LANE_FENCE_OFFSET = 0.0115
PIT_GARAGE_DOOR_COUNT = 20
PIT_TEAM_BAY_COUNT = 10
RANDOM_SEED = 2026


@dataclass(frozen=True)
class TrackPoint:
    progress: float
    x: float
    y: float
    elevation_m: float


@dataclass(frozen=True)
class TrackFrame:
    progress: float
    x: float
    y: float
    z: float
    normal_x: float
    normal_y: float
    bank_angle_deg: float


@dataclass(frozen=True)
class BuildContext:
    datum_offset_m: float
    dense_track: list[TrackPoint]
    frames: list[TrackFrame]
    horizontal_half_span_m: float
    model: dict
    reference_elevation_m: float
    residuals: list[tuple[TrackPoint, float]]
    terrain_grid: list[list[tuple[float, float, float, float]]]
    vertical_scale: float


@dataclass(frozen=True)
class GrandstandSpec:
    distance: float
    length: float
    name: str
    progress: float
    roof: bool
    side: int
    tiers: int
    width: float


# Locations follow the Dutch GP 2025 wayfinding map. The three sections along
# the start-finish straight are grouped into one continuous roofless stand at
# this diorama scale, as requested for a cleaner composition.
GRANDSTAND_SPECS = (
    GrandstandSpec(0.46, 2.25, "Start-Finish Grandstand", 0.020, False, 1, 8, 0.34),
    GrandstandSpec(0.78, 0.50, "Ben Pon", 0.135, False, 1, 5, 0.27),
    GrandstandSpec(0.43, 0.50, "Hairpin 1", 0.525, False, 1, 5, 0.27),
    GrandstandSpec(0.46, 0.48, "Hairpin 2", 0.575, False, 1, 5, 0.27),
    GrandstandSpec(0.43, 0.58, "Eastside 1", 0.655, False, 1, 6, 0.28),
    GrandstandSpec(0.43, 0.58, "Eastside 2", 0.700, False, 1, 6, 0.28),
    GrandstandSpec(0.42, 0.50, "Arena In", 0.735, False, -1, 6, 0.28),
    GrandstandSpec(0.44, 0.52, "Arena", 0.765, False, 1, 6, 0.29),
    GrandstandSpec(0.43, 0.48, "Arena Out", 0.810, False, 1, 5, 0.27),
)


class MeshBuilder:
    def __init__(self, material_count: int, with_vertex_colors: bool = False) -> None:
        self.faces: list[tuple[int, ...]] = []
        self.material_count = material_count
        self.material_indices: list[int] = []
        self.vertex_colors: list[tuple[float, float, float, float]] = []
        self.vertices: list[tuple[float, float, float]] = []
        self.with_vertex_colors = with_vertex_colors

    def add_face(
        self,
        coordinates: Sequence[Sequence[float]],
        material_index: int,
        colors: Sequence[Sequence[float]] | None = None,
    ) -> None:
        if material_index < 0 or material_index >= self.material_count:
            raise ValueError(f"invalid material index: {material_index}")

        start = len(self.vertices)
        self.vertices.extend(tuple(float(value) for value in coordinate) for coordinate in coordinates)
        self.faces.append(tuple(range(start, start + len(coordinates))))
        self.material_indices.append(material_index)

        if self.with_vertex_colors:
            resolved_colors = colors or [(1.0, 1.0, 1.0, 1.0)] * len(coordinates)

            if len(resolved_colors) != len(coordinates):
                raise ValueError("one vertex color is required for every face coordinate")

            self.vertex_colors.extend(tuple(float(value) for value in color) for color in resolved_colors)


def parse_arguments() -> argparse.Namespace:
    raw_arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--glb", required=True)
    parser.add_argument("--preview", required=True)
    return parser.parse_args(raw_arguments)


def srgb_channel_to_linear(value: float) -> float:
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def color(hex_value: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    normalized = hex_value.lstrip("#")
    red = int(normalized[0:2], 16) / 255
    green = int(normalized[2:4], 16) / 255
    blue = int(normalized[4:6], 16) / 255
    return (
        srgb_channel_to_linear(red),
        srgb_channel_to_linear(green),
        srgb_channel_to_linear(blue),
        alpha,
    )


def mix_color(
    start: Sequence[float],
    end: Sequence[float],
    ratio: float,
) -> tuple[float, float, float, float]:
    safe_ratio = clamp(ratio, 0.0, 1.0)
    return tuple(
        start[index] + (end[index] - start[index]) * safe_ratio for index in range(4)
    )


def scale_color(
    source: Sequence[float], factor: float
) -> tuple[float, float, float, float]:
    return (
        clamp(source[0] * factor, 0.0, 1.0),
        clamp(source[1] * factor, 0.0, 1.0),
        clamp(source[2] * factor, 0.0, 1.0),
        source[3],
    )


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def lerp(start: float, end: float, ratio: float) -> float:
    return start + (end - start) * ratio


def circular_progress_distance(left: float, right: float) -> float:
    distance = abs(left - right)
    return min(distance, 1.0 - distance)


def progress_in_range(progress: float, start: float, end: float) -> bool:
    return start <= progress <= end if start <= end else progress >= start or progress <= end


def catmull_rom(before: float, first: float, second: float, after: float, ratio: float) -> float:
    ratio_squared = ratio * ratio
    ratio_cubed = ratio_squared * ratio
    return 0.5 * (
        2.0 * first
        + (-before + second) * ratio
        + (2.0 * before - 5.0 * first + 4.0 * second - after) * ratio_squared
        + (-before + 3.0 * first - 3.0 * second + after) * ratio_cubed
    )


def normalize_track_points(model: dict) -> tuple[list[TrackPoint], float]:
    source_points = model["data"]["points"]
    minimum_x = min(point[1] for point in source_points)
    maximum_x = max(point[1] for point in source_points)
    minimum_y = min(point[2] for point in source_points)
    maximum_y = max(point[2] for point in source_points)
    center_x = (minimum_x + maximum_x) / 2.0
    center_y = (minimum_y + maximum_y) / 2.0
    source_half_span = max(maximum_x - minimum_x, maximum_y - minimum_y) / 2.0
    horizontal_half_span_m = source_half_span / 10.0

    points = [
        TrackPoint(
            progress=float(point[0]),
            x=(float(point[1]) - center_x) / source_half_span,
            y=(float(point[2]) - center_y) / source_half_span,
            elevation_m=float(point[3]) / 10.0,
        )
        for point in source_points
    ]
    return points, horizontal_half_span_m


def sample_terrain_source(terrain: dict, x: float, y: float) -> float:
    bounds = terrain["bounds"]
    columns = int(terrain["columns"])
    rows = int(terrain["rows"])
    column_position = (
        (clamp(x, bounds["minX"], bounds["maxX"]) - bounds["minX"])
        / (bounds["maxX"] - bounds["minX"])
        * (columns - 1)
    )
    row_position = (
        (clamp(y, bounds["minY"], bounds["maxY"]) - bounds["minY"])
        / (bounds["maxY"] - bounds["minY"])
        * (rows - 1)
    )
    column = min(columns - 2, math.floor(column_position))
    row = min(rows - 2, math.floor(row_position))
    column_ratio = column_position - column
    row_ratio = row_position - row
    values = terrain["values"]
    top = lerp(values[row][column], values[row][column + 1], column_ratio)
    bottom = lerp(values[row + 1][column], values[row + 1][column + 1], column_ratio)
    return lerp(top, bottom, row_ratio)


def build_aligned_track(
    raw_points: Sequence[TrackPoint], terrain: dict
) -> tuple[list[TrackPoint], float, list[tuple[TrackPoint, float]]]:
    raw_residuals = [
        point.elevation_m - sample_terrain_source(terrain, point.x, point.y)
        for point in raw_points
    ]
    datum_offset_m = sum(raw_residuals) / len(raw_residuals)
    aligned_points = [
        TrackPoint(
            progress=point.progress,
            x=point.x,
            y=point.y,
            elevation_m=point.elevation_m - datum_offset_m,
        )
        for point in raw_points
    ]
    residuals = [
        (point, point.elevation_m - sample_terrain_source(terrain, point.x, point.y))
        for point in aligned_points
    ]
    return aligned_points, datum_offset_m, residuals


def sample_closed_track(points: Sequence[TrackPoint], sample_count: int) -> list[TrackPoint]:
    minimum_elevation = min(point.elevation_m for point in points)
    maximum_elevation = max(point.elevation_m for point in points)
    sampled: list[TrackPoint] = []

    for index in range(sample_count):
        progress = index / sample_count
        second_index = next(
            (candidate for candidate, point in enumerate(points) if point.progress > progress),
            1,
        )
        second_index = 1 if second_index <= 0 else second_index
        first_index = second_index - 1
        first = points[first_index]
        second = points[second_index]
        before = points[len(points) - 2 if first_index == 0 else first_index - 1]
        after = points[1 if second_index == len(points) - 1 else second_index + 1]
        point_range = max(second.progress - first.progress, 1e-6)
        ratio = clamp((progress - first.progress) / point_range, 0.0, 1.0)
        sampled.append(
            TrackPoint(
                progress=progress,
                x=catmull_rom(before.x, first.x, second.x, after.x, ratio),
                y=catmull_rom(before.y, first.y, second.y, after.y, ratio),
                elevation_m=clamp(
                    catmull_rom(
                        before.elevation_m,
                        first.elevation_m,
                        second.elevation_m,
                        after.elevation_m,
                        ratio,
                    ),
                    minimum_elevation,
                    maximum_elevation,
                ),
            )
        )

    return sampled


def corrected_terrain_elevation(
    terrain: dict,
    residuals: Sequence[tuple[TrackPoint, float]],
    x: float,
    y: float,
) -> tuple[float, float]:
    source_elevation_m = sample_terrain_source(terrain, x, y)
    correction_m = 0.0
    total_weight = 0.0
    nearest_distance_squared = float("inf")

    for point, residual_m in residuals:
        distance_squared = (point.x - x) ** 2 + (point.y - y) ** 2
        weight = math.exp(-distance_squared / 0.035)
        correction_m += residual_m * weight
        total_weight += weight
        nearest_distance_squared = min(nearest_distance_squared, distance_squared)

    track_influence = math.exp(-nearest_distance_squared / 0.055)
    aligned_correction_m = correction_m / total_weight if total_weight > 0 else 0.0
    track_distance = math.sqrt(nearest_distance_squared)
    dune_detail_blend = smoothstep((track_distance - 0.045) / 0.12)
    dune_detail_m = (
        math.sin(x * 18.0 + y * 7.0) * 0.62
        + math.sin(y * 23.0 - x * 5.0) * 0.34
    ) * dune_detail_blend
    return (
        source_elevation_m + aligned_correction_m * track_influence + dune_detail_m,
        source_elevation_m,
    )


def build_terrain_grid(
    terrain: dict,
    residuals: Sequence[tuple[TrackPoint, float]],
) -> list[list[tuple[float, float, float, float]]]:
    bounds = terrain["bounds"]
    grid: list[list[tuple[float, float, float, float]]] = []

    for row in range(TERRAIN_ROWS):
        normalized_row = row / (TERRAIN_ROWS - 1)
        y = lerp(bounds["minY"], bounds["maxY"], normalized_row)
        grid_row = []

        for column in range(TERRAIN_COLUMNS):
            normalized_column = column / (TERRAIN_COLUMNS - 1)
            x = lerp(bounds["minX"], bounds["maxX"], normalized_column)
            elevation_m, source_elevation_m = corrected_terrain_elevation(
                terrain, residuals, x, y
            )
            grid_row.append((x, y, elevation_m, source_elevation_m))

        grid.append(grid_row)

    return grid


def bank_angle_at_progress(model: dict, progress: float) -> float:
    for banking_range in model["rendering"].get("banking", []):
        if progress_in_range(progress, banking_range["from"], banking_range["to"]):
            return float(banking_range["angleDeg"])
    return 0.0


def build_frames(
    track: Sequence[TrackPoint],
    model: dict,
    reference_elevation_m: float,
    vertical_scale: float,
) -> list[TrackFrame]:
    frames = []

    for index, point in enumerate(track):
        previous = track[(index - 1) % len(track)]
        following = track[(index + 1) % len(track)]
        tangent_x = following.x - previous.x
        tangent_y = following.y - previous.y
        tangent_length = math.hypot(tangent_x, tangent_y) or 1.0
        frames.append(
            TrackFrame(
                progress=point.progress,
                x=point.x * SCENE_HALF_SPAN,
                y=point.y * SCENE_HALF_SPAN,
                z=(point.elevation_m - reference_elevation_m) * vertical_scale,
                normal_x=-tangent_y / tangent_length,
                normal_y=tangent_x / tangent_length,
                bank_angle_deg=bank_angle_at_progress(model, point.progress),
            )
        )

    return frames


def create_build_context(model: dict) -> BuildContext:
    raw_points, horizontal_half_span_m = normalize_track_points(model)
    aligned_points, datum_offset_m, residuals = build_aligned_track(
        raw_points, model["terrain"]
    )
    dense_track = sample_closed_track(aligned_points, TRACK_SAMPLES)
    reference_elevation_m = float(model["terrain"]["elevationMinM"]) - 4.0
    vertical_scale = (
        SCENE_HALF_SPAN
        * float(model["camera"]["verticalExaggeration"])
        / horizontal_half_span_m
    )
    terrain_grid = build_terrain_grid(model["terrain"], residuals)
    frames = build_frames(dense_track, model, reference_elevation_m, vertical_scale)
    return BuildContext(
        datum_offset_m=datum_offset_m,
        dense_track=dense_track,
        frames=frames,
        horizontal_half_span_m=horizontal_half_span_m,
        model=model,
        reference_elevation_m=reference_elevation_m,
        residuals=residuals,
        terrain_grid=terrain_grid,
        vertical_scale=vertical_scale,
    )


def make_flat_material(
    name: str,
    hex_value: str,
    roughness: float = 0.9,
    metallic: float = 0.0,
    double_sided: bool = False,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    material.diffuse_color = color(hex_value)
    material.use_backface_culling = not double_sided
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color(hex_value)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic

    if emission_strength > 0:
        emission_color = principled.inputs.get("Emission Color") or principled.inputs.get(
            "Emission"
        )
        emission_level = principled.inputs.get("Emission Strength")

        if emission_color is not None:
            emission_color.default_value = color(hex_value)

        if emission_level is not None:
            emission_level.default_value = emission_strength

    return material


def make_vertex_color_material(name: str) -> bpy.types.Material:
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    material.use_backface_culling = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    vertex_color = nodes.new("ShaderNodeVertexColor")
    vertex_color.layer_name = "Color"
    principled.inputs["Roughness"].default_value = 0.96
    links.new(vertex_color.outputs["Color"], principled.inputs["Base Color"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material


def create_object(
    name: str,
    builder: MeshBuilder,
    materials: Sequence[bpy.types.Material],
    role: str,
    smooth: bool = False,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(builder.vertices, [], builder.faces)
    mesh.update(calc_edges=True)

    for material in materials:
        mesh.materials.append(material)

    for polygon, material_index in zip(mesh.polygons, builder.material_indices, strict=True):
        polygon.material_index = material_index
        polygon.use_smooth = smooth

    if builder.with_vertex_colors:
        attribute = mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")

        for loop in mesh.loops:
            attribute.data[loop.index].color = builder.vertex_colors[loop.vertex_index]

        mesh.color_attributes.active_color = attribute

    mesh.validate(verbose=True)
    object_3d = bpy.data.objects.new(name, mesh)
    object_3d["racesideRole"] = role
    object_3d["sourceTrack"] = "zandvoort"
    object_3d["schemaVersion"] = 1
    bpy.context.collection.objects.link(object_3d)
    return object_3d


def terrain_vertex_color(context: BuildContext, source_elevation_m: float, x: float, y: float):
    terrain = context.model["terrain"]
    elevation_ratio = (
        (source_elevation_m - terrain["elevationMinM"])
        / (terrain["elevationMaxM"] - terrain["elevationMinM"])
    )
    dune_scrub = color("#526044")
    marram_grass = color("#99976a")
    dune_sand = color("#b19f78")
    base = mix_color(dune_scrub, marram_grass, clamp(elevation_ratio, 0.0, 1.0))
    sand_amount = clamp(
        0.16
        + math.sin(x * 10.5 + y * 4.2) * 0.12
        + math.cos(y * 13.0 - x * 3.5) * 0.08,
        0.04,
        0.36,
    )
    variation = 0.94 + 0.045 * math.sin(x * 17.0 - y * 9.0)
    return scale_color(mix_color(base, dune_sand, sand_amount), variation)


def build_terrain(context: BuildContext, terrain_material: bpy.types.Material) -> bpy.types.Object:
    builder = MeshBuilder(material_count=1, with_vertex_colors=True)
    grid = context.terrain_grid

    for row in range(TERRAIN_ROWS - 1):
        for column in range(TERRAIN_COLUMNS - 1):
            corners = [
                grid[row][column],
                grid[row][column + 1],
                grid[row + 1][column + 1],
                grid[row + 1][column],
            ]
            coordinates = [
                (
                    point[0] * SCENE_HALF_SPAN,
                    point[1] * SCENE_HALF_SPAN,
                    (point[2] - context.reference_elevation_m) * context.vertical_scale,
                )
                for point in corners
            ]
            colors = [
                terrain_vertex_color(context, point[3], point[0], point[1]) for point in corners
            ]

            if (row + column) % 2 == 0:
                builder.add_face([coordinates[0], coordinates[1], coordinates[2]], 0, colors[:3])
                builder.add_face(
                    [coordinates[0], coordinates[2], coordinates[3]],
                    0,
                    [colors[0], colors[2], colors[3]],
                )
            else:
                builder.add_face([coordinates[0], coordinates[1], coordinates[3]], 0, [colors[0], colors[1], colors[3]])
                builder.add_face([coordinates[1], coordinates[2], coordinates[3]], 0, colors[1:])

    perimeter = (
        grid[0]
        + [row[-1] for row in grid[1:]]
        + list(reversed(grid[-1][:-1]))
        + [row[0] for row in reversed(grid[1:-1])]
    )
    base_z = -0.12
    dark = color("#14251b")

    for index, current in enumerate(perimeter):
        following = perimeter[(index + 1) % len(perimeter)]
        current_top = (
            current[0] * SCENE_HALF_SPAN,
            current[1] * SCENE_HALF_SPAN,
            (current[2] - context.reference_elevation_m) * context.vertical_scale,
        )
        following_top = (
            following[0] * SCENE_HALF_SPAN,
            following[1] * SCENE_HALF_SPAN,
            (following[2] - context.reference_elevation_m) * context.vertical_scale,
        )
        current_color = terrain_vertex_color(context, current[3], current[0], current[1])
        following_color = terrain_vertex_color(context, following[3], following[0], following[1])
        builder.add_face(
            [
                current_top,
                following_top,
                (following_top[0], following_top[1], base_z),
                (current_top[0], current_top[1], base_z),
            ],
            0,
            [current_color, following_color, dark, dark],
        )

    return create_object("Terrain", builder, [terrain_material], "terrain", smooth=True)


def offset_frame(frame: TrackFrame, offset_normalized: float, z_offset: float) -> tuple[float, float, float]:
    scene_offset = offset_normalized * SCENE_HALF_SPAN
    banking_z = math.tan(math.radians(frame.bank_angle_deg)) * scene_offset
    return (
        frame.x + frame.normal_x * scene_offset,
        frame.y + frame.normal_y * scene_offset,
        frame.z + banking_z + z_offset,
    )


def add_surface_ribbon(
    builder: MeshBuilder,
    frames: Sequence[TrackFrame],
    half_width: float,
    z_offset: float,
    material_index: int,
) -> None:
    for index, frame in enumerate(frames):
        following = frames[(index + 1) % len(frames)]
        builder.add_face(
            [
                offset_frame(frame, -half_width, z_offset),
                offset_frame(following, -half_width, z_offset),
                offset_frame(following, half_width, z_offset),
                offset_frame(frame, half_width, z_offset),
            ],
            material_index,
        )


def add_ring_segments(
    builder: MeshBuilder,
    frames: Sequence[TrackFrame],
    inner_width: float,
    outer_width: float,
    z_offset: float,
    material_index: int | Callable[[TrackFrame, int], int],
    predicate: Callable[[TrackFrame], bool],
    sides: Iterable[int] = (-1, 1),
    thickness: float = 0.0,
) -> None:
    for index, frame in enumerate(frames):
        if not predicate(frame):
            continue

        following = frames[(index + 1) % len(frames)]
        resolved_material = material_index(frame, index) if callable(material_index) else material_index

        for side in sides:
            inner = inner_width * side
            outer = outer_width * side
            inner_current = offset_frame(frame, inner, z_offset)
            outer_current = offset_frame(frame, outer, z_offset)
            outer_following = offset_frame(following, outer, z_offset)
            inner_following = offset_frame(following, inner, z_offset)
            top_face = [inner_current, outer_current, outer_following, inner_following]

            if side == 1:
                top_face.reverse()

            builder.add_face(top_face, resolved_material)

            if thickness > 0:
                builder.add_face(
                    [
                        outer_current,
                        (outer_current[0], outer_current[1], outer_current[2] - thickness),
                        (outer_following[0], outer_following[1], outer_following[2] - thickness),
                        outer_following,
                    ],
                    resolved_material,
                )
                builder.add_face(
                    [
                        inner_following,
                        (inner_following[0], inner_following[1], inner_following[2] - thickness),
                        (inner_current[0], inner_current[1], inner_current[2] - thickness),
                        inner_current,
                    ],
                    resolved_material,
                )


def nearest_turn(model: dict, progress: float, allowed_numbers: set[int], radius: float = 0.031):
    return next(
        (
            turn
            for turn in model["data"]["turns"]
            if turn["number"] in allowed_numbers
            and circular_progress_distance(progress, turn["progress"]) < radius
        ),
        None,
    )


def build_track_surfaces(
    context: BuildContext,
    materials: Sequence[bpy.types.Material],
) -> bpy.types.Object:
    foundation_index, edge_index, runoff_index, gravel_index, asphalt_index = range(5)
    builder = MeshBuilder(material_count=len(materials))
    frames = context.frames
    model = context.model
    runoff_turns = set(model["rendering"]["runoffTurnNumbers"])
    gravel_turns = set(model["rendering"]["gravelTurnNumbers"])

    add_ring_segments(
        builder,
        frames,
        0.019,
        0.034,
        0.018,
        runoff_index,
        lambda frame: nearest_turn(model, frame.progress, runoff_turns, 0.037) is not None,
    )
    add_ring_segments(
        builder,
        frames,
        0.034,
        0.054,
        0.009,
        gravel_index,
        lambda frame: nearest_turn(model, frame.progress, gravel_turns, 0.036) is not None,
    )
    add_surface_ribbon(builder, frames, 0.0195, 0.022, foundation_index)
    add_surface_ribbon(builder, frames, 0.0168, 0.035, edge_index)
    add_surface_ribbon(builder, frames, TRACK_HALF_WIDTH, 0.045, asphalt_index)

    track_object = create_object(
        "TrackSurfaces",
        builder,
        materials,
        "track-surfaces",
        smooth=True,
    )
    bevel = track_object.modifiers.new(name="Track micro bevel", type="BEVEL")
    bevel.width = 0.006
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    return track_object


def point_at_progress(frames: Sequence[TrackFrame], progress: float) -> TrackFrame:
    index = min(len(frames) - 1, round(clamp(progress, 0.0, 1.0) * len(frames)))
    return frames[index % len(frames)]


def add_cross_marker(
    builder: MeshBuilder,
    frame: TrackFrame,
    half_width: float,
    depth: float,
    z_offset: float,
    material_index: int,
) -> None:
    tangent = Vector((-frame.normal_y, frame.normal_x))
    depth_vector = tangent * (depth * SCENE_HALF_SPAN)
    left = Vector(offset_frame(frame, -half_width, z_offset))
    right = Vector(offset_frame(frame, half_width, z_offset))
    builder.add_face(
        [left - Vector((depth_vector.x, depth_vector.y, 0)),
         right - Vector((depth_vector.x, depth_vector.y, 0)),
         right + Vector((depth_vector.x, depth_vector.y, 0)),
         left + Vector((depth_vector.x, depth_vector.y, 0))],
        material_index,
    )


def add_sector_boundary_posts(
    builder: MeshBuilder,
    frame: TrackFrame,
    material_index: int,
) -> None:
    tangent = Vector((-frame.normal_y, frame.normal_x, 0.0))
    half_post_width = tangent * 0.036
    post_height = Vector((0.0, 0.0, 0.18))

    # Two matching boards sit beyond the track edge. They make the boundary
    # legible from any camera angle without drawing a stripe across the road.
    for side in (-1, 1):
        base = Vector(offset_frame(frame, side * 0.0265, 0.060))
        face = [
            base - half_post_width,
            base + half_post_width,
            base + half_post_width + post_height,
            base - half_post_width + post_height,
        ]
        builder.add_face(face, material_index)
        builder.add_face(list(reversed(face)), material_index)


def build_track_accents(
    context: BuildContext,
    materials: Sequence[bpy.types.Material],
) -> bpy.types.Object:
    curb_red, curb_white, sector_one, sector_two, sector_three, speed_trap = range(6)
    builder = MeshBuilder(material_count=len(materials))
    model = context.model
    frames = context.frames
    curb_turns = set(model["rendering"]["curbTurnNumbers"])

    add_ring_segments(
        builder,
        frames,
        TRACK_HALF_WIDTH,
        0.0185,
        0.057,
        lambda _frame, index: curb_red if (index // 4) % 2 == 0 else curb_white,
        lambda frame: nearest_turn(model, frame.progress, curb_turns, 0.029) is not None,
        thickness=0.008,
    )

    first_break, second_break = model["data"]["sectorBreaks"]

    def sector_material(frame: TrackFrame, _index: int) -> int:
        if frame.progress < first_break:
            return sector_one
        if frame.progress < second_break:
            return sector_two
        return sector_three

    add_ring_segments(
        builder,
        frames,
        0.0168,
        0.0183,
        0.052,
        sector_material,
        lambda _frame: True,
    )
    # Two detached emissive contours create a restrained glow outside the
    # circuit. Their gaps keep the effect off the road and preserve the curbs.
    add_ring_segments(
        builder,
        frames,
        0.0200,
        0.0221,
        0.050,
        sector_material,
        lambda _frame: True,
        thickness=0.003,
    )
    add_ring_segments(
        builder,
        frames,
        0.0232,
        0.0243,
        0.047,
        sector_material,
        lambda _frame: True,
        thickness=0.002,
    )

    add_cross_marker(
        builder,
        point_at_progress(frames, 0.0),
        TRACK_HALF_WIDTH,
        0.0017,
        0.066,
        curb_white,
    )
    add_cross_marker(
        builder,
        point_at_progress(frames, model["data"]["speedTrapProgress"]),
        TRACK_HALF_WIDTH,
        0.0017,
        0.067,
        speed_trap,
    )

    for material_index, progress in (
        (sector_one, 0.0),
        (sector_two, first_break),
        (sector_three, second_break),
    ):
        frame = point_at_progress(frames, progress)
        add_ring_segments(
            builder,
            frames,
            0.019,
            0.032,
            0.061,
            material_index,
            lambda candidate, boundary=progress: circular_progress_distance(
                candidate.progress, boundary
            )
            < 0.0045,
            thickness=0.006,
        )
        add_sector_boundary_posts(builder, frame, material_index)

    return create_object("TrackAccents", builder, materials, "track-accents", smooth=False)


def sample_context_terrain(context: BuildContext, x: float, y: float) -> float:
    elevation_m, _source = corrected_terrain_elevation(
        context.model["terrain"], context.residuals, x, y
    )
    return (elevation_m - context.reference_elevation_m) * context.vertical_scale


def add_low_poly_shrub(
    builder: MeshBuilder,
    center_x: float,
    center_y: float,
    base_z: float,
    radius: float,
    height: float,
    material_index: int,
    shrub_color: Sequence[float],
) -> None:
    sides = 5
    base = [
        (
            center_x + math.cos(index / sides * math.tau) * radius,
            center_y + math.sin(index / sides * math.tau) * radius,
            base_z,
        )
        for index in range(sides)
    ]
    top = (center_x, center_y, base_z + height)
    top_color = scale_color(shrub_color, 1.08)

    for index in range(sides):
        following = (index + 1) % sides
        builder.add_face(
            [base[index], base[following], top],
            material_index,
            [shrub_color, shrub_color, top_color],
        )


def scene_terrain_height(context: BuildContext, x: float, y: float) -> float:
    return sample_context_terrain(context, x / SCENE_HALF_SPAN, y / SCENE_HALF_SPAN)


def grandstand_center(context: BuildContext, spec: GrandstandSpec) -> Vector:
    frame = point_at_progress(context.frames, spec.progress)
    tangent = Vector((-frame.normal_y, frame.normal_x))
    normal = Vector((frame.normal_x, frame.normal_y)) * spec.side
    best_center = Vector((frame.x, frame.y)) + normal * spec.distance
    best_clearance = -1.0
    half_length = spec.length / 2.0 + (0.04 if spec.roof else 0.0)
    half_width = spec.width / 2.0 + (0.07 if spec.roof else 0.0)

    for step in range(28):
        candidate = Vector((frame.x, frame.y)) + normal * (spec.distance + step * 0.055)
        clearance = float("inf")

        # Measure every centre-line sample against the complete oriented
        # rectangle. Corner-only probes missed curved branches passing between
        # the sampled points of a long grandstand.
        for track_frame in context.frames:
            delta = Vector((track_frame.x, track_frame.y)) - candidate
            outside_along = max(abs(delta.dot(tangent)) - half_length, 0.0)
            outside_across = max(abs(delta.dot(normal)) - half_width, 0.0)
            clearance = min(clearance, math.hypot(outside_along, outside_across))

        if clearance > best_clearance:
            best_center = candidate
            best_clearance = clearance

        # Keep the whole footprint beyond the widest runoff and barrier band,
        # including where a nearby branch approaches the selected corner.
        if clearance >= 0.38:
            return candidate

    return best_center


def add_wedge_grandstand(
    context: BuildContext,
    builder: MeshBuilder,
    spec: GrandstandSpec,
    material_indices: tuple[int, int, int],
) -> None:
    foundation_index, edge_index, red_index = material_indices
    frame = point_at_progress(context.frames, spec.progress)
    tangent = Vector((-frame.normal_y, frame.normal_x))
    normal = Vector((frame.normal_x, frame.normal_y)) * spec.side
    center = grandstand_center(context, spec)
    half_length = spec.length / 2.0
    half_width = spec.width / 2.0

    def ground(along: float, across: float) -> tuple[float, float, float]:
        point = center + tangent * along + normal * across
        return (point.x, point.y, scene_terrain_height(context, point.x, point.y))

    ground_corners = (
        ground(-half_length, -half_width),
        ground(half_length, -half_width),
        ground(half_length, half_width),
        ground(-half_length, half_width),
    )
    base_z = max(point[2] for point in ground_corners) + 0.012

    def local(along: float, across: float, height: float) -> tuple[float, float, float]:
        point = center + tangent * along + normal * across
        return (point.x, point.y, base_z + height)

    tier_depth = spec.width / spec.tiers

    for tier in range(spec.tiers):
        front_across = -half_width + tier * tier_depth
        back_across = front_across + tier_depth * 0.84
        front_height = 0.036 + tier * 0.047
        back_height = front_height + 0.031
        tier_material = red_index if tier % 2 == 0 else edge_index
        tier_face = [
            local(-half_length, front_across, front_height),
            local(half_length, front_across, front_height),
            local(half_length, back_across, back_height),
            local(-half_length, back_across, back_height),
        ]

        if spec.side == 1:
            tier_face.reverse()

        builder.add_face(tier_face, tier_material)

    total_height = 0.036 + (spec.tiers - 1) * 0.047 + 0.031
    front_left = local(-half_length, -half_width, 0.032)
    front_right = local(half_length, -half_width, 0.032)
    back_right = local(half_length, half_width, total_height)
    back_left = local(-half_length, half_width, total_height)
    builder.add_face(
        [ground_corners[0], ground_corners[3], back_left, front_left],
        edge_index,
    )
    builder.add_face(
        [ground_corners[1], front_right, back_right, ground_corners[2]],
        edge_index,
    )
    builder.add_face(
        [ground_corners[3], ground_corners[2], back_right, back_left],
        edge_index,
    )

    if spec.roof:
        roof_front_left = local(-half_length - 0.04, -half_width - 0.07, total_height + 0.17)
        roof_front_right = local(half_length + 0.04, -half_width - 0.07, total_height + 0.17)
        roof_back_right = local(half_length + 0.04, half_width + 0.04, total_height + 0.21)
        roof_back_left = local(-half_length - 0.04, half_width + 0.04, total_height + 0.21)
        roof_face = [roof_front_left, roof_front_right, roof_back_right, roof_back_left]

        if spec.side == 1:
            roof_face.reverse()

        builder.add_face(roof_face, edge_index)
        builder.add_face(
            [front_left, roof_front_left, roof_back_left, back_left],
            foundation_index,
        )
        builder.add_face(
            [front_right, back_right, roof_back_right, roof_front_right],
            foundation_index,
        )


def smoothstep(value: float) -> float:
    safe_value = clamp(value, 0.0, 1.0)
    return safe_value * safe_value * (3.0 - 2.0 * safe_value)


def pit_lane_blend(progress: float) -> float:
    departure = smoothstep(progress / 0.18)
    arrival = smoothstep((1.0 - progress) / 0.22)
    return min(departure, arrival)


def pit_lane_width_scale(progress: float) -> float:
    # Preserve a narrow, non-degenerate mouth where the lane meets the track.
    return lerp(0.12, 1.0, pit_lane_blend(progress))


def build_pit_lane_frames(context: BuildContext) -> list[TrackFrame]:
    # FIA 2025 imagery shows the split after the exit of turn 14, on the main
    # straight, rather than before the banked corner.
    start = 0.925
    end = 0.150
    span = 1.0 - start + end
    source_frames = [frame for frame in context.frames if frame.progress >= start]
    source_frames.extend(frame for frame in context.frames if frame.progress <= end)
    pit_frames = []

    for frame in source_frames:
        travelled = frame.progress - start if frame.progress >= start else 1.0 - start + frame.progress
        ratio = travelled / span
        blend = pit_lane_blend(ratio)
        # The lane tapers into the outside asphalt edge instead of crossing the
        # racing surface toward its centre line. Smoothstep keeps the merge tangent.
        lateral_offset = lerp(-TRACK_HALF_WIDTH, PIT_LANE_FULL_OFFSET, blend)
        center = offset_frame(frame, lateral_offset, 0.0)
        terrain_z = scene_terrain_height(context, center[0], center[1])
        pit_frames.append(
            TrackFrame(
                progress=ratio,
                x=center[0],
                y=center[1],
                z=max(center[2], terrain_z) + 0.029,
                normal_x=frame.normal_x,
                normal_y=frame.normal_y,
                bank_angle_deg=0.0,
            )
        )

    return pit_frames


def validate_pit_lane_geometry(frames: Sequence[TrackFrame]) -> None:
    segments = [
        Vector((following.x - frame.x, following.y - frame.y))
        for frame, following in zip(frames, frames[1:])
    ]
    minimum_segment_length = min(segment.length for segment in segments)
    maximum_heading_change = 0.0

    for current, following in zip(segments, segments[1:]):
        cosine = clamp(current.normalized().dot(following.normalized()), -1.0, 1.0)
        maximum_heading_change = max(
            maximum_heading_change,
            math.degrees(math.acos(cosine)),
        )

    if minimum_segment_length < 0.015:
        raise ValueError(f"pit lane contains a collapsed segment: {minimum_segment_length:.4f}")

    if maximum_heading_change > 25.0:
        raise ValueError(f"pit lane contains a cusp: {maximum_heading_change:.2f} degrees")


def add_open_surface_ribbon(
    builder: MeshBuilder,
    frames: Sequence[TrackFrame],
    half_width: float,
    z_offset: float,
    material_index: int,
    width_scale: Callable[[float], float] | None = None,
) -> None:
    for index, frame in enumerate(frames[:-1]):
        following = frames[index + 1]
        current_width = half_width * (width_scale(frame.progress) if width_scale else 1.0)
        following_width = half_width * (
            width_scale(following.progress) if width_scale else 1.0
        )
        builder.add_face(
            [
                offset_frame(frame, -current_width, z_offset),
                offset_frame(following, -following_width, z_offset),
                offset_frame(following, following_width, z_offset),
                offset_frame(frame, current_width, z_offset),
            ],
            material_index,
        )


def add_wire_strip(
    builder: MeshBuilder,
    start: Vector,
    end: Vector,
    plane_normal: Vector,
    half_width: float,
    material_index: int,
) -> None:
    direction = end - start

    if direction.length_squared == 0:
        return

    perpendicular = direction.cross(plane_normal).normalized() * half_width
    builder.add_face(
        [start - perpendicular, end - perpendicular, end + perpendicular, start + perpendicular],
        material_index,
    )


def add_pit_mesh_fence(
    builder: MeshBuilder,
    frames: Sequence[TrackFrame],
    foundation_index: int,
    metal_index: int,
) -> None:
    # Keep both merge zones visibly open. The fence belongs only to the fully
    # parallel pit-wall section, never to the entry or exit taper.
    fence_frames = [frame for frame in frames if 0.32 <= frame.progress <= 0.64]

    def point(frame: TrackFrame, height: float) -> Vector:
        return Vector(offset_frame(frame, PIT_LANE_FENCE_OFFSET, 0.020 + height))

    for frame, following in zip(fence_frames, fence_frames[1:]):
        base = point(frame, 0.0)
        next_base = point(following, 0.0)
        builder.add_face(
            [
                base,
                next_base,
                next_base + Vector((0.0, 0.0, 0.040)),
                base + Vector((0.0, 0.0, 0.040)),
            ],
            foundation_index,
        )

        plane_normal = Vector((frame.normal_x, frame.normal_y, 0.0))
        add_wire_strip(
            builder,
            point(frame, 0.055),
            point(following, 0.055),
            plane_normal,
            0.0035,
            metal_index,
        )
        add_wire_strip(
            builder,
            point(frame, 0.175),
            point(following, 0.175),
            plane_normal,
            0.0035,
            metal_index,
        )

    for index in range(0, len(fence_frames), 6):
        frame = fence_frames[index]
        plane_normal = Vector((frame.normal_x, frame.normal_y, 0.0))
        add_wire_strip(
            builder,
            point(frame, 0.035),
            point(frame, 0.195),
            plane_normal,
            0.0045,
            metal_index,
        )

    for index in range(0, len(fence_frames) - 3, 3):
        frame = fence_frames[index]
        following = fence_frames[index + 3]
        plane_normal = Vector((frame.normal_x, frame.normal_y, 0.0))
        add_wire_strip(
            builder,
            point(frame, 0.055),
            point(following, 0.175),
            plane_normal,
            0.0022,
            metal_index,
        )
        add_wire_strip(
            builder,
            point(frame, 0.175),
            point(following, 0.055),
            plane_normal,
            0.0022,
            metal_index,
        )


def add_pit_garage_building(
    context: BuildContext,
    builder: MeshBuilder,
    frame: TrackFrame,
    foundation_index: int,
    edge_index: int,
    red_index: int,
    metal_index: int,
) -> None:
    distance = 0.27
    length = 2.10
    width = 0.19
    height = 0.30
    shift_toward_turn_one = -1.005
    tangent = Vector((-frame.normal_y, frame.normal_x))
    normal = Vector((-frame.normal_x, -frame.normal_y))
    center = (
        Vector((frame.x, frame.y))
        + normal * distance
        + tangent * shift_toward_turn_one
    )
    half_length = length / 2.0
    half_width = width / 2.0
    ground_corners = []

    for along, across in (
        (-half_length, -half_width),
        (half_length, -half_width),
        (half_length, half_width),
        (-half_length, half_width),
    ):
        point = center + tangent * along + normal * across
        ground_corners.append(
            (point.x, point.y, scene_terrain_height(context, point.x, point.y))
        )

    roof_z = max(point[2] for point in ground_corners) + height
    roof_corners = [(point[0], point[1], roof_z) for point in ground_corners]

    for index, ground_corner in enumerate(ground_corners):
        following = (index + 1) % len(ground_corners)
        builder.add_face(
            [ground_corner, ground_corners[following], roof_corners[following], roof_corners[index]],
            foundation_index,
        )

    builder.add_face(roof_corners, edge_index)

    base_z = max(point[2] for point in ground_corners) + 0.004

    def front(
        along: float,
        height_offset: float,
        across_offset: float = 0.0,
    ) -> tuple[float, float, float]:
        point = center + tangent * along + normal * (-half_width + across_offset)
        return (point.x, point.y, base_z + height_offset)

    # Concrete apron directly connects the physical garage bays to the working lane.
    builder.add_face(
        [
            front(-half_length, 0.006, -0.052),
            front(half_length, 0.006, -0.052),
            front(half_length, 0.006),
            front(-half_length, 0.006),
        ],
        edge_index,
    )

    door_span = length / PIT_GARAGE_DOOR_COUNT

    for door_index in range(PIT_GARAGE_DOOR_COUNT):
        left = -half_length + door_index * door_span + 0.006
        right = -half_length + (door_index + 1) * door_span - 0.006
        builder.add_face(
            [
                front(left, 0.022, -0.003),
                front(right, 0.022, -0.003),
                front(right, 0.205, -0.003),
                front(left, 0.205, -0.003),
            ],
            metal_index,
        )

    team_span = length / PIT_TEAM_BAY_COUNT

    for team_index in range(PIT_TEAM_BAY_COUNT):
        left = -half_length + team_index * team_span + 0.007
        right = -half_length + (team_index + 1) * team_span - 0.007
        builder.add_face(
            [
                front(left, 0.218, -0.005),
                front(right, 0.218, -0.005),
                front(right, 0.247, -0.005),
                front(left, 0.247, -0.005),
            ],
            red_index,
        )

    builder.add_face(
        [
            front(-half_length + 0.012, 0.260, -0.004),
            front(half_length - 0.012, 0.260, -0.004),
            front(half_length - 0.012, 0.318, -0.004),
            front(-half_length + 0.012, 0.318, -0.004),
        ],
        metal_index,
    )

    def rooftop(
        along: float,
        across: float,
        height_offset: float,
    ) -> tuple[float, float, float]:
        point = center + tangent * along + normal * across
        return (point.x, point.y, roof_z + height_offset)

    # An open grandstand occupies the garage roof and faces the pit lane. The
    # rows rise away from the track, matching the orientation of the boxes.
    rooftop_tiers = 5
    rooftop_front = -half_width + 0.012
    rooftop_depth = width - 0.024
    tier_depth = rooftop_depth / rooftop_tiers

    for tier in range(rooftop_tiers):
        front_across = rooftop_front + tier * tier_depth
        back_across = front_across + tier_depth * 0.86
        front_height = 0.018 + tier * 0.036
        back_height = front_height + 0.026
        tier_material = red_index if tier % 2 == 0 else metal_index
        builder.add_face(
            [
                rooftop(-half_length + 0.025, front_across, front_height),
                rooftop(half_length - 0.025, front_across, front_height),
                rooftop(half_length - 0.025, back_across, back_height),
                rooftop(-half_length + 0.025, back_across, back_height),
            ],
            tier_material,
        )

    rooftop_back_height = 0.018 + (rooftop_tiers - 1) * 0.036 + 0.026
    builder.add_face(
        [
            rooftop(-half_length + 0.025, half_width - 0.012, 0.012),
            rooftop(half_length - 0.025, half_width - 0.012, 0.012),
            rooftop(
                half_length - 0.025,
                half_width - 0.012,
                rooftop_back_height,
            ),
            rooftop(
                -half_length + 0.025,
                half_width - 0.012,
                rooftop_back_height,
            ),
        ],
        foundation_index,
    )


def build_environment(
    context: BuildContext,
    materials: Sequence[bpy.types.Material],
) -> bpy.types.Object:
    terrain_index, foundation_index, red_index, metal_index = range(4)
    builder = MeshBuilder(material_count=len(materials), with_vertex_colors=True)
    random_generator = random.Random(RANDOM_SEED)
    bounds = context.model["terrain"]["bounds"]
    dense_track = context.dense_track
    pit_frames = build_pit_lane_frames(context)
    validate_pit_lane_geometry(pit_frames)
    stand_exclusions = []

    for spec in GRANDSTAND_SPECS:
        center = grandstand_center(context, spec)
        stand_exclusions.append((center.x, center.y, max(spec.length, spec.width) * 0.56 + 0.10))

    shrubs_added = 0
    attempts = 0

    while shrubs_added < 190 and attempts < 2_400:
        attempts += 1
        normalized_x = random_generator.uniform(bounds["minX"] + 0.04, bounds["maxX"] - 0.04)
        normalized_y = random_generator.uniform(bounds["minY"] + 0.04, bounds["maxY"] - 0.04)
        nearest_track_distance = min(
            math.hypot(point.x - normalized_x, point.y - normalized_y) for point in dense_track
        )

        if nearest_track_distance < 0.075:
            continue

        scene_x = normalized_x * SCENE_HALF_SPAN
        scene_y = normalized_y * SCENE_HALF_SPAN

        if any(
            math.hypot(scene_x - center_x, scene_y - center_y) < radius
            for center_x, center_y, radius in stand_exclusions
        ):
            continue

        if min(
            math.hypot(scene_x - frame.x, scene_y - frame.y) for frame in pit_frames
        ) < 0.16:
            continue

        base_z = sample_context_terrain(context, normalized_x, normalized_y)
        radius = random_generator.uniform(0.018, 0.038)
        height = random_generator.uniform(0.028, 0.078)
        shrub_color = mix_color(
            color("#687047"),
            color("#ada16d"),
            random_generator.random(),
        )
        add_low_poly_shrub(
            builder,
            scene_x,
            scene_y,
            base_z,
            radius,
            height,
            terrain_index,
            shrub_color,
        )
        shrubs_added += 1

    add_open_surface_ribbon(
        builder, pit_frames, 0.013, 0.004, foundation_index, pit_lane_width_scale
    )
    add_open_surface_ribbon(
        builder, pit_frames, 0.0105, 0.010, metal_index, pit_lane_width_scale
    )
    add_open_surface_ribbon(
        builder, pit_frames, 0.0085, 0.016, foundation_index, pit_lane_width_scale
    )
    add_pit_mesh_fence(builder, pit_frames, foundation_index, metal_index)

    add_pit_garage_building(
        context,
        builder,
        point_at_progress(context.frames, 0.012),
        foundation_index,
        metal_index,
        red_index,
        metal_index,
    )

    for spec in GRANDSTAND_SPECS:
        add_wedge_grandstand(
            context,
            builder,
            spec,
            material_indices=(foundation_index, metal_index, red_index),
        )

    return create_object("TrackEnvironment", builder, materials, "environment", smooth=False)


def add_annotation_anchor(
    name: str,
    frame: TrackFrame,
    anchor_type: str,
    label: str,
) -> bpy.types.Object:
    anchor = bpy.data.objects.new(name, None)
    anchor.empty_display_type = "PLAIN_AXES"
    anchor.empty_display_size = 0.08
    anchor.location = (frame.x, frame.y, frame.z + 0.15)
    anchor["racesideAnchor"] = anchor_type
    anchor["label"] = label
    bpy.context.collection.objects.link(anchor)
    return anchor


def create_annotation_anchors(context: BuildContext) -> None:
    for turn in context.model["data"]["turns"]:
        add_annotation_anchor(
            f"Turn_{int(turn['number']):02d}",
            point_at_progress(context.frames, float(turn["progress"])),
            "turn",
            str(turn["number"]),
        )

    add_annotation_anchor(
        "SpeedTrap",
        point_at_progress(context.frames, float(context.model["data"]["speedTrapProgress"])),
        "speed-trap",
        "ST",
    )
    highest_index = max(
        range(len(context.dense_track)),
        key=lambda index: context.dense_track[index].elevation_m,
    )
    lowest_index = min(
        range(len(context.dense_track)),
        key=lambda index: context.dense_track[index].elevation_m,
    )
    add_annotation_anchor(
        "HighPoint",
        context.frames[highest_index],
        "high-point",
        f"+{context.model['data']['elevationChangeM']} m",
    )
    add_annotation_anchor(
        "LowPoint",
        context.frames[lowest_index],
        "low-point",
        "0 m",
    )


def look_at(object_3d: bpy.types.Object, target: Sequence[float]) -> None:
    direction = Vector(target) - object_3d.location
    object_3d.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def configure_scene(context: BuildContext) -> bpy.types.Camera:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 980
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.quality = 88
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = color("#07100c")
    background.inputs["Strength"].default_value = 0.52

    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass

    camera_data = bpy.data.cameras.new("BroadcastCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 14.7
    camera_data.lens = 52
    camera = bpy.data.objects.new("BroadcastCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (10.8, -13.6, 15.8)
    look_at(camera, (0.0, 0.0, 0.2))
    scene.camera = camera

    key_data = bpy.data.lights.new(name="KeyLight", type="AREA")
    key_data.energy = 1_100
    key_data.shape = "DISK"
    key_data.size = 8.0
    key = bpy.data.objects.new(name="KeyLight", object_data=key_data)
    bpy.context.collection.objects.link(key)
    key.location = (-7.5, -8.0, 13.0)
    look_at(key, (0.0, 0.0, 0.0))

    fill_data = bpy.data.lights.new(name="FillLight", type="AREA")
    fill_data.energy = 720
    fill_data.size = 10.0
    fill = bpy.data.objects.new(name="FillLight", object_data=fill_data)
    bpy.context.collection.objects.link(fill)
    fill.location = (8.0, 6.0, 10.0)
    look_at(fill, (0.0, 0.0, 0.0))

    sun_data = bpy.data.lights.new(name="RimSun", type="SUN")
    sun_data.energy = 1.25
    sun_data.angle = math.radians(18)
    sun = bpy.data.objects.new(name="RimSun", object_data=sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(145))

    return camera_data


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    for data_collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for data_block in list(data_collection):
            if data_block.users == 0:
                data_collection.remove(data_block)


def export_glb(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    export_objects = [
        object_3d
        for object_3d in bpy.context.scene.objects
        if object_3d.type == "MESH" or object_3d.get("racesideAnchor")
    ]
    bpy.ops.object.select_all(action="DESELECT")

    for object_3d in export_objects:
        object_3d.select_set(True)

    bpy.context.view_layer.objects.active = export_objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_yup=True,
        use_selection=True,
    )


def render_preview(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene = bpy.context.scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main() -> None:
    arguments = parse_arguments()
    payload = json.loads(Path(arguments.input).read_text(encoding="utf8"))

    if payload.get("schemaVersion") != 1:
        raise ValueError("unsupported track build schema")

    model = payload["model"]
    if model["id"] != "zandvoort":
        raise ValueError(f"unsupported golden track: {model['id']}")

    reset_scene()
    context = create_build_context(model)

    terrain_material = make_vertex_color_material("Terrain")
    foundation_material = make_flat_material("Track foundation", "#202421", 0.98)
    edge_material = make_flat_material("Track edge", "#dddcd7", 0.72, double_sided=True)
    runoff_material = make_flat_material("Runoff", "#315d79", 0.88)
    gravel_material = make_flat_material("Gravel", "#a49376", 1.0)
    asphalt_material = make_flat_material("Asphalt", "#2c2f30", 0.97)
    curb_red_material = make_flat_material("Curb red", "#cf2b24", 0.78, double_sided=True)
    metal_material = make_flat_material(
        "Fence metal",
        "#8f9896",
        0.55,
        0.72,
        double_sided=True,
    )
    sector_one_material = make_flat_material(
        "Sector one",
        "#e12d27",
        0.66,
        double_sided=True,
        emission_strength=0.72,
    )
    sector_two_material = make_flat_material(
        "Sector two",
        "#f2a63c",
        0.66,
        double_sided=True,
        emission_strength=0.72,
    )
    sector_three_material = make_flat_material(
        "Sector three",
        "#45c7e5",
        0.66,
        double_sided=True,
        emission_strength=0.72,
    )
    speed_trap_material = make_flat_material("Speed trap", "#a8d84b", 0.72)

    build_terrain(context, terrain_material)
    build_track_surfaces(
        context,
        [
            foundation_material,
            edge_material,
            runoff_material,
            gravel_material,
            asphalt_material,
        ],
    )
    build_track_accents(
        context,
        [
            curb_red_material,
            edge_material,
            sector_one_material,
            sector_two_material,
            sector_three_material,
            speed_trap_material,
        ],
    )
    build_environment(
        context,
        [
            terrain_material,
            foundation_material,
            curb_red_material,
            metal_material,
        ],
    )
    create_annotation_anchors(context)
    configure_scene(context)
    export_glb(arguments.glb)
    render_preview(arguments.preview)
    print(
        json.dumps(
            {
                "datumOffsetM": round(context.datum_offset_m, 4),
                "glb": arguments.glb,
                "horizontalHalfSpanM": round(context.horizontal_half_span_m, 3),
                "preview": arguments.preview,
                "track": model["id"],
                "verticalScale": round(context.vertical_scale, 6),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
