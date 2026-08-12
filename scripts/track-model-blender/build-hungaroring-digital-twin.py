#!/usr/bin/env python3
"""Build the current, real-scale Hungaroring web scene in Blender."""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector, kdtree


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
SPA_PATH = SCRIPT_DIRECTORY / "build-spa-digital-twin.py"
SPA_SPEC = importlib.util.spec_from_file_location("track_spa_digital_twin", SPA_PATH)
spa = importlib.util.module_from_spec(SPA_SPEC)
SPA_SPEC.loader.exec_module(spa)
base = spa.base

SECTOR_COLORS = ((0.86, 0.02, 0.01, 1), (0.98, 0.48, 0.03, 1), (0.02, 0.60, 0.78, 1))
GRAVEL_TURNS = {1, 2, 4, 5, 6, 7, 9, 11, 12, 13, 14}
RUNOFF_SIDES = {1: -1, 2: 1, 3: -1, 4: 1, 5: -1, 6: 1, 7: -1, 8: 1, 9: -1, 10: 1, 11: -1, 12: 1, 13: -1, 14: 1}
PIT_ENTRY_RUNOFF_TURNS = {12, 13, 14}
CURB_WIDTH_METERS = 1.30
CURB_VISIBLE_HEIGHT_METERS = 0.10


def utm34n_from_wgs84(lat, lon):
    semi_major = 6_378_137.0
    flattening = 1 / 298.257223563
    scale = 0.9996
    eccentricity_squared = flattening * (2 - flattening)
    secondary_eccentricity_squared = eccentricity_squared / (1 - eccentricity_squared)
    latitude = math.radians(lat)
    longitude_delta = math.radians(lon - 21)
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


base.rd_from_wgs84 = utm34n_from_wgs84
spa.lambert_2008_from_wgs84 = utm34n_from_wgs84
spa.REPLACED_OSM_BUILDING_IDS = {123_905_481}
spa.REPLACED_OSM_GRANDSTAND_IDS = {230_979_479}
base.TERRAIN_COLUMNS = 101
base.TERRAIN_ROWS = 103
base.TRACK_SURFACE_Z_OFFSET = 0.70
base.PIT_LANE_WIDTH_METERS = 11.0
base.PIT_LANE_TAPER_METERS = 34.0
base.GRANDSTAND_MAX_PLATFORM_STEP_METERS = 1.5
base.TURN_CURB_HALF_SPAN = (52, 48, 42, 50, 46, 44, 44, 44, 46, 44, 52, 50, 52, 58)
base.bank_angle = lambda _distance, _total: (0.0, 0.0)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


class WholeLapSurfaceRaster:
    """Return a smooth upper envelope inside the complete racing corridor."""

    def __init__(self, source, centerline, cumulative, width):
        self.source = source
        self.corridor_half_width = width / 2 + CURB_WIDTH_METERS + 4.0
        self.full_correction_width = width / 2 + CURB_WIDTH_METERS + 1.0
        total = cumulative[-1]
        interval = 3.0
        count = max(3, math.ceil(total / interval))
        self.points = [
            base.sample_polyline(centerline, cumulative, total * index / count)
            for index in range(count)
        ]
        raw_heights = []
        for index, point in enumerate(self.points):
            distance = total * index / count
            tangent = base.sample_tangent(centerline, cumulative, distance)
            normal = Vector((-tangent.y, tangent.x))
            cross_section = [source.sample(*point)]
            for lateral_index in range(-8, 9):
                lateral = lateral_index * width / 16
                x = point[0] + normal.x * lateral
                y = point[1] + normal.y * lateral
                cross_section.append(source.sample_rendered_terrain(x, y))
            raw_heights.append(max(cross_section))

        radius = 10
        smoothed = []
        for index in range(count):
            weighted_sum = 0.0
            total_weight = 0.0
            for offset in range(-radius, radius + 1):
                weight = radius + 1 - abs(offset)
                weighted_sum += raw_heights[(index + offset) % count] * weight
                total_weight += weight
            smoothed.append(weighted_sum / total_weight)

        clearance_lift = max(
            raw - smooth for raw, smooth in zip(raw_heights, smoothed)
        ) + 0.08
        self.targets = [smooth + clearance_lift for smooth in smoothed]
        self.tree = kdtree.KDTree(count)
        for index, point in enumerate(self.points):
            self.tree.insert((point[0], point[1], 0.0), index)
        self.tree.balance()

        raw_steps = [
            abs(raw_heights[(index + 1) % count] - raw_heights[index])
            for index in range(count)
        ]
        smoothed_steps = [
            abs(self.targets[(index + 1) % count] - self.targets[index])
            for index in range(count)
        ]
        corrections = [
            target - raw for target, raw in zip(self.targets, raw_heights)
        ]
        self.quality = {
            "applied": True,
            "intervalMeters": interval,
            "maximumCorrectionMeters": round(max(abs(value) for value in corrections), 3),
            "maximumRawStepMeters": round(max(raw_steps), 3),
            "maximumSmoothedStepMeters": round(max(smoothed_steps), 3),
            "method": "closed-loop upper-envelope smoothing",
            "sampleCount": count,
        }

    def target_at(self, x, y):
        _, nearest_index, _ = self.tree.find((x, y, 0.0))
        best = None
        count = len(self.points)
        for offset in range(-2, 3):
            first_index = (nearest_index + offset) % count
            second_index = (first_index + 1) % count
            first = self.points[first_index]
            second = self.points[second_index]
            dx, dy = second[0] - first[0], second[1] - first[1]
            length_squared = max(dx * dx + dy * dy, 1e-9)
            blend = min(max(((x - first[0]) * dx + (y - first[1]) * dy) / length_squared, 0.0), 1.0)
            projected_x = first[0] + dx * blend
            projected_y = first[1] + dy * blend
            separation = math.hypot(x - projected_x, y - projected_y)
            if best is None or separation < best[0]:
                target = self.targets[first_index] * (1 - blend) + self.targets[second_index] * blend
                best = (separation, target)
        return best

    def corrected_sample(self, x, y, source_value):
        separation, target = self.target_at(x, y)
        if separation >= self.corridor_half_width:
            return source_value
        if separation <= self.full_correction_width:
            return target
        blend = 1 - (
            (separation - self.full_correction_width)
            / (self.corridor_half_width - self.full_correction_width)
        )
        blend = blend * blend * (3 - 2 * blend)
        return source_value * (1 - blend) + target * blend

    def sample(self, x, y):
        return self.corrected_sample(x, y, self.source.sample(x, y))

    def sample_rendered_terrain(self, x, y):
        return self.corrected_sample(x, y, self.source.sample_rendered_terrain(x, y))


def create_edge_lines(centerline, cumulative, total, raster, center, base_elevation, material, collection, track_width):
    builder = base.MeshBuilder()
    count = math.ceil(total / 4.0)
    half_width = track_width / 2
    for index in range(count):
        distance = total * index / count
        following = total * (index + 1) / count
        for side in (-1, 1):
            inner = side * (half_width - 0.30)
            outer = side * (half_width - 0.08)
            builder.add_quad([
                base.road_surface_point(
                    centerline, cumulative, point_distance, offset, raster, center, base_elevation,
                    track_width, z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.035, banked=False,
                )
                for point_distance, offset in (
                    (distance, inner), (following, inner), (following, outer), (distance, outer),
                )
            ])
    return builder.create_object("Track_Edge_Lines", [material], collection)


def create_curbs(config, centerline, cumulative, raster, center, base_elevation, materials, collection):
    builder = base.MeshBuilder()
    track_width = config["model"]["trackWidthMeters"]
    inner_offset = track_width / 2 + 0.08
    outer_offset = inner_offset + CURB_WIDTH_METERS
    section_count = 0
    for turn, span in zip(config["model"]["turns"], base.TURN_CURB_HALF_SPAN):
        distance = turn["distanceMeters"] - span
        end = turn["distanceMeters"] + span
        stripe_index = 0
        while distance < end:
            following = min(distance + 4.0, end)
            for side in (-1, 1):
                offsets = (side * inner_offset, side * outer_offset)
                bottom = [
                    base.road_surface_point(
                        centerline, cumulative, point_distance, offset, raster, center, base_elevation,
                        track_width, z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.025, banked=False,
                    )
                    for point_distance, offset in (
                        (distance, offsets[0]), (following, offsets[0]),
                        (following, offsets[1]), (distance, offsets[1]),
                    )
                ]
                top = [(x, y, z + CURB_VISIBLE_HEIGHT_METERS) for x, y, z in bottom]
                builder.add_quad(top, stripe_index % 2)
                builder.add_quad((bottom[0], bottom[1], top[1], top[0]), stripe_index % 2)
                builder.add_quad((bottom[3], top[3], top[2], bottom[2]), stripe_index % 2)
                section_count += 1
            stripe_index += 1
            distance = following
    obj = builder.create_object("Real_Red_White_Curbs", materials, collection)
    quality = {
        "innerOffsetMeters": round(inner_offset, 3),
        "sections": section_count,
        "visibleHeightMeters": CURB_VISIBLE_HEIGHT_METERS,
        "widthMeters": CURB_WIDTH_METERS,
    }
    return obj, quality


def create_runoff(config, centerline, cumulative, raster, center, base_elevation, materials, collection):
    builder = base.MeshBuilder()
    sections = 0
    for turn in config["model"]["turns"]:
        turn_number = turn["number"]
        if turn_number in PIT_ENTRY_RUNOFF_TURNS:
            continue
        half_span = 62 if turn_number in (1, 4, 11, 12, 14) else 46
        start = turn["distanceMeters"] - half_span
        end = turn["distanceMeters"] + half_span
        side = RUNOFF_SIDES[turn_number]
        distance = start
        while distance < end:
            following = min(distance + 5.0, end)
            quad = [
                base.road_surface_point(
                    centerline,
                    cumulative,
                    point_distance,
                    side * lateral,
                    raster,
                    center,
                    base_elevation,
                    config["model"]["trackWidthMeters"],
                    z_offset=base.TRACK_SURFACE_Z_OFFSET - 0.055,
                    banked=False,
                )
                for point_distance, lateral in (
                    (distance, 7.6),
                    (following, 7.6),
                    (following, 16.5),
                    (distance, 16.5),
                )
            ]
            builder.add_quad(quad, 0 if turn_number in GRAVEL_TURNS else 1)
            sections += 1
            distance = following
    obj = builder.create_object("Hungaroring_FIA_Runoff_And_Gravel", materials, collection)
    obj["source"] = "FIA 2026 circuit map cross-checked against the Hungary 2022 orthophoto"
    return obj, sections, {
        "excludedTurns": sorted(PIT_ENTRY_RUNOFF_TURNS),
        "pitEntrySurface": "asphalt",
        "syntheticGravelAtPitEntry": False,
        "syntheticRunoffAtPitEntry": False,
    }


def create_paddock_motorhomes(config, pit_points, raster, center, base_elevation, material, collection, corridors):
    cumulative, total = base.line_distance(pit_points)
    colors = ["#E7E6E1", "#243A5A", "#B32025", "#D7D7D2", "#1D6B52", "#14181C", "#C3A447", "#E4E3DE", "#A62B2B", "#3D4D65", "#ECEBE7"]
    spacing = 5.7
    centre_distance = total * 0.52
    motorhomes = []
    for index, color in enumerate(colors):
        distance = centre_distance + (index - (len(colors) - 1) / 2) * spacing
        x, y = base.sample_polyline(pit_points, cumulative, distance, closed=False)
        tangent = base.sample_tangent(pit_points, cumulative, distance, closed=False)
        normal = Vector((-tangent.y, tangent.x))
        lateral = -35.0
        # Cab points away from the pit grandstand, leaving the rear toward it.
        heading = math.atan2(-normal.y, -normal.x)
        motorhomes.append({
            "centerRd": {"x": x + normal.x * lateral, "y": y + normal.y * lateral},
            "color": color,
            "headingDeg": math.degrees(heading),
            "lengthMeters": 18.5,
            "name": f"Hungaroring Paddock {index + 1:02d}",
            "widthMeters": 4.5,
        })
    config_with_motorhomes = dict(config)
    config_with_motorhomes["raceMotorhomes"] = motorhomes
    obj, count, quality = base.create_race_motorhomes(
        config_with_motorhomes,
        raster,
        center,
        base_elevation,
        material,
        collection,
        corridors,
    )
    quality.update({
        "behindPitComplex": True,
        "clusterSpanMeters": round((len(colors) - 1) * spacing + 4.5, 3),
        "compactCluster": True,
        "rearTowardPitGrandstand": True,
    })
    return obj, count, quality


def create_osm_trees(tree_data, raster, center, base_elevation, materials, collection, centerline, pit_line):
    builder = base.MeshBuilder()
    count = 0
    for feature in tree_data["elements"]:
        x, y = utm34n_from_wgs84(feature["lat"], feature["lon"])
        if base.distance_to_polyline((x, y), centerline) <= 22 or base.distance_to_polyline((x, y), pit_line) <= 16:
            continue
        local_x, local_y = base.local_xy((x, y), center)
        ground = raster.sample(x, y) - base_elevation
        height = 9.0 + (feature["id"] % 6) * 0.7
        trunk_height = height * 0.32
        radius = height * 0.22
        builder.add_cylinder((local_x, local_y, ground), 0.16, trunk_height, sides=6, material_index=0)
        ring = []
        for index in range(7):
            angle = index / 7 * math.tau
            ring.append((
                local_x + math.cos(angle) * radius,
                local_y + math.sin(angle) * radius,
                ground + trunk_height + height * 0.25,
            ))
        top = (local_x, local_y, ground + height)
        bottom = (local_x, local_y, ground + trunk_height * 0.75)
        for index in range(7):
            following = (index + 1) % 7
            builder.add_triangle((bottom, ring[following], ring[index]), 1)
            builder.add_triangle((ring[index], ring[following], top), 1)
        count += 1
    obj = builder.create_object("Hungaroring_OSM_Mapped_Trees", materials, collection)
    obj["source"] = "Current OpenStreetMap individually mapped trees; deterministic real-metre canopies"
    return obj, count


def configure_scene(bounds, center, base_elevation):
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
        scene.world = bpy.data.worlds.new("Hungaroring_World")
    scene.world.color = (0.025, 0.035, 0.045)
    scene["coordinate_reference_system"] = "EPSG:32634"
    scene["origin_utm34n_x"] = center["x"]
    scene["origin_utm34n_y"] = center["y"]
    scene["origin_dem_z"] = base_elevation
    scene["real_world_scale"] = "1 Blender unit = 1 metre"


def render_preview(preview_path, collection, bounds):
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("HungaroringPreviewCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(bounds["maxX"] - bounds["minX"], bounds["maxY"] - bounds["minY"]) * 1.23
    camera_data.clip_end = 8_000
    camera = bpy.data.objects.new("HungaroringPreviewCamera", camera_data)
    camera.location = (1_450, -1_750, 1_850)
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
    dtm = base.HeightRaster(prepared_directory / "hungary-dtm.f32le", raster_metadata["rasters"]["dtm"], bounds)
    dsm = base.HeightRaster(prepared_directory / "hungary-dsm.f32le", raster_metadata["rasters"]["dsm"], bounds)
    base_elevation = float(raster_metadata["rasters"]["dtm"]["minimum"])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    collections = base.create_collections()
    configure_scene(bounds, center, base_elevation)

    materials = {
        "terrain": base.create_aerial_material(prepared_directory / "hungary-hybrid-ground-2026.jpg"),
        "asphalt": base.create_material("Hungaroring_Real_Asphalt", (0.070, 0.076, 0.082, 1), 0.95),
        "white": base.create_material("Hungaroring_Track_White", (0.94, 0.93, 0.90, 1), 0.82),
        "curb_red": base.create_material("Hungaroring_Curb_Red", (0.71, 0.018, 0.012, 1), 0.84),
        "building": base.create_material("Hungaroring_Current_OSM_Buildings", (1, 1, 1, 1), 0.84, use_vertex_color=True),
        "motorhome": base.create_material("Hungaroring_2026_Race_Motorhomes", (1, 1, 1, 1), 0.64, metallic=0.10, use_vertex_color=True),
        "pit_wall": base.create_material("Hungaroring_Pit_Wall_Concrete", (0.62, 0.63, 0.62, 1), 0.92),
        "fence": base.create_material("Hungaroring_Safety_Fence", (0.40, 0.43, 0.44, 0.64), 0.72, metallic=0.34),
        "tree_trunk": base.create_material("Hungaroring_Tree_Trunks", (0.18, 0.105, 0.055, 1), 1.0),
        "tree_crown": base.create_material("Hungaroring_Tree_Canopies", (0.12, 0.26, 0.095, 1), 1.0),
        "stand_frame": base.create_material("Hungaroring_Grandstand_Frame", (0.19, 0.21, 0.22, 1), 0.58, metallic=0.55),
        "seat_dark": base.create_material("Hungaroring_Grandstand_Seats_Dark", (0.05, 0.06, 0.07, 1), 0.88),
        "seat_red": base.create_material("Hungaroring_Grandstand_Seats_Red", (0.67, 0.02, 0.018, 1), 0.88),
        "structure": base.create_material("Hungaroring_Circuit_Structures", (0.36, 0.38, 0.38, 1), 0.78, metallic=0.12),
        "gantry_light": base.create_material("Hungaroring_Gantry_Lights", (0.88, 0.05, 0.02, 1), 0.34),
        "gravel": base.create_material("Hungaroring_Real_Gravel_Runoff", (0.54, 0.43, 0.29, 1), 1.0),
        "runoff": base.create_material("Hungaroring_Asphalt_Runoff", (0.16, 0.17, 0.18, 1), 0.98),
        "black": base.create_material("Hungaroring_Control_Line_Black", (0.015, 0.015, 0.015, 1), 0.86),
    }
    materials["terrain"].name = "Terrain_Hungaroring_Current_Hybrid_Ground"
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

    terrain = base.add_terrain(bounds, center, dtm, base_elevation, materials["terrain"], collections["Terrain"])
    terrain.name = "Hungary_DEM_Terrain_RealScale"
    terrain.data.name = "Hungary_DEM_Terrain_RealScale_Mesh"
    terrain["source"] = (
        "Open Terrarium elevation; 2022 overview macro-colour with current OSM land-cover and road detail; "
        "no vertical exaggeration"
    )
    osm_data = load_json(source_directory / "openstreetmap-raceway.json")
    source_centerline = base.assemble_main_circuit(osm_data, config["model"]["mainCircuitWayIds"])
    centerline = spa.rotate_closed_polyline(source_centerline, config["model"]["sourceStartFinishOffsetMeters"])
    cumulative, total_length = base.line_distance(centerline)
    surface_raster = WholeLapSurfaceRaster(
        dtm,
        centerline,
        cumulative,
        config["model"]["trackWidthMeters"],
    )
    track, cumulative, total_length, track_samples = base.create_ribbon(
        "FIA_Hungaroring_Centreline_15m",
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
    track["source"] = "Current OSM raceway ring checked against FIA 2026 4.381 km circuit map"
    create_edge_lines(
        centerline, cumulative, total_length, surface_raster, center, base_elevation,
        materials["white"], collections["Circuit"], config["model"]["trackWidthMeters"],
    )
    _, curb_quality = create_curbs(
        config, centerline, cumulative, surface_raster, center, base_elevation,
        [materials["curb_red"], materials["white"]], collections["Circuit"],
    )
    _, runoff_sections, runoff_quality = create_runoff(
        config,
        centerline,
        cumulative,
        surface_raster,
        center,
        base_elevation,
        [materials["gravel"], materials["runoff"]],
        collections["Circuit"],
    )
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
        start_ratio=0.12,
        end_ratio=0.88,
        wall_height=0.48,
        fence_height=0.58,
    )
    pit_wall_quality["placement"] = "between main circuit and pit lane"
    pit_wall_quality["profile"] = "low concrete separator with debris fence"
    pit_quality["pitWall"] = pit_wall_quality
    pit_complex_obj, pit_complex_quality = spa.create_pit_complex(
        config,
        pit_centerline,
        dtm,
        center,
        base_elevation,
        [materials["structure"], materials["seat_dark"], materials["seat_red"]],
        collections["Grandstands"],
    )
    pit_complex_obj.name = "Hungaroring_2026_36_Garage_Pit_Complex_Grandstand"
    pit_complex_obj.data.name = "Hungaroring_2026_36_Garage_Pit_Complex_Grandstand_Mesh"
    pit_complex_obj["source"] = "FIA 2026 pit-lane drawing and current renovated Hungaroring main complex"
    pit_quality["pitComplex"] = pit_complex_quality
    exclusion_corridors = [
        (base.sample_line_points(centerline, cumulative, 4.0), config["model"]["trackWidthMeters"] / 2 + 1.5),
        (
            base.sample_line_points(pit_centerline, base.line_distance(pit_centerline)[0], 4.0, closed=False),
            base.PIT_LANE_WIDTH_METERS / 2 + 1.5,
        ),
    ]
    surface_quality = base.measure_ribbon_terrain_clearance(track_samples, dtm, base_elevation)

    osm_buildings = load_json(source_directory / "openstreetmap-buildings.json")
    reserved_stands = base.grandstand_reservation_polygons(config, centerline, cumulative)
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
        reserved_stands,
    )
    building_obj.name = "Hungaroring_Current_OSM_Buildings"
    building_obj.data.name = "Hungaroring_Current_OSM_Buildings_Mesh"
    building_obj["source"] = "Current OSM footprints; default real-metre heights where DSM is unavailable"
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
    barrier_obj.name = "Hungaroring_OSM_Safety_Fences_And_Walls"
    barrier_obj.data.name = "Hungaroring_OSM_Safety_Fences_And_Walls_Mesh"
    barrier_obj["source"] = "Current OpenStreetMap mapped safety barriers"
    tree_data = load_json(source_directory / "openstreetmap-trees.json")
    _, tree_count = create_osm_trees(
        tree_data,
        dtm,
        center,
        base_elevation,
        [materials["tree_trunk"], materials["tree_crown"]],
        collections["Infrastructure"],
        centerline,
        pit_centerline,
    )
    motorhome_obj, motorhome_count, motorhome_quality = create_paddock_motorhomes(
        config,
        pit_centerline,
        dtm,
        center,
        base_elevation,
        materials["motorhome"],
        collections["Infrastructure"],
        exclusion_corridors,
    )
    motorhome_obj.name = "Hungaroring_2026_Race_Motorhomes"
    motorhome_obj.data.name = "Hungaroring_2026_Race_Motorhomes_Mesh"
    motorhome_obj["source"] = "Current paddock alignment behind the renovated pit complex; real vehicle dimensions"
    motorhome_quality["sourceResolutionMetersPerPixel"] = 0.4
    motorhome_quality.pop("minimumGarageRearClearanceMeters", None)
    grandstand_obj, grandstand_sections, grandstand_quality = base.create_grandstands(
        config,
        centerline,
        cumulative,
        total_length,
        dtm,
        center,
        base_elevation,
        [materials["stand_frame"], materials["seat_dark"], materials["seat_red"]],
        collections["Grandstands"],
    )
    grandstand_obj.name = "Hungaroring_2026_Current_Grandstands"
    grandstand_obj.data.name = "Hungaroring_2026_Current_Grandstands_Mesh"
    grandstand_obj["source"] = "Current 2026 event map and official renovated Hungaroring complex"
    grandstand_quality["sourceMap"] = "Hungaroring 2026 current event map"
    grandstand_quality.pop("verifiedTurnTenZone", None)
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
        centerline, cumulative, total_length, dtm, center, base_elevation, collections["Annotations"]
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
        x, y = base.sample_polyline(centerline, cumulative, min(distance, total_length - 1e-6))
        profile.append({"distanceMeters": round(distance, 2), "elevationMeters": round(dtm.sample(x, y), 3)})
    metadata = {
        "boundsMeters": {
            "depth": bounds["maxY"] - bounds["minY"],
            "width": bounds["maxX"] - bounds["minX"],
        },
        "coordinateReferenceSystem": "EPSG:32634 + source DEM metres",
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
            "terrainSurface": raster_metadata["terrainSurface"],
        },
        "objects": {
            "buildingsTotal": building_quality["renderedCurrentFootprints"],
            "fenceSegments": fence_segments,
            "grandstandSections": grandstand_sections,
            "mappedTrees": tree_count,
            "pitGarageBoxes": pit_complex_quality["garageBoxes"],
            "raceMotorhomes": motorhome_count,
            "runoffSections": runoff_sections,
            "turnAnchors": 14,
        },
        "officialSources": config["officialSources"],
        "realWorldScale": "1 unit = 1 metre; no vertical exaggeration",
        "schemaVersion": 4,
        "sectorBoundaryDistancesMeters": [round(value, 2) for value in sector_distances],
        "sourceManifest": config["sourceManifest"],
        "verticalDatum": "source DEM metres; no vertical exaggeration",
    }
    metadata_path.write_text(f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
