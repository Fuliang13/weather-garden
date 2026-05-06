export async function fetchEcowittObservation({ env }) {
  const apiUrl = env.ECOWITT_API_URL;

  if (!apiUrl) {
    return {
      ok: false,
      enabled: false,
      source: "ecowitt",
      fetchedAt: new Date().toISOString(),
      message: "ECOWITT_API_URL is not configured yet."
    };
  }

  const headers = {
    "accept": "application/json"
  };

  if (env.ECOWITT_API_TOKEN) {
    headers.authorization = `Bearer ${env.ECOWITT_API_TOKEN}`;
  }

  const response = await fetch(apiUrl, { headers });

  if (!response.ok) {
    throw new Error(`Ecowitt HTTP ${response.status}`);
  }

  const data = await response.json();
  return normalizeEcowittPayload(data, env.ECOWITT_STATION_LABEL || "Ecowitt");
}

function normalizeEcowittPayload(data, label) {
  const payload = data?.current || data?.observation || data?.station || data || {};
  const current = normalizeCurrentObservation(payload);

  return {
    ok: !!current,
    enabled: true,
    source: "ecowitt",
    label,
    fetchedAt: new Date().toISOString(),
    updatedAt: coerceIsoDate(data?.updatedAt, data?.time, data?.dateTime, data?.timestamp),
    current,
    message: current ? null : "Ecowitt response received, but no normalized current observation was found.",
    raw: data
  };
}

function normalizeCurrentObservation(payload) {
  const current = {
    temperatureC: coerceNumber(payload.temperatureC, payload.temperature_c, payload.tempC, payload.temp_c),
    humidityPct: coerceNumber(payload.humidityPct, payload.humidity_pct, payload.humidity, payload.relativeHumidity),
    windKmh: coerceNumber(payload.windKmh, payload.wind_kmh, payload.windSpeedKmh, payload.wind_speed_kmh),
    gustKmh: coerceNumber(payload.gustKmh, payload.gust_kmh, payload.windGustKmh, payload.wind_gust_kmh),
    rainRateMmPerHour: coerceNumber(payload.rainRateMmPerHour, payload.rain_rate_mm_per_hour, payload.rainRate, payload.rain_rate),
    dailyRainMm: coerceNumber(payload.dailyRainMm, payload.daily_rain_mm, payload.rainDaily, payload.rain_daily)
  };

  return Object.values(current).some((value) => Number.isFinite(value)) ? current : null;
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

function coerceIsoDate(...values) {
  for (const value of values) {
    if (!value) {
      continue;
    }

    const date = new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value);

    if (Number.isFinite(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}
