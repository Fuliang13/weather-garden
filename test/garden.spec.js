import { describe, expect, it } from "vitest";
import {
  GARDEN_ALERT_CATEGORIES,
  GARDEN_ALERT_LEVELS,
  DEFAULT_GARDEN_ALERT_SETTINGS,
  buildGeneratedGardenAlerts,
  buildGardenStatus,
  normalizeGardenState
} from "../src/garden.js";

const NOW = new Date("2026-05-06T12:00:00.000Z");

describe("garden facade", () => {
  it("keeps alert constants available from src/garden.js", () => {
    expect(GARDEN_ALERT_CATEGORIES).toContain("frost");
    expect(GARDEN_ALERT_LEVELS).toEqual(["info", "watch", "risk", "urgent"]);
    expect(DEFAULT_GARDEN_ALERT_SETTINGS.frostWatchTempC).toBe(4);
  });

  it("keeps generated alert behavior stable after the alert split", () => {
    const gardenState = normalizeGardenState({
      entities: [
        {
          id: "north-vine",
          type: "vine",
          name: "Vigne nord"
        }
      ]
    }, NOW);

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
    }, DEFAULT_GARDEN_ALERT_SETTINGS, NOW);

    expect(alerts.map((alert) => alert.id)).toEqual([
      "north-vine-frost-risk",
      "north-vine-wind-risk"
    ]);
    expect(alerts[0]).toMatchObject({
      category: "frost",
      level: "risk",
      entityId: "north-vine",
      generated: true,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString()
    });
  });

  it("keeps stored and generated alerts deduplicated through buildGardenStatus", () => {
    const gardenState = normalizeGardenState({
      entities: [
        {
          id: "north-vine",
          type: "vine",
          name: "Vigne nord"
        }
      ],
      alerts: [
        {
          id: "north-vine-frost-risk",
          category: "frost",
          level: "watch",
          entityId: "north-vine",
          headline: "Stored duplicate"
        }
      ]
    }, NOW);

    const garden = buildGardenStatus(gardenState, {
      current: {
        temperatureC: 0.5
      },
      rain: {
        activeNow: false,
        horizons: []
      }
    }, DEFAULT_GARDEN_ALERT_SETTINGS, NOW);

    expect(garden.alerts.active.filter((alert) => alert.id === "north-vine-frost-risk")).toHaveLength(1);
    expect(garden.alerts.active[0]).toMatchObject({
      id: "north-vine-frost-risk",
      headline: "Risque de gel"
    });
  });
});
