#!/usr/bin/env python3
"""Miami 2026, source-based metre geometry, shared Blender export primitives."""
import importlib.util
import json
import math
import heapq
import bisect
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('miami_mesh_tools', SCRIPTS/'build-zandvoort-digital-twin.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.TERRAIN_COLUMNS, base.TERRAIN_ROWS = 181, 111
base.TRACK_SURFACE_Z_OFFSET = .30
base.PIT_LANE_WIDTH_METERS = 8
base.bank_angle = lambda *_: (0,0)
WHITE = (.82,.84,.82,1)
TEAL = (.012,.34,.35,1)
STEEL = (.28,.32,.33,1)


def linear(color):
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in color[:3])+(color[3],)


class MiamiMesh(base.MeshBuilder):
    # Artist/reference colours are sRGB, glTF vertex colours must be linear.
    def add_triangle(self, triangle, material_index=0, color=None):
        super().add_triangle(triangle,material_index,linear(color) if color is not None else None)


base.MeshBuilder=MiamiMesh


def road_section(points,cumulative,distance,raster,datum,width,z_offset=.30,closed=True,banked=False):
    point=base.sample_polyline(points,cumulative,distance,closed=closed)
    tangent=base.sample_tangent(points,cumulative,distance,closed=closed)
    profile=raster.profiles[0 if closed else 1];ds=profile['distanceMeters'];zs=profile['elevationMeters']
    d=distance%cumulative[-1] if closed else min(max(distance,0),cumulative[-1])
    i=min(max(bisect.bisect_right(ds,d)-1,0),len(ds)-2);t=(d-ds[i])/(ds[i+1]-ds[i])
    return point,tangent,Vector((-tangent.y,tangent.x)),zs[i]+(zs[i+1]-zs[i])*t-datum+z_offset,0


base.road_cross_section=road_section


def aerial_uv(obj,center,bounds):
    uv=obj.data.uv_layers.new(name='CountyOrthophotoUV')
    for loop in obj.data.loops:
        p=obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=((p.x+center['x']-bounds['minX'])/1800,(p.y+center['y']-bounds['minY'])/1100)


def terrain_mesh(config,raster,material,collection):
    refine=json.loads((Path(config['preparedDirectory'])/'miami-terrain-refinement.json').read_text())
    bounds=config['model']['bounds'];center=config['model']['center'];builder=base.MeshBuilder()
    def xyz(x,y):return(x-900,y-550,raster.sample(bounds['minX']+x,bounds['minY']+y))
    for row in range(110):
        for col in range(180):
            x,y=col*10,row*10
            if refine[row][col]:
                for dx,dy in [(0,0),(5,0),(0,5),(5,5)]:
                    builder.add_quad([xyz(x+dx+a,y+dy+b) for a,b in [(0,0),(5,0),(5,5),(0,5)]])
            else:
                ring=[(x,y)]
                if row>0 and refine[row-1][col]:ring.append((x+5,y))
                ring.append((x+10,y))
                if col<179 and refine[row][col+1]:ring.append((x+10,y+5))
                ring.append((x+10,y+10))
                if row<109 and refine[row+1][col]:ring.append((x+5,y+10))
                ring.append((x,y+10))
                if col>0 and refine[row][col-1]:ring.append((x,y+5))
                if len(ring)==4:builder.add_quad([xyz(*p) for p in ring])
                else:
                    for a,b in zip(ring,ring[1:]+ring[:1]):builder.add_triangle([xyz(x+5,y+5),xyz(*a),xyz(*b)])
    obj=builder.create_object('Miami_USGS_Terrain',[material],collection);aerial_uv(obj,center,bounds)
    for polygon in obj.data.polygons:polygon.use_smooth=True
    bvh=BVHTree.FromPolygons([v.co for v in obj.data.vertices],[tuple(p.vertices) for p in obj.data.polygons])
    def rendered(x,y):
        hit,_,_,_=bvh.ray_cast(Vector((x-center['x'],y-center['y'],1000)),Vector((0,0,-1)))
        return hit.z if hit is not None else raster.sample(x,y)
    raster.sample_rendered_terrain=rendered
    return obj


def beam(builder, a, b, radius=.16, color=STEEL):
    a,b=Vector(a),Vector(b)
    axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
    if u.length<.01:u=axis.cross(Vector((0,1,0)))
    u.normalize();v=axis.cross(u)
    ring=[u*radius,v*radius,-u*radius,-v*radius]
    for i in range(4):builder.add_quad([a+ring[i],b+ring[i],b+ring[(i+1)%4],a+ring[(i+1)%4]],color=color)


class MiamiScene:
    def __init__(self, config, raster, datum, collections, materials):
        self.config=config;self.raster=raster;self.datum=datum;self.collections=collections;self.m=materials
        self.center=config['model']['center'];self.line=config['model']['centerline'];self.pit=config['model']['pitCenterline']
        self.cum,self.total=base.line_distance(self.line);self.pc,self.pt=base.line_distance(self.pit)
        self.turns=config['model']['turns'];self.features={f['id']:f for f in config['vectors']}
        self.track_samples=base.sample_line_points(self.line,self.cum,4)
        self.pit_samples=base.sample_line_points(self.pit,self.pc,4,closed=False)
        self.corridors=[(self.track_samples,7.7),(self.pit_samples,4.2)]
        self.reserved=[]

    def xy(self,p):return base.local_xy(p,self.center)
    def ground(self,p):return self.raster.sample(*p)-self.datum
    def width(self,d):
        # County ortho: 15 m start straight, 12 m normal course, 10 m chicane.
        d%=self.total
        start=self.turns[12]['distanceMeters'];end=self.turns[15]['distanceMeters']
        knots=[(0,15),(320,15),(380,12),(start+20,12),(start+45,10),
               (end+15,10),(end+45,12),(self.total-90,12),(self.total-30,15),(self.total,15)]
        for (a,wa),(b,wb) in zip(knots,knots[1:]):
            if a<=d<=b:
                t=(d-a)/(b-a);t=t*t*(3-2*t)
                return wa+(wb-wa)*t
        return 15

    def surface(self,d,lateral=0,pit=False,lift=.30):
        line,cum,width=(self.pit,self.pc,8) if pit else (self.line,self.cum,self.width(d))
        return base.road_surface_point(line,cum,d,lateral,self.raster,self.center,self.datum,width,z_offset=lift,closed=not pit)

    def strip(self,builder,a,b,l0,l1,material=0,color=None,pit=False,lift=.34):
        builder.add_quad([self.surface(d,l,pit,lift) for d,l in [(a,l0),(b,l0),(b,l1),(a,l1)]],material,color)

    def road(self):
        road=base.MeshBuilder();paint=base.MeshBuilder();curbs=base.MeshBuilder();samples=[]
        n=math.ceil(self.total/2)
        for i in range(n+1):
            d=self.total*i/n;w=self.width(d)
            p,t,normal,z,bank=base.road_cross_section(self.line,self.cum,d,self.raster,self.datum,w,z_offset=.30)
            samples.append((d,*p,z,t,normal,bank,w))
            if i==n:continue
            following=self.total*(i+1)/n;next_w=self.width(following)
            road.add_quad([self.surface(d,-w/2),self.surface(following,-next_w/2),self.surface(following,next_w/2),self.surface(d,w/2)])
            for side in [-1,1]:
                q=self.surface((d+following)/2,side*w/2)
                world=(q[0]+self.center['x'],q[1]+self.center['y'])
                if base.distance_to_polyline(world,self.pit)<5:continue
                # No abrupt white seams when the measured width changes.
                paint.add_quad([self.surface(dd,ll,lift=.36) for dd,ll in
                    [(d,side*(w/2-.3)),(following,side*(next_w/2-.3)),
                     (following,side*(next_w/2-.12)),(d,side*(w/2-.12))]])
        road.create_object('Miami_Raceway',[self.m['asphalt']],self.collections['Circuit'])
        paint.create_object('Miami_Edge_Paint',[self.m['white']],self.collections['Circuit'])
        # Explicit short curb ranges reviewed against the ortho: no synthetic
        # full-width runoff polygons over the photographed turquoise surfaces.
        count=0
        for t in self.turns:
            span=12 if t['number'] in [14,15] else 25 if t['number'] in [1,2,11,16,17,18] else 35
            for side in [-1,1]:
                for i in range(math.ceil(span*2/2.5)):
                    a=t['distanceMeters']-span+i*2.5;b=min(a+2.5,t['distanceMeters']+span)
                    width=self.width((a+b)/2)/2
                    self.strip(curbs,a,b,side*(width+.04),side*(width+.85),material=i%2,lift=.38);count+=1
        curbs.create_object('Miami_Kerbs',[self.m['red'],self.m['white']],self.collections['Circuit'])
        return samples,{'sections':count,'widthMeters':.81,'extentAccuracy':'metre-level visual interpretation of county orthophoto'}

    def pit_lane(self):
        obj,_,_,samples=base.create_ribbon('Miami_Pit_Lane',self.pit,self.raster,self.center,self.datum,8,
            self.m['asphalt'],self.collections['Circuit'],interval=2,closed=False,taper_meters=30,
            minimum_start_width=4,minimum_end_width=4,z_offset=.23)
        obj['source']='OSM way 1017340352 + FIA 2026 Document 5 pit drawing'
        footprint=self.features[1017340353]['world']
        edges=sorted(zip(footprint,footprint[1:]),key=lambda e:math.dist(*e),reverse=True)
        front=min(edges[:2],key=lambda e:sum(base.distance_to_polyline(p,self.pit) for p in e))
        # 37 numbered garages in the current FIA pit drawing, including FIA.
        lo,hi=sorted(base.nearest_distance(self.pit,self.pc,p) for p in front)
        lo+=4;hi-=4
        marks=[lo+(hi-lo)*i/37 for i in range(38)]
        paint=base.MeshBuilder()
        middle=base.sample_polyline(self.pit,self.pc,(lo+hi)/2,closed=False)
        tangent=base.sample_tangent(self.pit,self.pc,(lo+hi)/2,closed=False)
        normal=Vector((-tangent.y,tangent.x))
        building_center=Vector(tuple(sum(p[a] for p in footprint[:-1])/(len(footprint)-1) for a in range(2)))
        side=1 if (building_center-Vector(middle)).dot(normal)>0 else -1
        for a in range(math.floor(lo),math.ceil(hi),2):self.strip(paint,a,min(a+2,hi),side*1.4,side*1.58,pit=True,lift=.39)
        for d in marks:self.strip(paint,d,d+.16,side*1.5,side*3.9,pit=True,lift=.4)
        for a in range(35,math.floor(self.pt)-35,2):
            for s in [-1,1]:
                p=self.surface(a,s*3.85,pit=True)
                if base.distance_to_polyline((p[0]+self.center['x'],p[1]+self.center['y']),self.line)<8:continue
                self.strip(paint,a,a+2,s*3.65,s*3.85,pit=True,lift=.38)
        paint.create_object('Miami_Pit_Paint_37_Garages',[self.m['white']],self.collections['Circuit'])
        wall,quality=base.create_pit_wall(self.pit,self.line,self.raster,self.center,self.datum,
            [self.m['concrete'],self.m['fence']],self.collections['Circuit'],start_ratio=lo/self.pt,
            end_ratio=hi/self.pt,wall_height=1.05,fence_height=1.15)
        wall.name='Miami_Pit_Wall';wall['source']='FIA 2026 pit drawing and mapped current garage frontage'
        return {'lengthMeters':self.pt,'laneWidthMeters':8,'pitBoxes':37,'fastLaneSeparator':True,
                'pitWall':quality,'garageFrontageDistanceMeters':[lo,hi],
                'entryGapMeters':base.distance_to_polyline(self.pit[0],self.line),
                'exitGapMeters':base.distance_to_polyline(self.pit[-1],self.line),
                'surfaceClearance':base.measure_ribbon_terrain_clearance(samples,self.raster,self.datum)}

    def grandstands(self):
        builder=base.MeshBuilder();details=[];minimum=math.inf
        for stand in self.config['event']['grandstands']:
            if 'fromTurn' in stand:
                d=self.turns[stand['fromTurn']-1]['distanceMeters'];start=d+stand['startOffset'];end=d+stand['endOffset']
            else:start=stand['from'];end=stand['to']
            blocks=math.ceil((end-start)/12);depth=stand['depth'];height=stand['height'];side=stand['side'];offset=stand['offset']
            for i in range(blocks):
                a=start+(end-start)*i/blocks;b=start+(end-start)*(i+1)/blocks;mid=(a+b)/2
                p=base.sample_polyline(self.line,self.cum,mid);t=base.sample_tangent(self.line,self.cum,mid)
                normal=Vector((-t.y*side,t.x*side));rotation=math.atan2(t.y,t.x)
                def world(along,across):return(p[0]+t.x*along+normal.x*across,p[1]+t.y*along+normal.y*across)
                length=b-a;polygon=[world(x,y) for x,y in [(-length/2,offset),(length/2,offset),(length/2,offset+depth),(-length/2,offset+depth)]]
                clearance=base.minimum_polygon_track_clearance(polygon,self.track_samples,7.5)
                minimum=min(minimum,clearance)
                if clearance<3 or base.polygon_intersects_corridors(polygon,[(self.pit_samples,4.2)]):
                    raise ValueError(f"Grandstand {stand['name']} conflicts with a driving corridor")
                self.reserved.append(polygon);ground=max(self.ground(q) for q in polygon)
                def xyz(x,y,z):
                    q=base.sample_polyline(self.line,self.cum,mid+x);tt=base.sample_tangent(self.line,self.cum,mid+x)
                    return(*self.xy((q[0]-tt.y*side*y,q[1]+tt.x*side*y)),ground+z)
                rows=20
                for row in range(rows):
                    y=offset+depth*row/rows;z=.8+height*row/rows
                    builder.add_quad([xyz(x,yy,z) for x,yy in [(-length/2,y),(length/2,y),(length/2,y+depth/rows),(-length/2,y+depth/rows)]],color=(.48,.50,.49,1))
                    builder.add_quad([xyz(-length/2,y,z),xyz(length/2,y,z),xyz(length/2,y,z-.5),xyz(-length/2,y,z-.5)],color=(.28,.30,.29,1))
                    # Real aluminium terraces, a clear stair aisle, individual
                    # teal seat backs rather than a turquoise solid staircase.
                    seats=max(1,math.floor((length-1.8)/.58))
                    for seat in range(seats):
                        x=-length/2+1.5+seat*.58
                        tint=(.07,.34+.018*((seat+row)%3),.39+.016*(seat%2),1)
                        builder.add_quad([xyz(x,y+.65,z+.15),xyz(x+.46,y+.65,z+.15),xyz(x+.46,y+.72,z+.64),xyz(x,y+.72,z+.64)],color=tint)
                beam(builder,xyz(-length/2+.65,offset,1.8),xyz(-length/2+.65,offset+depth,height+1.8),.045,(.55,.57,.57,1))
                for x in [-length/2+.4,length/2-.4]:
                    for y in [offset+3,offset+depth-1]:
                        q=world(x,y);low=self.ground(q)-.1
                        beam(builder,(*self.xy(q),low),xyz(x,y,height+2.8),.18)
                    beam(builder,xyz(x,offset+2,.5),xyz(x,offset+depth-1,height-.4),.12)
                    beam(builder,xyz(x,offset+3,1),xyz(-x,offset+depth-1,height-.4),.07)
                    beam(builder,xyz(x,offset+3,height+2.7),xyz(x,offset+depth,height+3.8),.13,(.47,.48,.46,1))
                for y,z in [(offset,.8),(offset+depth,height+.8)]:
                    for dz in [.45,1.1]:beam(builder,xyz(-length/2,y,z+dz),xyz(length/2,y,z+dz),.045,(.52,.54,.53,1))
                # The canopy is continuous across bays, with fabric seams and
                # a shaded underside. Front rows remain open as on the plan.
                roof_front=offset+depth*.40
                roof=[xyz(x,y,height+2.6+(y-offset)/depth*1.2) for x,y in [(-length/2,roof_front),(length/2,roof_front),(length/2,offset+depth+1),(-length/2,offset+depth+1)]]
                builder.add_quad(roof,color=(.78+.015*(i%3),.79+.015*(i%3),.76+.015*(i%3),1))
                builder.add_quad(list(reversed([(x,y,z-.16) for x,y,z in roof])),color=(.35,.38,.37,1))
                for j in [0,1,3]:beam(builder,roof[j],roof[(j+1)%4],.08,(.62,.64,.61,1))
            details.append({'name':stand['name'],'sections':blocks,'source':'FIA 2026 media kit campus map','heightMeters':height,'heightEstimated':True})
        builder.create_object('Miami_2026_Grandstands',[self.m['vertex']],self.collections['Grandstands'],vertex_colors=True)
        return {'sections':sum(s['sections'] for s in details),'stands':details,'minimumTrackClearanceMeters':minimum}

    def structures(self):
        builder=base.MeshBuilder();roofs=base.MeshBuilder();rendered=[];excluded=[]
        bounds=self.config['model']['bounds']
        for f in self.features.values():
            tags=f['tags'];poly=f['world']
            if not tags.get('building') or len(poly)<4:continue
            if base.polygon_intersects_corridors(poly,self.corridors) or any(base.polygons_overlap(poly,r) for r in self.reserved):
                excluded.append({'id':f['id'],'reason':'reserved circuit, pit or grandstand corridor'});continue
            if f['id'] in [1018182272,1018182273]:
                excluded.append({'id':f['id'],'reason':'nested footprint inside larger current building'});continue
            p=poly[:-1];ground=min(self.ground(q) for q in p)-.1
            height=float(tags.get('height',15 if f['id']==1017340353 else 18 if f['id']==1017340356 else 5.5))
            bottom=[(*self.xy(q),ground) for q in p];top=[(x,y,z+height) for x,y,z in bottom]
            signed=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1]));orientation=1 if signed>0 else -1
            palette=[(.70,.68,.62,1),(.77,.76,.70,1),(.63,.67,.65,1),(.72,.69,.63,1)]
            facade=palette[f['id']%len(palette)]
            for i in range(len(p)):
                j=(i+1)%len(p);builder.add_quad([bottom[i],bottom[j],top[j],top[i]],color=facade)
                a,b=Vector(bottom[i]),Vector(bottom[j]);length=(b-a).length
                if length<2:continue
                axis=(b-a).normalized();normal=Vector((axis.y,-axis.x,0))*orientation
                def wall(start,end,z0,z1,color,offset=.06):
                    aa=a+axis*start+normal*offset;bb=a+axis*end+normal*offset
                    builder.add_quad([(aa.x,aa.y,ground+z0),(bb.x,bb.y,ground+z0),(bb.x,bb.y,ground+z1),(aa.x,aa.y,ground+z1)],color=color)
                wall(0,length,height-.35,height,(.48,.49,.46,1),.14)
                wall(0,length,.12,.45,(.48,.47,.42,1),.08)
                if f['id']==1017340353:continue
                floors=max(1,round(height/3.4));bays=max(1,round(length/4))
                for floor in range(floors):
                    z0=.9+floor*(height-.7)/floors;z1=min(height-.6,z0+1.45)
                    for bay in range(bays):
                        start=length*(bay+.28)/bays;end=length*(bay+.72)/bays
                        wall(start-.12,end+.12,z0-.12,z1+.12,(.82,.80,.72,1),.075)
                        wall(start,end,z0,z1,(.16,.24,.27,1),.095)
                        if tags['building']!='house':wall((start+end)/2-.04,(start+end)/2+.04,z0,z1,(.57,.59,.56,1),.11)
                if length>7:wall(length*.18,length*.18+1,.45,2.6,(.28,.29,.27,1),.11)
            # Use the actual roof pixels (plant, seams, skylights and colour)
            # instead of reducing an entire building to one sampled colour.
            for triangle in base.resolved_tessellation([[Vector(q) for q in top]]):roofs.add_triangle(triangle)
            if f['id']==1017340353:
                # Facade rhythm follows the actual garage frontage, with open
                # dark apertures and continuous glass hospitality above.
                for a,b in zip(p,p[1:]+p[:1]):
                    length=math.dist(a,b)
                    if length<200:continue
                    along=Vector(((b[0]-a[0])/length,(b[1]-a[1])/length));normal=Vector((-along.y,along.x))
                    for i in range(37):
                        q=Vector(a)+along*(i+.5)*length/37
                        x,y=self.xy(q)
                        builder.add_box((x+normal.x*.15,y+normal.y*.15,ground+2.2),(length/37-.6,.25,4.2),color=(.04,.08,.09,1),rotation=math.atan2(along.y,along.x))
                        builder.add_box((x+normal.x*.2,y+normal.y*.2,ground+9.2),(length/37-.25,.3,4),color=(.08,.19,.21,1),rotation=math.atan2(along.y,along.x))
            rendered.append({'id':f['id'],'name':tags.get('name'),'heightMeters':height,'heightSource':'OSM' if tags.get('height') else 'photographic estimate'})
        builder.create_object('Miami_Current_Buildings',[self.m['vertex']],self.collections['Buildings'],vertex_colors=True)
        roof=roofs.create_object('Miami_Current_Roofs',[self.m['terrain']],self.collections['Buildings']);aerial_uv(roof,self.center,bounds)
        return {'rendered':rendered,'excluded':excluded,'count':len(rendered),'roofTexture':'county orthophoto projected in EPSG:32617','facades':'window bays, frames, doors, plinths and cornices; small details estimated'}

    def stadium(self):
        builder=base.MeshBuilder();village=base.MeshBuilder();roof=base.MeshBuilder()
        inner=self.features[171419979]['world'][:-1]
        center=Vector(tuple(sum(p[a] for p in inner)/len(inner) for a in range(2)))
        # Field and its inner OSM stadium ring determine orientation. The
        # 2016 canopy spans the same ground footprint, not the aerial shadow.
        axis=(Vector(inner[2])-Vector(inner[1])).normalized();normal=Vector((-axis.y,axis.x))
        ground=self.ground(center);rot=math.atan2(axis.y,axis.x)
        def xyz(x,y,z):return(*self.xy(center+axis*x+normal*y),ground+z)
        def ring(rx,ry,z,chamfer=12):
            return [xyz(x,y,z) for x,y in [(-rx+chamfer,-ry),(rx-chamfer,-ry),(rx,-ry+chamfer),(rx,ry-chamfer),(rx-chamfer,ry),(-rx+chamfer,ry),(-rx,ry-chamfer),(-rx,-ry+chamfer)]]
        # Three open seating tiers; the field remains visible through the roof.
        for row in range(32):
            inner_ring=ring(72+row*1.5,43+row*1.5,1+row*.95)
            outer_ring=ring(73.5+row*1.5,44.5+row*1.5,1+row*.95)
            for i in range(8):
                j=(i+1)%8;builder.add_quad([inner_ring[i],inner_ring[j],outer_ring[j],outer_ring[i]],color=(.018,.37,.37,1))
        # Deep open concourse bands give the stadium its actual layered
        # structure, rather than a solid white exterior wall.
        for lower,upper in [(0,7),(10,17),(21,28)]:
            low=ring(132,116,lower);top=ring(132,116,upper)
            for i in range(8):
                j=(i+1)%8;builder.add_quad([low[i],low[j],top[j],top[i]],color=(.28,.33,.33,1))
                beam(builder,top[i],top[j],.55,(.72,.73,.68,1))
        outer=ring(151,130,43,chamfer=7);opening=ring(78,48,37,chamfer=3)
        for i in range(8):
            j=(i+1)%8;quad=[outer[i],outer[j],opening[j],opening[i]]
            roof.add_quad(quad);builder.add_quad(list(reversed([(x,y,z-.3) for x,y,z in quad])),color=(.44,.47,.45,1))
            beam(builder,opening[i],opening[j],.32,WHITE)
            for fraction in [j/8 for j in range(9)]:
                a=Vector(outer[i]).lerp(Vector(outer[j]),fraction);b=Vector(opening[i]).lerp(Vector(opening[j]),fraction)
                beam(builder,a,b,.11,(.68,.70,.67,1))
        # Four signature cable-supported canopy pylons, correctly oriented.
        for x,y in [(-121,-104),(121,-104),(121,104),(-121,104)]:
            beam(builder,xyz(x,y,0),xyz(x,y,106.68),.9,WHITE)
            for dx,dy in [(22,0),(-42,0),(0,20),(0,-38),(-65,0),(0,-65)]:
                dx*=1 if x<0 else -1;dy*=1 if y<0 else -1
                beam(builder,xyz(x,y,100),xyz(max(-144,min(144,x+dx)),max(-123,min(123,y+dy)),42),.09,(.62,.65,.64,1))
        for side in [-1,1]:
            for x in range(-100,101,16):
                # Concourse levels and vertical exterior columns.
                beam(builder,xyz(x,side*117,0),xyz(x,side*117,33),.38,WHITE)
                for z in [10,21,31]:beam(builder,xyz(x-7.7,side*117,z),xyz(x+7.7,side*117,z),.4,WHITE)
        for i in range(11):
            row=0 if i<6 else 1;index=i if i<6 else i-6
            x=-48+index*19.2+(9.6 if row else 0);y=-18 if row==0 else 18
            self.pavilion(village,tuple(center+axis*x+normal*y),15,10,5.5,rot)
        builder.create_object('Miami_Hard_Rock_Stadium',[self.m['vertex']],self.collections['Buildings'],vertex_colors=True)
        roof_obj=roof.create_object('Miami_Stadium_Roof',[self.m['terrain']],self.collections['Buildings']);aerial_uv(roof_obj,self.center,self.config['model']['bounds'])
        village.create_object('Miami_2026_Team_Village',[self.m['vertex']],self.collections['Infrastructure'],vertex_colors=True)
        return {'footprintSource':'OSM relation 2278785, outer 171419981, inner 171419979; county ortho',
                'roofHeightMeters':43,'pylonHeightMeters':106.68,'pylonHeightSource':'STRUCTURE magazine: 350 ft cable masts','heightsEstimated':True,'teamPavilions':11}

    def event_structures(self):
        builder=base.MeshBuilder();quality=[]
        for h in self.config['event']['hospitality']:
            d=self.turns[h['turn']-1]['distanceMeters']+h['along'];p=base.sample_polyline(self.line,self.cum,d)
            t=base.sample_tangent(self.line,self.cum,d);n=Vector((-t.y,t.x))*h['side'];world=Vector(p)+n*h['offset']
            rot=math.atan2(t.y,t.x);x,y=self.xy(world);ground=self.ground(world)
            polygon=[tuple(world+t*along+n*across) for along,across in
                [(-h['length']/2,-h['width']/2),(h['length']/2,-h['width']/2),
                 (h['length']/2,h['width']/2),(-h['length']/2,h['width']/2)]]
            if base.polygon_intersects_corridors(polygon,self.corridors):
                raise ValueError(f"Hospitality {h['name']} intersects the track or pit lane")
            self.pavilion(builder,world,h['length'],h['width'],h['height'],rot)
            quality.append({'name':h['name'],'footprint':polygon,'minimumTrackClearanceMeters':base.minimum_polygon_track_clearance(polygon,self.track_samples,7.5)})
        yacht=self.config['event']['yachtClub'];c=yacht['center'];ground=self.ground(c);rot=math.radians(yacht['rotationDeg'])
        def yp(x,y,z):return(*self.xy((c[0]+x*math.cos(rot)-y*math.sin(rot),c[1]+x*math.sin(rot)+y*math.cos(rot))),ground+z)
        for deck in range(5):
            length=yacht['length']-deck*6;width=yacht['width']-deck*2;z=.5+deck*4
            outline=[(-length/2,-width/2),(length/2-10,-width/2),(length/2,0),(length/2-10,width/2),(-length/2,width/2)]
            top=[yp(x,y,z+3.5) for x,y in outline];bottom=[yp(x,y,z) for x,y in outline]
            for i in range(5):
                j=(i+1)%5;builder.add_quad([bottom[i],bottom[j],top[j],top[i]],color=WHITE)
                beam(builder,top[i],top[j],.15,WHITE)
            for tri in base.resolved_tessellation([[Vector(p) for p in top]]):builder.add_triangle(tri,color=(.65,.56,.41,1))
            for side in [-1,1]:
                q=yp(-4,side*(width/2+.03),z+2)
                builder.add_box(q,(length-25,.15,1.4),color=(.035,.13,.17,1),rotation=rot)
        h=self.config['event']['beachClub'];x,y=self.xy(h['center']);g=self.ground(h['center']);rot=math.radians(h['rotationDeg'])
        # FIA 2026 campus plan shows an open beach deck and pools, not a hall.
        def beach(x,y,z):return(*self.xy((h['center'][0]+x*math.cos(rot)-y*math.sin(rot),h['center'][1]+x*math.sin(rot)+y*math.cos(rot))),g+z)
        length,width=h['length'],h['width']
        builder.add_box(beach(0,0,.3),(length,width,.6),color=(.64,.52,.36,1),rotation=rot)
        for xx in range(-24,25,2):beam(builder,beach(xx,-width/2,.63),beach(xx,width/2,.63),.018,(.44,.35,.24,1))
        for xx in [-11,11]:
            builder.add_box(beach(xx,0,.7),(17,6,.15),color=(.78,.76,.65,1),rotation=rot)
            builder.add_box(beach(xx,0,.8),(15.8,4.8,.07),color=(.12,.61,.66,1),rotation=rot)
        for side in [-1,1]:
            for xx in [-20,-10,0,10,20]:
                cy=side*8.5
                for dx in [-3,3]:
                    for dy in [-2,2]:beam(builder,beach(xx+dx,cy+dy,.6),beach(xx+dx,cy+dy,3.8),.09,(.57,.50,.39,1))
                builder.add_quad([beach(xx+dx,cy+dy,3.85) for dx,dy in [(-3.4,-2.4),(3.4,-2.4),(3.4,2.4),(-3.4,2.4)]],color=(.82,.79,.68,1))
                builder.add_box(beach(xx,cy,1.05),(4,1.4,.5),color=(.81,.79,.72,1),rotation=rot)
        builder.create_object('Miami_2026_Hospitality_And_MSC_Yacht',[self.m['vertex']],self.collections['Infrastructure'],vertex_colors=True)
        return {'hospitalityBuildings':len(quality),'hospitality':quality,'yachtDecks':5,'beachClub':'open deck, two pools and cabanas from 2026 campus plan; small details estimated','source':'FIA official 2026 campus plan; heights estimated'}

    def pavilion(self,builder,center,length,width,height,rotation):
        """Open glazed hospitality bays, recessed terraces and fabric roof."""
        g=self.ground(center)
        def p(x,y,z):return(*self.xy((center[0]+x*math.cos(rotation)-y*math.sin(rotation),center[1]+x*math.sin(rotation)+y*math.cos(rotation))),g+z)
        floors=max(1,round(height/3));step=height/floors
        builder.add_box(p(0,0,height/2),(length-1,width-2,height),color=(.17,.26,.28,1),rotation=rotation)
        bays=max(1,round(length/4.5))
        for floor in range(floors):
            z=floor*step
            builder.add_box(p(0,0,z+.2),(length,width,.35),color=(.61,.61,.54,1),rotation=rotation)
            for side in [-1,1]:
                beam(builder,p(-length/2,side*width/2,z+1),p(length/2,side*width/2,z+1),.055,(.57,.61,.60,1))
                for bay in range(bays+1):
                    x=-length/2+bay*length/bays
                    beam(builder,p(x,side*(width/2-.7),z+.3),p(x,side*(width/2-.7),z+step),.10,(.72,.71,.65,1))
                    beam(builder,p(x,side*width/2,z+.2),p(x,side*width/2,z+1),.045,(.5,.53,.51,1))
        # Shallow pitched membrane, fascia and seam battens; not a white box.
        for side in [-1,1]:
            builder.add_quad([p(-length/2,0,height+.75),p(length/2,0,height+.75),p(length/2,side*(width/2+.2),height+.2),p(-length/2,side*(width/2+.2),height+.2)],color=(.8,.80,.75,1))
            for bay in range(bays+1):
                x=-length/2+bay*length/bays;beam(builder,p(x,0,height+.76),p(x,side*(width/2+.2),height+.21),.045,(.64,.65,.60,1))

    def flyovers(self):
        """Shared cross-sections and connected ramps, never per-panel heights."""
        builder=base.MeshBuilder();nodes={};edges={};paths=[];anchors={};widths={}
        bounds=self.config['model']['bounds']
        sources=list(self.config['highwayNetwork'])+[f for f in self.features.values()
            if f['tags'].get('bridge')=='yes' and f['tags'].get('highway')=='footway']
        def key(p):return (round(p[0],3),round(p[1],3))
        for f in sources:
            line=f['world'];tags=f['tags'];foot=tags['highway']=='footway'
            width=3 if foot else int(tags.get('lanes','2'))*3.4+1.4
            points=[]
            for a,b in zip(line,line[1:]):
                steps=max(1,math.ceil(math.dist(a,b)/5))
                points.extend([tuple(a[j]+(b[j]-a[j])*i/steps for j in range(2)) for i in range(steps)])
            points.append(tuple(line[-1]));ids=[key(p) for p in points]
            for k,p in zip(ids,points):
                nodes[k]=p;edges.setdefault(k,{})
                widths[k]=max(widths.get(k,0),width)
            for a,b in zip(ids,ids[1:]):
                distance=math.dist(nodes[a],nodes[b]);edges[a][b]=distance;edges[b][a]=distance
            if tags.get('bridge')=='yes':
                deck=sum(self.ground(p) for p in points)/len(points)+(6.5 if foot else 3+6.5*int(tags.get('layer','1')))
                for k in ids:anchors[k]=max(anchors.get(k,-math.inf),deck)
            paths.append((f,ids,width))
        heights={k:self.ground(p)+.15 for k,p in nodes.items()}
        queue=[(-height,k) for k,height in anchors.items()];heapq.heapify(queue)
        for k,height in anchors.items():heights[k]=max(heights[k],height)
        # Propagate bridge elevations along connected highway ways, including
        # embankments which OSM correctly does not label as bridges.
        while queue:
            neg,k=heapq.heappop(queue);height=-neg
            if height<heights[k]-.00001:continue
            for other,distance in edges[k].items():
                candidate=height-.045*distance
                if candidate>heights[other]:heights[other]=candidate;heapq.heappush(queue,(-candidate,other))
        for _ in range(30):
            heights={k:(heights[k] if k in anchors else max(self.ground(nodes[k])+.15,
                (heights[k]*2+sum(heights[n] for n in edges[k]))/(2+len(edges[k])))) for k in nodes}
        road_vertices=[];road_faces=[]
        for name in ['Miami_Raceway','Miami_Pit_Lane']:
            mesh=bpy.data.objects[name].data;offset=len(road_vertices)
            road_vertices.extend(v.co.copy() for v in mesh.vertices)
            road_faces.extend(tuple(offset+i for i in p.vertices) for p in mesh.polygons)
        road_bvh=BVHTree.FromPolygons(road_vertices,road_faces)
        rendered=0;join_gaps=[];crossings=[];closed_crossing_panels=0
        for f,ids,width in paths:
            sections=[]
            for i,k in enumerate(ids):
                p=nodes[k];before=nodes[ids[max(0,i-1)]];after=nodes[ids[min(len(ids)-1,i+1)]]
                tangent=Vector(after)-Vector(before)
                if i in [0,len(ids)-1] and len(edges[k])==2:
                    neighbours=list(edges[k]);shared=Vector(nodes[neighbours[1]])-Vector(nodes[neighbours[0]])
                    if shared.dot(tangent)<0:shared=-shared
                    tangent=shared
                tangent.normalize();normal=Vector((-tangent.y,tangent.x))
                w=widths[k] if i in [0,len(ids)-1] else width
                sections.append([(*self.xy(Vector(p)+normal*side*w/2),heights[k]) for side in [-1,1]])
            panels=[]
            for i,(a,b) in enumerate(zip(sections,sections[1:])):
                middle=tuple((nodes[ids[i]][j]+nodes[ids[i+1]][j])/2 for j in range(2))
                if not (bounds['minX']+12<middle[0]<bounds['maxX']-12 and bounds['minY']+8<middle[1]<bounds['maxY']-8):panels.append(None);continue
                top=[a[0],b[0],b[1],a[1]]
                if f['tags'].get('bridge')!='yes':
                    # These ramps are closed where the GP circuit temporarily
                    # crosses them at grade. Keep the photographed pavement and
                    # race surface instead of extruding a false overpass there.
                    conflict=False
                    for va,vb in [(top[0],top[1]),(top[3],top[2]),(a[0],a[1]),(b[0],b[1])]:
                        for factor in [0,.25,.5,.75,1]:
                            q=Vector(va).lerp(Vector(vb),factor)
                            hit,_,_,_=road_bvh.ray_cast(Vector((q.x,q.y,1000)),Vector((0,0,-1)))
                            if hit is not None and q.z-hit.z<5.3:conflict=True
                    if conflict:closed_crossing_panels+=1;panels.append(None);continue
                    if max(p[2] for p in top)-self.ground(middle)<.5:panels.append(None);continue
                panels.append((middle,top))
            if f['tags'].get('bridge')!='yes':
                # Thresholding a road/terrain crossing must not leave isolated
                # floating strips. Only retain continuous approach runs.
                start=0
                while start<len(panels):
                    if panels[start] is None:start+=1;continue
                    end=start
                    while end<len(panels) and panels[end] is not None:end+=1
                    if end-start<6:
                        for j in range(start,end):panels[j]=None
                    start=end
            for i,panel in enumerate(panels):
                if panel is None:continue
                middle,top=panel;a,b=sections[i],sections[i+1]
                # Keep a road deck at its real thickness. Extruding all the
                # way down to bare-earth lidar creates false vertical walls
                # beside/under the GP course where the lidar removes bridges.
                bottom=[(x,y,z-.7) for x,y,z in top]
                builder.add_volume(bottom,top,color=(.55,.54,.49,1))
                builder.add_quad([(x,y,z+.025) for x,y,z in top],color=(.36,.37,.35,1))
                if width>7 and i%3!=2:
                    start=Vector(a[0]).lerp(Vector(a[1]),.5);end=Vector(b[0]).lerp(Vector(b[1]),.5)
                    normal=(Vector(a[1])-Vector(a[0])).normalized()*.06
                    builder.add_quad([tuple(p+Vector((0,0,.04))) for p in [start-normal,end-normal,end+normal,start+normal]],color=(.74,.73,.66,1))
                for side in [0,1]:beam(builder,tuple(v+( .5 if j==2 else 0) for j,v in enumerate(a[side])),tuple(v+(.5 if j==2 else 0) for j,v in enumerate(b[side])),.16,(.67,.68,.62,1))
                if f['tags'].get('bridge')=='yes' and i%9==4 and all(base.distance_to_polyline(middle,c)>r+3 for c,r in self.corridors):
                    x,y=self.xy(middle);g=self.ground(middle);z=(a[0][2]+b[0][2])/2
                    builder.add_cylinder((x,y,g),.7,z-g-.7,sides=6,color=(.52,.54,.51,1))
            # Every neighbouring panel reuses exactly the same cross-section.
            # The two endpoints of joined OSM ways share the same height node.
            rendered+=1
            for i in range(1,len(sections)-1):
                join_gaps.append(abs(sections[i][0][2]-heights[ids[i]]))
            if f['tags'].get('bridge')=='yes':crossings.append({'osmWayId':f['id'],'deckElevationMeters':heights[ids[len(ids)//2]],'estimatedElevation':True})
        builder.create_object('Miami_Mapped_Flyovers',[self.m['vertex']],self.collections['Infrastructure'],vertex_colors=True)
        return {'mappedBridges':len(crossings),'highwayWaysWithConnectedApproaches':rendered,
            'maximumPanelJoinGapMeters':max(join_gaps,default=0),'atGradeClosedRampPanelsExcluded':closed_crossing_panels,'bridges':crossings}

    def context(self):
        trees=base.MeshBuilder();barriers=base.MeshBuilder();tree_count=0
        # Mapped individual trees only; no random vegetation in driving lanes.
        for p in self.config['mappedTrees']:
            if any(base.distance_to_polyline(p,c)<w+4 for c,w in self.corridors):continue
            if any(base.point_in_polygon(p,q) for q in self.reserved):continue
            x,y=self.xy(p);g=self.ground(p)
            trees.add_cylinder((x,y,g),.22,6,sides=5,color=(.28,.23,.16,1))
            for angle in range(0,360,60):
                a=math.radians(angle);tip=(x+math.cos(a)*3.1,y+math.sin(a)*3.1,g+6.4)
                trees.add_triangle([(x,y,g+7.8),(x+math.cos(a+.3)*2,y+math.sin(a+.3)*2,g+7),tip],color=(.13,.24,.09,1))
                trees.add_triangle([(x,y,g+7.8),tip,(x+math.cos(a-.3)*2,y+math.sin(a-.3)*2,g+7)],color=(.18,.29,.11,1))
            tree_count+=1
        # Safety barriers follow the road envelope; the actual photographed
        # runoff zones stay visible. Pit entry and exit remain unobstructed.
        panels=0
        for d in range(0,math.floor(self.total),6):
            for side in [-1,1]:
                offset=self.width(d)/2+2
                if any(abs(d-t['distanceMeters'])<65 for t in self.turns if t['number'] in [1,3,6,7,8,11,12,13,16,17,18]):offset+=9
                a=self.surface(d,side*offset);b=self.surface(d+6,side*offset)
                world=(a[0]+self.center['x'],a[1]+self.center['y'])
                worlds=[(a[0]+(b[0]-a[0])*t+self.center['x'],a[1]+(b[1]-a[1])*t+self.center['y']) for t in [0,.25,.5,.75,1]]
                if any(base.distance_to_polyline(p,self.pit)<6 for p in worlds):continue
                # Tight chicane: keep each wall outside the neighbouring road.
                if any(base.distance_to_polyline(p,self.line)<self.width(d)/2+.65 for p in worlds):continue
                z0=self.ground(world);world_b=(b[0]+self.center['x'],b[1]+self.center['y']);z1=self.ground(world_b)
                beam(barriers,(a[0],a[1],z0+.65),(b[0],b[1],z1+.65),.28,(.52,.55,.52,1));panels+=1
        trees.create_object('Miami_Mapped_Palms',[self.m['vertex']],self.collections['Infrastructure'],vertex_colors=True)
        barriers.create_object('Miami_Safety_Barriers',[self.m['vertex']],self.collections['Infrastructure'],vertex_colors=True)
        return {'mappedTrees':tree_count,'barrierPanels':panels}

    def annotations(self):
        collection=self.collections['Annotations'];builder=base.MeshBuilder();control=self.config['officialControlPoints']
        for t in self.turns:base.anchor_at(f"Turn_{t['number']:02d}",t['distanceMeters'],self.line,self.cum,self.total,self.raster,self.center,self.datum,collection,side=t['anchorSide'],offset=20,height=5)
        base.anchor_at('SpeedTrap',control['speedTrapDistanceMeters'],self.line,self.cum,self.total,self.raster,self.center,self.datum,collection,side=-1,offset=20,height=5)
        base.anchor_at('RaceStart',control['raceStartDistanceMeters'],self.line,self.cum,self.total,self.raster,self.center,self.datum,collection,offset=16,height=5)
        for i,d in enumerate([0,*control['sectorBoundaryDistancesMeters']]):
            base.anchor_at('StartFinish' if i==0 else f'SectorBoundary_{i+1:02d}',d,self.line,self.cum,self.total,self.raster,self.center,self.datum,collection,side=-1 if i==2 else 1,offset=24,height=6)
            width=self.width(d)/2
            self.strip(builder,d-3,d+3,-width-2,width+2,material=i+3,lift=.43)
            if i:self.strip(builder,d-.5,d+.5,-width,width,material=i,lift=.48)
        for i in range(15):
            for j in range(2):self.strip(builder,-.7+j*.7,j*.7,-7.5+i,-6.5+i,material=6+(i+j)%2,lift=.5)
        builder.create_object('Miami_Sectors_And_Finish',self.m['sectors']+self.m['halos']+[self.m['white'],self.m['black']],collection)
        gantry=base.MeshBuilder();d=control['raceStartDistanceMeters'];p=base.sample_polyline(self.line,self.cum,d);t=base.sample_tangent(self.line,self.cum,d);n=Vector((-t.y,t.x));z=self.surface(d)[2]
        for side in [-1,1]:
            q=Vector(p)+n*side*9;beam(gantry,(*self.xy(q),z),(*self.xy(q),z+7),.25,WHITE)
        a=Vector(p)-n*9;b=Vector(p)+n*9;beam(gantry,(*self.xy(a),z+7),(*self.xy(b),z+7),.35,STEEL)
        for i in range(5):
            q=Vector(p)+n*(i-2);x,y=self.xy(q);gantry.add_box((x,y,z+6.35),(.4,.4,.5),color=(.35,.005,.003,1))
        gantry.create_object('Miami_Start_Gantry',[self.m['vertex']],collection,vertex_colors=True)
        extrema=base.create_extrema_anchors(self.line,self.cum,self.total,self.raster,self.center,self.datum,collection)
        # Offset only the labels: the measured elevation/distance extras remain
        # unchanged. Otherwise the large height labels hide T14/T15 and S3.
        for name,dx,dy in [('HighPoint',-110,0),('LowPoint',-60,90)]:
            anchor=bpy.data.objects[name];anchor['measured_position']=list(anchor.location)
            anchor.location.x+=dx;anchor.location.y+=dy
        return extrema


def drape_paint():
    vertices=[];faces=[]
    for name in ['Miami_Raceway','Miami_Pit_Lane']:
        mesh=bpy.data.objects[name].data;offset=len(vertices);vertices.extend(v.co.copy() for v in mesh.vertices)
        faces.extend(tuple(offset+i for i in p.vertices) for p in mesh.polygons)
    bvh=BVHTree.FromPolygons(vertices,faces);count=0
    for name in ['Miami_Edge_Paint','Miami_Pit_Paint_37_Garages']:
        for v in bpy.data.objects[name].data.vertices:
            p,_,_,_=bvh.ray_cast(Vector((v.co.x,v.co.y,1000)),Vector((0,0,-1)))
            if p is not None:v.co.z=p.z+.10;count+=1
    return count


def export(path):
    from io_scene_gltf2.io.exp import meshopt
    original=meshopt.MeshoptEncoder.encode_attribute
    def precise(name,data,stride,settings):
        bits=meshopt.EXP_FILTER_BITS
        try:
            if name=='POSITION':meshopt.EXP_FILTER_BITS=18
            elif name.startswith('COLOR_'):
                meshopt.EXP_FILTER_BITS=8
                return original('POSITION',data,stride,settings)
            elif name.startswith('TEXCOORD_'):
                meshopt.EXP_FILTER_BITS=16
                return original('POSITION',data,stride,settings)
            elif name=='NORMAL':meshopt.EXP_FILTER_BITS=9
            return original(name,data,stride,settings)
        finally:meshopt.EXP_FILTER_BITS=bits
    meshopt.MeshoptEncoder.encode_attribute=staticmethod(precise)
    try:base.export_glb(path)
    finally:meshopt.MeshoptEncoder.encode_attribute=staticmethod(original)


def main():
    args=base.parse_args();config=json.loads(Path(args.input).read_text());prepared=Path(args.prepared).resolve();config['preparedDirectory']=str(prepared)
    raster_meta=json.loads((prepared/'raster-metadata.json').read_text());bounds=config['model']['bounds']
    raster=base.HeightRaster(prepared/'miami-dtm.f32le',raster_meta['rasters']['dtm'],bounds);datum=0
    raster.profiles=json.loads((prepared/'miami-road-profiles.json').read_text())
    bpy.ops.wm.read_factory_settings(use_empty=True);collections=base.create_collections();scene=bpy.context.scene
    scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1;scene.unit_settings.length_unit='METERS'
    scene['coordinate_reference_system']='EPSG:32617';scene['vertical_datum']='NAVD88';scene['real_world_scale']='1 unit = 1 metre; no vertical exaggeration'
    scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1800;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='WEBP';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.quality=92
    scene.view_settings.look='AgX - Medium High Contrast';scene.world=bpy.data.worlds.new('Miami_World');scene.world.color=(.11,.13,.15)
    m={'terrain':base.create_aerial_material(prepared/'miami-orthophoto.jpg'),
       'asphalt':base.create_material('Miami_Asphalt',linear((.29,.30,.29,1)),.95),
       'white':base.create_material('Miami_White',linear(WHITE),.85),'black':base.create_material('Miami_Black',(.012,.015,.017,1)),
       'red':base.create_material('Miami_Kerb_Red',(.60,.016,.014,1)),
       'concrete':base.create_material('Miami_Concrete',(.54,.58,.56,1)),
       'fence':base.create_material('Miami_Debris_Fence',(.25,.31,.30,.45)),
       'vertex':base.create_material('Miami_Source_Coloured_Structures',(1,1,1,1),.86,use_vertex_color=True)}
    m['terrain'].name='Miami_Dade_Orthophoto'
    colors=[(.8,.015,.005,1),(.98,.42,.02,1),(.005,.52,.72,1)]
    m['sectors']=[base.create_material(f'Sector_{i+1}',c,.65) for i,c in enumerate(colors)]
    m['halos']=[base.create_material(f'Sector_{i+1}_Glow',(*c[:3],.36),.5,emission_strength=1.6) for i,c in enumerate(colors)]
    terrain=terrain_mesh(config,raster,m['terrain'],collections['Terrain'])
    terrain.name='Miami_USGS_Terrain';terrain.data.name='Miami_USGS_Terrain_Mesh';terrain['source']='USGS FL_MiamiDade_D23 1m DTM + Miami-Dade County orthophoto'
    model=MiamiScene(config,raster,datum,collections,m)
    samples,curbs=model.road();pit=model.pit_lane();stands=model.grandstands();buildings=model.structures()
    stadium=model.stadium();event=model.event_structures();context=model.context();flyovers=model.flyovers();low,high=model.annotations();paint=drape_paint()
    clearance=base.measure_ribbon_terrain_clearance(samples,raster,datum)
    if clearance['terrainBreakthroughSamples']:raise ValueError(f'Miami track clearance failed: {clearance}')
    base.add_lighting(collections['Terrain'])
    camera_data=bpy.data.cameras.new('MiamiPreview');camera_data.type='ORTHO';camera_data.ortho_scale=1900;camera_data.clip_end=10000
    camera=bpy.data.objects.new('MiamiPreview',camera_data);collections['Terrain'].objects.link(camera);camera.location=(0,-1050,1950)
    base.look_at(camera,(0,0,8));scene.camera=camera;scene.render.filepath=str(Path(args.preview).resolve())
    bpy.ops.render.render(write_still=True)
    for image in bpy.data.images:
        if image.source=='FILE':image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.input).with_suffix('.blend').resolve()))
    bpy.data.objects.remove(camera,do_unlink=True);bpy.data.cameras.remove(camera_data);export(Path(args.glb).resolve())
    profile=[]
    for i in range(181):
        d=model.total*i/180;p=base.sample_polyline(model.line,model.cum,d)
        profile.append({'distanceMeters':round(d,3),'elevationMeters':round(model.surface(d)[2]-.30,3)})
    metadata={'schemaVersion':4,'modelId':'miami','generatedWith':f'Blender {bpy.app.version_string}',
        'coordinateReferenceSystem':'EPSG:32617','verticalDatum':'NAVD88 orthometric metres','verticalExaggeration':1,
        'realWorldScale':'1 unit = 1 metre; no vertical exaggeration','boundsMeters':{'width':1800,'depth':1100},'originMeters':config['model']['center'],
        'lapLength':{'geometryMeters':model.total,'officialFiaMeters':5412,'relativeErrorPercent':abs(model.total-5412)/5412*100},
        'finishDistanceMeters':0,'raceStartDistanceMeters':config['officialControlPoints']['raceStartDistanceMeters'],
        'sectorBoundaryDistancesMeters':config['officialControlPoints']['sectorBoundaryDistancesMeters'],
        'elevationProfile':profile,'elevationsMeters':{'low':low[0],'high':high[0]},'baseElevationMeters':datum,
        'objects':{'turnAnchors':19,'pitGarageBoxes':37,'grandstandSections':stands['sections'],'buildingsTotal':buildings['count']+1,
                   'teamPavilions':11,'raceMotorhomes':0,'mappedBridges':flyovers['mappedBridges'],**context},
        'layoutQuality':{'surfaceClearance':clearance,'pitLane':pit,'grandstands':stands,'buildings':buildings,
                         'stadium':stadium,'event':event,'flyovers':flyovers,'curbs':curbs,'terrainSurface':raster_meta['terrainSurface'],'roadGrading':raster_meta['roadGrading']},
        'surfaceExport':{'meshoptPositionBits':18,'meshoptColourBits':8,'meshoptNormalBits':9,'meshoptUvBits':16,'paintVerticesDraped':paint},
        'sourceManifest':config['sourceManifest'],'controlPointReference':config['officialControlPoints'],
        'limitations':config['limitations'],'publicationStatus':'review-required'}
    Path(args.metadata).write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps({'lapLength':metadata['lapLength'],'objects':metadata['objects'],'surfaceClearance':clearance}))


if __name__=='__main__':main()
