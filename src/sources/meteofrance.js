const RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json";
const METEOFRANCE_TOKEN_URL = "https://portail-api.meteofrance.fr/token";
const METEOFRANCE_RADAR_CATALOG_URL = "https://public-api.meteofrance.fr/public/DPRadar/v1/mosaiques";
const METEOFRANCE_RADAR_ZONE = "METROPOLE";
const METEOFRANCE_RADAR_OBSERVATION = "LAME_D_EAU";
const METEOFRANCE_RADAR_PRIMARY_MESH = 500;
const METEOFRANCE_RADAR_FALLBACK_MESH = 1000;
const METEOFRANCE_HDF5_SIGNATURE = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
const METEOFRANCE_HDF5_MAX_BYTES = 40 * 1024 * 1024;
const METEOFRANCE_HDF5_EXPECTED_DIMENSIONS = { width: 3472, height: 3472 };
const METEOFRANCE_TOKEN_USER_AGENT_FALLBACK = "weather-garden/0.1";
const METEOFRANCE_REQUIRED_SECRETS = ["METEOFRANCE_API_KEY", "METEOFRANCE_APPLICATION_ID"];

export const METEOFRANCE_RADAR_FRAME_LIMIT = 24;

export async function fetchMeteoFranceRadar({ env }) {
  const fetchedAt = new Date().toISOString();
  const authMode = getMeteoFranceAuthMode(env);

  if (!authMode) {
    return buildMeteoFranceMissingConfigResponse(fetchedAt, false);
  }

  const tokenState = {};
  const fetchJson = authMode === "api-key"
    ? (url) => fetchMeteoFranceJsonWithApiKey(env, url)
    : (url) => fetchMeteoFranceJsonWithOAuth(env, url, tokenState);
  const fetchBinary = authMode === "api-key"
    ? (url) => fetchMeteoFranceBinaryWithApiKey(env, url)
    : (url) => fetchMeteoFranceBinaryWithOAuth(env, url, tokenState);
  const radarMetadata = await fetchMeteoFranceRadarMetadata(fetchJson);

  return buildMeteoFranceRadarResponse({ env, fetchedAt, authMode, radarMetadata, fetchBinary });
}

export async function debugMeteoFranceRadar({ env }) {
  const fetchedAt = new Date().toISOString();
  const authMode = getMeteoFranceAuthMode(env);

  if (!authMode) {
    return buildMeteoFranceMissingConfigResponse(fetchedAt, true);
  }

  if (authMode === "api-key") {
    try {
      const catalog = await fetchMeteoFranceJsonWithApiKey(env, METEOFRANCE_RADAR_CATALOG_URL);

      return {
        ok: true,
        enabled: true,
        source: "meteofrance-radar",
        fetchedAt,
        message: "Météo-France API key and radar catalog OK.",
        diagnostics: {
          configured: true,
          authMode,
          tokenOk: null,
          catalogOk: true,
          catalogEndpoint: METEOFRANCE_RADAR_CATALOG_URL,
          catalogLinkCount: collectUrls(catalog).length
        }
      };
    } catch (error) {
      return buildMeteoFranceDebugErrorResponse({ fetchedAt, authMode, tokenOk: null, message: error.message });
    }
  }

  const tokenState = {};

  try {
    tokenState.accessToken = await obtainMeteoFranceAccessToken(env);
  } catch (error) {
    return buildMeteoFranceDebugErrorResponse({ fetchedAt, authMode, tokenOk: false, message: error.message, env });
  }

  try {
    const catalog = await fetchMeteoFranceJsonWithOAuth(env, METEOFRANCE_RADAR_CATALOG_URL, tokenState);

    return {
      ok: true,
      enabled: true,
      source: "meteofrance-radar",
      fetchedAt,
      message: "Météo-France token and radar catalog OK.",
      diagnostics: {
        configured: true,
        authMode,
        tokenOk: true,
        catalogOk: true,
        catalogEndpoint: METEOFRANCE_RADAR_CATALOG_URL,
        catalogLinkCount: collectUrls(catalog).length,
        userAgentSent: !!getMeteoFranceUserAgent(env)
      }
    };
  } catch (error) {
    return buildMeteoFranceDebugErrorResponse({ fetchedAt, authMode, tokenOk: true, message: error.message, env });
  }
}

export async function debugMeteoFranceHdf5({ env }) {
  const fetchedAt = new Date().toISOString();
  const authMode = getMeteoFranceAuthMode(env);

  if (!authMode) {
    return buildMeteoFranceHdf5DebugPayload(buildMeteoFranceMissingConfigResponse(fetchedAt, true));
  }

  if (authMode === "api-key") {
    try {
      const fetchJson = (url) => fetchMeteoFranceJsonWithApiKey(env, url);
      const fetchBinary = (url) => fetchMeteoFranceBinaryWithApiKey(env, url);
      const radarMetadata = await fetchMeteoFranceRadarMetadata(fetchJson);
      const radar = await buildMeteoFranceRadarResponse({ env, fetchedAt, authMode, radarMetadata, fetchBinary, forceHdf5Refresh: true });

      return buildMeteoFranceHdf5DebugPayload(addDebugCatalogDiagnostics(radar, null, true));
    } catch (error) {
      return buildMeteoFranceHdf5DebugPayload(buildMeteoFranceDebugErrorResponse({ fetchedAt, authMode, tokenOk: null, message: error.message }));
    }
  }

  const tokenState = {};

  try {
    tokenState.accessToken = await obtainMeteoFranceAccessToken(env);
  } catch (error) {
    return buildMeteoFranceHdf5DebugPayload(buildMeteoFranceDebugErrorResponse({ fetchedAt, authMode, tokenOk: false, message: error.message, env }));
  }

  try {
    const fetchJson = (url) => fetchMeteoFranceJsonWithOAuth(env, url, tokenState);
    const fetchBinary = (url) => fetchMeteoFranceBinaryWithOAuth(env, url, tokenState);
    const radarMetadata = await fetchMeteoFranceRadarMetadata(fetchJson);
    const radar = await buildMeteoFranceRadarResponse({ env, fetchedAt, authMode, radarMetadata, fetchBinary, forceHdf5Refresh: true });

    return buildMeteoFranceHdf5DebugPayload(addDebugCatalogDiagnostics(radar, true, true));
  } catch (error) {
    return buildMeteoFranceHdf5DebugPayload(buildMeteoFranceDebugErrorResponse({ fetchedAt, authMode, tokenOk: true, message: error.message, env }));
  }
}

export async function fetchRainViewerRadar({ latitude, longitude, enabled = true }) {
  if (!enabled) {
    return {
      ok: false,
      enabled: false,
      source: "rainviewer",
      fetchedAt: new Date().toISOString(),
      message: "RainViewer fallback disabled."
    };
  }

  const response = await fetch(RAINVIEWER_URL, {
    headers: {
      "accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`RainViewer HTTP ${response.status}`);
  }

  const data = await response.json();
  const frames = data.radar?.past || [];
  const latestFrame = frames[frames.length - 1] || null;
  const imageUrl = latestFrame
    ? `${data.host}${latestFrame.path}/512/7/${latitude}/${longitude}/2/1_1.png`
    : null;
  const tileUrlTemplate = latestFrame
    ? `${data.host}${latestFrame.path}/512/{z}/{x}/{y}/2/1_1.png`
    : null;

  return {
    ok: !!imageUrl,
    enabled: true,
    source: "rainviewer",
    fetchedAt: new Date().toISOString(),
    generatedAt: data.generated ? new Date(data.generated * 1000).toISOString() : null,
    frameTime: latestFrame?.time ? new Date(latestFrame.time * 1000).toISOString() : null,
    imageUrl,
    tileUrlTemplate,
    frames: frames.slice(-6)
  };
}

async function buildMeteoFranceRadarResponse({ env, fetchedAt, authMode, radarMetadata, fetchBinary, forceHdf5Refresh = false }) {
  const { metadata, productUrl, fallbackProductUrl, zoneUrl, observationsUrl, observationUrl } = radarMetadata;
  const hdf5Diagnostics = productUrl
    ? await inspectMeteoFranceHdf5Product({ env, fetchBinary, productUrl, validityTime: metadata.validity_time || metadata.validityTime, forceRefresh: forceHdf5Refresh })
    : null;
  const nativeLayer = buildMeteoFranceNativeLayer(hdf5Diagnostics);
  const hasPrimaryProduct = !!productUrl;
  const hasFallbackProduct = !!fallbackProductUrl;
  const activeProductUrl = productUrl || fallbackProductUrl;
  const activeMesh = productUrl ? METEOFRANCE_RADAR_PRIMARY_MESH : (fallbackProductUrl ? METEOFRANCE_RADAR_FALLBACK_MESH : null);
  const activeFormat = productUrl ? "hdf5" : (fallbackProductUrl ? "gzip-bufr" : null);

  return {
    ok: !!activeProductUrl,
    enabled: true,
    source: "meteofrance-radar",
    fetchedAt,
    validityTime: normalizeIsoDate(metadata.validity_time || metadata.validityTime) || null,
    observation: METEOFRANCE_RADAR_OBSERVATION,
    zone: METEOFRANCE_RADAR_ZONE,
    mesh: activeMesh,
    format: activeFormat,
    productUrl: sanitizePublicUrl(productUrl),
    fallbackProductUrl: sanitizePublicUrl(fallbackProductUrl),
    score: null,
    precipitationMm: null,
    probability: null,
    nativeLayer,
    frameLimit: METEOFRANCE_RADAR_FRAME_LIMIT,
    frames: nativeLayer?.ok ? nativeLayer.frames : [],
    message: buildMeteoFranceRadarMessage({ hasPrimaryProduct, hasFallbackProduct, hdf5Diagnostics, nativeLayer }),
    metadata: {
      mesh500ProductUrl: sanitizePublicUrl(productUrl),
      mesh1000ProductUrl: sanitizePublicUrl(fallbackProductUrl),
      hdf5: hdf5Diagnostics
    },
    diagnostics: {
      configured: true,
      authMode,
      catalogEndpoint: METEOFRANCE_RADAR_CATALOG_URL,
      zoneEndpoint: sanitizePublicUrl(zoneUrl),
      observationsEndpoint: sanitizePublicUrl(observationsUrl),
      observationEndpoint: sanitizePublicUrl(observationUrl),
      product500Found: hasPrimaryProduct,
      product1000Found: hasFallbackProduct,
      productLinkFound: !!activeProductUrl,
      selectedMesh: activeMesh,
      selectedFormat: activeFormat,
      hdf5: hdf5Diagnostics,
      nativeLayerAvailable: !!nativeLayer?.ok,
      fallbackReason: nativeLayer?.ok ? null : buildMeteoFranceFallbackReason({ hasPrimaryProduct, hasFallbackProduct, hdf5Diagnostics })
    }
  };
}

async function fetchMeteoFranceRadarMetadata(fetchJson) {
  const catalog = await fetchJson(METEOFRANCE_RADAR_CATALOG_URL);
  const zoneUrl = requireMeteoFranceLink(catalog, (url) => trimTrailingSlash(url).endsWith(`/mosaiques/${METEOFRANCE_RADAR_ZONE}`), `${METEOFRANCE_RADAR_ZONE} zone`);
  const zoneMetadata = await fetchJson(zoneUrl);
  const observationsUrl = requireMeteoFranceLink(zoneMetadata, (url) => trimTrailingSlash(url).endsWith(`/mosaiques/${METEOFRANCE_RADAR_ZONE}/observations`), `${METEOFRANCE_RADAR_ZONE} observations`);
  const observations = await fetchJson(observationsUrl);
  const observationUrl = requireMeteoFranceLink(observations, (url) => trimTrailingSlash(url).endsWith(`/observations/${METEOFRANCE_RADAR_OBSERVATION}`), `${METEOFRANCE_RADAR_OBSERVATION} observation`);
  const metadata = await fetchJson(observationUrl);

  return {
    metadata,
    productUrl: findMeteoFranceProductUrl(metadata, METEOFRANCE_RADAR_PRIMARY_MESH),
    fallbackProductUrl: findMeteoFranceProductUrl(metadata, METEOFRANCE_RADAR_FALLBACK_MESH),
    zoneUrl,
    observationsUrl,
    observationUrl
  };
}

async function inspectMeteoFranceHdf5Product({ env, fetchBinary, productUrl, validityTime, forceRefresh = false }) {
  const cacheKey = buildMeteoFranceHdf5CacheKey(productUrl, validityTime);
  const cached = !forceRefresh ? await readMeteoFranceCache(env, cacheKey) : null;

  if (cached) {
    return {
      ...cached,
      cache: "hit"
    };
  }

  const diagnostics = await downloadAndInspectMeteoFranceHdf5(fetchBinary, productUrl);
  const value = {
    ...diagnostics,
    checkedAt: new Date().toISOString(),
    cache: "miss"
  };

  await writeMeteoFranceCache(env, cacheKey, value);
  return value;
}

async function downloadAndInspectMeteoFranceHdf5(fetchBinary, productUrl) {
  let response;

  try {
    response = await fetchBinary(productUrl);
  } catch (error) {
    return buildHdf5Diagnostics({ downloadOk: false, error: sanitizeMeteoFranceMessage(error.message) });
  }

  const contentType = response.headers.get("content-type") || "";
  const contentLengthHeader = toFiniteNumber(response.headers.get("content-length"));
  const httpStatus = response.status;

  if (!response.ok) {
    return buildHdf5Diagnostics({
      downloadOk: false,
      httpStatus,
      contentType,
      contentLengthHeader,
      error: await buildMeteoFranceHttpError(response, sanitizePublicUrl(productUrl) || "Météo-France HDF5 product", "Météo-France HDF5")
    });
  }

  if (Number.isFinite(contentLengthHeader) && contentLengthHeader > METEOFRANCE_HDF5_MAX_BYTES) {
    return buildHdf5Diagnostics({
      downloadOk: false,
      httpStatus,
      contentType,
      contentLengthHeader,
      error: `Météo-France HDF5 file is too large for this Worker diagnostic: ${contentLengthHeader} bytes.`
    });
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (bytes.byteLength > METEOFRANCE_HDF5_MAX_BYTES) {
    return buildHdf5Diagnostics({
      downloadOk: false,
      httpStatus,
      contentType,
      contentLengthHeader,
      byteLength: bytes.byteLength,
      error: `Météo-France HDF5 file is too large for this Worker diagnostic: ${bytes.byteLength} bytes.`
    });
  }

  const signatureOk = hasHdf5Signature(bytes);
  const structure = signatureOk ? parseMeteoFranceHdf5Structure(bytes) : null;

  return buildHdf5Diagnostics({
    downloadOk: true,
    httpStatus,
    contentType,
    contentLengthHeader,
    byteLength: bytes.byteLength,
    signature: bytesToHex(bytes.slice(0, METEOFRANCE_HDF5_SIGNATURE.length)),
    signatureOk,
    structure,
    error: signatureOk ? null : "Downloaded product does not start with the expected HDF5 signature."
  });
}

function buildHdf5Diagnostics({
  downloadOk,
  httpStatus = null,
  contentType = "",
  contentLengthHeader = null,
  byteLength = null,
  signature = null,
  signatureOk = false,
  structure = null,
  error = null
}) {
  const radarDataset = identifyMeteoFranceRadarDataset(structure);
  const qualityDataset = identifyMeteoFranceQualityDataset(structure);
  const projection = extractMeteoFranceProjection(structure);
  const bounds = extractMeteoFranceBounds(structure);
  const dimensions = radarDataset?.dimensions || null;
  const canDecodeGrid = !!radarDataset && !!projection && !!bounds && isMeteoFranceDatasetReadableForNativeLayer(radarDataset);
  const nativeLayerBlocker = buildMeteoFranceNativeLayerBlocker({ radarDataset, projection, bounds });
  const fallbackError = buildMeteoFranceHdf5ParsingError({ signatureOk, structure, radarDataset, projection, bounds, nativeLayerBlocker });

  return {
    downloadOk,
    httpStatus,
    contentType: contentType || null,
    contentLengthHeader,
    byteLength,
    maxBytes: METEOFRANCE_HDF5_MAX_BYTES,
    signature,
    signatureOk,
    parser: "worker-safe-hdf5-structure-parser-v1",
    parsingOk: !!structure?.parsingOk,
    canDecodeGrid,
    structure,
    expectedDimensions: METEOFRANCE_HDF5_EXPECTED_DIMENSIONS,
    groups: structure?.groups || [],
    datasets: structure?.datasets || [],
    radarDataset: radarDataset ? summarizeHdf5Dataset(radarDataset) : null,
    quality: qualityDataset ? summarizeHdf5Dataset(qualityDataset) : null,
    dimensions,
    projection,
    bounds,
    unit: radarDataset ? getHdf5AttributeValue(radarDataset.attributes, ["unit", "units", "unite"]) : null,
    scaleFactor: radarDataset ? getHdf5AttributeValue(radarDataset.attributes, ["scale_factor", "scale", "factor", "facteur_echelle"]) : null,
    missingValue: radarDataset ? getHdf5AttributeValue(radarDataset.attributes, ["missing_value", "_fillvalue", "nodata", "no_data", "fill_value"]) : null,
    nativeLayerBlocker,
    error: sanitizeMeteoFranceMessage(error || fallbackError)
  };
}

function buildMeteoFranceNativeLayer(hdf5Diagnostics) {
  if (!hdf5Diagnostics?.signatureOk) {
    return {
      ok: false,
      reason: hdf5Diagnostics?.error || "Météo-France HDF5 product is not available or not valid."
    };
  }

  return {
    ok: false,
    reason: hdf5Diagnostics.nativeLayerBlocker
      ? `Météo-France HDF5 structure parsed, but native rendering remains disabled: ${hdf5Diagnostics.nativeLayerBlocker}.`
      : "Météo-France HDF5 product is valid, but no native Leaflet layer can be built yet; RainViewer remains the visual fallback.",
    frames: []
  };
}

function buildMeteoFranceRadarMessage({ hasPrimaryProduct, hasFallbackProduct, hdf5Diagnostics, nativeLayer }) {
  if (nativeLayer?.ok) {
    return "Météo-France radar native HDF5 layer is available.";
  }

  if (hasPrimaryProduct && hdf5Diagnostics?.parsingOk) {
    return `Météo-France radar HDF5 500 m product is available and its structure was parsed; native rendering remains disabled because ${hdf5Diagnostics.nativeLayerBlocker}.`;
  }

  if (hasPrimaryProduct && hdf5Diagnostics?.signatureOk) {
    return "Météo-France radar HDF5 500 m product is available, but structural parsing did not complete.";
  }

  if (hasPrimaryProduct && hdf5Diagnostics?.downloadOk === false) {
    return `Météo-France radar HDF5 500 m product was found, but download failed: ${hdf5Diagnostics.error}`;
  }

  if (hasPrimaryProduct) {
    return "Météo-France radar HDF5 500 m product was found, but it is not usable yet.";
  }

  if (hasFallbackProduct) {
    return "Météo-France radar HDF5 500 m product was not found; only the 1 km BUFR fallback product is available.";
  }

  return "Météo-France radar metadata received, but no 500 m HDF5 or 1 km BUFR product link was found.";
}

function buildMeteoFranceFallbackReason({ hasPrimaryProduct, hasFallbackProduct, hdf5Diagnostics }) {
  if (!hasPrimaryProduct && hasFallbackProduct) {
    return "Only the 1 km BUFR fallback product is available; BUFR parsing is out of scope.";
  }

  if (!hasPrimaryProduct) {
    return "No 500 m HDF5 product link was found in the DPRadar metadata.";
  }

  if (!hdf5Diagnostics?.downloadOk) {
    return hdf5Diagnostics?.error || "The 500 m HDF5 product could not be downloaded.";
  }

  if (!hdf5Diagnostics.signatureOk) {
    return hdf5Diagnostics.error || "The 500 m product does not have a valid HDF5 signature.";
  }

  if (hdf5Diagnostics.parsingOk) {
    return hdf5Diagnostics.nativeLayerBlocker || "The 500 m HDF5 product was parsed, but no native layer can be built yet.";
  }

  return hdf5Diagnostics.error || "The 500 m HDF5 product is present, but structural parsing did not complete.";
}

function buildMeteoFranceMissingConfigResponse(fetchedAt, includeDebugDiagnostics) {
  return {
    ok: false,
    enabled: false,
    source: "meteofrance-radar",
    fetchedAt,
    message: "METEOFRANCE_API_KEY or METEOFRANCE_APPLICATION_ID is not configured yet.",
    diagnostics: {
      configured: false,
      authMode: null,
      ...(includeDebugDiagnostics ? {
        tokenOk: null,
        catalogOk: false,
        catalogEndpoint: METEOFRANCE_RADAR_CATALOG_URL
      } : {}),
      requiredSecrets: METEOFRANCE_REQUIRED_SECRETS
    }
  };
}

function buildMeteoFranceDebugErrorResponse({ fetchedAt, authMode, tokenOk, message, env }) {
  return {
    ok: false,
    enabled: true,
    source: "meteofrance-radar",
    fetchedAt,
    message: sanitizeMeteoFranceMessage(message),
    diagnostics: {
      configured: true,
      authMode,
      tokenOk,
      catalogOk: false,
      tokenEndpoint: authMode === "oauth2" ? METEOFRANCE_TOKEN_URL : undefined,
      catalogEndpoint: METEOFRANCE_RADAR_CATALOG_URL,
      userAgentSent: authMode === "oauth2" ? !!getMeteoFranceUserAgent(env || {}) : undefined
    }
  };
}

function buildMeteoFranceHdf5DebugPayload(debug) {
  return {
    ok: !!debug.diagnostics?.hdf5?.signatureOk,
    enabled: debug.enabled,
    source: "meteofrance-radar-hdf5",
    fetchedAt: debug.fetchedAt,
    message: debug.diagnostics?.fallbackReason || debug.message,
    diagnostics: {
      configured: debug.diagnostics?.configured ?? false,
      authMode: debug.diagnostics?.authMode ?? null,
      tokenOk: debug.diagnostics?.tokenOk ?? null,
      catalogOk: debug.diagnostics?.catalogOk ?? false,
      product500Found: debug.diagnostics?.product500Found ?? false,
      product1000Found: debug.diagnostics?.product1000Found ?? false,
      productUrl: debug.productUrl || null,
      fallbackProductUrl: debug.fallbackProductUrl || null,
      hdf5: debug.diagnostics?.hdf5 || null,
      nativeLayerAvailable: !!debug.nativeLayer?.ok,
      nativeLayerReason: debug.nativeLayer?.reason || null,
      fallbackReason: debug.diagnostics?.fallbackReason || null,
      frameLimit: METEOFRANCE_RADAR_FRAME_LIMIT,
      nativeFrameCount: debug.frames?.length || 0,
      storedFrameCount: 0,
      frameCount: debug.frames?.length || 0
    }
  };
}

function addDebugCatalogDiagnostics(radar, tokenOk, catalogOk) {
  return {
    ...radar,
    diagnostics: {
      ...radar.diagnostics,
      tokenOk,
      catalogOk,
      userAgentSent: radar.diagnostics.authMode === "oauth2" ? true : undefined
    }
  };
}

function getMeteoFranceAuthMode(env) {
  if (env.METEOFRANCE_API_KEY) {
    return "api-key";
  }

  if (env.METEOFRANCE_APPLICATION_ID) {
    return "oauth2";
  }

  return null;
}

async function obtainMeteoFranceAccessToken(env) {
  const response = await fetch(METEOFRANCE_TOKEN_URL, {
    method: "POST",
    headers: buildMeteoFranceTokenHeaders(env),
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    throw new Error(await buildMeteoFranceHttpError(response, METEOFRANCE_TOKEN_URL, "Météo-France token"));
  }

  const data = await readMeteoFranceJsonResponse(response, METEOFRANCE_TOKEN_URL, "Météo-France token");
  const token = data.access_token;

  if (!token) {
    throw new Error("Météo-France token response did not contain an access token.");
  }

  return token;
}

async function fetchMeteoFranceJsonWithApiKey(env, url) {
  const response = await fetchWithApiKey(url, env.METEOFRANCE_API_KEY, {
    headers: {
      "accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await buildMeteoFranceHttpError(response, url, "Météo-France radar"));
  }

  return readMeteoFranceJsonResponse(response, url, "Météo-France radar");
}

async function fetchMeteoFranceJsonWithOAuth(env, url, tokenState = {}) {
  const response = await fetchMeteoFranceWithOAuth(env, url, {
    headers: {
      "accept": "application/json"
    }
  }, tokenState);

  if (!response.ok) {
    throw new Error(await buildMeteoFranceHttpError(response, url, "Météo-France radar"));
  }

  return readMeteoFranceJsonResponse(response, url, "Météo-France radar");
}

async function fetchMeteoFranceBinaryWithApiKey(env, url) {
  return fetchWithApiKey(url, env.METEOFRANCE_API_KEY, {
    headers: {
      "accept": "application/x-hdf5, application/octet-stream, */*"
    }
  });
}

async function fetchMeteoFranceBinaryWithOAuth(env, url, tokenState = {}) {
  return fetchMeteoFranceWithOAuth(env, url, {
    headers: {
      "accept": "application/x-hdf5, application/octet-stream, */*"
    }
  }, tokenState);
}

async function fetchMeteoFranceWithOAuth(env, url, options = {}, tokenState = {}) {
  if (!tokenState.accessToken) {
    tokenState.accessToken = await obtainMeteoFranceAccessToken(env);
  }

  const response = await fetchWithBearer(url, tokenState.accessToken, options);

  if (response.status !== 401) {
    return response;
  }

  const body = await response.text().catch(() => "");

  if (!body.includes("Invalid JWT token")) {
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }

  tokenState.accessToken = await obtainMeteoFranceAccessToken(env);
  return fetchWithBearer(url, tokenState.accessToken, options);
}

function fetchWithApiKey(url, apiKey, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "apikey": apiKey
    }
  });
}

function fetchWithBearer(url, accessToken, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "authorization": `Bearer ${accessToken}`
    }
  });
}

function buildMeteoFranceTokenHeaders(env) {
  const headers = {
    "accept": "application/json",
    "authorization": `Basic ${env.METEOFRANCE_APPLICATION_ID}`,
    "cache-control": "no-cache",
    "content-type": "application/x-www-form-urlencoded"
  };
  const userAgent = getMeteoFranceUserAgent(env);

  if (userAgent) {
    headers["user-agent"] = userAgent;
  }

  return headers;
}

function getMeteoFranceUserAgent(env) {
  return sanitizeHeaderText(env.METEOFRANCE_USER_AGENT || env.METNO_USER_AGENT || METEOFRANCE_TOKEN_USER_AGENT_FALLBACK);
}

function sanitizeHeaderText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

async function readMeteoFranceJsonResponse(response, url, label) {
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(sanitizeMeteoFranceMessage(`${label} returned ${contentType || "unknown content type"} instead of JSON from ${sanitizePublicUrl(url) || url}: ${summarizeBody(body)}`));
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(sanitizeMeteoFranceMessage(`${label} returned invalid JSON from ${sanitizePublicUrl(url) || url}: ${summarizeBody(body)}`));
  }
}

async function buildMeteoFranceHttpError(response, url, label) {
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text().catch(() => "");
  return sanitizeMeteoFranceMessage(`${label} HTTP ${response.status} from ${sanitizePublicUrl(url) || url}${contentType ? ` (${contentType})` : ""}: ${summarizeBody(body)}`);
}

function requireMeteoFranceLink(value, predicate, label) {
  const url = findMeteoFranceLink(value, predicate);

  if (!url) {
    throw new Error(`Météo-France radar link not found: ${label}.`);
  }

  return url;
}

function findMeteoFranceLink(value, predicate) {
  return collectUrls(value).find(predicate) || null;
}

function findMeteoFranceProductUrl(value, mesh) {
  const expectedMesh = `maille=${mesh}`;
  const urls = collectUrls(value);
  return urls.find((url) => url.includes("produit") && url.includes(expectedMesh)) || null;
}

function collectUrls(value) {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return isHttpUrl(value) ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectUrls);
  }

  if (typeof value === "object") {
    return Object.values(value).flatMap(collectUrls);
  }

  return [];
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function summarizeBody(body) {
  const normalized = String(body || "").replace(/\s+/g, " ").trim();
  return normalized ? normalized : "empty response body";
}

function parseMeteoFranceHdf5Structure(bytes) {
  const context = createHdf5Context(bytes);

  try {
    const superblock = parseHdf5Superblock(context);
    context.offsetSize = superblock.offsetSize;
    context.lengthSize = superblock.lengthSize;
    context.baseAddress = superblock.baseAddress;
    const rootGroup = parseHdf5Group(context, "/", "", superblock.rootSymbolTableEntry, new Set());

    return {
      parsingOk: context.errors.length === 0 && !!rootGroup,
      parser: "worker-safe-hdf5-structure-parser-v1",
      superblock,
      groups: context.groups,
      datasets: context.datasets,
      attributes: context.attributes,
      errors: context.errors.slice(0, 20)
    };
  } catch (error) {
    return {
      parsingOk: false,
      parser: "worker-safe-hdf5-structure-parser-v1",
      superblock: context.superblock || null,
      groups: context.groups,
      datasets: context.datasets,
      attributes: context.attributes,
      errors: [...context.errors, error.message].slice(0, 20)
    };
  }
}

function createHdf5Context(bytes) {
  return {
    bytes,
    view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    offsetSize: 8,
    lengthSize: 8,
    baseAddress: 0,
    groups: [],
    datasets: [],
    attributes: [],
    errors: []
  };
}

function findHdf5SignatureOffset(bytes) {
  const offsets = [0, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];
  return offsets.find((offset) => hasHdf5Signature(bytes.subarray(offset, offset + METEOFRANCE_HDF5_SIGNATURE.length))) ?? -1;
}

function parseHdf5Superblock(context) {
  const signatureOffset = findHdf5SignatureOffset(context.bytes);

  if (signatureOffset < 0) {
    throw new Error("HDF5 signature was not found at a supported superblock offset.");
  }

  const version = readUInt8(context, signatureOffset + 8);

  if (version !== 0) {
    throw new Error(`HDF5 superblock version ${version} is not supported by this minimal Worker parser.`);
  }

  const offsetSize = readUInt8(context, signatureOffset + 13);
  const lengthSize = readUInt8(context, signatureOffset + 14);

  if (![4, 8].includes(offsetSize) || ![4, 8].includes(lengthSize)) {
    throw new Error(`Unsupported HDF5 offset/length sizes: ${offsetSize}/${lengthSize}.`);
  }

  context.offsetSize = offsetSize;
  context.lengthSize = lengthSize;

  const addressOffset = signatureOffset + 24;
  const baseAddress = readHdf5Offset(context, addressOffset);
  const eofAddress = readHdf5Offset(context, addressOffset + offsetSize * 2);
  const rootSymbolTableEntry = readHdf5SymbolTableEntry(context, addressOffset + offsetSize * 4);
  const superblock = {
    signatureOffset,
    version,
    offsetSize,
    lengthSize,
    groupLeafNodeK: readUInt16(context, signatureOffset + 16),
    groupInternalNodeK: readUInt16(context, signatureOffset + 18),
    baseAddress,
    eofAddress,
    rootSymbolTableEntry: sanitizeHdf5SymbolTableEntry(rootSymbolTableEntry)
  };

  context.baseAddress = baseAddress || 0;
  context.superblock = superblock;
  return superblock;
}

function parseHdf5Group(context, path, name, symbolTableEntry, visited) {
  const objectHeader = parseHdf5ObjectHeader(context, symbolTableEntry.objectHeaderAddress);

  if (visited.has(symbolTableEntry.objectHeaderAddress)) {
    return null;
  }

  visited.add(symbolTableEntry.objectHeaderAddress);

  const symbolTable = objectHeader.symbolTable || symbolTableEntry.groupInfo;
  const group = {
    path,
    name,
    objectHeaderAddress: symbolTableEntry.objectHeaderAddress,
    attributes: objectHeader.attributes,
    entryCount: null
  };

  context.groups.push(group);
  context.attributes.push(...objectHeader.attributes.map((attribute) => ({ ...attribute, ownerPath: path })));

  if (!symbolTable?.btreeAddress || !symbolTable?.heapAddress) {
    context.errors.push(`Group ${path} has no supported symbol table.`);
    return group;
  }

  const entries = readHdf5GroupEntries(context, symbolTable.btreeAddress, symbolTable.heapAddress);
  group.entryCount = entries.length;

  for (const entry of entries) {
    const childPath = path === "/" ? `/${entry.name}` : `${path}/${entry.name}`;
    const childHeader = parseHdf5ObjectHeader(context, entry.objectHeaderAddress);
    const childAttributes = childHeader.attributes.map((attribute) => ({ ...attribute, ownerPath: childPath }));

    context.attributes.push(...childAttributes);

    if (childHeader.symbolTable || entry.groupInfo) {
      parseHdf5Group(context, childPath, entry.name, entry, visited);
      continue;
    }

    if (childHeader.dataspace || childHeader.datatype || childHeader.layout) {
      context.datasets.push({
        path: childPath,
        name: entry.name,
        objectHeaderAddress: entry.objectHeaderAddress,
        dimensions: childHeader.dataspace?.dimensions || null,
        rank: childHeader.dataspace?.rank ?? null,
        dataType: childHeader.datatype || null,
        storage: childHeader.layout || null,
        filters: childHeader.filters || [],
        attributes: childHeader.attributes,
        unsupportedMessages: childHeader.unsupportedMessages
      });
      continue;
    }

    context.errors.push(`Object ${childPath} is neither a supported group nor a supported dataset.`);
  }

  return group;
}

function readHdf5GroupEntries(context, btreeAddress, heapAddress) {
  const heap = parseHdf5LocalHeap(context, heapAddress);
  return readHdf5GroupBtreeNode(context, btreeAddress, heap, new Set()).sort((a, b) => a.name.localeCompare(b.name));
}

function parseHdf5LocalHeap(context, address) {
  assertHdf5Ascii(context, address, "HEAP");
  const dataSegmentSize = readHdf5Length(context, address + 8);
  const dataSegmentAddress = readHdf5Offset(context, address + 8 + context.lengthSize * 2);

  return {
    address,
    dataSegmentSize,
    dataSegmentAddress
  };
}

function readHdf5GroupBtreeNode(context, address, heap, visited) {
  if (!Number.isFinite(address) || visited.has(address)) {
    return [];
  }

  visited.add(address);
  assertHdf5Ascii(context, address, "TREE");

  const nodeType = readUInt8(context, address + 4);
  const nodeLevel = readUInt8(context, address + 5);
  const entriesUsed = readUInt16(context, address + 6);
  let cursor = address + 8 + context.offsetSize * 2;
  const entries = [];

  if (nodeType !== 0) {
    context.errors.push(`Unsupported HDF5 v1 B-tree node type ${nodeType}.`);
    return entries;
  }

  if (nodeLevel === 0) {
    for (let index = 0; index < entriesUsed; index++) {
      const nameOffset = readHdf5Length(context, cursor);
      cursor += context.lengthSize;
      const symbolTableEntry = readHdf5SymbolTableEntry(context, cursor);
      cursor += getHdf5SymbolTableEntrySize(context);
      const name = readHdf5HeapString(context, heap, nameOffset) || `entry-${index}`;
      entries.push({
        ...symbolTableEntry,
        name,
        nameOffset
      });
    }

    return entries;
  }

  for (let index = 0; index <= entriesUsed; index++) {
    cursor += context.lengthSize;
    const childAddress = readHdf5Offset(context, cursor);
    cursor += context.offsetSize;
    entries.push(...readHdf5GroupBtreeNode(context, childAddress, heap, visited));
  }

  return entries;
}

function readHdf5HeapString(context, heap, offset) {
  const start = heap.dataSegmentAddress + offset;
  const maxEnd = Math.min(heap.dataSegmentAddress + heap.dataSegmentSize, context.bytes.byteLength);
  let end = start;

  while (end < maxEnd && context.bytes[end] !== 0) {
    end++;
  }

  return decodeHdf5Ascii(context.bytes.subarray(start, end));
}

function readHdf5SymbolTableEntry(context, offset) {
  const linkNameOffset = readHdf5Length(context, offset);
  const objectHeaderAddress = readHdf5Offset(context, offset + context.lengthSize);
  const cacheType = readUInt32(context, offset + context.lengthSize + context.offsetSize);
  const scratchOffset = offset + context.lengthSize + context.offsetSize + 8;
  const groupInfo = cacheType === 1 ? {
    btreeAddress: readHdf5Offset(context, scratchOffset),
    heapAddress: readHdf5Offset(context, scratchOffset + context.offsetSize)
  } : null;

  return {
    linkNameOffset,
    objectHeaderAddress,
    cacheType,
    groupInfo
  };
}

function getHdf5SymbolTableEntrySize(context) {
  return context.lengthSize + context.offsetSize + 24;
}

function parseHdf5ObjectHeader(context, address) {
  if (!Number.isFinite(address)) {
    throw new Error("Invalid HDF5 object header address.");
  }

  if (readAsciiAt(context, address, 4) === "OHDR") {
    return parseHdf5ObjectHeaderV2(context, address);
  }

  return parseHdf5ObjectHeaderV1(context, address);
}

function parseHdf5ObjectHeaderV1(context, address) {
  const version = readUInt8(context, address);

  if (version !== 1) {
    throw new Error(`Unsupported HDF5 object header version ${version} at ${address}.`);
  }

  const messageCount = readUInt16(context, address + 2);
  let cursor = address + 12;
  const result = createEmptyHdf5ObjectHeader(address, version);

  for (let index = 0; index < messageCount; index++) {
    const messageType = readUInt16(context, cursor);
    const messageSize = readUInt16(context, cursor + 2);
    const flags = readUInt8(context, cursor + 4);
    const messageData = context.bytes.subarray(cursor + 8, cursor + 8 + messageSize);
    applyHdf5ObjectHeaderMessage(context, result, messageType, messageData, flags);
    cursor = alignTo(cursor + 8 + messageSize, 8);
  }

  return result;
}

function parseHdf5ObjectHeaderV2(context, address) {
  const result = createEmptyHdf5ObjectHeader(address, 2);
  result.unsupportedMessages.push("object-header-v2");
  context.errors.push(`HDF5 object header v2 at ${address} is not supported by this minimal parser yet.`);
  return result;
}

function createEmptyHdf5ObjectHeader(address, version) {
  return {
    address,
    version,
    dataspace: null,
    datatype: null,
    layout: null,
    filters: [],
    attributes: [],
    symbolTable: null,
    unsupportedMessages: []
  };
}

function applyHdf5ObjectHeaderMessage(context, header, messageType, messageData, flags) {
  try {
    if (messageType === 1) {
      header.dataspace = parseHdf5DataspaceMessage(context, messageData);
      return;
    }

    if (messageType === 3) {
      header.datatype = parseHdf5DatatypeMessage(messageData);
      return;
    }

    if (messageType === 8) {
      header.layout = parseHdf5DataLayoutMessage(context, messageData);
      return;
    }

    if (messageType === 11) {
      header.filters = parseHdf5FilterPipelineMessage(messageData);
      return;
    }

    if (messageType === 12) {
      header.attributes.push(parseHdf5AttributeMessage(context, messageData));
      return;
    }

    if (messageType === 17) {
      header.symbolTable = parseHdf5SymbolTableMessage(context, messageData);
      return;
    }

    if (![0, 14, 18].includes(messageType)) {
      header.unsupportedMessages.push({ type: messageType, flags });
    }
  } catch (error) {
    header.unsupportedMessages.push({ type: messageType, error: error.message });
  }
}

function parseHdf5DataspaceMessage(context, data) {
  const version = data[0];
  const rank = data[1] || 0;
  const flags = data[2] || 0;
  const cursor = version === 1 ? 8 : 4;
  const dimensions = [];

  for (let index = 0; index < rank; index++) {
    dimensions.push(readHdf5Length(context, cursor + index * context.lengthSize, data));
  }

  return {
    version,
    rank,
    flags,
    dimensions
  };
}

function parseHdf5DatatypeMessage(data) {
  const classAndVersion = data[0] || 0;
  const typeClass = classAndVersion & 0x0f;
  const version = (classAndVersion >> 4) & 0x0f;
  const size = readUInt32FromBytes(data, 4);
  const signed = typeClass === 0 ? !!(data[1] & 0x08) : null;

  return {
    version,
    class: typeClass,
    className: getHdf5DatatypeClassName(typeClass),
    size,
    signed,
    byteOrder: (data[1] & 0x01) === 0 ? "little-endian" : "big-endian"
  };
}

function parseHdf5DataLayoutMessage(context, data) {
  const version = data[0];

  if (version === 1 || version === 2) {
    return parseHdf5DataLayoutMessageV1(context, data, version);
  }

  if (version === 3 || version === 4) {
    return parseHdf5DataLayoutMessageV3(context, data, version);
  }

  return {
    version,
    layoutClass: "unknown",
    supported: false
  };
}

function parseHdf5DataLayoutMessageV1(context, data, version) {
  const rank = data[1] || 0;
  const layoutClass = data[2] || 0;
  let cursor = 8;

  if (layoutClass === 0) {
    return {
      version,
      layoutClass: "compact",
      supported: false,
      reason: "compact layout v1 is not decoded yet"
    };
  }

  if (layoutClass === 1) {
    const address = readHdf5Offset(context, cursor, data);
    cursor += context.offsetSize;
    const dimensionSizes = [];

    for (let index = 0; index < rank; index++) {
      dimensionSizes.push(readUInt32FromBytes(data, cursor));
      cursor += 4;
    }

    return {
      version,
      layoutClass: "contiguous",
      address,
      dimensionSizes,
      supported: true
    };
  }

  if (layoutClass === 2) {
    const address = readHdf5Offset(context, cursor, data);
    cursor += context.offsetSize;
    const chunkDimensions = [];

    for (let index = 0; index < rank; index++) {
      chunkDimensions.push(readUInt32FromBytes(data, cursor));
      cursor += 4;
    }

    return {
      version,
      layoutClass: "chunked",
      address,
      chunkDimensions,
      supported: false,
      reason: "chunk B-tree decoding is not implemented yet"
    };
  }

  return {
    version,
    layoutClass: "unknown",
    supported: false
  };
}

function parseHdf5DataLayoutMessageV3(context, data, version) {
  const layoutClass = data[1] || 0;
  let cursor = 2;

  if (layoutClass === 0) {
    const size = readUInt16FromBytes(data, cursor);
    cursor += 2;
    return {
      version,
      layoutClass: "compact",
      size,
      supported: false,
      reason: "compact dataset values are not used for radar grids"
    };
  }

  if (layoutClass === 1) {
    const address = readHdf5Offset(context, cursor, data);
    cursor += context.offsetSize;
    const size = readHdf5Length(context, cursor, data);
    return {
      version,
      layoutClass: "contiguous",
      address,
      size,
      supported: true
    };
  }

  if (layoutClass === 2) {
    const rank = data[cursor] || 0;
    cursor += 1;
    const address = readHdf5Offset(context, cursor, data);
    cursor += context.offsetSize;
    const chunkDimensions = [];

    for (let index = 0; index < rank; index++) {
      chunkDimensions.push(readUInt32FromBytes(data, cursor));
      cursor += 4;
    }

    const elementSize = readUInt32FromBytes(data, cursor);

    return {
      version,
      layoutClass: "chunked",
      rank,
      address,
      chunkDimensions,
      elementSize,
      supported: false,
      reason: "chunk B-tree and filter decoding are not implemented yet"
    };
  }

  return {
    version,
    layoutClass: "unknown",
    supported: false
  };
}

function parseHdf5FilterPipelineMessage(data) {
  const version = data[0];
  const filterCount = data[1] || 0;
  let cursor = version === 1 ? 8 : 2;
  const filters = [];

  for (let index = 0; index < filterCount; index++) {
    const id = readUInt16FromBytes(data, cursor);
    const nameLength = readUInt16FromBytes(data, cursor + 2);
    const flags = readUInt16FromBytes(data, cursor + 4);
    const clientValueCount = readUInt16FromBytes(data, cursor + 6);
    cursor += 8;
    const name = nameLength ? decodeHdf5Ascii(data.subarray(cursor, cursor + nameLength)).replace(/\0+$/, "") : getHdf5FilterName(id);
    cursor = alignTo(cursor + nameLength, 8);
    const clientValues = [];

    for (let valueIndex = 0; valueIndex < clientValueCount; valueIndex++) {
      clientValues.push(readUInt32FromBytes(data, cursor));
      cursor += 4;
    }

    if (clientValueCount % 2) {
      cursor += 4;
    }

    filters.push({
      id,
      name: name || getHdf5FilterName(id),
      flags,
      clientValues,
      supported: id === 1 ? false : false,
      reason: id === 1 ? "deflate decompression is not implemented in this Worker parser" : "filter is not implemented in this Worker parser"
    });
  }

  return filters;
}

function parseHdf5AttributeMessage(context, data) {
  const version = data[0];
  const nameSize = readUInt16FromBytes(data, 2);
  const datatypeSize = readUInt16FromBytes(data, 4);
  const dataspaceSize = readUInt16FromBytes(data, 6);
  let cursor = 8;
  const name = decodeHdf5Ascii(data.subarray(cursor, cursor + nameSize)).replace(/\0+$/, "");
  cursor = alignTo(cursor + nameSize, 8);
  const datatypeData = data.subarray(cursor, cursor + datatypeSize);
  const datatype = parseHdf5DatatypeMessage(datatypeData);
  cursor = alignTo(cursor + datatypeSize, 8);
  const dataspaceData = data.subarray(cursor, cursor + dataspaceSize);
  const dataspace = parseHdf5DataspaceMessage(context, dataspaceData);
  cursor = alignTo(cursor + dataspaceSize, 8);
  const rawValue = data.subarray(cursor);

  return {
    name,
    version,
    dataType: datatype,
    dataspace,
    value: decodeHdf5AttributeValue(datatype, dataspace, rawValue)
  };
}

function parseHdf5SymbolTableMessage(context, data) {
  return {
    btreeAddress: readHdf5Offset(context, 0, data),
    heapAddress: readHdf5Offset(context, context.offsetSize, data)
  };
}

function decodeHdf5AttributeValue(datatype, dataspace, rawValue) {
  const count = Math.max(1, (dataspace?.dimensions || []).reduce((total, value) => total * value, 1));

  if (datatype.className === "string") {
    const byteLength = Math.max(0, datatype.size * count);
    return decodeHdf5Ascii(rawValue.subarray(0, byteLength)).replace(/\0+$/, "").trim();
  }

  if (datatype.className === "fixed-point") {
    return decodeHdf5NumericValues(rawValue, datatype.size, count, datatype.signed, false);
  }

  if (datatype.className === "floating-point") {
    return decodeHdf5NumericValues(rawValue, datatype.size, count, true, true);
  }

  return {
    unsupportedType: datatype.className,
    byteLength: rawValue.byteLength
  };
}

function decodeHdf5NumericValues(rawValue, size, count, signed, floatingPoint) {
  const values = [];
  const view = new DataView(rawValue.buffer, rawValue.byteOffset, rawValue.byteLength);
  const limit = Math.min(count, 16);

  for (let index = 0; index < limit; index++) {
    const offset = index * size;

    if (offset + size > rawValue.byteLength) {
      break;
    }

    values.push(readHdf5NumericValue(view, offset, size, signed, floatingPoint));
  }

  return count === 1 ? values[0] : values;
}

function readHdf5NumericValue(view, offset, size, signed, floatingPoint) {
  if (floatingPoint && size === 4) {
    return view.getFloat32(offset, true);
  }

  if (floatingPoint && size === 8) {
    return view.getFloat64(offset, true);
  }

  if (size === 1) {
    return signed ? view.getInt8(offset) : view.getUint8(offset);
  }

  if (size === 2) {
    return signed ? view.getInt16(offset, true) : view.getUint16(offset, true);
  }

  if (size === 4) {
    return signed ? view.getInt32(offset, true) : view.getUint32(offset, true);
  }

  if (size === 8) {
    const value = signed ? view.getBigInt64(offset, true) : view.getBigUint64(offset, true);
    return Number(value);
  }

  return null;
}

function identifyMeteoFranceRadarDataset(structure) {
  const datasets = structure?.datasets || [];
  return datasets.find((dataset) => /^(data1|data|dataset1)$/i.test(dataset.name) && !/quality/i.test(dataset.name))
    || datasets.find((dataset) => /precip|cumul|rain|pluie|lame|eau/i.test(dataset.path) && !/quality|qualite/i.test(dataset.path))
    || datasets.find((dataset) => hasExpectedMeteoFranceRadarDimensions(dataset) && !/quality|qualite/i.test(dataset.path))
    || null;
}

function identifyMeteoFranceQualityDataset(structure) {
  const datasets = structure?.datasets || [];
  return datasets.find((dataset) => /quality|qualite/i.test(dataset.path)) || null;
}

function hasExpectedMeteoFranceRadarDimensions(dataset) {
  const dimensions = dataset?.dimensions || [];
  return dimensions.includes(METEOFRANCE_HDF5_EXPECTED_DIMENSIONS.width) && dimensions.includes(METEOFRANCE_HDF5_EXPECTED_DIMENSIONS.height);
}

function extractMeteoFranceProjection(structure) {
  const attributes = collectHdf5Attributes(structure);
  const projectionAttribute = attributes.find((attribute) => /projection|proj4|proj_def|grid_mapping|lambert|stereographic/i.test(attribute.name));

  if (!projectionAttribute) {
    return null;
  }

  return {
    source: projectionAttribute.ownerPath || projectionAttribute.name,
    value: projectionAttribute.value
  };
}

function extractMeteoFranceBounds(structure) {
  const attributes = collectHdf5Attributes(structure);
  const values = Object.fromEntries(attributes.map((attribute) => [normalizeHdf5AttributeName(attribute.name), attribute.value]));
  const south = firstFiniteHdf5Attribute(values, ["geospatial_lat_min", "lat_min", "latitude_min", "south", "y_min"]);
  const north = firstFiniteHdf5Attribute(values, ["geospatial_lat_max", "lat_max", "latitude_max", "north", "y_max"]);
  const west = firstFiniteHdf5Attribute(values, ["geospatial_lon_min", "lon_min", "longitude_min", "west", "x_min"]);
  const east = firstFiniteHdf5Attribute(values, ["geospatial_lon_max", "lon_max", "longitude_max", "east", "x_max"]);

  if (![south, north, west, east].every(Number.isFinite)) {
    return null;
  }

  return [[south, west], [north, east]];
}

function collectHdf5Attributes(structure) {
  return [
    ...(structure?.attributes || []),
    ...(structure?.datasets || []).flatMap((dataset) => dataset.attributes.map((attribute) => ({ ...attribute, ownerPath: dataset.path }))),
    ...(structure?.groups || []).flatMap((group) => group.attributes.map((attribute) => ({ ...attribute, ownerPath: group.path })))
  ];
}

function isMeteoFranceDatasetReadableForNativeLayer(dataset) {
  if (!dataset?.storage?.supported) {
    return false;
  }

  return !(dataset.filters || []).some((filter) => !filter.supported);
}

function buildMeteoFranceNativeLayerBlocker({ radarDataset, projection, bounds }) {
  if (!radarDataset) {
    return "no usable radar accumulation dataset was identified in the HDF5 structure";
  }

  if (!projection) {
    return "projection metadata was not found in readable HDF5 attributes";
  }

  if (!bounds) {
    return "geographic bounds were not found in readable HDF5 attributes";
  }

  if (!radarDataset.storage?.supported) {
    return radarDataset.storage?.reason || `dataset storage layout ${radarDataset.storage?.layoutClass || "unknown"} is not decoded yet`;
  }

  const unsupportedFilter = (radarDataset.filters || []).find((filter) => !filter.supported);

  if (unsupportedFilter) {
    return unsupportedFilter.reason || `dataset filter ${unsupportedFilter.name || unsupportedFilter.id} is not decoded yet`;
  }

  return null;
}

function buildMeteoFranceHdf5ParsingError({ signatureOk, structure, radarDataset, projection, bounds, nativeLayerBlocker }) {
  if (!signatureOk) {
    return "Downloaded product does not start with the expected HDF5 signature.";
  }

  if (!structure?.parsingOk) {
    const details = structure?.errors?.length ? ` ${structure.errors.join(" ")}` : "";
    return `HDF5 structural parsing did not complete.${details}`;
  }

  if (!radarDataset) {
    return "HDF5 structure was parsed, but no radar accumulation dataset could be identified.";
  }

  if (!projection || !bounds) {
    return `HDF5 structure was parsed and radar dataset ${radarDataset.path} was identified, but native Leaflet rendering remains disabled because ${nativeLayerBlocker}.`;
  }

  if (nativeLayerBlocker) {
    return `HDF5 structure was parsed and georeferencing metadata was found, but native Leaflet rendering remains disabled because ${nativeLayerBlocker}.`;
  }

  return null;
}

function summarizeHdf5Dataset(dataset) {
  return {
    path: dataset.path,
    name: dataset.name,
    dimensions: dataset.dimensions,
    rank: dataset.rank,
    dataType: dataset.dataType,
    storage: dataset.storage,
    filters: dataset.filters,
    attributes: dataset.attributes
  };
}

function getHdf5AttributeValue(attributes, names) {
  const normalizedNames = names.map(normalizeHdf5AttributeName);
  const attribute = (attributes || []).find((item) => normalizedNames.includes(normalizeHdf5AttributeName(item.name)));
  return attribute?.value ?? null;
}

function firstFiniteHdf5Attribute(values, names) {
  return names.map(normalizeHdf5AttributeName).map((name) => Number(values[name])).find(Number.isFinite) ?? null;
}

function normalizeHdf5AttributeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function getHdf5DatatypeClassName(typeClass) {
  return [
    "fixed-point",
    "floating-point",
    "time",
    "string",
    "bitfield",
    "opaque",
    "compound",
    "reference",
    "enum",
    "variable-length",
    "array"
  ][typeClass] || "unknown";
}

function getHdf5FilterName(id) {
  return {
    1: "deflate",
    2: "shuffle",
    3: "fletcher32",
    4: "szip",
    5: "nbit",
    6: "scaleoffset"
  }[id] || `filter-${id}`;
}

function sanitizeHdf5SymbolTableEntry(entry) {
  return {
    linkNameOffset: entry.linkNameOffset,
    objectHeaderAddress: entry.objectHeaderAddress,
    cacheType: entry.cacheType,
    groupInfo: entry.groupInfo
  };
}

function assertHdf5Ascii(context, offset, expected) {
  const actual = readAsciiAt(context, offset, expected.length);

  if (actual !== expected) {
    throw new Error(`Expected HDF5 signature ${expected} at ${offset}, got ${actual || "empty"}.`);
  }
}

function readAsciiAt(context, offset, length) {
  if (offset < 0 || offset + length > context.bytes.byteLength) {
    return "";
  }

  return decodeHdf5Ascii(context.bytes.subarray(offset, offset + length));
}

function decodeHdf5Ascii(bytes) {
  return Array.from(bytes || []).map((value) => String.fromCharCode(value)).join("");
}

function readUInt8(context, offset) {
  return offset >= 0 && offset < context.bytes.byteLength ? context.view.getUint8(offset) : null;
}

function readUInt16(context, offset) {
  return offset >= 0 && offset + 2 <= context.bytes.byteLength ? context.view.getUint16(offset, true) : null;
}

function readUInt32(context, offset) {
  return offset >= 0 && offset + 4 <= context.bytes.byteLength ? context.view.getUint32(offset, true) : null;
}

function readUInt16FromBytes(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    return 0;
  }

  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function readUInt32FromBytes(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    return 0;
  }

  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function readHdf5Offset(context, offset, source = null) {
  return readHdf5UnsignedInteger(context, offset, context.offsetSize, source);
}

function readHdf5Length(context, offset, source = null) {
  return readHdf5UnsignedInteger(context, offset, context.lengthSize, source);
}

function readHdf5UnsignedInteger(context, offset, size, source = null) {
  const bytes = source || context.bytes;

  if (offset < 0 || offset + size > bytes.byteLength) {
    return null;
  }

  let value = 0n;

  for (let index = 0; index < size; index++) {
    value += BigInt(bytes[offset + index]) << BigInt(index * 8);
  }

  const maxValue = (1n << BigInt(size * 8)) - 1n;

  if (value === maxValue) {
    return null;
  }

  return Number(value);
}

function alignTo(value, step) {
  return Math.ceil(value / step) * step;
}


function normalizeIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function hasHdf5Signature(bytes) {
  if (!bytes || bytes.length < METEOFRANCE_HDF5_SIGNATURE.length) {
    return false;
  }

  return METEOFRANCE_HDF5_SIGNATURE.every((value, index) => bytes[index] === value);
}

function bytesToHex(bytes) {
  return Array.from(bytes || [])
    .map((value) => value.toString(16).padStart(2, "0"))
    .join(" ");
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeMeteoFranceMessage(value) {
  return String(value || "")
    .replace(/https?:\/\/[^\s"'<>]+/g, (url) => sanitizePublicUrl(url.replace(/[),.;]+$/, "")) || "[redacted-url]")
    .replace(/([?&](?:apikey|token|tokenOauth2|access_token|jwt)=)[^\s&"'<>]+/gi, "$1[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-=]+/g, "Bearer [redacted]")
    .replace(/\bBasic\s+[A-Za-z0-9._~+\/-=]+/g, "Basic [redacted]");
}

function sanitizePublicUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const maille = url.searchParams.get("maille");
    url.search = "";

    if (maille) {
      url.searchParams.set("maille", maille);
    }

    return url.toString();
  } catch (error) {
    return null;
  }
}

function buildMeteoFranceHdf5CacheKey(productUrl, validityTime) {
  const safeUrl = sanitizePublicUrl(productUrl) || "unknown";
  const safeTime = normalizeIsoDate(validityTime) || "latest";
  return `meteofrance:hdf5:${safeTime}:${safeUrl}`.slice(0, 512);
}

async function readMeteoFranceCache(env, key) {
  if (!env?.WEATHER_KV || !key) {
    return null;
  }

  try {
    return await env.WEATHER_KV.get(key, "json");
  } catch (error) {
    return null;
  }
}

async function writeMeteoFranceCache(env, key, value) {
  if (!env?.WEATHER_KV || !key) {
    return;
  }

  try {
    await env.WEATHER_KV.put(key, JSON.stringify(value), { expirationTtl: 6 * 60 * 60 });
  } catch (error) {
    // Cache failure must not block the weather status.
  }
}
