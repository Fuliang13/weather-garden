import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMeteoFranceRadar } from "../src/sources/meteofrance.js";

const catalogPayload = {
  links: [{ href: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE" }]
};
const zonePayload = {
  links: [{ href: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations" }]
};
const observationsPayload = {
  links: [{ href: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU" }]
};
const metadataPayload = {
  validity_time: "2026-05-06T16:35:00Z",
  links: [{ href: "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=500&token=secret-product-token" }]
};

describe("Meteo-France ODIM HDF5 metadata", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T18:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses ODIM /where and /what group attributes to build the native raster layer", async () => {
    const hdf5Fixture = await buildOdimMetadataHdf5Fixture();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalogPayload))
      .mockResolvedValueOnce(jsonResponse(zonePayload))
      .mockResolvedValueOnce(jsonResponse(observationsPayload))
      .mockResolvedValueOnce(jsonResponse(metadataPayload))
      .mockResolvedValueOnce(binaryResponse(hdf5Fixture));

    const radar = await fetchMeteoFranceRadar({
      env: {
        METEOFRANCE_API_KEY: "api-key-token"
      }
    });

    expect(radar.nativeLayer).toMatchObject({
      ok: true,
      provider: "meteofrance-radar",
      bounds: [[48.1, -1.5], [48.9, -0.7]],
      width: 868,
      height: 868,
      sourceWidth: 3472,
      sourceHeight: 3472,
      attribution: "Météo-France"
    });
    expect(radar.diagnostics.hdf5).toMatchObject({
      canDecodeGrid: true,
      projection: {
        source: "/where",
        value: "+proj=stere +lat_0=90 +lon_0=0 +lat_ts=45 +ellps=WGS84"
      },
      quantity: "ACRR",
      scaleFactor: 0.01,
      offset: 0,
      missingValue: 65535,
      undetectValue: 65534,
      nativeLayerCriteria: {
        projectionFound: true,
        boundsFound: true,
        valuesDecoded: true,
        imageBuilt: true
      },
      nativeLayerBlocker: null,
      error: null
    });
    expect(radar.diagnostics.hdf5.groups.find((group) => group.path === "/where").attributes.length).toBeGreaterThan(0);
    expect(radar.diagnostics.hdf5.groups.find((group) => group.path === "/what").attributes.length).toBeGreaterThan(0);
    expect(JSON.stringify(radar)).not.toContain("api-key-token");
    expect(JSON.stringify(radar)).not.toContain("secret-product-token");
  });
});

async function buildOdimMetadataHdf5Fixture() {
  const bytes = new Uint8Array(12000);
  const view = new DataView(bytes.buffer);
  const rootHeaderAddress = 200;
  const rootBtreeAddress = 512;
  const heapAddress = 800;
  const heapDataAddress = 900;
  const dataHeaderAddress = 1024;
  const chunkBtreeAddress = 2048;
  const symbolTableNodeAddress = 2200;
  const whereHeaderAddress = 2600;
  const whereBtreeAddress = 3600;
  const whereHeapAddress = 3800;
  const whereHeapDataAddress = 3900;
  const whereSymbolTableNodeAddress = 4000;
  const whatHeaderAddress = 4300;
  const whatBtreeAddress = 5200;
  const whatHeapAddress = 5400;
  const whatHeapDataAddress = 5500;
  const whatSymbolTableNodeAddress = 5600;
  const chunkDataAddress = 6200;

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
  writeSymbolTableEntry(view, 56, { nameOffset: 0, objectHeaderAddress: rootHeaderAddress, cacheType: 1, btreeAddress: rootBtreeAddress, heapAddress });

  writeObjectHeader(bytes, view, rootHeaderAddress, [
    { type: 17, data: buildSymbolTableMessage(rootBtreeAddress, heapAddress) }
  ]);

  const heapData = buildHeapData(["", "data1", "where", "what"]);
  writeBytes(bytes, heapDataAddress, heapData.bytes);
  writeLocalHeap(bytes, view, heapAddress, heapData.bytes.length, heapDataAddress);
  writeRootBtreeLeaf(bytes, view, rootBtreeAddress, [{ symbolTableNodeAddress }]);
  writeSymbolTableNode(bytes, view, symbolTableNodeAddress, [
    { nameOffset: heapData.offsets.data1, objectHeaderAddress: dataHeaderAddress },
    { nameOffset: heapData.offsets.where, objectHeaderAddress: whereHeaderAddress },
    { nameOffset: heapData.offsets.what, objectHeaderAddress: whatHeaderAddress }
  ]);

  writeEmptyGroupHeader(bytes, view, whereHeaderAddress, {
    btreeAddress: whereBtreeAddress,
    heapAddress: whereHeapAddress,
    heapDataAddress: whereHeapDataAddress,
    symbolTableNodeAddress: whereSymbolTableNodeAddress,
    attributes: [
      stringAttribute("projdef", "+proj=stere +lat_0=90 +lon_0=0 +lat_ts=45 +ellps=WGS84"),
      float64Attribute("LL_lat", 48.1),
      float64Attribute("LL_lon", -1.5),
      float64Attribute("UL_lat", 48.9),
      float64Attribute("UL_lon", -1.5),
      float64Attribute("UR_lat", 48.9),
      float64Attribute("UR_lon", -0.7),
      float64Attribute("LR_lat", 48.1),
      float64Attribute("LR_lon", -0.7)
    ]
  });

  writeEmptyGroupHeader(bytes, view, whatHeaderAddress, {
    btreeAddress: whatBtreeAddress,
    heapAddress: whatHeapAddress,
    heapDataAddress: whatHeapDataAddress,
    symbolTableNodeAddress: whatSymbolTableNodeAddress,
    attributes: [
      stringAttribute("quantity", "ACRR"),
      float64Attribute("gain", 0.01),
      float64Attribute("offset", 0),
      float64Attribute("nodata", 65535),
      float64Attribute("undetect", 65534)
    ]
  });

  writeDatasetHeader(bytes, view, dataHeaderAddress, {
    dimensions: [3472, 3472],
    typeSize: 2,
    chunkDimensions: [512, 512],
    chunkBtreeAddress,
    attributes: [stringAttribute("units", "centiemes de mm")]
  });

  const rawChunk = new Uint8Array(512 * 512 * 2);
  const rawView = new DataView(rawChunk.buffer);

  for (let row = 240; row < 300; row++) {
    for (let column = 240; column < 300; column++) {
      rawView.setUint16((row * 512 + column) * 2, 250, true);
    }
  }

  const compressedChunk = await deflateBytes(rawChunk);
  writeChunkBtreeLeaf(bytes, view, chunkBtreeAddress, [{ byteLength: compressedChunk.length, filterMask: 0, offsets: [0, 0], address: chunkDataAddress }], 2);
  writeBytes(bytes, chunkDataAddress, compressedChunk);
  return bytes.slice(0, chunkDataAddress + compressedChunk.length);
}

function writeDatasetHeader(bytes, view, address, { dimensions, typeSize, chunkDimensions, chunkBtreeAddress, attributes }) {
  writeObjectHeader(bytes, view, address, [
    { type: 1, data: buildDataspaceMessage(dimensions) },
    { type: 3, data: buildFixedPointDatatypeMessage(typeSize) },
    { type: 8, data: buildChunkedLayoutMessage(chunkDimensions, typeSize, chunkBtreeAddress) },
    { type: 11, data: buildDeflateFilterMessage() },
    ...attributes.map((attribute) => ({ type: 12, data: attribute }))
  ]);
}

function writeEmptyGroupHeader(bytes, view, address, { btreeAddress, heapAddress, heapDataAddress, symbolTableNodeAddress, attributes }) {
  writeObjectHeader(bytes, view, address, [
    { type: 17, data: buildSymbolTableMessage(btreeAddress, heapAddress) },
    ...attributes.map((attribute) => ({ type: 12, data: attribute }))
  ]);

  const heapData = buildHeapData([""]);
  writeBytes(bytes, heapDataAddress, heapData.bytes);
  writeLocalHeap(bytes, view, heapAddress, heapData.bytes.length, heapDataAddress);
  writeRootBtreeLeaf(bytes, view, btreeAddress, [{ symbolTableNodeAddress }]);
  writeSymbolTableNode(bytes, view, symbolTableNodeAddress, []);
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

function buildChunkedLayoutMessage(chunkDimensions, elementSize, address) {
  const bytes = new Uint8Array(3 + 8 + chunkDimensions.length * 4 + 4);
  const view = new DataView(bytes.buffer);
  bytes[0] = 3;
  bytes[1] = 2;
  bytes[2] = chunkDimensions.length;
  writeU64(view, 3, address);
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
  const headerSize = messages.reduce((total, message) => total + 8 + align8(message.data.length), 0);
  bytes[address] = 1;
  writeU16(view, address + 2, messages.length);
  writeU32(view, address + 4, 1);
  writeU32(view, address + 8, headerSize);
  let cursor = address + 16;

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

function writeRootBtreeLeaf(bytes, view, address, entries) {
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

function writeChunkBtreeLeaf(bytes, view, address, entries, rank) {
  writeBytes(bytes, address, asciiBytes("TREE"));
  bytes[address + 4] = 1;
  bytes[address + 5] = 0;
  writeU16(view, address + 6, entries.length);
  writeU64(view, address + 8, undefinedAddress());
  writeU64(view, address + 16, undefinedAddress());
  let cursor = address + 24;

  entries.forEach((entry) => {
    writeU32(view, cursor, entry.byteLength);
    writeU32(view, cursor + 4, entry.filterMask);
    cursor += 8;

    for (let index = 0; index < rank; index++) {
      writeU64(view, cursor, entry.offsets[index] || 0);
      cursor += 8;
    }

    writeU64(view, cursor, entry.address);
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

async function deflateBytes(bytes) {
  const stream = new Response(bytes).body.pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
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
