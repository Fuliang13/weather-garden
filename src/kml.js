const KML_NAMESPACE = "http://www.opengis.net/kml/2.2";
const GX_NAMESPACE = "http://www.google.com/kml/ext/2.2";

export function importKml(kmlText, options = {}) {
  const report = {
    created: 0,
    ignored: 0,
    errors: [],
    warnings: []
  };

  let root;
  try {
    root = parseXml(kmlText);
  } catch (error) {
    report.errors.push(error.message);
    return { entities: [], report };
  }

  const documentNode = findFirst(root, "Document") || root;
  const styles = collectStyles(documentNode);
  const placemarks = [];
  collectPlacemarks(documentNode, [], placemarks);

  const entities = [];
  const seenIds = new Set();

  for (const placemark of placemarks) {
    const entity = placemarkToGardenEntity(placemark, styles, options, report);

    if (!entity) {
      report.ignored += 1;
      continue;
    }

    entity.id = uniqueId(entity.id, seenIds);
    entities.push(entity);
    report.created += 1;
  }

  return {
    documentName: childText(documentNode, "name"),
    entities,
    report
  };
}

export function exportGardenStateToKml(gardenState, options = {}) {
  const documentName = options.documentName || "Weather Garden";
  const entities = Array.isArray(gardenState?.entities) ? gardenState.entities : [];
  const placemarks = entities.map(gardenEntityToPlacemark).filter(Boolean).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<kml xmlns="${KML_NAMESPACE}" xmlns:gx="${GX_NAMESPACE}">`,
    "<Document>",
    `  <name>${escapeXml(documentName)}</name>`,
    placemarks,
    "</Document>",
    "</kml>"
  ].filter(Boolean).join("\n");
}

function placemarkToGardenEntity(placemark, styles, options, report) {
  const node = placemark.node;
  const name = childText(node, "name") || node.attrs.id || "KML Placemark";
  const geometry = readGeometry(node, report, name);

  if (!geometry) {
    report.warnings.push(`Ignored placemark without supported geometry: ${name}`);
    return null;
  }

  const styleUrl = childText(node, "styleUrl");
  const style = resolveStyle(styleUrl, styles);
  const folder = placemark.folders.at(-1) || "";
  const idPrefix = options.idPrefix ? `${options.idPrefix}-` : "";

  return {
    id: `${idPrefix}${slugify(node.attrs.id || name)}`,
    type: inferGardenType(name, folder, geometry.type),
    name,
    notes: childText(node, "description"),
    position: geometryToPosition(geometry, folder),
    tags: folder ? [folder] : [],
    metadata: {
      source: "kml",
      kml: compactObject({
        placemarkId: node.attrs.id || "",
        folder,
        styleUrl,
        style,
        geometryType: geometry.type,
        visibility: childText(node, "visibility"),
        extendedData: readExtendedData(node)
      })
    }
  };
}

function gardenEntityToPlacemark(entity) {
  const geometry = entity?.position?.geometry;
  if (!geometry || !["Point", "LineString", "Polygon"].includes(geometry.type)) {
    return "";
  }

  const description = entity.notes ? `    <description>${escapeXml(entity.notes)}</description>\n` : "";

  return [
    `  <Placemark id="${escapeXml(entity.id || slugify(entity.name || "entity"))}">`,
    `    <name>${escapeXml(entity.name || entity.id || "Garden entity")}</name>`,
    description.trimEnd(),
    writeGeometry(geometry),
    "  </Placemark>"
  ].filter(Boolean).join("\n");
}

function geometryToPosition(geometry, label) {
  if (geometry.type === "Point") {
    return {
      label,
      latitude: geometry.coordinates[1],
      longitude: geometry.coordinates[0],
      geometry
    };
  }

  return {
    label,
    latitude: null,
    longitude: null,
    geometry
  };
}

function readGeometry(node, report, placemarkName) {
  const point = firstChild(node, "Point");
  if (point) {
    const coordinate = parseCoordinateList(childText(point, "coordinates"))[0];
    return coordinate ? { type: "Point", coordinates: coordinate } : null;
  }

  const lineString = firstChild(node, "LineString");
  if (lineString) {
    const coordinates = parseCoordinateList(childText(lineString, "coordinates"));
    return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
  }

  const polygon = firstChild(node, "Polygon");
  if (polygon) {
    const rings = childrenByName(polygon, "outerBoundaryIs")
      .flatMap((boundary) => childrenByName(boundary, "LinearRing"))
      .map((ring) => closeRing(parseCoordinateList(childText(ring, "coordinates"))))
      .filter((ring) => ring.length >= 4);

    return rings.length ? { type: "Polygon", coordinates: rings } : null;
  }

  const multiGeometry = firstChild(node, "MultiGeometry");
  if (multiGeometry) {
    const firstSupported = multiGeometry.children.find((child) => ["Point", "LineString", "Polygon"].includes(child.localName));
    if (firstSupported) {
      report.warnings.push(`Placemark has MultiGeometry; imported first supported geometry only: ${placemarkName}`);
      return readGeometry({ ...node, children: [firstSupported] }, report, placemarkName);
    }
  }

  return null;
}

function writeGeometry(geometry) {
  if (geometry.type === "Point") {
    return `    <Point><coordinates>${writeCoordinate(geometry.coordinates)}</coordinates></Point>`;
  }

  if (geometry.type === "LineString") {
    return `    <LineString><coordinates>${geometry.coordinates.map(writeCoordinate).join(" ")}</coordinates></LineString>`;
  }

  const outerRing = Array.isArray(geometry.coordinates?.[0]) ? geometry.coordinates[0] : [];
  return [
    "    <Polygon>",
    "      <outerBoundaryIs>",
    "        <LinearRing>",
    `          <coordinates>${outerRing.map(writeCoordinate).join(" ")}</coordinates>`,
    "        </LinearRing>",
    "      </outerBoundaryIs>",
    "    </Polygon>"
  ].join("\n");
}

function collectPlacemarks(node, folders, placemarks) {
  const nextFolders = node.localName === "Folder"
    ? [...folders, childText(node, "name")].filter(Boolean)
    : folders;

  for (const child of node.children) {
    if (child.localName === "Placemark") {
      placemarks.push({ node: child, folders: nextFolders });
    } else if (["Document", "Folder"].includes(child.localName)) {
      collectPlacemarks(child, nextFolders, placemarks);
    }
  }
}

function collectStyles(documentNode) {
  const styles = new Map();
  const styleMaps = new Map();

  for (const node of walk(documentNode)) {
    if (node.localName === "Style") {
      const id = node.attrs.id || node.attrs["kml:id"] || node.parent?.attrs.id || node.parent?.attrs["kml:id"];
      if (id) {
        styles.set(`#${id}`, readStyle(node));
      }
    }

    if (node.localName === "StyleMap") {
      const id = node.attrs.id || node.attrs["kml:id"];
      const normalPair = childrenByName(node, "Pair").find((pair) => childText(pair, "key") === "normal");
      if (id && normalPair) {
        styleMaps.set(`#${id}`, childText(normalPair, "styleUrl"));
      }
    }
  }

  return { styles, styleMaps };
}

function resolveStyle(styleUrl, styles) {
  if (!styleUrl) {
    return {};
  }

  const resolvedUrl = styles.styleMaps.get(styleUrl) || styleUrl;
  return styles.styles.get(resolvedUrl) || {};
}

function readStyle(styleNode) {
  return compactObject({
    iconHref: safeIconHref(childText(firstChild(styleNode, "Icon"), "href")),
    lineColor: childText(firstChild(styleNode, "LineStyle"), "color"),
    lineWidth: childText(firstChild(styleNode, "LineStyle"), "width"),
    polyColor: childText(firstChild(styleNode, "PolyStyle"), "color")
  });
}

function safeIconHref(value) {
  if (!value || value.startsWith("data:")) {
    return "";
  }

  return value;
}

function readExtendedData(node) {
  const extendedData = firstChild(node, "ExtendedData");
  if (!extendedData) {
    return {};
  }

  const data = {};
  for (const item of childrenByName(extendedData, "Data")) {
    const name = item.attrs.name;
    const value = childText(item, "value");
    if (name && value) {
      data[name] = value;
    }
  }
  return data;
}

function parseCoordinateList(value) {
  return String(value || "").trim().split(/\s+/).map((item) => {
    const [longitude, latitude] = item.split(",").map(Number);
    return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;
  }).filter(Boolean);
}

function closeRing(ring) {
  if (!ring.length) {
    return [];
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

function writeCoordinate(coordinate) {
  return `${coordinate[0]},${coordinate[1]},0`;
}

function inferGardenType(name, folder, geometryType) {
  const text = `${name} ${folder}`.toLowerCase();

  if (text.includes("potager")) {
    return "vegetable_bed";
  }
  if (text.includes("vigne") || text.includes("vine")) {
    return "vine";
  }
  if (text.includes("cerisier") || text.includes("arbre") || text.includes("tree")) {
    return "tree";
  }
  if (geometryType === "Point" && (text.includes("station") || text.includes("météo") || text.includes("meteo"))) {
    return "weather_station";
  }
  if (geometryType === "Polygon" || geometryType === "LineString") {
    return "zone";
  }
  return "other";
}

function parseXml(xmlText) {
  const root = { localName: "root", name: "root", attrs: {}, children: [], text: "", parent: null };
  const stack = [root];
  const tokens = String(xmlText || "").match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?[^>]+>|[^<]+/g) || [];

  for (const token of tokens) {
    const parent = stack.at(-1);

    if (token.startsWith("<?") || token.startsWith("<!--")) {
      continue;
    }

    if (token.startsWith("<![CDATA[")) {
      parent.text += token.slice(9, -3);
      continue;
    }

    if (token.startsWith("</")) {
      const closingName = token.slice(2, -1).trim().split(/\s+/)[0];
      const current = stack.pop();
      if (!current || current.name !== closingName) {
        throw new Error(`Invalid KML XML: unexpected closing tag ${closingName}.`);
      }
      continue;
    }

    if (token.startsWith("<")) {
      const selfClosing = token.endsWith("/>");
      const content = token.slice(1, selfClosing ? -2 : -1).trim();
      const spaceIndex = content.search(/\s/);
      const name = spaceIndex === -1 ? content : content.slice(0, spaceIndex);
      const attrText = spaceIndex === -1 ? "" : content.slice(spaceIndex + 1);
      const node = {
        name,
        localName: localName(name),
        attrs: parseAttributes(attrText),
        children: [],
        text: "",
        parent
      };
      parent.children.push(node);
      if (!selfClosing) {
        stack.push(node);
      }
      continue;
    }

    parent.text += decodeXml(token);
  }

  if (stack.length !== 1) {
    throw new Error("Invalid KML XML: unclosed tag.");
  }

  return root.children.find((child) => child.localName === "kml") || root.children[0] || root;
}

function parseAttributes(value) {
  const attrs = {};
  const pattern = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;

  while ((match = pattern.exec(value))) {
    attrs[match[1]] = decodeXml(match[3] ?? match[4] ?? "");
  }

  return attrs;
}

function firstChild(node, name) {
  return node?.children?.find((child) => child.localName === name) || null;
}

function childrenByName(node, name) {
  return node?.children?.filter((child) => child.localName === name) || [];
}

function childText(node, name) {
  const child = firstChild(node, name);
  return textContent(child).trim();
}

function textContent(node) {
  if (!node) {
    return "";
  }

  return decodeXml([node.text, ...node.children.map(textContent)].join(""));
}

function findFirst(node, name) {
  for (const item of walk(node)) {
    if (item.localName === name) {
      return item;
    }
  }
  return null;
}

function* walk(node) {
  yield node;
  for (const child of node.children || []) {
    yield* walk(child);
  }
}

function localName(name) {
  return name.includes(":") ? name.split(":").pop() : name;
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugify(value) {
  return String(value || "kml-entity")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "kml-entity";
}

function uniqueId(id, seenIds) {
  let candidate = id || "kml-entity";
  let index = 2;
  while (seenIds.has(candidate)) {
    candidate = `${id}-${index}`;
    index += 1;
  }
  seenIds.add(candidate);
  return candidate;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (item === null || item === undefined || item === "") {
      return false;
    }
    return !(typeof item === "object" && !Array.isArray(item) && !Object.keys(item).length);
  }));
}
