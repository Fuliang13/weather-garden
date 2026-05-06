const RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json";
const METEOFRANCE_TOKEN_URL = "https://portail-api.meteofrance.fr/token";
const METEOFRANCE_RADAR_CATALOG_URL = "https://public-api.meteofrance.fr/public/DPRadar/v1/mosaiques";
const METEOFRANCE_RADAR_ZONE = "METROPOLE";
const METEOFRANCE_RADAR_OBSERVATION = "LAME_D_EAU";
const METEOFRANCE_RADAR_PRIMARY_MESH = 500;
const METEOFRANCE_RADAR_FALLBACK_MESH = 1000;
const METEOFRANCE_HDF5_SIGNATURE = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
const METEOFRANCE_HDF5_MAX_BYTES = 40 * 1024 * 1024;
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
    return buildHdf5Diagnostics({ downloadOk: false, error: error.message });
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
  const signatureOk = hasHdf5Signature(bytes);

  return buildHdf5Diagnostics({
    downloadOk: true,
    httpStatus,
    contentType,
    contentLengthHeader,
    byteLength: bytes.byteLength,
    signature: bytesToHex(bytes.slice(0, METEOFRANCE_HDF5_SIGNATURE.length)),
    signatureOk,
    error: signatureOk ? null : "Downloaded product does not start with the expected HDF5 signature."
  });
}

function buildHdf5Diagnostics({ downloadOk, httpStatus = null, contentType = "", contentLengthHeader = null, byteLength = null, signature = null, signatureOk = false, error = null }) {
  return {
    downloadOk,
    httpStatus,
    contentType: contentType || null,
    contentLengthHeader,
    byteLength,
    maxBytes: METEOFRANCE_HDF5_MAX_BYTES,
    signature,
    signatureOk,
    parser: "not-implemented",
    parsingOk: false,
    datasets: [],
    dimensions: null,
    projection: null,
    bounds: null,
    unit: null,
    scaleFactor: null,
    missingValue: null,
    quality: null,
    error: error || "HDF5 signature can be verified, but dataset/projection extraction is not implemented without a proven Cloudflare Worker-compatible HDF5 parser."
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
    reason: "Météo-France HDF5 signature is valid, but grid, bounds and projection are not decoded yet; RainViewer remains the visual fallback.",
    frames: []
  };
}

function buildMeteoFranceRadarMessage({ hasPrimaryProduct, hasFallbackProduct, hdf5Diagnostics, nativeLayer }) {
  if (nativeLayer?.ok) {
    return "Météo-France radar native HDF5 layer is available.";
  }

  if (hasPrimaryProduct && hdf5Diagnostics?.signatureOk) {
    return "Météo-France radar HDF5 500 m product is available; native rendering is blocked until HDF5 grid/projection parsing is implemented.";
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

  return "The 500 m HDF5 product is present, but grid/projection parsing is not implemented with a proven Worker-compatible parser.";
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
    message,
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
      frameLimit: METEOFRANCE_RADAR_FRAME_LIMIT,
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
  const response = await fetchWithBearer(url, env.METEOFRANCE_API_KEY, {
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
  return fetchWithBearer(url, env.METEOFRANCE_API_KEY, {
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
    throw new Error(`${label} returned ${contentType || "unknown content type"} instead of JSON from ${url}: ${summarizeBody(body)}`);
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON from ${url}: ${summarizeBody(body)}`);
  }
}

async function buildMeteoFranceHttpError(response, url, label) {
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text().catch(() => "");
  return `${label} HTTP ${response.status} from ${url}${contentType ? ` (${contentType})` : ""}: ${summarizeBody(body)}`;
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
