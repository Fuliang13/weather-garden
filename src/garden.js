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

export const GARDEN_ALERT_CATEGORIES = [
  "weather",
  "frost",
  "wind",
  "rain",
  "drought",
  "watering",
  "treatment",
  "disease",
  "task",
  "observation"
];

export const GARDEN_ALERT_LEVELS = ["info", "watch", "risk", "urgent"];

export const DEFAULT_GARDEN_STATE = {
  version: 1,
  entities: [],
  alerts: []
};

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

export function buildGardenStatus(gardenState = DEFAULT_GARDEN_STATE) {
  const state = normalizeGardenState(gardenState);
  const activeAlerts = state.alerts.filter((alert) => alert.active !== false);

  return {
    version: state.version,
    updatedAt: state.updatedAt,
    summary: {
      entityCount: state.entities.length,
      activeAlertCount: activeAlerts.length,
      entityTypes: countBy(state.entities, "type"),
      alertLevels: countBy(activeAlerts, "level")
    },
    entities: state.entities,
    alerts: {
      active: activeAlerts,
      all: state.alerts
    }
  };
}

function normalizeGardenEntity(entity) {
  if (!isPlainObject(entity)) {
    return null;
  }

  const id = normalizeId(entity.id);

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

function normalizeGardenAlert(alert) {
  if (!isPlainObject(alert)) {
    return null;
  }

  const id = normalizeId(alert.id);

  if (!id) {
    return null;
  }

  const category = GARDEN_ALERT_CATEGORIES.includes(alert.category) ? alert.category : "observation";
  const level = GARDEN_ALERT_LEVELS.includes(alert.level) ? alert.level : "info";

  return {
    id,
    category,
    type: normalizeId(alert.type) || category,
    level,
    entityId: normalizeId(alert.entityId),
    headline: normalizeText(alert.headline),
    details: normalizeTextList(alert.details),
    active: alert.active !== false,
    createdAt: toIsoDate(alert.createdAt),
    updatedAt: toIsoDate(alert.updatedAt),
    metadata: normalizeObject(alert.metadata)
  };
}

function normalizePosition(position) {
  if (!isPlainObject(position)) {
    return null;
  }

  const latitude = toFiniteNumber(position.latitude);
  const longitude = toFiniteNumber(position.longitude);
  const normalized = {
    label: normalizeText(position.label),
    latitude,
    longitude,
    geometry: normalizeObject(position.geometry)
  };

  return Object.values(normalized).some((value) => value !== null && value !== "" && !(isPlainObject(value) && !Object.keys(value).length))
    ? normalized
    : null;
}

function normalizeTextList(value) {
  return toArray(value).map(normalizeText).filter(Boolean);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || null;
}

function normalizeObject(value) {
  return isPlainObject(value) ? value : {};
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
