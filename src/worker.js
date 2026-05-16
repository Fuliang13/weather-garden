import { fetchOpenMeteoArome } from "./sources/openMeteo.js";
import { fetchMetNorway } from "./sources/metNorway.js";
import { debugMeteoFranceHdf5, debugMeteoFranceRadar, fetchMeteoFranceRadar, fetchRainViewerRadar } from "./sources/meteofrance.js";
import { fetchEcowittDiagnostics, fetchEcowittObservation } from "./sources/ecowitt.js";
import { DEFAULT_LOCATION, DEFAULT_SETTINGS, buildWeatherStatus, mergeSettings } from "./scoring.js";
import { buildGardenStatus, createDefaultGardenState, deleteGardenEntity, normalizeGardenState, upsertGardenEntity } from "./garden.js";
import { exportGardenStateToKml, importKml } from "./kml.js";
import { WEATHER_HISTORY_RECENT_KEY, buildWeatherHistoryDebugReport, persistWeatherHistorySample } from "./weatherHistory.js";

const KV_KEYS = {
  settings: "settings",
  latestStatus: "latest_status",
  lastRainAlert: "last_alert_rain",
  lastGardenAlert: "last_alert_garden",
  gardenState: "garden_state",
  weatherHistoryRecent: WEATHER_HISTORY_RECENT_KEY
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if ((url.pathname === "/api/status" || url.pathname === "/api/public-status") && request.method === "GET") {
        return json(sanitizePublicStatus(await getLatestStatus(env)));
      }

      if (url.pathname === "/api/refresh" && request.method === "GET") {
        const status = await computeAndStoreStatus(env);
        return json(sanitizePublicStatus(status));
      }

      if (url.pathname === "/api/debug/status" && request.method === "GET") {
        return json(await getDebugStatus(env));
      }

      if (url.pathname === "/api/debug/weather-history" && request.method === "GET") {
        return json(await buildWeatherHistoryDebugReport({
          kv: env.WEATHER_KV,
          key: KV_KEYS.weatherHistoryRecent
        }));
      }

      if (url.pathname === "/api/debug/sources" && request.method === "GET") {
        const status = await computeAndStoreStatus(env);
        return json({
          ok: true,
          updatedAt: status.updatedAt,
          sources: status.sources,
          errors: status.errors
        });
      }

      if (url.pathname === "/api/debug/meteofrance" && request.method === "GET") {
        return json(sanitizeDebugPayload(await debugMeteoFranceRadar({ env })));
      }

      if (url.pathname === "/api/debug/meteofrance/hdf5" && request.method === "GET") {
        return json(sanitizeDebugPayload(await debugMeteoFranceHdf5({ env })));
      }

      if (url.pathname === "/api/debug/ecowitt" && request.method === "GET") {
        return json(sanitizeDebugPayload(await fetchEcowittDiagnostics({ env })));
      }

      if (url.pathname === "/api/debug/rain" && request.method === "GET") {
        const status = await getLatestStatus(env);
        return json({
          ok: true,
          updatedAt: status.updatedAt,
          rain: status.rain,
          stationObservation: status.stationObservation,
          sources: status.sources
        });
      }

      if (url.pathname === "/api/settings" && request.method === "GET") {
        return json(await loadSettings(env));
      }

      if (url.pathname === "/api/settings" && request.method === "POST") {
        const body = await request.json();
        const settings = sanitizePublicSettings(body);
        await env.WEATHER_KV.put(KV_KEYS.settings, JSON.stringify(settings));
        ctx.waitUntil(computeAndStoreStatus(env));
        return json(settings);
      }

      if (url.pathname === "/api/garden" && request.method === "GET") {
        return json(await loadGardenState(env));
      }

      if (url.pathname === "/api/garden" && request.method === "POST") {
        const body = await readJsonBody(request);
        const gardenState = normalizeGardenState(body);
        await storeGardenState(env, gardenState);
        ctx.waitUntil(computeAndStoreStatus(env));
        return json(gardenState);
      }

      if (url.pathname === "/api/garden/import-kml" && request.method === "POST") {
        const payload = await readGardenKmlPayload(request);
        const imported = importKml(payload.kml, { fileName: payload.fileName });

        if (imported.report.errors.length) {
          return json({ ok: false, error: imported.report.errors[0], report: imported.report }, 400);
        }

        if (!imported.entities.length) {
          return json({ ok: false, error: "Aucune entité exploitable dans ce fichier KML.", report: imported.report }, 400);
        }

        const importedAt = new Date().toISOString();
        const gardenState = normalizeGardenState({
          entities: imported.entities,
          imports: [{
            id: `kml-${Date.now()}`,
            type: "kml",
            fileName: payload.fileName,
            importedAt,
            mode: "replace",
            entityCount: imported.entities.length,
            warnings: imported.report.warnings
          }],
          metadata: {
            kml: {
              documentName: imported.documentName,
              lastImport: {
                fileName: payload.fileName,
                importedAt
              }
            }
          },
          updatedAt: importedAt
        });

        await storeGardenState(env, gardenState);
        return json({ ok: true, garden: gardenState, report: imported.report });
      }

      if (url.pathname === "/api/garden/export-kml" && request.method === "GET") {
        const gardenState = await loadGardenState(env);
        const kml = exportGardenStateToKml(gardenState, {
          documentName: gardenState.metadata?.kml?.documentName || "Weather Garden"
        });

        return new Response(kml, {
          headers: {
            "content-type": "application/vnd.google-earth.kml+xml; charset=utf-8",
            "content-disposition": "attachment; filename=weather-garden.kml",
            "cache-control": "no-store"
          }
        });
      }

      if (url.pathname === "/api/garden/reset" && request.method === "POST") {
        const gardenState = createDefaultGardenState();
        await storeGardenState(env, gardenState);
        ctx.waitUntil(computeAndStoreStatus(env));
        return json(gardenState);
      }

      if (url.pathname === "/api/garden/entities" && request.method === "POST") {
        const body = await readJsonBody(request);
        const gardenState = upsertGardenEntity(await loadGardenState(env), body);
        await storeGardenState(env, gardenState);
        ctx.waitUntil(computeAndStoreStatus(env));
        return json(gardenState);
      }

      const deleteGardenEntityMatch = url.pathname.match(/^\/api\/garden\/entities\/([^/]+)$/);

      if (deleteGardenEntityMatch && request.method === "DELETE") {
        const gardenState = deleteGardenEntity(await loadGardenState(env), decodeURIComponent(deleteGardenEntityMatch[1]));
        await storeGardenState(env, gardenState);
        ctx.waitUntil(computeAndStoreStatus(env));
        return json(gardenState);
      }

      if (url.pathname === "/api/alerts/test" && request.method === "POST") {
        const settings = await loadSettings(env);
        await sendNtfy({
          env,
          settings,
          title: "Test meteo-jardin",
          message: "Notification ntfy OK pour Weather Garden."
        });
        return json({ ok: true });
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ ok: false, error: error.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    try {
      await runScheduledCheck(env);
    } catch (error) {
      console.error("Scheduled check failed:", error);
      throw error;
    }
  }
};

async function runScheduledCheck(env) {
  const status = await computeAndStoreStatus(env);
  await runOptionalScheduledStep("rain alert", () => maybeSendRainAlert(env, status));
  await runOptionalScheduledStep("garden alerts", () => maybeSendGardenAlerts(env, status));
}

async function runOptionalScheduledStep(label, fn) {
  try {
    await fn();
  } catch (error) {
    console.error(`Scheduled ${label} failed:`, error);
  }
}

async function getLatestStatus(env) {
  const cached = await env.WEATHER_KV.get(KV_KEYS.latestStatus, "json");

  if (cached && !isStale(cached.updatedAt, 10)) {
    return cached;
  }

  return computeAndStoreStatus(env);
}

async function getDebugStatus(env) {
  const status = await getLatestStatus(env);

  return sanitizeDebugPayload({
    ok: true,
    generatedAt: new Date().toISOString(),
    endpoints: [
      "/api/public-status",
      "/api/status",
      "/api/refresh",
      "/api/debug/status",
      "/api/debug/weather-history",
      "/api/debug/sources",
      "/api/debug/meteofrance",
      "/api/debug/meteofrance/hdf5",
      "/api/debug/ecowitt",
      "/api/debug/rain",
      "/api/garden",
      "/api/garden/import-kml",
      "/api/garden/export-kml",
      "/api/settings"
    ],
    status
  });
}

async function computeAndStoreStatus(env) {
  const settings = await loadSettings(env);
  const location = loadLocation(env);
  const gardenState = await loadGardenState(env);
  const errors = [];

  const [openMeteo, metNorway, meteoFranceRadar, rainViewer, ecowittObservation] = await Promise.all([
    settleSource("open-meteo-arome", () => fetchOpenMeteoArome(location), errors),
    settleSource("met-norway", () => fetchMetNorway({
      ...location,
      userAgent: env.METNO_USER_AGENT
    }), errors),
    settleSource("meteofrance-radar", () => fetchMeteoFranceRadar({ env }), errors),
    settleSource("rainviewer", () => fetchRainViewerRadar({
      ...location,
      enabled: settings.rainViewerEnabled
    }), errors),
    settleSource("ecowitt", () => fetchEcowittObservation({ env }), errors)
  ]);

  const status = buildWeatherStatus({
    location,
    settings,
    openMeteo,
    metNorway,
    meteoFranceRadar,
    rainViewer,
    ecowittObservation,
    garden: null,
    errors
  });

  status.garden = buildGardenStatus(gardenState, status, settings);

  await env.WEATHER_KV.put(KV_KEYS.latestStatus, JSON.stringify(status));
  await storeWeatherHistory(env, status);
  return status;
}

async function storeWeatherHistory(env, status) {
  try {
    const result = await persistWeatherHistorySample({
      kv: env.WEATHER_KV,
      status,
      key: KV_KEYS.weatherHistoryRecent,
      now: new Date(status.updatedAt)
    });

    if (!result.ok) {
      console.warn(`Weather history was not stored: ${result.reason}`);
    }
  } catch (error) {
    console.error("Weather history write failed:", error);
  }
}

async function settleSource(source, fn, errors) {
  try {
    return await fn();
  } catch (error) {
    errors.push({ source, message: error.message });
    return null;
  }
}

async function loadSettings(env) {
  const stored = await env.WEATHER_KV.get(KV_KEYS.settings, "json");
  const envDefaults = {
    ...DEFAULT_SETTINGS,
    ntfyTopic: "",
    ntfyServer: env.NTFY_SERVER || DEFAULT_SETTINGS.ntfyServer,
    enableNtfy: !!env.NTFY_TOPIC
  };

  return sanitizePublicSettings({
    ...envDefaults,
    ...(stored || {})
  });
}

async function loadGardenState(env) {
  const stored = await env.WEATHER_KV.get(KV_KEYS.gardenState);

  if (!stored) {
    return createDefaultGardenState();
  }

  try {
    return normalizeGardenState(JSON.parse(stored));
  } catch (error) {
    const fallback = createDefaultGardenState();
    return normalizeGardenState({
      ...fallback,
      metadata: {
        ...fallback.metadata,
        recovery: {
          key: KV_KEYS.gardenState,
          reason: "corrupt_json",
          message: "GardenState KV illisible. État par défaut retourné sans écraser la valeur stockée."
        }
      }
    });
  }
}

async function storeGardenState(env, gardenState) {
  const normalized = normalizeGardenState(gardenState);
  await env.WEATHER_KV.put(KV_KEYS.gardenState, JSON.stringify(normalized));
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (error) {
    throw new Error("JSON invalide.");
  }
}

async function readGardenKmlPayload(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await readJsonBody(request);
    const kml = typeof body.kml === "string" ? body.kml : "";
    if (!kml.trim()) {
      throw new Error("Fichier KML vide.");
    }
    return {
      kml,
      fileName: sanitizeFileName(body.fileName) || "jardin.kml"
    };
  }

  const kml = await request.text();
  if (!kml.trim()) {
    throw new Error("Fichier KML vide.");
  }

  return {
    kml,
    fileName: sanitizeFileName(request.headers.get("x-garden-kml-filename")) || "jardin.kml"
  };
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[\\/\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 120);
}

function sanitizePublicSettings(settings = {}) {
	const safeSettings = mergeSettings(settings);
	delete safeSettings.ntfyTopic;

	return safeSettings;
}

function loadLocation(env) {
  return {
    name: env.APP_LOCATION_NAME || DEFAULT_LOCATION.name,
    latitude: Number(env.APP_LATITUDE || DEFAULT_LOCATION.latitude),
    longitude: Number(env.APP_LONGITUDE || DEFAULT_LOCATION.longitude),
    timezone: env.APP_TIMEZONE || DEFAULT_LOCATION.timezone
  };
}

async function maybeSendRainAlert(env, status) {
  if (!status.rain.shouldAlert || !status.settings.enableNtfy) {
    return;
  }

  const horizon = status.rain.horizons.find((item) => item.minutes === status.settings.rainAlertMinutes) || status.rain.horizons[0];
  const lastAlert = await env.WEATHER_KV.get(KV_KEYS.lastRainAlert, "json");

  if (lastAlert && !isStale(lastAlert.sentAt, status.settings.quietMinutes)) {
    return;
  }

  const message = [
    `${status.rain.headline} à ${status.location.name}.`,
    status.rain.detail,
    status.rain.garden?.headline ? `Jardin : ${status.rain.garden.headline}.` : null,
    `Horizon ${horizon.minutes} min : ${Math.round(horizon.score * 100)} %, ${horizon.precipitationMm ?? "?"} mm.`
  ].filter(Boolean).join("\n");

  await sendNtfy({
    env,
    settings: status.settings,
    title: status.rain.activeNow ? status.rain.intensityLabel : "Alerte pluie",
    message
  });

  await env.WEATHER_KV.put(KV_KEYS.lastRainAlert, JSON.stringify({
    sentAt: new Date().toISOString(),
    horizon
  }));
}

async function maybeSendGardenAlerts(env, status) {
  if (!status.settings.enableGardenAlerts || !status.settings.enableNtfy) {
    return;
  }

  const activeAlerts = status.garden?.alerts?.active || [];
  const notifyAlerts = activeAlerts.filter((alert) => ["urgent", "risk", "watch"].includes(alert.level));

  if (!notifyAlerts.length) {
    return;
  }

  const lastAlert = await env.WEATHER_KV.get(KV_KEYS.lastGardenAlert, "json");
  const currentSignature = notifyAlerts.map((alert) => alert.id).sort().join("|");

  if (lastAlert?.signature === currentSignature && !isStale(lastAlert.sentAt, status.settings.quietMinutes)) {
    return;
  }

  const topAlerts = notifyAlerts.slice(0, 5);
  const message = topAlerts.map((alert) => {
    const entity = status.garden.entities.find((item) => item.id === alert.entityId);
    return `${entity?.name || alert.entityId || "Jardin"} · ${alert.headline}`;
  }).join("\n");

  await sendNtfy({
    env,
    settings: status.settings,
    title: "Alertes jardin",
    message
  });

  await env.WEATHER_KV.put(KV_KEYS.lastGardenAlert, JSON.stringify({
    sentAt: new Date().toISOString(),
    signature: currentSignature
  }));
}

async function sendNtfy({ env, settings, title, message }) {
  const topic = settings.ntfyTopic || env.NTFY_TOPIC;

  if (!topic) {
    throw new Error("NTFY_TOPIC is not configured.");
  }

  const server = (settings.ntfyServer || env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
  const headers = {
    "title": sanitizeHeaderValue(title) || "Weather Garden",
    "priority": "default"
  };

  if (env.NTFY_TOKEN) {
    headers.authorization = `Bearer ${env.NTFY_TOKEN}`;
  }

  const response = await fetch(`${server}/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers,
    body: message
  });

  if (!response.ok) {
    throw new Error(`ntfy HTTP ${response.status}`);
  }
}

function sanitizePublicStatus(status) {
  return sanitizeDebugPayload(status);
}

function sanitizeDebugPayload(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeDebugPayload);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["raw", "url"].includes(key))
    .map(([key, child]) => [key, sanitizeDebugPayload(child)]));
}

function sanitizeHeaderValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function isStale(isoDate, minutes) {
  if (!isoDate) {
    return true;
  }

  return Date.now() - Date.parse(isoDate) > minutes * 60_000;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
