#!/usr/bin/env python3
"""Build the current, real-scale Circuit de Monaco web scene in Blender."""

from __future__ import annotations

import importlib.util
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

import bpy
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree
from statistics import median


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
    ) * 1.38
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


# Only generic geometry/material helpers are shared. No other circuit's scene,
# garages, grandstands or procedural motorhomes are copied into Monaco.
base.rd_from_wgs84 = utm32n_from_wgs84
spa.lambert_2008_from_wgs84 = utm32n_from_wgs84
base.TERRAIN_COLUMNS, base.TERRAIN_ROWS = 237, 305
base.TRACK_SURFACE_Z_OFFSET = 0.18
base.bank_angle = lambda _distance, _total: (0.0, 0.0)
ROAD_WIDTH = 9.0
PIT_WIDTH = 9.0


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round((len(ordered) - 1) * fraction))]


def area(ring):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1]))) / 2


def parse_height(value):
    try:
        return float(str(value).split(';')[0].replace('m', '').strip())
    except (ValueError, TypeError):
        return None


class MeasuredRaster(base.HeightRaster):
    def __init__(self, path, metadata):
        super().__init__(path, metadata, metadata['sampleBounds'])
        # WMS no-data is offshore, not the mean elevation of the principality.
        self.fallback = 0.0


class RoadProfile:
    """LiDAR at the street centre; interpolate underground sections at portals."""
    def __init__(self, points, dtm, tunnel_ranges=(), closed=True):
        self.closed = closed
        self.line = points
        self.cumulative, self.total = base.line_distance(points)
        self.count = math.ceil(self.total / 2)
        self.distances = [self.total * i / self.count for i in range(self.count + 1)]
        self.points = [base.sample_polyline(points, self.cumulative, d, closed=closed) for d in self.distances]
        self.raw = [dtm.sample(*point) for point in self.points]
        corrected = list(self.raw)
        self.tunnels = tunnel_ranges
        for start, end in tunnel_ranges:
            # Portal elevations are measured 8 m outside the roof shadow.
            entry = dtm.sample(*base.sample_polyline(points, self.cumulative, start - 8))
            exit_height = dtm.sample(*base.sample_polyline(points, self.cumulative, end + 8))
            for i, d in enumerate(self.distances):
                if start - 8 <= d <= end + 8:
                    t = (d - start + 8) / (end - start + 16)
                    corrected[i] = entry * (1 - t) + exit_height * t
        # Remove isolated DTM edge contamination, then use a 34 m triangular
        # window. Never lift the whole circuit to the surrounding hillside.
        filtered = []
        for i in range(len(corrected)):
            filtered.append(median(corrected[self.index(i + j)] for j in range(-2, 3)))
        self.targets = [sum(filtered[self.index(i + j)] * (9 - abs(j)) for j in range(-8, 9)) / 81
                        for i in range(len(filtered))]
        if closed:
            self.targets[-1] = self.targets[0]
        self.tree = kdtree.KDTree(len(self.points))
        for i, p in enumerate(self.points):
            self.tree.insert((*p, 0), i)
        self.tree.balance()
        outside = [abs(a - b) for a, b, d in zip(self.targets, self.raw, self.distances)
                   if not any(start - 16 <= d <= end + 16 for start, end in tunnel_ranges)]
        self.quality = {
            'applied': True, 'method': 'measured 1 m DTM; 34 m local smoothing; portal interpolation underground',
            'intervalMeters': self.total / self.count, 'sampleCount': len(self.points),
            'maximumCorrectionMeters': round(max(outside), 3),
            'maximumGradePercent': round(max(abs(b - a) / (self.total / self.count) * 100
                                            for a, b in zip(self.targets, self.targets[1:])), 3),
        }

    def index(self, i):
        return i % self.count if self.closed else min(max(i, 0), self.count)

    def at_distance(self, distance):
        position = min(max(distance / self.total * self.count, 0), self.count)
        i = min(int(position), self.count - 1)
        return self.targets[i] * (1 - position + i) + self.targets[i + 1] * (position - i)

    def nearest(self, x, y):
        _, nearest, _ = self.tree.find((x, y, 0))
        best = (math.inf, 0, 0)
        for i in range(max(0, nearest - 3), min(self.count, nearest + 3)):
            a, b = self.points[i], self.points[i + 1]
            dx, dy = b[0] - a[0], b[1] - a[1]
            t = min(max(((x - a[0]) * dx + (y - a[1]) * dy) / max(dx * dx + dy * dy, 1e-9), 0), 1)
            separation = math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)
            if separation < best[0]:
                best = (separation, self.targets[i] * (1 - t) + self.targets[i + 1] * t,
                        self.distances[i] * (1 - t) + self.distances[i + 1] * t)
        return best

    def sample(self, x, y):
        return self.nearest(x, y)[1]

    def sample_rendered_terrain(self, x, y):
        return self.sample(x, y)

    def underground(self, distance):
        return any(start <= distance <= end for start, end in self.tunnels)


def coastline_land_ring(source, bounds):
    raw = ET.parse(source / 'openstreetmap-map.osm').getroot()
    nodes = {e.get('id'): utm32n_from_wgs84(float(e.get('lat')), float(e.get('lon')))
             for e in raw.findall('node')}
    ways = []
    for way in raw.findall('way'):
        if any(tag.get('k') == 'natural' and tag.get('v') == 'coastline' for tag in way.findall('tag')):
            ways.append([nodes[n.get('ref')] for n in way.findall('nd') if n.get('ref') in nodes])
    chain = min(ways, key=lambda points: points[0][0])
    ways.remove(chain)
    chain = list(chain)
    while ways:
        candidate = min(ways, key=lambda points: math.dist(chain[-1], points[0]))
        if math.dist(chain[-1], candidate[0]) > 50:
            raise ValueError('Unresolved OSM coastline gap')
        ways.remove(candidate)
        chain.extend(candidate)
    # Coastline runs southwest -> northeast with land on its left. The two
    # source gaps are outside the model's southern crop, never across the port.
    return chain + [(bounds['maxX']+1000,bounds['maxY']+1000),
                    (bounds['minX']-1000,bounds['maxY']+1000),
                    (bounds['minX']-1000,bounds['minY']-1000)]


class TerrainSurface:
    """Explicit rendered mesh grid with locally embedded road corridors."""
    def __init__(self, source, bounds, road, pit, land):
        self.bounds = bounds
        self.width, self.height = base.TERRAIN_COLUMNS, base.TERRAIN_ROWS
        self.dx = (bounds['maxX'] - bounds['minX']) / (self.width - 1)
        self.dy = (bounds['maxY'] - bounds['minY']) / (self.height - 1)
        self.values = []
        self.corrections = []
        for row in range(self.height):
            y = bounds['minY'] + row * self.dy
            for col in range(self.width):
                x = bounds['minX'] + col * self.dx
                z = source.sample(x, y) if base.point_in_polygon((x, y), land) else 0.0
                original = z
                for path in (road, pit):
                    separation, target, distance = path.nearest(x, y)
                    # The tunnel has real overhead ground; only its portals join
                    # the surface mesh. A 2-cell shoulder avoids coarse triangles
                    # piercing the asphalt, without raising the racing line.
                    if separation < 13 and not path.underground(distance):
                        z = min(z, target - 0.45)
                self.values.append(z)
                self.corrections.append(z - original)

    def cell(self, x, y):
        fx = min(max((x - self.bounds['minX']) / self.dx, 0), self.width - 1)
        fy = min(max((y - self.bounds['minY']) / self.dy, 0), self.height - 1)
        col, row = min(int(fx), self.width - 2), min(int(fy), self.height - 2)
        tx, ty = fx - col, fy - row
        a = row * self.width + col
        if ty <= tx:
            return (a, a + 1, a + self.width + 1), (1 - tx, tx - ty, ty)
        return (a, a + self.width + 1, a + self.width), (1 - ty, tx, ty - tx)

    def sample(self, x, y):
        ids, weights = self.cell(x, y)
        return sum(self.values[i] * w for i, w in zip(ids, weights))

    sample_rendered_terrain = sample


def road_point(path, distance, lateral, center, offset=0):
    d = distance % path.total if path.closed else min(max(distance, 0), path.total)
    x, y = base.sample_polyline(path.line, path.cumulative, d, closed=path.closed)
    tangent = base.sample_tangent(path.line, path.cumulative, d, delta=1, closed=path.closed)
    return (x - tangent.y * lateral - center['x'], y + tangent.x * lateral - center['y'],
            path.at_distance(d) + base.TRACK_SURFACE_Z_OFFSET + offset)


def pit_half_width(path, distance):
    # Working lane tapers into a 4 m exit before the start line.
    t = min(max((distance-max(path.exit_start, 305))/35, 0), 1)
    return (4.5-2.5*t*t*(3-2*t)) * min(1, .55 + distance/24)


def create_driving_surface(path, center, builder, width, pit=False):
    for i in range(path.count):
        a, b = path.distances[i:i + 2]
        half = lambda d: pit_half_width(path, d) if pit else width/2
        builder.add_quad([road_point(path, d, lateral, center) for d, lateral in
                          [(a, half(a)), (a, -half(a)), (b, -half(b)), (b, half(b))]])


def subtract_ribbon_overlap(pit_builder, road_builder):
    """Subtract the main ribbon in XY: junctions share one opaque surface."""
    cells = {}
    triangles = [[road_builder.vertices[i] for i in face] for face in road_builder.faces]
    def keys(poly):
        return [(x,y) for x in range(math.floor(min(p[0] for p in poly)/10), math.floor(max(p[0] for p in poly)/10)+1)
                for y in range(math.floor(min(p[1] for p in poly)/10), math.floor(max(p[1] for p in poly)/10)+1)]
    for i, triangle in enumerate(triangles):
        for key in keys(triangle): cells.setdefault(key, []).append(i)
    def signed(a,b,p): return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
    def clip(poly,a,b,keep_inside):
        result=[]
        for p,q in zip(poly,poly[1:]+poly[:1]):
            dp,dq=signed(a,b,p),signed(a,b,q)
            pin,qin=(dp>=0,dq>=0) if keep_inside else (dp<=0,dq<=0)
            if pin: result.append(p)
            if pin!=qin:
                t=dp/(dp-dq)
                result.append(tuple(p[k]+(q[k]-p[k])*t for k in range(3)))
        return result
    output=base.MeshBuilder()
    for face in pit_builder.faces:
        triangle=[pit_builder.vertices[i] for i in face]
        polygons=[triangle]
        for index in sorted({i for key in keys(triangle) for i in cells.get(key, [])}):
            cutter=triangles[index]
            if signed(*cutter)<0: cutter=list(reversed(cutter))
            remaining=[]
            for poly in polygons:
                inside=poly
                for a,b in zip(cutter,cutter[1:]+cutter[:1]):
                    if len(inside)<3: break
                    outside=clip(inside,a,b,False)
                    if len(outside)>=3: remaining.append(outside)
                    inside=clip(inside,a,b,True)
            polygons=remaining
            if not polygons: break
        for poly in polygons:
            for i in range(1,len(poly)-1):
                tri=(poly[0],poly[i],poly[i+1])
                if abs(signed(*tri))>1e-7: output.add_triangle(tri)
    return output


def mark_lane_edges(builder, path, other, center, pit=False):
    for i in range(path.count):
        a,b=path.distances[i:i+2]
        if pit and (a<26 or b>path.total-3): continue
        for side in (-1,1):
            quad=[]
            covered=False
            for d, inset in ((a,.35),(a,.20),(b,.20),(b,.35)):
                half=pit_half_width(path,d) if pit else ROAD_WIDTH/2
                vertex=road_point(path,d,side*(half-inset),center,.065)
                separation,_,other_distance=other.nearest(vertex[0]+center['x'],vertex[1]+center['y'])
                other_half=ROAD_WIDTH/2 if pit else pit_half_width(other,other_distance)
                if separation<other_half+.08: covered=True
                quad.append(vertex)
            if not covered: builder.add_quad(quad)


def mark_strip(builder, path, center, start, end, lateral_a, lateral_b, material=0, offset=0.065):
    count = max(1, math.ceil(abs(end - start) / 2))
    for i in range(count):
        a, b = start + (end - start) * i / count, start + (end - start) * (i + 1) / count
        builder.add_quad([road_point(path, d, lat, center, offset) for d, lat in
                          [(a, lateral_a), (a, lateral_b), (b, lateral_b), (b, lateral_a)]], material)


def audit_and_embed(terrain, road_builders, center):
    audit = {'terrainBreakthroughSamples': 0, 'tunnelUndergroundSamples': 0, 'sampleCount': 0,
             'tunnelExcludedFromTerrainClearance': True}
    samples = []
    for builder, path in road_builders:
        for face in builder.faces:
            points = [builder.vertices[i] for i in face]
            for ia in range(5):
                for ib in range(5 - ia):
                    weights = (ia / 4, ib / 4, 1 - (ia + ib) / 4)
                    q = [sum(p[axis] * w for p, w in zip(points, weights)) for axis in range(3)]
                    x, y = q[0] + center['x'], q[1] + center['y']
                    _, _, distance = path.nearest(x, y)
                    if path.underground(distance):
                        audit['tunnelUndergroundSamples'] += int(terrain.sample(x, y) > q[2])
                        continue
                    samples.append((x, y, q[2]))
    # Enforce clearance on actual raster triangles, not a pointwise source DEM.
    # Adjust only triangles intersecting a measured driving surface.
    for _ in range(3):
        for x, y, z in samples:
            delta = terrain.sample(x, y) - z + 0.12
            if delta > 0:
                ids, _ = terrain.cell(x, y)
                for i in ids:
                    terrain.values[i] -= delta
    minimum = math.inf
    for x, y, z in samples:
        clearance = z - terrain.sample(x, y)
        minimum = min(minimum, clearance)
        audit['terrainBreakthroughSamples'] += int(clearance < 0.03)
    audit.update(sampleCount=len(samples), minimumTrackTerrainClearanceMeters=round(minimum, 4))
    return audit


def map_uv(obj, bounds, center):
    uv = obj.data.uv_layers.new(name='GovernmentOrthophoto')
    for polygon in obj.data.polygons:
        for loop_index in polygon.loop_indices:
            vertex = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = ((vertex.x + center['x'] - bounds['minX']) / (bounds['maxX'] - bounds['minX']),
                                      (vertex.y + center['y'] - bounds['minY']) / (bounds['maxY'] - bounds['minY']))


def building_rings(osm):
    ways = {e['id']: e for e in osm['elements'] if e['type'] == 'way'}
    relations = [e for e in osm['elements'] if e['type'] == 'relation']
    members = {m['ref'] for e in relations for m in e['members']}
    def ring(geometry):
        result = [utm32n_from_wgs84(p['lat'], p['lon']) for p in geometry]
        return result[:-1] if len(result) > 2 and math.dist(result[0], result[-1]) < .05 else result
    for way in ways.values():
        if way['id'] not in members and (way.get('tags', {}).get('building') or way.get('tags', {}).get('building:part')):
            if len(way.get('geometry', [])) > 3:
                yield way, [ring(way['geometry'])]
    for relation in relations:
        loops = []
        for role in ('outer', 'inner'):
            segments = [list(ways[m['ref']]['geometry']) for m in relation['members']
                        if m['type'] == 'way' and m['role'] == role and m['ref'] in ways]
            while segments:
                chain = segments.pop(0)
                while chain[0] != chain[-1]:
                    match = next(((i, False) for i, segment in enumerate(segments) if segment[0] == chain[-1]), None)
                    if match is None:
                        match = next(((i, True) for i, segment in enumerate(segments) if segment[-1] == chain[-1]), None)
                    if match is None:
                        break
                    segment = segments.pop(match[0])
                    chain.extend((list(reversed(segment)) if match[1] else segment)[1:])
                if chain[0] == chain[-1]:
                    loops.append((role, ring(chain)))
        for role, outer in loops:
            if role == 'outer':
                holes = [inner for kind, inner in loops if kind == 'inner' and base.point_in_polygon(inner[0], outer)]
                yield relation, [outer, *holes]


def create_buildings(osm, dtm, dsm, terrain, road, pit, config, center, materials, collection):
    walls, roofs = base.MeshBuilder(), base.MeshBuilder()
    rendered, excluded, facade_uvs = [], [], []
    bounds = config['model']['bounds']
    stand_polygons = [s['footprint'] for s in config['grandstands']]
    for feature, rings in building_rings(osm):
        outer = rings[0]
        identity = f"{feature['type']}/{feature['id']}"
        if not all(bounds['minX'] <= x <= bounds['maxX'] and bounds['minY'] <= y <= bounds['maxY'] for x, y in outer):
            excluded.append({'id': identity, 'reason': 'outside scene bounds'})
            continue
        if area(outer) < 12:
            excluded.append({'id': identity, 'reason': 'footprint below 12 square metres'})
            continue
        inside = lambda p: base.point_in_polygon(p, outer) and not any(base.point_in_polygon(p, h) for h in rings[1:])
        xs, ys = [p[0] for p in outer], [p[1] for p in outer]
        samples = [(x, y) for x in range(math.ceil(min(xs)), math.floor(max(xs)), 3)
                   for y in range(math.ceil(min(ys)), math.floor(max(ys)), 3) if inside((x, y))]
        if not samples:
            samples = outer
        ground = percentile([dtm.sample(*p) for p in outer], .15)
        roof_samples = [dsm.sample(*p) for p in samples if dsm.sample(*p) - dtm.sample(*p) > 2.5]
        tags = feature.get('tags', {})
        explicit = parse_height(tags.get('height'))
        levels = parse_height(tags.get('building:levels'))
        if roof_samples and len(roof_samples) >= len(samples) * .35:
            top = percentile(roof_samples, .70)
            method = 'IGN LiDAR HD MNS interior 70th percentile'
        elif explicit and 2.5 < explicit < 200:
            top, method = ground + explicit, 'OSM height (metres)'
        elif levels:
            top, method = ground + levels * 3, 'OSM levels x 3 m estimate'
        else:
            excluded.append({'id': identity, 'reason': 'no measured roof or tagged height'})
            continue
        if top < ground + 2.5:
            excluded.append({'id': identity, 'reason': 'DSM does not resolve a building above its ground'})
            continue
        conflict = False
        tunnel_building = False
        for path in (road, pit):
            for p, elevation, distance in zip(path.points, path.targets, path.distances):
                if base.distance_point_polygon(p, outer) < 4.75 and not any(base.point_in_polygon(p, h) for h in rings[1:]):
                    # Fairmont and Portier are legitimate structures ABOVE the road.
                    if any(start - 8 <= distance <= end + 8 for start, end in path.tunnels) and top > elevation + 8:
                        ground = max(ground, elevation + 5.5)
                        tunnel_building = True
                    else:
                        conflict = True
                        break
            if conflict:
                break
        if conflict or any(base.polygons_overlap(outer, stand) for stand in stand_polygons):
            excluded.append({'id': identity, 'reason': 'current driving corridor' if conflict else 'reserved 2026 grandstand footprint'})
            continue
        vectors = [[Vector((x - center['x'], y - center['y'], top)) for x, y in ring] for ring in rings]
        roof_triangles = list(base.resolved_tessellation(vectors))
        if not roof_triangles:
            excluded.append({'id': identity, 'reason': 'unresolved polygon tessellation'})
            continue
        for triangle in roof_triangles:
            a, b, c = triangle
            if (b - a).cross(c - a).z < 0:
                triangle = tuple(reversed(triangle))
            roofs.add_triangle(triangle)
        for ring_index, ring in enumerate(rings):
            signed = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1]))
            loop = list(reversed(ring)) if (signed < 0) == (ring_index == 0) else ring
            storeys = max(1, round((top-ground)/3.2))
            storey_height = (top-ground)/storeys
            variant = feature['id'] % 4
            for a, b in zip(loop, loop[1:] + loop[:1]):
                lower = min(ground, terrain.sample(*a), terrain.sample(*b)) - .25
                if tunnel_building:
                    lower = ground
                bays = max(1, round(math.dist(a, b)/2.7))
                uv_quad = [(0,(lower-ground)/storey_height),(bays,(lower-ground)/storey_height),
                           (bays,storeys),(0,storeys)]
                quad = [(a[0]-center['x'],a[1]-center['y'],lower),
                                (b[0]-center['x'],b[1]-center['y'],lower),
                                (b[0]-center['x'],b[1]-center['y'],top),
                                (a[0]-center['x'],a[1]-center['y'],top)]
                for indices in ((0,1,2),(0,2,3)):
                    before = len(walls.faces)
                    walls.add_triangle([quad[i] for i in indices],variant)
                    if len(walls.faces) > before:
                        facade_uvs.append([uv_quad[i] for i in indices])
        rendered.append({'id': identity, 'name': tags.get('name', ''), 'roofElevationMeters': round(top, 2),
                         'groundElevationMeters': round(ground, 2), 'heightMethod': method,
                         'rings': len(rings), 'footprintAreaSquareMeters': round(area(outer), 1)})
    wall_obj = walls.create_object('Monaco_Current_OSM_Buildings', materials['facades'], collection)
    uv = wall_obj.data.uv_layers.new(name='FacadeStoreysAndBays')
    for polygon, face_uv in zip(wall_obj.data.polygons, facade_uvs):
        for loop_index, coordinate in zip(polygon.loop_indices, face_uv):
            uv.data[loop_index].uv = coordinate
    roof_obj = roofs.create_object('Monaco_Measured_Roofs', [materials['terrain']], collection)
    map_uv(roof_obj, bounds, center)
    return {'rendered': rendered, 'excluded': excluded, 'renderedCurrentFootprints': len(rendered),
            'roofedFootprints': len(rendered), 'opaqueRoofMaterial': True,
            'facades': {'texturedFootprints': len(rendered), 'texturedWallTriangles': len(facade_uvs),
                        'materialVariants': 4, 'coverage': 'All exterior and courtyard walls',
                        'method': 'Original reconstructed plaster, framed windows, shutters and balcony rails; per-wall bay UVs, estimated 3.2 m storeys; not photographic survey'},
            'remainingTrackConflicts': 0, 'downwardFacingRoofTriangles': 0,
            'measuredRoofCount': sum('IGN' in b['heightMethod'] for b in rendered),
            'multipolygonCount': sum(b['id'].startswith('relation/') for b in rendered)}


def prepare_stand_platforms(config, terrain, dtm):
    for stand in config['grandstands']:
        polygon = stand['footprint']
        a, b, c, d = [Vector(p) for p in polygon]
        samples = [dtm.sample(*(a.lerp(b, i / 8).lerp(d.lerp(c, i / 8), j / 8)))
                   for i in range(9) for j in range(9)]
        level = percentile(samples, .25)
        if stand['group'] in ('N', 'O', 'P'):
            level = 1.6  # continuous quay-supported temporary platforms over water
        for row in range(terrain.height):
            y = terrain.bounds['minY'] + row * terrain.dy
            if y < min(p[1] for p in polygon) - 5 or y > max(p[1] for p in polygon) + 5:
                continue
            for col in range(terrain.width):
                x = terrain.bounds['minX'] + col * terrain.dx
                if base.distance_point_polygon((x, y), polygon) < 4:
                    terrain.values[row * terrain.width + col] = level


def create_grandstands(config, terrain, road, pit, center, material, collection):
    builder = base.MeshBuilder()
    audit = []
    reservations = []
    for stand in config['grandstands']:
        polygon = stand['footprint']
        a, b, c, d = [Vector(p) for p in polygon]
        ground_samples = [terrain.sample(*p) for p in polygon]
        floor = max(ground_samples) + .18
        # Each row is level. Supports reach the terrain instead of floating.
        n = stand['rows']
        for i in range(n):
            t0, t1 = i / n, (i + 1) / n
            q = [a.lerp(d, t0), b.lerp(c, t0), b.lerp(c, t1), a.lerp(d, t1)]
            height = floor + (i + 1) / n * stand['heightMeters']
            bottom = [(*base.local_xy(p, center), floor - .12) for p in q]
            top = [(*base.local_xy(p, center), height) for p in q]
            builder.add_volume(bottom, top, color=(.13, .24, .38, 1))
            # Metallic seating treads; actual blue stands, not arbitrary red.
            builder.add_quad([(*p[:2], p[2]+.015) for p in top], color=(.24,.38,.53,1))
        for j in range(5):
            for front, rear in ((a, d), (b, c)):
                p = front.lerp(rear, j / 4)
                z = terrain.sample(*p)
                builder.add_box((*base.local_xy(p, center), (floor+z)/2),(.22,.22,max(.1,floor-z)),color=(.33,.35,.36,1))
        if stand['covered']:
            # L Belvédère and T hospitality are confirmed by the ACM 2026 plan.
            roof_z = floor + stand['heightMeters'] + 2.7
            bottom = [(*base.local_xy(p, center), roof_z) for p in polygon]
            builder.add_volume(bottom, [(*p[:2],p[2]+.25) for p in bottom], color=(.87,.86,.82,1))
            for p in polygon:
                builder.add_box((*base.local_xy(p, center),(floor+roof_z)/2),(.22,.22,roof_z-floor),color=(.33,.35,.36,1))
        clearance = min(base.distance_point_polygon(p, polygon) - (pit_half_width(path,d) if path is pit else ROAD_WIDTH/2)
                        for path in (road,pit) for p,d in zip(path.points,path.distances))
        overlaps = [name for name, other in reservations if base.polygons_overlap(polygon, other)]
        audit.append({'name':stand['name'], 'group':stand['group'], 'minimumDrivingClearanceMeters':round(clearance,3),
                      'overlaps':overlaps,'maximumSupportHeightMeters':round(floor-min(ground_samples),3), 'rows':n})
        reservations.append((stand['name'], polygon))
    builder.create_object('Monaco_2026_Current_Grandstands', [material], collection, vertex_colors=True)
    return {'groups':sorted(set(s['group'] for s in config['grandstands'])), 'sections':audit,
            'blockOverlapPairs':sum(len(s['overlaps']) for s in audit),
            'minimumTrackClearanceMeters':min(s['minimumDrivingClearanceMeters'] for s in audit),
            'sourceMap':'ACM official 2026 engineering plan and hospitality map',
            'heightMethod':'reconstructed seating rows; see event-layout source uncertainty'}


def create_pit_complex(config, pit, terrain, center, material, collection):
    builder = base.MeshBuilder()
    layout = config['eventLayout']['pitGarages']
    garages = layout['teams'] + [{'team':'FIA', 'distanceMeters':64}, {'team':'FIA/FOM','distanceMeters':46}]
    footprints = []
    for garage in garages:
        d = garage['distanceMeters']
        p = road_point(pit,d,10.1,center,-.18)
        floor = p[2]
        height = layout['heightMeters']
        def q(distance, lateral, z):
            point = road_point(pit, distance, lateral, center)
            return (point[0], point[1], z)
        # The real row follows a curved street. Following the front edge avoids
        # rotated box corners protruding into the narrow Monaco fast lane.
        for i in range(10):
            da, db = d - 7.5 + i * 1.5, d - 7.5 + (i + 1) * 1.5
            bottom = [q(dd, lat, floor) for dd, lat in [(da,5.2),(db,5.2),(db,15.4),(da,15.4)]]
            builder.add_volume(bottom, [(*v[:2], floor+height) for v in bottom], color=(.73,.72,.68,1))
            roof = [q(dd,lat,floor+height) for dd,lat in [(da,5.0),(db,5.0),(db,15.6),(da,15.6)]]
            builder.add_volume(roof,[(*v[:2],v[2]+.2) for v in roof],color=(.89,.88,.84,1))
            for za,zb in [(3.8,5.5),(6.8,8.6)]:
                builder.add_quad([q(da,5.17,floor+za),q(db,5.17,floor+za),q(db,5.17,floor+zb),q(da,5.17,floor+zb)],color=(.17,.2,.22,1))
        for along in (-5.1,0,5.1):
            da,db=d+along-2.4,d+along+2.4
            builder.add_quad([q(da,5.16,floor+.15),q(db,5.16,floor+.15),q(db,5.16,floor+3.4),q(da,5.16,floor+3.4)],color=(.08,.105,.12,1))
        footprints.append({'team':garage['team'],'distanceMeters':d,'widthMeters':15,'depthMeters':10.2})
    builder.create_object('Monaco_2026_11_Team_Pit_Complex',[material],collection,vertex_colors=True)
    return {'garageBoxes':11,'controlUnits':2,'coveredGrandstand':False,'garages':footprints,
            'dimensionsSource':'FIA 2026 media kit PDF page 31; garage type 1 15 x 10.2 m',
            'canopyMaterialOpaque':True}


def create_start_gantry(road, center, material, collection):
    # Control-line position is surveyed in OSM and checked against FIA Document 7.
    # Frame dimensions are a reconstruction; keep the full driving envelope open.
    builder = base.MeshBuilder()
    p = road_point(road, 0, 0, center)
    tangent = base.sample_tangent(road.line, road.cumulative, 0)
    angle = math.atan2(tangent.y, tangent.x)
    for lateral in (-10.8, 6.2):
        leg = road_point(road, 0, lateral, center)
        builder.add_box((leg[0], leg[1], p[2] + 3.4), (.35, .35, 6.8), color=(.55,.57,.57,1), rotation=angle)
    beam = road_point(road, 0, -2.3, center)
    builder.add_box((beam[0], beam[1], p[2] + 6.5), (.55, 17.4, .6), color=(.32,.35,.34,1), rotation=angle)
    for i in range(5):
        light = road_point(road, 0, (i - 2) * .65, center)
        builder.add_box((light[0], light[1], p[2] + 6.0), (.25, .35, .6), color=(.025,.025,.025,1), rotation=angle)
    builder.create_object('Monaco_Start_Finish_Gantry', [material], collection, vertex_colors=True)


def open_tunnel_terrain(terrain_object, config, road, center):
    # A height field cannot represent an underpass. Remove its triangles inside
    # the tunnel, instead of leaving an opaque terrain curtain in each opening.
    cutter = base.MeshBuilder()
    for key in ('tunnel','portierCover'):
        zone = config['model'][key]
        start,end = zone['startDistanceMeters']-6,zone['endDistanceMeters']+6
        count = math.ceil((end-start)/3)
        for i in range(count):
            a,b=start+(end-start)*i/count,start+(end-start)*(i+1)/count
            cutter.add_quad([road_point(road,d,lat,center) for d,lat in ((a,6.2),(a,-6.2),(b,-6.2),(b,6.2))])
    mesh = terrain_object.data
    original = base.MeshBuilder()
    original.vertices = [tuple(v.co) for v in mesh.vertices]
    original.faces = [tuple(p.vertices) for p in mesh.polygons]
    opened = subtract_ribbon_overlap(original,cutter)
    mesh.clear_geometry()
    mesh.from_pydata(opened.vertices,[],opened.faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    map_uv(terrain_object,config['model']['bounds'],center)


def create_tunnels(config, road, center, material, collection):
    builder, roadbed = base.MeshBuilder(), base.MeshBuilder()
    ranges = [config['model']['tunnel'], config['model']['portierCover']]
    portals = []
    for zone in ranges:
        # A short entrance collar brings the frame clear of the overhanging
        # LoD1 hotel footprint; the source tunnel range remains unchanged.
        start,end=zone['startDistanceMeters']-6,zone['endDistanceMeters']
        count=math.ceil((end-start)/4)
        for i in range(count):
            a,b=start+(end-start)*i/count,start+(end-start)*(i+1)/count
            roof=[road_point(road,d,lat,center,6.1) for d,lat in [(a,6.5),(a,-6.5),(b,-6.5),(b,6.5)]]
            builder.add_volume(roof,[(*p[:2],p[2]+.35) for p in roof],color=(.28,.29,.28,1))
            # Continuous inner wall and sea-facing open colonnade.
            wall=[road_point(road,d,lat,center,-.25) for d,lat in [(a,-6.5),(a,-6.2),(b,-6.2),(b,-6.5)]]
            builder.add_volume(wall,[(*p[:2],p[2]+6.35) for p in wall],color=(.23,.24,.23,1))
            if i%2==0:
                p=road_point(road,a,6.3,center)
                builder.add_box((p[0],p[1],p[2]+3),(.55,.55,6),color=(.43,.44,.42,1))
        # Roadbed / shoulders close the opening in the terrain beneath the road,
        # and follow exactly the same grade as the approaching racing surface.
        count=math.ceil((end-start+16)/2)
        for i in range(count):
            a,b=start-8+(end-start+16)*i/count,start-8+(end-start+16)*(i+1)/count
            roadbed.add_quad([road_point(road,d,lat,center,-.18) for d,lat in ((a,6.5),(a,-6.5),(b,-6.5),(b,6.5))])
        for distance in (start,end):
            def volume(lateral_a,lateral_b,lower,upper):
                q=[road_point(road,d,lat,center,lower) for d,lat in ((distance-.6,lateral_a),(distance-.6,lateral_b),(distance+.6,lateral_b),(distance+.6,lateral_a))]
                builder.add_volume(q,[(*p[:2],p[2]+upper-lower) for p in q],color=(.53,.54,.51,1))
            volume(-7,-5.9,-.25,7)
            volume(5.9,7,-.25,7)
            volume(-5.9,5.9,5.3,7)
            point = road_point(road,distance,0,center)
            tangent = base.sample_tangent(road.line,road.cumulative,distance,delta=1)
            portals.append({'distanceMeters':distance,'clearWidthMeters':11.8,'clearHeightMeters':5.3,
                            'position':[point[0],point[2],-point[1]],'direction':[tangent.x,0,-tangent.y]})
    builder.create_object('Monaco_Tunnel_Shell',[material],collection,vertex_colors=True)
    roadbed.create_object('Monaco_Tunnel_Roadbed',[base.create_material('Monaco_Tunnel_Shoulder',(.09,.095,.095,1))],collection)
    return {'lengthMeters':round(ranges[0]['endDistanceMeters']-ranges[0]['startDistanceMeters'],2),
            'portierCoverLengthMeters':18,'roofed':True,'source':'OSM tunnel-tagged raceway members',
            'portals':portals,'portalDimensionsSurveyed':False,'entranceCollarMeters':6,'terrainOpenings':True,
            'ranges':ranges,'roadHeightMethod':'DTM measured portal interpolation; no underground LiDAR available'}


def create_safety_barriers(road,pit,center,material,collection):
    builder=base.MeshBuilder();count=0
    for path in (road,pit):
        step=4 if path is road else 5
        for i in range(math.ceil(path.total/step)):
            a,b=i*step,min((i+1)*step,path.total)
            if path.underground(a):continue
            if path is pit and not 35<=a<=290:continue
            for side in (-1,1):
                if path is pit and side==1:continue # open working lane in front of garages
                # Do not put a main-circuit wall across the pit entry/exit.
                point=base.sample_polyline(path.line,path.cumulative,(a+b)/2,closed=path.closed)
                if path is road and pit.nearest(*point)[0]<12:continue
                q=[road_point(path,d,side*lat,center,-.1) for d,lat in [(a,5.15),(a,5.45),(b,5.45),(b,5.15)]]
                builder.add_volume(q,[(*p[:2],p[2]+.72) for p in q],color=(.48,.5,.5,1))
                p=road_point(path,a,side*5.35,center,.65)
                builder.add_box((p[0],p[1],p[2]+.65),(.1,.1,1.3),color=(.22,.25,.27,1))
                # Open rail mesh, not a transparent solid surface.
                for h in (1.0,1.5,1.95):
                    aa=road_point(path,a,side*5.35,center,h);bb=road_point(path,b,side*5.35,center,h)
                    builder.add_quad([aa,bb,(bb[0],bb[1],bb[2]+.045),(aa[0],aa[1],aa[2]+.045)],color=(.28,.3,.31,1))
                count+=1
    builder.create_object('Monaco_Pit_Wall_And_Track_Barriers',[material],collection,vertex_colors=True)
    return count


def export_glb(path):
    # Blender 5.2 defaults to a 12-bit shared-vector exponential filter. At
    # kilometre-scale coordinates that rounds XYZ to 0.5 m, collapsing the
    # 17 cm edge paint and its 4 cm clearance. Keep position error below 8 mm
    # across this scene; leave normals and other attributes at their defaults.
    from io_scene_gltf2.io.exp import meshopt
    encode_attribute = meshopt.MeshoptEncoder.encode_attribute

    def encode_precise_positions(attribute_name, data, byte_stride, settings):
        previous = meshopt.EXP_FILTER_BITS
        try:
            if attribute_name == "POSITION":
                meshopt.EXP_FILTER_BITS = 18
            return encode_attribute(attribute_name, data, byte_stride, settings)
        finally:
            meshopt.EXP_FILTER_BITS = previous

    meshopt.MeshoptEncoder.encode_attribute = staticmethod(encode_precise_positions)
    try:
        base.export_glb(path)
    finally:
        meshopt.MeshoptEncoder.encode_attribute = staticmethod(encode_attribute)


def main():
    args=base.parse_args();config=load_json(Path(args.input));prepared=Path(args.prepared).resolve()
    source=Path(config['sourceDirectory']);bounds=config['model']['bounds'];center=config['model']['center']
    rm=load_json(prepared/'raster-metadata.json')
    dtm=MeasuredRaster(prepared/'monaco-dtm.f32le',rm['rasters']['dtm'])
    dsm=MeasuredRaster(prepared/'monaco-dsm.f32le',rm['rasters']['dsm'])
    osm=load_json(source/'openstreetmap-raceway.json')
    line=spa.rotate_closed_polyline(base.assemble_main_circuit(osm,config['model']['mainCircuitWayIds']),config['model']['sourceStartFinishOffsetMeters'])
    tunnels=[(config['model'][key]['startDistanceMeters'],config['model'][key]['endDistanceMeters']) for key in ('tunnel','portierCover')]
    road=RoadProfile(line,dtm,tunnels)
    pit_points=config['model']['pitLaneGeometry']['points']
    pit=RoadProfile(pit_points,dtm,closed=False)
    pit.exit_start = config['model']['pitLaneGeometry']['exitStartMeters']
    # Coincident junctions use the exact main-road elevation.
    for i,d in enumerate(pit.distances):
        separation,target,_=road.nearest(*pit.points[i])
        if separation<18:
            blend=min(max((18-separation)/5,0),1)
            pit.targets[i]=pit.targets[i]*(1-blend)+target*blend
        edge=min(d,pit.total-d)
        if edge<18:
            target=road.sample(*pit.points[i]);t=edge/18
            pit.targets[i]=target*(1-t)+pit.targets[i]*t
    terrain=TerrainSurface(dtm,bounds,road,pit,coastline_land_ring(source,bounds))
    prepare_stand_platforms(config,terrain,dtm)
    rb,pb=base.MeshBuilder(),base.MeshBuilder()
    create_driving_surface(road,center,rb,ROAD_WIDTH)
    create_driving_surface(pit,center,pb,PIT_WIDTH,True)
    pb=subtract_ribbon_overlap(pb,rb)
    clearance=audit_and_embed(terrain,[(rb,road),(pb,pit)],center)
    print('PROFILE',json.dumps(road.quality), 'CLEARANCE',json.dumps(clearance),flush=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    collections=base.create_collections();configure_scene(bounds,center,0)
    def material(name,color,**kwargs):return base.create_material(name,color,**kwargs)
    m={
      'terrain':base.create_aerial_material(prepared/'monaco-government-orthophoto.jpg'),
      'asphalt':material('Monaco_Street_Circuit_Asphalt',(.085,.089,.092,1)),
      'white':material('Monaco_Track_White',(.9,.89,.86,1)),
      'red':material('Monaco_Curb_Red',(.65,.025,.018,1)),
      'black':material('Monaco_Control_Black',(.012,.014,.016,1)),
      'structure':material('Monaco_Grandstand_Frame',(1,1,1,1),use_vertex_color=True),
      'wall':material('Monaco_Pit_Wall_Concrete',(1,1,1,1),use_vertex_color=True),
      'tunnel':material('Monaco_Tunnel_Concrete',(1,1,1,1),use_vertex_color=True),
    }
    m['facades'] = [base.create_aerial_material(prepared/f'monaco-facade-{i}.jpg') for i in range(4)]
    for i, facade in enumerate(m['facades']):
        facade.name = 'Monaco_Current_OSM_Buildings' if i == 0 else f'Monaco_Reconstructed_Facade_{i}'
    m['terrain'].name='Terrain_Monaco_Government_Orthophoto_2020'
    terr=base.add_terrain(bounds,center,terrain,0,m['terrain'],collections['Terrain']);terr.name='Monaco_IGN69_LiDAR_Terrain';terr.data.name='Monaco_IGN69_LiDAR_Terrain_Mesh'
    open_tunnel_terrain(terr,config,road,center)
    rb.create_object('FIA_Monaco_Centreline_9m',[m['asphalt']],collections['Circuit'])
    pb.create_object('Monaco_Pit_Lane',[m['asphalt']],collections['Circuit'])
    paint=base.MeshBuilder()
    mark_lane_edges(paint,road,pit,center)
    mark_lane_edges(paint,pit,road,center,pit=True)
    mark_strip(paint,pit,center,35,295,.35,.5)
    for garage in config['eventLayout']['pitGarages']['teams']:
        d=garage['distanceMeters'];mark_strip(paint,pit,center,d-6,d+6,4.15,4.30)
        for edge in (d-6,d+6):mark_strip(paint,pit,center,edge,edge+.14,.6,4.3)
    road_vertices = rb.vertices + pb.vertices
    road_faces = rb.faces + [tuple(i+len(rb.vertices) for i in face) for face in pb.faces]
    road_bvh = BVHTree.FromPolygons(road_vertices, road_faces, all_triangles=True)
    fitted_paint = base.MeshBuilder()
    paint_junction_gaps = []
    for face in paint.faces:
        original = [paint.vertices[i] for i in face]
        projected = []
        for vertex in original:
            hit, _, _, _ = road_bvh.ray_cast((vertex[0],vertex[1],1000),(0,0,-1))
            if hit is None:
                raise ValueError(f"Paint outside its driving surface: {vertex}; road={road.nearest(vertex[0]+center['x'],vertex[1]+center['y'])}; pit={pit.nearest(vertex[0]+center['x'],vertex[1]+center['y'])}")
            projected.append((vertex[0],vertex[1],hit.z+.065))
        crosses_join = False
        for weights in ((1/3,1/3,1/3),(.8,.1,.1),(.1,.8,.1),(.1,.1,.8)):
            q = [sum(p[axis]*w for p,w in zip(projected,weights)) for axis in range(3)]
            hit, _, _, _ = road_bvh.ray_cast((q[0],q[1],1000),(0,0,-1))
            if hit is not None and q[2]-hit.z < .035:
                xy = (q[0]+center['x'],q[1]+center['y'])
                if max(road.nearest(*xy)[0],pit.nearest(*xy)[0]) > 5:
                    raise ValueError('Paint support changed outside a pit junction')
                crosses_join = True
        if crosses_join:
            # Edge lines end where lanes join. Do not paint across the small
            # road/pit seam or hide it with an arbitrary vertical lift.
            paint_junction_gaps.append([round(sum(p[a] for p in original)/3,3) for a in range(2)])
        else:
            fitted_paint.add_triangle(projected)
    if len(paint_junction_gaps) > 12:
        raise ValueError('Unexpected number of pit-junction paint gaps')
    paint = fitted_paint
    paint.create_object('FIA_Pit_Lane_And_Road_Markings',[m['white']],collections['Circuit'])
    curbs=base.MeshBuilder()
    # Confirmed chicane/apex kerbs; no invented full-lap red/white ribbon.
    curb_sides={1:-1,4:-1,6:1,7:-1,8:-1,10:1,11:-1,13:1,14:-1,15:-1,16:1,18:-1,19:-1}
    for turn in config['model']['turns']:
        side=curb_sides.get(turn['number'])
        if side is None:continue
        for i in range(12):
            d=turn['distanceMeters']-9+i*1.5
            mark_strip(curbs,road,center,d,d+1.5,side*4.35,side*5.0,i%2,.07)
    curbs.create_object('Monaco_Apex_Kerbs',[m['red'],m['white']],collections['Circuit'])
    building_quality=create_buildings(load_json(source/'openstreetmap-buildings.json'),dtm,dsm,terrain,road,pit,config,center,m,collections['Buildings'])
    print('BUILDINGS',building_quality['renderedCurrentFootprints'], 'MULTIPOLYGONS',building_quality['multipolygonCount'],flush=True)
    stands=create_grandstands(config,terrain,road,pit,center,m['structure'],collections['Grandstands'])
    pit_complex=create_pit_complex(config,pit,terrain,center,m['structure'],collections['Infrastructure'])
    tunnel_quality=create_tunnels(config,road,center,m['tunnel'],collections['Infrastructure'])
    fences=create_safety_barriers(road,pit,center,m['wall'],collections['Infrastructure'])
    create_start_gantry(road,center,m['structure'],collections['Infrastructure'])
    sector_colors=[(.85,.02,.01,1),(.88,.53,.06,1),(.15,.64,.79,1)]
    sectors=[material(f'Sector_{i+1}',color) for i,color in enumerate(sector_colors)]
    glows=[material(f'Sector_{i+1}_Glow',(*color[:3],.3),emission_strength=1.4) for i,color in enumerate(sector_colors)]
    finish,sector_distances,_,_=base.create_track_annotations(config,osm,line,road.cumulative,road.total,road,center,0,[*sectors,m['white'],m['black'],*glows],collections['Annotations'])
    base.create_extrema_anchors(line,road.cumulative,road.total,road,center,0,collections['Annotations'])
    # Separate height labels from the nearby T4/T17 markers without moving the
    # measured positions in plan; the actual height stays in anchor userData.
    for name in ('HighPoint', 'LowPoint'):
        bpy.data.objects[name].location.z += 48
    # Orthophoto remains the ground/roof colour source. Trees are measured OSM
    # points with LiDAR canopy heights, with all racing corridors reserved.
    trees=base.MeshBuilder();tree_count=0
    for e in load_json(source/'openstreetmap-trees.json')['elements']:
        if e['type']!='node':continue
        x,y=utm32n_from_wgs84(e['lat'],e['lon'])
        if not (bounds['minX']<x<bounds['maxX'] and bounds['minY']<y<bounds['maxY']):continue
        if min(road.nearest(x,y)[0],pit.nearest(x,y)[0])<9:continue
        z=dtm.sample(x,y);height=dsm.sample(x,y)-z
        if not 3<height<25:continue
        if any(base.point_in_polygon((x,y),s['footprint']) for s in config['grandstands']):continue
        trees.add_cylinder((x-center['x'],y-center['y'],z),.22,height*.7,sides=5,color=(.2,.15,.09,1))
        trees.add_cylinder((x-center['x'],y-center['y'],z+height*.4),min(height*.24,4),height*.6,sides=6,color=(.14,.25,.1,1));tree_count+=1
    trees.create_object('Monaco_Mapped_LiDAR_Trees',[m['structure']],collections['Infrastructure'],vertex_colors=True)
    scene_bounds=bpy.data.objects.new('SceneBounds',None);scene_bounds['width_m']=1180;scene_bounds['depth_m']=1520;collections['Annotations'].objects.link(scene_bounds)
    base.add_lighting(collections['Terrain'])
    preview,glb,metadata_path=Path(args.preview).resolve(),Path(args.glb).resolve(),Path(args.metadata).resolve()
    preview.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(prepared/'monaco-review.blend'))
    render_preview(preview,collections['Terrain'],bounds)
    export_glb(glb)
    profile=[{'distanceMeters':round(d,4),'elevationMeters':round(z,4)} for d,z in zip(road.distances,road.targets)]
    pit_profile=[{'distanceMeters':round(d,4),'elevationMeters':round(z,4)} for d,z in zip(pit.distances,pit.targets)]
    metadata={
      'schemaVersion':6,'generatedWith':f'Blender {bpy.app.version_string}',
      'coordinateReferenceSystem':'EPSG:32632','verticalDatum':'IGN69 (EPSG:5720)',
      'realWorldScale':'1 unit = 1 metre; no vertical exaggeration','verticalExaggeration':1,'baseElevationMeters':0,
      'boundsMeters':{'width':1180,'depth':1520},'sourceManifest':config['sourceManifest'],'officialSources':config['officialSources'],
      'lapLength':{'geometryMeters':round(road.total,3),'officialFiaMeters':3337,'relativeErrorPercent':round(abs(road.total-3337)/3337*100,4)},
      'finishDistanceMeters':finish,'sectorBoundaryDistancesMeters':sector_distances,
      'turnAnchorDistancesMeters':[t['distanceMeters'] for t in config['model']['turns']],
      'turnAnchors': [{'number':t['number'], 'offsetMeters':t['anchorOffsetMeters'], 'heightMeters':t['anchorHeightMeters']} for t in config['model']['turns']],
      'elevationProfile':profile,'pitElevationProfile':pit_profile,
      'elevationsMeters':{'high':round(max(road.targets),3),'low':round(min(road.targets),3)},
      'objects':{'buildingsTotal':building_quality['renderedCurrentFootprints'],'mappedGrandstands':len(stands['groups']),
                 'grandstandSections':len(config['grandstands']),'pitGarageBoxes':11,'pitControlUnits':2,
                 'turnAnchors':19,'tunnelShells':2,'startGantries':1,'fenceSegments':fences,'mappedTrees':tree_count,'raceMotorhomes':0},
      'layoutQuality':{'buildings':building_quality,'grandstands':stands,'surfaceClearance':clearance,
        'surfaceSmoothing':{'wholeLap':road.quality},'terrainSurface':{**rm['terrainSurface'],'orthophoto':rm['orthophoto'],'rasters':rm['rasters']},'tunnel':tunnel_quality,
        'pitLane':{'exitGeometry':{k:v for k,v in config['model']['pitLaneGeometry'].items() if k != 'points'},'lengthMeters':round(pit.total,3),'pitBoxes':11,'fastLaneSeparator':True,'pitComplex':pit_complex,
                   'entryGapMeters':round(road.nearest(*pit.points[0])[0],3),'exitGapMeters':round(road.nearest(*pit.points[-1])[0],3),
                   'pitWall':{'placement':'harbour side of pit fast lane; garage side open','physicalSeparator':True}},
        'paint':{'pitJunctionEdgeTerminations':paint_junction_gaps},
        'paddock':config['eventLayout']['paddock']},
      'limitations':[
        'Ground and roofs use public government Orthophoto 2020 (2019/2015 source areas); LiDAR acquired May/June 2021. Neither is a 2026 aerial survey.',
        'All building walls use original reconstructed facade textures with windows, frames and plaster; these are illustrative, not photographs of individual addresses. Roof colour remains the registered orthophoto.',
        'Tunnel portal frames (11.8 m clear width, 5.3 m clear height) are reconstructed, not surveyed. Underground road elevation interpolates measured portals. A constant 9 m racing ribbon is a simplified driving surface, not a surveyed barrier-to-barrier width.',
        'Temporary stands are traced from ACM 2026 plans and aligned to permanent quay/pool edges; estimated position uncertainty 5 m, height uncertainty 2 m.',
        'Garage height is estimated at 9.3 m from the confirmed three storeys. The start-light frame is reconstructed at the control line; frame dimensions are not surveyed.',
        '2026 paddock location on Quai Antoine Ier is confirmed, but individual team motorhome footprints and heights are not in the retrieved plans. Speculative motorhomes were removed; quay remains visible in the orthophoto.',
        'Small signs, individual spectators, event yacht positions and sponsor graphics are omitted.',
      ],
    }
    metadata_path.write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps({k:metadata[k] for k in ('lapLength','elevationsMeters','objects')},indent=2))
    print('GRANDSTANDS',json.dumps(stands),flush=True)


if __name__=='__main__':
    main()
