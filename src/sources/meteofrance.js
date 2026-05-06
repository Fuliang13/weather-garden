const RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json";
const METEOFRANCE_TOKEN_URL = "https://portail-api.meteofrance.fr/token";

export async function fetchMeteoFranceRadar({ env }) {
  const apiUrl = env.METEOFRANCE_RADAR_API_URL;

  if (!apiUrl) {
    return {
      ok: false,
      enabled: false,
      source: "meteofrance-radar",
      fetchedAt: new Date().toISOString(),
      message: "METEOFRANCE_RADAR_API_URL is not configured yet."
    };
  }

  const headers = await buildMeteoFranceHeaders(env);
  const response = await fetch(apiUrl, { headers });

  if (!response.ok) {
    throw new Error(`Météo-France radar HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("json")) {
    return {
      ok: false,
      enabled: true,
      source: "meteofrance-radar",
      fetchedAt: new Date().toISOString(),
      message: `Météo-France radar returned ${contentType || "a non-JSON payload"}; configure a JSON endpoint or add a parser before scoring.`
    };
  }

  const data = await response.json();
  const score = coerceRadarScore(data);

  return {
    ok: score !== null,
    enabled: true,
    source: "meteofrance-radar",
    fetchedAt: new Date().toISOString(),
    score,
    precipitationMm: coerceNumber(data.precipitationMm, data.precipitation, data.rainRate, data.rain_rate),
    probability: coerceNumber(data.probability, data.rainProbability, data.prob) ?? score,
    message: score === null ? "Météo-France radar JSON received, but no usable rain score was found." : null,
    raw: data
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

async function buildMeteoFranceHeaders(env) {
  const headers = {
    "accept": "application/json"
  };

  if (env.METEOFRANCE_APPLICATION_ID) {
    headers.authorization = `Bearer ${await fetchMeteoFranceOAuthToken(env.METEOFRANCE_APPLICATION_ID)}`;
    return headers;
  }

  if (env.METEOFRANCE_API_KEY) {
    headers.apikey = env.METEOFRANCE_API_KEY;
    return headers;
  }

  if (env.METEOFRANCE_API_TOKEN) {
    headers.authorization = `Bearer ${env.METEOFRANCE_API_TOKEN}`;
  }

  return headers;
}

async function fetchMeteoFranceOAuthToken(applicationId) {
  const response = await fetch(METEOFRANCE_TOKEN_URL, {
    method: "POST",
    headers: {
      "authorization": `Basic ${applicationId}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    throw new Error(`Météo-France token HTTP ${response.status}`);
  }

  const data = await response.json();
  const token = data.access_token || data.token;

  if (!token) {
    throw new Error("Météo-France token response did not contain an access token.");
  }

  return token;
}

function coerceRadarScore(data) {
  const directScore = coerceNumber(data.score, data.risk, data.rainRisk);

  if (directScore !== null) {
    return directScore > 1 ? directScore / 100 : directScore;
  }

  const probability = coerceNumber(data.probability, data.rainProbability, data.prob);

  if (probability !== null) {
    return probability > 1 ? probability / 100 : probability;
  }

  const rainRate = coerceNumber(data.precipitationMm, data.precipitation, data.rainRate, data.rain_rate, data.value);

  if (rainRate !== null) {
    return Math.min(1, rainRate / 2);
  }

  return null;
}

function coerceNumber(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}
