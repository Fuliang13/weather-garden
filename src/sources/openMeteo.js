const OPEN_METEO_URL = "https://api.open-meteo.com/v1/meteofrance";

export async function fetchOpenMeteoArome({ latitude, longitude, timezone }) {
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set("timezone", timezone || "Europe/Paris");
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("forecast_hours", "72");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("forecast_minutely_15", "48");
  url.searchParams.set("current", [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "rain",
    "wind_speed_10m",
    "wind_gusts_10m",
    "weather_code"
  ].join(","));
  url.searchParams.set("hourly", [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "precipitation_probability",
    "rain",
    "wind_speed_10m",
    "wind_gusts_10m",
    "weather_code"
  ].join(","));
  url.searchParams.set("minutely_15", [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "rain",
    "wind_speed_10m",
    "wind_gusts_10m",
    "weather_code"
  ].join(","));
  url.searchParams.set("daily", [
    "temperature_2m_min",
    "temperature_2m_max",
    "precipitation_sum",
    "rain_sum",
    "wind_speed_10m_max",
    "wind_gusts_10m_max"
  ].join(","));

  const response = await fetch(url.toString(), {
    headers: {
      "accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Open-Meteo HTTP ${response.status}`);
  }

  const data = await response.json();

  return {
    ok: true,
    source: "open-meteo-arome",
    fetchedAt: new Date().toISOString(),
    url: url.toString(),
    current: normalizeCurrent(data.current, data.utc_offset_seconds),
    hourly: normalizeRows(data.hourly, data.utc_offset_seconds),
    minutely15: normalizeRows(data.minutely_15, data.utc_offset_seconds),
    daily: normalizeRows(data.daily, data.utc_offset_seconds),
    rawGenerationTimeMs: data.generationtime_ms ?? null
  };
}

function normalizeCurrent(current, offsetSeconds = 0) {
  if (!current) {
    return null;
  }

  return {
    ...current,
    timeMs: unixToMs(current.time, offsetSeconds)
  };
}

function normalizeRows(block, offsetSeconds = 0) {
  if (!block?.time?.length) {
    return [];
  }

  return block.time.map((time, index) => {
    const row = {
      time,
      timeMs: unixToMs(time, offsetSeconds)
    };

    Object.entries(block).forEach(([key, values]) => {
      if (key === "time" || !Array.isArray(values)) {
        return;
      }

      row[key] = values[index] ?? null;
    });

    return row;
  });
}

function unixToMs(seconds, offsetSeconds = 0) {
  if (!Number.isFinite(seconds)) {
    return null;
  }

  // Open-Meteo returns UNIX timestamps in GMT+0; utc_offset_seconds is kept for display only.
  return (seconds + 0 * offsetSeconds) * 1000;
}
