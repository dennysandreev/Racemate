#!/usr/bin/env python3
"""Build Baku from its pinned OSM, Planet SkySat and GEDTM sources.

Shared mesh primitives are reused; all coordinates and event placements are Baku's.
This is a geographically grounded visual model, not a surveyed road-height model.
"""
import importlib.util
import json
import math
import random
from array import array
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


hung = module("baku_shared_meshes", "build-hungaroring-digital-twin.py")
source = module("baku_sources", "prepare-baku-sources.py")
landmarks = module("baku_landmarks", "build-baku-landmarks.py")
base = hung.base
base.rd_from_wgs84 = source.utm39n
base.TERRAIN_COLUMNS, base.TERRAIN_ROWS = 248, 161
base.TRACK_SURFACE_Z_OFFSET = 0.38
base.PIT_LANE_WIDTH_METERS = 8
base.GRANDSTAND_MAX_PLATFORM_STEP_METERS = 1.0
base.bank_angle = lambda _distance, _total: (0.0, 0.0)


def track_width(distance):
    # The castle passage is 7.6 m wide. Smooth transitions retain the OSM axis.
    entrance = min(max((distance - 2735) / 30, 0), 1)
    exit_blend = min(max((2980 - distance) / 35, 0), 1)
    return 12 - 4.4 * min(entrance, exit_blend)


def prepare_street_surface(raw, config, prepared):
    """Remove urban DEM waves with constant street grades and a shared boulevard datum.

    The control heights are lower-decile GEDTM samples within 60 m of street
    junctions. The castle climb and western descent are retained; no amplitude
    scaling to an official relief figure is performed. This remains an estimate.
    """
    line = config["centerline"]
    cumulative, total = base.line_distance(line)
    turns = config["model"]["turns"]
    def control_height(turn):
        x,y = line[turn["sourceVertex"]]
        values = [raw.sample(x+dx,y+dy) for dx in range(-60,61,10) for dy in range(-60,61,10) if dx*dx+dy*dy<=3600]
        return sorted(values)[int(len(values)*.1)]
    coastal = (control_height(turns[0])+control_height(turns[15]))/2
    controls = [(0,coastal)]
    for number in (1,2,3,5,6,7,13,14,15,16):
        turn=turns[number-1]
        controls.append((turn["distanceMeters"],coastal if number in (1,5,6,7,16) else control_height(turn)))
    controls.append((total,coastal))
    def linear_height(distance):
        distance %= total
        for (a,ha),(b,hb) in zip(controls,controls[1:]):
            if a<=distance<=b:
                return ha+(hb-ha)*(distance-a)/(b-a)
        return coastal
    def height(distance):
        # Round grade changes over 24 m; the interior of every straight stays linear.
        return sum(linear_height(distance+offset) for offset in (-12,-8,-4,0,4,8,12))/7
    n=math.ceil(total/3)
    points=[base.sample_polyline(line,cumulative,total*i/n) for i in range(n)]
    tree=kdtree.KDTree(n)
    for i,p in enumerate(points): tree.insert((*p,0),i)
    tree.balance()
    def road_target(x,y):
        _,index,_=tree.find((x,y,0))
        best=(math.inf,coastal)
        for offset in (-1,0):
            i=(index+offset)%n
            a,b=points[i],points[(i+1)%n]
            dx,dy=b[0]-a[0],b[1]-a[1]
            blend=min(max(((x-a[0])*dx+(y-a[1])*dy)/max(dx*dx+dy*dy,1e-9),0),1)
            distance=math.hypot(x-a[0]-dx*blend,y-a[1]-dy*blend)
            if distance<best[0]: best=(distance,height(total*(i+blend)/n))
        return best
    bounds=config["model"]["bounds"]
    width,rows=base.TERRAIN_COLUMNS,base.TERRAIN_ROWS
    values=[]
    for row in range(rows):
        y=bounds["maxY"]-(bounds["maxY"]-bounds["minY"])*row/(rows-1)
        for column in range(width):
            x=bounds["minX"]+(bounds["maxX"]-bounds["minX"])*column/(width-1)
            distance,target=road_target(x,y)
            blend=min(max((100-distance)/60,0),1)
            blend=blend*blend*(3-2*blend)
            values.append(raw.sample(x,y)*(1-blend)+target*blend)
    filename=prepared/"baku-road-constrained.f32le"
    with filename.open("wb") as output: array("f",values).tofile(output)
    metadata={"width":width,"height":rows,"minimum":min(values),"maximum":max(values),"mean":sum(values)/len(values)}
    surface=base.HeightRaster(filename,metadata,bounds)
    quality={"method":"piecewise constant street grades with 24 m grade transitions; shared flat coastal boulevard",
             "heightSource":"GEDTM lower decile within 60 m of junctions; approximate",
             "controlPoints":[{"distanceMeters":d,"elevationMeters":h} for d,h in controls],
             "terrainTransitionMeters":100,"terrainGridMeters":10,"verticalAmplitudeRescaling":False}
    return surface,quality


def main():
    args = base.parse_args()
    config = base.load_json(Path(args.input))
    prepared = Path(args.prepared).resolve()
    bounds, center = config["model"]["bounds"], config["model"]["center"]
    raster_meta = base.load_json(prepared / "raster-metadata.json")
    raster = base.HeightRaster(prepared / "baku-dtm.f32le", raster_meta["rasters"]["dtm"], bounds)
    origin_z = raster_meta["rasters"]["dtm"]["minimum"]
    raster,street_quality=prepare_street_surface(raster,config,prepared)
    line = config["centerline"]
    cumulative, total = base.line_distance(line)
    osm = base.load_json(Path(config["sourceDirectory"]) / "baku-mapped-objects.json")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    collections = base.create_collections()
    hung.configure_scene(bounds, center, origin_z)
    scene = bpy.context.scene
    scene["coordinate_reference_system"] = "EPSG:32639; vertical EGM2008 approximate GEDTM"
    scene["source"] = "Baku OSM / Planet 2018 / GEDTM30; see baku-metadata.json"
    scene["vertical_exaggeration"] = 1.0

    def material(name, color, **options):
        return base.create_material("Baku_" + name, color, **options)

    asphalt = material("Asphalt", (.075, .082, .090, 1))
    white = material("Paint_White", (.83, .84, .80, 1))
    red = material("Curb_Red", (.64, .025, .035, 1))
    concrete = material("Concrete", (.55, .54, .50, 1))
    metal = material("Metal", (.15, .18, .19, 1), metallic=.55)
    city_mat = material("Mapped_Buildings", (.8, .8, .8, 1), use_vertex_color=True)
    window_material = material("Window_Bays", (1,1,1,1), use_vertex_color=True)
    nodes=window_material.node_tree.nodes
    links=window_material.node_tree.links
    window_image=nodes.new("ShaderNodeTexImage")
    window_image.image=bpy.data.images.load(str(prepared / "baku-window-bay.png"))
    window_image.image.pack()
    multiply=nodes.new("ShaderNodeMix")
    multiply.data_type="RGBA"
    multiply.blend_type="MULTIPLY"
    multiply.inputs[0].default_value=1
    links.new(next(node for node in nodes if node.type=="VERTEX_COLOR").outputs["Color"],multiply.inputs[6])
    links.new(window_image.outputs["Color"],multiply.inputs[7])
    links.new(multiply.outputs[2],nodes.get("Principled BSDF").inputs["Base Color"])
    pit_mat = material("Pit_Facades", (.8, .8, .8, 1), use_vertex_color=True)
    green = material("Trees", (.18, .24, .12, 1), use_vertex_color=True)
    seat = material("Seats_Green", (.24, .42, .27, 1))
    seat_dark = material("Seats_Dark", (.12, .24, .18, 1))
    aerial = base.create_aerial_material(prepared / "baku-skysat-ground.jpg")
    aerial.name = "Baku_Planet_SkySat_2018_CC_BY_SA"
    facade_material = base.create_aerial_material(prepared / "baku-landmark-facades.jpg")
    facade_material.name = "Baku_Actual_Landmark_Facades_CC_BY_SA"
    for node in facade_material.node_tree.nodes:
        if node.type == "TEX_IMAGE": node.image.pack()
    for node in aerial.node_tree.nodes:
        if node.type == "TEX_IMAGE":
            node.image.pack()
    terrain = base.add_terrain(bounds, center, raster, origin_z, aerial, collections["Terrain"])
    terrain.name = "Baku_GEDTM_Terrain"
    terrain.data.name = "Baku_GEDTM_Terrain_Mesh"
    terrain["source"] = "GEDTM30 v1.1 / Planet SkySat 2018-04-09 CC BY-SA 4.0"

    def point(distance, lateral=0, offset=.38, points=line, distances=cumulative, closed=True, width=None):
        return base.road_surface_point(points, distances, distance, lateral, raster, center, origin_z,
                                       width or track_width(distance), z_offset=offset, closed=closed)

    road = base.MeshBuilder()
    paint = base.MeshBuilder()
    curbs = base.MeshBuilder()
    barriers = base.MeshBuilder()
    samples = []
    count = math.ceil(total / 2)
    # Include every mapped apex in addition to regular samples: no corner cutting.
    distances = sorted(set([total*i/count for i in range(count+1)] + cumulative))
    for distance in distances:
        p, tangent, normal, z, bank = base.road_cross_section(line, cumulative, distance, raster, origin_z, track_width(distance), z_offset=.38)
        samples.append((distance, *p, z, tangent, normal, bank, track_width(distance)))
    for start, end in zip(distances, distances[1:]):
        road.add_quad([point(d, side*track_width(d)/2) for d, side in ((start,1),(end,1),(end,-1),(start,-1))])
        for side in (-1, 1):
            paint.add_quad([point(d, side*(track_width(d)/2-inset), .405) for d, inset in ((start,.05),(end,.05),(end,.18),(start,.18))])
    road.create_object("Baku_Circuit_Surface", [asphalt], collections["Circuit"])

    # Alternating kerbs only around mapped corner apexes, following the inside turn.
    curb_segments = 0
    for turn in config["model"]["turns"]:
        d = turn["distanceMeters"]
        before = base.sample_tangent(line, cumulative, d-9)
        after = base.sample_tangent(line, cumulative, d+9)
        side = 1 if before.x*after.y-before.y*after.x > 0 else -1
        span = 9 if 8 <= turn["number"] <= 12 else 16
        for i in range(span):
            a, b = d-span+2*i, d-span+2*i+1.94
            curbs.add_quad([point(v, side*(track_width(v)/2+offset), .455)
                           for v, offset in ((a,0),(b,0),(b,.65),(a,.65))], i%2)
            curb_segments += 1
    curbs.create_object("Baku_Red_White_Kerbs", [red, white], collections["Circuit"])

    # The OSM pit axis represents the fast lane. Widen its working side northwards.
    source_pit = config["pitLane"]
    pit_cumulative, pit_total = base.line_distance(source_pit)
    pit = []
    for i in range(191):
        d = pit_total*i/190
        p = base.sample_polyline(source_pit, pit_cumulative, d, closed=False)
        t = base.sample_tangent(source_pit, pit_cumulative, d, closed=False)
        blend = min(d/55, (pit_total-d)/55, 1)
        shift = 2 * max(blend, 0)**2 * (3-2*max(blend, 0))
        pit.append((p[0]-t.y*shift, p[1]+t.x*shift))
    pit_object, pc, pt, pit_samples = base.create_ribbon("Baku_Pit_Fast_And_Working_Lanes", pit, raster, center, origin_z,
        8, asphalt, collections["Circuit"], z_offset=.39, interval=2, closed=False, taper_meters=35)
    _, wall_quality = base.create_pit_wall(pit, line, raster, center, origin_z,
        [concrete, metal], collections["Infrastructure"], start_ratio=.19, end_ratio=.82)
    def pit_point(d, lateral=0, offset=.43):
        return point(d, lateral, offset, pit, pc, False, 8)
    for i in range(35, int(pt)-35, 3):
        for lateral in (-3.7, .5, 3.7):
            paint.add_quad([pit_point(d, l) for d,l in ((i,lateral),(i+2.95,lateral),(i+2.95,lateral+.12),(i,lateral+.12))])
    garage = base.MeshBuilder()
    pit_reservations = []
    for i in range(44):
        start = pt*.20 + i*(pt*.60/44)
        end = start + pt*.60/44-.08
        polygon = []
        for d,lateral in ((start,4.5),(end,4.5),(end,23),(start,23)):
            p = base.sample_polyline(pit, pc, d, closed=False)
            t = base.sample_tangent(pit, pc, d, closed=False)
            polygon.append((p[0]-t.y*lateral,p[1]+t.x*lateral))
        pit_reservations.append(polygon)
        z = max(raster.sample(*p) for p in polygon)-origin_z
        base.add_polygon_prism(garage, [polygon], center, z, z+8.4,
            roof_color=(.78,.79,.75,1), wall_color=(.69,.70,.66,1))
        # Garage openings face the working lane; hospitality glazing is above.
        for height, size, color in ((2.0,3.7,(.09,.12,.14,1)),(6.4,2.0,(.10,.20,.25,1))):
            a, b = pit_point(start+.22,4.46), pit_point(end-.22,4.46)
            garage.add_quad(((a[0],a[1],z+height-size/2),(b[0],b[1],z+height-size/2),
                             (b[0],b[1],z+height+size/2),(a[0],a[1],z+height+size/2)), color=color)
        if 2 <= i < 42:
            paint.add_quad([pit_point(d,l) for d,l in ((start+.3,.9),(start+.3,3.5),(start+.44,3.5),(start+.44,.9))])
    garage.create_object("Baku_44_Pit_Service_Bays", [pit_mat], collections["Infrastructure"], vertex_colors=True)

    # Permanent city fabric comes exclusively from Baku's mapped polygons.
    footprints = []
    for element in osm["elements"]:
        tags = element.get("tags", {})
        if element["type"] not in ("way", "relation") or not (tags.get("building") or tags.get("building:part")):
            continue
        polygon = [source.utm39n(p["lat"], p["lon"]) for p in element["geometry"]]
        if len(polygon)<4 or math.dist(polygon[0],polygon[-1])>.1:
            continue
        if not all(bounds["minX"]<=p[0]<=bounds["maxX"] and bounds["minY"]<=p[1]<=bounds["maxY"] for p in polygon):
            continue
        footprints.append((element, polygon))
    # Keep permanent buildings. Reject estimated event sections that collide with them.
    stand_config = {**config, "grandstands": []}
    stand_rejected = 0
    for stand in config["grandstands"]:
        d = stand["start"]
        while d < stand["end"]:
            part = {**stand, "start": d, "end": min(d+18, stand["end"])}
            polygon = base.grandstand_reservation_polygons({"grandstands":[part]},line,cumulative)[0]
            if any(base.polygons_overlap(polygon, building) for _, building in footprints) or any(base.polygons_overlap(polygon,p) for p in pit_reservations):
                stand_rejected += 1
            else:
                stand_config["grandstands"].append(part)
            d += 18
    _, stand_count, stand_quality = base.create_grandstands(stand_config, line, cumulative, total, raster,
        center, origin_z, [metal, seat_dark, seat], collections["Grandstands"])
    stand_quality["sectionsRejectedForPermanentBuildings"] = stand_rejected
    stand_quality["placementAccuracy"] = "estimated from event maps/photos; conflicting sections omitted"
    stand_quality.pop("verifiedTurnTenZone", None)
    covered = base.MeshBuilder()
    for stand in stand_config["grandstands"]:
        if stand["name"] != "Absheron C": continue
        d=(stand["start"]+stand["end"])/2
        p=base.sample_polyline(line,cumulative,d)
        tangent=base.sample_tangent(line,cumulative,d)
        normal=Vector((-tangent.y,tangent.x))
        lx,ly=base.local_xy(p,center)
        z=raster.sample(*p)-origin_z
        rotation=math.atan2(tangent.y,tangent.x)
        covered.add_box((lx-normal.x*37,ly-normal.y*37,z+11),(stand["end"]-stand["start"]-.2,8.5,.22),0,rotation=rotation)
        for along in (-7,7):
            covered.add_box((lx+tangent.x*along-normal.x*40.5,ly+tangent.y*along-normal.y*40.5,z+5.5),(.16,.16,11),1,rotation=rotation)
    covered.create_object("Baku_Absheron_C_Upper_Canopy",[white,metal],collections["Grandstands"])

    city = base.MeshBuilder()
    hotel_geometry = base.MeshBuilder()
    hotel_details, restored_relations = [], []
    facade_vertices, facade_faces, facade_uvs = [], [], []
    def facade_quad(vertices, uvs):
        first=len(facade_vertices)
        facade_vertices.extend(vertices)
        facade_uvs.extend(uvs)
        facade_faces.append((first,first+1,first+2,first+3))
    def linear_rgb(value):
        return value/12.92 if value<=.04045 else ((value+.055)/1.055)**2.4
    roof_quality = {}
    building_count, tagged_heights, omitted_road = 0, 0, 0
    road_points = [(s[1],s[2]) for s in samples]
    tree = kdtree.KDTree(len(road_points))
    for i,p in enumerate(road_points): tree.insert((*p,0),i)
    tree.balance()
    def road_conflict(polygon, margin=0):
        for p in polygon:
            _, i, distance = tree.find((*p,0))
            if distance < track_width(samples[i][0])/2+margin: return True
        # An entire road can pass through a large footprint without touching vertices.
        min_x,max_x = min(p[0] for p in polygon),max(p[0] for p in polygon)
        min_y,max_y = min(p[1] for p in polygon),max(p[1] for p in polygon)
        return any(min_x<x<max_x and min_y<y<max_y and base.point_in_polygon((x,y),polygon) for x,y in road_points)
    facade_details = {"buildings": 0, "windows": 0, "cornices": 0, "doors": 0,
                      "excludedBuildings": [],
                      "accuracy": "Approximate repeating window bays on all residential/city facades; photographed landmarks preserved."}
    facade_planes = {}
    def add_building_windows(element, first_face, ground, top):
        tags=element["tags"]
        excluded=element["id"] in (153876715,299418016) or tags.get("building") in ("roof","carport","shed","garages","garage","ruins")
        if excluded:
            facade_details["excludedBuildings"].append({"osmWayId":element["id"],
                "reason":"photographed landmark" if element["id"] in (153876715,299418016) else "non-residential utility structure"})
            return
        floors=max(1,min(40,round((top-ground)/3.2)))
        edges=set()
        for index in range(first_face,len(city.faces)):
            points=[city.vertices[i] for i in city.faces[index]]
            if max(p[2] for p in points)-min(p[2] for p in points)<.1: continue
            ends=sorted(set((p[0],p[1]) for p in points))
            if len(ends)!=2: continue
            a,b=ends
            length=math.dist(a,b)
            if length<1.8: continue
            columns=max(1,round(length/3.4))
            city.material_indices[index]=2
            city.face_colors[index]=tuple(linear_rgb(v) for v in (.64,.58,.48))+(1,)
            tangent=((b[0]-a[0])/length,(b[1]-a[1])/length)
            plane=(round(tangent[0],5),round(tangent[1],5),round(a[0]*tangent[1]-a[1]*tangent[0],2))
            facade_planes.setdefault(plane,[]).append((element["id"],index,a,b,tangent,ground))
            edge=tuple(ends)
            if edge not in edges:
                edges.add(edge)
                facade_details["windows"]+=columns*floors
                facade_details["cornices"]+=floors
        if edges:
            facade_details["buildings"]+=1
        else:
            facade_details["excludedBuildings"].append({"osmWayId":element["id"],"reason":"no wall wide enough for a window bay"})
    for element, polygon in footprints:
        tags = element["tags"]
        if road_conflict(polygon) or any(base.polygons_overlap(polygon,p) for p in pit_reservations):
            omitted_road += 1
            continue
        if element["id"] in landmarks.HOTELS:
            ground = min(raster.sample(*p) for p in polygon)-origin_z
            hotel_details.append(landmarks.build_hotel(hotel_geometry, base, element, polygon, center, ground))
            facade_details["excludedBuildings"].append({"osmWayId":element["id"], "reason":"individual photo-referenced hotel facade"})
            building_count += 1
            tagged_heights += 1
            continue
        try:
            height = float(tags["height"].replace(" m", "")) if "height" in tags else float(tags["building:levels"])*3.2
            tagged_heights += 1
        except (KeyError, ValueError):
            height = 5.5 if tags.get("building") in ("house","garage","garages","shed") else 12.8
        height = min(max(height,2),150)
        if element["id"] == 153876715:
            # Front facade width from OSM divided by the cropped photograph's aspect.
            height = math.dist(polygon[2],polygon[3]) / (2112/1010)
        ground = min(raster.sample(*p) for p in polygon)-origin_z
        top = max(raster.sample(*p) for p in polygon)-origin_z+height
        shade = ((element["id"]*17)%19)/100
        wall = tuple(linear_rgb(v) for v in (.55+shade,.49+shade,.39+shade))+(1,)
        roof = (.43+shade,.41+shade,.37+shade,1)
        first_face=len(city.faces)
        rings = [polygon] + [[source.utm39n(p["lat"], p["lon"]) for p in ring] for ring in element.get("innerRings", [])]
        if len(rings)>1:
            for i,ring in enumerate(rings):
                area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring,ring[1:]))
                if (area>0)!=(i==0): ring.reverse()
        if base.add_polygon_prism(city,rings,center,ground,top,roof_color=roof,wall_color=wall,roof_quality=roof_quality):
            building_count += 1
            add_building_windows(element,first_face,ground,top)
            if element["type"]=="relation":
                restored_relations.append({"osmRelationId":element["id"], "name":tags.get("name:ru",tags.get("name")),
                    "courtyards":len(rings)-1, "heightMeters":round(top-ground,3),
                    "localRings":[[list(base.local_xy(p,center)) for p in ring] for ring in rings]})
        if element["id"] == 153876715:
            a,b=polygon[2],polygon[3]
            dx,dy=b[0]-a[0],b[1]-a[1]
            length=math.hypot(dx,dy)
            a=base.local_xy((a[0]-dy/length*.04,a[1]+dx/length*.04),center)
            b=base.local_xy((b[0]-dy/length*.04,b[1]+dx/length*.04),center)
            facade_quad([(*a,ground),(*a,top),(*b,top),(*b,ground)],
                        [(.001,.001),(.001,.999),(1535/1792,.999),(1535/1792,.001)])
        elif element["id"] == 299418016:
            for a,b in zip(polygon,polygon[1:]):
                dx,dy=b[0]-a[0],b[1]-a[1]
                length=math.hypot(dx,dy)
                # OSM's tower ring is counterclockwise, so its outward normal is right.
                a=base.local_xy((a[0]+dy/length*.04,a[1]-dx/length*.04),center)
                b=base.local_xy((b[0]+dy/length*.04,b[1]-dx/length*.04),center)
                facade_quad([(*a,ground),(*b,ground),(*b,top),(*a,top)],
                            [(1537/1792,.001),(.999,.001),(.999,.999),(1537/1792,.999)])
    # OSM building parts sometimes share a facade with the parent footprint.
    # Identical world-space bays and colours on overlapping planes prevent
    # two different window patterns from fighting over the same pixels.
    facade_details["sharedFacadePlanesAligned"]=0
    for records in facade_planes.values():
        if len({record[0] for record in records})<2: continue
        tangent=records[0][4]
        def along(p): return p[0]*tangent[0]+p[1]*tangent[1]
        if not any(a[0]!=b[0] and min(along(a[3]),along(b[3]))-max(along(a[2]),along(b[2]))>.1
                   for i,a in enumerate(records) for b in records[:i]): continue
        facade_details["sharedFacadePlanesAligned"]+=1
    city_object = city.create_object("Baku_OSM_Permanent_Buildings", [city_mat,aerial,window_material], collections["Buildings"], vertex_colors=True)
    city_object.data.validate(clean_customdata=False)
    city_object.data.update()
    # The roof receives the pixels at this building's actual geographic location.
    # Reuse the ground image datablock: no duplicated satellite texture in the GLB.
    roof_uv = city_object.data.uv_layers.new(name="Baku_Roof_Orthophoto_UV")
    textured_roof_faces = 0
    for polygon in city_object.data.polygons:
        if polygon.normal.z > .9:
            polygon.material_index=1
            textured_roof_faces += 1
        points=[city_object.data.vertices[i].co for i in polygon.vertices]
        axis=0 if max(p.x for p in points)-min(p.x for p in points)>=max(p.y for p in points)-min(p.y for p in points) else 1
        for loop_index in polygon.loop_indices:
            vertex=city_object.data.vertices[city_object.data.loops[loop_index].vertex_index].co
            if polygon.material_index==2:
                # Derive UVs after validate(), which removes duplicate OSM
                # faces and changes polygon indices. World coordinates also
                # keep nearly coincident parent/part facades aligned.
                # Half-texel precision is sufficient for the 128 px bay and
                # compresses shared-facade coordinates without visible drift.
                roof_uv.data[loop_index].uv=tuple(round(value*256)/256 for value in (vertex[axis]/3.4,vertex.z/3.2))
                continue
            roof_uv.data[loop_index].uv=(((vertex.x+center["x"]-bounds["minX"])/(bounds["maxX"]-bounds["minX"]),
                                          (vertex.y+center["y"]-bounds["minY"])/(bounds["maxY"]-bounds["minY"]))
                                         if polygon.material_index==1 else (0,0))
    # Blender 5.2's exporter drops the colour attribute on the second material
    # that uses the same vertex colours. Split the facade into one mesh/material;
    # the number of rendered primitives stays unchanged.
    window_mesh=city_object.data.copy()
    for mesh,keep_windows in ((window_mesh,True),(city_object.data,False)):
        editable=bmesh.new()
        editable.from_mesh(mesh)
        bmesh.ops.delete(editable,geom=[face for face in editable.faces if (face.material_index==2)!=keep_windows],context="FACES")
        editable.to_mesh(mesh)
        editable.free()
    window_object=bpy.data.objects.new("Baku_Window_Facades",window_mesh)
    collections["Buildings"].objects.link(window_object)
    window_mesh.name="Baku_Window_Facades_Mesh"
    window_object.data.materials.clear()
    window_object.data.materials.append(window_material)
    for polygon in window_object.data.polygons: polygon.material_index=0
    # Share the existing city material and draw call. Keep these architectural
    # roof colours separate from the geographic UV assignment above.
    hotels_object=hotel_geometry.create_object("Baku_Individual_Hotels",[city_mat],collections["Buildings"],vertex_colors=True)
    bpy.ops.object.select_all(action="DESELECT")
    city_object.select_set(True)
    hotels_object.select_set(True)
    bpy.context.view_layer.objects.active=city_object
    bpy.ops.object.join()
    facade_mesh=bpy.data.meshes.new("Baku_Actual_Landmark_Facades_Mesh")
    facade_mesh.from_pydata(facade_vertices,[],facade_faces)
    facade_mesh.materials.append(facade_material)
    facade_layer=facade_mesh.uv_layers.new(name="Baku_Facade_Photo_Atlas_UV")
    for polygon in facade_mesh.polygons:
        for loop_index in polygon.loop_indices:
            facade_layer.data[loop_index].uv=facade_uvs[facade_mesh.loops[loop_index].vertex_index]
    facade_mesh.update()
    facade_object=bpy.data.objects.new("Baku_Actual_Landmark_Facades",facade_mesh)
    collections["Buildings"].objects.link(facade_object)

    walls = base.MeshBuilder()
    wall_segments = 0
    trees = base.MeshBuilder()
    tree_count = 0
    landscape={"treeRowTrees":0,"areaTrees":0,"shrubs":0,"plantingBorders":0,
               "areas":[],"placements":[],
               "accuracy":"OSM tree points/rows and planted areas; park infill constrained by green vegetation in Planet 2018 imagery. Spacing, crowns and heights approximate. Paths and water excluded."}
    planted={}
    obstacle_cells={}
    def index_polygon(polygon):
        box=(min(p[0] for p in polygon),min(p[1] for p in polygon),max(p[0] for p in polygon),max(p[1] for p in polygon))
        for gx in range(math.floor(box[0]/64),math.floor(box[2]/64)+1):
            for gy in range(math.floor(box[1]/64),math.floor(box[3]/64)+1):
                obstacle_cells.setdefault((gx,gy),[]).append((box,polygon))
    for _,polygon in footprints: index_polygon(polygon)
    for polygon in pit_reservations+base.grandstand_reservation_polygons(stand_config,line,cumulative): index_polygon(polygon)
    mapped_ways=[]
    path_points=[]
    for element in osm["elements"]:
        if element["type"]!="way": continue
        tags=element.get("tags",{})
        polygon=[source.utm39n(p["lat"],p["lon"]) for p in element["geometry"]]
        mapped_ways.append((element,polygon))
        if tags.get("natural")=="water" and len(polygon)>3 and polygon[0]==polygon[-1]: index_polygon(polygon)
        if "highway" not in tags: continue
        road_type=tags["highway"]
        default_width=2 if road_type in ("footway","path","steps","cycleway") else 5 if road_type in ("service","pedestrian") else 9
        try: width=float(tags.get("width",default_width))
        except ValueError: width=default_width
        for a,b in zip(polygon,polygon[1:]):
            count=max(1,math.ceil(math.dist(a,b)/3))
            for i in range(count):
                t=i/count
                path_points.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,width/2))
    path_tree=kdtree.KDTree(len(path_points))
    for i,(x,y,_) in enumerate(path_points): path_tree.insert((x,y,0),i)
    path_tree.balance()
    def segment_distance(p,a,b):
        dx,dy=b[0]-a[0],b[1]-a[1]
        t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/max(dx*dx+dy*dy,1e-9)))
        return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
    def planting_clear(x,y,radius):
        if not(bounds["minX"]+radius<x<bounds["maxX"]-radius and bounds["minY"]+radius<y<bounds["maxY"]-radius): return False
        _,i,distance=tree.find((x,y,0))
        if distance<track_width(samples[i][0])/2+radius+2: return False
        for _,i,distance in path_tree.find_range((x,y,0),radius+14):
            if distance<path_points[i][2]+radius+1.5: return False
        for gx in range(math.floor((x-radius)/64),math.floor((x+radius)/64)+1):
            for gy in range(math.floor((y-radius)/64),math.floor((y+radius)/64)+1):
                for box,polygon in obstacle_cells.get((gx,gy),[]):
                    if not(box[0]-radius<=x<=box[2]+radius and box[1]-radius<=y<=box[3]+radius): continue
                    if base.point_in_polygon((x,y),polygon) or any(segment_distance((x,y),a,b)<radius for a,b in zip(polygon,polygon[1:])): return False
        for gx in range(math.floor((x-radius-4)/8),math.floor((x+radius+4)/8)+1):
            for gy in range(math.floor((y-radius-4)/8),math.floor((y+radius+4)/8)+1):
                if any(math.hypot(x-px,y-py)<radius+pr+.6 for px,py,pr in planted.get((gx,gy),[])): return False
        return True
    def crown(x,y,z,radius,height,color,phase=0):
        sides=6
        rings=[]
        for fraction,scale in ((.22,.78),(.65,1)):
            rings.append([(x+math.cos(phase+i*math.tau/sides)*radius*scale,
                           y+math.sin(phase+i*math.tau/sides)*radius*scale,z+height*fraction) for i in range(sides)])
        for i in range(sides):
            following=(i+1)%sides
            shade=tuple(c*(.86+.14*(i%3)/2) for c in color[:3])+(1,)
            trees.add_triangle(((x,y,z),rings[0][following],rings[0][i]),color=shade)
            trees.add_quad((rings[0][i],rings[0][following],rings[1][following],rings[1][i]),color=shade)
            trees.add_triangle((rings[1][i],rings[1][following],(x,y,z+height)),color=color)
    def plant(x,y,seed,source_id,kind,shrub=False):
        rng=random.Random(seed)
        radius=rng.uniform(.65,1.05) if shrub else rng.uniform(1.8,2.6)
        if not planting_clear(x,y,radius): return False
        lx,ly=base.local_xy((x,y),center)
        z=raster.sample_rendered_terrain(x,y)-origin_z
        if shrub:
            crown(lx,ly,z,radius,rng.uniform(.7,1.25),(.10,.18,.055,1),rng.random())
            landscape["shrubs"]+=1
        else:
            trunk=rng.uniform(2.5,3.5)
            trees.add_cylinder((lx,ly,z-.04),.17,trunk+1,sides=4,color=(.12,.085,.04,1))
            crown(lx,ly,z+trunk-.6,radius,rng.uniform(3.2,4.8),(.12+rng.random()*.045,.23+rng.random()*.07,.065,1),rng.random())
        planted.setdefault((math.floor(x/8),math.floor(y/8)),[]).append((x,y,radius))
        landscape["placements"].append({"sourceId":source_id,"kind":kind,"x":round(x,3),"y":round(y,3),"radius":round(radius,3)})
        return True
    for element in osm["elements"]:
        tags = element.get("tags", {})
        if element["type"] == "node" and tags.get("natural") == "tree":
            x,y = source.utm39n(element["lat"],element["lon"])
            if plant(x,y,element["id"],element["id"],"mapped-tree"):
                tree_count += 1
        elif element["type"] == "way" and (tags.get("historic") in ("citywalls","city_wall") or tags.get("barrier")=="city_wall"):
            points = [source.utm39n(p["lat"],p["lon"]) for p in element["geometry"]]
            for a,b in zip(points,points[1:]):
                midpoint = ((a[0]+b[0])/2,(a[1]+b[1])/2)
                if not(bounds["minX"]<midpoint[0]<bounds["maxX"] and bounds["minY"]<midpoint[1]<bounds["maxY"]): continue
                if tree.find((*midpoint,0))[2] < 4.5: continue
                lx,ly = base.local_xy(midpoint,center)
                z = raster.sample(*midpoint)-origin_z
                walls.add_box((lx,ly,z+4.5),(math.dist(a,b),2,9),color=(.58,.49,.34,1),rotation=math.atan2(b[1]-a[1],b[0]-a[0]))
                wall_segments += 1
    # Complete tree rows using mapped lines, then populate mapped planted areas.
    # Park outlines do not imply that their paths, squares or fountains are woodland.
    for element,polygon in mapped_ways:
        if element.get("tags",{}).get("natural")!="tree_row": continue
        cumulative_row,row_length=base.line_distance(polygon)
        count=max(1,round(row_length/9))
        for i in range(count+1):
            x,y=base.sample_polyline(polygon,cumulative_row,row_length*i/count,closed=False)
            if plant(x,y,element["id"]*101+i,element["id"],"tree-row"):
                landscape["treeRowTrees"]+=1
    planting_areas=[]
    aerial_image=next(node.image for node in aerial.node_tree.nodes if node.type=="TEX_IMAGE")
    aerial_pixels=list(aerial_image.pixels)
    image_width,image_height=aerial_image.size
    def pictured_vegetation(x,y):
        column=int((x-bounds["minX"])/(bounds["maxX"]-bounds["minX"])*image_width)
        row=int((y-bounds["minY"])/(bounds["maxY"]-bounds["minY"])*image_height)
        green_samples=0
        for dx,dy in ((0,0),(-1,0),(1,0),(0,-1),(0,1)):
            col,rr=max(0,min(image_width-1,column+dx)),max(0,min(image_height-1,row+dy))
            r,g,b=aerial_pixels[(rr*image_width+col)*4:(rr*image_width+col)*4+3]
            green_samples+=g>r*1.025 and g>b*1.08 and g<.72
        return green_samples>=3
    for element,polygon in mapped_ways:
        tags=element.get("tags",{})
        if len(polygon)<4 or polygon[0]!=polygon[-1]: continue
        if not (tags.get("landuse") in ("grass","forest") or tags.get("natural") in ("wood","scrub") or tags.get("leisure") in ("garden","park")): continue
        if not any(bounds["minX"]<x<bounds["maxX"] and bounds["minY"]<y<bounds["maxY"] for x,y in polygon): continue
        planting_areas.append((element,polygon))
    planting_areas.sort(key=lambda item: min(tree.find((*p,0))[2] for p in item[1]))
    for element,polygon in planting_areas:
        tags=element["tags"]
        wooded=tags.get("natural")=="wood" or tags.get("landuse")=="forest"
        park=tags.get("leisure") in ("park","garden")
        before=len(landscape["placements"])
        spacing=13 if wooded or park else 18
        min_x,max_x=max(bounds["minX"],min(p[0] for p in polygon)),min(bounds["maxX"],max(p[0] for p in polygon))
        min_y,max_y=max(bounds["minY"],min(p[1] for p in polygon)),min(bounds["maxY"],max(p[1] for p in polygon))
        rng=random.Random(element["id"])
        for ix in range(math.floor(min_x/spacing),math.ceil(max_x/spacing)):
            for iy in range(math.floor(min_y/spacing),math.ceil(max_y/spacing)):
                x,y=(ix+.5+rng.uniform(-.18,.18))*spacing,(iy+.5+rng.uniform(-.18,.18))*spacing
                if not base.point_in_polygon((x,y),polygon): continue
                if min(segment_distance((x,y),a,b) for a,b in zip(polygon,polygon[1:]))<3: continue
                tall=wooded or park
                if park and not pictured_vegetation(x,y): continue
                if landscape["areaTrees"]>=700 and tall: continue
                if landscape["shrubs"]>=550 and not tall: continue
                if plant(x,y,element["id"]*173+ix*19+iy,element["id"],"woodland" if wooded else "park-imagery" if park else "planted-bed",shrub=not tall):
                    if tall: landscape["areaTrees"]+=1
        # A low border along the actual small lawn footprint gives planted beds
        # depth without replacing the aerial ground image or inventing new hills.
        area=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(polygon,polygon[1:])))/2
        if tags.get("landuse")=="grass" and 15<area<1800:
            for a,b in zip(polygon,polygon[1:]):
                length=math.dist(a,b)
                count=max(1,math.ceil(length/5))
                for i in range(count):
                    p=tuple(a[k]+(b[k]-a[k])*i/count for k in range(2))
                    q=tuple(a[k]+(b[k]-a[k])*(i+1)/count for k in range(2))
                    if not all(planting_clear(x,y,.15) for x,y in (p,q,((p[0]+q[0])/2,(p[1]+q[1])/2))): continue
                    px,py=base.local_xy(p,center)
                    qx,qy=base.local_xy(q,center)
                    pz=raster.sample_rendered_terrain(*p)-origin_z+.02
                    qz=raster.sample_rendered_terrain(*q)-origin_z+.02
                    trees.add_quad(((px,py,pz),(qx,qy,qz),(qx,qy,qz+.22),(px,py,pz+.22)),color=(.29,.29,.24,1))
                    landscape["plantingBorders"]+=1
        if len(landscape["placements"])>before:
            landscape["areas"].append({"osmWayId":element["id"],"tags":tags,"plants":len(landscape["placements"])-before})
    landscape["mappedPointTrees"]=tree_count
    tree_count += landscape["treeRowTrees"]+landscape["areaTrees"]
    planted={}
    landscape["placementConflicts"]=sum(not planting_clear(p["x"],p["y"],p["radius"]) for p in landscape["placements"])
    if landscape["placementConflicts"]: raise ValueError("Baku planting overlaps a road, path, water or reserved footprint")
    if wall_segments: walls.create_object("Baku_Mapped_Old_City_Walls",[city_mat],collections["Buildings"],vertex_colors=True)
    if tree_count:
        tree_object=trees.create_object("Baku_Mapped_Trees",[green],collections["Buildings"],vertex_colors=True)
        tree_object.data.validate(clean_customdata=False)

    # Road-edge safety wall modules, with open pit entry and exit.
    fence_segments = 0
    pit_opening_omissions = 0
    pit_tree = kdtree.KDTree(len(pit))
    for i,p in enumerate(pit): pit_tree.insert((*p,0),i)
    pit_tree.balance()
    for d in range(0,int(total),6):
        for side in (-1,1):
            if side==1 and (d<295 or d>total-215): continue
            a,b = point(d,side*(track_width(d)/2+1)),point(d+5.9,side*(track_width(d+5.9)/2+1))
            # Do not place a barrier across the closely adjacent opposite straight.
            global_mid = ((a[0]+b[0])/2+center["x"],(a[1]+b[1])/2+center["y"])
            # Geometric opening, including the part beyond T1 where the pit exit merges.
            # Test both ends and midpoint so no six-metre wall can bridge the opening.
            if any(pit_tree.find((x,y,0))[2] < 8 for x,y in
                   ((a[0]+center["x"],a[1]+center["y"]),global_mid,(b[0]+center["x"],b[1]+center["y"]))):
                pit_opening_omissions += 1
                continue
            nearby = tree.find_range((*global_mid,0),6)
            if any(min(abs(samples[i][0]-d),total-abs(samples[i][0]-d))>35 for _,i,_ in nearby): continue
            length = math.hypot(b[0]-a[0],b[1]-a[1])
            rotation = math.atan2(b[1]-a[1],b[0]-a[0])
            z=max(a[2],b[2])
            barriers.add_box(((a[0]+b[0])/2,(a[1]+b[1])/2,z+.5),(length,.28,1),0,rotation=rotation)
            barriers.add_box(((a[0]+b[0])/2,(a[1]+b[1])/2,z+2.2),(length,.055,.055),1,rotation=rotation)
            barriers.add_cylinder((a[0],a[1],z+1),.055,1.25,sides=5,material_index=1)
            fence_segments += 1
    barriers.create_object("Baku_Roadside_Safety_Walls",[concrete,metal],collections["Infrastructure"])
    # Project paint onto the actual triangulated road at corner and pit-merge seams.
    # A cross-section estimate alone can hide a line below overlapping road faces.
    support_vertices=list(road.vertices)+[tuple(v.co) for v in pit_object.data.vertices]
    support_faces=list(road.faces)+[tuple(i+len(road.vertices) for i in polygon.vertices) for polygon in pit_object.data.polygons]
    support=BVHTree.FromPolygons(support_vertices,support_faces,all_triangles=True)
    def painted_height(x,y,fallback):
        hit,_,_,_=support.ray_cast(Vector((x,y,1000)),Vector((0,0,-1)),2000)
        return hit.z+.03 if hit is not None else fallback
    paint.vertices=[(x,y,painted_height(x,y,z)) for x,y,z in paint.vertices]
    for _ in range(2):
        lifts={}
        for face in paint.faces:
            vertices=[paint.vertices[i] for i in face]
            lift=0
            for weights in ((1/3,1/3,1/3),(.8,.1,.1),(.1,.8,.1),(.1,.1,.8)):
                p=[sum(v[axis]*w for v,w in zip(vertices,weights)) for axis in range(3)]
                lift=max(lift,painted_height(*p)-p[2])
            if lift>0:
                for i in face: lifts[i]=max(lifts.get(i,0),lift)
        for i,lift in lifts.items():
            x,y,z=paint.vertices[i]
            paint.vertices[i]=(x,y,z+lift)
    paint.create_object("Baku_Road_And_Pit_Paint",[white],collections["Circuit"])

    sector_mats = [material(f"Sector_{i+1}",c,emission_strength=.25) for i,c in enumerate(base.SECTOR_COLORS)]
    black = material("Control_Black",(.02,.025,.03,1))
    glow = [material(f"Sector_{i+1}_Glow",(*c[:3],.25),emission_strength=.5,use_vertex_alpha=True) for i,c in enumerate(base.SECTOR_COLORS)]
    finish, sectors, _, _ = base.create_track_annotations(config,osm,line,cumulative,total,raster,center,origin_z,
        sector_mats+[white,black]+glow,collections["Annotations"])
    start=config["model"]["raceStartDistanceMeters"]
    base.anchor_at("RaceStart",start,line,cumulative,total,raster,center,origin_z,collections["Annotations"],side=-1)
    start_paint=base.MeshBuilder()
    base.add_cross_track_band(start_paint,line,cumulative,start,raster,center,origin_z,0,half_width=.16,z_offset=.5)
    # Staggered starting grid on the main road, behind the separate race start line.
    for i in range(22):
        d=start-8-(i//2)*16
        side=1 if i%2 else -1
        for a,b,l,r in ((d,d+.12,side*2.0,side*4.0),(d-3,d,side*4,side*4+.12)):
            start_paint.add_quad([point(v,w,.5) for v,w in ((a,l),(b,l),(b,r),(a,r))])
    start_paint.create_object("Baku_Race_Start_And_Grid",[white],collections["Annotations"])
    base.create_start_gantry(start,line,cumulative,raster,center,origin_z,[metal,red],collections["Infrastructure"])
    low,high=base.create_extrema_anchors(line,cumulative,total,raster,center,origin_z,collections["Annotations"])
    for name in ("LowPoint","HighPoint"):
        del bpy.data.objects[name]["elevation_nap_m"]
    base.add_lighting(collections["Terrain"])
    for obj in bpy.data.objects:
        if "DutchGP" in obj.name:
            obj.name = "Baku_Event_Grandstands"
            obj.data.name = "Baku_Event_Grandstands_Mesh"
        if "NorthSea" in obj.name:
            obj.name = "Baku_Sun"
            obj.data.name = "Baku_Sun"
    camera_data=bpy.data.cameras.new("Baku_Preview_Camera")
    camera=bpy.data.objects.new("Baku_Preview_Camera",camera_data)
    collections["Terrain"].objects.link(camera)
    camera.location=(350,-1700,2450)
    base.look_at(camera,(0,0,15))
    camera_data.type="ORTHO"
    camera_data.ortho_scale=2850
    camera_data.clip_end=12000
    scene.camera=camera
    scene.render.resolution_x,scene.render.resolution_y=1600,1100
    scene.render.image_settings.file_format="WEBP"
    scene.render.image_settings.quality=92
    scene.render.filepath=str(Path(args.preview).resolve())
    bpy.ops.wm.save_as_mainfile(filepath=str(prepared / "baku.blend"))
    bpy.ops.render.render(write_still=True)
    # Retain centimetre paint accuracy after Meshopt quantisation over a 2.47 km scene.
    from io_scene_gltf2.io.exp import meshopt
    original=meshopt.MeshoptEncoder.encode_attribute
    def precise_positions(attribute_name,data,byte_stride,settings):
        previous=meshopt.EXP_FILTER_BITS
        try:
            if attribute_name=="POSITION": meshopt.EXP_FILTER_BITS=18
            return original(attribute_name,data,byte_stride,settings)
        finally: meshopt.EXP_FILTER_BITS=previous
    meshopt.MeshoptEncoder.encode_attribute=staticmethod(precise_positions)
    try: base.export_glb(Path(args.glb).resolve())
    finally: meshopt.MeshoptEncoder.encode_attribute=staticmethod(original)
    profile=[{"distanceMeters":round(d,4),"elevationMeters":round(raster.sample(*base.sample_polyline(line,cumulative,d)),4)} for d in distances]
    metadata={
        "schemaVersion":4,"modelId":"baku","generatedWith":f"Blender {bpy.app.version_string}",
        "coordinateReferenceSystem":"EPSG:32639","verticalDatum":"EGM2008 (approximate GEDTM30)",
        "realWorldScale":"1 unit = 1 metre; no vertical exaggeration","verticalExaggeration":1,
        "accuracy":{**config["accuracy"],"roadProfile":"Street grades regularised from lower-decile GEDTM heights; coastal straight flattened; approximate, not surveyed."},"sourceManifest":config["sourceManifest"],
        "buildingTextures":{"roofFaces":textured_roof_faces,"roofSource":"georegistered Planet SkySat 2018-04-09",
                            "facadeDetails":facade_details,
                            "individualHotels":hotel_details,
                            "hotelReferences":base.load_json(HERE.parents[1]/"docs/track-model-baku-hotels.json"),
                            "facadeSources":base.load_json(HERE.parents[1]/"docs/track-model-baku-building-textures.json")},
        "assetLicense":"CC BY-SA 4.0; OSM database ODbL; see /f1/ATTRIBUTION.md",
        "boundsMeters":{"width":2470,"depth":1600},"baseElevationMeters":origin_z,
        "lapLength":{"geometryMeters":round(total,3),"officialFiaMeters":6003,"relativeErrorPercent":round(abs(total-6003)/6003*100,4)},
        "finishDistanceMeters":finish,"raceStartDistanceMeters":start,"sectorBoundaryDistancesMeters":sectors,
        "elevationsMeters":{"low":low[0],"high":high[0]},"elevationProfile":profile,
        "landscape":landscape,
        "objects":{"buildingsTotal":building_count,"buildingsWithTaggedHeightsOrLevels":tagged_heights,
                   "grandstandSections":stand_count,"pitGarageBoxes":44,"turnAnchors":20,
                   "mappedTrees":tree_count,"historicWallSegments":wall_segments,"fenceSegments":fence_segments},
        "layoutQuality":{"surfaceClearance":base.measure_ribbon_terrain_clearance(samples,raster,origin_z),
                         "streetProfile":street_quality,
                         "grandstands":stand_quality,"buildings":{**roof_quality,"omittedRoadOrPitConflicts":omitted_road,"restoredRelations":restored_relations},
                         "curbs":{"segments":curb_segments},"pitLane":{"pitWall":wall_quality,
                         "entrySourceGapMeters":math.dist(pit[0],source_pit[0]),"exitSourceGapMeters":math.dist(pit[-1],source_pit[-1]),
                         "workingSideExpansionMeters":2,"roadBarrierSegmentsOmittedAtPitOpenings":pit_opening_omissions}},
        "replayGeometry":{"track":[[d/total,p[0]-center["x"],p[1]-center["y"],raster.sample(*p)*10] for d,p in zip(cumulative,line)],
                          "pit":[[d/pt,p[0]-center["x"],p[1]-center["y"],raster.sample(*p)*10] for d,p in zip(pc,pit)]},
    }
    Path(args.metadata).write_text(json.dumps(metadata,indent=2)+"\n")
    print(json.dumps({"objects":metadata["objects"],"quality":metadata["layoutQuality"]},indent=2))


if __name__=="__main__": main()
