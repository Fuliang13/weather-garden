const ECOWITT_DEFAULT_API_BASE = "https://api.ecowitt.net/api/v3";
const DEFAULT_STALE_MINUTES = 20;
const MAX_SENSOR_CLOCK_SKEW_MINUTES = 10;
const HISTORY_CALLBACK_GROUPS = [
  "outdoor",
  "rainfall",
  "rainfall_piezo",
  "wind",
  "soil_ch1",
  "soil_ch2",
  "soil_ch3",
  "soil_ch4",
  "soil_ch5",
  "soil_ch6",
  "soil_ch7",
  "soil_ch8",
  "leaf_ch1",
  "leaf_ch2",
  "leaf_ch3",
  "leaf_ch4",
  "leaf_ch5",
  "leaf_ch6",
  "leaf_ch7",
  "leaf_ch8"
];

const HISTORY_WINDOWS = [
  { key: "last24h", label: "24h", hours: 24, cycleType: "5min" },
  { key: "last7d", label: "7d", hours: 24 * 7, cycleType: "30min" }
];

export async function fetchEcowittObservation({ env }) {
  const config = readEcowittConfig(env);
  const fetchedAt = new Date().toISOString();

  if (!config.configured) {
    return buildUnavailableEcowittResult({
      label: config.label,
      fetchedAt,
      message: buildMissingConfigMessage(config.missing),
      diagnostics: {
        ...config.publicDiagnostics,
        apiOk: false
      }
    });
  }

  const url = buildEcowittRealtimeUrl(config);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "accept": "application/json"
      }
    });

    if (!response.ok) {
      return buildUnavailableEcowittResult({
        label: config.label,
        fetchedAt,
        message: `Ecowitt HTTP ${response.status}.`,
        errors: [`Ecowitt HTTP ${response.status}`],
        diagnostics: {
          ...config.publicDiagnostics,
          apiOk: false,
          httpStatus: response.status
        }
      });
    }

    const payload = await response.json();

    return normalizeEcowittPayload(payload, {
      label: config.label,
      staleMinutes: config.staleMinutes,
      fetchedAt,
      diagnostics: {
        ...config.publicDiagnostics,
        apiOk: true
      }
    });
  } catch (error) {
    return buildUnavailableEcowittResult({
      label: config.label,
      fetchedAt,
      message: "Ecowitt API call failed.",
      errors: [sanitizeSensitiveText(error?.message || "Ecowitt API call failed.", config)],
      diagnostics: {
        ...config.publicDiagnostics,
        apiOk: false
      }
    });
  }
}

export async function fetchEcowittDiagnostics({ env }) {
  const current = await fetchEcowittObservation({ env });
  const history = await fetchEcowittHistory({ env });

  return {
    ok: current.ok || history.ok,
    source: "ecowitt",
    label: current.label || history.label,
    fetchedAt: new Date().toISOString(),
    current,
    history,
    diagnostics: {
      current: current.diagnostics,
      history: history.diagnostics
    }
  };
}

export async function fetchEcowittHistory({ env }) {
  const config = readEcowittConfig(env);
  const fetchedAt = new Date().toISOString();

  if (!config.configured) {
    return buildUnavailableEcowittHistoryResult({
      label: config.label,
      fetchedAt,
      message: buildMissingConfigMessage(config.missing),
      diagnostics: {
        ...config.publicDiagnostics,
        apiOk: false
      }
    });
  }

  const windowResults = await Promise.all(HISTORY_WINDOWS.map((windowConfig) => {
    return fetchEcowittHistoryWindow({ config, windowConfig, fetchedAt });
  }));
  const windows = Object.fromEntries(windowResults.map((result) => [result.key, result.window]));
  const ok = windowResults.some((result) => result.window.ok);

  return {
    ok,
    enabled: true,
    source: "ecowitt",
    label: config.label,
    fetchedAt,
    state: ok ? "fresh" : "unavailable",
    message: ok ? "Ecowitt history is available." : "Ecowitt history is unavailable.",
    windows,
    diagnostics: {
      ...config.publicDiagnostics,
      configured: true,
      apiOk: ok,
      windows: windowResults.map((result) => result.window.diagnostics)
    }
  };
}

export function normalizeEcowittPayload(payload, {
  label = "Station locale",
  staleMinutes = DEFAULT_STALE_MINUTES,
  fetchedAt = new Date().toISOString(),
  diagnostics = { configured: true }
} = {}) {
  const safeStaleMinutes = toPositiveNumber(staleMinutes, DEFAULT_STALE_MINUTES);

  if (isEcowittError(payload)) {
    return buildUnavailableEcowittResult({
      label,
      fetchedAt,
      message: payload?.msg || payload?.message || `Ecowitt API returned code ${payload?.code}.`,
      diagnostics: {
        ...diagnostics,
        configured: true,
        apiCode: payload?.code ?? null,
        staleMinutes: safeStaleMinutes,
        sensorCount: 0,
        measurementCount: 0,
        sensorGroups: [],
        rainSensorsDetected: [],
        batterySensorsDetected: []
      }
    });
  }

  const data = payload?.data || {};
  const measurements = collectSensorDiagnostics(data);
  const invalidValues = [];
  const current = normalizeCurrentObservation(data, invalidValues);
  const timestampCandidates = [
    ...measurements.map((sensor) => sensor.time),
    payload?.time
  ];
  const updatedAt = latestIsoDate(timestampCandidates, fetchedAt);
  const ageMinutes = updatedAt ? Math.max(0, Math.round((Date.parse(fetchedAt) - Date.parse(updatedAt)) / 60_000)) : null;
  const stale = !Number.isFinite(ageMinutes) || ageMinutes > safeStaleMinutes;
  const ok = !!current;
  const state = ok ? (stale ? "stale" : "fresh") : "unavailable";
  const missingCoreSensors = getMissingCoreSensors(data);

  return {
    ok,
    enabled: true,
    source: "ecowitt",
    label,
    fetchedAt,
    updatedAt,
    ageMinutes,
    freshnessMinutes: ageMinutes,
    stale: state !== "fresh",
    state,
    current,
    message: buildEcowittMessage({ current, state, ageMinutes, missingCoreSensors }),
    errors: [],
    diagnostics: {
      ...diagnostics,
      configured: true,
      staleMinutes: safeStaleMinutes,
      sensorCount: measurements.length,
      measurementCount: countNormalizedMeasurements(current),
      sensorGroups: collectSensorGroups(data),
      missingCoreSensors,
      rainSensorsDetected: detectRainSensorFamilies(data),
      batterySensorsDetected: Object.keys(data.battery || {}),
      batterySensors: measurements.filter((sensor) => isBatteryPath(sensor.path)),
      signalSensors: measurements.filter((sensor) => sensor.path.toLowerCase().includes("signal")),
      invalidValues,
      availableSensors: measurements.map((sensor) => sensor.path)
    }
  };
}

export function normalizeEcowittHistoryPayload(payload, {
  label = "Station locale",
  fetchedAt = new Date().toISOString(),
  windowKey = "custom",
  windowLabel = "custom",
  cycleType = null,
  startAt = null,
  endAt = null,
  diagnostics = { configured: true }
} = {}) {
  if (isEcowittError(payload)) {
    return buildUnavailableEcowittHistoryWindow({
      label,
      fetchedAt,
      windowKey,
      windowLabel,
      cycleType,
      startAt,
      endAt,
      message: payload?.msg || payload?.message || `Ecowitt API returned code ${payload?.code}.`,
      diagnostics: {
        ...diagnostics,
        configured: true,
        apiCode: payload?.code ?? null
      }
    });
  }

  const data = payload?.data || {};
  const invalidValues = [];
  const rows = collectHistoryRows(data, invalidValues);
  const series = buildHistorySeries(rows);
  const points = rows.map(({ time, values }) => ({
    time,
    temperatureC: values.temperatureC ?? null,
    humidityPct: values.humidityPct ?? null,
    rainRateMmPerHour: values.rainRateMmPerHour ?? null,
    rainMm: values.rainMm ?? null,
    windKmh: values.windKmh ?? null,
    gustKmh: values.gustKmh ?? null,
    windDirectionDeg: values.windDirectionDeg ?? null,
    soilMoisture: values.soilMoisture || [],
    leafWetness: values.leafWetness || []
  }));

  return {
    ok: points.length > 0,
    source: "ecowitt",
    label,
    fetchedAt,
    key: windowKey,
    windowLabel,
    cycleType,
    range: {
      startAt,
      endAt
    },
    pointCount: points.length,
    points,
    series,
    message: points.length ? `Ecowitt ${windowLabel} history normalized.` : `Ecowitt ${windowLabel} history has no usable points.`,
    diagnostics: {
      ...diagnostics,
      configured: true,
      window: windowKey,
      windowLabel,
      cycleType,
      startAt,
      endAt,
      pointCount: points.length,
      sensorGroups: collectSensorGroups(data),
      invalidValues
    }
  };
}

function readEcowittConfig(env = {}) {
  const applicationKey = env.ECOWITT_APPLICATION_KEY || "";
  const apiKey = env.ECOWITT_API_KEY || "";
  const mac = env.ECOWITT_DEVICE_MAC || env.ECOWITT_MAC || "";
  const imei = env.ECOWITT_DEVICE_IMEI || "";
  const staleMinutes = toPositiveNumber(env.ECOWITT_STALE_MINUTES, DEFAULT_STALE_MINUTES);
  const missing = [
    applicationKey ? null : "ECOWITT_APPLICATION_KEY",
    apiKey ? null : "ECOWITT_API_KEY",
    mac || imei ? null : "ECOWITT_DEVICE_MAC or ECOWITT_DEVICE_IMEI"
  ].filter(Boolean);

  return {
    applicationKey,
    apiKey,
    mac,
    imei,
    label: env.ECOWITT_STATION_LABEL || "Station locale",
    staleMinutes,
    apiBase: (env.ECOWITT_API_BASE || ECOWITT_DEFAULT_API_BASE).replace(/\/$/, ""),
    callback: env.ECOWITT_CALLBACK || "all",
    configured: missing.length === 0,
    missing,
    publicDiagnostics: {
      configured: missing.length === 0,
      applicationKeyPresent: !!applicationKey,
      apiKeyPresent: !!apiKey,
      macPresent: !!mac,
      imeiPresent: !!imei,
      device: {
        mac: maskIdentifier(mac),
        imei: maskIdentifier(imei)
      },
      staleMinutes
    }
  };
}

function buildEcowittRealtimeUrl(config) {
  const url = new URL(`${config.apiBase}/device/real_time`);
  applyEcowittAuthParams(url, config);
  applyEcowittMetricUnitParams(url);
  url.searchParams.set("call_back", config.callback);

  return url;
}

function buildEcowittHistoryUrl(config, { startAt, endAt, cycleType }) {
  const url = new URL(`${config.apiBase}/device/history`);
  applyEcowittAuthParams(url, config);
  applyEcowittMetricUnitParams(url);
  url.searchParams.set("start_date", formatEcowittHistoryDate(startAt));
  url.searchParams.set("end_date", formatEcowittHistoryDate(endAt));
  url.searchParams.set("call_back", HISTORY_CALLBACK_GROUPS.join(","));
  url.searchParams.set("cycle_type", cycleType);

  return url;
}

function applyEcowittAuthParams(url, config) {
  url.searchParams.set("application_key", config.applicationKey);
  url.searchParams.set("api_key", config.apiKey);

  if (config.mac) {
    url.searchParams.set("mac", config.mac);
  } else {
    url.searchParams.set("imei", config.imei);
  }
}

function applyEcowittMetricUnitParams(url) {
  url.searchParams.set("temp_unitid", "1");
  url.searchParams.set("pressure_unitid", "3");
  url.searchParams.set("wind_speed_unitid", "7");
  url.searchParams.set("rainfall_unitid", "12");
  url.searchParams.set("solar_irradiance_unitid", "16");
}

function buildUnavailableEcowittResult({ label, fetchedAt, message, errors = [], diagnostics = {} }) {
  return {
    ok: false,
    enabled: !!diagnostics.configured,
    source: "ecowitt",
    label,
    fetchedAt,
    updatedAt: null,
    ageMinutes: null,
    freshnessMinutes: null,
    stale: true,
    state: "unavailable",
    current: null,
    message,
    errors,
    diagnostics
  };
}

function buildUnavailableEcowittHistoryResult({ label, fetchedAt, message, errors = [], diagnostics = {} }) {
  return {
    ok: false,
    enabled: !!diagnostics.configured,
    source: "ecowitt",
    label,
    fetchedAt,
    state: "unavailable",
    message,
    windows: {},
    errors,
    diagnostics
  };
}

function buildUnavailableEcowittHistoryWindow({
  label,
  fetchedAt,
  windowKey,
  windowLabel,
  cycleType,
  startAt,
  endAt,
  message,
  errors = [],
  diagnostics = {}
}) {
  return {
    ok: false,
    source: "ecowitt",
    label,
    fetchedAt,
    key: windowKey,
    windowLabel,
    cycleType,
    range: {
      startAt,
      endAt
    },
    pointCount: 0,
    points: [],
    series: emptyHistorySeries(),
    message,
    errors,
    diagnostics: {
      ...diagnostics,
      window: windowKey,
      windowLabel,
      cycleType,
      startAt,
      endAt,
      pointCount: 0
    }
  };
}

async function fetchEcowittHistoryWindow({ config, windowConfig, fetchedAt }) {
  const endAt = new Date(fetchedAt);
  const startAt = new Date(endAt.getTime() - windowConfig.hours * 60 * 60_000);
  const url = buildEcowittHistoryUrl(config, {
    startAt,
    endAt,
    cycleType: windowConfig.cycleType
  });

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "accept": "application/json"
      }
    });

    if (!response.ok) {
      return {
        key: windowConfig.key,
        window: buildUnavailableEcowittHistoryWindow({
          label: config.label,
          fetchedAt,
          windowKey: windowConfig.key,
          windowLabel: windowConfig.label,
          cycleType: windowConfig.cycleType,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          message: `Ecowitt history HTTP ${response.status}.`,
          errors: [`Ecowitt history HTTP ${response.status}`],
          diagnostics: {
            ...config.publicDiagnostics,
            apiOk: false,
            httpStatus: response.status
          }
        })
      };
    }

    const payload = await response.json();

    return {
      key: windowConfig.key,
      window: normalizeEcowittHistoryPayload(payload, {
        label: config.label,
        fetchedAt,
        windowKey: windowConfig.key,
        windowLabel: windowConfig.label,
        cycleType: windowConfig.cycleType,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        diagnostics: {
          ...config.publicDiagnostics,
          apiOk: true
        }
      })
    };
  } catch (error) {
    return {
      key: windowConfig.key,
      window: buildUnavailableEcowittHistoryWindow({
        label: config.label,
        fetchedAt,
        windowKey: windowConfig.key,
        windowLabel: windowConfig.label,
        cycleType: windowConfig.cycleType,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        message: "Ecowitt history API call failed.",
        errors: [sanitizeSensitiveText(error?.message || "Ecowitt history API call failed.", config)],
        diagnostics: {
          ...config.publicDiagnostics,
          apiOk: false
        }
      })
    };
  }
}

function normalizeCurrentObservation(data, invalidValues) {
  const rainFamily = selectRainFamily(data);
  const current = {
    temperatureC: readTemperatureC(data, "outdoor.temperature", invalidValues),
    humidityPct: readPercent(data, "outdoor.humidity", invalidValues),
    dewPointC: readTemperatureC(data, "outdoor.dew_point", invalidValues),
    feelsLikeC: readTemperatureC(data, "outdoor.feels_like", invalidValues),
    appTempC: readTemperatureC(data, "outdoor.app_temp", invalidValues),
    windKmh: readWindKmh(data, "wind.wind_speed", invalidValues),
    gustKmh: readWindKmh(data, "wind.wind_gust", invalidValues),
    windDirectionDeg: readDirectionDeg(data, "wind.wind_direction", invalidValues),
    pressureHpa: readPressureHpa(data, "pressure.relative", invalidValues),
    absolutePressureHpa: readPressureHpa(data, "pressure.absolute", invalidValues),
    rainRateMmPerHour: readRainMm(data, `${rainFamily}.rain_rate`, invalidValues),
    eventRainMm: readRainMm(data, `${rainFamily}.event`, invalidValues),
    hourlyRainMm: readRainMm(data, `${rainFamily}.hourly`, invalidValues) ?? readRainMm(data, `${rainFamily}.1_hour`, invalidValues),
    dailyRainMm: readRainMm(data, `${rainFamily}.daily`, invalidValues),
    last24hRainMm: readRainMm(data, `${rainFamily}.24_hours`, invalidValues),
    weeklyRainMm: readRainMm(data, `${rainFamily}.weekly`, invalidValues),
    monthlyRainMm: readRainMm(data, `${rainFamily}.monthly`, invalidValues),
    yearlyRainMm: readRainMm(data, `${rainFamily}.yearly`, invalidValues),
    rainSource: rainFamily || null,
    solarWm2: readSolarWm2(data, "solar_and_uvi.solar", invalidValues),
    uvIndex: readPositiveNumber(data, "solar_and_uvi.uvi", invalidValues),
    soilMoisture: collectChannelMeasurements(data, /^soil_ch(\d+)$/, "soilmoisture", readPercent, invalidValues, "moisturePct"),
    soilTemperature: collectChannelMeasurements(data, /^temp_ch(\d+)$/, "temperature", readTemperatureC, invalidValues, "temperatureC"),
    soilEc: collectChannelMeasurements(data, /^ch_soil_ec_temp_hum(\d+)$/, "ec", readConductivityUsCm, invalidValues, "conductivityUsCm"),
    soilEcTemperature: collectChannelMeasurements(data, /^ch_soil_ec_temp_hum(\d+)$/, "temperature", readTemperatureC, invalidValues, "temperatureC"),
    leafWetness: collectChannelMeasurements(data, /^leaf_ch(\d+)$/, "leaf_wetness", readPercent, invalidValues, "wetnessPct"),
    batteries: collectBatteryMeasurements(data, invalidValues)
  };

  return hasNormalizedValue(current) ? current : null;
}

function buildEcowittMessage({ current, state, ageMinutes, missingCoreSensors }) {
  if (!current) {
    return "Ecowitt response received, but no normalized current observation was found.";
  }

  if (state === "stale") {
    return Number.isFinite(ageMinutes) ? `Ecowitt data is stale: ${ageMinutes} minutes old.` : "Ecowitt data has no usable timestamp.";
  }

  if (missingCoreSensors.length) {
    return `Ecowitt OK, but missing core sensors: ${missingCoreSensors.join(", ")}.`;
  }

  return "Ecowitt observation is fresh.";
}

function buildMissingConfigMessage(missing) {
  return `Ecowitt is not fully configured. Missing: ${missing.join(", ")}.`;
}

function getMissingCoreSensors(data) {
  const rainFamily = selectRainFamily(data);

  return [
    ["outdoor.temperature", "temperature"],
    ["outdoor.humidity", "humidity"],
    [rainFamily ? `${rainFamily}.rain_rate` : "rainfall.rain_rate", "rain"],
    ["wind.wind_speed", "wind"]
  ]
    .filter(([path]) => !Number.isFinite(coerceNumber(readSensorValue(data, path))))
    .map(([path]) => path);
}

function selectRainFamily(data) {
  if (hasSensorGroup(data.rainfall)) {
    return "rainfall";
  }

  if (hasSensorGroup(data.rainfall_piezo)) {
    return "rainfall_piezo";
  }

  return "rainfall";
}

function hasSensorGroup(group) {
  return !!group && typeof group === "object" && Object.values(group).some((sensor) => Number.isFinite(coerceNumber(sensor?.value)));
}

function detectRainSensorFamilies(data) {
  return ["rainfall", "rainfall_piezo"].filter((family) => hasSensorGroup(data?.[family]));
}

function collectSensorGroups(data) {
  if (!data || typeof data !== "object") {
    return [];
  }

  return Object.keys(data).sort();
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
        value: sanitizeDiagnosticValue(value.value),
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

function collectChannelMeasurements(data, groupPattern, metricKey, reader, invalidValues, valueKey) {
  return Object.entries(data || {})
    .map(([group, values]) => {
      const match = group.match(groupPattern);

      if (!match || !values?.[metricKey]) {
        return null;
      }

      const path = `${group}.${metricKey}`;
      const value = reader(data, path, invalidValues);

      if (!Number.isFinite(value)) {
        return null;
      }

      return {
        channel: Number(match[1]),
        [valueKey]: value,
        unit: values[metricKey].unit ?? null,
        updatedAt: coerceIsoDate(values[metricKey].time)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.channel - b.channel);
}

function collectBatteryMeasurements(data, invalidValues) {
  return Object.entries(data?.battery || {})
    .map(([name, sensor]) => {
      const value = readPositiveSensor(sensor, `battery.${name}`, invalidValues);

      if (!Number.isFinite(value)) {
        return null;
      }

      return {
        name,
        value,
        unit: sensor.unit ?? null,
        updatedAt: coerceIsoDate(sensor.time)
      };
    })
    .filter(Boolean);
}

function collectHistoryRows(data, invalidValues) {
  const byTime = new Map();
  addHistoryMetric(byTime, data, "outdoor.temperature", "temperatureC", readTemperatureSensorValue, invalidValues);
  addHistoryMetric(byTime, data, "outdoor.humidity", "humidityPct", readPercentSensorValue, invalidValues);
  addHistoryMetric(byTime, data, `${selectRainFamily(data)}.rain_rate`, "rainRateMmPerHour", readRainSensorValue, invalidValues);
  addHistoryMetric(byTime, data, `${selectRainFamily(data)}.hourly`, "rainMm", readRainSensorValue, invalidValues);
  addHistoryMetric(byTime, data, `${selectRainFamily(data)}.1_hour`, "rainMm", readRainSensorValue, invalidValues);
  addHistoryMetric(byTime, data, "wind.wind_speed", "windKmh", readWindSensorValue, invalidValues);
  addHistoryMetric(byTime, data, "wind.wind_gust", "gustKmh", readWindSensorValue, invalidValues);
  addHistoryMetric(byTime, data, "wind.wind_direction", "windDirectionDeg", readDirectionSensorValue, invalidValues);
  addHistoryChannelMetric(byTime, data, /^soil_ch(\d+)$/, "soilmoisture", "soilMoisture", "moisturePct", readPercentSensorValue, invalidValues);
  addHistoryChannelMetric(byTime, data, /^leaf_ch(\d+)$/, "leaf_wetness", "leafWetness", "wetnessPct", readPercentSensorValue, invalidValues);

  return [...byTime.entries()]
    .map(([time, values]) => ({ time, values }))
    .filter((row) => hasNormalizedValue(row.values))
    .sort((a, b) => a.time.localeCompare(b.time));
}

function addHistoryMetric(byTime, data, path, key, reader, invalidValues) {
  for (const sensor of expandHistorySamples(readPath(data, path))) {
    const time = coerceIsoDate(sensor.time);

    if (!time) {
      continue;
    }

    const value = reader(sensor, path, invalidValues);

    if (!Number.isFinite(value)) {
      continue;
    }

    const row = getHistoryRow(byTime, time);
    row[key] = value;
  }
}

function addHistoryChannelMetric(byTime, data, groupPattern, metricKey, arrayKey, valueKey, reader, invalidValues) {
  for (const [group, values] of Object.entries(data || {})) {
    const match = group.match(groupPattern);

    if (!match || !values?.[metricKey]) {
      continue;
    }

    const channel = Number(match[1]);
    const path = `${group}.${metricKey}`;

    for (const sensor of expandHistorySamples(values[metricKey])) {
      const time = coerceIsoDate(sensor.time);

      if (!time) {
        continue;
      }

      const value = reader(sensor, path, invalidValues);

      if (!Number.isFinite(value)) {
        continue;
      }

      const row = getHistoryRow(byTime, time);
      const samples = row[arrayKey] || [];
      const existing = samples.find((item) => item.channel === channel);

      if (existing) {
        existing[valueKey] = value;
      } else {
        samples.push({ channel, [valueKey]: value });
      }

      row[arrayKey] = samples.sort((a, b) => a.channel - b.channel);
    }
  }
}

function getHistoryRow(byTime, time) {
  const row = byTime.get(time) || {};
  byTime.set(time, row);
  return row;
}

function expandHistorySamples(sensor) {
  if (!sensor || typeof sensor !== "object") {
    return [];
  }

  const unit = sensor.unit ?? null;

  if (Array.isArray(sensor.list)) {
    return sensor.list.map((item) => ({ ...item, unit: item.unit ?? unit }));
  }

  if (sensor.list && typeof sensor.list === "object") {
    return Object.entries(sensor.list).map(([time, value]) => ({ time, value, unit }));
  }

  if (Array.isArray(sensor.value)) {
    return sensor.value.map((item) => typeof item === "object" ? { ...item, unit: item.unit ?? unit } : { value: item, unit });
  }

  if (sensor.value && typeof sensor.value === "object") {
    return Object.entries(sensor.value).map(([time, value]) => ({ time, value, unit }));
  }

  if (sensor.time !== undefined && sensor.value !== undefined) {
    return [sensor];
  }

  return Object.entries(sensor)
    .filter(([key]) => key !== "unit")
    .map(([time, value]) => ({ time, value, unit }));
}

function buildHistorySeries(rows) {
  const series = emptyHistorySeries();

  for (const row of rows) {
    pushHistoryValue(series.temperatureC, row.time, row.values.temperatureC);
    pushHistoryValue(series.humidityPct, row.time, row.values.humidityPct);
    pushHistoryValue(series.rainRateMmPerHour, row.time, row.values.rainRateMmPerHour);
    pushHistoryValue(series.rainMm, row.time, row.values.rainMm);
    pushHistoryValue(series.windKmh, row.time, row.values.windKmh);
    pushHistoryValue(series.gustKmh, row.time, row.values.gustKmh);
    pushHistoryValue(series.windDirectionDeg, row.time, row.values.windDirectionDeg);

    for (const sample of row.values.soilMoisture || []) {
      const key = `ch${sample.channel}`;
      series.soilMoisture[key] = series.soilMoisture[key] || [];
      pushHistoryValue(series.soilMoisture[key], row.time, sample.moisturePct);
    }

    for (const sample of row.values.leafWetness || []) {
      const key = `ch${sample.channel}`;
      series.leafWetness[key] = series.leafWetness[key] || [];
      pushHistoryValue(series.leafWetness[key], row.time, sample.wetnessPct);
    }
  }

  return series;
}

function emptyHistorySeries() {
  return {
    temperatureC: [],
    humidityPct: [],
    rainRateMmPerHour: [],
    rainMm: [],
    windKmh: [],
    gustKmh: [],
    windDirectionDeg: [],
    soilMoisture: {},
    leafWetness: {}
  };
}

function pushHistoryValue(series, time, value) {
  series.push({
    time,
    value: Number.isFinite(value) ? value : null
  });
}

function isEcowittError(payload) {
  const code = Number(payload?.code);
  return Number.isFinite(code) && code !== 0;
}

function readPercent(data, path, invalidValues) {
  return validateRange(readUnitlessNumber(data, path), 0, 100, path, invalidValues);
}

function readDirectionDeg(data, path, invalidValues) {
  return validateRange(readUnitlessNumber(data, path), 0, 360, path, invalidValues);
}

function readPositiveNumber(data, path, invalidValues) {
  return validateRange(readUnitlessNumber(data, path), 0, Infinity, path, invalidValues);
}

function readUnitlessNumber(data, path) {
  return coerceNumber(readSensorValue(data, path));
}

function readTemperatureC(data, path, invalidValues) {
  const sensor = readPath(data, path);
  const value = coerceNumber(sensor?.value);

  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = normalizeUnit(sensor?.unit);
  let celsius = null;

  if (isFahrenheitUnit(unit)) {
    celsius = (value - 32) * 5 / 9;
  } else if (isCelsiusUnit(unit)) {
    celsius = value;
  } else {
    recordInvalidValue(invalidValues, path, "unsupported temperature unit", sensor?.unit, sensor?.value);
    return null;
  }

  return round(validateRange(celsius, -60, 70, path, invalidValues), 1);
}

function readWindKmh(data, path, invalidValues) {
  const sensor = readPath(data, path);
  const value = coerceNumber(sensor?.value);

  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = normalizeUnit(sensor?.unit);
  let kmh = null;

  if (["km/h", "kmh", "kph"].includes(unit)) {
    kmh = value;
  } else if (["m/s", "mps"].includes(unit)) {
    kmh = value * 3.6;
  } else if (unit === "mph") {
    kmh = value * 1.609344;
  } else if (["knot", "knots", "kt"].includes(unit)) {
    kmh = value * 1.852;
  } else {
    recordInvalidValue(invalidValues, path, "unsupported wind unit", sensor?.unit, sensor?.value);
    return null;
  }

  return round(validateRange(kmh, 0, 300, path, invalidValues), 1);
}

function readPressureHpa(data, path, invalidValues) {
  const sensor = readPath(data, path);
  const value = coerceNumber(sensor?.value);

  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = normalizeUnit(sensor?.unit);
  let hpa = null;

  if (["hpa", "mb", "mbar"].includes(unit)) {
    hpa = value;
  } else if (unit === "inhg") {
    hpa = value * 33.8639;
  } else if (unit === "mmhg") {
    hpa = value * 1.33322;
  } else {
    recordInvalidValue(invalidValues, path, "unsupported pressure unit", sensor?.unit, sensor?.value);
    return null;
  }

  return round(validateRange(hpa, 800, 1100, path, invalidValues), 1);
}

function readRainMm(data, path, invalidValues) {
  const sensor = readPath(data, path);
  const value = coerceNumber(sensor?.value);

  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = normalizeUnit(sensor?.unit);
  let mm = null;

  if (["mm", "mm/h", "mm/hr", "mm/hour"].includes(unit)) {
    mm = value;
  } else if (["in", "inch", "inches", "in/h", "in/hr", "inch/h", "inch/hr", "inches/hour"].includes(unit)) {
    mm = value * 25.4;
  } else {
    recordInvalidValue(invalidValues, path, "unsupported rain unit", sensor?.unit, sensor?.value);
    return null;
  }

  return round(validateRange(mm, 0, Infinity, path, invalidValues), 2);
}

function readSolarWm2(data, path, invalidValues) {
  const sensor = readPath(data, path);
  const value = coerceNumber(sensor?.value);

  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = normalizeUnit(sensor?.unit);
  let wm2 = null;

  if (["w/m²", "w/m2", "wm2"].includes(unit)) {
    wm2 = value;
  } else if (unit === "lux") {
    wm2 = value / 126.7;
  } else {
    recordInvalidValue(invalidValues, path, "unsupported solar unit", sensor?.unit, sensor?.value);
    return null;
  }

  return round(validateRange(wm2, 0, Infinity, path, invalidValues), 1);
}

function readConductivityUsCm(data, path, invalidValues) {
  const sensor = readPath(data, path);
  const value = coerceNumber(sensor?.value);

  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = normalizeUnit(sensor?.unit);

  if (!["μs/cm", "µs/cm", "us/cm"].includes(unit)) {
    recordInvalidValue(invalidValues, path, "unsupported conductivity unit", sensor?.unit, sensor?.value);
    return null;
  }

  return round(validateRange(value, 0, Infinity, path, invalidValues), 1);
}

function readPositiveSensor(sensor, path, invalidValues) {
  const value = coerceNumber(sensor?.value);

  if (!Number.isFinite(value)) {
    return null;
  }

  return validateRange(value, 0, Infinity, path, invalidValues);
}

function readTemperatureSensorValue(sensor, path, invalidValues) {
  return readTemperatureC({ sensor }, "sensor", invalidValuesForPath(invalidValues, path));
}

function readWindSensorValue(sensor, path, invalidValues) {
  return readWindKmh({ sensor }, "sensor", invalidValuesForPath(invalidValues, path));
}

function readRainSensorValue(sensor, path, invalidValues) {
  return readRainMm({ sensor }, "sensor", invalidValuesForPath(invalidValues, path));
}

function readPercentSensorValue(sensor, path, invalidValues) {
  return validateRange(coerceNumber(sensor?.value), 0, 100, path, invalidValues);
}

function readDirectionSensorValue(sensor, path, invalidValues) {
  return validateRange(coerceNumber(sensor?.value), 0, 360, path, invalidValues);
}

function invalidValuesForPath(invalidValues, path) {
  return {
    push(entry) {
      invalidValues.push({
        ...entry,
        path
      });
    }
  };
}

function validateRange(value, min, max, path, invalidValues) {
  if (!Number.isFinite(value) || value < min || value > max) {
    recordInvalidValue(invalidValues, path, "out of range", null, value);
    return null;
  }

  return value;
}

function recordInvalidValue(invalidValues, path, reason, unit, value) {
  invalidValues.push({
    path,
    reason,
    unit: unit ?? null,
    value: sanitizeDiagnosticValue(value)
  });
}

function readSensorValue(data, path) {
  return readPath(data, path)?.value;
}

function readPath(data, path) {
  return path.split(".").reduce((value, key) => value?.[key], data);
}

function latestIsoDate(values, fetchedAt) {
  const fetchedAtMs = Date.parse(fetchedAt);
  const maxSensorTimeMs = Number.isFinite(fetchedAtMs) ? fetchedAtMs + MAX_SENSOR_CLOCK_SKEW_MINUTES * 60_000 : Infinity;
  const dates = values
    .map((value) => coerceIsoDate(value, maxSensorTimeMs))
    .filter(Boolean)
    .sort();

  return dates[dates.length - 1] || null;
}

function coerceIsoDate(value, maxTimeMs = Infinity) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  const date = Number.isFinite(number)
    ? new Date(number < 10_000_000_000 ? number * 1000 : number)
    : new Date(value);

  if (!Number.isFinite(date.getTime()) || date.getTime() > maxTimeMs) {
    return null;
  }

  return date.toISOString();
}

function coerceNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function normalizeUnit(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/º/g, "°")
    .replace(/℉/g, "°f")
    .replace(/℃/g, "°c")
    .replace(/\s+/g, "");
}

function isFahrenheitUnit(unit) {
  return ["f", "°f", "degf", "fahrenheit"].includes(unit);
}

function isCelsiusUnit(unit) {
  return ["c", "°c", "degc", "celsius"].includes(unit);
}

function hasNormalizedValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value && typeof value === "object") {
    return Object.values(value).some(hasNormalizedValue);
  }

  return Number.isFinite(value);
}

function countNormalizedMeasurements(value) {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countNormalizedMeasurements(item), 0);
  }

  if (value && typeof value === "object") {
    return Object.values(value).reduce((total, item) => total + countNormalizedMeasurements(item), 0);
  }

  return Number.isFinite(value) ? 1 : 0;
}

function isBatteryPath(path) {
  const lowerPath = path.toLowerCase();
  return lowerPath.includes("battery") || lowerPath.includes("batt");
}

function sanitizeDiagnosticValue(value) {
  if (typeof value === "string" && value.length > 80) {
    return `${value.slice(0, 80)}…`;
  }

  return value ?? null;
}

function sanitizeSensitiveText(value, config = {}) {
  return [config.applicationKey, config.apiKey, config.mac, config.imei]
    .filter(Boolean)
    .reduce((message, secret) => message.split(secret).join("[redacted]"), String(value || ""));
}

function maskIdentifier(value) {
  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  const compact = text.replace(/[^a-z0-9]/gi, "");

  if (compact.length <= 4) {
    return "***";
  }

  return `***${compact.slice(-4)}`;
}

function formatEcowittHistoryDate(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
