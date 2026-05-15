import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker.js";
import { fetchEcowittObservation, normalizeEcowittPayload } from "../src/sources/ecowitt.js";

const NOW = "2026-05-15T16:00:00.000Z";
const NOW_SECONDS = Math.floor(Date.parse(NOW) / 1000);

class MemoryKV {
  constructor() {
    this.map = new Map();
  }

  async get(key, type) {
    const value = this.map.get(key) ?? null;

    if (type === "json" && value) {
      return JSON.parse(value);
    }

    return value;
  }

  async put(key, value) {
    this.map.set(key, value);
  }
}

describe("Ecowitt source", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a clean disabled diagnostic when configuration is absent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const observation = await fetchEcowittObservation({ env: {} });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(observation).toMatchObject({
      ok: false,
      enabled: false,
      source: "ecowitt",
      state: "unavailable",
      diagnostics: {
        configured: false,
        applicationKeyPresent: false,
        apiKeyPresent: false,
        macPresent: false,
        imeiPresent: false
      }
    });
    expect(JSON.stringify(observation)).not.toContain("application_key");
    expect(JSON.stringify(observation)).not.toContain("api_key");
  });

  it("reports partial configuration without calling the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const missingApiKey = await fetchEcowittObservation({
      env: {
        ECOWITT_APPLICATION_KEY: "app-secret",
        ECOWITT_DEVICE_MAC: "AA:BB:CC:DD:EE:FF"
      }
    });
    const missingApplicationKey = await fetchEcowittObservation({
      env: {
        ECOWITT_API_KEY: "api-secret",
        ECOWITT_DEVICE_MAC: "AA:BB:CC:DD:EE:FF"
      }
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(missingApiKey.message).toContain("ECOWITT_API_KEY");
    expect(missingApplicationKey.message).toContain("ECOWITT_APPLICATION_KEY");
    expect(JSON.stringify([missingApiKey, missingApplicationKey])).not.toContain("app-secret");
    expect(JSON.stringify([missingApiKey, missingApplicationKey])).not.toContain("api-secret");
  });

  it("calls the real-time API with metric units and supports IMEI without MAC", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(metricPayload()));

    const observation = await fetchEcowittObservation({
      env: {
        ECOWITT_APPLICATION_KEY: "app-secret",
        ECOWITT_API_KEY: "api-secret",
        ECOWITT_DEVICE_IMEI: "863879049793071"
      }
    });
    const url = new URL(fetchMock.mock.calls[0][0]);

    expect(url.pathname).toBe("/api/v3/device/real_time");
    expect(url.searchParams.get("application_key")).toBe("app-secret");
    expect(url.searchParams.get("api_key")).toBe("api-secret");
    expect(url.searchParams.get("imei")).toBe("863879049793071");
    expect(url.searchParams.get("mac")).toBeNull();
    expect(url.searchParams.get("temp_unitid")).toBe("1");
    expect(url.searchParams.get("pressure_unitid")).toBe("3");
    expect(url.searchParams.get("wind_speed_unitid")).toBe("7");
    expect(url.searchParams.get("rainfall_unitid")).toBe("12");
    expect(url.searchParams.get("solar_irradiance_unitid")).toBe("16");
    expect(observation.state).toBe("fresh");
    expect(observation.current).toMatchObject({
      temperatureC: 12.6,
      humidityPct: 68,
      dewPointC: 6.9,
      pressureHpa: 1008.1,
      rainRateMmPerHour: 1.2,
      dailyRainMm: 3.4
    });
  });

  it("converts imperial units before writing metric observation fields", () => {
    const observation = normalizeEcowittPayload(imperialPayload(), { staleMinutes: 20 });

    expect(observation).toMatchObject({
      ok: true,
      state: "fresh",
      stale: false,
      updatedAt: NOW,
      ageMinutes: 0,
      current: {
        temperatureC: 12.6,
        dewPointC: 6.9,
        windKmh: 16.1,
        gustKmh: 32.2,
        pressureHpa: 1013.2,
        absolutePressureHpa: 996.3,
        rainRateMmPerHour: 2.54,
        hourlyRainMm: 5.08,
        dailyRainMm: 25.4,
        rainSource: "rainfall_piezo"
      }
    });
  });

  it("marks observations stale from sensor timestamps", () => {
    const staleSeconds = NOW_SECONDS - 60 * 60;
    const observation = normalizeEcowittPayload(metricPayload({ time: String(staleSeconds) }), { staleMinutes: 20 });

    expect(observation.updatedAt).toBe("2026-05-15T15:00:00.000Z");
    expect(observation.ageMinutes).toBe(60);
    expect(observation.state).toBe("stale");
    expect(observation.stale).toBe(true);
    expect(observation.message).toContain("60 minutes old");
  });

  it("only reports missing timestamp when no usable timestamp exists", () => {
    const payload = metricPayload({ time: null });
    delete payload.time;

    const observation = normalizeEcowittPayload(payload, { staleMinutes: 20 });

    expect(observation.updatedAt).toBeNull();
    expect(observation.ageMinutes).toBeNull();
    expect(observation.state).toBe("stale");
    expect(observation.message).toBe("Ecowitt data has no usable timestamp.");
  });

  it("ignores incoherent values and never emits NaN", () => {
    const observation = normalizeEcowittPayload({
      code: 0,
      data: {
        outdoor: {
          temperature: sensor("300", "ºF"),
          humidity: sensor("150", "%")
        },
        wind: {
          wind_speed: sensor("-5", "km/h")
        },
        pressure: {
          relative: sensor("50", "hPa")
        },
        rainfall: {
          rain_rate: sensor("-1", "mm/h")
        },
        solar_and_uvi: {
          uvi: sensor("-2", "")
        },
        soil_ch1: {
          soilmoisture: sensor("101", "%")
        },
        leaf_ch1: {
          leaf_wetness: sensor("42", "%")
        }
      }
    }, { staleMinutes: 20 });

    expect(observation.current.temperatureC).toBeNull();
    expect(observation.current.humidityPct).toBeNull();
    expect(observation.current.windKmh).toBeNull();
    expect(observation.current.pressureHpa).toBeNull();
    expect(observation.current.rainRateMmPerHour).toBeNull();
    expect(observation.current.leafWetness[0]).toMatchObject({ channel: 1, wetnessPct: 42 });
    expect(JSON.stringify(observation)).not.toContain("NaN");
    expect(observation.diagnostics.invalidValues.length).toBeGreaterThan(0);
  });

  it("uses rainfall_piezo when the standard rainfall group is absent", () => {
    const observation = normalizeEcowittPayload({
      code: 0,
      data: {
        outdoor: {
          temperature: sensor("12", "°C"),
          humidity: sensor("80", "%")
        },
        rainfall_piezo: {
          rain_rate: sensor("0.5", "mm/h"),
          event: sensor("1.1", "mm"),
          hourly: sensor("2.2", "mm"),
          daily: sensor("3.3", "mm"),
          weekly: sensor("4.4", "mm"),
          monthly: sensor("5.5", "mm"),
          yearly: sensor("6.6", "mm")
        }
      }
    }, { staleMinutes: 20 });

    expect(observation.current).toMatchObject({
      rainSource: "rainfall_piezo",
      rainRateMmPerHour: 0.5,
      eventRainMm: 1.1,
      hourlyRainMm: 2.2,
      dailyRainMm: 3.3,
      weeklyRainMm: 4.4,
      monthlyRainMm: 5.5,
      yearlyRainMm: 6.6
    });
    expect(observation.diagnostics.rainSensorsDetected).toEqual(["rainfall_piezo"]);
  });

  it("does not leak secrets or complete device identifiers in diagnostics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(metricPayload()));

    const observation = await fetchEcowittObservation({
      env: {
        ECOWITT_APPLICATION_KEY: "app-secret",
        ECOWITT_API_KEY: "api-secret",
        ECOWITT_DEVICE_MAC: "AA:BB:CC:DD:EE:FF",
        ECOWITT_DEVICE_IMEI: "863879049793071"
      }
    });
    const serialized = JSON.stringify(observation);

    expect(serialized).not.toContain("app-secret");
    expect(serialized).not.toContain("api-secret");
    expect(serialized).not.toContain("AA:BB:CC:DD:EE:FF");
    expect(serialized).not.toContain("863879049793071");
    expect(observation.diagnostics.device.mac).toBe("***EEFF");
    expect(observation.diagnostics.device.imei).toBe("***3071");
  });

  it("keeps /api/status functional when Ecowitt and other sources fail", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const response = await worker.fetch(new Request("https://example.com/api/refresh"), {
      WEATHER_KV: new MemoryKV(),
      ECOWITT_APPLICATION_KEY: "app-secret",
      ECOWITT_API_KEY: "api-secret",
      ECOWITT_DEVICE_MAC: "AA:BB:CC:DD:EE:FF"
    }, {
      waitUntil() {}
    });
    const body = await response.json();

    expect(response.ok).toBe(true);
    expect(body.sources.find((source) => source.id === "ecowitt")).toMatchObject({
      ok: false,
      state: "unavailable",
      role: "observation-local"
    });
    expect(body.sources.find((source) => source.id === "open-meteo-arome").state).toBe("unavailable");
  });
});

function metricPayload({ time = String(NOW_SECONDS) } = {}) {
  return {
    code: 0,
    time,
    data: {
      outdoor: {
        temperature: sensor("12.6", "°C", time),
        humidity: sensor("68", "%", time),
        dew_point: sensor("6.9", "°C", time),
        feels_like: sensor("12.0", "°C", time)
      },
      wind: {
        wind_speed: sensor("7.2", "km/h", time),
        wind_gust: sensor("11.2", "km/h", time),
        wind_direction: sensor("238", "º", time)
      },
      pressure: {
        relative: sensor("1008.1", "hPa", time),
        absolute: sensor("988.1", "hPa", time)
      },
      rainfall: {
        rain_rate: sensor("1.2", "mm/h", time),
        daily: sensor("3.4", "mm", time)
      },
      solar_and_uvi: {
        solar: sensor("120", "W/m²", time),
        uvi: sensor("2", "", time)
      },
      soil_ch1: {
        soilmoisture: sensor("42", "%", time)
      },
      temp_ch1: {
        temperature: sensor("10", "°C", time)
      },
      ch_soil_ec_temp_hum1: {
        soilmoisture: sensor("43", "%", time),
        temperature: sensor("11", "°C", time),
        ec: sensor("120", "μS/cm", time)
      },
      leaf_ch1: {
        leaf_wetness: sensor("52", "%", time)
      },
      battery: {
        wind_sensor: sensor("1.20", "V", time)
      }
    }
  };
}

function imperialPayload() {
  return {
    code: 0,
    time: String(NOW_SECONDS),
    data: {
      outdoor: {
        temperature: sensor("54.7", "ºF"),
        humidity: sensor("68", "%"),
        dew_point: sensor("44.4", "℉")
      },
      wind: {
        wind_speed: sensor("10", "mph"),
        wind_gust: sensor("20", "mph"),
        wind_direction: sensor("238", "º")
      },
      pressure: {
        relative: sensor("29.92", "inHg"),
        absolute: sensor("29.42", "inHg")
      },
      rainfall_piezo: {
        rain_rate: sensor("0.1", "in/hr"),
        hourly: sensor("0.2", "in"),
        daily: sensor("1", "in")
      }
    }
  };
}

function sensor(value, unit, time = String(NOW_SECONDS)) {
  const sensorValue = { value, unit };

  if (time !== null) {
    sensorValue.time = time;
  }

  return sensorValue;
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
