export const DEFAULT_LOCATION = {
  name: "Louvigné-du-Désert",
  latitude: 48.47585833333334,
  longitude: -1.1030777777777777,
  timezone: "Europe/Paris"
};

export const DEFAULT_SETTINGS = {
  rainThresholdMm: 0.2,
  rainAlertMinutes: 30,
  minConfidence: 0.55,
  quietMinutes: 45,
  enableRainAlerts: true,
  enableNtfy: false,
  ntfyTopic: "",
  ntfyServer: "https://ntfy.sh",
  radarEnabled: true,
  rainViewerEnabled: true
};

export const HORIZONS_MINUTES = [30, 60, 120];

const ALERT_LABELS = {
  none: "Aucune alerte",
  low: "Risque faible",
  moderate: "Risque modéré",
  high: "Risque élevé"
};

export function mergeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    rainThresholdMm: toPositiveNumber(settings.rainThresholdMm, DEFAULT_SETTINGS.rainThresholdMm),
    rainAlertMinutes: toPositiveNumber(settings.rainAlertMinutes, DEFAULT_SETTINGS.rainAlertMinutes),
    minConfidence: clamp(toPositiveNumber(settings.minConfidence, DEFAULT_SETTINGS.minConfidence), 0, 1),
    quietMinutes: toPositiveNumber(settings.quietMinutes, DEFAULT_SETTINGS.quietMinutes)
  };
}

export function buildWeatherStatus({
  location = DEFAULT_LOCATION,
  settings = DEFAULT_SETTINGS,
  openMeteo,
  metNorway,
  meteoFranceRadar,
  rainViewer,
  errors = [],
  now = new Date()
}) {
  const safeSettings = mergeSettings(settings);
  const nowMs = now.getTime();
  const horizonResults = HORIZONS_MINUTES.map((minutes) => {
    return buildHorizonResult({
      minutes,
      settings: safeSettings,
      openMeteo,
      metNorway,
      meteoFranceRadar,
      nowMs
    });
  });

  const alertHorizon = horizonResults.find((item) => item.minutes === safeSettings.rainAlertMinutes) || horizonResults[0];
  const alertLevel = getAlertLevel(alertHorizon.score);
  const etaMinutes = estimateRainEtaMinutes(openMeteo, nowMs, safeSettings.rainThresholdMm);

  return {
    location,
    updatedAt: now.toISOString(),
    settings: safeSettings,
    current: buildCurrentConditions(openMeteo, metNorway),
    rain: {
      etaMinutes,
      alertLevel,
      alertLabel: ALERT_LABELS[alertLevel],
      shouldAlert: safeSettings.enableRainAlerts && ["moderate", "high"].includes(alertLevel),
      horizons: horizonResults
    },
    radar: {
      meteoFrance: meteoFranceRadar || null,
      rainViewer: rainViewer || null
    },
    sources: buildSourceSummaries(openMeteo, metNorway, meteoFranceRadar, rainViewer, errors),
    errors
  };
}

function buildHorizonResult({ minutes, settings, openMeteo, metNorway, meteoFranceRadar, nowMs }) {
  const arome = computeOpenMeteoScore(openMeteo, minutes, settings, nowMs);
  const met = computeMetNorwayScore(metNorway, minutes, settings, nowMs);
  const radar = computeRadarScore(meteoFranceRadar);

  const weighted = weightedAverage([
    { value: radar.score, weight: radar.available ? 0.45 : 0 },
    { value: arome.score, weight: arome.available ? 0.40 : 0 },
    { value: met.score, weight: met.available ? 0.15 : 0 }
  ]);

  const precipitationMm = Math.max(arome.precipitationMm || 0, met.precipitationMm || 0);

  return {
    minutes,
    score: round(weighted.value, 2),
    confidence: confidenceLabel(weighted.value, weighted.weight),
    alertLevel: getAlertLevel(weighted.value),
    precipitationMm: round(precipitationMm, 2),
    sources: {
      openMeteo: arome,
      metNorway: met,
      radar
    }
  };
}

function buildCurrentConditions(openMeteo, metNorway) {
  const current = openMeteo?.current || {};
  const metCurrent = metNorway?.timeseries?.[0]?.instant || {};

  return {
    temperatureC: pickNumber(current.temperature_2m, metCurrent.air_temperature),
    humidityPct: pickNumber(current.relative_humidity_2m, metCurrent.relative_humidity),
    windKmh: pickNumber(current.wind_speed_10m, metCurrent.wind_speed_kmh),
    gustKmh: pickNumber(current.wind_gusts_10m, metCurrent.wind_gusts_kmh),
    precipitationMm: pickNumber(current.precipitation, current.rain, 0),
    weatherCode: current.weather_code ?? null
  };
}

function buildSourceSummaries(openMeteo, metNorway, meteoFranceRadar, rainViewer, errors) {
  return [
    {
      id: "open-meteo-arome",
      label: "Open-Meteo AROME",
      ok: !!openMeteo?.ok,
      updatedAt: openMeteo?.fetchedAt || null
    },
    {
      id: "met-norway",
      label: "MET Norway",
      ok: !!metNorway?.ok,
      updatedAt: metNorway?.fetchedAt || null
    },
    {
      id: "meteofrance-radar",
      label: "Météo-France radar",
      ok: !!meteoFranceRadar?.ok,
      enabled: !!meteoFranceRadar?.enabled,
      updatedAt: meteoFranceRadar?.fetchedAt || null,
      message: meteoFranceRadar?.message || null
    },
    {
      id: "rainviewer",
      label: "RainViewer",
      ok: !!rainViewer?.ok,
      updatedAt: rainViewer?.fetchedAt || null,
      imageUrl: rainViewer?.imageUrl || null
    }
  ].map((source) => ({
    ...source,
    errors: errors.filter((error) => error.source === source.id).map((error) => error.message)
  }));
}

function computeOpenMeteoScore(openMeteo, minutes, settings, nowMs) {
  if (!openMeteo?.minutely15?.length && !openMeteo?.hourly?.length) {
    return emptyMetric();
  }

  const endMs = nowMs + minutes * 60_000;
  const minutelyRows = (openMeteo.minutely15 || []).filter((row) => isInFutureWindow(row.timeMs, nowMs, endMs));
  const hourlyRows = (openMeteo.hourly || []).filter((row) => isInFutureWindow(row.timeMs, nowMs, endMs));
  const rows = minutelyRows.length ? minutelyRows : hourlyRows;
  const precipitationMm = sum(rows.map((row) => row.precipitation ?? row.rain ?? 0));
  const probability = max(hourlyRows.map((row) => (row.precipitation_probability ?? 0) / 100));
  const precipitationScore = clamp(precipitationMm / Math.max(settings.rainThresholdMm * 3, 0.3), 0, 1);
  const score = clamp(precipitationScore * 0.65 + probability * 0.35, 0, 1);

  return {
    available: true,
    score: round(score, 2),
    precipitationMm: round(precipitationMm, 2),
    probability: round(probability, 2)
  };
}

function computeMetNorwayScore(metNorway, minutes, settings, nowMs) {
  if (!metNorway?.timeseries?.length) {
    return emptyMetric();
  }

  const endMs = nowMs + minutes * 60_000;
  const rows = metNorway.timeseries.filter((row) => isInFutureWindow(row.timeMs, nowMs, endMs));
  const precipitationMm = sum(rows.map((row) => row.next1h?.precipitation_amount ?? 0));
  const score = clamp(precipitationMm / Math.max(settings.rainThresholdMm * 3, 0.3), 0, 1);

  return {
    available: true,
    score: round(score, 2),
    precipitationMm: round(precipitationMm, 2),
    probability: null
  };
}

function computeRadarScore(meteoFranceRadar) {
  if (!meteoFranceRadar?.ok || typeof meteoFranceRadar.score !== "number") {
    return emptyMetric();
  }

  return {
    available: true,
    score: round(clamp(meteoFranceRadar.score, 0, 1), 2),
    precipitationMm: typeof meteoFranceRadar.precipitationMm === "number" ? round(meteoFranceRadar.precipitationMm, 2) : null,
    probability: typeof meteoFranceRadar.probability === "number" ? round(meteoFranceRadar.probability, 2) : null
  };
}

function estimateRainEtaMinutes(openMeteo, nowMs, thresholdMm) {
  const rows = openMeteo?.minutely15 || [];
  const firstRain = rows.find((row) => row.timeMs >= nowMs && (row.precipitation ?? row.rain ?? 0) >= thresholdMm);

  if (!firstRain) {
    return null;
  }

  return Math.max(0, Math.round((firstRain.timeMs - nowMs) / 60_000));
}

function getAlertLevel(score) {
  if (score >= 0.75) {
    return "high";
  }

  if (score >= 0.55) {
    return "moderate";
  }

  if (score >= 0.35) {
    return "low";
  }

  return "none";
}

function confidenceLabel(score, availableWeight) {
  if (availableWeight >= 0.8 && score >= 0.55) {
    return "forte";
  }

  if (availableWeight >= 0.4) {
    return "moyenne";
  }

  return "faible";
}

function weightedAverage(items) {
  const validItems = items.filter((item) => typeof item.value === "number" && item.weight > 0);
  const totalWeight = sum(validItems.map((item) => item.weight));

  if (!totalWeight) {
    return { value: 0, weight: 0 };
  }

  const value = sum(validItems.map((item) => item.value * item.weight)) / totalWeight;

  return { value, weight: totalWeight };
}

function emptyMetric() {
  return {
    available: false,
    score: 0,
    precipitationMm: null,
    probability: null
  };
}

function isInFutureWindow(timeMs, nowMs, endMs) {
  return typeof timeMs === "number" && timeMs >= nowMs - 5 * 60_000 && timeMs <= endMs;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function max(values) {
  return values.reduce((best, value) => Math.max(best, Number.isFinite(value) ? value : 0), 0);
}

function pickNumber(...values) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
