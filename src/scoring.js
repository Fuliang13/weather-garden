import { buildWgrSynthesis } from "./radarSynthesis.js";

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
  rainViewerEnabled: true,
  enableGardenAlerts: true,
  frostRiskTempC: 1,
  frostWatchTempC: 4,
  windGustWatchKmh: 50,
  windGustRiskKmh: 70,
  heavyRain2hMm: 8,
  diseaseRain2hMm: 2,
  diseaseHumidityPct: 80,
  unitSystem: "metric"
};

export const HORIZONS_MINUTES = [30, 60, 120, 360, 720, 1440, 2880];

const FORECAST_COMPARISON_HORIZONS = [
  { key: "minutecast", label: "0-2 h", minutes: 120 },
  { key: "1h", label: "1 h", minutes: 60 },
  { key: "2h", label: "2 h", minutes: 120 },
  { key: "4h", label: "4 h", minutes: 240 },
  { key: "8h", label: "8 h", minutes: 480 },
  { key: "1d", label: "1 j", minutes: 1440 },
  { key: "2d", label: "2 j", minutes: 2880 }
];

const ALERT_LABELS = {
  none: "Aucune alerte",
  low: "Risque faible",
  moderate: "Risque modéré",
  high: "Risque élevé"
};

const INTENSITY_LABELS = {
  none: "Pas de pluie",
  light: "Pluie faible",
  moderate: "Pluie modérée",
  heavy: "Pluie forte",
  extreme: "Averse intense"
};

export function mergeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    rainThresholdMm: toPositiveNumber(settings.rainThresholdMm, DEFAULT_SETTINGS.rainThresholdMm),
    rainAlertMinutes: toPositiveNumber(settings.rainAlertMinutes, DEFAULT_SETTINGS.rainAlertMinutes),
    minConfidence: clamp(toPositiveNumber(settings.minConfidence, DEFAULT_SETTINGS.minConfidence), 0, 1),
    quietMinutes: toPositiveNumber(settings.quietMinutes, DEFAULT_SETTINGS.quietMinutes),
    enableGardenAlerts: settings.enableGardenAlerts !== false,
    frostRiskTempC: toFiniteNumber(settings.frostRiskTempC, DEFAULT_SETTINGS.frostRiskTempC),
    frostWatchTempC: toFiniteNumber(settings.frostWatchTempC, DEFAULT_SETTINGS.frostWatchTempC),
    windGustWatchKmh: toPositiveNumber(settings.windGustWatchKmh, DEFAULT_SETTINGS.windGustWatchKmh),
    windGustRiskKmh: toPositiveNumber(settings.windGustRiskKmh, DEFAULT_SETTINGS.windGustRiskKmh),
    heavyRain2hMm: toPositiveNumber(settings.heavyRain2hMm, DEFAULT_SETTINGS.heavyRain2hMm),
    diseaseRain2hMm: toPositiveNumber(settings.diseaseRain2hMm, DEFAULT_SETTINGS.diseaseRain2hMm),
    diseaseHumidityPct: toPositiveNumber(settings.diseaseHumidityPct, DEFAULT_SETTINGS.diseaseHumidityPct),
    unitSystem: normalizeUnitSystem(settings.unitSystem)
  };
}

export function buildWeatherStatus({
  location = DEFAULT_LOCATION,
  settings = DEFAULT_SETTINGS,
  openMeteo,
  metNorway,
  meteoFranceRadar,
  rainViewer,
  ecowittObservation,
  garden,
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
  const current = buildCurrentConditions(openMeteo, metNorway, ecowittObservation);
  const rainSignal = buildRainSignal({
    current,
    openMeteo,
    alertHorizon,
    horizonResults,
    settings: safeSettings,
    ecowittObservation,
    nowMs
  });
  const rainGardenAdvice = buildGardenAdvice({
    current,
    rainSignal,
    alertHorizon,
    horizonResults,
    settings: safeSettings
  });
  const rainStatus = {
    etaMinutes: rainSignal.etaMinutes,
    activeNow: rainSignal.activeNow,
    noSignificantRain: rainSignal.noSignificantRain,
    noRainWindowMinutes: rainSignal.noRainWindowMinutes,
    intensityLevel: rainSignal.intensityLevel,
    intensityLabel: rainSignal.intensityLabel,
    intensityMmPerHour: rainSignal.intensityMmPerHour,
    expectedDurationMinutes: rainSignal.expectedDurationMinutes,
    observation: rainSignal.observation,
    presentationLevel: rainSignal.activeNow ? rainSignal.intensityLevel : alertLevel,
    alertLevel,
    alertLabel: ALERT_LABELS[alertLevel],
    riskLabel: ALERT_LABELS[alertLevel],
    headline: buildRainHeadline(rainSignal, alertLevel),
    detail: buildRainDetail(rainSignal, alertHorizon, safeSettings),
    shouldAlert: shouldSendRainAlert(safeSettings, rainSignal, alertLevel, alertHorizon),
    horizons: horizonResults,
    garden: rainGardenAdvice
  };
  const wgr = buildWgrSynthesis({
    meteoFranceRadar,
    rainViewer,
    openMeteo,
    metNorway,
    ecowittObservation,
    garden,
    rain: rainStatus,
    now
  });

  return {
    location,
    updatedAt: now.toISOString(),
    settings: safeSettings,
    current,
    stationObservation: ecowittObservation?.ok && !ecowittObservation.stale ? ecowittObservation : null,
    observation: {
      station: ecowittObservation?.ok ? ecowittObservation : null
    },
    garden: garden || null,
    rain: rainStatus,
    radar: {
      meteoFrance: meteoFranceRadar || null,
      rainViewer: rainViewer || null
    },
    wgr,
    forecastComparison: buildForecastComparison({
      openMeteo,
      metNorway,
      meteoFranceRadar,
      ecowittObservation,
      settings: safeSettings,
      now
    }),
    sources: buildSourceSummaries(openMeteo, metNorway, meteoFranceRadar, rainViewer, ecowittObservation, errors),
    errors
  };
}

function buildForecastComparison({ openMeteo, metNorway, meteoFranceRadar, ecowittObservation, settings, now }) {
  const nowMs = now.getTime();

  return {
    generatedAt: now.toISOString(),
    horizons: FORECAST_COMPARISON_HORIZONS.map((horizon) => buildForecastComparisonHorizon({
      horizon,
      openMeteo,
      metNorway,
      meteoFranceRadar,
      ecowittObservation,
      settings,
      nowMs
    }))
  };
}

function buildForecastComparisonHorizon({ horizon, openMeteo, metNorway, meteoFranceRadar, ecowittObservation, settings, nowMs }) {
  const arome = buildAromeForecast(openMeteo, horizon, nowMs);
  const met = buildMetNorwayForecast(metNorway, horizon, nowMs);
  const wgf = buildWgfForecast({
    horizon,
    arome,
    met,
    radar: buildReliableRadarObservation(meteoFranceRadar),
    ecowitt: buildFreshEcowittObservation(ecowittObservation),
    settings
  });

  return {
    key: horizon.key,
    label: horizon.label,
    minutes: horizon.minutes,
    sources: {
      arome,
      metNorway: met,
      wgf
    }
  };
}

function buildAromeForecast(openMeteo, horizon, nowMs) {
  const state = getSourceFreshness(openMeteo);
  const freshnessMinutes = sourceFreshnessMinutes(openMeteo, nowMs);

  if (!openMeteo?.ok || (!openMeteo.minutely15?.length && !openMeteo.hourly?.length && !openMeteo.daily?.length)) {
    return emptyForecastSource(state, freshnessMinutes);
  }

  const rows = selectOpenMeteoRows(openMeteo, horizon, nowMs);
  const targetRows = [...(openMeteo.minutely15 || []), ...(openMeteo.hourly || []), ...(openMeteo.daily || [])];
  const target = pickNearestRow(targetRows, nowMs + horizon.minutes * 60_000);

  if (!rows.length && !target) {
    return emptyForecastSource(state, freshnessMinutes);
  }

  return {
    available: true,
    state,
    freshnessMinutes,
    precipitationMm: sumNullable(rows.map((row) => row.precipitation ?? row.precipitation_sum ?? row.rain ?? row.rain_sum)),
    temperatureC: pickOpenMeteoTemperature(target),
    windKmh: pickNumber(target?.wind_speed_10m, target?.wind_speed_10m_max),
    gustKmh: pickNumber(target?.wind_gusts_10m, target?.wind_gusts_10m_max)
  };
}

function buildMetNorwayForecast(metNorway, horizon, nowMs) {
  const state = getSourceFreshness(metNorway);
  const freshnessMinutes = sourceFreshnessMinutes(metNorway, nowMs);

  if (!metNorway?.ok || !metNorway.timeseries?.length) {
    return emptyForecastSource(state, freshnessMinutes);
  }

  const endMs = nowMs + horizon.minutes * 60_000;
  const rows = metNorway.timeseries.filter((row) => isInFutureWindow(row.timeMs, nowMs, endMs));
  const target = pickNearestRow(metNorway.timeseries, endMs);

  if (!rows.length && !target) {
    return emptyForecastSource(state, freshnessMinutes);
  }

  return {
    available: true,
    state,
    freshnessMinutes,
    precipitationMm: sumNullable(rows.map((row) => row.next1h?.precipitation_amount)),
    temperatureC: pickNumber(target?.instant?.air_temperature),
    windKmh: pickNumber(target?.instant?.wind_speed_kmh),
    gustKmh: pickNumber(target?.instant?.wind_gusts_kmh)
  };
}

function buildWgfForecast({ horizon, arome, met, radar, ecowitt, settings }) {
  const forecastSources = [arome, met].filter((source) => source.available);
  const primaryAvailable = arome.available;
  const confirmationAvailable = met.available;
  const divergence = detectForecastDivergence(arome, met, settings);
  const observedInputs = horizon.minutes <= 120
    ? [radar, ecowitt].filter((source) => source.available)
    : [];
  const inputs = [...forecastSources, ...observedInputs];

  if (!inputs.length) {
    return {
      available: false,
      state: "unavailable",
      precipitationMm: null,
      temperatureC: null,
      windKmh: null,
      gustKmh: null,
      confidence: "unavailable",
      summary: "Prévision WGF indisponible.",
      reason: "Aucune source exploitable pour cet horizon."
    };
  }

  const state = inputs.some((source) => source.state === "fresh") ? "fresh" : "stale";
  const confidence = getWgfConfidence({ primaryAvailable, confirmationAvailable, divergence, state });
  const precipitationMm = weightedAverageNullable([
    { value: arome.precipitationMm, weight: arome.available ? 0.65 : 0 },
    { value: met.precipitationMm, weight: met.available ? 0.25 : 0 },
    { value: radar.precipitationMm, weight: radar.available ? 0.10 : 0 }
  ]);
  const temperatureC = weightedAverageNullable([
    { value: arome.temperatureC, weight: arome.available ? 0.55 : 0 },
    { value: met.temperatureC, weight: met.available ? 0.30 : 0 },
    { value: ecowitt.temperatureC, weight: ecowitt.available && horizon.minutes <= 60 ? 0.15 : 0 }
  ]);
  const windKmh = weightedAverageNullable([
    { value: arome.windKmh, weight: arome.available ? 0.55 : 0 },
    { value: met.windKmh, weight: met.available ? 0.30 : 0 },
    { value: ecowitt.windKmh, weight: ecowitt.available && horizon.minutes <= 60 ? 0.15 : 0 }
  ]);

  return {
    available: true,
    state,
    precipitationMm,
    temperatureC,
    windKmh,
    gustKmh: maxNullable([arome.gustKmh, met.gustKmh, horizon.minutes <= 60 ? ecowitt.gustKmh : null]),
    confidence,
    summary: buildWgfSummary(precipitationMm, settings),
    reason: buildWgfReason({ primaryAvailable, confirmationAvailable, divergence, state, observedInputs })
  };
}

function buildReliableRadarObservation(meteoFranceRadar) {
  const nativeOk = !!meteoFranceRadar?.nativeLayer?.ok;

  if (!meteoFranceRadar?.ok || !nativeOk) {
    return emptyForecastSource(getSourceFreshness(meteoFranceRadar), null);
  }

  return {
    available: Number.isFinite(meteoFranceRadar.precipitationMm),
    state: getSourceFreshness(meteoFranceRadar),
    freshnessMinutes: null,
    precipitationMm: Number.isFinite(meteoFranceRadar.precipitationMm) ? round(meteoFranceRadar.precipitationMm, 2) : null,
    temperatureC: null,
    windKmh: null,
    gustKmh: null
  };
}

function buildFreshEcowittObservation(ecowittObservation) {
  const current = ecowittObservation?.ok && !ecowittObservation.stale ? ecowittObservation.current || {} : null;

  if (!current) {
    return emptyForecastSource(getSourceFreshness(ecowittObservation), ecowittObservation?.freshnessMinutes ?? ecowittObservation?.ageMinutes ?? null);
  }

  return {
    available: true,
    state: "fresh",
    freshnessMinutes: ecowittObservation.freshnessMinutes ?? ecowittObservation.ageMinutes ?? null,
    precipitationMm: null,
    temperatureC: pickNumber(current.temperatureC),
    windKmh: pickNumber(current.windKmh),
    gustKmh: pickNumber(current.gustKmh)
  };
}

function selectOpenMeteoRows(openMeteo, horizon, nowMs) {
  const endMs = nowMs + horizon.minutes * 60_000;
  const minutelyRows = (openMeteo.minutely15 || []).filter((row) => isInFutureWindow(row.timeMs, nowMs, endMs));
  const hourlyRows = (openMeteo.hourly || []).filter((row) => isInFutureWindow(row.timeMs, nowMs, endMs));
  const maxMinutelyTimeMs = max(minutelyRows.map((row) => row.timeMs));
  const rows = [
    ...minutelyRows,
    ...hourlyRows.filter((row) => !minutelyRows.length || row.timeMs > maxMinutelyTimeMs)
  ];

  if (rows.length) {
    return rows;
  }

  return (openMeteo.daily || []).filter((row) => isInFutureWindow(row.timeMs, nowMs, endMs));
}

function pickOpenMeteoTemperature(row) {
  const min = row?.temperature_2m_min;
  const max = row?.temperature_2m_max;

  if (Number.isFinite(min) && Number.isFinite(max)) {
    return round((min + max) / 2, 1);
  }

  return pickNumber(row?.temperature_2m);
}

function pickNearestRow(rows, targetMs) {
  return (rows || [])
    .filter((row) => Number.isFinite(row.timeMs))
    .reduce((best, row) => {
      if (!best) {
        return row;
      }

      return Math.abs(row.timeMs - targetMs) < Math.abs(best.timeMs - targetMs) ? row : best;
    }, null);
}

function detectForecastDivergence(arome, met, settings) {
  if (!arome.available || !met.available) {
    return false;
  }

  const threshold = settings.rainThresholdMm;
  const rainDiff = finiteDifference(arome.precipitationMm, met.precipitationMm);
  const temperatureDiff = finiteDifference(arome.temperatureC, met.temperatureC);
  const windDiff = finiteDifference(arome.windKmh, met.windKmh);
  const wetDryMismatch = Number.isFinite(arome.precipitationMm)
    && Number.isFinite(met.precipitationMm)
    && ((arome.precipitationMm >= threshold && met.precipitationMm < threshold) || (met.precipitationMm >= threshold && arome.precipitationMm < threshold));

  return wetDryMismatch
    || (Number.isFinite(rainDiff) && rainDiff >= Math.max(1, threshold * 3))
    || (Number.isFinite(temperatureDiff) && temperatureDiff >= 3)
    || (Number.isFinite(windDiff) && windDiff >= 15);
}

function getWgfConfidence({ primaryAvailable, confirmationAvailable, divergence, state }) {
  if (!primaryAvailable && !confirmationAvailable) {
    return "unavailable";
  }

  if (state !== "fresh") {
    return "low";
  }

  if (primaryAvailable && confirmationAvailable && !divergence) {
    return "high";
  }

  if (primaryAvailable) {
    return "medium";
  }

  return "low";
}

function buildWgfSummary(precipitationMm, settings) {
  if (!Number.isFinite(precipitationMm)) {
    return "Signal incomplet.";
  }

  if (precipitationMm >= Math.max(5, settings.rainThresholdMm * 10)) {
    return "Pluie marquée possible.";
  }

  if (precipitationMm >= settings.rainThresholdMm) {
    return "Pluie faible possible.";
  }

  return "Pas de pluie significative.";
}

function buildWgfReason({ primaryAvailable, confirmationAvailable, divergence, state, observedInputs }) {
  const observed = observedInputs.length ? " Observation locale fraîche prise en compte." : "";

  if (state !== "fresh") {
    return `Données anciennes ou partielles.${observed}`;
  }

  if (primaryAvailable && confirmationAvailable && !divergence) {
    return `AROME et MET Norway sont cohérents.${observed}`;
  }

  if (primaryAvailable && confirmationAvailable && divergence) {
    return `AROME et MET Norway divergent; confiance reduite.${observed}`;
  }

  if (primaryAvailable) {
    return `AROME disponible sans confirmation complete MET Norway.${observed}`;
  }

  return `MET Norway disponible sans signal AROME exploitable.${observed}`;
}

function emptyForecastSource(state = "unavailable", freshnessMinutes = null) {
  return {
    available: false,
    state,
    freshnessMinutes,
    precipitationMm: null,
    temperatureC: null,
    windKmh: null,
    gustKmh: null
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
  const intensityMmPerHour = minutes > 0 ? precipitationMm / (minutes / 60) : 0;
  const intensityLevel = getIntensityLevel(intensityMmPerHour);

  return {
    minutes,
    score: round(weighted.value, 2),
    confidence: confidenceLabel(weighted.value, weighted.weight),
    alertLevel: getAlertLevel(weighted.value),
    precipitationMm: round(precipitationMm, 2),
    intensityMmPerHour: round(intensityMmPerHour, 2),
    intensityLevel,
    intensityLabel: INTENSITY_LABELS[intensityLevel],
    sources: {
      openMeteo: arome,
      metNorway: met,
      radar
    }
  };
}

function buildCurrentConditions(openMeteo, metNorway, ecowittObservation) {
  const current = openMeteo?.current || {};
  const metCurrent = metNorway?.timeseries?.[0]?.instant || {};
  const stationCurrent = ecowittObservation?.ok && !ecowittObservation.stale ? ecowittObservation.current || {} : {};
  const sourceLabels = [
    ecowittObservation?.ok && !ecowittObservation.stale ? ecowittObservation.label || "Ecowitt" : null,
    openMeteo?.ok ? "Open-Meteo AROME" : null,
    metNorway?.ok ? "MET Norway" : null
  ].filter(Boolean);

  return {
    temperatureC: pickNumber(stationCurrent.temperatureC, current.temperature_2m, metCurrent.air_temperature),
    humidityPct: pickNumber(stationCurrent.humidityPct, current.relative_humidity_2m, metCurrent.relative_humidity),
    windKmh: pickNumber(stationCurrent.windKmh, current.wind_speed_10m, metCurrent.wind_speed_kmh),
    gustKmh: pickNumber(stationCurrent.gustKmh, current.wind_gusts_10m, metCurrent.wind_gusts_kmh),
    precipitationMm: pickNumber(current.precipitation, current.rain, 0),
    weatherCode: current.weather_code ?? null,
    sourceLabel: sourceLabels.length ? `Conditions actuelles · ${sourceLabels.join(" / ")}` : "Prévision immédiate"
  };
}

function buildRainSignal({ current, openMeteo, alertHorizon, horizonResults, settings, ecowittObservation, nowMs }) {
  const minutelyRows = openMeteo?.minutely15 || [];
  const stationCurrent = ecowittObservation?.ok && !ecowittObservation.stale ? ecowittObservation.current || {} : {};
  const stationRainRateMmPerHour = Number.isFinite(stationCurrent.rainRateMmPerHour) ? stationCurrent.rainRateMmPerHour : 0;
  const currentPrecipitationMm = Math.max(current?.precipitationMm || 0, getMaxMinutelyPrecipitation(minutelyRows, nowMs, 20));
  const currentIntensityMmPerHour = Math.max(currentPrecipitationMm * 4, stationRainRateMmPerHour);
  const forecastIntensityMmPerHour = alertHorizon?.intensityMmPerHour || 0;
  const activeNow = stationRainRateMmPerHour >= 0.1 || currentPrecipitationMm >= Math.max(settings.rainThresholdMm, 0.05) || isRainWeatherCode(current?.weatherCode);
  const etaMinutes = activeNow ? 0 : estimateRainEtaMinutes(openMeteo, nowMs, settings.rainThresholdMm);
  const expectedDurationMinutes = activeNow
    ? estimateCurrentRainDurationMinutes(minutelyRows, nowMs, settings.rainThresholdMm, horizonResults)
    : estimateFutureRainDurationMinutes(minutelyRows, nowMs, settings.rainThresholdMm, etaMinutes);
  const intensityMmPerHour = activeNow ? currentIntensityMmPerHour : forecastIntensityMmPerHour;
  const intensityLevel = getIntensityLevel(intensityMmPerHour);
  const noSignificantRain = !activeNow && etaMinutes === null && horizonResults.every((item) => item.alertLevel === "none" && (item.precipitationMm || 0) < settings.rainThresholdMm);

  return {
    activeNow,
    noSignificantRain,
    noRainWindowMinutes: noSignificantRain ? estimateNoRainWindowMinutes(openMeteo, nowMs, settings.rainThresholdMm) : null,
    etaMinutes,
    expectedDurationMinutes,
    intensityMmPerHour: round(intensityMmPerHour, 2),
    intensityLevel,
    intensityLabel: INTENSITY_LABELS[intensityLevel],
    observation: {
      stationRainRateMmPerHour: round(stationRainRateMmPerHour, 2),
      modelCurrentPrecipitationMm: round(currentPrecipitationMm, 2),
      source: stationRainRateMmPerHour >= 0.1 ? "station" : "forecast"
    }
  };
}

function buildRainHeadline(rainSignal, alertLevel) {
  if (rainSignal.activeNow) {
    const label = rainSignal.intensityLevel === "none" ? "Pluie" : rainSignal.intensityLabel;
    return `${label} en cours`;
  }

  if (rainSignal.noSignificantRain) {
    return buildNoRainHeadline(rainSignal.noRainWindowMinutes);
  }

  if (rainSignal.etaMinutes !== null && alertLevel !== "none") {
    const label = rainSignal.intensityLevel === "none" ? "Pluie probable" : rainSignal.intensityLabel;
    return `${label} probable ${formatRainEta(rainSignal.etaMinutes)}`;
  }

  if (rainSignal.etaMinutes !== null) {
    return `Pluie possible ${formatRainEta(rainSignal.etaMinutes)}`;
  }

  return "Pas de pluie significative";
}

function buildRainDetail(rainSignal, alertHorizon, settings) {
  const risk = ALERT_LABELS[alertHorizon.alertLevel].toLowerCase();
  const score = Math.round(alertHorizon.score * 100);
  const intensity = formatRainRate(rainSignal.intensityMmPerHour, settings);
  const precipitation = formatRain(alertHorizon.precipitationMm, settings);

  if (rainSignal.activeNow) {
    return `Intensité estimée ${intensity} · cumul prévu ${precipitation} ${formatRainHorizon(alertHorizon.minutes)}.`;
  }

  if (rainSignal.noSignificantRain) {
    return "";
  }

  if (rainSignal.etaMinutes !== null) {
    return `${capitalize(risk)} ${formatRainHorizon(alertHorizon.minutes)} · score ${score} % · cumul prévu ${precipitation}.`;
  }

  return `Aucune pluie significative détectée sur l'horizon prioritaire · score ${score} %. `;
}

function buildGardenAdvice({ current, rainSignal, alertHorizon, horizonResults, settings }) {
  const twoHours = horizonResults.find((item) => item.minutes === 120) || horizonResults[horizonResults.length - 1];
  const twoHourRain = twoHours?.precipitationMm || 0;
  const activeWetRain = rainSignal.activeNow && ["moderate", "heavy", "extreme"].includes(rainSignal.intensityLevel);
  const highRainLoad = twoHourRain >= 5 || ["heavy", "extreme"].includes(rainSignal.intensityLevel);

  if (activeWetRain) {
    return {
      level: highRainLoad ? "risk" : "wet",
      headline: highRainLoad ? "Arrosage inutile, sols à surveiller" : "Arrosage inutile",
      details: [
        `${rainSignal.intensityLabel} en cours avec environ ${formatRainRate(rainSignal.intensityMmPerHour, settings)}.`,
        `Cumul possible sur 2 h : ${formatRain(twoHourRain, settings)}.`,
        highRainLoad ? "Évite les semis fins, les repiquages fragiles et le travail du sol." : "Bonne pluie d'appoint pour le potager et les plantations récentes."
      ]
    };
  }

  if (alertHorizon.score >= settings.minConfidence) {
    return {
      level: "watch",
      headline: "Arrosage à reporter",
      details: [
        `${rainSignal.intensityLabel === "Pas de pluie" ? "Pluie" : rainSignal.intensityLabel} attendue ${formatRainHorizon(alertHorizon.minutes)}.`,
        `Cumul estimé : ${formatRain(alertHorizon.precipitationMm, settings)} ${formatRainHorizon(alertHorizon.minutes)}.`,
        "Attends la fin de l'épisode avant d'arroser ou de traiter."
      ]
    };
  }

  if (current.temperatureC !== null && current.temperatureC <= 3) {
    return {
      level: "watch",
      headline: "Surveillance froid utile",
      details: [
        `Température actuelle : ${formatTemperature(current.temperatureC, settings)}.`,
        "Protège les jeunes plants sensibles si la nuit reste froide.",
        "Pas de pluie significative détectée pour le moment."
      ]
    };
  }

  return {
    level: "ok",
    headline: "Fenêtre jardin possible",
    details: [
      "Pas de pluie significative immédiate.",
      `Cumul prévu sur 2 h : ${formatRain(twoHourRain, settings)}.`,
      "Arrosage léger possible seulement si le sol est sec en surface."
    ]
  };
}

function shouldSendRainAlert(settings, rainSignal, alertLevel, alertHorizon) {
  if (!settings.enableRainAlerts) {
    return false;
  }

  if (rainSignal.activeNow) {
    return true;
  }

  return ["moderate", "high"].includes(alertLevel) && alertHorizon.score >= settings.minConfidence;
}

function buildSourceSummaries(openMeteo, metNorway, meteoFranceRadar, rainViewer, ecowittObservation, errors) {
  return [
    buildSourceStatus({
      id: "open-meteo-arome",
      label: "Open-Meteo AROME",
      payload: openMeteo,
      role: "forecast-primary",
      priority: 10,
      errors
    }),
    buildSourceStatus({
      id: "met-norway",
      label: "MET Norway",
      payload: metNorway,
      role: "forecast-confirmation",
      priority: 8,
      errors
    }),
    buildSourceStatus({
      id: "meteofrance-radar",
      label: "Météo-France radar",
      payload: meteoFranceRadar,
      enabled: meteoFranceRadar ? !!meteoFranceRadar.enabled : false,
      role: "radar-primary",
      priority: 20,
      errors,
      extra: {
        message: meteoFranceRadar?.message || null
      }
    }),
    buildSourceStatus({
      id: "rainviewer",
      label: "RainViewer",
      payload: rainViewer,
      enabled: rainViewer ? rainViewer.enabled !== false : false,
      role: "radar-visual",
      priority: 3,
      errors,
      extra: {
        imageUrl: rainViewer?.imageUrl || null
      }
    }),
    buildSourceStatus({
      id: "ecowitt",
      label: ecowittObservation?.label || "Ecowitt",
      payload: ecowittObservation,
      enabled: ecowittObservation ? !!ecowittObservation.enabled : false,
      role: "observation-local",
      priority: 30,
      errors,
      extra: {
        message: ecowittObservation?.message || null
      }
    })
  ];
}

function buildSourceStatus({ id, label, payload, enabled = !!payload, role, priority, errors, extra = {} }) {
  const state = getSourceFreshness(payload);
  const stale = payload?.stale ?? state === "stale";
  const updatedAt = payload?.updatedAt || payload?.validityTime || payload?.fetchedAt || null;
  const fetchedAt = payload?.fetchedAt || null;
  const freshnessMinutes = Number.isFinite(payload?.freshnessMinutes)
    ? payload.freshnessMinutes
    : Number.isFinite(payload?.ageMinutes)
      ? payload.ageMinutes
      : minutesSince(updatedAt);

  return {
    id,
    label,
    enabled,
    ok: !!payload?.ok,
    stale,
    state,
    status: state,
    source: payload?.source || id,
    updatedAt,
    fetchedAt,
    freshnessMinutes,
    role,
    priority,
    message: payload?.message || null,
    errors: [
      ...(payload?.errors || []),
      ...errors.filter((error) => error.source === id).map((error) => error.message)
    ],
    publicSafe: true,
    ...extra
  };
}

function minutesSince(isoDate) {
  if (!isoDate) {
    return null;
  }

  const time = Date.parse(isoDate);

  if (!Number.isFinite(time)) {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function sourceFreshnessMinutes(source, nowMs) {
  if (Number.isFinite(source?.freshnessMinutes)) {
    return source.freshnessMinutes;
  }

  if (Number.isFinite(source?.ageMinutes)) {
    return source.ageMinutes;
  }

  return minutesSinceAt(source?.updatedAt || source?.validityTime || source?.fetchedAt, nowMs);
}

function minutesSinceAt(isoDate, nowMs) {
  if (!isoDate) {
    return null;
  }

  const time = Date.parse(isoDate);

  if (!Number.isFinite(time) || !Number.isFinite(nowMs)) {
    return null;
  }

  return Math.max(0, Math.round((nowMs - time) / 60_000));
}

function getSourceFreshness(source) {
  if (!source?.ok) {
    return "unavailable";
  }

  return source.stale ? "stale" : "fresh";
}

function computeOpenMeteoScore(openMeteo, minutes, settings, nowMs) {
  if (!openMeteo?.minutely15?.length && !openMeteo?.hourly?.length && !openMeteo?.daily?.length) {
    return emptyMetric();
  }

  const endMs = nowMs + minutes * 60_000;
  const minutelyRows = (openMeteo.minutely15 || []).filter((row) => isInFutureWindow(row.timeMs, nowMs, endMs));
  const hourlyRows = (openMeteo.hourly || []).filter((row) => isInFutureWindow(row.timeMs, nowMs, endMs));
  const dailyRows = (openMeteo.daily || []).filter((row) => isInFutureWindow(row.timeMs, nowMs, endMs));
  const maxMinutelyTimeMs = max(minutelyRows.map((row) => row.timeMs));
  const rows = [
    ...minutelyRows,
    ...hourlyRows.filter((row) => !minutelyRows.length || row.timeMs > maxMinutelyTimeMs)
  ];
  const precipitationRows = rows.length ? rows : dailyRows;
  const precipitationMm = sum(precipitationRows.map((row) => row.precipitation ?? row.precipitation_sum ?? row.rain ?? 0));
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
  const firstRain = rows.find((row) => row.timeMs >= nowMs - 5 * 60_000 && (row.precipitation ?? row.rain ?? 0) >= thresholdMm);

  if (!firstRain) {
    return null;
  }

  return Math.max(0, Math.round((firstRain.timeMs - nowMs) / 60_000));
}

function estimateCurrentRainDurationMinutes(rows, nowMs, thresholdMm, horizonResults) {
  const duration = estimateContiguousRainDuration(rows, nowMs - 5 * 60_000, thresholdMm);

  if (duration) {
    return duration;
  }

  const wetHorizon = horizonResults.find((item) => item.precipitationMm >= thresholdMm);
  return wetHorizon?.minutes || null;
}

function estimateFutureRainDurationMinutes(rows, nowMs, thresholdMm, etaMinutes) {
  if (etaMinutes === null) {
    return null;
  }

  return estimateContiguousRainDuration(rows, nowMs + etaMinutes * 60_000, thresholdMm);
}

function estimateNoRainWindowMinutes(openMeteo, nowMs, thresholdMm) {
  const rows = [...(openMeteo?.minutely15 || []), ...(openMeteo?.hourly || []), ...(openMeteo?.daily || [])]
    .filter((row) => typeof row.timeMs === "number" && row.timeMs >= nowMs - 5 * 60_000)
    .sort((a, b) => a.timeMs - b.timeMs);

  if (!rows.length) {
    return null;
  }

  const firstRain = rows.find((row) => (row.precipitation ?? row.precipitation_sum ?? row.rain ?? 0) >= thresholdMm);
  const lastDryRow = firstRain ? rows[Math.max(0, rows.indexOf(firstRain) - 1)] : rows[rows.length - 1];

  if (!lastDryRow) {
    return null;
  }

  return Math.max(0, Math.round((lastDryRow.timeMs - nowMs) / 60_000));
}

function estimateContiguousRainDuration(rows, startMs, thresholdMm) {
  const futureRows = rows
    .filter((row) => typeof row.timeMs === "number" && row.timeMs >= startMs)
    .sort((a, b) => a.timeMs - b.timeMs);
  let duration = 0;

  for (const row of futureRows) {
    const precipitation = row.precipitation ?? row.rain ?? 0;

    if (precipitation < thresholdMm) {
      break;
    }

    duration += 15;
  }

  return duration || null;
}

function getMaxMinutelyPrecipitation(rows, nowMs, minutesAhead) {
  const endMs = nowMs + minutesAhead * 60_000;

  return max(rows
    .filter((row) => typeof row.timeMs === "number" && row.timeMs >= nowMs - 5 * 60_000 && row.timeMs <= endMs)
    .map((row) => row.precipitation ?? row.rain ?? 0));
}

function isRainWeatherCode(code) {
  return [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(Number(code));
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

function getIntensityLevel(mmPerHour) {
  if (!Number.isFinite(mmPerHour) || mmPerHour < 0.1) {
    return "none";
  }

  if (mmPerHour < 1) {
    return "light";
  }

  if (mmPerHour < 4) {
    return "moderate";
  }

  if (mmPerHour < 8) {
    return "heavy";
  }

  return "extreme";
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

function buildNoRainHeadline(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "Pas de pluie significative";
  }

  return `Pas de pluie significative pendant ${formatDryWindow(minutes)}`;
}

function formatDryWindow(minutes) {
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    return `${days} jour${days > 1 ? "s" : ""}`;
  }

  if (minutes >= 60) {
    const hours = Math.max(1, Math.floor(minutes / 60));
    return `${hours} heure${hours > 1 ? "s" : ""}`;
  }

  return `${minutes} min`;
}

function formatTemperature(valueC, settings) {
  if (settings.unitSystem === "imperial") {
    return `${formatNullableNumber(convertCelsiusToFahrenheit(valueC))} °F`;
  }

  return `${formatNullableNumber(valueC)} °C`;
}

function formatRainEta(minutes) {
  const rounded = Math.max(0, Math.round(minutes));

  if (!Number.isFinite(rounded)) {
    return "";
  }

  if (rounded <= 120) {
    return `dans ${rounded} min`;
  }

  return `vers ${formatLocalTimeFromNow(rounded)}`;
}

function formatRainHorizon(minutes) {
  const rounded = Math.max(0, Math.round(minutes));

  if (!Number.isFinite(rounded)) {
    return "";
  }

  if (rounded <= 120) {
    return `sur ${rounded} min`;
  }

  return `vers ${formatLocalTimeFromNow(rounded)}`;
}

function formatLocalTimeFromNow(minutes) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: minutes % 60 ? "2-digit" : undefined,
    timeZone: "Europe/Paris"
  }).format(new Date(Date.now() + minutes * 60_000)).replace(":", "h");
}

function formatRain(valueMm, settings) {
  if (settings.unitSystem === "imperial") {
    return `${formatNullableNumber(convertMmToInches(valueMm), 2)} in`;
  }

  return `${formatNullableNumber(valueMm)} mm`;
}

function formatRainRate(valueMmPerHour, settings) {
  if (settings.unitSystem === "imperial") {
    return `${formatNullableNumber(convertMmToInches(valueMmPerHour), 2)} in/h`;
  }

  return `${formatNullableNumber(valueMmPerHour)} mm/h`;
}

function convertCelsiusToFahrenheit(value) {
  return Number.isFinite(value) ? value * 9 / 5 + 32 : null;
}

function convertMmToInches(value) {
  return Number.isFinite(value) ? value / 25.4 : null;
}

function formatNullableNumber(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return "?";
  }

  return String(round(value, digits));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function max(values) {
  return values.reduce((best, value) => Math.max(best, Number.isFinite(value) ? value : 0), 0);
}

function sumNullable(values) {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? round(sum(finiteValues), 2) : null;
}

function maxNullable(values) {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? round(Math.max(...finiteValues), 2) : null;
}

function weightedAverageNullable(items) {
  const weighted = weightedAverage(items);
  return weighted.weight ? round(weighted.value, 2) : null;
}

function finiteDifference(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) ? Math.abs(left - right) : null;
}

function pickNumber(...values) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

function normalizeUnitSystem(value) {
  return value === "imperial" ? "imperial" : "metric";
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
