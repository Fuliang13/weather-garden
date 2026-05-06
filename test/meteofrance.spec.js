import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMeteoFranceRadar } from "../src/sources/meteofrance.js";

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

describe("Météo-France radar source", () => {
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

  it("gets an OAuth2 token and returns LAME_D_EAU metadata with the 1000 m product link", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token-1" }))
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
    expect(fetchMock.mock.calls[1][0]).toBe("https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU");
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer access-token-1");
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

  it("refreshes the OAuth2 token once when Météo-France returns an invalid JWT", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "expired-token" }))
      .mockResolvedValueOnce(new Response("Invalid JWT token", { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse(metadataPayload));

    const radar = await fetchMeteoFranceRadar({
      env: {
        METEOFRANCE_APPLICATION_ID: "application-id"
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer expired-token");
    expect(fetchMock.mock.calls[3][1].headers.authorization).toBe("Bearer fresh-token");
    expect(radar.ok).toBe(true);
    expect(JSON.stringify(radar)).not.toContain("application-id");
    expect(JSON.stringify(radar)).not.toContain("fresh-token");
  });
});

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}
