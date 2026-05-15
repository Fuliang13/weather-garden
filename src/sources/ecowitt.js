const ECOWITT_DEFAULT_API_BASE = "https://api.ecowitt.net/api/v3";
const DEFAULT_STALE_MINUTES = 20;

export async function fetchEcowittObservation({ env }) {
  const applicationKey = env.ECOWITT_APPLICATION_KEY;
  const apiKey = env.ECOWITT_API_KEY;
  const mac = env.ECOWITT_DEVICE_MAC || env.ECOWITT_MAC;

  if (!applicationKey || !apiKey || !mac) {
    return {
      ok: false,
      enabled: false,
      source: "ecowitt",
      fetchedAt: new Date().toISOString(),
      message: "ECOWITT_APPLICATION_KEY, ECOWITT_API_KEY or ECOWITT_DEVICE_MAC is not configured yet.",
      diagnostics: {
        configured: false,
        requiredSecrets: ["ECOWITT_APPLICATION_KEY", "ECOWITT_API_KEY", "ECOWITT_DEVICE_MAC"]
      }
    };
  }

  const apiBase = (env.ECOWITT_API_BASE || ECOWITT_DEFAULT_API_BASE).replace(/\/$/, "");
  const url = new URL(`${apiBase}/device/real_time`);
  url.searchParams.set("application_key", applicationKey);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("mac", mac);
  url.searchParams.set("call_back", env.ECOWITT_CALLBACK || "all");

  const response = await fetch(url.toString(), {
    headers: {
      "accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Ecowitt HTTP ${response.status}`);
  }

  const data = await response.json();
  return normalizeEcowittPayload(data, {
    label: env.ECOWITT_STATION_LABEL || "Station locale",
    staleMinutes: Number(env.ECOWITT_STALE_MINUTES || DEFAULT_STALE_MINUTES)
  });
}

export function normalizeEcowittPayload(payload, { label = "Station locale", staleMinutes = DEFAULT_STALE_MINUTES } = {}) {
  const fetchedAt = new Date().toISOString();

  if (isEcowittError(payload)) {
    return {
      ok: false,
      enabled: true,
      source: "ecowitt",
      label,
      fetchedAt,
      updatedAt: null,
      current: null,
      stale: true,
      message: payload.msg || payload.message || `Ecowitt API returned code ${payload.code}.`,
      diagnostics: {
        configured: true,
        apiCode: payload.code ?? null,
        sensorCount: 0,
        missingCoreSensors: ["outdoor.temperature", "outdoor.humidity", "rainfall.rain_rate", "wind.wind_speed"]
      }
    };
  }

  const data = payload?.data || {};
  const current = normalizeCurrentObservation(data);
  const sensorDiagnostics = collectSensorDiagnostics(data);
  const updatedAt = latestIsoDate(sensorDiagnostics.map((sensor) => sensor.time));
  const ageMinutes = updatedAt ? Math.round((Date.now() - Date.parse(updatedAt)) / 60_000) : null;
  const stale = !Number.isFinite(ageMinutes) || ageMinutes > staleMinutes;
  const missingCoreSensors = getMissingCoreSensors(data);

  return {
    ok: !!current,
    enabled: true,
    source: "ecowitt",
    label,
    fetchedAt,
    updatedAt,
    ageMinutes,
    stale,
    current,
    message: buildEcowittMessage({ current, stale, ageMinutes, missingCoreSensors }),
    diagnostics: {
      configured: true,
      staleMinutes,
      sensorCount: sensorDiagnostics.length,
      missingCoreSensors,
      batterySensors: sensorDiagnostics.filter((sensor) => sensor.path.toLowerCase().includes("battery")),
      signalSensors: sensorDiagnostics.filter((sensor) => sensor.path.toLowerCase().includes("signal")),
      availableSensors: sensorDiagnostics.map((sensor) => sensor.path)
    }
  };
}

function normalizeCurrentObservation(data) {
  const current = {
    temperatureC: readTemperatureC(data, "outdoor.temperature"),
    humidityPct: readNumber(data, "outdoor.humidity"),
    dewPointC: readTemperatureC(data, "outdoor.dew_point"),
    windKmh: readWindKmh(data, "wind.wind_speed"),
    gustKmh: readWindKmh(data, "wind.wind_gust"),
    windDirectionDeg: readNumber(data, "wind.wind_direction"),
    pressureHpa: readPressureHpa(data, "pressure.relative"),
    absolutePressureHpa: readPressureHpa(data, "pressure.absolute"),
    rainRateMmPerHour: readRainMm(data, "rainfall.rain_rate"),
    eventRainMm: readRainMm(data, "rainfall.event"),
    hourlyRainMm: readRainMm(data, "rainfall.hourly"),
    dailyRainMm: readRainMm(data, "rainfall.daily"),
    weeklyRainMm: readRainMm(data, "rainfall.weekly"),
    monthlyRainMm: readRainMm(data, "rainfall.monthly"),
    yearlyRainMm: readRainMm(data, "rainfall.yearly"),
    solarWm2: readSolarWm2(data, "solar_and_uvi.solar"),
    uvIndex: readNumber(data, "solar_and_uvi.uvi")
  };

  return Object.values(current).some((value) => Number.isFinite(value)) ? current : null;
}

function buildEcowittMessage({ current, stale, ageMinutes, missingCoreSensors }) {
  if (!current) {
    return "Ecowitt response received, but no normalized current observation was found.";
  }

  if (stale) {
    return Number.isFinite(ageMinutes) ? `Ecowitt data is stale: ${ageMinutes} minutes old.` : "Ecowitt data has no usable timestamp.";
  }

  if (missingCoreSensors.length) {
    return `Ecowitt OK, but missing core sensors: ${missingCoreSensors.join(", ")}.`;
  }

  return null;
}

function getMissingCoreSensors(data) {
  return ["outdoor.temperature", "outdoor.humidity", "rainfall.rain_rate", "wind.wind_speed"]
    .filter((path) => !Number.isFinite(coerceNumber(readSensorValue(data, path))));
}

function collectSensorDiagnostics(data, prefix = "") {
  if (!data || typeof data !== "object") {
    return [];
  }

  return Object.entries(data).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === "object" && "value" in value) {
      return [{
        path,
        value: value.value ?? null,
        unit: value.unit ?? null,
        time: value.time ?? null
      }];
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return collectSensorDiagnostics(value, path);
    }

    return [];
  });
}

function isEcowittError(payload) {
  const code = Number(payload?.code);
  return Number.isFinite(code) && code !== 0;
}

function readNumber(data, path) {
  return coerceNumber(readSensorValue(data, path));
}

function readTemperatureC(data, path) {
  const sensor = readPath(data, path);
  const value = coerceNumber(sensor?.value);

  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = normalizeUnit(sensor?.unit);

  if (unit === "f" || unit === "°f") {
    return round((value - 32) * 5 / 9, 1);
  }

  return round(value, 1);
}

function readWindKmh(data, path) {
  const sensor = readPath(data, path);
  const value = coerceNumber(sensor?.value);

  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = normalizeUnit(sensor?.unit);

  if (unit === "m/s" || unit === "mps") {
    return round(value * 3.6, 1);
  }

  if (unit === "mph") {
    return round(value * 1.609344, 1);
  }

  if (unit === "knot" || unit === "knots" || unit === "kt") {
    return round(value * 1.852, 1);
  }

  return round(value, 1);
}

function readPressureHpa(data, path) {
  const sensor = readPath(data, path);
  const value = coerceNumber(sensor?.value);

  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = normalizeUnit(sensor?.unit);

  if (unit === "inhg") {
    return round(value * 33.8639, 1);
  }

  if (unit === "mmhg") {
    return round(value * 1.33322, 1);
  }

  return round(value, 1);
}

function readRainMm(data, path) {
  const sensor = readPath(data, path);
  const value = coerceNumber(sensor?.value);

  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = normalizeUnit(sensor?.unit);

  if (unit === "in" || unit === "inch" || unit === "in/h" || unit === "inch/h") {
    return round(value * 25.4, 2);
  }

  return round(value, 2);
}

function readSolarWm2(data, path) {
  const sensor = readPath(data, path);
  const value = coerceNumber(sensor?.value);

  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = normalizeUnit(sensor?.unit);

  if (unit === "lux") {
    return round(value / 126.7, 1);
  }

  return round(value, 1);
}

function readSensorValue(data, path) {
  return readPath(data, path)?.value;
}

function readPath(data, path) {
  return path.split(".").reduce((value, key) => value?.[key], data);
}

function latestIsoDate(values) {
  const dates = values
    .map(coerceIsoDate)
    .filter(Boolean)
    .sort();

  return dates[dates.length - 1] || null;
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

function coerceIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value);

  if (Number.isFinite(date.getTime())) {
    return date.toISOString();
  }

  return null;
}

function normalizeUnit(value) {
  return String(value || "").trim().toLowerCase();
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
