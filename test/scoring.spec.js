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
});
