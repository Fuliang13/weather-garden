const MET_NORWAY_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact";

export async function fetchMetNorway({ latitude, longitude, userAgent }) {
  const url = new URL(MET_NORWAY_URL);
  url.searchParams.set("lat", Number(latitude).toFixed(6));
  url.searchParams.set("lon", Number(longitude).toFixed(6));

  const response = await fetch(url.toString(), {
    headers: {
      "accept": "application/json",
      "user-agent": userAgent || "weather-garden/0.1 contact@example.com"
    }
  });

  if (!response.ok) {
    throw new Error(`MET Norway HTTP ${response.status}`);
  }

  const data = await response.json();

  return {
    ok: true,
    source: "met-norway",
    fetchedAt: new Date().toISOString(),
    url: url.toString(),
    timeseries: normalizeTimeseries(data.properties?.timeseries || [])
  };
}

function normalizeTimeseries(timeseries) {
  return timeseries.map((item) => {
    const instant = item.data?.instant?.details || {};
    const next1h = item.data?.next_1_hours?.details || {};

    return {
      time: item.time,
      timeMs: Date.parse(item.time),
      instant: {
        ...instant,
        wind_speed_kmh: Number.isFinite(instant.wind_speed) ? instant.wind_speed * 3.6 : null,
        wind_gusts_kmh: Number.isFinite(instant.wind_speed_of_gust) ? instant.wind_speed_of_gust * 3.6 : null
      },
      next1h,
      symbolCode: item.data?.next_1_hours?.summary?.symbol_code || null
    };
  });
}
