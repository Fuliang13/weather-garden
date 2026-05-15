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
const hdf5Fixture = buildMinimalHdf5Fixture();

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
      .mockResolvedValueOnce(binaryResponse(hdf5Fixture));

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
          parsingOk: true,
          parser: "worker-safe-hdf5-structure-parser-v1",
          canDecodeGrid: false,
          expectedDimensions: {
            width: 3472,
            height: 3472
          },
          dimensions: [3472, 3472],
          unit: "centiemes de mm",
          scaleFactor: 0.01,
          missingValue: 65535,
          nativeLayerCriteria: {
            signatureOk: true,
            structureParsed: true,
            radarDatasetIdentified: true,
            dimensionsKnown: true,
            expectedDimensionsMatch: true,
            projectionFound: true,
            boundsFound: true,
            valuesReadable: false,
            valuesDecoded: false,
            imageBuilt: false
          }
        },
        nativeLayerAvailable: false
      }
    });
    expect(radar.message).toContain("HDF5 500 m product is available");
    expect(radar.diagnostics.hdf5.datasets.map((dataset) => dataset.name)).toEqual(["data1", "quality1"]);
    expect(radar.diagnostics.hdf5.radarDataset.name).toBe("data1");
    expect(radar.diagnostics.hdf5.quality.name).toBe("quality1");
    expect(radar.diagnostics.hdf5.projection).toMatchObject({ value: "EPSG:2154" });
    expect(radar.diagnostics.hdf5.bounds).toEqual([[48.1, -1.5], [48.9, -0.7]]);
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
      .mockResolvedValueOnce(binaryResponse(hdf5Fixture));

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
      .mockResolvedValueOnce(binaryResponse(hdf5Fixture));

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

  it("sanitizes failed HDF5 download diagnostics before returning public payloads", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalogPayload))
      .mockResolvedValueOnce(jsonResponse(zonePayload))
      .mockResolvedValueOnce(jsonResponse(observationsPayload))
      .mockResolvedValueOnce(jsonResponse(metadataPayload))
      .mockResolvedValueOnce(new Response("Forbidden https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=500&token=secret-product-token", {
        status: 403,
        headers: {
          "content-type": "text/plain"
        }
      }));

    const radar = await fetchMeteoFranceRadar({
      env: {
        METEOFRANCE_API_KEY: "api-key-token"
      }
    });

    const serialized = JSON.stringify(radar);

    expect(radar.diagnostics.hdf5.downloadOk).toBe(false);
    expect(radar.diagnostics.hdf5.error).toContain("maille=500");
    expect(serialized).not.toContain("api-key-token");
    expect(serialized).not.toContain("secret-product-token");
    expect(serialized).not.toContain("token=secret");
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
      .mockResolvedValueOnce(binaryResponse(hdf5Fixture));

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
          parsingOk: true,
          dimensions: [3472, 3472],
          projection: {
            source: "/data1",
            value: "EPSG:2154"
          },
          bounds: [[48.1, -1.5], [48.9, -0.7]],
          expectedDimensions: {
            width: 3472,
            height: 3472
          },
          canDecodeGrid: false,
          nativeLayerCriteria: {
            radarDatasetIdentified: true,
            expectedDimensionsMatch: true,
            projectionFound: true,
            boundsFound: true,
            valuesReadable: false,
            valuesDecoded: false,
            imageBuilt: false
          }
        },
        nativeLayerAvailable: false,
        frameLimit: 24,
        nativeFrameCount: 0,
        storedFrameCount: 0,
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


function buildMinimalHdf5Fixture() {
  const bytes = new Uint8Array(8192);
  const view = new DataView(bytes.buffer);
  const rootHeaderAddress = 200;
  const btreeAddress = 512;
  const heapAddress = 800;
  const heapDataAddress = 900;
  const dataHeaderAddress = 1024;
  const symbolTableNodeAddress = 2200;
  const qualityHeaderAddress = 3000;

  writeBytes(bytes, 0, [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes[8] = 0;
  bytes[13] = 8;
  bytes[14] = 8;
  writeU16(view, 16, 4);
  writeU16(view, 18, 16);
  writeU64(view, 24, 0);
  writeU64(view, 32, undefinedAddress());
  writeU64(view, 40, bytes.byteLength);
  writeU64(view, 48, undefinedAddress());
  writeSymbolTableEntry(view, 56, { nameOffset: 0, objectHeaderAddress: rootHeaderAddress, cacheType: 1, btreeAddress, heapAddress });

  writeObjectHeader(bytes, view, rootHeaderAddress, [
    { type: 17, data: buildSymbolTableMessage(btreeAddress, heapAddress) }
  ]);

  const heapData = buildHeapData(["", "data1", "quality1"]);
  writeBytes(bytes, heapDataAddress, heapData.bytes);
  writeLocalHeap(bytes, view, heapAddress, heapData.bytes.length, heapDataAddress);

  writeBtreeLeaf(bytes, view, btreeAddress, [
    { symbolTableNodeAddress }
  ]);
  writeSymbolTableNode(bytes, view, symbolTableNodeAddress, [
    { nameOffset: heapData.offsets.data1, objectHeaderAddress: dataHeaderAddress },
    { nameOffset: heapData.offsets.quality1, objectHeaderAddress: qualityHeaderAddress }
  ]);

  writeDatasetHeader(bytes, view, dataHeaderAddress, {
    dimensions: [3472, 3472],
    typeSize: 2,
    chunkDimensions: [512, 512],
    attributes: [
      stringAttribute("units", "centiemes de mm"),
      float64Attribute("scale_factor", 0.01),
      uint32Attribute("missing_value", 65535),
      stringAttribute("projection", "EPSG:2154"),
      float64Attribute("geospatial_lat_min", 48.1),
      float64Attribute("geospatial_lat_max", 48.9),
      float64Attribute("geospatial_lon_min", -1.5),
      float64Attribute("geospatial_lon_max", -0.7)
    ]
  });

  writeDatasetHeader(bytes, view, qualityHeaderAddress, {
    dimensions: [3472, 3472],
    typeSize: 1,
    chunkDimensions: [512, 512],
    attributes: [
      stringAttribute("units", "percent")
    ]
  });

  return bytes;
}

function writeDatasetHeader(bytes, view, address, { dimensions, typeSize, chunkDimensions, attributes }) {
  writeObjectHeader(bytes, view, address, [
    { type: 1, data: buildDataspaceMessage(dimensions) },
    { type: 3, data: buildFixedPointDatatypeMessage(typeSize) },
    { type: 8, data: buildChunkedLayoutMessage(chunkDimensions, typeSize) },
    { type: 11, data: buildDeflateFilterMessage() },
    ...attributes.map((attribute) => ({ type: 12, data: attribute }))
  ]);
}

function buildDataspaceMessage(dimensions) {
  const bytes = new Uint8Array(8 + dimensions.length * 8);
  const view = new DataView(bytes.buffer);
  bytes[0] = 1;
  bytes[1] = dimensions.length;
  dimensions.forEach((dimension, index) => writeU64(view, 8 + index * 8, dimension));
  return bytes;
}

function buildFixedPointDatatypeMessage(size) {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0;
  writeU32(view, 4, size);
  return bytes;
}

function buildFloat64DatatypeMessage() {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  bytes[0] = 1;
  writeU32(view, 4, 8);
  return bytes;
}

function buildStringDatatypeMessage(size) {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  bytes[0] = 3;
  writeU32(view, 4, size);
  return bytes;
}

function buildScalarDataspaceMessage() {
  const bytes = new Uint8Array(8);
  bytes[0] = 1;
  bytes[1] = 0;
  return bytes;
}

function buildChunkedLayoutMessage(chunkDimensions, elementSize) {
  const bytes = new Uint8Array(3 + 8 + chunkDimensions.length * 4 + 4);
  const view = new DataView(bytes.buffer);
  bytes[0] = 3;
  bytes[1] = 2;
  bytes[2] = chunkDimensions.length;
  writeU64(view, 3, 2048);
  chunkDimensions.forEach((dimension, index) => writeU32(view, 11 + index * 4, dimension));
  writeU32(view, 11 + chunkDimensions.length * 4, elementSize);
  return bytes;
}

function buildDeflateFilterMessage() {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);
  bytes[0] = 1;
  bytes[1] = 1;
  writeU16(view, 8, 1);
  writeU16(view, 14, 1);
  writeU32(view, 16, 6);
  return bytes;
}

function stringAttribute(name, value) {
  return buildAttributeMessage(name, buildStringDatatypeMessage(value.length), buildScalarDataspaceMessage(), asciiBytes(value));
}

function float64Attribute(name, value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, true);
  return buildAttributeMessage(name, buildFloat64DatatypeMessage(), buildScalarDataspaceMessage(), bytes);
}

function uint32Attribute(name, value) {
  const bytes = new Uint8Array(4);
  writeU32(new DataView(bytes.buffer), 0, value);
  return buildAttributeMessage(name, buildFixedPointDatatypeMessage(4), buildScalarDataspaceMessage(), bytes);
}

function buildAttributeMessage(name, datatype, dataspace, value) {
  const nameBytes = new Uint8Array([...asciiBytes(name), 0]);
  const size = 8 + align8(nameBytes.length) + align8(datatype.length) + align8(dataspace.length) + value.length;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes[0] = 1;
  writeU16(view, 2, nameBytes.length);
  writeU16(view, 4, datatype.length);
  writeU16(view, 6, dataspace.length);
  let cursor = 8;
  writeBytes(bytes, cursor, nameBytes);
  cursor = align8(cursor + nameBytes.length);
  writeBytes(bytes, cursor, datatype);
  cursor = align8(cursor + datatype.length);
  writeBytes(bytes, cursor, dataspace);
  cursor = align8(cursor + dataspace.length);
  writeBytes(bytes, cursor, value);
  return bytes;
}

function buildSymbolTableMessage(btreeAddress, heapAddress) {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  writeU64(view, 0, btreeAddress);
  writeU64(view, 8, heapAddress);
  return bytes;
}

function writeObjectHeader(bytes, view, address, messages) {
  let headerSize = 0;
  messages.forEach((message) => {
    headerSize += 8 + align8(message.data.length);
  });

  bytes[address] = 1;
  writeU16(view, address + 2, messages.length);
  writeU32(view, address + 4, 1);
  writeU32(view, address + 8, headerSize);
  let cursor = address + 12;

  messages.forEach((message) => {
    writeU16(view, cursor, message.type);
    writeU16(view, cursor + 2, message.data.length);
    writeBytes(bytes, cursor + 8, message.data);
    cursor = align8(cursor + 8 + message.data.length);
  });
}

function writeLocalHeap(bytes, view, address, dataSegmentSize, dataSegmentAddress) {
  writeBytes(bytes, address, asciiBytes("HEAP"));
  bytes[address + 4] = 0;
  writeU64(view, address + 8, dataSegmentSize);
  writeU64(view, address + 16, undefinedAddress());
  writeU64(view, address + 24, dataSegmentAddress);
}

function writeBtreeLeaf(bytes, view, address, entries) {
  writeBytes(bytes, address, asciiBytes("TREE"));
  bytes[address + 4] = 0;
  bytes[address + 5] = 0;
  writeU16(view, address + 6, entries.length);
  writeU64(view, address + 8, undefinedAddress());
  writeU64(view, address + 16, undefinedAddress());
  let cursor = address + 24;

  entries.forEach((entry) => {
    writeU64(view, cursor, 0);
    cursor += 8;
    writeU64(view, cursor, entry.symbolTableNodeAddress);
    cursor += 8;
  });
}

function writeSymbolTableNode(bytes, view, address, entries) {
  writeBytes(bytes, address, asciiBytes("SNOD"));
  bytes[address + 4] = 1;
  writeU16(view, address + 6, entries.length);
  let cursor = address + 8;

  entries.forEach((entry) => {
    writeSymbolTableEntry(view, cursor, { nameOffset: entry.nameOffset, objectHeaderAddress: entry.objectHeaderAddress, cacheType: 0 });
    cursor += 40;
  });
}

function writeSymbolTableEntry(view, offset, { nameOffset, objectHeaderAddress, cacheType, btreeAddress = 0, heapAddress = 0 }) {
  writeU64(view, offset, nameOffset);
  writeU64(view, offset + 8, objectHeaderAddress);
  writeU32(view, offset + 16, cacheType);

  if (cacheType === 1) {
    writeU64(view, offset + 24, btreeAddress);
    writeU64(view, offset + 32, heapAddress);
  }
}

function buildHeapData(names) {
  const chunks = [];
  const offsets = {};
  let cursor = 0;

  names.forEach((name) => {
    offsets[name] = cursor;
    const chunk = new Uint8Array([...asciiBytes(name), 0]);
    chunks.push(chunk);
    cursor += chunk.length;
  });

  const bytes = new Uint8Array(cursor);
  let offset = 0;
  chunks.forEach((chunk) => {
    writeBytes(bytes, offset, chunk);
    offset += chunk.length;
  });

  return { bytes, offsets };
}

function asciiBytes(value) {
  return Uint8Array.from(String(value).split("").map((char) => char.charCodeAt(0)));
}

function writeBytes(bytes, offset, values) {
  bytes.set(values, offset);
}

function writeU16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeU32(view, offset, value) {
  view.setUint32(offset, value, true);
}

function writeU64(view, offset, value) {
  const normalized = value === undefinedAddress() ? value : BigInt(value);
  view.setBigUint64(offset, normalized, true);
}

function undefinedAddress() {
  return 0xffffffffffffffffn;
}

function align8(value) {
  return Math.ceil(value / 8) * 8;
}

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
