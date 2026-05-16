import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker.js";
import {
  WEATHER_HISTORY_RECENT_KEY,
  buildWeatherHistorySample,
  persistWeatherHistorySample
} from "../src/weatherHistory.js";

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

describe("weather history", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a public-safe sample from the weather status", () => {
    const sample = buildWeatherHistorySample(buildStatus(), new Date("2026-05-16T12:10:00.000Z"));
    const serialized = JSON.stringify(sample);

    expect(sample).toMatchObject({
      version: 1,
      type: "weather-history-sample",
      generatedAt: "2026-05-16T12:10:00.000Z",
      observation: {
        source: "ecowitt",
        temperatureC: 12.5,
        humidityPct: 82,
        rainRateMmPerHour: 0.4
      },
      forecastImmediate: {
        activeNow: false,
        etaMinutes: 30,
        score: 0.62,
        confidence: "medium"
      },
      radarSummary: {
        provider: "meteofrance-radar",
        nativeLayerOk: false,
        fallbackProvider: "rainviewer"
      }
    });
    expect(sample.rainHorizons).toHaveLength(2);
    expect(sample.wgfSummary.horizons[0]).toMatchObject({ key: "1h", confidence: "high" });
    expect(serialized).not.toContain("application_key");
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("rainviewer-token");
    expect(serialized).not.toContain("AA:BB:CC:DD:EE:FF");
    expect(serialized).not.toContain("863879049793071");
  });

  it("stores bounded recent samples in KV", async () => {
    const kv = new MemoryKV();

    await persistWeatherHistorySample({
      kv,
      status: buildStatus("2026-05-16T12:00:00.000Z"),
      now: new Date("2026-05-16T12:00:00.000Z"),
      limit: 2,
      minIntervalMinutes: 0
    });
    await persistWeatherHistorySample({
      kv,
      status: buildStatus("2026-05-16T12:15:00.000Z"),
      now: new Date("2026-05-16T12:15:00.000Z"),
      limit: 2,
      minIntervalMinutes: 0
    });
    await persistWeatherHistorySample({
      kv,
      status: buildStatus("2026-05-16T12:30:00.000Z"),
      now: new Date("2026-05-16T12:30:00.000Z"),
      limit: 2,
      minIntervalMinutes: 0
    });

    const stored = await kv.get(WEATHER_HISTORY_RECENT_KEY, "json");

    expect(stored.samples).toHaveLength(2);
    expect(stored.samples[0].generatedAt).toBe("2026-05-16T12:15:00.000Z");
    expect(stored.samples[1].generatedAt).toBe("2026-05-16T12:30:00.000Z");
  });

  it("skips writes when the latest sample is still recent", async () => {
    const kv = new MemoryKV();

    await persistWeatherHistorySample({
      kv,
      status: buildStatus("2026-05-16T12:00:00.000Z"),
      now: new Date("2026-05-16T12:00:00.000Z")
    });
    const result = await persistWeatherHistorySample({
      kv,
      status: buildStatus("2026-05-16T12:05:00.000Z"),
      now: new Date("2026-05-16T12:05:00.000Z")
    });
    const stored = await kv.get(WEATHER_HISTORY_RECENT_KEY, "json");

    expect(result).toMatchObject({ ok: true, stored: false, reason: "recent-sample-exists" });
    expect(stored.samples).toHaveLength(1);
  });

  it("recovers from corrupted history without throwing", async () => {
    const kv = new MemoryKV();
    kv.map.set(WEATHER_HISTORY_RECENT_KEY, "not-json");

    const result = await persistWeatherHistorySample({
      kv,
      status: buildStatus(),
      now: new Date("2026-05-16T12:00:00.000Z")
    });
    const stored = await kv.get(WEATHER_HISTORY_RECENT_KEY, "json");

    expect(result).toMatchObject({ ok: true, stored: true, reason: "history-recovered" });
    expect(stored.samples).toHaveLength(1);
  });

  it("reports unavailable KV without throwing", async () => {
    const result = await persistWeatherHistorySample({
      kv: null,
      status: buildStatus(),
      now: new Date("2026-05-16T12:00:00.000Z")
    });

    expect(result).toMatchObject({ ok: false, stored: false, reason: "kv-unavailable" });
  });

  it("writes history after a successful refresh without breaking the response", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const kv = new MemoryKV();
    const response = await worker.fetch(new Request("https://example.com/api/refresh"), {
      WEATHER_KV: kv
    }, {
      waitUntil() {}
    });
    const body = await response.json();
    const history = await kv.get(WEATHER_HISTORY_RECENT_KEY, "json");

    expect(response.ok).toBe(true);
    expect(body.updatedAt).toBeTruthy();
    expect(history.samples).toHaveLength(1);
    expect(history.samples[0].type).toBe("weather-history-sample");
  });
});

function buildStatus(updatedAt = "2026-05-16T12:00:00.000Z") {
  return {
    updatedAt,
    current: {
      temperatureC: 12.5,
      humidityPct: 82,
      windKmh: 8,
      gustKmh: 21,
      precipitationMm: 0,
      weatherCode: 3
    },
    stationObservation: {
      ok: true,
      source: "ecowitt",
      updatedAt: "2026-05-16T11:58:00.000Z",
      stale: false,
      freshnessMinutes: 2,
      current: {
        temperatureC: 12.5,
        humidityPct: 82,
        windKmh: 8,
        gustKmh: 21,
        pressureHpa: 1013.2,
        rainRateMmPerHour: 0.4,
        dailyRainMm: 3.1
      }
    },
    observation: {
      station: null
    },
    rain: {
      activeNow: false,
      noSignificantRain: false,
      etaMinutes: 30,
      expectedDurationMinutes: 45,
      intensityLevel: "light",
      intensityMmPerHour: 0.6,
      alertLevel: "moderate",
      horizons: [
        {
          minutes: 30,
          score: 0.62,
          confidence: "medium",
          alertLevel: "moderate",
          precipitationMm: 0.4,
          intensityMmPerHour: 0.8,
          intensityLevel: "light",
          sources: {
            openMeteo: { available: true, score: 0.6, precipitationMm: 0.4, probability: 0.7 },
            metNorway: { available: true, score: 0.4, precipitationMm: 0.1, probability: null },
            radar: { available: false, score: 0, precipitationMm: null, probability: null }
          }
        },
        {
          minutes: 60,
          score: 0.7,
          confidence: "high",
          alertLevel: "moderate",
          precipitationMm: 0.8,
          intensityMmPerHour: 0.8,
          intensityLevel: "light",
          sources: {}
        }
      ]
    },
    radar: {
      meteoFrance: {
        ok: true,
        source: "meteofrance-radar",
        provider: "meteofrance-radar",
        validityTime: "2026-05-16T11:55:00.000Z",
        nativeLayer: { ok: false, reason: "projection unavailable" },
        fallbackReason: "Fallback RainViewer affiché.",
        score: 0.2,
        precipitationMm: 0.1
      },
      rainViewer: {
        ok: true,
        imageUrl: "https://example.test/rainviewer-token.png",
        updatedAt: "2026-05-16T11:55:00.000Z"
      }
    },
    forecastComparison: {
      generatedAt: updatedAt,
      horizons: [
        {
          key: "1h",
          label: "1 h",
          minutes: 60,
          sources: {
            wgf: {
              available: true,
              state: "fresh",
              confidence: "high",
              precipitationMm: 0.6,
              temperatureC: 12.4,
              windKmh: 8,
              gustKmh: 21,
              summary: "Pluie faible possible.",
              reason: "AROME et MET Norway sont cohérents."
            }
          }
        }
      ]
    },
    sources: [
      {
        id: "open-meteo-arome",
        label: "Open-Meteo AROME",
        enabled: true,
        ok: true,
        state: "fresh",
        stale: false,
        source: "open-meteo-arome",
        updatedAt: "2026-05-16T11:50:00.000Z",
        fetchedAt: "2026-05-16T12:00:00.000Z",
        freshnessMinutes: 10,
        role: "forecast-primary",
        priority: 10,
        errors: []
      },
      {
        id: "rainviewer",
        label: "RainViewer",
        enabled: true,
        ok: true,
        state: "fresh",
        stale: false,
        source: "rainviewer",
        imageUrl: "https://example.test/rainviewer-token.png",
        freshnessMinutes: 5,
        role: "radar-visual-fallback",
        priority: 3,
        errors: []
      }
    ],
    errors: [
      {
        source: "ecowitt",
        message: "https://api.ecowitt.net/path?application_key=secret-token&api_key=other-secret&mac=AA:BB:CC:DD:EE:FF&imei=863879049793071"
      }
    ]
  };
}
