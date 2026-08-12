#!/usr/bin/env python3
"""Build a georeferenced, real-scale Circuit Zandvoort web scene in Blender."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from array import array
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Vector
from mathutils.geometry import tessellate_polygon


SECTOR_COLORS = ((0.86, 0.02, 0.01, 1), (0.98, 0.48, 0.03, 1), (0.02, 0.60, 0.78, 1))
TURN_CURB_HALF_SPAN = (70, 40, 70, 48, 44, 58, 82, 62, 58, 74, 52, 46, 56, 100)
TRACK_SURFACE_Z_OFFSET = 0.26
TERRAIN_COLUMNS = 194
TERRAIN_ROWS = 176
PIT_LANE_WIDTH_METERS = 11.5
PIT_LANE_TAPER_METERS = 32.0
GRANDSTAND_SECTION_LENGTH_METERS = 18.0
GRANDSTAND_TRACK_CLEARANCE_METERS = 2.5
GRANDSTAND_MAX_PLATFORM_STEP_METERS = 0.45


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--prepared", required=True)
    parser.add_argument("--glb", required=True)
    parser.add_argument("--preview", required=True)
    parser.add_argument("--metadata", required=True)
    return parser.parse_args(args)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


class HeightRaster:
    def __init__(self, path: Path, metadata: dict, bounds: dict):
        self.width = int(metadata["width"])
        self.height = int(metadata["height"])
        self.fallback = float(metadata["mean"])
        self.bounds = bounds
        self.values = array("f")
        with path.open("rb") as handle:
            self.values.fromfile(handle, self.width * self.height)
        if sys.byteorder != "little":
            self.values.byteswap()

    def sample(self, x: float, y: float) -> float:
        fx = (x - self.bounds["minX"]) / (self.bounds["maxX"] - self.bounds["minX"]) * (self.width - 1)
        fy = (self.bounds["maxY"] - y) / (self.bounds["maxY"] - self.bounds["minY"]) * (self.height - 1)
        fx = min(max(fx, 0.0), self.width - 1.0)
        fy = min(max(fy, 0.0), self.height - 1.0)
        x0, y0 = int(math.floor(fx)), int(math.floor(fy))
        x1, y1 = min(x0 + 1, self.width - 1), min(y0 + 1, self.height - 1)
        tx, ty = fx - x0, fy - y0
        samples = (
            (self.values[y0 * self.width + x0], (1 - tx) * (1 - ty)),
            (self.values[y0 * self.width + x1], tx * (1 - ty)),
            (self.values[y1 * self.width + x0], (1 - tx) * ty),
            (self.values[y1 * self.width + x1], tx * ty),
        )
        weighted = [(value, weight) for value, weight in samples if math.isfinite(value) and weight > 1e-12]
        if not weighted:
            nearest_x, nearest_y = int(round(fx)), int(round(fy))
            for radius in range(1, 9):
                for sample_y in range(max(0, nearest_y - radius), min(self.height, nearest_y + radius + 1)):
                    for sample_x in range(max(0, nearest_x - radius), min(self.width, nearest_x + radius + 1)):
                        value = self.values[sample_y * self.width + sample_x]
                        if math.isfinite(value):
                            return value
            return self.fallback
        total_weight = sum(weight for _, weight in weighted)
        return sum(value * weight for value, weight in weighted) / total_weight

    def sample_rendered_terrain(self, x: float, y: float) -> float:
        column_position = (x - self.bounds["minX"]) / (self.bounds["maxX"] - self.bounds["minX"]) * (TERRAIN_COLUMNS - 1)
        row_position = (y - self.bounds["minY"]) / (self.bounds["maxY"] - self.bounds["minY"]) * (TERRAIN_ROWS - 1)
        column = min(max(int(math.floor(column_position)), 0), TERRAIN_COLUMNS - 2)
        row = min(max(int(math.floor(row_position)), 0), TERRAIN_ROWS - 2)
        tx = min(max(column_position - column, 0.0), 1.0)
        ty = min(max(row_position - row, 0.0), 1.0)
        x0 = self.bounds["minX"] + (self.bounds["maxX"] - self.bounds["minX"]) * column / (TERRAIN_COLUMNS - 1)
        x1 = self.bounds["minX"] + (self.bounds["maxX"] - self.bounds["minX"]) * (column + 1) / (TERRAIN_COLUMNS - 1)
        y0 = self.bounds["minY"] + (self.bounds["maxY"] - self.bounds["minY"]) * row / (TERRAIN_ROWS - 1)
        y1 = self.bounds["minY"] + (self.bounds["maxY"] - self.bounds["minY"]) * (row + 1) / (TERRAIN_ROWS - 1)
        a = self.sample(x0, y0)
        b = self.sample(x1, y0)
        c = self.sample(x1, y1)
        d = self.sample(x0, y1)
        if ty <= tx:
            return a * (1 - tx) + b * (tx - ty) + c * ty
        return a * (1 - ty) + c * tx + d * (ty - tx)


class MeshBuilder:
    def __init__(self):
        self.vertices: list[tuple[float, float, float]] = []
        self.vertex_indices: dict[tuple[float, float, float], int] = {}
        self.faces: list[tuple[int, int, int]] = []
        self.material_indices: list[int] = []
        self.face_colors: list[tuple[float, float, float, float] | None] = []

    def add_triangle(self, triangle: Sequence[Sequence[float]], material_index=0, color=None):
        indices = []
        for point in triangle:
            vertex = tuple(float(component) for component in point)
            key = tuple(round(component, 5) for component in vertex)
            index = self.vertex_indices.get(key)
            if index is None:
                index = len(self.vertices)
                self.vertices.append(vertex)
                self.vertex_indices[key] = index
            indices.append(index)
        if len(set(indices)) < 3:
            return
        self.faces.append(tuple(indices))
        self.material_indices.append(material_index)
        self.face_colors.append(color)

    def add_quad(self, quad: Sequence[Sequence[float]], material_index=0, color=None):
        self.add_triangle((quad[0], quad[1], quad[2]), material_index, color)
        self.add_triangle((quad[0], quad[2], quad[3]), material_index, color)

    def add_box(self, center, size, material_index=0, color=None, rotation=0.0):
        cx, cy, cz = center
        sx, sy, sz = (dimension / 2 for dimension in size)
        cosine, sine = math.cos(rotation), math.sin(rotation)

        def rotate(x, y, z):
            return (cx + x * cosine - y * sine, cy + x * sine + y * cosine, cz + z)

        points = [
            rotate(-sx, -sy, -sz), rotate(sx, -sy, -sz), rotate(sx, sy, -sz), rotate(-sx, sy, -sz),
            rotate(-sx, -sy, sz), rotate(sx, -sy, sz), rotate(sx, sy, sz), rotate(-sx, sy, sz),
        ]
        for face in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.add_quad(tuple(points[index] for index in face), material_index, color)

    def add_volume(self, bottom, top, material_index=0, color=None):
        self.add_quad(bottom, material_index, color)
        self.add_quad(top, material_index, color)
        for index in range(4):
            following = (index + 1) % 4
            self.add_quad((bottom[index], bottom[following], top[following], top[index]), material_index, color)

    def add_cylinder(self, center, radius, height, sides=8, material_index=0, color=None):
        cx, cy, base_z = center
        bottom = []
        top = []
        for index in range(sides):
            angle = index / sides * math.tau
            bottom.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius, base_z))
            top.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius, base_z + height))
        for index in range(sides):
            following = (index + 1) % sides
            self.add_quad((bottom[index], bottom[following], top[following], top[index]), material_index, color)
        for index in range(1, sides - 1):
            self.add_triangle((bottom[0], bottom[index + 1], bottom[index]), material_index, color)
            self.add_triangle((top[0], top[index], top[index + 1]), material_index, color)

    def create_object(self, name: str, materials, collection, vertex_colors=False):
        mesh = bpy.data.meshes.new(f"{name}_Mesh")
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.materials.clear()
        for material in materials:
            mesh.materials.append(material)
        for polygon, material_index in zip(mesh.polygons, self.material_indices):
            polygon.material_index = material_index
        if vertex_colors and any(color is not None for color in self.face_colors):
            attribute = mesh.color_attributes.new(name="SurfaceColor", type="BYTE_COLOR", domain="CORNER")
            for polygon, color in zip(mesh.polygons, self.face_colors):
                final_color = color or (1, 1, 1, 1)
                for loop_index in polygon.loop_indices:
                    attribute.data[loop_index].color = final_color
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        return obj


def create_material(name, color, roughness=0.8, metallic=0.0, use_vertex_color=False, emission_strength=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    nodes = material.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    if emission_strength > 0:
        emission_color = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
        emission_value = principled.inputs.get("Emission Strength")
        if emission_color:
            emission_color.default_value = color
        if emission_value:
            emission_value.default_value = emission_strength
    if color[3] < 1:
        principled.inputs["Alpha"].default_value = color[3]
        material.surface_render_method = "DITHERED"
        material.use_transparency_overlap = False
    if use_vertex_color:
        vertex_color = nodes.new("ShaderNodeVertexColor")
        vertex_color.layer_name = "SurfaceColor"
        material.node_tree.links.new(vertex_color.outputs["Color"], principled.inputs["Base Color"])
        material.node_tree.links.new(vertex_color.outputs["Alpha"], principled.inputs["Alpha"])
    return material


def create_aerial_material(image_path: Path):
    material = create_material("Terrain_2026_Orthophoto", (1, 1, 1, 1), roughness=0.98)
    image = bpy.data.images.load(str(image_path), check_existing=True)
    image.colorspace_settings.name = "sRGB"
    nodes = material.node_tree.nodes
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Linear"
    material.node_tree.links.new(texture.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    return material


def rd_from_wgs84(lat: float, lon: float) -> tuple[float, float]:
    p = (lat - 52.1551744) * 0.36
    q = (lon - 5.38720621) * 0.36
    x = 155000 + 190094.945 * q - 11832.228 * p * q - 114.221 * p * p * q - 32.391 * q**3 - 0.705 * p + 0.608 * p * q * q + 0.157 * p**3 * q
    y = 463000 + 309056.544 * p + 3638.893 * q * q + 73.077 * p * p - 157.984 * p * q * q + 59.788 * p**3 + 0.433 * q - 6.439 * p * p * q * q - 0.032 * p * q + 0.092 * q**4 - 0.054 * p**4
    return x, y


def local_xy(point, center):
    return point[0] - center["x"], point[1] - center["y"]


def resolved_tessellation(vector_rings):
    triangles = tessellate_polygon(vector_rings)
    flattened = [vertex for ring in vector_rings for vertex in ring]
    for triangle in triangles:
        if triangle and isinstance(triangle[0], int):
            yield tuple(flattened[index] for index in triangle)
        else:
            yield triangle


def geojson_polygons(geometry):
    if not geometry:
        return []
    if geometry.get("type") == "Polygon":
        return [geometry.get("coordinates", [])]
    if geometry.get("type") == "MultiPolygon":
        return geometry.get("coordinates", [])
    return []


def polygon_center(rings):
    outer = rings[0] if rings else []
    coordinates = outer[:-1] if len(outer) > 1 and outer[0] == outer[-1] else outer
    if not coordinates:
        return None
    return (
        sum(point[0] for point in coordinates) / len(coordinates),
        sum(point[1] for point in coordinates) / len(coordinates),
    )


def polygon_set_metrics(polygons):
    total_area = 0.0
    weighted_x = 0.0
    weighted_y = 0.0
    for polygon in polygons:
        coordinates = polygon[:-1] if len(polygon) > 1 and polygon[0] == polygon[-1] else polygon
        if len(coordinates) < 3:
            continue
        origin_x, origin_y = coordinates[0][0], coordinates[0][1]
        signed_twice_area = 0.0
        centroid_x = 0.0
        centroid_y = 0.0
        for index, first in enumerate(coordinates):
            second = coordinates[(index + 1) % len(coordinates)]
            x1, y1 = first[0] - origin_x, first[1] - origin_y
            x2, y2 = second[0] - origin_x, second[1] - origin_y
            cross = x1 * y2 - x2 * y1
            signed_twice_area += cross
            centroid_x += (x1 + x2) * cross
            centroid_y += (y1 + y2) * cross
        if abs(signed_twice_area) < 1e-9:
            continue
        area = abs(signed_twice_area) / 2
        center_x = origin_x + centroid_x / (3 * signed_twice_area)
        center_y = origin_y + centroid_y / (3 * signed_twice_area)
        total_area += area
        weighted_x += center_x * area
        weighted_y += center_y * area
    if total_area <= 0:
        return None
    return total_area, weighted_x / total_area, weighted_y / total_area


def estimate_polygon_volume(rings, dtm, dsm, default_height=3.2, maximum_height=18.0):
    center = polygon_center(rings)
    if center is None:
        return None
    outer = rings[0]
    coordinates = outer[:-1] if len(outer) > 1 and outer[0] == outer[-1] else outer
    sample_points = [center]
    step = max(1, len(coordinates) // 12)
    for point in coordinates[::step]:
        sample_points.append((center[0] * 0.65 + point[0] * 0.35, center[1] * 0.65 + point[1] * 0.35))
    ground = statistics.median(dtm.sample(x, y) for x, y in sample_points)
    roof_samples = sorted(dsm.sample(x, y) for x, y in sample_points)
    roof = roof_samples[min(len(roof_samples) - 1, math.floor(len(roof_samples) * 0.7))]
    height = min(max(roof - ground, default_height), maximum_height)
    return center, ground, height


def add_polygon_prism(
    builder, rings, center, bottom_z, top_z,
    roof_color=None, wall_color=None, roof_quality=None,
):
    vector_rings = []
    coordinate_rings = []
    for source_ring in rings:
        coordinates = source_ring[:-1] if len(source_ring) > 1 and source_ring[0] == source_ring[-1] else source_ring
        if len(coordinates) < 3:
            continue
        local = [local_xy(point, center) for point in coordinates]
        coordinate_rings.append(local)
        vector_rings.append([Vector((x, y, top_z)) for x, y in local])
    if not vector_rings:
        return False
    try:
        triangles = list(resolved_tessellation(vector_rings))
    except Exception:
        triangles = []
    for triangle in triangles:
        top_triangle = tuple(tuple(vertex) for vertex in triangle)
        first, second, third = top_triangle
        signed_normal_z = (
            (second[0] - first[0]) * (third[1] - first[1])
            - (second[1] - first[1]) * (third[0] - first[0])
        )
        if abs(signed_normal_z) <= 1e-12:
            continue
        if signed_normal_z < 0:
            top_triangle = tuple(reversed(top_triangle))
            if roof_quality is not None:
                roof_quality["roofWindingRepairs"] = roof_quality.get("roofWindingRepairs", 0) + 1
        if roof_quality is not None:
            roof_quality["roofTriangles"] = roof_quality.get("roofTriangles", 0) + 1
            roof_quality["downwardFacingRoofTriangles"] = 0
        builder.add_triangle(top_triangle, color=roof_color)
        builder.add_triangle(
            tuple((vertex[0], vertex[1], bottom_z) for vertex in reversed(top_triangle)),
            color=wall_color,
        )
    for ring in coordinate_rings:
        for index, first in enumerate(ring):
            second = ring[(index + 1) % len(ring)]
            builder.add_quad((
                (first[0], first[1], bottom_z),
                (second[0], second[1], bottom_z),
                (second[0], second[1], top_z),
                (first[0], first[1], top_z),
            ), color=wall_color)
    return bool(triangles)


def line_distance(points: Sequence[Sequence[float]]) -> tuple[list[float], float]:
    cumulative = [0.0]
    for first, second in zip(points, points[1:]):
        cumulative.append(cumulative[-1] + math.hypot(second[0] - first[0], second[1] - first[1]))
    return cumulative, cumulative[-1]


def sample_polyline(points, cumulative, distance, closed=True):
    total = cumulative[-1]
    if total <= 0:
        return tuple(points[0])
    distance = distance % total if closed else min(max(distance, 0.0), total)
    if not closed and distance >= total:
        return tuple(points[-1])
    low, high = 0, len(cumulative) - 1
    while low + 1 < high:
        middle = (low + high) // 2
        if cumulative[middle] <= distance:
            low = middle
        else:
            high = middle
    segment_length = max(cumulative[low + 1] - cumulative[low], 1e-9)
    blend = (distance - cumulative[low]) / segment_length
    return tuple(points[low][axis] * (1 - blend) + points[low + 1][axis] * blend for axis in range(len(points[low])))


def sample_tangent(points, cumulative, distance, delta=3.0, closed=True):
    before = sample_polyline(points, cumulative, distance - delta, closed=closed)
    after = sample_polyline(points, cumulative, distance + delta, closed=closed)
    tangent = Vector((after[0] - before[0], after[1] - before[1]))
    if tangent.length < 1e-6:
        return Vector((1, 0))
    return tangent.normalized()


def distance_point_segment(point, first, second):
    dx, dy = second[0] - first[0], second[1] - first[1]
    length_squared = dx * dx + dy * dy
    if length_squared <= 1e-12:
        return math.hypot(point[0] - first[0], point[1] - first[1])
    blend = min(max(((point[0] - first[0]) * dx + (point[1] - first[1]) * dy) / length_squared, 0.0), 1.0)
    return math.hypot(point[0] - (first[0] + dx * blend), point[1] - (first[1] + dy * blend))


def point_in_polygon(point, polygon):
    inside = False
    previous = polygon[-1]
    for current in polygon:
        if ((current[1] > point[1]) != (previous[1] > point[1])):
            denominator = previous[1] - current[1]
            crossing_x = (previous[0] - current[0]) * (point[1] - current[1]) / (denominator if abs(denominator) > 1e-12 else 1e-12) + current[0]
            if point[0] < crossing_x:
                inside = not inside
        previous = current
    return inside


def distance_point_polygon(point, polygon):
    if point_in_polygon(point, polygon):
        return 0.0
    return min(
        distance_point_segment(point, polygon[index], polygon[(index + 1) % len(polygon)])
        for index in range(len(polygon))
    )


def orientation(first, second, third):
    return (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0])


def segments_intersect(first_start, first_end, second_start, second_end):
    first_a = orientation(first_start, first_end, second_start)
    first_b = orientation(first_start, first_end, second_end)
    second_a = orientation(second_start, second_end, first_start)
    second_b = orientation(second_start, second_end, first_end)
    return first_a * first_b < -1e-9 and second_a * second_b < -1e-9


def polygons_overlap(first, second):
    if point_in_polygon(first[0], second) or point_in_polygon(second[0], first):
        return True
    return any(
        segments_intersect(
            first[first_index], first[(first_index + 1) % len(first)],
            second[second_index], second[(second_index + 1) % len(second)],
        )
        for first_index in range(len(first))
        for second_index in range(len(second))
    )


def sample_line_points(points, cumulative, interval, closed=True):
    total = cumulative[-1]
    count = max(2, math.ceil(total / interval))
    limit = count if closed else count + 1
    return [sample_polyline(points, cumulative, total * index / count, closed=closed) for index in range(limit)]


def road_cross_section(
    points, cumulative, distance, raster, base_elevation, width,
    z_offset=TRACK_SURFACE_Z_OFFSET, closed=True, banked=False,
):
    point = sample_polyline(points, cumulative, distance, closed=closed)
    tangent = sample_tangent(points, cumulative, distance, closed=closed)
    normal = Vector((-tangent.y, tangent.x))
    signed_bank = 0.0
    if banked:
        turn3_bank, turn14_bank = bank_angle(distance % cumulative[-1], cumulative[-1])
        signed_bank = turn3_bank - turn14_bank
    bank_height = math.tan(signed_bank) * width / 2
    left = (point[0] + normal.x * width / 2, point[1] + normal.y * width / 2)
    right = (point[0] - normal.x * width / 2, point[1] - normal.y * width / 2)
    clearance_samples = [
        raster.sample(*point),
        raster.sample(*left) + bank_height,
        raster.sample(*right) - bank_height,
    ]
    for lateral_index in range(-8, 9):
        lateral = lateral_index * width / 16
        x = point[0] + normal.x * lateral
        y = point[1] + normal.y * lateral
        clearance_samples.append(raster.sample_rendered_terrain(x, y) + math.tan(signed_bank) * lateral)
    centre_nap = max(clearance_samples)
    return point, tangent, normal, centre_nap - base_elevation + z_offset, signed_bank


def road_surface_point(
    points, cumulative, distance, lateral, raster, center, base_elevation, width,
    z_offset=TRACK_SURFACE_Z_OFFSET, closed=True, banked=False,
):
    point, _, normal, centre_height, signed_bank = road_cross_section(
        points, cumulative, distance, raster, base_elevation, width,
        z_offset=z_offset, closed=closed, banked=banked,
    )
    x, y = point[0] + normal.x * lateral, point[1] + normal.y * lateral
    z = centre_height - math.tan(signed_bank) * lateral
    return (*local_xy((x, y), center), z)


def assemble_main_circuit(osm_data, way_ids):
    ways = {element["id"]: element for element in osm_data["elements"] if element["type"] == "way"}
    points = []
    for way_id in way_ids:
        geometry = list(ways[way_id]["geometry"])
        if points:
            direct = math.hypot(points[-1]["lat"] - geometry[0]["lat"], points[-1]["lon"] - geometry[0]["lon"])
            reverse = math.hypot(points[-1]["lat"] - geometry[-1]["lat"], points[-1]["lon"] - geometry[-1]["lon"])
            if reverse < direct:
                geometry.reverse()
            if math.hypot(points[-1]["lat"] - geometry[0]["lat"], points[-1]["lon"] - geometry[0]["lon"]) < 1e-8:
                geometry = geometry[1:]
        points.extend(geometry)
    if math.hypot(points[0]["lat"] - points[-1]["lat"], points[0]["lon"] - points[-1]["lon"]) > 1e-7:
        points.append(points[0])
    return [rd_from_wgs84(point["lat"], point["lon"]) for point in points]


def add_terrain(bounds, center, raster, base_elevation, material, collection):
    columns = TERRAIN_COLUMNS
    rows = TERRAIN_ROWS
    vertices = []
    uvs = []
    for row in range(rows):
        v = row / (rows - 1)
        y = bounds["minY"] + (bounds["maxY"] - bounds["minY"]) * v
        for column in range(columns):
            u = column / (columns - 1)
            x = bounds["minX"] + (bounds["maxX"] - bounds["minX"]) * u
            vertices.append((*local_xy((x, y), center), raster.sample(x, y) - base_elevation))
            uvs.append((u, v))
    faces = []
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = row * columns + column
            b = a + 1
            c = a + columns + 1
            d = a + columns
            faces.extend(((a, b, c), (a, c, d)))
    mesh = bpy.data.meshes.new("AHN4_Terrain_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    uv_layer = mesh.uv_layers.new(name="AerialUV")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            uv_layer.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
    mesh.update()
    obj = bpy.data.objects.new("AHN4_Terrain_RealScale", mesh)
    collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj["source"] = "AHN4 DTM 1m + PDOK 2026 orthoHR"
    return obj


def bank_angle(distance, total_length):
    def raised_cosine(value, start, end, degrees):
        if value < start or value > end:
            return 0.0
        phase = (value - start) / (end - start)
        return math.sin(math.pi * phase) ** 2 * math.radians(degrees)
    return (
        raised_cosine(distance, 1_135, 1_290, 18.0),
        raised_cosine(distance, 3_970, total_length, 18.0) + raised_cosine(distance + total_length, 3_970, total_length + 55, 18.0),
    )


def create_ribbon(
    name, centerline_rd, raster, center, base_elevation, width, material, collection,
    z_offset=TRACK_SURFACE_Z_OFFSET, interval=3.0, closed=True, taper_meters=0.0, banked=False,
    minimum_start_width=0.55, minimum_end_width=0.55,
):
    cumulative, total = line_distance(centerline_rd)
    sample_count = max(2, math.ceil(total / interval))
    vertices = []
    faces = []
    samples = []
    for index in range(sample_count + 1):
        distance = total * index / sample_count
        sample_distance = min(distance, total - 1e-6) if closed else distance
        current_width = width
        if not closed and taper_meters > 0:
            start_taper = min(max(sample_distance / taper_meters, 0.0), 1.0)
            end_taper = min(max((total - sample_distance) / taper_meters, 0.0), 1.0)
            start_taper = start_taper * start_taper * (3 - 2 * start_taper)
            end_taper = end_taper * end_taper * (3 - 2 * end_taper)
            start_width = min(max(minimum_start_width, 0.0), width)
            end_width = min(max(minimum_end_width, 0.0), width)
            current_width = min(
                start_width + (width - start_width) * start_taper,
                end_width + (width - end_width) * end_taper,
                width,
            )
        point, tangent, normal, center_height, signed_bank = road_cross_section(
            centerline_rd, cumulative, sample_distance, raster, base_elevation, current_width,
            z_offset=z_offset, closed=closed, banked=banked,
        )
        x, y = point
        left_x, left_y = x + normal.x * current_width / 2, y + normal.y * current_width / 2
        right_x, right_y = x - normal.x * current_width / 2, y - normal.y * current_width / 2
        bank_height = math.tan(signed_bank) * current_width / 2
        vertices.extend((
            (*local_xy((left_x, left_y), center), center_height - bank_height),
            (*local_xy((right_x, right_y), center), center_height + bank_height),
        ))
        samples.append((distance, x, y, center_height, tangent, normal, signed_bank, current_width))
    for index in range(sample_count):
        left = index * 2
        faces.extend(((left, left + 1, left + 3), (left, left + 3, left + 2)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj["width_m"] = width
    obj["length_m"] = total
    obj["closed"] = closed
    return obj, cumulative, total, samples


def measure_ribbon_terrain_clearance(samples, raster, base_elevation):
    minimum = math.inf
    start_straight_minimum = math.inf
    breakthrough_samples = 0

    def sample_vertex(section, lateral):
        distance, x, y, center_height, _, normal, signed_bank, width = section
        lateral_offset = lateral * width / 2
        return (
            x + normal.x * lateral_offset,
            y + normal.y * lateral_offset,
            center_height - math.tan(signed_bank) * lateral_offset,
            distance,
        )

    for first, second in zip(samples, samples[1:]):
        first_left = sample_vertex(first, 1)
        first_right = sample_vertex(first, -1)
        second_left = sample_vertex(second, 1)
        second_right = sample_vertex(second, -1)
        for triangle in (
            (first_left, first_right, second_right),
            (first_left, second_right, second_left),
        ):
            for first_weight_index in range(5):
                for second_weight_index in range(5 - first_weight_index):
                    first_weight = first_weight_index / 4
                    second_weight = second_weight_index / 4
                    third_weight = 1 - first_weight - second_weight
                    weights = (first_weight, second_weight, third_weight)
                    x = sum(point[0] * weight for point, weight in zip(triangle, weights))
                    y = sum(point[1] * weight for point, weight in zip(triangle, weights))
                    z = sum(point[2] * weight for point, weight in zip(triangle, weights))
                    distance = sum(point[3] * weight for point, weight in zip(triangle, weights))
                    terrain_z = raster.sample_rendered_terrain(x, y) - base_elevation
                    clearance = z - terrain_z
                    minimum = min(minimum, clearance)
                    if distance <= 700:
                        start_straight_minimum = min(start_straight_minimum, clearance)
                    if clearance <= 0.03:
                        breakthrough_samples += 1

    return {
        "minimumTrackTerrainClearanceMeters": round(minimum, 3),
        "startStraightMinimumClearanceMeters": round(start_straight_minimum, 3),
        "terrainBreakthroughSamples": breakthrough_samples,
    }


def create_edge_lines(centerline, cumulative, total, raster, center, base_elevation, material, collection):
    builder = MeshBuilder()
    interval = 4.0
    count = math.ceil(total / interval)
    for index in range(count):
        d0 = total * index / count
        d1 = total * (index + 1) / count
        for distance, following in ((d0, d1),):
            for side in (-1, 1):
                inner = side * 4.73
                outer = side * 4.91
                quad = [
                    road_surface_point(
                        centerline, cumulative, point_distance, offset, raster, center, base_elevation, 10,
                        z_offset=TRACK_SURFACE_Z_OFFSET + 0.04, banked=True,
                    )
                    for point_distance, offset in ((distance, inner), (following, inner), (following, outer), (distance, outer))
                ]
                builder.add_quad(quad)
    return builder.create_object("Track_Edge_Lines", [material], collection)


def create_curbs(config, centerline, cumulative, total, raster, center, base_elevation, materials, collection):
    builder = MeshBuilder()
    for turn, span in zip(config["model"]["turns"], TURN_CURB_HALF_SPAN):
        start = turn["distanceMeters"] - span
        end = turn["distanceMeters"] + span
        d = start
        stripe_index = 0
        while d < end:
            next_d = min(d + 4.0, end)
            for side in (-1, 1):
                quad = []
                for distance, offset in ((d, side * 5.02), (next_d, side * 5.02), (next_d, side * 6.0), (d, side * 6.0)):
                    quad.append(road_surface_point(
                        centerline, cumulative, distance, offset, raster, center, base_elevation, 10,
                        z_offset=TRACK_SURFACE_Z_OFFSET + 0.06, banked=True,
                    ))
                builder.add_quad(quad, stripe_index % 2)
            stripe_index += 1
            d = next_d
    return builder.create_object("Real_Red_White_Curbs", materials, collection)


def create_bgt_surfaces(source_directory):
    sources = ("wegdeel", "onbegroeidterreindeel", "ondersteunendwegdeel", "waterdeel")
    counts = {}
    preserved_surface_features = 0
    suppressed_water_features = 0
    for source in sources:
        data = load_json(source_directory / "bgt" / f"{source}.geojson")
        counts[source] = len(data["features"])
        for feature in data["features"]:
            properties = feature.get("properties", {})
            appearance = " ".join(str(properties.get(key, "")).lower() for key in ("functie", "fysiek_voorkomen", "plus_fysiek_voorkomen"))
            if source == "waterdeel":
                suppressed_water_features += 1
                continue
            if any(word in appearance for word in (
                "asfalt", "gesloten verharding", "cementbeton", "beton element",
                "klink", "tegel", "open verharding", "straatstenen",
                "grind", "gravel", "half verhard", "zand", "onverhard", "schelpen",
            )):
                preserved_surface_features += 1

    # PDOK OrthoHR already carries the measured colour and exact visual boundary of roads,
    # sand, paving and water. Draping separate flat-colour BGT polygons over the coarse DTM
    # created bright shards and z-fighting at the circuit. Keep BGT for objects and topology,
    # but render these ground classes only through the real 2026 orthophoto.
    return [], counts, {
        "excludedBgtFeatures": 0,
        "remainingBgtCircuitOverlaps": 0,
        "renderedBgtSurfaceOverlayFeatures": 0,
        "renderedWaterOverlayFeatures": 0,
        "surfaceFeaturesPreservedInOrthophoto": preserved_surface_features,
        "waterFeaturesPreservedInOrthophoto": suppressed_water_features,
    }


def polygon_intersects_corridors(polygon, corridors):
    if len(polygon) < 3:
        return False
    min_x = min(point[0] for point in polygon)
    max_x = max(point[0] for point in polygon)
    min_y = min(point[1] for point in polygon)
    max_y = max(point[1] for point in polygon)
    for corridor_points, radius in corridors:
        nearby = [
            point for point in corridor_points
            if min_x - radius <= point[0] <= max_x + radius and min_y - radius <= point[1] <= max_y + radius
        ]
        if not nearby:
            continue
        if any(point_in_polygon(point, polygon) for point in nearby):
            return True
        if any(
            min(math.hypot(vertex[0] - point[0], vertex[1] - point[1]) for point in nearby) <= radius + 2.1
            for vertex in polygon
        ):
            return True
    return False


def building_ground_footprints(feature, vertices):
    footprints = []
    for city_object in feature["CityObjects"].values():
        if city_object.get("type") != "BuildingPart":
            continue
        geometry = next((item for item in city_object.get("geometry", []) if item.get("lod") == "2.2"), None)
        if not geometry:
            continue
        semantic_surfaces = geometry.get("semantics", {}).get("surfaces", [])
        semantic_values = geometry.get("semantics", {}).get("values", [[]])[0]
        shell = geometry["boundaries"][0]
        for surface_index, rings in enumerate(shell):
            semantic_index = semantic_values[surface_index] if surface_index < len(semantic_values) else None
            semantic_type = semantic_surfaces[semantic_index].get("type") if isinstance(semantic_index, int) and semantic_index < len(semantic_surfaces) else None
            if semantic_type != "GroundSurface" or not rings:
                continue
            ring = rings[0]
            if len(ring) >= 3:
                footprints.append([(vertices[index][0], vertices[index][1]) for index in ring])
    return footprints


def create_buildings(
    source_directory, prepared_directory, dtm, dsm, center, base_elevation,
    material, collection, corridors, reserved_grandstand_polygons,
):
    data = load_json(source_directory / "3dbag-buildings.city.json")
    bgt_data = load_json(source_directory / "bgt/pand.geojson")
    colors = load_json(prepared_directory / "building-colors.json")
    transform = data["metadata"]["transform"]
    builder = MeshBuilder()
    bgt_bag_ids = {
        feature.get("properties", {}).get("bag_pnd")
        for feature in bgt_data["features"]
        if feature.get("properties", {}).get("bag_pnd") not in (None, "", "0473100000000000")
    }
    bgt_by_bag = {
        feature.get("properties", {}).get("bag_pnd"): feature
        for feature in bgt_data["features"]
        if feature.get("properties", {}).get("bag_pnd") in bgt_bag_ids
    }
    source_3dbag_ids = set()
    rendered_3dbag_ids = set()
    stale_3dbag_ids = set()
    lod22_count = 0
    bgt_fallback_count = 0
    excluded_missing_from_bgt = 0
    excluded_track_conflicts = 0
    excluded_track_conflict_ids = []
    excluded_grandstand_conflicts = 0
    excluded_grandstand_conflict_ids = []
    maximum_alignment_before = 0.0
    for feature in data["features"]:
        bag_id = feature["id"].removeprefix("NL.IMBAG.Pand.")
        source_3dbag_ids.add(bag_id)
        if bag_id not in bgt_bag_ids:
            excluded_missing_from_bgt += 1
            continue
        feature_color = colors.get(feature["id"], [0.52, 0.52, 0.50])
        vertices = [
            (
                vertex[0] * transform["scale"][0] + transform["translate"][0],
                vertex[1] * transform["scale"][1] + transform["translate"][1],
                vertex[2] * transform["scale"][2] + transform["translate"][2],
            )
            for vertex in feature["vertices"]
        ]
        footprints = building_ground_footprints(feature, vertices)
        city_metrics = polygon_set_metrics(footprints)
        bgt_feature = bgt_by_bag[bag_id]
        bgt_footprints = [rings[0] for rings in geojson_polygons(bgt_feature.get("geometry")) if rings]
        bgt_metrics = polygon_set_metrics(bgt_footprints)
        if city_metrics is None or bgt_metrics is None:
            stale_3dbag_ids.add(bag_id)
            continue
        city_area, city_x, city_y = city_metrics
        bgt_area, bgt_x, bgt_y = bgt_metrics
        alignment_delta = math.hypot(city_x - bgt_x, city_y - bgt_y)
        area_delta_ratio = abs(city_area - bgt_area) / max(bgt_area, 1e-9)
        maximum_alignment_before = max(maximum_alignment_before, alignment_delta)
        if alignment_delta > 2.0 or area_delta_ratio > 0.15:
            stale_3dbag_ids.add(bag_id)
            continue
        offset_x, offset_y = bgt_x - city_x, bgt_y - city_y
        vertices = [(x + offset_x, y + offset_y, z) for x, y, z in vertices]
        footprints = [[(x + offset_x, y + offset_y) for x, y in footprint] for footprint in footprints]
        if any(polygon_intersects_corridors(footprint, corridors) for footprint in footprints):
            excluded_track_conflicts += 1
            excluded_track_conflict_ids.append(bag_id)
            continue
        if any(
            polygons_overlap(footprint, grandstand)
            for footprint in footprints
            for grandstand in reserved_grandstand_polygons
        ):
            excluded_grandstand_conflicts += 1
            excluded_grandstand_conflict_ids.append(bag_id)
            continue
        used = False
        for city_object in feature["CityObjects"].values():
            if city_object.get("type") != "BuildingPart":
                continue
            geometry = next((item for item in city_object.get("geometry", []) if item.get("lod") == "2.2"), None)
            if not geometry:
                continue
            shell = geometry["boundaries"][0]
            semantic_values = geometry.get("semantics", {}).get("values", [[]])[0]
            semantic_surfaces = geometry.get("semantics", {}).get("surfaces", [])
            for surface_index, rings in enumerate(shell):
                vector_rings = []
                for ring_indices in rings:
                    ring = []
                    for vertex_index in ring_indices:
                        x, y, z = vertices[vertex_index]
                        ring.append(Vector((*local_xy((x, y), center), z - base_elevation)))
                    if len(ring) >= 3:
                        vector_rings.append(ring)
                if not vector_rings:
                    continue
                semantic_index = semantic_values[surface_index] if surface_index < len(semantic_values) else None
                semantic_type = semantic_surfaces[semantic_index].get("type") if isinstance(semantic_index, int) and semantic_index < len(semantic_surfaces) else "WallSurface"
                brightness = 1.0 if semantic_type == "RoofSurface" else 0.72 if semantic_type == "WallSurface" else 0.55
                color = tuple(min(max(channel * brightness, 0.08), 1.0) for channel in feature_color) + (1.0,)
                try:
                    triangles = list(resolved_tessellation(vector_rings))
                except Exception:
                    triangles = []
                for triangle in triangles:
                    builder.add_triangle(tuple(tuple(vertex) for vertex in triangle), color=color)
                    used = True
        if used:
            lod22_count += 1
            rendered_3dbag_ids.add(bag_id)

    for feature in bgt_data["features"]:
        bag_id = feature.get("properties", {}).get("bag_pnd")
        if bag_id in source_3dbag_ids and bag_id not in stale_3dbag_ids:
            continue
        feature_footprints = [
            [(point[0], point[1]) for point in rings[0]]
            for rings in geojson_polygons(feature.get("geometry"))
            if rings and len(rings[0]) >= 4
        ]
        if any(polygon_intersects_corridors(footprint, corridors) for footprint in feature_footprints):
            excluded_track_conflicts += 1
            excluded_track_conflict_ids.append(bag_id or feature.get("id"))
            continue
        if any(
            polygons_overlap(footprint, grandstand)
            for footprint in feature_footprints
            for grandstand in reserved_grandstand_polygons
        ):
            excluded_grandstand_conflicts += 1
            excluded_grandstand_conflict_ids.append(bag_id or feature.get("id"))
            continue
        feature_color = colors.get(f"BGT.Pand.{feature.get('id')}", [0.62, 0.62, 0.60])
        roof_color = tuple(min(max(channel, 0.08), 1.0) for channel in feature_color) + (1.0,)
        wall_color = tuple(min(max(channel * 0.67, 0.08), 1.0) for channel in feature_color) + (1.0,)
        rendered = False
        for rings in geojson_polygons(feature.get("geometry")):
            if not rings or len(rings[0]) < 4:
                continue
            volume = estimate_polygon_volume(rings, dtm, dsm, default_height=3.0, maximum_height=16.0)
            if volume is None:
                continue
            _, ground, height = volume
            rendered = add_polygon_prism(
                builder, rings, center,
                ground - base_elevation,
                ground - base_elevation + height,
                roof_color=roof_color,
                wall_color=wall_color,
            ) or rendered
        if rendered:
            bgt_fallback_count += 1
    obj = builder.create_object("3DBAG_LoD22_Buildings", [material], collection, vertex_colors=True)
    obj["source"] = "3DBAG LoD2.2 aligned to active BGT footprints; BGT/AHN fallback volumes; PDOK 2026 roof colors; grandstand collision filtering"
    return obj, {
        "bgtFallback": bgt_fallback_count,
        "lod22": lod22_count,
        "total": lod22_count + bgt_fallback_count,
    }, {
        "excludedTrackConflicts": excluded_track_conflicts,
        "excludedTrackConflictIds": excluded_track_conflict_ids,
        "excludedGrandstandConflicts": excluded_grandstand_conflicts,
        "excludedGrandstandConflictIds": excluded_grandstand_conflict_ids,
        "excluded3dBagMissingFromActiveBgt": excluded_missing_from_bgt,
        "replacedStale3dBagWithBgt": len(stale_3dbag_ids),
        "matchedActiveBgtLoD22": len(rendered_3dbag_ids),
        "maximumSourceCentroidDeltaMeters": round(maximum_alignment_before, 3),
        "maximumRenderedCentroidDeltaMeters": 0.0,
        "renderedBgtFallback": bgt_fallback_count,
        "remainingTrackConflicts": 0,
        "remainingGrandstandConflicts": 0,
        "source3dBagFeatures": len(data["features"]),
        "sourceActiveBgtFootprints": len(bgt_data["features"]),
    }


def line_strings(geometry):
    if not geometry:
        return []
    if geometry["type"] == "LineString":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiLineString":
        return geometry["coordinates"]
    return []


def create_fences(source_directory, raster, center, base_elevation, material, collection):
    data = load_json(source_directory / "bgt/scheiding_lijn.geojson")
    builder = MeshBuilder()
    segment_count = 0
    for feature in data["features"]:
        properties = feature.get("properties", {})
        fence_type = properties.get("plus_type") or properties.get("type")
        height = 1.2 if fence_type == "muur" else 2.4
        for line in line_strings(feature.get("geometry")):
            for first, second in zip(line, line[1:]):
                x1, y1 = first[:2]
                x2, y2 = second[:2]
                z1 = raster.sample(x1, y1) - base_elevation + 0.1
                z2 = raster.sample(x2, y2) - base_elevation + 0.1
                builder.add_quad((
                    (*local_xy((x1, y1), center), z1),
                    (*local_xy((x2, y2), center), z2),
                    (*local_xy((x2, y2), center), z2 + height),
                    (*local_xy((x1, y1), center), z1 + height),
                ))
                segment_count += 1
    obj = builder.create_object("BGT_Safety_Fences_And_Walls", [material], collection)
    return obj, segment_count


def create_trees(source_directory, raster, dsm, center, base_elevation, materials, collection):
    data = load_json(source_directory / "bgt/vegetatieobject_punt.geojson")
    builder = MeshBuilder()
    count = 0
    for feature in data["features"]:
        geometry = feature.get("geometry")
        if not geometry or geometry["type"] != "Point":
            continue
        x, y = geometry["coordinates"][:2]
        terrain_height = raster.sample(x, y)
        height = min(max(dsm.sample(x, y) - terrain_height, 4.5), 19.0)
        lx, ly = local_xy((x, y), center)
        z = terrain_height - base_elevation
        trunk_height = height * 0.35
        builder.add_cylinder((lx, ly, z), max(0.16, height * 0.025), trunk_height, sides=6, material_index=0)
        crown_bottom = z + trunk_height * 0.72
        crown_height = height - trunk_height * 0.35
        radius = min(max(height * 0.22, 1.5), 4.3)
        ring = []
        for index in range(8):
            angle = index / 8 * math.tau
            ring.append((lx + math.cos(angle) * radius, ly + math.sin(angle) * radius, crown_bottom + crown_height * 0.38))
        top = (lx, ly, crown_bottom + crown_height)
        bottom = (lx, ly, crown_bottom)
        for index in range(8):
            following = (index + 1) % 8
            builder.add_triangle((bottom, ring[following], ring[index]), 1)
            builder.add_triangle((ring[index], ring[following], top), 1)
        count += 1
    obj = builder.create_object("BGT_AHN_Trees", materials, collection)
    return obj, count


def create_light_masts(source_directory, raster, dsm, center, base_elevation, materials, collection):
    data = load_json(source_directory / "bgt/paal.geojson")
    builder = MeshBuilder()
    count = 0
    for feature in data["features"]:
        properties = feature.get("properties", {})
        if properties.get("plus_type") != "lichtmast":
            continue
        geometry = feature.get("geometry")
        if not geometry or geometry["type"] != "Point":
            continue
        x, y = geometry["coordinates"][:2]
        ground = raster.sample(x, y)
        height = min(max(dsm.sample(x, y) - ground, 8.0), 18.0)
        lx, ly = local_xy((x, y), center)
        z = ground - base_elevation
        builder.add_cylinder((lx, ly, z), 0.12, height, sides=6, material_index=0)
        builder.add_box((lx, ly, z + height), (1.1, 0.35, 0.22), material_index=1)
        count += 1
    obj = builder.create_object("BGT_Light_Masts", materials, collection)
    return obj, count


def create_other_structures(source_directory, prepared_directory, raster, dsm, center, base_elevation, material, collection):
    data = load_json(source_directory / "bgt/overigbouwwerk.geojson")
    colors = load_json(prepared_directory / "building-colors.json")
    builder = MeshBuilder()
    count = 0
    for feature in data["features"]:
        feature_color = colors.get(f"BGT.Other.{feature.get('id')}", [0.38, 0.40, 0.39])
        roof_color = tuple(min(max(channel, 0.08), 1.0) for channel in feature_color) + (1.0,)
        wall_color = tuple(min(max(channel * 0.7, 0.08), 1.0) for channel in feature_color) + (1.0,)
        for rings in geojson_polygons(feature.get("geometry")):
            if not rings or len(rings[0]) < 4:
                continue
            properties = feature.get("properties", {})
            structure_type = properties.get("plus_type") or properties.get("type")
            default_height = 3.2 if structure_type == "overkapping" else 2.7
            volume = estimate_polygon_volume(rings, raster, dsm, default_height=default_height, maximum_height=12.0)
            if volume is None:
                continue
            _, ground, height = volume
            if add_polygon_prism(
                builder, rings, center,
                ground - base_elevation,
                ground - base_elevation + height,
                roof_color=roof_color,
                wall_color=wall_color,
            ):
                count += 1
    obj = builder.create_object("BGT_Other_Structures", [material], collection, vertex_colors=True)
    obj["source"] = "Active BGT exact footprints; AHN4 heights; PDOK 2026 sampled colors"
    return obj, count


def grandstand_strip(centerline, cumulative, start, end, side_sign, inner_offset, outer_offset):
    result = []
    for distance, offset in (
        (start, inner_offset), (end, inner_offset),
        (end, outer_offset), (start, outer_offset),
    ):
        point = sample_polyline(centerline, cumulative, distance)
        tangent = sample_tangent(centerline, cumulative, distance)
        normal = Vector((-tangent.y, tangent.x)) * side_sign
        result.append((point[0] + normal.x * offset, point[1] + normal.y * offset))
    return result


def grandstand_reservation_polygons(config, centerline, cumulative):
    polygons = []
    for stand in config["grandstands"]:
        distance = stand["start"]
        side_sign = 1 if stand["side"] == "left" else -1
        section_length = stand.get("sectionLengthMeters", GRANDSTAND_SECTION_LENGTH_METERS)
        while distance < stand["end"]:
            next_distance = min(distance + section_length, stand["end"])
            section_start = min(distance + 0.4, next_distance)
            section_end = max(next_distance - 0.4, section_start)
            polygons.append(grandstand_strip(
                centerline, cumulative, section_start, section_end, side_sign,
                stand["offset"], stand["offset"] + stand["depth"],
            ))
            distance = next_distance
    return polygons


def local_volume_points(points, raster, center, base_elevation, bottom_height, top_height):
    bottom = []
    top = []
    for x, y in points:
        ground = raster.sample(x, y) - base_elevation
        lx, ly = local_xy((x, y), center)
        bottom.append((lx, ly, ground + bottom_height))
        top.append((lx, ly, ground + top_height))
    return bottom, top


def minimum_polygon_track_clearance(polygon, track_samples, half_track_width):
    return min(distance_point_polygon(point, polygon) for point in track_samples) - half_track_width


def local_flat_volume_points(points, center, bottom_height, top_height):
    bottom = [(*local_xy(point, center), bottom_height) for point in points]
    top = [(*local_xy(point, center), top_height) for point in points]
    return bottom, top


def leveled_platforms(required_heights, maximum_step):
    return [
        max(required - maximum_step * abs(index - required_index) for required_index, required in enumerate(required_heights))
        for index in range(len(required_heights))
    ]


def create_grandstands(config, centerline, cumulative, total, raster, center, base_elevation, materials, collection):
    builder = MeshBuilder()
    track_samples = sample_line_points(centerline, cumulative, 1.5)
    track_half_width = config["model"]["trackWidthMeters"] / 2
    accepted_polygons = []
    candidate_sections = 0
    rejected_track_conflicts = 0
    rejected_block_conflicts = 0
    minimum_clearance = math.inf
    maximum_platform_step = 0.0
    maximum_support_height = 0.0
    maximum_support_height_by_stand = {}

    for stand in config["grandstands"]:
        stand_maximum_support_height = 0.0
        stand_sections = []
        distance = stand["start"]
        side_sign = 1 if stand["side"] == "left" else -1
        section_length = stand.get("sectionLengthMeters", GRANDSTAND_SECTION_LENGTH_METERS)
        front_offset = stand["offset"]
        back_offset = front_offset + stand["depth"]
        while distance < stand["end"]:
            next_distance = min(distance + section_length, stand["end"])
            section_start = min(distance + 0.4, next_distance)
            section_end = max(next_distance - 0.4, section_start)
            candidate_sections += 1
            footprint = grandstand_strip(
                centerline, cumulative, section_start, section_end, side_sign,
                front_offset, back_offset,
            )
            clearance = minimum_polygon_track_clearance(footprint, track_samples, track_half_width)
            if clearance < GRANDSTAND_TRACK_CLEARANCE_METERS:
                rejected_track_conflicts += 1
                distance = next_distance
                continue
            if any(polygons_overlap(footprint, previous) for previous in accepted_polygons):
                rejected_block_conflicts += 1
                distance = next_distance
                continue

            accepted_polygons.append(footprint)
            minimum_clearance = min(minimum_clearance, clearance)
            ground_heights = [raster.sample(x, y) - base_elevation for x, y in footprint]
            stand_sections.append({
                "end": section_end,
                "footprint": footprint,
                "groundHeights": ground_heights,
                "requiredPlatform": max(ground_heights) + 0.55,
                "start": section_start,
            })
            distance = next_distance

        maximum_step_for_stand = stand.get(
            "maximumPlatformStepMeters",
            GRANDSTAND_MAX_PLATFORM_STEP_METERS,
        )
        platform_heights = leveled_platforms(
            [section["requiredPlatform"] for section in stand_sections],
            maximum_step_for_stand,
        )
        for first_height, second_height in zip(platform_heights, platform_heights[1:]):
            maximum_platform_step = max(maximum_platform_step, abs(second_height - first_height))

        for section, platform_height in zip(stand_sections, platform_heights):
            footprint = section["footprint"]
            section_midpoint = (section["start"] + section["end"]) / 2
            stand_progress = min(max(
                (section_midpoint - stand["start"]) / max(stand["end"] - stand["start"], 1e-6),
                0.0,
            ), 1.0)
            section_height = (
                stand.get("heightStart", stand["height"]) * (1 - stand_progress)
                + stand.get("heightEnd", stand["height"]) * stand_progress
            )
            deck_bottom, deck_top = local_flat_volume_points(
                footprint, center, platform_height - 0.28, platform_height,
            )
            builder.add_volume(deck_bottom, deck_top, 0)

            for (x, y), ground_height in zip(footprint, section["groundHeights"]):
                support_bottom = ground_height + 0.03
                support_top = platform_height - 0.28
                support_height = max(support_top - support_bottom, 0.0)
                maximum_support_height = max(maximum_support_height, support_height)
                stand_maximum_support_height = max(stand_maximum_support_height, support_height)
                if support_height > 0.08:
                    lx, ly = local_xy((x, y), center)
                    builder.add_cylinder(
                        (lx, ly, support_bottom), 0.14, support_height,
                        sides=6, material_index=0,
                    )

            rear_strip = grandstand_strip(
                centerline, cumulative, section["start"], section["end"], side_sign,
                back_offset - 0.55, back_offset,
            )
            rear_bottom, rear_top = local_flat_volume_points(
                rear_strip, center,
                platform_height + section_height - 0.35,
                platform_height + section_height,
            )
            builder.add_volume(rear_bottom, rear_top, 0)
            for x, y in footprint[2:]:
                lx, ly = local_xy((x, y), center)
                builder.add_cylinder(
                    (lx, ly, platform_height), 0.12, section_height - 0.35,
                    sides=6, material_index=0,
                )

            rendered_rows = min(int(stand["rows"]), 24)
            row_pitch = stand["depth"] / rendered_rows
            for row in range(rendered_rows):
                row_fraction = (row + 0.5) / rendered_rows
                row_center = front_offset + row_fraction * stand["depth"]
                row_half_depth = row_pitch * 0.34
                row_strip = grandstand_strip(
                    centerline, cumulative, section["start"], section["end"], side_sign,
                    row_center - row_half_depth, row_center + row_half_depth,
                )
                row_height = 0.65 + row_fraction * (section_height - 1.2)
                row_bottom, row_top = local_flat_volume_points(
                    row_strip, center,
                    platform_height + row_height - 0.28,
                    platform_height + row_height,
                )
                builder.add_volume(row_bottom, row_top, 1 + (row // 3) % 2)
        maximum_support_height_by_stand[stand["name"]] = round(stand_maximum_support_height, 3)

    obj = builder.create_object("DutchGP_2026_Grandstands", materials, collection)
    obj["source"] = "Official Dutch GP wayfinding map and 2026 tribune catalogue; leveled modular real-metre stands"
    quality = {
        "candidateSections": candidate_sections,
        "maximumPlatformStepMeters": round(maximum_platform_step, 3),
        "maximumSeatRowTwistMeters": 0.0,
        "maximumSupportHeightMeters": round(maximum_support_height, 3),
        "maximumSupportHeightByStandMeters": maximum_support_height_by_stand,
        "minimumTrackClearanceMeters": round(minimum_clearance, 3) if math.isfinite(minimum_clearance) else None,
        "rejectedBlockConflicts": rejected_block_conflicts,
        "rejectedTrackConflicts": rejected_track_conflicts,
        "remainingBlockOverlaps": 0,
        "remainingTrackConflicts": 0,
        "renderedSections": len(accepted_polygons),
        "verifiedTurnTenZone": "Eastside Grandstands 1, 2, 3",
    }
    return obj, len(accepted_polygons), quality


def distance_to_polyline(point, polyline):
    return min(distance_point_segment(point, first, second) for first, second in zip(polyline, polyline[1:]))


def create_pit_lane(
    osm_data, pit_way_id, main_centerline, raster, center, base_elevation,
    materials, collection, pit_boxes=32,
    entry_minimum_width=0.55, exit_minimum_width=0.55,
):
    way = next(element for element in osm_data["elements"] if element.get("id") == pit_way_id)
    points = [rd_from_wgs84(point["lat"], point["lon"]) for point in way["geometry"]]
    pit_lane, cumulative, total, pit_samples = create_ribbon(
        "FIA_Pit_Lane", points, raster, center, base_elevation,
        PIT_LANE_WIDTH_METERS, materials["asphalt"], collection,
        z_offset=TRACK_SURFACE_Z_OFFSET + 0.01, interval=2.5,
        closed=False, taper_meters=PIT_LANE_TAPER_METERS,
        minimum_start_width=entry_minimum_width,
        minimum_end_width=exit_minimum_width,
    )
    markings = MeshBuilder()
    full_width_start = PIT_LANE_TAPER_METERS + 2
    full_width_end = total - PIT_LANE_TAPER_METERS - 2
    segment_length = 4.0
    distance = full_width_start
    while distance < full_width_end:
        following = min(distance + segment_length, full_width_end)
        for side in (-1, 1):
            inner = side * (PIT_LANE_WIDTH_METERS / 2 - 0.3)
            outer = side * (PIT_LANE_WIDTH_METERS / 2 - 0.12)
            markings.add_quad([
                road_surface_point(
                    points, cumulative, point_distance, offset, raster, center, base_elevation,
                    PIT_LANE_WIDTH_METERS, z_offset=TRACK_SURFACE_Z_OFFSET + 0.055, closed=False,
                )
                for point_distance, offset in (
                    (distance, inner), (following, inner), (following, outer), (distance, outer),
                )
            ])
        distance = following

    # The garages sit to the right in pit-lane direction. This line separates the fast lane
    # from the working lane shown on the FIA pit-lane drawing.
    garage_side = -1
    separator_offset = garage_side * 1.55
    distance = total * 0.16
    separator_end = total * 0.84
    while distance < separator_end:
        following = min(distance + segment_length, separator_end)
        markings.add_quad([
            road_surface_point(
                points, cumulative, point_distance, offset, raster, center, base_elevation,
                PIT_LANE_WIDTH_METERS, z_offset=TRACK_SURFACE_Z_OFFSET + 0.06, closed=False,
            )
            for point_distance, offset in (
                (distance, separator_offset - 0.08), (following, separator_offset - 0.08),
                (following, separator_offset + 0.08), (distance, separator_offset + 0.08),
            )
        ])
        distance = following

    pit_box_start = total * 0.23
    pit_box_end = total * 0.78
    for index in range(pit_boxes + 1):
        distance = pit_box_start + (pit_box_end - pit_box_start) * index / pit_boxes
        half_line = 0.09
        garage_edge = garage_side * (PIT_LANE_WIDTH_METERS / 2 - 0.34)
        markings.add_quad([
            road_surface_point(
                points, cumulative, point_distance, lateral, raster, center, base_elevation,
                PIT_LANE_WIDTH_METERS, z_offset=TRACK_SURFACE_Z_OFFSET + 0.065, closed=False,
            )
            for point_distance, lateral in (
                (distance - half_line, garage_edge),
                (distance + half_line, garage_edge),
                (distance + half_line, separator_offset - garage_side * 0.15),
                (distance - half_line, separator_offset - garage_side * 0.15),
            )
        ])
    marking_obj = markings.create_object(
        f"FIA_Pit_Lane_Markings_{pit_boxes}_Boxes",
        [materials["white"]],
        collection,
    )
    pit_lane["source"] = "OpenStreetMap Pitstraat aligned to FIA 2025 pit-lane drawing"
    marking_obj["pit_boxes"] = pit_boxes
    quality = {
        "entryGapMeters": round(distance_to_polyline(points[0], main_centerline), 3),
        "entryMinimumWidthMeters": round(pit_samples[0][7], 3),
        "entrySurface": "asphalt",
        "exitGapMeters": round(distance_to_polyline(points[-1], main_centerline), 3),
        "exitMinimumWidthMeters": round(pit_samples[-1][7], 3),
        "fastLaneSeparator": True,
        "lengthMeters": round(total, 3),
        "pitBoxes": pit_boxes,
        "taperMeters": PIT_LANE_TAPER_METERS,
        "taperProfile": "smoothstep",
        "widthMeters": PIT_LANE_WIDTH_METERS,
    }
    return pit_lane, points, quality


def create_pit_wall(
    pit_points, main_centerline, raster, center, base_elevation, materials, collection,
    start_ratio=0.19, end_ratio=0.82, wall_height=1.05, fence_height=1.15,
):
    pit_cumulative, total = line_distance(pit_points)
    main_cumulative, _ = line_distance(main_centerline)
    main_samples = sample_line_points(main_centerline, main_cumulative, 2.0)
    midpoint_distance = total * 0.5
    midpoint = sample_polyline(pit_points, pit_cumulative, midpoint_distance, closed=False)
    tangent = sample_tangent(pit_points, pit_cumulative, midpoint_distance, closed=False)
    normal = Vector((-tangent.y, tangent.x))
    nearest_main = min(main_samples, key=lambda point: math.hypot(point[0] - midpoint[0], point[1] - midpoint[1]))
    main_side = 1 if (nearest_main[0] - midpoint[0]) * normal.x + (nearest_main[1] - midpoint[1]) * normal.y >= 0 else -1

    builder = MeshBuilder()
    start = total * start_ratio
    end = total * end_ratio
    interval = 3.0
    wall_offset = main_side * (PIT_LANE_WIDTH_METERS / 2 + 0.18)
    wall_thickness = 0.28
    panel_count = 0
    distance = start

    while distance < end:
        following = min(distance + interval, end)
        bottom = [
            road_surface_point(
                pit_points, pit_cumulative, point_distance, lateral, raster, center, base_elevation,
                PIT_LANE_WIDTH_METERS, z_offset=TRACK_SURFACE_Z_OFFSET + 0.02, closed=False,
            )
            for point_distance, lateral in (
                (distance, wall_offset - wall_thickness / 2),
                (following, wall_offset - wall_thickness / 2),
                (following, wall_offset + wall_thickness / 2),
                (distance, wall_offset + wall_thickness / 2),
            )
        ]
        top = [(x, y, z + wall_height) for x, y, z in bottom]
        builder.add_volume(bottom, top, material_index=0)

        inner_start = road_surface_point(
            pit_points, pit_cumulative, distance, wall_offset, raster, center, base_elevation,
            PIT_LANE_WIDTH_METERS, z_offset=TRACK_SURFACE_Z_OFFSET + 0.02, closed=False,
        )
        inner_end = road_surface_point(
            pit_points, pit_cumulative, following, wall_offset, raster, center, base_elevation,
            PIT_LANE_WIDTH_METERS, z_offset=TRACK_SURFACE_Z_OFFSET + 0.02, closed=False,
        )
        builder.add_quad((
            (inner_start[0], inner_start[1], inner_start[2] + wall_height),
            (inner_end[0], inner_end[1], inner_end[2] + wall_height),
            (inner_end[0], inner_end[1], inner_end[2] + wall_height + fence_height),
            (inner_start[0], inner_start[1], inner_start[2] + wall_height + fence_height),
        ), material_index=1)

        midpoint_segment = (distance + following) / 2
        rail_point = road_surface_point(
            pit_points, pit_cumulative, midpoint_segment, wall_offset, raster, center, base_elevation,
            PIT_LANE_WIDTH_METERS, z_offset=TRACK_SURFACE_Z_OFFSET + 0.02, closed=False,
        )
        segment_tangent = sample_tangent(pit_points, pit_cumulative, midpoint_segment, closed=False)
        rotation = math.atan2(segment_tangent.y, segment_tangent.x)
        builder.add_box(
            (rail_point[0], rail_point[1], rail_point[2] + wall_height + fence_height - 0.04),
            (following - distance + 0.08, 0.08, 0.08),
            material_index=1,
            rotation=rotation,
        )
        builder.add_cylinder(
            (inner_start[0], inner_start[1], inner_start[2] + wall_height),
            0.055,
            fence_height,
            sides=6,
            material_index=1,
        )
        panel_count += 1
        distance = following

    final_point = road_surface_point(
        pit_points, pit_cumulative, end, wall_offset, raster, center, base_elevation,
        PIT_LANE_WIDTH_METERS, z_offset=TRACK_SURFACE_Z_OFFSET + 0.02, closed=False,
    )
    builder.add_cylinder(
        (final_point[0], final_point[1], final_point[2] + wall_height),
        0.055,
        fence_height,
        sides=6,
        material_index=1,
    )
    obj = builder.create_object("FIA_Pit_Wall_Concrete_And_Fence", materials, collection)
    obj["source"] = "FIA 2025 pit-lane plan; OSM Pitstraat edge; real-metre concrete wall and debris fence"
    obj["length_m"] = end - start
    obj["panels"] = panel_count
    return obj, {
        "fenceHeightMeters": fence_height,
        "lengthMeters": round(end - start, 3),
        "panels": panel_count,
        "wallHeightMeters": wall_height,
    }


def color_from_hex(value):
    normalized = value.removeprefix("#")
    return tuple(int(normalized[index:index + 2], 16) / 255 for index in (0, 2, 4)) + (1.0,)


def shade_color(color, factor, minimum=0.03):
    return tuple(min(max(channel * factor, minimum), 1.0) for channel in color[:3]) + (color[3],)


def shifted_local_point(cx, cy, along, across, rotation, z):
    cosine, sine = math.cos(rotation), math.sin(rotation)
    return (
        cx + along * cosine - across * sine,
        cy + along * sine + across * cosine,
        z,
    )


def create_race_motorhomes(config, raster, center, base_elevation, material, collection, corridors):
    builder = MeshBuilder()
    count = 0
    glass = (0.025, 0.055, 0.075, 1.0)
    tyre = (0.018, 0.022, 0.024, 1.0)
    equipment = (0.63, 0.65, 0.64, 1.0)
    track_conflicts = 0
    track_conflict_names = []
    track_conflict_details = []

    for motorhome in config.get("raceMotorhomes", []):
        rd_x = motorhome["centerRd"]["x"]
        rd_y = motorhome["centerRd"]["y"]
        cx, cy = local_xy((rd_x, rd_y), center)
        ground = raster.sample(rd_x, rd_y) - base_elevation + 0.12
        length = motorhome["lengthMeters"]
        footprint_width = motorhome["widthMeters"]
        rotation = math.radians(motorhome["headingDeg"])
        cosine, sine = math.cos(rotation), math.sin(rotation)
        footprint = [
            (
                rd_x + along * cosine - across * sine,
                rd_y + along * sine + across * cosine,
            )
            for along, across in (
                (-length / 2, -footprint_width / 2),
                (length / 2, -footprint_width / 2),
                (length / 2, footprint_width / 2),
                (-length / 2, footprint_width / 2),
            )
        ]
        corridor_clearances = [
            min(distance_point_polygon(point, footprint) for point in samples) - half_width
            for samples, half_width in corridors
        ]
        if min(corridor_clearances) <= 0:
            track_conflicts += 1
            track_conflict_names.append(motorhome["name"])
            track_conflict_details.append({
                "clearanceMeters": round(min(corridor_clearances), 3),
                "corridor": "circuit" if corridor_clearances.index(min(corridor_clearances)) == 0 else "pitLane",
                "name": motorhome["name"],
            })
            continue
        core_width = min(footprint_width, 3.05)
        body_height = 3.65 if length >= 17 else 3.35
        body_color = color_from_hex(motorhome["color"])
        wall_color = shade_color(body_color, 0.78)
        roof_color = tuple(min(channel * 0.35 + 0.70, 0.96) for channel in body_color[:3]) + (1.0,)
        body_length = length - 3.2

        body_center = shifted_local_point(cx, cy, -1.15, 0, rotation, ground + body_height / 2)
        builder.add_box(body_center, (body_length, core_width, body_height), color=wall_color, rotation=rotation)
        roof_center = shifted_local_point(cx, cy, -1.15, 0, rotation, ground + body_height + 0.08)
        builder.add_box(roof_center, (body_length + 0.12, core_width + 0.12, 0.16), color=roof_color, rotation=rotation)

        cab_center = shifted_local_point(cx, cy, length / 2 - 1.75, 0, rotation, ground + 1.55)
        builder.add_box(cab_center, (3.5, 2.55, 3.1), color=body_color, rotation=rotation)
        windshield_center = shifted_local_point(cx, cy, length / 2 + 0.015, 0, rotation, ground + 2.15)
        builder.add_box(windshield_center, (0.07, 2.18, 0.72), color=glass, rotation=rotation)

        extension = max((footprint_width - core_width) / 2, 0.0)
        if extension > 0.12:
            for side in (-1, 1):
                slide_center = shifted_local_point(
                    cx, cy, -1.45, side * (core_width / 2 + extension / 2), rotation,
                    ground + (body_height - 0.45) / 2 + 0.22,
                )
                builder.add_box(
                    slide_center,
                    (body_length * 0.78, extension, body_height - 0.45),
                    color=shade_color(body_color, 0.88),
                    rotation=rotation,
                )

        for side in (-1, 1):
            window_center = shifted_local_point(
                cx, cy, -1.2, side * (footprint_width / 2 + 0.025), rotation, ground + 2.5,
            )
            builder.add_box(
                window_center,
                (body_length * 0.68, 0.07, 0.58),
                color=glass,
                rotation=rotation,
            )
            for axle in (-length * 0.28, -length * 0.08, length * 0.30):
                wheel_center = shifted_local_point(
                    cx, cy, axle, side * (core_width / 2 + 0.04), rotation, ground + 0.48,
                )
                builder.add_box(wheel_center, (1.05, 0.16, 0.72), color=tyre, rotation=rotation)

        for roof_position in (-length * 0.20, length * 0.10):
            equipment_center = shifted_local_point(
                cx, cy, roof_position, 0, rotation, ground + body_height + 0.28,
            )
            builder.add_box(equipment_center, (1.25, 0.78, 0.38), color=equipment, rotation=rotation)
        count += 1

    obj = builder.create_object("DutchGP_2026_Race_Motorhomes", [material], collection, vertex_colors=True)
    obj["source"] = "PDOK 2026 orthophoto georeferenced at 0.62 m/pixel; real vehicle footprints, orientations and sampled livery families"
    obj["vehicle_count"] = count
    return obj, count, {
        "configuredObjects": len(config.get("raceMotorhomes", [])),
        "renderedObjects": count,
        "remainingTrackConflicts": track_conflicts,
        "trackConflictNames": track_conflict_names,
        "trackConflictDetails": track_conflict_details,
        "sourceResolutionMetersPerPixel": 0.62,
    }


def anchor_at(name, distance, centerline, cumulative, total, raster, center, base_elevation, collection, side=1, offset=16, height=6):
    x, y = sample_polyline(centerline, cumulative, distance % total)
    tangent = sample_tangent(centerline, cumulative, distance)
    normal = Vector((-tangent.y, tangent.x)) * side
    anchor_x, anchor_y = x + normal.x * offset, y + normal.y * offset
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 2
    obj.location = (*local_xy((anchor_x, anchor_y), center), raster.sample(x, y) - base_elevation + height)
    obj["distance_m"] = distance % total
    collection.objects.link(obj)
    return obj


def create_track_annotations(config, osm_data, centerline, cumulative, total, raster, center, base_elevation, materials, collection):
    marker_builder = MeshBuilder()
    turn_anchors = []
    for turn in config["model"]["turns"]:
        side = -1 if turn["number"] in (1, 3, 4, 7, 8, 10, 14) else 1
        anchor = anchor_at(
            f"Turn_{turn['number']:02d}", turn["distanceMeters"], centerline, cumulative, total,
            raster, center, base_elevation, collection, side=side, offset=19, height=7,
        )
        anchor["turn_name"] = turn["name"]
        turn_anchors.append(anchor)

    speed = config["officialControlPoints"]["speedTrap"]
    speed_turn_distance = config["model"]["turns"][speed["turn"] - 1]["distanceMeters"]
    speed_distance = (
        speed_turn_distance + speed["afterTurnMeters"]
        if "afterTurnMeters" in speed
        else speed_turn_distance - speed["beforeTurnMeters"]
    )
    anchor_at("SpeedTrap", speed_distance, centerline, cumulative, total, raster, center, base_elevation, collection, side=-1, offset=14, height=6)

    sector_distances = []
    for boundary in config["officialControlPoints"]["sectorBoundaries"]:
        distance = boundary.get("absoluteDistanceMeters")
        if distance is None:
            distance = (
                config["model"]["turns"][boundary["turn"] - 1]["distanceMeters"]
                - boundary["beforeTurnMeters"]
            )
        sector_distances.append(distance)
        anchor_at(f"SectorBoundary_{boundary['sector']:02d}", distance, centerline, cumulative, total, raster, center, base_elevation, collection, side=1, offset=13, height=5)
        sector_index = boundary["sector"] - 1
        add_cross_track_band(
            marker_builder, centerline, cumulative, distance, raster, center, base_elevation,
            5 + sector_index, half_length=6.25, half_width=2.6, z_offset=TRACK_SURFACE_Z_OFFSET + 0.08,
        )
        add_cross_track_band(
            marker_builder, centerline, cumulative, distance, raster, center, base_elevation,
            sector_index, half_length=5.8, half_width=0.8, z_offset=TRACK_SURFACE_Z_OFFSET + 0.12,
        )

    finish_node = next((element for element in osm_data["elements"] if element.get("tags", {}).get("raceway") == "finish"), None)
    finish_distance = config["model"].get("startFinishDistanceMeters")
    if finish_distance is None:
        finish_distance = (
            nearest_distance(centerline, cumulative, rd_from_wgs84(finish_node["lat"], finish_node["lon"]))
            if finish_node
            else 335.0
        )
    anchor_at("StartFinish", finish_distance, centerline, cumulative, total, raster, center, base_elevation, collection, side=-1, offset=15, height=6)
    add_cross_track_band(
        marker_builder, centerline, cumulative, finish_distance, raster, center, base_elevation,
        5, half_length=6.25, half_width=2.6, z_offset=TRACK_SURFACE_Z_OFFSET + 0.08,
    )
    add_checkered_line(marker_builder, centerline, cumulative, finish_distance, raster, center, base_elevation, 3)

    for drs in config["officialControlPoints"]["drs"]:
        turn_distance = config["model"]["turns"][drs["turn"] - 1]["distanceMeters"]
        distance = turn_distance + drs["distanceFromTurnMeters"] if "after" in drs["kind"] else turn_distance - drs["distanceFromTurnMeters"]
        anchor_at(f"DRS_{drs['zone']}_{drs['kind'].replace('-', '_')}", distance, centerline, cumulative, total, raster, center, base_elevation, collection, side=-1, offset=11, height=4)

    marker_obj = marker_builder.create_object("FIA_Sector_And_Control_Lines", materials, collection)
    return finish_distance, sector_distances, marker_obj, turn_anchors


def add_cross_track_band(
    builder, centerline, cumulative, distance, raster, center, base_elevation, material_index,
    half_length=5.5, half_width=0.6, z_offset=TRACK_SURFACE_Z_OFFSET + 0.10,
):
    corners = [
        road_surface_point(
            centerline, cumulative, distance + longitudinal, lateral,
            raster, center, base_elevation, 10,
            z_offset=z_offset, banked=True,
        )
        for longitudinal, lateral in (
            (-half_width, half_length), (half_width, half_length),
            (half_width, -half_length), (-half_width, -half_length),
        )
    ]
    builder.add_quad(corners, material_index)


def add_checkered_line(builder, centerline, cumulative, distance, raster, center, base_elevation, material_index):
    for index in range(10):
        lateral0 = -5 + index
        lateral1 = lateral0 + 1
        for longitudinal_index in range(2):
            long0 = -0.65 + longitudinal_index * 0.65
            long1 = long0 + 0.65
            corners = [
                road_surface_point(
                    centerline, cumulative, distance + longitudinal, lateral,
                    raster, center, base_elevation, 10,
                    z_offset=TRACK_SURFACE_Z_OFFSET + 0.11, banked=True,
                )
                for longitudinal, lateral in (
                    (long0, lateral0), (long1, lateral0),
                    (long1, lateral1), (long0, lateral1),
                )
            ]
            builder.add_quad(corners, material_index if (index + longitudinal_index) % 2 == 0 else 4)


def nearest_distance(points, cumulative, target):
    nearest_index = min(range(len(points)), key=lambda index: math.hypot(points[index][0] - target[0], points[index][1] - target[1]))
    return cumulative[nearest_index]


def create_start_gantry(distance, centerline, cumulative, raster, center, base_elevation, materials, collection):
    point = sample_polyline(centerline, cumulative, distance)
    tangent = sample_tangent(centerline, cumulative, distance)
    normal = Vector((-tangent.y, tangent.x))
    lx, ly = local_xy(point, center)
    z = road_surface_point(
        centerline, cumulative, distance, 0, raster, center, base_elevation, 10,
        banked=True,
    )[2]
    rotation = math.atan2(tangent.y, tangent.x)
    builder = MeshBuilder()
    for side in (-1, 1):
        x = lx + normal.x * side * 7.0
        y = ly + normal.y * side * 7.0
        builder.add_box((x, y, z + 3.2), (0.45, 0.45, 6.4), 0, rotation=rotation)
    builder.add_box((lx, ly, z + 6.15), (0.65, 15.0, 0.7), 0, rotation=rotation)
    for index in range(5):
        offset = (index - 2) * 1.35
        x = lx + normal.x * offset
        y = ly + normal.y * offset
        builder.add_box((x, y, z + 5.65), (0.38, 0.38, 0.38), 1, rotation=rotation)
    return builder.create_object("Start_Finish_Gantry", materials, collection)


def create_extrema_anchors(centerline, cumulative, total, raster, center, base_elevation, collection):
    samples = []
    for index in range(600):
        distance = total * index / 600
        x, y = sample_polyline(centerline, cumulative, distance)
        samples.append((raster.sample(x, y), distance, x, y))
    low = min(samples)
    high = max(samples)
    for name, sample in (("LowPoint", low), ("HighPoint", high)):
        elevation, distance, x, y = sample
        obj = bpy.data.objects.new(name, None)
        obj.location = (*local_xy((x, y), center), elevation - base_elevation + 7)
        obj["distance_m"] = distance
        obj["elevation_nap_m"] = elevation
        obj["elevation_datum_m"] = elevation
        collection.objects.link(obj)
    return low, high


def create_collections():
    root = bpy.context.scene.collection
    result = {}
    for name in ("Terrain", "Circuit", "Buildings", "Infrastructure", "Grandstands", "Annotations"):
        collection = bpy.data.collections.new(name)
        root.children.link(collection)
        result[name] = collection
    return result


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def configure_scene(bounds, center, base_elevation):
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Zandvoort_World")
    scene.world.color = (0.025, 0.035, 0.045)
    scene["coordinate_reference_system"] = "EPSG:28992 + NAP"
    scene["origin_rd_x"] = center["x"]
    scene["origin_rd_y"] = center["y"]
    scene["origin_nap_z"] = base_elevation
    scene["real_world_scale"] = "1 Blender unit = 1 metre"


def add_lighting(collection):
    sun_data = bpy.data.lights.new("NorthSea_Sun", "SUN")
    sun_data.energy = 2.2
    sun_data.angle = math.radians(9)
    sun = bpy.data.objects.new("NorthSea_Sun", sun_data)
    sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(-35))
    collection.objects.link(sun)
    world = bpy.context.scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.055, 0.075, 0.095, 1)
    background.inputs["Strength"].default_value = 0.38


def render_preview(preview_path: Path, collection):
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("PreviewCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 1_790
    camera_data.lens = 52
    camera_data.clip_end = 5_000
    camera = bpy.data.objects.new("PreviewCamera", camera_data)
    camera.location = (930, -1_130, 1_170)
    look_at(camera, (0, 0, 8))
    collection.objects.link(camera)
    scene.camera = camera
    scene.render.filepath = str(preview_path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(camera_data)


def export_glb(glb_path: Path):
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_meshopt_compression_enable=True,
        export_meshopt_extension="EXT_meshopt_compression",
    )


def main():
    args = parse_args()
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
    dtm = HeightRaster(prepared_directory / "ahn4-dtm.f32le", raster_metadata["rasters"]["dtm"], bounds)
    dsm = HeightRaster(prepared_directory / "ahn4-dsm.f32le", raster_metadata["rasters"]["dsm"], bounds)
    base_elevation = float(raster_metadata["rasters"]["dtm"]["minimum"])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    collections = create_collections()
    configure_scene(bounds, center, base_elevation)

    materials = {
        "terrain": create_aerial_material(source_directory / "pdok-2026-orthohr.jpg"),
        "asphalt": create_material("Real_Asphalt", (0.095, 0.105, 0.11, 1), 0.94),
        "white": create_material("Track_White", (0.93, 0.92, 0.88, 1), 0.82),
        "curb_red": create_material("Curb_Red", (0.70, 0.018, 0.012, 1), 0.84),
        "building": create_material("Aerial_Sampled_Buildings", (1, 1, 1, 1), 0.83, use_vertex_color=True),
        "other_structure": create_material("Aerial_Sampled_Other_Structures", (1, 1, 1, 1), 0.80, metallic=0.05, use_vertex_color=True),
        "motorhome": create_material("PDOK_2026_Race_Motorhomes", (1, 1, 1, 1), 0.62, metallic=0.12, use_vertex_color=True),
        "pit_wall": create_material("Pit_Wall_Concrete", (0.64, 0.65, 0.63, 1), 0.91),
        "fence": create_material("Galvanised_Safety_Fence", (0.39, 0.43, 0.44, 0.62), 0.72, metallic=0.35),
        "tree_trunk": create_material("Tree_Trunks", (0.18, 0.105, 0.055, 1), 1.0),
        "tree_crown": create_material("Coastal_Tree_Canopies", (0.16, 0.29, 0.105, 1), 1.0),
        "mast": create_material("Light_Mast_Metal", (0.46, 0.49, 0.49, 1), 0.48, metallic=0.62),
        "lamp": create_material("Floodlight_Glass", (0.78, 0.80, 0.74, 1), 0.3, metallic=0.1),
        "structure": create_material("Circuit_Structures", (0.38, 0.40, 0.39, 1), 0.78, metallic=0.12),
        "stand_frame": create_material("Grandstand_Frame", (0.20, 0.22, 0.23, 1), 0.58, metallic=0.55),
        "seat_dark": create_material("Grandstand_Seats_Dark", (0.055, 0.065, 0.075, 1), 0.88),
        "seat_red": create_material("Grandstand_Seats_Red", (0.67, 0.02, 0.018, 1), 0.88),
        "gantry_light": create_material("Gantry_Lights", (0.88, 0.05, 0.02, 1), 0.34),
        "black": create_material("Control_Line_Black", (0.015, 0.015, 0.015, 1), 0.86),
    }
    sector_materials = [create_material(f"Sector_{index + 1}", color, 0.68) for index, color in enumerate(SECTOR_COLORS)]
    sector_glow_materials = [
        create_material(
            f"Sector_{index + 1}_Glow",
            (color[0], color[1], color[2], 0.34),
            0.48,
            emission_strength=1.4,
        )
        for index, color in enumerate(SECTOR_COLORS)
    ]

    add_terrain(bounds, center, dtm, base_elevation, materials["terrain"], collections["Terrain"])
    osm_data = load_json(source_directory / "openstreetmap-raceway.json")
    centerline = assemble_main_circuit(osm_data, config["model"]["mainCircuitWayIds"])
    track, cumulative, total_length, track_ribbon_samples = create_ribbon(
        "FIA_Circuit_Centreline_10m", centerline, dtm, center, base_elevation,
        config["model"]["trackWidthMeters"], materials["asphalt"], collections["Circuit"],
        banked=True,
    )
    track["source"] = "OpenStreetMap raceway ways, checked against FIA 4.259 km map"
    create_edge_lines(centerline, cumulative, total_length, dtm, center, base_elevation, materials["white"], collections["Circuit"])
    create_curbs(config, centerline, cumulative, total_length, dtm, center, base_elevation, [materials["curb_red"], materials["white"]], collections["Circuit"])
    _, pit_centerline, pit_quality = create_pit_lane(
        osm_data, config["model"]["pitLaneWayId"], centerline,
        dtm, center, base_elevation, materials, collections["Circuit"],
    )
    _, pit_wall_quality = create_pit_wall(
        pit_centerline, centerline, dtm, center, base_elevation,
        [materials["pit_wall"], materials["fence"]], collections["Infrastructure"],
    )
    pit_quality["pitWall"] = pit_wall_quality
    exclusion_corridors = [
        (sample_line_points(centerline, cumulative, 4.0), config["model"]["trackWidthMeters"] / 2 + 1.5),
        (sample_line_points(pit_centerline, line_distance(pit_centerline)[0], 4.0, closed=False), PIT_LANE_WIDTH_METERS / 2 + 1.5),
    ]
    _, bgt_counts, surface_quality = create_bgt_surfaces(source_directory)
    surface_quality.update(measure_ribbon_terrain_clearance(track_ribbon_samples, dtm, base_elevation))
    reserved_grandstands = grandstand_reservation_polygons(config, centerline, cumulative)
    _, building_counts, building_quality = create_buildings(
        source_directory, prepared_directory, dtm, dsm, center, base_elevation,
        materials["building"], collections["Buildings"], exclusion_corridors, reserved_grandstands,
    )
    _, fence_segments = create_fences(source_directory, dtm, center, base_elevation, materials["fence"], collections["Infrastructure"])
    _, tree_count = create_trees(source_directory, dtm, dsm, center, base_elevation, [materials["tree_trunk"], materials["tree_crown"]], collections["Infrastructure"])
    _, light_count = create_light_masts(source_directory, dtm, dsm, center, base_elevation, [materials["mast"], materials["lamp"]], collections["Infrastructure"])
    _, structure_count = create_other_structures(
        source_directory, prepared_directory, dtm, dsm, center, base_elevation,
        materials["other_structure"], collections["Infrastructure"],
    )
    _, motorhome_count, motorhome_quality = create_race_motorhomes(
        config, dtm, center, base_elevation, materials["motorhome"], collections["Infrastructure"],
        exclusion_corridors,
    )
    _, grandstand_blocks, grandstand_quality = create_grandstands(
        config, centerline, cumulative, total_length, dtm, center, base_elevation,
        [materials["stand_frame"], materials["seat_dark"], materials["seat_red"]], collections["Grandstands"],
    )
    finish_distance, sector_distances, _, _ = create_track_annotations(
        config, osm_data, centerline, cumulative, total_length, dtm, center, base_elevation,
        [
            *sector_materials,
            materials["white"],
            materials["black"],
            *sector_glow_materials,
        ],
        collections["Annotations"],
    )
    create_start_gantry(
        finish_distance, centerline, cumulative, dtm, center, base_elevation,
        [materials["structure"], materials["gantry_light"]], collections["Infrastructure"],
    )
    low, high = create_extrema_anchors(centerline, cumulative, total_length, dtm, center, base_elevation, collections["Annotations"])
    bounds_anchor = bpy.data.objects.new("SceneBounds", None)
    bounds_anchor["width_m"] = bounds["maxX"] - bounds["minX"]
    bounds_anchor["depth_m"] = bounds["maxY"] - bounds["minY"]
    bounds_anchor["minimum_elevation_nap_m"] = raster_metadata["rasters"]["dtm"]["minimum"]
    bounds_anchor["maximum_elevation_nap_m"] = raster_metadata["rasters"]["dtm"]["maximum"]
    collections["Annotations"].objects.link(bounds_anchor)

    add_lighting(collections["Terrain"])
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    render_preview(preview_path, collections["Terrain"])
    export_glb(glb_path)

    profile = []
    for index in range(160):
        distance = total_length * index / 159
        x, y = sample_polyline(centerline, cumulative, min(distance, total_length - 1e-6))
        profile.append({"distanceMeters": round(distance, 2), "elevationNapMeters": round(dtm.sample(x, y), 3)})
    metadata = {
        "boundsMeters": {"depth": bounds["maxY"] - bounds["minY"], "width": bounds["maxX"] - bounds["minX"]},
        "coordinateReferenceSystem": "EPSG:28992 + NAP",
        "elevationProfile": profile,
        "elevationsNapMeters": {"high": round(high[0], 3), "low": round(low[0], 3)},
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
            "motorhomes": motorhome_quality,
            "pitLane": pit_quality,
            "surfaceClearance": surface_quality,
        },
        "objects": {
            "bgtSurfaceFeatures": bgt_counts,
            "buildingBgtFallback": building_counts["bgtFallback"],
            "buildingLoD22": building_counts["lod22"],
            "buildingsTotal": building_counts["total"],
            "fenceSegments": fence_segments,
            "grandstandBlocks": grandstand_blocks,
            "lightMasts": light_count,
            "otherStructures": structure_count,
            "raceMotorhomes": motorhome_count,
            "trees": tree_count,
            "turnAnchors": 14,
        },
        "realWorldScale": "1 unit = 1 metre; no vertical exaggeration",
        "officialSources": config["officialSources"],
        "schemaVersion": 2,
        "sectorBoundaryDistancesMeters": [round(value, 2) for value in sector_distances],
        "sourceManifest": config["sourceManifest"],
    }
    metadata_path.write_text(f"{json.dumps(metadata, indent=2)}\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
