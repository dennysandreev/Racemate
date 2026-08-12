#!/usr/bin/env python3
"""Build the Silverstone 2026 real-scale Blender digital twin and web GLB."""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import bpy


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
HUNGARORING_PATH = SCRIPT_DIRECTORY / "build-hungaroring-digital-twin.py"
SPEC = importlib.util.spec_from_file_location("track_hungaroring_digital_twin", HUNGARORING_PATH)
hung = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(hung)
spa = hung.spa
base = hung.base

SECTOR_COLORS = ((0.86, 0.02, 0.01, 1), (0.98, 0.48, 0.03, 1), (0.02, 0.60, 0.78, 1))
PIT_ENTRY_APRON_END_METERS = 150.0
PIT_ENTRY_APRON_SURFACE_LIFT_METERS = 0.055
PIT_FENCE_START_RATIO = 0.13
PIT_FENCE_END_RATIO = 0.87


def utm30n_from_wgs84(lat, lon):
    semi_major = 6_378_137.0
    flattening = 1 / 298.257223563
    scale = 0.9996
    eccentricity_squared = flattening * (2 - flattening)
    secondary_eccentricity_squared = eccentricity_squared / (1 - eccentricity_squared)
    latitude = math.radians(lat)
    longitude_delta = math.radians(lon + 3)
    sine = math.sin(latitude)
    cosine = math.cos(latitude)
    tangent = math.tan(latitude)
    radius = semi_major / math.sqrt(1 - eccentricity_squared * sine**2)
    t = tangent**2
    c = secondary_eccentricity_squared * cosine**2
    a = cosine * longitude_delta
    meridional_arc = semi_major * (
        (1 - eccentricity_squared / 4 - 3 * eccentricity_squared**2 / 64 - 5 * eccentricity_squared**3 / 256) * latitude
        - (3 * eccentricity_squared / 8 + 3 * eccentricity_squared**2 / 32 + 45 * eccentricity_squared**3 / 1024) * math.sin(2 * latitude)
        + (15 * eccentricity_squared**2 / 256 + 45 * eccentricity_squared**3 / 1024) * math.sin(4 * latitude)
        - 35 * eccentricity_squared**3 / 3072 * math.sin(6 * latitude)
    )
    return (
        500_000 + scale * radius * (a + (1 - t + c) * a**3 / 6 + (5 - 18 * t + t**2 + 72 * c - 58 * secondary_eccentricity_squared) * a**5 / 120),
        scale * (meridional_arc + radius * tangent * (a**2 / 2 + (5 - t + 9 * c + 4 * c**2) * a**4 / 24 + (61 - 58 * t + t**2 + 600 * c - 330 * secondary_eccentricity_squared) * a**6 / 720)),
    )


def nearest_polyline_projection(point, points, cumulative):
    nearest = None
    for index, (first, second) in enumerate(zip(points, points[1:])):
        dx = second[0] - first[0]
        dy = second[1] - first[1]
        length_squared = dx * dx + dy * dy
        if length_squared <= 1e-12:
            continue
        blend = min(max(
            ((point[0] - first[0]) * dx + (point[1] - first[1]) * dy) / length_squared,
            0.0,
        ), 1.0)
        projected = (first[0] + dx * blend, first[1] + dy * blend)
        separation = math.hypot(point[0] - projected[0], point[1] - projected[1])
        if nearest is None or separation < nearest[0]:
            nearest = (
                separation,
                cumulative[index] + math.sqrt(length_squared) * blend,
                projected,
            )
    if nearest is None:
        raise ValueError("Cannot project onto an empty centreline")
    return nearest


def road_edge_toward(
    source_point,
    source_points,
    source_cumulative,
    source_distance,
    target_point,
    width,
    raster,
    center,
    base_elevation,
    *,
    inset=0.0,
    closed,
    z_offset,
):
    tangent = base.sample_tangent(source_points, source_cumulative, source_distance, closed=closed)
    normal = base.Vector((-tangent.y, tangent.x))
    direction = base.Vector((target_point[0] - source_point[0], target_point[1] - source_point[1]))
    side = 1 if direction.dot(normal) >= 0 else -1
    lateral = side * (width / 2 - inset)
    local_point = base.road_surface_point(
        source_points,
        source_cumulative,
        source_distance,
        lateral,
        raster,
        center,
        base_elevation,
        width,
        z_offset=z_offset,
        closed=closed,
    )
    global_point = (
        source_point[0] + normal.x * lateral,
        source_point[1] + normal.y * lateral,
    )
    return local_point, global_point, side


def create_pit_entry_asphalt_apron(
    pit_points,
    main_centerline,
    pit_raster,
    main_raster,
    center,
    base_elevation,
    material,
    collection,
    main_width,
    pit_entry_minimum_width,
):
    pit_cumulative, pit_total = base.line_distance(pit_points)
    main_cumulative, _ = base.line_distance(main_centerline)
    start = 0.0
    end = min(PIT_ENTRY_APRON_END_METERS, pit_total)
    interval = 2.5
    sample_count = max(1, math.ceil((end - start) / interval))
    rows = []
    maximum_gap = 0.0
    minimum_envelope_width = math.inf
    breakthrough_samples = 0
    coplanar_surface_samples = 0

    reference_distance = min(120.0, end)
    reference_pit_point = base.sample_polyline(
        pit_points,
        pit_cumulative,
        reference_distance,
        closed=False,
    )
    _, reference_main_distance, reference_main_point = nearest_polyline_projection(
        reference_pit_point,
        main_centerline,
        main_cumulative,
    )
    reference_pit_tangent = base.sample_tangent(
        pit_points,
        pit_cumulative,
        reference_distance,
        closed=False,
    )
    reference_pit_normal = base.Vector((-reference_pit_tangent.y, reference_pit_tangent.x))
    pit_side_toward_main = 1 if base.Vector((
        reference_main_point[0] - reference_pit_point[0],
        reference_main_point[1] - reference_pit_point[1],
    )).dot(reference_pit_normal) >= 0 else -1
    reference_main_tangent = base.sample_tangent(
        main_centerline,
        main_cumulative,
        reference_main_distance,
        closed=True,
    )
    reference_main_normal = base.Vector((-reference_main_tangent.y, reference_main_tangent.x))
    main_side_toward_pit = 1 if base.Vector((
        reference_pit_point[0] - reference_main_point[0],
        reference_pit_point[1] - reference_main_point[1],
    )).dot(reference_main_normal) >= 0 else -1

    for index in range(sample_count + 1):
        distance = start + (end - start) * index / sample_count
        pit_point = base.sample_polyline(pit_points, pit_cumulative, distance, closed=False)
        centre_gap, main_distance, main_point = nearest_polyline_projection(
            pit_point,
            main_centerline,
            main_cumulative,
        )
        maximum_gap = max(
            maximum_gap,
            max(centre_gap - (main_width + base.PIT_LANE_WIDTH_METERS) / 2, 0.0),
        )
        main_tangent = base.sample_tangent(
            main_centerline,
            main_cumulative,
            main_distance,
            closed=True,
        )
        main_normal = base.Vector((-main_tangent.y, main_tangent.x))
        main_outer_lateral = -main_side_toward_pit * main_width / 2
        main_inner_lateral = main_side_toward_pit * main_width / 2
        main_outer = base.road_surface_point(
            main_centerline,
            main_cumulative,
            main_distance,
            main_outer_lateral,
            main_raster,
            center,
            base_elevation,
            main_width,
            z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.025,
            closed=True,
        )
        main_inner = base.road_surface_point(
            main_centerline,
            main_cumulative,
            main_distance,
            main_inner_lateral,
            main_raster,
            center,
            base_elevation,
            main_width,
            z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.025,
            closed=True,
        )
        main_outer_global = (
            main_point[0] + main_normal.x * main_outer_lateral,
            main_point[1] + main_normal.y * main_outer_lateral,
        )
        main_inner_global = (
            main_point[0] + main_normal.x * main_inner_lateral,
            main_point[1] + main_normal.y * main_inner_lateral,
        )

        taper_progress = min(max(distance / base.PIT_LANE_TAPER_METERS, 0.0), 1.0)
        taper_progress = taper_progress * taper_progress * (3 - 2 * taper_progress)
        pit_width = pit_entry_minimum_width + (
            base.PIT_LANE_WIDTH_METERS - pit_entry_minimum_width
        ) * taper_progress
        pit_tangent = base.sample_tangent(
            pit_points,
            pit_cumulative,
            distance,
            closed=False,
        )
        pit_normal = base.Vector((-pit_tangent.y, pit_tangent.x))
        pit_outer_lateral = -pit_side_toward_main * pit_width / 2
        pit_outer = base.road_surface_point(
            pit_points,
            pit_cumulative,
            distance,
            pit_outer_lateral,
            pit_raster,
            center,
            base_elevation,
            pit_width,
            z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.035,
            closed=False,
        )
        pit_outer_global = (
            pit_point[0] + pit_normal.x * pit_outer_lateral,
            pit_point[1] + pit_normal.y * pit_outer_lateral,
        )
        if math.hypot(
            pit_outer_global[0] - main_outer_global[0],
            pit_outer_global[1] - main_outer_global[1],
        ) >= math.hypot(
            main_inner_global[0] - main_outer_global[0],
            main_inner_global[1] - main_outer_global[1],
        ):
            envelope_edge = pit_outer
            envelope_edge_global = pit_outer_global
        else:
            envelope_edge = main_inner
            envelope_edge_global = main_inner_global
        envelope_width = math.hypot(
            envelope_edge_global[0] - main_outer_global[0],
            envelope_edge_global[1] - main_outer_global[1],
        )
        minimum_envelope_width = min(minimum_envelope_width, envelope_width)
        terrain_clearance_height = max(
            pit_raster.sample_rendered_terrain(
                main_outer_global[0] * (1 - blend) + envelope_edge_global[0] * blend,
                main_outer_global[1] * (1 - blend) + envelope_edge_global[1] * blend,
            ) - base_elevation + base.TRACK_SURFACE_Z_OFFSET + 0.035
            for blend in (0.0, 0.25, 0.5, 0.75, 1.0)
        )
        surface_height = max(
            main_outer[2],
            envelope_edge[2],
            terrain_clearance_height,
        ) + PIT_ENTRY_APRON_SURFACE_LIFT_METERS
        if surface_height - max(main_outer[2], envelope_edge[2]) < 0.05:
            coplanar_surface_samples += 1
        row = (
            (main_outer[0], main_outer[1], surface_height),
            (envelope_edge[0], envelope_edge[1], surface_height),
        )
        rows.append(row)
        for blend in (0.0, 0.25, 0.5, 0.75, 1.0):
            x = main_outer_global[0] * (1 - blend) + envelope_edge_global[0] * blend
            y = main_outer_global[1] * (1 - blend) + envelope_edge_global[1] * blend
            if surface_height <= pit_raster.sample_rendered_terrain(x, y) - base_elevation + 0.03:
                breakthrough_samples += 1

    builder = base.MeshBuilder()
    for first, second in zip(rows, rows[1:]):
        builder.add_quad((first[0], second[0], second[1], first[1]))
    obj = builder.create_object("Silverstone_Pit_Entry_Asphalt_Apron", [material], collection)
    obj["source"] = "Measured Silverstone pit-entry geometry; continuous asphalt envelope over the complete merge zone"
    return obj, {
        "coplanarSurfaceSamples": coplanar_surface_samples,
        "coverageMode": "full-road-envelope",
        "endMeters": round(end, 3),
        "grassBreakthroughSamples": breakthrough_samples,
        "maximumGapCoveredMeters": round(maximum_gap, 3),
        "minimumEnvelopeWidthMeters": round(minimum_envelope_width, 3),
        "startMeters": round(start, 3),
        "surface": "asphalt",
        "surfaceLiftMeters": PIT_ENTRY_APRON_SURFACE_LIFT_METERS,
    }


def merge_asphalt_meshes(target, source):
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    source.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    for polygon in target.data.polygons:
        polygon.material_index = 0
    while len(target.data.materials) > 1:
        target.data.materials.pop(index=len(target.data.materials) - 1)
    target.name = "FIA_Pit_Lane"
    target.data.name = "FIA_Pit_Lane_Mesh"


def add_low_fence_panel(builder, first, second, wall_height, fence_height):
    dx = second[0] - first[0]
    dy = second[1] - first[1]
    length = math.hypot(dx, dy)
    if length <= 1e-6:
        return False
    normal_x = -dy / length
    normal_y = dx / length
    half_thickness = 0.11
    bottom = (
        (first[0] - normal_x * half_thickness, first[1] - normal_y * half_thickness, first[2]),
        (second[0] - normal_x * half_thickness, second[1] - normal_y * half_thickness, second[2]),
        (second[0] + normal_x * half_thickness, second[1] + normal_y * half_thickness, second[2]),
        (first[0] + normal_x * half_thickness, first[1] + normal_y * half_thickness, first[2]),
    )
    top = tuple((x, y, z + wall_height) for x, y, z in bottom)
    builder.add_volume(bottom, top, material_index=0)
    builder.add_quad((
        (first[0], first[1], first[2] + wall_height),
        (second[0], second[1], second[2] + wall_height),
        (second[0], second[1], second[2] + wall_height + fence_height),
        (first[0], first[1], first[2] + wall_height + fence_height),
    ), material_index=1)
    rotation = math.atan2(dy, dx)
    builder.add_box(
        (
            (first[0] + second[0]) / 2,
            (first[1] + second[1]) / 2,
            (first[2] + second[2]) / 2 + wall_height + fence_height - 0.035,
        ),
        (length + 0.06, 0.07, 0.07),
        material_index=1,
        rotation=rotation,
    )
    builder.add_cylinder(
        (first[0], first[1], first[2] + wall_height),
        0.045,
        fence_height,
        sides=6,
        material_index=1,
    )
    return True


def create_dual_pit_straight_fences(
    pit_points,
    main_centerline,
    pit_raster,
    main_raster,
    center,
    base_elevation,
    materials,
    collection,
):
    pit_cumulative, pit_total = base.line_distance(pit_points)
    main_cumulative, _ = base.line_distance(main_centerline)
    start = pit_total * PIT_FENCE_START_RATIO
    end = pit_total * PIT_FENCE_END_RATIO
    interval = 3.0
    sample_count = max(1, math.ceil((end - start) / interval))
    pit_side_points = []
    main_side_points = []

    for index in range(sample_count + 1):
        distance = start + (end - start) * index / sample_count
        pit_point = base.sample_polyline(pit_points, pit_cumulative, distance, closed=False)
        _, main_distance, main_point = nearest_polyline_projection(
            pit_point,
            main_centerline,
            main_cumulative,
        )
        main_edge, main_edge_global, _ = road_edge_toward(
            main_point,
            main_centerline,
            main_cumulative,
            main_distance,
            pit_point,
            15.0,
            main_raster,
            center,
            base_elevation,
            inset=-0.18,
            closed=True,
            z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.025,
        )
        pit_edge, pit_edge_global, _ = road_edge_toward(
            pit_point,
            pit_points,
            pit_cumulative,
            distance,
            main_point,
            base.PIT_LANE_WIDTH_METERS,
            pit_raster,
            center,
            base_elevation,
            inset=-0.18,
            closed=False,
            z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.035,
        )
        main_side_points.append((
            main_edge[0],
            main_edge[1],
            max(main_edge[2], pit_raster.sample_rendered_terrain(*main_edge_global) - base_elevation + 0.12),
        ))
        pit_side_points.append((
            pit_edge[0],
            pit_edge[1],
            max(pit_edge[2], pit_raster.sample_rendered_terrain(*pit_edge_global) - base_elevation + 0.12),
        ))

    wall_height = 0.30
    fence_height = 0.66
    builder = base.MeshBuilder()
    panel_count = 0
    for line in (main_side_points, pit_side_points):
        for first, second in zip(line, line[1:]):
            if add_low_fence_panel(builder, first, second, wall_height, fence_height):
                panel_count += 1
        final = line[-1]
        builder.add_cylinder(
            (final[0], final[1], final[2] + wall_height),
            0.045,
            fence_height,
            sides=6,
            material_index=1,
        )
    obj = builder.create_object("FIA_Pit_Straight_Dual_Fences", materials, collection)
    obj["source"] = "Measured Silverstone pit straight; low safety fences along the main-straight and pit-lane edges"
    obj["length_m"] = end - start
    obj["panels"] = panel_count
    return obj, {
        "fenceHeightMeters": fence_height,
        "fenceLines": 2,
        "lengthMeters": round(end - start, 3),
        "panels": panel_count,
        "placement": "both sides of the pit-straight separation",
        "wallHeightMeters": wall_height,
    }


def main():
    args = base.parse_args()
    input_path = Path(args.input).resolve()
    prepared_directory = Path(args.prepared).resolve()
    glb_path = Path(args.glb).resolve()
    preview_path = Path(args.preview).resolve()
    metadata_path = Path(args.metadata).resolve()
    config = hung.load_json(input_path)
    source_directory = Path(config["sourceDirectory"])
    bounds = config["model"]["bounds"]
    center = config["model"]["center"]
    raster_metadata = hung.load_json(prepared_directory / "raster-metadata.json")

    base.rd_from_wgs84 = utm30n_from_wgs84
    spa.lambert_2008_from_wgs84 = utm30n_from_wgs84
    hung.utm34n_from_wgs84 = utm30n_from_wgs84
    base.TERRAIN_COLUMNS = raster_metadata["rasters"]["dtm"]["width"]
    base.TERRAIN_ROWS = raster_metadata["rasters"]["dtm"]["height"]
    base.TURN_CURB_HALF_SPAN = (46, 36, 44, 38, 38, 54, 58, 40, 62, 34, 34, 38, 38, 48, 64, 40, 42, 48)
    base.TRACK_SURFACE_Z_OFFSET = 0.30
    base.PIT_LANE_WIDTH_METERS = config["model"]["pitLaneWidthMeters"]
    base.PIT_LANE_TAPER_METERS = 42.0
    hung.GRAVEL_TURNS = {1, 3, 4, 6, 7, 9, 15, 16, 17}
    hung.RUNOFF_SIDES = {1: -1, 2: 1, 3: -1, 4: -1, 5: 1, 6: 1, 7: -1, 8: 1, 9: -1, 10: 1, 11: -1, 12: 1, 13: -1, 14: 1, 15: -1, 16: 1, 17: -1, 18: 1}
    hung.PIT_ENTRY_RUNOFF_TURNS = {16, 17, 18}
    hung.CURB_WIDTH_METERS = 1.35
    spa.REPLACED_OSM_BUILDING_IDS = set()
    spa.REPLACED_OSM_GRANDSTAND_IDS = {227_342_452, 227_342_459}

    dtm = base.HeightRaster(prepared_directory / "silverstone-dtm.f32le", raster_metadata["rasters"]["dtm"], bounds)
    dsm = base.HeightRaster(prepared_directory / "silverstone-dsm.f32le", raster_metadata["rasters"]["dsm"], bounds)
    base_elevation = float(raster_metadata["rasters"]["dtm"]["minimum"])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    collections = base.create_collections()
    hung.configure_scene(bounds, center, base_elevation)

    materials = {
        "terrain": base.create_aerial_material(prepared_directory / "silverstone-hybrid-ground-2026.jpg"),
        "asphalt": base.create_material("Silverstone_Real_Asphalt", (0.066, 0.071, 0.075, 1), 0.96),
        "white": base.create_material("Silverstone_Track_White", (0.95, 0.94, 0.90, 1), 0.82),
        "curb_red": base.create_material("Silverstone_Curb_Red", (0.72, 0.018, 0.013, 1), 0.84),
        "building": base.create_material("Silverstone_Current_OSM_Buildings", (1, 1, 1, 1), 0.84, use_vertex_color=True),
        "motorhome": base.create_material("Silverstone_2026_Race_Motorhomes", (1, 1, 1, 1), 0.64, metallic=0.10, use_vertex_color=True),
        "pit_wall": base.create_material("Silverstone_Pit_Wall_Concrete", (0.61, 0.62, 0.61, 1), 0.92),
        "fence": base.create_material("Silverstone_Safety_Fence", (0.40, 0.43, 0.44, 0.64), 0.72, metallic=0.34),
        "tree_trunk": base.create_material("Silverstone_Tree_Trunks", (0.18, 0.105, 0.055, 1), 1.0),
        "tree_crown": base.create_material("Silverstone_Tree_Canopies", (0.11, 0.25, 0.09, 1), 1.0),
        "stand_frame": base.create_material("Silverstone_Grandstand_Frame", (0.18, 0.20, 0.21, 1), 0.58, metallic=0.55),
        "seat_dark": base.create_material("Silverstone_Grandstand_Seats_Dark", (0.045, 0.05, 0.055, 1), 0.88),
        "seat_red": base.create_material("Silverstone_Grandstand_Seats_Red", (0.67, 0.02, 0.018, 1), 0.88),
        "structure": base.create_material("Silverstone_Circuit_Structures", (0.36, 0.38, 0.38, 1), 0.78, metallic=0.12),
        "gantry_light": base.create_material("Silverstone_Gantry_Lights", (0.88, 0.05, 0.02, 1), 0.34),
        "gravel": base.create_material("Silverstone_Real_Gravel_Runoff", (0.54, 0.43, 0.29, 1), 1.0),
        "runoff": base.create_material("Silverstone_Asphalt_Runoff", (0.16, 0.17, 0.18, 1), 0.98),
        "black": base.create_material("Silverstone_Control_Line_Black", (0.015, 0.015, 0.015, 1), 0.86),
    }
    materials["terrain"].name = "Terrain_Silverstone_EA_LIDAR_Hybrid_Ground"
    sector_materials = [base.create_material(f"Sector_{index + 1}", color, 0.68) for index, color in enumerate(SECTOR_COLORS)]
    sector_glow_materials = [
        base.create_material(f"Sector_{index + 1}_Glow", (color[0], color[1], color[2], 0.34), 0.48, emission_strength=1.4)
        for index, color in enumerate(SECTOR_COLORS)
    ]

    terrain = base.add_terrain(bounds, center, dtm, base_elevation, materials["terrain"], collections["Terrain"])
    terrain.name = "Silverstone_EA_LIDAR_DTM_RealScale"
    terrain.data.name = "Silverstone_EA_LIDAR_DTM_RealScale_Mesh"
    terrain["source"] = "Environment Agency LIDAR Composite DTM 1 m, ODN; no vertical exaggeration"
    osm_data = hung.load_json(source_directory / "openstreetmap-raceway.json")
    source_centerline = base.assemble_main_circuit(osm_data, config["model"]["mainCircuitWayIds"])
    centerline = spa.rotate_closed_polyline(source_centerline, config["model"]["sourceStartFinishOffsetMeters"])
    cumulative, total_length = base.line_distance(centerline)
    surface_raster = hung.WholeLapSurfaceRaster(dtm, centerline, cumulative, config["model"]["trackWidthMeters"])
    track, cumulative, total_length, track_samples = base.create_ribbon(
        "FIA_Silverstone_Centreline_15m", centerline, surface_raster, center, base_elevation,
        config["model"]["trackWidthMeters"], materials["asphalt"], collections["Circuit"],
        z_offset=base.TRACK_SURFACE_Z_OFFSET, banked=False,
    )
    track["source"] = "Current connected OSM raceway ring checked against FIA 2026 5.891 km centreline"
    hung.create_edge_lines(centerline, cumulative, total_length, surface_raster, center, base_elevation, materials["white"], collections["Circuit"], config["model"]["trackWidthMeters"])
    _, curb_quality = hung.create_curbs(config, centerline, cumulative, surface_raster, center, base_elevation, [materials["curb_red"], materials["white"]], collections["Circuit"])
    runoff_obj, runoff_sections, runoff_quality = hung.create_runoff(config, centerline, cumulative, surface_raster, center, base_elevation, [materials["gravel"], materials["runoff"]], collections["Circuit"])
    runoff_obj.name = "Silverstone_FIA_Runoff_And_Gravel"
    runoff_obj.data.name = "Silverstone_FIA_Runoff_And_Gravel_Mesh"
    runoff_obj["source"] = "FIA 2026 circuit map cross-checked against real satellite overview"
    pit_lane_obj, pit_centerline, pit_quality = base.create_pit_lane(
        osm_data, config["model"]["pitLaneWayId"], centerline, dtm, center, base_elevation,
        materials, collections["Circuit"], pit_boxes=config["model"]["pitBoxes"], entry_minimum_width=4.2,
    )
    pit_entry_apron_obj, pit_entry_apron_quality = create_pit_entry_asphalt_apron(
        pit_centerline, centerline, dtm, surface_raster, center, base_elevation,
        materials["asphalt"], collections["Circuit"], config["model"]["trackWidthMeters"], 4.2,
    )
    merge_asphalt_meshes(pit_lane_obj, pit_entry_apron_obj)
    _, pit_wall_quality = create_dual_pit_straight_fences(
        pit_centerline, centerline, dtm, surface_raster, center, base_elevation,
        [materials["pit_wall"], materials["fence"]], collections["Infrastructure"],
    )
    pit_quality["entryApron"] = pit_entry_apron_quality
    pit_quality["pitWall"] = pit_wall_quality
    pit_complex_obj, pit_complex_quality = spa.create_pit_complex(
        config, pit_centerline, dtm, center, base_elevation,
        [materials["structure"], materials["seat_dark"], materials["seat_red"]], collections["Grandstands"],
    )
    pit_complex_obj.name = "Silverstone_Wing_2026_41_Position_Pit_Complex"
    pit_complex_obj.data.name = "Silverstone_Wing_2026_41_Position_Pit_Complex_Mesh"
    pit_complex_obj["source"] = "FIA 2026 pit-lane drawing and current Silverstone Wing alignment"
    pit_quality["pitComplex"] = pit_complex_quality

    exclusion_corridors = [
        (base.sample_line_points(centerline, cumulative, 4.0), config["model"]["trackWidthMeters"] / 2 + 1.5),
        (base.sample_line_points(pit_centerline, base.line_distance(pit_centerline)[0], 4.0, closed=False), base.PIT_LANE_WIDTH_METERS / 2 + 1.5),
    ]
    surface_quality = base.measure_ribbon_terrain_clearance(track_samples, dtm, base_elevation)
    osm_buildings = hung.load_json(source_directory / "openstreetmap-buildings.json")
    reserved_stands = base.grandstand_reservation_polygons(config, centerline, cumulative)
    building_obj, _, building_quality = spa.create_osm_buildings(
        osm_buildings, dtm, dsm, bounds, center, base_elevation, materials["building"],
        collections["Buildings"], exclusion_corridors, reserved_stands,
    )
    building_obj.name = "Silverstone_Current_OSM_Buildings"
    building_obj.data.name = "Silverstone_Current_OSM_Buildings_Mesh"
    building_obj["source"] = "Current OSM footprints; tagged heights or conservative real-metre defaults"
    mapped_stands_obj, mapped_stands, mapped_stands_quality = spa.create_mapped_grandstands(
        osm_buildings, dtm, dsm, bounds, center, base_elevation, materials["building"], collections["Grandstands"]
    )
    mapped_stands_obj.name = "Silverstone_Current_OSM_Mapped_Grandstands"
    mapped_stands_obj.data.name = "Silverstone_Current_OSM_Mapped_Grandstands_Mesh"
    mapped_stands_obj["source"] = "Current OSM grandstand footprints cross-checked against Silverstone 2026 inventory"
    osm_barriers = hung.load_json(source_directory / "openstreetmap-barriers.json")
    for feature in osm_barriers["elements"]:
        cleaned = []
        for point in feature.get("geometry", []):
            if not cleaned or math.hypot(
                point["lat"] - cleaned[-1]["lat"],
                point["lon"] - cleaned[-1]["lon"],
            ) > 1e-6:
                cleaned.append(point)
        feature["geometry"] = cleaned
    barrier_obj, fence_segments = spa.create_osm_barriers(osm_barriers, dtm, bounds, center, base_elevation, materials["fence"], collections["Infrastructure"])
    barrier_obj.name = "Silverstone_OSM_Safety_Fences_And_Walls"
    barrier_obj.data.name = "Silverstone_OSM_Safety_Fences_And_Walls_Mesh"
    barrier_obj.data.validate(clean_customdata=True)
    barrier_obj.data.update()
    tree_data = hung.load_json(source_directory / "openstreetmap-trees.json")
    tree_obj, tree_count = hung.create_osm_trees(tree_data, dtm, center, base_elevation, [materials["tree_trunk"], materials["tree_crown"]], collections["Infrastructure"], centerline, pit_centerline)
    tree_obj.name = "Silverstone_OSM_Mapped_Trees"
    tree_obj.data.name = "Silverstone_OSM_Mapped_Trees_Mesh"
    motorhome_obj, motorhome_count, motorhome_quality = hung.create_paddock_motorhomes(
        config, pit_centerline, dtm, center, base_elevation, materials["motorhome"], collections["Infrastructure"], exclusion_corridors,
    )
    motorhome_obj.name = "Silverstone_2026_Race_Motorhomes"
    motorhome_obj.data.name = "Silverstone_2026_Race_Motorhomes_Mesh"
    manual_stands_obj, manual_stands, manual_stands_quality = base.create_grandstands(
        config, centerline, cumulative, total_length, dtm, center, base_elevation,
        [materials["stand_frame"], materials["seat_dark"], materials["seat_red"]], collections["Grandstands"],
    )
    manual_stands_obj.name = "Silverstone_2026_Official_Additional_Grandstands"
    manual_stands_obj.data.name = "Silverstone_2026_Official_Additional_Grandstands_Mesh"
    manual_stands_obj["source"] = "Official Silverstone 2026 named grandstand inventory"

    finish_distance, sector_distances, _, _ = base.create_track_annotations(
        config, osm_data, centerline, cumulative, total_length, dtm, center, base_elevation,
        [*sector_materials, materials["white"], materials["black"], *sector_glow_materials], collections["Annotations"],
    )
    base.create_start_gantry(finish_distance, centerline, cumulative, dtm, center, base_elevation, [materials["structure"], materials["gantry_light"]], collections["Infrastructure"])
    low, high = base.create_extrema_anchors(centerline, cumulative, total_length, dtm, center, base_elevation, collections["Annotations"])
    for name in ("LowPoint", "HighPoint"):
        anchor = bpy.data.objects.get(name)
        if anchor:
            anchor["elevation_dem_m"] = anchor["elevation_datum_m"]

    bounds_anchor = bpy.data.objects.new("SceneBounds", None)
    bounds_anchor["width_m"] = bounds["maxX"] - bounds["minX"]
    bounds_anchor["depth_m"] = bounds["maxY"] - bounds["minY"]
    bounds_anchor["minimum_elevation_dem_m"] = raster_metadata["rasters"]["dtm"]["minimum"]
    bounds_anchor["maximum_elevation_dem_m"] = raster_metadata["rasters"]["dtm"]["maximum"]
    collections["Annotations"].objects.link(bounds_anchor)
    base.add_lighting(collections["Terrain"])
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    hung.render_preview(preview_path, collections["Terrain"], bounds)
    base.export_glb(glb_path)

    profile = []
    for index in range(180):
        distance = total_length * index / 179
        x, y = base.sample_polyline(centerline, cumulative, min(distance, total_length - 1e-6))
        profile.append({"distanceMeters": round(distance, 2), "elevationMeters": round(dtm.sample(x, y), 3)})
    metadata = {
        "boundsMeters": {"depth": bounds["maxY"] - bounds["minY"], "width": bounds["maxX"] - bounds["minX"]},
        "coordinateReferenceSystem": "EPSG:32630 + ODN",
        "elevationProfile": profile,
        "elevationsMeters": {"high": round(high[0], 3), "low": round(low[0], 3)},
        "finishDistanceMeters": round(finish_distance, 2),
        "generatedWith": f"Blender {bpy.app.version_string}",
        "lapLength": {
            "geometryMeters": round(total_length, 3),
            "officialFiaMeters": config["model"]["lapLengthMeters"],
            "relativeErrorPercent": round(abs(total_length - config["model"]["lapLengthMeters"]) / config["model"]["lapLengthMeters"] * 100, 4),
        },
        "layoutQuality": {
            "buildings": building_quality,
            "curbs": curb_quality,
            "grandstands": {"manual": manual_stands_quality, "mapped": mapped_stands_quality},
            "motorhomes": motorhome_quality,
            "pitLane": pit_quality,
            "runoff": runoff_quality,
            "surfaceClearance": surface_quality,
            "surfaceSmoothing": {"wholeLap": surface_raster.quality},
            "terrainSurface": raster_metadata["terrainSurface"],
        },
        "objects": {
            "buildingsTotal": building_quality["renderedCurrentFootprints"],
            "fenceSegments": fence_segments,
            "grandstandSections": manual_stands + mapped_stands,
            "mappedGrandstands": mapped_stands,
            "mappedTrees": tree_count,
            "pitGarageBoxes": pit_complex_quality["garageBoxes"],
            "raceMotorhomes": motorhome_count,
            "runoffSections": runoff_sections,
            "turnAnchors": 18,
        },
        "officialSources": config["officialSources"],
        "realWorldScale": "1 unit = 1 metre; no vertical exaggeration",
        "schemaVersion": 5,
        "sectorBoundaryDistancesMeters": [round(value, 2) for value in sector_distances],
        "sourceManifest": config["sourceManifest"],
        "verticalDatum": "Ordnance Datum Newlyn (ODN); no vertical exaggeration",
    }
    metadata_path.write_text(f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
