export const GEOFENCE_STATUSES = ["inside", "near", "outside", "uncertain"];
export const GEOFENCE_TRANSITIONS = ["none", "entry", "exit"];

const EARTH_RADIUS_M = 6371008.8;
const DEFAULT_NEAR_DISTANCE_M = 25;
const DEFAULT_MAX_ACCURACY_M = 100;
const DEFAULT_POINT_INSIDE_DISTANCE_M = 2;
const DEFAULT_LINE_INSIDE_DISTANCE_M = 2;

export function evaluateGardenGeofencing(gardenState, location, options = {}) {
  const entities = Array.isArray(gardenState?.entities) ? gardenState.entities : [];
  const results = entities.map((entity) => evaluateGardenEntityGeofence(entity, location, options));

  return {
    location: normalizeLocation(location),
    summary: {
      inside: results.filter((result) => result.status === "inside").length,
      near: results.filter((result) => result.status === "near").length,
      outside: results.filter((result) => result.status === "outside").length,
      uncertain: results.filter((result) => result.status === "uncertain").length
    },
    results
  };
}

export function evaluateGardenEntityGeofence(entity, location, options = {}) {
  const normalizedLocation = normalizeLocation(location);
  const config = normalizeOptions(options);
  const base = {
    entityId: typeof entity?.id === "string" ? entity.id : null,
    status: "uncertain",
    transition: "none",
    distanceM: null,
    accuracyM: normalizedLocation.accuracyM,
    geometryType: null,
    reason: null
  };

  if (!normalizedLocation.valid) {
    return { ...base, reason: "invalid_location" };
  }

  const geometry = getEntityGeometry(entity);
  if (!geometry) {
    return { ...base, reason: "missing_geometry" };
  }

  const distance = getDistanceToGeometry(normalizedLocation, geometry);
  const geometryType = geometry.type;
  const withDistance = {
    ...base,
    distanceM: distance === null ? null : roundDistance(distance),
    geometryType
  };

  if (distance === null) {
    return { ...withDistance, reason: "invalid_geometry" };
  }

  if (normalizedLocation.accuracyM > config.maxAccuracyM) {
    return { ...withDistance, reason: "low_accuracy" };
  }

  if (geometryType === "Polygon") {
    return classifyPolygon(normalizedLocation, geometry, distance, config, withDistance);
  }

  return classifyLinearGeometry(normalizedLocation, geometryType, distance, config, withDistance);
}

export function getDistanceToGardenEntity(location, entity) {
  const normalizedLocation = normalizeLocation(location);
  const geometry = getEntityGeometry(entity);

  if (!normalizedLocation.valid || !geometry) {
    return null;
  }

  const distance = getDistanceToGeometry(normalizedLocation, geometry);
  return distance === null ? null : roundDistance(distance);
}

export function detectGeofenceTransition(previousStatus, nextStatus) {
  const previous = normalizeStatus(previousStatus);
  const next = normalizeStatus(nextStatus);

  if (previous !== "inside" && next === "inside") {
    return "entry";
  }

  if (previous === "inside" && next !== "inside") {
    return "exit";
  }

  return "none";
}

function classifyPolygon(location, geometry, distance, config, base) {
  const inside = isPointInPolygon(location, geometry.coordinates);

  if (inside) {
    if (distance <= location.accuracyM) {
      return { ...base, status: "uncertain", reason: "boundary_within_gps_tolerance" };
    }

    return { ...base, status: "inside", reason: "inside_polygon" };
  }

  if (distance <= location.accuracyM) {
    return { ...base, status: "uncertain", reason: "boundary_within_gps_tolerance" };
  }

  if (distance - location.accuracyM <= config.nearDistanceM) {
    return { ...base, status: "near", reason: "near_polygon" };
  }

  return { ...base, status: "outside", reason: "outside_polygon" };
}

function classifyLinearGeometry(location, geometryType, distance, config, base) {
  const insideDistanceM = geometryType === "Point" ? config.pointInsideDistanceM : config.lineInsideDistanceM;

  if (distance <= Math.max(location.accuracyM, insideDistanceM)) {
    return { ...base, status: "inside", reason: `inside_${geometryType.toLowerCase()}` };
  }

  if (distance - location.accuracyM <= config.nearDistanceM) {
    return { ...base, status: "near", reason: `near_${geometryType.toLowerCase()}` };
  }

  return { ...base, status: "outside", reason: `outside_${geometryType.toLowerCase()}` };
}

function getEntityGeometry(entity) {
  const geometry = entity?.position?.geometry;

  if (isSupportedGeometry(geometry)) {
    return geometry;
  }

  const latitude = toLatitude(entity?.position?.latitude);
  const longitude = toLongitude(entity?.position?.longitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    type: "Point",
    coordinates: [longitude, latitude]
  };
}

function getDistanceToGeometry(location, geometry) {
  if (geometry.type === "Point") {
    return distanceBetween(location, coordinateToLocation(geometry.coordinates));
  }

  if (geometry.type === "LineString") {
    return distanceToLineString(location, geometry.coordinates);
  }

  if (geometry.type === "Polygon") {
    return distanceToPolygon(location, geometry.coordinates);
  }

  return null;
}

function distanceToPolygon(location, rings) {
  const distances = rings.map((ring) => distanceToLineString(location, ring)).filter((distance) => distance !== null);
  return distances.length ? Math.min(...distances) : null;
}

function distanceToLineString(location, coordinates) {
  const points = coordinates.map(coordinateToLocation).filter(Boolean);

  if (points.length < 2) {
    return null;
  }

  let distance = Infinity;

  for (let index = 1; index < points.length; index += 1) {
    distance = Math.min(distance, distanceToSegment(location, points[index - 1], points[index]));
  }

  return Number.isFinite(distance) ? distance : null;
}

function distanceToSegment(location, start, end) {
  const originLatitudeRad = toRadians(location.latitude);
  const metersPerDegreeLatitude = Math.PI * EARTH_RADIUS_M / 180;
  const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos(originLatitudeRad);
  const point = projectToMeters(location, location, metersPerDegreeLatitude, metersPerDegreeLongitude);
  const a = projectToMeters(start, location, metersPerDegreeLatitude, metersPerDegreeLongitude);
  const b = projectToMeters(end, location, metersPerDegreeLatitude, metersPerDegreeLongitude);
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const apX = point.x - a.x;
  const apY = point.y - a.y;
  const lengthSquared = abX * abX + abY * abY;

  if (lengthSquared === 0) {
    return distanceBetween(location, start);
  }

  const t = Math.max(0, Math.min(1, (apX * abX + apY * abY) / lengthSquared));
  const closest = {
    x: a.x + t * abX,
    y: a.y + t * abY
  };

  return Math.hypot(point.x - closest.x, point.y - closest.y);
}

function projectToMeters(point, origin, metersPerDegreeLatitude, metersPerDegreeLongitude) {
  return {
    x: (point.longitude - origin.longitude) * metersPerDegreeLongitude,
    y: (point.latitude - origin.latitude) * metersPerDegreeLatitude
  };
}

function distanceBetween(left, right) {
  if (!left || !right) {
    return null;
  }

  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const deltaLat = toRadians(right.latitude - left.latitude);
  const deltaLon = toRadians(right.longitude - left.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isPointInPolygon(location, rings) {
  const outerRing = rings[0];

  if (!isPointInRing(location, outerRing)) {
    return false;
  }

  return !rings.slice(1).some((ring) => isPointInRing(location, ring));
}

function isPointInRing(location, ring) {
  let inside = false;

  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const currentPoint = coordinateToLocation(ring[current]);
    const previousPoint = coordinateToLocation(ring[previous]);

    if (!currentPoint || !previousPoint) {
      return false;
    }

    const intersects = currentPoint.latitude > location.latitude !== previousPoint.latitude > location.latitude
      && location.longitude < ((previousPoint.longitude - currentPoint.longitude) * (location.latitude - currentPoint.latitude)) / (previousPoint.latitude - currentPoint.latitude) + currentPoint.longitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isSupportedGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") {
    return false;
  }

  if (geometry.type === "Point") {
    return !!coordinateToLocation(geometry.coordinates);
  }

  if (geometry.type === "LineString") {
    return Array.isArray(geometry.coordinates) && geometry.coordinates.map(coordinateToLocation).filter(Boolean).length >= 2;
  }

  if (geometry.type === "Polygon") {
    return Array.isArray(geometry.coordinates) && geometry.coordinates.some((ring) => Array.isArray(ring) && ring.map(coordinateToLocation).filter(Boolean).length >= 4);
  }

  return false;
}

function coordinateToLocation(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) {
    return null;
  }

  const longitude = toLongitude(coordinate[0]);
  const latitude = toLatitude(coordinate[1]);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}

function normalizeLocation(location) {
  const latitude = toLatitude(location?.latitude);
  const longitude = toLongitude(location?.longitude);
  const accuracyM = toNonNegativeNumber(location?.accuracyM ?? location?.accuracy ?? 0) ?? 0;

  return {
    latitude,
    longitude,
    accuracyM,
    valid: latitude !== null && longitude !== null
  };
}

function normalizeOptions(options) {
  return {
    nearDistanceM: toNonNegativeNumber(options.nearDistanceM) ?? DEFAULT_NEAR_DISTANCE_M,
    maxAccuracyM: toNonNegativeNumber(options.maxAccuracyM) ?? DEFAULT_MAX_ACCURACY_M,
    pointInsideDistanceM: toNonNegativeNumber(options.pointInsideDistanceM) ?? DEFAULT_POINT_INSIDE_DISTANCE_M,
    lineInsideDistanceM: toNonNegativeNumber(options.lineInsideDistanceM) ?? DEFAULT_LINE_INSIDE_DISTANCE_M
  };
}

function normalizeStatus(value) {
  if (typeof value === "string" && GEOFENCE_STATUSES.includes(value)) {
    return value;
  }

  if (typeof value?.status === "string" && GEOFENCE_STATUSES.includes(value.status)) {
    return value.status;
  }

  return "uncertain";
}

function toLatitude(value) {
  const number = toFiniteNumber(value);
  return number !== null && number >= -90 && number <= 90 ? number : null;
}

function toLongitude(value) {
  const number = toFiniteNumber(value);
  return number !== null && number >= -180 && number <= 180 ? number : null;
}

function toNonNegativeNumber(value) {
  const number = toFiniteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function roundDistance(distance) {
  return Math.round(distance * 100) / 100;
}
