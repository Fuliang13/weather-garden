const RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json";
const METEOFRANCE_TOKEN_URL = "https://portail-api.meteofrance.fr/token";
const METEOFRANCE_RADAR_ZONE = "METROPOLE";
const METEOFRANCE_RADAR_OBSERVATION = "LAME_D_EAU";
const METEOFRANCE_RADAR_METADATA_URL = `https://public-api.meteofrance.fr/public/DPRadar/mosaiques/${METEOFRANCE_RADAR_ZONE}/observations/${METEOFRANCE_RADAR_OBSERVATION}`;

export async function fetchMeteoFranceRadar({ env }) {
  const fetchedAt = new Date().toISOString();

  if (!env.METEOFRANCE_APPLICATION_ID) {
    return {
      ok: false,
      enabled: false,
      source: "meteofrance-radar",
      fetchedAt,
      message: "METEOFRANCE_APPLICATION_ID is not configured yet.",
      diagnostics: {
        configured: false,
        requiredSecrets: ["METEOFRANCE_APPLICATION_ID"]
      }
    };
  }

  const metadata = await fetchMeteoFranceJsonWithOAuth(env, METEOFRANCE_RADAR_METADATA_URL);
  const productUrl = findMeteoFranceProductUrl(metadata, 1000);
  const mesh500ProductUrl = findMeteoFranceProductUrl(metadata, 500);

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
      metadataEndpoint: METEOFRANCE_RADAR_METADATA_URL,
      productLinkFound: !!productUrl
    }
  };
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

async function obtainMeteoFranceAccessToken(env) {
  const response = await fetch(METEOFRANCE_TOKEN_URL, {
    method: "POST",
    headers: {
      "authorization": `Basic ${env.METEOFRANCE_APPLICATION_ID}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    throw new Error(`Météo-France token HTTP ${response.status}`);
  }

  const data = await response.json();
  const token = data.access_token;

  if (!token) {
    throw new Error("Météo-France token response did not contain an access token.");
  }

  return token;
}

async function fetchMeteoFranceJsonWithOAuth(env, url) {
  const response = await fetchMeteoFranceWithOAuth(env, url, {
    headers: {
      "accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Météo-France radar HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchMeteoFranceWithOAuth(env, url, options = {}) {
  const accessToken = await obtainMeteoFranceAccessToken(env);
  const response = await fetchWithBearer(url, accessToken, options);

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

  const refreshedAccessToken = await obtainMeteoFranceAccessToken(env);
  return fetchWithBearer(url, refreshedAccessToken, options);
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

function normalizeIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
