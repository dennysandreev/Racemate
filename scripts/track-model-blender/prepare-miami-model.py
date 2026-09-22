#!/usr/bin/env python3
"""Prepare native Miami UTM geometry, 1 m USGS terrain and county orthophoto."""
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw, ImageFont
import rasterio
from rasterio.warp import transform, reproject, Resampling
from rasterio.transform import from_bounds

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / '.track-model-build/miami-source'
PREPARED = ROOT / '.track-model-build/miami-prepared'
BOUNDS = dict(zip(('minX', 'minY', 'maxX', 'maxY'), (575450, 2870700, 577250, 2871800)))
MAIN_WAYS = [1485453197, 1017340351, 1485453204, 1472684485, 1485453202, 1485453200, 1472686141]
TURN_VERTICES = [(1485453197, 26), (1485453197, 36), (1485453197, 49),
                 (1017340351, 19), (1017340351, 31), (1017340351, 43), (1017340351, 51),
                 (1017340351, 58), (1017340351, 80), (1485453204, 4),
                 (1472684485, 18), (1472684485, 31), (1472684485, 46),
                 (1472684485, 55), (1472684485, 61), (1472684485, 72),
                 (1472686141, 9), (1472686141, 21), (1472686141, 28)]


def distances(line):
    return np.concatenate(([0.], np.cumsum(np.linalg.norm(np.diff(line, axis=0), axis=1))))


def sample(line, d):
    cumulative = distances(line)
    return np.array([np.interp(d, cumulative, line[:, axis]) for axis in range(2)]).T


def nearest(line, p):
    a, v = line[:-1], np.diff(line, axis=0)
    t = np.clip(np.sum((p-a)*v, axis=1) / np.maximum(np.sum(v*v, axis=1), 1e-9), 0, 1)
    separation = np.linalg.norm(a + t[:, None]*v - p, axis=1)
    i = int(np.argmin(separation))
    return float(distances(line)[i] + t[i]*np.linalg.norm(v[i])), float(separation[i])


def road_terrain(target, line, pit):
    """Keep bridge embankments out of the GP pavement's height envelope.

    Centreline lidar is the vertical reference, not the maximum over the road
    width. A short Gaussian filter removes raster noise, retaining the real
    T14/T15 crest. Only the road corridor is graded; the source stays intact.
    """
    raw = target.copy()
    xs = np.linspace(BOUNDS['minX'], BOUNDS['maxX'], target.shape[1])
    ys = np.linspace(BOUNDS['maxY'], BOUNDS['minY'], target.shape[0])
    def heights(points):
        x = (points[:,0]-BOUNDS['minX'])/2
        y = (BOUNDS['maxY']-points[:,1])/2
        ix = np.floor(x).astype(int); iy = np.floor(y).astype(int)
        tx=x-ix;ty=y-iy
        return (raw[iy,ix]*(1-tx)*(1-ty)+raw[iy,ix+1]*tx*(1-ty)
                +raw[iy+1,ix]*(1-tx)*ty+raw[iy+1,ix+1]*tx*ty)
    separation=np.full_like(target,np.inf);grade=np.zeros_like(target)
    profiles=[]
    for path,closed in [(line,True),(pit,False)]:
        cum=distances(path);ds=np.linspace(0,cum[-1],math.ceil(cum[-1])+1)
        measured=heights(sample(path,ds));kernel=np.exp(-.5*(np.arange(-24,25)/8)**2);kernel/=kernel.sum()
        z=np.convolve(np.pad(measured,(24,24),mode='wrap' if closed else 'edge'),kernel,mode='valid')
        if closed:z[-1]=z[0]
        profiles.append({'stepMeters':float(ds[1]),'distanceMeters':ds.tolist(),'elevationMeters':z.tolist()})
        for i,(a,b) in enumerate(zip(path,path[1:])):
            c0=max(0,int((min(a[0],b[0])-24-BOUNDS['minX'])/2));c1=min(len(xs),int((max(a[0],b[0])+24-BOUNDS['minX'])/2)+2)
            r0=max(0,int((BOUNDS['maxY']-max(a[1],b[1])-24)/2));r1=min(len(ys),int((BOUNDS['maxY']-min(a[1],b[1])+24)/2)+2)
            xx,yy=np.meshgrid(xs[c0:c1],ys[r0:r1]);v=b-a;length=np.linalg.norm(v)
            t=np.clip(((xx-a[0])*v[0]+(yy-a[1])*v[1])/(length*length),0,1)
            gap=np.hypot(xx-a[0]-t*v[0],yy-a[1]-t*v[1]);old=separation[r0:r1,c0:c1];replace=gap<old
            old[replace]=gap[replace];region=grade[r0:r1,c0:c1]
            region[replace]=np.interp((cum[i]+t*length)[replace],ds,z)
    weight=np.clip((24-separation)/10,0,1);weight=weight*weight*(3-2*weight)
    target[:]=raw*(1-weight)+grade*weight
    # 5 m triangles near pavement, 10 m elsewhere, with shared transition edges.
    refine=[]
    for row in range(110):
        rr=550-row*5
        refine.append([bool(np.min(separation[max(0,rr-5):rr+1,col*5:col*5+6])<22) for col in range(180)])
    (PREPARED/'miami-terrain-refinement.json').write_text(json.dumps(refine))
    (PREPARED/'miami-road-profiles.json').write_text(json.dumps(profiles))
    return {'verticalReference':'smoothed centreline USGS D23 lidar; adjacent embankments excluded',
            'smoothingSigmaMeters':8,'gradedHalfWidthMeters':14,'blendOuterHalfWidthMeters':24,
            'terrainGridMeters':[5,10],'refinedCells':sum(sum(row) for row in refine),
            'maximumRoadGradePercent':float(np.max(np.abs(np.diff(profiles[0]['elevationMeters'])))/profiles[0]['stepMeters']*100)}


def read_osm():
    root = ET.parse(SOURCE / 'osm.xml').getroot()
    nodes = {n.get('id'): (float(n.get('lon')), float(n.get('lat'))) for n in root.findall('node')}
    keys = list(nodes)
    xy = transform('EPSG:4326', 'EPSG:32617', *zip(*(nodes[k] for k in keys)))
    projected = dict(zip(keys, zip(*xy)))
    features = {}
    for w in root.findall('way'):
        tags = {t.get('k'): t.get('v') for t in w.findall('tag')}
        features[int(w.get('id'))] = {'id': int(w.get('id')), 'tags': tags,
                                    'world': [projected[n.get('ref')] for n in w.findall('nd')]}
    trees = [projected[n.get('id')] for n in root.findall('node')
             if any(t.get('k') == 'natural' and t.get('v') == 'tree' for t in n.findall('tag'))]
    return features, trees


def prepare():
    PREPARED.mkdir(parents=True, exist_ok=True)
    features, trees = read_osm()
    line = []
    for ident in MAIN_WAYS:
        p = features[ident]['world']
        if line and math.dist(line[-1], p[0]) > .01:
            raise ValueError(f'Disconnected Miami raceway {ident}')
        line.extend(p if not line else p[1:])
    line = np.array(line)
    if np.linalg.norm(line[0]-line[-1]) > .01:
        raise ValueError('Miami source is not closed')
    total = float(distances(line)[-1])
    if abs(total-5412)/5412 > .005:
        raise ValueError(f'Miami source length {total} is outside FIA tolerance')
    # Register the actual FIA control-line drawing to four surveyed OSM bends.
    # Pixel coordinates refer to page 2 rendered with pdftoppm -scale-to 1800.
    # Sector positions use FIA corner-relative offsets: the printed sector
    # distance table disagrees with those offsets on the mapped centreline.
    drawing = np.array([[806,899,1],[203,1437,1],[1085,470,1],[131,1022,1]])
    controls = np.array([features[w]['world'][v] for w,v in
                         [(1485453197,26),(1017340351,58),(1472684485,72),(1472686141,9)]])
    registration = np.linalg.lstsq(drawing,controls,rcond=None)[0]
    finish_world = np.array([462,884,1]) @ registration
    offset, finish_separation = nearest(line,finish_world)
    cumulative = distances(line)
    split = int(np.searchsorted(cumulative, offset))
    start = sample(line, offset)
    line = np.concatenate(([start], line[split:-1], line[:split], [start]))
    turns = []
    sides = [-1, 1, -1, -1, 1, -1, -1, -1, 1, -1, 1, -1, -1, 1, -1, -1, -1, -1, -1]
    for i, (ident, index) in enumerate(TURN_VERTICES):
        turns.append({'number': i+1, 'distanceMeters': nearest(line, features[ident]['world'][index])[0],
                      'sourceWayId': ident, 'sourceVertex': index, 'anchorSide': sides[i], 'anchorOffsetMeters': 20})
    if any(b['distanceMeters'] <= a['distanceMeters'] for a,b in zip(turns,turns[1:])):
        raise ValueError('Miami turn order is invalid')
    pit = np.array(features[1017340352]['world'])
    # OSM pit endpoints are shared with the GP configuration, not Formula E.
    gaps = [nearest(line,p)[1] for p in [pit[0],pit[-1]]]
    if max(gaps) > .05:
        raise ValueError(f'Miami pit is disconnected: {gaps}')
    center = {'x': (BOUNDS['minX']+BOUNDS['maxX'])/2, 'y': (BOUNDS['minY']+BOUNDS['maxY'])/2}
    width, height = 901, 551
    target = np.full((height,width), np.nan, dtype=np.float32)
    # Pixel centres coincide with HeightRaster's endpoint-sampled grid.
    step = 2
    target_transform = from_bounds(BOUNDS['minX']-step/2, BOUNDS['minY']-step/2,
                                   BOUNDS['maxX']+step/2, BOUNDS['maxY']+step/2, width, height)
    with rasterio.open(SOURCE/'usgs-d23-1m.tif') as source:
        reproject(rasterio.band(source,1), target, src_transform=source.transform,src_crs=source.crs,
                  dst_transform=target_transform,dst_crs='EPSG:32617',resampling=Resampling.bilinear)
    if not np.isfinite(target).all() or np.any(np.abs(target)>100):
        raise ValueError('USGS Miami DTM contains invalid cells')
    target.astype('<f4').tofile(PREPARED/'miami-source-dtm.f32le')
    grading=road_terrain(target,line,pit)
    target.astype('<f4').tofile(PREPARED/'miami-dtm.f32le')
    ortho = Image.open(SOURCE/'ortho.jpg').convert('RGB')
    source_bounds = (575450,2870450,577550,2871850)
    crop = ((BOUNDS['minX']-source_bounds[0])/2100*ortho.width,
            (source_bounds[3]-BOUNDS['maxY'])/1400*ortho.height,
            (BOUNDS['maxX']-source_bounds[0])/2100*ortho.width,
            (source_bounds[3]-BOUNDS['minY'])/1400*ortho.height)
    ortho = ortho.crop(tuple(round(n) for n in crop))
    ortho.save(PREPARED/'miami-orthophoto.jpg',quality=85,subsampling=2)
    metadata={'rasters':{'dtm':{'width':width,'height':height,'minimum':float(target.min()),
                'maximum':float(target.max()),'mean':float(target.mean()),'sourceResolutionMeters':1,'sampleStepMeters':2}},
              'roadGrading':grading,
              'terrainSurface':{'style':'orthophoto','source':'Miami-Dade County aerial imagery service, labelled 2025',
              'textureWidth':ortho.width,'textureHeight':ortho.height,'resolutionMeters':2100/4095}}
    (PREPARED/'raster-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
    def in_bounds(p):return BOUNDS['minX']<=p[0]<=BOUNDS['maxX'] and BOUNDS['minY']<=p[1]<=BOUNDS['maxY']
    vectors=[f for f in features.values() if f['world'] and all(in_bounds(p) for p in f['world'])]
    config={'schemaVersion':4,'generatorVersion':'1.0.0','sourceDirectory':str(SOURCE),
            'sourceManifest':json.loads((SOURCE/'source-manifest.json').read_text()),'vectors':vectors,
            'mappedTrees':[p for p in trees if in_bounds(p)],
            'highwayNetwork':[f for f in features.values() if f['tags'].get('highway') in ['motorway','motorway_link']
                and any(in_bounds(p) for p in f['world'])],
            'model':{'id':'miami','bounds':BOUNDS,'center':center,'lapLengthMeters':5412,
                     'centerline':line.tolist(),'pitCenterline':pit.tolist(),'mainCircuitWayIds':MAIN_WAYS,
                     'pitLaneWayIds':[1017340352],'pitBoxes':37,'trackWidthMeters':12,'pitLaneWidthMeters':8,
                     'sourceStartFinishOffsetMeters':offset,'turns':turns},
            'officialControlPoints':{'referenceYear':2026,'document':5,'currentEventVerified':True,
                'sectorBoundaryDistancesMeters':[turns[7]['distanceMeters']+110,turns[15]['distanceMeters']+70],
                'publishedSectorLengthsMeters':[1866,1730,1816],
                'sectorPlacementMethod':'FIA spatial notes: 110 m after T8 and 70 m after T16; table discrepancy disclosed',
                'controlLineRegistration':{'rmsMeters':float(np.sqrt(np.mean(np.sum((drawing@registration-controls)**2,axis=1)))),
                    'separationFromCenterlineMeters':finish_separation,'fiaPage':2,'renderLongEdgePixels':1800,
                    'pixelControls':drawing[:,:2].tolist(),'worldControls':controls.tolist(),'controlLinePixel':[462,884]},
                'raceStartDistanceMeters':nearest(line,np.array([601,883,1])@registration)[0],
                'speedTrapDistanceMeters':turns[16]['distanceMeters']-150,
                'drs':[],'straightModeActivationDistancesMeters':[turns[7]['distanceMeters']+165,
                turns[15]['distanceMeters']+90,turns[18]['distanceMeters']+70]},
            'limitations':['County orthophoto is labelled 2025 (some legacy service metadata still says 2024); it shows the permanent venue outside race week.',
                'USGS FL_MiamiDade_D23 lidar acquisition 2023-12-27 to 2024-05-29, NAVD88; no vertical exaggeration. Adaptive terrain grid is 5 m near roads and 10 m elsewhere. Pavement follows the centreline lidar with an 8 m Gaussian filter; the adjoining 14 m corridor is graded and blended to 24 m to remove bridge-embankment bleed. This is a visual terrain reconstruction, not a road survey.',
                'Current footprints come from OSM and orthophoto. Unmeasured building and temporary structure heights are photographic estimates, not LoD2 survey.',
                '2026 event structures are geolocated from the official FIA media-kit campus plan. Their temporary footprints and dimensions are approximate; no engineering-accuracy claim.',
                'Control line is registered from the FIA drawing (about 6.4 m GCP RMS). FIA printed sector lengths disagree with its corner-relative timing-loop notes; spatial notes take precedence. No geometry is stretched to fit that table.',
                'Small tents, containers, service vehicles and individual spectators are omitted.']}
    config['limitations'].append('Flyover plan geometry follows OSM, but bridge deck elevations and connecting ramp gradients are estimates; no bridge survey was available. Safety barriers follow an approximate road envelope, not a surveyed barrier inventory.')
    # Reviewed event geometry is kept separately from measured permanent data.
    config['event']=json.loads((ROOT/'scripts/track-model-blender/miami-event-layout.json').read_text())
    (ROOT/'.track-model-build/miami.json').write_text(json.dumps(config,indent=2)+'\n')
    # Source comparison plate: metres, north up, no arbitrary rotation or stretch.
    draw=ImageDraw.Draw(ortho)
    def pixel(p):return ((p[0]-BOUNDS['minX'])/1800*ortho.width,(BOUNDS['maxY']-p[1])/1100*ortho.height)
    draw.line([pixel(p) for p in line], fill='#ff5b35',width=3)
    draw.line([pixel(p) for p in pit],fill='#00ffff',width=3)
    for t in turns:
        p=pixel(sample(line,t['distanceMeters']));draw.ellipse((p[0]-7,p[1]-7,p[0]+7,p[1]+7),fill='black')
        draw.text((p[0]+8,p[1]-10),str(t['number']),fill='yellow',stroke_width=1,stroke_fill='black')
    ortho.resize((1800,1100)).save(PREPARED/'source-alignment.jpg',quality=94)
    print(json.dumps({'lengthMeters':total,'errorPercent':abs(total-5412)/5412*100,'pitGaps':gaps,
                      'controlLine':start.tolist(),'turnDistances':[round(t['distanceMeters'],1) for t in turns]}))


if __name__=='__main__':prepare()
