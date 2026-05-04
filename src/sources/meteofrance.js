const RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json";

export async function fetchMeteoFranceRadar({ env }) {
  const apiUrl = env.METEOFRANCE_RADAR_API_URL;
  const token = env.METEOFRANCE_API_TOKEN;

  if (!apiUrl) {
    return {
      ok: false,
      enabled: false,
      source: "meteofrance-radar",
      fetchedAt: new Date().toISOString(),
      message: "METEOFRANCE_RADAR_API_URL is not configured yet."
    };
  }

  const headers = {
    "accept": "application/json"
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(apiUrl, { headers });

  if (!response.ok) {
    throw new Error(`Météo-France radar HTTP ${response.status}`);
  }

  const data = await response.json();
  const score = coerceRadarScore(data);

  return {
    ok: true,
    enabled: true,
    source: "meteofrance-radar",
    fetchedAt: new Date().toISOString(),
    score,
    precipitationMm: coerceNumber(data.precipitationMm, data.precipitation, data.rainRate, data.rain_rate),
    probability: coerceNumber(data.probability, data.rainProbability, data.prob) ?? score,
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
    ? `${data.host}${latestFrame.path}/256/{z}/{x}/{y}/2/1_1.png`
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
