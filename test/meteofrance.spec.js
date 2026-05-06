import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debugMeteoFranceHdf5, debugMeteoFranceRadar, fetchMeteoFranceRadar } from "../src/sources/meteofrance.js";

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
      href: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=500&token=secret-product-token"
    },
    {
      href: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=1000"
    }
  ]
};

const metadataWithoutHdf5Payload = {
  validity_time: "2026-05-06T16:35:00Z",
  links: [
    {
      href: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=1000"
    }
  ]
};

const radarHdf5ProductUrl = "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=500";
const radarBufrProductUrl = "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=1000";
const hdf5Signature = new Uint8Array([0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

describe("Meteo-France radar source", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T18:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a non-blocking disabled source when no Meteo-France secret is configured", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const radar = await fetchMeteoFranceRadar({ env: {} });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(radar).toMatchObject({
      ok: false,
      enabled: false,
      source: "meteofrance-radar",
      fetchedAt: "2026-05-06T18:00:00.000Z",
      message: "METEOFRANCE_API_KEY or METEOFRANCE_APPLICATION_ID is not configured yet.",
      diagnostics: {
        configured: false,
        authMode: null,
        requiredSecrets: ["METEOFRANCE_API_KEY", "METEOFRANCE_APPLICATION_ID"]
      }
    });
  });

  it("uses the API key directly and makes the 500 m HDF5 product primary", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalogPayload))
      .mockResolvedValueOnce(jsonResponse(zonePayload))
      .mockResolvedValueOnce(jsonResponse(observationsPayload))
      .mockResolvedValueOnce(jsonResponse(metadataPayload))
      .mockResolvedValueOnce(binaryResponse(hdf5Signature));

    const radar = await fetchMeteoFranceRadar({
      env: {
        METEOFRANCE_API_KEY: "api-key-token",
        METEOFRANCE_APPLICATION_ID: "application-id"
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.some(([url]) => url === "https://portail-api.meteofrance.fr/token")).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toBe("https://public-api.meteofrance.fr/public/DPRadar/v1/mosaiques");
    expect(fetchMock.mock.calls[0][1].headers.apikey).toBe("api-key-token");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBeUndefined();
    expect(fetchMock.mock.calls[3][0]).toBe("https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU");
    expect(fetchMock.mock.calls[3][1].headers.apikey).toBe("api-key-token");
    expect(fetchMock.mock.calls[3][1].headers.authorization).toBeUndefined();
    expect(fetchMock.mock.calls[4][0]).toContain("maille=500");
    expect(fetchMock.mock.calls[4][1].headers.apikey).toBe("api-key-token");
    expect(fetchMock.mock.calls[4][1].headers.authorization).toBeUndefined();
    expect(radar).toMatchObject({
      ok: true,
      enabled: true,
      source: "meteofrance-radar",
      validityTime: "2026-05-06T16:35:00.000Z",
      observation: "LAME_D_EAU",
      zone: "METROPOLE",
      mesh: 500,
      productUrl: radarHdf5ProductUrl,
      fallbackProductUrl: radarBufrProductUrl,
      format: "hdf5",
      frameLimit: 24,
      frames: [],
      score: null,
      precipitationMm: null,
      probability: null,
      diagnostics: {
        configured: true,
        authMode: "api-key",
        product500Found: true,
        product1000Found: true,
        selectedMesh: 500,
        selectedFormat: "hdf5",
        hdf5: {
          downloadOk: true,
          signatureOk: true,
          parsingOk: false,
          parser: "not-implemented"
        },
        nativeLayerAvailable: false
      }
    });
    expect(radar.message).toContain("HDF5 500 m product is available");
    expect(JSON.stringify(radar)).not.toContain("api-key-token");
    expect(JSON.stringify(radar)).not.toContain("application-id");
    expect(JSON.stringify(radar)).not.toContain("secret-product-token");
  });

  it("gets an OAuth2 token and follows DPRadar links to the 500 m HDF5 product", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token-1" }))
      .mockResolvedValueOnce(jsonResponse(catalogPayload))
      .mockResolvedValueOnce(jsonResponse(zonePayload))
      .mockResolvedValueOnce(jsonResponse(observationsPayload))
      .mockResolvedValueOnce(jsonResponse(metadataPayload))
      .mockResolvedValueOnce(binaryResponse(hdf5Signature));

    const radar = await fetchMeteoFranceRadar({
      env: {
        METEOFRANCE_APPLICATION_ID: "application-id",
        METNO_USER_AGENT: "weather-garden/0.1 contact@example.com"
      }
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://portail-api.meteofrance.fr/token", {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: "Basic application-id",
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "weather-garden/0.1 contact@example.com"
      },
      body: "grant_type=client_credentials"
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://public-api.meteofrance.fr/public/DPRadar/v1/mosaiques");
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer access-token-1");
    expect(fetchMock.mock.calls[4][0]).toBe("https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU");
    expect(fetchMock.mock.calls[5][0]).toContain("maille=500");
    expect(fetchMock.mock.calls[5][1].headers.authorization).toBe("Bearer access-token-1");
    expect(radar).toMatchObject({
      ok: true,
      enabled: true,
      source: "meteofrance-radar",
      validityTime: "2026-05-06T16:35:00.000Z",
      observation: "LAME_D_EAU",
      zone: "METROPOLE",
      mesh: 500,
      productUrl: radarHdf5ProductUrl,
      fallbackProductUrl: radarBufrProductUrl,
      format: "hdf5",
      diagnostics: {
        configured: true,
        authMode: "oauth2",
        product500Found: true,
        selectedMesh: 500,
        hdf5: {
          signatureOk: true
        }
      }
    });
    expect(JSON.stringify(radar)).not.toContain("application-id");
    expect(JSON.stringify(radar)).not.toContain("access-token-1");
    expect(JSON.stringify(radar)).not.toContain("secret-product-token");
  });

  it("refreshes the OAuth2 token once when Meteo-France returns an invalid JWT", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "expired-token" }))
      .mockResolvedValueOnce(new Response("Invalid JWT token", { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse(catalogPayload))
      .mockResolvedValueOnce(jsonResponse(zonePayload))
      .mockResolvedValueOnce(jsonResponse(observationsPayload))
      .mockResolvedValueOnce(jsonResponse(metadataPayload))
      .mockResolvedValueOnce(binaryResponse(hdf5Signature));

    const radar = await fetchMeteoFranceRadar({
      env: {
        METEOFRANCE_APPLICATION_ID: "application-id"
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer expired-token");
    expect(fetchMock.mock.calls[3][1].headers.authorization).toBe("Bearer fresh-token");
    expect(fetchMock.mock.calls[7][1].headers.authorization).toBe("Bearer fresh-token");
    expect(radar.ok).toBe(true);
    expect(radar.mesh).toBe(500);
    expect(JSON.stringify(radar)).not.toContain("application-id");
    expect(JSON.stringify(radar)).not.toContain("fresh-token");
  });

  it("keeps the 1000 m BUFR product as fallback when the 500 m HDF5 product is absent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalogPayload))
      .mockResolvedValueOnce(jsonResponse(zonePayload))
      .mockResolvedValueOnce(jsonResponse(observationsPayload))
      .mockResolvedValueOnce(jsonResponse(metadataWithoutHdf5Payload));

    const radar = await fetchMeteoFranceRadar({
      env: {
        METEOFRANCE_API_KEY: "api-key-token"
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(radar).toMatchObject({
      ok: true,
      mesh: 1000,
      format: "gzip-bufr",
      productUrl: null,
      fallbackProductUrl: radarBufrProductUrl,
      diagnostics: {
        product500Found: false,
        product1000Found: true,
        selectedMesh: 1000,
        selectedFormat: "gzip-bufr",
        nativeLayerAvailable: false,
        fallbackReason: "Only the 1 km BUFR fallback product is available; BUFR parsing is out of scope."
      }
    });
    expect(radar.message).toContain("only the 1 km BUFR fallback product is available");
  });

  it("reports invalid HDF5 product downloads without inventing native radar data", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalogPayload))
      .mockResolvedValueOnce(jsonResponse(zonePayload))
      .mockResolvedValueOnce(jsonResponse(observationsPayload))
      .mockResolvedValueOnce(jsonResponse(metadataPayload))
      .mockResolvedValueOnce(new Response("<html><head><title>Request Rejected</title></head></html>", {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8"
        }
      }));

    const radar = await fetchMeteoFranceRadar({
      env: {
        METEOFRANCE_API_KEY: "api-key-token"
      }
    });

    expect(radar).toMatchObject({
      ok: true,
      mesh: 500,
      format: "hdf5",
      nativeLayer: {
        ok: false
      },
      frames: [],
      diagnostics: {
        hdf5: {
          downloadOk: true,
          contentType: "text/html; charset=utf-8",
          signatureOk: false,
          parsingOk: false
        },
        nativeLayerAvailable: false
      }
    });
    expect(radar.diagnostics.fallbackReason).toContain("valid HDF5 signature");
    expect(JSON.stringify(radar)).not.toContain("api-key-token");
    expect(JSON.stringify(radar)).not.toContain("secret-product-token");
  });

  it("reports API key catalog diagnostics without following suspended child endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalogPayload));

    const debug = await debugMeteoFranceRadar({
      env: {
        METEOFRANCE_API_KEY: "api-key-token"
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://public-api.meteofrance.fr/public/DPRadar/v1/mosaiques");
    expect(fetchMock.mock.calls[0][1].headers.apikey).toBe("api-key-token");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBeUndefined();
    expect(debug).toMatchObject({
      ok: true,
      enabled: true,
      source: "meteofrance-radar",
      message: "Météo-France API key and radar catalog OK.",
      diagnostics: {
        configured: true,
        authMode: "api-key",
        tokenOk: null,
        catalogOk: true,
        catalogEndpoint: "https://public-api.meteofrance.fr/public/DPRadar/v1/mosaiques"
      }
    });
    expect(debug.diagnostics).not.toHaveProperty("hdf5");
    expect(debug.diagnostics).not.toHaveProperty("product500Found");
    expect(JSON.stringify(debug)).not.toContain("api-key-token");
  });

  it("reports focused HDF5 debug diagnostics without exposing secrets", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalogPayload))
      .mockResolvedValueOnce(jsonResponse(zonePayload))
      .mockResolvedValueOnce(jsonResponse(observationsPayload))
      .mockResolvedValueOnce(jsonResponse(metadataPayload))
      .mockResolvedValueOnce(binaryResponse(hdf5Signature));

    const debug = await debugMeteoFranceHdf5({
      env: {
        METEOFRANCE_API_KEY: "api-key-token"
      }
    });

    expect(debug).toMatchObject({
      ok: true,
      enabled: true,
      source: "meteofrance-radar-hdf5",
      diagnostics: {
        configured: true,
        authMode: "api-key",
        product500Found: true,
        product1000Found: true,
        productUrl: radarHdf5ProductUrl,
        fallbackProductUrl: radarBufrProductUrl,
        hdf5: {
          downloadOk: true,
          signatureOk: true,
          parsingOk: false,
          datasets: [],
          dimensions: null,
          projection: null,
          bounds: null
        },
        nativeLayerAvailable: false,
        frameLimit: 24,
        frameCount: 0
      }
    });
    expect(JSON.stringify(debug)).not.toContain("api-key-token");
    expect(JSON.stringify(debug)).not.toContain("secret-product-token");
  });

  it("reports token rejections through the safe debug endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("<html><head><title>Request Rejected</title></head></html>", {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8"
        }
      }));

    const debug = await debugMeteoFranceRadar({
      env: {
        METEOFRANCE_APPLICATION_ID: "application-id",
        METNO_USER_AGENT: "Météo Garden/0.1 contact@example.com"
      }
    });

    expect(debug).toMatchObject({
      ok: false,
      enabled: true,
      source: "meteofrance-radar",
      diagnostics: {
        configured: true,
        authMode: "oauth2",
        tokenOk: false,
        catalogOk: false,
        userAgentSent: true
      }
    });
    expect(debug.message).toContain("instead of JSON");
    expect(fetchMock.mock.calls[0][1].headers["user-agent"]).toBe("Meteo Garden/0.1 contact@example.com");
    expect(JSON.stringify(debug)).not.toContain("application-id");
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

function binaryResponse(value, init = {}) {
  return new Response(value, {
    status: 200,
    headers: {
      "content-type": "application/x-hdf5",
      "content-length": String(value.byteLength)
    },
    ...init
  });
}
