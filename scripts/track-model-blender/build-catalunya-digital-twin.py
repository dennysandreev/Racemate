#!/usr/bin/env python3
"""Build the current, real-scale Circuit de Barcelona-Catalunya web scene."""

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


def utm31n_from_wgs84(lat, lon):
    semi_major = 6_378_137.0
    flattening = 1 / 298.257223563
    scale = 0.9996
    eccentricity_squared = flattening * (2 - flattening)
    secondary_eccentricity_squared = eccentricity_squared / (1 - eccentricity_squared)
    latitude = math.radians(lat)
    longitude_delta = math.radians(lon - 3)
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
            meridional_arc + radius * tangent * (
                a**2 / 2 + (5 - t + 9 * c + 4 * c**2) * a**4 / 24
                + (61 - 58 * t + t**2 + 600 * c - 330 * secondary_eccentricity_squared) * a**6 / 720
            )
        ),
    )


base.rd_from_wgs84 = utm31n_from_wgs84
spa.lambert_2008_from_wgs84 = utm31n_from_wgs84
spa.REPLACED_OSM_BUILDING_IDS = {33_742_578}
spa.REPLACED_OSM_GRANDSTAND_IDS = set()
base.TERRAIN_COLUMNS = 180
base.TERRAIN_ROWS = 160
base.TRACK_SURFACE_Z_OFFSET = 0.70
base.PIT_LANE_WIDTH_METERS = 11.0
base.PIT_LANE_TAPER_METERS = 34.0
base.GRANDSTAND_MAX_PLATFORM_STEP_METERS = 1.5
base.TURN_CURB_HALF_SPAN = (58, 42, 70, 56, 48, 38, 44, 38, 58, 72, 36, 46, 50, 64)
base.bank_angle = lambda _distance, _total: (0.0, 0.0)
hung.GRAVEL_TURNS = {1, 3, 4, 5, 7, 9, 10, 12}
hung.RUNOFF_SIDES = {1: -1, 2: 1, 3: 1, 4: -1, 5: 1, 6: -1, 7: 1, 8: -1, 9: -1, 10: 1, 11: -1, 12: -1, 13: 1, 14: 1}
hung.PIT_ENTRY_RUNOFF_TURNS = {13, 14}


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def smooth_closed_line(points):
    core = points[:-1] if math.hypot(points[0][0] - points[-1][0], points[0][1] - points[-1][1]) < 0.05 else points
    smoothed = []
    for index, point in enumerate(core):
        previous = core[(index - 1) % len(core)]
        following = core[(index + 1) % len(core)]
        smoothed.append(((previous[0] + point[0] * 2 + following[0]) / 4, (previous[1] + point[1] * 2 + following[1]) / 4))
    return [*smoothed, smoothed[0]]


def assemble_way_geometry(osm_data, way_ids):
    ways = {element.get("id"): element for element in osm_data["elements"] if element.get("type") == "way"}
    geometry = []
    for way_id in way_ids:
        candidate = list(ways[way_id]["geometry"])
        if geometry:
            previous = utm31n_from_wgs84(geometry[-1]["lat"], geometry[-1]["lon"])
            first = utm31n_from_wgs84(candidate[0]["lat"], candidate[0]["lon"])
            last = utm31n_from_wgs84(candidate[-1]["lat"], candidate[-1]["lon"])
            if math.dist(previous, last) < math.dist(previous, first):
                candidate.reverse()
            if math.dist(previous, utm31n_from_wgs84(candidate[0]["lat"], candidate[0]["lon"])) < 0.5:
                candidate = candidate[1:]
        geometry.extend(candidate)
    return geometry


def assemble_current_circuit(osm_data, main_way_ids, final_sector_way_ids):
    main = base.assemble_main_circuit(osm_data, main_way_ids)
    main_core = main[:-1] if math.dist(main[0], main[-1]) < 0.05 else main
    bypass = [utm31n_from_wgs84(point["lat"], point["lon"]) for point in assemble_way_geometry(osm_data, final_sector_way_ids)]

    def nearest_index(points, target):
        return min(range(len(points)), key=lambda index: math.dist(points[index], target))

    start_index = nearest_index(main_core, bypass[0])
    end_index = nearest_index(main_core, bypass[-1])
    if end_index >= start_index:
        bypass.reverse()
        start_index = nearest_index(main_core, bypass[0])
        end_index = nearest_index(main_core, bypass[-1])
    if end_index >= start_index:
        raise ValueError("Catalunya current final-sector bypass does not cross the main OSM way boundary")
    if math.dist(main_core[start_index], bypass[0]) > 0.5 or math.dist(main_core[end_index], bypass[-1]) > 0.5:
        raise ValueError("Catalunya current final-sector bypass is disconnected from the main circuit")
    return [*main_core[end_index:start_index + 1], *bypass[1:]]


def assemble_pit_way(osm_data, way_ids):
    geometry = assemble_way_geometry(osm_data, way_ids)
    synthetic_id = -2_026_070_1
    return {
        **osm_data,
        "elements": [*osm_data["elements"], {
            "geometry": geometry,
            "id": synthetic_id,
            "tags": {"highway": "raceway", "service": "pit_lane", "source": "assembled current OSM pit entry, lane and exit"},
            "type": "way",
        }],
    }, synthetic_id


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
        scene.world = bpy.data.worlds.new("Catalunya_World")
    scene.world.color = (0.025, 0.035, 0.045)
    scene["coordinate_reference_system"] = "EPSG:25831"
    scene["origin_utm31n_x"] = center["x"]
    scene["origin_utm31n_y"] = center["y"]
    scene["origin_icgc_z"] = base_elevation
    scene["real_world_scale"] = "1 Blender unit = 1 metre"


def render_preview(preview_path, collection, bounds):
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("CatalunyaPreviewCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(bounds["maxX"] - bounds["minX"], bounds["maxY"] - bounds["minY"]) * 1.22
    camera_data.clip_end = 10_000
    camera = bpy.data.objects.new("CatalunyaPreviewCamera", camera_data)
    camera.location = (1_950, -2_250, 2_450)
    base.look_at(camera, (0, 0, 22))
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
    dtm = base.HeightRaster(prepared_directory / "catalunya-dtm.f32le", raster_metadata["rasters"]["dtm"], bounds)
    dsm = base.HeightRaster(prepared_directory / "catalunya-dsm.f32le", raster_metadata["rasters"]["dsm"], bounds)
    base_elevation = float(raster_metadata["rasters"]["dtm"]["minimum"])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    collections = base.create_collections()
    configure_scene(center, base_elevation)
    materials = {
        "terrain": base.create_aerial_material(prepared_directory / "catalunya-orthophoto-2025.jpg"),
        "asphalt": base.create_material("Catalunya_Real_Asphalt", (0.072, 0.078, 0.083, 1), 0.95),
        "white": base.create_material("Catalunya_Track_White", (0.94, 0.93, 0.90, 1), 0.82),
        "curb_red": base.create_material("Catalunya_Curb_Red", (0.71, 0.018, 0.012, 1), 0.84),
        "building": base.create_material("Catalunya_Current_OSM_ICGC_DSM_Buildings", (1, 1, 1, 1), 0.84, use_vertex_color=True),
        "motorhome": base.create_material("Catalunya_2026_Race_Motorhomes", (1, 1, 1, 1), 0.64, metallic=0.10, use_vertex_color=True),
        "pit_wall": base.create_material("Catalunya_Pit_Wall_Concrete", (0.62, 0.63, 0.62, 1), 0.92),
        "fence": base.create_material("Catalunya_Safety_Fence", (0.40, 0.43, 0.44, 0.64), 0.72, metallic=0.34),
        "tree_trunk": base.create_material("Catalunya_Tree_Trunks", (0.18, 0.105, 0.055, 1), 1.0),
        "tree_crown": base.create_material("Catalunya_Tree_Canopies", (0.12, 0.26, 0.095, 1), 1.0),
        "stand_frame": base.create_material("Catalunya_Grandstand_Frame", (0.19, 0.21, 0.22, 1), 0.58, metallic=0.55),
        "seat_dark": base.create_material("Catalunya_Grandstand_Seats_Dark", (0.05, 0.06, 0.07, 1), 0.88),
        "seat_red": base.create_material("Catalunya_Grandstand_Seats_Red", (0.67, 0.02, 0.018, 1), 0.88),
        "structure": base.create_material("Catalunya_Circuit_Structures", (0.36, 0.38, 0.38, 1), 0.78, metallic=0.12),
        "gantry_light": base.create_material("Catalunya_Gantry_Lights", (0.88, 0.05, 0.02, 1), 0.34),
        "gravel": base.create_material("Catalunya_Real_Gravel_Runoff", (0.54, 0.43, 0.29, 1), 1.0),
        "runoff": base.create_material("Catalunya_Asphalt_Runoff", (0.16, 0.17, 0.18, 1), 0.98),
        "black": base.create_material("Catalunya_Control_Line_Black", (0.015, 0.015, 0.015, 1), 0.86),
    }
    materials["terrain"].name = "Terrain_ICGC_Orthophoto_2025"
    sector_materials = [base.create_material(f"Sector_{index + 1}", color, 0.68) for index, color in enumerate(SECTOR_COLORS)]
    sector_glow_materials = [base.create_material(f"Sector_{index + 1}_Glow", (color[0], color[1], color[2], 0.34), 0.48, emission_strength=1.4) for index, color in enumerate(SECTOR_COLORS)]

    terrain = base.add_terrain(bounds, center, dtm, base_elevation, materials["terrain"], collections["Terrain"])
    terrain.name = "ICGC_Catalunya_DTM_Terrain_RealScale"
    terrain.data.name = "ICGC_Catalunya_DTM_Terrain_RealScale_Mesh"
    terrain["source"] = "ICGC territorial DTM and 2025 orthophoto; no vertical exaggeration"
    osm_data = load_json(source_directory / "openstreetmap-raceway.json")
    source_centerline = smooth_closed_line(assemble_current_circuit(
        osm_data,
        config["model"]["mainCircuitWayIds"],
        config["model"]["currentFinalSectorWayIds"],
    ))
    centerline = spa.rotate_closed_polyline(source_centerline, config["model"]["sourceStartFinishOffsetMeters"])
    cumulative, total_length = base.line_distance(centerline)
    surface_raster = hung.WholeLapSurfaceRaster(dtm, centerline, cumulative, config["model"]["trackWidthMeters"])
    track, cumulative, total_length, track_samples = base.create_ribbon(
        "FIA_Catalunya_Centreline_12m", centerline, surface_raster, center, base_elevation,
        config["model"]["trackWidthMeters"], materials["asphalt"], collections["Circuit"],
        z_offset=base.TRACK_SURFACE_Z_OFFSET, banked=False,
    )
    track["source"] = "Current OSM FIA GP circuit with the T13-T14 bypass, smoothed once and checked against the FIA 2026 4.657 km map"
    hung.create_edge_lines(centerline, cumulative, total_length, surface_raster, center, base_elevation, materials["white"], collections["Circuit"], config["model"]["trackWidthMeters"])
    curb_obj, curb_quality = hung.create_curbs(config, centerline, cumulative, surface_raster, center, base_elevation, [materials["curb_red"], materials["white"]], collections["Circuit"])
    curb_obj.name = "Catalunya_Real_Red_White_Curbs"
    curb_obj.data.name = "Catalunya_Real_Red_White_Curbs_Mesh"
    runoff_obj, runoff_sections, runoff_quality = hung.create_runoff(config, centerline, cumulative, surface_raster, center, base_elevation, [materials["gravel"], materials["runoff"]], collections["Circuit"])
    runoff_obj.name = "Catalunya_FIA_Runoff_And_Gravel"
    runoff_obj.data.name = "Catalunya_FIA_Runoff_And_Gravel_Mesh"
    runoff_obj["source"] = "FIA 2026 circuit map cross-checked against ICGC 2025 orthophoto"

    pit_osm, synthetic_pit_id = assemble_pit_way(osm_data, config["model"]["pitLaneWayIds"])
    _, pit_centerline, pit_quality = base.create_pit_lane(
        pit_osm, synthetic_pit_id, centerline, dtm, center, base_elevation, materials,
        collections["Circuit"], pit_boxes=config["model"]["pitBoxes"], entry_minimum_width=4.2,
    )
    pit_quality["sourceWayIds"] = config["model"]["pitLaneWayIds"]
    _, pit_length = base.line_distance(pit_centerline)
    pit_wall_source_length = 475.0
    pit_wall_start = max(0.0, (pit_length - pit_wall_source_length) / 2)
    pit_wall_end = min(pit_length, pit_wall_start + pit_wall_source_length)
    pit_wall_obj, pit_wall_quality = base.create_pit_wall(
        pit_centerline, centerline, dtm, center, base_elevation,
        [materials["pit_wall"], materials["fence"]], collections["Infrastructure"],
        start_ratio=pit_wall_start / pit_length, end_ratio=pit_wall_end / pit_length,
        wall_height=1.05, fence_height=2.25,
    )
    pit_wall_obj["source"] = "Geobrugg Circuit de Barcelona-Catalunya pit-wall debris fence installation, 475 m; aligned to the current OSM pit lane"
    pit_wall_quality["placement"] = "between main circuit and pit lane"
    pit_wall_quality["sourceSystemLengthMeters"] = 475
    pit_wall_quality["sourceUrl"] = "https://www.geobrugg.com/en/Circuit-de-Barcelona-Catalunya-2022-195981.html"
    pit_quality["pitWall"] = pit_wall_quality
    pit_complex_obj, pit_complex_quality = spa.create_pit_complex(
        config, pit_centerline, dtm, center, base_elevation,
        [materials["structure"], materials["seat_dark"], materials["seat_red"]],
        collections["Grandstands"], covered_grandstand=True,
    )
    pit_complex_obj.name = "Catalunya_2026_40_Garage_Pit_Complex_Grandstand"
    pit_complex_obj.data.name = "Catalunya_2026_40_Garage_Pit_Complex_Grandstand_Mesh"
    pit_complex_obj["source"] = "FIA 2026 pit-lane drawing, current OSM pit alignment and official venue map"
    pit_quality["pitComplex"] = pit_complex_quality

    exclusion_corridors = [
        (base.sample_line_points(centerline, cumulative, 4.0), config["model"]["trackWidthMeters"] / 2 + 1.5),
        (base.sample_line_points(pit_centerline, base.line_distance(pit_centerline)[0], 4.0, closed=False), base.PIT_LANE_WIDTH_METERS / 2 + 1.5),
    ]
    surface_quality = base.measure_ribbon_terrain_clearance(track_samples, dtm, base_elevation)
    osm_buildings = load_json(source_directory / "openstreetmap-buildings.json")
    osm_buildings_without_stands = {
        **osm_buildings,
        "elements": [feature for feature in osm_buildings["elements"] if feature.get("tags", {}).get("leisure") != "bleachers"],
    }
    reserved_stands = base.grandstand_reservation_polygons(config, centerline, cumulative)
    building_obj, _, building_quality = spa.create_osm_buildings(
        osm_buildings_without_stands, dtm, dsm, bounds, center, base_elevation,
        materials["building"], collections["Buildings"], exclusion_corridors, reserved_stands,
    )
    building_obj.name = "Catalunya_Current_OSM_ICGC_DSM_Buildings"
    building_obj.data.name = "Catalunya_Current_OSM_ICGC_DSM_Buildings_Mesh"
    building_obj["source"] = "Current OSM footprints; ICGC DTM and sampled 2024 surface heights"
    building_quality["replacedOsmBuildingIds"] = sorted(spa.REPLACED_OSM_BUILDING_IDS)
    barrier_obj, fence_segments = spa.create_osm_barriers(
        load_json(source_directory / "openstreetmap-barriers.json"), dtm, bounds, center,
        base_elevation, materials["fence"], collections["Infrastructure"],
    )
    barrier_obj.name = "Catalunya_OSM_Safety_Fences_And_Walls"
    barrier_obj.data.name = "Catalunya_OSM_Safety_Fences_And_Walls_Mesh"
    tree_obj, tree_count = hung.create_osm_trees(
        load_json(source_directory / "openstreetmap-trees.json"), dtm, center, base_elevation,
        [materials["tree_trunk"], materials["tree_crown"]], collections["Infrastructure"],
        centerline, pit_centerline,
    )
    tree_obj.name = "Catalunya_OSM_Mapped_Trees"
    tree_obj.data.name = "Catalunya_OSM_Mapped_Trees_Mesh"
    motorhome_obj, motorhome_count, motorhome_quality = hung.create_paddock_motorhomes(
        config, pit_centerline, dtm, center, base_elevation, materials["motorhome"],
        collections["Infrastructure"], exclusion_corridors,
    )
    motorhome_obj.name = "Catalunya_2026_Race_Motorhomes"
    motorhome_obj.data.name = "Catalunya_2026_Race_Motorhomes_Mesh"
    motorhome_obj["source"] = "Official paddock zone, current orthophoto alignment and real vehicle dimensions"
    grandstand_obj, grandstand_sections, grandstand_quality = base.create_grandstands(
        config, centerline, cumulative, total_length, dtm, center, base_elevation,
        [materials["stand_frame"], materials["seat_dark"], materials["seat_red"]], collections["Grandstands"],
    )
    grandstand_obj.name = "Catalunya_Current_OSM_Official_Map_Grandstands"
    grandstand_obj.data.name = "Catalunya_Current_OSM_Official_Map_Grandstands_Mesh"
    grandstand_obj["source"] = "Current OSM grandstand footprints cross-checked with the official venue map; real-metre rows and supports"
    grandstand_quality["sourceMap"] = "Circuit de Barcelona-Catalunya official 2026 Formula 1 event map"
    grandstand_quality["excludedCurrentEventStandIds"] = [
        exclusion["osmWayId"] for exclusion in config.get("grandstandExclusions", [])
    ]

    finish_distance, sector_distances, _, _ = base.create_track_annotations(
        config, osm_data, centerline, cumulative, total_length, surface_raster, center, base_elevation,
        [*sector_materials, materials["white"], materials["black"], *sector_glow_materials], collections["Annotations"],
    )
    base.create_start_gantry(finish_distance, centerline, cumulative, surface_raster, center, base_elevation, [materials["structure"], materials["gantry_light"]], collections["Infrastructure"])
    low, high = base.create_extrema_anchors(centerline, cumulative, total_length, surface_raster, center, base_elevation, collections["Annotations"])
    for name in ("LowPoint", "HighPoint"):
        anchor = bpy.data.objects.get(name)
        if anchor:
            anchor["elevation_icgc_m"] = anchor["elevation_datum_m"]
    bounds_anchor = bpy.data.objects.new("SceneBounds", None)
    bounds_anchor["width_m"] = bounds["maxX"] - bounds["minX"]
    bounds_anchor["depth_m"] = bounds["maxY"] - bounds["minY"]
    bounds_anchor["minimum_elevation_icgc_m"] = raster_metadata["rasters"]["dtm"]["minimum"]
    bounds_anchor["maximum_elevation_icgc_m"] = raster_metadata["rasters"]["dtm"]["maximum"]
    collections["Annotations"].objects.link(bounds_anchor)

    base.add_lighting(collections["Terrain"])
    repaired_meshes = sum(1 for mesh in bpy.data.meshes if mesh.validate(clean_customdata=False))
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    render_preview(preview_path, collections["Terrain"], bounds)
    base.export_glb(glb_path)
    profile = []
    for index in range(180):
        distance = total_length * index / 179
        x, y = base.sample_polyline(centerline, cumulative, min(distance, total_length - 1e-6))
        profile.append({"distanceMeters": round(distance, 2), "elevationMeters": round(surface_raster.sample(x, y), 3)})
    metadata = {
        "boundsMeters": {"depth": bounds["maxY"] - bounds["minY"], "width": bounds["maxX"] - bounds["minX"]},
        "coordinateReferenceSystem": "EPSG:25831 + ICGC source elevation metres",
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
            "circuitConfiguration": {
                "currentFinalSectorWayIds": config["model"]["currentFinalSectorWayIds"],
                "deprecatedChicaneExcluded": True,
                "officialFiaLayout": "4.657 km / 14 turns",
            },
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
            "repairedMeshes": repaired_meshes,
            "pitGarageBoxes": pit_complex_quality["garageBoxes"],
            "raceMotorhomes": motorhome_count,
            "runoffSections": runoff_sections,
            "turnAnchors": 14,
        },
        "officialSources": config["officialSources"],
        "realWorldScale": "1 unit = 1 metre; no vertical exaggeration",
        "schemaVersion": 6,
        "sectorBoundaryDistancesMeters": [round(value, 2) for value in sector_distances],
        "sourceManifest": config["sourceManifest"],
        "verticalDatum": "ICGC source elevation metres; no vertical exaggeration",
    }
    metadata_path.write_text(f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
