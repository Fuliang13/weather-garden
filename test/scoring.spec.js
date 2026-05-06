import { describe, expect, it } from "vitest";
import { DEFAULT_LOCATION, DEFAULT_SETTINGS, buildWeatherStatus } from "../src/scoring.js";
import { buildGardenStatus, normalizeGardenState } from "../src/garden.js";

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
});
