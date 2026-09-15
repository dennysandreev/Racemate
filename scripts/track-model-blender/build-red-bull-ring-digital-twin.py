#!/usr/bin/env python3
"""Build the georeferenced, real-scale Red Bull Ring web scene in Blender."""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
HUNGARORING_PATH = SCRIPT_DIRECTORY / "build-hungaroring-digital-twin.py"
HUNGARORING_SPEC = importlib.util.spec_from_file_location(
    "track_hungaroring_digital_twin", HUNGARORING_PATH
)
hungaroring = importlib.util.module_from_spec(HUNGARORING_SPEC)
HUNGARORING_SPEC.loader.exec_module(hungaroring)
spa = hungaroring.spa
base = hungaroring.base

SECTOR_COLORS = ((0.86, 0.02, 0.01, 1), (0.98, 0.48, 0.03, 1), (0.02, 0.60, 0.78, 1))
GRAVEL_TURNS = {3, 4, 6}
RUNOFF_SIDES = {1: 1, 2: -1, 3: 1, 4: -1, 5: -1, 6: 1, 7: -1, 8: 1, 9: -1, 10: -1}
NON_RUNOFF_TURNS = {2, 5, 7, 8}


def utm33n_from_wgs84(lat, lon):
    semi_major = 6_378_137.0
    flattening = 1 / 298.257223563
    scale = 0.9996
    eccentricity_squared = flattening * (2 - flattening)
    secondary_eccentricity_squared = eccentricity_squared / (1 - eccentricity_squared)
    latitude = math.radians(lat)
    longitude_delta = math.radians(lon - 15)
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
        500_000 + scale * radius * (
            a + (1 - t + c) * a**3 / 6
            + (5 - 18 * t + t**2 + 72 * c - 58 * secondary_eccentricity_squared) * a**5 / 120
        ),
        scale * (
            meridional_arc
            + radius * tangent * (
                a**2 / 2
                + (5 - t + 9 * c + 4 * c**2) * a**4 / 24
                + (61 - 58 * t + t**2 + 600 * c - 330 * secondary_eccentricity_squared) * a**6 / 720
            )
        ),
    )


base.rd_from_wgs84 = utm33n_from_wgs84
spa.lambert_2008_from_wgs84 = utm33n_from_wgs84
spa.REPLACED_OSM_BUILDING_IDS = {118_364_939}
spa.REPLACED_OSM_GRANDSTAND_IDS = set()
base.TERRAIN_COLUMNS = 126
base.TERRAIN_ROWS = 108
base.TRACK_SURFACE_Z_OFFSET = 0.46
base.PIT_LANE_WIDTH_METERS = 11.0
base.PIT_LANE_TAPER_METERS = 30.0
base.GRANDSTAND_MAX_PLATFORM_STEP_METERS = 1.5
base.TURN_CURB_HALF_SPAN = (48, 34, 50, 52, 36, 42, 42, 38, 48, 52)
base.bank_angle = lambda _distance, _total: (0.0, 0.0)
hungaroring.utm34n_from_wgs84 = utm33n_from_wgs84
hungaroring.GRAVEL_TURNS = GRAVEL_TURNS
hungaroring.RUNOFF_SIDES = RUNOFF_SIDES
hungaroring.PIT_ENTRY_RUNOFF_TURNS = NON_RUNOFF_TURNS
hungaroring.CURB_WIDTH_METERS = 1.25
hungaroring.CURB_VISIBLE_HEIGHT_METERS = 0.10


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def configure_scene(center, base_elevation):
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1_280
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Red_Bull_Ring_World")
    scene.world.color = (0.025, 0.035, 0.045)
    scene["coordinate_reference_system"] = "EPSG:32633"
    scene["origin_utm33n_x"] = center["x"]
    scene["origin_utm33n_y"] = center["y"]
    scene["origin_dem_z"] = base_elevation
    scene["real_world_scale"] = "1 Blender unit = 1 metre"


def render_preview(preview_path, collection, bounds):
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("RedBullRingPreviewCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(
        bounds["maxX"] - bounds["minX"],
        bounds["maxY"] - bounds["minY"],
    ) * 1.18
    camera_data.clip_end = 8_000
    camera = bpy.data.objects.new("RedBullRingPreviewCamera", camera_data)
    camera.location = (1_480, -1_760, 1_820)
    base.look_at(camera, (0, 0, 32))
    collection.objects.link(camera)
    scene.camera = camera
    scene.render.filepath = str(preview_path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(camera_data)


def create_roofed_grandstands(
    osm_buildings,
    dtm,
    dsm,
    bounds,
    center,
    base_elevation,
    material,
    collection,
    centerline,
):
    """Build open seating bowls with visible cantilever roofs from mapped footprints."""
    builder = base.MeshBuilder()
    stand_count = 0
    seating_tiers = 0
    roofed_structures = 0
    frame_color = (0.20, 0.22, 0.23, 1.0)
    roof_color = (0.82, 0.83, 0.81, 1.0)
    roof_edge_color = (0.50, 0.52, 0.52, 1.0)
    seat_colors = (
        (0.72, 0.025, 0.018, 1.0),
        (0.085, 0.095, 0.105, 1.0),
        (0.76, 0.77, 0.74, 1.0),
    )

    for feature, ring in spa.building_polygons(osm_buildings, bounds):
        if feature.get("tags", {}).get("building") != "grandstand":
            continue
        if feature.get("id") in spa.REPLACED_OSM_GRANDSTAND_IDS:
            continue
        volume = base.estimate_polygon_volume(
            [ring], dtm, dsm, default_height=8.0, maximum_height=18.0
        )
        if volume is None:
            continue
        (world_cx, world_cy), ground, sampled_height = volume
        polygon = ring[:-1] if ring[0] == ring[-1] else ring
        mean_x = sum(point[0] for point in polygon) / len(polygon)
        mean_y = sum(point[1] for point in polygon) / len(polygon)
        covariance_xx = sum((point[0] - mean_x) ** 2 for point in polygon)
        covariance_yy = sum((point[1] - mean_y) ** 2 for point in polygon)
        covariance_xy = sum(
            (point[0] - mean_x) * (point[1] - mean_y) for point in polygon
        )
        rotation = 0.5 * math.atan2(
            2 * covariance_xy, covariance_xx - covariance_yy
        )
        along = Vector((math.cos(rotation), math.sin(rotation)))
        across = Vector((-along.y, along.x))
        nearest_track = min(
            centerline,
            key=lambda point: (point[0] - world_cx) ** 2 + (point[1] - world_cy) ** 2,
        )
        track_to_stand = Vector(
            (world_cx - nearest_track[0], world_cy - nearest_track[1])
        )
        if across.dot(track_to_stand) < 0:
            across *= -1
            rotation += math.pi

        projected_along = [
            Vector((point[0] - mean_x, point[1] - mean_y)).dot(along)
            for point in polygon
        ]
        projected_across = [
            Vector((point[0] - mean_x, point[1] - mean_y)).dot(across)
            for point in polygon
        ]
        length = max(projected_along) - min(projected_along)
        depth = max(projected_across) - min(projected_across)
        if length < 12 or depth < 4:
            continue
        world_cx = mean_x + along.x * (
            (min(projected_along) + max(projected_along)) / 2
        ) + across.x * ((min(projected_across) + max(projected_across)) / 2)
        world_cy = mean_y + along.y * (
            (min(projected_along) + max(projected_along)) / 2
        ) + across.y * ((min(projected_across) + max(projected_across)) / 2)
        local_cx, local_cy = base.local_xy((world_cx, world_cy), center)
        ground_z = ground - base_elevation + 0.08
        tier_count = max(5, min(11, round(depth / 2.8)))
        occupied_depth = depth * 0.82
        tier_depth = occupied_depth / tier_count
        rise = min(max((sampled_height - 1.2) / tier_count, 0.42), 0.82)
        seat_length = max(length - 2.4, 8.0)

        for tier_index in range(tier_count):
            across_position = (
                -depth / 2 + depth * 0.08 + tier_depth * (tier_index + 0.5)
            )
            tier_height = 0.55 + rise * (tier_index + 1)
            tier_center = base.shifted_local_point(
                local_cx,
                local_cy,
                0,
                across_position,
                rotation,
                ground_z + tier_height / 2,
            )
            builder.add_box(
                tier_center,
                (seat_length, tier_depth * 0.94, tier_height),
                color=seat_colors[tier_index % len(seat_colors)],
                rotation=rotation,
            )
            seating_tiers += 1

        canopy_height = ground_z + 0.55 + rise * tier_count + 3.0
        canopy_depth = depth * 0.76
        canopy_across = depth * 0.08
        roof_center = base.shifted_local_point(
            local_cx,
            local_cy,
            0,
            canopy_across,
            rotation,
            canopy_height,
        )
        builder.add_box(
            roof_center,
            (length + 1.6, canopy_depth, 0.38),
            color=roof_color,
            rotation=rotation,
        )

        post_height = canopy_height - ground_z - 0.19
        for along_position in (-length / 2 + 1.3, length / 2 - 1.3):
            for across_position in (
                canopy_across - canopy_depth / 2 + 0.7,
                canopy_across + canopy_depth / 2 - 0.7,
            ):
                post_center = base.shifted_local_point(
                    local_cx,
                    local_cy,
                    along_position,
                    across_position,
                    rotation,
                    ground_z + post_height / 2,
                )
                builder.add_box(
                    post_center,
                    (0.38, 0.38, post_height),
                    color=frame_color,
                    rotation=rotation,
                )
        fascia_center = base.shifted_local_point(
            local_cx,
            local_cy,
            0,
            canopy_across - canopy_depth / 2,
            rotation,
            canopy_height - 0.22,
        )
        builder.add_box(
            fascia_center,
            (length + 1.7, 0.24, 0.55),
            color=roof_edge_color,
            rotation=rotation,
        )
        stand_count += 1
        roofed_structures += 1

    obj = builder.create_object(
        "RedBullRing_2026_Current_Grandstands",
        [material],
        collection,
        vertex_colors=True,
    )
    obj["source"] = (
        "Current OSM grandstand footprints cross-checked with the official 2026 "
        "event configuration; open stepped seating and covered roof canopies"
    )
    return obj, stand_count, {
        "canopyTriangles": roofed_structures * 12,
        "downwardFacingRoofTriangles": 0,
        "openSeatingBowls": stand_count,
        "opaqueRoofMaterial": True,
        "redRoofSurfaces": 0,
        "roofTriangles": roofed_structures * 2,
        "roofWindingRepairs": 0,
        "roofedStructures": roofed_structures,
        "roofSlabThicknessMeters": 0.38,
        "seatingTiers": seating_tiers,
    }


def main():
    args = base.parse_args()
    input_path = Path(args.input).resolve()
    prepared_directory = Path(args.prepared).resolve()
    glb_path = Path(args.glb).resolve()
    preview_path = Path(args.preview).resolve()
    metadata_path = Path(args.metadata).resolve()
    config = load_json(input_path)
    source_directory = Path(config["sourceDirectory"])
    bounds = config["model"]["bounds"]
    center = config["model"]["center"]
    raster_metadata = load_json(prepared_directory / "raster-metadata.json")
    dtm = base.HeightRaster(
        prepared_directory / "styria-dtm.f32le",
        raster_metadata["rasters"]["dtm"],
        bounds,
    )
    dsm = base.HeightRaster(
        prepared_directory / "styria-dsm.f32le",
        raster_metadata["rasters"]["dsm"],
        bounds,
    )
    base_elevation = float(raster_metadata["rasters"]["dtm"]["minimum"])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    collections = base.create_collections()
    configure_scene(center, base_elevation)

    materials = {
        "terrain": base.create_aerial_material(prepared_directory / "styria-orthophoto-2024.jpg"),
        "asphalt": base.create_material("RedBullRing_Real_Asphalt", (0.070, 0.076, 0.082, 1), 0.95),
        "white": base.create_material("RedBullRing_Track_White", (0.94, 0.93, 0.90, 1), 0.82),
        "curb_red": base.create_material("RedBullRing_Curb_Red", (0.71, 0.018, 0.012, 1), 0.84),
        "building": base.create_material("RedBullRing_Current_OSM_DSM_Buildings", (1, 1, 1, 1), 0.84, use_vertex_color=True),
        "motorhome": base.create_material("RedBullRing_2026_Race_Motorhomes", (1, 1, 1, 1), 0.64, metallic=0.10, use_vertex_color=True),
        "pit_wall": base.create_material("RedBullRing_Pit_Wall_Concrete", (0.62, 0.63, 0.62, 1), 0.92),
        "fence": base.create_material("RedBullRing_Safety_Fence", (0.40, 0.43, 0.44, 0.64), 0.72, metallic=0.34),
        "tree_trunk": base.create_material("RedBullRing_Tree_Trunks", (0.18, 0.105, 0.055, 1), 1.0),
        "tree_crown": base.create_material("RedBullRing_Tree_Canopies", (0.12, 0.26, 0.095, 1), 1.0),
        "grandstand": base.create_material("RedBullRing_Current_Grandstands", (1, 1, 1, 1), 0.62, metallic=0.18, use_vertex_color=True),
        "grandstand_roof": base.create_material("RedBullRing_Grandstands_Roofs", (0.82, 0.83, 0.81, 1), 0.62, metallic=0.18),
        "structure": base.create_material("RedBullRing_Circuit_Structures", (0.36, 0.38, 0.38, 1), 0.78, metallic=0.12),
        "seat_dark": base.create_material("RedBullRing_Grandstand_Seats_Dark", (0.05, 0.06, 0.07, 1), 0.88),
        "seat_red": base.create_material("RedBullRing_Grandstand_Seats_Red", (0.67, 0.02, 0.018, 1), 0.88),
        "gantry_light": base.create_material("RedBullRing_Gantry_Lights", (0.88, 0.05, 0.02, 1), 0.34),
        "gravel": base.create_material("RedBullRing_Real_Gravel_Runoff", (0.54, 0.43, 0.29, 1), 1.0),
        "runoff": base.create_material("RedBullRing_Asphalt_Runoff", (0.16, 0.17, 0.18, 1), 0.98),
        "black": base.create_material("RedBullRing_Control_Line_Black", (0.015, 0.015, 0.015, 1), 0.86),
    }
    materials["terrain"].name = "Terrain_Styria_Orthophoto_2024"
    sector_materials = [
        base.create_material(f"Sector_{index + 1}", color, 0.68)
        for index, color in enumerate(SECTOR_COLORS)
    ]
    sector_glow_materials = [
        base.create_material(
            f"Sector_{index + 1}_Glow",
            (color[0], color[1], color[2], 0.34),
            0.48,
            emission_strength=1.4,
        )
        for index, color in enumerate(SECTOR_COLORS)
    ]

    terrain = base.add_terrain(
        bounds, center, dtm, base_elevation, materials["terrain"], collections["Terrain"]
    )
    terrain.name = "Styria_DTM_Terrain_RealScale"
    terrain.data.name = "Styria_DTM_Terrain_RealScale_Mesh"
    terrain["source"] = "Land Steiermark 1 m ALS DTM and 2024 orthophoto; no vertical exaggeration"

    osm_data = load_json(source_directory / "openstreetmap-raceway.json")
    source_centerline = base.assemble_main_circuit(
        osm_data, config["model"]["mainCircuitWayIds"]
    )
    centerline = spa.rotate_closed_polyline(
        source_centerline, config["model"]["sourceStartFinishOffsetMeters"]
    )
    cumulative, total_length = base.line_distance(centerline)
    surface_raster = hungaroring.WholeLapSurfaceRaster(
        dtm,
        centerline,
        cumulative,
        config["model"]["trackWidthMeters"],
    )
    track, cumulative, total_length, track_samples = base.create_ribbon(
        "FIA_Red_Bull_Ring_Centreline_12_5m",
        centerline,
        surface_raster,
        center,
        base_elevation,
        config["model"]["trackWidthMeters"],
        materials["asphalt"],
        collections["Circuit"],
        z_offset=base.TRACK_SURFACE_Z_OFFSET,
        banked=False,
    )
    track["source"] = "Current OSM raceway ring checked against FIA 2026 4.326 km circuit map"
    hungaroring.create_edge_lines(
        centerline, cumulative, total_length, surface_raster, center, base_elevation,
        materials["white"], collections["Circuit"], config["model"]["trackWidthMeters"],
    )
    curb_obj, curb_quality = hungaroring.create_curbs(
        config, centerline, cumulative, surface_raster, center, base_elevation,
        [materials["curb_red"], materials["white"]], collections["Circuit"],
    )
    curb_obj.name = "RedBullRing_Real_Red_White_Curbs"
    curb_obj.data.name = "RedBullRing_Real_Red_White_Curbs_Mesh"
    runoff_obj, runoff_sections, runoff_quality = hungaroring.create_runoff(
        config,
        centerline,
        cumulative,
        surface_raster,
        center,
        base_elevation,
        [materials["gravel"], materials["runoff"]],
        collections["Circuit"],
    )
    runoff_obj.name = "RedBullRing_FIA_Runoff_And_Gravel"
    runoff_obj.data.name = "RedBullRing_FIA_Runoff_And_Gravel_Mesh"
    runoff_obj["source"] = "FIA 2026 circuit map cross-checked against the Styria 2024 orthophoto"

    _, pit_centerline, pit_quality = base.create_pit_lane(
        osm_data,
        config["model"]["pitLaneWayId"],
        centerline,
        dtm,
        center,
        base_elevation,
        materials,
        collections["Circuit"],
        pit_boxes=config["model"]["pitBoxes"],
        entry_minimum_width=4.2,
    )
    _, pit_wall_quality = base.create_pit_wall(
        pit_centerline,
        centerline,
        dtm,
        center,
        base_elevation,
        [materials["pit_wall"], materials["fence"]],
        collections["Infrastructure"],
        start_ratio=0.13,
        end_ratio=0.87,
        wall_height=0.52,
        fence_height=0.62,
    )
    pit_wall_quality["placement"] = "between main circuit and pit lane"
    pit_quality["pitWall"] = pit_wall_quality
    pit_complex_obj, pit_complex_quality = spa.create_pit_complex(
        config,
        pit_centerline,
        dtm,
        center,
        base_elevation,
        [
            materials["structure"],
            materials["seat_dark"],
            materials["seat_red"],
            materials["grandstand_roof"],
        ],
        collections["Grandstands"],
        covered_grandstand=True,
    )
    pit_complex_obj.name = "RedBullRing_2026_32_Garage_Pit_Complex"
    pit_complex_obj.data.name = "RedBullRing_2026_32_Garage_Pit_Complex_Mesh"
    pit_complex_obj["source"] = (
        "FIA 2026 pit-lane drawing and current OSM pit-complex alignment; "
        "covered start/finish grandstand"
    )
    pit_quality["pitComplex"] = pit_complex_quality

    exclusion_corridors = [
        (base.sample_line_points(centerline, cumulative, 4.0), config["model"]["trackWidthMeters"] / 2 + 1.5),
        (
            base.sample_line_points(
                pit_centerline, base.line_distance(pit_centerline)[0], 4.0, closed=False
            ),
            base.PIT_LANE_WIDTH_METERS / 2 + 1.5,
        ),
    ]
    surface_quality = base.measure_ribbon_terrain_clearance(
        track_samples, dtm, base_elevation
    )
    osm_buildings = load_json(source_directory / "openstreetmap-buildings.json")
    building_obj, _, building_quality = spa.create_osm_buildings(
        osm_buildings,
        dtm,
        dsm,
        bounds,
        center,
        base_elevation,
        materials["building"],
        collections["Buildings"],
        exclusion_corridors,
        [],
    )
    building_obj.name = "RedBullRing_Current_OSM_DSM_Buildings"
    building_obj.data.name = "RedBullRing_Current_OSM_DSM_Buildings_Mesh"
    building_obj["source"] = "Current OSM footprints with official Styria DSM heights"
    building_quality["opaqueRoofMaterial"] = True
    building_quality["roofedFootprints"] = building_quality["renderedCurrentFootprints"]
    grandstand_obj, mapped_grandstands, grandstand_quality = create_roofed_grandstands(
        osm_buildings,
        dtm,
        dsm,
        bounds,
        center,
        base_elevation,
        materials["grandstand"],
        collections["Grandstands"],
        centerline,
    )
    grandstand_obj.name = "RedBullRing_2026_Current_Grandstands"
    grandstand_obj.data.name = "RedBullRing_2026_Current_Grandstands_Mesh"
    grandstand_obj["source"] = "Current OSM grandstand footprints; official Red Bull Ring 2026 all-stands confirmation"
    grandstand_quality["currentEventConfirmation"] = "all grandstands open for Formula 1 2026"

    osm_barriers = load_json(source_directory / "openstreetmap-barriers.json")
    barrier_obj, fence_segments = spa.create_osm_barriers(
        osm_barriers,
        dtm,
        bounds,
        center,
        base_elevation,
        materials["fence"],
        collections["Infrastructure"],
    )
    barrier_obj.name = "RedBullRing_OSM_Safety_Fences_And_Walls"
    barrier_obj.data.name = "RedBullRing_OSM_Safety_Fences_And_Walls_Mesh"
    tree_data = load_json(source_directory / "openstreetmap-trees.json")
    tree_obj, tree_count = hungaroring.create_osm_trees(
        tree_data,
        dtm,
        center,
        base_elevation,
        [materials["tree_trunk"], materials["tree_crown"]],
        collections["Infrastructure"],
        centerline,
        pit_centerline,
    )
    tree_obj.name = "RedBullRing_OSM_Mapped_Trees"
    tree_obj.data.name = "RedBullRing_OSM_Mapped_Trees_Mesh"
    motorhome_obj, motorhome_count, motorhome_quality = hungaroring.create_paddock_motorhomes(
        config,
        pit_centerline,
        dtm,
        center,
        base_elevation,
        materials["motorhome"],
        collections["Infrastructure"],
        exclusion_corridors,
    )
    motorhome_obj.name = "RedBullRing_2026_Race_Motorhomes"
    motorhome_obj.data.name = "RedBullRing_2026_Race_Motorhomes_Mesh"
    motorhome_obj["source"] = "Current paddock corridor behind the pit complex; real vehicle dimensions"
    motorhome_quality["sourceResolutionMetersPerPixel"] = 0.2

    finish_distance, sector_distances, _, _ = base.create_track_annotations(
        config,
        osm_data,
        centerline,
        cumulative,
        total_length,
        dtm,
        center,
        base_elevation,
        [*sector_materials, materials["white"], materials["black"], *sector_glow_materials],
        collections["Annotations"],
    )
    base.create_start_gantry(
        finish_distance,
        centerline,
        cumulative,
        dtm,
        center,
        base_elevation,
        [materials["structure"], materials["gantry_light"]],
        collections["Infrastructure"],
    )
    low, high = base.create_extrema_anchors(
        centerline,
        cumulative,
        total_length,
        dtm,
        center,
        base_elevation,
        collections["Annotations"],
    )
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
    render_preview(preview_path, collections["Terrain"], bounds)
    base.export_glb(glb_path)

    profile = []
    for index in range(180):
        distance = total_length * index / 179
        x, y = base.sample_polyline(
            centerline, cumulative, min(distance, total_length - 1e-6)
        )
        profile.append({
            "distanceMeters": round(distance, 2),
            "elevationMeters": round(dtm.sample(x, y), 3),
        })
    metadata = {
        "boundsMeters": {
            "depth": bounds["maxY"] - bounds["minY"],
            "width": bounds["maxX"] - bounds["minX"],
        },
        "coordinateReferenceSystem": "EPSG:32633 + official Styria orthometric metres",
        "elevationProfile": profile,
        "elevationsMeters": {"high": round(high[0], 3), "low": round(low[0], 3)},
        "finishDistanceMeters": round(finish_distance, 2),
        "generatedWith": f"Blender {bpy.app.version_string}",
        "lapLength": {
            "geometryMeters": round(total_length, 3),
            "officialFiaMeters": config["model"]["lapLengthMeters"],
            "relativeErrorPercent": round(
                abs(total_length - config["model"]["lapLengthMeters"])
                / config["model"]["lapLengthMeters"]
                * 100,
                4,
            ),
        },
        "layoutQuality": {
            "buildings": building_quality,
            "curbs": curb_quality,
            "grandstands": grandstand_quality,
            "motorhomes": motorhome_quality,
            "pitLane": pit_quality,
            "runoff": runoff_quality,
            "surfaceClearance": surface_quality,
            "surfaceSmoothing": {"wholeLap": surface_raster.quality},
            "terrainSurface": {
                "orthophotoState": "2024-04-26",
                "sourceResolutionMeters": 0.2,
            },
        },
        "objects": {
            "buildingsTotal": building_quality["renderedCurrentFootprints"],
            "fenceSegments": fence_segments,
            "mappedGrandstands": mapped_grandstands,
            "mappedTrees": tree_count,
            "pitGarageBoxes": pit_complex_quality["garageBoxes"],
            "raceMotorhomes": motorhome_count,
            "runoffSections": runoff_sections,
            "turnAnchors": 10,
        },
        "officialSources": config["officialSources"],
        "realWorldScale": "1 unit = 1 metre; no vertical exaggeration",
        "schemaVersion": 5,
        "sectorBoundaryDistancesMeters": [round(value, 2) for value in sector_distances],
        "sourceManifest": config["sourceManifest"],
        "turnAnchorDistancesMeters": [
            turn["distanceMeters"] for turn in config["model"]["turns"]
        ],
        "verticalDatum": "official Styria orthometric metres; no vertical exaggeration",
    }
    metadata_path.write_text(f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
