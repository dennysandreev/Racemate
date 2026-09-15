#!/usr/bin/env python3
"""Madring: native municipal CAD + June 2026 LiDAR/ortho + measured LoD2.

Only mesh primitives are shared with Zandvoort. No Dutch geometry, datum,
buildings, controls or event inventory is used by this builder.
"""
from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector, geometry
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

SPEC = importlib.util.spec_from_file_location("track_mesh_primitives", Path(__file__).with_name("build-zandvoort-digital-twin.py"))
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)
base.TERRAIN_COLUMNS, base.TERRAIN_ROWS = 181, 250
base.TRACK_SURFACE_Z_OFFSET = 0.18
base.PIT_LANE_WIDTH_METERS = 12
base.PIT_LANE_TAPER_METERS = 35


def utm30(lat, lon):
    a, f, k = 6378137, 1 / 298.257223563, 0.9996
    e = f * (2-f)
    ep = e / (1-e)
    p, dl = math.radians(lat), math.radians(lon+3)
    s, c, t = math.sin(p), math.cos(p), math.tan(p)
    n, tt, cc, aa = a / math.sqrt(1-e*s*s), t*t, ep*c*c, c*dl
    m = a*((1-e/4-3*e*e/64-5*e**3/256)*p-(3*e/8+3*e*e/32+45*e**3/1024)*math.sin(2*p)+(15*e*e/256+45*e**3/1024)*math.sin(4*p)-35*e**3/3072*math.sin(6*p))
    return (500000+k*n*(aa+(1-tt+cc)*aa**3/6+(5-18*tt+tt*tt+72*cc-58*ep)*aa**5/120), k*(m+n*t*(aa*aa/2+(5-tt+9*cc+4*cc*cc)*aa**4/24+(61-58*tt+tt*tt+600*cc-330*ep)*aa**6/720)))


base.rd_from_wgs84 = utm30


def load(path):
    return json.loads(Path(path).read_text())


def srgb(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055)**2.4


def hull(points):
    unique = list(dict.fromkeys((p[0], p[1]) for p in points))
    vectors = [Vector(p) for p in unique]
    return [unique[i] for i in geometry.convex_hull_2d(vectors)] if len(vectors) > 2 else unique


def normals(obj):
    obj.data.validate(clean_customdata=False)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()


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


class RoadProfile:
    def __init__(self, line, raster, edges=(), tunnels=(), closed=True):
        self.line, self.raster, self.closed = line, raster, closed
        self.cumulative, self.total = base.line_distance(line)
        self.distances = np.linspace(0, self.total, math.ceil(self.total/2)+1)
        self.xy = [base.sample_polyline(line, self.cumulative, float(s), closed=closed) for s in self.distances]
        elevations = np.array([raster.sample(*p) for p in self.xy])
        # LAS sees the M-11 deck, not the raceway beneath it. Interpolate between
        # measured portal elevations, never route the race track over the motorway.
        self.tunnels = []
        for tunnel in tunnels:
            start, end = tunnel["start"], tunnel["end"]
            za, zb = np.interp(start, self.distances, elevations), np.interp(end, self.distances, elevations)
            for i, distance in enumerate(self.distances):
                if start <= distance <= end:
                    elevations[i] = za + (zb-za)*(distance-start)/(end-start)
            self.tunnels.append({**tunnel, "portalElevationsMeters": [float(za), float(zb)], "heightMethod": "linear between measured portals; not surveyed underground"})
        # Remove 2 m cell noise with a 10 m symmetric filter, without rescaling Z.
        pad = np.pad(elevations[:-1] if closed else elevations, 3, mode="wrap" if closed else "edge")
        smooth = np.convolve(pad, np.array([1, 2, 3, 4, 3, 2, 1])/16, mode="valid")
        self.z = np.r_[smooth, smooth[0]] if closed else smooth
        self.widths, self.slopes = [], []
        for s, point in zip(self.distances, self.xy):
            tangent = base.sample_tangent(line, self.cumulative, float(s), closed=closed)
            normal = (-tangent.y, tangent.x)
            hits = []
            for edge in edges:
                for a, b in zip(edge, edge[1:]):
                    dx, dy = b[0]-a[0], b[1]-a[1]
                    determinant = normal[0]*dy-normal[1]*dx
                    if abs(determinant) < 1e-8:
                        continue
                    ox, oy = a[0]-point[0], a[1]-point[1]
                    ray = (ox*dy-oy*dx)/determinant
                    u = (ox*normal[1]-oy*normal[0])/determinant
                    if 0 <= u <= 1 and 2 < abs(ray) < 30:
                        hits.append(ray)
            left = min([h for h in hits if h > 0], default=6)
            right = min([-h for h in hits if h < 0], default=6)
            self.widths.append((left, right))
            slope = (raster.sample(point[0]+normal[0]*4, point[1]+normal[1]*4)-raster.sample(point[0]-normal[0]*4, point[1]-normal[1]*4))/8
            # La Monumental: 24 PERCENT, i.e. atan(0.24)=13.50°, outside on left.
            if closed and 2260 < s < 2840:
                slope = 0.24 * min(1, (s-2260)/150, (2840-s)/110)
            else:
                slope = min(0.04, max(-0.04, slope))
            if any(t["start"] <= s <= t["end"] for t in tunnels):
                slope = 0
            self.slopes.append(slope)
        self.tree = KDTree(len(self.xy))
        for i, (x, y) in enumerate(self.xy):
            self.tree.insert((x, y, 0), i)
        self.tree.balance()

    def height(self, distance):
        return float(np.interp(distance % self.total if self.closed else min(max(distance, 0), self.total), self.distances, self.z))

    def slope(self, distance):
        return float(np.interp(distance % self.total if self.closed else min(max(distance, 0), self.total), self.distances, self.slopes))

    def widths_at(self, distance):
        return tuple(float(np.interp(distance % self.total, self.distances, np.asarray(self.widths)[:, i])) for i in (0, 1))

    def roof(self, distance, force=False):
        # Median suppresses the pedestrian structure classified with ground in
        # the east LiDAR tile. Preserve the M-11 surface, not the false 690 m spike.
        tunnel=next((t for t in self.tunnels if t["deckStart"]-14 <= distance <= t["deckEnd"]+14),None)
        if force and not tunnel and self.tunnels:
            tunnel=min(self.tunnels,key=lambda t:abs(distance-(t["deckStart"]+t["deckEnd"])/2))
        if not tunnel:
            return None
        s=min(max(distance,tunnel["deckStart"]+7),tunnel["deckEnd"]-7)
        return float(np.median([self.raster.sample(*base.sample_polyline(self.line,self.cumulative,s+offset)) for offset in (-18,-12,-6,0,6,12,18)]))


class CarvedTerrain(base.HeightRaster):
    def __init__(self, raster, profiles):
        self.original, self.profiles, self.bounds = raster, profiles, raster.bounds
        self.surface_cache={}

    def sample(self, x, y, roof_mode=None):
        key=(round(x,4),round(y,4))
        value=self.surface_cache.get(key)
        if value is None:
            value=self.original.sample(x,y)
            # Thin elevated structures in the municipal class-2 cloud must not
            # become ridges across the motorway surface. Remove only positive
            # outliers around the M-11 crossings, retaining the measured grade.
            if any(math.dist((x,y),base.sample_polyline(p.line,p.cumulative,(t["deckStart"]+t["deckEnd"])/2))<190 for p in self.profiles for t in p.tunnels):
                median=float(np.median([self.original.sample(x+dx,y+dy) for dx in (-14,-7,0,7,14) for dy in (-14,-7,0,7,14)]))
                if value>median+1.5:
                    value=median
            self.surface_cache[key]=value
        # The margin covers the full terrain triangle diagonal, so interpolated
        # terrain cannot poke through narrow track meshes between grid vertices.
        for profile in self.profiles:
            _, index, distance = profile.tree.find((x, y, 0))
            tangent=base.sample_tangent(profile.line,profile.cumulative,float(profile.distances[index]),closed=profile.closed)
            relative=(x-profile.xy[index][0],y-profile.xy[index][1])
            chainage=float(profile.distances[index])+relative[0]*tangent.x+relative[1]*tangent.y
            width = max(profile.widths[index])
            if distance < width+17:
                roof=profile.roof(chainage,force=roof_mode is True) if roof_mode is not False else None
                if roof is not None:
                    # A surface DTM cannot represent two stacked roads. Keep
                    # the motorway on top; the raceway and ceiling are separate.
                    # The full grid margin prevents a jagged excavated trench.
                    blend=min(1,max(0,(width+17-distance)/9))
                    value=value*(1-blend)+roof*blend
                    continue
                lateral=max(-width,min(width,-relative[0]*tangent.y+relative[1]*tangent.x))
                floor = profile.height(chainage)+profile.slope(chainage)*lateral-0.55
                value = min(value, floor)
        return value

    def sample_rendered_terrain(self,x,y):
        if hasattr(self,"bvh"):
            hit,_,_,_=self.bvh.ray_cast(Vector((x-self.center["x"],y-self.center["y"],200)),Vector((0,0,-1)),500)
            return hit.z+self.datum if hit else self.sample(x,y)
        return super().sample_rendered_terrain(x,y)


def build_terrain(bounds,center,terrain,datum,material,collection,main):
    """Split grid faces exactly at portals: an upper deck must never slope into
    the underground raceway. Duplicate boundary XY vertices retain separate Z."""
    portals=[]
    for tunnel in main.tunnels:
        for distance in (tunnel["deckStart"]-14,tunnel["deckEnd"]+14):
            portals.append((base.sample_polyline(main.line,main.cumulative,distance),base.sample_tangent(main.line,main.cumulative,distance)))
    builder=base.MeshBuilder()
    def clip(polygon,origin,normal,sign):
        output=[]
        for a,b in zip(polygon,polygon[1:]+polygon[:1]):
            da=((a[0]-origin[0])*normal.x+(a[1]-origin[1])*normal.y)*sign
            db=((b[0]-origin[0])*normal.x+(b[1]-origin[1])*normal.y)*sign
            if da>=0:
                output.append(a)
            if (da>=0)!=(db>=0):
                t=da/(da-db)
                output.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
        return output
    xs=np.linspace(bounds["minX"],bounds["maxX"],base.TERRAIN_COLUMNS)
    ys=np.linspace(bounds["minY"],bounds["maxY"],base.TERRAIN_ROWS)
    splits=0
    for y0,y1 in zip(ys,ys[1:]):
        for x0,x1 in zip(xs,xs[1:]):
            for triangle in [[(x0,y0),(x1,y0),(x1,y1)],[(x0,y0),(x1,y1),(x0,y1)]]:
                fragments=[(triangle,None)]
                for origin,normal in portals:
                    if math.dist(((x0+x1)/2,(y0+y1)/2),origin)>65:
                        continue
                    following=[]
                    for polygon,mode in fragments:
                        sides=[(p[0]-origin[0])*normal.x+(p[1]-origin[1])*normal.y for p in polygon]
                        if min(sides)<0<max(sides):
                            splits+=1
                            for sign in (-1,1):
                                part=clip(polygon,origin,normal,sign)
                                if len(part)<3:
                                    continue
                                cx,cy=sum(p[0] for p in part)/len(part),sum(p[1] for p in part)/len(part)
                                _,index,_=main.tree.find((cx,cy,0))
                                tangent=base.sample_tangent(main.line,main.cumulative,float(main.distances[index]))
                                s=main.distances[index]+(cx-main.xy[index][0])*tangent.x+(cy-main.xy[index][1])*tangent.y
                                following.append((part,main.roof(s) is not None))
                        else:
                            following.append((polygon,mode))
                    fragments=following
                for polygon,mode in fragments:
                    points=[(x-center["x"],y-center["y"],terrain.sample(x,y,mode)-datum) for x,y in polygon]
                    for i in range(1,len(points)-1):
                        builder.add_triangle([points[0],points[i],points[i+1]])
    obj=builder.create_object("Madring_LiDAR_2026_RealScale_Terrain",[material],collection)
    uv=obj.data.uv_layers.new(name="AerialUV")
    for face in obj.data.polygons:
        face.use_smooth=True
        for index in face.loop_indices:
            v=obj.data.vertices[obj.data.loops[index].vertex_index].co
            uv.data[index].uv=((v.x+center["x"]-bounds["minX"])/(bounds["maxX"]-bounds["minX"]),(v.y+center["y"]-bounds["minY"])/(bounds["maxY"]-bounds["minY"]))
    terrain.bvh=BVHTree.FromPolygons(builder.vertices,builder.faces,all_triangles=True)
    terrain.triangles=[[builder.vertices[i] for i in face] for face in builder.faces]
    terrain.center,terrain.datum=center,datum
    terrain.portal_splits=splits
    return obj


def configure_surface(main, pit):
    def cross_section(points, cumulative, distance, raster, base_elevation, width, z_offset=0.18, closed=True, banked=False):
        profile = main if points is main.line else pit if points is pit.line else None
        point = base.sample_polyline(points, cumulative, distance, closed=closed)
        tangent = base.sample_tangent(points, cumulative, distance, closed=closed)
        normal = Vector((-tangent.y, tangent.x))
        if profile:
            z, slope = profile.height(distance), profile.slope(distance)
        else:
            z, slope = max(raster.sample(*point), raster.sample_rendered_terrain(*point)), 0
        return point, tangent, normal, z-base_elevation+z_offset, -math.atan(slope)
    base.road_cross_section = cross_section


def build_road(profile, raster, center, datum, material, white, red, collection, is_pit=False):
    asphalt, markings, curbs = base.MeshBuilder(), base.MeshBuilder(), base.MeshBuilder()
    def point(s, lateral, offset=0.18):
        return base.road_surface_point(profile.line, profile.cumulative, float(s), lateral, raster, center, datum, 12, closed=profile.closed, banked=True, z_offset=offset)
    for i in range(len(profile.distances)-1):
        s, t = profile.distances[i:i+2]
        lw, rw = profile.widths[i]
        nlw, nrw = profile.widths[i+1]
        if is_pit:
            taper = min(1, s/35, (profile.total-s)/35)
            ntaper = min(1, t/35, (profile.total-t)/35)
            lw = rw = 2+4*max(0, taper)
            nlw = nrw = 2+4*max(0, ntaper)
        # Three longitudinal strips follow the measured banking at actual width.
        for a, b in [(-1, 0), (0, 1)]:
            asphalt.add_quad([point(s, rw*a if a<0 else lw*a), point(t, nrw*a if a<0 else nlw*a), point(t, nrw*b if b<0 else nlw*b), point(s, rw*b if b<0 else lw*b)])
        for side, width, next_width in [(1, lw, nlw), (-1, rw, nrw)]:
            if not is_pit or 25 < s < profile.total-25:
                markings.add_quad([point(s, side*(width-.35), .22), point(t, side*(next_width-.35), .22), point(t, side*(next_width-.18), .22), point(s, side*(width-.18), .22)])
            tangent1 = base.sample_tangent(profile.line, profile.cumulative, float(s-8), closed=profile.closed)
            tangent2 = base.sample_tangent(profile.line, profile.cumulative, float(s+8), closed=profile.closed)
            curvature = tangent1.x*tangent2.y-tangent1.y*tangent2.x
            if not is_pit and abs(curvature)>.045 and side*curvature>0 and not any(tu["start"]-10<s<tu["end"]+10 for tu in profile.tunnels):
                curbs.add_quad([point(s, side*width, .26), point(t, side*next_width, .26), point(t, side*(next_width+1), .26), point(s, side*(width+1), .26)], int(s//3)%2)
        if is_pit and 150 < s < profile.total-180:
            markings.add_quad([point(s, -1.6, .23), point(t, -1.6, .23), point(t, -1.4, .23), point(s, -1.4, .23)])
    road = asphalt.create_object("Madring_Pit_Lane" if is_pit else "Madring_Surveyed_Raceway", [material], collection)
    normals(road)
    for face in road.data.polygons:
        face.use_smooth=True
    if is_pit:
        for s in np.linspace(230, 665, 15):
            markings.add_quad([point(s-.09, -5.7, .24), point(s+.09, -5.7, .24), point(s+.09, -1.7, .24), point(s-.09, -1.7, .24)])
    paint=markings.create_object("Madring_Pit_Fast_Lane_14_Boxes" if is_pit else "Madring_Track_Edge_Lines", [white], collection)
    for face in paint.data.polygons:
        face.use_smooth=True
    if curbs.faces:
        curbs.create_object("Madring_Red_White_Curbs", [white, red], collection)
    return road


def build_tunnels(main, raw, center, datum, terrain_material, structure_material, collection):
    ceiling, shell = base.MeshBuilder(), base.MeshBuilder()
    for tunnel in main.tunnels:
        # Each deck follows the existing motorway's measured top elevations.
        # No scale manipulation: minimum 4.8 m headroom underneath the slab.
        headrooms=[]
        for s in np.arange(tunnel["deckStart"]-14, tunnel["deckEnd"]+14, 4):
            t = min(s+4, tunnel["deckEnd"]+14)
            p, q = base.sample_polyline(main.line, main.cumulative, s), base.sample_polyline(main.line, main.cumulative, t)
            tangent = base.sample_tangent(main.line, main.cumulative, s)
            n = (-tangent.y, tangent.x)
            tops = []
            for xy, distance, side in [(p,s,-1),(q,t,-1),(q,t,1),(p,s,1)]:
                x,y = xy[0]+n[0]*side*8.8,xy[1]+n[1]*side*8.8
                z = main.roof(distance)-.65
                headrooms.append(z-main.height(distance)-.18)
                tops.append((x-center["x"], y-center["y"], z-datum))
            ceiling.add_quad(list(reversed(tops)))
            for side in (-1,1):
                bottom = []
                for xy,distance,offset in [(p,s,side*8.5-.25),(q,t,side*8.5-.25),(q,t,side*8.5+.25),(p,s,side*8.5+.25)]:
                    bottom.append((xy[0]+n[0]*offset-center["x"],xy[1]+n[1]*offset-center["y"],main.height(distance)-datum))
                top = [(x,y,main.roof(s if i in (0,3) else t)-datum-.65) for i,(x,y,z) in enumerate(bottom)]
                shell.add_volume(bottom,top)
        for s in (tunnel["deckStart"]-14,tunnel["deckEnd"]+14):
            point=base.sample_polyline(main.line,main.cumulative,s)
            tangent=base.sample_tangent(main.line,main.cumulative,s)
            normal=(-tangent.y,tangent.x)
            roof=main.roof(s,force=True)-datum
            floor=main.height(s)-datum
            shell.add_box((point[0]-center["x"],point[1]-center["y"],roof-.325),(.65,17.6,.65),rotation=math.atan2(tangent.y,tangent.x))
            for side in (-1,1):
                a=(point[0]+normal[0]*side*8.8-center["x"],point[1]+normal[1]*side*8.8-center["y"])
                b=(point[0]+normal[0]*side*23-center["x"],point[1]+normal[1]*side*23-center["y"])
                shell.add_quad([(*a,floor),(*b,floor),(*b,roof),(*a,roof)])
        tunnel["minimumHeadroomMeters"] = round(min(headrooms),3)
        tunnel["topSurfaceMethod"] = "continuous upper terrain; median LiDAR deck; no excavation across M-11"
    ceiling.create_object("Madring_M11_Tunnel_Ceilings",[structure_material],collection)
    normals(shell.create_object("Madring_Tunnel_Retaining_Walls", [structure_material], collection))


def build_buildings(prepared, osm, raw, dsm, center, datum, corridors, reservations, pit_polygon, material, collection):
    candidates = load(prepared/"madring-lod2.json")
    footprints = [[utm30(p["lat"],p["lon"]) for p in way["geometry"]] for way in osm["elements"] if way.get("tags",{}).get("building") and len(way.get("geometry",[]))>3]
    builder, accepted, excluded = base.MeshBuilder(), [], []
    for building in candidates:
        polygon = hull(building["vertices"])
        if len(polygon)<3:
            continue
        reason = None
        if base.polygon_intersects_corridors(polygon, corridors):
            reason = "raceway or pit safety corridor"
        elif base.polygons_overlap(polygon,pit_polygon):
            reason = "replaced by current municipal pit building"
        elif any(base.polygons_overlap(polygon,p) for p in reservations):
            reason = "2026 grandstand reservation"
        else:
            active = any(base.point_in_polygon(building["center"],p) for p in footprints)
            top = max(v[2] for v in building["vertices"])
            # Roof agreement with the current surface is a second active-footprint
            # check for small rooftop parts absent from OSM's parent footprint.
            samples = [dsm.sample(*p[:2]) for p in building["vertices"][::max(1,len(building["vertices"])//12)]]
            current_roof = any(abs(top-z)<3 for z in samples) and top>raw.sample(*building["center"])+2
            if not active and not current_roof:
                reason = "no active OSM footprint or matching June 2026 DSM roof"
        if reason:
            excluded.append({"id":building["id"],"reason":reason})
            continue
        color = (*[srgb(c) for c in building["roofColorSrgb"]],1)
        vertices = [(x-center["x"],y-center["y"],z-datum) for x,y,z in building["vertices"]]
        for face in building["faces"]:
            for i in range(1,len(face)-1):
                builder.add_triangle([vertices[face[0]],vertices[face[i]],vertices[face[i+1]]],color=color)
        accepted.append(building["id"])
    obj = builder.create_object("Madring_Municipal_LoD2_IFEMA_And_Neighbours", [material], collection, vertex_colors=True)
    normals(obj)
    return {"candidateCount":len(candidates),"renderedCount":len(accepted),"renderedIds":accepted,"excluded":excluded,"sourceToRenderCentroidDriftMeters":0,"remainingCorridorConflicts":0,"roofGeometry":"original municipal LoD2 vertices and faces; no box replacement"}


def build_pit_building(polygon, raw, center, datum, wall_material, glass_material, roof_material, collection):
    # Actual July municipal footprint; 14 modular garages and three storeys are
    # from the promoter's construction specification, not a transplanted pit asset.
    points = polygon[:-1] if polygon[0]==polygon[-1] else polygon
    bottom_z = sum(raw.sample(*p) for p in points)/len(points)-datum
    builder = base.MeshBuilder()
    bottom = [(x-center["x"],y-center["y"],bottom_z) for x,y in points]
    top = [(x,y,z+18.5) for x,y,z in bottom]
    builder.add_volume(bottom,top,0)
    cx,cy=sum(p[0] for p in bottom)/4,sum(p[1] for p in bottom)/4
    for a,b in zip(bottom,bottom[1:]+bottom[:1]):
        dx,dy=(a[0]+b[0])/2-cx,(a[1]+b[1])/2-cy
        length=max(math.hypot(dx,dy),1)
        ax,ay=a[0]+dx/length*.06,a[1]+dy/length*.06
        bx,by=b[0]+dx/length*.06,b[1]+dy/length*.06
        for z in (6.3,11.7):
            builder.add_quad([(ax,ay,a[2]+z),(bx,by,b[2]+z),(bx,by,b[2]+z+3.1),(ax,ay,a[2]+z+3.1)],1)
        if math.dist(a,b)>200:
            for index in range(14):
                start,end=(index+.12)/14,(index+.88)/14
                x1,y1=ax+(bx-ax)*start,ay+(by-ay)*start
                x2,y2=ax+(bx-ax)*end,ay+(by-ay)*end
                builder.add_quad([(x1,y1,bottom_z+.1),(x2,y2,bottom_z+.1),(x2,y2,bottom_z+4.8),(x1,y1,bottom_z+4.8)],1)
    builder.add_quad([(x,y,z+.03) for x,y,z in top],2)
    obj=builder.create_object("Madring_Pit_Building_14_Garages_Paddock_Club",[wall_material,glass_material,roof_material],collection)
    normals(obj)
    return {"footprintSourceRecord":54,"garages":14,"teamGarages":11,"fiaGarages":3,"heightMeters":18.5,"storeys":3,"sourceToRenderCentroidDriftMeters":0}


def build_runoff(records, terrain, main, center, datum, material, collection):
    builder=base.MeshBuilder()
    accepted=[]
    # Intersect CAD polygons with the actual terrain triangles. Merely sampling
    # CAD vertices (even after subdivision) cuts across terrain ridges/portals.
    # Shared planar support keeps every runoff fragment above its own ground.
    cells={}
    for triangle in terrain.triangles:
        for ix in range(math.floor(min(v[0] for v in triangle)/12),math.floor(max(v[0] for v in triangle)/12)+1):
            for iy in range(math.floor(min(v[1] for v in triangle)/12),math.floor(max(v[1] for v in triangle)/12)+1):
                cells.setdefault((ix,iy),[]).append(triangle)

    def clip(polygon,a,b):
        result=[]
        def side(p):
            return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
        for p,q in zip(polygon,polygon[1:]+polygon[:1]):
            dp,dq=side(p),side(q)
            if dp>=0:
                result.append(p)
            if (dp>=0)!=(dq>=0):
                t=dp/(dp-dq)
                result.append((p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t))
        return result

    for record in records:
        if record["category"]!="Escapatorias asfaltadas":
            continue
        for polygon in record["paths"]:
            if len(polygon)<4 or math.dist(polygon[0],polygon[-1])>.1:
                continue
            vectors=[Vector((x-center["x"],y-center["y"],0)) for x,y in polygon[:-1]]
            for triangle in base.resolved_tessellation([vectors]):
                nearby={}
                for ix in range(math.floor(min(v.x for v in triangle)/12),math.floor(max(v.x for v in triangle)/12)+1):
                    for iy in range(math.floor(min(v.y for v in triangle)/12),math.floor(max(v.y for v in triangle)/12)+1):
                        for ground in cells.get((ix,iy),[]):
                            nearby[id(ground)]=ground
                for ground in nearby.values():
                    fragment=[(v.x,v.y) for v in triangle]
                    for a,b in zip(ground,ground[1:]+ground[:1]):
                        fragment=clip(fragment,a,b)
                        if len(fragment)<3:
                            break
                    if len(fragment)<3:
                        continue
                    a,b,c=map(Vector,ground)
                    normal=(b-a).cross(c-a)
                    if abs(normal.z)<1e-8:
                        continue
                    points=[(x,y,a.z-(normal.x*(x-a.x)+normal.y*(y-a.y))/normal.z+.06) for x,y in fragment]
                    for i in range(1,len(points)-1):
                        builder.add_triangle([points[0],points[i],points[i+1]])
            accepted.append(record["id"])
    obj=builder.create_object("Madring_Municipal_Asphalt_Runoff",[material],collection)
    normals(obj)
    for face in obj.data.polygons:
        face.use_smooth=True
    return accepted


def seat_paint_on_junctions():
    # The pit and racing line have separately sampled profiles. Where their
    # surfaces join, paint belongs above the upper asphalt, including across a
    # triangulation seam, instead of sinking into the other road's surface.
    roads=base.MeshBuilder()
    for name in ("Madring_Surveyed_Raceway","Madring_Pit_Lane"):
        obj=bpy.data.objects[name]
        for face in obj.data.polygons:
            roads.add_triangle([obj.data.vertices[i].co for i in face.vertices])
    surface=BVHTree.FromPolygons(roads.vertices,roads.faces,all_triangles=True)
    def height(point):
        hit,_,_,_=surface.ray_cast(Vector((point.x,point.y,200)),Vector((0,0,-1)),500)
        return hit.z if hit else None
    for name in ("Madring_Track_Edge_Lines","Madring_Pit_Fast_Lane_14_Boxes"):
        obj=bpy.data.objects[name]
        for vertex in obj.data.vertices:
            z=height(vertex.co)
            if z is not None:
                vertex.co.z=max(vertex.co.z,z+.04)
        for _ in range(2):
            lifts={}
            for face in obj.data.polygons:
                vertices=[obj.data.vertices[i].co for i in face.vertices]
                for weights in ((1/3,1/3,1/3),(.8,.1,.1),(.1,.8,.1),(.1,.1,.8)):
                    point=sum((v*w for v,w in zip(vertices,weights)),Vector())
                    z=height(point)
                    if z is not None and point.z<z+.04:
                        for i in face.vertices:
                            lifts[i]=max(lifts.get(i,0),z+.04-point.z)
            for i,lift in lifts.items():
                obj.data.vertices[i].co.z+=lift
        obj.data.update()


def build_walls(records, terrain, main, center, datum, material, collection, corridors):
    builder=base.MeshBuilder()
    length=0
    for record in records:
        if "Muro" not in record["category"]:
            continue
        for line in record["paths"]:
            cumulative,total=base.line_distance(line)
            length+=total
            for s in np.arange(0,total,10):
                a=base.sample_polyline(line,cumulative,s,closed=False)
                b=base.sample_polyline(line,cumulative,min(s+10,total),closed=False)
                midpoint=((a[0]+b[0])/2,(a[1]+b[1])/2)
                _,index,distance=main.tree.find((*midpoint,0))
                # CAD safety walls belong to the raceway at the underpasses,
                # not the upper motorway elevation captured by LiDAR.
                z=(main.z[index] if distance<max(main.widths[index])+8 else terrain.sample(*midpoint))-datum
                builder.add_box((midpoint[0]-center["x"],midpoint[1]-center["y"],z+0.6),(math.dist(a,b),.35,1.2),rotation=math.atan2(b[1]-a[1],b[0]-a[0]))
    if builder.faces:
        builder.create_object("Madring_Municipal_Safety_Walls",[material],collection)
    return round(length,3)


def build_vegetation(osm, raw, dsm, center, datum, corridors, reservations, material, collection):
    builder=base.MeshBuilder()
    count=0
    for node in osm["elements"]:
        if node.get("tags",{}).get("natural")!="tree" or "lat" not in node:
            continue
        x,y=utm30(node["lat"],node["lon"])
        if not (raw.bounds["minX"]<x<raw.bounds["maxX"] and raw.bounds["minY"]<y<raw.bounds["maxY"]):
            continue
        if any(min(math.dist((x,y),p) for p in line)<radius+4 for line,radius in corridors) or any(base.point_in_polygon((x,y),p) for p in reservations):
            continue
        height=max(dsm.sample(x,y)-raw.sample(x,y),0)
        if height<2.5 or height>22:
            continue
        z=raw.sample(x,y)-datum
        builder.add_cylinder((x-center["x"],y-center["y"],z),.18,height*.6,sides=5,color=(.13,.10,.065,1))
        # Compact two-tier crowns keep mapped rows recognizable within web limits.
        for fraction,radius in ((.45,min(height*.25,3.5)),(.70,min(height*.20,3))):
            builder.add_cylinder((x-center["x"],y-center["y"],z+height*fraction),radius,height*.3,sides=6,color=(.08,.12,.045,1))
        count+=1
    if builder.faces:
        builder.create_object("Madring_Current_Mapped_Trees",[material],collection,vertex_colors=True)
    return count


def audit_clearance(profile, terrain, datum):
    minimum, violations, count, covered = math.inf,0,0,0
    worst=None
    for s in np.arange(0,profile.total,1.5):
        lw,rw=profile.widths_at(s)
        for lateral in np.linspace(-rw,lw,9):
            if profile.roof(s) is not None:
                covered+=1
                continue
            point=base.road_surface_point(profile.line,profile.cumulative,float(s),float(lateral),terrain,{"x":0,"y":0},0,12,closed=profile.closed,banked=True)
            gap=point[2]-terrain.sample_rendered_terrain(point[0],point[1])
            if gap<minimum:
                minimum=gap
                worst={"distanceMeters":round(float(s),3),"lateralMeters":round(float(lateral),3)}
            violations+=gap<0
            count+=1
    return {"sampleCount":count,"coveredTunnelSamples":covered,"minimumClearanceMeters":round(minimum,4),"minimumClearanceLocation":worst,"terrainPenetrations":int(violations),"method":"BVH ray audit of actual rendered triangles, 9 lateral samples every 1.5 m; covered tunnel samples checked against separate ceiling headroom"}


def main():
    args=base.parse_args()
    config,prepared=load(args.input),Path(args.prepared)
    model=config["model"]
    bounds,center,datum=model["bounds"],model["center"],640.0
    rasters=load(prepared/"raster-metadata.json")
    raw=base.HeightRaster(prepared/"madring-dtm.f32le",rasters["rasters"]["dtm"],bounds)
    dsm=base.HeightRaster(prepared/"madring-dsm.f32le",rasters["rasters"]["dsm"],bounds)
    records=load(prepared/"madring-geometries.json")
    by_id={r["id"]:r for r in records}
    line=by_id[65]["paths"][0]
    main_road=RoadProfile(line,raw,[by_id[i]["paths"][0] for i in (6,66)],model["tunnels"])
    osm=load(prepared/"osm.json")
    pit_way=next(w for w in osm["elements"] if w["id"]==model["pitLaneWayId"])
    pit_line=[utm30(p["lat"],p["lon"]) for p in pit_way["geometry"]]
    # Close OSM endpoints onto the municipal main line without moving its geometry.
    for endpoint in (0,-1):
        nearest=min(main_road.xy,key=lambda p:math.dist(pit_line[endpoint],p))
        if endpoint==0:
            pit_line.insert(0,nearest)
        else:
            pit_line.append(nearest)
    pit=RoadProfile(pit_line,raw,closed=False)
    terrain=CarvedTerrain(raw,[main_road,pit])
    configure_surface(main_road,pit)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    base.configure_scene(bounds,center,datum)
    scene=bpy.context.scene
    for key in list(scene.keys()):
        del scene[key]
    scene["coordinate_reference_system"]="EPSG:25830"
    scene["origin_utm_x"],scene["origin_utm_y"],scene["origin_elevation_m"]=center["x"],center["y"],datum
    scene["real_world_scale"]="1 Blender unit = 1 metre"
    scene.unit_settings.scale_length=1
    collections=base.create_collections()
    mat=lambda name,color,**kwargs:base.create_material("Madring_"+name,color,**kwargs)
    asphalt=mat("Real_Asphalt",(.095,.105,.11,1))
    white=mat("White_Paint",(.8,.79,.73,1))
    red=mat("Red_Paint",(.55,.025,.02,1))
    concrete=mat("Concrete_Walls",(.39,.38,.35,1))
    metal=mat("Steel_And_Fence",(.13,.15,.16,1),metallic=.4)
    buildings=mat("Aerial_Sampled_LoD2",(1,1,1,1),use_vertex_color=True)
    vegetation=mat("Mapped_Vegetation",(1,1,1,1),use_vertex_color=True)
    roof=mat("Pit_White_Roof",(.64,.63,.59,1))
    glass=mat("Pit_Glazing",(.09,.14,.16,1),roughness=.3)
    seats1=mat("Grandstand_Seats",(.33,.38,.41,1))
    seats2=mat("Grandstand_Seats_Shade",(.24,.29,.32,1))
    groundmat=base.create_aerial_material(prepared/"madring-orthophoto-2026.jpg")
    groundmat.name="Madring_Madrid_Orthophoto_2026_06_13"
    ground=build_terrain(bounds,center,terrain,datum,groundmat,collections["Terrain"],main_road)
    ground.name="Madring_LiDAR_2026_RealScale_Terrain"
    ground["source"]="Ayuntamiento de Madrid 2026-06-13 LiDAR and true orthophoto; IGN gap fill"
    build_road(main_road,terrain,center,datum,asphalt,white,red,collections["Circuit"])
    runoff_records=build_runoff(records,terrain,main_road,center,datum,asphalt,collections["Circuit"])
    build_road(pit,terrain,center,datum,asphalt,white,red,collections["Circuit"],True)
    seat_paint_on_junctions()
    wall,wall_report=base.create_pit_wall(pit.line,line,terrain,center,datum,[concrete,metal],collections["Infrastructure"],start_ratio=.16,end_ratio=.72)
    wall.name="Madring_Physical_Pit_Wall_And_Fence"
    wall["source"]="Current OSM pit alignment, municipal circuit edges; visual wall cross-section"
    build_tunnels(main_road,raw,center,datum,groundmat,concrete,collections["Infrastructure"])
    reservations=base.grandstand_reservation_polygons(config,line,main_road.cumulative)
    corridors=[(base.sample_line_points(line,main_road.cumulative,3),8),(base.sample_line_points(pit.line,pit.cumulative,3,closed=False),7)]
    pit_polygon=by_id[54]["paths"][0]
    building_report=build_buildings(prepared,osm,raw,dsm,center,datum,corridors,reservations,pit_polygon,buildings,collections["Buildings"])
    pit_building=build_pit_building(pit_polygon,raw,center,datum,concrete,glass,roof,collections["Buildings"])
    stands,count,stand_report=base.create_grandstands(config,line,main_road.cumulative,main_road.total,raw,center,datum,[metal,seats1,seats2],collections["Grandstands"])
    stands.name="Madring_2026_Event_Grandstands"
    stands["source"]="Official Madring 2026 event map; locations map-derived; vertical dimensions estimated"
    normals(stands)
    stand_report.pop("verifiedTurnTenZone",None)
    wall_length=build_walls(records,terrain,main_road,center,datum,concrete,collections["Infrastructure"],corridors)
    trees=build_vegetation(osm,raw,dsm,center,datum,corridors,reservations,vegetation,collections["Infrastructure"])
    sector_colors=[(.86,.02,.01,1),(.98,.48,.03,1),(.02,.60,.78,1)]
    sector_materials=[base.create_material(f"Sector_{i+1}_Core",c,emission_strength=.5) for i,c in enumerate(sector_colors)]
    black=mat("Timing_Black",(.02,.02,.02,1))
    glows=[base.create_material(f"Sector_{i+1}_Glow",(*c[:3],.32),emission_strength=1) for i,c in enumerate(sector_colors)]
    _,_,markers,_=base.create_track_annotations(config,osm,line,main_road.cumulative,main_road.total,terrain,center,datum,sector_materials+[white,black]+glows,collections["Annotations"])
    markers.name="Madring_Official_Diagram_Sector_And_Control_Lines"
    for turn in model["auxiliaryTurns"]:
        anchor=base.anchor_at("Turn_"+turn["label"].zfill(3),turn["distanceMeters"],line,main_road.cumulative,main_road.total,terrain,center,datum,collections["Annotations"],side=turn["side"],offset=45,height=7)
        anchor["turn_label"]=turn["label"]
    base.create_start_gantry(model["startFinishDistanceMeters"],line,main_road.cumulative,terrain,center,datum,[metal,red],collections["Infrastructure"])
    profile=[]
    for s in np.linspace(0,main_road.total,361):
        x,y=base.sample_polyline(line,main_road.cumulative,float(s))
        profile.append({"distanceMeters":round(float(s),4),"elevationMeters":round(main_road.height(s),4),"x":round(x-center["x"],4),"y":round(y-center["y"],4)})
    for name,entry in [("HighPoint",max(profile,key=lambda p:p["elevationMeters"])),("LowPoint",min(profile,key=lambda p:p["elevationMeters"]))]:
        anchor=base.anchor_at(name,entry["distanceMeters"],line,main_road.cumulative,main_road.total,terrain,center,datum,collections["Annotations"],offset=75,height=8)
        anchor["elevation_datum_m"]=entry["elevationMeters"]
    clearance=audit_clearance(main_road,terrain,datum)
    pit_clearance=audit_clearance(pit,terrain,datum)
    metadata={
        "id":"madring","schemaVersion":1,"generatorVersion":config["generatorVersion"],"sourceManifest":config["sourceManifest"],
        "coordinateReferenceSystem":"EPSG:25830","center":center,"baseElevationMeters":datum,"bounds":bounds,
        "realWorldScale":"1 Blender unit = 1 metre","verticalExaggeration":1,"verticalDatum":config["sourceManifest"]["verticalDatum"],
        "geometry":{"source":"municipal CAD record 65, no scale/rotation/mirroring","lengthMeters":main_road.total,"officialLengthMeters":5416,"lengthErrorPercent":abs(main_road.total-5416)/5416*100,"widthSourceRecords":[6,66],"minimumWidthMeters":min(sum(w) for w in main_road.widths),"maximumWidthMeters":max(sum(w) for w in main_road.widths),"turnCount":22,"auxiliaryTurnLabels":["5A","20A"],"bankingPercent":24,"bankingAngleDegrees":math.degrees(math.atan(.24))},
        "elevationProfile":profile,"elevationsMeters":{"low":min(p["elevationMeters"] for p in profile),"high":max(p["elevationMeters"] for p in profile)},
        "surfaceClearance":clearance,"pitClearance":pit_clearance,"tunnels":main_road.tunnels,
        "surfaceExport":{"meshoptPositionBits":18,"maximumPositionErrorMeters":0.008,"edgePaintWidthMeters":0.17,"paintClearanceMeters":0.04,"runoffMethod":"CAD polygons clipped against actual terrain triangles with 0.06 m clearance"},
        "pitLane":{"sourceWayId":model["pitLaneWayId"],"lengthMeters":pit.total,"pitBoxes":14,"entryGapMeters":0,"exitGapMeters":0,"fastLaneSeparator":True,"physicalWall":wall_report},
        "buildings":building_report,"pitBuilding":pit_building,"grandstands":stand_report,"mappedTrees":trees,"municipalSafetyWallsLengthMeters":wall_length,"asphaltRunoffSourceRecords":runoff_records,
        "terrain":{**rasters,"portalSplitTriangles":terrain.portal_splits},"officialControlPoints":config["officialControlPoints"],"turns":model["turns"],
        "limitations":["FIA surveyed timing positions were unavailable; markers follow the official 2026 F1 diagram.","June 13 2026 orthophoto and LiDAR show construction before the September race.","Grandstand positions follow the official event map; depth, rows, colors and height remain visual estimates.","No event motorhomes are identifiable in the June source; none invented.","Underground road elevations interpolated between LiDAR-measured portals; wall and tunnel cross-sections are visual estimates."],
    }
    Path(args.metadata).write_text(json.dumps(metadata,indent=2)+"\n")
    print(json.dumps({"clearance":clearance,"pitClearance":pit_clearance,"buildings":building_report["renderedCount"],"stands":count,"trees":trees}),flush=True)
    if clearance["terrainPenetrations"] or pit_clearance["terrainPenetrations"]:
        raise RuntimeError("Rendered terrain penetrates the road surface")
    # Imported helpers must not leave names from another circuit in this asset.
    for obj in bpy.data.objects:
        if obj.type=="MESH":
            obj.data.name=obj.name+"_Mesh"
    export_glb(Path(args.glb))
    base.add_lighting(collections["Infrastructure"])
    scene.render.resolution_x,scene.render.resolution_y=1600,1100
    camera_data=bpy.data.cameras.new("Madring_Preview_Camera")
    camera_data.type="ORTHO"
    camera_data.ortho_scale=2650
    camera_data.clip_end=10000
    camera=bpy.data.objects.new("Madring_Preview_Camera",camera_data)
    collections["Infrastructure"].objects.link(camera)
    camera.location=(2400,-450,3000)
    base.look_at(camera,(0,0,35))
    scene.camera=camera
    scene.render.filepath=args.preview
    bpy.ops.render.render(write_still=True)


if __name__=="__main__":
    main()
