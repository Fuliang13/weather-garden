import { describe, expect, it } from "vitest";
import { DEFAULT_LOCATION, DEFAULT_SETTINGS, buildWeatherStatus } from "../src/scoring.js";
import { buildGardenStatus, buildGeneratedGardenAlerts, normalizeGardenState } from "../src/garden.js";
import { normalizeEcowittPayload } from "../src/sources/ecowitt.js";

describe("weather scoring", () => {
  it("builds a compact no-rain signal when all forecast windows are dry", () => {
    const now = new Date("2026-05-06T12:00:00.000Z");
    const openMeteo = {
      ok: true,
      fetchedAt: now.toISOString(),
      current: {
        temperature_2m: 15,
        relative_humidity_2m: 80,
        precipitation: 0,
        rain: 0,
        wind_speed_10m: 8,
        wind_gusts_10m: 18,
        weather_code: 3
      },
      minutely15: [0, 15, 30, 45, 60, 75, 90, 105, 120].map((minutes) => ({
        timeMs: now.getTime() + minutes * 60_000,
        precipitation: 0,
        rain: 0
      })),
      hourly: [180, 240, 300, 360].map((minutes) => ({
        timeMs: now.getTime() + minutes * 60_000,
        precipitation: 0,
        rain: 0,
        precipitation_probability: 0
      }))
    };

    const status = buildWeatherStatus({
      location: DEFAULT_LOCATION,
      settings: DEFAULT_SETTINGS,
      openMeteo,
      metNorway: null,
      meteoFranceRadar: null,
      rainViewer: null,
      now
    });

    expect(status.rain.noSignificantRain).toBe(true);
    expect(status.rain.headline).toMatch(/Pas de pluie significative pendant/);
    expect(status.rain.detail).toBe("");
  });

  it("exposes a public-safe WGR synthesis on the weather status", () => {
    const now = new Date("2026-05-06T12:00:00.000Z");
    const status = buildWeatherStatus({
      location: DEFAULT_LOCATION,
      settings: DEFAULT_SETTINGS,
      openMeteo: buildOpenMeteoForecast(now, { precipitationMm: 0.4, temperatureC: 12, windKmh: 8, gustKmh: 18 }),
      metNorway: null,
      meteoFranceRadar: {
        ok: false,
        nativeLayer: { ok: false },
        wgr: {
          status: {
            source: "meteofrance-radar",
            available: false,
            freshness: "unavailable",
            fallbackReason: "projection missing"
          }
        }
      },
      rainViewer: {
        ok: true,
        imageUrl: "https://example.test/rainviewer-token.png",
        wgr: {
          status: {
            source: "rainviewer",
            available: true,
            freshness: "fresh"
          }
        }
      },
      ecowittObservation: null,
      now
    });

    expect(status.wgr).toMatchObject({
      type: "RadarSynthesis",
      state: "rainviewer_ok",
      observedRain: false,
      imminentRain: true,
      coherence: "model_ahead_of_observation",
      displayHints: {
        radarSource: "rainviewer",
        zoomMode: "auto"
      }
    });
    expect(status.wgr.explanations.length).toBeGreaterThan(0);
    expect(JSON.stringify(status.wgr)).not.toContain("https://");
    expect(JSON.stringify(status.wgr)).not.toContain("rainviewer-token");
  });

  it("keeps garden entities generic and attached to the status payload", () => {
    const gardenState = normalizeGardenState({
      entities: [
        {
          id: "north-vine",
          type: "vine",
          name: "Vigne nord",
          tags: ["fruit", "test"]
        }
      ],
      alerts: [
        {
          id: "frost-watch",
          category: "frost",
          level: "watch",
          entityId: "north-vine",
          headline: "Surveillance gel"
        }
      ]
    });

    const garden = buildGardenStatus(gardenState);

    expect(garden.summary.entityCount).toBe(1);
    expect(garden.entities[0]).toMatchObject({ id: "north-vine", type: "vine" });
    expect(garden.alerts.active[0]).toMatchObject({ category: "frost", level: "watch", entityId: "north-vine" });
  });

  it("builds generated garden alerts from weather data", () => {
    const gardenState = normalizeGardenState({
      entities: [
        {
          id: "north-vine",
          type: "vine",
          name: "Vigne nord"
        }
      ]
    });
    const alerts = buildGeneratedGardenAlerts(gardenState, {
      current: {
        temperatureC: 0.5,
        humidityPct: 88,
        gustKmh: 75,
        windKmh: 12
      },
      rain: {
        activeNow: true,
        horizons: [
          { minutes: 120, precipitationMm: 3 }
        ]
      }
    }, DEFAULT_SETTINGS, new Date("2026-05-06T12:00:00.000Z"));

    expect(alerts.some((alert) => alert.id === "north-vine-frost-risk")).toBe(true);
    expect(alerts.some((alert) => alert.id === "north-vine-wind-risk")).toBe(true);
    expect(alerts[0].details.every((detail) => typeof detail === "string")).toBe(true);
  });

  it("marks stale Ecowitt observations in status.sources without exposing raw payloads", () => {
    const now = new Date("2026-05-06T12:00:00.000Z");
    const ecowittObservation = normalizeEcowittPayload({
      code: 0,
      data: {
        outdoor: {
          temperature: { value: "12.5", unit: "C", time: "2026-05-06T11:00:00.000Z" },
          humidity: { value: "84", unit: "%", time: "2026-05-06T11:00:00.000Z" }
        },
        rainfall: {
          rain_rate: { value: "0.4", unit: "mm/h", time: "2026-05-06T11:00:00.000Z" }
        },
        wind: {
          wind_speed: { value: "5", unit: "km/h", time: "2026-05-06T11:00:00.000Z" }
        },
        soil_ch1: {
          soilmoisture: { value: "42", unit: "%", time: "2026-05-06T11:00:00.000Z" }
        }
      }
    }, { staleMinutes: 20 });

    const status = buildWeatherStatus({
      location: DEFAULT_LOCATION,
      settings: DEFAULT_SETTINGS,
      openMeteo: null,
      metNorway: null,
      meteoFranceRadar: null,
      rainViewer: null,
      ecowittObservation,
      now
    });
    const source = status.sources.find((item) => item.id === "ecowitt");

    expect(ecowittObservation).not.toHaveProperty("raw");
    expect(ecowittObservation.diagnostics.availableSensors).toContain("soil_ch1.soilmoisture");
    expect(source).toMatchObject({
      id: "ecowitt",
      ok: true,
      status: "stale",
      stale: true
    });
    expect(status.stationObservation).toBeNull();
  });

  it("marks available forecast sources as fresh and missing sources as unavailable", () => {
    const now = new Date("2026-05-06T12:00:00.000Z");
    const status = buildWeatherStatus({
      location: DEFAULT_LOCATION,
      settings: DEFAULT_SETTINGS,
      openMeteo: {
        ok: true,
        fetchedAt: now.toISOString(),
        current: { precipitation: 0, rain: 0 },
        minutely15: []
      },
      metNorway: null,
      meteoFranceRadar: null,
      rainViewer: null,
      now
    });

    expect(status.sources.find((item) => item.id === "open-meteo-arome").status).toBe("fresh");
    expect(status.sources.find((item) => item.id === "met-norway").status).toBe("unavailable");
  });

  it("adds a public AROME / MET Norway / WGF comparison for the required horizons", () => {
    const now = new Date("2026-05-06T12:00:00.000Z");
    const status = buildWeatherStatus({
      location: DEFAULT_LOCATION,
      settings: DEFAULT_SETTINGS,
      openMeteo: buildOpenMeteoForecast(now, { precipitationMm: 0.2, temperatureC: 12, windKmh: 8, gustKmh: 18 }),
      metNorway: buildMetNorwayForecast(now, { precipitationMm: 0.2, temperatureC: 12.3, windKmh: 9, gustKmh: 17 }),
      meteoFranceRadar: null,
      rainViewer: { ok: true, imageUrl: "https://example.test/rainviewer-token-should-not-matter.png" },
      now
    });
    const keys = status.forecastComparison.horizons.map((horizon) => horizon.key);
    const oneHour = status.forecastComparison.horizons.find((horizon) => horizon.key === "1h");

    expect(status.forecastComparison.generatedAt).toBe(now.toISOString());
    expect(keys).toEqual(["minutecast", "1h", "2h", "4h", "8h", "1d", "2d"]);
    expect(oneHour.sources.arome).toMatchObject({ available: true, state: "fresh" });
    expect(oneHour.sources.metNorway).toMatchObject({ available: true, state: "fresh" });
    expect(oneHour.sources.arome.precipitationMm).toBeGreaterThan(0);
    expect(oneHour.sources.metNorway.precipitationMm).toBeGreaterThan(0);
    expect(oneHour.sources.wgf).toMatchObject({
      available: true,
      state: "fresh",
      confidence: "high"
    });
    expect(JSON.stringify(status.forecastComparison)).not.toContain("rainviewer-token");
  });

  it("reduces WGF confidence when AROME and MET Norway diverge", () => {
    const now = new Date("2026-05-06T12:00:00.000Z");
    const status = buildWeatherStatus({
      location: DEFAULT_LOCATION,
      settings: DEFAULT_SETTINGS,
      openMeteo: buildOpenMeteoForecast(now, { precipitationMm: 1.4, temperatureC: 12, windKmh: 8, gustKmh: 18 }),
      metNorway: buildMetNorwayForecast(now, { precipitationMm: 0, temperatureC: 12.2, windKmh: 9, gustKmh: 17 }),
      meteoFranceRadar: null,
      rainViewer: null,
      now
    });
    const oneHour = status.forecastComparison.horizons.find((horizon) => horizon.key === "1h");

    expect(oneHour.sources.wgf.confidence).toBe("medium");
    expect(oneHour.sources.wgf.reason).toContain("divergent");
  });

  it("keeps missing forecast sources explicit and does not invent WGF values", () => {
    const now = new Date("2026-05-06T12:00:00.000Z");
    const status = buildWeatherStatus({
      location: DEFAULT_LOCATION,
      settings: DEFAULT_SETTINGS,
      openMeteo: null,
      metNorway: null,
      meteoFranceRadar: null,
      rainViewer: null,
      now
    });
    const oneHour = status.forecastComparison.horizons.find((horizon) => horizon.key === "1h");

    expect(oneHour.sources.arome).toMatchObject({
      available: false,
      state: "unavailable",
      precipitationMm: null,
      temperatureC: null,
      windKmh: null,
      gustKmh: null
    });
    expect(oneHour.sources.metNorway.available).toBe(false);
    expect(oneHour.sources.wgf).toMatchObject({
      available: false,
      state: "unavailable",
      precipitationMm: null,
      temperatureC: null,
      windKmh: null,
      gustKmh: null,
      confidence: "unavailable"
    });
  });
});

function buildOpenMeteoForecast(now, { precipitationMm, temperatureC, windKmh, gustKmh }) {
  return {
    ok: true,
    fetchedAt: now.toISOString(),
    current: {
      temperature_2m: temperatureC,
      relative_humidity_2m: 80,
      precipitation: 0,
      rain: 0,
      wind_speed_10m: windKmh,
      wind_gusts_10m: gustKmh,
      weather_code: 3
    },
    minutely15: [0, 15, 30, 45, 60, 75, 90, 105, 120].map((minutes) => ({
      timeMs: now.getTime() + minutes * 60_000,
      precipitation: precipitationMm / 2,
      rain: precipitationMm / 2,
      temperature_2m: temperatureC,
      wind_speed_10m: windKmh,
      wind_gusts_10m: gustKmh
    })),
    hourly: [180, 240, 480, 1440, 2880].map((minutes) => ({
      timeMs: now.getTime() + minutes * 60_000,
      precipitation: precipitationMm,
      rain: precipitationMm,
      precipitation_probability: precipitationMm > 0 ? 60 : 0,
      temperature_2m: temperatureC,
      wind_speed_10m: windKmh,
      wind_gusts_10m: gustKmh
    }))
  };
}

function buildMetNorwayForecast(now, { precipitationMm, temperatureC, windKmh, gustKmh }) {
  return {
    ok: true,
    fetchedAt: now.toISOString(),
    timeseries: [0, 60, 120, 240, 480, 1440, 2880].map((minutes) => ({
      time: new Date(now.getTime() + minutes * 60_000).toISOString(),
      timeMs: now.getTime() + minutes * 60_000,
      instant: {
        air_temperature: temperatureC,
        wind_speed_kmh: windKmh,
        wind_gusts_kmh: gustKmh
      },
      next1h: {
        precipitation_amount: precipitationMm / 2
      }
    }))
  };
}
