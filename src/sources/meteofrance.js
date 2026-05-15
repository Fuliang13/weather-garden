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
const METEOFRANCE_NATIVE_RASTER_MAX_SIZE = 1024;
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
  const nativeLayer = buildMeteoFranceNativeLayer(hdf5Diagnostics, metadata.validity_time || metadata.validityTime);
  const publicHdf5Diagnostics = sanitizeMeteoFranceHdf5Diagnostics(hdf5Diagnostics);
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
      hdf5: publicHdf5Diagnostics
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
      hdf5: publicHdf5Diagnostics,
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
    return await buildHdf5Diagnostics({ downloadOk: false, error: sanitizeMeteoFranceMessage(error.message) });
  }

  const contentType = response.headers.get("content-type") || "";
  const contentLengthHeader = toFiniteNumber(response.headers.get("content-length"));
  const httpStatus = response.status;

  if (!response.ok) {
    return await buildHdf5Diagnostics({
      downloadOk: false,
      httpStatus,
      contentType,
      contentLengthHeader,
      error: await buildMeteoFranceHttpError(response, sanitizePublicUrl(productUrl) || "Météo-France HDF5 product", "Météo-France HDF5")
    });
  }

  if (Number.isFinite(contentLengthHeader) && contentLengthHeader > METEOFRANCE_HDF5_MAX_BYTES) {
    return await buildHdf5Diagnostics({
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
    return await buildHdf5Diagnostics({
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

  return await buildHdf5Diagnostics({
    bytes,
    downloadOk: true,
    httpStatus,
    contentType,
    contentLengthHeader,
    byteLength: bytes.byteLength,
    signature: bytesToHex(bytes.slice(0, METEOFRANCE_HDF5_SIGNATURE.length)),
    signatureOk,
    structure,
    error: signatureOk ? null : "Downloaded product does not start with a valid HDF5 signature."
  });
}

async function buildHdf5Diagnostics({
  bytes = null,
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
  const radarAttributes = collectMeteoFranceRadarDatasetAttributes(structure, radarDataset);
  const rasterDecode = await decodeMeteoFranceNativeRaster({ bytes, signatureOk, structure, radarDataset, radarAttributes, bounds });
  const nativeLayerCriteria = buildMeteoFranceNativeLayerCriteria({ signatureOk, structure, radarDataset, projection, bounds, rasterDecode });
  const canDecodeGrid = nativeLayerCriteria.valuesDecoded && nativeLayerCriteria.imageBuilt;
  const nativeLayerBlocker = buildMeteoFranceNativeLayerBlocker({ radarDataset, projection, bounds, nativeLayerCriteria, rasterDecode });
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
    quantity: radarDataset ? getHdf5AttributeValue(radarAttributes, ["quantity"]) : null,
    unit: radarDataset ? getHdf5AttributeValue(radarAttributes, ["unit", "units", "unite"]) : null,
    scaleFactor: radarDataset ? getHdf5AttributeValue(radarAttributes, ["scale_factor", "scale", "factor", "facteur_echelle", "gain"]) : null,
    offset: radarDataset ? getHdf5AttributeValue(radarAttributes, ["add_offset", "offset"]) : null,
    missingValue: radarDataset ? getHdf5AttributeValue(radarAttributes, ["missing_value", "_fillvalue", "nodata", "no_data", "fill_value"]) : null,
    undetectValue: radarDataset ? getHdf5AttributeValue(radarAttributes, ["undetect", "undetect_value"]) : null,
    nativeLayerCriteria,
    nativeLayerBlocker,
    nativeRaster: rasterDecode?.ok ? rasterDecode.raster : null,
    nativeLayerImageDataUrl: rasterDecode?.ok ? rasterDecode.imageDataUrl : null,
    error: error || fallbackError ? sanitizeMeteoFranceMessage(error || fallbackError) : null
  };
}

function buildMeteoFranceNativeLayer(hdf5Diagnostics, validityTime = null) {
  if (!hdf5Diagnostics?.signatureOk) {
    return {
      ok: false,
      reason: hdf5Diagnostics?.error || "Météo-France HDF5 product is not available or not valid.",
      frames: []
    };
  }

  const raster = hdf5Diagnostics.nativeRaster;
  const imageDataUrl = hdf5Diagnostics.nativeLayerImageDataUrl;

  if (!raster || !imageDataUrl || !hdf5Diagnostics.bounds) {
    return {
      ok: false,
      reason: hdf5Diagnostics.nativeLayerBlocker
        ? `Météo-France HDF5 structure parsed, but native rendering remains disabled: ${hdf5Diagnostics.nativeLayerBlocker}.`
        : "Météo-France HDF5 product is valid, but no native Leaflet layer can be built yet; RainViewer remains the visual fallback.",
      frames: []
    };
  }

  const frame = {
    provider: "meteofrance-radar",
    imageDataUrl,
    bounds: hdf5Diagnostics.bounds,
    width: raster.width,
    height: raster.height,
    sourceWidth: raster.sourceWidth,
    sourceHeight: raster.sourceHeight,
    validityTime: normalizeIsoDate(validityTime) || null,
    attribution: "Météo-France"
  };

  return {
    ok: true,
    provider: "meteofrance-radar",
    imageDataUrl,
    bounds: hdf5Diagnostics.bounds,
    width: raster.width,
    height: raster.height,
    sourceWidth: raster.sourceWidth,
    sourceHeight: raster.sourceHeight,
    validityTime: frame.validityTime,
    attribution: "Météo-France",
    frames: [frame]
  };
}

function sanitizeMeteoFranceHdf5Diagnostics(diagnostics) {
  if (!diagnostics) {
    return null;
  }

  const { nativeLayerImageDataUrl, ...publicDiagnostics } = diagnostics;
  return publicDiagnostics;
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
      cursor += context.lengthSize;
      const symbolTableNodeAddress = readHdf5Offset(context, cursor);
      cursor += context.offsetSize;
      entries.push(...readHdf5SymbolTableNode(context, symbolTableNodeAddress, heap));
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

function readHdf5SymbolTableNode(context, address, heap) {
  if (!Number.isFinite(address)) {
    return [];
  }

  assertHdf5Ascii(context, address, "SNOD");

  const version = readUInt8(context, address + 4);
  const entryCount = readUInt16(context, address + 6);
  const entries = [];
  let cursor = address + 8;

  if (version !== 1) {
    context.errors.push(`Unsupported HDF5 symbol table node version ${version}.`);
    return entries;
  }

  for (let index = 0; index < entryCount; index++) {
    const symbolTableEntry = readHdf5SymbolTableEntry(context, cursor);
    cursor += getHdf5SymbolTableEntrySize(context);
    const name = readHdf5HeapString(context, heap, symbolTableEntry.linkNameOffset) || `entry-${index}`;
    entries.push({
      ...symbolTableEntry,
      name,
      nameOffset: symbolTableEntry.linkNameOffset
    });
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
  const result = createEmptyHdf5ObjectHeader(address, version);

  parseHdf5ObjectHeaderMessages(context, result, address + 16, messageCount);
  return result;
}

function parseHdf5ObjectHeaderMessages(context, result, start, messageCount = null, limit = context.bytes.byteLength) {
  let cursor = start;
  let index = 0;

  while (cursor + 8 <= limit && (messageCount === null || index < messageCount)) {
    const messageType = readUInt16(context, cursor);
    const messageSize = readUInt16(context, cursor + 2);
    const flags = readUInt8(context, cursor + 4);

    if (messageType === 0 && messageSize === 0) {
      break;
    }

    const messageData = context.bytes.subarray(cursor + 8, cursor + 8 + messageSize);
    applyHdf5ObjectHeaderMessage(context, result, messageType, messageData, flags);
    cursor = alignTo(cursor + 8 + messageSize, 8);
    index++;
  }
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

    if (messageType === 16) {
      const continuation = parseHdf5ObjectHeaderContinuationMessage(context, messageData);
      parseHdf5ObjectHeaderMessages(context, header, continuation.address, null, continuation.address + continuation.size);
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
      supported: true
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
      supported: true
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
      supported: id === 1 && isHdf5DeflateSupported(),
      reason: id === 1
        ? (isHdf5DeflateSupported() ? null : "deflate decompression is not available in this runtime")
        : "filter is not implemented in this Worker parser"
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

function parseHdf5ObjectHeaderContinuationMessage(context, data) {
  return {
    address: readHdf5Offset(context, 0, data),
    size: readHdf5Length(context, context.offsetSize, data)
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
  const projectionAttribute = attributes.find((attribute) => /projection|proj4|proj_def|projdef|grid_mapping|lambert|stereographic/i.test(attribute.name));

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

  if ([south, north, west, east].every(Number.isFinite)) {
    return [[south, west], [north, east]];
  }

  const cornerLatitudes = ["ll_lat", "ul_lat", "ur_lat", "lr_lat"].map((name) => Number(values[name]));
  const cornerLongitudes = ["ll_lon", "ul_lon", "ur_lon", "lr_lon"].map((name) => Number(values[name]));

  if (![...cornerLatitudes, ...cornerLongitudes].every(Number.isFinite)) {
    return null;
  }

  return [
    [Math.min(...cornerLatitudes), Math.min(...cornerLongitudes)],
    [Math.max(...cornerLatitudes), Math.max(...cornerLongitudes)]
  ];
}

function collectHdf5Attributes(structure) {
  return [
    ...(structure?.attributes || []),
    ...(structure?.datasets || []).flatMap((dataset) => dataset.attributes.map((attribute) => ({ ...attribute, ownerPath: dataset.path }))),
    ...(structure?.groups || []).flatMap((group) => group.attributes.map((attribute) => ({ ...attribute, ownerPath: group.path })))
  ];
}

function collectMeteoFranceRadarDatasetAttributes(structure, radarDataset) {
  if (!radarDataset?.path) {
    return [];
  }

  const parentPath = radarDataset.path.replace(/\/[^/]+$/, "");
  const metadataGroupPath = `${parentPath}/what`;
  const metadataGroup = (structure?.groups || []).find((group) => group.path === metadataGroupPath);

  return [
    ...(radarDataset.attributes || []),
    ...(metadataGroup?.attributes || [])
  ];
}


async function decodeMeteoFranceNativeRaster({ bytes, signatureOk, structure, radarDataset, radarAttributes, bounds }) {
  if (!bytes || !signatureOk || !structure?.parsingOk || !radarDataset || !bounds) {
    return null;
  }

  if (!isMeteoFranceDatasetReadableForNativeLayer(radarDataset)) {
    return null;
  }

  try {
    const rawGrid = await readHdf5DatasetRawGrid(bytes, structure, radarDataset);

    if (!rawGrid?.bytes) {
      return {
        ok: false,
        reason: rawGrid?.reason || "radar dataset numeric values could not be decoded"
      };
    }

    return buildMeteoFranceNativeRasterPng({ rawGrid, radarDataset, radarAttributes });
  } catch (error) {
    return {
      ok: false,
      reason: sanitizeMeteoFranceMessage(error.message)
    };
  }
}

async function readHdf5DatasetRawGrid(bytes, structure, dataset) {
  const storage = dataset?.storage;
  const dimensions = dataset?.dimensions || [];
  const elementSize = dataset?.dataType?.size || storage?.elementSize || 0;
  const expectedLength = getHdf5DatasetExpectedByteLength(dataset);

  if (!Number.isFinite(expectedLength) || expectedLength <= 0) {
    return { ok: false, reason: "radar dataset byte length could not be computed" };
  }

  if (!elementSize) {
    return { ok: false, reason: "radar dataset element size is missing" };
  }

  if (storage?.layoutClass === "contiguous") {
    const address = storage.address;
    const length = storage.size || expectedLength;

    if (!Number.isFinite(address) || address < 0 || address + length > bytes.byteLength) {
      return { ok: false, reason: "contiguous radar dataset points outside the HDF5 file" };
    }

    if (length < expectedLength) {
      return { ok: false, reason: "contiguous radar dataset is smaller than expected" };
    }

    return {
      ok: true,
      bytes: bytes.slice(address, address + expectedLength),
      decodedChunks: 0,
      storage: "contiguous"
    };
  }

  if (storage?.layoutClass !== "chunked") {
    return { ok: false, reason: `dataset storage layout ${storage?.layoutClass || "unknown"} is not decoded yet` };
  }

  return readHdf5ChunkedDatasetRawGrid(bytes, structure, dataset, expectedLength, elementSize, dimensions);
}

async function readHdf5ChunkedDatasetRawGrid(bytes, structure, dataset, expectedLength, elementSize, dimensions) {
  const storage = dataset.storage;
  const chunkShape = getHdf5ChunkShape(storage, dimensions, elementSize);
  const chunks = readHdf5ChunkBtreeEntries({
    bytes,
    view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    offsetSize: structure.superblock?.offsetSize || 8,
    lengthSize: structure.superblock?.lengthSize || 8
  }, storage.address, storage.rank || storage.chunkDimensions?.length || dimensions.length);

  if (!chunks.length) {
    return { ok: false, reason: "chunk B-tree did not contain readable radar chunks" };
  }

  const output = new Uint8Array(expectedLength);
  const [height, width] = dimensions;
  let decodedChunks = 0;

  for (const chunk of chunks) {
    const chunkBytes = await readHdf5ChunkPayload(bytes, dataset.filters || [], chunk);

    if (!chunkBytes?.bytes) {
      return { ok: false, reason: chunkBytes?.reason || "radar chunk could not be decoded" };
    }

    copyHdf5ChunkToGrid({
      output,
      chunkBytes: chunkBytes.bytes,
      chunk,
      chunkShape,
      elementSize,
      width,
      height
    });
    decodedChunks++;
  }

  return {
    ok: true,
    bytes: output,
    decodedChunks,
    storage: "chunked"
  };
}

function getHdf5DatasetExpectedByteLength(dataset) {
  const dimensions = dataset?.dimensions || [];
  const elementSize = dataset?.dataType?.size || dataset?.storage?.elementSize || 0;

  if (!dimensions.length || !elementSize || !dimensions.every(Number.isFinite)) {
    return null;
  }

  return dimensions.reduce((total, dimension) => total * dimension, elementSize);
}

function getHdf5ChunkShape(storage, dimensions, elementSize) {
  const chunkDimensions = storage?.chunkDimensions || [];

  if (chunkDimensions.length > dimensions.length) {
    return chunkDimensions.slice(0, dimensions.length);
  }

  if (chunkDimensions.length === dimensions.length) {
    return chunkDimensions;
  }

  if (chunkDimensions.length && elementSize && chunkDimensions.at(-1) === elementSize) {
    return chunkDimensions.slice(0, -1);
  }

  return dimensions;
}

function readHdf5ChunkBtreeEntries(context, address, rank, visited = new Set()) {
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

  if (nodeType !== 1) {
    throw new Error(`Unsupported HDF5 chunk B-tree node type ${nodeType}.`);
  }

  for (let index = 0; index < entriesUsed; index++) {
    const key = readHdf5ChunkBtreeKey(context, cursor, rank);
    cursor += 8 + rank * context.lengthSize;
    const childAddress = readHdf5Offset(context, cursor);
    cursor += context.offsetSize;

    if (nodeLevel === 0) {
      entries.push({
        address: childAddress,
        byteLength: key.byteLength,
        filterMask: key.filterMask,
        offsets: key.offsets
      });
      continue;
    }

    entries.push(...readHdf5ChunkBtreeEntries(context, childAddress, rank, visited));
  }

  return entries;
}

function readHdf5ChunkBtreeKey(context, offset, rank) {
  const byteLength = readUInt32(context, offset);
  const filterMask = readUInt32(context, offset + 4);
  const offsets = [];
  let cursor = offset + 8;

  for (let index = 0; index < rank; index++) {
    offsets.push(readHdf5Length(context, cursor));
    cursor += context.lengthSize;
  }

  return { byteLength, filterMask, offsets };
}

async function readHdf5ChunkPayload(bytes, filters, chunk) {
  if (!Number.isFinite(chunk.address) || !Number.isFinite(chunk.byteLength) || chunk.byteLength <= 0) {
    return { ok: false, reason: "chunk address or size is missing" };
  }

  if (chunk.address + chunk.byteLength > bytes.byteLength) {
    return { ok: false, reason: "chunk points outside the HDF5 file" };
  }

  let chunkBytes = bytes.slice(chunk.address, chunk.address + chunk.byteLength);

  for (let index = 0; index < filters.length; index++) {
    const filter = filters[index];
    const skipped = !!(chunk.filterMask & (1 << index));

    if (skipped) {
      continue;
    }

    if (filter.id !== 1) {
      return { ok: false, reason: `dataset filter ${filter.name || filter.id} is not decoded yet` };
    }

    chunkBytes = await inflateHdf5DeflateBytes(chunkBytes);
  }

  return { ok: true, bytes: chunkBytes };
}

async function inflateHdf5DeflateBytes(bytes) {
  if (!isHdf5DeflateSupported()) {
    throw new Error("deflate decompression is not available in this runtime");
  }

  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function isHdf5DeflateSupported() {
  return typeof DecompressionStream === "function";
}

function copyHdf5ChunkToGrid({ output, chunkBytes, chunk, chunkShape, elementSize, width, height }) {
  const rowOffset = chunk.offsets[0] || 0;
  const columnOffset = chunk.offsets[1] || 0;
  const chunkHeight = chunkShape[0] || height;
  const chunkWidth = chunkShape[1] || width;
  const rows = Math.max(0, Math.min(chunkHeight, height - rowOffset));
  const columns = Math.max(0, Math.min(chunkWidth, width - columnOffset));
  const sourceRowBytes = chunkWidth * elementSize;
  const targetRowBytes = width * elementSize;

  for (let row = 0; row < rows; row++) {
    const sourceStart = row * sourceRowBytes;
    const sourceEnd = sourceStart + columns * elementSize;
    const targetStart = ((rowOffset + row) * width + columnOffset) * elementSize;

    if (sourceEnd > chunkBytes.byteLength || targetStart + columns * elementSize > output.byteLength) {
      break;
    }

    output.set(chunkBytes.subarray(sourceStart, sourceEnd), targetStart);
  }
}

function buildMeteoFranceNativeRasterPng({ rawGrid, radarDataset, radarAttributes }) {
  const [sourceHeight, sourceWidth] = radarDataset.dimensions || [];
  const scale = Math.max(1, Math.ceil(Math.max(sourceWidth, sourceHeight) / METEOFRANCE_NATIVE_RASTER_MAX_SIZE));
  const width = Math.ceil(sourceWidth / scale);
  const height = Math.ceil(sourceHeight / scale);
  const rgba = new Uint8Array(width * height * 4);
  const reader = createHdf5NumericReader(rawGrid.bytes, radarDataset.dataType);
  const scaleFactor = toFiniteHdf5Scalar(getHdf5AttributeValue(radarAttributes, ["scale_factor", "scale", "factor", "facteur_echelle", "gain"])) ?? 1;
  const offset = toFiniteHdf5Scalar(getHdf5AttributeValue(radarAttributes, ["add_offset", "offset"])) ?? 0;
  const missingValue = toFiniteHdf5Scalar(getHdf5AttributeValue(radarAttributes, ["missing_value", "_fillvalue", "nodata", "no_data", "fill_value"]));
  const undetectValue = toFiniteHdf5Scalar(getHdf5AttributeValue(radarAttributes, ["undetect", "undetect_value"]));
  let valueCount = 0;
  let minValue = null;
  let maxValue = null;

  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y + 0.5) * sourceHeight / height));

    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x + 0.5) * sourceWidth / width));
      const rawValue = reader(sourceY * sourceWidth + sourceX);

      if (!Number.isFinite(rawValue) || rawValue === missingValue || rawValue === undetectValue) {
        continue;
      }

      const value = rawValue * scaleFactor + offset;

      if (!Number.isFinite(value) || value <= 0) {
        continue;
      }

      const color = getMeteoFranceRainColor(value);
      const target = (y * width + x) * 4;
      rgba[target] = color[0];
      rgba[target + 1] = color[1];
      rgba[target + 2] = color[2];
      rgba[target + 3] = color[3];
      valueCount++;
      minValue = minValue === null ? value : Math.min(minValue, value);
      maxValue = maxValue === null ? value : Math.max(maxValue, value);
    }
  }

  const pngBytes = encodePngRgba(width, height, rgba);

  return {
    ok: true,
    imageDataUrl: `data:image/png;base64,${bytesToBase64(pngBytes)}`,
    raster: {
      width,
      height,
      sourceWidth,
      sourceHeight,
      downsampleFactor: scale,
      storage: rawGrid.storage,
      decodedChunks: rawGrid.decodedChunks,
      valueCount,
      minValue,
      maxValue
    }
  };
}

function createHdf5NumericReader(bytes, dataType) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = dataType?.size || 0;
  const littleEndian = dataType?.byteOrder !== "big-endian";
  const signed = !!dataType?.signed;
  const floatingPoint = dataType?.className === "floating-point";

  return (index) => {
    const offset = index * size;

    if (offset < 0 || offset + size > bytes.byteLength) {
      return null;
    }

    if (floatingPoint && size === 4) {
      return view.getFloat32(offset, littleEndian);
    }

    if (floatingPoint && size === 8) {
      return view.getFloat64(offset, littleEndian);
    }

    if (size === 1) {
      return signed ? view.getInt8(offset) : view.getUint8(offset);
    }

    if (size === 2) {
      return signed ? view.getInt16(offset, littleEndian) : view.getUint16(offset, littleEndian);
    }

    if (size === 4) {
      return signed ? view.getInt32(offset, littleEndian) : view.getUint32(offset, littleEndian);
    }

    return null;
  };
}

function getMeteoFranceRainColor(value) {
  if (value >= 20) {
    return [106, 62, 132, 190];
  }

  if (value >= 10) {
    return [180, 35, 35, 185];
  }

  if (value >= 5) {
    return [216, 119, 36, 175];
  }

  if (value >= 2) {
    return [227, 169, 55, 165];
  }

  if (value >= 1) {
    return [77, 139, 83, 150];
  }

  if (value >= 0.2) {
    return [39, 125, 161, 135];
  }

  return [80, 145, 170, 100];
}

function encodeAsciiBytes(value) {
  return Uint8Array.from(String(value).split("").map((char) => char.charCodeAt(0)));
}

function encodePngRgba(width, height, rgba) {
  const scanlines = new Uint8Array(height * (1 + width * 4));

  for (let y = 0; y < height; y++) {
    const scanlineStart = y * (1 + width * 4);
    const rgbaStart = y * width * 4;
    scanlines[scanlineStart] = 0;
    scanlines.set(rgba.subarray(rgbaStart, rgbaStart + width * 4), scanlineStart + 1);
  }

  return concatUint8Arrays([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    buildPngChunk("IHDR", buildPngIhdr(width, height)),
    buildPngChunk("IDAT", buildZlibStoredBlocks(scanlines)),
    buildPngChunk("IEND", new Uint8Array(0))
  ]);
}

function buildPngIhdr(width, height) {
  const bytes = new Uint8Array(13);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  bytes[8] = 8;
  bytes[9] = 6;
  return bytes;
}

function buildPngChunk(type, data) {
  const typeBytes = encodeAsciiBytes(type);
  const bytes = new Uint8Array(12 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length, false);
  bytes.set(typeBytes, 4);
  bytes.set(data, 8);
  view.setUint32(8 + data.length, crc32(concatUint8Arrays([typeBytes, data])), false);
  return bytes;
}

function buildZlibStoredBlocks(data) {
  const blocks = [];
  let offset = 0;

  blocks.push(Uint8Array.from([0x78, 0x01]));

  while (offset < data.length) {
    const length = Math.min(65535, data.length - offset);
    const block = new Uint8Array(5 + length);
    const finalBlock = offset + length >= data.length;
    block[0] = finalBlock ? 1 : 0;
    block[1] = length & 0xff;
    block[2] = (length >> 8) & 0xff;
    const inverse = (~length) & 0xffff;
    block[3] = inverse & 0xff;
    block[4] = (inverse >> 8) & 0xff;
    block.set(data.subarray(offset, offset + length), 5);
    blocks.push(block);
    offset += length;
  }

  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, adler32(data), false);
  blocks.push(checksum);
  return concatUint8Arrays(blocks);
}

function concatUint8Arrays(arrays) {
  const totalLength = arrays.reduce((total, array) => total + array.length, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  for (const array of arrays) {
    bytes.set(array, offset);
    offset += array.length;
  }

  return bytes;
}

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1;
  let b = 0;

  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }

  return ((b << 16) | a) >>> 0;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function toFiniteHdf5Scalar(value) {
  if (Array.isArray(value)) {
    return toFiniteHdf5Scalar(value[0]);
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isMeteoFranceDatasetReadableForNativeLayer(dataset) {
  if (!dataset?.storage?.supported) {
    return false;
  }

  return !(dataset.filters || []).some((filter) => !filter.supported);
}

function buildMeteoFranceNativeLayerCriteria({ signatureOk, structure, radarDataset, projection, bounds, rasterDecode }) {
  const dimensions = radarDataset?.dimensions || [];
  const dimensionsKnown = Array.isArray(dimensions) && dimensions.length >= 2 && dimensions.every(Number.isFinite);
  const expectedDimensionsMatch = dimensionsKnown && hasExpectedMeteoFranceRadarDimensions(radarDataset);
  const valuesDecodeEligible = !!radarDataset
    && dimensionsKnown
    && expectedDimensionsMatch
    && !!projection
    && !!bounds
    && isMeteoFranceDatasetReadableForNativeLayer(radarDataset);
  const valuesDecoded = valuesDecodeEligible && !!rasterDecode?.ok;
  const valuesReadable = valuesDecoded;

  return {
    signatureOk: !!signatureOk,
    structureParsed: !!structure?.parsingOk,
    radarDatasetIdentified: !!radarDataset,
    dimensionsKnown,
    expectedDimensions: METEOFRANCE_HDF5_EXPECTED_DIMENSIONS,
    expectedDimensionsMatch,
    projectionFound: !!projection,
    boundsFound: !!bounds,
    valuesReadable,
    valuesDecoded,
    imageBuilt: valuesDecoded && !!rasterDecode?.imageDataUrl
  };
}

function buildMeteoFranceNativeLayerBlocker({ radarDataset, projection, bounds, nativeLayerCriteria, rasterDecode }) {
  if (!radarDataset) {
    return "no usable radar accumulation dataset was identified in the HDF5 structure";
  }

  if (!nativeLayerCriteria.dimensionsKnown) {
    return "radar dataset dimensions were not found in the HDF5 structure";
  }

  if (!nativeLayerCriteria.expectedDimensionsMatch) {
    return `radar dataset dimensions ${JSON.stringify(radarDataset.dimensions)} do not match the expected ${METEOFRANCE_HDF5_EXPECTED_DIMENSIONS.width}x${METEOFRANCE_HDF5_EXPECTED_DIMENSIONS.height} grid`;
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

  if (!rasterDecode?.ok) {
    return rasterDecode?.reason || "native raster value decoding and image generation failed";
  }

  return null;
}

function buildMeteoFranceHdf5ParsingError({ signatureOk, structure, radarDataset, projection, bounds, nativeLayerBlocker }) {
  if (!signatureOk) {
    return "Downloaded product does not start with a valid HDF5 signature.";
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
