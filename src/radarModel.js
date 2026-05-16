const DEFAULT_FRESHNESS_LIMIT_MINUTES = 15;

export function normalizeRadarFrame(frame = {}, options = {}) {
  const source = normalizeString(frame.source || options.source || "unknown");
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
    origin: normalizeString(frame.origin || source),
    fallbackReason: normalizeString(frame.fallbackReason),
    derivedFrom: normalizeDerivedFrom(frame.derivedFrom)
  });
}

export function normalizeRadarSequence(input = {}, options = {}) {
  const source = normalizeString(input.source || options.source || "unknown");
  const frames = Array.isArray(input.frames)
    ? input.frames.map((frame) => normalizeRadarFrame(frame, { ...options, source })).filter((frame) => frame.timestamp || frame.fetchedAt)
    : [];

  frames.sort((a, b) => String(a.timestamp || a.fetchedAt).localeCompare(String(b.timestamp || b.fetchedAt)));

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
  const source = normalizeString(input.source || options.source || "unknown");
  const fetchedAt = normalizeIsoDate(input.fetchedAt || options.fetchedAt);
  const latestFrameAt = normalizeIsoDate(input.latestFrameAt || input.validityTime || input.frameTime);
  const ageMinutes = computeAgeMinutes(latestFrameAt || fetchedAt, options.now || input.now);
  const freshnessLimitMinutes = finiteOrNull(input.freshnessLimitMinutes) || DEFAULT_FRESHNESS_LIMIT_MINUTES;
  const available = input.ok === true || input.available === true;
  const freshness = available
    ? classifyFreshness(ageMinutes, freshnessLimitMinutes)
    : "unavailable";

  return {
    type: "RadarSourceStatus",
    source,
    available,
    freshness,
    fetchedAt,
    latestFrameAt,
    ageMinutes,
    quality: normalizeQuality(input.quality),
    fallbackReason: normalizeString(input.fallbackReason || input.reason),
    error: normalizeString(input.error),
    derivedFrom: normalizeDerivedFrom(input.derivedFrom)
  };
}

export function normalizeRadarSynthesis(input = {}) {
  return {
    type: "RadarSynthesis",
    generatedAt: normalizeIsoDate(input.generatedAt) || new Date(0).toISOString(),
    state: normalizeString(input.state || "unavailable"),
    observedRain: input.observedRain === true,
    imminentRain: input.imminentRain === true,
    etaMinutes: finiteOrNull(input.etaMinutes),
    intensity: normalizeIntensity(input.intensity),
    confidence: normalizeConfidence(input.confidence),
    coherence: normalizeString(input.coherence || "unknown"),
    sourceStatus: Array.isArray(input.sourceStatus) ? input.sourceStatus.map((status) => normalizeRadarSourceStatus(status)) : [],
    derivedFrom: normalizeDerivedFrom(input.derivedFrom),
    explanations: normalizeStringList(input.explanations)
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
  const score = typeof value === "object" ? finiteOrNull(value.score) : finiteOrNull(value);

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

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeString(item)).filter(Boolean);
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

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pruneNullish(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined));
}
