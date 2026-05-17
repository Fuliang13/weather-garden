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
  const contributions = Array.isArray(input.contributions)
    ? input.contributions.map((item) => normalizeWgrSourceContribution(item, { now: input.generatedAt }))
    : [];
  const sourcesUsed = normalizeSourceList(input.sourcesUsed || contributions.filter((item) => item.used).map((item) => item.id));
  const sourcesIgnored = normalizeSourceList(input.sourcesIgnored || contributions.filter((item) => item.ignored).map((item) => item.id));
  const globalState = normalizeWgrState(input.globalState) || deriveGlobalState(input.state, input.sourceStatus, contributions);

  return {
    type: "RadarSynthesis",
    mode: "WGR",
    source: WGR_SOURCE_ID,
    generatedAt: normalizeIsoDate(input.generatedAt) || new Date(0).toISOString(),
    state: normalizeString(input.state || "unavailable"),
    globalState,
    observedRain: input.observedRain === true,
    imminentRain: input.imminentRain === true,
    etaMinutes: finiteOrNull(input.etaMinutes),
    intensity: normalizeIntensity(input.intensity),
    confidence: normalizeConfidence(input.confidence),
    confidenceReasons: normalizeStringList(input.confidenceReasons),
    degradationReasons: normalizeStringList(input.degradationReasons),
    coherence: normalizeString(input.coherence || "unknown"),
    sourceStatus: Array.isArray(input.sourceStatus) ? input.sourceStatus.map((status) => normalizeRadarSourceStatus(status)) : [],
    contributions,
    sourcesUsed,
    sourcesIgnored,
    finalLayer: normalizeWgrFinalLayer(input.finalLayer, sourcesUsed),
    timeline: buildWgrTimeline(input.timeline || {}, { generatedAt: input.generatedAt }),
    futureProjection: normalizeFutureProjection(input.futureProjection, { generatedAt: input.generatedAt }),
    diagnostics: sanitizePublicDiagnostics(input.diagnostics || buildPublicDiagnostics({ globalState, sourcesUsed, sourcesIgnored })),
    derivedFrom: normalizeDerivedFrom(input.derivedFrom),
    explanations: normalizeStringList(input.explanations),
    publicSafe: true
  };
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

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function compareTimestampLike(a, b) {
  return String(a.timestamp || a.fetchedAt || "").localeCompare(String(b.timestamp || b.fetchedAt || ""));
}

function pruneNullish(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined));
}
