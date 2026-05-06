const RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json";
const METEOFRANCE_TOKEN_URL = "https://portail-api.meteofrance.fr/token";
const METEOFRANCE_RADAR_CATALOG_URL = "https://public-api.meteofrance.fr/public/DPRadar/v1/mosaiques";
const METEOFRANCE_RADAR_ZONE = "METROPOLE";
const METEOFRANCE_RADAR_OBSERVATION = "LAME_D_EAU";
const METEOFRANCE_TOKEN_USER_AGENT_FALLBACK = "weather-garden/0.1";
const METEOFRANCE_REQUIRED_SECRETS = ["METEOFRANCE_API_KEY", "METEOFRANCE_APPLICATION_ID"];

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
  const radarMetadata = await fetchMeteoFranceRadarMetadata(fetchJson);
  const { metadata, productUrl, mesh500ProductUrl, zoneUrl, observationsUrl, observationUrl } = radarMetadata;

  return {
    ok: !!productUrl,
    enabled: true,
    source: "meteofrance-radar",
    fetchedAt,
    validityTime: normalizeIsoDate(metadata.validity_time || metadata.validityTime) || null,
    observation: METEOFRANCE_RADAR_OBSERVATION,
    zone: METEOFRANCE_RADAR_ZONE,
    mesh: 1000,
    productUrl,
    format: "gzip-bufr",
    score: null,
    precipitationMm: null,
    probability: null,
    message: productUrl
      ? "Météo-France radar metadata OK; BUFR product parsing not implemented yet."
      : "Météo-France radar metadata received, but no maille=1000 BUFR product link was found.",
    metadata: {
      mesh500ProductUrl
    },
    diagnostics: {
      configured: true,
      authMode,
      catalogEndpoint: METEOFRANCE_RADAR_CATALOG_URL,
      zoneEndpoint: zoneUrl,
      observationsEndpoint: observationsUrl,
      observationEndpoint: observationUrl,
      productLinkFound: !!productUrl
    }
  };
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
      return {
        ok: false,
        enabled: true,
        source: "meteofrance-radar",
        fetchedAt,
        message: error.message,
        diagnostics: {
          configured: true,
          authMode,
          tokenOk: null,
          catalogOk: false,
          catalogEndpoint: METEOFRANCE_RADAR_CATALOG_URL
        }
      };
    }
  }

  const tokenState = {};

  try {
    tokenState.accessToken = await obtainMeteoFranceAccessToken(env);
  } catch (error) {
    return {
      ok: false,
      enabled: true,
      source: "meteofrance-radar",
      fetchedAt,
      message: error.message,
      diagnostics: {
        configured: true,
        authMode,
        tokenOk: false,
        catalogOk: false,
        tokenEndpoint: METEOFRANCE_TOKEN_URL,
        catalogEndpoint: METEOFRANCE_RADAR_CATALOG_URL,
        userAgentSent: !!getMeteoFranceUserAgent(env)
      }
    };
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
    return {
      ok: false,
      enabled: true,
      source: "meteofrance-radar",
      fetchedAt,
      message: error.message,
      diagnostics: {
        configured: true,
        authMode,
        tokenOk: true,
        catalogOk: false,
        catalogEndpoint: METEOFRANCE_RADAR_CATALOG_URL,
        userAgentSent: !!getMeteoFranceUserAgent(env)
      }
    };
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
    productUrl: findMeteoFranceProductUrl(metadata, 1000),
    mesh500ProductUrl: findMeteoFranceProductUrl(metadata, 500),
    zoneUrl,
    observationsUrl,
    observationUrl
  };
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
  return normalized ? normalized.slice(0, 180) : "empty response body";
}

function normalizeIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
