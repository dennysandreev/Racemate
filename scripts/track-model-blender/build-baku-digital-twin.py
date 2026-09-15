#!/usr/bin/env python3
"""Build Baku from its pinned OSM, Planet SkySat and GEDTM sources.

Shared mesh primitives are reused; all coordinates and event placements are Baku's.
This is a geographically grounded visual model, not a surveyed road-height model.
"""
import importlib.util
import json
import math
from array import array
from pathlib import Path

import bpy
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
        if element["type"] != "way" or not (tags.get("building") or tags.get("building:part")):
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
                      "accuracy": "Approximate floor-based facade details; photographed landmarks preserved."}
    # Spend geometry on the buildings visible from the circuit first. All details
    # share the existing city mesh/material, so they add no draw calls or textures.
    footprints.sort(key=lambda item: min(tree.find((*p,0))[2] for p in item[1]))
    def add_street_windows(element, polygon, ground, top, wall):
        if element["id"] in (153876715,299418016) or facade_details["windows"] >= 4200:
            return
        signed_area = sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(polygon,polygon[1:]))
        orientation = 1 if signed_area > 0 else -1
        before = facade_details["windows"]
        for a,b in zip(polygon,polygon[1:]):
            dx,dy=b[0]-a[0],b[1]-a[1]
            length=math.hypot(dx,dy)
            if length < 3.5: continue
            tangent=(dx/length,dy/length)
            normal=(orientation*tangent[1],-orientation*tangent[0])
            midpoint=((a[0]+b[0])/2,(a[1]+b[1])/2)
            nearest,_,distance=tree.find((*midpoint,0))
            if distance > 150 or sum(normal[i]*(nearest[i]-midpoint[i]) for i in range(2)) < -distance*.2:
                continue
            def panel(left,right,bottom,upper,offset,color):
                def point(along,z):
                    x,y=base.local_xy((a[0]+tangent[0]*along+normal[0]*offset,
                                       a[1]+tangent[1]*along+normal[1]*offset),center)
                    return (x,y,z)
                quad=[point(left,bottom),point(right,bottom),point(right,upper),point(left,upper)]
                city.add_quad(quad if orientation > 0 else list(reversed(quad)),color=color)
            floors=max(1,min(35,round((top-ground)/3.2)))
            floor_height=(top-ground)/floors
            columns=max(1,int((length-1.2)/3.0))
            spacing=(length-1.2)/columns
            frame=tuple(min(1,c*1.28+.025) for c in wall[:3])+(1,)
            for floor in range(floors):
                sill=ground+floor*floor_height+.85
                upper=min(sill+1.7,ground+(floor+1)*floor_height-.4)
                if upper-sill < .7: continue
                for column in range(columns):
                    if facade_details["windows"] >= 4200 or facade_details["windows"]-before >= 160: break
                    middle=.6+(column+.5)*spacing
                    half_width=min(.7,spacing*.3)
                    variation=((element["id"]+floor*7+column*11)%9)/120
                    glass=tuple(linear_rgb(c+variation) for c in (.15,.20,.23))+(1,)
                    panel(middle-half_width-.12,middle+half_width+.12,sill-.12,upper+.12,.055,frame)
                    panel(middle-half_width,middle+half_width,sill,upper,.085,glass)
                    panel(middle-.035,middle+.035,sill,upper,.11,frame)
                    facade_details["windows"] += 1
                cornice=ground+(floor+1)*floor_height-.2
                panel(.08,length-.08,cornice,cornice+.14,.14,frame)
                facade_details["cornices"] += 1
            if length > 7:
                panel(length/2-.65,length/2+.65,ground+.03,ground+min(2.4,floor_height-.2),.12,
                      tuple(linear_rgb(c) for c in (.23,.20,.16))+(1,))
                facade_details["doors"] += 1
        if facade_details["windows"] > before: facade_details["buildings"] += 1
    for element, polygon in footprints:
        tags = element["tags"]
        if road_conflict(polygon) or any(base.polygons_overlap(polygon,p) for p in pit_reservations):
            omitted_road += 1
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
        if base.add_polygon_prism(city,[polygon],center,ground,top,roof_color=roof,wall_color=wall,roof_quality=roof_quality):
            building_count += 1
            add_street_windows(element,polygon,ground,top,wall)
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
    city_object = city.create_object("Baku_OSM_Permanent_Buildings", [city_mat], collections["Buildings"], vertex_colors=True)
    city_object.data.validate(clean_customdata=False)
    city_object.data.update()
    # The roof receives the pixels at this building's actual geographic location.
    # Reuse the ground image datablock: no duplicated satellite texture in the GLB.
    city_object.data.materials.append(aerial)
    roof_uv = city_object.data.uv_layers.new(name="Baku_Roof_Orthophoto_UV")
    textured_roof_faces = 0
    for polygon in city_object.data.polygons:
        if polygon.normal.z > .9:
            polygon.material_index=1
            textured_roof_faces += 1
        for loop_index in polygon.loop_indices:
            vertex=city_object.data.vertices[city_object.data.loops[loop_index].vertex_index].co
            roof_uv.data[loop_index].uv=(((vertex.x+center["x"]-bounds["minX"])/(bounds["maxX"]-bounds["minX"]),
                                          (vertex.y+center["y"]-bounds["minY"])/(bounds["maxY"]-bounds["minY"]))
                                         if polygon.material_index==1 else (0,0))
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
    for element in osm["elements"]:
        tags = element.get("tags", {})
        if element["type"] == "node" and tags.get("natural") == "tree":
            x,y = source.utm39n(element["lat"],element["lon"])
            if not(bounds["minX"]<x<bounds["maxX"] and bounds["minY"]<y<bounds["maxY"]): continue
            if tree.find((x,y,0))[2] < 10: continue
            lx,ly = base.local_xy((x,y),center)
            z = raster.sample(x,y)-origin_z
            trees.add_cylinder((lx,ly,z),.25,3.5,sides=5,color=(.23,.18,.10,1))
            trees.add_cylinder((lx,ly,z+3),2.1,3.5,sides=7,color=(.19,.28,.12,1))
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
    if wall_segments: walls.create_object("Baku_Mapped_Old_City_Walls",[city_mat],collections["Buildings"],vertex_colors=True)
    if tree_count: trees.create_object("Baku_Mapped_Trees",[green],collections["Buildings"],vertex_colors=True)

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
                            "facadeSources":base.load_json(HERE.parents[1]/"docs/track-model-baku-building-textures.json")},
        "assetLicense":"CC BY-SA 4.0; OSM database ODbL; see /f1/ATTRIBUTION.md",
        "boundsMeters":{"width":2470,"depth":1600},"baseElevationMeters":origin_z,
        "lapLength":{"geometryMeters":round(total,3),"officialFiaMeters":6003,"relativeErrorPercent":round(abs(total-6003)/6003*100,4)},
        "finishDistanceMeters":finish,"raceStartDistanceMeters":start,"sectorBoundaryDistancesMeters":sectors,
        "elevationsMeters":{"low":low[0],"high":high[0]},"elevationProfile":profile,
        "objects":{"buildingsTotal":building_count,"buildingsWithTaggedHeightsOrLevels":tagged_heights,
                   "grandstandSections":stand_count,"pitGarageBoxes":44,"turnAnchors":20,
                   "mappedTrees":tree_count,"historicWallSegments":wall_segments,"fenceSegments":fence_segments},
        "layoutQuality":{"surfaceClearance":base.measure_ribbon_terrain_clearance(samples,raster,origin_z),
                         "streetProfile":street_quality,
                         "grandstands":stand_quality,"buildings":{**roof_quality,"omittedRoadOrPitConflicts":omitted_road},
                         "curbs":{"segments":curb_segments},"pitLane":{"pitWall":wall_quality,
                         "entrySourceGapMeters":math.dist(pit[0],source_pit[0]),"exitSourceGapMeters":math.dist(pit[-1],source_pit[-1]),
                         "workingSideExpansionMeters":2,"roadBarrierSegmentsOmittedAtPitOpenings":pit_opening_omissions}},
        "replayGeometry":{"track":[[d/total,p[0]-center["x"],p[1]-center["y"],raster.sample(*p)*10] for d,p in zip(cumulative,line)],
                          "pit":[[d/pt,p[0]-center["x"],p[1]-center["y"],raster.sample(*p)*10] for d,p in zip(pc,pit)]},
    }
    Path(args.metadata).write_text(json.dumps(metadata,indent=2)+"\n")
    print(json.dumps({"objects":metadata["objects"],"quality":metadata["layoutQuality"]},indent=2))


if __name__=="__main__": main()
