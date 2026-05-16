export const WEATHER_HISTORY_RECENT_KEY = "weather_history_recent";
export const WEATHER_HISTORY_SCHEMA_VERSION = 1;
export const DEFAULT_WEATHER_HISTORY_LIMIT = 72;
export const DEFAULT_WEATHER_HISTORY_MIN_INTERVAL_MINUTES = 10;

export function buildWeatherHistorySample(status = {}, now = new Date()) {
  const generatedAt = toIsoString(now) || new Date().toISOString();
  const updatedAt = toIsoString(status.updatedAt) || generatedAt;
  const primaryHorizon = pickPrimaryHorizon(status.rain?.horizons);

  return removeUndefined({
    version: WEATHER_HISTORY_SCHEMA_VERSION,
    type: "weather-history-sample",
    generatedAt,
    statusUpdatedAt: updatedAt,
    source: "weather-garden",
    confidence: pickString(primaryHorizon?.confidence, pickWgfConfidence(status)),
    freshness: buildFreshness(status.sources),
    observation: buildObservationSample(status),
    forecastImmediate: buildImmediateForecastSample(status, primaryHorizon),
    rainHorizons: buildRainHorizonSamples(status.rain?.horizons),
    radarSummary: buildRadarSummary(status.radar, status.sources),
    wgfSummary: buildWgfSummarySample(status.forecastComparison),
    sources: buildSourceSamples(status.sources),
    errors: buildErrorSamples(status.errors)
  });
}

export async function persistWeatherHistorySample({
  kv,
  status,
  now = new Date(),
  key = WEATHER_HISTORY_RECENT_KEY,
  limit = DEFAULT_WEATHER_HISTORY_LIMIT,
  minIntervalMinutes = DEFAULT_WEATHER_HISTORY_MIN_INTERVAL_MINUTES
} = {}) {
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return {
      ok: false,
      stored: false,
      reason: "kv-unavailable"
    };
  }

  const sample = buildWeatherHistorySample(status, now);
  const existing = await readRecentWeatherHistory(kv, key);
  const samples = existing.samples;
  const latest = samples[samples.length - 1] || null;

  if (latest && isWithinInterval(latest.generatedAt, sample.generatedAt, minIntervalMinutes)) {
    return {
      ok: true,
      stored: false,
      reason: "recent-sample-exists",
      key,
      count: samples.length,
      sample
    };
  }

  const nextSamples = [...samples, sample].slice(-safeLimit(limit));
  await kv.put(key, JSON.stringify({
    version: WEATHER_HISTORY_SCHEMA_VERSION,
    updatedAt: sample.generatedAt,
    samples: nextSamples
  }));

  return {
    ok: true,
    stored: true,
    reason: existing.corrupted ? "history-recovered" : "stored",
    key,
    count: nextSamples.length,
    sample
  };
}

async function readRecentWeatherHistory(kv, key) {
  try {
    const stored = await kv.get(key, "json");

    if (!stored) {
      return { samples: [], corrupted: false };
    }

    if (Array.isArray(stored)) {
      return { samples: normalizeSamples(stored), corrupted: false };
    }

    return { samples: normalizeSamples(stored.samples), corrupted: false };
  } catch (_error) {
    return { samples: [], corrupted: true };
  }
}

function normalizeSamples(samples) {
  return (Array.isArray(samples) ? samples : [])
    .filter((sample) => sample && typeof sample === "object" && sample.type === "weather-history-sample");
}

function buildObservationSample(status) {
  const station = status.stationObservation || status.observation?.station || null;
  const current = status.current || {};
  const stationCurrent = station?.current || {};
  const source = station && station.ok && !station.stale ? "ecowitt" : "forecast";

  return removeUndefined({
    source,
    updatedAt: station?.updatedAt || null,
    stale: station?.stale ?? null,
    freshnessMinutes: finiteOrNull(station?.freshnessMinutes ?? station?.ageMinutes),
    temperatureC: finiteOrNull(current.temperatureC ?? stationCurrent.temperatureC),
    humidityPct: finiteOrNull(current.humidityPct ?? stationCurrent.humidityPct),
    windKmh: finiteOrNull(current.windKmh ?? stationCurrent.windKmh),
    gustKmh: finiteOrNull(current.gustKmh ?? stationCurrent.gustKmh),
    pressureHpa: finiteOrNull(stationCurrent.pressureHpa),
    rainRateMmPerHour: finiteOrNull(stationCurrent.rainRateMmPerHour),
    dailyRainMm: finiteOrNull(stationCurrent.dailyRainMm),
    weatherCode: current.weatherCode ?? null
  });
}

function buildImmediateForecastSample(status, primaryHorizon) {
  const rain = status.rain || {};

  return removeUndefined({
    source: "weather-garden",
    activeNow: booleanOrNull(rain.activeNow),
    noSignificantRain: booleanOrNull(rain.noSignificantRain),
    etaMinutes: finiteOrNull(rain.etaMinutes),
    expectedDurationMinutes: finiteOrNull(rain.expectedDurationMinutes),
    intensityLevel: rain.intensityLevel || null,
    intensityMmPerHour: finiteOrNull(rain.intensityMmPerHour),
    alertLevel: rain.alertLevel || primaryHorizon?.alertLevel || null,
    score: finiteOrNull(primaryHorizon?.score),
    confidence: primaryHorizon?.confidence || null,
    precipitationMm: finiteOrNull(primaryHorizon?.precipitationMm)
  });
}

function buildRainHorizonSamples(horizons) {
  return (Array.isArray(horizons) ? horizons : []).map((horizon) => removeUndefined({
    minutes: finiteOrNull(horizon.minutes),
    score: finiteOrNull(horizon.score),
    confidence: horizon.confidence || null,
    alertLevel: horizon.alertLevel || null,
    precipitationMm: finiteOrNull(horizon.precipitationMm),
    intensityMmPerHour: finiteOrNull(horizon.intensityMmPerHour),
    intensityLevel: horizon.intensityLevel || null,
    sources: {
      openMeteo: buildRainSourceMetric(horizon.sources?.openMeteo),
      metNorway: buildRainSourceMetric(horizon.sources?.metNorway),
      radar: buildRainSourceMetric(horizon.sources?.radar)
    }
  }));
}

function buildRainSourceMetric(source) {
  return removeUndefined({
    available: booleanOrNull(source?.available),
    score: finiteOrNull(source?.score),
    precipitationMm: finiteOrNull(source?.precipitationMm),
    probability: finiteOrNull(source?.probability)
  });
}

function buildRadarSummary(radar, sources) {
  const meteoFrance = radar?.meteoFrance || null;
  const rainViewer = radar?.rainViewer || null;
  const meteoFranceSource = findSource(sources, "meteofrance-radar");
  const rainViewerSource = findSource(sources, "rainviewer");

  return removeUndefined({
    provider: meteoFrance?.provider || meteoFrance?.source || meteoFranceSource?.source || "meteofrance-radar",
    state: meteoFranceSource?.state || meteoFrance?.state || (meteoFrance?.ok ? "fresh" : "unavailable"),
    ok: booleanOrNull(meteoFrance?.ok),
    nativeLayerOk: booleanOrNull(meteoFrance?.nativeLayer?.ok),
    validityTime: meteoFrance?.validityTime || meteoFranceSource?.updatedAt || null,
    precipitationMm: finiteOrNull(meteoFrance?.precipitationMm),
    score: finiteOrNull(meteoFrance?.score),
    fallbackProvider: rainViewer?.ok ? "rainviewer" : null,
    fallbackReason: meteoFrance?.fallbackReason || meteoFrance?.nativeLayer?.reason || null,
    rainViewer: removeUndefined({
      ok: booleanOrNull(rainViewer?.ok),
      state: rainViewerSource?.state || rainViewer?.state || (rainViewer?.ok ? "fresh" : "unavailable"),
      updatedAt: rainViewer?.updatedAt || rainViewer?.time || rainViewerSource?.updatedAt || null
    })
  });
}

function buildWgfSummarySample(forecastComparison) {
  const horizons = (forecastComparison?.horizons || []).map((horizon) => {
    const wgf = horizon.sources?.wgf || {};

    return removeUndefined({
      key: horizon.key || null,
      label: horizon.label || null,
      minutes: finiteOrNull(horizon.minutes),
      available: booleanOrNull(wgf.available),
      state: wgf.state || null,
      confidence: wgf.confidence || null,
      precipitationMm: finiteOrNull(wgf.precipitationMm),
      temperatureC: finiteOrNull(wgf.temperatureC),
      windKmh: finiteOrNull(wgf.windKmh),
      gustKmh: finiteOrNull(wgf.gustKmh),
      summary: wgf.summary || null,
      reason: wgf.reason || null
    });
  });

  return removeUndefined({
    generatedAt: forecastComparison?.generatedAt || null,
    horizons
  });
}

function buildSourceSamples(sources) {
  return (Array.isArray(sources) ? sources : []).map((source) => removeUndefined({
    id: source.id || null,
    label: source.label || null,
    enabled: booleanOrNull(source.enabled),
    ok: booleanOrNull(source.ok),
    state: source.state || source.status || null,
    stale: booleanOrNull(source.stale),
    source: source.source || null,
    updatedAt: source.updatedAt || null,
    fetchedAt: source.fetchedAt || null,
    freshnessMinutes: finiteOrNull(source.freshnessMinutes),
    role: source.role || null,
    priority: finiteOrNull(source.priority),
    message: source.message || null,
    errors: buildErrorSamples(source.errors)
  }));
}

function buildErrorSamples(errors) {
  return (Array.isArray(errors) ? errors : [])
    .map((error) => {
      if (typeof error === "string") {
        return sanitizeText(error);
      }

      if (!error || typeof error !== "object") {
        return null;
      }

      return removeUndefined({
        source: sanitizeText(error.source),
        message: sanitizeText(error.message || error.error)
      });
    })
    .filter(Boolean);
}

function buildFreshness(sources) {
  const sourceSamples = buildSourceSamples(sources);

  return removeUndefined({
    state: getOverallFreshnessState(sourceSamples),
    sources: sourceSamples.map((source) => removeUndefined({
      id: source.id,
      state: source.state,
      freshnessMinutes: source.freshnessMinutes
    }))
  });
}

function getOverallFreshnessState(sources) {
  if (!sources.length) {
    return "unavailable";
  }

  if (sources.some((source) => source.state === "fresh")) {
    return "fresh";
  }

  if (sources.some((source) => source.state === "stale")) {
    return "stale";
  }

  return "unavailable";
}

function pickPrimaryHorizon(horizons) {
  if (!Array.isArray(horizons) || !horizons.length) {
    return null;
  }

  return horizons.find((horizon) => horizon.minutes === 30) || horizons[0];
}

function pickWgfConfidence(status) {
  const oneHour = status.forecastComparison?.horizons?.find((horizon) => horizon.key === "1h");
  return oneHour?.sources?.wgf?.confidence || null;
}

function findSource(sources, id) {
  return (Array.isArray(sources) ? sources : []).find((source) => source.id === id) || null;
}

function isWithinInterval(previousIso, nextIso, minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return false;
  }

  const previousMs = Date.parse(previousIso);
  const nextMs = Date.parse(nextIso);

  if (!Number.isFinite(previousMs) || !Number.isFinite(nextMs)) {
    return false;
  }

  return Math.abs(nextMs - previousMs) < minutes * 60_000;
}

function safeLimit(limit) {
  if (!Number.isFinite(limit) || limit < 1) {
    return DEFAULT_WEATHER_HISTORY_LIMIT;
  }

  return Math.floor(limit);
}

function pickString(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || null;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function toIsoString(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (typeof value === "string") {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }

  return null;
}

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .map(([key, child]) => [key, removeUndefined(child)]));
}

function sanitizeText(value) {
  if (!value) {
    return null;
  }

  return String(value)
    .replace(/apikey=[^&\s]+/gi, "apikey=<redacted>")
    .replace(/api_key=[^&\s]+/gi, "api_key=<redacted>")
    .replace(/application_key=[^&\s]+/gi, "application_key=<redacted>")
    .replace(/authorization:\s*bearer\s+[^\s]+/gi, "authorization: bearer <redacted>")
    .replace(/\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, "<redacted-mac>")
    .replace(/\b\d{15}\b/g, "<redacted-imei>");
}
