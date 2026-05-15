import {
  buildGeneratedGardenAlertsForEntities,
  dedupeGardenAlerts,
  normalizeGardenAlert
} from "./gardenAlerts.js";

export {
  GARDEN_ALERT_CATEGORIES,
  GARDEN_ALERT_LEVELS,
  DEFAULT_GARDEN_ALERT_SETTINGS
} from "./gardenAlerts.js";

export const GARDEN_ENTITY_TYPES = [
  "plant",
  "tree",
  "vine",
  "zone",
  "vegetable_bed",
  "greenhouse",
  "weather_station",
  "sensor",
  "compost",
  "water_tank",
  "other"
];

const GARDEN_GEOJSON_GEOMETRY_TYPES = ["Point", "LineString", "Polygon"];

export const DEFAULT_GARDEN_STATE = {
  version: 1,
  entities: [],
  alerts: []
};

export function createDefaultGardenState(now = new Date()) {
  return normalizeGardenState({
    updatedAt: now.toISOString(),
    entities: [
      {
        id: "vigne",
        type: "vine",
        name: "Vigne",
        tags: ["fruit", "surveillance"],
        notes: "Surveillance gel, vent, pluie forte et maladies cryptogamiques."
      },
      {
        id: "potager",
        type: "vegetable_bed",
        name: "Potager",
        tags: ["arrosage", "semis"],
        notes: "Zone principale pour les rappels d'arrosage, pluie forte et travaux du sol."
      },
      {
        id: "station-locale",
        type: "weather_station",
        name: "Station météo locale",
        tags: ["ecowitt", "meteo"],
        notes: "Observation locale utilisée pour comparer les modèles météo."
      }
    ],
    alerts: []
  }, now);
}

export function normalizeGardenState(value = {}, now = new Date()) {
  const source = isPlainObject(value) ? value : {};
  const entities = toArray(source.entities).map(normalizeGardenEntity).filter(Boolean);
  const alerts = toArray(source.alerts).map(normalizeGardenAlert).filter(Boolean);

  return {
    version: 1,
    updatedAt: toIsoDate(source.updatedAt) || now.toISOString(),
    entities,
    alerts
  };
}

export function normalizeGardenEntityPayload(value) {
  return normalizeGardenEntity(value);
}

export function upsertGardenEntity(gardenState, entity, now = new Date()) {
  const state = normalizeGardenState(gardenState, now);
  const normalized = normalizeGardenEntity(entity);

  if (!normalized) {
    throw new Error("Invalid garden entity.");
  }

  const index = state.entities.findIndex((item) => item.id === normalized.id);

  if (index >= 0) {
    state.entities[index] = normalized;
  } else {
    state.entities.push(normalized);
  }

  return normalizeGardenState({
    ...state,
    updatedAt: now.toISOString()
  }, now);
}

export function deleteGardenEntity(gardenState, id, now = new Date()) {
  const normalizedId = normalizeId(id);
  const state = normalizeGardenState(gardenState, now);

  if (!normalizedId) {
    throw new Error("Invalid garden entity id.");
  }

  return normalizeGardenState({
    ...state,
    updatedAt: now.toISOString(),
    entities: state.entities.filter((entity) => entity.id !== normalizedId),
    alerts: state.alerts.filter((alert) => alert.entityId !== normalizedId)
  }, now);
}

export function buildGardenStatus(gardenState = DEFAULT_GARDEN_STATE, weatherStatus = null, settings = {}, now = new Date()) {
  const state = normalizeGardenState(gardenState, now);
  const storedAlerts = state.alerts.filter((alert) => alert.active !== false);
  const generatedAlerts = buildGeneratedGardenAlerts(state, weatherStatus, settings, now);
  const activeAlerts = dedupeGardenAlerts([...generatedAlerts, ...storedAlerts]);

  return {
    version: state.version,
    updatedAt: state.updatedAt,
    summary: {
      entityCount: state.entities.length,
      activeAlertCount: activeAlerts.length,
      generatedAlertCount: generatedAlerts.length,
      entityTypes: countBy(state.entities, "type"),
      alertLevels: countBy(activeAlerts, "level")
    },
    entities: state.entities,
    alerts: {
      active: activeAlerts,
      generated: generatedAlerts,
      stored: state.alerts,
      all: dedupeGardenAlerts([...generatedAlerts, ...state.alerts])
    }
  };
}

export function buildGeneratedGardenAlerts(gardenState, weatherStatus = null, settings = {}, now = new Date()) {
  const state = normalizeGardenState(gardenState, now);
  const entities = state.entities.length ? state.entities : createDefaultGardenState(now).entities;

  return buildGeneratedGardenAlertsForEntities(entities, weatherStatus, settings, now);
}

function normalizeGardenEntity(entity) {
  if (!isPlainObject(entity)) {
    return null;
  }

  const id = normalizeId(entity.id || entity.name);

  if (!id) {
    return null;
  }

  const type = GARDEN_ENTITY_TYPES.includes(entity.type) ? entity.type : "other";

  return {
    id,
    type,
    name: normalizeText(entity.name) || id,
    position: normalizePosition(entity.position),
    tags: normalizeTextList(entity.tags),
    notes: normalizeText(entity.notes),
    photos: toArray(entity.photos).filter(isPlainObject),
    metadata: normalizeObject(entity.metadata),
    state: normalizeObject(entity.state),
    rules: toArray(entity.rules).filter(isPlainObject)
  };
}

function normalizePosition(position) {
  if (!isPlainObject(position)) {
    return null;
  }

  const latitude = normalizeLatitude(position.latitude);
  const longitude = normalizeLongitude(position.longitude);
  const normalized = {
    label: normalizeText(position.label),
    latitude,
    longitude,
    geometry: normalizeGeoJsonGeometry(position.geometry)
  };

  return Object.values(normalized).some((value) => value !== null && value !== "" && !(isPlainObject(value) && !Object.keys(value).length))
    ? normalized
    : null;
}

function normalizeTextList(value) {
  const seen = new Set();
  if (typeof value === "string") {
    return dedupeTextList(value.split(","));
  }

  return dedupeTextList(toArray(value));

  function dedupeTextList(items) {
    return items.map(normalizeText).filter((item) => {
      if (!item || seen.has(item)) {
        return false;
      }

      seen.add(item);
      return true;
    });
  }
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || null;
}

function normalizeObject(value) {
  return isPlainObject(value) ? value : {};
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLatitude(value) {
  const number = toFiniteNumber(value);
  return number !== null && number >= -90 && number <= 90 ? number : null;
}

function normalizeLongitude(value) {
  const number = toFiniteNumber(value);
  return number !== null && number >= -180 && number <= 180 ? number : null;
}

function normalizeGeoJsonGeometry(geometry) {
  if (!isPlainObject(geometry) || !GARDEN_GEOJSON_GEOMETRY_TYPES.includes(geometry.type)) {
    return {};
  }

  if (geometry.type === "Point") {
    const coordinates = normalizeCoordinatePair(geometry.coordinates);
    return coordinates ? { type: geometry.type, coordinates } : {};
  }

  if (geometry.type === "LineString") {
    const coordinates = toArray(geometry.coordinates).map(normalizeCoordinatePair).filter(Boolean);
    return coordinates.length >= 2 ? { type: geometry.type, coordinates } : {};
  }

  const coordinates = toArray(geometry.coordinates).map(normalizeLinearRing).filter(Boolean);
  return coordinates.length ? { type: geometry.type, coordinates } : {};
}

function normalizeLinearRing(value) {
  const ring = toArray(value).map(normalizeCoordinatePair).filter(Boolean);

  if (ring.length < 4 || !sameCoordinatePair(ring[0], ring[ring.length - 1])) {
    return null;
  }

  return ring;
}

function normalizeCoordinatePair(value) {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const longitude = normalizeLongitude(value[0]);
  const latitude = normalizeLatitude(value[1]);
  return longitude === null || latitude === null ? null : [longitude, latitude];
}

function sameCoordinatePair(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left[0] === right[0] && left[1] === right[1];
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}
