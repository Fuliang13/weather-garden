const DEFAULT_FRESHNESS_LIMIT_MINUTES = 15;
const WGR_SOURCE_ID = "wgr";
const SOURCE_ALIASES = {
  mf: "meteofrance-radar",
  "meteo-france": "meteofrance-radar",
  meteofrance: "meteofrance-radar",
  "meteofrance-radar": "meteofrance-radar",
  rv: "rainviewer",
  rainviewer: "rainviewer",
  wgr: WGR_SOURCE_ID,
  "open-meteo": "open-meteo-arome",
  "open-meteo-arome": "open-meteo-arome",
  arome: "open-meteo-arome",
  "met-norway": "met-norway",
  metnorway: "met-norway",
  ecowitt: "ecowitt",
  garden: "garden-state",
  "garden-state": "garden-state"
};
const SOURCE_LABELS = {
  "meteofrance-radar": "Météo-France Radar",
  rainviewer: "RainViewer",
  "open-meteo-arome": "Open-Meteo AROME",
  "met-norway": "MET Norway",
  ecowitt: "Ecowitt",
  "garden-state": "GardenState",
  [WGR_SOURCE_ID]: "Weather Garden Radar"
};
const WGR_TIMELINE_KINDS = new Set(["observed", "current", "future"]);
const WGR_PHASES = new Set(["observed", "predicted", "extrapolated", "aggregated", "uncertain", "unavailable"]);
const WGR_STATES = new Set(["fresh", "stale", "degraded", "unavailable"]);
const PROJECTION_STATUSES = new Set(["available", "text-only", "unavailable"]);
const CONFIDENCE_LABELS = new Set(["high", "medium", "low", "unknown", "unavailable"]);
const VISUAL_TYPES = new Set(["tile", "image", "image-overlay", "data-image", "none"]);
const FUTURE_PROJECTION_HORIZONS_MINUTES = [15, 30];
const FUTURE_PROJECTION_MAX_LATEST_AGE_MINUTES = 20;
const FUTURE_PROJECTION_MIN_INTERVAL_MINUTES = 3;
const FUTURE_PROJECTION_MAX_INTERVAL_MINUTES = 20;
const WGR_FUSION_HORIZONS = [
  { key: "now", horizonMinutes: 0, label: "now" },
  { key: "+15 min", horizonMinutes: 15, label: "+15 min" },
  { key: "+30 min", horizonMinutes: 30, label: "+30 min" }
];
const FUSION_RAIN_THRESHOLD_MM = 0.1;
const FUSION_RAIN_PROBABILITY_THRESHOLD = 0.35;
const NARRATIVE_LOCALE = "fr-FR";
const NARRATIVE_TECHNICAL_PATTERN = /\b(nativeLayer|fallbackReason|HDF5|token|apikey|api_key|authorization|bearer|payload|score:|https?:\/\/)\b/i;
const SENSITIVE_KEY_PATTERN = /(api|token|secret|key|authorization|header|cookie|signed|url|payload|raw|mac|imei)/i;
const URL_PATTERN = /https?:\/\//i;
const SENSITIVE_URL_PATTERN = /(token|apikey|api_key|bearer|authorization|signature|signed|secret|credential|password)/i;

export function normalizeRadarFrame(frame = {}, options = {}) {
  const source = normalizeSourceId(frame.source || options.source || "unknown");
  const timestamp = normalizeIsoDate(frame.timestamp || frame.frameTime || frame.validityTime);
  const fetchedAt = normalizeIsoDate(frame.fetchedAt || options.fetchedAt);
  const ageMinutes = computeAgeMinutes(timestamp, options.now || frame.now);
  const bounds = normalizeBounds(frame.bounds);

  return pruneNullish({
    type: "RadarFrame",
    source,
    timestamp,
    fetchedAt,
    ageMinutes,
    intensity: normalizeIntensity(frame.intensity),
    confidence: normalizeConfidence(frame.confidence),
    georeferencing: {
      projection: normalizeString(frame.projection),
      bounds,
      resolutionMeters: finiteOrNull(frame.resolutionMeters)
    },
    quality: normalizeQuality(frame.quality),
    origin: normalizeSourceId(frame.origin || source),
    fallbackReason: normalizeString(frame.fallbackReason),
    derivedFrom: normalizeDerivedFrom(frame.derivedFrom)
  });
}

export function normalizeRadarSequence(input = {}, options = {}) {
  const source = normalizeSourceId(input.source || options.source || "unknown");
  const frames = Array.isArray(input.frames)
    ? input.frames.map((frame) => normalizeRadarFrame(frame, { ...options, source })).filter((frame) => frame.timestamp || frame.fetchedAt)
    : [];

  frames.sort(compareTimestampLike);

  return {
    type: "RadarSequence",
    source,
    fetchedAt: normalizeIsoDate(input.fetchedAt || options.fetchedAt),
    frames,
    latestFrame: frames[frames.length - 1] || null,
    status: normalizeRadarSourceStatus({
      ...input.status,
      source,
      fetchedAt: input.fetchedAt || options.fetchedAt,
      latestFrameAt: frames[frames.length - 1]?.timestamp || null,
      ok: input.ok ?? frames.length > 0
    }, options)
  };
}

export function normalizeRadarSourceStatus(input = {}, options = {}) {
  const source = normalizeSourceId(input.source || options.source || "unknown");
  const fetchedAt = normalizeIsoDate(input.fetchedAt || options.fetchedAt);
  const latestFrameAt = normalizeIsoDate(input.latestFrameAt || input.validityTime || input.frameTime || input.timestamp);
  const ageMinutes = computeAgeMinutes(latestFrameAt || fetchedAt, options.now || input.now);
  const freshnessLimitMinutes = finiteOrNull(input.freshnessLimitMinutes) || DEFAULT_FRESHNESS_LIMIT_MINUTES;
  const available = input.ok === true || input.available === true;
  const classifiedFreshness = available ? classifyFreshness(ageMinutes, freshnessLimitMinutes) : "unavailable";
  const freshness = normalizeWgrState(input.state || input.freshness) || (classifiedFreshness === "unknown" && available ? "degraded" : classifiedFreshness);

  return {
    type: "RadarSourceStatus",
    source,
    available,
    freshness,
    state: freshness,
    fetchedAt,
    latestFrameAt,
    ageMinutes,
    freshnessMinutes: ageMinutes,
    quality: normalizeQuality(input.quality),
    fallbackReason: normalizeString(input.fallbackReason || input.reason),
    error: normalizeString(input.error),
    derivedFrom: normalizeDerivedFrom(input.derivedFrom),
    publicSafe: true
  };
}

export function normalizeWgrSourceContribution(input = {}, options = {}) {
  const id = normalizeSourceId(input.id || input.source || options.id || "unknown");
  const timestamp = normalizeIsoDate(input.timestamp || input.latestFrameAt || input.updatedAt || input.validityTime || input.frameTime);
  const fetchedAt = normalizeIsoDate(input.fetchedAt || options.fetchedAt);
  const freshnessMinutes = computeAgeMinutes(timestamp || fetchedAt, options.now || input.now);
  const available = input.available === true || input.ok === true;
  const ignored = input.ignored === true || input.used === false;
  const used = available && !ignored && input.used !== false;
  const classifiedFreshness = available ? classifyFreshness(freshnessMinutes, finiteOrNull(input.freshnessLimitMinutes) || DEFAULT_FRESHNESS_LIMIT_MINUTES) : "unavailable";
  const state = normalizeWgrState(input.state || input.freshness) || (classifiedFreshness === "unknown" && available ? "degraded" : classifiedFreshness);

  return {
    type: "WgrSourceContribution",
    id,
    source: id,
    role: normalizeString(input.role || options.role || inferSourceRole(id)),
    available,
    used,
    ignored: !used,
    ignoreReason: used ? null : normalizeString(input.ignoreReason || input.reason || input.fallbackReason || (available ? "not selected for this WGR synthesis" : "source unavailable")),
    timestamp,
    fetchedAt,
    freshness: state,
    state,
    freshnessMinutes,
    confidence: normalizeConfidence(input.confidence ?? input.quality?.score),
    quality: normalizeQuality(input.quality || { ok: available, reason: input.reason || input.error || input.fallbackReason }),
    derivedFrom: normalizeDerivedFrom(input.derivedFrom),
    motionVector: normalizeMotionVector(input.motionVector || input.motion),
    diagnostics: sanitizePublicDiagnostics(input.diagnostics),
    publicSafe: true
  };
}

export function normalizeWgrTimelineFrame(input = {}, options = {}) {
  const kind = normalizeTimelineKind(input.kind || options.kind);
  const phase = normalizeWgrPhase(input.phase || input.status || input.availability || options.phase);
  const available = input.available === false ? false : !["unavailable", "uncertain"].includes(phase);
  const timestamp = normalizeIsoDate(input.timestamp || input.validityTime || input.frameTime);
  const sourceId = normalizeSourceId(input.sourceId || input.frameSource || input.provider || firstSource(input.contributors || input.sources || input.sourcesUsed) || options.sourceId);
  const ageMinutes = computeAgeMinutes(timestamp, options.now || input.now);
  const freshness = normalizeWgrState(input.freshness || input.state)
    || (available ? normalizeWgrState(classifyFreshness(ageMinutes, finiteOrNull(input.freshnessLimitMinutes) || DEFAULT_FRESHNESS_LIMIT_MINUTES)) || "degraded" : "unavailable");
  const tileUrlTemplate = sanitizeVisualUrl(input.tileUrlTemplate);
  const imageUrl = sanitizeVisualUrl(input.imageUrl);
  const imageDataUrl = sanitizeImageDataUrl(input.imageDataUrl);
  const bounds = normalizeBounds(input.bounds);
  const visualType = normalizeVisualType(input.visualType, { tileUrlTemplate, imageUrl, imageDataUrl, bounds });
  const contributors = normalizeSourceList(input.contributors || input.sources || input.sourcesUsed || (sourceId ? [sourceId] : []));

  return {
    type: "WgrTimelineFrame",
    source: WGR_SOURCE_ID,
    id: normalizeString(input.id) || buildFrameId(sourceId, timestamp, kind),
    sourceId,
    sourceLabel: normalizeString(input.sourceLabel) || sourceLabel(sourceId),
    kind,
    phase,
    available,
    timestamp,
    ageMinutes,
    freshness,
    visualType,
    tileUrlTemplate,
    imageUrl,
    imageDataUrl,
    bounds,
    opacity: normalizeOpacity(input.opacity),
    label: normalizeString(input.label),
    reason: normalizeString(input.reason || input.explanation),
    contributors,
    derivedFrom: normalizeDerivedFrom(input.derivedFrom),
    confidence: normalizeConfidence(input.confidence),
    motionVector: normalizeMotionVector(input.motionVector || input.motion),
    diagnostics: sanitizePublicDiagnostics(input.diagnostics),
    publicSafe: true
  };
}

export function buildWgrTimeline(input = {}, options = {}) {
  const timelineNow = options.now || input.generatedAt || options.generatedAt;
  const observedFrames = normalizeTimelineFrames(input.observedFrames, { ...options, now: timelineNow, kind: "observed", phase: "observed" });
  const futureFrames = normalizeTimelineFrames(input.futureFrames, { ...options, now: timelineNow, kind: "future", phase: "unavailable" });
  const currentFrame = input.currentFrame
    ? normalizeWgrTimelineFrame(input.currentFrame, { ...options, now: timelineNow, kind: "current", phase: "aggregated" })
    : buildCurrentTimelineFrame(observedFrames, futureFrames);
  const playbackAvailable = input.playbackAvailable === true || (input.playbackAvailable !== false && observedFrames.filter((frame) => frame.available).length > 1);
  const sources = normalizeSourceList(input.sources || observedFrames.map((frame) => frame.sourceId));

  return {
    type: "WgrTimeline",
    generatedAt: normalizeIsoDate(input.generatedAt || options.generatedAt) || new Date(0).toISOString(),
    observedFrames,
    currentFrame,
    futureFrames,
    frameCount: observedFrames.length,
    playbackAvailable,
    playbackReason: normalizeString(input.playbackReason) || buildPlaybackReason(observedFrames, playbackAvailable),
    timeRange: buildTimeRange(observedFrames),
    sources,
    freshness: currentFrame?.freshness || (observedFrames.length ? "degraded" : "unavailable"),
    diagnostics: sanitizePublicDiagnostics({
      ...input.diagnostics,
      frameCount: observedFrames.length,
      playbackAvailable,
      sources
    }),
    frames: [...observedFrames, ...(currentFrame ? [currentFrame] : []), ...futureFrames]
      .filter(Boolean)
      .sort(compareTimestampLike),
    explanation: normalizeString(input.explanation)
  };
}

export function buildUnavailableFutureFrame({ now = new Date(), minutes = 30, reason } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const timestamp = Number.isNaN(nowDate.getTime()) ? null : new Date(nowDate.getTime() + minutes * 60_000).toISOString();

  return normalizeWgrTimelineFrame({
    kind: "future",
    phase: "unavailable",
    available: false,
    timestamp,
    label: `+${minutes} min`,
    reason: reason || `Projection +${minutes} min indisponible : aucune source suffisante dans ce modèle de test.`
  });
}

export function normalizeRadarSynthesis(input = {}) {
  const generatedAt = normalizeIsoDate(input.generatedAt) || new Date(0).toISOString();
  const contributions = Array.isArray(input.contributions)
    ? input.contributions.map((item) => normalizeWgrSourceContribution(item, { now: generatedAt }))
    : [];
  const sourcesUsed = normalizeSourceList(input.sourcesUsed || contributions.filter((item) => item.used).map((item) => item.id));
  const sourcesIgnored = normalizeSourceList(input.sourcesIgnored || contributions.filter((item) => item.ignored).map((item) => item.id));
  const globalState = normalizeWgrState(input.globalState) || deriveGlobalState(input.state, input.sourceStatus, contributions);
  const timeline = buildWgrTimeline(input.timeline || {}, { generatedAt });
  const futureProjection = normalizeFutureProjection(input.futureProjection, { generatedAt });
  const fusion = normalizeWgrFusion(input.fusion, { generatedAt });
  const confidence = normalizeConfidence(input.confidence);
  const confidenceReasons = normalizeStringList(input.confidenceReasons);
  const degradationReasons = normalizeStringList(input.degradationReasons);
  const sourceStatus = Array.isArray(input.sourceStatus) ? input.sourceStatus.map((status) => normalizeRadarSourceStatus(status)) : [];
  const narrative = normalizeWgrNarrative(input.narrative || buildWgrNarrative({
    generatedAt,
    state: input.state,
    globalState,
    observedRain: input.observedRain,
    imminentRain: input.imminentRain,
    intensity: input.intensity,
    confidence,
    confidenceReasons,
    degradationReasons,
    fusion,
    timeline,
    futureProjection,
    contributions,
    sourcesUsed,
    sourcesIgnored
  }), { generatedAt });

  return {
    type: "RadarSynthesis",
    mode: "WGR",
    source: WGR_SOURCE_ID,
    generatedAt,
    state: normalizeString(input.state || "unavailable"),
    globalState,
    observedRain: input.observedRain === true,
    imminentRain: input.imminentRain === true,
    etaMinutes: finiteOrNull(input.etaMinutes),
    intensity: normalizeIntensity(input.intensity),
    confidence,
    confidenceReasons,
    degradationReasons,
    coherence: normalizeString(input.coherence || "unknown"),
    sourceStatus,
    contributions,
    sourcesUsed,
    sourcesIgnored,
    finalLayer: normalizeWgrFinalLayer(input.finalLayer, sourcesUsed),
    timeline,
    futureProjection,
    fusion,
    narrative,
    headline: normalizeString(input.headline) || narrative.headline,
    diagnostics: sanitizePublicDiagnostics(input.diagnostics || buildPublicDiagnostics({ globalState, sourcesUsed, sourcesIgnored })),
    derivedFrom: normalizeDerivedFrom(input.derivedFrom),
    explanations: normalizeStringList(input.explanations),
    publicSafe: true
  };
}

export function buildWgrNarrative({
  generatedAt = new Date(),
  state = null,
  globalState = null,
  observedRain = false,
  imminentRain = false,
  intensity = null,
  confidence = null,
  confidenceReasons = [],
  degradationReasons = [],
  fusion = null,
  timeline = null,
  futureProjection = null,
  contributions = [],
  sourcesUsed = [],
  sourcesIgnored = [],
  rain = null
} = {}) {
  const generatedIso = normalizeIsoDate(generatedAt) || new Date(0).toISOString();
  const normalizedFusion = normalizeWgrFusion(fusion || {}, { generatedAt: generatedIso });
  const normalizedTimeline = timeline?.type === "WgrTimeline" ? timeline : buildWgrTimeline(timeline || {}, { generatedAt: generatedIso });
  const projection = normalizeFutureProjection(futureProjection || {}, { generatedAt: generatedIso });
  const normalizedContributions = Array.isArray(contributions)
    ? contributions.map((item) => item?.type === "WgrSourceContribution" ? item : normalizeWgrSourceContribution(item, { now: generatedIso }))
    : [];
  const signals = collectNarrativeSignals({
    generatedAt: generatedIso,
    state,
    globalState,
    observedRain,
    imminentRain,
    intensity,
    confidence,
    confidenceReasons,
    degradationReasons,
    fusion: normalizedFusion,
    timeline: normalizedTimeline,
    futureProjection: projection,
    contributions: normalizedContributions,
    sourcesUsed,
    sourcesIgnored,
    rain
  });
  const scenario = pickNarrativeScenario(signals);
  const text = buildNarrativeText(signals, scenario);
  const available = scenario !== "unavailable";

  return normalizeWgrNarrative({
    available,
    status: available ? signals.degraded ? "degraded" : "available" : "unavailable",
    generatedAt: generatedIso,
    locale: NARRATIVE_LOCALE,
    scenario,
    severity: signals.degraded || signals.divergent ? "watch" : "info",
    headline: text.headline,
    details: text.details,
    advice: text.advice,
    confidenceText: text.confidenceText,
    limitText: text.limitText,
    sourceSummary: text.sourceSummary,
    timeSummary: text.timeSummary,
    tags: buildNarrativeTags(signals, scenario),
    evidence: buildNarrativeEvidence(signals),
    diagnostics: {
      scenario,
      disagreementCount: signals.disagreements.length,
      sourceCount: signals.allSources.length,
      staleSourceCount: signals.staleSources.length,
      publicSafe: true
    }
  }, { generatedAt: generatedIso });
}

export function classifyFreshness(ageMinutes, limitMinutes = DEFAULT_FRESHNESS_LIMIT_MINUTES) {
  if (!Number.isFinite(ageMinutes)) {
    return "unknown";
  }

  return ageMinutes <= limitMinutes ? "fresh" : "stale";
}

export function confidenceLabel(value) {
  if (!Number.isFinite(value)) {
    return "unknown";
  }

  if (value >= 0.75) {
    return "high";
  }

  if (value >= 0.45) {
    return "medium";
  }

  return "low";
}

function buildCurrentTimelineFrame(observedFrames, futureFrames) {
  const latestObserved = observedFrames[observedFrames.length - 1] || null;

  if (latestObserved) {
    return normalizeWgrTimelineFrame({
      ...latestObserved,
      kind: "current",
      phase: "aggregated",
      contributors: latestObserved.contributors,
      derivedFrom: latestObserved.derivedFrom
    });
  }

  if (futureFrames.length > 0) {
    return normalizeWgrTimelineFrame({
      kind: "current",
      phase: "unavailable",
      available: false,
      reason: "Aucune frame observée disponible pour construire la frame WGR actuelle."
    });
  }

  return null;
}

function buildPlaybackReason(observedFrames, playbackAvailable) {
  if (playbackAvailable) {
    return "Plusieurs frames radar observées réelles disponibles.";
  }

  if (observedFrames.length === 1) {
    return observedFrames[0].sourceId === "meteofrance-radar"
      ? "Météo-France fournit une seule image observée dans ce refresh."
      : "Une seule frame radar observée disponible ; playback désactivé.";
  }

  return "Aucune frame radar observée disponible.";
}

function buildTimeRange(frames) {
  const timestamps = frames.map((frame) => frame.timestamp).filter(Boolean).sort();

  return {
    start: timestamps[0] || null,
    end: timestamps[timestamps.length - 1] || null
  };
}

function buildFrameId(sourceId, timestamp, kind) {
  const compactTimestamp = timestamp ? timestamp.replace(/[^0-9]/g, "").slice(0, 14) : "unknown-time";
  return [kind || "frame", sourceId || "unknown", compactTimestamp].join("-");
}

function normalizeTimelineFrames(frames, options) {
  if (!Array.isArray(frames)) {
    return [];
  }

  return frames
    .map((frame) => normalizeWgrTimelineFrame(frame, options))
    .filter((frame) => frame.timestamp || frame.phase === "unavailable")
    .sort(compareTimestampLike);
}

function normalizeWgrFinalLayer(input = {}, sourcesUsed = []) {
  return {
    id: WGR_SOURCE_ID,
    source: WGR_SOURCE_ID,
    kind: normalizeWgrPhase(input.kind || input.phase || "aggregated"),
    available: input.available !== false && sourcesUsed.length > 0,
    contributors: normalizeSourceList(input.contributors || sourcesUsed),
    visualSourceId: normalizeSourceId(input.visualSourceId),
    visualSourceLabel: normalizeString(input.visualSourceLabel) || sourceLabel(input.visualSourceId),
    visualType: normalizeVisualType(input.visualType),
    playbackAvailable: input.playbackAvailable === true,
    futureProjectionAvailable: input.futureProjectionAvailable === true,
    publicSafe: true
  };
}

export function buildWgrFutureProjection({
  observedFrames = [],
  generatedAt = new Date(),
  horizonsMinutes = FUTURE_PROJECTION_HORIZONS_MINUTES
} = {}) {
  const rawObservedFrames = Array.isArray(observedFrames) ? observedFrames : [];
  const invalidTimestampCount = rawObservedFrames.filter((frame) => !isValidIsoDate(frame?.timestamp || frame?.validityTime || frame?.frameTime)).length;
  const unavailable = (reason, diagnostics = {}) => normalizeFutureProjection({
    available: false,
    status: "unavailable",
    method: "none",
    horizonMinutes: Math.max(...horizonsMinutes),
    frames: [],
    confidence: { score: null, label: "unavailable" },
    confidenceReasons: [],
    degradationReasons: [reason],
    reason: `Projection +${Math.max(...horizonsMinutes)} min indisponible : ${reason}`,
    generatedAt,
    sourceFrameIds: rawObservedFrames.map((frame) => normalizeString(frame?.id)).filter(Boolean),
    sourceIds: normalizeSourceList(rawObservedFrames.map((frame) => frame?.sourceId || frame?.frameSource || frame?.provider)),
    diagnostics
  }, { generatedAt });

  if (invalidTimestampCount > 0) {
    return unavailable("Observed frame timestamps are invalid.", { invalidTimestampCount });
  }

  const normalizedObservedFrames = normalizeTimelineFrames(observedFrames, {
    generatedAt,
    now: generatedAt,
    kind: "observed",
    phase: "observed"
  }).filter((frame) => frame.available);
  if (normalizedObservedFrames.length < 2) {
    return unavailable("Insufficient observed frames.", { observedFrameCount: normalizedObservedFrames.length });
  }

  const sortedFrames = [...normalizedObservedFrames].sort(compareTimestampLike);
  const framesWithValidTimestamps = sortedFrames.filter((frame) => isValidIsoDate(frame.timestamp));
  if (framesWithValidTimestamps.length !== sortedFrames.length) {
    return unavailable("Observed frame timestamps are invalid.", { observedFrameCount: sortedFrames.length });
  }

  const latestFrame = sortedFrames[sortedFrames.length - 1];
  const previousFrame = sortedFrames[sortedFrames.length - 2];
  const generatedDate = parseDate(generatedAt);
  const latestDate = parseDate(latestFrame.timestamp);
  const previousDate = parseDate(previousFrame.timestamp);
  const latestAgeMinutes = computeAgeMinutes(latestFrame.timestamp, generatedDate);

  if (!Number.isFinite(latestAgeMinutes) || latestAgeMinutes > FUTURE_PROJECTION_MAX_LATEST_AGE_MINUTES || latestFrame.freshness === "stale") {
    return unavailable("Observed frames are too old.", { latestAgeMinutes });
  }

  if (latestFrame.sourceId !== previousFrame.sourceId) {
    return unavailable("Observed frames come from incompatible sources.", {
      sourceIds: normalizeSourceList([previousFrame.sourceId, latestFrame.sourceId])
    });
  }

  const intervalMinutes = Math.round((latestDate.getTime() - previousDate.getTime()) / 60_000);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < FUTURE_PROJECTION_MIN_INTERVAL_MINUTES || intervalMinutes > FUTURE_PROJECTION_MAX_INTERVAL_MINUTES) {
    return unavailable("Observed frame timestamps are not regular enough.", { intervalMinutes });
  }

  if (!hasUsableVisualReference(latestFrame) || !hasUsableVisualReference(previousFrame) || latestFrame.visualType !== previousFrame.visualType) {
    return unavailable("Observed frames are not visually compatible.", {
      visualTypes: [previousFrame.visualType, latestFrame.visualType].filter(Boolean)
    });
  }

  const motionVector = normalizeMotionVector(latestFrame.motionVector || previousFrame.motionVector);
  if (!motionVector) {
    return unavailable("Motion estimation unavailable for this source.", {
      sourceId: latestFrame.sourceId,
      frameCount: sortedFrames.length
    });
  }

  const sourceFrameIds = [previousFrame.id, latestFrame.id].filter(Boolean);
  const confidence = computeProjectionConfidence({
    frameCount: sortedFrames.length,
    latestAgeMinutes,
    intervalMinutes,
    motionVector
  });
  const frames = horizonsMinutes.map((minutes) => buildExtrapolatedProjectionFrame({
    baseTimestamp: latestFrame.timestamp,
    horizonMinutes: minutes,
    sourceFrameIds,
    confidence,
    motionVector
  }));

  return normalizeFutureProjection({
    available: true,
    status: "available",
    method: "metadata-motion-vector",
    horizonMinutes: Math.max(...horizonsMinutes),
    frames,
    confidence,
    confidenceReasons: [
      "multiple_observed_frames",
      "fresh_current_observed_frame",
      "compatible_radar_source",
      "regular_observed_timestamps",
      "motion_vector_available"
    ],
    degradationReasons: confidence.score < 0.75 ? ["projection_confidence_not_high"] : [],
    sourceFrameIds,
    sourceIds: [latestFrame.sourceId],
    generatedAt,
    validUntil: addMinutes(latestFrame.timestamp, Math.max(...horizonsMinutes)),
    playbackAvailable: frames.length > 1,
    diagnostics: {
      sourceFrameCount: sortedFrames.length,
      intervalMinutes,
      latestAgeMinutes,
      motionVector
    }
  }, { generatedAt });
}


export function buildWgrFusion({
  generatedAt = new Date(),
  timeline = null,
  observedTimeline = null,
  futureProjection = null,
  radarSignal = null,
  modelSignals = [],
  stationSignal = null
} = {}) {
  const generatedIso = normalizeIsoDate(generatedAt) || new Date(0).toISOString();
  const observed = timeline || observedTimeline || {};
  const projection = normalizeFutureProjection(futureProjection || {}, { generatedAt: generatedIso });
  const radar = normalizeFusionRadarSignal(radarSignal || buildRadarSignalFromTimeline(observed), { generatedAt: generatedIso });
  const models = Array.isArray(modelSignals)
    ? modelSignals.map((signal) => normalizeFusionModelSignal(signal, { generatedAt: generatedIso })).filter((signal) => signal.sourceId)
    : [];
  const station = normalizeFusionStationSignal(stationSignal || {}, { generatedAt: generatedIso });
  const horizons = WGR_FUSION_HORIZONS.map((horizon) => buildFusionHorizon({
    horizon,
    radar,
    projection,
    models,
    station
  }));
  const disagreements = detectFusionDisagreements({ radar, models, station, horizons });
  const sourcesUsed = collectFusionSourcesUsed({ radar, projection, models, station, horizons });
  const sourcesIgnored = collectFusionSourcesIgnored({ radar, models, station });
  const available = sourcesUsed.length > 0;
  const confidence = computeFusionConfidence({ available, horizons, disagreements, radar, models, station });
  const confidenceReasons = collectFusionConfidenceReasons({ horizons, radar, models, station, projection, disagreements });
  const degradationReasons = collectFusionDegradationReasons({ available, disagreements, radar, models, station, sourcesIgnored });
  const status = !available ? "unavailable" : degradationReasons.length > 0 ? "degraded" : "available";

  return normalizeWgrFusion({
    available,
    status,
    method: "weighted-evidence-v1",
    generatedAt: generatedIso,
    horizons,
    localRainSignal: buildLocalRainSignal(horizons, radar, models, station, projection),
    radarSignal: radar,
    modelSignal: buildModelSignalSummary(models),
    stationSignal: station,
    confidence,
    confidenceReasons,
    degradationReasons,
    disagreements,
    sourcesUsed,
    sourcesIgnored,
    diagnostics: {
      horizonCount: horizons.length,
      disagreementCount: disagreements.length,
      predictionObservationSeparated: true,
      uncertaintyExplicit: true,
      kalmanReady: true
    }
  }, { generatedAt: generatedIso });
}

function normalizeWgrFusion(input = {}, options = {}) {
  const generatedAt = normalizeIsoDate(input.generatedAt || options.generatedAt) || new Date(0).toISOString();
  const horizons = Array.isArray(input.horizons)
    ? input.horizons.map((horizon) => normalizeFusionHorizon(horizon)).filter((horizon) => horizon.key)
    : [];
  const available = input.available === true || horizons.some((horizon) => horizon.available);
  const status = normalizeString(input.status || input.state) || (available ? "available" : "unavailable");

  return {
    type: "WgrFusion",
    available,
    status,
    state: status,
    method: normalizeString(input.method) || "weighted-evidence-v1",
    generatedAt,
    horizons,
    localRainSignal: normalizeFusionObject(input.localRainSignal),
    radarSignal: normalizeFusionObject(input.radarSignal),
    modelSignal: normalizeFusionObject(input.modelSignal),
    stationSignal: normalizeFusionObject(input.stationSignal),
    confidence: normalizeConfidence(input.confidence || { score: null, label: available ? "unknown" : "unavailable" }),
    confidenceReasons: normalizeStringList(input.confidenceReasons),
    degradationReasons: normalizeStringList(input.degradationReasons),
    disagreements: normalizeFusionDisagreements(input.disagreements),
    sourcesUsed: normalizeSourceList(input.sourcesUsed),
    sourcesIgnored: normalizeSourceList(input.sourcesIgnored),
    diagnostics: sanitizePublicDiagnostics(input.diagnostics),
    publicSafe: true
  };
}

function normalizeFusionHorizon(input = {}) {
  const horizonMinutes = finiteOrNull(input.horizonMinutes);
  const probability = clampNumber(input.probability, 0, 1);
  const confidence = normalizeConfidence(input.confidence);
  const available = input.available !== false && (Number.isFinite(probability) || normalizeSourceList(input.sourcesUsed).length > 0);

  return {
    key: normalizeString(input.key) || (Number.isFinite(horizonMinutes) ? `+${horizonMinutes} min` : null),
    horizonMinutes,
    label: normalizeString(input.label),
    available,
    status: normalizeString(input.status || input.state) || (available ? "available" : "unavailable"),
    rainLikely: input.rainLikely === true,
    intensity: normalizeIntensity(input.intensity),
    probability,
    sourceDominant: normalizeSourceId(input.sourceDominant),
    confidence,
    reasons: normalizeStringList(input.reasons),
    degradationReasons: normalizeStringList(input.degradationReasons),
    sourcesUsed: normalizeSourceList(input.sourcesUsed),
    sourcesIgnored: normalizeSourceList(input.sourcesIgnored),
    diagnostics: sanitizePublicDiagnostics(input.diagnostics),
    publicSafe: true
  };
}

function buildFusionHorizon({ horizon, radar, projection, models, station }) {
  const evidence = [];
  const reasons = [];
  const degradationReasons = [];
  const horizonMinutes = horizon.horizonMinutes;

  if (radar.available && horizonMinutes === 0) {
    evidence.push(buildFusionEvidence({
      sourceId: radar.sourceId,
      role: "radar-observation",
      probability: radar.rainLikely ? 0.9 : 0.15,
      weight: radar.freshness === "fresh" ? 0.45 : 0.2,
      precipitationMm: radar.precipitationMm,
      reason: radar.rainLikely ? "fresh_radar_observed_rain" : "radar_observed_no_local_rain_amount"
    }));
    reasons.push(radar.rainLikely ? "Radar observed rain contributes to current local rain." : "Radar is available but does not prove local rain.");
  }

  if (projection.available && horizonMinutes > 0) {
    const frame = projection.frames.find((item) => item.horizonMinutes === horizonMinutes && item.available);
    if (frame) {
      evidence.push(buildFusionEvidence({
        sourceId: "wgr",
        role: "radar-extrapolation",
        probability: radar.rainLikely ? 0.65 : 0.25,
        weight: 0.28,
        precipitationMm: radar.precipitationMm,
        reason: radar.rainLikely ? "radar_extrapolation_available" : "radar_motion_available_without_rain_amount"
      }));
      reasons.push(`Radar extrapolation contributes to ${horizon.label}.`);
    }
  }

  models.forEach((model) => {
    const modelHorizon = pickFusionModelHorizon(model, horizonMinutes);
    if (!model.available || model.freshness === "unavailable" || !modelHorizon?.available) {
      return;
    }

    const modelProbability = modelHorizon.probability ?? precipitationToProbability(modelHorizon.precipitationMm);
    evidence.push(buildFusionEvidence({
      sourceId: model.sourceId,
      role: model.role,
      probability: modelProbability,
      weight: model.sourceId === "open-meteo-arome" ? 0.34 : 0.2,
      precipitationMm: modelHorizon.precipitationMm,
      reason: modelHorizon.rainLikely ? `${model.sourceId}_predicts_rain` : `${model.sourceId}_predicts_dry`
    }));
    reasons.push(`${sourceLabel(model.sourceId)} contributes to ${horizon.label}.`);
  });

  if (station.available && station.freshness === "fresh") {
    const stationProbability = pickStationFusionProbability(station, horizonMinutes);
    const stationWeight = horizonMinutes === 0 ? 0.35 : horizonMinutes <= 15 ? 0.12 : 0.05;
    evidence.push(buildFusionEvidence({
      sourceId: "ecowitt",
      role: "local-observation",
      probability: stationProbability,
      weight: stationWeight,
      precipitationMm: station.rainRateMmPerHour,
      reason: station.rainLikely ? "fresh_station_reports_rain" : "fresh_station_context"
    }));
    reasons.push(station.rainLikely ? "Fresh Ecowitt station confirms local rain." : "Fresh Ecowitt station gives local context.");
  } else if (station.available && station.freshness === "stale") {
    degradationReasons.push("ecowitt_stale_for_fusion");
  }

  if (!evidence.length) {
    return normalizeFusionHorizon({
      key: horizon.key,
      horizonMinutes,
      label: horizon.label,
      available: false,
      status: "unavailable",
      rainLikely: false,
      intensity: { level: "unknown", mmPerHour: null },
      probability: null,
      confidence: { score: null, label: "unavailable" },
      reasons: [],
      degradationReasons: ["No usable source for this fusion horizon."],
      sourcesUsed: [],
      sourcesIgnored: []
    });
  }

  const probability = weightedEvidenceProbability(evidence);
  const dominant = evidence.reduce((best, item) => item.weightedProbability > best.weightedProbability ? item : best, evidence[0]);
  const confidence = computeHorizonFusionConfidence({ evidence, probability, degradationReasons });
  const intensity = pickFusionIntensity(evidence);

  return normalizeFusionHorizon({
    key: horizon.key,
    horizonMinutes,
    label: horizon.label,
    available: true,
    status: degradationReasons.length ? "degraded" : "available",
    rainLikely: probability >= FUSION_RAIN_PROBABILITY_THRESHOLD,
    intensity,
    probability,
    sourceDominant: dominant.sourceId,
    confidence,
    reasons: [...reasons, ...evidence.map((item) => item.reason)],
    degradationReasons,
    sourcesUsed: evidence.map((item) => item.sourceId),
    sourcesIgnored: [],
    diagnostics: {
      evidenceCount: evidence.length,
      evidenceRoles: [...new Set(evidence.map((item) => item.role))]
    }
  });
}

function buildFusionEvidence({ sourceId, role, probability, weight, precipitationMm, reason }) {
  const safeProbability = clampNumber(probability, 0, 1) ?? 0;
  const safeWeight = clampNumber(weight, 0, 1) ?? 0;

  return {
    sourceId: normalizeSourceId(sourceId),
    role: normalizeString(role),
    probability: safeProbability,
    weight: safeWeight,
    weightedProbability: safeProbability * safeWeight,
    precipitationMm: finiteOrNull(precipitationMm),
    reason: normalizeString(reason)
  };
}

function normalizeFusionRadarSignal(input = {}, options = {}) {
  const sourceId = normalizeSourceId(input.sourceId || input.source || "wgr");
  const freshness = normalizeWgrState(input.freshness || input.state) || (input.available ? "degraded" : "unavailable");
  const precipitationMm = finiteOrNull(input.precipitationMm ?? input.rainMm);
  const rainLikely = input.rainLikely === true || (Number.isFinite(precipitationMm) && precipitationMm >= FUSION_RAIN_THRESHOLD_MM);

  return {
    type: "WgrFusionRadarSignal",
    sourceId,
    sourceLabel: normalizeString(input.sourceLabel) || sourceLabel(sourceId),
    available: input.available === true,
    freshness,
    rainLikely,
    precipitationMm,
    currentFrameId: normalizeString(input.currentFrameId),
    currentFrameTimestamp: normalizeIsoDate(input.currentFrameTimestamp || input.timestamp),
    confidence: normalizeConfidence(input.confidence),
    degradationReasons: normalizeStringList(input.degradationReasons),
    diagnostics: sanitizePublicDiagnostics(input.diagnostics),
    publicSafe: true
  };
}

function buildRadarSignalFromTimeline(timeline = {}) {
  const currentFrame = timeline.currentFrame || null;
  return {
    sourceId: currentFrame?.sourceId || "wgr",
    sourceLabel: currentFrame?.sourceLabel || null,
    available: currentFrame?.available === true,
    freshness: currentFrame?.freshness || "unavailable",
    currentFrameId: currentFrame?.id || null,
    currentFrameTimestamp: currentFrame?.timestamp || null,
    confidence: currentFrame?.confidence || null
  };
}

function normalizeFusionModelSignal(input = {}, options = {}) {
  const sourceId = normalizeSourceId(input.sourceId || input.source || input.id);
  const available = input.available === true || input.ok === true;
  const freshness = normalizeWgrState(input.freshness || input.state) || (available ? "degraded" : "unavailable");
  const horizons = Array.isArray(input.horizons)
    ? input.horizons.map((horizon) => normalizeFusionModelHorizon(horizon)).filter((horizon) => Number.isFinite(horizon.horizonMinutes))
    : [];

  return {
    type: "WgrFusionModelSignal",
    sourceId,
    sourceLabel: normalizeString(input.sourceLabel) || sourceLabel(sourceId),
    role: normalizeString(input.role || inferSourceRole(sourceId)),
    available,
    freshness,
    horizons,
    confidence: normalizeConfidence(input.confidence),
    degradationReasons: normalizeStringList(input.degradationReasons),
    diagnostics: sanitizePublicDiagnostics(input.diagnostics),
    publicSafe: true
  };
}

function normalizeFusionModelHorizon(input = {}) {
  const horizonMinutes = finiteOrNull(input.horizonMinutes ?? input.minutes);
  const precipitationMm = finiteOrNull(input.precipitationMm ?? input.rainMm ?? input.precipitation);
  const probability = clampNumber(input.probability ?? input.rainProbability, 0, 1) ?? precipitationToProbability(precipitationMm);
  const rainLikely = input.rainLikely === true || probability >= FUSION_RAIN_PROBABILITY_THRESHOLD || (Number.isFinite(precipitationMm) && precipitationMm >= FUSION_RAIN_THRESHOLD_MM);

  return {
    horizonMinutes,
    available: input.available !== false && (Number.isFinite(precipitationMm) || Number.isFinite(probability)),
    precipitationMm,
    probability,
    rainLikely,
    intensity: normalizeIntensity(input.intensity || { level: intensityLevelFromMm(precipitationMm), mmPerHour: precipitationMm }),
    publicSafe: true
  };
}

function normalizeFusionStationSignal(input = {}, options = {}) {
  const available = input.available === true || input.ok === true;
  const freshness = normalizeWgrState(input.freshness || input.state) || (available ? "degraded" : "unavailable");
  const rainRateMmPerHour = finiteOrNull(input.rainRateMmPerHour ?? input.precipitationMm ?? input.rainMm);
  const humidityPct = finiteOrNull(input.humidityPct ?? input.relativeHumidityPct);

  return {
    type: "WgrFusionStationSignal",
    sourceId: "ecowitt",
    sourceLabel: normalizeString(input.sourceLabel || input.label) || sourceLabel("ecowitt"),
    available,
    freshness,
    rainLikely: input.rainLikely === true || (Number.isFinite(rainRateMmPerHour) && rainRateMmPerHour >= FUSION_RAIN_THRESHOLD_MM),
    rainRateMmPerHour,
    humidityPct,
    temperatureC: finiteOrNull(input.temperatureC),
    pressureHpa: finiteOrNull(input.pressureHpa),
    confidence: normalizeConfidence(input.confidence),
    degradationReasons: normalizeStringList(input.degradationReasons),
    diagnostics: sanitizePublicDiagnostics(input.diagnostics),
    publicSafe: true
  };
}

function pickStationFusionProbability(station, horizonMinutes) {
  if (horizonMinutes === 0) {
    return station.rainLikely ? 0.95 : station.humidityPct >= 85 ? 0.18 : 0.08;
  }

  if (station.rainLikely && horizonMinutes <= 15) {
    return 0.4;
  }

  if (station.humidityPct >= 85) {
    return 0.18;
  }

  return 0.08;
}

function pickFusionModelHorizon(model, horizonMinutes) {
  return model.horizons.find((horizon) => horizon.horizonMinutes === horizonMinutes)
    || model.horizons.find((horizon) => horizon.horizonMinutes >= horizonMinutes)
    || null;
}

function precipitationToProbability(precipitationMm) {
  if (!Number.isFinite(precipitationMm)) {
    return null;
  }

  return clampNumber(precipitationMm / 1.2, 0, 1);
}

function weightedEvidenceProbability(evidence) {
  const totalWeight = evidence.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  return Number((evidence.reduce((sum, item) => sum + item.weightedProbability, 0) / totalWeight).toFixed(2));
}

function computeHorizonFusionConfidence({ evidence, probability, degradationReasons }) {
  if (!evidence.length || !Number.isFinite(probability)) {
    return { score: null, label: "unavailable" };
  }

  let score = 0.35 + Math.min(0.3, evidence.length * 0.08);
  const hasObservation = evidence.some((item) => ["radar-observation", "local-observation"].includes(item.role));
  const hasPrediction = evidence.some((item) => ["forecast-primary", "forecast-confirmation", "radar-extrapolation"].includes(item.role));

  if (hasObservation && hasPrediction) {
    score += 0.18;
  }

  if (degradationReasons.length) {
    score -= 0.18;
  }

  score = clampNumber(Number(score.toFixed(2)), 0, 0.92);
  return { score, label: confidenceLabel(score) };
}

function computeFusionConfidence({ available, horizons, disagreements, radar, models, station }) {
  if (!available) {
    return { score: null, label: "unavailable" };
  }

  const scores = horizons.map((horizon) => horizon.confidence?.score).filter(Number.isFinite);
  const averageScore = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0.35;
  const modelCount = models.filter((model) => model.available && model.freshness !== "unavailable").length;
  let score = averageScore;

  if (radar.available && radar.freshness === "fresh") {
    score += 0.08;
  }

  if (station.available && station.freshness === "fresh") {
    score += 0.06;
  }

  if (modelCount >= 2) {
    score += 0.06;
  }

  if (disagreements.length) {
    score -= Math.min(0.28, disagreements.length * 0.12);
  }

  score = clampNumber(Number(score.toFixed(2)), 0, 0.95);
  return { score, label: confidenceLabel(score) };
}

function pickFusionIntensity(evidence) {
  const maxRain = Math.max(...evidence.map((item) => item.precipitationMm).filter(Number.isFinite), 0);
  return { level: intensityLevelFromMm(maxRain), mmPerHour: maxRain || null };
}

function intensityLevelFromMm(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "none";
  }

  if (value < 0.5) {
    return "light";
  }

  if (value < 3) {
    return "moderate";
  }

  return "heavy";
}

function detectFusionDisagreements({ radar, models, station, horizons }) {
  const disagreements = [];
  const nowHorizon = horizons.find((horizon) => horizon.horizonMinutes === 0);
  const futureHorizons = horizons.filter((horizon) => horizon.horizonMinutes > 0);
  const primaryModel = models.find((model) => model.sourceId === "open-meteo-arome" && model.available && model.freshness !== "unavailable");
  const confirmationModel = models.find((model) => model.sourceId === "met-norway" && model.available && model.freshness !== "unavailable");

  if (radar.available && nowHorizon?.available && primaryModel) {
    const modelNow = pickFusionModelHorizon(primaryModel, 0);
    if (modelNow?.available && radar.rainLikely !== modelNow.rainLikely) {
      disagreements.push(buildFusionDisagreement("radar_model_disagreement_now", "now", [radar.sourceId, primaryModel.sourceId], "Radar and Open-Meteo do not agree for current rain."));
    }
  }

  if (station.available && station.freshness === "fresh" && radar.available && station.rainLikely !== radar.rainLikely) {
    disagreements.push(buildFusionDisagreement("station_radar_disagreement_now", "now", ["ecowitt", radar.sourceId], "Ecowitt and radar do not agree for current rain."));
  }

  if (primaryModel && confirmationModel) {
    futureHorizons.forEach((horizon) => {
      const primary = pickFusionModelHorizon(primaryModel, horizon.horizonMinutes);
      const confirmation = pickFusionModelHorizon(confirmationModel, horizon.horizonMinutes);
      if (primary?.available && confirmation?.available && primary.rainLikely !== confirmation.rainLikely) {
        disagreements.push(buildFusionDisagreement("model_disagreement", horizon.key, [primaryModel.sourceId, confirmationModel.sourceId], `Forecast models disagree for ${horizon.key}.`));
      }
    });
  }

  return disagreements;
}

function buildFusionDisagreement(type, horizon, sources, reason) {
  return {
    type,
    horizon,
    sources: normalizeSourceList(sources),
    reason
  };
}

function collectFusionSourcesUsed({ radar, projection, models, station, horizons }) {
  return normalizeSourceList([
    radar.available ? radar.sourceId : null,
    projection.available ? "wgr" : null,
    ...normalizeSourceList(projection.sourceIds || []),
    ...models.filter((model) => model.available && model.freshness !== "unavailable" && model.horizons.some((horizon) => horizon.available)).map((model) => model.sourceId),
    station.available && station.freshness === "fresh" ? "ecowitt" : null,
    ...horizons.flatMap((horizon) => horizon.sourcesUsed || [])
  ]);
}

function collectFusionSourcesIgnored({ radar, models, station }) {
  return normalizeSourceList([
    !radar.available && radar.sourceId !== WGR_SOURCE_ID ? radar.sourceId : null,
    ...models.filter((model) => !model.available || model.freshness === "unavailable").map((model) => model.sourceId),
    station.available && station.freshness === "stale" ? "ecowitt" : null,
    !station.available ? "ecowitt" : null
  ]);
}

function collectFusionConfidenceReasons({ horizons, radar, models, station, projection, disagreements }) {
  return [
    radar.available && radar.freshness === "fresh" ? "fresh_radar_observation_available" : null,
    projection.available ? "radar_projection_available" : null,
    models.some((model) => model.sourceId === "open-meteo-arome" && hasUsableFusionModel(model)) ? "open_meteo_arome_available" : null,
    models.some((model) => model.sourceId === "met-norway" && hasUsableFusionModel(model)) ? "met_norway_confirmation_available" : null,
    station.available && station.freshness === "fresh" ? "fresh_ecowitt_observation_available" : null,
    horizons.some((horizon) => horizon.rainLikely && horizon.confidence?.label === "high") ? "high_confidence_rain_horizon" : null,
    disagreements.length === 0 && horizons.some((horizon) => horizon.sourcesUsed.length > 1) ? "sources_agree" : null
  ].filter(Boolean);
}

function collectFusionDegradationReasons({ available, disagreements, radar, models, station, sourcesIgnored }) {
  if (!available) {
    return ["No usable source for WGR fusion."];
  }

  return [
    ...disagreements.map((item) => item.type),
    radar.available && radar.freshness === "stale" ? "radar_stale_for_fusion" : null,
    ...models.filter((model) => model.available && model.freshness === "stale").map((model) => `${model.sourceId}_stale_for_fusion`),
    station.available && station.freshness === "stale" ? "ecowitt_stale_for_fusion" : null,
    sourcesIgnored.length ? "some_sources_ignored" : null
  ].filter(Boolean);
}

function hasUsableFusionModel(model) {
  return model.available && model.freshness !== "unavailable" && model.horizons.some((horizon) => horizon.available);
}

function buildLocalRainSignal(horizons, radar, models, station, projection) {
  const nowHorizon = horizons.find((horizon) => horizon.horizonMinutes === 0) || null;

  return {
    rainLikelyNow: nowHorizon?.rainLikely === true,
    probabilityNow: nowHorizon?.probability ?? null,
    intensityNow: nowHorizon?.intensity || { level: "unknown", mmPerHour: null },
    prediction: {
      horizons: horizons.filter((horizon) => horizon.horizonMinutes > 0).map((horizon) => ({
        key: horizon.key,
        horizonMinutes: horizon.horizonMinutes,
        probability: horizon.probability,
        rainLikely: horizon.rainLikely,
        confidence: horizon.confidence
      })),
      projectionAvailable: projection.available === true,
      modelSources: models.filter((model) => model.available).map((model) => model.sourceId)
    },
    observation: {
      radarAvailable: radar.available,
      radarRainLikely: radar.rainLikely,
      stationAvailable: station.available && station.freshness === "fresh",
      stationRainLikely: station.rainLikely
    },
    uncertainty: nowHorizon?.confidence?.label || "unavailable",
    publicSafe: true
  };
}

function buildModelSignalSummary(models) {
  return {
    available: models.some((model) => model.available),
    sources: models,
    primarySourceId: models.find((model) => model.sourceId === "open-meteo-arome")?.sourceId || null,
    confirmationSourceId: models.find((model) => model.sourceId === "met-norway")?.sourceId || null,
    publicSafe: true
  };
}

function normalizeFusionObject(input) {
  if (!input || typeof input !== "object") {
    return {};
  }

  return sanitizePublicDiagnostics(input);
}

function normalizeFusionDisagreements(disagreements) {
  if (!Array.isArray(disagreements)) {
    return [];
  }

  return disagreements.map((item) => ({
    type: normalizeString(item.type),
    horizon: normalizeString(item.horizon),
    sources: normalizeSourceList(item.sources),
    reason: normalizeString(item.reason)
  })).filter((item) => item.type);
}

function normalizeWgrNarrative(input = {}, options = {}) {
  const generatedAt = normalizeIsoDate(input.generatedAt || options.generatedAt) || new Date(0).toISOString();
  const available = input.available === true;
  const status = normalizeString(input.status || input.state) || (available ? "available" : "unavailable");
  const scenario = normalizeString(input.scenario) || (available ? "degraded" : "unavailable");

  return {
    type: "WgrNarrative",
    available,
    status,
    state: status,
    generatedAt,
    locale: normalizeString(input.locale) || NARRATIVE_LOCALE,
    scenario,
    severity: normalizeNarrativeSeverity(input.severity),
    headline: sanitizeNarrativeText(input.headline) || "Analyse radar indisponible.",
    details: sanitizeNarrativeText(input.details) || "Les sources disponibles ne permettent pas une lecture locale fiable.",
    advice: sanitizeNarrativeText(input.advice) || "Surveille la situation avant toute intervention extérieure.",
    confidenceText: sanitizeNarrativeText(input.confidenceText) || "Confiance indisponible : sources insuffisantes.",
    limitText: sanitizeNarrativeText(input.limitText) || "La limite principale est l’absence de source exploitable.",
    sourceSummary: sanitizeNarrativeText(input.sourceSummary) || "Source radar utilisée : aucune.",
    timeSummary: sanitizeNarrativeText(input.timeSummary) || "Aucune image radar exploitable.",
    tags: normalizeStringList(input.tags),
    evidence: normalizeNarrativeEvidence(input.evidence),
    diagnostics: sanitizePublicDiagnostics(input.diagnostics),
    publicSafe: true
  };
}

function collectNarrativeSignals({ generatedAt, state, globalState, observedRain, imminentRain, intensity, confidence, confidenceReasons, degradationReasons, fusion, timeline, futureProjection, contributions, sourcesUsed, sourcesIgnored, rain }) {
  const horizons = Array.isArray(fusion.horizons) ? fusion.horizons : [];
  const nowHorizon = horizons.find((horizon) => horizon.horizonMinutes === 0) || null;
  const futureHorizons = horizons.filter((horizon) => horizon.horizonMinutes > 0);
  const radar = fusion.radarSignal || {};
  const modelSummary = fusion.modelSignal || {};
  const modelSources = Array.isArray(modelSummary.sources) ? modelSummary.sources : [];
  const station = fusion.stationSignal || {};
  const currentFrame = timeline?.currentFrame || null;
  const projection = futureProjection || {};
  const allSources = normalizeSourceList([
    ...(Array.isArray(sourcesUsed) ? sourcesUsed : []),
    ...(Array.isArray(sourcesIgnored) ? sourcesIgnored : []),
    ...(fusion.sourcesUsed || []),
    ...(fusion.sourcesIgnored || []),
    ...contributions.map((item) => item.id)
  ]);
  const staleSources = normalizeSourceList([
    ...contributions.filter((item) => item.freshness === "stale" || item.state === "stale").map((item) => item.id),
    radar.freshness === "stale" ? radar.sourceId : null,
    station.freshness === "stale" ? "ecowitt" : null,
    ...modelSources.filter((item) => item.freshness === "stale").map((item) => item.sourceId)
  ]);
  const radarRain = radar.rainLikely === true;
  const stationFresh = station.available === true && station.freshness === "fresh";
  const stationRain = stationFresh && station.rainLikely === true;
  const modelRain = modelSources.some((model) => model.available && model.freshness !== "unavailable" && (model.horizons || []).some((horizon) => horizon.available && horizon.rainLikely));
  const modelDry = modelSources.some((model) => model.available && model.freshness !== "unavailable") && !modelRain;
  const futureRain = futureHorizons.some((horizon) => horizon.available && horizon.rainLikely);
  const localRainNow = fusion.localRainSignal?.rainLikelyNow === true || nowHorizon?.rainLikely === true || radarRain || stationRain || observedRain === true;
  const disagreements = Array.isArray(fusion.disagreements) ? fusion.disagreements : [];
  const confidenceObject = normalizeConfidence(fusion.confidence?.label ? fusion.confidence : confidence);
  const confidenceLabelValue = normalizeConfidenceLabel(confidenceObject.label) || "unknown";
  const sourceDominant = pickNarrativeDominantSource({ nowHorizon, futureHorizons, radar, modelSources, station });
  const intensityObject = pickNarrativeIntensity({ nowHorizon, futureHorizons, radar, station, intensity });
  const etaMinutes = pickNarrativeEta({ rain, futureHorizons, projection });
  const direction = pickNarrativeDirection({ rain, projection });
  const degraded = fusion.status === "degraded" || globalState === "stale" || globalState === "degraded" || staleSources.length > 0 || (fusion.degradationReasons || []).length > 0 || (Array.isArray(degradationReasons) && degradationReasons.length > 0);

  return {
    generatedAt,
    state: normalizeString(state),
    globalState: normalizeString(globalState),
    fusion,
    timeline,
    futureProjection: projection,
    currentFrame,
    nowHorizon,
    futureHorizons,
    radar,
    modelSources,
    station,
    localRainNow,
    imminentRain: imminentRain === true || futureRain,
    radarRain,
    stationRain,
    stationFresh,
    modelRain,
    modelDry,
    futureRain,
    projectionAvailable: projection.available === true,
    disagreements,
    divergent: disagreements.length > 0,
    degraded,
    confidence: confidenceObject,
    confidenceReasons: normalizeStringList([...(fusion.confidenceReasons || []), ...(Array.isArray(confidenceReasons) ? confidenceReasons : [])]),
    degradationReasons: normalizeStringList([...(fusion.degradationReasons || []), ...(Array.isArray(degradationReasons) ? degradationReasons : [])]),
    sourceDominant,
    intensity: intensityObject,
    etaMinutes,
    direction,
    allSources,
    staleSources,
    sourcesUsed: normalizeSourceList([...(fusion.sourcesUsed || []), ...(Array.isArray(sourcesUsed) ? sourcesUsed : [])]),
    sourcesIgnored: normalizeSourceList([...(fusion.sourcesIgnored || []), ...(Array.isArray(sourcesIgnored) ? sourcesIgnored : [])]),
    contributions,
    confidenceLabel: confidenceLabelValue
  };
}

function pickNarrativeScenario(signals) {
  if (!signals.fusion.available && !signals.sourcesUsed.length && !signals.localRainNow && !signals.imminentRain) {
    return "unavailable";
  }

  if (signals.radarRain && signals.modelDry) {
    return "radar-rain-model-dry";
  }

  if (signals.divergent && !signals.radarRain) {
    return "sources-diverge";
  }

  if (signals.projectionAvailable && signals.futureRain && !signals.localRainNow) {
    return "rain-approaching";
  }

  if (signals.localRainNow) {
    return "observed-rain";
  }

  if (signals.modelRain && !signals.radarRain && !signals.stationRain) {
    return "model-rain-only";
  }

  if (signals.imminentRain || signals.futureRain) {
    return "imminent-rain";
  }

  if (signals.degraded) {
    return "degraded";
  }

  if (signals.sourcesUsed.length > 1 && !signals.divergent) {
    return "sources-agree";
  }

  return "no-rain-nearby";
}

function buildNarrativeText(signals, scenario) {
  const intensityText = narrativeIntensityText(signals.intensity);
  const sourceSummary = buildNarrativeSourceSummary(signals);
  const timeSummary = buildNarrativeTimeSummary(signals);
  const confidenceText = buildNarrativeConfidenceText(signals);
  const limitText = buildNarrativeLimitText(signals);

  if (scenario === "unavailable") {
    return {
      headline: "Radar indisponible pour le moment.",
      details: "Aucune source exploitable ne permet de lire la pluie près du jardin pour le moment.",
      advice: "Surveille la situation avant toute intervention extérieure.",
      confidenceText,
      limitText,
      sourceSummary,
      timeSummary
    };
  }

  if (scenario === "radar-rain-model-dry") {
    return {
      headline: `${capitalizeSentence(intensityText || "Activité pluvieuse")} observée près du jardin.`,
      details: "Le radar signale de la pluie, mais les modèles ne la confirment pas clairement.",
      advice: "Surveille les zones sensibles si l’épisode se renforce.",
      confidenceText,
      limitText,
      sourceSummary,
      timeSummary
    };
  }

  if (scenario === "sources-diverge") {
    return {
      headline: "Sources météo divergentes.",
      details: "Les sources disponibles ne donnent pas exactement la même lecture de la pluie locale.",
      advice: "Surveille la situation avant toute intervention extérieure.",
      confidenceText,
      limitText,
      sourceSummary,
      timeSummary
    };
  }

  if (scenario === "rain-approaching") {
    return {
      headline: "Pluie probable à courte échéance.",
      details: buildFutureRainDetails(signals),
      advice: "Surveille les zones sensibles si l’épisode se confirme.",
      confidenceText,
      limitText,
      sourceSummary,
      timeSummary
    };
  }

  if (scenario === "observed-rain") {
    return {
      headline: `${capitalizeSentence(intensityText || "Activité pluvieuse")} observée près du jardin.`,
      details: buildObservedRainDetails(signals),
      advice: "Surveille les zones sensibles si l’épisode se renforce.",
      confidenceText,
      limitText,
      sourceSummary,
      timeSummary
    };
  }

  if (scenario === "model-rain-only") {
    return {
      headline: Number.isFinite(signals.etaMinutes) ? `${capitalizeSentence(intensityText || "Pluie")} probable dans ~${Math.round(signals.etaMinutes)} min.` : "Pluie possible selon les modèles.",
      details: "Les modèles indiquent un risque de pluie, mais le radar ou la station locale ne le confirment pas actuellement.",
      advice: "Surveille la situation avant toute intervention extérieure.",
      confidenceText,
      limitText,
      sourceSummary,
      timeSummary
    };
  }

  if (scenario === "imminent-rain") {
    return {
      headline: Number.isFinite(signals.etaMinutes) ? `${capitalizeSentence(intensityText || "Pluie")} probable dans ~${Math.round(signals.etaMinutes)} min.` : "Pluie possible dans la fenêtre proche.",
      details: buildFutureRainDetails(signals),
      advice: "Prévois de vérifier le potager après le passage de la pluie.",
      confidenceText,
      limitText,
      sourceSummary,
      timeSummary
    };
  }

  if (scenario === "degraded") {
    return {
      headline: "Lecture pluie dégradée.",
      details: "Certaines sources sont anciennes, partielles ou indisponibles.",
      advice: "Surveille la situation avant toute intervention extérieure.",
      confidenceText,
      limitText,
      sourceSummary,
      timeSummary
    };
  }

  if (scenario === "sources-agree") {
    return {
      headline: "Sources météo cohérentes.",
      details: "Les sources disponibles donnent une lecture cohérente de la situation locale.",
      advice: "Pas d’action particulière pour le moment.",
      confidenceText,
      limitText,
      sourceSummary,
      timeSummary
    };
  }

  return {
    headline: "Aucune pluie proche détectée.",
    details: "Les sources disponibles ne signalent pas de pluie autour du jardin pour le moment.",
    advice: "Pas d’action particulière pour le moment.",
    confidenceText,
    limitText,
    sourceSummary,
    timeSummary
  };
}

function buildObservedRainDetails(signals) {
  const details = [];
  if (signals.radarRain) {
    details.push("Le radar indique une activité pluvieuse.");
  }
  if (signals.stationRain) {
    details.push("La station locale confirme de la pluie sur place.");
  } else if (signals.stationFresh && signals.station.humidityPct >= 85) {
    details.push("La station locale indique une humidité élevée.");
  }
  if (signals.modelRain && !signals.divergent) {
    details.push("Les modèles restent cohérents avec cet épisode.");
  }
  return details.join(" ") || "Une activité pluvieuse est observée par les sources disponibles.";
}

function buildFutureRainDetails(signals) {
  const horizon = signals.futureHorizons.find((item) => item.rainLikely && item.available);
  const pieces = [];
  if (horizon) {
    pieces.push(`Le signal pluie apparaît sur l’horizon ${horizon.key}.`);
  }
  if (Number.isFinite(signals.etaMinutes)) {
    pieces.push(`L’arrivée estimée provient d’une source déjà disponible : environ ${Math.round(signals.etaMinutes)} minutes.`);
  }
  if (signals.direction) {
    pieces.push(`Direction indiquée par la source : ${signals.direction}.`);
  }
  if (signals.projectionAvailable) {
    pieces.push("La projection radar courte échéance est disponible.");
  }
  return pieces.join(" ") || "Une source de prévision indique une pluie possible à courte échéance.";
}

function buildNarrativeConfidenceText(signals) {
  const prefix = {
    high: "Confiance forte",
    medium: "Confiance moyenne",
    low: "Confiance faible",
    unknown: "Confiance limitée",
    unavailable: "Confiance indisponible"
  }[signals.confidenceLabel] || "Confiance limitée";
  const reasons = [];

  if (signals.divergent) {
    reasons.push("sources divergentes");
  }
  if (signals.radar.available && signals.radar.freshness === "fresh") {
    reasons.push("radar frais");
  }
  if (signals.modelRain) {
    reasons.push("modèles utiles");
  }
  if (signals.stationRain) {
    reasons.push("station locale fraîche");
  } else if (signals.staleSources.includes("ecowitt")) {
    reasons.push("station locale ancienne");
  }
  if (!reasons.length && signals.degraded) {
    reasons.push("données partielles");
  }

  return `${prefix}${reasons.length ? ` : ${reasons.join(", ")}.` : "."}`;
}

function buildNarrativeLimitText(signals) {
  if (signals.divergent) {
    return "Les sources ne sont pas totalement cohérentes ; la lecture doit rester prudente.";
  }
  if (signals.sourcesIgnored.includes("meteofrance-radar")) {
    return "Météo-France n’est pas exploitable dans cette synthèse.";
  }
  if (signals.futureProjection.available !== true) {
    return "La projection +30 min reste indisponible ou incertaine.";
  }
  if (signals.staleSources.length) {
    return "Certaines données sont anciennes et limitent la confiance.";
  }
  return "Aucune limite majeure supplémentaire dans les sources utilisées.";
}

function buildNarrativeSourceSummary(signals) {
  if (signals.radar.available && signals.radar.sourceId) {
    return `Source radar utilisée : ${sourceLabel(signals.radar.sourceId)}.`;
  }
  if (signals.currentFrame?.sourceId) {
    return `Source radar utilisée : ${sourceLabel(signals.currentFrame.sourceId)}.`;
  }
  if (signals.sourcesUsed.includes("open-meteo-arome") || signals.sourcesUsed.includes("met-norway")) {
    return "Source principale utilisée : modèles météo.";
  }
  return "Source radar utilisée : aucune.";
}

function buildNarrativeTimeSummary(signals) {
  const freshness = signals.currentFrame?.freshness || signals.radar.freshness;
  if (freshness === "fresh") {
    return "Image radar fraîche.";
  }
  if (freshness === "stale") {
    return "Image radar ancienne.";
  }
  if (signals.futureProjection.available) {
    return "Projection courte échéance disponible.";
  }
  return "Aucune image radar exploitable.";
}

function buildNarrativeTags(signals, scenario) {
  return normalizeStringList([
    scenario,
    signals.localRainNow ? "rain-observed" : null,
    signals.futureRain ? "rain-soon" : null,
    signals.confidenceLabel ? `${signals.confidenceLabel}-confidence` : null,
    signals.divergent ? "sources-diverge" : null,
    signals.degraded ? "degraded" : null,
    signals.radar.sourceId === "rainviewer" ? "rainviewer-normal-source" : null,
    signals.stationRain ? "station-confirms" : null
  ]);
}

function buildNarrativeEvidence(signals) {
  return [
    signals.radar.available ? {
      type: "radar",
      sourceId: signals.radar.sourceId,
      label: sourceLabel(signals.radar.sourceId),
      rainLikely: signals.radar.rainLikely === true,
      freshness: signals.radar.freshness
    } : null,
    signals.modelRain ? {
      type: "model",
      sourceId: "open-meteo-arome",
      label: sourceLabel("open-meteo-arome"),
      rainLikely: true
    } : null,
    signals.station.available ? {
      type: "station",
      sourceId: "ecowitt",
      label: sourceLabel("ecowitt"),
      rainLikely: signals.station.rainLikely === true,
      freshness: signals.station.freshness
    } : null,
    signals.futureProjection.available ? {
      type: "projection",
      sourceId: WGR_SOURCE_ID,
      label: sourceLabel(WGR_SOURCE_ID),
      horizons: signals.futureProjection.frames.map((frame) => frame.horizonMinutes).filter(Boolean)
    } : null
  ].filter(Boolean);
}

function normalizeNarrativeEvidence(evidence) {
  if (!Array.isArray(evidence)) {
    return [];
  }

  return evidence.map((item) => sanitizePublicDiagnostics(item)).filter((item) => Object.keys(item).length > 0);
}

function pickNarrativeDominantSource({ nowHorizon, futureHorizons, radar, modelSources, station }) {
  const explicitSource = nowHorizon?.sourceDominant || futureHorizons.find((item) => item.sourceDominant)?.sourceDominant;
  if (explicitSource) {
    return normalizeSourceId(explicitSource);
  }
  if (radar.available) {
    return radar.sourceId;
  }
  if (station.available && station.freshness === "fresh") {
    return "ecowitt";
  }
  return modelSources.find((item) => item.available)?.sourceId || null;
}

function pickNarrativeIntensity({ nowHorizon, futureHorizons, radar, station, intensity }) {
  const explicitIntensity = normalizeIntensity(intensity);
  const horizonIntensity = isUsefulNarrativeIntensity(nowHorizon?.intensity) ? nowHorizon.intensity : null;
  const futureIntensity = futureHorizons.find((item) => isUsefulNarrativeIntensity(item.intensity))?.intensity || null;
  if (isUsefulNarrativeIntensity(explicitIntensity)) {
    return explicitIntensity;
  }
  if (horizonIntensity) {
    return horizonIntensity;
  }
  if (futureIntensity) {
    return futureIntensity;
  }
  if (station.rainLikely && Number.isFinite(station.rainRateMmPerHour)) {
    return { level: intensityLevelFromMm(station.rainRateMmPerHour), mmPerHour: station.rainRateMmPerHour };
  }
  return explicitIntensity;
}

function isUsefulNarrativeIntensity(intensity) {
  const level = normalizeString(intensity?.level);
  return !!level && !["unknown", "none"].includes(level);
}

function pickNarrativeEta({ rain, futureHorizons, projection }) {
  const explicitEta = finiteOrNull(rain?.etaMinutes);
  if (Number.isFinite(explicitEta)) {
    return explicitEta;
  }
  const confidentHorizon = futureHorizons.find((horizon) => horizon.rainLikely && ["high", "medium"].includes(horizon.confidence?.label));
  if (confidentHorizon && projection.available === true) {
    return confidentHorizon.horizonMinutes;
  }
  return null;
}

function pickNarrativeDirection({ rain, projection }) {
  const explicitDirection = normalizeString(rain?.directionLabel || rain?.direction);
  if (explicitDirection) {
    return explicitDirection;
  }
  const vector = projection.frames?.find((frame) => frame.motionVector)?.motionVector || null;
  if (Number.isFinite(vector?.bearingDegrees)) {
    return `${Math.round(vector.bearingDegrees)}°`;
  }
  return null;
}

function narrativeIntensityText(intensity) {
  const level = normalizeString(intensity?.level);
  if (level === "light") {
    return "pluie faible";
  }
  if (level === "moderate") {
    return "pluie modérée";
  }
  if (level === "heavy") {
    return "pluie forte";
  }
  return null;
}

function normalizeNarrativeSeverity(value) {
  const normalized = normalizeString(value);
  return ["info", "watch", "risk", "urgent"].includes(normalized) ? normalized : "info";
}

function sanitizeNarrativeText(value) {
  const text = normalizeString(value);
  if (!text || NARRATIVE_TECHNICAL_PATTERN.test(text)) {
    return null;
  }
  return text;
}

function capitalizeSentence(value) {
  const text = normalizeString(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function normalizeFutureProjection(input = {}, options = {}) {
  const status = normalizeProjectionStatus(input.status || input.state || input.availability);
  const available = input.available === true || status === "available";
  const generatedAt = normalizeIsoDate(input.generatedAt || options.generatedAt) || new Date(0).toISOString();
  const frames = Array.isArray(input.frames)
    ? input.frames.map((frame) => normalizeFutureProjectionFrame(frame, { generatedAt })).filter((frame) => frame.timestamp || frame.available === false)
    : [];
  const horizonMinutes = finiteOrNull(input.horizonMinutes) || frames.reduce((max, frame) => Math.max(max, frame.horizonMinutes || 0), 0) || 30;
  const reason = normalizeString(input.reason || (!available ? `Projection +${horizonMinutes} min indisponible : aucune source suffisante dans ce modèle de test.` : null));

  return {
    available,
    status,
    state: status,
    method: normalizeString(input.method) || (available ? "metadata-motion-vector" : "none"),
    horizonMinutes,
    frames,
    frameCount: frames.length,
    frameAvailable: frames.some((frame) => frame.available),
    textOnly: input.textOnly === true || status === "text-only",
    confidence: normalizeConfidence(input.confidence || { score: null, label: available ? "unknown" : "unavailable" }),
    confidenceReasons: normalizeStringList(input.confidenceReasons),
    degradationReasons: normalizeStringList(input.degradationReasons || (reason ? [reason] : [])),
    sourceFrameIds: normalizeStringList(input.sourceFrameIds || frames.flatMap((frame) => frame.sourceFrameIds || [])),
    sourceIds: normalizeSourceList(input.sourceIds || frames.flatMap((frame) => frame.sourceIds || [])),
    generatedAt,
    validUntil: normalizeIsoDate(input.validUntil),
    playbackAvailable: input.playbackAvailable === true || frames.length > 1,
    reason,
    diagnostics: sanitizePublicDiagnostics(input.diagnostics),
    derivedFrom: normalizeDerivedFrom(input.derivedFrom),
    publicSafe: true
  };
}

function normalizeFutureProjectionFrame(input = {}, options = {}) {
  const horizonMinutes = finiteOrNull(input.horizonMinutes) || null;
  const timestamp = normalizeIsoDate(input.timestamp);
  const available = input.available !== false;

  return {
    type: "WgrFutureProjectionFrame",
    id: normalizeString(input.id) || buildProjectionFrameId(horizonMinutes, timestamp),
    kind: "extrapolated",
    timestamp,
    horizonMinutes,
    sourceId: WGR_SOURCE_ID,
    sourceLabel: sourceLabel(WGR_SOURCE_ID),
    sourceFrameIds: normalizeStringList(input.sourceFrameIds),
    sourceIds: normalizeSourceList(input.sourceIds),
    visualType: normalizeVisualType(input.visualType || "none"),
    confidence: normalizeConfidence(input.confidence),
    available,
    reason: normalizeString(input.reason),
    motionVector: normalizeMotionVector(input.motionVector || input.motion),
    diagnostics: sanitizePublicDiagnostics(input.diagnostics),
    generatedAt: normalizeIsoDate(input.generatedAt || options.generatedAt),
    publicSafe: true
  };
}

function buildExtrapolatedProjectionFrame({ baseTimestamp, horizonMinutes, sourceFrameIds, confidence, motionVector }) {
  return {
    id: `extrapolated-wgr-${horizonMinutes}min-${String(baseTimestamp || "unknown").replace(/[^0-9]/g, "").slice(0, 14)}`,
    kind: "extrapolated",
    timestamp: addMinutes(baseTimestamp, horizonMinutes),
    horizonMinutes,
    sourceId: WGR_SOURCE_ID,
    sourceFrameIds,
    sourceIds: [WGR_SOURCE_ID],
    visualType: "none",
    confidence: horizonMinutes >= 30
      ? { score: Math.max(0, Number((confidence.score - 0.12).toFixed(2))), label: confidenceLabel(confidence.score - 0.12) }
      : confidence,
    available: true,
    motionVector,
    diagnostics: {
      generatedFromObservedMotion: true,
      horizonMinutes
    }
  };
}

function computeProjectionConfidence({ frameCount, latestAgeMinutes, intervalMinutes, motionVector }) {
  let score = 0.35;

  if (frameCount >= 3) {
    score += 0.15;
  } else if (frameCount >= 2) {
    score += 0.1;
  }

  if (latestAgeMinutes <= 10) {
    score += 0.15;
  } else if (latestAgeMinutes <= FUTURE_PROJECTION_MAX_LATEST_AGE_MINUTES) {
    score += 0.08;
  }

  if (intervalMinutes >= 4 && intervalMinutes <= 10) {
    score += 0.15;
  } else {
    score += 0.05;
  }

  if (motionVector) {
    score += 0.2;
  }

  score = Math.min(0.9, Math.max(0, Number(score.toFixed(2))));
  return { score, label: confidenceLabel(score) };
}

function hasUsableVisualReference(frame) {
  return !!(frame.tileUrlTemplate || frame.imageUrl || frame.imageDataUrl || frame.visualType === "none");
}

function normalizeProjectionStatus(value) {
  const normalized = normalizeString(value);
  return PROJECTION_STATUSES.has(normalized) ? normalized : "unavailable";
}

function normalizeMotionVector(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const dxPixelsPerMinute = finiteOrNull(value.dxPixelsPerMinute ?? value.dxPerMinute ?? value.dx);
  const dyPixelsPerMinute = finiteOrNull(value.dyPixelsPerMinute ?? value.dyPerMinute ?? value.dy);
  const bearingDegrees = finiteOrNull(value.bearingDegrees ?? value.bearing);
  const speedKmh = finiteOrNull(value.speedKmh ?? value.speedKmH);

  if (Number.isFinite(dxPixelsPerMinute) || Number.isFinite(dyPixelsPerMinute) || Number.isFinite(bearingDegrees) || Number.isFinite(speedKmh)) {
    return {
      dxPixelsPerMinute: Number.isFinite(dxPixelsPerMinute) ? dxPixelsPerMinute : null,
      dyPixelsPerMinute: Number.isFinite(dyPixelsPerMinute) ? dyPixelsPerMinute : null,
      bearingDegrees: Number.isFinite(bearingDegrees) ? bearingDegrees : null,
      speedKmh: Number.isFinite(speedKmh) ? speedKmh : null
    };
  }

  return null;
}

function buildProjectionFrameId(horizonMinutes, timestamp) {
  const compactTimestamp = timestamp ? timestamp.replace(/[^0-9]/g, "").slice(0, 14) : "unknown-time";
  return `extrapolated-wgr-${horizonMinutes || "unknown"}min-${compactTimestamp}`;
}

function addMinutes(timestamp, minutes) {
  const date = parseDate(timestamp);
  if (!date || !Number.isFinite(minutes)) {
    return null;
  }

  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

function isValidIsoDate(value) {
  return !!parseDate(value);
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeConfidenceLabel(value) {
  const normalized = normalizeString(value);
  return CONFIDENCE_LABELS.has(normalized) ? normalized : null;
}

function deriveGlobalState(state, sourceStatus, contributions) {
  const normalizedState = normalizeWgrState(state);
  if (normalizedState) {
    return normalizedState;
  }

  const statuses = Array.isArray(sourceStatus) ? sourceStatus : [];
  if (statuses.some((status) => status?.freshness === "stale" || status?.state === "stale")) {
    return "stale";
  }

  if (contributions.some((item) => item.used && item.state === "fresh")) {
    return contributions.some((item) => item.ignored && item.available) ? "degraded" : "fresh";
  }

  if (contributions.some((item) => item.used)) {
    return "degraded";
  }

  return "unavailable";
}

function buildPublicDiagnostics({ globalState, sourcesUsed, sourcesIgnored }) {
  return {
    globalState,
    sourcesUsed,
    sourcesIgnored,
    publicSafe: true
  };
}

function sanitizePublicDiagnostics(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      return [];
    }

    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return [[key, sanitizePublicDiagnostics(entry, depth + 1)]];
    }

    if (Array.isArray(entry)) {
      return [[key, entry.map((item) => sanitizeDiagnosticValue(item, depth + 1)).filter((item) => item !== null)]];
    }

    const safeValue = sanitizeDiagnosticValue(entry, depth + 1);
    return safeValue === null ? [] : [[key, safeValue]];
  }));
}

function sanitizeDiagnosticValue(value, depth) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return URL_PATTERN.test(value) ? null : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticValue(item, depth + 1)).filter((item) => item !== null);
  }

  if (typeof value === "object") {
    return sanitizePublicDiagnostics(value, depth + 1);
  }

  return null;
}

function normalizeIntensity(value) {
  if (!value || typeof value !== "object") {
    return { level: "unknown", mmPerHour: null };
  }

  return {
    level: normalizeString(value.level || "unknown"),
    mmPerHour: finiteOrNull(value.mmPerHour)
  };
}

function normalizeConfidence(value) {
  if (value && typeof value === "object") {
    const score = finiteOrNull(value.score);
    const label = normalizeConfidenceLabel(value.label) || confidenceLabel(score);

    return { score, label };
  }

  const score = finiteOrNull(value);
  return {
    score,
    label: confidenceLabel(score)
  };
}

function normalizeQuality(value) {
  if (!value || typeof value !== "object") {
    return { ok: false, reason: null };
  }

  return {
    ok: value.ok === true,
    reason: normalizeString(value.reason),
    coverage: finiteOrNull(value.coverage)
  };
}

function normalizeVisualType(value, references = {}) {
  const normalized = normalizeString(value);
  if (VISUAL_TYPES.has(normalized)) {
    return normalized;
  }

  if (references.tileUrlTemplate) {
    return "tile";
  }

  if (references.imageDataUrl) {
    return references.bounds ? "image-overlay" : "data-image";
  }

  if (references.imageUrl) {
    return references.bounds ? "image-overlay" : "image";
  }

  return "none";
}

function sanitizeVisualUrl(value) {
  const url = normalizeString(value);
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.search || parsed.hash || SENSITIVE_URL_PATTERN.test(url)) {
      return null;
    }

    return url;
  } catch (_error) {
    return null;
  }
}

function sanitizeImageDataUrl(value) {
  const dataUrl = normalizeString(value);
  if (!dataUrl || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl)) {
    return null;
  }

  return SENSITIVE_URL_PATTERN.test(dataUrl) ? null : dataUrl;
}

function normalizeOpacity(value) {
  const number = finiteOrNull(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.min(1, Math.max(0, number));
}

function normalizeBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 2) {
    return null;
  }

  const sw = normalizeCoordinate(bounds[0]);
  const ne = normalizeCoordinate(bounds[1]);
  return sw && ne ? [sw, ne] : null;
}

function normalizeCoordinate(value) {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const latitude = finiteOrNull(value[0]);
  const longitude = finiteOrNull(value[1]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null;
}

function normalizeDerivedFrom(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function normalizeSourceList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => normalizeSourceId(item)).filter(Boolean))];
}

function firstSource(value) {
  return Array.isArray(value) ? value.find(Boolean) : null;
}

function sourceLabel(sourceId) {
  const normalized = normalizeSourceId(sourceId);
  return normalized ? SOURCE_LABELS[normalized] || normalized : null;
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function normalizeTimelineKind(value) {
  const normalized = normalizeString(value);
  return WGR_TIMELINE_KINDS.has(normalized) ? normalized : "observed";
}

function normalizeWgrPhase(value) {
  const normalized = normalizeString(value);
  return WGR_PHASES.has(normalized) ? normalized : "unavailable";
}

function normalizeWgrState(value) {
  const normalized = normalizeString(value);
  return WGR_STATES.has(normalized) ? normalized : null;
}

function inferSourceRole(id) {
  if (id === "meteofrance-radar" || id === "rainviewer") {
    return "radar-observation";
  }

  if (id === "open-meteo-arome") {
    return "forecast-primary";
  }

  if (id === "met-norway") {
    return "forecast-confirmation";
  }

  if (id === "ecowitt") {
    return "local-observation";
  }

  if (id === "garden-state") {
    return "garden-context";
  }

  if (id === WGR_SOURCE_ID) {
    return "weather-garden-synthesis";
  }

  return "unknown";
}

function computeAgeMinutes(timestamp, now = new Date()) {
  const date = timestamp ? new Date(timestamp) : null;
  const nowDate = now instanceof Date ? now : new Date(now);

  if (!date || Number.isNaN(date.getTime()) || Number.isNaN(nowDate.getTime())) {
    return null;
  }

  return Math.max(0, Math.round((nowDate.getTime() - date.getTime()) / 60_000));
}

function normalizeIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSourceId(value) {
  const normalized = normalizeString(value);
  return normalized ? SOURCE_ALIASES[normalized.toLowerCase()] || normalized.toLowerCase() : null;
}

function clampNumber(value, min, max) {
  const number = finiteOrNull(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.min(max, Math.max(min, number));
}

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function compareTimestampLike(a, b) {
  return String(a.timestamp || a.fetchedAt || "").localeCompare(String(b.timestamp || b.fetchedAt || ""));
}

function pruneNullish(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined));
}
