#!/usr/bin/env python3
"""Build the current, real-scale Circuit de Monaco web scene in Blender."""

from __future__ import annotations

import importlib.util
import json
import math
import shutil
from pathlib import Path

import bpy
from mathutils import Vector, kdtree


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
HUNGARORING_PATH = SCRIPT_DIRECTORY / "build-hungaroring-digital-twin.py"
HUNGARORING_SPEC = importlib.util.spec_from_file_location("track_hungaroring_digital_twin", HUNGARORING_PATH)
hung = importlib.util.module_from_spec(HUNGARORING_SPEC)
HUNGARORING_SPEC.loader.exec_module(hung)
base = hung.base
spa = hung.spa


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def utm32n_from_wgs84(lat, lon):
    semi_major = 6_378_137.0
    flattening = 1 / 298.257223563
    scale = 0.9996
    eccentricity_squared = flattening * (2 - flattening)
    secondary_eccentricity_squared = eccentricity_squared / (1 - eccentricity_squared)
    latitude = math.radians(lat)
    longitude_delta = math.radians(lon - 9)
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


base.rd_from_wgs84 = utm32n_from_wgs84
spa.lambert_2008_from_wgs84 = utm32n_from_wgs84
hung.utm34n_from_wgs84 = utm32n_from_wgs84
base.TERRAIN_COLUMNS = 121
base.TERRAIN_ROWS = 153
base.TRACK_SURFACE_Z_OFFSET = 0.85
base.PIT_LANE_WIDTH_METERS = 9.0
base.PIT_LANE_TAPER_METERS = 26.0
base.GRANDSTAND_MAX_PLATFORM_STEP_METERS = 1.25
base.TURN_CURB_HALF_SPAN = (28, 22, 22, 24, 20, 16, 18, 20, 18, 34, 28, 24, 16, 16, 18, 18, 16, 20, 24)
base.bank_angle = lambda _distance, _total: (0.0, 0.0)
hung.CURB_WIDTH_METERS = 0.95
hung.CURB_VISIBLE_HEIGHT_METERS = 0.075


class MonacoSurfaceRaster(hung.WholeLapSurfaceRaster):
    """Smooth the road independently from the hillside above the tunnel."""

    def __init__(self, source, centerline, cumulative, width):
        self.source = source
        self.corridor_half_width = width / 2 + hung.CURB_WIDTH_METERS + 4.0
        self.full_correction_width = width / 2 + hung.CURB_WIDTH_METERS + 1.0
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
                cross_section.append(source.sample_rendered_terrain(
                    point[0] + normal.x * lateral,
                    point[1] + normal.y * lateral,
                ))
            raw_heights.append(max(cross_section))

        start = 1_390.0
        physical_tunnel_end = 1_855.0
        end = 2_115.0
        transition = 45.0
        start_point = base.sample_polyline(centerline, cumulative, start)
        end_point = base.sample_polyline(centerline, cumulative, end)
        start_height = source.sample(*start_point) + 0.15
        end_height = source.sample(*end_point) + 0.15
        profile_heights = list(raw_heights)
        terrain_decoupling = []
        for index, raw in enumerate(raw_heights):
            distance = total * index / count
            if not start - transition <= distance <= end + transition:
                continue
            progress = min(max((distance - start) / (end - start), 0.0), 1.0)
            tunnel_target = start_height * (1 - progress) + end_height * progress
            edge_blend = min(max((distance - (start - transition)) / transition, 0.0), 1.0)
            edge_blend *= min(max(((end + transition) - distance) / transition, 0.0), 1.0)
            edge_blend = edge_blend * edge_blend * (3 - 2 * edge_blend)
            profile_heights[index] = raw * (1 - edge_blend) + tunnel_target * edge_blend
            terrain_decoupling.append(profile_heights[index] - raw)

        radius = 10
        smoothed = []
        for index in range(count):
            weighted_sum = 0.0
            total_weight = 0.0
            for offset in range(-radius, radius + 1):
                weight = radius + 1 - abs(offset)
                weighted_sum += profile_heights[(index + offset) % count] * weight
                total_weight += weight
            smoothed.append(weighted_sum / total_weight)

        required_clearance = []
        for index, (raw, smooth) in enumerate(zip(profile_heights, smoothed)):
            distance = total * index / count
            if start - transition <= distance <= end + transition:
                required_clearance.append(0.15)
            else:
                required_clearance.append(max(0.15, raw - smooth + 0.15))
        correction_radius = 10
        local_lifts = [
            max(required_clearance[(index + offset) % count] for offset in range(-correction_radius, correction_radius + 1))
            for index in range(count)
        ]
        self.targets = [smooth + lift for smooth, lift in zip(smoothed, local_lifts)]
        for index in range(count):
            distance = total * index / count
            if start <= distance <= end:
                progress = (distance - start) / (end - start)
                self.targets[index] = start_height * (1 - progress) + end_height * progress

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
        outside_corrections = [
            target - raw
            for index, (target, raw) in enumerate(zip(self.targets, raw_heights))
            if not start - transition <= total * index / count <= end + transition
        ]
        self.quality = {
            "applied": True,
            "intervalMeters": interval,
            "maximumCorrectionMeters": round(max(abs(value) for value in outside_corrections), 3),
            "maximumRawStepMeters": round(max(raw_steps), 3),
            "maximumSmoothedStepMeters": round(max(smoothed_steps), 3),
            "method": "closed-loop upper-envelope smoothing with terrain-independent tunnel profile",
            "sampleCount": count,
            "tunnelProfile": {
                "endDistanceMeters": end,
                "endElevationMeters": round(end_height, 3),
                "maximumTerrainDecouplingMeters": round(max(abs(value) for value in terrain_decoupling), 3),
                "physicalTunnelEndDistanceMeters": physical_tunnel_end,
                "startDistanceMeters": start,
                "startElevationMeters": round(start_height, 3),
                "transitionMeters": transition,
            },
        }


hung.WholeLapSurfaceRaster = MonacoSurfaceRaster


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
        scene.world = bpy.data.worlds.new("Monaco_World")
    scene.world.color = (0.022, 0.033, 0.047)
    scene["coordinate_reference_system"] = "EPSG:32632"
    scene["origin_utm32n_x"] = center["x"]
    scene["origin_utm32n_y"] = center["y"]
    scene["origin_dem_z"] = base_elevation
    scene["real_world_scale"] = "1 Blender unit = 1 metre"


def render_preview(preview_path, collection, bounds):
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("MonacoPreviewCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(
        bounds["maxX"] - bounds["minX"], bounds["maxY"] - bounds["minY"]
    ) * 1.18
    camera_data.clip_end = 8_000
    camera = bpy.data.objects.new("MonacoPreviewCamera", camera_data)
    camera.location = (1_180, -1_420, 1_620)
    base.look_at(camera, (0, 0, 24))
    collection.objects.link(camera)
    scene.camera = camera
    scene.render.filepath = str(preview_path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(camera_data)


def parse_height(value):
    if value is None:
        return None
    try:
        return float(str(value).split(";")[0].replace("m", "").strip())
    except ValueError:
        return None


def polygon_area(ring):
    return abs(sum(
        first[0] * second[1] - second[0] * first[1]
        for first, second in zip(ring, ring[1:] + ring[:1])
    )) / 2


def monaco_building_height(feature, ring):
    tags = feature.get("tags", {})
    explicit = parse_height(tags.get("height"))
    if explicit is not None:
        return min(max(explicit, 2.8), 95.0)
    levels = parse_height(tags.get("building:levels"))
    if levels is not None:
        return min(max(levels * 3.05 + 0.8, 3.4), 95.0)
    building_type = tags.get("building", "yes")
    defaults = {
        "apartments": 24.0,
        "commercial": 15.0,
        "hotel": 26.0,
        "office": 19.0,
        "public": 15.0,
        "retail": 10.0,
        "residential": 18.0,
        "school": 11.0,
        "yes": 14.0,
    }
    area = polygon_area(ring)
    deterministic_variation = (int(feature.get("id", 0)) % 7) * 0.9
    return min(defaults.get(building_type, 11.0) + deterministic_variation + min(area / 900, 8), 55.0)


def create_monaco_buildings(
    osm_buildings, dtm, _dsm, bounds, center, base_elevation,
    material, collection, corridors, reserved_grandstand_polygons=(),
):
    builder = base.MeshBuilder()
    footprints = []
    excluded_track = 0
    excluded_stands = 0
    rendered = 0
    heights = []
    roof_quality = {
        "downwardFacingRoofTriangles": 0,
        "roofTriangles": 0,
        "roofWindingRepairs": 0,
    }
    for feature, source_ring in spa.building_polygons(osm_buildings, bounds):
        ring = source_ring
        if len(ring) > 48:
            stride = math.ceil(len(ring) / 48)
            ring = ring[::stride]
        if len(ring) < 3 or polygon_area(ring) < 16:
            continue
        if base.polygon_intersects_corridors(ring, corridors):
            excluded_track += 1
            continue
        if any(base.polygons_overlap(ring, stand) for stand in reserved_grandstand_polygons):
            excluded_stands += 1
            continue
        samples = [dtm.sample(*point) for point in ring]
        ground = sorted(samples)[len(samples) // 2]
        height = monaco_building_height(feature, ring)
        color_index = int(feature.get("id", 0)) % 5
        roof_palette = (
            (0.62, 0.60, 0.56, 1.0),
            (0.72, 0.70, 0.66, 1.0),
            (0.48, 0.50, 0.50, 1.0),
            (0.66, 0.58, 0.50, 1.0),
            (0.56, 0.58, 0.61, 1.0),
        )
        roof_color = roof_palette[color_index]
        wall_color = tuple(max(channel * 0.74, 0.16) for channel in roof_color[:3]) + (1.0,)
        if base.add_polygon_prism(
            builder,
            [ring],
            center,
            ground - base_elevation,
            ground - base_elevation + height,
            roof_color=roof_color,
            wall_color=wall_color,
            roof_quality=roof_quality,
        ):
            footprints.append(ring)
            heights.append(height)
            rendered += 1
    obj = builder.create_object(
        "Monaco_Current_OSM_Buildings",
        [material],
        collection,
        vertex_colors=True,
    )
    obj["source"] = "Current OSM footprints and tagged real-metre heights; deterministic type fallback"
    return obj, footprints, {
        "excludedGrandstandConflicts": excluded_stands,
        "excludedTrackConflicts": excluded_track,
        "maximumHeightMeters": round(max(heights, default=0), 3),
        "opaqueRoofMaterial": True,
        "remainingGrandstandConflicts": 0,
        "remainingTrackConflicts": 0,
        "renderedCurrentFootprints": rendered,
        "roofedFootprints": rendered,
        "sourceCurrentFootprints": len(spa.building_polygons(osm_buildings, bounds)),
        **roof_quality,
    }


def create_monaco_runoff(config, centerline, cumulative, raster, center, base_elevation, materials, collection):
    builder = base.MeshBuilder()
    sides = {1: -1, 10: 1, 11: -1, 15: 1, 16: -1}
    sections = 0
    for turn in config["model"]["turns"]:
        side = sides.get(turn["number"])
        if side is None:
            continue
        half_span = 34 if turn["number"] in (1, 10, 11) else 22
        distance = turn["distanceMeters"] - half_span
        end = turn["distanceMeters"] + half_span
        while distance < end:
            following = min(distance + 4.0, end)
            quad = [
                base.road_surface_point(
                    centerline, cumulative, point_distance, side * lateral,
                    raster, center, base_elevation, config["model"]["trackWidthMeters"],
                    z_offset=base.TRACK_SURFACE_Z_OFFSET - 0.035, banked=False,
                )
                for point_distance, lateral in (
                    (distance, 4.7), (following, 4.7), (following, 9.2), (distance, 9.2)
                )
            ]
            builder.add_quad(quad, 1)
            sections += 1
            distance = following
    obj = builder.create_object("Monaco_FIA_Asphalt_Runoff", materials, collection)
    obj["source"] = "FIA 2026 circuit map and official Monaco orthophoto"
    return obj, sections, {
        "asphaltOnlyStreetCircuit": True,
        "modelledTurns": sorted(sides),
        "syntheticGravelAtPitEntry": False,
    }


def create_tunnel_shell(config, centerline, cumulative, raster, center, base_elevation, collection):
    material = base.create_material("Monaco_Tunnel_Concrete", (0.13, 0.15, 0.17, 1), 0.96)
    builder = base.MeshBuilder()
    start = config["model"]["tunnel"]["startDistanceMeters"]
    end = config["model"]["tunnel"]["endDistanceMeters"]
    distance = start
    sections = 0
    while distance < end:
        following = min(distance + 5.0, end)
        samples = []
        for point_distance in (distance, following):
            point = base.sample_polyline(centerline, cumulative, point_distance)
            tangent = base.sample_tangent(centerline, cumulative, point_distance)
            normal = Vector((-tangent.y, tangent.x))
            roof_height = raster.sample(*point) - base_elevation + 8.2
            samples.append((point, normal, roof_height))
        first, second = samples
        corners = []
        for point, normal, roof_height in (first, second):
            corners.append((
                *base.local_xy((point[0] + normal.x * 7.2, point[1] + normal.y * 7.2), center),
                roof_height,
            ))
            corners.append((
                *base.local_xy((point[0] - normal.x * 7.2, point[1] - normal.y * 7.2), center),
                roof_height,
            ))
        builder.add_quad((corners[0], corners[2], corners[3], corners[1]))
        for side, indices in ((1, (0, 2)), (-1, (1, 3))):
            upper_first = corners[indices[0]]
            upper_second = corners[indices[1]]
            lower = []
            for point, normal in ((first[0], first[1]), (second[0], second[1])):
                ground_x = point[0] + normal.x * side * 7.2
                ground_y = point[1] + normal.y * side * 7.2
                ground = raster.sample(ground_x, ground_y) - base_elevation + 0.2
                lower.append((*base.local_xy((ground_x, ground_y), center), ground))
            lower_first, lower_second = lower
            builder.add_quad((lower_first, lower_second, upper_second, upper_first))
        sections += 1
        distance = following
    obj = builder.create_object("Monaco_Tunnel_Shell", [material], collection)
    obj["source"] = "Current OSM tunnel extent, checked against FIA 2026 circuit map"
    obj["length_m"] = end - start
    return obj, {"lengthMeters": end - start, "roofed": True, "sections": sections}


def rename_scene_data():
    replacements = {
        "Hungaroring": "Monaco",
        "Hungary": "Monaco",
        "Real_Gravel_Runoff": "Asphalt_Runoff",
    }
    for collection in (bpy.data.objects, bpy.data.meshes, bpy.data.materials):
        for item in collection:
            name = item.name
            for before, after in replacements.items():
                name = name.replace(before, after)
            item.name = name
    exact_objects = {
        "FIA_Monaco_Centreline_15m": "FIA_Monaco_Centreline_9m",
        "Monaco_2026_36_Garage_Pit_Complex_Grandstand": "Monaco_2026_11_Team_Pit_Complex",
        "Monaco_2026_Current_Grandstands": "Monaco_2026_Current_Grandstands",
    }
    for old_name, new_name in exact_objects.items():
        obj = bpy.data.objects.get(old_name)
        if obj:
            obj.name = new_name
            if obj.data:
                obj.data.name = f"{new_name}_Mesh"
    material_names = {
        "Terrain_Monaco_Current_Hybrid_Ground": "Terrain_Monaco_Government_Orthophoto_2020",
        "Monaco_Real_Asphalt": "Monaco_Street_Circuit_Asphalt",
        "Monaco_Current_OSM_Buildings": "Monaco_Current_OSM_Buildings",
        "Monaco_2026_Race_Motorhomes": "Monaco_2026_Race_Motorhomes",
        "Monaco_Pit_Wall_Concrete": "Monaco_Pit_Wall_Concrete",
    }
    for old_name, new_name in material_names.items():
        material = bpy.data.materials.get(old_name)
        if material:
            material.name = new_name


def road_elevation_profile(surface, centerline, cumulative, total):
    profile = []
    for index in range(180):
        distance = total * index / 179
        point = base.sample_polyline(centerline, cumulative, min(distance, total - 1e-6))
        profile.append({
            "distanceMeters": round(distance, 2),
            "elevationMeters": round(surface.sample(*point), 3),
        })
    return profile


def tunnel_aware_clearance(surface, source, centerline, cumulative, total, track_width):
    minimum_outside = math.inf
    outside_breakthroughs = 0
    underground_tunnel_samples = 0
    exclusion_start = 1_345.0
    exclusion_end = 2_160.0
    for index in range(900):
        distance = total * index / 900
        point = base.sample_polyline(centerline, cumulative, distance)
        tangent = base.sample_tangent(centerline, cumulative, distance)
        normal = Vector((-tangent.y, tangent.x))
        for lateral in (-track_width / 2, 0.0, track_width / 2):
            x = point[0] + normal.x * lateral
            y = point[1] + normal.y * lateral
            clearance = surface.sample(x, y) + base.TRACK_SURFACE_Z_OFFSET - source.sample_rendered_terrain(x, y)
            if exclusion_start <= distance <= exclusion_end:
                if clearance < 0.03:
                    underground_tunnel_samples += 1
                continue
            minimum_outside = min(minimum_outside, clearance)
            if clearance < 0.03:
                outside_breakthroughs += 1
    return {
        "minimumTrackTerrainClearanceMeters": round(minimum_outside, 3),
        "terrainBreakthroughSamples": outside_breakthroughs,
        "tunnelExcludedFromTerrainClearance": True,
        "tunnelUndergroundSamples": underground_tunnel_samples,
    }


def reposition_extrema(profile, centerline, cumulative, center, base_elevation):
    low = min(profile, key=lambda sample: sample["elevationMeters"])
    high = max(profile, key=lambda sample: sample["elevationMeters"])
    for name, sample in (("LowPoint", low), ("HighPoint", high)):
        point = base.sample_polyline(centerline, cumulative, sample["distanceMeters"])
        anchor = bpy.data.objects.get(name)
        if anchor:
            anchor.location = (
                *base.local_xy(point, center),
                sample["elevationMeters"] - base_elevation + 7,
            )
            anchor["distance_m"] = sample["distanceMeters"]
            anchor["elevation_datum_m"] = sample["elevationMeters"]


def patch_metadata(metadata_path, config, tunnel_quality, profile, surface_quality, surface_clearance):
    metadata = load_json(metadata_path)
    elevations = [sample["elevationMeters"] for sample in profile]
    metadata.update({
        "coordinateReferenceSystem": "EPSG:32632 + source DEM metres",
        "elevationProfile": profile,
        "elevationsMeters": {"high": max(elevations), "low": min(elevations)},
        "officialSources": config["officialSources"],
        "realWorldScale": "1 unit = 1 metre; no vertical exaggeration",
        "schemaVersion": 5,
        "sourceManifest": config["sourceManifest"],
        "turnAnchorDistancesMeters": [turn["distanceMeters"] for turn in config["model"]["turns"]],
        "verticalDatum": "source DEM metres; no vertical exaggeration",
    })
    metadata["objects"]["mappedGrandstands"] = len(config["grandstands"])
    metadata["objects"]["turnAnchors"] = 19
    metadata["objects"]["tunnelShells"] = 1
    metadata["layoutQuality"]["tunnel"] = tunnel_quality
    metadata["layoutQuality"]["surfaceSmoothing"] = {"wholeLap": surface_quality}
    metadata["layoutQuality"]["surfaceClearance"] = surface_clearance
    metadata["layoutQuality"]["grandstands"].update({
        "currentEventConfirmation": "official ACM Formula 1 2026 grandstand inventory",
        "mappedGroups": len(config["grandstands"]),
        "sourceMap": "Automobile Club de Monaco Formula 1 2026",
    })
    metadata["layoutQuality"]["pitLane"]["officialTeamGarageCount"] = 11
    metadata_path.write_text(f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8")


def main():
    args = base.parse_args()
    prepared_directory = Path(args.prepared).resolve()
    config = load_json(Path(args.input).resolve())
    metadata_path = Path(args.metadata).resolve()
    preview_path = Path(args.preview).resolve()
    glb_path = Path(args.glb).resolve()

    shutil.copyfile(prepared_directory / "monaco-dtm.f32le", prepared_directory / "hungary-dtm.f32le")
    shutil.copyfile(prepared_directory / "monaco-dsm.f32le", prepared_directory / "hungary-dsm.f32le")
    shutil.copyfile(
        prepared_directory / "monaco-government-orthophoto.jpg",
        prepared_directory / "hungary-hybrid-ground-2026.jpg",
    )

    original_pit_complex = spa.create_pit_complex
    spa.create_pit_complex = lambda *values, **keywords: original_pit_complex(
        *values, **keywords, covered_grandstand=True
    )
    spa.create_osm_buildings = create_monaco_buildings
    hung.create_runoff = create_monaco_runoff
    hung.configure_scene = configure_scene
    hung.render_preview = render_preview
    hung.main()

    bounds = config["model"]["bounds"]
    center = config["model"]["center"]
    raster_metadata = load_json(prepared_directory / "raster-metadata.json")
    dtm = base.HeightRaster(
        prepared_directory / "monaco-dtm.f32le",
        raster_metadata["rasters"]["dtm"],
        bounds,
    )
    base_elevation = float(raster_metadata["rasters"]["dtm"]["minimum"])
    osm = load_json(Path(config["sourceDirectory"]) / "openstreetmap-raceway.json")
    source_centerline = base.assemble_main_circuit(osm, config["model"]["mainCircuitWayIds"])
    centerline = spa.rotate_closed_polyline(source_centerline, config["model"]["sourceStartFinishOffsetMeters"])
    cumulative, total = base.line_distance(centerline)
    surface = MonacoSurfaceRaster(
        dtm, centerline, cumulative, config["model"]["trackWidthMeters"]
    )
    profile = road_elevation_profile(surface, centerline, cumulative, total)
    surface_clearance = tunnel_aware_clearance(
        surface, dtm, centerline, cumulative, total, config["model"]["trackWidthMeters"]
    )
    reposition_extrema(profile, centerline, cumulative, center, base_elevation)
    _, tunnel_quality = create_tunnel_shell(
        config, centerline, cumulative, surface, center, base_elevation,
        bpy.data.collections["Infrastructure"],
    )
    rename_scene_data()
    render_preview(preview_path, bpy.data.collections["Terrain"], bounds)
    base.export_glb(glb_path)
    patch_metadata(
        metadata_path, config, tunnel_quality, profile, surface.quality, surface_clearance
    )
    print(metadata_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
