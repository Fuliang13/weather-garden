import { normalizeRadarSynthesis } from "./radarModel.js";

const LOCAL_RAIN_RATE_THRESHOLD = 0.1;

export function buildWgrSynthesis({
  meteoFranceRadar = null,
  rainViewer = null,
  openMeteo = null,
  metNorway = null,
  ecowittObservation = null,
  rain = null,
  now = new Date()
} = {}) {
  const sourceStatus = collectRadarSourceStatus(meteoFranceRadar, rainViewer);
  const nativeOk = meteoFranceRadar?.wgr?.status?.available === true || meteoFranceRadar?.nativeLayer?.ok === true;
  const rainViewerOk = rainViewer?.wgr?.status?.available === true || rainViewer?.ok === true;
  const stationRainRate = numberOrNull(ecowittObservation?.current?.rainRateMmPerHour);
  const stationConfirmsRain = Number.isFinite(stationRainRate) && stationRainRate >= LOCAL_RAIN_RATE_THRESHOLD && ecowittObservation?.stale !== true;
  const modelRain = hasModelRain(openMeteo) || hasMetNorwayRain(metNorway);
  const imminentRain = rain?.etaMinutes !== null && rain?.etaMinutes !== undefined || modelRain;
  const observedRain = stationConfirmsRain || hasRadarRainAmount(meteoFranceRadar);
  const coherence = classifyCoherence({ observedRain, modelRain, stationConfirmsRain, nativeOk, rainViewerOk });
  const confidenceScore = computeConfidenceScore({ nativeOk, rainViewerOk, stationConfirmsRain, modelRain, coherence });
  const state = pickWgrState({ nativeOk, rainViewerOk, sourceStatus });
  const explanations = buildExplanations({
    state,
    nativeOk,
    rainViewerOk,
    observedRain,
    imminentRain,
    stationConfirmsRain,
    modelRain,
    coherence,
    rain
  });

  return {
    ...normalizeRadarSynthesis({
      generatedAt: now,
      state,
      observedRain,
      imminentRain,
      etaMinutes: rain?.etaMinutes ?? null,
      intensity: {
        level: rain?.intensityLevel || "unknown",
        mmPerHour: rain?.intensityMmPerHour ?? null
      },
      confidence: confidenceScore,
      coherence,
      sourceStatus,
      derivedFrom: collectDerivedFrom({ nativeOk, rainViewerOk, stationConfirmsRain, modelRain, rain }),
      explanations
    }),
    headline: buildHeadline({ observedRain, imminentRain, rain, state }),
    displayHints: buildDisplayHints({ nativeOk, rainViewerOk, rain })
  };
}

function collectRadarSourceStatus(meteoFranceRadar, rainViewer) {
  return [
    meteoFranceRadar?.wgr?.status,
    rainViewer?.wgr?.status
  ].filter(Boolean);
}

function hasRadarRainAmount(meteoFranceRadar) {
  return Number.isFinite(meteoFranceRadar?.precipitationMm) && meteoFranceRadar.precipitationMm > 0;
}

function hasModelRain(openMeteo) {
  const rows = [...(openMeteo?.minutely15 || []), ...(openMeteo?.hourly || [])];
  return rows.some((row) => numberOrNull(row.precipitation ?? row.rain) > 0);
}

function hasMetNorwayRain(metNorway) {
  return (metNorway?.timeseries || []).some((row) => numberOrNull(row.next1h?.precipitation_amount) > 0);
}

function classifyCoherence({ observedRain, modelRain, stationConfirmsRain, nativeOk, rainViewerOk }) {
  if (observedRain && modelRain) {
    return "observed_and_model_agree";
  }

  if (stationConfirmsRain && !modelRain) {
    return "local_observation_only";
  }

  if (!observedRain && modelRain && (nativeOk || rainViewerOk)) {
    return "model_ahead_of_observation";
  }

  if (!nativeOk && !rainViewerOk) {
    return "radar_unavailable";
  }

  return "no_rain_signal";
}

function computeConfidenceScore({ nativeOk, rainViewerOk, stationConfirmsRain, modelRain, coherence }) {
  let score = 0.25;

  if (nativeOk) {
    score += 0.25;
  } else if (rainViewerOk) {
    score += 0.15;
  }

  if (stationConfirmsRain) {
    score += 0.25;
  }

  if (modelRain) {
    score += 0.15;
  }

  if (coherence === "observed_and_model_agree") {
    score += 0.1;
  }

  return Math.min(0.95, Math.max(0, Number(score.toFixed(2))));
}

function pickWgrState({ nativeOk, rainViewerOk, sourceStatus }) {
  if (nativeOk) {
    return "native_ok";
  }

  if (rainViewerOk) {
    return "fallback_rainviewer";
  }

  if (sourceStatus.some((status) => status.freshness === "stale")) {
    return "stale";
  }

  return "unavailable";
}

function buildExplanations({ state, nativeOk, rainViewerOk, observedRain, imminentRain, stationConfirmsRain, modelRain, coherence, rain }) {
  const explanations = [];

  if (nativeOk) {
    explanations.push("Météo-France native radar is verified for display.");
  } else if (rainViewerOk) {
    explanations.push("RainViewer is used as the visual radar fallback.");
  } else {
    explanations.push("No usable radar frame is available.");
  }

  if (stationConfirmsRain) {
    explanations.push("The local Ecowitt station reports rain now.");
  }

  if (modelRain) {
    explanations.push("At least one forecast model has precipitation in the near window.");
  }

  if (rain?.etaMinutes !== null && rain?.etaMinutes !== undefined) {
    explanations.push("ETA comes from the existing Weather Garden rain signal.");
  }

  if (!observedRain && !imminentRain) {
    explanations.push("No observed or imminent rain signal is currently available.");
  }

  explanations.push(`Source coherence: ${coherence}.`);
  explanations.push(`WGR state: ${state}.`);
  return explanations;
}

function collectDerivedFrom({ nativeOk, rainViewerOk, stationConfirmsRain, modelRain, rain }) {
  return [
    nativeOk ? "meteofrance.wgr" : null,
    rainViewerOk ? "rainviewer.wgr" : null,
    stationConfirmsRain ? "ecowitt.current.rainRateMmPerHour" : null,
    modelRain ? "forecast.precipitation" : null,
    rain ? "status.rain" : null
  ].filter(Boolean);
}

function buildHeadline({ observedRain, imminentRain, rain, state }) {
  if (observedRain) {
    return "Pluie observée localement.";
  }

  if (rain?.etaMinutes !== null && rain?.etaMinutes !== undefined) {
    return `${rain.intensityLabel || "Pluie"} probable dans ~${Math.round(rain.etaMinutes)} min.`;
  }

  if (imminentRain) {
    return "Pluie possible dans la fenêtre proche.";
  }

  if (state === "unavailable") {
    return "Radar indisponible pour le moment.";
  }

  return "Aucune pluie proche détectée.";
}

function buildDisplayHints({ nativeOk, rainViewerOk, rain }) {
  return {
    radarSource: nativeOk ? "meteofrance" : rainViewerOk ? "rainviewer" : "none",
    zoomMode: "auto",
    radiusKm: pickRadiusKm(rain)
  };
}

function pickRadiusKm(rain) {
  if (rain?.activeNow) {
    return 40;
  }

  if (Number.isFinite(rain?.etaMinutes)) {
    if (rain.etaMinutes <= 30) {
      return 60;
    }

    if (rain.etaMinutes <= 90) {
      return 100;
    }
  }

  return 160;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

