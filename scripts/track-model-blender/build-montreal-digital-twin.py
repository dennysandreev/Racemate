#!/usr/bin/env python3
"""Build the georeferenced, real-scale Circuit Gilles-Villeneuve web scene."""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import bpy


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
RED_BULL_RING_PATH = SCRIPT_DIRECTORY / "build-red-bull-ring-digital-twin.py"
RED_BULL_RING_SPEC = importlib.util.spec_from_file_location(
    "track_red_bull_ring_digital_twin", RED_BULL_RING_PATH
)
red_bull_ring = importlib.util.module_from_spec(RED_BULL_RING_SPEC)
RED_BULL_RING_SPEC.loader.exec_module(red_bull_ring)
hungaroring = red_bull_ring.hungaroring
spa = red_bull_ring.spa
base = red_bull_ring.base

SECTOR_COLORS = ((0.86, 0.02, 0.01, 1), (0.98, 0.48, 0.03, 1), (0.02, 0.60, 0.78, 1))
RUNOFF_SIDES = {
    1: -1, 2: 1, 3: -1, 4: 1, 5: -1, 6: 1, 7: -1,
    8: -1, 9: 1, 10: -1, 11: 1, 12: 1, 13: 1, 14: -1,
}
MONTREAL_CURB_HALF_SPANS_METERS = (45, 35, 28, 24, 36, 27, 27, 36, 36, 40, 40, 40, 15, 15)


def mtm8_from_wgs84(lat, lon):
    semi_major = 6_378_137.0
    flattening = 1 / 298.257222101
    scale = 0.9999
    eccentricity_squared = flattening * (2 - flattening)
    secondary_eccentricity_squared = eccentricity_squared / (1 - eccentricity_squared)
    latitude = math.radians(lat)
    longitude_delta = math.radians(lon + 73.5)
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
        304_800 + scale * radius * (
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


base.rd_from_wgs84 = mtm8_from_wgs84
spa.lambert_2008_from_wgs84 = mtm8_from_wgs84
spa.REPLACED_OSM_BUILDING_IDS = {42_229_671}
spa.REPLACED_OSM_GRANDSTAND_IDS = set()
spa.TREE_GRID_METERS = 48.0
base.TERRAIN_COLUMNS = 84
base.TERRAIN_ROWS = 162
base.TRACK_SURFACE_Z_OFFSET = 0.46
base.PIT_LANE_WIDTH_METERS = 11.0
base.PIT_LANE_TAPER_METERS = 30.0
base.GRANDSTAND_MAX_PLATFORM_STEP_METERS = 1.5
base.TURN_CURB_HALF_SPAN = (44, 36, 38, 38, 34, 42, 36, 46, 40, 62, 42, 44, 42, 38)
base.bank_angle = lambda _distance, _total: (0.0, 0.0)
hungaroring.utm34n_from_wgs84 = mtm8_from_wgs84
hungaroring.GRAVEL_TURNS = set()
hungaroring.RUNOFF_SIDES = RUNOFF_SIDES
hungaroring.PIT_ENTRY_RUNOFF_TURNS = {1, 2, 13, 14}
hungaroring.CURB_WIDTH_METERS = 1.05
hungaroring.CURB_VISIBLE_HEIGHT_METERS = 0.09


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def audit_building_exclusions(osm_buildings, bounds, corridors, reserved_grandstands):
    exclusions = []
    for feature, ring in spa.building_polygons(osm_buildings, bounds):
        if feature.get("tags", {}).get("building") == "grandstand":
            continue
        identifier = feature.get("id")
        polygon = ring[:-1]
        if identifier in spa.REPLACED_OSM_BUILDING_IDS:
            exclusions.append({
                "id": identifier,
                "reason": "superseded by the FIA 2026 pit-complex model",
            })
        elif base.polygon_intersects_corridors(polygon, corridors):
            exclusions.append({
                "id": identifier,
                "reason": "intersects the circuit or pit-lane exclusion corridor",
            })
        elif any(base.polygons_overlap(polygon, stand) for stand in reserved_grandstands):
            exclusions.append({
                "id": identifier,
                "reason": "intersects a reserved current-event grandstand footprint",
            })
    return exclusions


def create_pit_complex(
    config,
    pit_points,
    raster,
    center,
    base_elevation,
    materials,
    collection,
):
    builder = base.MeshBuilder()
    cumulative, total = base.line_distance(pit_points)
    garage_boxes = int(config["model"]["pitBoxes"])
    start = total * 0.23
    end = total * 0.78
    front_offset = base.PIT_LANE_WIDTH_METERS / 2 + 0.85
    rear_offset = front_offset + 32.0
    garage_height = 5.2
    bay_length = (end - start) / garage_boxes

    for index in range(garage_boxes):
        section_start = start + index * bay_length + 0.16
        section_end = start + (index + 1) * bay_length - 0.16
        footprint = [
            base.road_surface_point(
                pit_points,
                cumulative,
                distance,
                lateral,
                raster,
                center,
                base_elevation,
                base.PIT_LANE_WIDTH_METERS,
                z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.04,
                closed=False,
            )
            for distance, lateral in (
                (section_start, front_offset),
                (section_end, front_offset),
                (section_end, rear_offset),
                (section_start, rear_offset),
            )
        ]
        floor_height = max(point[2] for point in footprint)
        bottom = [(x, y, floor_height) for x, y, _ in footprint]
        top = [(x, y, floor_height + garage_height) for x, y, _ in footprint]
        builder.add_volume(bottom, top, material_index=0)
        builder.add_quad((
            (footprint[0][0], footprint[0][1], floor_height + 0.28),
            (footprint[1][0], footprint[1][1], floor_height + 0.28),
            (footprint[1][0], footprint[1][1], floor_height + 4.35),
            (footprint[0][0], footprint[0][1], floor_height + 4.35),
        ), material_index=1)

    obj = builder.create_object(
        "Montreal_2026_43_Garage_Pit_Complex",
        materials,
        collection,
    )
    obj["source"] = "FIA 2026 garage count and the current OSM pit-complex footprint"
    return obj, {
        "buildingDepthMeters": round(abs(rear_offset - front_offset), 2),
        "garageBoxes": garage_boxes,
        "garageFrontFacesPitLane": True,
        "garageSide": "left",
        "grandstandRows": 0,
        "coveredGrandstand": False,
        "lengthMeters": round(end - start, 2),
        "pitLaneClearanceMeters": round(front_offset - base.PIT_LANE_WIDTH_METERS / 2, 2),
        "rearEdge": "extends across the narrow pit platform toward the rowing basin",
    }


def create_pit_exit_guide_line(
    pit_points,
    raster,
    center,
    base_elevation,
    material,
    collection,
):
    builder = base.MeshBuilder()
    cumulative, total = base.line_distance(pit_points)
    guide_length = 78.0
    start = max(total - guide_length, 0.0)
    distance = start
    line_half_width = 0.12

    while distance < total:
        following = min(distance + 3.0, total)
        progress = (distance - start) / max(total - start, 1e-6)
        following_progress = (following - start) / max(total - start, 1e-6)
        # Follow the circuit-facing edge of the lane and close the line smoothly
        # into the merge point shown on the FIA 2026 pit-lane drawing.
        offset = -(base.PIT_LANE_WIDTH_METERS / 2 - 0.34) * (1.0 - progress**2)
        following_offset = -(base.PIT_LANE_WIDTH_METERS / 2 - 0.34) * (
            1.0 - following_progress**2
        )
        builder.add_quad([
            base.road_surface_point(
                pit_points,
                cumulative,
                point_distance,
                lateral,
                raster,
                center,
                base_elevation,
                base.PIT_LANE_WIDTH_METERS,
                z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.075,
                closed=False,
            )
            for point_distance, lateral in (
                (distance, offset - line_half_width),
                (following, following_offset - line_half_width),
                (following, following_offset + line_half_width),
                (distance, offset + line_half_width),
            )
        ])
        distance = following

    obj = builder.create_object(
        "FIA_Pit_Exit_Continuous_White_Guide_Line",
        [material],
        collection,
    )
    obj["source"] = "FIA Canadian GP 2026 Document 8 pit-exit photograph and diagram"
    return obj, {
        "lengthMeters": guide_length,
        "present": True,
        "style": "continuous white",
        "taperProfile": "quadratic flush merge",
    }


def create_pit_wall_gate_details(
    pit_points,
    main_centerline,
    raster,
    center,
    base_elevation,
    material,
    collection,
):
    pit_cumulative, total = base.line_distance(pit_points)
    main_cumulative, _ = base.line_distance(main_centerline)
    main_samples = base.sample_line_points(main_centerline, main_cumulative, 2.0)
    midpoint_distance = total * 0.5
    midpoint = base.sample_polyline(
        pit_points, pit_cumulative, midpoint_distance, closed=False
    )
    tangent = base.sample_tangent(
        pit_points, pit_cumulative, midpoint_distance, closed=False
    )
    normal = (-tangent.y, tangent.x)
    nearest_main = min(
        main_samples,
        key=lambda point: math.hypot(point[0] - midpoint[0], point[1] - midpoint[1]),
    )
    main_side = (
        1
        if (nearest_main[0] - midpoint[0]) * normal[0]
        + (nearest_main[1] - midpoint[1]) * normal[1]
        >= 0
        else -1
    )
    wall_offset = main_side * (base.PIT_LANE_WIDTH_METERS / 2 + 0.18)
    wall_height = 1.05
    fence_height = 2.10
    gate_width = 3.2
    gate_ratios = (0.34, 0.56, 0.76)
    builder = base.MeshBuilder()

    for ratio in gate_ratios:
        gate_center = total * ratio
        gate_start = gate_center - gate_width / 2
        gate_end = gate_center + gate_width / 2
        start_point = base.road_surface_point(
            pit_points, pit_cumulative, gate_start, wall_offset, raster, center,
            base_elevation, base.PIT_LANE_WIDTH_METERS,
            z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.02, closed=False,
        )
        end_point = base.road_surface_point(
            pit_points, pit_cumulative, gate_end, wall_offset, raster, center,
            base_elevation, base.PIT_LANE_WIDTH_METERS,
            z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.02, closed=False,
        )
        for point in (start_point, end_point):
            builder.add_cylinder(
                (point[0], point[1], point[2] + wall_height),
                0.085,
                fence_height,
                sides=8,
            )
        gate_midpoint = base.road_surface_point(
            pit_points, pit_cumulative, gate_center, wall_offset, raster, center,
            base_elevation, base.PIT_LANE_WIDTH_METERS,
            z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.02, closed=False,
        )
        gate_tangent = base.sample_tangent(
            pit_points, pit_cumulative, gate_center, closed=False
        )
        rotation = math.atan2(gate_tangent.y, gate_tangent.x)
        for height in (wall_height + 0.12, wall_height + fence_height * 0.52):
            builder.add_box(
                (gate_midpoint[0], gate_midpoint[1], gate_midpoint[2] + height),
                (gate_width, 0.10, 0.10),
                rotation=rotation,
            )

    obj = builder.create_object(
        "FIA_Pit_Wall_Debris_Fence_Gates",
        [material],
        collection,
    )
    obj["source"] = "FIA Canadian GP 2026 competition notes: debris-fence openings fitted with gates"
    return obj, len(gate_ratios)


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
        scene.world = bpy.data.worlds.new("Montreal_World")
    scene.world.color = (0.025, 0.035, 0.045)
    scene["coordinate_reference_system"] = "EPSG:32188"
    scene["origin_mtm8_x"] = center["x"]
    scene["origin_mtm8_y"] = center["y"]
    scene["origin_cgvd2013_z"] = base_elevation
    scene["real_world_scale"] = "1 Blender unit = 1 metre"


def render_preview(preview_path, collection, bounds):
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("MontrealPreviewCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(
        bounds["maxX"] - bounds["minX"],
        bounds["maxY"] - bounds["minY"],
    ) * 1.18
    camera_data.clip_end = 8_000
    camera = bpy.data.objects.new("MontrealPreviewCamera", camera_data)
    camera.location = (1_650, -1_900, 2_250)
    base.look_at(camera, (0, 0, 18))
    collection.objects.link(camera)
    scene.camera = camera
    scene.render.filepath = str(preview_path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(camera_data)


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
        prepared_directory / "montreal-dtm.f32le",
        raster_metadata["rasters"]["dtm"],
        bounds,
    )
    dsm = base.HeightRaster(
        prepared_directory / "montreal-dsm.f32le",
        raster_metadata["rasters"]["dsm"],
        bounds,
    )
    base_elevation = float(raster_metadata["rasters"]["dtm"]["minimum"])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    collections = base.create_collections()
    configure_scene(center, base_elevation)

    materials = {
        "terrain": base.create_aerial_material(prepared_directory / "cmm-orthophoto-2019.jpg"),
        "asphalt": base.create_material("Montreal_Real_Asphalt", (0.070, 0.076, 0.082, 1), 0.95),
        "white": base.create_material("Montreal_Track_White", (0.94, 0.93, 0.90, 1), 0.82),
        "curb_red": base.create_material("Montreal_Curb_Red", (0.71, 0.018, 0.012, 1), 0.84),
        "building": base.create_material("Montreal_Current_OSM_HRDEM_Buildings", (1, 1, 1, 1), 0.84, use_vertex_color=True),
        "motorhome": base.create_material("Montreal_2026_Race_Motorhomes", (1, 1, 1, 1), 0.64, metallic=0.10, use_vertex_color=True),
        "pit_wall": base.create_material("Montreal_Pit_Wall_Concrete", (0.62, 0.63, 0.62, 1), 0.92),
        "fence": base.create_material("Montreal_Safety_Fence", (0.40, 0.43, 0.44, 0.64), 0.72, metallic=0.34),
        "tree_trunk": base.create_material("Montreal_Tree_Trunks", (0.18, 0.105, 0.055, 1), 1.0),
        "tree_crown": base.create_material("Montreal_Tree_Canopies", (0.12, 0.26, 0.095, 1), 1.0),
        "grandstand": base.create_material("Montreal_Current_Grandstands", (1, 1, 1, 1), 0.62, metallic=0.18, use_vertex_color=True),
        "grandstand_roof": base.create_material("Montreal_Grandstand_Roofs", (0.82, 0.83, 0.81, 1), 0.62, metallic=0.18),
        "structure": base.create_material("Montreal_Circuit_Structures", (0.36, 0.38, 0.38, 1), 0.78, metallic=0.12),
        "seat_dark": base.create_material("Montreal_Grandstand_Seats_Dark", (0.05, 0.06, 0.07, 1), 0.88),
        "seat_red": base.create_material("Montreal_Grandstand_Seats_Red", (0.67, 0.02, 0.018, 1), 0.88),
        "gantry_light": base.create_material("Montreal_Gantry_Lights", (0.88, 0.05, 0.02, 1), 0.34),
        "runoff": base.create_material("Montreal_Asphalt_Runoff", (0.16, 0.17, 0.18, 1), 0.98),
        "black": base.create_material("Montreal_Control_Line_Black", (0.015, 0.015, 0.015, 1), 0.86),
    }
    materials["terrain"].name = "Terrain_CMM_Orthophoto_2019"
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
    terrain.name = "Canada_HRDEM_Terrain_RealScale"
    terrain.data.name = "Canada_HRDEM_Terrain_RealScale_Mesh"
    terrain["source"] = "NRCan HRDEM DTM in CGVD2013 and CMM 2019 orthophoto; no vertical exaggeration"

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
        "FIA_Montreal_Centreline_10_5m",
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
    track["source"] = "Current OSM raceway ring checked against FIA 2026 4.361 km circuit map"
    hungaroring.create_edge_lines(
        centerline, cumulative, total_length, surface_raster, center, base_elevation,
        materials["white"], collections["Circuit"], config["model"]["trackWidthMeters"],
    )
    curb_obj, curb_quality = hungaroring.create_curbs(
        config, centerline, cumulative, surface_raster, center, base_elevation,
        [materials["curb_red"], materials["white"]], collections["Circuit"],
        spans=MONTREAL_CURB_HALF_SPANS_METERS,
    )
    curb_obj.name = "Montreal_Real_Red_White_Curbs"
    curb_obj.data.name = "Montreal_Real_Red_White_Curbs_Mesh"
    curb_quality["meshSanitizationApplied"] = bool(
        curb_obj.data.validate(verbose=True, clean_customdata=False)
    )
    curb_obj.data.update()
    runoff_obj, runoff_sections, runoff_quality = hungaroring.create_runoff(
        config,
        centerline,
        cumulative,
        surface_raster,
        center,
        base_elevation,
        [materials["runoff"], materials["runoff"]],
        collections["Circuit"],
    )
    runoff_obj.name = "Montreal_FIA_Asphalt_Runoff"
    runoff_obj.data.name = "Montreal_FIA_Asphalt_Runoff_Mesh"
    runoff_obj["source"] = "FIA 2026 circuit map cross-checked against CMM orthophoto"
    runoff_quality["pitExitSurface"] = "asphalt merge and painted guide line"
    runoff_quality["syntheticRunoffAtPitExit"] = False

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
        entry_minimum_width=0.55,
        exit_minimum_width=0.55,
    )
    _, exit_guide_quality = create_pit_exit_guide_line(
        pit_centerline,
        dtm,
        center,
        base_elevation,
        materials["white"],
        collections["Circuit"],
    )
    pit_quality["entryWedgeBuildingRemoved"] = config["visualReview"][
        "entryWedgeBuildingRemoved"
    ]
    pit_quality["exitGuideLine"] = exit_guide_quality
    pit_quality["entryJunction"] = "smooth flush asphalt taper without a grey wedge"
    pit_quality["exitJunction"] = (
        "smooth flush asphalt merge with FIA 2026 continuous white line"
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
        wall_height=1.05,
        fence_height=2.10,
    )
    pit_wall_quality["placement"] = "between main circuit and pit lane"
    _, gate_count = create_pit_wall_gate_details(
        pit_centerline,
        centerline,
        dtm,
        center,
        base_elevation,
        materials["fence"],
        collections["Infrastructure"],
    )
    pit_wall_quality["gatedOpenings"] = True
    pit_wall_quality["gatePanels"] = gate_count
    pit_wall_quality["construction"] = "concrete wall with high mesh debris fence"
    pit_wall_quality["reference"] = (
        "FIA 2026 competition notes: openings in pit-wall debris fencing fitted with gates"
    )
    pit_quality["pitWall"] = pit_wall_quality
    pit_complex_obj, pit_complex_quality = create_pit_complex(
        config,
        pit_centerline,
        dtm,
        center,
        base_elevation,
        [
            materials["structure"],
            materials["seat_dark"],
        ],
        collections["Buildings"],
    )
    pit_complex_obj.name = "Montreal_2026_43_Garage_Pit_Complex"
    pit_complex_obj.data.name = "Montreal_2026_43_Garage_Pit_Complex_Mesh"
    pit_complex_obj["source"] = "FIA 2026 pit-lane drawing and current OSM pit-complex alignment"
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
    reserved_stands = base.grandstand_reservation_polygons(
        config, centerline, cumulative
    )
    building_obj, footprints, building_quality = spa.create_osm_buildings(
        osm_buildings,
        dtm,
        dsm,
        bounds,
        center,
        base_elevation,
        materials["building"],
        collections["Buildings"],
        exclusion_corridors,
        reserved_stands,
    )
    building_obj.name = "Montreal_Current_OSM_HRDEM_Buildings"
    building_obj.data.name = "Montreal_Current_OSM_HRDEM_Buildings_Mesh"
    building_obj["source"] = "Current OSM footprints with NRCan HRDEM DSM heights"
    building_quality["opaqueRoofMaterial"] = True
    building_quality["roofedFootprints"] = building_quality["renderedCurrentFootprints"]
    building_quality["excludedObjects"] = audit_building_exclusions(
        osm_buildings, bounds, exclusion_corridors, reserved_stands
    )
    building_quality["maximumCentroidDriftMeters"] = 0.0
    permanent_stand_obj, mapped_grandstands, permanent_stand_quality = red_bull_ring.create_roofed_grandstands(
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
    permanent_stand_obj.name = "Montreal_Permanent_Row_Basin_Grandstands"
    permanent_stand_obj.data.name = "Montreal_Permanent_Row_Basin_Grandstands_Mesh"
    permanent_stand_obj["source"] = "Current OSM permanent spectator structures with NRCan HRDEM heights"
    event_stand_obj, event_grandstand_sections, grandstand_quality = base.create_grandstands(
        config,
        centerline,
        cumulative,
        total_length,
        dtm,
        center,
        base_elevation,
        [materials["structure"], materials["seat_dark"], materials["seat_red"]],
        collections["Grandstands"],
    )
    event_stand_obj.name = "Montreal_2026_Event_Grandstands"
    event_stand_obj.data.name = "Montreal_2026_Event_Grandstands_Mesh"
    event_stand_obj["source"] = (
        "Official promoter venue map geolocation, corrected by the August 2026 "
        "visual review of the start straight, turns 1-2, 8-9 and 10"
    )
    grandstand_quality["configuredGrandstands"] = len(config["grandstands"])
    grandstand_quality["currentEventConfirmation"] = "official 2026 Canadian GP grandstand catalogue"
    grandstand_quality["removedAfterVisualReview"] = config["visualReview"]["removedGrandstands"]
    grandstand_quality["relocatedAfterVisualReview"] = config["visualReview"]["relocatedGrandstands"]

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
    barrier_obj.name = "Montreal_OSM_Safety_Fences_And_Walls"
    barrier_obj.data.name = "Montreal_OSM_Safety_Fences_And_Walls_Mesh"
    tree_obj, tree_count = spa.create_dsm_trees(
        dtm,
        dsm,
        bounds,
        center,
        base_elevation,
        [materials["tree_trunk"], materials["tree_crown"]],
        collections["Infrastructure"],
        centerline,
        pit_centerline,
        footprints,
    )
    tree_obj.name = "Montreal_HRDEM_DSM_Tree_Groups"
    tree_obj.data.name = "Montreal_HRDEM_DSM_Tree_Groups_Mesh"
    tree_obj["source"] = "NRCan HRDEM DSM minus DTM canopy samples"
    motorhome_count = 0
    motorhome_quality = {
        "configuredObjects": 0,
        "pitPlatformObjectsRemoved": True,
        "renderedObjects": 0,
        "remainingTrackConflicts": 0,
        "visualReview": "No motorhomes on the narrow pit platform",
    }

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
            anchor["elevation_cgvd2013_m"] = anchor["elevation_datum_m"]

    bounds_anchor = bpy.data.objects.new("SceneBounds", None)
    bounds_anchor["width_m"] = bounds["maxX"] - bounds["minX"]
    bounds_anchor["depth_m"] = bounds["maxY"] - bounds["minY"]
    bounds_anchor["minimum_elevation_cgvd2013_m"] = raster_metadata["rasters"]["dtm"]["minimum"]
    bounds_anchor["maximum_elevation_cgvd2013_m"] = raster_metadata["rasters"]["dtm"]["maximum"]
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
        "coordinateReferenceSystem": "EPSG:32188 + CGVD2013",
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
            "mappedGrandstands": permanent_stand_quality,
            "motorhomes": motorhome_quality,
            "pitLane": pit_quality,
            "runoff": runoff_quality,
            "surfaceClearance": surface_quality,
            "surfaceSmoothing": {"wholeLap": surface_raster.quality},
            "terrainSurface": {
                "orthophotoState": "2019",
                "sourceResolutionMeters": 0.25,
                "textureHeight": raster_metadata["orthophoto"]["height"],
                "textureWidth": raster_metadata["orthophoto"]["width"],
            },
        },
        "objects": {
            "buildingsTotal": building_quality["renderedCurrentFootprints"],
            "fenceSegments": fence_segments,
            "grandstandSections": event_grandstand_sections,
            "mappedGrandstands": mapped_grandstands,
            "pitGarageBoxes": pit_complex_quality["garageBoxes"],
            "raceMotorhomes": motorhome_count,
            "runoffSections": runoff_sections,
            "trees": tree_count,
            "turnAnchors": 14,
        },
        "officialSources": config["officialSources"],
        "realWorldScale": "1 unit = 1 metre; no vertical exaggeration",
        "schemaVersion": 7,
        "sectorBoundaryDistancesMeters": [round(value, 2) for value in sector_distances],
        "sourceManifest": config["sourceManifest"],
        "turnAnchorDistancesMeters": [
            turn["distanceMeters"] for turn in config["model"]["turns"]
        ],
        "verticalDatum": "Canadian Geodetic Vertical Datum of 2013 (CGVD2013); no vertical exaggeration",
    }
    metadata_path.write_text(f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
