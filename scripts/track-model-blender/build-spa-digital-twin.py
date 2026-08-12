#!/usr/bin/env python3
"""Build a georeferenced, real-scale Spa-Francorchamps web scene in Blender."""

from __future__ import annotations

import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
BASE_PATH = SCRIPT_DIRECTORY / "build-zandvoort-digital-twin.py"
BASE_SPEC = importlib.util.spec_from_file_location("track_digital_twin_base", BASE_PATH)
base = importlib.util.module_from_spec(BASE_SPEC)
BASE_SPEC.loader.exec_module(base)

SECTOR_COLORS = ((0.86, 0.02, 0.01, 1), (0.98, 0.48, 0.03, 1), (0.02, 0.60, 0.78, 1))
TREE_GRID_METERS = 42.0
REPLACED_OSM_BUILDING_IDS = {77_352_246, 77_352_249}
REPLACED_OSM_GRANDSTAND_IDS = {174_882_363}
TURN_17_SMOOTHING_START_METERS = 6_170.0
TURN_17_SMOOTHING_END_METERS = 6_560.0


def lambert_2008_from_wgs84(lat, lon):
    radians = math.pi / 180
    semi_major = 6_378_137.0
    flattening = 1 / 298.257222101
    eccentricity = math.sqrt(2 * flattening - flattening * flattening)
    latitude_origin = 50.797815 * radians
    longitude_origin = 4.359215833333333 * radians
    latitude_first = 49.8333339 * radians
    latitude_second = 51.16666723333333 * radians

    def m(latitude):
        return math.cos(latitude) / math.sqrt(1 - eccentricity**2 * math.sin(latitude) ** 2)

    def t(latitude):
        ratio = (1 - eccentricity * math.sin(latitude)) / (1 + eccentricity * math.sin(latitude))
        return math.tan(math.pi / 4 - latitude / 2) / ratio ** (eccentricity / 2)

    cone = (math.log(m(latitude_first)) - math.log(m(latitude_second))) / (
        math.log(t(latitude_first)) - math.log(t(latitude_second))
    )
    factor = m(latitude_first) / (cone * t(latitude_first) ** cone)
    rho_origin = semi_major * factor * t(latitude_origin) ** cone
    latitude = lat * radians
    longitude = lon * radians
    rho = semi_major * factor * t(latitude) ** cone
    theta = cone * (longitude - longitude_origin)
    return (
        649_328.0 + rho * math.sin(theta),
        665_262.0 + rho_origin - rho * math.cos(theta),
    )


base.rd_from_wgs84 = lambert_2008_from_wgs84
base.TERRAIN_COLUMNS = 176
base.TERRAIN_ROWS = 146
base.TRACK_SURFACE_Z_OFFSET = 0.70
base.PIT_LANE_WIDTH_METERS = 12.0
base.PIT_LANE_TAPER_METERS = 34.0
base.GRANDSTAND_MAX_PLATFORM_STEP_METERS = 1.35
base.TURN_CURB_HALF_SPAN = (55, 46, 46, 50, 70, 50, 58, 65, 52, 86, 74, 62, 55, 58, 64, 72, 84, 58, 58)
base.bank_angle = lambda _distance, _total: (0.0, 0.0)


class CircuitSurfaceRaster:
    """Smooth short DTM artefacts only under the racing surface after turn 17."""

    def __init__(self, source, centerline, cumulative, start, end, width):
        self.source = source
        self.start = start
        self.end = end
        self.corridor_half_width = width / 2 + 10.0
        interval = 4.0
        count = max(2, math.ceil((end - start) / interval))
        distances = [start + (end - start) * index / count for index in range(count + 1)]
        points = []
        raw_heights = []
        for distance in distances:
            point = base.sample_polyline(centerline, cumulative, distance)
            tangent = base.sample_tangent(centerline, cumulative, distance)
            normal = Vector((-tangent.y, tangent.x))
            clearance_samples = [source.sample(*point)]
            for lateral_index in range(-8, 9):
                lateral = lateral_index * width / 16
                x = point[0] + normal.x * lateral
                y = point[1] + normal.y * lateral
                clearance_samples.append(source.sample_rendered_terrain(x, y))
            points.append(point)
            raw_heights.append(max(clearance_samples))

        radius = 14
        corrections = []
        corrected_heights = []
        target_heights = []
        for index, raw_height in enumerate(raw_heights):
            weighted_sum = 0.0
            total_weight = 0.0
            for sample_index in range(max(0, index - radius), min(len(raw_heights), index + radius + 1)):
                weight = radius + 1 - abs(sample_index - index)
                weighted_sum += raw_heights[sample_index] * weight
                total_weight += weight
            smoothed = weighted_sum / total_weight
            smoothed = min(max(smoothed, raw_height), raw_height + 3.5)
            if target_heights:
                smoothed = max(smoothed, target_heights[-1] - 0.04)
            target_heights.append(smoothed)
            edge_blend = min((distances[index] - start) / 42.0, (end - distances[index]) / 42.0, 1.0)
            edge_blend = min(max(edge_blend, 0.0), 1.0)
            edge_blend = edge_blend * edge_blend * (3 - 2 * edge_blend)
            correction = (smoothed - raw_height) * edge_blend
            corrections.append(correction)
            corrected_heights.append(raw_height + correction)

        self.samples = list(zip(points, corrections))
        raw_steps = [abs(second - first) for first, second in zip(raw_heights, raw_heights[1:])]
        corrected_steps = [
            abs(second - first)
            for first, second in zip(corrected_heights, corrected_heights[1:])
        ]
        self.quality = {
            "applied": True,
            "endDistanceMeters": end,
            "maximumCorrectionMeters": round(max(abs(value) for value in corrections), 3),
            "maximumRawStepMeters": round(max(raw_steps, default=0.0), 3),
            "maximumSmoothedStepMeters": round(max(corrected_steps, default=0.0), 3),
            "startDistanceMeters": start,
        }

    def correction_at(self, x, y):
        nearest_distance_squared = math.inf
        nearest_correction = 0.0
        for (sample_x, sample_y), correction in self.samples:
            distance_squared = (x - sample_x) ** 2 + (y - sample_y) ** 2
            if distance_squared < nearest_distance_squared:
                nearest_distance_squared = distance_squared
                nearest_correction = correction
        if nearest_distance_squared > self.corridor_half_width**2:
            return 0.0
        lateral_distance = math.sqrt(nearest_distance_squared)
        full_correction_width = self.corridor_half_width - 9.0
        if lateral_distance <= full_correction_width:
            return nearest_correction
        lateral_blend = 1 - (
            (lateral_distance - full_correction_width)
            / max(self.corridor_half_width - full_correction_width, 0.001)
        )
        lateral_blend = lateral_blend * lateral_blend * (3 - 2 * lateral_blend)
        return nearest_correction * lateral_blend

    def sample(self, x, y):
        return self.source.sample(x, y) + self.correction_at(x, y)

    def sample_rendered_terrain(self, x, y):
        return self.source.sample_rendered_terrain(x, y) + self.correction_at(x, y)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def in_bounds(x, y, bounds, margin=0):
    return (
        bounds["minX"] - margin <= x <= bounds["maxX"] + margin
        and bounds["minY"] - margin <= y <= bounds["maxY"] + margin
    )


def rotate_closed_polyline(points, offset_meters):
    cumulative, total = base.line_distance(points)
    offset = offset_meters % total
    split_index = next(
        (index for index, value in enumerate(cumulative) if value >= offset),
        len(points) - 1,
    )
    split_point = base.sample_polyline(points, cumulative, offset)
    core = points[:-1] if points[0] == points[-1] else points
    rotated = [split_point, *core[split_index:], *core[:split_index], split_point]
    return rotated


def building_polygons(osm_buildings, bounds):
    result = []
    for feature in osm_buildings["elements"]:
        geometry = feature.get("geometry") or []
        if len(geometry) < 3:
            continue
        ring = [lambert_2008_from_wgs84(point["lat"], point["lon"]) for point in geometry]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        if not any(in_bounds(x, y, bounds, margin=20) for x, y in ring):
            continue
        result.append((feature, ring))
    return result


def create_osm_buildings(
    osm_buildings, dtm, dsm, bounds, center, base_elevation,
    material, collection, corridors, reserved_grandstands,
):
    builder = base.MeshBuilder()
    rendered = 0
    excluded_track = 0
    excluded_stands = 0
    footprints = []
    roof_quality = {
        "downwardFacingRoofTriangles": 0,
        "roofTriangles": 0,
        "roofWindingRepairs": 0,
    }
    for feature, ring in building_polygons(osm_buildings, bounds):
        tags = feature.get("tags", {})
        if tags.get("building") == "grandstand":
            continue
        polygon = ring[:-1]
        footprints.append(polygon)
        if feature.get("id") in REPLACED_OSM_BUILDING_IDS:
            continue
        if base.polygon_intersects_corridors(polygon, corridors):
            excluded_track += 1
            continue
        if any(base.polygons_overlap(polygon, stand) for stand in reserved_grandstands):
            excluded_stands += 1
            continue
        explicit_height = parse_height(tags.get("height"))
        volume = base.estimate_polygon_volume(
            [ring], dtm, dsm,
            default_height=explicit_height or 5.5,
            maximum_height=28.0,
        )
        if volume is None:
            continue
        _, ground, sampled_height = volume
        height = explicit_height or sampled_height
        color = building_color(feature["id"], tags.get("building"))
        if base.add_polygon_prism(
            builder,
            [ring],
            center,
            ground - base_elevation,
            ground - base_elevation + height,
            roof_color=color,
            wall_color=base.shade_color(color, 0.66),
            roof_quality=roof_quality,
        ):
            rendered += 1
    obj = builder.create_object(
        "Spa_Current_OSM_DSM_Buildings",
        [material],
        collection,
        vertex_colors=True,
    )
    obj["source"] = "OpenStreetMap current footprints; SPW 2021-2022 DTM/DSM heights"
    return obj, footprints, {
        "excludedGrandstandConflicts": excluded_stands,
        "excludedReplacedCircuitStructures": len(REPLACED_OSM_BUILDING_IDS),
        "excludedTrackConflicts": excluded_track,
        "renderedCurrentFootprints": rendered,
        "remainingGrandstandConflicts": 0,
        "remainingTrackConflicts": 0,
        **roof_quality,
        "sourceCurrentFootprints": len(building_polygons(osm_buildings, bounds)),
    }


def create_mapped_grandstands(osm_buildings, dtm, dsm, bounds, center, base_elevation, material, collection):
    builder = base.MeshBuilder()
    count = 0
    roofed_structures = 0
    wall_color = (0.25, 0.27, 0.28, 1.0)
    roof_color = (0.48, 0.50, 0.49, 1.0)
    roof_edge_color = (0.34, 0.36, 0.36, 1.0)
    roof_quality = {
        "downwardFacingRoofTriangles": 0,
        "roofTriangles": 0,
        "roofWindingRepairs": 0,
    }
    for feature, ring in building_polygons(osm_buildings, bounds):
        if feature.get("tags", {}).get("building") != "grandstand":
            continue
        if feature.get("id") in REPLACED_OSM_GRANDSTAND_IDS:
            continue
        volume = base.estimate_polygon_volume([ring], dtm, dsm, default_height=9.0, maximum_height=18.0)
        if volume is None:
            continue
        _, ground, height = volume
        if base.add_polygon_prism(
            builder,
            [ring],
            center,
            ground - base_elevation,
            ground - base_elevation + max(height, 7.0),
            roof_color=roof_color,
            wall_color=wall_color,
            roof_quality=roof_quality,
        ):
            count += 1
            roof_bottom = ground - base_elevation + max(height, 7.0) + 0.04
            if base.add_polygon_prism(
                builder,
                [ring],
                center,
                roof_bottom,
                roof_bottom + 0.32,
                roof_color=roof_color,
                wall_color=roof_edge_color,
                roof_quality=roof_quality,
            ):
                roofed_structures += 1
    obj = builder.create_object("Spa_Mapped_Roofed_Structures", [material], collection, vertex_colors=True)
    obj["source"] = "Current OSM grandstand footprints cross-checked with the official Spa GP map; neutral covered roofs"
    return obj, count, {
        **roof_quality,
        "redRoofSurfaces": 0,
        "roofedStructures": roofed_structures,
        "roofSlabThicknessMeters": 0.32,
    }


def create_osm_barriers(osm_barriers, raster, bounds, center, base_elevation, material, collection):
    builder = base.MeshBuilder()
    segments = 0
    for feature in osm_barriers["elements"]:
        tags = feature.get("tags", {})
        barrier_type = tags.get("barrier")
        height = 1.1 if barrier_type in ("wall", "retaining_wall") else 2.4
        points = [
            lambert_2008_from_wgs84(point["lat"], point["lon"])
            for point in feature.get("geometry", [])
        ]
        for first, second in zip(points, points[1:]):
            if not (in_bounds(*first, bounds) or in_bounds(*second, bounds)):
                continue
            z1 = raster.sample(*first) - base_elevation + 0.08
            z2 = raster.sample(*second) - base_elevation + 0.08
            builder.add_quad((
                (*base.local_xy(first, center), z1),
                (*base.local_xy(second, center), z2),
                (*base.local_xy(second, center), z2 + height),
                (*base.local_xy(first, center), z1 + height),
            ))
            segments += 1
    obj = builder.create_object("Spa_OSM_Safety_Fences_And_Walls", [material], collection)
    obj["source"] = "Current OpenStreetMap mapped safety barriers"
    return obj, segments


def create_dsm_trees(
    dtm, dsm, bounds, center, base_elevation, materials, collection,
    centerline, pit_line, building_footprints,
):
    builder = base.MeshBuilder()
    count = 0
    x = bounds["minX"] + TREE_GRID_METERS / 2
    while x < bounds["maxX"]:
        y = bounds["minY"] + TREE_GRID_METERS / 2
        while y < bounds["maxY"]:
            ground = dtm.sample(x, y)
            canopy_height = dsm.sample(x, y) - ground
            if (
                5.5 <= canopy_height <= 27
                and base.distance_to_polyline((x, y), centerline) > 28
                and base.distance_to_polyline((x, y), pit_line) > 18
                and not point_in_buildings((x, y), building_footprints)
            ):
                lx, ly = base.local_xy((x, y), center)
                z = ground - base_elevation
                height = min(max(canopy_height, 6.0), 20.0)
                trunk_height = height * 0.30
                radius = min(max(height * 0.20, 1.5), 4.0)
                builder.add_cylinder((lx, ly, z), 0.14, trunk_height, sides=5, material_index=0)
                crown_bottom = z + trunk_height * 0.72
                ring = []
                for index in range(7):
                    angle = index / 7 * math.tau
                    ring.append((lx + math.cos(angle) * radius, ly + math.sin(angle) * radius, crown_bottom + height * 0.28))
                top = (lx, ly, z + height)
                bottom = (lx, ly, crown_bottom)
                for index in range(7):
                    following = (index + 1) % 7
                    builder.add_triangle((bottom, ring[following], ring[index]), 1)
                    builder.add_triangle((ring[index], ring[following], top), 1)
                count += 1
            y += TREE_GRID_METERS
        x += TREE_GRID_METERS
    obj = builder.create_object("Spa_SPW_DSM_Tree_Groups", materials, collection)
    obj["source"] = "SPW 2021-2022 DSM minus DTM canopy samples"
    return obj, count


def create_runoff(config, centerline, cumulative, raster, center, base_elevation, materials, collection):
    builder = base.MeshBuilder()
    gravel_turns = {1, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17}
    pit_entry_turns = {18, 19}
    side_by_turn = {1: -1, 5: 1, 6: -1, 7: 1, 8: -1, 9: 1, 10: -1, 11: -1, 12: 1, 13: -1, 14: 1, 15: -1, 16: 1, 17: 1, 18: -1, 19: 1}
    sections = 0
    for turn in config["model"]["turns"]:
        if turn["number"] in pit_entry_turns:
            continue
        half_span = 72 if turn["number"] in (1, 10, 11, 17, 18, 19) else 48
        start = turn["distanceMeters"] - half_span
        end = turn["distanceMeters"] + half_span
        side = side_by_turn.get(turn["number"], 1)
        distance = start
        while distance < end:
            following = min(distance + 5.0, end)
            quad = [
                base.road_surface_point(
                    centerline, cumulative, point_distance, side * lateral,
                    raster, center, base_elevation, config["model"]["trackWidthMeters"],
                    z_offset=base.TRACK_SURFACE_Z_OFFSET - 0.055,
                    banked=False,
                )
                for point_distance, lateral in (
                    (distance, 6.1), (following, 6.1), (following, 15.5), (distance, 15.5)
                )
            ]
            builder.add_quad(quad, 0 if turn["number"] in gravel_turns else 1)
            sections += 1
            distance = following
    obj = builder.create_object("Spa_Real_Runoff_And_Gravel", materials, collection)
    obj["source"] = "FIA 2026 circuit map and SPW orthophoto cross-check"
    return obj, sections, {
        "pitEntryGroundContext": "orthophoto",
        "pitEntrySurface": "asphalt",
        "pitEntryTurns": sorted(pit_entry_turns),
        "syntheticGravelAtPitEntry": False,
        "syntheticRunoffAtPitEntry": False,
    }


def create_paddock_motorhomes(config, pit_points, raster, center, base_elevation, material, collection, corridors):
    cumulative, total = base.line_distance(pit_points)
    colors = ["#E7E6E1", "#243A5A", "#B32025", "#D7D7D2", "#1D6B52", "#14181C", "#C3A447", "#E4E3DE", "#A62B2B", "#3D4D65", "#ECEBE7"]
    motorhomes = []
    for index, color in enumerate(colors):
        distance = total * (0.25 + index * 0.047)
        x, y = base.sample_polyline(pit_points, cumulative, distance, closed=False)
        tangent = base.sample_tangent(pit_points, cumulative, distance, closed=False)
        normal = Vector((-tangent.y, tangent.x))
        lateral = -36.0 - (index % 2) * 7.0
        motorhomes.append({
            "centerRd": {"x": x + normal.x * lateral, "y": y + normal.y * lateral},
            "color": color,
            "headingDeg": math.degrees(math.atan2(tangent.y, tangent.x)),
            "lengthMeters": 18.5,
            "name": f"Spa Paddock {index + 1:02d}",
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
    obj.name = "SpaGP_2026_Race_Motorhomes"
    obj["source"] = "Current paddock footprint, SPW orthophoto and real vehicle dimensions"
    quality["behindPitComplex"] = True
    quality["minimumGarageRearClearanceMeters"] = 14.0
    return obj, count, quality


def create_pit_complex(
    config, pit_points, raster, center, base_elevation, materials, collection,
):
    builder = base.MeshBuilder()
    cumulative, total = base.line_distance(pit_points)
    garage_boxes = int(config["model"]["pitBoxes"])
    start = total * 0.23
    end = total * 0.78
    front_offset = -(base.PIT_LANE_WIDTH_METERS / 2 + 0.85)
    rear_offset = front_offset - 14.5
    garage_height = 5.2
    grandstand_rows = 10
    bay_length = (end - start) / garage_boxes

    for index in range(garage_boxes):
        section_start = start + index * bay_length + 0.16
        section_end = start + (index + 1) * bay_length - 0.16
        footprint = [
            base.road_surface_point(
                pit_points, cumulative, distance, lateral, raster, center, base_elevation,
                base.PIT_LANE_WIDTH_METERS, z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.04,
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
        roof_height = floor_height + garage_height
        top = [(x, y, roof_height) for x, y, _ in footprint]
        builder.add_volume(bottom, top, material_index=0)

        door_bottom = floor_height + 0.28
        builder.add_quad((
            (footprint[0][0], footprint[0][1], door_bottom),
            (footprint[1][0], footprint[1][1], door_bottom),
            (footprint[1][0], footprint[1][1], floor_height + 4.35),
            (footprint[0][0], footprint[0][1], floor_height + 4.35),
        ), material_index=1)

        for row in range(grandstand_rows):
            row_fraction = (row + 0.5) / grandstand_rows
            row_center = front_offset + (rear_offset - front_offset) * (0.18 + row_fraction * 0.74)
            row_half_depth = 0.36
            row_strip = [
                base.road_surface_point(
                    pit_points, cumulative, distance, lateral, raster, center, base_elevation,
                    base.PIT_LANE_WIDTH_METERS, z_offset=base.TRACK_SURFACE_Z_OFFSET + 0.04,
                    closed=False,
                )
                for distance, lateral in (
                    (section_start, row_center + row_half_depth),
                    (section_end, row_center + row_half_depth),
                    (section_end, row_center - row_half_depth),
                    (section_start, row_center - row_half_depth),
                )
            ]
            row_height = roof_height + 0.5 + row_fraction * 5.2
            row_bottom = [(x, y, row_height - 0.25) for x, y, _ in row_strip]
            row_top = [(x, y, row_height) for x, y, _ in row_strip]
            builder.add_volume(row_bottom, row_top, material_index=2 if row % 3 else 1)

    obj = builder.create_object(
        "Spa_42_Garage_Pit_Complex_Grandstand",
        materials,
        collection,
    )
    obj["source"] = "FIA 2026 42-garage count; current Spa pit-lane and paddock alignment"
    return obj, {
        "buildingDepthMeters": round(abs(rear_offset - front_offset), 2),
        "garageBoxes": garage_boxes,
        "grandstandRows": grandstand_rows,
        "lengthMeters": round(end - start, 2),
        "pitLaneClearanceMeters": round(abs(front_offset) - base.PIT_LANE_WIDTH_METERS / 2, 2),
    }


def parse_height(value):
    if value is None:
        return None
    try:
        return float(str(value).lower().replace("m", "").strip())
    except ValueError:
        return None


def building_color(identifier, building_type):
    palette = {
        "commercial": (0.47, 0.49, 0.48, 1.0),
        "garage": (0.40, 0.43, 0.43, 1.0),
        "garages": (0.40, 0.43, 0.43, 1.0),
        "hotel": (0.48, 0.34, 0.27, 1.0),
        "retail": (0.51, 0.42, 0.34, 1.0),
        "roof": (0.46, 0.47, 0.45, 1.0),
    }
    if building_type in palette:
        return palette[building_type]
    variation = ((int(identifier) * 2_654_435_761) % 23) / 230
    return (0.47 + variation, 0.44 + variation * 0.7, 0.39 + variation * 0.5, 1.0)


def point_in_buildings(point, footprints):
    for polygon in footprints:
        min_x = min(vertex[0] for vertex in polygon)
        max_x = max(vertex[0] for vertex in polygon)
        min_y = min(vertex[1] for vertex in polygon)
        max_y = max(vertex[1] for vertex in polygon)
        if min_x <= point[0] <= max_x and min_y <= point[1] <= max_y and base.point_in_polygon(point, polygon):
            return True
    return False


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
        scene.world = bpy.data.worlds.new("Spa_World")
    scene.world.color = (0.025, 0.035, 0.045)
    scene["coordinate_reference_system"] = "EPSG:3812 + DNG (EPSG:5710)"
    scene["origin_lambert_2008_x"] = center["x"]
    scene["origin_lambert_2008_y"] = center["y"]
    scene["origin_dng_z"] = base_elevation
    scene["real_world_scale"] = "1 Blender unit = 1 metre"


def render_preview(preview_path, collection, bounds):
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("SpaPreviewCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(bounds["maxX"] - bounds["minX"], bounds["maxY"] - bounds["minY"]) * 1.24
    camera_data.clip_end = 12_000
    camera = bpy.data.objects.new("SpaPreviewCamera", camera_data)
    camera.location = (2_900, -3_450, 3_650)
    base.look_at(camera, (0, 0, 35))
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
    dtm = base.HeightRaster(prepared_directory / "wallonia-dtm.f32le", raster_metadata["rasters"]["dtm"], bounds)
    dsm = base.HeightRaster(prepared_directory / "wallonia-dsm.f32le", raster_metadata["rasters"]["dsm"], bounds)
    base_elevation = float(raster_metadata["rasters"]["dtm"]["minimum"])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    collections = base.create_collections()
    configure_scene(bounds, center, base_elevation)

    materials = {
        "terrain": base.create_aerial_material(source_directory / "wallonia-ortho-latest.jpg"),
        "asphalt": base.create_material("Spa_Real_Asphalt", (0.085, 0.092, 0.098, 1), 0.95),
        "white": base.create_material("Spa_Track_White", (0.94, 0.93, 0.90, 1), 0.82),
        "curb_red": base.create_material("Spa_Curb_Red", (0.71, 0.018, 0.012, 1), 0.84),
        "building": base.create_material("Spa_Current_OSM_DSM_Buildings", (1, 1, 1, 1), 0.84, use_vertex_color=True),
        "motorhome": base.create_material("SpaGP_2026_Race_Motorhomes", (1, 1, 1, 1), 0.64, metallic=0.10, use_vertex_color=True),
        "pit_wall": base.create_material("Spa_Pit_Wall_Concrete", (0.62, 0.63, 0.62, 1), 0.92),
        "fence": base.create_material("Spa_Safety_Fence", (0.40, 0.43, 0.44, 0.64), 0.72, metallic=0.34),
        "tree_trunk": base.create_material("Spa_Tree_Trunks", (0.18, 0.105, 0.055, 1), 1.0),
        "tree_crown": base.create_material("Spa_Ardennes_Canopies", (0.12, 0.26, 0.095, 1), 1.0),
        "stand_frame": base.create_material("Spa_Grandstand_Frame", (0.19, 0.21, 0.22, 1), 0.58, metallic=0.55),
        "seat_dark": base.create_material("Spa_Grandstand_Seats_Dark", (0.05, 0.06, 0.07, 1), 0.88),
        "seat_red": base.create_material("Spa_Grandstand_Seats_Red", (0.67, 0.02, 0.018, 1), 0.88),
        "structure": base.create_material("Spa_Circuit_Structures", (0.36, 0.38, 0.38, 1), 0.78, metallic=0.12),
        "gantry_light": base.create_material("Spa_Gantry_Lights", (0.88, 0.05, 0.02, 1), 0.34),
        "gravel": base.create_material("Spa_Real_Gravel_Runoff", (0.54, 0.43, 0.29, 1), 1.0),
        "runoff": base.create_material("Spa_Asphalt_Runoff", (0.16, 0.17, 0.18, 1), 0.98),
        "black": base.create_material("Spa_Control_Line_Black", (0.015, 0.015, 0.015, 1), 0.86),
    }
    materials["terrain"].name = "Terrain_SPW_Orthophoto_2023"
    sector_materials = [base.create_material(f"Sector_{index + 1}", color, 0.68) for index, color in enumerate(SECTOR_COLORS)]
    sector_glow_materials = [
        base.create_material(f"Sector_{index + 1}_Glow", (color[0], color[1], color[2], 0.34), 0.48, emission_strength=1.4)
        for index, color in enumerate(SECTOR_COLORS)
    ]

    terrain = base.add_terrain(bounds, center, dtm, base_elevation, materials["terrain"], collections["Terrain"])
    terrain.name = "SPW_DTM_Terrain_RealScale"
    terrain["source"] = "SPW 2021-2022 DTM 0.5 m + SPW ORTHO_LAST"
    osm_data = load_json(source_directory / "openstreetmap-raceway.json")
    source_centerline = base.assemble_main_circuit(osm_data, config["model"]["mainCircuitWayIds"])
    centerline = rotate_closed_polyline(source_centerline, config["model"]["sourceStartFinishOffsetMeters"])
    cumulative, total_length = base.line_distance(centerline)
    surface_raster = CircuitSurfaceRaster(
        dtm,
        centerline,
        cumulative,
        TURN_17_SMOOTHING_START_METERS,
        TURN_17_SMOOTHING_END_METERS,
        config["model"]["trackWidthMeters"],
    )
    track, cumulative, total_length, track_samples = base.create_ribbon(
        "FIA_Spa_Centreline_12m",
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
    track["source"] = "OpenStreetMap surveyed raceway ways checked against FIA 2026 7.004 km map"
    base.create_edge_lines(centerline, cumulative, total_length, surface_raster, center, base_elevation, materials["white"], collections["Circuit"])
    base.create_curbs(config, centerline, cumulative, total_length, surface_raster, center, base_elevation, [materials["curb_red"], materials["white"]], collections["Circuit"])
    _, runoff_sections, runoff_quality = create_runoff(config, centerline, cumulative, surface_raster, center, base_elevation, [materials["gravel"], materials["runoff"]], collections["Circuit"])
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
        wall_height=0.72,
        fence_height=0.78,
    )
    pit_quality["pitWall"] = pit_wall_quality
    _, pit_complex_quality = create_pit_complex(
        config,
        pit_centerline,
        dtm,
        center,
        base_elevation,
        [materials["structure"], materials["seat_dark"], materials["seat_red"]],
        collections["Grandstands"],
    )
    pit_quality["pitComplex"] = pit_complex_quality
    exclusion_corridors = [
        (base.sample_line_points(centerline, cumulative, 4.0), config["model"]["trackWidthMeters"] / 2 + 1.5),
        (base.sample_line_points(pit_centerline, base.line_distance(pit_centerline)[0], 4.0, closed=False), base.PIT_LANE_WIDTH_METERS / 2 + 1.5),
    ]
    surface_quality = base.measure_ribbon_terrain_clearance(track_samples, dtm, base_elevation)

    osm_buildings = load_json(source_directory / "openstreetmap-buildings.json")
    reserved_stands = base.grandstand_reservation_polygons(config, centerline, cumulative)
    _, footprints, building_quality = create_osm_buildings(
        osm_buildings, dtm, dsm, bounds, center, base_elevation,
        materials["building"], collections["Buildings"], exclusion_corridors, reserved_stands,
    )
    _, mapped_stands, mapped_stand_quality = create_mapped_grandstands(
        osm_buildings, dtm, dsm, bounds, center, base_elevation,
        materials["building"], collections["Grandstands"],
    )
    osm_barriers = load_json(source_directory / "openstreetmap-barriers.json")
    _, fence_segments = create_osm_barriers(
        osm_barriers, dtm, bounds, center, base_elevation,
        materials["fence"], collections["Infrastructure"],
    )
    _, tree_count = create_dsm_trees(
        dtm, dsm, bounds, center, base_elevation,
        [materials["tree_trunk"], materials["tree_crown"]], collections["Infrastructure"],
        centerline, pit_centerline, footprints,
    )
    motorhome_obj, motorhome_count, motorhome_quality = create_paddock_motorhomes(
        config, pit_centerline, dtm, center, base_elevation,
        materials["motorhome"], collections["Infrastructure"], exclusion_corridors,
    )
    grandstand_obj, grandstand_sections, grandstand_quality = base.create_grandstands(
        config, centerline, cumulative, total_length, dtm, center, base_elevation,
        [materials["stand_frame"], materials["seat_dark"], materials["seat_red"]],
        collections["Grandstands"],
    )
    grandstand_obj.name = "SpaGP_2026_Grandstands"
    grandstand_obj["source"] = "Official Spa GP map and current ticket catalogue"
    finish_distance, sector_distances, _, _ = base.create_track_annotations(
        config,
        osm_data,
        centerline,
        cumulative,
        total_length,
        surface_raster,
        center,
        base_elevation,
        [*sector_materials, materials["white"], materials["black"], *sector_glow_materials],
        collections["Annotations"],
    )
    base.create_start_gantry(
        finish_distance, centerline, cumulative, dtm, center, base_elevation,
        [materials["structure"], materials["gantry_light"]], collections["Infrastructure"],
    )
    low, high = base.create_extrema_anchors(
        centerline, cumulative, total_length, dtm, center, base_elevation, collections["Annotations"],
    )
    for name in ("LowPoint", "HighPoint"):
        anchor = bpy.data.objects.get(name)
        if anchor:
            anchor["elevation_dng_m"] = anchor["elevation_datum_m"]

    bounds_anchor = bpy.data.objects.new("SceneBounds", None)
    bounds_anchor["width_m"] = bounds["maxX"] - bounds["minX"]
    bounds_anchor["depth_m"] = bounds["maxY"] - bounds["minY"]
    bounds_anchor["minimum_elevation_dng_m"] = raster_metadata["rasters"]["dtm"]["minimum"]
    bounds_anchor["maximum_elevation_dng_m"] = raster_metadata["rasters"]["dtm"]["maximum"]
    collections["Annotations"].objects.link(bounds_anchor)

    base.add_lighting(collections["Terrain"])
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    render_preview(preview_path, collections["Terrain"], bounds)
    base.export_glb(glb_path)

    profile = []
    for index in range(200):
        distance = total_length * index / 199
        x, y = base.sample_polyline(centerline, cumulative, min(distance, total_length - 1e-6))
        profile.append({"distanceMeters": round(distance, 2), "elevationDngMeters": round(dtm.sample(x, y), 3)})
    metadata = {
        "boundsMeters": {"depth": bounds["maxY"] - bounds["minY"], "width": bounds["maxX"] - bounds["minX"]},
        "coordinateReferenceSystem": "EPSG:3812 + DNG (EPSG:5710)",
        "elevationProfile": profile,
        "elevationsDngMeters": {"high": round(high[0], 3), "low": round(low[0], 3)},
        "finishDistanceMeters": round(finish_distance, 2),
        "generatedWith": f"Blender {bpy.app.version_string}",
        "lapLength": {
            "geometryMeters": round(total_length, 3),
            "officialFiaMeters": config["model"]["lapLengthMeters"],
            "relativeErrorPercent": round(abs(total_length - config["model"]["lapLengthMeters"]) / config["model"]["lapLengthMeters"] * 100, 4),
        },
        "layoutQuality": {
            "buildings": building_quality,
            "grandstands": grandstand_quality,
            "mappedGrandstands": mapped_stand_quality,
            "motorhomes": motorhome_quality,
            "pitLane": pit_quality,
            "runoff": runoff_quality,
            "surfaceSmoothing": {"afterTurn17": surface_raster.quality},
            "surfaceClearance": surface_quality,
        },
        "objects": {
            "buildingsTotal": building_quality["renderedCurrentFootprints"],
            "fenceSegments": fence_segments,
            "grandstandSections": grandstand_sections,
            "mappedGrandstands": mapped_stands,
            "pitGarageBoxes": pit_complex_quality["garageBoxes"],
            "raceMotorhomes": motorhome_count,
            "runoffSections": runoff_sections,
            "trees": tree_count,
            "turnAnchors": 19,
        },
        "realWorldScale": "1 unit = 1 metre; no vertical exaggeration",
        "officialSources": config["officialSources"],
        "schemaVersion": 3,
        "sectorBoundaryDistancesMeters": [round(value, 2) for value in sector_distances],
        "sourceManifest": config["sourceManifest"],
        "verticalDatum": "DNG / EPSG:5710",
    }
    metadata_path.write_text(f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
