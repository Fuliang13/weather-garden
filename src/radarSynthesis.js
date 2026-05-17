import {
  buildWgrFusion,
  buildWgrFutureProjection,
  buildWgrGardenImpact,
  buildWgrNarrative,
  buildWgrTimeline,
  normalizeRadarSynthesis,
  normalizeWgrSourceContribution
} from "./radarModel.js";

const LOCAL_RAIN_RATE_THRESHOLD = 0.1;

export function buildWgrSynthesis({
  meteoFranceRadar = null,
  rainViewer = null,
  openMeteo = null,
  metNorway = null,
  ecowittObservation = null,
  garden = null,
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
  const contributions = collectWgrContributions({
    meteoFranceRadar,
    rainViewer,
    openMeteo,
    metNorway,
    ecowittObservation,
    garden,
    nativeOk,
    rainViewerOk,
    stationConfirmsRain,
    modelRain,
    now
  });
  const globalState = pickWgrGlobalState({ nativeOk, rainViewerOk, sourceStatus, contributions, stationConfirmsRain, modelRain, rain });
  const timeline = buildTimelineModel({ meteoFranceRadar, rainViewer, now });
  const futureProjection = buildWgrFutureProjection({
    observedFrames: timeline.observedFrames,
    generatedAt: now
  });
  const fusion = buildWgrFusion({
    generatedAt: now,
    timeline,
    futureProjection,
    radarSignal: buildFusionRadarSignal({ meteoFranceRadar, rainViewer, timeline }),
    modelSignals: buildFusionModelSignals({ openMeteo, metNorway, now }),
    stationSignal: buildFusionStationSignal(ecowittObservation)
  });
  const narrative = buildWgrNarrative({
    generatedAt: now,
    state,
    globalState,
    observedRain,
    imminentRain,
    intensity: {
      level: rain?.intensityLevel || "unknown",
      mmPerHour: rain?.intensityMmPerHour ?? null
    },
    confidence: confidenceScore,
    confidenceReasons: collectConfidenceReasons({ nativeOk, rainViewerOk, stationConfirmsRain, modelRain, coherence }),
    degradationReasons: collectDegradationReasons({ state, globalState, sourceStatus, contributions, modelRain, stationConfirmsRain }),
    fusion,
    timeline,
    futureProjection,
    contributions,
    sourcesUsed: contributions.filter((item) => item.used).map((item) => item.id),
    sourcesIgnored: contributions.filter((item) => item.ignored).map((item) => item.id),
    rain
  });
  const gardenImpact = buildWgrGardenImpact({
    generatedAt: now,
    garden,
    fusion,
    narrative,
    futureProjection,
    timeline,
    contributions,
    sourcesUsed: contributions.filter((item) => item.used).map((item) => item.id),
    sourcesIgnored: contributions.filter((item) => item.ignored).map((item) => item.id)
  });
  const explanations = buildExplanations({
    state,
    globalState,
    nativeOk,
    rainViewerOk,
    observedRain,
    imminentRain,
    stationConfirmsRain,
    modelRain,
    coherence,
    rain
  });
  const degradationReasons = collectDegradationReasons({ state, globalState, sourceStatus, contributions, modelRain, stationConfirmsRain });

  return {
    ...normalizeRadarSynthesis({
      generatedAt: now,
      state,
      globalState,
      observedRain,
      imminentRain,
      etaMinutes: rain?.etaMinutes ?? null,
      intensity: {
        level: rain?.intensityLevel || "unknown",
        mmPerHour: rain?.intensityMmPerHour ?? null
      },
      confidence: confidenceScore,
      confidenceReasons: collectConfidenceReasons({ nativeOk, rainViewerOk, stationConfirmsRain, modelRain, coherence }),
      degradationReasons,
      coherence,
      sourceStatus,
      contributions,
      sourcesUsed: contributions.filter((item) => item.used).map((item) => item.id),
      sourcesIgnored: contributions.filter((item) => item.ignored).map((item) => item.id),
      finalLayer: {
        id: "wgr",
        source: "wgr",
        kind: "aggregated",
        contributors: contributions.filter((item) => item.used).map((item) => item.id),
        visualSourceId: timeline.currentFrame?.sourceId || null,
        visualSourceLabel: timeline.currentFrame?.sourceLabel || null,
        visualType: timeline.currentFrame?.visualType || "none",
        playbackAvailable: timeline.playbackAvailable,
        futureProjectionAvailable: futureProjection.available === true
      },
      timeline,
      futureProjection,
      fusion,
      narrative,
      gardenImpact,
      diagnostics: {
        globalState,
        radarStatusCount: sourceStatus.length,
        contributionCount: contributions.length,
        fusionStatus: fusion.status
      },
      derivedFrom: collectDerivedFrom({ nativeOk, rainViewerOk, stationConfirmsRain, modelRain, rain }),
      explanations
    }),
    headline: narrative.headline,
    displayHints: buildDisplayHints({ nativeOk, rainViewerOk, rain })
  };
}

function collectRadarSourceStatus(meteoFranceRadar, rainViewer) {
  return [
    meteoFranceRadar?.wgr?.status,
    rainViewer?.wgr?.status
  ].filter(Boolean);
}

function collectWgrContributions({ meteoFranceRadar, rainViewer, openMeteo, metNorway, ecowittObservation, garden, nativeOk, rainViewerOk, stationConfirmsRain, modelRain, now }) {
  return [
    normalizeWgrSourceContribution({
      id: "meteofrance-radar",
      role: "radar-observation",
      available: nativeOk,
      used: nativeOk,
      timestamp: meteoFranceRadar?.wgr?.latestFrame?.timestamp || meteoFranceRadar?.validityTime,
      fetchedAt: meteoFranceRadar?.fetchedAt,
      freshness: meteoFranceRadar?.wgr?.status?.freshness,
      reason: meteoFranceRadar?.wgr?.status?.fallbackReason,
      quality: meteoFranceRadar?.wgr?.status?.quality,
      derivedFrom: nativeOk ? ["meteofrance.wgr"] : []
    }, { now }),
    normalizeWgrSourceContribution({
      id: "rainviewer",
      role: "radar-observation",
      available: rainViewerOk,
      used: rainViewerOk,
      timestamp: rainViewer?.wgr?.latestFrame?.timestamp || rainViewer?.frameTime,
      fetchedAt: rainViewer?.fetchedAt,
      freshness: rainViewer?.wgr?.status?.freshness,
      reason: rainViewer?.wgr?.status?.fallbackReason,
      quality: rainViewer?.wgr?.status?.quality,
      derivedFrom: rainViewerOk ? ["rainviewer.wgr"] : []
    }, { now }),
    normalizeWgrSourceContribution({
      id: "open-meteo-arome",
      role: "forecast-primary",
      available: !!openMeteo,
      used: hasModelRain(openMeteo),
      timestamp: firstTimestamp(openMeteo?.current?.time, openMeteo?.current?.timestamp, openMeteo?.updatedAt),
      fetchedAt: openMeteo?.fetchedAt,
      reason: openMeteo ? null : "source unavailable",
      derivedFrom: hasModelRain(openMeteo) ? ["openMeteo.precipitation"] : []
    }, { now }),
    normalizeWgrSourceContribution({
      id: "met-norway",
      role: "forecast-confirmation",
      available: !!metNorway,
      used: hasMetNorwayRain(metNorway),
      timestamp: firstTimestamp(metNorway?.updatedAt, metNorway?.timeseries?.[0]?.time),
      fetchedAt: metNorway?.fetchedAt,
      reason: metNorway ? null : "source unavailable",
      derivedFrom: hasMetNorwayRain(metNorway) ? ["metNorway.timeseries.next1h"] : []
    }, { now }),
    normalizeWgrSourceContribution({
      id: "ecowitt",
      role: "local-observation",
      available: ecowittObservation?.ok === true,
      used: stationConfirmsRain,
      timestamp: firstTimestamp(ecowittObservation?.updatedAt, ecowittObservation?.current?.timestamp, ecowittObservation?.current?.time),
      fetchedAt: ecowittObservation?.fetchedAt,
      freshness: ecowittObservation?.stale === true ? "stale" : null,
      reason: ecowittObservation?.ok ? null : "source unavailable",
      derivedFrom: stationConfirmsRain ? ["ecowitt.current.rainRateMmPerHour"] : []
    }, { now }),
    normalizeWgrSourceContribution({
      id: "garden-state",
      role: "garden-context",
      available: !!garden,
      used: !!garden,
      timestamp: garden?.updatedAt,
      reason: garden ? null : "garden context not provided in this synthesis",
      derivedFrom: garden ? ["garden.state"] : []
    }, { now })
  ];
}

function buildTimelineModel({ meteoFranceRadar, rainViewer, now }) {
  const observedFrames = collectObservedTimelineFrames(meteoFranceRadar, rainViewer);
  const latestFrame = observedFrames[observedFrames.length - 1] || null;
  const playbackAvailable = observedFrames.length > 1;

  return buildWgrTimeline({
    generatedAt: now,
    observedFrames,
    currentFrame: latestFrame ? {
      ...latestFrame,
      kind: "current",
      phase: "aggregated",
      label: "Frame WGR actuelle"
    } : {
      kind: "current",
      phase: "unavailable",
      available: false,
      reason: "Aucune frame observée disponible pour construire la frame WGR actuelle."
    },
    futureFrames: [],
    playbackAvailable,
    playbackReason: buildObservedPlaybackReason(observedFrames, playbackAvailable),
    explanation: "Sprint 2 expose uniquement la timeline radar observée WGR ; aucune frame future n'est générée."
  });
}

function collectObservedTimelineFrames(meteoFranceRadar, rainViewer) {
  return [
    ...mapMeteoFranceFramesToWgrTimeline(meteoFranceRadar),
    ...mapRainViewerFramesToWgrTimeline(rainViewer)
  ].sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
}

function mapRainViewerFramesToWgrTimeline(rainViewer) {
  const rawFrames = Array.isArray(rainViewer?.frames) && rainViewer.frames.length > 0
    ? rainViewer.frames
    : rainViewer?.wgr?.frames;

  return mapRadarFramesToWgrTimeline(rawFrames, {
    sourceId: "rainviewer",
    sourceLabel: "RainViewer",
    derivedFrom: "rainviewer.frames",
    visualType: "tile"
  });
}

function mapMeteoFranceFramesToWgrTimeline(meteoFranceRadar) {
  const rawFrames = Array.isArray(meteoFranceRadar?.frames) && meteoFranceRadar.frames.length > 0
    ? meteoFranceRadar.frames
    : meteoFranceRadar?.wgr?.frames;

  return mapRadarFramesToWgrTimeline(rawFrames, {
    sourceId: "meteofrance-radar",
    sourceLabel: "Météo-France Radar",
    derivedFrom: "meteofrance.frames",
    visualType: "image-overlay"
  });
}

function mapRadarFramesToWgrTimeline(frames, { sourceId, sourceLabel, derivedFrom, visualType }) {
  if (!Array.isArray(frames)) {
    return [];
  }

  return frames.map((frame) => {
    const timestamp = frame.timestamp || frame.validityTime || frame.frameTime;
    return {
    kind: "observed",
    phase: "observed",
    available: true,
    id: frame.id,
    sourceId,
    sourceLabel,
    timestamp,
    tileUrlTemplate: frame.tileUrlTemplate,
    imageUrl: frame.imageUrl,
    imageDataUrl: frame.imageDataUrl,
    bounds: frame.bounds,
    opacity: frame.opacity,
    visualType,
    contributors: [sourceId],
    derivedFrom: [derivedFrom],
    confidence: frame.confidence,
    motionVector: frame.motionVector || frame.motion,
    diagnostics: {
      provider: sourceId,
      hasVisualReference: !!(frame.tileUrlTemplate || frame.imageUrl || frame.imageDataUrl)
    }
  };
  }).filter((frame) => frame.timestamp);
}


function buildFusionRadarSignal({ meteoFranceRadar, rainViewer, timeline }) {
  const currentFrame = timeline.currentFrame || null;
  const currentSourceId = currentFrame?.sourceId || null;
  const radarPayload = currentSourceId === "meteofrance-radar" ? meteoFranceRadar : currentSourceId === "rainviewer" ? rainViewer : meteoFranceRadar || rainViewer;
  const precipitationMm = numberOrNull(radarPayload?.precipitationMm);
  const rainProbability = numberOrNull(radarPayload?.probability);

  return {
    sourceId: currentSourceId || radarPayload?.source || "wgr",
    sourceLabel: currentFrame?.sourceLabel || null,
    available: currentFrame?.available === true || radarPayload?.ok === true || radarPayload?.nativeLayer?.ok === true,
    freshness: currentFrame?.freshness || radarPayload?.state || (radarPayload?.stale ? "stale" : radarPayload?.ok ? "fresh" : "unavailable"),
    rainLikely: (Number.isFinite(precipitationMm) && precipitationMm >= LOCAL_RAIN_RATE_THRESHOLD) || (Number.isFinite(rainProbability) && rainProbability >= 0.35),
    precipitationMm,
    currentFrameId: currentFrame?.id || null,
    currentFrameTimestamp: currentFrame?.timestamp || null,
    confidence: currentFrame?.confidence || radarPayload?.confidence || null,
    degradationReasons: currentFrame?.freshness === "stale" ? ["radar_current_frame_stale"] : [],
    diagnostics: {
      currentFrameAvailable: currentFrame?.available === true,
      currentFrameSourceId: currentSourceId
    }
  };
}

function buildFusionModelSignals({ openMeteo, metNorway, now }) {
  return [
    buildOpenMeteoFusionSignal(openMeteo, now),
    buildMetNorwayFusionSignal(metNorway, now)
  ];
}

function buildOpenMeteoFusionSignal(openMeteo, now) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const available = openMeteo?.ok === true || !!openMeteo;
  const freshness = openMeteo?.stale ? "stale" : available ? "fresh" : "unavailable";
  const rows = [...(openMeteo?.minutely15 || []), ...(openMeteo?.hourly || [])];

  return {
    sourceId: "open-meteo-arome",
    role: "forecast-primary",
    available,
    freshness,
    horizons: [0, 15, 30].map((minutes) => buildOpenMeteoFusionHorizon({ openMeteo, rows, minutes, nowMs }))
  };
}

function buildOpenMeteoFusionHorizon({ openMeteo, rows, minutes, nowMs }) {
  if (minutes === 0) {
    const precipitationMm = numberOrNull(openMeteo?.current?.precipitation ?? openMeteo?.current?.rain);
    return {
      horizonMinutes: 0,
      available: Number.isFinite(precipitationMm),
      precipitationMm,
      probability: precipitationMmToProbability(precipitationMm)
    };
  }

  const horizonEndMs = nowMs + minutes * 60_000;
  const matchingRows = rows.filter((row) => Number.isFinite(row.timeMs) && row.timeMs >= nowMs - 5 * 60_000 && row.timeMs <= horizonEndMs);
  const precipitationMm = sumNumbers(matchingRows.map((row) => row.precipitation ?? row.rain));
  const probabilityPct = maxNumber(matchingRows.map((row) => row.precipitation_probability));
  const probability = Number.isFinite(probabilityPct) ? probabilityPct / 100 : precipitationMmToProbability(precipitationMm);

  return {
    horizonMinutes: minutes,
    available: matchingRows.length > 0,
    precipitationMm,
    probability
  };
}

function buildMetNorwayFusionSignal(metNorway, now) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const available = metNorway?.ok === true || !!metNorway;
  const freshness = metNorway?.stale ? "stale" : available ? "fresh" : "unavailable";

  return {
    sourceId: "met-norway",
    role: "forecast-confirmation",
    available,
    freshness,
    horizons: [0, 15, 30].map((minutes) => buildMetNorwayFusionHorizon({ metNorway, minutes, nowMs }))
  };
}

function buildMetNorwayFusionHorizon({ metNorway, minutes, nowMs }) {
  const rows = metNorway?.timeseries || [];
  const horizonEndMs = nowMs + Math.max(minutes, 60) * 60_000;
  const matchingRows = rows.filter((row) => Number.isFinite(row.timeMs) && row.timeMs >= nowMs - 5 * 60_000 && row.timeMs <= horizonEndMs);
  const precipitationMm = sumNumbers(matchingRows.map((row) => row.next1h?.precipitation_amount));

  return {
    horizonMinutes: minutes,
    available: matchingRows.length > 0,
    precipitationMm,
    probability: precipitationMmToProbability(precipitationMm)
  };
}

function buildFusionStationSignal(ecowittObservation) {
  const current = ecowittObservation?.current || {};
  const available = ecowittObservation?.ok === true;

  return {
    sourceId: "ecowitt",
    label: ecowittObservation?.label || "Ecowitt",
    available,
    freshness: ecowittObservation?.stale === true ? "stale" : available ? "fresh" : "unavailable",
    rainRateMmPerHour: numberOrNull(current.rainRateMmPerHour),
    humidityPct: numberOrNull(current.humidityPct),
    temperatureC: numberOrNull(current.temperatureC),
    pressureHpa: numberOrNull(current.pressureHpa ?? current.pressureRelativeHpa)
  };
}

function precipitationMmToProbability(value) {
  const number = numberOrNull(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.min(1, Math.max(0, Number((number / 1.2).toFixed(2))));
}

function sumNumbers(values) {
  const numbers = values.map((value) => numberOrNull(value)).filter(Number.isFinite);
  return numbers.length ? Number(numbers.reduce((sum, value) => sum + value, 0).toFixed(2)) : null;
}

function maxNumber(values) {
  const numbers = values.map((value) => numberOrNull(value)).filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) : null;
}

function buildObservedPlaybackReason(observedFrames, playbackAvailable) {
  if (playbackAvailable) {
    return "Plusieurs frames radar observées réelles disponibles.";
  }

  if (observedFrames.length === 1 && observedFrames[0].sourceId === "meteofrance-radar") {
    return "Météo-France fournit une seule image observée dans ce refresh.";
  }

  if (observedFrames.length === 1) {
    return "Une seule frame radar observée disponible ; playback désactivé.";
  }

  return "Aucune frame radar observée disponible.";
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
    return "rainviewer_ok";
  }

  if (sourceStatus.some((status) => status.freshness === "stale")) {
    return "stale";
  }

  return "unavailable";
}

function pickWgrGlobalState({ nativeOk, rainViewerOk, sourceStatus, contributions, stationConfirmsRain, modelRain, rain }) {
  if (!nativeOk && !rainViewerOk) {
    return sourceStatus.some((status) => status.freshness === "stale") ? "stale" : "unavailable";
  }

  if (sourceStatus.some((status) => status.freshness === "stale")) {
    return "stale";
  }

  if (stationConfirmsRain || modelRain || rain) {
    return "fresh";
  }

  return contributions.some((item) => item.used) ? "degraded" : "unavailable";
}

function buildExplanations({ state, globalState, nativeOk, rainViewerOk, observedRain, imminentRain, stationConfirmsRain, modelRain, coherence, rain }) {
  const explanations = [];

  if (nativeOk) {
    explanations.push("Météo-France native radar contributes to WGR.");
  }

  if (rainViewerOk) {
    explanations.push("RainViewer contributes as a normal WGR radar source.");
  }

  if (!nativeOk && !rainViewerOk) {
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
  explanations.push(`WGR global state: ${globalState}.`);
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

function collectConfidenceReasons({ nativeOk, rainViewerOk, stationConfirmsRain, modelRain, coherence }) {
  return [
    nativeOk ? "verified_meteofrance_radar" : null,
    rainViewerOk ? "rainviewer_radar_available" : null,
    stationConfirmsRain ? "fresh_local_station_rain" : null,
    modelRain ? "forecast_precipitation_available" : null,
    coherence === "observed_and_model_agree" ? "observed_and_model_agree" : null
  ].filter(Boolean);
}

function collectDegradationReasons({ state, globalState, sourceStatus, contributions, modelRain, stationConfirmsRain }) {
  return [
    globalState === "degraded" ? "wgr_has_partial_source_context" : null,
    !modelRain ? "no_model_rain_used" : null,
    !stationConfirmsRain ? "no_fresh_station_rain_confirmation" : null,
    ...sourceStatus.filter((status) => status.freshness === "stale").map((status) => `${status.source}_stale`),
    ...contributions.filter((item) => item.ignored).map((item) => `${item.id}_ignored`)
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

function firstTimestamp(...values) {
  return values.find(Boolean) || null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
