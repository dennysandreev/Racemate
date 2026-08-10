import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const buildDirectory = path.join(projectRoot, ".track-model-build");

function auditBuildingConflicts(data, samples, halfTrackWidth) {
  const transform = data.metadata.transform;
  const conflicts = [];

  for (const feature of data.features) {
    const vertices = feature.vertices.map((vertex) => [
      vertex[0] * transform.scale[0] + transform.translate[0],
      vertex[1] * transform.scale[1] + transform.translate[1],
    ]);
    const footprints = cityGroundFootprints(feature, vertices);
    let minimum = Number.POSITIVE_INFINITY;
    let nearestSampleIndex = -1;

    for (const polygon of footprints) {
      const minX = Math.min(...polygon.map((point) => point[0]));
      const maxX = Math.max(...polygon.map((point) => point[0]));
      const minY = Math.min(...polygon.map((point) => point[1]));
      const maxY = Math.max(...polygon.map((point) => point[1]));
      const nearby = samples.filter((point) =>
        point[0] >= minX - halfTrackWidth - 2 && point[0] <= maxX + halfTrackWidth + 2 &&
        point[1] >= minY - halfTrackWidth - 2 && point[1] <= maxY + halfTrackWidth + 2
      );

      for (const point of nearby) {
        const clearance = distancePointPolygon(point, polygon) - halfTrackWidth;
        if (clearance < minimum) {
          minimum = clearance;
          nearestSampleIndex = samples.indexOf(point);
        }
      }
    }

    if (minimum < 1.5) {
      conflicts.push({
        clearanceMeters: round(minimum),
        distanceMeters: round(nearestSampleIndex * 1),
        id: feature.id,
      });
    }
  }

  return conflicts.sort((first, second) => first.clearanceMeters - second.clearanceMeters);
}

function auditGrandstandTerrain(specs, points, distances, raster) {
  const sections = [];

  for (const stand of specs) {
    for (let distance = stand.start; distance < stand.end;) {
      const nextDistance = Math.min(distance + 18, stand.end);
      const start = Math.min(distance + 0.4, nextDistance);
      const end = Math.max(nextDistance - 0.4, start);
      const side = stand.side === "left" ? 1 : -1;
      const footprint = grandstandStrip(
        points,
        distances,
        start,
        end,
        side,
        stand.offset,
        stand.offset + stand.depth,
      );
      const elevations = footprint.map(([x, y]) => raster.sample(x, y));
      sections.push({
        groundRangeMeters: round(Math.max(...elevations) - Math.min(...elevations)),
        name: stand.name,
        startMeters: round(start),
      });
      distance = nextDistance;
    }
  }

  const worst = [...sections].sort((first, second) => second.groundRangeMeters - first.groundRangeMeters)[0];
  const turnTen = sections
    .filter((section) => section.name === "Eastside 3")
    .sort((first, second) => second.groundRangeMeters - first.groundRangeMeters)[0];

  return {
    currentMaximumRowTwistMeters: worst.groundRangeMeters,
    turnTenMaximumRowTwistMeters: turnTen.groundRangeMeters,
    turnTenOfficialZone: "Eastside Grandstands 1, 2, 3",
    worstSection: worst,
  };
}

function auditBuildingGrandstandConflicts(buildings, specs, points, distances) {
  const sections = [];

  for (const stand of specs) {
    for (let distance = stand.start; distance < stand.end;) {
      const nextDistance = Math.min(distance + 18, stand.end);
      const start = Math.min(distance + 0.4, nextDistance);
      const end = Math.max(nextDistance - 0.4, start);
      const side = stand.side === "left" ? 1 : -1;
      sections.push({
        name: stand.name,
        polygon: grandstandStrip(
          points,
          distances,
          start,
          end,
          side,
          stand.offset,
          stand.offset + stand.depth,
        ),
        startMeters: round(start),
      });
      distance = nextDistance;
    }
  }

  const conflicts = [];

  for (const feature of buildings.features) {
    const footprints = geojsonOuterRings(feature.geometry);
    const intersections = sections.filter((section) =>
      footprints.some((footprint) => polygonsOverlap(footprint, section.polygon))
    );

    if (intersections.length === 0) continue;

    conflicts.push({
      bagId: feature.properties?.bag_pnd ?? null,
      id: feature.id,
      sections: intersections.map((section) => `${section.name}@${section.startMeters}`),
    });
  }

  return conflicts;
}

function auditTrackSurface(points, distances, raster, bounds, renderedTerrainCorrection = false) {
  const interval = 3;
  const total = distances.at(-1);
  const count = Math.ceil(total / interval);
  const sections = [];
  const offset = 0.26;

  for (let index = 0; index <= count; index += 1) {
    const distance = Math.min((total * index) / count, total - 1e-6);
    const point = samplePolyline(points, distances, distance);
    const tangent = sampleTangent(points, distances, distance);
    const normal = [-tangent[1], tangent[0]];
    const bank = bankAngle(distance, total);
    const bankHeight = Math.tan(bank) * 5;
    const left = [point[0] + normal[0] * 5, point[1] + normal[1] * 5];
    const right = [point[0] - normal[0] * 5, point[1] - normal[1] * 5];
    const clearanceSamples = [
      raster.sample(...point),
      raster.sample(...left) + bankHeight,
      raster.sample(...right) - bankHeight,
    ];
    if (renderedTerrainCorrection) {
      for (let lateralIndex = -8; lateralIndex <= 8; lateralIndex += 1) {
        const lateral = lateralIndex * 5 / 8;
        const x = point[0] + normal[0] * lateral;
        const y = point[1] + normal[1] * lateral;
        clearanceSamples.push(terrainMeshHeight(x, y, raster, bounds) + Math.tan(bank) * lateral);
      }
    }
    const centreHeight = Math.max(...clearanceSamples) + offset;
    sections.push({
      left: [...left, centreHeight - bankHeight],
      right: [...right, centreHeight + bankHeight],
    });
  }

  let breakthroughs = 0;
  let minimum = Number.POSITIVE_INFINITY;
  let worst = null;
  let startStraightBreakthroughs = 0;
  let startStraightMinimum = Number.POSITIVE_INFINITY;
  let startStraightWorst = null;

  for (let index = 0; index < sections.length - 1; index += 1) {
    const first = sections[index];
    const second = sections[index + 1];
    const segmentDistance = total * index / count;
    for (const triangle of [
      [first.left, first.right, second.right],
      [first.left, second.right, second.left],
    ]) {
      for (let a = 0; a <= 4; a += 1) {
        for (let b = 0; b <= 4 - a; b += 1) {
          const weights = [a / 4, b / 4, 1 - (a + b) / 4];
          const sample = [0, 1, 2].map((axis) =>
            triangle.reduce((sum, point, pointIndex) => sum + point[axis] * weights[pointIndex], 0)
          );
          const terrain = terrainMeshHeight(sample[0], sample[1], raster, bounds);
          const clearance = sample[2] - terrain;
          if (clearance < minimum) {
            minimum = clearance;
            worst = { distanceMeters: round(segmentDistance), x: round(sample[0]), y: round(sample[1]) };
          }
          if (clearance <= 0.03) breakthroughs += 1;
          if (segmentDistance <= 700) {
            if (clearance < startStraightMinimum) {
              startStraightMinimum = clearance;
              startStraightWorst = {
                distanceMeters: round(segmentDistance),
                x: round(sample[0]),
                y: round(sample[1]),
              };
            }
            if (clearance <= 0.03) startStraightBreakthroughs += 1;
          }
        }
      }
    }
  }

  return {
    minimumTerrainClearanceMeters: round(minimum),
    samplesAtOrBelowThreeCentimeters: breakthroughs,
    startStraight: {
      minimumTerrainClearanceMeters: round(startStraightMinimum),
      samplesAtOrBelowThreeCentimeters: startStraightBreakthroughs,
      worst: startStraightWorst,
    },
    worst,
  };
}

function terrainMeshHeight(x, y, raster, bounds) {
  const columns = 194;
  const rows = 176;
  const columnPosition = (x - bounds.minX) / (bounds.maxX - bounds.minX) * (columns - 1);
  const rowPosition = (y - bounds.minY) / (bounds.maxY - bounds.minY) * (rows - 1);
  const column = Math.min(Math.max(Math.floor(columnPosition), 0), columns - 2);
  const row = Math.min(Math.max(Math.floor(rowPosition), 0), rows - 2);
  const tx = Math.min(Math.max(columnPosition - column, 0), 1);
  const ty = Math.min(Math.max(rowPosition - row, 0), 1);
  const x0 = bounds.minX + (bounds.maxX - bounds.minX) * column / (columns - 1);
  const x1 = bounds.minX + (bounds.maxX - bounds.minX) * (column + 1) / (columns - 1);
  const y0 = bounds.minY + (bounds.maxY - bounds.minY) * row / (rows - 1);
  const y1 = bounds.minY + (bounds.maxY - bounds.minY) * (row + 1) / (rows - 1);
  const a = raster.sample(x0, y0);
  const b = raster.sample(x1, y0);
  const c = raster.sample(x1, y1);
  const d = raster.sample(x0, y1);

  return ty <= tx
    ? a * (1 - tx) + b * (tx - ty) + c * ty
    : a * (1 - ty) + c * tx + d * (ty - tx);
}

function cityGroundFootprints(feature, vertices) {
  const result = [];

  for (const cityObject of Object.values(feature.CityObjects)) {
    if (cityObject.type !== "BuildingPart") continue;
    const geometry = cityObject.geometry?.find((item) => item.lod === "2.2");
    if (!geometry) continue;
    const surfaces = geometry.semantics?.surfaces ?? [];
    const values = geometry.semantics?.values?.[0] ?? [];

    for (let surfaceIndex = 0; surfaceIndex < geometry.boundaries[0].length; surfaceIndex += 1) {
      const semantic = surfaces[values[surfaceIndex]];
      if (semantic?.type !== "GroundSurface") continue;
      const firstRing = geometry.boundaries[0][surfaceIndex][0];
      if (firstRing?.length >= 3) result.push(firstRing.map((index) => vertices[index]));
    }
  }

  return result;
}

function grandstandStrip(points, distances, start, end, side, innerOffset, outerOffset) {
  return [
    [start, innerOffset], [end, innerOffset], [end, outerOffset], [start, outerOffset],
  ].map(([distance, offset]) => {
    const point = samplePolyline(points, distances, distance);
    const tangent = sampleTangent(points, distances, distance);
    const normal = [-tangent[1] * side, tangent[0] * side];
    return [point[0] + normal[0] * offset, point[1] + normal[1] * offset];
  });
}

function distancePointPolygon(point, polygon) {
  if (pointInPolygon(point, polygon)) return 0;
  return Math.min(...polygon.map((first, index) =>
    distancePointSegment(point, first, polygon[(index + 1) % polygon.length])
  ));
}

function pointInPolygon(point, polygon) {
  let inside = false;
  let previous = polygon.at(-1);

  for (const current of polygon) {
    if ((current[1] > point[1]) !== (previous[1] > point[1])) {
      const crossing = (previous[0] - current[0]) * (point[1] - current[1]) /
        (previous[1] - current[1]) + current[0];
      if (point[0] < crossing) inside = !inside;
    }
    previous = current;
  }

  return inside;
}

function polygonsOverlap(first, second) {
  if (pointInPolygon(first[0], second) || pointInPolygon(second[0], first)) return true;

  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      if (segmentsIntersect(
        first[firstIndex],
        first[(firstIndex + 1) % first.length],
        second[secondIndex],
        second[(secondIndex + 1) % second.length],
      )) return true;
    }
  }

  return false;
}

function geojsonOuterRings(geometry) {
  if (geometry?.type === "Polygon") return geometry.coordinates.slice(0, 1);
  if (geometry?.type === "MultiPolygon") return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
}

function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const orientation = (start, end, point) =>
    (end[0] - start[0]) * (point[1] - start[1]) -
    (end[1] - start[1]) * (point[0] - start[0]);
  return orientation(firstStart, firstEnd, secondStart) * orientation(firstStart, firstEnd, secondEnd) < -1e-9 &&
    orientation(secondStart, secondEnd, firstStart) * orientation(secondStart, secondEnd, firstEnd) < -1e-9;
}

function distancePointSegment(point, first, second) {
  const dx = second[0] - first[0];
  const dy = second[1] - first[1];
  const lengthSquared = dx * dx + dy * dy;
  const blend = lengthSquared === 0 ? 0 : Math.min(Math.max(
    ((point[0] - first[0]) * dx + (point[1] - first[1]) * dy) / lengthSquared,
    0,
  ), 1);
  return Math.hypot(point[0] - first[0] - dx * blend, point[1] - first[1] - dy * blend);
}

function sampleLine(points, distances, interval) {
  const total = distances.at(-1);
  const count = Math.ceil(total / interval);
  return Array.from({ length: count }, (_, index) => samplePolyline(points, distances, total * index / count));
}

function sampleTangent(points, distances, distance) {
  const before = samplePolyline(points, distances, distance - 3);
  const after = samplePolyline(points, distances, distance + 3);
  const dx = after[0] - before[0];
  const dy = after[1] - before[1];
  const length = Math.max(Math.hypot(dx, dy), 1e-9);
  return [dx / length, dy / length];
}

function samplePolyline(points, distances, distance) {
  const total = distances.at(-1);
  const target = ((distance % total) + total) % total;
  let low = 0;
  let high = distances.length - 1;

  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (distances[middle] <= target) low = middle;
    else high = middle;
  }

  const length = Math.max(distances[low + 1] - distances[low], 1e-9);
  const blend = (target - distances[low]) / length;
  return [
    points[low][0] * (1 - blend) + points[low + 1][0] * blend,
    points[low][1] * (1 - blend) + points[low + 1][1] * blend,
  ];
}

function bankAngle(distance, total) {
  const raisedCosine = (value, start, end, degrees) => {
    if (value < start || value > end) return 0;
    const phase = (value - start) / (end - start);
    return Math.sin(Math.PI * phase) ** 2 * degrees * Math.PI / 180;
  };
  const turn3 = raisedCosine(distance, 1_135, 1_290, 18);
  const turn14 = raisedCosine(distance, 3_970, total, 18) +
    raisedCosine(distance + total, 3_970, total + 55, 18);
  return turn3 - turn14;
}

function assembleMainCircuit(data, wayIds) {
  const ways = new Map(data.elements.filter((element) => element.type === "way").map((way) => [way.id, way]));
  const points = [];

  for (const wayId of wayIds) {
    const geometry = [...ways.get(wayId).geometry];
    if (points.length > 0) {
      const direct = geographicDistance(points.at(-1), geometry[0]);
      const reverse = geographicDistance(points.at(-1), geometry.at(-1));
      if (reverse < direct) geometry.reverse();
      if (geographicDistance(points.at(-1), geometry[0]) < 1e-8) geometry.shift();
    }
    points.push(...geometry);
  }

  if (geographicDistance(points[0], points.at(-1)) > 1e-7) points.push(points[0]);
  return points.map((point) => rdFromWgs84(point.lat, point.lon));
}

function lineDistance(points) {
  const result = [0];
  for (let index = 1; index < points.length; index += 1) {
    result.push(result.at(-1) + Math.hypot(
      points[index][0] - points[index - 1][0],
      points[index][1] - points[index - 1][1],
    ));
  }
  return result;
}

function geographicDistance(first, second) {
  return Math.hypot(first.lat - second.lat, first.lon - second.lon);
}

function rdFromWgs84(latitude, longitude) {
  const p = (latitude - 52.1551744) * 0.36;
  const q = (longitude - 5.38720621) * 0.36;
  return [
    155000 + 190094.945 * q - 11832.228 * p * q - 114.221 * p * p * q - 32.391 * q ** 3 - 0.705 * p + 0.608 * p * q * q + 0.157 * p ** 3 * q,
    463000 + 309056.544 * p + 3638.893 * q * q + 73.077 * p * p - 157.984 * p * q * q + 59.788 * p ** 3 + 0.433 * q - 6.439 * p * p * q * q - 0.032 * p * q + 0.092 * q ** 4 - 0.054 * p ** 4,
  ];
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

class HeightRaster {
  constructor(buffer, metadata, bounds) {
    this.buffer = buffer;
    this.bounds = bounds;
    this.fallback = metadata.mean;
    this.height = metadata.height;
    this.width = metadata.width;
  }

  sample(x, y) {
    const fx = Math.min(Math.max(
      (x - this.bounds.minX) / (this.bounds.maxX - this.bounds.minX) * (this.width - 1),
      0,
    ), this.width - 1);
    const fy = Math.min(Math.max(
      (this.bounds.maxY - y) / (this.bounds.maxY - this.bounds.minY) * (this.height - 1),
      0,
    ), this.height - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, this.width - 1);
    const y1 = Math.min(y0 + 1, this.height - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const samples = [
      [this.value(x0, y0), (1 - tx) * (1 - ty)],
      [this.value(x1, y0), tx * (1 - ty)],
      [this.value(x0, y1), (1 - tx) * ty],
      [this.value(x1, y1), tx * ty],
    ].filter(([value, weight]) => Number.isFinite(value) && weight > 1e-12);
    const total = samples.reduce((sum, sample) => sum + sample[1], 0);
    return total > 0
      ? samples.reduce((sum, sample) => sum + sample[0] * sample[1], 0) / total
      : this.fallback;
  }

  value(x, y) {
    return this.buffer.readFloatLE((y * this.width + x) * 4);
  }
}

const config = JSON.parse(await readFile(path.join(buildDirectory, "zandvoort.json"), "utf8"));
const sourceDirectory = path.join(buildDirectory, "zandvoort-source");
const preparedDirectory = path.join(buildDirectory, "zandvoort-prepared");
const osm = JSON.parse(await readFile(path.join(sourceDirectory, "openstreetmap-raceway.json"), "utf8"));
const rasterMetadata = JSON.parse(await readFile(path.join(preparedDirectory, "raster-metadata.json"), "utf8"));
const dtm = new HeightRaster(
  await readFile(path.join(preparedDirectory, "ahn4-dtm.f32le")),
  rasterMetadata.rasters.dtm,
  config.model.bounds,
);
const centreline = assembleMainCircuit(osm, config.model.mainCircuitWayIds);
const cumulative = lineDistance(centreline);
const trackSamples = sampleLine(centreline, cumulative, 1);
const trackSurface = auditTrackSurface(centreline, cumulative, dtm, config.model.bounds);
const correctedTrackSurface = auditTrackSurface(centreline, cumulative, dtm, config.model.bounds, true);
const buildings = JSON.parse(await readFile(path.join(sourceDirectory, "3dbag-buildings.city.json"), "utf8"));
const bgtBuildings = JSON.parse(await readFile(path.join(sourceDirectory, "bgt/pand.geojson"), "utf8"));
const buildingConflicts = auditBuildingConflicts(buildings, trackSamples, config.model.trackWidthMeters / 2);
const buildingGrandstandConflicts = auditBuildingGrandstandConflicts(
  bgtBuildings,
  config.grandstands,
  centreline,
  cumulative,
);
const grandstands = auditGrandstandTerrain(config.grandstands, centreline, cumulative, dtm);
const water = JSON.parse(await readFile(path.join(sourceDirectory, "bgt/waterdeel.geojson"), "utf8"));
const productionMetadata = JSON.parse(await readFile(
  path.join(projectRoot, "public/f1/tracks/3d/zandvoort-metadata.json"),
  "utf8",
));

console.log(JSON.stringify({
  productionQuality: {
    buildings: productionMetadata.layoutQuality?.buildings,
    grandstands: productionMetadata.layoutQuality?.grandstands,
    surfaceClearance: productionMetadata.layoutQuality?.surfaceClearance,
  },
  sourceRisks: {
    rawBuildingFootprints: {
      conflicts: buildingConflicts,
      grandstandConflicts: buildingGrandstandConflicts,
      grandstandConflictsBeforeProductionFiltering: buildingGrandstandConflicts.length,
      trackConflictsBeforeProductionFiltering: buildingConflicts.length,
    },
    rawGrandstandTerrain: grandstands,
    rawTrackSurfaceWithoutRenderedMeshCorrection: trackSurface,
    renderedTerrainCorrectedTrackSurface: correctedTrackSurface,
    water: {
      rawSourceFeatures: water.features.length,
      renderedOverlayFeatures: productionMetadata.layoutQuality?.surfaceClearance?.renderedWaterOverlayFeatures,
    },
  },
}, null, 2));
