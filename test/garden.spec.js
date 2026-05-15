import { describe, expect, it } from "vitest";
import {
  GARDEN_ALERT_CATEGORIES,
  GARDEN_ALERT_LEVELS,
  DEFAULT_GARDEN_ALERT_SETTINGS,
  buildGeneratedGardenAlerts,
  buildGardenStatus,
  createDefaultGardenState,
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

  it("normalizes garden entity identity, text fields, tags, position, and simple GeoJSON", () => {
    const gardenState = normalizeGardenState({
      updatedAt: "not a date",
      entities: [
        {
          id: "  Vigne Nord!  ",
          type: "vine",
          name: "  Vigne nord  ",
          tags: "fruit, surveillance, fruit",
          notes: "  Taille courte  ",
          position: {
            label: "  Rang nord  ",
            latitude: "45.5",
            longitude: "-0.6",
            geometry: {
              type: "Point",
              coordinates: ["-0.6", "45.5"],
              properties: {
                ignored: true
              }
            }
          }
        }
      ]
    }, NOW);

    expect(gardenState.updatedAt).toBe(NOW.toISOString());
    expect(gardenState.entities[0]).toMatchObject({
      id: "vigne-nord",
      type: "vine",
      name: "Vigne nord",
      tags: ["fruit", "surveillance"],
      notes: "Taille courte",
      position: {
        label: "Rang nord",
        latitude: 45.5,
        longitude: -0.6,
        geometry: {
          type: "Point",
          coordinates: [-0.6, 45.5]
        }
      }
    });
  });

  it("keeps existing entities compatible while dropping invalid positions and geometries", () => {
    const gardenState = normalizeGardenState({
      entities: [
        {
          name: "Station locale",
          type: "unsupported",
          position: {
            latitude: 120,
            longitude: -250,
            geometry: {
              type: "GeometryCollection",
              coordinates: [[0, 0]]
            }
          }
        },
        {
          id: "potager",
          type: "vegetable_bed",
          position: {
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-0.6, 45.5],
                  [-0.5, 45.5],
                  [-0.5, 45.6],
                  [-0.6, 45.5]
                ]
              ]
            }
          }
        }
      ]
    }, NOW);

    expect(gardenState.entities[0]).toMatchObject({
      id: "station-locale",
      type: "other",
      position: null
    });
    expect(gardenState.entities[1].position.geometry).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [-0.6, 45.5],
          [-0.5, 45.5],
          [-0.5, 45.6],
          [-0.6, 45.5]
        ]
      ]
    });
  });

  it("keeps the default local Ecowitt station ready for Garden map placement", () => {
    const gardenState = createDefaultGardenState(NOW);
    const station = gardenState.entities.find((entity) => entity.id === "station-locale");

    expect(station).toMatchObject({
      id: "station-locale",
      type: "weather_station",
      name: "Station météo locale",
      tags: ["ecowitt", "meteo"],
      position: null
    });
    expect(station.sensors).toEqual([
      {
        id: "ecowitt-temperature-24h",
        source: "ecowitt",
        externalId: "station-locale",
        label: "Température locale 24 h",
        metric: "temperatureC",
        enabled: true,
        channel: "",
        path: "",
        seriesKey: "temperatureC.24h"
      },
      {
        id: "ecowitt-humidity-24h",
        source: "ecowitt",
        externalId: "station-locale",
        label: "Humidité locale 24 h",
        metric: "humidityPct",
        enabled: true,
        channel: "",
        path: "",
        seriesKey: "humidityPct.24h"
      },
      {
        id: "ecowitt-rain-24h",
        source: "ecowitt",
        externalId: "station-locale",
        label: "Pluie locale 24 h",
        metric: "dailyRainMm",
        enabled: true,
        channel: "",
        path: "",
        seriesKey: "rain.24h"
      }
    ]);
  });

  it("normalizes lightweight Ecowitt sensor references without storing measurements", () => {
    const gardenState = normalizeGardenState({
      entities: [
        {
          id: "potager",
          type: "vegetable_bed",
          sensors: [
            {
              source: "ecowitt",
              externalId: "soil-zone-1",
              label: "  Humidité sol potager  ",
              metric: "soilMoisturePct",
              enabled: "yes",
              channel: "WH51-1",
              path: "soil_ch1.soilmoisture",
              seriesKey: "soilMoisturePct.7d",
              value: 42,
              history: [{ value: 40 }]
            },
            {
              id: "leaf-wetness-vigne",
              source: "ecowitt",
              externalId: "leaf-zone-1",
              metric: "leafWetnessPct",
              enabled: false
            }
          ]
        }
      ]
    }, NOW);

    expect(gardenState.entities[0].sensors).toEqual([
      {
        id: "ecowitt-soil-zone-1-wh51-1-soilmoisturepct-soilmoisturepct-7d",
        source: "ecowitt",
        externalId: "soil-zone-1",
        label: "Humidité sol potager",
        metric: "soilMoisturePct",
        enabled: false,
        channel: "WH51-1",
        path: "soil_ch1.soilmoisture",
        seriesKey: "soilMoisturePct.7d"
      },
      {
        id: "leaf-wetness-vigne",
        source: "ecowitt",
        externalId: "leaf-zone-1",
        label: "",
        metric: "leafWetnessPct",
        enabled: false,
        channel: "",
        path: "",
        seriesKey: ""
      }
    ]);
    expect(gardenState.entities[0].sensors[0]).not.toHaveProperty("value");
    expect(gardenState.entities[0].sensors[0]).not.toHaveProperty("history");
  });

  it("keeps missing sensors compatible and drops invalid sensor references", () => {
    const gardenState = normalizeGardenState({
      entities: [
        {
          id: "vigne",
          type: "vine"
        },
        {
          id: "station-locale",
          type: "weather_station",
          sensors: [
            null,
            {
              source: "open-meteo",
              externalId: "forecast",
              metric: "temperatureC"
            },
            {
              source: "ecowitt",
              externalId: "AA:BB:CC:DD:EE:FF",
              metric: "temperatureC"
            },
            {
              source: "ecowitt",
              externalId: "station-locale",
              metric: ""
            },
            {
              id: "station-gust",
              source: "ecowitt",
              externalId: "station-locale",
              metric: "gustKmh",
              enabled: true
            }
          ]
        }
      ]
    }, NOW);

    expect(gardenState.entities[0].sensors).toEqual([]);
    expect(gardenState.entities[1].sensors).toEqual([
      {
        id: "station-gust",
        source: "ecowitt",
        externalId: "station-locale",
        label: "",
        metric: "gustKmh",
        enabled: true,
        channel: "",
        path: "",
        seriesKey: ""
      }
    ]);
  });
});
