import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMeteoFranceRadar } from "../src/sources/meteofrance.js";

const catalogPayload = {
  links: [
    {
      href: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE"
    }
  ]
};

const zonePayload = {
  links: [
    {
      href: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations"
    }
  ]
};

const observationsPayload = {
  links: [
    {
      href: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU"
    }
  ]
};

const metadataPayload = {
  validity_time: "2026-05-06T16:35:00Z",
  links: [
    {
      href: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=500"
    },
    {
      href: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=1000"
    }
  ]
};

describe("Meteo-France radar source", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T18:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a non-blocking disabled source when the OAuth application id is missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const radar = await fetchMeteoFranceRadar({ env: {} });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(radar).toMatchObject({
      ok: false,
      enabled: false,
      source: "meteofrance-radar",
      fetchedAt: "2026-05-06T18:00:00.000Z",
      message: "METEOFRANCE_APPLICATION_ID is not configured yet.",
      diagnostics: {
        configured: false,
        requiredSecrets: ["METEOFRANCE_APPLICATION_ID"]
      }
    });
  });

  it("gets an OAuth2 token and follows DPRadar links to the 1000 m product", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token-1" }))
      .mockResolvedValueOnce(jsonResponse(catalogPayload))
      .mockResolvedValueOnce(jsonResponse(zonePayload))
      .mockResolvedValueOnce(jsonResponse(observationsPayload))
      .mockResolvedValueOnce(jsonResponse(metadataPayload));

    const radar = await fetchMeteoFranceRadar({
      env: {
        METEOFRANCE_APPLICATION_ID: "application-id"
      }
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://portail-api.meteofrance.fr/token", {
      method: "POST",
      headers: {
        authorization: "Basic application-id",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://public-api.meteofrance.fr/public/DPRadar/v1/mosaiques");
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer access-token-1");
    expect(fetchMock.mock.calls[4][0]).toBe("https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU");
    expect(fetchMock.mock.calls[4][1].headers.authorization).toBe("Bearer access-token-1");
    expect(radar).toMatchObject({
      ok: true,
      enabled: true,
      source: "meteofrance-radar",
      validityTime: "2026-05-06T16:35:00.000Z",
      observation: "LAME_D_EAU",
      zone: "METROPOLE",
      mesh: 1000,
      productUrl: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=1000",
      format: "gzip-bufr",
      score: null,
      precipitationMm: null,
      probability: null
    });
    expect(JSON.stringify(radar)).not.toContain("application-id");
    expect(JSON.stringify(radar)).not.toContain("access-token-1");
  });

  it("refreshes the OAuth2 token once when Meteo-France returns an invalid JWT", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "expired-token" }))
      .mockResolvedValueOnce(new Response("Invalid JWT token", { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse(catalogPayload))
      .mockResolvedValueOnce(jsonResponse(zonePayload))
      .mockResolvedValueOnce(jsonResponse(observationsPayload))
      .mockResolvedValueOnce(jsonResponse(metadataPayload));

    const radar = await fetchMeteoFranceRadar({
      env: {
        METEOFRANCE_APPLICATION_ID: "application-id"
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer expired-token");
    expect(fetchMock.mock.calls[3][1].headers.authorization).toBe("Bearer fresh-token");
    expect(fetchMock.mock.calls[6][1].headers.authorization).toBe("Bearer fresh-token");
    expect(radar.ok).toBe(true);
    expect(JSON.stringify(radar)).not.toContain("application-id");
    expect(JSON.stringify(radar)).not.toContain("fresh-token");
  });

  it("reports non-JSON radar responses clearly", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token-1" }))
      .mockResolvedValueOnce(new Response("<html><head><title>Portal</title></head></html>", {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8"
        }
      }));

    await expect(fetchMeteoFranceRadar({
      env: {
        METEOFRANCE_APPLICATION_ID: "application-id"
      }
    })).rejects.toThrow("instead of JSON");
  });
});

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    ...init
  });
}
