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

export const DEFAULT_GARDEN_ALERT_SETTINGS = {
  frostRiskTempC: 1,
  frostWatchTempC: 4,
  windGustWatchKmh: 50,
  windGustRiskKmh: 70,
  heavyRain2hMm: 8,
  diseaseRain2hMm: 2,
  diseaseHumidityPct: 80,
  dryWindowWateringMinutes: 24 * 60,
  treatmentDryWindowMinutes: 6 * 60,
  treatmentMaxWindKmh: 20
};

export function buildGeneratedGardenAlertsForEntities(entities = [], weatherStatus = null, settings = {}, now = new Date()) {
  const alertSettings = {
    ...DEFAULT_GARDEN_ALERT_SETTINGS,
    ...pickGardenSettings(settings)
  };
  const current = weatherStatus?.current || {};
  const station = weatherStatus?.stationObservation?.current || weatherStatus?.observation?.station?.current || {};
  const rain = weatherStatus?.rain || {};
  const twoHourRain = getHorizonRain(rain, 120);
  const activeRain = !!rain.activeNow;
  const noRainWindowMinutes = Number.isFinite(rain.noRainWindowMinutes) ? rain.noRainWindowMinutes : null;
  const temperatureC = firstFinite(station.temperatureC, current.temperatureC);
  const humidityPct = firstFinite(station.humidityPct, current.humidityPct);
  const gustKmh = firstFinite(station.gustKmh, current.gustKmh);
  const windKmh = firstFinite(station.windKmh, current.windKmh);
  const alerts = [];

  for (const entity of entities) {
    const sensitive = ["plant", "vine", "vegetable_bed", "greenhouse"].includes(entity.type);

    if (sensitive && Number.isFinite(temperatureC) && temperatureC <= alertSettings.frostWatchTempC) {
      alerts.push(createAlert({
        id: `${entity.id}-frost-${temperatureC <= alertSettings.frostRiskTempC ? "risk" : "watch"}`,
        category: "frost",
        type: "frost-watch",
        level: temperatureC <= alertSettings.frostRiskTempC ? "risk" : "watch",
        entityId: entity.id,
        headline: temperatureC <= alertSettings.frostRiskTempC ? "Risque de gel" : "Surveillance gel",
        details: [
          `Température observée ou prévue : ${formatNumber(temperatureC)} °C.`,
          entity.type === "vine" ? "Surveille les jeunes pousses de vigne et les zones exposées." : "Protège les jeunes plants sensibles si la nuit reste froide."
        ],
        now
      }));
    }

    if (Number.isFinite(gustKmh) && gustKmh >= alertSettings.windGustWatchKmh) {
      alerts.push(createAlert({
        id: `${entity.id}-wind-${gustKmh >= alertSettings.windGustRiskKmh ? "risk" : "watch"}`,
        category: "wind",
        type: "strong-wind",
        level: gustKmh >= alertSettings.windGustRiskKmh ? "risk" : "watch",
        entityId: entity.id,
        headline: gustKmh >= alertSettings.windGustRiskKmh ? "Vent fort à risque" : "Vent à surveiller",
        details: [
          `Rafales observées ou prévues : ${formatNumber(gustKmh)} km/h.`,
          entity.type === "vine" ? "Vérifie le palissage et les rameaux chargés." : "Sécurise les pots, protections et jeunes plantations."
        ],
        now
      }));
    }

    if (twoHourRain >= alertSettings.heavyRain2hMm && ["vine", "plant", "vegetable_bed", "zone", "greenhouse"].includes(entity.type)) {
      alerts.push(createAlert({
        id: `${entity.id}-heavy-rain`,
        category: "rain",
        type: "heavy-rain",
        level: "risk",
        entityId: entity.id,
        headline: "Pluie forte à surveiller",
        details: [
          `Cumul possible sur 2 h : ${formatNumber(twoHourRain)} mm.`,
          "Évite les semis fins, les repiquages fragiles et le travail du sol."
        ],
        now
      }));
    }

    if (entity.type === "vine" && isVineDiseaseWindow({ activeRain, twoHourRain, humidityPct, temperatureC, settings: alertSettings })) {
      alerts.push(createAlert({
        id: `${entity.id}-vine-disease-watch`,
        category: "disease",
        type: "vine-disease-watch",
        level: "watch",
        entityId: entity.id,
        headline: "Surveillance mildiou/oïdium",
        details: [
          `Humidité : ${formatNumber(humidityPct)} % · pluie sur 2 h : ${formatNumber(twoHourRain)} mm.`,
          "Après l'épisode humide, inspecte les feuilles et grappes dès que possible.",
          "Ne traite pas pendant la pluie ou par vent significatif."
        ],
        now
      }));
    }

    if (["plant", "tree", "vine", "vegetable_bed", "greenhouse"].includes(entity.type) && shouldSuggestWatering({ rain, noRainWindowMinutes, temperatureC, humidityPct, settings: alertSettings })) {
      alerts.push(createAlert({
        id: `${entity.id}-watering-watch`,
        category: "watering",
        type: "watering-watch",
        level: entity.type === "vegetable_bed" ? "watch" : "info",
        entityId: entity.id,
        headline: "Arrosage à vérifier",
        details: [
          noRainWindowMinutes ? `Pas de pluie significative prévue pendant ${formatDuration(noRainWindowMinutes)}.` : "Pas de pluie significative détectée dans les données disponibles.",
          Number.isFinite(temperatureC) ? `Température : ${formatNumber(temperatureC)} °C.` : "Vérifie l'humidité du sol avant d'arroser."
        ],
        now
      }));
    }

    if (canSuggestTreatmentWindow({ rain, noRainWindowMinutes, windKmh, settings: alertSettings }) && ["vine", "plant", "vegetable_bed", "tree"].includes(entity.type)) {
      alerts.push(createAlert({
        id: `${entity.id}-treatment-window`,
        category: "treatment",
        type: "treatment-window",
        level: "info",
        entityId: entity.id,
        headline: "Fenêtre d'intervention possible",
        details: [
          `Temps sec estimé : ${formatDuration(noRainWindowMinutes)}.`,
          Number.isFinite(windKmh) ? `Vent moyen : ${formatNumber(windKmh)} km/h.` : "Vent moyen non disponible.",
          "À confirmer sur place avant taille, traitement ou repiquage."
        ],
        now
      }));
    }
  }

  return dedupeGardenAlerts(alerts).sort(compareAlertPriority);
}

export function normalizeGardenAlert(alert) {
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
    generated: !!alert.generated,
    metadata: normalizeObject(alert.metadata)
  };
}

export function dedupeGardenAlerts(alerts) {
  const seen = new Set();
  return alerts.filter((alert) => {
    if (!alert || seen.has(alert.id)) {
      return false;
    }

    seen.add(alert.id);
    return true;
  });
}

function createAlert({ id, category, type, level, entityId, headline, details, now }) {
  const isoDate = now.toISOString();

  return normalizeGardenAlert({
    id,
    category,
    type,
    level,
    entityId,
    headline,
    details,
    active: true,
    generated: true,
    createdAt: isoDate,
    updatedAt: isoDate
  });
}

function isVineDiseaseWindow({ activeRain, twoHourRain, humidityPct, temperatureC, settings }) {
  const humid = Number.isFinite(humidityPct) && humidityPct >= settings.diseaseHumidityPct;
  const mildTemperature = Number.isFinite(temperatureC) && temperatureC >= 10 && temperatureC <= 28;
  const wet = activeRain || twoHourRain >= settings.diseaseRain2hMm;
  return wet && humid && mildTemperature;
}

function shouldSuggestWatering({ rain, noRainWindowMinutes, temperatureC, humidityPct, settings }) {
  if (rain.activeNow || (rain.horizons || []).some((item) => (item.precipitationMm || 0) >= 1)) {
    return false;
  }

  if (!Number.isFinite(noRainWindowMinutes) || noRainWindowMinutes < settings.dryWindowWateringMinutes) {
    return false;
  }

  return !Number.isFinite(temperatureC) || temperatureC >= 20 || (Number.isFinite(humidityPct) && humidityPct <= 55);
}

function canSuggestTreatmentWindow({ rain, noRainWindowMinutes, windKmh, settings }) {
  if (rain.activeNow || !Number.isFinite(noRainWindowMinutes) || noRainWindowMinutes < settings.treatmentDryWindowMinutes) {
    return false;
  }

  return !Number.isFinite(windKmh) || windKmh <= settings.treatmentMaxWindKmh;
}

function pickGardenSettings(settings) {
  return Object.fromEntries(Object.keys(DEFAULT_GARDEN_ALERT_SETTINGS)
    .map((key) => [key, toFiniteNumber(settings[key])])
    .filter(([, value]) => Number.isFinite(value)));
}

function getHorizonRain(rain, minutes) {
  return toFiniteNumber((rain.horizons || []).find((item) => item.minutes === minutes)?.precipitationMm) || 0;
}

function firstFinite(...values) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

function normalizeTextList(value) {
  if (typeof value === "string") {
    return value.split(",").map(normalizeText).filter(Boolean);
  }

  return toArray(value).map(normalizeText).filter(Boolean);
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

function toIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function compareAlertPriority(a, b) {
  const levels = { urgent: 0, risk: 1, watch: 2, info: 3 };
  return (levels[a.level] ?? 9) - (levels[b.level] ?? 9) || String(a.headline).localeCompare(String(b.headline));
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return String(Math.round(value * 10) / 10);
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) {
    return "—";
  }

  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    const remainingHours = Math.floor((minutes % 1440) / 60);
    const dayText = `${days} jour${days > 1 ? "s" : ""}`;
    return remainingHours ? `${dayText} ${remainingHours} h` : dayText;
  }

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
  }

  return `${minutes} min`;
}
