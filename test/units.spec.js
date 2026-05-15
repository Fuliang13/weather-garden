import { describe, expect, it } from "vitest";
import { DEFAULT_LOCATION, DEFAULT_SETTINGS, buildWeatherStatus } from "../src/scoring.js";
import { buildGeneratedGardenAlerts, normalizeGardenState } from "../src/garden.js";

describe("display unit settings", () => {
  it("normalizes the display unit setting without changing metric weather fields", () => {
    const imperialStatus = buildWeatherStatus({
      settings: { ...DEFAULT_SETTINGS, unitSystem: "imperial" },
      openMeteo: null,
      metNorway: null,
      meteoFranceRadar: null,
      rainViewer: null
    });
    const invalidStatus = buildWeatherStatus({
      settings: { ...DEFAULT_SETTINGS, unitSystem: "kelvin" },
      openMeteo: null,
      metNorway: null,
      meteoFranceRadar: null,
      rainViewer: null
    });

    expect(imperialStatus.settings.unitSystem).toBe("imperial");
    expect(invalidStatus.settings.unitSystem).toBe("metric");
    expect(imperialStatus.current).toHaveProperty("temperatureC");
  });

  it("formats generated weather summaries with the selected display unit system", () => {
    const now = new Date("2026-05-06T12:00:00.000Z");
    const status = buildWeatherStatus({
      location: DEFAULT_LOCATION,
      settings: { ...DEFAULT_SETTINGS, unitSystem: "imperial" },
      openMeteo: {
        ok: true,
        fetchedAt: now.toISOString(),
        current: {
          temperature_2m: 0,
          relative_humidity_2m: 80,
          precipitation: 1,
          rain: 1,
          wind_speed_10m: 8,
          wind_gusts_10m: 18,
          weather_code: 61
        },
        minutely15: [
          { timeMs: now.getTime(), precipitation: 2, rain: 2 }
        ]
      },
      metNorway: null,
      meteoFranceRadar: null,
      rainViewer: null,
      now
    });

    expect(status.rain.detail).toContain("in/h");
    expect(status.rain.detail).toContain("in");
    expect(status.rain.garden.details.join(" ")).toContain("in/h");
  });

  it("formats generated garden alerts with the selected display unit system", () => {
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
    }, { ...DEFAULT_SETTINGS, unitSystem: "imperial", heavyRain2hMm: 2 }, new Date("2026-05-06T12:00:00.000Z"));
    const details = alerts.flatMap((alert) => alert.details).join(" ");

    expect(details).toContain("°F");
    expect(details).toContain("mph");
    expect(details).toContain("in");
  });
});
