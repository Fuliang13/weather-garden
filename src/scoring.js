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
  const current = buildCurrentConditions(openMeteo, metNorway);
  const rainSignal = buildRainSignal({
    current,
    openMeteo,
    alertHorizon,
    horizonResults,
    settings: safeSettings,
    nowMs
  });
  const garden = buildGardenAdvice({
    current,
    rainSignal,
    alertHorizon,
    horizonResults
  });

  return {
    location,
    updatedAt: now.toISOString(),
    settings: safeSettings,
    current,
    stationObservation: ecowittObservation?.ok ? ecowittObservation : null,
    observation: {
      station: ecowittObservation?.ok ? ecowittObservation : null
    },
    garden: garden || null,
    rain: {
      etaMinutes: rainSignal.etaMinutes,
      activeNow: rainSignal.activeNow,
      noSignificantRain: rainSignal.noSignificantRain,
      noRainWindowMinutes: rainSignal.noRainWindowMinutes,
      intensityLevel: rainSignal.intensityLevel,
      intensityLabel: rainSignal.intensityLabel,
      intensityMmPerHour: rainSignal.intensityMmPerHour,
      expectedDurationMinutes: rainSignal.expectedDurationMinutes,
      presentationLevel: rainSignal.activeNow ? rainSignal.intensityLevel : alertLevel,
      alertLevel,
      alertLabel: ALERT_LABELS[alertLevel],
      riskLabel: ALERT_LABELS[alertLevel],
      headline: buildRainHeadline(rainSignal, alertLevel),
      detail: buildRainDetail(rainSignal, alertHorizon),
      shouldAlert: shouldSendRainAlert(safeSettings, rainSignal, alertLevel),
      horizons: horizonResults,
      garden
    },
    radar: {
      meteoFrance: meteoFranceRadar || null,
      rainViewer: rainViewer || null
    },
    sources: buildSourceSummaries(openMeteo, metNorway, meteoFranceRadar, rainViewer, ecowittObservation, errors),
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

function buildCurrentConditions(openMeteo, metNorway) {
  const current = openMeteo?.current || {};
  const metCurrent = metNorway?.timeseries?.[0]?.instant || {};
  const sourceLabels = [
    openMeteo?.ok ? "Open-Meteo AROME" : null,
    metNorway?.ok ? "MET Norway" : null
  ].filter(Boolean);

  return {
    temperatureC: pickNumber(current.temperature_2m, metCurrent.air_temperature),
    humidityPct: pickNumber(current.relative_humidity_2m, metCurrent.relative_humidity),
    windKmh: pickNumber(current.wind_speed_10m, metCurrent.wind_speed_kmh),
    gustKmh: pickNumber(current.wind_gusts_10m, metCurrent.wind_gusts_kmh),
    precipitationMm: pickNumber(current.precipitation, current.rain, 0),
    weatherCode: current.weather_code ?? null,
    sourceLabel: sourceLabels.length ? `Prévision immédiate · ${sourceLabels.join(" / ")}` : "Prévision immédiate"
  };
}

function buildRainSignal({ current, openMeteo, alertHorizon, horizonResults, settings, nowMs }) {
  const minutelyRows = openMeteo?.minutely15 || [];
  const currentPrecipitationMm = Math.max(current?.precipitationMm || 0, getMaxMinutelyPrecipitation(minutelyRows, nowMs, 20));
  const currentIntensityMmPerHour = currentPrecipitationMm * 4;
  const forecastIntensityMmPerHour = alertHorizon?.intensityMmPerHour || 0;
  const activeNow = currentPrecipitationMm >= Math.max(settings.rainThresholdMm, 0.05) || isRainWeatherCode(current?.weatherCode);
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
    intensityLabel: INTENSITY_LABELS[intensityLevel]
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
    return `${label} probable dans ${rainSignal.etaMinutes} min`;
  }

  if (rainSignal.etaMinutes !== null) {
    return `Pluie possible dans ${rainSignal.etaMinutes} min`;
  }

  return "Pas de pluie significative";
}

function buildRainDetail(rainSignal, alertHorizon) {
  const risk = ALERT_LABELS[alertHorizon.alertLevel].toLowerCase();
  const score = Math.round(alertHorizon.score * 100);
  const intensity = rainSignal.intensityMmPerHour === null ? "—" : `${round(rainSignal.intensityMmPerHour, 1)} mm/h`;
  const precipitation = alertHorizon.precipitationMm === null ? "—" : `${alertHorizon.precipitationMm} mm`;

  if (rainSignal.activeNow) {
    return `Intensité estimée ${intensity} · cumul prévu ${precipitation} sur ${alertHorizon.minutes} min.`;
  }

  if (rainSignal.noSignificantRain) {
    return "";
  }

  if (rainSignal.etaMinutes !== null) {
    return `${capitalize(risk)} sur ${alertHorizon.minutes} min · score ${score} % · cumul prévu ${precipitation}.`;
  }

  return `Aucune pluie significative détectée sur l'horizon prioritaire · score ${score} %. `;
}

function buildGardenAdvice({ current, rainSignal, alertHorizon, horizonResults }) {
  const twoHours = horizonResults.find((item) => item.minutes === 120) || horizonResults[horizonResults.length - 1];
  const twoHourRain = twoHours?.precipitationMm || 0;
  const activeWetRain = rainSignal.activeNow && ["moderate", "heavy", "extreme"].includes(rainSignal.intensityLevel);
  const highRainLoad = twoHourRain >= 5 || ["heavy", "extreme"].includes(rainSignal.intensityLevel);

  if (activeWetRain) {
    return {
      level: highRainLoad ? "risk" : "wet",
      headline: highRainLoad ? "Arrosage inutile, sols à surveiller" : "Arrosage inutile",
      details: [
        `${rainSignal.intensityLabel} en cours avec environ ${formatNullableNumber(rainSignal.intensityMmPerHour)} mm/h.`,
        `Cumul possible sur 2 h : ${formatNullableNumber(twoHourRain)} mm.`,
        highRainLoad ? "Évite les semis fins, les repiquages fragiles et le travail du sol." : "Bonne pluie d'appoint pour le potager et les plantations récentes."
      ]
    };
  }

  if (alertHorizon.score >= 0.55) {
    return {
      level: "watch",
      headline: "Arrosage à reporter",
      details: [
        `${rainSignal.intensityLabel === "Pas de pluie" ? "Pluie" : rainSignal.intensityLabel} attendue sur l'horizon ${alertHorizon.minutes} min.`,
        `Cumul estimé : ${formatNullableNumber(alertHorizon.precipitationMm)} mm sur ${alertHorizon.minutes} min.`,
        "Attends la fin de l'épisode avant d'arroser ou de traiter."
      ]
    };
  }

  if (current.temperatureC !== null && current.temperatureC <= 3) {
    return {
      level: "watch",
      headline: "Surveillance froid utile",
      details: [
        `Température actuelle : ${formatNullableNumber(current.temperatureC)} °C.`,
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
      `Cumul prévu sur 2 h : ${formatNullableNumber(twoHourRain)} mm.`,
      "Arrosage léger possible seulement si le sol est sec en surface."
    ]
  };
}

function shouldSendRainAlert(settings, rainSignal, alertLevel) {
  if (!settings.enableRainAlerts) {
    return false;
  }

  return rainSignal.activeNow || ["moderate", "high"].includes(alertLevel);
}

function buildSourceSummaries(openMeteo, metNorway, meteoFranceRadar, rainViewer, ecowittObservation, errors) {
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
    },
    {
      id: "ecowitt",
      label: ecowittObservation?.label || "Ecowitt",
      ok: !!ecowittObservation?.ok,
      enabled: ecowittObservation ? !!ecowittObservation.enabled : undefined,
      updatedAt: ecowittObservation?.updatedAt || ecowittObservation?.fetchedAt || null,
      message: ecowittObservation?.message || null
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
  const rows = [...(openMeteo?.minutely15 || []), ...(openMeteo?.hourly || [])]
    .filter((row) => typeof row.timeMs === "number" && row.timeMs >= nowMs - 5 * 60_000)
    .sort((a, b) => a.timeMs - b.timeMs);

  if (!rows.length) {
    return null;
  }

  const firstRain = rows.find((row) => (row.precipitation ?? row.rain ?? 0) >= thresholdMm);
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

function formatDuration(minutes) {
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

function formatNullableNumber(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return String(round(value, 1));
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
