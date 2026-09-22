#!/usr/bin/env python3
"""Cache permitted Copernicus crops, then prepare the metric Sepang terrain.

Requires the existing geospatial build tools: rasterio, numpy and Pillow.
A GLO-30 DSM is not a surveyed bare-earth DTM; this limitation stays in metadata.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np
import rasterio
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter
from rasterio.warp import reproject, Resampling, transform, transform_bounds
from rasterio.windows import from_bounds
from rasterio.transform import from_bounds as grid_transform

BOUNDS = (803400, 304800, 805400, 306200)
CRS = 'EPSG:32647'
RASTERS = {
    'sentinel-tci.tif': 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/47/N/RD/2026/8/S2C_47NRD_20260815_0_L2A/TCI.tif',
    'copernicus-dem.tif': 'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N02_00_E101_00_DEM/Copernicus_DSM_COG_10_N02_00_E101_00_DEM.tif',
}

GROUND_SIZE = (4096, 2868)
# Rendering colours, not new surveyed surface measurements. The fine boundaries
# come exclusively from the pinned OSM snapshot in the same metric CRS as the mesh.
GROUND_COLORS = {
    'wood': (55, 80, 61), 'orchard': (69, 88, 60),
    'grass': (103, 119, 76), 'gravel': (178, 167, 137),
    'paved': (112, 119, 112), 'asphalt': (91, 98, 92), 'water': (59, 91, 88),
}


def ground_kind(tags):
    if tags.get('building') or tags.get('building:part'):
        return None
    if tags.get('natural') == 'wood': return 'wood'
    if tags.get('natural') == 'water': return 'water'
    if tags.get('landuse') == 'orchard': return 'orchard'
    if tags.get('landuse') == 'grass': return 'grass'
    if tags.get('area') == 'yes' and tags.get('surface') == 'gravel': return 'gravel'
    if tags.get('area:highway') == 'raceway': return 'asphalt'
    if tags.get('highway') == 'pedestrian' and tags.get('type') == 'multipolygon': return 'paved'
    if tags.get('area:highway') or tags.get('amenity') == 'parking': return 'paved'
    if tags.get('area') == 'yes' and tags.get('surface') in {'asphalt', 'paved', 'concrete'}: return 'paved'
    return None


def compose_ground(source, satellite):
    """Bake mapped land cover into one texture; no floating ground overlay meshes."""
    size = GROUND_SIZE
    # Retain a restrained real macro-colour signal without magnifying 10 m pixels.
    macro = ImageEnhance.Color(satellite).enhance(.3).filter(ImageFilter.GaussianBlur(6))
    macro = macro.resize(size, Image.Resampling.BICUBIC)
    base = Image.blend(Image.new('RGB', size, (83, 99, 73)), macro, .06)
    masks = {kind: Image.new('L', size, 0) for kind in GROUND_COLORS}
    counts = Counter()
    way_ids = []

    def projected_ring(geometry):
        xs, ys = transform('EPSG:4326', CRS, [p['lon'] for p in geometry], [p['lat'] for p in geometry])
        if max(xs) < BOUNDS[0] or min(xs) > BOUNDS[2] or max(ys) < BOUNDS[1] or min(ys) > BOUNDS[3]: return None
        return [((x-BOUNDS[0])/(BOUNDS[2]-BOUNDS[0])*size[0],
                 (BOUNDS[3]-y)/(BOUNDS[3]-BOUNDS[1])*size[1]) for x, y in zip(xs, ys)]

    features = json.loads((source/'openstreetmap.json').read_text())['elements']
    for feature in features:
        geometry = feature.get('geometry', [])
        kind = ground_kind(feature.get('tags', {}))
        if not kind or len(geometry) < 4 or geometry[0] != geometry[-1]: continue
        points = projected_ring(geometry)
        if not points: continue
        ImageDraw.Draw(masks[kind]).polygon(points, fill=255)
        counts[kind] += 1
        way_ids.append(feature['id'])

    # OSM keeps the asphalt envelope and the pedestrian mall in multipolygons.
    # Preserve their inner rings: filling an outer ring alone would paint over
    # the entire infield. Incomplete bbox relations remain unmodified macro-colour.
    ways = {str(f['id']): f['geometry'] for f in features if f['type'] == 'way'}
    relation_ids = []
    skipped_relations = []
    for relation in ET.parse(source/'openstreetmap-map.osm').getroot().findall('relation'):
        tags = {tag.attrib['k']: tag.attrib['v'] for tag in relation.findall('tag')}
        kind = ground_kind(tags)
        if tags.get('type') != 'multipolygon' or not kind: continue
        members = relation.findall('member')
        rings = [(member.attrib.get('role'), ways.get(member.attrib['ref'], [])) for member in members]
        if not rings or any(member.attrib['type'] != 'way' for member in members) or any(
                role not in {'outer', 'inner'} or len(ring) < 4 or ring[0] != ring[-1] for role, ring in rings):
            skipped_relations.append(int(relation.attrib['id']))
            continue
        mask = Image.new('L', size, 0)
        draw = ImageDraw.Draw(mask)
        for role in ['outer', 'inner']:
            for ring_role, geometry in rings:
                if ring_role != role: continue
                points = projected_ring(geometry)
                if points: draw.polygon(points, fill=255 if role == 'outer' else 0)
        if not mask.getbbox(): continue
        masks[kind] = ImageChops.lighter(masks[kind], mask)
        counts[kind] += 1
        relation_ids.append(int(relation.attrib['id']))

    rng = np.random.default_rng(20260922)
    # Material grain is intentionally low contrast. It is decorative roughness,
    # not invented kerbs, drainage, tyre marks, vegetation or inferred geometry.
    grain = rng.normal(0, 1.1, (size[1], size[0])).astype(np.float32)
    flecks = Image.fromarray(rng.integers(90, 166, (size[1]//3, size[0]//3), dtype=np.uint8))
    flecks = np.asarray(flecks.resize(size, Image.Resampling.BILINEAR), dtype=np.float32)-128
    base = Image.fromarray(np.clip(np.asarray(base, dtype=np.float32)+(grain+flecks*.12)[:, :, None], 0, 255).astype(np.uint8))
    for kind, color in GROUND_COLORS.items():
        fill = Image.blend(Image.new('RGB', size, color), macro, .06)
        pixels = np.array(fill, dtype=np.float32)
        strength = .14 if kind in {'grass', 'wood', 'orchard'} else .1
        pixels += (grain + flecks*strength)[:, :, None]
        fill = Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8))
        base.paste(fill, mask=masks[kind])
    return base, {
        'style': 'mapped-materials', 'syntheticGroundOverlays': False,
        'detailSource': 'current OpenStreetMap ground geometry',
        'macroColorSource': 'Copernicus Sentinel-2 L2A TCI 2026-08-15',
        'sourceResolutionMeters': 10, 'textureWidth': size[0], 'textureHeight': size[1],
        'currentGroundPolygons': len(way_ids)+len(relation_ids), 'polygonCounts': dict(counts),
        'sourceWayIds': sorted(way_ids), 'decorativeMaterialGrain': True,
        'sourceRelationIds': sorted(relation_ids), 'skippedIncompleteRelations': sorted(skipped_relations),
        'multipolygonHolesPreserved': True,
        'description': 'Mapped land-cover boundaries with subdued satellite tint and decorative material grain; not high-resolution aerial imagery.',
    }


def download(source):
    for name, url in RASTERS.items():
        dest = source / name
        if dest.exists():
            continue
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_TIMEOUT='45'):
            with rasterio.open(url) as src:
                projected = transform_bounds(CRS, src.crs, *BOUNDS)
                # Pad one native pixel so reproject never extrapolates at the edges.
                window = from_bounds(*projected, src.transform).round_offsets().round_lengths()
                window = rasterio.windows.Window(window.col_off-1, window.row_off-1, window.width+2, window.height+2)
                pixels = src.read(window=window)
                profile = src.profile.copy()
                profile.update(driver='GTiff', width=pixels.shape[2], height=pixels.shape[1], transform=src.window_transform(window), compress='deflate')
                with rasterio.open(dest, 'w', **profile) as target:
                    target.write(pixels)


def prepare(source, output):
    output.mkdir(parents=True, exist_ok=True)
    width, height = 201, 141
    # HeightRaster samples grid nodes, not pixel centres. Extend the raster bounds
    # by half a grid interval so both ends land on the exact scene bounds.
    step = 10
    grid_bounds = (BOUNDS[0]-step/2, BOUNDS[1]-step/2, BOUNDS[2]+step/2, BOUNDS[3]+step/2)
    terrain = np.full((height, width), np.nan, dtype='<f4')
    with rasterio.open(source/'copernicus-dem.tif') as src:
        reproject(rasterio.band(src, 1), terrain, src_transform=src.transform, src_crs=src.crs,
                  dst_transform=grid_transform(*grid_bounds, width, height), dst_crs=CRS,
                  resampling=Resampling.bilinear, dst_nodata=np.nan)
    if not np.isfinite(terrain).all():
        raise ValueError('Copernicus DEM has missing coverage in the Sepang bbox')
    terrain.tofile(output/'sepang-dem.f32le')
    rgb = np.zeros((3, 1400, 2000), dtype='uint8')
    with rasterio.open(source/'sentinel-tci.tif') as src:
        reproject(src.read(), rgb, src_transform=src.transform, src_crs=src.crs,
                  dst_transform=grid_transform(*BOUNDS, 2000, 1400), dst_crs=CRS,
                  resampling=Resampling.cubic)
    image = Image.fromarray(rgb.transpose(1, 2, 0))
    image.save(output/'sepang-sentinel-20260815.jpg', quality=92, optimize=True)
    ground, ground_metadata = compose_ground(source, image)
    ground.save(output/'sepang-ground-surface.jpg', quality=90, optimize=True, subsampling=0)
    metadata = {
        'bounds': dict(zip(('minX','minY','maxX','maxY'), BOUNDS)),
        'coordinateReferenceSystem': CRS, 'verticalDatum': 'EGM2008 orthometric metres',
        'rasters': {'dem': {'width':width, 'height':height, 'minimum':float(terrain.min()),
                          'maximum':float(terrain.max()), 'mean':float(terrain.mean()), 'sourceResolutionMeters':30,
                          'kind':'Copernicus GLO-30 DSM; not a surveyed bare-earth DTM'}},
        'orthophoto': {'width':2000, 'height':1400, 'sourceResolutionMeters':10,
                       'acquiredAt':'2026-08-15T03:47:16.767Z', 'kind':'Sentinel-2 true colour; not aerial orthophotography'},
        'terrainSurface': ground_metadata,
        'limitations':['30 m surface DEM includes vegetation and structures; no sub-metre survey or measured banking.',
                       '10 m true-colour texture cannot resolve individual kerbs, garages or roof details.'],
    }
    (output/'raster-metadata.json').write_text(json.dumps(metadata, indent=2)+'\n')
    print(json.dumps({'terrainMin':float(terrain.min()),'terrainMax':float(terrain.max()),'textureSize':image.size}))


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',required=True)
    parser.add_argument('--output')
    parser.add_argument('--download',action='store_true')
    args=parser.parse_args()
    source=Path(args.source);source.mkdir(parents=True,exist_ok=True)
    if args.download: download(source)
    else: prepare(source,Path(args.output))
